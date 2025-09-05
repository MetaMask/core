import { rpcErrors } from '@metamask/rpc-errors';
import type { JsonRpcRequest, PendingJsonRpcResponse } from '@metamask/utils';

import { SendCallsStruct } from '../constants';
import type { ProcessSendCallsHook, SendCallsPayload } from '../types';
import { validateAndNormalizeKeyholder, validateParams } from '../utils';

/**
 *
 * @param req a
 * @param res a
 * @param param2 a
 * @param param2.getAccounts s
 * @param param2.processSendCalls sd
 */
export async function walletSendCalls(
  req: JsonRpcRequest,
  res: PendingJsonRpcResponse,
  {
    getAccounts,
    processSendCalls,
  }: {
    getAccounts: (req: JsonRpcRequest) => Promise<string[]>;
    processSendCalls?: ProcessSendCallsHook;
  },
): Promise<void> {
  if (!processSendCalls) {
    throw rpcErrors.methodNotSupported();
  }

  validateParams(req.params, SendCallsStruct);

  const params = req.params[0];

  const from = params.from
    ? await validateAndNormalizeKeyholder(params.from, req, {
        getAccounts,
      })
    : undefined;

  const sendCalls: SendCallsPayload = {
    ...params,
    from,
  };

  res.result = await processSendCalls(sendCalls, req);
}
