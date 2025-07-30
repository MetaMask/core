import { Contract } from '@ethersproject/contracts';
import { Web3Provider } from '@ethersproject/providers';
import type {
  AccountsControllerGetSelectedAccountAction,
  AccountsControllerListAccountsAction,
} from '@metamask/accounts-controller';
import type {
  RestrictedMessenger,
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import {
  isValidHexAddress,
  toChecksumHexAddress,
  toHex,
} from '@metamask/controller-utils';
import type { KeyringControllerAccountRemovedEvent } from '@metamask/keyring-controller';
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
import { isStrictHexString, type Hex } from '@metamask/utils';
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
import type {
  AccountActivityServiceBalanceUpdatedEvent,
  IncomingBalanceUpdate,
} from '@metamask/backend-platform';

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
  | AccountsControllerGetSelectedAccountAction
  | AccountsControllerListAccountsAction;

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
  | KeyringControllerAccountRemovedEvent
  | AccountActivityServiceBalanceUpdatedEvent;

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
      'KeyringController:accountRemoved',
      (accountAddress: string) => this.#handleOnAccountRemoved(accountAddress),
    );

    // Subscribe to AccountActivityService balance updates for EVM networks
    try {
      console.log('TokenBalancesController: Attempting to subscribe to AccountActivityService:balanceUpdated...');
      this.messagingSystem.subscribe(
        'AccountActivityService:balanceUpdated',
        (balances: IncomingBalanceUpdate[]) => {
          console.log('TokenBalancesController: Received AccountActivityService:balanceUpdated event!');
          this.#handleAccountActivityBalanceUpdated(balances);
        },
      );
      console.log('TokenBalancesController: Successfully subscribed to AccountActivityService:balanceUpdated');
    } catch (error) {
      // AccountActivityService might not be available in all environments
      console.log('AccountActivityService not available for EVM token balance updates:', error);
    }
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
  #handleOnAccountRemoved(accountAddress: string) {
    const isEthAddress =
      isStrictHexString(accountAddress.toLowerCase()) &&
      isValidHexAddress(accountAddress);
    if (!isEthAddress) {
      return;
    }

    this.update((state) => {
      delete state.tokenBalances[accountAddress as `0x${string}`];
    });
  }

  /**
   * Handles balance updates received from the AccountActivityService for EVM networks.
   * Processes IncomingBalanceUpdate[] directly and updates token balances accordingly.
   *
   * @param balanceUpdates - The balance updates from AccountActivityService containing new balances.
   */
  #handleAccountActivityBalanceUpdated(
    balanceUpdates: IncomingBalanceUpdate[],
  ): void {
    console.log('TokenBalancesController: Received balance updates:', JSON.stringify(balanceUpdates, null, 2));
    
    const currentTokenBalances = this.state.tokenBalances;
    const updatesWithChanges: Array<{
      address: Hex;
      chainId: Hex;
      tokenAddress: Hex;
      oldBalance: Hex;
      newBalance: Hex;
      hasChanged: boolean;
    }> = [];

    // Process and detect changes
    for (const balance of balanceUpdates) {
      // Validate required fields
      if (!balance.address || !balance.asset?.type || !balance.asset?.unit || balance.asset?.amount === undefined) {
        console.warn('Skipping invalid balance update:', balance);
        continue;
      }

      const accountAddress = balance.address;
      
      // Only process valid EVM addresses
      if (!isStrictHexString(accountAddress.toLowerCase()) || !isValidHexAddress(accountAddress)) {
        continue;
      }

      const address = accountAddress.toLowerCase() as Hex;

      // Process EVM ERC20 assets
      const evmERC20AssetMatch = balance.asset.type.match(/^eip155:(\d+)\/erc20:(0x[a-fA-F0-9]{40})$/i);
      
      if (evmERC20AssetMatch) {
        const chainId = `0x${parseInt(evmERC20AssetMatch[1], 10).toString(16)}` as Hex;
        const tokenAddress = evmERC20AssetMatch[2] as Hex;
        
        // Convert balance to hex format (matching existing behavior)
        const newBalance = `0x${parseInt(balance.asset.amount, 10).toString(16)}` as Hex;
        
        // Check if balance has changed
        const currentBalance = currentTokenBalances?.[address]?.[chainId]?.[tokenAddress];
        const hasChanged = currentBalance !== newBalance;

        console.log(`TokenBalancesController: Processing balance update:`, {
          address,
          chainId,
          tokenAddress,
          rawAmount: balance.asset.amount,
          oldBalance: currentBalance,
          newBalance,
          currentBalance,
          hasChanged
        });

        // Debug the state structure
        console.log(`TokenBalancesController: Current state structure for ${address}:`, {
          hasAccount: !!currentTokenBalances[address],
          accountKeys: currentTokenBalances[address] ? Object.keys(currentTokenBalances[address]) : 'none',
          hasChain: !!(currentTokenBalances[address]?.[chainId]),
          chainKeys: currentTokenBalances[address]?.[chainId] ? Object.keys(currentTokenBalances[address][chainId]) : 'none',
          hasToken: !!(currentTokenBalances[address]?.[chainId]?.[tokenAddress]),
          fullState: JSON.stringify(currentTokenBalances, null, 2)
        });

        updatesWithChanges.push({
          address,
          chainId,
          tokenAddress,
          oldBalance: currentBalance,
          newBalance,
          hasChanged,
        });
      } else {
        console.log(`TokenBalancesController: Asset type did not match ERC20 pattern:`, balance.asset.type);
      }
    }

    // Only update if there are actual changes
    const changedUpdates = updatesWithChanges.filter(update => update.hasChanged);
    if (changedUpdates.length > 0) {
      console.log(`TokenBalancesController: Updating ${changedUpdates.length} changed balances:`, 
        changedUpdates.map(u => ({
          address: u.address,
          chainId: u.chainId,
          token: u.tokenAddress,
          oldBalance: u.oldBalance,
          newBalance: u.newBalance
        }))
      );
      
      this.update((state) => {
        for (const update of changedUpdates) {
          // Ensure nested structure exists
          if (!state.tokenBalances[update.address]) {
            state.tokenBalances[update.address] = {};
          }
          if (!state.tokenBalances[update.address][update.chainId]) {
            state.tokenBalances[update.address][update.chainId] = {};
          }
          
          // Update the balance
          state.tokenBalances[update.address][update.chainId][update.tokenAddress] = update.newBalance;
        }
      });
    } else {
      console.log('TokenBalancesController: No balance changes detected, skipping state update');
    }
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
   * Get an Ethers.js Web3Provider for the requested chain.
   *
   * @param chainId - The chain id to get the provider for.
   * @returns The provider for the given chain id.
   */
  #getProvider(chainId: Hex): Web3Provider {
    return new Web3Provider(this.#getNetworkClient(chainId).provider);
  }

  /**
   * Internal util: run `balanceOf` for an arbitrary set of account/token pairs.
   *
   * @param params - The parameters for the balance fetch.
   * @param params.chainId - The chain id to fetch balances on.
   * @param params.pairs - The account/token pairs to fetch balances for.
   * @returns The balances for the given token addresses.
   */
  async #batchBalanceOf({
    chainId,
    pairs,
  }: {
    chainId: Hex;
    pairs: { accountAddress: Hex; tokenAddress: Hex }[];
  }): Promise<MulticallResult[]> {
    if (!pairs.length) {
      return [];
    }

    const provider = this.#getProvider(chainId);

    const calls = pairs.map(({ accountAddress, tokenAddress }) => ({
      contract: new Contract(tokenAddress, abiERC20, provider),
      functionSignature: 'balanceOf(address)',
      arguments: [accountAddress],
    }));

    return multicallOrFallback(calls, chainId, provider);
  }

  /**
   * Returns ERC-20 balances for a single account on a single chain.
   *
   * @param params - The parameters for the balance fetch.
   * @param params.chainId - The chain id to fetch balances on.
   * @param params.accountAddress - The account address to fetch balances for.
   * @param params.tokenAddresses - The token addresses to fetch balances for.
   * @returns A mapping from token address to balance (hex) | null.
   */
  async getErc20Balances({
    chainId,
    accountAddress,
    tokenAddresses,
  }: {
    chainId: Hex;
    accountAddress: Hex;
    tokenAddresses: Hex[];
  }): Promise<Record<Hex, Hex | null>> {
    // Return early if no token addresses provided
    if (tokenAddresses.length === 0) {
      return {};
    }

    const pairs = tokenAddresses.map((tokenAddress) => ({
      accountAddress,
      tokenAddress,
    }));

    const results = await this.#batchBalanceOf({ chainId, pairs });

    const balances: Record<Hex, Hex | null> = {};
    tokenAddresses.forEach((tokenAddress, i) => {
      balances[tokenAddress] = results[i]?.success
        ? toHex(results[i].value as BN)
        : null;
    });

    return balances;
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
      results = await this.#batchBalanceOf({
        chainId,
        pairs: accountTokenPairs,
      });
    }

    const updatedResults: (MulticallResult & {
      isTokenBalanceValueChanged?: boolean;
    })[] = results.map((res, i) => {
      const { value } = res;
      const { accountAddress, tokenAddress } = accountTokenPairs[i];
      const currentTokenBalanceValueForAccount =
        currentTokenBalances.tokenBalances?.[accountAddress]?.[chainId]?.[
          tokenAddress
        ];
      // `value` can be null or undefined if the multicall failed due to RPC issue.
      // Please see packages/assets-controllers/src/multicall.ts#L365.
      // Hence we should not update the balance in that case.
      const isTokenBalanceValueChanged =
        res.success && value !== undefined && value !== null
          ? currentTokenBalanceValueForAccount !== toHex(value as BN)
          : false;
      return {
        ...res,
        isTokenBalanceValueChanged,
      };
    });

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
