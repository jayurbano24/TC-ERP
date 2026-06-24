import type {
  DispatchAccessoryOutParams,
  DispatchAccessoryOutResult,
} from '../types/accessory-dispatch.types';

export interface IAccessoryDispatchGateway {
  dispatchOut(params: DispatchAccessoryOutParams): Promise<DispatchAccessoryOutResult>;
}
