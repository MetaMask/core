import { Web3Provider } from '@ethersproject/providers';
import type {
  AccountsControllerGetSelectedAccountAction,
  AccountsControllerListAccountsAction,
} from '@metamask/accounts-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedMessenger,
} from '@metamask/base-controller';
import {
  isValidHexAddress,
  safelyExecuteWithTimeout,
  toHex,
} from '@metamask/controller-utils';
import type { KeyringControllerAccountRemovedEvent } from '@metamask/keyring-controller';
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
} from '@metamask/preferences-controller';
import type { Hex } from '@metamask/utils';
import { isStrictHexString } from '@metamask/utils';
import { produce } from 'immer';
import { isEqual } from 'lodash';

import type {
  AccountTrackerUpdateNativeBalancesAction,
  AccountTrackerUpdateStakedBalancesAction,
} from './AccountTrackerController';
import { STAKING_CONTRACT_ADDRESS_BY_CHAINID } from './AssetsContractController';
import {
  AccountsApiBalanceFetcher,
  type BalanceFetcher,
  type ProcessedBalance,
} from './multi-chain-accounts-service/api-balance-fetcher';
import { RpcBalanceFetcher } from './rpc-service/rpc-balance-fetcher';
import type {
  TokensControllerGetStateAction,
  TokensControllerState,
  TokensControllerStateChangeEvent,
} from './TokensController';

export type ChainIdHex = Hex;
export type ChecksumAddress = Hex;

const CONTROLLER = 'TokenBalancesController' as const;
const DEFAULT_INTERVAL_MS = 180_000; // 3 minutes

const metadata = {
  tokenBalances: { persist: true, anonymous: false },
};

// account → chain → token → balance
export type TokenBalances = Record<
  ChecksumAddress,
  Record<ChainIdHex, Record<ChecksumAddress, Hex>>
>;

export type TokenBalancesControllerState = {
  tokenBalances: TokenBalances;
};

export type TokenBalancesControllerGetStateAction = ControllerGetStateAction<
  typeof CONTROLLER,
  TokenBalancesControllerState
>;

export type TokenBalancesControllerActions =
  TokenBalancesControllerGetStateAction;

export type TokenBalancesControllerStateChangeEvent =
  ControllerStateChangeEvent<typeof CONTROLLER, TokenBalancesControllerState>;

export type NativeBalanceEvent = {
  type: `${typeof CONTROLLER}:updatedNativeBalance`;
  payload: unknown[];
};

export type TokenBalancesControllerEvents =
  | TokenBalancesControllerStateChangeEvent
  | NativeBalanceEvent;

export type AllowedActions =
  | NetworkControllerGetNetworkClientByIdAction
  | NetworkControllerGetStateAction
  | TokensControllerGetStateAction
  | PreferencesControllerGetStateAction
  | AccountsControllerGetSelectedAccountAction
  | AccountsControllerListAccountsAction
  | AccountTrackerUpdateNativeBalancesAction
  | AccountTrackerUpdateStakedBalancesAction;

export type AllowedEvents =
  | TokensControllerStateChangeEvent
  | PreferencesControllerStateChangeEvent
  | NetworkControllerStateChangeEvent
  | KeyringControllerAccountRemovedEvent;

export type TokenBalancesControllerMessenger = RestrictedMessenger<
  typeof CONTROLLER,
  TokenBalancesControllerActions | AllowedActions,
  TokenBalancesControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

export type TokenBalancesControllerOptions = {
  messenger: TokenBalancesControllerMessenger;
  interval?: number;
  state?: Partial<TokenBalancesControllerState>;
  /** When `true`, balances for *all* known accounts are queried. */
  queryMultipleAccounts?: boolean;
  /** Enable Accounts‑API strategy (if supported chain). */
  useAccountsAPI?: boolean;
  /** Disable external HTTP calls (privacy / offline mode). */
  allowExternalServices?: () => boolean;
  /** Custom logger. */
  log?: (...args: unknown[]) => void;
};
// endregion

// ────────────────────────────────────────────────────────────────────────────
// region: Helper utilities
const draft = <T>(base: T, fn: (d: T) => void): T => produce(base, fn);

const ZERO_ADDRESS =
  '0x0000000000000000000000000000000000000000' as ChecksumAddress;
// endregion

// ────────────────────────────────────────────────────────────────────────────
// region: Main controller
export class TokenBalancesController extends StaticIntervalPollingController<{
  chainIds: ChainIdHex[];
}>()<
  typeof CONTROLLER,
  TokenBalancesControllerState,
  TokenBalancesControllerMessenger
> {
  readonly #queryAllAccounts: boolean;

  readonly #balanceFetchers: BalanceFetcher[];

  #allTokens: TokensControllerState['allTokens'] = {};

  #detectedTokens: TokensControllerState['allDetectedTokens'] = {};

  constructor({
    messenger,
    interval = DEFAULT_INTERVAL_MS,
    state = {},
    queryMultipleAccounts = true,
    useAccountsAPI = false,
    allowExternalServices = () => true,
  }: TokenBalancesControllerOptions) {
    super({
      name: CONTROLLER,
      messenger,
      metadata,
      state: { tokenBalances: {}, ...state },
    });

    this.#queryAllAccounts = queryMultipleAccounts;

    // Strategy order: API first, then RPC fallback
    this.#balanceFetchers = [
      ...(useAccountsAPI && allowExternalServices()
        ? [new AccountsApiBalanceFetcher('extension', this.#getProvider)]
        : []),
      new RpcBalanceFetcher(this.#getProvider, this.#getNetworkClient, () => ({
        allTokens: this.#allTokens,
        allDetectedTokens: this.#detectedTokens,
      })),
    ];

    this.setIntervalLength(interval);

    // initial token state & subscriptions
    const { allTokens, allDetectedTokens } = this.messagingSystem.call(
      'TokensController:getState',
    );
    this.#allTokens = allTokens;
    this.#detectedTokens = allDetectedTokens;

    this.messagingSystem.subscribe(
      'TokensController:stateChange',
      this.#onTokensChanged,
    );
    this.messagingSystem.subscribe(
      'NetworkController:stateChange',
      this.#onNetworkChanged,
    );
    this.messagingSystem.subscribe(
      'KeyringController:accountRemoved',
      this.#onAccountRemoved,
    );
  }

  #chainIdsWithTokens(): ChainIdHex[] {
    return [
      ...new Set([
        ...Object.keys(this.#allTokens),
        ...Object.keys(this.#detectedTokens),
      ]),
    ] as ChainIdHex[];
  }

  readonly #getProvider = (chainId: ChainIdHex): Web3Provider => {
    const { networkConfigurationsByChainId } = this.messagingSystem.call(
      'NetworkController:getState',
    );
    const cfg = networkConfigurationsByChainId[chainId];
    const { networkClientId } = cfg.rpcEndpoints[cfg.defaultRpcEndpointIndex];
    const client = this.messagingSystem.call(
      'NetworkController:getNetworkClientById',
      networkClientId,
    );
    return new Web3Provider(client.provider);
  };

  readonly #getNetworkClient = (chainId: ChainIdHex) => {
    const { networkConfigurationsByChainId } = this.messagingSystem.call(
      'NetworkController:getState',
    );
    const cfg = networkConfigurationsByChainId[chainId];
    const { networkClientId } = cfg.rpcEndpoints[cfg.defaultRpcEndpointIndex];
    return this.messagingSystem.call(
      'NetworkController:getNetworkClientById',
      networkClientId,
    );
  };

  async _executePoll({ chainIds }: { chainIds: ChainIdHex[] }) {
    await this.updateBalances({ chainIds });
  }

  async updateBalances({ chainIds }: { chainIds?: ChainIdHex[] } = {}) {
    const targetChains = chainIds ?? this.#chainIdsWithTokens();
    if (!targetChains.length) {
      return;
    }

    const { address: selected } = this.messagingSystem.call(
      'AccountsController:getSelectedAccount',
    );
    const allAccounts = this.messagingSystem.call(
      'AccountsController:listAccounts',
    );

    const aggregated: ProcessedBalance[] = [];
    let remainingChains = [...targetChains];

    // Try each fetcher in order, removing successfully processed chains
    for (const fetcher of this.#balanceFetchers) {
      const supportedChains = remainingChains.filter((c) =>
        fetcher.supports(c),
      );
      if (!supportedChains.length) {
        continue;
      }

      try {
        const balances = await safelyExecuteWithTimeout(
          async () => {
            return await fetcher.fetch({
              chainIds: supportedChains,
              queryAllAccounts: this.#queryAllAccounts,
              selectedAccount: selected as ChecksumAddress,
              allAccounts,
            });
          },
          false,
          this.getIntervalLength(),
        );

        if (balances && balances.length > 0) {
          aggregated.push(...balances);
          // Remove chains that were successfully processed
          const processedChains = new Set(balances.map((b) => b.chainId));
          remainingChains = remainingChains.filter(
            (chain) => !processedChains.has(chain),
          );
        }
      } catch (error) {
        console.warn(
          `Balance fetcher failed for chains ${supportedChains.join(', ')}: ${String(error)}`,
        );
        // Continue to next fetcher (fallback)
      }

      // If all chains have been processed, break early
      if (remainingChains.length === 0) {
        break;
      }
    }

    // Determine which accounts to process
    const accountsToProcess = this.#queryAllAccounts
      ? allAccounts.map((a) => a.address as ChecksumAddress)
      : [selected as ChecksumAddress];

    const prev = this.state;
    const next = draft(prev, (d) => {
      // First, initialize all tokens from allTokens state with balance 0
      // for the accounts and chains we're processing
      for (const chainId of targetChains) {
        for (const account of accountsToProcess) {
          // Initialize tokens from allTokens
          const chainTokens = this.#allTokens[chainId];
          if (chainTokens?.[account]) {
            Object.values(chainTokens[account]).forEach(
              (token: { address: string }) => {
                const tokenAddress =
                  token.address.toLowerCase() as ChecksumAddress;
                ((d.tokenBalances[account] ??= {})[chainId] ??= {})[
                  tokenAddress
                ] = '0x0';
              },
            );
          }

          // Initialize tokens from allDetectedTokens
          const detectedChainTokens = this.#detectedTokens[chainId];
          if (detectedChainTokens?.[account]) {
            Object.values(detectedChainTokens[account]).forEach(
              (token: { address: string }) => {
                const tokenAddress =
                  token.address.toLowerCase() as ChecksumAddress;
                ((d.tokenBalances[account] ??= {})[chainId] ??= {})[
                  tokenAddress
                ] = '0x0';
              },
            );
          }
        }
      }

      // Then update with actual fetched balances where available
      aggregated.forEach(({ success, value, account, token, chainId }) => {
        if (success && value !== undefined) {
          ((d.tokenBalances[account] ??= {})[chainId] ??= {})[
            token.toLowerCase() as ChecksumAddress
          ] = toHex(value);
        }
      });
    });

    if (!isEqual(prev, next)) {
      this.update(() => next);

      const nativeBalances = aggregated.filter(
        (r) => r.success && r.token === ZERO_ADDRESS,
      );

      // Update native token balances in a single batch operation for better performance
      if (nativeBalances.length > 0) {
        const balanceUpdates = nativeBalances.map((balance) => ({
          address: balance.account,
          chainId: balance.chainId,
          balance: balance.value?.toString() ?? '0',
        }));

        this.messagingSystem.call(
          'AccountTrackerController:updateNativeBalances',
          balanceUpdates,
        );
      }

      // Get staking contract addresses for filtering
      const stakingContractAddresses = Object.values(
        STAKING_CONTRACT_ADDRESS_BY_CHAINID,
      ).map((addr) => addr.toLowerCase());

      // Filter and update staked balances in a single batch operation for better performance
      const stakedBalances = aggregated.filter((r) => {
        return (
          r.success &&
          r.token !== ZERO_ADDRESS &&
          stakingContractAddresses.includes(r.token.toLowerCase())
        );
      });

      if (stakedBalances.length > 0) {
        const stakedBalanceUpdates = stakedBalances.map((balance) => ({
          address: balance.account,
          chainId: balance.chainId,
          stakedBalance: balance.value?.toString() ?? '0',
        }));

        this.messagingSystem.call(
          'AccountTrackerController:updateStakedBalances',
          stakedBalanceUpdates,
        );
      }
    }
  }

  resetState() {
    this.update(() => ({ tokenBalances: {} }));
  }

  readonly #onTokensChanged = async (state: TokensControllerState) => {
    const changed: ChainIdHex[] = [];
    let hasChanges = false;

    // Get chains that have existing balances
    const chainsWithBalances = new Set<ChainIdHex>();
    for (const address of Object.keys(this.state.tokenBalances)) {
      const addressKey = address as ChecksumAddress;
      for (const chainId of Object.keys(
        this.state.tokenBalances[addressKey] || {},
      )) {
        chainsWithBalances.add(chainId as ChainIdHex);
      }
    }

    // Only process chains that are explicitly mentioned in the incoming state change
    const incomingChainIds = new Set([
      ...Object.keys(state.allTokens),
      ...Object.keys(state.allDetectedTokens),
    ]);

    // Only proceed if there are actual changes to chains that have balances or are being added
    const relevantChainIds = Array.from(incomingChainIds).filter((chainId) => {
      const id = chainId as ChainIdHex;

      const hasTokensNow =
        (state.allTokens[id] && Object.keys(state.allTokens[id]).length > 0) ||
        (state.allDetectedTokens[id] &&
          Object.keys(state.allDetectedTokens[id]).length > 0);
      const hadTokensBefore =
        (this.#allTokens[id] && Object.keys(this.#allTokens[id]).length > 0) ||
        (this.#detectedTokens[id] &&
          Object.keys(this.#detectedTokens[id]).length > 0);

      // Check if there's an actual change in token state
      const hasTokenChange =
        !isEqual(state.allTokens[id], this.#allTokens[id]) ||
        !isEqual(state.allDetectedTokens[id], this.#detectedTokens[id]);

      // Process chains that have actual changes OR are new chains getting tokens
      return hasTokenChange || (!hadTokensBefore && hasTokensNow);
    });

    if (relevantChainIds.length === 0) {
      // No relevant changes, just update internal state
      this.#allTokens = state.allTokens;
      this.#detectedTokens = state.allDetectedTokens;
      return;
    }

    // Handle both cleanup and updates in a single state update
    this.update((s) => {
      for (const chainId of relevantChainIds) {
        const id = chainId as ChainIdHex;
        const hasTokensNow =
          (state.allTokens[id] &&
            Object.keys(state.allTokens[id]).length > 0) ||
          (state.allDetectedTokens[id] &&
            Object.keys(state.allDetectedTokens[id]).length > 0);
        const hadTokensBefore =
          (this.#allTokens[id] &&
            Object.keys(this.#allTokens[id]).length > 0) ||
          (this.#detectedTokens[id] &&
            Object.keys(this.#detectedTokens[id]).length > 0);

        if (
          !isEqual(state.allTokens[id], this.#allTokens[id]) ||
          !isEqual(state.allDetectedTokens[id], this.#detectedTokens[id])
        ) {
          if (hasTokensNow) {
            // Chain still has tokens - mark for async balance update
            changed.push(id);
          } else if (hadTokensBefore) {
            // Chain had tokens before but doesn't now - clean up balances immediately
            for (const address of Object.keys(s.tokenBalances)) {
              const addressKey = address as ChecksumAddress;
              if (s.tokenBalances[addressKey]?.[id]) {
                s.tokenBalances[addressKey][id] = {};
                hasChanges = true;
              }
            }
          }
        }
      }
    });

    this.#allTokens = state.allTokens;
    this.#detectedTokens = state.allDetectedTokens;

    // Only update balances for chains that still have tokens (and only if we haven't already updated state)
    if (changed.length && !hasChanges) {
      this.updateBalances({ chainIds: changed }).catch((error) => {
        console.warn('Error updating balances after token change:', error);
      });
    }
  };

  readonly #onNetworkChanged = (state: NetworkState) => {
    // Check if any networks were removed by comparing with previous state
    const currentNetworks = new Set(
      Object.keys(state.networkConfigurationsByChainId),
    );

    // Get all networks that currently have balances
    const networksWithBalances = new Set<string>();
    for (const address of Object.keys(this.state.tokenBalances)) {
      const addressKey = address as ChecksumAddress;
      for (const network of Object.keys(
        this.state.tokenBalances[addressKey] || {},
      )) {
        networksWithBalances.add(network);
      }
    }

    // Find networks that were removed
    const removedNetworks = Array.from(networksWithBalances).filter(
      (network) => !currentNetworks.has(network),
    );

    if (removedNetworks.length > 0) {
      this.update((s) => {
        // Remove balances for all accounts on the deleted networks
        for (const address of Object.keys(s.tokenBalances)) {
          const addressKey = address as ChecksumAddress;
          for (const removedNetwork of removedNetworks) {
            const networkKey = removedNetwork as ChainIdHex;
            if (s.tokenBalances[addressKey]?.[networkKey]) {
              delete s.tokenBalances[addressKey][networkKey];
            }
          }
        }
      });
    }
  };

  readonly #onAccountRemoved = (addr: string) => {
    if (!isStrictHexString(addr) || !isValidHexAddress(addr)) {
      return;
    }
    this.update((s) => {
      delete s.tokenBalances[addr as ChecksumAddress];
    });
  };
}

export default TokenBalancesController;
