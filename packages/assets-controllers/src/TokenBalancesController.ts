import {
  type RestrictedControllerMessenger,
  type ControllerGetStateAction,
  type ControllerStateChangeEvent,
  BaseController,
} from '@metamask/base-controller';
import { safelyExecute, toHex } from '@metamask/controller-utils';
import type { PreferencesControllerGetStateAction } from '@metamask/preferences-controller';

import type { AssetsContractController } from './AssetsContractController';
import type { Token } from './TokenRatesController';
import type { TokensControllerStateChangeEvent } from './TokensController';

const DEFAULT_INTERVAL = 180000;

const controllerName = 'TokenBalancesController';

const metadata = {
  contractBalances: { persist: true, anonymous: false },
};

/**
 * Token balances controller options
 * @property interval - Polling interval used to fetch new token balances.
 * @property tokens - List of tokens to track balances for.
 * @property disabled - If set to true, all tracked tokens contract balances updates are blocked.
 * @property getERC20BalanceOf - Gets the balance of the given account at the given contract address.
 */
type TokenBalancesControllerOptions = {
  interval?: number;
  tokens?: Token[];
  disabled?: boolean;
  getERC20BalanceOf: AssetsContractController['getERC20BalanceOf'];
  messenger: TokenBalancesControllerMessenger;
  state?: Partial<TokenBalancesControllerState>;
};

/**
 * Represents a mapping of hash token contract addresses to their balances.
 */
type ContractBalances = Record<string, string>;

/**
 * Token balances controller state
 * @property contractBalances - Hash of token contract addresses to balances
 */
export type TokenBalancesControllerState = {
  contractBalances: ContractBalances;
};

export type TokenBalancesControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  TokenBalancesControllerState
>;

export type TokenBalancesControllerActions =
  TokenBalancesControllerGetStateAction;

export type AllowedActions = PreferencesControllerGetStateAction;

export type TokenBalancesControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    TokenBalancesControllerState
  >;

export type TokenBalancesControllerEvents =
  TokenBalancesControllerStateChangeEvent;

export type AllowedEvents = TokensControllerStateChangeEvent;

export type TokenBalancesControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  TokenBalancesControllerActions | AllowedActions,
  TokenBalancesControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

/**
 * Get the default TokenBalancesController state.
 *
 * @returns The default TokenBalancesController state.
 */
export function getDefaultTokenBalancesState(): TokenBalancesControllerState {
  return {
    contractBalances: {},
  };
}

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
   * @param options.getERC20BalanceOf - Gets the balance of the given account at the given contract address.
   * @param options.state - Initial state to set on this controller.
   * @param options.messenger - The controller restricted messenger.
   */
  constructor({
    interval = DEFAULT_INTERVAL,
    tokens = [],
    disabled = false,
    getERC20BalanceOf,
    messenger,
    state = {},
  }: TokenBalancesControllerOptions) {
    super({
      name: controllerName,
      metadata,
      messenger,
      state: {
        ...getDefaultTokenBalancesState(),
        ...state,
      },
    });

    this.#disabled = disabled;
    this.#interval = interval;
    this.#tokens = tokens;

    this.messagingSystem.subscribe(
      'TokensController:stateChange',
      ({ tokens: newTokens, detectedTokens }) => {
        this.#tokens = [...newTokens, ...detectedTokens];
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.updateBalances();
      },
    );

    this.#getERC20BalanceOf = getERC20BalanceOf;

    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.poll();
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
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
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

    const { selectedAddress } = this.messagingSystem.call(
      'PreferencesController:getState',
    );

    const newContractBalances: ContractBalances = {};
    for (const token of this.#tokens) {
      const { address } = token;
      try {
        const balance = await this.#getERC20BalanceOf(address, selectedAddress);
        newContractBalances[address] = toHex(balance);
        token.hasBalanceError = false;
      } catch (error) {
        newContractBalances[address] = toHex(0);
        token.hasBalanceError = true;
      }
    }

    this.update((state) => {
      state.contractBalances = newContractBalances;
    });
  }
}

export default TokenBalancesController;
