import type { TransactionDescription } from '@ethersproject/abi';

import { TransactionType } from '../types.js';
import type { NestedTransactionMetadata, TransactionMeta } from '../types.js';
import { decodeTransactionData } from './transaction-type.js';

const TOKEN_TRANSFER_TYPES = [
  TransactionType.tokenMethodTransfer,
  TransactionType.tokenMethodTransferFrom,
  TransactionType.tokenMethodSafeTransferFrom,
];

type SendRecipientSource = {
  data?: string;
  swapAndSendRecipient?: string;
  to?: string;
  type?: TransactionType;
};

/**
 * Returns the effective recipient of a transaction.
 * For ERC-20/ERC-721/ERC-1155 token transfer methods, the recipient is decoded
 * from the calldata since `txParams.to` is the token contract rather than the
 * address receiving the tokens. For all other transaction types, `txParams.to`
 * is returned as-is.
 *
 * Address poisoning should use {@link getSendRecipients} instead. This helper
 * is for first-time interaction and similar "who are we calling" checks, where
 * the contract `to` is the right address for approves and contract calls.
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

/**
 * Returns user-chosen send payees for a transaction.
 *
 * Address poisoning compares a candidate against prior recipients the user
 * actually sent to. Protocol addresses (token, Permit2, router, spender) are
 * dapp-supplied and must not be treated as payees.
 *
 * Included:
 * - `simpleSend` `to`, preferring `txParamsOriginal` when present
 * - Decoded `to` / `_to` for ERC-20/721/1155 transfer methods
 * - `swapAndSendRecipient` when set
 * - Nested batch calls that themselves are sends or token transfers
 * - Untyped transactions with no calldata, treated as legacy native sends
 *
 * @param transactionMeta - Transaction meta with txParams and type.
 * @returns Deduplicated send recipient addresses, possibly empty.
 */
export function getSendRecipients(transactionMeta: TransactionMeta): string[] {
  const params = transactionMeta.txParamsOriginal ?? transactionMeta.txParams;
  const recipients: string[] = [];
  const seen = new Set<string>();

  const addRecipient = (address?: string) => {
    const normalized = address?.toLowerCase();
    if (!address || !normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    recipients.push(address);
  };

  addRecipient(
    getSendRecipientFromSource({
      data: params?.data,
      swapAndSendRecipient: transactionMeta.swapAndSendRecipient,
      to: params?.to,
      type: transactionMeta.type,
    }),
  );
  addRecipient(transactionMeta.swapAndSendRecipient);

  for (const nestedTransaction of transactionMeta.nestedTransactions ?? []) {
    addRecipient(getSendRecipientFromNestedTransaction(nestedTransaction));
  }

  return recipients;
}

function getSendRecipientFromNestedTransaction(
  nestedTransaction: NestedTransactionMetadata,
): string | undefined {
  return getSendRecipientFromSource({
    data: nestedTransaction.data,
    to: nestedTransaction.to,
    type: nestedTransaction.type,
  });
}

function getSendRecipientFromSource({
  data,
  swapAndSendRecipient,
  to,
  type,
}: SendRecipientSource): string | undefined {
  if (type === TransactionType.swapAndSend) {
    return swapAndSendRecipient;
  }

  if (isNativeSendType(type, data)) {
    return to;
  }

  if (type && TOKEN_TRANSFER_TYPES.includes(type) && hasCalldata(data)) {
    return decodeTokenTransferRecipient(data);
  }

  return undefined;
}

function isNativeSendType(
  type: TransactionType | undefined,
  data?: string,
): boolean {
  return (
    type === TransactionType.simpleSend ||
    (type === undefined && !hasCalldata(data))
  );
}

function hasCalldata(data?: string): data is string {
  return Boolean(data && data !== '0x');
}

function decodeTokenTransferRecipient(data: string): string | undefined {
  const parsed = decodeTransactionData(data) as
    | TransactionDescription
    | undefined;
  return (parsed?.args?._to ?? parsed?.args?.to) as string | undefined;
}
