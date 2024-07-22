import type { ControllerGetStateAction, ControllerStateChangeEvent, RestrictedControllerMessenger } from '@metamask/base-controller';
import type { NetworkClientId, NetworkControllerStateChangeEvent, NetworkState, NetworkControllerGetNetworkClientByIdAction } from '@metamask/network-controller';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import type { Hex } from '@metamask/utils';
declare const name = "TokenListController";
export type TokenListToken = {
    name: string;
    symbol: string;
    decimals: number;
    address: string;
    occurrences: number;
    aggregators: string[];
    iconUrl: string;
};
export type TokenListMap = Record<string, TokenListToken>;
type DataCache = {
    timestamp: number;
    data: TokenListMap;
};
type TokensChainsCache = {
    [chainId: Hex]: DataCache;
};
export type TokenListState = {
    tokenList: TokenListMap;
    tokensChainsCache: TokensChainsCache;
    preventPollingOnNetworkRestart: boolean;
};
export type TokenListStateChange = ControllerStateChangeEvent<typeof name, TokenListState>;
export type TokenListControllerEvents = TokenListStateChange;
export type GetTokenListState = ControllerGetStateAction<typeof name, TokenListState>;
export type TokenListControllerActions = GetTokenListState;
type AllowedActions = NetworkControllerGetNetworkClientByIdAction;
type AllowedEvents = NetworkControllerStateChangeEvent;
export type TokenListControllerMessenger = RestrictedControllerMessenger<typeof name, TokenListControllerActions | AllowedActions, TokenListControllerEvents | AllowedEvents, AllowedActions['type'], AllowedEvents['type']>;
export declare const getDefaultTokenListState: () => TokenListState;
/**
 * Controller that passively polls on a set interval for the list of tokens from metaswaps api
 */
export declare class TokenListController extends StaticIntervalPollingController<typeof name, TokenListState, TokenListControllerMessenger> {
    #private;
    private readonly mutex;
    private intervalId?;
    private readonly intervalDelay;
    private readonly cacheRefreshThreshold;
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
        chainId: Hex;
        preventPollingOnNetworkRestart?: boolean;
        onNetworkStateChange?: (listener: (networkState: NetworkState) => void) => void;
        interval?: number;
        cacheRefreshThreshold?: number;
        messenger: TokenListControllerMessenger;
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
     *
     * @private
     * @param networkClientId - The ID of the network client triggering the fetch.
     * @returns A promise that resolves when this operation completes.
     */
    _executePoll(networkClientId: string): Promise<void>;
    /**
     * Fetching token list from the Token Service API.
     *
     * @param networkClientId - The ID of the network client triggering the fetch.
     */
    fetchTokenList(networkClientId?: NetworkClientId): Promise<void>;
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
//# sourceMappingURL=TokenListController.d.ts.map