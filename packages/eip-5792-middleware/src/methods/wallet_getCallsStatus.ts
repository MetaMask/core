import { rpcErrors } from '@metamask/rpc-errors';
import type { JsonRpcRequest, PendingJsonRpcResponse } from '@metamask/utils';

import { GetCallsStatusStruct } from '../constants';
import type { GetCallsStatusHook } from '../types';
import { validateParams } from '../utils';

/**
 *
 * @param req a
 * @param res a
 * @param param2 s
 * @param param2.getCallsStatus a
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
