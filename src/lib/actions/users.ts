"use server";

import {
  requireServerSeguridadEdit,
  getServiceRoleAdminClient,
} from '@/shared/authz/requireServerAdmin';
import { resolveAuthEmailRedirect } from '@/lib/auth/resolveAuthEmailRedirect';
import { isValidAuthEmail } from '@/lib/auth/isValidAuthEmail';
import { recordUserInvitation } from '@/lib/actions/userInvitations';
import { buildInviteEmailHtml } from '@/lib/email/inviteEmailHtml';
import { buildRecoveryEmailHtml } from '@/lib/email/recoveryEmailHtml';
import { sendTransactionalEmail } from '@/lib/email/sendTransactionalEmail';

function scrubAuthProviderBrand(message: string): string {
  return message
    .replace(/\bsupabase\b/gi, 'el servicio de autenticación')
    .replace(/\bgotrue\b/gi, 'autenticación');
}

/**
 * Enlace usable en WhatsApp/móvil: /auth/confirm con token_hash (SSR cookies),
 * no el action_link de *.supabase.co que deja #access_token en el hash.
 */
function buildFirstPartyConfirmLink(
  baseUrl: string,
  properties:
    | { hashed_token?: string; verification_type?: string; action_link?: string }
    | null
    | undefined,
  fallbackType: 'invite' | 'recovery'
): string | null {
  const cleanBase = baseUrl.replace(/\/$/, '');
  if (properties?.hashed_token) {
    const type = properties.verification_type || fallbackType;
    return `${cleanBase}/auth/confirm?token_hash=${encodeURIComponent(properties.hashed_token)}&type=${encodeURIComponent(type)}&next=/auth/actualizar-password`;
  }
  return properties?.action_link ?? null;
}

type AdminClient = ReturnType<typeof getServiceRoleAdminClient>;

/**
 * Resetea o cambia forzosamente la contraseña de un usuario
 */
export async function adminUpdateUserPassword(userId: string, newPassword: string) {
  const gate = await requireServerSeguridadEdit();
  if (!gate.ok) return { error: gate.error };

  try {
    const supabaseAdmin = getServiceRoleAdminClient();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });
    if (error) throw error;
    return { success: true, message: "Contraseña actualizada exitosamente" };
  } catch (error: unknown) {
    console.error("Error in adminUpdateUserPassword:", error);
    return { error: error instanceof Error ? error.message : "Error desconocido al actualizar contraseña" };
  }
}

/**
 * Suspende o reactiva el acceso de un usuario
 */
export async function adminToggleUserStatus(userId: string, isActive: boolean) {
  const gate = await requireServerSeguridadEdit();
  if (!gate.ok) return { error: gate.error };

  try {
    const supabaseAdmin = getServiceRoleAdminClient();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      ban_duration: isActive ? 'none' : '876000h',
    });
    if (error) throw error;

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ is_active: isActive })
      .eq('id', userId);

    if (profileError) {
      console.error("Warning: Could not update profile is_active status", profileError);
    }

    return { success: true, message: `Usuario ${isActive ? 'habilitado' : 'inhabilitado'} correctamente` };
  } catch (error: unknown) {
    console.error("Error in adminToggleUserStatus:", error);
    return { error: error instanceof Error ? error.message : "Error al cambiar el estatus del usuario" };
  }
}

/**
 * Elimina la cuenta Auth y el perfil (cascade). No borra el empleado RRHH.
 */
export async function adminDeleteUser(userId: string) {
  const gate = await requireServerSeguridadEdit();
  if (!gate.ok) return { error: gate.error };

  const targetId = userId?.trim();
  if (!targetId) {
    return { error: 'Usuario no válido.' };
  }
  if (gate.userId === targetId) {
    return { error: 'No puedes eliminar tu propia cuenta.' };
  }

  try {
    const supabaseAdmin = getServiceRoleAdminClient();

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name')
      .eq('id', targetId)
      .maybeSingle();

    // Limpiar vínculos que no siempre hacen cascade limpio.
    await supabaseAdmin.from('user_roles').delete().eq('user_id', targetId);
    await supabaseAdmin.from('user_invitations').delete().eq('auth_user_id', targetId);
    const email = profile?.email?.trim().toLowerCase();
    if (email) {
      await supabaseAdmin.from('user_invitations').delete().eq('email', email);
    }
    await supabaseAdmin
      .from('profiles')
      .update({ employee_id: null })
      .eq('id', targetId);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(targetId);
    if (error) {
      const msg = scrubAuthProviderBrand(error.message);
      if (/foreign key|violates|restrict/i.test(error.message)) {
        return {
          error:
            'No se pudo eliminar porque hay registros vinculados. Desactiva la cuenta o libera esos vínculos primero.',
        };
      }
      return { error: msg };
    }

    return {
      success: true as const,
      message: `Usuario eliminado${profile?.full_name ? `: ${profile.full_name}` : ''}.`,
    };
  } catch (error: unknown) {
    console.error('Error in adminDeleteUser:', error);
    return {
      error: scrubAuthProviderBrand(
        error instanceof Error ? error.message : 'Error al eliminar usuario'
      ),
    };
  }
}

/**
 * Busca un usuario Auth ya registrado por correo (profiles → Auth admin).
 */
async function findUserIdByEmail(
  supabaseAdmin: AdminClient,
  email: string
): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .ilike('email', normalized)
    .maybeSingle();
  if (profile?.id) return String(profile.id);

  for (let page = 1; page <= 25; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error || !data?.users?.length) break;
    const hit = data.users.find((u) => (u.email || '').toLowerCase() === normalized);
    if (hit?.id) return hit.id;
    if (data.users.length < 200) break;
  }
  return null;
}

function isEmailAlreadyRegisteredError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('already been registered') ||
    m.includes('already registered') ||
    m.includes('user already exists') ||
    m.includes('email_exists')
  );
}

/**
 * El directorio lee roles desde `user_roles`, no desde `profiles.role_id`.
 */
async function assignRoleToUser(
  supabaseAdmin: AdminClient,
  userId: string,
  roleId: string
): Promise<void> {
  const { data: pos, error: posError } = await supabaseAdmin
    .from('hr_positions')
    .select('id, name')
    .eq('id', roleId)
    .maybeSingle();

  if (posError) throw posError;
  if (!pos?.name) throw new Error('Rol no encontrado en catálogo de puestos');

  await supabaseAdmin.rpc('add_app_role_value', { new_role: pos.name });

  // Preferir fila de puesto RRHH; no actualizar todas las filas del user_id
  // (enums operacionales colisionan en unique(user_id, role)).
  const { data: positionRow } = await supabaseAdmin
    .from('user_roles')
    .select('id')
    .eq('user_id', userId)
    .not('role_id', 'is', null)
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  let targetId = positionRow?.id as string | undefined;
  if (!targetId) {
    const { data: anyRow } = await supabaseAdmin
      .from('user_roles')
      .select('id')
      .eq('user_id', userId)
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();
    targetId = anyRow?.id;
  }

  if (targetId) {
    const { error } = await supabaseAdmin
      .from('user_roles')
      .update({ role_id: roleId, role: pos.name })
      .eq('id', targetId);
    if (error) throw error;

    const { error: delErr } = await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('user_id', userId)
      .neq('id', targetId);
    if (delErr) throw delErr;
  } else {
    const { error } = await supabaseAdmin.from('user_roles').insert({
      user_id: userId,
      role_id: roleId,
      role: pos.name,
    });
    if (error) throw error;
  }

  // Asegura enum operacional (tecnico, qc, …) además del nombre de puesto RRHH.
  await supabaseAdmin.rpc('app_sync_operational_role_from_position', {
    p_user_id: userId,
  });
  await supabaseAdmin.rpc('app_sync_operational_role_from_erp_modules', {
    p_user_id: userId,
  });
}

/**
 * Crea/actualiza el perfil visible en Directorio de Cuentas.
 * Importante: NO escribir role_id en profiles (esa columna no existe; el rol va a user_roles).
 */
async function upsertProfileForAccess(params: {
  supabaseAdmin: AdminClient;
  userId: string;
  email: string;
  fullName: string;
  employeeId?: string;
  roleId?: string;
}): Promise<void> {
  const { supabaseAdmin, userId, email, fullName, employeeId, roleId } = params;

  if (employeeId) {
    await supabaseAdmin
      .from('profiles')
      .update({ employee_id: null })
      .eq('employee_id', employeeId)
      .neq('id', userId);
  }

  const upsertData: Record<string, unknown> = {
    id: userId,
    email: email.trim().toLowerCase(),
    full_name: fullName,
    is_active: true,
  };
  if (employeeId) upsertData.employee_id = employeeId;

  const { error: profileError } = await supabaseAdmin.from('profiles').upsert(upsertData);
  if (profileError) {
    throw new Error(`No se pudo guardar el perfil en el directorio: ${profileError.message}`);
  }

  if (roleId) {
    await assignRoleToUser(supabaseAdmin, userId, roleId);
  }

  if (employeeId && email) {
    const { error: empEmailError } = await supabaseAdmin
      .from('employees')
      .update({ email: email.trim().toLowerCase() })
      .eq('id', employeeId);
    if (empEmailError) {
      console.error('Employee email sync warning:', empEmailError);
    }
  }
}

/**
 * Enlaza un usuario Auth existente: clave + perfil + empleado RRHH (sin recrear cuenta).
 */
async function linkExistingAuthUser(params: {
  supabaseAdmin: AdminClient;
  userId: string;
  email: string;
  password: string;
  fullName: string;
  roleId?: string;
  employeeId?: string;
}) {
  const { supabaseAdmin, userId, email, password, fullName, roleId, employeeId } = params;

  if (password && password.length >= 6) {
    const { error: pwdError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (pwdError) throw pwdError;
  }

  await upsertProfileForAccess({
    supabaseAdmin,
    userId,
    email,
    fullName,
    employeeId,
    roleId,
  });

  return {
    success: true as const,
    linked: true as const,
    user: { id: userId, email },
    message:
      'Usuario existente enlazado: se actualizó la contraseña y el vínculo con el empleado RRHH.',
  };
}

/**
 * Crea un nuevo usuario desde Seguridad.
 * Si el correo ya existe en Auth, enlaza esa cuenta (clave + rol + empleado) en lugar de fallar.
 */
export async function adminCreateUser(
  email: string,
  password: string,
  fullName: string,
  roleId?: string,
  employeeId?: string
) {
  const gate = await requireServerSeguridadEdit();
  if (!gate.ok) return { error: gate.error };

  try {
    const supabaseAdmin = getServiceRoleAdminClient();
    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidAuthEmail(normalizedEmail)) {
      return {
        error:
          'El correo debe incluir dominio completo (ej. nombre@gmail.com). No uses solo el usuario sin @.',
      };
    }

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (error) {
      if (!isEmailAlreadyRegisteredError(error.message)) throw error;

      const existingId = await findUserIdByEmail(supabaseAdmin, normalizedEmail);
      if (!existingId) {
        return {
          error:
            'El correo ya está registrado en Auth, pero no se pudo localizar el usuario para enlazarlo. Edítalo desde la lista de usuarios.',
        };
      }

      return await linkExistingAuthUser({
        supabaseAdmin,
        userId: existingId,
        email: normalizedEmail,
        password,
        fullName,
        roleId,
        employeeId,
      });
    }

    if (!data.user) throw new Error('No se pudo crear el usuario');

    // Pequeña espera por si hay trigger async sobre auth.users.
    await new Promise((r) => setTimeout(r, 300));

    await upsertProfileForAccess({
      supabaseAdmin,
      userId: data.user.id,
      email: normalizedEmail,
      fullName,
      employeeId,
      roleId,
    });

    return { success: true, linked: false, user: data.user, message: 'Usuario creado exitosamente' };
  } catch (error: unknown) {
    console.error('Error in adminCreateUser:', error);
    return { error: error instanceof Error ? error.message : 'Error al crear usuario' };
  }
}

/**
 * Invita sin usar el correo built-in de Auth (evita cuota / marca del proveedor).
 * 1) generateLink (invite | recovery) → enlace
 * 2) Envío opcional vía Resend (RESEND_API_KEY)
 * 3) Siempre registra en user_invitations con action_link para “Copiar enlace”
 */
export async function adminInviteUser(
  email: string,
  fullName: string,
  roleId?: string,
  employeeId?: string,
  redirectOrigin?: string
) {
  const gate = await requireServerSeguridadEdit();
  if (!gate.ok) return { error: gate.error };

  try {
    const supabaseAdmin = getServiceRoleAdminClient();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      return { error: 'El correo es obligatorio.' };
    }
    if (!isValidAuthEmail(normalizedEmail)) {
      return {
        error:
          'El correo debe incluir dominio completo (ej. gurbano24@gmail.com). No uses solo el usuario sin @.',
      };
    }

    const { redirectTo, isLocalhost, baseUrl } = resolveAuthEmailRedirect(redirectOrigin);
    if (isLocalhost) {
      return {
        error:
          'La invitación no se puede usar desde un móvil si el enlace apunta a localhost. ' +
          'Define NEXT_PUBLIC_SITE_URL (o NEXT_PUBLIC_APP_URL) con la URL pública de TC-ERP ' +
          `(p. ej. https://tu-dominio) y configúrala como Site URL / Redirect URLs en Autenticación. ` +
          `Actual: ${baseUrl}`,
      };
    }

    let roleName: string | null = null;
    if (roleId) {
      const { data: pos } = await supabaseAdmin
        .from('hr_positions')
        .select('name')
        .eq('id', roleId)
        .maybeSingle();
      roleName = pos?.name ? String(pos.name) : null;
    }

    let existingId = await findUserIdByEmail(supabaseAdmin, normalizedEmail);
    let linked = Boolean(existingId);
    let mode: 'invite' | 'invite_existing_reset' = linked
      ? 'invite_existing_reset'
      : 'invite';
    let actionLink: string | null = null;
    let userId: string | null = existingId;

    if (existingId) {
      const { error: unbanError } = await supabaseAdmin.auth.admin.updateUserById(
        existingId,
        {
          ban_duration: 'none',
          user_metadata: { full_name: fullName },
        }
      );
      if (unbanError) throw unbanError;

      const { data: linkData, error: linkError } =
        await supabaseAdmin.auth.admin.generateLink({
          type: 'recovery',
          email: normalizedEmail,
          options: { redirectTo },
        });
      if (linkError) {
        await recordUserInvitation({
          email: normalizedEmail,
          fullName,
          roleId,
          roleName,
          employeeId,
          authUserId: existingId,
          status: 'failed',
          redirectBase: baseUrl,
          lastError: linkError.message,
          params: { mode, redirectTo, email_sent: false, delivery: 'none' },
        });
        return {
          error: scrubAuthProviderBrand(linkError.message),
          linked: true as const,
          user: { id: existingId, email: normalizedEmail },
        };
      }
      actionLink = buildFirstPartyConfirmLink(baseUrl, linkData?.properties, 'recovery');
      userId = linkData?.user?.id ?? existingId;
    } else {
      const { data: linkData, error: linkError } =
        await supabaseAdmin.auth.admin.generateLink({
          type: 'invite',
          email: normalizedEmail,
          options: {
            data: { full_name: fullName },
            redirectTo,
          },
        });

      if (linkError) {
        if (isEmailAlreadyRegisteredError(linkError.message)) {
          existingId = await findUserIdByEmail(supabaseAdmin, normalizedEmail);
          if (!existingId) {
            return {
              error:
                'El correo ya está registrado, pero no se pudo localizar el usuario para enlazarlo.',
            };
          }
          linked = true;
          mode = 'invite_existing_reset';
          userId = existingId;

          const { error: unbanError } = await supabaseAdmin.auth.admin.updateUserById(
            existingId,
            {
              ban_duration: 'none',
              user_metadata: { full_name: fullName },
            }
          );
          if (unbanError) throw unbanError;

          const { data: recoveryData, error: recoveryError } =
            await supabaseAdmin.auth.admin.generateLink({
              type: 'recovery',
              email: normalizedEmail,
              options: { redirectTo },
            });
          if (recoveryError) {
            await recordUserInvitation({
              email: normalizedEmail,
              fullName,
              roleId,
              roleName,
              employeeId,
              authUserId: existingId,
              status: 'failed',
              redirectBase: baseUrl,
              lastError: recoveryError.message,
              params: { mode, redirectTo, email_sent: false, delivery: 'none' },
            });
            return {
              error: scrubAuthProviderBrand(recoveryError.message),
              linked: true as const,
              user: { id: existingId, email: normalizedEmail },
            };
          }
          actionLink = buildFirstPartyConfirmLink(
            baseUrl,
            recoveryData?.properties,
            'recovery'
          );
        } else {
          await recordUserInvitation({
            email: normalizedEmail,
            fullName,
            roleId,
            roleName,
            employeeId,
            status: 'failed',
            redirectBase: baseUrl,
            lastError: linkError.message,
            params: { mode, redirectTo, email_sent: false, delivery: 'none' },
          });
          return { error: scrubAuthProviderBrand(linkError.message) };
        }
      } else {
        actionLink = buildFirstPartyConfirmLink(baseUrl, linkData?.properties, 'invite');
        userId = linkData?.user?.id ?? (await findUserIdByEmail(supabaseAdmin, normalizedEmail));
      }
    }

    if (!actionLink) {
      return { error: 'No se pudo generar el enlace de invitación.' };
    }
    if (!userId) {
      return {
        error:
          'Se generó el enlace pero no se localizó el usuario Auth. Revisa el directorio.',
      };
    }

    await upsertProfileForAccess({
      supabaseAdmin,
      userId,
      email: normalizedEmail,
      fullName,
      employeeId,
      roleId,
    });

    const sendResult = await sendTransactionalEmail({
      to: normalizedEmail,
      subject: 'Invitación a TC ERP',
      html: buildInviteEmailHtml({
        fullName,
        actionLink,
        siteUrl: baseUrl,
      }),
    });

    const emailSent = sendResult.sent;
    await recordUserInvitation({
      email: normalizedEmail,
      fullName,
      roleId,
      roleName,
      employeeId,
      authUserId: userId,
      status: linked ? 'linked_existing' : 'pending',
      redirectBase: baseUrl,
      lastError: emailSent ? null : sendResult.reason,
      params: {
        mode,
        redirectTo,
        email_sent: emailSent,
        email_provider: sendResult.provider,
        delivery: emailSent ? 'resend' : 'copy_link',
        action_link: actionLink,
      },
    });

    const message = emailSent
      ? linked
        ? 'El usuario ya existía: se actualizaron permisos y se envió el correo (TC ERP) para configurar la contraseña.'
        : 'Invitación enviada por correo (TC ERP).'
      : linked
        ? 'El usuario ya existía y el enlace está listo. Cópialo en Invitaciones (o configura RESEND_API_KEY para envío automático).'
        : 'Enlace de invitación generado. Cópialo en Invitaciones y envíalo por WhatsApp/correo, o configura RESEND_API_KEY.';

    return {
      success: true as const,
      linked: linked as boolean,
      emailSent,
      actionLink,
      user: { id: userId, email: normalizedEmail },
      message,
    };
  } catch (error: unknown) {
    console.error('Error in adminInviteUser:', error);
    return {
      error: scrubAuthProviderBrand(
        error instanceof Error ? error.message : 'Error al invitar usuario'
      ),
    };
  }
}

/**
 * Restablecimiento admin: generateLink + Resend (sin correo built-in de Auth).
 */
export async function adminSendPasswordResetEmail(
  email: string,
  redirectOrigin?: string
) {
  const gate = await requireServerSeguridadEdit();
  if (!gate.ok) return { error: gate.error };

  try {
    const supabaseAdmin = getServiceRoleAdminClient();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      return { error: 'El correo es obligatorio.' };
    }

    const { redirectTo, isLocalhost, baseUrl } = resolveAuthEmailRedirect(redirectOrigin);
    if (isLocalhost) {
      return {
        error:
          'No se puede enviar un enlace usable con localhost. Define NEXT_PUBLIC_SITE_URL ' +
          `con la URL pública de TC-ERP. Actual: ${baseUrl}`,
      };
    }

    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: normalizedEmail,
        options: { redirectTo },
      });
    if (linkError) throw linkError;

    const actionLink = buildFirstPartyConfirmLink(
      baseUrl,
      linkData?.properties,
      'recovery'
    );
    if (!actionLink) {
      return { error: 'No se pudo generar el enlace de restablecimiento.' };
    }

    const sendResult = await sendTransactionalEmail({
      to: normalizedEmail,
      subject: 'Restablecer contraseña — TC ERP',
      html: buildRecoveryEmailHtml({ actionLink, siteUrl: baseUrl }),
    });

    if (sendResult.sent) {
      return {
        success: true as const,
        emailSent: true as const,
        message: 'Correo de restablecimiento enviado (TC ERP).',
      };
    }

    return {
      success: true as const,
      emailSent: false as const,
      actionLink,
      message:
        'Enlace generado. Cópialo y envíalo al usuario, o configura RESEND_API_KEY para envío automático.',
    };
  } catch (error: unknown) {
    console.error('Error in adminSendPasswordResetEmail:', error);
    return {
      error: scrubAuthProviderBrand(
        error instanceof Error
          ? error.message
          : 'Error al enviar correo de restablecimiento'
      ),
    };
  }
}

/**
 * Olvidé mi contraseña (login público). No revela si el correo existe.
 * Usa generateLink + Resend; sin RESEND_API_KEY no envía (respuesta genérica igual).
 */
export async function requestPasswordResetEmail(
  email: string,
  redirectOrigin?: string
): Promise<{ ok: true }> {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.includes('@')) return { ok: true };

    const { redirectTo, isLocalhost, baseUrl } = resolveAuthEmailRedirect(redirectOrigin);
    if (isLocalhost) return { ok: true };

    const supabaseAdmin = getServiceRoleAdminClient();
    const userId = await findUserIdByEmail(supabaseAdmin, normalizedEmail);
    if (!userId) return { ok: true };

    const { data: linkData, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: normalizedEmail,
      options: { redirectTo },
    });
    const actionLink = buildFirstPartyConfirmLink(
      baseUrl,
      linkData?.properties,
      'recovery'
    );
    if (error || !actionLink) return { ok: true };

    await sendTransactionalEmail({
      to: normalizedEmail,
      subject: 'Restablecer contraseña — TC ERP',
      html: buildRecoveryEmailHtml({
        actionLink,
        siteUrl: baseUrl,
      }),
    });
  } catch (err) {
    console.error('requestPasswordResetEmail:', err);
  }
  return { ok: true };
}
