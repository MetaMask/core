import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine/v2';
import { rpcErrors } from '@metamask/rpc-errors';
import type { Infer } from '@metamask/superstruct';
import {
  array,
  boolean,
  literal,
  object,
  optional,
  record,
  string,
  union,
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
  isAdjustmentAllowed: boolean(),
  data: record(string(), unknown()),
});

const AccountSignerStruct = object({
  type: literal('account'),
  data: object({
    address: HexChecksumAddressStruct,
  }),
});

const PermissionRequestStruct = object({
  chainId: StrictHexStruct,
  address: optional(HexChecksumAddressStruct),
  signer: AccountSignerStruct,
  permission: PermissionStruct,
  rules: optional(union([array(RuleStruct), literal(null)])),
});

export const RequestExecutionPermissionsStruct = array(PermissionRequestStruct);

// RequestExecutionPermissions API types
export type RequestExecutionPermissionsRequestParams = Infer<
  typeof RequestExecutionPermissionsStruct
>;

export type RequestExecutionPermissionsResult = Json &
  (Infer<typeof PermissionRequestStruct> & {
    context: Hex;
  })[];

export type ProcessRequestExecutionPermissionsHook = (
  request: RequestExecutionPermissionsRequestParams,
  req: JsonRpcRequest,
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
  return async ({ request }) => {
    if (!processRequestExecutionPermissions) {
      throw rpcErrors.methodNotSupported(
        'wallet_requestExecutionPermissions - no middleware configured',
      );
    }

    const { params } = request;

    validateParams(params, RequestExecutionPermissionsStruct);

    return await processRequestExecutionPermissions(params, request);
  };
}
