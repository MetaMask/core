/// <reference types="node" />
import type { AccountsController } from '@metamask/accounts-controller';
import type { BlockTracker } from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';
import EventEmitter from 'events';
import type { RemoteTransactionSource, TransactionMeta } from '../types';
/**
 * Configuration options for the IncomingTransactionHelper
 *
 * @property includeTokenTransfers - Whether or not to include ERC20 token transfers.
 * @property isEnabled - Whether or not incoming transaction retrieval is enabled.
 * @property queryEntireHistory - Whether to initially query the entire transaction history or only recent blocks.
 * @property updateTransactions - Whether to update local transactions using remote transaction data.
 */
export type IncomingTransactionOptions = {
    includeTokenTransfers?: boolean;
    isEnabled?: () => boolean;
    queryEntireHistory?: boolean;
    updateTransactions?: boolean;
};
export declare class IncomingTransactionHelper {
    #private;
    hub: EventEmitter;
    constructor({ blockTracker, getCurrentAccount, getLastFetchedBlockNumbers, getLocalTransactions, getChainId, isEnabled, queryEntireHistory, remoteTransactionSource, transactionLimit, updateTransactions, }: {
        blockTracker: BlockTracker;
        getCurrentAccount: () => ReturnType<AccountsController['getSelectedAccount']>;
        getLastFetchedBlockNumbers: () => Record<string, number>;
        getLocalTransactions?: () => TransactionMeta[];
        getChainId: () => Hex;
        isEnabled?: () => boolean;
        queryEntireHistory?: boolean;
        remoteTransactionSource: RemoteTransactionSource;
        transactionLimit?: number;
        updateTransactions?: boolean;
    });
    start(): void;
    stop(): void;
    update(latestBlockNumberHex?: Hex): Promise<void>;
}
//# sourceMappingURL=IncomingTransactionHelper.d.ts.map