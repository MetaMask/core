import { rpcErrors } from '@metamask/rpc-errors';
import type { JsonRpcRequest, PendingJsonRpcResponse } from '@metamask/utils';

import { SendCallsStruct } from '../types';
import type { ProcessSendCallsHook, SendCallsPayload } from '../types';
import { validateAndNormalizeKeyholder, validateParams } from '../utils';

/**
 * The RPC method handler middleware for `wallet_sendCalls`
 *
 * @param req - The JSON RPC request's end callback.
 * @param res - The JSON RPC request's pending response object.
 * @param hooks - The hooks object.
 * @param hooks.getPermittedAccountsForOrigin - Function that retrieves permitted accounts for the requester's origin.
 * @param hooks.processSendCalls - Function that processes a sendCalls request for EIP-5792 transactions.
 */
export async function walletSendCalls(
  req: JsonRpcRequest & { origin: string },
  res: PendingJsonRpcResponse,
  {
    getPermittedAccountsForOrigin,
    processSendCalls,
  }: {
    getPermittedAccountsForOrigin: () => Promise<string[]>;
    processSendCalls?: ProcessSendCallsHook;
  },
): Promise<void> {
  if (!processSendCalls) {
    throw rpcErrors.methodNotSupported();
  }

  validateParams(req.params, SendCallsStruct);

  const params = req.params[0];

  const from = params.from
    ? await validateAndNormalizeKeyholder(params.from, {
        getPermittedAccountsForOrigin,
      })
    : undefined;

  const sendCalls: SendCallsPayload = {
    ...params,
    from,
  };

  res.result = await processSendCalls(sendCalls, req);
}
