/// <reference types="node" />
import type { FetchGasFeeEstimateOptions, GasFeeState } from '@metamask/gas-fee-controller';
import type { NetworkClientId, Provider } from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';
import EventEmitter from 'events';
import type { GasFeeFlow, Layer1GasFeeFlow } from '../types';
import { type TransactionMeta } from '../types';
/**
 * Automatically polls and updates suggested gas fees on unapproved transactions.
 */
export declare class GasFeePoller {
    #private;
    hub: EventEmitter;
    /**
     * Constructs a new instance of the GasFeePoller.
     * @param options - The options for this instance.
     * @param options.findNetworkClientIdByChainId - Callback to find the network client ID by chain ID.
     * @param options.gasFeeFlows - The gas fee flows to use to obtain suitable gas fees.
     * @param options.getGasFeeControllerEstimates - Callback to obtain the default fee estimates.
     * @param options.getProvider - Callback to obtain a provider instance.
     * @param options.getTransactions - Callback to obtain the transaction data.
     * @param options.layer1GasFeeFlows - The layer 1 gas fee flows to use to obtain suitable layer 1 gas fees.
     * @param options.onStateChange - Callback to register a listener for controller state changes.
     */
    constructor({ findNetworkClientIdByChainId, gasFeeFlows, getGasFeeControllerEstimates, getProvider, getTransactions, layer1GasFeeFlows, onStateChange, }: {
        findNetworkClientIdByChainId: (chainId: Hex) => NetworkClientId | undefined;
        gasFeeFlows: GasFeeFlow[];
        getGasFeeControllerEstimates: (options: FetchGasFeeEstimateOptions) => Promise<GasFeeState>;
        getProvider: (chainId: Hex, networkClientId?: NetworkClientId) => Provider;
        getTransactions: () => TransactionMeta[];
        layer1GasFeeFlows: Layer1GasFeeFlow[];
        onStateChange: (listener: () => void) => void;
    });
}
//# sourceMappingURL=GasFeePoller.d.ts.map