import { memo } from 'react';
import { getPxBoxesDefault } from '@/shared/constants/batchLimits';

type Props = {
  guideData: any;
  setGuideData: (v: any) => void;
  headerFieldErrors: { sap?: string; docReferencia?: string };
  setHeaderFieldErrors: (updater: any) => void;
  checkHeaderFields: (sap: string, docReferencia: string, showAlert?: boolean) => Promise<boolean> | void;
  systemPxProviders: any[];
};

/**
 * C1: campos de cabecera de recepción PX extraídos de PxReceptionTab y
 * memoizados. El estado vive en el padre; aquí sólo se renderizan los inputs.
 */
export const PxHeaderFields = memo(function PxHeaderFields({
  guideData,
  setGuideData,
  headerFieldErrors,
  setHeaderFieldErrors,
  checkHeaderFields,
  systemPxProviders,
}: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="space-y-2">
        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Número de Pedido *</label>
        <input
          type="text"
          placeholder="Ej: 8000XXXX"
          className={`w-full h-12 bg-slate-50 border-2 rounded-xl px-4 text-sm font-bold outline-none transition-all ${
            headerFieldErrors.sap
              ? 'border-rose-400 bg-rose-50 focus:border-rose-500'
              : 'border-slate-100 focus:border-[#2ec4f1]'
          }`}
          value={guideData.sap}
          onChange={(e) => {
            setGuideData({ ...guideData, sap: e.target.value });
            if (headerFieldErrors.sap) {
              setHeaderFieldErrors((prev: any) => ({ ...prev, sap: undefined }));
            }
          }}
          onBlur={() => {
            if (guideData.sap?.trim() || guideData.docReferencia?.trim()) {
              void checkHeaderFields(guideData.sap, guideData.docReferencia);
            }
          }}
        />
        {headerFieldErrors.sap && (
          <p className="text-[11px] font-bold text-rose-600 leading-snug">{headerFieldErrors.sap}</p>
        )}
      </div>
      <div className="space-y-2">
        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">DOC Referencia</label>
        <input
          type="text"
          placeholder="Ej: REF-1234"
          className={`w-full h-12 bg-slate-50 border-2 rounded-xl px-4 text-sm font-bold outline-none transition-all ${
            headerFieldErrors.docReferencia
              ? 'border-rose-400 bg-rose-50 focus:border-rose-500'
              : 'border-slate-100 focus:border-[#2ec4f1]'
          }`}
          value={guideData.docReferencia}
          onChange={(e) => {
            setGuideData({ ...guideData, docReferencia: e.target.value });
            if (headerFieldErrors.docReferencia) {
              setHeaderFieldErrors((prev: any) => ({ ...prev, docReferencia: undefined }));
            }
          }}
          onBlur={() => {
            if (guideData.docReferencia?.trim() || guideData.sap?.trim()) {
              void checkHeaderFields(guideData.sap, guideData.docReferencia);
            }
          }}
        />
        {headerFieldErrors.docReferencia && (
          <p className="text-[11px] font-bold text-rose-600 leading-snug">{headerFieldErrors.docReferencia}</p>
        )}
      </div>
      <div className="space-y-2">
        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Proveedor PX *</label>
        <select
          className="w-full h-12 bg-slate-50 border-2 border-slate-100 rounded-xl px-4 text-sm font-bold outline-none focus:border-[#2ec4f1] transition-all appearance-none"
          value={guideData.proveedorPx}
          onChange={(e) => setGuideData({ ...guideData, proveedorPx: e.target.value })}
        >
          <option value="">Seleccione...</option>
          {systemPxProviders.map((p: any) => (
            <option key={p.id} value={p.name}>{p.name}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
          Cantidad de CAJAS (no equipos — cada caja puede tener 40–80 series)
        </label>
        <input
          type="number"
          min={1}
          max={100}
          placeholder={`Ej: ${getPxBoxesDefault()}`}
          className="w-full h-12 bg-slate-50 border-2 border-slate-100 rounded-xl px-4 text-sm font-bold outline-none focus:border-[#2ec4f1] transition-all"
          value={guideData.totalCajasEsperadas || getPxBoxesDefault()}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            const clamped = Number.isFinite(n)
              ? Math.min(Math.max(n, 1), 100)
              : getPxBoxesDefault();
            setGuideData({ ...guideData, totalCajasEsperadas: clamped });
          }}
        />
      </div>
    </div>
  );
});
