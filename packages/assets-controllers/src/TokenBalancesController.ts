import { BN } from 'ethereumjs-util';
import {
  BaseController,
  BaseConfig,
  BaseState,
} from '@metamask/base-controller';
import { safelyExecute } from '@metamask/controller-utils';
import type { PreferencesState } from '@metamask/preferences-controller';
import { Token } from './TokenRatesController';
import { TokensState } from './TokensController';
import type { AssetsContractController } from './AssetsContractController';

// TODO: Remove this export in the next major release
export { BN };

/**
 * @type TokenBalancesConfig
 *
 * Token balances controller configuration
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
 * @property contractBalances - Hash of token contract addresses to balances
 */
export interface TokenBalancesState extends BaseState {
  contractBalances: { [address: string]: BN };
}

/**
 * Controller that passively polls on a set interval token balances
 * for tokens stored in the TokensController
 */
export class TokenBalancesController extends BaseController<
  TokenBalancesConfig,
  TokenBalancesState
> {
  private handle?: ReturnType<typeof setTimeout>;

  /**
   * Name of this controller used during composition
   */
  override name = 'TokenBalancesController';

  private readonly getSelectedAddress: () => PreferencesState['selectedAddress'];

  private readonly getERC20BalanceOf: AssetsContractController['getERC20BalanceOf'];

  /**
   * Creates a TokenBalancesController instance.
   *
   * @param options - The controller options.
   * @param options.onTokensStateChange - Allows subscribing to assets controller state changes.
   * @param options.getSelectedAddress - Gets the current selected address.
   * @param options.getERC20BalanceOf - Gets the balance of the given account at the given contract address.
   * @param config - Initial options used to configure this controller.
   * @param state - Initial state to set on this controller.
   */
  constructor(
    {
      onTokensStateChange,
      getSelectedAddress,
      getERC20BalanceOf,
    }: {
      onTokensStateChange: (
        listener: (tokenState: TokensState) => void,
      ) => void;
      getSelectedAddress: () => PreferencesState['selectedAddress'];
      getERC20BalanceOf: AssetsContractController['getERC20BalanceOf'];
    },
    config?: Partial<TokenBalancesConfig>,
    state?: Partial<TokenBalancesState>,
  ) {
    super(config, state);
    this.defaultConfig = {
      interval: 180000,
      tokens: [],
    };
    this.defaultState = { contractBalances: {} };
    this.initialize();
    onTokensStateChange(({ tokens, detectedTokens }) => {
      this.configure({ tokens: [...tokens, ...detectedTokens] });
      this.updateBalances();
    });
    this.getSelectedAddress = getSelectedAddress;
    this.getERC20BalanceOf = getERC20BalanceOf;
    this.poll();
  }

  /**
   * Starts a new polling interval.
   *
   * @param interval - Polling interval used to fetch new token balances.
   */
  async poll(interval?: number): Promise<void> {
    interval && this.configure({ interval }, false, false);
    this.handle && clearTimeout(this.handle);
    await safelyExecute(async () => this.updateBalances());
    this.handle = setTimeout(() => {
      this.poll(this.config.interval);
    }, this.config.interval);
  }

  /**
   * Updates balances for all tokens.
   */
  async updateBalances() {
    if (this.disabled) {
      return;
    }
    const { tokens } = this.config;
    const newContractBalances: { [address: string]: BN } = {};
    for (const i in tokens) {
      const { address } = tokens[i];
      try {
        newContractBalances[address] = await this.getERC20BalanceOf(
          address,
          this.getSelectedAddress(),
        );
        tokens[i].balanceError = null;
      } catch (error) {
        newContractBalances[address] = new BN(0);
        tokens[i].balanceError = error;
      }
    }
    this.update({ contractBalances: newContractBalances });
  }
}

export default TokenBalancesController;
