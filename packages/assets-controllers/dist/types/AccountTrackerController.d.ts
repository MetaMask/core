import type { AccountsControllerSelectedEvmAccountChangeEvent, AccountsControllerGetSelectedAccountAction, AccountsControllerListAccountsAction, AccountsControllerSelectedAccountChangeEvent } from '@metamask/accounts-controller';
import type { ControllerStateChangeEvent, ControllerGetStateAction, RestrictedControllerMessenger } from '@metamask/base-controller';
import type { NetworkClientId, NetworkControllerGetNetworkClientByIdAction, NetworkControllerGetStateAction } from '@metamask/network-controller';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import type { PreferencesControllerGetStateAction } from '@metamask/preferences-controller';
/**
 * The name of the {@link AccountTrackerController}.
 */
declare const controllerName = "AccountTrackerController";
/**
 * @type AccountInformation
 *
 * Account information object
 * @property balance - Hex string of an account balancec in wei
 */
export type AccountInformation = {
    balance: string;
};
/**
 * @type AccountTrackerControllerState
 *
 * Account tracker controller state
 * @property accounts - Map of addresses to account information
 */
export type AccountTrackerControllerState = {
    accounts: {
        [address: string]: AccountInformation;
    };
    accountsByChainId: Record<string, {
        [address: string]: AccountInformation;
    }>;
};
/**
 * The action that can be performed to get the state of the {@link AccountTrackerController}.
 */
export type AccountTrackerControllerGetStateAction = ControllerGetStateAction<typeof controllerName, AccountTrackerControllerState>;
/**
 * The actions that can be performed using the {@link AccountTrackerController}.
 */
export type AccountTrackerControllerActions = AccountTrackerControllerGetStateAction;
/**
 * The messenger of the {@link AccountTrackerController} for communication.
 */
export type AllowedActions = AccountsControllerListAccountsAction | PreferencesControllerGetStateAction | AccountsControllerGetSelectedAccountAction | NetworkControllerGetStateAction | NetworkControllerGetNetworkClientByIdAction;
/**
 * The event that {@link AccountTrackerController} can emit.
 */
export type AccountTrackerControllerStateChangeEvent = ControllerStateChangeEvent<typeof controllerName, AccountTrackerControllerState>;
/**
 * The events that {@link AccountTrackerController} can emit.
 */
export type AccountTrackerControllerEvents = AccountTrackerControllerStateChangeEvent;
/**
 * The external events available to the {@link AccountTrackerController}.
 */
export type AllowedEvents = AccountsControllerSelectedEvmAccountChangeEvent | AccountsControllerSelectedAccountChangeEvent;
/**
 * The messenger of the {@link AccountTrackerController}.
 */
export type AccountTrackerControllerMessenger = RestrictedControllerMessenger<typeof controllerName, AccountTrackerControllerActions | AllowedActions, AccountTrackerControllerEvents | AllowedEvents, AllowedActions['type'], AllowedEvents['type']>;
/**
 * Controller that tracks the network balances for all user accounts.
 */
export declare class AccountTrackerController extends StaticIntervalPollingController<typeof controllerName, AccountTrackerControllerState, AccountTrackerControllerMessenger> {
    #private;
    /**
     * Creates an AccountTracker instance.
     *
     * @param options - The controller options.
     * @param options.interval - Polling interval used to fetch new account balances.
     * @param options.state - Initial state to set on this controller.
     * @param options.messenger - The controller messaging system.
     */
    constructor({ interval, state, messenger, }: {
        interval?: number;
        state?: Partial<AccountTrackerControllerState>;
        messenger: AccountTrackerControllerMessenger;
    });
    private syncAccounts;
    /**
     * Starts a new polling interval.
     *
     * @param interval - Polling interval trigger a 'refresh'.
     */
    poll(interval?: number): Promise<void>;
    /**
     * Refreshes the balances of the accounts using the networkClientId
     *
     * @param networkClientId - The network client ID used to get balances.
     */
    _executePoll(networkClientId: string): Promise<void>;
    /**
     * Refreshes the balances of the accounts depending on the multi-account setting.
     * If multi-account is disabled, only updates the selected account balance.
     * If multi-account is enabled, updates balances for all accounts.
     *
     * @param networkClientId - Optional networkClientId to fetch a network client with
     */
    refresh(networkClientId?: NetworkClientId): Promise<void>;
    /**
     * Sync accounts balances with some additional addresses.
     *
     * @param addresses - the additional addresses, may be hardware wallet addresses.
     * @param networkClientId - Optional networkClientId to fetch a network client with.
     * @returns accounts - addresses with synced balance
     */
    syncBalanceWithAddresses(addresses: string[], networkClientId?: NetworkClientId): Promise<Record<string, {
        balance: string;
    }>>;
}
export default AccountTrackerController;
//# sourceMappingURL=AccountTrackerController.d.ts.map