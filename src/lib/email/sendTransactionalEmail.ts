/**
 * Envío transaccional sin depender del correo built-in de Auth.
 * Prioridad: Resend API → no configurado (el caller usa “copiar enlace”).
 */

export type SendEmailResult =
  | { sent: true; provider: 'resend'; id?: string }
  | { sent: false; provider: 'none'; reason: string };

export function isCustomEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export async function sendTransactionalEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.EMAIL_FROM?.trim() ||
    process.env.RESEND_FROM?.trim() ||
    'TC ERP <onboarding@resend.dev>';

  if (!apiKey) {
    return {
      sent: false,
      provider: 'none',
      reason: 'RESEND_API_KEY no configurada',
    };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
    error?: { message?: string };
  };

  if (!res.ok) {
    return {
      sent: false,
      provider: 'none',
      reason: body.error?.message || body.message || `Resend HTTP ${res.status}`,
    };
  }

  return { sent: true, provider: 'resend', id: body.id };
}
