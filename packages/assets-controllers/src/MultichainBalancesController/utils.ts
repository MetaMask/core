import type { MultichainAccountBalance } from './MultichainBalancesController';

/**
 * Merges an incoming balance row onto an existing cached row, preserving fields
 * such as `extra` when the incoming update omits them.
 *
 * @param existing - Prior cached balance row.
 * @param incoming - New balance fields to apply.
 * @returns The merged balance row.
 */
export function mergeBalanceRow(
  existing: MultichainAccountBalance,
  incoming: Partial<MultichainAccountBalance>,
): MultichainAccountBalance {
  return {
    ...existing,
    ...incoming,
  };
}

/**
 * Merges incoming per-asset balance rows into a cached account balance map.
 *
 * @param previous - Prior cached balances for the account.
 * @param incoming - Per-asset balance rows to merge in.
 * @returns The merged account balance map.
 */
export function mergeAccountBalances(
  previous: Record<string, MultichainAccountBalance>,
  incoming: Record<string, Partial<MultichainAccountBalance>>,
): Record<string, MultichainAccountBalance> {
  const merged = { ...previous };

  for (const [assetId, balance] of Object.entries(incoming)) {
    merged[assetId] = mergeBalanceRow(
      merged[assetId] ?? { amount: '0', unit: '' },
      balance,
    );
  }

  return merged;
}
