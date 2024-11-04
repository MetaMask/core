import { Contract } from '@ethersproject/contracts';
import { Web3Provider } from '@ethersproject/providers';
import type { AccountsControllerGetSelectedAccountAction } from '@metamask/accounts-controller';
import type {
  RestrictedControllerMessenger,
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import { toChecksumHexAddress, toHex } from '@metamask/controller-utils';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import type {
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerGetStateAction,
} from '@metamask/network-controller';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import type {
  PreferencesControllerGetStateAction,
  PreferencesControllerStateChangeEvent,
  PreferencesState,
} from '@metamask/preferences-controller';
import type { Hex } from '@metamask/utils';
import type BN from 'bn.js';
import { isEqual } from 'lodash';

import { multicallOrFallback } from './multicall';
import type { Token } from './TokenRatesController';
import type {
  TokensControllerGetStateAction,
  TokensControllerState,
  TokensControllerStateChangeEvent,
} from './TokensController';

const DEFAULT_INTERVAL = 180000;

const controllerName = 'TokenBalancesController';

const metadata = {
  tokenBalances: { persist: true, anonymous: false },
};

/**
 * Token balances controller options
 * @property interval - Polling interval used to fetch new token balances.
 * @property messenger - A controller messenger.
 * @property state - Initial state for the controller.
 */
type TokenBalancesControllerOptions = {
  interval?: number;
  messenger: TokenBalancesControllerMessenger;
  state?: Partial<TokenBalancesControllerState>;
};

/**
 * A mapping from account address to chain id to token address to balance.
 */
type TokenBalances = Record<Hex, Record<Hex, Record<Hex, Hex>>>;

/**
 * Token balances controller state
 * @property tokenBalances - A mapping from account address to chain id to token address to balance.
 */
export type TokenBalancesControllerState = {
  tokenBalances: TokenBalances;
};

export type TokenBalancesControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  TokenBalancesControllerState
>;

export type TokenBalancesControllerActions =
  TokenBalancesControllerGetStateAction;

export type AllowedActions =
  | NetworkControllerGetNetworkClientByIdAction
  | NetworkControllerGetStateAction
  | TokensControllerGetStateAction
  | PreferencesControllerGetStateAction
  | AccountsControllerGetSelectedAccountAction;

export type TokenBalancesControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    TokenBalancesControllerState
  >;

export type TokenBalancesControllerEvents =
  TokenBalancesControllerStateChangeEvent;

export type AllowedEvents =
  | TokensControllerStateChangeEvent
  | PreferencesControllerStateChangeEvent;

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
    tokenBalances: {},
  };
}

/** The input to start polling for the {@link TokenBalancesController} */
export type TokenBalancesPollingInput = {
  chainId: Hex;
};

/**
 * Controller that passively polls on a set interval token balances
 * for tokens stored in the TokensController
 */
export class TokenBalancesController extends StaticIntervalPollingController<TokenBalancesPollingInput>()<
  typeof controllerName,
  TokenBalancesControllerState,
  TokenBalancesControllerMessenger
> {
  #queryMultipleAccounts: boolean;

  #allTokens: TokensControllerState['allTokens'];

  #allDetectedTokens: TokensControllerState['allDetectedTokens'];

  /**
   * Construct a Token Balances Controller.
   *
   * @param options - The controller options.
   * @param options.interval - Polling interval used to fetch new token balances.
   * @param options.state - Initial state to set on this controller.
   * @param options.messenger - The controller restricted messenger.
   */
  constructor({
    interval = DEFAULT_INTERVAL,
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

    this.setIntervalLength(interval);

    // Set initial preference, and subscribe to changes
    this.#queryMultipleAccounts = this.#calculateQueryMultipleAccounts(
      this.messagingSystem.call('PreferencesController:getState'),
    );
    this.messagingSystem.subscribe(
      'PreferencesController:stateChange',
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      this.#onPreferencesStateChange.bind(this),
    );

    // Set initial tokens, and subscribe to changes
    ({
      allTokens: this.#allTokens,
      allDetectedTokens: this.#allDetectedTokens,
    } = this.messagingSystem.call('TokensController:getState'));

    this.messagingSystem.subscribe(
      'TokensController:stateChange',
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      this.#onTokensStateChange.bind(this),
    );
  }

  // Determines whether to query all accounts, or just the selected account
  #calculateQueryMultipleAccounts = ({
    isMultiAccountBalancesEnabled,
    useMultiAccountBalanceChecker,
  }: PreferencesState & { useMultiAccountBalanceChecker?: boolean }) => {
    return Boolean(
      // Note: These settings have different names on extension vs mobile
      isMultiAccountBalancesEnabled || useMultiAccountBalanceChecker,
    );
  };

  // Updates the user preference for whether to query multiple accounts
  #onPreferencesStateChange = async (preferences: PreferencesState) => {
    const queryMultipleAccounts =
      this.#calculateQueryMultipleAccounts(preferences);

    // Refresh when flipped off -> on
    const refresh = queryMultipleAccounts && !this.#queryMultipleAccounts;
    this.#queryMultipleAccounts = queryMultipleAccounts;

    if (refresh) {
      await Promise.allSettled(
        this.#getChainIds(this.#allTokens, this.#allDetectedTokens).map(
          async (chainId) => this._executePoll({ chainId }),
        ),
      );
    }
  };

  // Refreshes token balances on chains whose tokens have changed
  #onTokensStateChange = async ({
    allTokens,
    allDetectedTokens,
  }: TokensControllerState) => {
    const chainIds = this.#getChainIds(allTokens, allDetectedTokens);
    const chainIdsToUpdate = chainIds.filter(
      (chainId) =>
        !isEqual(this.#allTokens[chainId], allTokens[chainId]) ||
        !isEqual(this.#allDetectedTokens[chainId], allDetectedTokens[chainId]),
    );

    this.#allTokens = allTokens;
    this.#allDetectedTokens = allDetectedTokens;

    await Promise.allSettled(
      chainIdsToUpdate.map(async (chainId) => this._executePoll({ chainId })),
    );
  };

  // Returns an array of chain ids that have tokens
  #getChainIds = (
    allTokens: TokensControllerState['allTokens'],
    allDetectedTokens: TokensControllerState['allDetectedTokens'],
  ) =>
    [
      ...new Set([
        ...Object.keys(allTokens),
        ...Object.keys(allDetectedTokens),
      ]),
    ] as Hex[];

  /**
   * Polls for erc20 token balances.
   * @param input - The input for the poll.
   * @param input.chainId - The chain id to poll token balances on.
   */
  async _executePoll({ chainId }: TokenBalancesPollingInput): Promise<void> {
    const { address: selectedAccountAddress } = this.messagingSystem.call(
      'AccountsController:getSelectedAccount',
    );

    const isSelectedAccount = (accountAddress: string) =>
      toChecksumHexAddress(accountAddress) ===
      toChecksumHexAddress(selectedAccountAddress);

    const accountTokenPairs: { accountAddress: Hex; tokenAddress: Hex }[] = [];

    const addTokens = ([accountAddress, tokens]: [string, Token[]]) =>
      this.#queryMultipleAccounts || isSelectedAccount(accountAddress)
        ? tokens.forEach((t) =>
            accountTokenPairs.push({
              accountAddress: accountAddress as Hex,
              tokenAddress: t.address as Hex,
            }),
          )
        : undefined;

    Object.entries(this.#allTokens[chainId] ?? {}).forEach(addTokens);
    Object.entries(this.#allDetectedTokens[chainId] ?? {}).forEach(addTokens);

    if (accountTokenPairs.length === 0) {
      return;
    }

    const provider = new Web3Provider(this.#getNetworkClient(chainId).provider);

    const calls = accountTokenPairs.map(({ accountAddress, tokenAddress }) => ({
      contract: new Contract(tokenAddress, abiERC20, provider),
      functionSignature: 'balanceOf(address)',
      arguments: [accountAddress],
    }));

    const results = await multicallOrFallback(calls, chainId, provider);

    this.update((state) => {
      for (let i = 0; i < results.length; i++) {
        const { success, value } = results[i];

        if (success) {
          const { accountAddress, tokenAddress } = accountTokenPairs[i];
          ((state.tokenBalances[accountAddress] ??= {})[chainId] ??= {})[
            tokenAddress
          ] = toHex(value as BN);
        }
      }
    });
  }

  // TODO: needed?
  /**
   * Reset the controller state to the default state.
   */
  resetState() {
    this.update(() => {
      return getDefaultTokenBalancesState();
    });
  }

  // Returns the network client for a given chain id
  #getNetworkClient(chainId: Hex) {
    const { networkConfigurationsByChainId } = this.messagingSystem.call(
      'NetworkController:getState',
    );

    const networkConfiguration = networkConfigurationsByChainId[chainId];
    if (!networkConfiguration) {
      throw new Error(
        `TokenBalancesController: No network configuration found for chainId ${chainId}`,
      );
    }

    const { networkClientId } =
      networkConfiguration.rpcEndpoints[
        networkConfiguration.defaultRpcEndpointIndex
      ];

    return this.messagingSystem.call(
      `NetworkController:getNetworkClientById`,
      networkClientId,
    );
  }
}

export default TokenBalancesController;
