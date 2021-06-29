import BaseController, { BaseConfig, BaseState } from '../BaseController';
import { PreferencesState } from '../user/PreferencesController';
/**
 * @type AccountInformation
 *
 * Account information object
 *
 * @property balance - Hex string of an account balancec in wei
 */
export interface AccountInformation {
    balance: string;
}
/**
 * @type AccountTrackerConfig
 *
 * Account tracker controller configuration
 *
 * @property provider - Provider used to create a new underlying EthQuery instance
 */
export interface AccountTrackerConfig extends BaseConfig {
    interval: number;
    provider?: any;
}
/**
 * @type AccountTrackerState
 *
 * Account tracker controller state
 *
 * @property accounts - Map of addresses to account information
 */
export interface AccountTrackerState extends BaseState {
    accounts: {
        [address: string]: AccountInformation;
    };
}
/**
 * Controller that tracks information for all accounts in the current keychain
 */
export declare class AccountTrackerController extends BaseController<AccountTrackerConfig, AccountTrackerState> {
    private ethQuery;
    private mutex;
    private handle?;
    private syncAccounts;
    /**
     * Name of this controller used during composition
     */
    name: string;
    private getIdentities;
    /**
     * Creates an AccountTracker instance
     *
     * @param options
     * @param options.onPreferencesStateChange - Allows subscribing to preference controller state changes
     * @param options.getIdentities - Gets the identities from the Preferences store
     * @param config - Initial options used to configure this controller
     * @param state - Initial state to set on this controller
     */
    constructor({ onPreferencesStateChange, getIdentities, }: {
        onPreferencesStateChange: (listener: (preferencesState: PreferencesState) => void) => void;
        getIdentities: () => PreferencesState['identities'];
    }, config?: Partial<AccountTrackerConfig>, state?: Partial<AccountTrackerState>);
    /**
     * Sets a new provider
     *
     * TODO: Replace this wth a method
     *
     * @param provider - Provider used to create a new underlying EthQuery instance
     */
    set provider(provider: any);
    get provider(): any;
    /**
     * Starts a new polling interval
     *
     * @param interval - Polling interval trigger a 'refresh'
     */
    poll(interval?: number): Promise<void>;
    /**
     * Refreshes all accounts in the current keychain
     */
    refresh: () => Promise<void>;
}
export default AccountTrackerController;
