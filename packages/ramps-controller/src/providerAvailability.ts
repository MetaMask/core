import type { ProviderScope } from './RampsController';
import type { Provider } from './RampsService';

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
 * deposit asset, under the active provider-class scope. This is the pure,
 * asset-aware region gate shared between the controller and headless-buy
 * consumers so the two never disagree about eligibility.
 *
 * Scope `off` is native-only: the region must offer a native provider (e.g.
 * Transak Native) that serves the asset. Scope `in-app` / `all` treats the
 * region as supported when any provider (native or in-app aggregator) serves
 * the asset; the controller's scope-aware `getQuotes` performs the precise
 * in-app provider selection at quote time. Fails closed: an empty or missing
 * `assetId` returns `false`.
 *
 * @param options - The options.
 * @param options.providers - The region's providers (native and aggregator).
 * @param options.assetId - CAIP-19 asset id of the deposit asset.
 * @param options.scope - The effective provider-class scope.
 * @returns Whether the region has a provider serving the asset under scope.
 */
export function regionHasProviderForAsset({
  providers,
  assetId,
  scope,
}: {
  providers: Provider[];
  assetId: string;
  scope: ProviderScope;
}): boolean {
  if (!assetId) {
    return false;
  }
  const serving = getProvidersServingAsset(providers, assetId);
  if (serving.some((provider) => provider.type === 'native')) {
    return true;
  }
  if (scope === 'off') {
    return false;
  }
  return serving.length > 0;
}

/**
 * Whether headless fiat deposit is available for the current region and
 * provider-class scope. Scope-aware and independent of which single provider is
 * currently selected once widened, so the availability gate cannot disagree
 * with the controller's own scope-aware provider pick.
 *
 * Scope `off` keeps the native-only behaviour: a native provider must be the
 * currently selected (preferred) one, since the controller resolves the
 * selected provider first and an aggregator preferred provider would otherwise
 * run a non-native deposit. Scope `in-app` / `all` make the flow available
 * whenever the region has any provider.
 *
 * @param options - The options.
 * @param options.providers - The region's providers.
 * @param options.selectedProvider - The currently selected provider, if any.
 * @param options.scope - The effective provider-class scope.
 * @returns Whether headless fiat deposit is available.
 */
export function isFiatDepositAvailable({
  providers,
  selectedProvider,
  scope,
}: {
  providers: Provider[];
  selectedProvider?: Provider | null;
  scope: ProviderScope;
}): boolean {
  if (selectedProvider?.type === 'native') {
    return true;
  }
  if (scope === 'off') {
    return false;
  }
  return providers.length > 0;
}
