import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type WebVitalPayload = {
  name?: string;
  value?: number;
  rating?: 'good' | 'needs-improvement' | 'poor';
  id?: string;
  navigationType?: string;
  path?: string;
};

/**
 * Ingesta de Web Vitals de campo (LCP/INP/CLS/FCP/TTFB).
 *
 * El reporter del cliente envía cada métrica vía `navigator.sendBeacon`. Aquí se
 * registra de forma estructurada para que sea consultable en los logs de la
 * plataforma (mismo canal que x-correlation-id / x-response-time-ms). No persiste
 * en DB para no añadir egress; si más adelante se quiere histórico, este es el
 * único punto a cambiar.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as WebVitalPayload;
    if (!body?.name || typeof body.value !== 'number') {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    console.info(
      '[web-vitals]',
      JSON.stringify({
        name: body.name,
        value: Math.round(body.value * 100) / 100,
        rating: body.rating ?? null,
        path: body.path ?? null,
        navigationType: body.navigationType ?? null,
        id: body.id ?? null,
      })
    );

    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
