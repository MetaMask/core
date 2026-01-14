import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine/v2';
import { rpcErrors } from '@metamask/rpc-errors';
import type { Infer } from '@metamask/superstruct';
import {
  array,
  boolean,
  object,
  optional,
  record,
  string,
  unknown,
} from '@metamask/superstruct';
import { HexChecksumAddressStruct, StrictHexStruct } from '@metamask/utils';
import type { Hex, Json, JsonRpcRequest } from '@metamask/utils';

import { validateParams } from '../utils/validation';
import type { WalletMiddlewareContext } from '../wallet';

const PermissionStruct = object({
  type: string(),
  isAdjustmentAllowed: boolean(),
  data: record(string(), unknown()),
});

const RuleStruct = object({
  type: string(),
  data: record(string(), unknown()),
});

const PermissionRequestStruct = object({
  chainId: StrictHexStruct,
  from: optional(HexChecksumAddressStruct),
  to: HexChecksumAddressStruct,
  permission: PermissionStruct,
  rules: optional(array(RuleStruct)),
});

export const RequestExecutionPermissionsStruct = array(PermissionRequestStruct);

// RequestExecutionPermissions API types
export type RequestExecutionPermissionsRequestParams = Infer<
  typeof RequestExecutionPermissionsStruct
>;

export type PermissionDependency = {
  factory: Hex;
  factoryData: Hex;
};

export type RequestExecutionPermissionsResult = Json &
  (Infer<typeof PermissionRequestStruct> & {
    context: Hex;
    dependencies: PermissionDependency[];
    delegationManager: Hex;
  })[];

export type ProcessRequestExecutionPermissionsHook = (
  request: RequestExecutionPermissionsRequestParams,
  req: JsonRpcRequest,
  context: WalletMiddlewareContext,
) => Promise<RequestExecutionPermissionsResult>;

/**
 * Creates a handler for the `wallet_requestExecutionPermissions` JSON-RPC method.
 *
 * @param options - The options for the handler.
 * @param options.processRequestExecutionPermissions - The function to process the
 * request execution permissions request.
 * @returns A JSON-RPC middleware function that handles the
 * `wallet_requestExecutionPermissions` JSON-RPC method.
 */
export function createWalletRequestExecutionPermissionsHandler({
  processRequestExecutionPermissions,
}: {
  processRequestExecutionPermissions?: ProcessRequestExecutionPermissionsHook;
}): JsonRpcMiddleware<JsonRpcRequest, Json, WalletMiddlewareContext> {
  return async ({ request, context }) => {
    if (!processRequestExecutionPermissions) {
      throw rpcErrors.methodNotSupported(
        'wallet_requestExecutionPermissions - no middleware configured',
      );
    }

    const { params } = request;

    validateParams(params, RequestExecutionPermissionsStruct);

    return await processRequestExecutionPermissions(params, request, context);
  };
}
