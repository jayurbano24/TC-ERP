const notes = "Piloto: MANUEL\nGuías: 5655986-2\n\n--- LÍNEA DE TIEMPO (MATRIZ) ---\n[17/5/2026, 8:53:35 p.m.] MOV-1V24P | REC-01 | RECEPCIÓN: Ingreso inicial al sistema en CAC - Por: Admin User\n\n--- DETALLES BACKOFFICE ---\nBackoffice_Agency: \nBackoffice_Category: equipo\nBackoffice_Tech: EMTA\nBackoffice_Brand: KAON\nBackoffice_Model: CG-2200\nNotas: Sin notas adicionales\n";
const techId = notes.split('Backoffice_Tech: ')[1]?.split('\n')[0]?.trim() || '';
const piloto = notes.split('Piloto: ')[1]?.split('\n')[0]?.trim() || '---';
const recibio = 'Admin User'; // since received_by is null
const fechaHora = new Date("2026-05-18T02:54:24.395651+00:00").toLocaleString();
const fechaRecepcion = new Date("2026-05-18T02:54:24.395651+00:00").toLocaleDateString();

console.log({ techId, piloto, recibio, fechaHora, fechaRecepcion });
