import type { TransactionDescription } from '@ethersproject/abi';

import { TransactionType } from '../types.js';
import type { TransactionMeta } from '../types.js';
import { decodeTransactionData } from './transaction-type.js';

const TOKEN_TRANSFER_TYPES = [
  TransactionType.tokenMethodTransfer,
  TransactionType.tokenMethodTransferFrom,
  TransactionType.tokenMethodSafeTransferFrom,
];

type SendRecipientSource = {
  data?: string;
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
 * - `swapAndSendRecipient` whenever set (only ever a user-entered payee)
 * - Nested batch calls that themselves are sends or token transfers
 * - Untyped transactions with no calldata, treated as legacy native sends
 * - Speed-up transactions (`type: retry`), classified using `originalType`,
 *   since `txParams` are otherwise unchanged from the transaction being sped
 *   up. Cancellations (`type: cancel`) are not resolved this way: `to` and
 *   `data` are overwritten into a self-send with no real payee to track.
 * - A native transfer with no calldata to an address that happens to be a
 *   contract. `determineTransactionType` only returns `simpleSend` when `to`
 *   is not a contract, so these are typed `contractInteraction` even though
 *   the user chose that address as a plain payee.
 *
 * @param transactionMeta - Transaction meta with txParams and type.
 * @returns Deduplicated send recipient addresses, possibly empty.
 */
export function getSendRecipients(transactionMeta: TransactionMeta): string[] {
  // Swap the whole params object rather than falling back field by field.
  // `txParamsOriginal` is a `cloneDeep` snapshot of the pre-wrapping params, so
  // its `to` and `data` always describe the same call. Mixing an original `to`
  // with a wrapped `data` would misread an untyped transaction as a contract
  // call and drop a real payee.
  const params = transactionMeta.txParamsOriginal ?? transactionMeta.txParams;
  const recipients: string[] = [];
  const seen = new Set<string>();

  const addRecipient = (address?: string): void => {
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
      to: params?.to,
      type: getEffectiveType(
        transactionMeta.type,
        transactionMeta.originalType,
      ),
    }),
  );
  addRecipient(transactionMeta.swapAndSendRecipient);

  for (const nestedTransaction of transactionMeta.nestedTransactions ?? []) {
    addRecipient(getSendRecipientFromSource(nestedTransaction));
  }

  return recipients;
}

function getSendRecipientFromSource({
  data,
  to,
  type,
}: SendRecipientSource): string | undefined {
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
  if (type === TransactionType.simpleSend) {
    return true;
  }

  return (
    !hasCalldata(data) &&
    (type === undefined || type === TransactionType.contractInteraction)
  );
}

/**
 * Resolves the type used to classify a transaction as a send.
 *
 * Speed-up transactions keep the original `txParams`, so they should be
 * classified by what they originally were, not by `retry`. Cancellations
 * overwrite `to`/`data` into a self-send, so `originalType` would misclassify
 * them; `type` is returned unchanged instead.
 *
 * @param type - The transaction's own type.
 * @param originalType - The type before a speed-up replaced it, if any.
 * @returns The type to use when classifying the transaction as a send.
 */
function getEffectiveType(
  type: TransactionType | undefined,
  originalType: TransactionType | undefined,
): TransactionType | undefined {
  if (type === TransactionType.retry && originalType) {
    return originalType;
  }

  return type;
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
