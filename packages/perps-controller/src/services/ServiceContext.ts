import type { PerpsControllerState } from '../PerpsController.js';
import type {
  AccountState,
  Order,
  PerpsFeeResolution,
  PerpsGlobalSnapshotRequest,
  PerpsProviderType,
  PerpsSubscriptionFeeWaiverStatus,
  Position,
} from '../types/index.js';

/** Identity and race guards for adopting one provider's global snapshot. */
export type GlobalSnapshotContext = {
  request: PerpsGlobalSnapshotRequest;
  isCurrent: () => boolean;
  isMarketAllowed: (symbol: string) => boolean;
};

/**
 * ServiceContext
 *
 * Lightweight per-call context for Perps services.
 * Contains ONLY data that varies per operation:
 * - Tracing context (provider, network)
 * - Error context (controller, method)
 * - State management callbacks
 * - Query/action callbacks specific to the operation
 *
 * Platform dependencies (logging, metrics, tracing) are injected into service
 * instances via constructor, not passed per-call.
 *
 * Controller-level singletons (RewardsController, NetworkController, messenger)
 * are also injected into services that need them, not passed per-call.
 *
 * This enables:
 * - Clean method signatures (no verbose dependency passing)
 * - Fat services with complete orchestration
 * - Thin controller with pure delegation
 * - Easy testing through mock contexts and constructor injection
 */
export type ServiceContext = {
  /**
   * Tracing context for performance monitoring
   * Used in trace() calls to tag operations
   */
  tracingContext: {
    provider: string;
    isTestnet: boolean;
  };

  /**
   * Error logging context
   * Provides consistent error logging across services
   */
  errorContext: {
    controller: string;
    method: string;
    extra?: Record<string, unknown>;
  };

  /**
   * State management functions (optional)
   * Only provided for operations that need to mutate controller state
   * Example: Trading operations that update lastTransaction
   */
  stateManager?: {
    update: (updater: (state: PerpsControllerState) => void) => void;
    getState: () => PerpsControllerState;
  };

  /**
   * Query functions for dependent data
   * Required by: Operations that need to fetch related data
   */
  getOpenOrders?: () => Promise<Order[]>;
  getPositions?: () => Promise<Position[]>;

  /** @deprecated Supply the venue's context in `globalSnapshots`. */
  globalSnapshot?: GlobalSnapshotContext;

  /**
   * Exact per-call identity and guards for adopting a global market snapshot,
   * one per provider: aggregated mode carries one for each venue. A provider
   * is omitted when its DEX configuration is not static.
   */
  globalSnapshots?: Partial<
    Record<PerpsGlobalSnapshotRequest['provider'], GlobalSnapshotContext>
  >;

  /**
   * Guards a REST account-state write against the venue that currently backs
   * account reads. A response that resolves after the default venue changed
   * must not overwrite the new venue's snapshot, so `isCurrent` compares the
   * response's captured `providerId` with the current account-data context.
   * Omitted for callers that do not route account reads by venue.
   */
  accountDataContext?: {
    isCurrent: (accountState: AccountState) => boolean;
  };

  /**
   * Cached subscription fee-waiver status for read-only fee previews.
   * Read by the controller from `RewardsIntegrationService` — the same cached
   * benefits snapshot the fee resolver uses — and omitted entirely when no
   * subscription source is wired.
   */
  subscriptionFeeWaiver?: PerpsSubscriptionFeeWaiverStatus;

  /**
   * Unified fee resolution for the quote being previewed.
   *
   * Carries the same blended subscription rate the submit path will charge, so
   * a preview quotes what the order actually pays rather than the undiscounted
   * builder fee. Omitted when no resolution was computed.
   */
  feeResolution?: PerpsFeeResolution;

  /**
   * Callback functions for controller-specific operations. `providerId` is
   * the venue the placement was routed to; it keys the persisted trade
   * configuration so a value saved on one venue never applies to another.
   */
  saveTradeConfiguration?: (
    symbol: string,
    leverage: number,
    providerId?: PerpsProviderType,
  ) => void;

  /**
   * Feature flag configuration callbacks
   * Required by: FeatureFlagConfigurationService
   */
  getBlockedRegionList?: () => {
    list: string[];
    source: 'remote' | 'fallback';
  };
  setBlockedRegionList?: (
    list: string[],
    source: 'remote' | 'fallback',
  ) => void;
  getHip3Config?: () => {
    enabled: boolean;
    allowlistMarkets: string[];
    blocklistMarkets: string[];
    source: 'remote' | 'fallback';
  };
  setHip3Config?: (config: {
    enabled?: boolean;
    allowlistMarkets?: string[];
    blocklistMarkets?: string[];
    source: 'remote' | 'fallback';
  }) => void;
  incrementHip3ConfigVersion?: () => number;
  refreshEligibility?: () => Promise<void>;
};
