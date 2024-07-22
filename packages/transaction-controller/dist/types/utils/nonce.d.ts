import type { NonceLock, Transaction as NonceTrackerTransaction } from '@metamask/nonce-tracker';
import type { TransactionMeta, TransactionStatus } from '../types';
/**
 * Determine the next nonce to be used for a transaction.
 *
 * @param txMeta - The transaction metadata.
 * @param getNonceLock - An anonymous function that acquires the nonce lock for an address
 * @returns The next hexadecimal nonce to be used for the given transaction, and optionally a function to release the nonce lock.
 */
export declare function getNextNonce(txMeta: TransactionMeta, getNonceLock: (address: string) => Promise<NonceLock>): Promise<[string, (() => void) | undefined]>;
/**
 * Filter and format transactions for the nonce tracker.
 *
 * @param currentChainId - Chain ID of the current network.
 * @param fromAddress - Address of the account from which the transactions to filter from are sent.
 * @param transactionStatus - Status of the transactions for which to filter.
 * @param transactions - Array of transactionMeta objects that have been prefiltered.
 * @returns Array of transactions formatted for the nonce tracker.
 */
export declare function getAndFormatTransactionsForNonceTracker(currentChainId: string, fromAddress: string, transactionStatus: TransactionStatus, transactions: TransactionMeta[]): NonceTrackerTransaction[];
//# sourceMappingURL=nonce.d.ts.map