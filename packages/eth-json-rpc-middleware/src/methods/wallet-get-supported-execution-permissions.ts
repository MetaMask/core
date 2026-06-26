import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine/v2';
import { rpcErrors } from '@metamask/rpc-errors';
import type { Infer } from '@metamask/superstruct';
import { array, object, record, string } from '@metamask/superstruct';
import { StrictHexStruct } from '@metamask/utils';
import type { Json, JsonRpcRequest } from '@metamask/utils';

import { NoParamsStruct } from '../utils/structs';
import { validateParams } from '../utils/validation';
import type { WalletMiddlewareContext } from '../wallet';

/**
 * Superstruct schema for the `wallet_getSupportedExecutionPermissions` request params.
 *
 * This method expects no parameters. Different JSON-RPC clients may send "no params"
 * in different ways (omitted, empty array, or empty object), so we accept all three.
 */
export const GetSupportedExecutionPermissionsParamsStruct = NoParamsStruct;

/**
 * Superstruct schema for a supported permission type configuration.
 */
export const SupportedExecutionPermissionConfigStruct = object({
  chainIds: array(StrictHexStruct),
  ruleTypes: array(string()),
});

/**
 * Represents the supported configuration for a permission type.
 */
export type SupportedExecutionPermissionConfig = Infer<
  typeof SupportedExecutionPermissionConfigStruct
>;

/**
 * Superstruct schema for the `wallet_getSupportedExecutionPermissions` result.
 */
export const GetSupportedExecutionPermissionsResultStruct = record(
  string(),
  SupportedExecutionPermissionConfigStruct,
);

/**
 * Result type for the `wallet_getSupportedExecutionPermissions` JSON-RPC method.
 * Returns an object keyed on supported permission types with their configurations.
 */
export type GetSupportedExecutionPermissionsResult = Json &
  Infer<typeof GetSupportedExecutionPermissionsResultStruct>;

/**
 * Hook type for processing the `wallet_getSupportedExecutionPermissions` request.
 */
export type ProcessGetSupportedExecutionPermissionsHook = (
  req: JsonRpcRequest,
  context: WalletMiddlewareContext,
) => Promise<GetSupportedExecutionPermissionsResult>;

/**
 * Creates a handler for the `wallet_getSupportedExecutionPermissions` JSON-RPC method.
 *
 * @param options - The options for the handler.
 * @param options.processGetSupportedExecutionPermissions - The function to process the
 * get supported execution permissions request.
 * @returns A JSON-RPC middleware function that handles the
 * `wallet_getSupportedExecutionPermissions` JSON-RPC method.
 */
export function createWalletGetSupportedExecutionPermissionsHandler({
  processGetSupportedExecutionPermissions,
}: {
  processGetSupportedExecutionPermissions?: ProcessGetSupportedExecutionPermissionsHook;
}): JsonRpcMiddleware<JsonRpcRequest, Json, WalletMiddlewareContext> {
  return async ({ request, context }) => {
    if (!processGetSupportedExecutionPermissions) {
      throw rpcErrors.methodNotSupported(
        'wallet_getSupportedExecutionPermissions - no middleware configured',
      );
    }

    const { params } = request;

    validateParams(params, GetSupportedExecutionPermissionsParamsStruct);

    return await processGetSupportedExecutionPermissions(request, context);
  };
}
