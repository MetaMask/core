import type {
  JsonRpcEngineEndCallback,
  JsonRpcEngineNextCallback,
} from '@metamask/json-rpc-engine';
import type {
  Json,
  JsonRpcParams,
  JsonRpcRequest,
  PendingJsonRpcResponse,
} from '@metamask/utils';

import type {
  CaveatSpecificationConstraint,
  CaveatSpecificationMap,
} from './Caveat';
import type {
  PermissionSpecificationConstraint,
  PermissionSpecificationMap,
} from './Permission';

export enum MethodNames {
  requestPermissions = 'wallet_requestPermissions',
  getPermissions = 'wallet_getPermissions',
  revokePermissions = 'wallet_revokePermissions',
}

/**
 * Utility type for extracting a union of all individual caveat or permission
 * specification types from a {@link CaveatSpecificationMap} or
 * {@link PermissionSpecificationMap}.
 *
 * @template SpecificationsMap - The caveat or permission specifications map
 * whose specification type union to extract.
 */
export type ExtractSpecifications<
  SpecificationsMap extends
    | CaveatSpecificationMap<CaveatSpecificationConstraint>
    | PermissionSpecificationMap<PermissionSpecificationConstraint>,
> = SpecificationsMap[keyof SpecificationsMap];

/**
 * A middleware function for handling a permitted method.
 */
export type HandlerMiddlewareFunction<
  T,
  U extends JsonRpcParams,
  V extends Json,
> = (
  req: JsonRpcRequest<U>,
  res: PendingJsonRpcResponse<V>,
  next: JsonRpcEngineNextCallback,
  end: JsonRpcEngineEndCallback,
  hooks: T,
) => void | Promise<void>;

/**
 * We use a mapped object type in order to create a type that requires the
 * presence of the names of all hooks for the given handler.
 * This can then be used to select only the necessary hooks whenever a method
 * is called for purposes of POLA.
 */
export type HookNames<T> = {
  [Property in keyof T]: true;
};

/**
 * A handler for a permitted method.
 */
export type PermittedHandlerExport<
  T,
  U extends JsonRpcParams,
  V extends Json,
> = {
  implementation: HandlerMiddlewareFunction<T, U, V>;
  hookNames: HookNames<T>;
  methodNames: string[];
};
