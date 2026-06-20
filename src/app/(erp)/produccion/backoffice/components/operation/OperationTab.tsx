'use client';

import type { OperationContext } from '../../operation/operationContext';
import { AccessoryPhotosStep } from './AccessoryPhotosStep';
import { ClassificationStep } from './ClassificationStep';
import { CompletedStep } from './CompletedStep';
import { ConfigStep } from './ConfigStep';
import { InboxStep } from './InboxStep';
import { ReturnConfirmationStep } from './ReturnConfirmationStep';
import { SubBodegaTransferStep } from './SubBodegaTransferStep';

type Props = { ctx: OperationContext };

export function OperationTab({ ctx }: Props) {
  const { receptionStep } = ctx;

  return (
    <div className="max-w-none mx-auto animate-rise-in">
      {receptionStep === 'category_selection' && <InboxStep ctx={ctx} />}
      {receptionStep === 'classification' && ctx.activeReception && <ClassificationStep ctx={ctx} />}
      {receptionStep === 'config' && ctx.activeReception && <ConfigStep ctx={ctx} />}
      {receptionStep === 'accessories_photos' && <AccessoryPhotosStep ctx={ctx} />}
      {receptionStep === 'return_confirmation' && <ReturnConfirmationStep ctx={ctx} />}
      {receptionStep === 'sub_bodega_transfer' && <SubBodegaTransferStep ctx={ctx} />}
      {receptionStep === 'completed' && <CompletedStep ctx={ctx} />}
    </div>
  );
}
