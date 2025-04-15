import { rpcErrors } from '@metamask/rpc-errors';
import type { Infer } from '@metamask/superstruct';
import {
  boolean,
  record,
  nonempty,
  type,
  string,
  array,
  object,
  optional,
  tuple,
} from '@metamask/superstruct';
import type {
  Hex,
  Json,
  JsonRpcRequest,
  PendingJsonRpcResponse,
} from '@metamask/utils';
import { HexChecksumAddressStruct, StrictHexStruct } from '@metamask/utils';

import {
  validateAndNormalizeKeyholder,
  validateParams,
} from '../utils/validation';

const CapabilitiesStruct = record(
  string(),
  type({
    optional: optional(boolean()),
  }),
);

const SendCallsStruct = tuple([
  object({
    version: nonempty(string()),
    id: optional(StrictHexStruct),
    from: optional(HexChecksumAddressStruct),
    chainId: StrictHexStruct,
    atomicRequired: boolean(),
    calls: array(
      object({
        to: optional(HexChecksumAddressStruct),
        data: optional(StrictHexStruct),
        value: optional(StrictHexStruct),
        capabilities: optional(CapabilitiesStruct),
      }),
    ),
    capabilities: optional(CapabilitiesStruct),
  }),
]);

export type SendCallsParams = Infer<typeof SendCallsStruct>;
export type SendCalls = SendCallsParams[0];

export type SendCallsResult = {
  id: Hex;
  capabilities?: Record<string, Json>;
};

export type ProcessSendCallsHook = (
  sendCalls: SendCalls,
  req: JsonRpcRequest,
) => Promise<SendCallsResult>;

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

  const from = params.from
    ? await validateAndNormalizeKeyholder(params.from, req, {
        getAccounts,
      })
    : undefined;

  const sendCalls: SendCalls = {
    ...params,
    from,
  };

  res.result = await processSendCalls(sendCalls, req);
}
