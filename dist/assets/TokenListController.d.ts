import type { Patch } from 'immer';
import { BaseController } from '../BaseControllerV2';
import type { RestrictedControllerMessenger } from '../ControllerMessenger';
import { NetworkState } from '../network/NetworkController';
declare const name = "TokenListController";
export declare type TokenListToken = {
    name: string;
    symbol: string;
    decimals: number;
    address: string;
    occurrences: number;
    aggregators: string[];
    iconUrl: string;
};
export declare type TokenListMap = Record<string, TokenListToken>;
declare type DataCache = {
    timestamp: number;
    data: TokenListMap;
};
declare type TokensChainsCache = {
    [chainSlug: string]: DataCache;
};
export declare type TokenListState = {
    tokenList: TokenListMap;
    tokensChainsCache: TokensChainsCache;
    preventPollingOnNetworkRestart: boolean;
};
export declare type TokenListStateChange = {
    type: `${typeof name}:stateChange`;
    payload: [TokenListState, Patch[]];
};
export declare type GetTokenListState = {
    type: `${typeof name}:getState`;
    handler: () => TokenListState;
};
declare type TokenListMessenger = RestrictedControllerMessenger<typeof name, GetTokenListState, TokenListStateChange, never, TokenListStateChange['type']>;
/**
 * Controller that passively polls on a set interval for the list of tokens from metaswaps api
 */
export declare class TokenListController extends BaseController<typeof name, TokenListState, TokenListMessenger> {
    private mutex;
    private intervalId?;
    private intervalDelay;
    private cacheRefreshThreshold;
    private chainId;
    private abortController;
    /**
     * Creates a TokenListController instance.
     *
     * @param options - The controller options.
     * @param options.chainId - The chain ID of the current network.
     * @param options.onNetworkStateChange - A function for registering an event handler for network state changes.
     * @param options.interval - The polling interval, in milliseconds.
     * @param options.cacheRefreshThreshold - The token cache expiry time, in milliseconds.
     * @param options.messenger - A restricted controller messenger.
     * @param options.state - Initial state to set on this controller.
     * @param options.preventPollingOnNetworkRestart - Determines whether to prevent poilling on network restart in extension.
     */
    constructor({ chainId, preventPollingOnNetworkRestart, onNetworkStateChange, interval, cacheRefreshThreshold, messenger, state, }: {
        chainId: string;
        preventPollingOnNetworkRestart?: boolean;
        onNetworkStateChange: (listener: (networkState: NetworkState) => void) => void;
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
     * Fetching token list from the Token Service API.
     */
    fetchTokenList(): Promise<void>;
    /**
     * Checks if the Cache timestamp is valid,
     * if yes data in cache will be returned
     * otherwise null will be returned.
     *
     * @returns The cached data, or `null` if the cache was expired.
     */
    fetchFromCache(): Promise<TokenListMap | null>;
    /**
     * Clearing tokenList and tokensChainsCache explicitly.
     */
    clearingTokenListData(): void;
    /**
     * Updates preventPollingOnNetworkRestart from extension.
     *
     * @param shouldPreventPolling - Determine whether to prevent polling on network change
     */
    updatePreventPollingOnNetworkRestart(shouldPreventPolling: boolean): void;
}
export default TokenListController;
