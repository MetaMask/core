/// <reference types="node" />
import type EthQuery from '@metamask/eth-query';
import type { BlockTracker, NetworkClientId } from '@metamask/network-controller';
import EventEmitter from 'events';
import type { TransactionMeta } from '../types';
type Events = {
    'transaction-confirmed': [txMeta: TransactionMeta];
    'transaction-dropped': [txMeta: TransactionMeta];
    'transaction-failed': [txMeta: TransactionMeta, error: Error];
    'transaction-updated': [txMeta: TransactionMeta, note: string];
};
export interface PendingTransactionTrackerEventEmitter extends EventEmitter {
    on<T extends keyof Events>(eventName: T, listener: (...args: Events[T]) => void): this;
    emit<T extends keyof Events>(eventName: T, ...args: Events[T]): boolean;
}
export declare class PendingTransactionTracker {
    #private;
    hub: PendingTransactionTrackerEventEmitter;
    constructor({ approveTransaction, blockTracker, getChainId, getEthQuery, getTransactions, isResubmitEnabled, getGlobalLock, publishTransaction, hooks, }: {
        approveTransaction: (transactionId: string) => Promise<void>;
        blockTracker: BlockTracker;
        getChainId: () => string;
        getEthQuery: (networkClientId?: NetworkClientId) => EthQuery;
        getTransactions: () => TransactionMeta[];
        isResubmitEnabled?: () => boolean;
        getGlobalLock: () => Promise<() => void>;
        publishTransaction: (ethQuery: EthQuery, rawTx: string) => Promise<string>;
        hooks?: {
            beforeCheckPendingTransaction?: (transactionMeta: TransactionMeta) => boolean;
            beforePublish?: (transactionMeta: TransactionMeta) => boolean;
        };
    });
    startIfPendingTransactions: () => void;
    /**
     * Force checks the network if the given transaction is confirmed and updates it's status.
     *
     * @param txMeta - The transaction to check
     */
    forceCheckTransaction(txMeta: TransactionMeta): Promise<void>;
    stop(): void;
}
export {};
//# sourceMappingURL=PendingTransactionTracker.d.ts.map