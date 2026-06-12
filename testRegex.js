const notes = `Piloto: MANUEL\nGuías: QWE-75395, ABS-875421, AWS-565986\n\n--- LÍNEA DE TIEMPO (MATRIZ) ---\n[9/6/2026, 5:22:39 p.m.] MOV-VTZ95 | REC-002 | RECEPCIÓN: Ingreso inicial al sistema en CAC - Por: Admin User\nGuías Procesadas: AWS-565986, QWE-75395, ABS-875421\n\n--- DETALLES BACKOFFICE ---\nBackoffice_Agency: Antigua\nBackoffice_Category: teléfono`;

const extractField = (notes, field) => {
  if (!notes) return null;
  const regex = new RegExp(`${field}:\\s*([^\\n]+)`, 'i');
  const match = notes.match(regex);
  return match ? match[1].trim() : null;
};

console.log("Extracted:", extractField(notes, 'Backoffice_Agency'));
