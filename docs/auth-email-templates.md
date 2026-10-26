# Correo de invitación / recuperación — TC ERP + Tigo

## Camino principal (recomendado): sin correo built-in de Auth

TC-ERP **ya no envía** invitaciones ni resets con `inviteUserByEmail` /
`resetPasswordForEmail` (cuota free-tier + marca “Supabase Auth”).

Flujo actual:

1. **Auth Admin `generateLink`** → crea/valida el usuario y obtiene `action_link`
2. **Resend** (`RESEND_API_KEY` + `EMAIL_FROM`) → HTML con marca TC ERP / Tigo
3. Si Resend no está configurado → la invitación queda en **Seguridad → Invitaciones**
   con **Copiar enlace** (WhatsApp, Teams, etc.)

Variables en `web/.env.local` / Vercel:

```env
RESEND_API_KEY=re_xxxxxxxx
EMAIL_FROM=TC ERP <noreply@tu-dominio.com>
NEXT_PUBLIC_SITE_URL=https://TU-DOMINIO-PUBLICO
```

Dominio del remitente: verifícalo en [resend.com/domains](https://resend.com/domains).
En desarrollo Resend permite `onboarding@resend.dev` solo hacia tu propio correo.

Código: `web/src/lib/email/sendTransactionalEmail.ts`,
`inviteEmailHtml.ts`, `recoveryEmailHtml.ts` + `adminInviteUser` /
`requestPasswordResetEmail`.

---

## 0. (Opcional) SMTP en el Dashboard de Auth

Solo necesario si algún flujo legacy aún dispara plantillas del Dashboard.
Para invitaciones/reset de TC-ERP **no hace falta**.

---

## 1. URL pública (obligatorio para móvil / clientes)

En `web/.env.local` (y en Vercel):

```env
NEXT_PUBLIC_SITE_URL=https://TU-DOMINIO-PUBLICO
# alternativa:
# NEXT_PUBLIC_APP_URL=https://TU-DOMINIO-PUBLICO
```

En **Supabase → Authentication → URL Configuration**:

| Campo | Valor |
|--------|--------|
| **Site URL** | `https://TU-DOMINIO-PUBLICO` (nunca `localhost` en pruebas con teléfono) |
| **Redirect URLs** | `https://TU-DOMINIO-PUBLICO/**` y `https://TU-DOMINIO-PUBLICO/auth/confirm` y `https://TU-DOMINIO-PUBLICO/auth/actualizar-password` |

Control operativo en la app: **Seguridad → Invitaciones** (tabla `user_invitations`:
correo, rol, estado, base URL, reenvío / revocación).

La app construye el `redirectTo` así:

`{SITE_URL}/auth/confirm?next=/auth/actualizar-password`

`adminInviteUser` **rechaza** envíos si la base resuelta es `localhost` (el enlace no sirve fuera de tu PC).

---

## 2. Logos

| Archivo | Uso |
|---------|-----|
| `web/public/brand/tc-mark.svg` | Marca TC ERP (incluido en el repo) |
| `web/public/brand/tigo-logo.png` | Logo Tigo — **colócalo tú** (PNG oficial, fondo transparente) |

En el correo se referencian como:

- `{{ .SiteURL }}/brand/tc-mark.svg`
- `{{ .SiteURL }}/brand/tigo-logo.png`

Si el logo Tigo aún no está subido, el `<img>` de Tigo puede fallar; el de TC seguirá visible.

---

## 3. Invite user (copiar en Dashboard)

**Subject:** Invitación a TC ERP

```html
<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr>
            <td style="background:#2e3165;padding:20px 24px;">
              <table role="presentation" width="100%">
                <tr>
                  <td align="left" style="vertical-align:middle;">
                    <img src="{{ .SiteURL }}/brand/tc-mark.svg" alt="TC ERP" height="40" style="display:block;height:40px;width:auto;" />
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <img src="{{ .SiteURL }}/brand/tigo-logo.png" alt="Tigo" height="36" style="display:block;height:36px;width:auto;max-width:120px;" />
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px 8px;">
              <h1 style="margin:0 0 8px;font-size:22px;line-height:1.3;color:#0f172a;">Invitación a TC ERP</h1>
              <p style="margin:0;font-size:14px;line-height:1.55;color:#475569;">
                Has sido invitado a crear tu acceso en el ERP de Tech Corps.
                Pulsa el botón para definir tu contraseña de forma segura.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px 8px;" align="center">
              <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/auth/actualizar-password"
                 style="display:inline-block;background:#2e3165;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:12px;">
                Crear mi contraseña
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 28px;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8;">
                Si el botón no funciona, copia y pega este enlace en el navegador:<br/>
                <a style="color:#2e3165;word-break:break-all;"
                   href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/auth/actualizar-password">
                  {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/auth/actualizar-password
                </a>
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:11px;color:#94a3b8;">TC ERP · Tech Corps</p>
      </td>
    </tr>
  </table>
</body>
</html>
```

---

## 4. Reset Password (copiar en Dashboard)

**Subject:** Restablecer contraseña — TC ERP

```html
<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr>
            <td style="background:#2e3165;padding:20px 24px;">
              <table role="presentation" width="100%">
                <tr>
                  <td align="left"><img src="{{ .SiteURL }}/brand/tc-mark.svg" alt="TC ERP" height="40" style="display:block;height:40px;" /></td>
                  <td align="right"><img src="{{ .SiteURL }}/brand/tigo-logo.png" alt="Tigo" height="36" style="display:block;height:36px;max-width:120px;" /></td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px 8px;">
              <h1 style="margin:0 0 8px;font-size:22px;color:#0f172a;">Restablecer contraseña</h1>
              <p style="margin:0;font-size:14px;line-height:1.55;color:#475569;">
                Recibimos una solicitud para restablecer tu contraseña de TC ERP.
                Si fuiste tú, continúa con el botón.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px 8px;" align="center">
              <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/actualizar-password"
                 style="display:inline-block;background:#2e3165;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:12px;">
                Definir nueva contraseña
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 28px;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">Si no solicitaste este cambio, ignora este correo.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

---

## 5. Checklist rápido

1. `NEXT_PUBLIC_SITE_URL` = dominio público desplegado (Vercel / staging).
2. Supabase Site URL + Redirect URLs = mismo dominio.
3. Pegar plantillas Invite + Reset del §3–4.
4. Colocar `public/brand/tigo-logo.png`.
5. Reenviar invitación desde Seguridad (empleado RRHH es **opcional** si ya hay nombre + correo).
6. Abrir el enlace en el teléfono: debe ir a `/auth/confirm` → `/auth/actualizar-password` (no a `localhost`).
