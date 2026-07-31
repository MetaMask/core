import type { TransactionDescription } from '@ethersproject/abi';

import { TransactionType } from '../types.js';
import type { TransactionMeta } from '../types.js';
import { decodeTransactionData } from './transaction-type.js';

const TOKEN_TRANSFER_TYPES = [
  TransactionType.tokenMethodTransfer,
  TransactionType.tokenMethodTransferFrom,
  TransactionType.tokenMethodSafeTransferFrom,
];

/**
 * Returns the effective recipient of a transaction.
 * For ERC-20/ERC-721/ERC-1155 token transfer methods, the recipient is decoded
 * from the calldata since `txParams.to` is the token contract rather than the
 * address receiving the tokens. For all other transaction types, `txParams.to`
 * is returned as-is.
 *
 * @param transactionMeta - Transaction meta with txParams and type.
 * @returns Effective recipient address, or undefined.
 */
export function getEffectiveRecipient(
  transactionMeta: TransactionMeta,
): string | undefined {
  const { data, to } = transactionMeta?.txParams ?? {};
  if (
    data &&
    TOKEN_TRANSFER_TYPES.includes(transactionMeta?.type as TransactionType)
  ) {
    const parsed = decodeTransactionData(data) as TransactionDescription;
    return (parsed?.args?._to ?? parsed?.args?.to ?? to) as string | undefined;
  }
  return to;
}
