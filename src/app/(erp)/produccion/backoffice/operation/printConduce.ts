'use client';

import type { BackofficeReception } from '../types';
import { getReceiverName } from '../backofficeHelpers';

export function printConduce(record: BackofficeReception) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  // Generar un nÃºmero de recepciÃ³n numÃ©rico a partir del ID o Timestamp
  const numericId = record.created_at 
    ? new Date(record.created_at).getTime().toString().slice(-8)
    : Math.floor(10000000 + Math.random() * 90000000).toString();

  const operatorName = getReceiverName(record);
  
  // Extraer datos de las notas
  const pilot = record.notes?.split('Piloto: ')[1]?.split(/\\n|\n/)[0] || '---';
  const cleanNotes = (record.notes || '').split('--- LÃNEA DE TIEMPO')[0].split('Backoffice_')[0].split('GuÃ­as Procesadas:')[0];
  const notesGuias = cleanNotes?.split('GuÃ­as: ')[1]?.split(/\\n|\n/)[0]?.split(',').map((g: string) => g.trim()).filter(Boolean) || [];
  const guias = (record.processed_guides && record.processed_guides.length > 0) 
    ? record.processed_guides 
    : (notesGuias.length > 0 ? notesGuias : (record.guide_number ? [record.guide_number] : []));

  const guideRows = guias.map((g: string, i: number) => `
    <tr>
      <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 11px;">${i + 1}</td>
      <td style="padding: 10px; border: 1px solid #e2e8f0; font-family: monospace; font-weight: bold; color: #181c3a; font-size: 14px;">${g}</td>
      <td style="padding: 10px; border: 1px solid #e2e8f0; color: #64748b; font-size: 11px; text-transform: uppercase;">Bulto / GuÃ­a CAC</td>
    </tr>
  `).join('');

  printWindow.document.write(`
    <html>
      <head>
        <title>Conduce de RecepciÃ³n CAC - ${numericId}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
          body { font-family: 'Inter', sans-serif; padding: 40px; color: #1e293b; line-height: 1.5; }
          .header { border-bottom: 4px solid #181c3a; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: flex-end; }
          .badge { background: #2ec4f1; color: #181c3a; padding: 4px 12px; border-radius: 6px; font-size: 10px; font-weight: 900; text-transform: uppercase; }
          .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 30px; }
          .card { background: #f8fafc; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0; }
          .label { font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px; display: block; }
          .value { font-size: 14px; font-weight: bold; color: #1e293b; }
          h2 { font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b; margin: 30px 0 15px 0; border-left: 4px solid #2ec4f1; padding-left: 10px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          th { background: #f8fafc; padding: 12px; text-align: left; font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; border: 1px solid #e2e8f0; }
          .signature { margin-top: 80px; display: grid; grid-template-columns: 1fr 1fr; gap: 100px; }
          .sig-line { border-top: 1px solid #94a3b8; text-align: center; padding-top: 10px; font-size: 10px; font-weight: bold; color: #64748b; }
          @media print { .no-print { display: none; } }
        </style>
      </head>
      <body onload="window.print(); window.close();">
        <div class="header">
          <div>
            <div class="badge">Acuse de Recibo - Backoffice CAC</div>
            <h1 style="margin: 10px 0 0 0; font-size: 28px; font-weight: 900; letter-spacing: -1px;">Conduce de RecepciÃ³n</h1>
          </div>
          <div style="text-align: right;">
            <div style="font-weight: 900; color: #181c3a; font-size: 18px;">REC-${numericId}</div>
            <div style="font-size: 10px; color: #94a3b8; font-weight: bold;">SISTEMA TC-ERP</div>
          </div>
        </div>

        <div class="grid">
          <div class="card">
            <span class="label">Transportista / Piloto</span>
            <span class="value">${pilot}</span>
          </div>
          <div class="card">
            <span class="label">Fecha de RecepciÃ³n</span>
            <span class="value">${new Date(record.created_at).toLocaleString()}</span>
          </div>
          <div class="card">
            <span class="label">Operador Responsable</span>
            <span class="value">${operatorName}</span>
          </div>
          <div class="card">
            <span class="label">Estatus Final</span>
            <span class="value" style="color: #10b981;">RECIBIDO</span>
          </div>
        </div>

        <h2>Detalle de Manifiesto</h2>
        <table>
          <thead>
            <tr>
              <th style="width: 50px;">Item</th>
              <th>CÃ³digo de GuÃ­a / Bulto</th>
              <th>Tipo de Unidad</th>
            </tr>
          </thead>
          <tbody>
            ${guideRows}
          </tbody>
        </table>

        <div class="signature">
          <div class="sig-line">Entregado por (Firma / Sello)</div>
          <div class="sig-line">Recibido por (Firma / Sello)</div>
        </div>
      </body>
    </html>
  `);
  printWindow.document.close();
};
