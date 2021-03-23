import { BN } from 'ethereumjs-util';
import BaseController, { BaseConfig, BaseState } from '../BaseController';
import { safelyExecute } from '../util';
import AssetsController from './AssetsController';
import { Token } from './TokenRatesController';
import { AssetsContractController } from './AssetsContractController';

// TODO: Remove this export in the next major release
export { BN };

/**
 * @type TokenBalancesConfig
 *
 * Token balances controller configuration
 *
 * @property interval - Polling interval used to fetch new token balances
 * @property tokens - List of tokens to track balances for
 */
export interface TokenBalancesConfig extends BaseConfig {
  interval: number;
  tokens: Token[];
}

/**
 * @type TokenBalancesState
 *
 * Token balances controller state
 *
 * @property contractBalances - Hash of token contract addresses to balances
 */
export interface TokenBalancesState extends BaseState {
  contractBalances: { [address: string]: BN };
}

/**
 * Controller that passively polls on a set interval token balances
 * for tokens stored in the AssetsController
 */
export class TokenBalancesController extends BaseController<TokenBalancesConfig, TokenBalancesState> {
  private handle?: NodeJS.Timer;

  /**
   * Name of this controller used during composition
   */
  name = 'TokenBalancesController';

  /**
   * List of required sibling controllers this controller needs to function
   */
  requiredControllers = ['AssetsContractController', 'AssetsController'];

  /**
   * Creates a TokenBalancesController instance
   *
   * @param config - Initial options used to configure this controller
   * @param state - Initial state to set on this controller
   */
  constructor(config?: Partial<TokenBalancesConfig>, state?: Partial<TokenBalancesState>) {
    super(config, state);
    this.defaultConfig = {
      interval: 180000,
      tokens: [],
    };
    this.defaultState = { contractBalances: {} };
    this.initialize();
    this.poll();
  }

  /**
   * Starts a new polling interval
   *
   * @param interval - Polling interval used to fetch new token balances
   */
  async poll(interval?: number): Promise<void> {
    interval && this.configure({ interval }, false, false);
    this.handle && clearTimeout(this.handle);
    await safelyExecute(() => this.updateBalances());
    this.handle = setTimeout(() => {
      this.poll(this.config.interval);
    }, this.config.interval);
  }

  /**
   * Updates balances for all tokens
   *
   * @returns Promise resolving when this operation completes
   */
  async updateBalances() {
    if (this.disabled) {
      return;
    }
    const assetsContract = this.context.AssetsContractController as AssetsContractController;
    const assets = this.context.AssetsController as AssetsController;
    const { selectedAddress } = assets.config;
    const { tokens } = this.config;
    const newContractBalances: { [address: string]: BN } = {};
    for (const i in tokens) {
      const { address } = tokens[i];
      try {
        newContractBalances[address] = await assetsContract.getBalanceOf(address, selectedAddress);
        tokens[i].balanceError = null;
      } catch (error) {
        newContractBalances[address] = new BN(0);
        tokens[i].balanceError = error;
      }
    }
    this.update({ contractBalances: newContractBalances });
  }

  /**
   * Extension point called if and when this controller is composed
   * with other controllers using a ComposableController
   */
  onComposed() {
    super.onComposed();
    const assets = this.context.AssetsController as AssetsController;
    assets.subscribe(({ tokens }) => {
      this.configure({ tokens });
      this.updateBalances();
    });
  }
}

export default TokenBalancesController;
