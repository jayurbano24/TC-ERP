'use client';

import { useReportWebVitals } from 'next/web-vitals';

const ENDPOINT = '/api/observability/web-vitals';

/**
 * Reporter de Web Vitals de campo (LCP/INP/CLS/FCP/TTFB).
 *
 * Mide rendimiento real del usuario, no sólo latencia de API. En producción
 * envía cada métrica con `sendBeacon` (no bloquea la navegación ni se pierde al
 * descargar la página). En desarrollo sólo loguea en consola para no generar
 * ruido de red.
 */
export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    const payload = {
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      id: metric.id,
      navigationType: metric.navigationType,
      path: typeof window !== 'undefined' ? window.location.pathname : undefined,
    };

    if (process.env.NODE_ENV !== 'production') {
      console.debug('[web-vitals]', payload.name, Math.round(payload.value), payload.rating);
      return;
    }

    try {
      const body = JSON.stringify(payload);
      if (navigator.sendBeacon) {
        navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
      } else {
        void fetch(ENDPOINT, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } });
      }
    } catch {
      /* nunca romper la app por telemetría */
    }
  });

  return null;
}
