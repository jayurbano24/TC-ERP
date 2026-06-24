import { AccessoryDispatchRpcAdapter } from './infrastructure/rpc/accessory-dispatch.rpc.adapter';
import { DispatchAccessoryOutHandler } from './application/commands/dispatch-accessory-out.handler';
import { DispatchAccessoryOutCommand } from './application/commands/dispatch-accessory-out.command';
import type { DispatchAccessoryOutParams } from './domain/types/accessory-dispatch.types';

const handler = new DispatchAccessoryOutHandler(new AccessoryDispatchRpcAdapter());

export async function dispatchAccessoryOutHex(params: DispatchAccessoryOutParams) {
  return handler.execute(new DispatchAccessoryOutCommand(params));
}
