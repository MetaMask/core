import BaseController, { BaseConfig, BaseState } from '../BaseController';
import { ControllerMessagingSystem } from '../controller-messaging-system';
import { GET_PREFERENCES_STATE, PREFERENCES_STATE_CHANGED } from '../user/PreferencesController';
import { BNToHex, safelyExecute } from '../util';

const EthjsQuery = require('ethjs-query');

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
  accounts: { [address: string]: AccountInformation };
}

/**
 * Controller that tracks information for all accounts in the current keychain
 */
export class AccountTrackerController extends BaseController<AccountTrackerConfig, AccountTrackerState> {
  private ethjsQuery: any;

  private messagingSystem: ControllerMessagingSystem;

  private handle?: NodeJS.Timer;

  private syncAccounts() {
    const {
      identities,
    } = this.messagingSystem.call(GET_PREFERENCES_STATE);
    const { accounts } = this.state;
    const addresses = Object.keys(identities);
    const existing = Object.keys(accounts);
    const newAddresses = addresses.filter((address) => existing.indexOf(address) === -1);
    const oldAddresses = existing.filter((address) => addresses.indexOf(address) === -1);
    newAddresses.forEach((address) => {
      accounts[address] = { balance: '0x0' };
    });
    oldAddresses.forEach((address) => {
      delete accounts[address];
    });
    this.update({ accounts: { ...accounts } });
  }

  /**
   * Name of this controller used during composition
   */
  name = 'AccountTrackerController';

  /**
   * Creates an AccountTracker instance
   *
   * @param config - Initial options used to configure this controller
   * @param state - Initial state to set on this controller
   */
  constructor(messagingSystem: ControllerMessagingSystem, config?: Partial<AccountTrackerConfig>, state?: Partial<AccountTrackerState>) {
    super(config, state);
    this.messagingSystem = messagingSystem;
    this.defaultConfig = {
      interval: 10000,
    };
    this.defaultState = { accounts: {} };
    this.initialize();
  }

  /**
   * Sets a new provider
   *
   * @param provider - Provider used to create a new underlying EthQuery instance
   */
  set provider(provider: any) {
    this.ethjsQuery = new EthjsQuery(provider);
  }

  /**
   * Extension point called if and when this controller is composed
   * with other controllers using a ComposableController
   */
  onComposed() {
    super.onComposed();
    this.messagingSystem.subscribe(PREFERENCES_STATE_CHANGED, this.refresh);
    this.poll();
  }

  /**
   * Starts a new polling interval
   *
   * @param interval - Polling interval trigger a 'refresh'
   */
  async poll(interval?: number): Promise<void> {
    interval && this.configure({ interval }, false, false);
    this.handle && clearTimeout(this.handle);
    await safelyExecute(() => this.refresh());
    this.handle = setTimeout(() => {
      this.poll(this.config.interval);
    }, this.config.interval);
  }

  /**
   * Refreshes all accounts in the current keychain
   */
  refresh = async () => {
    this.syncAccounts();
    const { accounts } = this.state;
    for (const address in accounts) {
      await safelyExecute(async () => {
        const balance = await this.ethjsQuery.getBalance(address);
        accounts[address] = { balance: BNToHex(balance) };
        this.update({ accounts: { ...accounts } });
      });
    }
  };
}

export default AccountTrackerController;
