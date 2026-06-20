'use client';

import React from 'react';
import type { OperationContext } from '../../operation/operationContext';
import { ConfigAgencyHeader } from './ConfigAgencyHeader';
import { ConfigEquipmentPanel } from './ConfigEquipmentPanel';
import { ConfigManifestPanel } from './ConfigManifestPanel';

type Props = { ctx: OperationContext };

export function ConfigStep({ ctx }: Props) {
  const { manifestPanelOpen } = ctx;

  return (
    <div className="space-y-6 animate-rise-in max-w-none mx-auto pb-20">
      <ConfigAgencyHeader ctx={ctx} />
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start relative">
        <ConfigEquipmentPanel ctx={ctx} />
        {manifestPanelOpen && <ConfigManifestPanel ctx={ctx} />}
      </div>
    </div>
  );
}
