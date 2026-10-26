/** HTML de restablecimiento de contraseña TC ERP (sin marca del proveedor Auth). */

export function buildRecoveryEmailHtml(params: {
  actionLink: string;
  siteUrl: string;
}): string {
  const logoTc = `${params.siteUrl.replace(/\/$/, '')}/brand/tc-mark.svg`;

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr>
            <td style="background:#2e3165;padding:20px 24px;">
              <img src="${logoTc}" alt="TC ERP" height="40" style="display:block;height:40px;width:auto;" />
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px 8px;">
              <h1 style="margin:0 0 8px;font-size:22px;color:#0f172a;">Restablecer contraseña</h1>
              <p style="margin:0;font-size:14px;line-height:1.55;color:#475569;">
                Recibimos una solicitud para restablecer tu acceso a TC ERP.
                Pulsa el botón para elegir una contraseña nueva.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px 8px;" align="center">
              <a href="${escapeHtml(params.actionLink)}"
                 style="display:inline-block;background:#2e3165;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:12px;">
                Definir nueva contraseña
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 28px;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8;word-break:break-all;">
                Si el botón no funciona, copia este enlace:<br/>
                <a style="color:#2e3165;" href="${escapeHtml(params.actionLink)}">${escapeHtml(params.actionLink)}</a>
              </p>
              <p style="margin:12px 0 0;font-size:12px;color:#94a3b8;">
                Si no solicitaste este cambio, ignora este mensaje.
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:11px;color:#94a3b8;">TC ERP · Tech Corps</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
