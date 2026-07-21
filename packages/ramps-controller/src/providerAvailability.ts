import type { Provider } from './RampsService.js';

/**
 * Whether a provider serves the given deposit asset.
 *
 * Mirrors the region-provider matching the controller performs internally: a
 * provider serves the asset when its `supportedCryptoCurrencies` map (keyed by
 * CAIP-19 asset id) contains the asset id, compared case-insensitively on both
 * sides. EVM CAIP-19 asset ids may arrive checksummed or lowercased and the
 * providers API returns both forms, so only the lowercased forms are compared.
 * A provider without a `supportedCryptoCurrencies` map is treated as not
 * serving the asset.
 *
 * @param provider - The provider to test.
 * @param assetId - CAIP-19 asset id of the deposit asset.
 * @returns Whether the provider serves the asset.
 */
export function providerServesAsset(
  provider: Provider,
  assetId: string,
): boolean {
  const map = provider?.supportedCryptoCurrencies;
  if (!map) {
    return false;
  }
  const target = assetId.toLowerCase();
  return Object.keys(map).some((key) => key.toLowerCase() === target);
}

/**
 * Filters a provider list down to those serving the given deposit asset.
 *
 * @param providers - The providers to filter.
 * @param assetId - CAIP-19 asset id of the deposit asset.
 * @returns The subset of providers serving the asset.
 */
export function getProvidersServingAsset(
  providers: Provider[],
  assetId: string,
): Provider[] {
  return providers.filter((provider) => providerServesAsset(provider, assetId));
}

/**
 * Whether a region offers a usable on-ramp provider that serves the given
 * deposit asset, under the all-providers feature flag. This is the pure,
 * asset-aware region gate shared between the controller and headless-buy
 * consumers so the two never disagree about eligibility.
 *
 * With `allProvidersEnabled` false the gate is native-only: the region must
 * offer a native provider (e.g. Transak Native) that serves the asset. With
 * `allProvidersEnabled` true the region is supported when any provider
 * (native or aggregator) serves the asset; the controller's flag-aware
 * `getQuotes` performs the precise provider selection at quote time. Fails
 * closed: an empty or missing `assetId` returns `false`.
 *
 * @param options - The options.
 * @param options.providers - The region's providers (native and aggregator).
 * @param options.assetId - CAIP-19 asset id of the deposit asset.
 * @param options.allProvidersEnabled - Whether the all-providers feature flag
 * is enabled (see `isHeadlessAllProvidersEnabled`).
 * @returns Whether the region has a provider serving the asset.
 */
export function regionHasProviderForAsset({
  providers,
  assetId,
  allProvidersEnabled,
}: {
  providers: Provider[];
  assetId: string;
  allProvidersEnabled: boolean;
}): boolean {
  if (!assetId) {
    return false;
  }
  const serving = getProvidersServingAsset(providers, assetId);
  if (serving.some((provider) => provider.type === 'native')) {
    return true;
  }
  if (!allProvidersEnabled) {
    return false;
  }
  return serving.length > 0;
}

/**
 * Whether headless fiat deposit is available for the current region, under
 * the all-providers feature flag. Flag-aware and independent of which single
 * provider is currently selected once widened, so the availability gate
 * cannot disagree with the controller's own flag-aware provider pick.
 *
 * With `allProvidersEnabled` false the check keeps the native-only behaviour:
 * a native provider must be the currently selected (preferred) one, since the
 * controller resolves the selected provider first and an aggregator preferred
 * provider would otherwise run a non-native deposit. With
 * `allProvidersEnabled` true the flow is available whenever the region has
 * any provider.
 *
 * @param options - The options.
 * @param options.providers - The region's providers.
 * @param options.selectedProvider - The currently selected provider, if any.
 * @param options.allProvidersEnabled - Whether the all-providers feature flag
 * is enabled (see `isHeadlessAllProvidersEnabled`).
 * @returns Whether headless fiat deposit is available.
 */
export function isFiatDepositAvailable({
  providers,
  selectedProvider,
  allProvidersEnabled,
}: {
  providers: Provider[];
  selectedProvider?: Provider | null;
  allProvidersEnabled: boolean;
}): boolean {
  if (selectedProvider?.type === 'native') {
    return true;
  }
  if (!allProvidersEnabled) {
    return false;
  }
  return providers.length > 0;
}
