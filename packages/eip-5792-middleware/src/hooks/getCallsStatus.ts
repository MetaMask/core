import { JsonRpcError } from '@metamask/rpc-errors';
import type {
  Log,
  TransactionError,
  TransactionMeta,
  TransactionReceipt,
} from '@metamask/transaction-controller';
import { TransactionStatus } from '@metamask/transaction-controller';
import type { Hex, Json } from '@metamask/utils';

import { EIP5792ErrorCode, GetCallsStatusCode, VERSION } from '../constants';
import type { EIP5792Messenger, GetCallsStatusResult } from '../types';

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
  const { chainId, txReceipt: rawTxReceipt, error } = transaction;
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

  // Extract error information when status is REVERTED (500)
  const errorInfo =
    status === GetCallsStatusCode.REVERTED
      ? extractErrorInfo(transaction, txReceipt)
      : undefined;

  return {
    version: VERSION,
    id,
    chainId,
    atomic: true, // Always atomic as we currently only support EIP-7702 batches
    status,
    receipts,
    ...(errorInfo && { error: errorInfo }),
  };
}

/**
 * Extracts error information from a transaction when it has reverted.
 *
 * @param transactionMeta - The transaction metadata containing error information.
 * @param txReceipt - The transaction receipt, if available.
 * @returns Error information object with at least a message.
 */
function extractErrorInfo(
  transactionMeta: TransactionMeta,
  txReceipt: Required<TransactionReceipt> | undefined,
): GetCallsStatusResult['error'] {
  const { error } = transactionMeta;

  // Determine the error message
  let message: string;
  if (error?.message) {
    message = error.message;
  } else if (txReceipt?.status === '0x0') {
    message = 'Transaction reverted';
  } else {
    // Default message for dropped transactions or other revert scenarios
    message = 'Transaction reverted';
  }

  // Build error info with at least the message
  const errorInfo: GetCallsStatusResult['error'] = {
    message,
  };

  // Add optional error fields if available
  if (error?.code) {
    errorInfo.code = error.code;
  }

  if (error?.name) {
    errorInfo.name = error.name;
  }

  // Include RPC error details if available and is JSON-compatible
  if (error?.rpc) {
    try {
      // Ensure rpc is JSON-serializable
      JSON.stringify(error.rpc);
      errorInfo.rpc = error.rpc as Json;
    } catch {
      // If rpc is not JSON-serializable, skip it
    }
  }

  return errorInfo;
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
