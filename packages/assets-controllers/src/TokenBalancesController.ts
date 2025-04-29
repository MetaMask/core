import { Contract } from '@ethersproject/contracts';
import { Web3Provider } from '@ethersproject/providers';
import type {
  AccountsControllerAccountRemovedEvent,
  AccountsControllerGetSelectedAccountAction,
} from '@metamask/accounts-controller';
import type {
  RestrictedMessenger,
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import { toChecksumHexAddress, toHex } from '@metamask/controller-utils';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import type {
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerGetStateAction,
  NetworkControllerStateChangeEvent,
  NetworkState,
} from '@metamask/network-controller';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import type {
  PreferencesControllerGetStateAction,
  PreferencesControllerStateChangeEvent,
  PreferencesState,
} from '@metamask/preferences-controller';
import type { Hex } from '@metamask/utils';
import type BN from 'bn.js';
import type { Patch } from 'immer';
import { isEqual } from 'lodash';

import type { MulticallResult } from './multicall';
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
 * @property messenger - A messenger.
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
  | PreferencesControllerStateChangeEvent
  | NetworkControllerStateChangeEvent
  | AccountsControllerAccountRemovedEvent;

export type TokenBalancesControllerMessenger = RestrictedMessenger<
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

    // Set initial preference for querying multiple accounts, and subscribe to changes
    this.#queryMultipleAccounts = this.#calculateQueryMultipleAccounts(
      this.messagingSystem.call('PreferencesController:getState'),
    );
    this.messagingSystem.subscribe(
      'PreferencesController:stateChange',
      this.#onPreferencesStateChange.bind(this),
    );

    // Set initial tokens, and subscribe to changes
    ({
      allTokens: this.#allTokens,
      allDetectedTokens: this.#allDetectedTokens,
    } = this.messagingSystem.call('TokensController:getState'));

    this.messagingSystem.subscribe(
      'TokensController:stateChange',
      this.#onTokensStateChange.bind(this),
    );

    // Subscribe to network state changes
    this.messagingSystem.subscribe(
      'NetworkController:stateChange',
      this.#onNetworkStateChange.bind(this),
    );

    // subscribe to account removed event to cleanup stale balances

    this.messagingSystem.subscribe(
      'AccountsController:accountRemoved',
      (accountAddress: string) =>
        this.#handleOnAccountRemoved(accountAddress as Hex),
    );
  }

  /**
   * Determines whether to query all accounts, or just the selected account.
   * @param preferences - The preferences state.
   * @param preferences.isMultiAccountBalancesEnabled - whether to query all accounts (mobile).
   * @param preferences.useMultiAccountBalanceChecker - whether to query all accounts (extension).
   * @returns true if all accounts should be queried.
   */
  #calculateQueryMultipleAccounts = ({
    isMultiAccountBalancesEnabled,
    useMultiAccountBalanceChecker,
  }: PreferencesState & { useMultiAccountBalanceChecker?: boolean }) => {
    return Boolean(
      // Note: These settings have different names on extension vs mobile
      isMultiAccountBalancesEnabled || useMultiAccountBalanceChecker,
    );
  };

  /**
   * Handles the event for preferences state changes.
   * @param preferences - The preferences state.
   */
  #onPreferencesStateChange = (preferences: PreferencesState) => {
    // Update the user preference for whether to query multiple accounts.
    const queryMultipleAccounts =
      this.#calculateQueryMultipleAccounts(preferences);

    // Refresh when flipped off -> on
    const refresh = queryMultipleAccounts && !this.#queryMultipleAccounts;
    this.#queryMultipleAccounts = queryMultipleAccounts;

    if (refresh) {
      this.updateBalances().catch(console.error);
    }
  };

  /**
   * Handles the event for tokens state changes.
   * @param state - The token state.
   * @param state.allTokens - The state for imported tokens across all chains.
   * @param state.allDetectedTokens - The state for detected tokens across all chains.
   */
  #onTokensStateChange = ({
    allTokens,
    allDetectedTokens,
  }: TokensControllerState) => {
    // Refresh token balances on chains whose tokens have changed.
    const chainIds = this.#getChainIds(allTokens, allDetectedTokens);
    const chainIdsToUpdate = chainIds.filter(
      (chainId) =>
        !isEqual(this.#allTokens[chainId], allTokens[chainId]) ||
        !isEqual(this.#allDetectedTokens[chainId], allDetectedTokens[chainId]),
    );

    this.#allTokens = allTokens;
    this.#allDetectedTokens = allDetectedTokens;
    this.#handleTokensControllerStateChange({
      chainIds: chainIdsToUpdate,
    }).catch(console.error);
  };

  /**
   * Handles the event for network state changes.
   * @param _ - The network state.
   * @param patches - An array of patch operations performed on the network state.
   */
  #onNetworkStateChange(_: NetworkState, patches: Patch[]) {
    // Remove state for deleted networks
    for (const patch of patches) {
      if (
        patch.op === 'remove' &&
        patch.path[0] === 'networkConfigurationsByChainId'
      ) {
        const removedChainId = patch.path[1] as Hex;

        this.update((state) => {
          for (const accountAddress of Object.keys(state.tokenBalances)) {
            delete state.tokenBalances[accountAddress as Hex][removedChainId];
          }
        });
      }
    }
  }

  /**
   * Handles changes when an account has been removed.
   *
   * @param accountAddress - The account address being removed.
   */
  #handleOnAccountRemoved(accountAddress: Hex) {
    this.update((state) => {
      delete state.tokenBalances[accountAddress];
    });
  }

  /**
   * Returns an array of chain ids that have tokens.
   * @param allTokens - The state for imported tokens across all chains.
   * @param allDetectedTokens - The state for detected tokens across all chains.
   * @returns An array of chain ids that have tokens.
   */
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
  async _executePoll({ chainId }: TokenBalancesPollingInput) {
    await this.updateBalancesByChainId({ chainId });
  }

  /**
   * Updates the token balances for the given chain ids.
   * @param input - The input for the update.
   * @param input.chainIds - The chain ids to update token balances for.
   * Or omitted to update all chains that contain tokens.
   */
  async updateBalances({ chainIds }: { chainIds?: Hex[] } = {}) {
    chainIds ??= this.#getChainIds(this.#allTokens, this.#allDetectedTokens);

    await Promise.allSettled(
      chainIds.map((chainId) => this.updateBalancesByChainId({ chainId })),
    );
  }

  async #handleTokensControllerStateChange({
    chainIds,
  }: { chainIds?: Hex[] } = {}) {
    const currentTokenBalancesState = this.messagingSystem.call(
      'TokenBalancesController:getState',
    );
    const currentTokenBalances = currentTokenBalancesState.tokenBalances;
    const currentAllTokens = this.#allTokens;
    const chainIdsSet = new Set(chainIds);

    // first we check if the state change was due to a token being removed
    for (const currentAccount of Object.keys(currentTokenBalances)) {
      const allChains = currentTokenBalances[currentAccount as `0x${string}`];
      for (const currentChain of Object.keys(allChains)) {
        if (chainIds?.length && !chainIdsSet.has(currentChain as Hex)) {
          continue;
        }
        const tokensObject = allChains[currentChain as Hex];
        const allCurrentTokens = Object.keys(tokensObject);
        const existingTokensInState =
          currentAllTokens[currentChain as Hex]?.[
            currentAccount as `0x${string}`
          ] || [];
        const existingSet = new Set(
          existingTokensInState.map((elm) => elm.address),
        );

        for (const singleToken of allCurrentTokens) {
          if (!existingSet.has(singleToken)) {
            this.update((state) => {
              delete state.tokenBalances[currentAccount as Hex][
                currentChain as Hex
              ][singleToken as `0x${string}`];
            });
          }
        }
      }
    }

    // then we check if the state change was due to a token being added
    let shouldUpdate = false;
    for (const currentChain of Object.keys(currentAllTokens)) {
      if (chainIds?.length && !chainIdsSet.has(currentChain as Hex)) {
        continue;
      }
      const accountsPerChain = currentAllTokens[currentChain as Hex];

      for (const currentAccount of Object.keys(accountsPerChain)) {
        const tokensList = accountsPerChain[currentAccount as `0x${string}`];
        const tokenBalancesObject =
          currentTokenBalances[currentAccount as `0x${string}`]?.[
            currentChain as Hex
          ] || {};
        for (const singleToken of tokensList) {
          if (!tokenBalancesObject?.[singleToken.address as `0x${string}`]) {
            shouldUpdate = true;
            break;
          }
        }
      }
    }
    if (shouldUpdate) {
      await this.updateBalances({ chainIds }).catch(console.error);
    }
  }

  /**
   * Updates token balances for the given chain id.
   * @param input - The input for the update.
   * @param input.chainId - The chain id to update token balances on.
   */
  async updateBalancesByChainId({ chainId }: { chainId: Hex }) {
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

    // Balances will be updated for both imported and detected tokens
    Object.entries(this.#allTokens[chainId] ?? {}).forEach(addTokens);
    Object.entries(this.#allDetectedTokens[chainId] ?? {}).forEach(addTokens);

    let results: MulticallResult[] = [];

    const currentTokenBalances = this.messagingSystem.call(
      'TokenBalancesController:getState',
    );

    if (accountTokenPairs.length > 0) {
      const provider = new Web3Provider(
        this.#getNetworkClient(chainId).provider,
      );

      const calls = accountTokenPairs.map(
        ({ accountAddress, tokenAddress }) => ({
          contract: new Contract(tokenAddress, abiERC20, provider),
          functionSignature: 'balanceOf(address)',
          arguments: [accountAddress],
        }),
      );

      results = await multicallOrFallback(calls, chainId, provider);
    }

    const updatedResults: (MulticallResult & {
      isTokenBalanceValueChanged?: boolean;
    })[] = [...results];

    for (let i = 0; i < results.length; i++) {
      const { value } = results[i];
      const { accountAddress, tokenAddress } = accountTokenPairs[i];
      const currentTokenBalanceValueForAccount =
        currentTokenBalances.tokenBalances?.[accountAddress]?.[chainId]?.[
          tokenAddress
        ];
      const isTokenBalanceValueChanged =
        currentTokenBalanceValueForAccount !== toHex(value as BN);
      updatedResults[i] = {
        ...results[i],
        isTokenBalanceValueChanged,
      };
    }

    // if all values of isTokenBalanceValueChanged are false, return
    if (updatedResults.every((result) => !result.isTokenBalanceValueChanged)) {
      return;
    }

    this.update((state) => {
      for (let i = 0; i < updatedResults.length; i++) {
        const { success, value, isTokenBalanceValueChanged } =
          updatedResults[i];
        const { accountAddress, tokenAddress } = accountTokenPairs[i];
        if (success && isTokenBalanceValueChanged) {
          ((state.tokenBalances[accountAddress] ??= {})[chainId] ??= {})[
            tokenAddress
          ] = toHex(value as BN);
        }
      }
    });
  }

  /**
   * Reset the controller state to the default state.
   */
  resetState() {
    this.update(() => {
      return getDefaultTokenBalancesState();
    });
  }

  /**
   * Returns the network client for a given chain id
   * @param chainId - The chain id to get the network client for.
   * @returns The network client for the given chain id.
   */
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
