const GENERIC_PERSON_NAMES = new Set([
  'admin user',
  'administrator',
  'usuario',
  'user',
  'sistema',
  'desconocido',
  'unknown',
]);

export function isGenericPersonName(name: string | null | undefined): boolean {
  if (!name) return true;
  return GENERIC_PERSON_NAMES.has(name.trim().toLowerCase());
}

export function formatPersonName(raw: string): string {
  const name = raw.split('@')[0].trim();
  if (!name) return 'Desconocido';
  if (name.includes(' ')) {
    return name
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

export type PersonNameContext = {
  emailToName: Map<string, string>;
  profileIdToName: Map<string, string>;
  knownUsers: Array<{ id: string; name: string }>;
};

export function buildPersonNameContext(params: {
  usersData?: Array<{
    id: string;
    full_name?: string | null;
    employees?:
      | { nombre_completo?: string | null; email?: string | null }
      | Array<{ nombre_completo?: string | null; email?: string | null }>
      | null;
  }> | null;
  employeesData?: Array<{ email?: string | null; nombre_completo?: string | null }> | null;
  getUserNameFromProfile: (id: string) => string;
}): PersonNameContext {
  const emailToName = new Map<string, string>();
  const profileIdToName = new Map<string, string>();
  const knownUsers: Array<{ id: string; name: string }> = [];

  params.employeesData?.forEach((emp) => {
    const email = emp.email?.trim().toLowerCase();
    const name = emp.nombre_completo?.trim();
    if (email && name) emailToName.set(email, name);
  });

  params.usersData?.forEach((user) => {
    const name = params.getUserNameFromProfile(user.id);
    profileIdToName.set(user.id, name);
    knownUsers.push({ id: user.id, name });

    const employee = Array.isArray(user.employees) ? user.employees[0] : user.employees;
    const email = employee?.email?.trim().toLowerCase();
    const employeeName = employee?.nombre_completo?.trim();
    if (email && employeeName) emailToName.set(email, employeeName);
  });

  return { emailToName, profileIdToName, knownUsers };
}

export function resolvePersonLabel(raw: string | null | undefined, ctx: PersonNameContext): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return 'Desconocido';

  if (trimmed.includes('@')) {
    const fromEmployee = ctx.emailToName.get(trimmed.toLowerCase());
    if (fromEmployee) return fromEmployee;
    return formatPersonName(trimmed);
  }

  if (/^[0-9a-f-]{36}$/i.test(trimmed)) {
    return ctx.profileIdToName.get(trimmed) || 'Desconocido';
  }

  if (!isGenericPersonName(trimmed)) {
    const exact = ctx.knownUsers.find(
      (u) => u.name.trim().toUpperCase() === trimmed.toUpperCase()
    );
    if (exact) return exact.name;

    const partial = ctx.knownUsers.find((u) => {
      const upper = trimmed.toUpperCase();
      const nameUpper = u.name.toUpperCase();
      return nameUpper.includes(upper) || upper.includes(nameUpper);
    });
    if (partial) return partial.name;

    return formatPersonName(trimmed);
  }

  return trimmed;
}

export function resolveProfileDisplayName(userRow: {
  full_name?: string | null;
  employees?:
    | { nombre_completo?: string | null; email?: string | null }
    | Array<{ nombre_completo?: string | null; email?: string | null }>
    | null;
}): string {
  const employee = Array.isArray(userRow.employees) ? userRow.employees[0] : userRow.employees;
  if (employee?.nombre_completo?.trim()) {
    return employee.nombre_completo.trim();
  }

  const fullName = userRow.full_name?.trim();
  if (fullName && !isGenericPersonName(fullName)) {
    if (fullName.includes('@')) return fullName.split('@')[0];
    return fullName;
  }

  const email = employee?.email?.trim();
  if (email) return formatPersonName(email);

  if (fullName) return formatPersonName(fullName);
  return 'Desconocido';
}
