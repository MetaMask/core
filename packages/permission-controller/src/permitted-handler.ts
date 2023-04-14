import {
  Json,
  JsonRpcParams,
  JsonRpcRequest,
  PendingJsonRpcResponse,
} from '@metamask/utils';
import {
  JsonRpcEngineEndCallback,
  JsonRpcEngineNextCallback,
} from '@metamask/json-rpc-engine';

export type HandlerMiddlewareFunction<
  Hooks,
  Params extends JsonRpcParams,
  Response extends Json,
> = (
  req: JsonRpcRequest<Params>,
  res: PendingJsonRpcResponse<Response>,
  next: JsonRpcEngineNextCallback,
  end: JsonRpcEngineEndCallback,
  hooks: Hooks,
) => void | Promise<void>;

type BaseHandlerExport = {
  methodNames: string[];
};

/**
 * We use a mapped object type in order to create a type that requires the
 * presence of the names of all hooks for the given handler.
 * This can then be used to select only the necessary hooks whenever a method
 * is called for purposes of POLA.
 */
export type HookNames<Type> = {
  [Property in keyof Type]: true;
};

export type PermittedHandlerExport<
  Hooks,
  Params extends JsonRpcParams,
  Result extends Json,
> = {
  implementation: HandlerMiddlewareFunction<Hooks, Params, Result>;
  hookNames: HookNames<Hooks>;
} & BaseHandlerExport;
