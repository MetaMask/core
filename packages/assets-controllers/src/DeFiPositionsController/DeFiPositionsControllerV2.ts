import type { AccountTreeControllerGetAccountsFromSelectedAccountGroupAction } from '@metamask/account-tree-controller';
import { BaseController } from '@metamask/base-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangedEvent,
  StateMetadata,
} from '@metamask/base-controller';
import type { ApiPlatformClient } from '@metamask/core-backend';
import type { Messenger } from '@metamask/messenger';

import {
  buildDeFiBalancesQuery,
  DEFI_BALANCES_V6_REQUEST_OPTIONS,
  toAccountMatchKey,
} from './build-defi-balances-query';
import type { DeFiPositionsControllerV2MethodActions } from './DeFiPositionsControllerV2-method-action-types';
import type { DeFiPositionsByAccount } from './group-defi-positions-v6';
import { groupDeFiPositionsV6 } from './group-defi-positions-v6';

const controllerName = 'DeFiPositionsControllerV2';

const ONE_MINUTE_IN_MS = 60_000;

const MESSENGER_EXPOSED_METHODS = ['fetchDeFiPositions'] as const;

export type {
  DeFiPositionsByAccount,
  DeFiProtocolPositionGroup,
  DeFiPositionDetailsSection,
  DeFiUnderlyingPosition,
  DeFiPositionIconGroupItem,
} from './group-defi-positions-v6';

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
 * None for now. When wiring the controller into a client, events such as
 * `KeyringController:lock`, `TransactionController:transactionConfirmed`, and
 * `AccountTreeController:selectedAccountGroupChange` can be added here and
 * subscribed to in order to trigger/clear fetches.
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
   * In-memory timestamp (ms) of the last fetch per set of accounts.
   *
   * This is a controller-level gate, separate from TanStack's `staleTime` inside
   * `fetchV6MultiAccountBalances`: when the interval has not elapsed we
   * early-return without regrouping or writing state. TanStack still dedupes
   * in-flight HTTP for identical query keys; this Map skips that work entirely.
   *
   * Keyed by sorted CAIP account IDs only (not networks / vsCurrency).
   * Intentionally not persisted: resets on restart, so the first fetch after a
   * restart always goes through.
   */
  readonly #lastFetchByKey = new Map<string, number>();

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
   * Fetches DeFi positions for the selected account group and stores them,
   * shaped for direct client consumption. Everything happens behind this
   * method: resolving the accounts, calling the Accounts API, transforming the
   * response, and updating state.
   *
   * Throttled per set of accounts by an in-memory minimum interval, so repeated
   * calls within the window are no-ops (no HTTP, no regroup, no state write).
   * Disabled controllers and empty account groups return without fetching.
   */
  async fetchDeFiPositions(): Promise<void> {
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
    const throttleKey = [...accountIds].sort().join(',');
    const now = Date.now();
    const lastFetchedAt = this.#lastFetchByKey.get(throttleKey);
    if (
      lastFetchedAt !== undefined &&
      now - lastFetchedAt < this.#minimumFetchIntervalMs
    ) {
      return;
    }
    // Claim the slot before awaiting so a second call that arrives while the
    // first is in flight is also dropped (TanStack would share that promise;
    // we intentionally skip instead).
    this.#lastFetchByKey.set(throttleKey, now);

    try {
      const response =
        await this.#apiClient.accounts.fetchV6MultiAccountBalances(accountIds, {
          networks,
          includeDeFiBalances:
            DEFI_BALANCES_V6_REQUEST_OPTIONS.includeDeFiBalances,
          forceFetchDeFiPositions:
            DEFI_BALANCES_V6_REQUEST_OPTIONS.forceFetchDeFiPositions,
          includePrices: DEFI_BALANCES_V6_REQUEST_OPTIONS.includePrices,
          vsCurrency: this.#getVsCurrency().toLowerCase(),
        });

      // The v6 response echoes a per-chain CAIP-10 ID for every chain
      // (`eip155:1:<addr>`, `eip155:137:<addr>`, ...), while we requested with
      // the all-chains reference (`eip155:0:<addr>`). Match on namespace +
      // address (ignoring the chain reference) so responses map back to the
      // internal account IDs used to key state. Unmatched accounts are skipped.
      const internalAccountIdByMatchKey = new Map<string, string>();
      for (const [caipAccountId, internalId] of internalAccountIdByCaip) {
        internalAccountIdByMatchKey.set(
          toAccountMatchKey(caipAccountId),
          internalId,
        );
      }
      const resolveAccountId = (
        responseAccountId: string,
      ): string | undefined =>
        internalAccountIdByMatchKey.get(toAccountMatchKey(responseAccountId));

      const positionsByAccount = groupDeFiPositionsV6(
        response,
        resolveAccountId,
      );

      this.update((state) => {
        for (const [accountId, positions] of Object.entries(
          positionsByAccount,
        )) {
          state.allDeFiPositionsV2[accountId] = positions;
        }
      });
    } catch (error) {
      // Clear the claim so a failed fetch does not burn the throttle window.
      this.#lastFetchByKey.delete(throttleKey);
      console.error('Failed to fetch DeFi positions', error);
    }

    // TODO: The previous controller emitted position-count analytics via a
    // `trackEvent` hook (see calculate-defi-metrics). Deliberately dropped here;
    // confirm what analytics will be needed before re-adding.
  }
}
