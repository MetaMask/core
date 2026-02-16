import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';

import type {
  ComplianceServiceCheckWalletComplianceAction,
  ComplianceServiceCheckWalletsComplianceAction,
  ComplianceServiceFetchBlockedWalletsAction,
} from './ComplianceService';
import type { BlockedWalletsInfo, WalletComplianceStatus } from './types';

// === GENERAL ===

/**
 * The name of the {@link ComplianceController}, used to namespace the
 * controller's actions and events and to namespace the controller's state data
 * when composed with other controllers.
 */
export const controllerName = 'ComplianceController';

/**
 * The default refresh interval for the blocked wallets list (1 hour).
 */
const DEFAULT_BLOCKED_WALLETS_REFRESH_INTERVAL = 60 * 60 * 1000;

// === STATE ===

/**
 * Describes the shape of the state object for {@link ComplianceController}.
 */
export type ComplianceControllerState = {
  /**
   * A map of wallet addresses to their on-demand compliance check results.
   */
  walletComplianceStatusMap: Record<string, WalletComplianceStatus>;

  /**
   * Information about all blocked wallets, or `null` if not yet fetched.
   */
  blockedWallets: BlockedWalletsInfo | null;

  /**
   * Timestamp (in milliseconds) of the last blocked wallets fetch, or 0 if
   * never fetched.
   */
  blockedWalletsLastFetched: number;

  /**
   * The date/time (in ISO-8601 format) when the last compliance check was
   * performed, or `null` if no checks have been performed yet.
   */
  lastCheckedAt: string | null;
};

/**
 * The metadata for each property in {@link ComplianceControllerState}.
 */
const complianceControllerMetadata = {
  walletComplianceStatusMap: {
    includeInDebugSnapshot: false,
    includeInStateLogs: false,
    persist: true,
    usedInUi: true,
  },
  blockedWallets: {
    includeInDebugSnapshot: false,
    includeInStateLogs: false,
    persist: true,
    usedInUi: false,
  },
  blockedWalletsLastFetched: {
    includeInDebugSnapshot: false,
    includeInStateLogs: true,
    persist: true,
    usedInUi: false,
  },
  lastCheckedAt: {
    includeInDebugSnapshot: false,
    includeInStateLogs: true,
    persist: true,
    usedInUi: false,
  },
} satisfies StateMetadata<ComplianceControllerState>;

/**
 * Constructs the default {@link ComplianceController} state. This allows
 * consumers to provide a partial state object when initializing the controller
 * and also helps in constructing complete state objects for this controller in
 * tests.
 *
 * @returns The default {@link ComplianceController} state.
 */
export function getDefaultComplianceControllerState(): ComplianceControllerState {
  return {
    walletComplianceStatusMap: {},
    blockedWallets: null,
    blockedWalletsLastFetched: 0,
    lastCheckedAt: null,
  };
}

// === ACTION TYPES ===

/**
 * Initializes the controller by fetching the blocked wallets list if it is
 * missing or stale.
 */
export type ComplianceControllerInitializeAction = {
  type: `ComplianceController:initialize`;
  handler: ComplianceController['initialize'];
};

/**
 * Checks compliance status for a single wallet address and persists the
 * result to state.
 */
export type ComplianceControllerCheckWalletComplianceAction = {
  type: `ComplianceController:checkWalletCompliance`;
  handler: ComplianceController['checkWalletCompliance'];
};

/**
 * Checks compliance status for multiple wallet addresses and persists the
 * results to state.
 */
export type ComplianceControllerCheckWalletsComplianceAction = {
  type: `ComplianceController:checkWalletsCompliance`;
  handler: ComplianceController['checkWalletsCompliance'];
};

/**
 * Fetches the full list of blocked wallets and persists the data to state.
 */
export type ComplianceControllerFetchBlockedWalletsAction = {
  type: `ComplianceController:fetchBlockedWallets`;
  handler: ComplianceController['fetchBlockedWallets'];
};

/**
 * Returns whether a wallet address is blocked, based on the cached blocklist.
 */
export type ComplianceControllerIsWalletBlockedAction = {
  type: `ComplianceController:isWalletBlocked`;
  handler: ComplianceController['isWalletBlocked'];
};

/**
 * Clears all compliance data from state.
 */
export type ComplianceControllerClearComplianceStateAction = {
  type: `ComplianceController:clearComplianceState`;
  handler: ComplianceController['clearComplianceState'];
};

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = [
  'initialize',
  'checkWalletCompliance',
  'checkWalletsCompliance',
  'fetchBlockedWallets',
  'isWalletBlocked',
  'clearComplianceState',
] as const;

/**
 * Retrieves the state of the {@link ComplianceController}.
 */
export type ComplianceControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  ComplianceControllerState
>;

/**
 * Actions that {@link ComplianceController} exposes to other consumers.
 */
export type ComplianceControllerActions =
  | ComplianceControllerGetStateAction
  | ComplianceControllerInitializeAction
  | ComplianceControllerCheckWalletComplianceAction
  | ComplianceControllerCheckWalletsComplianceAction
  | ComplianceControllerFetchBlockedWalletsAction
  | ComplianceControllerIsWalletBlockedAction
  | ComplianceControllerClearComplianceStateAction;

/**
 * Actions from other messengers that {@link ComplianceController} calls.
 */
type AllowedActions =
  | ComplianceServiceCheckWalletComplianceAction
  | ComplianceServiceCheckWalletsComplianceAction
  | ComplianceServiceFetchBlockedWalletsAction;

/**
 * Published when the state of {@link ComplianceController} changes.
 */
export type ComplianceControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  ComplianceControllerState
>;

/**
 * Events that {@link ComplianceController} exposes to other consumers.
 */
export type ComplianceControllerEvents = ComplianceControllerStateChangeEvent;

/**
 * Events from other messengers that {@link ComplianceController} subscribes to.
 */
type AllowedEvents = never;

/**
 * The messenger restricted to actions and events accessed by
 * {@link ComplianceController}.
 */
export type ComplianceControllerMessenger = Messenger<
  typeof controllerName,
  ComplianceControllerActions | AllowedActions,
  ComplianceControllerEvents | AllowedEvents
>;

// === CONTROLLER DEFINITION ===

/**
 * `ComplianceController` manages OFAC compliance state for wallet addresses.
 * It proactively fetches and caches the blocked wallets list from the
 * Compliance API so that consumers can perform synchronous lookups via
 * `isWalletBlocked` without making API calls.
 */
export class ComplianceController extends BaseController<
  typeof controllerName,
  ComplianceControllerState,
  ComplianceControllerMessenger
> {
  /**
   * The interval (in milliseconds) after which the blocked wallets list
   * is considered stale.
   */
  readonly #blockedWalletsRefreshInterval: number;

  /**
   * Constructs a new {@link ComplianceController}.
   *
   * @param args - The constructor arguments.
   * @param args.messenger - The messenger suited for this controller.
   * @param args.state - The desired state with which to initialize this
   * controller. Missing properties will be filled in with defaults.
   * @param args.blockedWalletsRefreshInterval - The interval in milliseconds
   * after which the blocked wallets list is considered stale. Defaults to 1
   * hour.
   */
  constructor({
    messenger,
    state,
    blockedWalletsRefreshInterval = DEFAULT_BLOCKED_WALLETS_REFRESH_INTERVAL,
  }: {
    messenger: ComplianceControllerMessenger;
    state?: Partial<ComplianceControllerState>;
    blockedWalletsRefreshInterval?: number;
  }) {
    super({
      messenger,
      metadata: complianceControllerMetadata,
      name: controllerName,
      state: {
        ...getDefaultComplianceControllerState(),
        ...state,
      },
    });

    this.#blockedWalletsRefreshInterval = blockedWalletsRefreshInterval;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Initializes the controller by fetching the blocked wallets list if it
   * is missing or stale. Call once after construction to ensure the blocklist
   * is ready for `isWalletBlocked` lookups.
   */
  async initialize(): Promise<void> {
    if (this.#isBlockedWalletsStale()) {
      await this.fetchBlockedWallets();
    }
  }

  /**
   * Checks compliance status for a single wallet address via the API and
   * persists the result to state.
   *
   * @param address - The wallet address to check.
   * @returns The compliance status of the wallet.
   */
  async checkWalletCompliance(
    address: string,
  ): Promise<WalletComplianceStatus> {
    const result = await this.messenger.call(
      'ComplianceService:checkWalletCompliance',
      address,
    );

    const now = new Date().toISOString();
    const status: WalletComplianceStatus = {
      address: result.address,
      blocked: result.blocked,
      checkedAt: now,
    };

    this.update((draftState) => {
      draftState.walletComplianceStatusMap[address] = status;
      draftState.lastCheckedAt = now;
    });

    return status;
  }

  /**
   * Checks compliance status for multiple wallet addresses via the API and
   * persists the results to state.
   *
   * @param addresses - The wallet addresses to check.
   * @returns The compliance statuses of the wallets.
   */
  async checkWalletsCompliance(
    addresses: string[],
  ): Promise<WalletComplianceStatus[]> {
    const results = await this.messenger.call(
      'ComplianceService:checkWalletsCompliance',
      addresses,
    );

    const now = new Date().toISOString();
    const statuses: WalletComplianceStatus[] = results.map((result) => ({
      address: result.address,
      blocked: result.blocked,
      checkedAt: now,
    }));

    this.update((draftState) => {
      for (const status of statuses) {
        draftState.walletComplianceStatusMap[status.address] = status;
      }
      draftState.lastCheckedAt = now;
    });

    return statuses;
  }

  /**
   * Fetches the full list of blocked wallets from the API and persists the
   * data to state. This also updates the `blockedWalletsLastFetched` timestamp.
   *
   * @returns The blocked wallets information.
   */
  async fetchBlockedWallets(): Promise<BlockedWalletsInfo> {
    const result = await this.messenger.call(
      'ComplianceService:fetchBlockedWallets',
    );

    const now = new Date().toISOString();
    const blockedWallets: BlockedWalletsInfo = {
      addresses: result.addresses,
      sources: result.sources,
      lastUpdated: result.lastUpdated,
      fetchedAt: now,
    };

    this.update((draftState) => {
      draftState.blockedWallets = blockedWallets;
      draftState.blockedWalletsLastFetched = Date.now();
      draftState.lastCheckedAt = now;
    });

    return blockedWallets;
  }

  /**
   * Returns whether a wallet address is blocked, based on the cached
   * blocklist. This is a synchronous lookup that does not make any API calls.
   *
   * The lookup checks the proactively fetched blocklist first, then falls
   * back to the per-address compliance status map for addresses checked
   * via `checkWalletCompliance` or `checkWalletsCompliance`.
   *
   * @param address - The wallet address to check.
   * @returns `true` if the wallet is blocked according to cached data,
   * `false` otherwise.
   */
  isWalletBlocked(address: string): boolean {
    // Check the proactively fetched blocklist first
    if (this.state.blockedWallets?.addresses.includes(address)) {
      return true;
    }

    // Fall back to per-address compliance status map
    const status = this.state.walletComplianceStatusMap[address];
    return status?.blocked ?? false;
  }

  /**
   * Clears all compliance data from state.
   */
  clearComplianceState(): void {
    this.update((draftState) => {
      draftState.walletComplianceStatusMap = {};
      draftState.blockedWallets = null;
      draftState.blockedWalletsLastFetched = 0;
      draftState.lastCheckedAt = null;
    });
  }

  /**
   * Determines whether the blocked wallets list is stale and needs to be
   * refreshed.
   *
   * @returns `true` if the list has never been fetched or the refresh
   * interval has elapsed.
   */
  #isBlockedWalletsStale(): boolean {
    return (
      Date.now() - this.state.blockedWalletsLastFetched >=
      this.#blockedWalletsRefreshInterval
    );
  }
}
