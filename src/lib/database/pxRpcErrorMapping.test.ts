import { describe, expect, it } from 'vitest';
import {
  mapRpcCaptureError,
  mapRpcFinalizeError,
  parsePxRpcError,
} from './pxRpcErrorMapping';

describe('parsePxRpcError', () => {
  it('detects SERIAL_BUSY from prefix', () => {
    expect(parsePxRpcError('SERIAL_BUSY: Hay otra captura para la serie X')).toEqual({
      code: 'SERIAL_BUSY',
    });
  });

  it('detects BOX_BUSY from prefix', () => {
    expect(parsePxRpcError('BOX_BUSY: Hay otra captura')).toEqual({ code: 'BOX_BUSY' });
  });

  it('detects lock_not_available as BOX_BUSY', () => {
    const parsed = parsePxRpcError('could not obtain lock on row in relation "boxes"');
    expect(parsed.code).toBe('BOX_BUSY');
    expect(parsed.sqlstate).toBe('55P03');
  });

  it('detects statement timeout as CAPTURE_TIMEOUT', () => {
    const parsed = parsePxRpcError('canceling statement due to statement timeout');
    expect(parsed.code).toBe('CAPTURE_TIMEOUT');
    expect(parsed.sqlstate).toBe('57014');
  });
});

describe('mapRpcCaptureError', () => {
  it('maps capture timeout without finalize wording', () => {
    const msg = mapRpcCaptureError('canceling statement due to statement timeout', 'capture');
    expect(msg).toContain('captura');
    expect(msg.toLowerCase()).not.toContain('finaliz');
  });

  it('maps finalize timeout with finalize wording', () => {
    const msg = mapRpcFinalizeError('canceling statement due to statement timeout');
    expect(msg.toLowerCase()).toContain('finaliz');
  });

  it('maps SERIAL_BUSY to controlled message', () => {
    const msg = mapRpcCaptureError('SERIAL_BUSY: test', 'capture');
    expect(msg).toContain('esta serie');
  });

  it('maps BOX_BUSY to controlled message', () => {
    const msg = mapRpcCaptureError('BOX_BUSY: test', 'capture');
    expect(msg).toContain('esta caja');
  });

  it('maps DUPLICATE_IN_RECEPTION with detail when present', () => {
    const msg = mapRpcCaptureError(
      'DUPLICATE_IN_RECEPTION: La serie X ya está en guía REC caja CAJA-1. Elimine el duplicado de esa caja antes de continuar.',
      'capture',
    );
    expect(msg).toContain('serie X');
    expect(msg).toContain('CAJA-1');
  });
});
