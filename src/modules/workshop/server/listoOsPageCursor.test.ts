import { describe, expect, it } from 'vitest';
import {
  formatListoOsCursor,
  parseListoOsCursor,
  sliceListoOsPage,
} from './listoOsPageCursor';

describe('sliceListoOsPage', () => {
  it('trata una página llena de 200 como que hay más, aunque el SQL no devuelva la fila +1', () => {
    const rows = Array.from({ length: 200 }, (_, i) => i);
    const { page, hasMore } = sliceListoOsPage(rows, 200);
    expect(hasMore).toBe(true);
    expect(page).toHaveLength(200);
  });

  it('recorta la fila centinela cuando el RPC sí devuelve limit+1', () => {
    const rows = Array.from({ length: 201 }, (_, i) => i);
    const { page, hasMore } = sliceListoOsPage(rows, 200);
    expect(hasMore).toBe(true);
    expect(page).toEqual(rows.slice(0, 200));
  });

  it('para en la última página corta', () => {
    const { page, hasMore } = sliceListoOsPage([1, 2, 3], 200);
    expect(hasMore).toBe(false);
    expect(page).toEqual([1, 2, 3]);
  });
});

describe('parseListoOsCursor', () => {
  it('separa timestamp e id para no perder OS con el mismo updated_at', () => {
    const id = 'b6e357c0-bddb-4d58-903e-532a610a97de';
    const ts = '2026-09-18T21:38:42.190468+00:00';
    const raw = formatListoOsCursor(ts, id);
    expect(parseListoOsCursor(raw)).toEqual({ ts, id });
  });

  it('acepta el cursor viejo de solo timestamp', () => {
    expect(parseListoOsCursor('2026-09-18T21:38:42.190468+00:00')).toEqual({
      ts: '2026-09-18T21:38:42.190468+00:00',
      id: null,
    });
  });
});
