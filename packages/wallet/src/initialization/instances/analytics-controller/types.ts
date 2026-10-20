import type {
  AnalyticsController,
  AnalyticsPlatformAdapter,
} from '@metamask/analytics-controller';

type AnalyticsControllerOptions = ConstructorParameters<
  typeof AnalyticsController
>[0];

/**
 * Per-instance options for the wallet's `AnalyticsController`.
 *
 * `platformAdapter` and `analyticsId` have no platform-agnostic defaults, so
 * every client must supply them. Feature flags default to `false` in the
 * controller when omitted.
 */
export type AnalyticsControllerInstanceOptions = {
  /**
   * Platform-specific Segment (or equivalent) adapter. Required. There is no
   * wallet default because delivery is client-specific.
   */
  platformAdapter: AnalyticsPlatformAdapter;

  /**
   * First-run analytics identifier. Must be a valid UUIDv4 unless the adapter
   * sets `skipUUIDv4Check`. Persisted controller state overrides this value
   * when present.
   */
  analyticsId: string;

  /** When omitted, the controller defaults to `false`. */
  isAnonymousEventsFeatureEnabled?: AnalyticsControllerOptions['isAnonymousEventsFeatureEnabled'];

  /** When omitted, the controller defaults to `false`. */
  isEventQueuePersistenceEnabled?: AnalyticsControllerOptions['isEventQueuePersistenceEnabled'];

  /** When omitted, the controller defaults to `false`. */
  isPreConsentQueueEnabled?: AnalyticsControllerOptions['isPreConsentQueueEnabled'];

  /**
   * When omitted, the controller defaults to `false`. When enabled, hosts must
   * register `GeolocationController` on the wallet root messenger.
   */
  isGeolocationEnabled?: AnalyticsControllerOptions['isGeolocationEnabled'];

  /** When omitted, the controller defaults to `false`. */
  isEventFragmentsEnabled?: AnalyticsControllerOptions['isEventFragmentsEnabled'];
};
