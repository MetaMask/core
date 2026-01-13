import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine/v2';
import { rpcErrors } from '@metamask/rpc-errors';
import type { Infer } from '@metamask/superstruct';
import {
  array,
  boolean,
  object,
  record,
  string,
  unknown,
} from '@metamask/superstruct';
import { StrictHexStruct } from '@metamask/utils';
import type { Json, JsonRpcRequest } from '@metamask/utils';

import { validateParams } from '../utils/validation';
import type { WalletMiddlewareContext } from '../wallet';

/**
 * Superstruct schema for the `wallet_getGrantedExecutionPermissions` request params.
 * This method expects no parameters.
 */
export const GetGrantedExecutionPermissionsParamsStruct = object({});

const DependencyStruct = object({
  factory: StrictHexStruct,
  factoryData: StrictHexStruct,
});

const PermissionStruct = object({
  type: string(),
  isAdjustmentAllowed: boolean(),
  data: record(string(), unknown()),
});

/**
 * Superstruct schema for a single granted execution permission.
 */
export const GrantedExecutionPermissionStruct = object({
  chainId: StrictHexStruct,
  from: StrictHexStruct,
  to: StrictHexStruct,
  permission: PermissionStruct,
  context: StrictHexStruct,
  dependencies: array(DependencyStruct),
  delegationManager: StrictHexStruct,
});

/**
 * Represents a single granted execution permission.
 */
export type GrantedExecutionPermission = Infer<
  typeof GrantedExecutionPermissionStruct
>;

/**
 * Superstruct schema for the `wallet_getGrantedExecutionPermissions` result.
 */
export const GetGrantedExecutionPermissionsResultStruct = array(
  GrantedExecutionPermissionStruct,
);

/**
 * Result type for the `wallet_getGrantedExecutionPermissions` JSON-RPC method.
 * Returns an array of all granted permissions that are not yet revoked.
 */
export type GetGrantedExecutionPermissionsResult = Json &
  Infer<typeof GetGrantedExecutionPermissionsResultStruct>;

/**
 * Hook type for processing the `wallet_getGrantedExecutionPermissions` request.
 */
export type ProcessGetGrantedExecutionPermissionsHook = (
  req: JsonRpcRequest,
  context: WalletMiddlewareContext,
) => Promise<GetGrantedExecutionPermissionsResult>;

/**
 * Creates a handler for the `wallet_getGrantedExecutionPermissions` JSON-RPC method.
 *
 * @param options - The options for the handler.
 * @param options.processGetGrantedExecutionPermissions - The function to process the
 * get granted execution permissions request.
 * @returns A JSON-RPC middleware function that handles the
 * `wallet_getGrantedExecutionPermissions` JSON-RPC method.
 */
export function createWalletGetGrantedExecutionPermissionsHandler({
  processGetGrantedExecutionPermissions,
}: {
  processGetGrantedExecutionPermissions?: ProcessGetGrantedExecutionPermissionsHook;
}): JsonRpcMiddleware<JsonRpcRequest, Json, WalletMiddlewareContext> {
  return async ({ request, context }) => {
    if (!processGetGrantedExecutionPermissions) {
      throw rpcErrors.methodNotSupported(
        'wallet_getGrantedExecutionPermissions - no middleware configured',
      );
    }

    const { params } = request;

    validateParams(params, GetGrantedExecutionPermissionsParamsStruct);

    return await processGetGrantedExecutionPermissions(request, context);
  };
}
