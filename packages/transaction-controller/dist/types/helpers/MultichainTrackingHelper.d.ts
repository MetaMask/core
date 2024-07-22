import EthQuery from '@metamask/eth-query';
import type { NetworkClientId, NetworkController, BlockTracker, Provider, NetworkControllerStateChangeEvent } from '@metamask/network-controller';
import type { NonceLock, NonceTracker } from '@metamask/nonce-tracker';
import type { Hex } from '@metamask/utils';
import { EtherscanRemoteTransactionSource } from './EtherscanRemoteTransactionSource';
import type { IncomingTransactionHelper, IncomingTransactionOptions } from './IncomingTransactionHelper';
import type { PendingTransactionTracker } from './PendingTransactionTracker';
export type MultichainTrackingHelperOptions = {
    isMultichainEnabled: boolean;
    provider: Provider;
    nonceTracker: NonceTracker;
    incomingTransactionOptions: IncomingTransactionOptions;
    findNetworkClientIdByChainId: NetworkController['findNetworkClientIdByChainId'];
    getNetworkClientById: NetworkController['getNetworkClientById'];
    getNetworkClientRegistry: NetworkController['getNetworkClientRegistry'];
    removeIncomingTransactionHelperListeners: (IncomingTransactionHelper: IncomingTransactionHelper) => void;
    removePendingTransactionTrackerListeners: (pendingTransactionTracker: PendingTransactionTracker) => void;
    createNonceTracker: (opts: {
        provider: Provider;
        blockTracker: BlockTracker;
        chainId?: Hex;
    }) => NonceTracker;
    createIncomingTransactionHelper: (opts: {
        blockTracker: BlockTracker;
        etherscanRemoteTransactionSource: EtherscanRemoteTransactionSource;
        chainId?: Hex;
    }) => IncomingTransactionHelper;
    createPendingTransactionTracker: (opts: {
        provider: Provider;
        blockTracker: BlockTracker;
        chainId?: Hex;
    }) => PendingTransactionTracker;
    onNetworkStateChange: (listener: (...payload: NetworkControllerStateChangeEvent['payload']) => void) => void;
};
export declare class MultichainTrackingHelper {
    #private;
    constructor({ isMultichainEnabled, provider, nonceTracker, incomingTransactionOptions, findNetworkClientIdByChainId, getNetworkClientById, getNetworkClientRegistry, removeIncomingTransactionHelperListeners, removePendingTransactionTrackerListeners, createNonceTracker, createIncomingTransactionHelper, createPendingTransactionTracker, onNetworkStateChange, }: MultichainTrackingHelperOptions);
    initialize(): void;
    has(networkClientId: NetworkClientId): boolean;
    getEthQuery({ networkClientId, chainId, }?: {
        networkClientId?: NetworkClientId;
        chainId?: Hex;
    }): EthQuery;
    getProvider({ networkClientId, chainId, }?: {
        networkClientId?: NetworkClientId;
        chainId?: Hex;
    }): Provider;
    /**
     * Gets the mutex intended to guard the nonceTracker for a particular chainId and key .
     *
     * @param opts - The options object.
     * @param opts.chainId - The hex chainId.
     * @param opts.key - The hex address (or constant) pertaining to the chainId
     * @returns Mutex instance for the given chainId and key pair
     */
    acquireNonceLockForChainIdKey({ chainId, key, }: {
        chainId: Hex;
        key?: string;
    }): Promise<() => void>;
    /**
     * Gets the next nonce according to the nonce-tracker.
     * Ensure `releaseLock` is called once processing of the `nonce` value is complete.
     *
     * @param address - The hex string address for the transaction.
     * @param networkClientId - The network client ID for the transaction, used to fetch the correct nonce tracker.
     * @returns object with the `nextNonce` `nonceDetails`, and the releaseLock.
     */
    getNonceLock(address: string, networkClientId?: NetworkClientId): Promise<NonceLock>;
    startIncomingTransactionPolling(networkClientIds?: NetworkClientId[]): void;
    stopIncomingTransactionPolling(networkClientIds?: NetworkClientId[]): void;
    stopAllIncomingTransactionPolling(): void;
    updateIncomingTransactions(networkClientIds?: NetworkClientId[]): Promise<void>;
    checkForPendingTransactionAndStartPolling: () => void;
    stopAllTracking(): void;
}
//# sourceMappingURL=MultichainTrackingHelper.d.ts.map