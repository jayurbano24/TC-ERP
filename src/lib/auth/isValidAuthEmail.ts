/** Correo usable en Auth: exige usuario@dominio.tld (rechaza "urbano" sin @). */
export function isValidAuthEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}
