import { JsonRpcError } from '@metamask/rpc-errors';
import type {
  Log,
  TransactionMeta,
  TransactionReceipt,
} from '@metamask/transaction-controller';
import { TransactionStatus } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { EIP5792ErrorCode, VERSION } from '../constants';
import { GetCallsStatusCode } from '../methods/wallet-get-calls-status';
import type { GetCallsStatusResult } from '../methods/wallet-get-calls-status';
import type { EIP5792Messenger } from '../types';

/**
 * Retrieves the status of a transaction batch by its ID.
 *
 * @param messenger - Messenger instance for controller communication.
 * @param id - The batch ID to look up (hexadecimal string).
 * @returns GetCallsStatusResult containing the batch status, receipts, and metadata.
 * @throws JsonRpcError with EIP5792ErrorCode.UnknownBundleId if no matching bundle is found.
 */
export function getCallsStatus(
  messenger: EIP5792Messenger,
  id: Hex,
): GetCallsStatusResult {
  const transactions = messenger
    .call('TransactionController:getState')
    .transactions.filter((tx) => tx.batchId === id);

  if (!transactions?.length) {
    throw new JsonRpcError(
      EIP5792ErrorCode.UnknownBundleId,
      `No matching bundle found`,
    );
  }

  const transaction = transactions[0];
  const { chainId, txReceipt: rawTxReceipt } = transaction;
  const status = getStatusCode(transaction);
  const txReceipt = rawTxReceipt as Required<TransactionReceipt> | undefined;
  const logs = (txReceipt?.logs ?? []) as Required<Log>[];

  const receipts: GetCallsStatusResult['receipts'] = txReceipt && [
    {
      blockHash: txReceipt.blockHash as Hex,
      blockNumber: txReceipt.blockNumber as Hex,
      gasUsed: txReceipt.gasUsed as Hex,
      logs: logs.map((log: Required<Log> & { data: Hex }) => ({
        address: log.address as Hex,
        data: log.data,
        topics: log.topics as unknown as Hex[],
      })),
      status: txReceipt.status as '0x0' | '0x1',
      transactionHash: txReceipt.transactionHash,
    },
  ];

  return {
    version: VERSION,
    id,
    chainId,
    atomic: true, // Always atomic as we currently only support EIP-7702 batches
    status,
    receipts,
  };
}

/**
 * Maps transaction status to EIP-5792 call status codes.
 *
 * @param transactionMeta - The transaction metadata containing status and hash information.
 * @returns GetCallsStatusCode representing the current status of the transaction.
 */
function getStatusCode(transactionMeta: TransactionMeta) {
  const { hash, status } = transactionMeta;

  if (status === TransactionStatus.confirmed) {
    return GetCallsStatusCode.CONFIRMED;
  }

  if (status === TransactionStatus.failed) {
    return hash
      ? GetCallsStatusCode.REVERTED
      : GetCallsStatusCode.FAILED_OFFCHAIN;
  }

  if (status === TransactionStatus.dropped) {
    return GetCallsStatusCode.REVERTED;
  }

  return GetCallsStatusCode.PENDING;
}
