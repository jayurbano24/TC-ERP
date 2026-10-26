import { describe, expect, it } from 'vitest';
import { humanizeUserFacingError } from './humanizeUserFacingError';

describe('humanizeUserFacingError — no confundir URLs con RLS', () => {
  it('preserva mensaje de SITE_URL / Redirect URLs', () => {
    const human = humanizeUserFacingError(
      'No se pudo invitar',
      'Define NEXT_PUBLIC_SITE_URL y configúrala como Site URL / Redirect URLs en Autenticación. Actual: http://localhost:3000'
    );
    expect(human.title).not.toBe('Sin permiso');
    expect(human.description).toMatch(/SITE_URL|Redirect URLs/i);
  });

  it('sigue detectando errores reales de RLS', () => {
    const human = humanizeUserFacingError(
      'Error',
      'new row violates row-level security policy'
    );
    expect(human.title).toBe('Sin permiso');
  });
});
