import type { AccountsControllerGetSelectedAccountAction, AccountsControllerGetAccountAction, AccountsControllerSelectedEvmAccountChangeEvent } from '@metamask/accounts-controller';
import type { RestrictedControllerMessenger, ControllerGetStateAction, ControllerStateChangeEvent } from '@metamask/base-controller';
import type { KeyringControllerGetStateAction, KeyringControllerLockEvent, KeyringControllerUnlockEvent } from '@metamask/keyring-controller';
import type { NetworkClientId, NetworkControllerGetNetworkClientByIdAction, NetworkControllerGetNetworkConfigurationByNetworkClientId, NetworkControllerGetStateAction, NetworkControllerNetworkDidChangeEvent } from '@metamask/network-controller';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import type { PreferencesControllerGetStateAction, PreferencesControllerStateChangeEvent } from '@metamask/preferences-controller';
import type { AssetsContractController } from './AssetsContractController';
import type { GetTokenListState, TokenListMap, TokenListStateChange } from './TokenListController';
import type { TokensControllerAddDetectedTokensAction, TokensControllerGetStateAction } from './TokensController';
/**
 * Compare 2 given strings and return boolean
 * eg: "foo" and "FOO" => true
 * eg: "foo" and "bar" => false
 * eg: "foo" and 123 => false
 *
 * @param value1 - first string to compare
 * @param value2 - first string to compare
 * @returns true if 2 strings are identical when they are lowercase
 */
export declare function isEqualCaseInsensitive(value1: string, value2: string): boolean;
type TokenDetectionMap = {
    [P in keyof TokenListMap]: Omit<TokenListMap[P], 'occurrences'>;
};
export declare const STATIC_MAINNET_TOKEN_LIST: TokenDetectionMap;
export declare const controllerName = "TokenDetectionController";
export type TokenDetectionState = Record<never, never>;
export type TokenDetectionControllerGetStateAction = ControllerGetStateAction<typeof controllerName, TokenDetectionState>;
export type TokenDetectionControllerActions = TokenDetectionControllerGetStateAction;
export type AllowedActions = AccountsControllerGetSelectedAccountAction | AccountsControllerGetAccountAction | NetworkControllerGetNetworkClientByIdAction | NetworkControllerGetNetworkConfigurationByNetworkClientId | NetworkControllerGetStateAction | GetTokenListState | KeyringControllerGetStateAction | PreferencesControllerGetStateAction | TokensControllerGetStateAction | TokensControllerAddDetectedTokensAction;
export type TokenDetectionControllerStateChangeEvent = ControllerStateChangeEvent<typeof controllerName, TokenDetectionState>;
export type TokenDetectionControllerEvents = TokenDetectionControllerStateChangeEvent;
export type AllowedEvents = AccountsControllerSelectedEvmAccountChangeEvent | NetworkControllerNetworkDidChangeEvent | TokenListStateChange | KeyringControllerLockEvent | KeyringControllerUnlockEvent | PreferencesControllerStateChangeEvent;
export type TokenDetectionControllerMessenger = RestrictedControllerMessenger<typeof controllerName, TokenDetectionControllerActions | AllowedActions, TokenDetectionControllerEvents | AllowedEvents, AllowedActions['type'], AllowedEvents['type']>;
/**
 * Controller that passively polls on a set interval for Tokens auto detection
 * @property intervalId - Polling interval used to fetch new token rates
 * @property selectedAddress - Vault selected address
 * @property networkClientId - The network client ID of the current selected network
 * @property disabled - Boolean to track if network requests are blocked
 * @property isUnlocked - Boolean to track if the keyring state is unlocked
 * @property isDetectionEnabledFromPreferences - Boolean to track if detection is enabled from PreferencesController
 * @property isDetectionEnabledForNetwork - Boolean to track if detected is enabled for current network
 */
export declare class TokenDetectionController extends StaticIntervalPollingController<typeof controllerName, TokenDetectionState, TokenDetectionControllerMessenger> {
    #private;
    /**
     * Creates a TokenDetectionController instance.
     *
     * @param options - The controller options.
     * @param options.messenger - The controller messaging system.
     * @param options.disabled - If set to true, all network requests are blocked.
     * @param options.interval - Polling interval used to fetch new token rates
     * @param options.getBalancesInSingleCall - Gets the balances of a list of tokens for the given address.
     * @param options.trackMetaMetricsEvent - Sets options for MetaMetrics event tracking.
     */
    constructor({ interval, disabled, getBalancesInSingleCall, trackMetaMetricsEvent, messenger, }: {
        interval?: number;
        disabled?: boolean;
        getBalancesInSingleCall: AssetsContractController['getBalancesInSingleCall'];
        trackMetaMetricsEvent: (options: {
            event: string;
            category: string;
            properties: {
                tokens: string[];
                token_standard: string;
                asset_type: string;
            };
        }) => void;
        messenger: TokenDetectionControllerMessenger;
    });
    /**
     * Allows controller to make active and passive polling requests
     */
    enable(): void;
    /**
     * Blocks controller from making network calls
     */
    disable(): void;
    /**
     * Internal isActive state
     * @type {boolean}
     */
    get isActive(): boolean;
    /**
     * Start polling for detected tokens.
     */
    start(): Promise<void>;
    /**
     * Stop polling for detected tokens.
     */
    stop(): void;
    _executePoll(networkClientId: NetworkClientId, options: {
        address: string;
    }): Promise<void>;
    /**
     * For each token in the token list provided by the TokenListController, checks the token's balance for the selected account address on the active network.
     * On mainnet, if token detection is disabled in preferences, ERC20 token auto detection will be triggered for each contract address in the legacy token list from the @metamask/contract-metadata repo.
     *
     * @param options - Options for token detection.
     * @param options.networkClientId - The ID of the network client to use.
     * @param options.selectedAddress - the selectedAddress against which to detect for token balances.
     */
    detectTokens({ networkClientId, selectedAddress, }?: {
        networkClientId?: NetworkClientId;
        selectedAddress?: string;
    }): Promise<void>;
}
export default TokenDetectionController;
//# sourceMappingURL=TokenDetectionController.d.ts.map