import type { FeatureFlags } from '@metamask/remote-feature-flag-controller';

/**
 * Remote (LaunchDarkly) feature flag key for the Headless Buy all-providers
 * expansion. A boolean flag: `true` widens the headless fiat quote path to
 * every provider class (native, in-app WebView aggregator, and
 * external-browser / custom-action); `false` or missing keeps the native-only
 * default. Exported so the flag registry and every consumer stay in sync on
 * the exact key string.
 */
export const MONEY_HEADLESS_ALL_PROVIDERS_FLAG_KEY =
  'moneyHeadlessAllProviders';

/**
 * The subset of `RemoteFeatureFlagController` state that
 * {@link isHeadlessAllProvidersEnabled} reads. Structural so consumers can
 * pass the whole controller state (or `undefined` before initialization)
 * without depending on a specific controller version.
 */
export type HeadlessFeatureFlagsLookup = {
  remoteFeatureFlags?: FeatureFlags;
  localOverrides?: FeatureFlags;
};

/**
 * Whether the Headless Buy all-providers feature flag is enabled.
 *
 * Owns the key lookup and coercion for {@link MONEY_HEADLESS_ALL_PROVIDERS_FLAG_KEY}
 * so the controller's quote widening and UI availability gates resolve the
 * flag identically. `localOverrides` (written by dev-only override screens)
 * are merged over `remoteFeatureFlags`, because not every published
 * `RemoteFeatureFlagController` version folds overrides into
 * `remoteFeatureFlags` state; when a version already does, the merge is a
 * no-op. Coerces defensively: only the literal boolean `true` enables, and
 * any other value (missing, string, object) resolves to `false`.
 *
 * @param remoteFeatureFlagState - `RemoteFeatureFlagController` state (or the
 * relevant subset of it). May be `null`/`undefined` before the controller is
 * initialized.
 * @returns Whether all provider classes are enabled for the headless fiat
 * quote path.
 */
export function isHeadlessAllProvidersEnabled(
  remoteFeatureFlagState: HeadlessFeatureFlagsLookup | null | undefined,
): boolean {
  const flags: FeatureFlags = {
    ...(remoteFeatureFlagState?.remoteFeatureFlags ?? {}),
    ...(remoteFeatureFlagState?.localOverrides ?? {}),
  };
  return flags[MONEY_HEADLESS_ALL_PROVIDERS_FLAG_KEY] === true;
}
