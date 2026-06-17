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

    // Lógica para número consecutivo iniciando en REC-800000 usando localStorage (para PX)
    let numericId = '800000';
    try {
      const recordKey = 'px_seq_' + (record.id || record.created_at || Date.now());
      let savedId = window.localStorage.getItem(recordKey);
      if (!savedId) {
         let currentSeq = parseInt(window.localStorage.getItem('px_current_seq') || '800000');
         currentSeq++;
         savedId = currentSeq.toString();
         window.localStorage.setItem('px_current_seq', savedId);
         window.localStorage.setItem(recordKey, savedId);
      }
      numericId = savedId;
    } catch (e) {
      numericId = (800000 + Math.floor(Math.random() * 9999)).toString();
    }

    const operatorNameRaw = record.notes?.split('Recibido Por: ')[1]?.split(/\\n|\n/)[0] || record.usuario || 'SISTEMA';
    let operatorName = operatorNameRaw;
    if (operatorName.includes('@')) {
      operatorName = operatorName.split('@')[0];
      operatorName = operatorName.charAt(0).toUpperCase() + operatorName.slice(1).toLowerCase();
    }

    const techCounts: Record<string, number> = {};
    let totalEquiposCount = 0;

    const boxesSummaryRows = manifestBoxes.map((box: any, index: number) => {
      const boxSeries = series.filter((s: any) => s.boxCode === box.boxCode || s.box_code === box.boxCode);
      const uniqueEquipmentsCount = new Set(boxSeries.map((s: any) => s.service_order_id).filter(Boolean)).size;
      const cantidad = uniqueEquipmentsCount > 0 ? uniqueEquipmentsCount : (box.totalEsperado || box.capacity || 0);

      const tech = (box.tecnologia || 'EQUIPO').toUpperCase();
      techCounts[tech] = (techCounts[tech] || 0) + cantidad;
      totalEquiposCount += cantidad;

      return `
        <tr>
          <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 11px;">${index + 1}</td>
          <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-family: monospace; font-weight: bold; color: #1e293b; font-size: 12px;">${box.boxCode || box.box_code}</td>
          <td style="padding: 6px 10px; border: 1px solid #e2e8f0; color: #64748b; font-size: 11px; text-align: center; font-weight: bold;">${cantidad} Unid.</td>
          <td style="padding: 6px 10px; border: 1px solid #e2e8f0; color: #1e293b; font-size: 11px;">${box.marca || 'N/A'} - ${box.modelo || 'N/A'}</td>
          <td style="padding: 6px 10px; border: 1px solid #e2e8f0; color: #64748b; font-size: 11px; text-transform: uppercase;">${tech}</td>
        </tr>
      `;
    }).join('');

    const techSummary = Object.keys(techCounts).length > 0 
      ? Object.entries(techCounts).map(([tech, count]) => `${tech}: ${count} unid.`).join(' | ')
      : 'N/A';

    const boxesTableHTML = `
      <h2 style="font-size: 11px; font-weight: 900; text-transform: uppercase; color: #64748b; margin-bottom: 5px;">Detalle de Cajas Recibidas</h2>
      <table style="margin-top: 10px;">
        <thead>
          <tr>
            <th style="width: 40px; text-align: center;">#</th>
            <th>Caja</th>
            <th style="text-align: center;">Cantidad</th>
            <th>Marca y Modelo</th>
            <th>Tecnología</th>
          </tr>
        </thead>
        <tbody>
          ${boxesSummaryRows || '<tr><td colspan="5" style="text-align:center; padding:10px; color:#94a3b8; font-size:11px;">Sin cajas registradas</td></tr>'}
        </tbody>
      </table>
    `;

    printWindow.document.write(`
      <html>
        <head>
          <title>Conduce de Recepción PX - ${numericId}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
            body { font-family: 'Inter', sans-serif; padding: 25px; color: #1e293b; line-height: 1.4; }
            .header { border-bottom: 3px solid #181c3a; padding-bottom: 10px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: flex-end; }
            .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 10px; }
            .card { background: #f8fafc; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0; }
            .label { font-size: 9px; font-weight: 900; color: #94a3b8; text-transform: uppercase; margin-bottom: 2px; display: block; }
            .value { font-size: 12px; font-weight: bold; color: #1e293b; }
            h2 { font-size: 11px; font-weight: 900; text-transform: uppercase; color: #64748b; margin-bottom: 5px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th { background: #f8fafc; padding: 8px 10px; text-align: left; font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; border: 1px solid #e2e8f0; }
            .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; }
            .signature-box { border-top: 2px solid #181c3a; padding-top: 5px; text-align: center; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <svg viewBox="0 0 565 280" style="height: 30px; width: auto; margin-bottom: 8px;">
                <g fill="#181c3a">
                  <rect x="8" y="9" width="232" height="60"/>
                  <rect x="92" y="9" width="65" height="271"/>
                </g>
                <g fill="#181c3a">
                  <circle cx="425" cy="140" r="140"/>
                  <circle cx="425" cy="140" r="85" fill="#ffffff"/>
                  <rect x="500" y="100" width="80" height="60" fill="#ffffff"/>
                  <circle cx="425" cy="140" r="35" fill="#181c3a"/>
                </g>
              </svg>
              <h1 style="margin: 5px 0 0 0; font-size: 24px; font-weight: 900; letter-spacing: -1px;">Conduce de Recepción PX</h1>
            </div>
            <div style="display: flex; align-items: center; gap: 15px; text-align: right;">
              <div>
                <div style="font-weight: 900; color: #181c3a; font-size: 20px;">REC-${numericId}</div>
                <div style="font-size: 11px; color: #94a3b8; font-weight: bold;">FECHA: ${new Date().toLocaleDateString()}</div>
              </div>
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=50x50&data=https://maps.app.goo.gl/CZHWCBQQY6A8HuZg8" alt="QR" style="border-radius: 4px; border: 1px solid #e2e8f0; padding: 2px;" />
            </div>
          </div>
          
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px 15px; border-radius: 6px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; font-size: 9px; color: #64748b; line-height: 1.4;">
            <div style="text-align: left; max-width: 40%;">
              <div style="font-size: 11px; font-weight: 900; color: #181c3a; text-transform: uppercase; margin-bottom: 3px;">
                TECH CORPS GUATEMALA -<br>TECHCOMMWIRELESS GUATEMALA S.A.
              </div>
              <div style="color: #1e293b;">
                <strong>Recepción Procesada Por:</strong> <span style="color: #2ec4f1; font-weight: bold;">${operatorName}</span>
              </div>
            </div>
            <div style="text-align: right; max-width: 65%;">
              <div style="margin-bottom: 2px;"><strong>Nuestra Dirección:</strong> Boulevard bosque de San Nicolas</div>
              <div style="margin-bottom: 2px;">Colonia El Naranjo, 7 Calle 24-53, Bodega 9, Zona 4 de Mixco</div>
              <div style="margin-bottom: 2px;"><strong>Horario:</strong> Lunes a Jueves de 8:00 a 18:00; Viernes de 8:00 a 17:00PM</div>
              <div><strong>Teléfono:</strong> 2436 0336 / 2254 0430</div>
            </div>
          </div>
          
          <div class="grid">
            <div class="card"><span class="label">Número de Pedido</span><span class="value">${record.sap || record.sap_document || 'N/A'}</span></div>
            <div class="card"><span class="label">Proveedor / Origen</span><span class="value">${record.provider || record.notes?.split('Proveedor PX: ')[1]?.split(/\\n|\n/)[0] || 'N/A'}</span></div>
            <div class="card"><span class="label">Total Cajas</span><span class="value">${manifestBoxes.length} Cajas</span></div>
            <div class="card"><span class="label">Total Equipos</span><span class="value">${totalEquiposCount} Unidades</span></div>
          </div>
          
          <div class="grid" style="grid-template-columns: 1fr; margin-bottom: 20px;">
             <div class="card"><span class="label">Resumen por Tecnología</span><span class="value">${techSummary}</span></div>
          </div>

          ${boxesTableHTML}

          <div class="signatures">
            <div class="signature-box">
              <div style="font-weight: 900; font-size: 12px;">FIRMA DE QUIEN ENTREGA</div>
              <div style="color: #64748b; font-size: 10px; margin-top: 4px;">Proveedor / Transportista</div>
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
  },

  printCACAcuse: (record: any) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Lógica para número consecutivo iniciando en REC-700000 usando localStorage
    let numericId = '700000';
    try {
      const recordKey = 'cac_seq_' + (record.id || record.created_at || Date.now());
      let savedId = window.localStorage.getItem(recordKey);
      if (!savedId) {
         let currentSeq = parseInt(window.localStorage.getItem('cac_current_seq') || '700000');
         currentSeq++;
         savedId = currentSeq.toString();
         window.localStorage.setItem('cac_current_seq', savedId);
         window.localStorage.setItem(recordKey, savedId);
      }
      numericId = savedId;
    } catch (e) {
      // Fallback if localStorage fails
      numericId = (700000 + Math.floor(Math.random() * 9999)).toString();
    }

    const receivedByNote = record.notes?.split('Recibido Por: ')[1]?.split(/\\n|\n/)[0];
    let operatorName = receivedByNote || record.usuario || 'SISTEMA';
    
    // Si el nombre es un correo, mostrar solo el usuario capitalizado
    if (operatorName.includes('@')) {
      operatorName = operatorName.split('@')[0];
      operatorName = operatorName.charAt(0).toUpperCase() + operatorName.slice(1).toLowerCase();
    }
    
    // Extraer datos de las notas
    const pilot = record.notes?.split('Piloto: ')[1]?.split(/\\n|\n/)[0] || '---';
    const cleanNotes = (record.notes || '').split('--- LÍNEA DE TIEMPO')[0].split('Backoffice_')[0].split('Guías Procesadas:')[0];
    const notesGuias = cleanNotes?.split('Guías: ')[1]?.split(/\\n|\n/)[0]?.split(',').map((g: string) => g.trim()).filter(Boolean) || [];
    const guias = (record.allGuias && record.allGuias.length > 0)
      ? record.allGuias
      : (record.processed_guides && record.processed_guides.length > 0) 
        ? record.processed_guides 
        : (notesGuias.length > 0 ? notesGuias : (record.guide_number ? [record.guide_number] : []));

    const guideRows = guias.map((g: string, i: number) => `
      <tr>
        <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 11px;">${i + 1}</td>
        <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-family: monospace; font-weight: bold; color: #1e293b; font-size: 13px;">${g}</td>
        <td style="padding: 6px 10px; border: 1px solid #e2e8f0; color: #64748b; font-size: 11px; text-transform: uppercase;">Guía</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Conduce de Recepción CAC - ${numericId}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
            body { font-family: 'Inter', sans-serif; padding: 25px; color: #1e293b; line-height: 1.4; }
            .header { border-bottom: 3px solid #181c3a; padding-bottom: 10px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: flex-end; }
            .badge { background: #2ec4f1; color: #181c3a; padding: 3px 10px; border-radius: 4px; font-size: 9px; font-weight: 900; text-transform: uppercase; display: inline-block; }
            .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 20px; }
            .card { background: #f8fafc; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0; }
            .label { font-size: 9px; font-weight: 900; color: #94a3b8; text-transform: uppercase; margin-bottom: 2px; display: block; }
            .value { font-size: 12px; font-weight: bold; color: #1e293b; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th { background: #f8fafc; padding: 8px 10px; text-align: left; font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; border: 1px solid #e2e8f0; }
            .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; }
            .signature-box { border-top: 2px solid #181c3a; padding-top: 5px; text-align: center; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <svg viewBox="0 0 565 280" style="height: 30px; width: auto; margin-bottom: 8px;">
                <g fill="#181c3a">
                  <rect x="8" y="9" width="232" height="60"/>
                  <rect x="92" y="9" width="65" height="271"/>
                </g>
                <g fill="#181c3a">
                  <circle cx="425" cy="140" r="140"/>
                  <circle cx="425" cy="140" r="85" fill="#ffffff"/>
                  <rect x="500" y="100" width="80" height="60" fill="#ffffff"/>
                  <circle cx="425" cy="140" r="35" fill="#181c3a"/>
                </g>
              </svg>
              <h1 style="margin: 5px 0 0 0; font-size: 24px; font-weight: 900; letter-spacing: -1px;">Conduce de Recepción</h1>
            </div>
            <div style="display: flex; align-items: center; gap: 15px; text-align: right;">
              <div>
                <div style="font-weight: 900; color: #181c3a; font-size: 20px;">REC-${numericId}</div>
                <div style="font-size: 11px; color: #94a3b8; font-weight: bold;">FECHA: ${new Date().toLocaleDateString()}</div>
              </div>
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=50x50&data=https://maps.app.goo.gl/CZHWCBQQY6A8HuZg8" alt="QR" style="border-radius: 4px; border: 1px solid #e2e8f0; padding: 2px;" />
            </div>
          </div>
          
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px 15px; border-radius: 6px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; font-size: 9px; color: #64748b; line-height: 1.4;">
            <div style="text-align: left; max-width: 40%;">
              <div style="font-size: 11px; font-weight: 900; color: #181c3a; text-transform: uppercase; margin-bottom: 3px;">
                TECH CORPS GUATEMALA -<br>TECHCOMMWIRELESS GUATEMALA S.A.
              </div>
              <div style="color: #1e293b;">
                <strong>Recepción Procesada Por:</strong> <span style="color: #2ec4f1; font-weight: bold;">${operatorName}</span>
              </div>
            </div>
            <div style="text-align: right; max-width: 65%;">
              <div style="margin-bottom: 2px;"><strong>Nuestra Dirección:</strong> Boulevard bosque de San Nicolas</div>
              <div style="margin-bottom: 2px;">Colonia El Naranjo, 7 Calle 24-53, Bodega 9, Zona 4 de Mixco</div>
              <div style="margin-bottom: 2px;"><strong>Horario:</strong> Lunes a Jueves de 8:00 a 18:00; Viernes de 8:00 a 17:00PM</div>
              <div><strong>Teléfono:</strong> 2436 0336 / 2254 0430</div>
            </div>
          </div>

          <div class="grid">
            <div class="card"><span class="label">Transportista / Piloto (Entrega)</span><span class="value">${record.carrier || 'N/A'} / ${pilot}</span></div>
            <div class="card"><span class="label">Total Bultos / Guías Recibidas</span><span class="value">${guias.length}</span></div>
            <div class="card"><span class="label">Fecha y Hora de Transacción</span><span class="value">${record.fecha_formateada || new Date().toLocaleString()}</span></div>
          </div>
          <h2 style="font-size: 11px; font-weight: 900; text-transform: uppercase; color: #64748b; margin-bottom: 5px;">Detalle de Guías Escaneadas</h2>
          <table>
            <thead>
              <tr>
                <th style="width: 40px; text-align: center;">#</th>
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
  },

  printAllBoxLabels: (boxes: any[]) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const labelsHTML = boxes.map((box) => `
      <div style="width: 100mm; height: 100mm; padding: 5mm; box-sizing: border-box; font-family: 'Inter', sans-serif; position: relative;">
        <!-- Header / Logo -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
          <div style="flex: 1;">
            <svg viewBox="0 0 565 280" style="height: 18px; width: auto; margin-bottom: 4px;">
              <g fill="#181c3a">
                <rect x="8" y="9" width="232" height="60"/>
                <rect x="92" y="9" width="65" height="271"/>
              </g>
              <g fill="#181c3a">
                <circle cx="425" cy="140" r="140"/>
                <circle cx="425" cy="140" r="85" fill="#ffffff"/>
                <rect x="500" y="100" width="80" height="60" fill="#ffffff"/>
                <circle cx="425" cy="140" r="35" fill="#181c3a"/>
              </g>
            </svg>
            <div style="font-size: 8px; font-weight: 800; color: #181c3a; text-transform: uppercase;">TECH CORPS GUATEMALA</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 16px; font-weight: 900; color: #181c3a; letter-spacing: -0.5px;">${box.boxCode || box.box_code}</div>
            <div style="font-size: 7px; color: #64748b; font-weight: bold;">Etiqueta de Caja PX</div>
          </div>
        </div>

        <div style="border-top: 2px solid #181c3a; margin-bottom: 8px;"></div>

        <!-- Box Details -->
        <div style="background: #f8fafc; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0; margin-bottom: 12px;">
          <div style="font-size: 8px; color: #64748b; text-transform: uppercase; font-weight: 800; margin-bottom: 4px;">Marca y Modelo</div>
          <div style="font-size: 18px; font-weight: 900; color: #181c3a; line-height: 1.1;">
            ${box.marca || 'N/A'} <span style="color: #cbd5e1; margin: 0 4px;">|</span> ${box.modelo || 'N/A'}
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px;">
          <div style="padding: 6px 0;">
            <div style="font-size: 8px; color: #64748b; text-transform: uppercase; font-weight: 800; margin-bottom: 2px;">Tecnología</div>
            <div style="font-size: 14px; font-weight: 900; color: #1e293b;">${box.tecnologia || 'EQUIPO'}</div>
          </div>
          <div style="padding: 6px 0; text-align: right;">
            <div style="font-size: 8px; color: #64748b; text-transform: uppercase; font-weight: 800; margin-bottom: 2px;">Cantidad (Capacidad)</div>
            <div style="font-size: 14px; font-weight: 900; color: #2ec4f1;">${box.totalEsperado || box.capacity || 0} Unidades</div>
          </div>
        </div>

        <!-- Barcode Centered -->
        <div style="text-align: center; margin-top: 10px; padding: 10px; background: #fff; border: 1px dashed #cbd5e1; border-radius: 6px;">
           <img src="https://barcode.tec-it.com/barcode.ashx?data=${box.boxCode || box.box_code}&code=Code128&dpi=96" alt="Barcode" style="max-width: 95%; height: 70px;" />
        </div>
        
        <div style="position: absolute; bottom: 5mm; left: 5mm; right: 5mm; display: flex; justify-content: space-between; align-items: center; font-size: 9px; color: #64748b; font-weight: bold; border-top: 2px solid #f1f5f9; padding-top: 8px;">
          <span style="text-transform: uppercase;">RECEPCIÓN DE PLANTA EXTERNA</span>
          <span>FECHA: ${new Date().toLocaleDateString()}</span>
        </div>
      </div>
      <div class="page-break"></div>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Impresión de Etiquetas</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800;900&display=swap');
            body { 
              margin: 0; 
              padding: 0; 
              font-family: 'Inter', sans-serif;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .page-break { page-break-after: always; }
            @page {
              size: 100mm 100mm;
              margin: 0;
            }
          </style>
        </head>
        <body>
          ${labelsHTML}
          <script>
            window.onload = function() { window.print(); };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }
};
