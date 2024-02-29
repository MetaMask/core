import { toHex } from '@metamask/controller-utils';
import { providerErrors } from '@metamask/rpc-errors';
import type {
  NonceLock,
  Transaction as NonceTrackerTransaction,
} from 'nonce-tracker';

import { createModuleLogger, projectLogger } from '../logger';
import type { TransactionMeta, TransactionStatus } from '../types';

const log = createModuleLogger(projectLogger, 'nonce');

/**
 * Determine the next nonce to be used for a transaction.
 *
 * @param txMeta - The transaction metadata.
 * @param getNonceLock - An anonymous function that acquires the nonce lock for an address
 * @returns The next hexadecimal nonce to be used for the given transaction, and optionally a function to release the nonce lock.
 */
export async function getNextNonce(
  txMeta: TransactionMeta,
  getNonceLock: (address: string) => Promise<NonceLock | undefined>,
): Promise<[string, (() => void) | undefined]> {
  const {
    customNonceValue,
    txParams: { from, nonce: existingNonce },
  } = txMeta;

  const customNonce = customNonceValue ? toHex(customNonceValue) : undefined;

  if (customNonce) {
    log('Using custom nonce', customNonce);
    return [customNonce, undefined];
  }

  if (existingNonce) {
    log('Using existing nonce', existingNonce);
    return [existingNonce, undefined];
  }

  const nonceLock = await getNonceLock(from);

  if (!nonceLock) {
    throw providerErrors.chainDisconnected();
  }

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
 * @param transactionStatus - Status of the transactions for which to filter.
 * @param transactions - Array of transactionMeta objects that have been prefiltered.
 * @returns Array of transactions formatted for the nonce tracker.
 */
export function getAndFormatTransactionsForNonceTracker(
  currentChainId: string,
  fromAddress: string,
  transactionStatus: TransactionStatus,
  transactions: TransactionMeta[],
): NonceTrackerTransaction[] {
  return transactions
    .filter(
      ({ chainId, isTransfer, isUserOperation, status, txParams: { from } }) =>
        !isTransfer &&
        !isUserOperation &&
        chainId === currentChainId &&
        status === transactionStatus &&
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
