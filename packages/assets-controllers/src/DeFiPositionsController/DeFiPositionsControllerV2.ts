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
  normalizeCaipAccountId,
} from './build-defi-balances-query';
import type { DeFiPositionsByAccount } from './group-defi-positions-v6';
import { groupDeFiPositionsV6 } from './group-defi-positions-v6';
import type { DeFiPositionsControllerV2MethodActions } from './DeFiPositionsControllerV2-method-action-types';

const controllerName = 'DeFiPositionsControllerV2';

const ONE_MINUTE_IN_MS = 60_000;

const MESSENGER_EXPOSED_METHODS = ['fetchDeFiPositions'] as const;

export type {
  DeFiPositionsByAccount,
  DeFiProtocolPositionGroup,
  DeFiPositionDetailsSection,
  DeFiPositionPoolGroup,
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
   */
  allDeFiPositions: DeFiPositionsByAccount;
};

const controllerMetadata: StateMetadata<DeFiPositionsControllerV2State> = {
  allDeFiPositions: {
    includeInStateLogs: false,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
};

export const getDefaultDeFiPositionsControllerV2State =
  (): DeFiPositionsControllerV2State => {
    return {
      allDeFiPositions: {},
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
   * In-memory timestamp (ms) of the last fetch per query, keyed by the sorted
   * account IDs. Intentionally not persisted: it resets on restart, so the
   * first fetch after a restart always goes through.
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
    isEnabled = (): boolean => false,
    getVsCurrency = (): string => DEFI_BALANCES_V6_REQUEST_OPTIONS.vsCurrency,
    minimumFetchIntervalMs = ONE_MINUTE_IN_MS,
    state,
  }: {
    messenger: DeFiPositionsControllerV2Messenger;
    apiClient: ApiPlatformClient;
    isEnabled?: () => boolean;
    getVsCurrency?: () => string;
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
   * calls within the window are no-ops. Disabled controllers and empty account
   * groups return without fetching.
   */
  async fetchDeFiPositions(): Promise<void> {
    if (!this.#isEnabled()) {
      return;
    }

    const accounts = this.messenger.call(
      'AccountTreeController:getAccountsFromSelectedAccountGroup',
    );

    const {
      accounts: accountQueries,
      accountIds,
      networks,
    } = buildDeFiBalancesQuery(accounts);

    if (accountIds.length === 0 || networks.length === 0) {
      return;
    }

    // The v6 response echoes the CAIP-10 IDs we sent; map them back to the
    // internal account IDs used to key state.
    const internalAccountIdByCaip = new Map(
      accountQueries.map((account) => [
        normalizeCaipAccountId(account.caipAccountId),
        account.internalAccountId,
      ]),
    );
    const resolveAccountId = (responseAccountId: string): string =>
      internalAccountIdByCaip.get(normalizeCaipAccountId(responseAccountId)) ??
      responseAccountId;

    const throttleKey = [...accountIds].sort().join(',');
    const now = Date.now();
    const lastFetchedAt = this.#lastFetchByKey.get(throttleKey);
    if (
      lastFetchedAt !== undefined &&
      now - lastFetchedAt < this.#minimumFetchIntervalMs
    ) {
      return;
    }
    // Mark before awaiting so concurrent calls within the window are throttled.
    this.#lastFetchByKey.set(throttleKey, now);

    try {
      const response = await this.#apiClient.accounts.fetchV6MultiAccountBalances(
        accountIds,
        {
          networks,
          includeDeFiBalances:
            DEFI_BALANCES_V6_REQUEST_OPTIONS.includeDeFiBalances,
          forceFetchDeFiPositions:
            DEFI_BALANCES_V6_REQUEST_OPTIONS.forceFetchDeFiPositions,
          includePrices: DEFI_BALANCES_V6_REQUEST_OPTIONS.includePrices,
          vsCurrency: this.#getVsCurrency().toLowerCase(),
        },
      );

      const positionsByAccount = groupDeFiPositionsV6(
        response,
        resolveAccountId,
      );

      this.update((state) => {
        for (const [accountId, positions] of Object.entries(
          positionsByAccount,
        )) {
          state.allDeFiPositions[accountId] = positions;
        }
      });
    } catch (error) {
      // Allow a retry before the interval elapses when a fetch fails.
      this.#lastFetchByKey.delete(throttleKey);
      console.error('Failed to fetch DeFi positions', error);
    }

    // TODO: The previous controller emitted position-count analytics via a
    // `trackEvent` hook (see calculate-defi-metrics). Deliberately dropped here;
    // confirm with the analytics owners what metrics V2 needs before re-adding.
  }
}
