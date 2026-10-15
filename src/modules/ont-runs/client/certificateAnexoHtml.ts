function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'string') return value.trim() || '—';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '—';
}

/** Anexo hoja 2 — iPerf / puertos (mismo contenido que exige el certificado completo). */
export function renderOntCertificateAnexoFromReport(report: Record<string, unknown>): string {
  const flows = report.flows;
  const ports = report.ports;
  let html = '';

  if (Array.isArray(flows) && flows.length > 0) {
    const body = flows
      .filter(isPlainObject)
      .map(
        (flow) => `<tr>
          <td>${escapeHtml(str(flow.case_id))}</td>
          <td>${escapeHtml(str(flow.kind))}</td>
          <td>${escapeHtml(str(flow.source))} → ${escapeHtml(str(flow.destination))}</td>
          <td class="rf-num">${flow.mbps_avg != null ? Number(flow.mbps_avg).toFixed(2) : '—'}</td>
          <td>${escapeHtml(str(flow.verdict))}</td>
        </tr>`
      )
      .join('');
    html += `
      <div class="section-title">Pruebas de tráfico (iPerf3)</div>
      <table class="params"><thead><tr><th>Caso</th><th>Tipo</th><th>Ruta</th><th>Avg Mbps</th><th>Veredicto</th></tr></thead><tbody>${body}</tbody></table>`;
  }

  if (Array.isArray(ports) && ports.length > 0) {
    const body = ports
      .filter(isPlainObject)
      .map((port) => {
        const link = isPlainObject(port.link) ? port.link : {};
        return `<tr>
          <td>${escapeHtml(str(port.logical_name))}</td>
          <td>${escapeHtml(str(port.verdict))}</td>
          <td>${escapeHtml(str(link.speed_mbps))} Mbps</td>
          <td class="rf-num">${port.rx_mbps != null ? Number(port.rx_mbps).toFixed(2) : '—'}</td>
          <td>${escapeHtml(str(port.physical_verdict))}</td>
        </tr>`;
      })
      .join('');
    html += `
      <div class="section-title">Certificación de puertos Ethernet</div>
      <table class="params"><thead><tr><th>Puerto</th><th>Veredicto</th><th>Enlace</th><th>RX Mbps</th><th>Físico</th></tr></thead><tbody>${body}</tbody></table>`;
  }

  return html;
}
