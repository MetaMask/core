import { rpcErrors } from '@metamask/rpc-errors';
import type { Infer } from '@metamask/superstruct';
import { tuple } from '@metamask/superstruct';
import type {
  Hex,
  Json,
  JsonRpcRequest,
  PendingJsonRpcResponse,
} from '@metamask/utils';
import { StrictHexStruct } from '@metamask/utils';

import { validateParams } from '../utils/validation';

const GetCallsStatusStruct = tuple([StrictHexStruct]);

export enum GetCallsStatusCode {
  PENDING = 100,
  CONFIRMED = 200,
  FAILED_OFFCHAIN = 400,
  REVERTED = 500,
  REVERTED_PARTIAL = 600,
}

export type GetCallsStatusParams = Infer<typeof GetCallsStatusStruct>;

export type GetCallsStatusResult = {
  version: string;
  id: Hex;
  chainId: Hex;
  status: number;
  receipts?: {
    logs: {
      address: Hex;
      data: Hex;
      topics: Hex[];
    }[];
    status: '0x0' | '0x1';
    blockHash: Hex;
    blockNumber: Hex;
    gasUsed: Hex;
    transactionHash: Hex;
  }[];
  capabilities?: Record<string, Json>;
};

export type GetCallsStatusHook = (
  id: GetCallsStatusParams[0],
  req: JsonRpcRequest,
) => Promise<GetCallsStatusResult>;

export async function walletGetCallsStatus(
  req: JsonRpcRequest,
  res: PendingJsonRpcResponse<Json>,
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
