import type { AccountTreeControllerGetAccountsFromSelectedAccountGroupAction } from '@metamask/account-tree-controller';
import { BaseController } from '@metamask/base-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangedEvent,
  StateMetadata,
} from '@metamask/base-controller';
import type { ApiPlatformClient } from '@metamask/core-backend';
import type { Messenger } from '@metamask/messenger';

import { buildDeFiBalancesQuery } from './build-defi-balances-query';
import type { DeFiPositionsControllerV2MethodActions } from './DeFiPositionsControllerV2-method-action-types';
import type { DeFiPositionsByAccount } from './group-defi-positions-v6';
import { groupDeFiPositionsV6 } from './group-defi-positions-v6';

const controllerName = 'DeFiPositionsControllerV2';

const ONE_MINUTE_IN_MS = 60_000;

const MESSENGER_EXPOSED_METHODS = ['fetchDeFiPositions'] as const;

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
 */
export class DeFiPositionsControllerV2 extends BaseController<
  typeof controllerName,
  DeFiPositionsControllerV2State,
  DeFiPositionsControllerV2Messenger
> {
  readonly #apiClient: ApiPlatformClient;

  readonly #isEnabled: () => boolean;

  readonly #getVsCurrency: () => string;

  readonly #minimumFetchIntervalMs: number;

  /**
   * In-memory per-account-set fetch claim (`fetchedAt`, `vsCurrency`,
   * `generation`). Not persisted. See {@link fetchDeFiPositions}.
   */
  readonly #lastFetchByKey = new Map<
    string,
    { fetchedAt: number; vsCurrency: string; generation: number }
  >();

  /**
   * @param options - Constructor options.
   * @param options.messenger - The controller messenger.
   * @param options.apiClient - Accounts API client used to fetch balances/positions. Auth is handled by the client.
   * @param options.isEnabled - Returns whether fetching is enabled (default: () => false).
   * @param options.getVsCurrency - Returns the fiat currency for prices (default: () => 'usd').
   * @param options.minimumFetchIntervalMs - Minimum time between fetches for the same accounts (default: 1 minute).
   * @param options.state - Initial controller state.
   */
  constructor({
    messenger,
    apiClient,
    isEnabled,
    getVsCurrency,
    minimumFetchIntervalMs = ONE_MINUTE_IN_MS,
    state,
  }: {
    messenger: DeFiPositionsControllerV2Messenger;
    apiClient: ApiPlatformClient;
    isEnabled: () => boolean;
    getVsCurrency: () => string;
    minimumFetchIntervalMs?: number;
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
    this.#minimumFetchIntervalMs = minimumFetchIntervalMs;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Fetches DeFi positions for the selected account group and merges them into
   * `allDeFiPositionsV2` (other accounts' cached entries are kept so group
   * switches can reuse TTL'd state). No-ops when disabled, when the group has
   * no supported accounts, or when the same accounts + `vsCurrency` were
   * fetched within `minimumFetchIntervalMs`. Pass `{ forceRefresh: true }` to
   * bypass the throttle (e.g. pull-to-refresh). A `vsCurrency` change for the
   * same accounts also bypasses it.
   *
   * @param options - Optional fetch modifiers.
   * @param options.forceRefresh - When true, bypass the minimum-interval
   * throttle and fetch immediately.
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

    const { networks, internalAccountIdByCaip } =
      buildDeFiBalancesQuery(selectedAccounts);

    if (internalAccountIdByCaip.size === 0 || networks.length === 0) {
      return;
    }

    const accountIds = [...internalAccountIdByCaip.keys()];
    // Stable key so the same account set throttles together regardless of map
    // iteration order.
    const accountsKey = [...accountIds].sort().join(',');
    const vsCurrency = this.#getVsCurrency().toLowerCase();
    const now = Date.now();
    const lastFetch = this.#lastFetchByKey.get(accountsKey);
    if (
      !options?.forceRefresh &&
      lastFetch?.vsCurrency === vsCurrency &&
      now - lastFetch.fetchedAt < this.#minimumFetchIntervalMs
    ) {
      return;
    }
    // Claim before awaiting so a second non-forced call while in flight is
    // dropped. forceRefresh also claims so follow-up non-forced calls stay
    // throttled. Bump generation so overlapping forceRefresh calls discard
    // stale responses that finish out of order.
    const fetchGeneration = (lastFetch?.generation ?? 0) + 1;
    this.#lastFetchByKey.set(accountsKey, {
      fetchedAt: now,
      vsCurrency,
      generation: fetchGeneration,
    });

    try {
      const response =
        await this.#apiClient.accounts.fetchV6MultiAccountBalances(accountIds, {
          networks,
          includeDeFiBalances: true,
          forceFetchDeFiPositions: true,
          includePrices: true,
          vsCurrency,
        });

      if (this.#lastFetchByKey.get(accountsKey)?.generation !== fetchGeneration) {
        // A newer fetch for this account set has already claimed the slot.
        return;
      }

      const positionsByAccount = groupDeFiPositionsV6(
        response,
        internalAccountIdByCaip,
      );

      // Merge by account: replace keys present in this response (including
      // empty lists that clear stale positions) but leave other accounts alone.
      this.update((state) => {
        for (const [accountId, positions] of Object.entries(
          positionsByAccount,
        )) {
          state.allDeFiPositionsV2[accountId] = positions;
        }
      });
    } catch (error) {
      // Only the latest attempt may clear the claim; an older failure must not
      // reopen the throttle window for a newer in-flight or completed fetch.
      if (this.#lastFetchByKey.get(accountsKey)?.generation === fetchGeneration) {
        this.#lastFetchByKey.delete(accountsKey);
      }
      console.error('Failed to fetch DeFi positions', error);
    }
  }
}
