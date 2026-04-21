import { createAsyncMiddleware } from '@metamask/json-rpc-engine';
import type {
  AsyncJsonRpcEngineNextCallback,
  JsonRpcMiddleware,
} from '@metamask/json-rpc-engine';
import type { JsonRpcMiddleware as JsonRpcMiddlewareV2 } from '@metamask/json-rpc-engine/v2';
import type { Messenger } from '@metamask/messenger';
import type {
  Json,
  JsonRpcRequest,
  PendingJsonRpcResponse,
} from '@metamask/utils';

import type { RestrictedMethodParameters } from './Permission';
import type { PermissionSubjectMetadata } from './PermissionController';
import type {
  PermissionControllerExecuteRestrictedMethodAction,
  PermissionControllerHasUnrestrictedMethodAction,
} from './PermissionController-method-action-types';

/**
 * The set of messenger actions required by the permission middleware.
 */
export type PermissionMiddlewareActions =
  | PermissionControllerExecuteRestrictedMethodAction
  | PermissionControllerHasUnrestrictedMethodAction;

type CreatePermissionMiddlewareOptions = {
  messenger: Messenger<string, PermissionMiddlewareActions>;
  subject: PermissionSubjectMetadata;
};

/**
 * Creates a JSON-RPC middleware that enforces permissions for a single subject.
 *
 * The middleware passes through unrestricted methods, and otherwise dispatches
 * restricted methods to the `PermissionController` via messenger actions. If
 * the subject lacks the required permission, or if the method does not exist,
 * the corresponding error is propagated to the JSON-RPC response.
 *
 * @deprecated Use {@link createPermissionMiddlewareV2} with `JsonRpcEngineV2`.
 * @param options - Options bag.
 * @param options.messenger - A messenger with the
 * `PermissionController:executeRestrictedMethod` and
 * `PermissionController:hasUnrestrictedMethod` actions.
 * @param options.subject - The subject for which to create the middleware.
 * @returns A `json-rpc-engine` middleware.
 */
export function createPermissionMiddleware({
  messenger,
  subject,
}: CreatePermissionMiddlewareOptions): JsonRpcMiddleware<
  RestrictedMethodParameters,
  Json
> {
  const origin = validateOrigin(subject);

  const permissionsMiddleware = async (
    req: JsonRpcRequest<RestrictedMethodParameters>,
    res: PendingJsonRpcResponse,
    next: AsyncJsonRpcEngineNextCallback,
  ): Promise<void> => {
    const { method, params } = req;

    if (messenger.call('PermissionController:hasUnrestrictedMethod', method)) {
      return next();
    }

    res.result = await messenger.call(
      'PermissionController:executeRestrictedMethod',
      origin,
      method,
      params,
    );
    return undefined;
  };

  return createAsyncMiddleware(permissionsMiddleware);
}

/**
 * Creates a `JsonRpcEngineV2` middleware that enforces permissions for a
 * single subject.
 *
 * The middleware passes through unrestricted methods, and otherwise dispatches
 * restricted methods to the `PermissionController` via messenger actions. If
 * the subject lacks the required permission, or if the method does not exist,
 * the corresponding error is thrown.
 *
 * @param options - Options bag.
 * @param options.messenger - A messenger with the
 * `PermissionController:executeRestrictedMethod` and
 * `PermissionController:hasUnrestrictedMethod` actions.
 * @param options.subject - The subject for which to create the middleware.
 * @returns A `JsonRpcEngineV2` middleware.
 */
export function createPermissionMiddlewareV2({
  messenger,
  subject,
}: CreatePermissionMiddlewareOptions): JsonRpcMiddlewareV2 {
  const origin = validateOrigin(subject);

  return async ({ request, next }) => {
    const { method, params } = request;

    if (messenger.call('PermissionController:hasUnrestrictedMethod', method)) {
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

/**
 * Validates that the subject has a non-empty origin.
 *
 * @param subject - The subject to validate.
 * @returns The subject's origin.
 */
function validateOrigin(subject: PermissionSubjectMetadata): string {
  const { origin } = subject;
  if (typeof origin !== 'string' || !origin) {
    throw new Error('The subject "origin" must be a non-empty string.');
  }
  return origin;
}
