'use client';

import { Button } from '@/components/ui';
import type { ReactNode } from 'react';
import {
  SHELL_CLASS_HELP,
  SHELL_CLASSES,
  VERDICTS,
  type ShellClass,
  type Verdict,
} from '@/modules/backoffice/prediagnostico/validatePrediagnostico';
import { ChevronDown, CircleDot, ClipboardList } from 'lucide-react';
import { usePrediagnosticoForm } from './usePrediagnosticoForm';

const VERDICT_LABEL: Record<Verdict, string> = {
  reacondicionado: 'Reacondicionado',
  reparado: 'Reparado',
  irreparable: 'Irreparable',
};

type Props = {
  serviceOrderIds: string[];
  osLabels: string[];
  techId: string;
  brandId: string;
  techName: string;
  modelName: string;
  onClose: () => void;
  onSaved: () => void;
};

function OutlineChoice<T extends string>({
  value,
  options,
  disabled,
  onChange,
  compact,
}: {
  value: string;
  options: { id: T; label: string }[];
  disabled: boolean;
  onChange: (next: T) => void;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group">
      {options.map((option) => {
        const active = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(option.id)}
            className={`rounded-lg border text-sm transition-colors disabled:opacity-50 ${
              compact ? 'h-9 min-w-9 px-2' : 'h-9 px-3'
            } ${
              active
                ? 'border-[var(--heading)] bg-[var(--heading)] text-white'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:border-[var(--heading)]'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function CheckRow<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: T; label: string }[];
  disabled: boolean;
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-sm text-[var(--foreground)]">{label}</span>
      <OutlineChoice value={value} options={options} disabled={disabled} onChange={onChange} />
    </div>
  );
}

function SectionTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--foreground)]">
      <span className="text-[var(--muted)]">{icon}</span>
      {children}
    </div>
  );
}

export function PrediagnosticoPanel({
  serviceOrderIds,
  osLabels,
  techId,
  brandId,
  techName,
  modelName,
  onClose,
  onSaved,
}: Props) {
  const { form, setForm, items, canEdit, loading, saving, errors, savedLabel, save } =
    usePrediagnosticoForm(serviceOrderIds, techId, brandId, serviceOrderIds.length > 0);
  const cosmetics = items.filter((item) => item.kind === 'cosmetico');
  const functions = items.filter((item) => item.kind === 'funcionamiento');
  const classHelp = form.shellClass ? SHELL_CLASS_HELP[form.shellClass] : '';
  const count = serviceOrderIds.length;
  const preview = osLabels.slice(0, 6).join(', ');
  const extra = osLabels.length > 6 ? ` +${osLabels.length - 6}` : '';

  return (
    <div className="space-y-5 bg-[var(--surface)] p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-[var(--foreground)]">
          <span className="font-medium">{count === 1 ? '1 orden' : `${count} órdenes`}</span>
          <span className="text-[var(--muted)]">
            {' '}
            · {techName || 'Tecnología'} · {modelName || 'Modelo'}
          </span>
        </p>
        <p className="text-xs text-[var(--muted)]">
          {preview}
          {extra}
          {savedLabel ? ` · ${savedLabel}` : ''}
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Cargando prediagnóstico…</p>
      ) : (
        <>
          {!canEdit ? (
            <p className="text-sm text-[var(--muted)]">Solo lectura. Crear o editar corresponde a backoffice/CAC.</p>
          ) : null}

          <section>
            <SectionTitle icon={<CircleDot size={14} />}>Clasificación de carcasa</SectionTitle>
            <OutlineChoice
              compact
              value={form.shellClass || ''}
              disabled={!canEdit}
              options={SHELL_CLASSES.map((id) => ({ id, label: id }))}
              onChange={(shellClass: ShellClass) => setForm((prev) => ({ ...prev, shellClass }))}
            />
            <p className="mt-2 text-sm text-[var(--muted)]">Selecciona la clase de la carcasa</p>
            {classHelp ? <p className="text-sm text-[var(--foreground)]">{classHelp}</p> : null}
          </section>

          {cosmetics.length > 0 || functions.length > 0 ? (
            <div className="grid gap-8 md:grid-cols-2">
              <section>
                <SectionTitle icon={<CircleDot size={14} />}>Otros detalles cosméticos</SectionTitle>
                {cosmetics.map((item) => (
                  <CheckRow
                    key={item.id}
                    label={item.name}
                    value={form.cosmetics[item.id] || ''}
                    disabled={!canEdit}
                    options={[
                      { id: 'bien', label: 'Bien' },
                      { id: 'danado', label: 'Dañado' },
                    ]}
                    onChange={(next) =>
                      setForm((prev) => ({ ...prev, cosmetics: { ...prev.cosmetics, [item.id]: next } }))
                    }
                  />
                ))}
              </section>
              <section>
                <SectionTitle icon={<ChevronDown size={14} />}>Funcionamiento</SectionTitle>
                {functions.map((item) => (
                  <CheckRow
                    key={item.id}
                    label={item.name}
                    value={form.functionChecks[item.id] || ''}
                    disabled={!canEdit}
                    options={[
                      { id: 'si', label: 'Sí' },
                      { id: 'no', label: 'No' },
                      { id: 'na', label: 'N/A' },
                    ]}
                    onChange={(next) =>
                      setForm((prev) => ({
                        ...prev,
                        functionChecks: { ...prev.functionChecks, [item.id]: next },
                      }))
                    }
                  />
                ))}
              </section>
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">
              No hay ítems para esta tecnología y marca. Configúrelos en Configuración → Pre-Diagnóstico.
            </p>
          )}

          <section>
            <SectionTitle icon={<ClipboardList size={14} />}>Dictamen final</SectionTitle>
            <OutlineChoice
              value={form.verdict || ''}
              disabled={!canEdit}
              options={VERDICTS.map((id) => ({ id, label: VERDICT_LABEL[id] }))}
              onChange={(verdict: Verdict) => setForm((prev) => ({ ...prev, verdict }))}
            />
          </section>

          <label className="block space-y-1.5">
            <span className="text-sm text-[var(--muted)]">Observaciones</span>
            <textarea
              value={form.notes}
              disabled={!canEdit}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              rows={2}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--heading)]"
            />
          </label>

          {errors.length > 0 ? (
            <ul className="space-y-0.5 text-sm text-rose-600 dark:text-rose-300">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cerrar
            </Button>
            {canEdit ? (
              <Button
                type="button"
                size="sm"
                disabled={saving}
                onClick={() => {
                  void save().then((ok) => {
                    if (ok) onSaved();
                  });
                }}
              >
                {saving ? 'Guardando…' : count === 1 ? 'Guardar prediagnóstico' : `Guardar en ${count} órdenes`}
              </Button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
