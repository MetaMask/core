import { toHex } from '@metamask/controller-utils';
import type {
  NonceLock,
  Transaction as NonceTrackerTransaction,
} from '@metamask/nonce-tracker';

import { createModuleLogger, projectLogger } from '../logger';
import type { TransactionMeta, TransactionStatus } from '../types';

const log = createModuleLogger(projectLogger, 'nonce');

/**
 * Determine the next nonce to be used for a transaction.
 *
 * @param options -
 * @param options.address - The address of the account from which the transaction will be sent.
 * @param options.getNonceLock - A function that returns a nonce lock for the given address.
 * @param options.transactionMeta - The transaction meta object for the transaction.
 * @returns The next hexadecimal nonce to be used for the given transaction, and optionally a function to release the nonce lock.
 */
export async function getNextNonce({
  address,
  getNonceLock,
  transactionMeta,
}: {
  address: string;
  getNonceLock: (address: string) => Promise<NonceLock>;
  transactionMeta?: TransactionMeta;
}): Promise<[string, (() => void) | undefined]> {
  const {
    customNonceValue,
    txParams: { nonce: existingNonce },
  } = transactionMeta ?? {
    txParams: {},
  };

  const customNonce = customNonceValue ? toHex(customNonceValue) : undefined;

  if (customNonce) {
    log('Using custom nonce', customNonce);
    return [customNonce, undefined];
  }

  if (existingNonce) {
    log('Using existing nonce', existingNonce);
    return [existingNonce, undefined];
  }

  const nonceLock = await getNonceLock(address);
  const nonce = toHex(nonceLock.nextNonce);
  const releaseLock = nonceLock.releaseLock.bind(nonceLock);

  log('Using nonce from nonce tracker', nonce, nonceLock.nonceDetails);

  return [nonce, releaseLock];
}

/**
 * Filter and format transactions for the nonce tracker.
 *
 * @param currentChainId - Chain ID of the current network.
 * @param fromAddress - Address of the account from which the transactions to filter from are sent.
 * @param transactionStatuses - Statuses of the transactions for which to filter.
 * @param transactions - Array of transactionMeta objects that have been prefiltered.
 * @returns Array of transactions formatted for the nonce tracker.
 */
export function getAndFormatTransactionsForNonceTracker(
  currentChainId: string,
  fromAddress: string,
  transactionStatuses: TransactionStatus[],
  transactions: TransactionMeta[],
): NonceTrackerTransaction[] {
  return transactions
    .filter(
      ({ chainId, isTransfer, isUserOperation, status, txParams: { from } }) =>
        !isTransfer &&
        !isUserOperation &&
        chainId === currentChainId &&
        transactionStatuses.includes(status) &&
        from.toLowerCase() === fromAddress.toLowerCase(),
    )
    .map(({ status, txParams: { from, gas, value, nonce } }) => {
      // the only value we care about is the nonce
      // but we need to return the other values to satisfy the type
      // TODO: refactor nonceTracker to not require this
      /* istanbul ignore next */
      return {
        status,
        history: [{}],
        txParams: {
          from: from ?? '',
          gas: gas ?? '',
          value: value ?? '',
          nonce: nonce ?? '',
        },
      };
    });
}
