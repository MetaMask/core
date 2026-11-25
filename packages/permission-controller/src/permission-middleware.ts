import { createAsyncMiddleware } from '@metamask/json-rpc-engine';
import type {
  AsyncJsonrpcMiddleware,
  JsonRpcMiddleware,
} from '@metamask/json-rpc-engine';
import type { JsonRpcMiddleware as JsonRpcMiddlewareV2 } from '@metamask/json-rpc-engine/v2';
import type { Messenger } from '@metamask/messenger';
import type { Json } from '@metamask/utils';

import { unauthorized } from './errors.js';
import type { RestrictedMethodParameters } from './Permission.js';
import type {
  PermissionControllerExecuteRestrictedMethodAction,
  PermissionControllerGetEndowmentsRpcMethodsAction,
  PermissionControllerHasUnrestrictedMethodAction,
  PermissionControllerIsEndowmentRpcMethodAction,
} from './PermissionController-method-action-types.js';

/**
 * The set of messenger actions required by the permission middleware.
 */
export type PermissionMiddlewareActions =
  | PermissionControllerExecuteRestrictedMethodAction
  | PermissionControllerHasUnrestrictedMethodAction
  | PermissionControllerGetEndowmentsRpcMethodsAction
  | PermissionControllerIsEndowmentRpcMethodAction;

export type CreatePermissionMiddlewareOptions = {
  messenger: Messenger<string, PermissionMiddlewareActions>;
  origin: string;
};

/**
 * Checks whether a method is an endowment RPC method, and if so, whether the
 * origin is allowed to call it.
 *
 * @param options - Options bag.
 * @param options.origin - The origin of the subject making the request.
 * @param options.method - The requested JSON-RPC method.
 * @param options.messenger - A messenger with the endowment-related actions.
 * @returns True if the method is an RPC method gated by an endowment and permitted for the
 * origin. False if the RPC method is not gated by an endowment.
 * @throws If the method is an RPC method gated by an endowment that the origin has not
 * been granted.
 */
function isHandledEndowmentRpcMethod({
  origin,
  method,
  messenger,
}: {
  origin: string;
  method: string;
  messenger: CreatePermissionMiddlewareOptions['messenger'];
}): boolean {
  const isEndowmentRpcMethod = messenger.call(
    'PermissionController:isEndowmentRpcMethod',
    method,
  );

  if (!isEndowmentRpcMethod) {
    return false;
  }

  const endowmentRpcMethods = messenger.call(
    'PermissionController:getEndowmentsRpcMethods',
    origin,
  );

  if (endowmentRpcMethods.includes(method)) {
    return true;
  }

  throw unauthorized({ data: { origin, method } });
}

/**
 * Creates a JSON-RPC middleware that enforces permissions for a single subject.
 *
 * The middleware passes through  methods gated by endowments, unrestricted methods,
 * and otherwise dispatches restricted methods to the `PermissionController` via messenger actions.
 * If the subject lacks the required permission, or if the method does not exist,
 * the corresponding error is propagated to the JSON-RPC response.
 *
 * @deprecated Use {@link createPermissionMiddlewareV2} with `JsonRpcEngineV2`.
 * @param options - Options bag.
 * @param options.messenger - A messenger with the required actions.
 * @param options.origin - The origin of the subject for which to create the middleware.
 * @returns A `json-rpc-engine` middleware.
 */
export function createPermissionMiddleware({
  messenger,
  origin,
}: CreatePermissionMiddlewareOptions): JsonRpcMiddleware<
  RestrictedMethodParameters,
  Json
> {
  const permissionsMiddleware: AsyncJsonrpcMiddleware<
    RestrictedMethodParameters,
    Json
  > = async (request, response, next) => {
    const { method, params } = request;

    if (messenger.call('PermissionController:hasUnrestrictedMethod', method)) {
      return next();
    }

    if (isHandledEndowmentRpcMethod({ origin, method, messenger })) {
      return next();
    }

    response.result = await messenger.call(
      'PermissionController:executeRestrictedMethod',
      origin,
      method,
      params,
    );
    return;
  };

  return createAsyncMiddleware<RestrictedMethodParameters, Json>(
    permissionsMiddleware,
  );
}

/**
 * Creates a `JsonRpcEngineV2` middleware that enforces permissions for a
 * single subject.
 *
 * The middleware passes through methods gated by endowments, unrestricted methods,
 * and otherwise dispatches restricted methods to the `PermissionController` via messenger actions.
 * If the subject lacks the required permission, or if the method does not exist,
 * the corresponding error is thrown.
 *
 * @param options - Options bag.
 * @param options.messenger - A messenger with the required actions.
 * @param options.origin - The origin of the subject for which to create the middleware.
 * @returns A `JsonRpcEngineV2` middleware.
 */
export function createPermissionMiddlewareV2({
  messenger,
  origin,
}: CreatePermissionMiddlewareOptions): JsonRpcMiddlewareV2 {
  return async ({ request, next }) => {
    const { method, params } = request;

    if (messenger.call('PermissionController:hasUnrestrictedMethod', method)) {
      return next();
    }

    if (isHandledEndowmentRpcMethod({ origin, method, messenger })) {
      return next();
    }

    return messenger.call(
      'PermissionController:executeRestrictedMethod',
      origin,
      method,
      params,
    );
  };
}
