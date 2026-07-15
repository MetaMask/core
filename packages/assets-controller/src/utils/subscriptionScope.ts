import type { ChainId, DataRequest } from '../types';

/**
 * Build a stable, order-independent key describing the effective scope of a
 * polling subscription (which accounts, on which chains, at which interval,
 * and in which mode). Two subscribe calls that produce the same key would issue
 * an identical fetch, so a data source can use this to detect and skip a
 * redundant immediate fetch when it is torn down and re-created for the same
 * scope (e.g. a chain flapping between the WebSocket source and a polling
 * source).
 *
 * The key intentionally excludes `forceUpdate`: callers that force a refresh
 * always want a fresh fetch and should never be treated as redundant.
 *
 * @param request - The data request for the subscription.
 * @param chains - The chains actually being subscribed (may be a subset of
 * `request.chainIds`).
 * @param pollInterval - The resolved polling interval (ms).
 * @returns A deterministic scope key string.
 */
export function computeSubscriptionScopeKey(
  request: DataRequest,
  chains: ChainId[],
  pollInterval: number,
): string {
  const accounts = request.accountsWithSupportedChains
    .map(({ account, supportedChains }) => {
      const scopedChains = [...supportedChains].sort().join(',');
      return `${account.id}:${account.address.toLowerCase()}:${scopedChains}`;
    })
    .sort()
    .join('|');

  const sortedChains = [...chains].sort().join(',');
  const customAssetsOnly = request.customAssetsOnly === true ? '1' : '0';
  const customAssets = [...(request.customAssets ?? [])].sort().join(',');

  return [
    accounts,
    sortedChains,
    String(pollInterval),
    customAssetsOnly,
    customAssets,
  ].join('#');
}
