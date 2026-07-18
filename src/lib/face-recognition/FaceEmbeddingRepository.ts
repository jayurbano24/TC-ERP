import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { RECOGNITION_CONFIG } from '@/config/recognition';
import type {
  EnrollmentCapture,
  MatchCandidate,
  RecognitionLogInput,
  StoredFaceEmbedding,
} from './types';

const EMBEDDING_SELECT =
  'id, employee_id, embedding, pose, quality, brightness, sharpness, contrast, face_size, tilt, model, created_at, active';

/** PIN de dispositivo kiosco (alineado con UI / app_kiosk_biometric_pin). */
export function getKioskBiometricPin(): string {
  if (typeof window === 'undefined') return '1234';
  try {
    return localStorage.getItem('tc_kiosk_biometric_pin') || '1234';
  } catch {
    return '1234';
  }
}

/**
 * Persistencia biométrica en tablas independientes (no JSONB en employees).
 * Mutaciones van por RPC (kiosco anon) o políticas de rol ERP.
 */
export class FaceEmbeddingRepository {
  async listActiveForEmployee(
    employeeId: string,
    model = RECOGNITION_CONFIG.ACTIVE_MODEL,
  ): Promise<StoredFaceEmbedding[]> {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('employee_face_embeddings')
      .select(EMBEDDING_SELECT)
      .eq('employee_id', employeeId)
      .eq('active', true)
      .eq('model', model);
    if (error) {
      console.error('[FaceEmbeddingRepository] listActiveForEmployee', error);
      return [];
    }
    return (data ?? []).map((row) => ({
      ...(row as StoredFaceEmbedding),
      embedding: ((row as StoredFaceEmbedding).embedding ?? []).map((v) => Number(v)),
    }));
  }

  async listActiveCandidates(
    model = RECOGNITION_CONFIG.ACTIVE_MODEL,
  ): Promise<MatchCandidate[]> {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('employee_face_embeddings')
      .select('id, employee_id, embedding')
      .eq('active', true)
      .eq('model', model);
    if (error) {
      console.error('[FaceEmbeddingRepository] listActiveCandidates', error);
      return [];
    }
    return (data ?? []).map((row) => ({
      employeeId: row.employee_id as string,
      embeddingId: row.id as string,
      // PostgREST puede devolver números como string; forzar float evita distancias corruptas
      vector: ((row.embedding as unknown[]) ?? []).map((v) => Number(v)),
    }));
  }

  async countActiveForEmployee(
    employeeId: string,
    model = RECOGNITION_CONFIG.ACTIVE_MODEL,
  ): Promise<number> {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return 0;
    const { count, error } = await supabase
      .from('employee_face_embeddings')
      .select('id', { count: 'exact', head: true })
      .eq('employee_id', employeeId)
      .eq('active', true)
      .eq('model', model);
    if (error) {
      console.error('[FaceEmbeddingRepository] countActiveForEmployee', error);
      return 0;
    }
    return count ?? 0;
  }

  async employeesWithBiometrics(
    model = RECOGNITION_CONFIG.ACTIVE_MODEL,
  ): Promise<Set<string>> {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return new Set();
    const { data, error } = await supabase
      .from('employee_face_embeddings')
      .select('employee_id')
      .eq('active', true)
      .eq('model', model);
    if (error) {
      console.error('[FaceEmbeddingRepository] employeesWithBiometrics', error);
      return new Set();
    }
    return new Set((data ?? []).map((r) => r.employee_id as string));
  }

  /**
   * Enrolamiento atómico vía RPC (desactiva previos del modelo + inserta).
   * No requiere política INSERT abierta para anon.
   */
  async insertCaptures(employeeId: string, captures: EnrollmentCapture[]): Promise<boolean> {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !captures.length) return false;

    const model = captures[0]?.model || RECOGNITION_CONFIG.ACTIVE_MODEL;
    const payload = captures.map((c) => ({
      embedding: c.embedding,
      pose: c.pose,
      quality: c.quality,
      brightness: c.brightness,
      sharpness: c.sharpness,
      contrast: c.contrast,
      face_size: c.faceSize,
      tilt: c.tilt,
      model: c.model,
    }));

    const { data, error } = await supabase.rpc('kiosk_enroll_face_embeddings', {
      p_employee_id: employeeId,
      p_model: model,
      p_captures: payload,
      p_device_pin: getKioskBiometricPin(),
    });

    if (error) {
      console.error('[FaceEmbeddingRepository] insertCaptures rpc', error);
      return false;
    }
    return typeof data === 'number' ? data > 0 : true;
  }

  async deactivateForEmployee(
    employeeId: string,
    model = RECOGNITION_CONFIG.ACTIVE_MODEL,
  ): Promise<void> {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const { error } = await supabase.rpc('kiosk_deactivate_face_embeddings', {
      p_employee_id: employeeId,
      p_model: model,
      p_device_pin: getKioskBiometricPin(),
    });

    if (error) {
      // Fallback: usuario ERP autenticado con rol biométrico
      const { error: updErr } = await supabase
        .from('employee_face_embeddings')
        .update({ active: false })
        .eq('employee_id', employeeId)
        .eq('model', model)
        .eq('active', true);
      if (updErr) console.error('[FaceEmbeddingRepository] deactivateForEmployee', error, updErr);
    }
  }

  async logRecognition(input: RecognitionLogInput): Promise<void> {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const { error } = await supabase.rpc('kiosk_log_face_recognition', {
      p_payload: {
        employee_id: input.employee_id ?? null,
        result: input.result,
        confidence: input.confidence ?? null,
        distance: input.distance ?? null,
        duration_ms: input.duration_ms ?? null,
        tablet_id: input.tablet_id ?? getTabletId(),
        reject_reason: input.reject_reason ?? null,
        model: input.model ?? RECOGNITION_CONFIG.ACTIVE_MODEL,
      },
      p_device_pin: getKioskBiometricPin(),
    });

    if (error) console.error('[FaceEmbeddingRepository] logRecognition', error);
  }
}

export function getTabletId(): string {
  if (typeof window === 'undefined') return 'server';
  try {
    const key = 'tc_kiosk_tablet_id';
    let id = localStorage.getItem(key);
    if (!id) {
      id = `tablet-${crypto.randomUUID().slice(0, 8)}`;
      localStorage.setItem(key, id);
    }
    return `${id}|${navigator.userAgent.slice(0, 80)}`;
  } catch {
    return 'unknown-tablet';
  }
}

export const faceEmbeddingRepository = new FaceEmbeddingRepository();
