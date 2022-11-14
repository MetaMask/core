import type { Patch } from 'immer';
import { BaseControllerV2, RestrictedControllerMessenger } from '@metamask/base-controller';
import { NetworkType } from '@metamask/controller-utils';
/**
 * @type ProviderConfig
 *
 * Configuration passed to web3-provider-engine
 * @property rpcTarget - RPC target URL.
 * @property type - Human-readable network name.
 * @property chainId - Network ID as per EIP-155.
 * @property ticker - Currency ticker.
 * @property nickname - Personalized network name.
 */
export declare type ProviderConfig = {
    rpcTarget?: string;
    type: NetworkType;
    chainId: string;
    ticker?: string;
    nickname?: string;
};
export declare type Block = {
    baseFeePerGas?: string;
};
export declare type NetworkProperties = {
    isEIP1559Compatible?: boolean;
};
/**
 * @type NetworkState
 *
 * Network controller state
 * @property network - Network ID as per net_version
 * @property isCustomNetwork - Identifies if the network is a custom network
 * @property provider - RPC URL and network name provider settings
 */
export declare type NetworkState = {
    network: string;
    isCustomNetwork: boolean;
    provider: ProviderConfig;
    properties: NetworkProperties;
};
declare const name = "NetworkController";
export declare type EthQuery = any;
export declare type NetworkControllerStateChangeEvent = {
    type: `NetworkController:stateChange`;
    payload: [NetworkState, Patch[]];
};
export declare type NetworkControllerProviderChangeEvent = {
    type: `NetworkController:providerChange`;
    payload: [ProviderConfig];
};
export declare type NetworkControllerGetProviderConfigAction = {
    type: `NetworkController:getProviderConfig`;
    handler: () => ProviderConfig;
};
export declare type NetworkControllerGetEthQueryAction = {
    type: `NetworkController:getEthQuery`;
    handler: () => EthQuery;
};
export declare type NetworkControllerMessenger = RestrictedControllerMessenger<typeof name, NetworkControllerGetProviderConfigAction | NetworkControllerGetEthQueryAction, NetworkControllerStateChangeEvent | NetworkControllerProviderChangeEvent, string, string>;
export declare type NetworkControllerOptions = {
    messenger: NetworkControllerMessenger;
    infuraProjectId?: string;
    state?: Partial<NetworkState>;
};
/**
 * Controller that creates and manages an Ethereum network provider.
 */
export declare class NetworkController extends BaseControllerV2<typeof name, NetworkState, NetworkControllerMessenger> {
    private ethQuery;
    private internalProviderConfig;
    private infuraProjectId;
    private mutex;
    constructor({ messenger, state, infuraProjectId }: NetworkControllerOptions);
    private initializeProvider;
    private refreshNetwork;
    private registerProvider;
    private setupInfuraProvider;
    private getIsCustomNetwork;
    private setupStandardProvider;
    private updateProvider;
    private safelyStopProvider;
    private verifyNetwork;
    /**
     * Ethereum provider object for the current network
     */
    provider: any;
    /**
     * Sets a new configuration for web3-provider-engine.
     *
     * TODO: Replace this wth a method.
     *
     * @param providerConfig - The web3-provider-engine configuration.
     */
    set providerConfig(providerConfig: ProviderConfig);
    get providerConfig(): ProviderConfig;
    /**
     * Refreshes the current network code.
     */
    lookupNetwork(): Promise<void>;
    /**
     * Convenience method to update provider network type settings.
     *
     * @param type - Human readable network name.
     */
    setProviderType(type: NetworkType): void;
    /**
     * Convenience method to update provider RPC settings.
     *
     * @param rpcTarget - The RPC endpoint URL.
     * @param chainId - The chain ID as per EIP-155.
     * @param ticker - The currency ticker.
     * @param nickname - Personalized network name.
     */
    setRpcTarget(rpcTarget: string, chainId: string, ticker?: string, nickname?: string): void;
    getEIP1559Compatibility(): Promise<unknown>;
}
export default NetworkController;
