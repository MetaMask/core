import { rpcErrors } from '@metamask/rpc-errors';
import type { Infer } from '@metamask/superstruct';
import {
  nonempty,
  type,
  string,
  array,
  object,
  optional,
  tuple,
} from '@metamask/superstruct';
import type {
  Json,
  JsonRpcRequest,
  PendingJsonRpcResponse,
} from '@metamask/utils';
import { HexChecksumAddressStruct, StrictHexStruct } from '@metamask/utils';

import {
  validateAndNormalizeKeyholder,
  validateParams,
} from '../utils/validation';

const SendCallsStruct = tuple([
  object({
    version: nonempty(string()),
    from: HexChecksumAddressStruct,
    chainId: optional(StrictHexStruct),
    calls: array(
      object({
        to: optional(HexChecksumAddressStruct),
        data: optional(StrictHexStruct),
        value: optional(StrictHexStruct),
      }),
    ),
    capabilities: optional(type({})),
  }),
]);

export type SendCallsParams = Infer<typeof SendCallsStruct>;
export type SendCalls = SendCallsParams[0];

export type ProcessSendCallsHook = (
  sendCalls: SendCalls,
  req: JsonRpcRequest,
) => Promise<string>;

export async function walletSendCalls(
  req: JsonRpcRequest,
  res: PendingJsonRpcResponse<Json>,
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

  const from = await validateAndNormalizeKeyholder(params.from, req, {
    getAccounts,
  });

  const sendCalls: SendCalls = {
    ...params,
    from,
  };

  res.result = await processSendCalls(sendCalls, req);
}
