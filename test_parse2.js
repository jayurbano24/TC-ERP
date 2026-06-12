const content = "MOV-1V24P | REC-01 | RECEPCIÓN: Ingreso inicial al sistema en CAC - Por: Admin User";

const pipeParts = content.split(' | ');
let meta = '';
let body = content;

if (pipeParts.length > 2) {
  meta = pipeParts[0] + ' | ' + pipeParts[1];
  body = pipeParts.slice(2).join(' | ');
} else if (pipeParts.length === 2) {
  meta = pipeParts[0];
  body = pipeParts[1];
}

console.log("Meta:", meta);
console.log("Body:", body);

let action = '';
let detail = '';

if (body) {
 const parts = body.split(': ');
 if (parts.length > 1) {
    action = parts[0];
    detail = parts.slice(1).join(': ');
 } else {
    action = 'METADATO / EVENTO';
    detail = body;
 }
}

console.log("Action:", action);
console.log("Detail:", detail);
