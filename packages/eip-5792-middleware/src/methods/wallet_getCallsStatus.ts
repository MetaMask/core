import { rpcErrors } from '@metamask/rpc-errors';
import type { JsonRpcRequest, PendingJsonRpcResponse } from '@metamask/utils';

import { GetCallsStatusStruct } from '../types';
import type { GetCallsStatusHook } from '../types';
import { validateParams } from '../utils';

/**
 * The RPC method handler middleware for `wallet_getCallStatus`
 *
 * @param req - The JSON RPC request's end callback.
 * @param res - The JSON RPC request's pending response object.
 * @param hooks - The hooks object.
 * @param hooks.getCallsStatus - Function that retrieves the status of a transaction batch by its ID.
 */
export async function walletGetCallsStatus(
  req: JsonRpcRequest,
  res: PendingJsonRpcResponse,
  {
    getCallsStatus,
  }: {
    getCallsStatus?: GetCallsStatusHook;
  },
): Promise<void> {
  if (!getCallsStatus) {
    throw rpcErrors.methodNotSupported();
  }

  validateParams(req.params, GetCallsStatusStruct);

  const id = req.params[0];

  res.result = await getCallsStatus(id, req);
}
