import { rpcErrors } from '@metamask/rpc-errors';
import type { Infer } from '@metamask/superstruct';
import {
  nonempty,
  optional,
  mask,
  string,
  array,
  object,
  tuple,
} from '@metamask/superstruct';
import type {
  Json,
  JsonRpcRequest,
  PendingJsonRpcResponse,
} from '@metamask/utils';
import { HexChecksumAddressStruct, StrictHexStruct } from '@metamask/utils';

import { validateParams } from '../utils/validation';

const GetCallsStatusStruct = tuple([nonempty(string())]);

const GetCallsStatusReceiptStruct = object({
  logs: optional(
    array(
      object({
        address: optional(HexChecksumAddressStruct),
        data: optional(StrictHexStruct),
        topics: optional(array(StrictHexStruct)),
      }),
    ),
  ),
  status: optional(StrictHexStruct),
  chainId: optional(StrictHexStruct),
  blockHash: optional(StrictHexStruct),
  blockNumber: optional(StrictHexStruct),
  gasUsed: optional(StrictHexStruct),
  transactionHash: optional(StrictHexStruct),
});

export type GetCallsStatusParams = Infer<typeof GetCallsStatusStruct>;
export type GetCallsStatusReceipt = Infer<typeof GetCallsStatusReceiptStruct>;

export type GetCallsStatusResult = {
  status: 'PENDING' | 'CONFIRMED';
  receipts?: GetCallsStatusReceipt[];
};

export type GetTransactionReceiptsByBatchIdHook = (
  batchId: string,
  req: JsonRpcRequest,
) => Promise<GetCallsStatusReceipt[]>;

export async function walletGetCallsStatus(
  req: JsonRpcRequest,
  res: PendingJsonRpcResponse<Json>,
  {
    getTransactionReceiptsByBatchId,
  }: {
    getTransactionReceiptsByBatchId?: GetTransactionReceiptsByBatchIdHook;
  },
): Promise<void> {
  if (!getTransactionReceiptsByBatchId) {
    throw rpcErrors.methodNotSupported();
  }

  validateParams(req.params, GetCallsStatusStruct);

  const batchId = req.params[0];
  const rawReceipts = await getTransactionReceiptsByBatchId(batchId, req);

  if (!rawReceipts.length) {
    res.result = null;
    return;
  }

  const isComplete = rawReceipts.every((receipt) => Boolean(receipt));
  const status = isComplete ? 'CONFIRMED' : 'PENDING';

  const receipts = isComplete
    ? rawReceipts.map((receipt) => mask(receipt, GetCallsStatusReceiptStruct))
    : null;

  res.result = { status, receipts };
}
