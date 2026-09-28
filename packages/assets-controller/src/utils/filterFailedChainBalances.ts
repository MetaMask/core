import type {
  AssetBalance,
  Caip19AssetId,
  ChainId,
  DataResponse,
} from '../types.js';

/**
 * Remove every balance on a failed chain so balance updates are atomic per
 * chain. A source either contributes its complete chain snapshot or nothing.
 *
 * @param assetsBalance - Balance response to filter.
 * @param failedChainIds - Chains that the source reported as failed.
 * @returns Balances from successful chains, or `undefined` if none remain.
 */
export function filterFailedChainBalances(
  assetsBalance: DataResponse['assetsBalance'],
  failedChainIds: ReadonlySet<ChainId>,
): DataResponse['assetsBalance'] {
  if (!assetsBalance || failedChainIds.size === 0) {
    return assetsBalance;
  }

  const filtered: NonNullable<DataResponse['assetsBalance']> = {};
  for (const [accountId, accountBalances] of Object.entries(assetsBalance)) {
    const successfulBalances = Object.fromEntries(
      Object.entries(accountBalances).filter(
        ([assetId]) => !failedChainIds.has(assetId.split('/')[0] as ChainId),
      ),
    ) as Record<Caip19AssetId, AssetBalance>;

    if (Object.keys(successfulBalances).length > 0) {
      filtered[accountId] = successfulBalances;
    }
  }

  return Object.keys(filtered).length > 0 ? filtered : undefined;
}
