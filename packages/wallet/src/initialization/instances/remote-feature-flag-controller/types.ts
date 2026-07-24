import type { RemoteFeatureFlagController } from '@metamask/remote-feature-flag-controller';

type RemoteFeatureFlagControllerOptions = ConstructorParameters<
  typeof RemoteFeatureFlagController
>[0];

/**
 * Per-instance options for the wallet's `RemoteFeatureFlagController`.
 * `clientConfigApiService` is required; the rest are optional and fall back to
 * the defaults applied in the controller's `init`.
 */
export type RemoteFeatureFlagControllerInstanceOptions = {
  /**
   * The service that fetches remote feature flags. Required: each client
   * injects a `ClientConfigApiService` configured for its own client type,
   * distribution, and environment, so there is no platform-agnostic default.
   */
  clientConfigApiService: RemoteFeatureFlagControllerOptions['clientConfigApiService'];
  /**
   * Returns the current MetaMetrics id, used for user-segmentation thresholds.
   * Defaults to `() => ''`.
   */
  getMetaMetricsId?: RemoteFeatureFlagControllerOptions['getMetaMetricsId'];
  /**
   * The current client version for version-based flag filtering. Must be a
   * valid 3-part SemVer or the controller throws. Defaults to `'0.0.0'`.
   */
  clientVersion?: RemoteFeatureFlagControllerOptions['clientVersion'];
  /**
   * The previously-run client version. When it differs from `clientVersion`,
   * the controller invalidates its cached flags on the next update.
   */
  prevClientVersion?: RemoteFeatureFlagControllerOptions['prevClientVersion'];
  /**
   * Milliseconds before cached flags expire. Defaults to the controller's own
   * default (1 day).
   */
  fetchInterval?: RemoteFeatureFlagControllerOptions['fetchInterval'];
  /**
   * Whether the controller starts disabled. Defaults to `false`. The dynamic
   * enable/disable toggling stays client-side via the controller's exposed
   * `enable`/`disable` actions.
   */
  disabled?: RemoteFeatureFlagControllerOptions['disabled'];
};
