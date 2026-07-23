import type { FeatureFlags } from '@metamask/remote-feature-flag-controller';
import type { Json } from '@metamask/utils';

/**
 * Remote (LaunchDarkly) feature flag key for the Headless Buy all-providers
 * expansion. Accepts two value forms:
 *
 * - The literal boolean `true` widens the headless fiat quote path to every
 *   provider class (native, in-app WebView aggregator, and external-browser /
 *   custom-action) with no provider restriction.
 * - An object payload `{ enabled: true, providerIds?: string[], surfaces?:
 *   Record<string, string[]> }` widens the same way, and additionally
 *   restricts the widened quote pick to the listed provider ids (see
 *   {@link getHeadlessProviderAllowlist}).
 *
 * `false`, a missing flag, or any other value keeps the native-only default.
 * Clients that only understand the boolean form coerce the object payload to
 * "disabled" (native-only), so serving the object form can never turn the
 * feature on for a client that cannot parse it. Exported so the flag registry
 * and every consumer stay in sync on the exact key string.
 */
export const MONEY_HEADLESS_ALL_PROVIDERS_FLAG_KEY =
  'moneyHeadlessAllProviders';

/**
 * Contract version of the object payload. An enabled payload whose
 * `featureVersion` differs (or is absent) fails closed, so the payload's
 * meaning can change in a future client without old clients misreading it.
 * Mirrors the platform pattern used by `assetsUnifyState`.
 */
export const HEADLESS_ALL_PROVIDERS_FEATURE_VERSION = '1';

/**
 * Canonical surface keys accepted in the flag payload's `surfaces` map. A
 * surface entry overrides the top-level `providerIds` list for quote requests
 * tagged with that surface.
 */
export const HEADLESS_ALLOWLIST_SURFACES = {
  MONEY: 'money',
  PERPS: 'perps',
  PREDICTIONS: 'predictions',
} as const;

/**
 * A canonical surface key of the flag payload's `surfaces` map.
 */
export type HeadlessAllowlistSurface =
  (typeof HEADLESS_ALLOWLIST_SURFACES)[keyof typeof HEADLESS_ALLOWLIST_SURFACES];

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
 * Resolves the flag value with `localOverrides` (written by dev-only override
 * screens) merged over `remoteFeatureFlags`, because not every published
 * `RemoteFeatureFlagController` version folds overrides into
 * `remoteFeatureFlags` state; when a version already does, the merge is a
 * no-op.
 *
 * @param remoteFeatureFlagState - `RemoteFeatureFlagController` state (or the
 * relevant subset of it).
 * @returns The merged flag value, or `undefined` when absent.
 */
function resolveFlagValue(
  remoteFeatureFlagState: HeadlessFeatureFlagsLookup | null | undefined,
): Json | undefined {
  const flags: FeatureFlags = {
    ...(remoteFeatureFlagState?.remoteFeatureFlags ?? {}),
    ...(remoteFeatureFlagState?.localOverrides ?? {}),
  };
  return flags[MONEY_HEADLESS_ALL_PROVIDERS_FLAG_KEY];
}

/**
 * Whether a flag value is the object payload form: a plain object (not an
 * array) whose `enabled` is the literal boolean `true`. Anything else,
 * including `{ enabled: false }` and objects without `enabled`, is not an
 * enabled payload, so the flag fails closed.
 *
 * @param value - The merged flag value.
 * @returns Whether the value is an enabled object payload.
 */
function isEnabledPayload(value: Json | undefined): value is {
  [key: string]: Json;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    value.enabled === true &&
    value.featureVersion === HEADLESS_ALL_PROVIDERS_FEATURE_VERSION
  );
}

/**
 * The `minimumVersion` carried by an enabled payload, or `undefined` for the
 * boolean form, a disabled payload, or a malformed field. This package cannot
 * compare app versions itself; mobile validates the value through its shared
 * `validatedVersionGatedFeatureFlag` util, and the LaunchDarkly `versions`
 * wrapper provides the server-side gate.
 *
 * @param remoteFeatureFlagState - `RemoteFeatureFlagController` state (or the
 * relevant subset of it).
 * @returns The minimum app version the payload declares, or `undefined`.
 */
export function getHeadlessAllProvidersMinimumVersion(
  remoteFeatureFlagState: HeadlessFeatureFlagsLookup | null | undefined,
): string | undefined {
  const value = resolveFlagValue(remoteFeatureFlagState);
  if (!isEnabledPayload(value)) {
    return undefined;
  }
  const { minimumVersion } = value;
  return typeof minimumVersion === 'string' && minimumVersion.trim() !== ''
    ? minimumVersion
    : undefined;
}

/**
 * Coerces a payload field into a provider-id list: keeps only string entries,
 * trims them, and drops empties. An empty or malformed level is treated as
 * "not provided" so resolution falls through to the next level rather than
 * restricting to nothing; to force "nothing eligible" list a nonexistent id.
 *
 * @param value - The candidate `providerIds` / surface entry value.
 * @returns The non-empty coerced list, or `undefined`.
 */
function coerceProviderIdList(value: Json | undefined): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const ids = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  return ids.length > 0 ? ids : undefined;
}

/**
 * Whether the Headless Buy all-providers feature flag is enabled.
 *
 * Owns the key lookup and coercion for {@link MONEY_HEADLESS_ALL_PROVIDERS_FLAG_KEY}
 * so the controller's quote widening and UI availability gates resolve the
 * flag identically. `localOverrides` are merged over `remoteFeatureFlags`
 * (see {@link resolveFlagValue}). Coerces defensively: only the literal
 * boolean `true` or an object payload whose `enabled` is the literal `true`
 * enables; any other value (missing, string, number, array, `{ enabled:
 * false }`) resolves to `false`.
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
  const value = resolveFlagValue(remoteFeatureFlagState);
  return value === true || isEnabledPayload(value);
}

/**
 * The provider-id allowlist carried by the flag's object payload, or
 * `undefined` when the widened pick should not be restricted.
 *
 * Resolution, most specific first:
 *
 * 1. When `surface` is given and the payload's `surfaces[surface]` is a
 *    non-empty valid list, that list wins.
 * 2. Otherwise the payload's top-level `providerIds`, when non-empty and
 *    valid.
 * 3. Otherwise `undefined` (no restriction). The boolean `true` form, a
 *    disabled or malformed payload, and empty or all-invalid lists all land
 *    here; unknown keys and non-string entries are ignored.
 *
 * Note that `surfaces` entries only apply to quote requests tagged with a
 * `surface`; a request without one (for example MM Pay's `getRampsQuote`)
 * resolves the top-level `providerIds` list only.
 *
 * @param remoteFeatureFlagState - `RemoteFeatureFlagController` state (or the
 * relevant subset of it). May be `null`/`undefined` before the controller is
 * initialized.
 * @param surface - Optional consumer surface key; canonical values are the
 * {@link HEADLESS_ALLOWLIST_SURFACES} members.
 * @returns The provider ids the widened pick is restricted to, or `undefined`
 * for no restriction.
 */
export function getHeadlessProviderAllowlist(
  remoteFeatureFlagState: HeadlessFeatureFlagsLookup | null | undefined,
  surface?: string,
): string[] | undefined {
  const value = resolveFlagValue(remoteFeatureFlagState);
  if (!isEnabledPayload(value)) {
    return undefined;
  }

  if (surface !== undefined) {
    const { surfaces } = value;
    if (
      typeof surfaces === 'object' &&
      surfaces !== null &&
      !Array.isArray(surfaces)
    ) {
      const surfaceList = coerceProviderIdList(surfaces[surface]);
      if (surfaceList) {
        return surfaceList;
      }
    }
  }

  return coerceProviderIdList(value.providerIds);
}

/**
 * Normalizes a provider id for allowlist matching only: trims, strips the
 * canonical `/providers/` path prefix, and lowercases, so `/providers/moonpay`
 * and `moonpay` match each other. Quote and catalog provider ids are matched
 * as-is everywhere else; this exists solely so LaunchDarkly payload authors
 * can use either id form. Not exported from the package index.
 *
 * @param id - A provider id in either the prefixed or bare form.
 * @returns The normalized id used for allowlist comparison.
 */
export function normalizeHeadlessProviderId(id: string): string {
  return id
    .trim()
    .replace(/^\/providers\//u, '')
    .toLowerCase();
}
