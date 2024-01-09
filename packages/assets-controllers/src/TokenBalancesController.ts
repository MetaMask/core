import {
  type RestrictedControllerMessenger,
  BaseController,
} from '@metamask/base-controller';
import { safelyExecute } from '@metamask/controller-utils';
import type { PreferencesState } from '@metamask/preferences-controller';
import { BN } from 'ethereumjs-util';

import type { AssetsContractController } from './AssetsContractController';
import type { Token } from './TokenRatesController';
import type { TokensState } from './TokensController';

const DEFAULT_INTERVAL = 180000;

const controllerName = 'TokenBalancesController';

const metadata = {
  contractBalances: { persist: true, anonymous: false },
};

/**
 * @type TokenBalancesControllerOptions
 *
 * Token balances controller options
 * @property interval - Polling interval used to fetch new token balances.
 * @property tokens - List of tokens to track balances for.
 * @property disabled - If set to true, all tracked tokens contract balances updates are blocked.
 * @property onTokensStateChange - Allows subscribing to assets controller state changes.
 * @property getSelectedAddress - Gets the current selected address.
 * @property getERC20BalanceOf - Gets the balance of the given account at the given contract address.
 */
export type TokenBalancesControllerOptions = {
  interval?: number;
  tokens?: Token[];
  disabled?: boolean;
  onTokensStateChange: (listener: (tokenState: TokensState) => void) => void;
  getSelectedAddress: () => PreferencesState['selectedAddress'];
  getERC20BalanceOf: AssetsContractController['getERC20BalanceOf'];
  messenger: TokenBalancesControllerMessenger;
  state?: Partial<TokenBalancesControllerState>;
};

/**
 * Represents a mapping of hash token contract addresses to their balances.
 */
type ContractBalances = Record<string, BN>;

/**
 * @type TokenBalancesControllerState
 *
 * Token balances controller state
 * @property contractBalances - Hash of token contract addresses to balances
 */
export type TokenBalancesControllerState = {
  contractBalances: ContractBalances;
};

const getDefaultState = (): TokenBalancesControllerState => {
  return {
    contractBalances: {},
  };
};

export type TokenBalancesControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  never,
  never,
  never,
  never
>;

/**
 * Controller that passively polls on a set interval token balances
 * for tokens stored in the TokensController
 */
export class TokenBalancesController extends BaseController<
  typeof controllerName,
  TokenBalancesControllerState,
  TokenBalancesControllerMessenger
> {
  #handle?: ReturnType<typeof setTimeout>;

  #getSelectedAddress: () => PreferencesState['selectedAddress'];

  #getERC20BalanceOf: AssetsContractController['getERC20BalanceOf'];

  #interval: number;

  #tokens: Token[];

  #disabled: boolean;

  /**
   * Construct a Token Balances Controller.
   *
   * @param options - The controller options.
   * @param options.interval - Polling interval used to fetch new token balances.
   * @param options.tokens - List of tokens to track balances for.
   * @param options.disabled - If set to true, all tracked tokens contract balances updates are blocked.
   * @param options.onTokensStateChange - Allows subscribing to assets controller state changes.
   * @param options.getSelectedAddress - Gets the current selected address.
   * @param options.getERC20BalanceOf - Gets the balance of the given account at the given contract address.
   * @param options.state - Initial state to set on this controller.
   * @param options.messenger - The controller restricted messenger.
   */
  constructor({
    interval = DEFAULT_INTERVAL,
    tokens = [],
    disabled = false,
    onTokensStateChange,
    getSelectedAddress,
    getERC20BalanceOf,
    messenger,
    state = {},
  }: TokenBalancesControllerOptions) {
    super({
      name: controllerName,
      metadata,
      messenger,
      state: {
        ...getDefaultState(),
        ...state,
      },
    });

    this.#disabled = disabled;
    this.#interval = interval;
    this.#tokens = tokens;

    onTokensStateChange(this.#tokensStateChangeListener.bind(this));

    this.#getSelectedAddress = getSelectedAddress;
    this.#getERC20BalanceOf = getERC20BalanceOf;

    this.poll();
  }

  /*
   * Tokens state changes listener.
   */
  #tokensStateChangeListener({ tokens, detectedTokens }: TokensState) {
    this.#tokens = [...tokens, ...detectedTokens];
    this.updateBalances();
  }

  /**
   * Allows controller to update tracked tokens contract balances.
   */
  enable() {
    this.#disabled = false;
  }

  /**
   * Blocks controller from updating tracked tokens contract balances.
   */
  disable() {
    this.#disabled = true;
  }

  /*
   * Lists all tracked tokens.
   */
  getTokens() {
    return this.#tokens;
  }

  /**
   * Starts a new polling interval.
   *
   * @param interval - Polling interval used to fetch new token balances.
   */
  async poll(interval?: number): Promise<void> {
    if (interval) {
      this.#interval = interval;
    }

    if (this.#handle) {
      clearTimeout(this.#handle);
    }

    await safelyExecute(() => this.updateBalances());

    this.#handle = setTimeout(() => {
      this.poll(this.#interval);
    }, this.#interval);
  }

  /**
   * Updates balances for all tokens.
   */
  async updateBalances() {
    if (this.#disabled) {
      return;
    }

    const newContractBalances: ContractBalances = {};
    for (const token of this.#tokens) {
      const { address } = token;
      try {
        newContractBalances[address] = await this.#getERC20BalanceOf(
          address,
          this.#getSelectedAddress(),
        );
        token.balanceError = null;
      } catch (error) {
        newContractBalances[address] = new BN(0);
        token.balanceError = error;
      }
    }

    this.update((state) => {
      state.contractBalances = newContractBalances;
    });
  }
}

export default TokenBalancesController;
