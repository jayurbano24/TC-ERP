export const printingService = {
  printBoxLabel: (box: any) => {
    const printWindow = window.open('', '', 'width=600,height=400');
    if (!printWindow) return;

    const commonStyles = `
      <style>
        body { font-family: 'Inter', sans-serif; margin: 0; padding: 20px; text-align: center; color: #181c3a; }
        .label-container { border: 2px solid #000; padding: 20px; border-radius: 12px; display: inline-block; min-width: 350px; }
        .title { font-size: 14px; font-weight: 900; letter-spacing: 2px; margin-bottom: 15px; color: #64748b; text-transform: uppercase; }
        .box-id { font-size: 32px; font-weight: 900; margin-bottom: 10px; font-family: monospace; }
        .details { font-size: 16px; font-weight: bold; margin-bottom: 20px; line-height: 1.5; }
        .barcode { font-family: 'Libre Barcode 39', monospace; font-size: 50px; margin-bottom: 5px; font-weight: normal; }
        @media print {
          .page-break { page-break-before: always; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      </style>
      <link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+39&display=swap" rel="stylesheet">
    `;

    const svgLogo = `
      <svg viewBox="0 0 565 280" xmlns="http://www.w3.org/2000/svg" style="height: 45px; width: auto;">
        <rect width="565" height="280" fill="#ffffff"/>
        <g fill="#2e3165"><rect x="8" y="9" width="232" height="60"/><rect x="92" y="9" width="65" height="271"/></g>
        <g fill="#2e3165"><circle cx="425" cy="140" r="140"/><circle cx="425" cy="140" r="85" fill="#ffffff"/><rect x="500" y="100" width="80" height="60" fill="#ffffff"/><circle cx="425" cy="140" r="35" fill="#2e3165"/></g>
      </svg>
    `;

    const simpleLabelHtml = `
      <div class="label-container">
        <div class="title" style="display: flex; justify-content: center; margin-bottom: 15px;">
          ${svgLogo}
        </div>
        <div class="box-id">${box.boxCode || box.box_code}</div>
        <div class="barcode">*${box.boxCode || box.box_code}*</div>
        <div class="details">
          MARCA: ${box.marca || 'N/A'}<br>
          MODELO: ${box.modelo || 'N/A'}<br>
          CANTIDAD: ${box.totalEsperado || box.capacity} Unidades<br>
          NRO. MATERIAL: ${box.material || '---'}<br>
          FECHA: ${new Date().toLocaleDateString()}
        </div>
      </div>
    `;

    printWindow.document.write(`
      <html>
        <head>
          <title>Impresión de Etiqueta - ${box.boxCode || box.box_code}</title>
          ${commonStyles}
        </head>
        <body>
          ${simpleLabelHtml}
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
                window.close();
              }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  },

  printPXManifest: (record: any, series: any[], manifestBoxes: any[]) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const boxesTables = manifestBoxes.map((box: any) => {
      const boxSeries = series.filter((s: any) => s.boxCode === box.boxCode || s.box_code === box.boxCode);
      const rows = boxSeries.map((s: any, i: number) => `
        <tr>
          <td style="padding: 4px; border: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 9px; white-space: nowrap;">${i + 1}</td>
          <td style="padding: 4px; border: 1px solid #e2e8f0; font-family: monospace; font-weight: bold; color: #1e293b; font-size: 10px; white-space: nowrap;">${s.sn || s.serial_number}</td>
          <td style="padding: 4px; border: 1px solid #e2e8f0; font-family: monospace; color: #64748b; font-size: 9px; white-space: nowrap;">${s.s2 || '-'}</td>
          <td style="padding: 4px; border: 1px solid #e2e8f0; font-family: monospace; color: #64748b; font-size: 9px; white-space: nowrap;">${s.s3 || '-'}</td>
          <td style="padding: 4px; border: 1px solid #e2e8f0; font-family: monospace; color: #64748b; font-size: 9px; white-space: nowrap;">${s.s4 || '-'}</td>
          <td style="padding: 4px; border: 1px solid #e2e8f0; font-family: monospace; font-weight: bold; color: #1e293b; font-size: 9px; white-space: nowrap;">${s.material || '-'}</td>
          <td style="padding: 4px; border: 1px solid #e2e8f0; color: #64748b; font-size: 9px; white-space: nowrap;">${s.marca || s.brand || 'N/A'}</td>
          <td style="padding: 4px; border: 1px solid #e2e8f0; color: #64748b; font-size: 9px; white-space: nowrap;">${s.modelo || s.model || 'N/A'}</td>
        </tr>
      `).join('');

      return `
        <div style="margin-bottom: 30px;">
          <h3 style="font-size: 11px; font-weight: 900; color: #181c3a; text-transform: uppercase; margin-bottom: 5px; background: #f8fafc; padding: 6px; border: 1px solid #e2e8f0; border-radius: 4px;">
            Caja: ${box.boxCode} <span style="color: #64748b;">| ${box.marca || 'N/A'} ${box.modelo || 'N/A'} (${box.tecnologia || 'EQUIPO'})</span> <span style="float: right; color: #2ec4f1;">Total: ${boxSeries.length} / ${box.totalEsperado || box.capacity}</span>
          </h3>
          <table>
            <thead>
              <tr>
                <th style="width: 40px; text-align: center;">#</th>
                <th>S-1</th>
                <th>S-2</th>
                <th>S-3</th>
                <th>S-4</th>
                <th>Material</th>
                <th>Marca</th>
                <th>Modelo</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="8" style="text-align:center; padding:10px; color:#94a3b8; font-size:9px;">Sin series escaneadas</td></tr>'}
            </tbody>
          </table>
        </div>
      `;
    }).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Manifiesto PX - ${record.sap || record.sap_document || 'SIN-PEDIDO'}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
            body { font-family: 'Inter', sans-serif; padding: 20px; color: #1e293b; line-height: 1.4; }
            .header { border-bottom: 2px solid #181c3a; padding-bottom: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
            .badge { background: #2ec4f1; color: #181c3a; padding: 3px 8px; border-radius: 4px; font-size: 9px; font-weight: 900; text-transform: uppercase; }
            .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
            .card { background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0; }
            .label { font-size: 9px; font-weight: 900; color: #94a3b8; text-transform: uppercase; margin-bottom: 2px; display: block; }
            .value { font-size: 12px; font-weight: bold; color: #1e293b; }
            h2 { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b; margin: 20px 0 10px 0; border-left: 3px solid #2ec4f1; padding-left: 8px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th { background: #f8fafc; padding: 8px; text-align: left; font-size: 9px; font-weight: 900; color: #94a3b8; text-transform: uppercase; border: 1px solid #e2e8f0; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="badge">Acuse de Recibo - Planta Externa</div>
              <h1 style="margin: 10px 0 0 0; font-size: 28px; font-weight: 900; letter-spacing: -1px;">Manifiesto de Carga</h1>
            </div>
            <div style="text-align: right;">
              <div style="font-weight: 900; color: #181c3a; font-size: 18px;">PX-${record.notes?.split('DOC Ref: ')[1]?.split('\\n')[0] || record.sap_document || 'N/A'}</div>
              <div style="font-size: 10px; color: #94a3b8; font-weight: bold;">SISTEMA TC-ERP</div>
            </div>
          </div>
          <div class="grid">
            <div class="card"><span class="label">Número de Pedido</span><span class="value">${record.sap || record.sap_document}</span></div>
            <div class="card"><span class="label">Fecha / Hora Recepción</span><span class="value">${record.fecha_formateada || new Date().toLocaleString()}</span></div>
            <div class="card"><span class="label">Total Equipos</span><span class="value">${series.length} unidades</span></div>
            <div class="card"><span class="label">Total Cajas</span><span class="value">${manifestBoxes.length} Cajas</span></div>
          </div>
          <h2>Detalle de Cajas y Series</h2>
          ${boxesTables}
          <script>
            window.onload = function() { window.print(); };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  },

  printCACAcuse: (record: any) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Generar un número de recepción numérico a partir del ID o Timestamp
    const numericId = record.created_at 
      ? new Date(record.created_at).getTime().toString().slice(-8)
      : Math.floor(10000000 + Math.random() * 90000000).toString();

    const operatorName = record.usuario || 'SISTEMA';
    
    // Extraer datos de las notas
    const pilot = record.notes?.split('Piloto: ')[1]?.split('\\n')[0] || '---';
    const cleanNotes = (record.notes || '').split('--- LÍNEA DE TIEMPO')[0].split('Backoffice_')[0].split('Guías Procesadas:')[0];
    const notesGuias = cleanNotes?.split('Guías: ')[1]?.split('\\n')[0]?.split(',').map((g: string) => g.trim()).filter(Boolean) || [];
    const guias = notesGuias.length > 0 ? notesGuias : [record.guide_number];

    const guideRows = guias.map((g: string, i: number) => `
      <tr>
        <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 11px;">${i + 1}</td>
        <td style="padding: 10px; border: 1px solid #e2e8f0; font-family: monospace; font-weight: bold; color: #1e293b; font-size: 14px;">${g}</td>
        <td style="padding: 10px; border: 1px solid #e2e8f0; color: #64748b; font-size: 11px; text-transform: uppercase;">Bulto / Guía CAC</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Conduce de Recepción CAC - ${numericId}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
            body { font-family: 'Inter', sans-serif; padding: 40px; color: #1e293b; line-height: 1.5; }
            .header { border-bottom: 4px solid #181c3a; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: flex-end; }
            .badge { background: #2ec4f1; color: #181c3a; padding: 4px 12px; border-radius: 6px; font-size: 10px; font-weight: 900; text-transform: uppercase; }
            .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 30px; }
            .card { background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; }
            .label { font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px; display: block; }
            .value { font-size: 14px; font-weight: bold; color: #1e293b; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
            th { background: #f8fafc; padding: 12px; text-align: left; font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; border: 1px solid #e2e8f0; }
            .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 60px; }
            .signature-box { border-top: 2px solid #181c3a; padding-top: 10px; text-align: center; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="badge">CONDUCE DE RECEPCIÓN - CAC</div>
              <h1 style="margin: 10px 0 0 0; font-size: 28px; font-weight: 900; letter-spacing: -1px;">Acuse de Recibo Logístico</h1>
            </div>
            <div style="text-align: right;">
              <div style="font-weight: 900; color: #181c3a; font-size: 24px;">REC-${numericId}</div>
              <div style="font-size: 12px; color: #94a3b8; font-weight: bold;">FECHA: ${new Date().toLocaleDateString()}</div>
            </div>
          </div>
          <div class="grid">
            <div class="card"><span class="label">Operador (Recibe)</span><span class="value">${operatorName}</span></div>
            <div class="card"><span class="label">Transportista / Piloto (Entrega)</span><span class="value">${record.carrier || 'N/A'} / ${pilot}</span></div>
            <div class="card"><span class="label">Total Bultos / Guías Recibidas</span><span class="value">${guias.length}</span></div>
            <div class="card"><span class="label">Fecha y Hora de Transacción</span><span class="value">${record.fecha_formateada || new Date().toLocaleString()}</span></div>
          </div>
          <h2 style="font-size: 12px; font-weight: 900; text-transform: uppercase; color: #64748b; margin-bottom: 10px;">Detalle de Guías Escaneadas</h2>
          <table>
            <thead>
              <tr>
                <th style="width: 50px; text-align: center;">#</th>
                <th>Código de Guía / Serial</th>
                <th>Tipo de Elemento</th>
              </tr>
            </thead>
            <tbody>
              ${guideRows}
            </tbody>
          </table>
          <div class="signatures">
            <div class="signature-box">
              <div style="font-weight: 900; font-size: 12px;">FIRMA DE QUIEN ENTREGA</div>
              <div style="color: #64748b; font-size: 10px; margin-top: 4px;">Piloto / Transportista</div>
            </div>
            <div class="signature-box">
              <div style="font-weight: 900; font-size: 12px;">FIRMA DE QUIEN RECIBE</div>
              <div style="color: #64748b; font-size: 10px; margin-top: 4px;">Operador TC-ERP (${operatorName})</div>
            </div>
          </div>
          <script>
            window.onload = function() { window.print(); };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }
};
