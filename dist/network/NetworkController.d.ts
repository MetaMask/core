import { BaseController, BaseConfig, BaseState } from '../BaseController';
/**
 * Human-readable network name
 */
export declare type NetworkType = 'kovan' | 'localhost' | 'mainnet' | 'rinkeby' | 'goerli' | 'ropsten' | 'rpc' | 'optimism' | 'optimismTest';
export declare enum NetworksChainId {
    mainnet = "1",
    kovan = "42",
    rinkeby = "4",
    goerli = "5",
    ropsten = "3",
    localhost = "",
    rpc = "",
    optimism = "10",
    optimismTest = "69"
}
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
export interface ProviderConfig {
    rpcTarget?: string;
    type: NetworkType;
    chainId: string;
    ticker?: string;
    nickname?: string;
}
export interface Block {
    baseFeePerGas?: string;
}
export interface NetworkProperties {
    isEIP1559Compatible?: boolean;
}
/**
 * @type NetworkConfig
 *
 * Network controller configuration
 * @property infuraProjectId - an Infura project ID
 * @property providerConfig - web3-provider-engine configuration
 */
export interface NetworkConfig extends BaseConfig {
    infuraProjectId?: string;
    providerConfig: ProviderConfig;
}
/**
 * @type NetworkState
 *
 * Network controller state
 * @property network - Network ID as per net_version
 * @property isCustomNetwork - Identifies if the network is a custom network
 * @property provider - RPC URL and network name provider settings
 */
export interface NetworkState extends BaseState {
    network: string;
    isCustomNetwork: boolean;
    provider: ProviderConfig;
    properties: NetworkProperties;
}
/**
 * Controller that creates and manages an Ethereum network provider
 */
export declare class NetworkController extends BaseController<NetworkConfig, NetworkState> {
    private ethQuery;
    private internalProviderConfig;
    private mutex;
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
     * Name of this controller used during composition
     */
    name: string;
    /**
     * Ethereum provider object for the current network
     */
    provider: any;
    /**
     * Creates a NetworkController instance.
     *
     * @param config - Initial options used to configure this controller.
     * @param state - Initial state to set on this controller.
     */
    constructor(config?: Partial<NetworkConfig>, state?: Partial<NetworkState>);
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
