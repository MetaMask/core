import type { RemoteFeatureFlagController } from '@metamask/remote-feature-flag-controller';

type RemoteFeatureFlagControllerOptions = ConstructorParameters<
  typeof RemoteFeatureFlagController
>[0];

/**
 * Per-instance options for the wallet's `RemoteFeatureFlagController`. All
 * fields are optional; see the controller's `init` for the defaults applied
 * when omitted. The wallet injects neutral defaults for `clientConfigApiService`
 * (a network-free service that returns no flags), `getMetaMetricsId` (`''`), and
 * `clientVersion` (`'0.0.0'`) so a headless consumer can pass `{}`. The
 * remaining options merely tune behavior and fall through to the controller's
 * own defaults when omitted.
 */
export type RemoteFeatureFlagControllerInstanceOptions = {
  /**
   * The service that fetches remote feature flags. Clients inject a real
   * `ClientConfigApiService` configured for their client type, distribution,
   * and environment; defaults to a network-free service that returns no flags.
   */
  clientConfigApiService?: RemoteFeatureFlagControllerOptions['clientConfigApiService'];
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
