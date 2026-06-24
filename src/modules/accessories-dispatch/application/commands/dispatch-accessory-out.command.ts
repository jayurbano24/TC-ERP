import type { DispatchAccessoryOutParams } from '../../domain/types/accessory-dispatch.types';

export class DispatchAccessoryOutCommand {
  constructor(readonly params: DispatchAccessoryOutParams) {}
}
