import type { Patch } from 'immer';
import { BaseController } from '../BaseControllerV2';
import type { RestrictedControllerMessenger } from '../ControllerMessenger';
import { NetworkState } from '../network/NetworkController';
declare const name = "TokenListController";
interface DataCache {
    timestamp: number;
    data: Token[];
}
interface TokensChainsCache {
    [chainSlug: string]: DataCache;
}
declare type Token = {
    name: string;
    address: string;
    decimals: number;
    symbol: string;
    occurrences: number;
    aggregators: string[];
};
declare type TokenMap = {
    [address: string]: Token;
};
export declare type TokenListState = {
    tokenList: TokenMap;
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
/**
 * Controller that passively polls on a set interval for the list of tokens from metaswaps api
 */
export declare class TokenListController extends BaseController<typeof name, TokenListState> {
    private mutex;
    private intervalId?;
    private intervalDelay;
    private cacheRefreshThreshold;
    private chainId;
    /**
     * Creates a TokenListController instance
     *
     * @param options - Constructor options
     * @param options.interval - The polling interval, in milliseconds
     * @param options.messenger - A reference to the messaging system
     * @param options.state - Initial state to set on this controller
     */
    constructor({ chainId, onNetworkStateChange, interval, cacheRefreshThreshold, messenger, state, }: {
        chainId: string;
        onNetworkStateChange: (listener: (networkState: NetworkState) => void) => void;
        interval?: number;
        cacheRefreshThreshold?: number;
        messenger: RestrictedControllerMessenger<typeof name, GetTokenListState, TokenListStateChange, never, never>;
        state?: Partial<TokenListState>;
    });
    /**
     * Start polling for the token list
     */
    start(): Promise<void>;
    /**
     * Stop polling for the token list
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
     * Starts a new polling interval
     */
    private startPolling;
    /**
     * Fetching token list from the Token Service API
     */
    fetchTokenList(): Promise<void>;
    /**
     * Checks if the Cache timestamp is valid,
     *  if yes data in cache will be returned
     *  otherwise a call to the API service will be made.
     * @returns Promise that resolves into a TokenList
     */
    fetchFromCache(): Promise<Token[]>;
    /**
     * Calls the API to sync the tokens in the token service
     */
    syncTokens(): Promise<void>;
    /**
     * Fetch metadata for a token whose address is send to the API
     * @param tokenAddress
     * @returns Promise that resolvesto Token Metadata
     */
    fetchTokenMetadata(tokenAddress: string): Promise<Token>;
}
export default TokenListController;
