import type { Patch } from 'immer';
import { BaseController } from '../BaseControllerV2';
import type { RestrictedControllerMessenger } from '../ControllerMessenger';
import { NetworkState } from '../network/NetworkController';
import { PreferencesState } from '../user/PreferencesController';
declare const name = "TokenListController";
declare type BaseToken = {
    name: string;
    symbol: string;
    decimals: number;
};
declare type StaticToken = {
    logo: string;
    erc20: boolean;
} & BaseToken;
export declare type ContractMap = {
    [address: string]: StaticToken;
};
export declare type DynamicToken = {
    address: string;
    occurrences: number;
    iconUrl: string;
} & BaseToken;
export declare type TokenListToken = {
    address: string;
    iconUrl: string;
    occurrences: number | null;
} & BaseToken;
export declare type TokenListMap = {
    [address: string]: TokenListToken;
};
export declare type TokenListState = {
    tokenList: TokenListMap;
    tokensChainsCache: TokensChainsCache;
};
export declare type TokenListStateChange = {
    type: `${typeof name}:stateChange`;
    payload: [TokenListState, Patch[]];
};
export declare type GetTokenListState = {
    type: `${typeof name}:getState`;
    handler: () => TokenListState;
};
declare type DataCache = {
    timestamp: number;
    data: TokenListToken[];
};
declare type TokensChainsCache = {
    [chainSlug: string]: DataCache;
};
declare type TokenListMessenger = RestrictedControllerMessenger<typeof name, GetTokenListState, TokenListStateChange, never, never>;
/**
 * Controller that passively polls on a set interval for the list of tokens from metaswaps api
 */
export declare class TokenListController extends BaseController<typeof name, TokenListState, TokenListMessenger> {
    private mutex;
    private intervalId?;
    private intervalDelay;
    private cacheRefreshThreshold;
    private chainId;
    private useStaticTokenList;
    private abortController;
    /**
     * Creates a TokenListController instance.
     *
     * @param options - The controller options.
     * @param options.chainId - The chain ID of the current network.
     * @param options.useStaticTokenList - Indicates whether to use the static token list or not.
     * @param options.onNetworkStateChange - A function for registering an event handler for network state changes.
     * @param options.onPreferencesStateChange -A function for registering an event handler for preference state changes.
     * @param options.interval - The polling interval, in milliseconds.
     * @param options.cacheRefreshThreshold - The token cache expiry time, in milliseconds.
     * @param options.messenger - A restricted controller messenger.
     * @param options.state - Initial state to set on this controller.
     */
    constructor({ chainId, useStaticTokenList, onNetworkStateChange, onPreferencesStateChange, interval, cacheRefreshThreshold, messenger, state, }: {
        chainId: string;
        useStaticTokenList: boolean;
        onNetworkStateChange: (listener: (networkState: NetworkState) => void) => void;
        onPreferencesStateChange: (listener: (preferencesState: PreferencesState) => void) => void;
        interval?: number;
        cacheRefreshThreshold?: number;
        messenger: TokenListMessenger;
        state?: Partial<TokenListState>;
    });
    /**
     * Start polling for the token list.
     */
    start(): Promise<void>;
    /**
     * Restart polling for the token list.
     */
    restart(): Promise<void>;
    /**
     * Stop polling for the token list.
     */
    stop(): void;
    /**
     * Prepare to discard this controller.
     *
     * This stops any active polling.
     */
    destroy(): void;
    private stopPolling;
    /**
     * Starts a new polling interval.
     */
    private startPolling;
    /**
     * Fetching token list.
     */
    fetchTokenList(): Promise<void>;
    /**
     * Fetching token list from the contract-metadata as a fallback.
     */
    fetchFromStaticTokenList(): Promise<void>;
    /**
     * Fetching token list from the Token Service API.
     */
    fetchFromDynamicTokenList(): Promise<void>;
    /**
     * Checks if the Cache timestamp is valid,
     * if yes data in cache will be returned
     * otherwise null will be returned.
     *
     * @returns The cached data, or `null` if the cache was expired.
     */
    fetchFromCache(): Promise<TokenListToken[] | null>;
    /**
     * Fetch metadata for a token.
     *
     * @param tokenAddress - The address of the token.
     * @returns The token metadata.
     */
    fetchTokenMetadata(tokenAddress: string): Promise<DynamicToken>;
}
export default TokenListController;
