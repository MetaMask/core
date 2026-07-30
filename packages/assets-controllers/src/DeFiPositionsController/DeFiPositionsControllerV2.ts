import type { AccountTreeControllerGetAccountsFromSelectedAccountGroupAction } from '@metamask/account-tree-controller';
import { BaseController } from '@metamask/base-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangedEvent,
  StateMetadata,
} from '@metamask/base-controller';
import type { ApiPlatformClient } from '@metamask/core-backend';
import type { Messenger } from '@metamask/messenger';

import { buildDeFiBalancesQuery } from './build-defi-balances-query.js';
import type { DeFiBalancesQuery } from './build-defi-balances-query.js';
import type { DeFiPositionsControllerV2MethodActions } from './DeFiPositionsControllerV2-method-action-types.js';
import type { DeFiPositionsByAccount } from './group-defi-positions-v6.js';
import { groupDeFiPositionsV6 } from './group-defi-positions-v6.js';

const controllerName = 'DeFiPositionsControllerV2';

const MESSENGER_EXPOSED_METHODS = ['fetchDeFiPositions'] as const;

/** Delay between polls while Accounts API reports DeFi indexing in progress. */
export const DEFAULT_PROCESSING_POLL_INTERVAL_MS = 5_000;

/**
 * Maximum fetch attempts (including the first) while any account still has
 * `processingDefiPositions: true`. After this, the call resolves and keeps
 * prior state for accounts that never became ready.
 */
export const DEFAULT_PROCESSING_POLL_MAX_ATTEMPTS = 5;

/**
 * @param ms - Milliseconds to wait.
 * @returns A promise that resolves after `ms`.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type DeFiPositionsControllerV2State = {
  /**
   * DeFi positions keyed by internal MetaMask account ID (`InternalAccount.id`,
   * the same key AssetsController uses). Each account maps to a flat list of
   * protocol groups shown in the DeFi tab, each carrying its own `chainId` for
   * filtering plus the details-page sections embedded inside it. This is
   * exactly the shape the client consumes, so no further transformation is
   * needed on read.
   *
   * Named `allDeFiPositionsV2` (rather than `allDeFiPositions`) so it can live
   * alongside the legacy `DeFiPositionsController` in clients that flatten every
   * controller's state into a single object (e.g. the extension background),
   * without colliding on the shared `allDeFiPositions` key.
   */
  allDeFiPositionsV2: DeFiPositionsByAccount;
};

const controllerMetadata: StateMetadata<DeFiPositionsControllerV2State> = {
  allDeFiPositionsV2: {
    includeInStateLogs: false,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
};

export const getDefaultDeFiPositionsControllerV2State =
  (): DeFiPositionsControllerV2State => {
    return {
      allDeFiPositionsV2: {},
    };
  };

export type DeFiPositionsControllerV2GetStateAction = ControllerGetStateAction<
  typeof controllerName,
  DeFiPositionsControllerV2State
>;

export type DeFiPositionsControllerV2Actions =
  | DeFiPositionsControllerV2GetStateAction
  | DeFiPositionsControllerV2MethodActions;

export type DeFiPositionsControllerV2StateChangedEvent =
  ControllerStateChangedEvent<
    typeof controllerName,
    DeFiPositionsControllerV2State
  >;

export type DeFiPositionsControllerV2Events =
  DeFiPositionsControllerV2StateChangedEvent;

/**
 * The external actions available to the {@link DeFiPositionsControllerV2}.
 */
export type AllowedActions =
  AccountTreeControllerGetAccountsFromSelectedAccountGroupAction;

/**
 * The external events available to the {@link DeFiPositionsControllerV2}.
 *
 * None yet — clients must call `fetchDeFiPositions` (and optionally
 * `{ forceRefresh: true }`) on their own triggers. Likely future subscriptions:
 * `AccountTreeController:selectedAccountGroupChange`,
 * `TransactionController:transactionConfirmed`, and `KeyringController:lock`.
 */
export type AllowedEvents = never;

export type DeFiPositionsControllerV2Messenger = Messenger<
  typeof controllerName,
  DeFiPositionsControllerV2Actions | AllowedActions,
  DeFiPositionsControllerV2Events | AllowedEvents
>;

/**
 * Controller that fetches DeFi positions for the selected account group from
 * the Accounts API (v6 multiaccount balances) and stores them in the shape the
 * client consumes directly.
 *
 * Deduplication and freshness are handled by the shared TanStack Query cache on
 * {@link ApiPlatformClient} (balances default `staleTime` is 1 minute). Pass
 * `{ forceRefresh: true }` to bypass that cache for pull-to-refresh.
 *
 * When the API reports `processingDefiPositions` for any account, this
 * controller polls until indexing finishes or the attempt limit is reached.
 * Concurrent calls for the same selected accounts and `vsCurrency` share one
 * in-flight promise so the UI can treat the pending promise as a loading
 * signal. Calls for a different selection or fiat currency start their own
 * fetch and leave any prior poll running, so switching back can join an
 * in-flight fetch for that group and currency.
 */
export class DeFiPositionsControllerV2 extends BaseController<
  typeof controllerName,
  DeFiPositionsControllerV2State,
  DeFiPositionsControllerV2Messenger
> {
  readonly #apiClient: ApiPlatformClient;

  readonly #isEnabled: () => boolean;

  readonly #getVsCurrency: () => string;

  /**
   * In-flight fetches keyed by selected DeFi-queryable account IDs plus
   * `vsCurrency`. Concurrent callers for the same selection and currency share
   * a promise; different selections or fiat currencies keep independent
   * fetches so fast switching can join an earlier matching poll.
   */
  readonly #inFlightFetches = new Map<string, Promise<void>>();

  /**
   * @param options - Constructor options.
   * @param options.messenger - The controller messenger.
   * @param options.apiClient - Accounts API client used to fetch balances/positions. Auth is handled by the client.
   * @param options.isEnabled - Returns whether fetching is enabled (default: () => false).
   * @param options.getVsCurrency - Returns the fiat currency for prices (default: () => 'usd').
   * @param options.state - Initial controller state.
   */
  constructor({
    messenger,
    apiClient,
    isEnabled,
    getVsCurrency,
    state,
  }: {
    messenger: DeFiPositionsControllerV2Messenger;
    apiClient: ApiPlatformClient;
    isEnabled: () => boolean;
    getVsCurrency: () => string;
    state?: Partial<DeFiPositionsControllerV2State>;
  }) {
    super({
      name: controllerName,
      metadata: controllerMetadata,
      messenger,
      state: {
        ...getDefaultDeFiPositionsControllerV2State(),
        ...state,
      },
    });

    this.#apiClient = apiClient;
    this.#isEnabled = isEnabled;
    this.#getVsCurrency = getVsCurrency;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Fetches DeFi positions for the selected account group. Each account key in
   * a ready response replaces that account's state (other accounts stay).
   * Accounts still indexing (`processingDefiPositions`) keep prior state; the
   * method polls (invalidating the balances cache between attempts) until all
   * selected accounts are ready, the attempt limit is reached, or a request
   * fails. Concurrent calls for the same selected accounts and `vsCurrency`
   * share one in-flight promise; calls for a different selection or fiat
   * currency start a new fetch and leave prior polls running so a later
   * switch back can join them. No-ops when disabled or when the group has no
   * supported accounts. Caching / spam prevention is handled by the apiClient
   * TanStack Query cache (keyed by accounts + query options including
   * `vsCurrency`). Pass `{ forceRefresh: true }` to bypass the cache on the
   * first attempt (e.g. pull-to-refresh).
   *
   * @param options - Optional fetch modifiers.
   * @param options.forceRefresh - When true, bypass the apiClient cache on the
   * first attempt and fetch immediately.
   * @returns Resolves when the fetch (and any processing polls) finish.
   */
  async fetchDeFiPositions(options?: {
    forceRefresh?: boolean;
  }): Promise<void> {
    if (!this.#isEnabled()) {
      return;
    }

    const selectedAccounts = this.messenger.call(
      'AccountTreeController:getAccountsFromSelectedAccountGroup',
    );
    const query = buildDeFiBalancesQuery(selectedAccounts);
    const vsCurrency = this.#getVsCurrency().toLowerCase();
    // Include vsCurrency so a fiat change does not join a poll priced in the
    // previous currency (TanStack also keys the balances cache on vsCurrency).
    const inFlightKey = [
      ...[...query.internalAccountIdByCaip.keys()].sort(),
      vsCurrency,
    ].join('\0');

    const existing = this.#inFlightFetches.get(inFlightKey);
    if (existing) {
      await existing;
      return;
    }

    const fetchPromise = this.#fetchDeFiPositions(
      options,
      query,
      vsCurrency,
    ).finally(() => {
      if (this.#inFlightFetches.get(inFlightKey) === fetchPromise) {
        this.#inFlightFetches.delete(inFlightKey);
      }
    });
    this.#inFlightFetches.set(inFlightKey, fetchPromise);

    await fetchPromise;
  }

  async #fetchDeFiPositions(
    options: { forceRefresh?: boolean } | undefined,
    { networks, internalAccountIdByCaip }: DeFiBalancesQuery,
    vsCurrency: string,
  ): Promise<void> {
    if (internalAccountIdByCaip.size === 0 || networks.length === 0) {
      return;
    }

    const accountIds = [...internalAccountIdByCaip.keys()];
    const queryOptions = {
      networks,
      includeDeFiBalances: true,
      forceFetchDeFiPositions: true,
      includePrices: true,
      vsCurrency,
    };

    for (
      let attempt = 0;
      attempt < DEFAULT_PROCESSING_POLL_MAX_ATTEMPTS;
      attempt++
    ) {
      // First attempt respects forceRefresh; later polls always bypass cache
      // so we do not spin on a stale processing snapshot.
      const fetchOptions = {
        ...(options?.forceRefresh || attempt > 0 ? { staleTime: 0 } : {}),
      };

      try {
        const response =
          await this.#apiClient.accounts.fetchV6MultiAccountBalances(
            accountIds,
            queryOptions,
            fetchOptions,
          );

        const processingAccounts = response.accounts.filter(
          (account) => account.processingDefiPositions,
        );
        const readyAccounts = response.accounts.filter(
          (account) => !account.processingDefiPositions,
        );

        if (readyAccounts.length > 0) {
          const positionsByAccount = groupDeFiPositionsV6(
            { ...response, accounts: readyAccounts },
            internalAccountIdByCaip,
          );

          // Last valid response wins per ready account; still-indexing accounts
          // stay untouched.
          this.update((state) => {
            for (const [accountId, positions] of Object.entries(
              positionsByAccount,
            )) {
              state.allDeFiPositionsV2[accountId] = positions;
            }
          });
        }

        if (processingAccounts.length === 0) {
          return;
        }

        const { queryKey } =
          this.#apiClient.accounts.getV6MultiAccountBalancesQueryOptions(
            accountIds,
            queryOptions,
            fetchOptions,
          );
        await this.#apiClient.accounts.queryClient.invalidateQueries({
          queryKey,
        });

        const isLastAttempt =
          attempt >= DEFAULT_PROCESSING_POLL_MAX_ATTEMPTS - 1;
        if (isLastAttempt) {
          return;
        }

        await delay(DEFAULT_PROCESSING_POLL_INTERVAL_MS);
      } catch (error) {
        console.error('Failed to fetch DeFi positions', error);
        return;
      }
    }
  }
}
