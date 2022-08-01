import { BaseController, BaseConfig, BaseState } from '../BaseController';
import type { NetworkState } from '../network/NetworkController';
import type { PreferencesState } from '../user/PreferencesController';
import type { TokensController, TokensState } from './TokensController';
import type { AssetsContractController } from './AssetsContractController';
import { TokenListState } from './TokenListController';
/**
 * @type TokenDetectionConfig
 *
 * TokenDetection configuration
 * @property interval - Polling interval used to fetch new token rates
 * @property selectedAddress - Vault selected address
 * @property chainId - The chain ID of the current network
 * @property isDetectionEnabledFromPreferences - Boolean to track if detection is enabled from PreferencesController
 * @property isDetectionEnabledForNetwork - Boolean to track if detected is enabled for current network
 */
export interface TokenDetectionConfig extends BaseConfig {
    interval: number;
    selectedAddress: string;
    chainId: string;
    isDetectionEnabledFromPreferences: boolean;
    isDetectionEnabledForNetwork: boolean;
}
/**
 * Controller that passively polls on a set interval for Tokens auto detection
 */
export declare class TokenDetectionController extends BaseController<TokenDetectionConfig, BaseState> {
    private intervalId?;
    /**
     * Name of this controller used during composition
     */
    name: string;
    private getBalancesInSingleCall;
    private addDetectedTokens;
    private getTokensState;
    private getTokenListState;
    /**
     * Creates a TokenDetectionController instance.
     *
     * @param options - The controller options.
     * @param options.onPreferencesStateChange - Allows subscribing to preferences controller state changes.
     * @param options.onNetworkStateChange - Allows subscribing to network controller state changes.
     * @param options.onTokenListStateChange - Allows subscribing to token list controller state changes.
     * @param options.getBalancesInSingleCall - Gets the balances of a list of tokens for the given address.
     * @param options.addDetectedTokens - Add a list of detected tokens.
     * @param options.getTokenListState - Gets the current state of the TokenList controller.
     * @param options.getTokensState - Gets the current state of the Tokens controller.
     * @param options.getNetworkState - Gets the state of the network controller.
     * @param options.getPreferencesState - Gets the state of the preferences controller.
     * @param config - Initial options used to configure this controller.
     * @param state - Initial state to set on this controller.
     */
    constructor({ onPreferencesStateChange, onNetworkStateChange, onTokenListStateChange, getBalancesInSingleCall, addDetectedTokens, getTokenListState, getTokensState, getNetworkState, getPreferencesState, }: {
        onPreferencesStateChange: (listener: (preferencesState: PreferencesState) => void) => void;
        onNetworkStateChange: (listener: (networkState: NetworkState) => void) => void;
        onTokenListStateChange: (listener: (tokenListState: TokenListState) => void) => void;
        getBalancesInSingleCall: AssetsContractController['getBalancesInSingleCall'];
        addDetectedTokens: TokensController['addDetectedTokens'];
        getTokenListState: () => TokenListState;
        getTokensState: () => TokensState;
        getNetworkState: () => NetworkState;
        getPreferencesState: () => PreferencesState;
    }, config?: Partial<TokenDetectionConfig>, state?: Partial<BaseState>);
    /**
     * Start polling for detected tokens.
     */
    start(): Promise<void>;
    /**
     * Stop polling for detected tokens.
     */
    stop(): void;
    private stopPolling;
    /**
     * Starts a new polling interval.
     *
     * @param interval - An interval on which to poll.
     */
    private startPolling;
    /**
     * Triggers asset ERC20 token auto detection for each contract address in contract metadata on mainnet.
     */
    detectTokens(): Promise<void>;
}
export default TokenDetectionController;
