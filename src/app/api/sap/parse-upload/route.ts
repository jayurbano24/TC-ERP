import { NextResponse } from 'next/server';
import { parseSapUploadBuffer } from '@/lib/sap/parseSapUploadFile';
import { SAP_PARSE_UPLOAD_MAX_BYTES, SAP_PARSE_UPLOAD_MAX_MB } from '@/lib/sap/sapUploadLimits';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { logOnlyRoleCheck, ROLES_RETURNS_SAP } from '@/shared/authz/roleGuard';

export const dynamic = 'force-dynamic';
/** Excel G985 grandes: parseo en Node, no en el navegador. */
export const maxDuration = 120;

export async function POST(request: Request) {
  const auth = await requireApiUser(request);
  if (auth instanceof NextResponse) return auth;
  const denied = await logOnlyRoleCheck(request, ROLES_RETURNS_SAP, {
    module: 'sap',
    action: 'parse-upload',
  });
  if (denied) return denied;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Cuerpo multipart inválido.' },
      { status: 400 }
    );
  }

  const file = form.get('file');
  if (!(file instanceof File) || !file.size) {
    return NextResponse.json(
      { success: false, error: 'Seleccione un archivo Excel o CSV SAP.' },
      { status: 400 }
    );
  }

  if (file.size > SAP_PARSE_UPLOAD_MAX_BYTES) {
    return NextResponse.json(
      {
        success: false,
        error: `Archivo demasiado grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Máximo ${SAP_PARSE_UPLOAD_MAX_MB} MB. Si supera el límite, exporte a CSV desde SAP o divida el Excel.`,
      },
      { status: 413 }
    );
  }

  const name = file.name || 'sap-upload.xlsx';
  const lower = name.toLowerCase();
  if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls') && !lower.endsWith('.csv')) {
    return NextResponse.json(
      { success: false, error: 'Formato no soportado. Use .xlsx, .xls o .csv.' },
      { status: 400 }
    );
  }

  try {
    const buffer = await file.arrayBuffer();
    const parsed = await parseSapUploadBuffer(buffer, name);
    return NextResponse.json({
      success: true,
      hash: parsed.hash,
      format: parsed.format,
      totalRows: parsed.rowCount,
      serialCount: parsed.serials.length,
      serials: parsed.serials,
      materials: parsed.materials,
      valuations: parsed.valuations,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo leer el archivo SAP';
    console.error('[sap/parse-upload]', message, err);
    return NextResponse.json({ success: false, error: message }, { status: 422 });
  }
}
