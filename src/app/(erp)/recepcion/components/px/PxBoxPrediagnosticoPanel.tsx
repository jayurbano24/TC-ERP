'use client';

import { PxEquipmentPrediagnosticoPanel } from './PxEquipmentPrediagnosticoPanel';

export type PxPrediagnosticoBatch = {
  equipmentIds: string[];
  serialLabels: string[];
  techId: string;
  brandId: string;
  modelId: string;
  techName: string;
  modelName: string;
};

type Props = {
  batch: PxPrediagnosticoBatch;
  onClose: () => void;
  onSaved: () => void;
};

export function PxBoxPrediagnosticoPanel({ batch, onClose, onSaved }: Props) {
  if (batch.equipmentIds.length === 0) return null;

  return (
    <div
      id="px-prediagnostico-panel"
      className="mb-4 rounded-2xl border-2 border-[var(--accent)]/30 overflow-hidden shadow-lg"
    >
      <PxEquipmentPrediagnosticoPanel
        equipmentIds={batch.equipmentIds}
        serialLabels={batch.serialLabels}
        techId={batch.techId}
        brandId={batch.brandId}
        modelId={batch.modelId}
        techName={batch.techName}
        modelName={batch.modelName}
        onClose={onClose}
        onSaved={onSaved}
      />
    </div>
  );
}
