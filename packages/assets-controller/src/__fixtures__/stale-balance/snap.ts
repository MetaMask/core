import type { Json } from '@metamask/utils';

/** A balance row as reported by a keyring snap. */
export type SnapBalanceRow = {
  amount: string;
  /** Required by the keyring API's `Balance` struct; unused downstream. */
  unit: string;
  metadata?: Json;
};

/** Mutable, scenario-shaped keyring-snap responses. */
export type StaleBalanceSnapState = {
  /** Asset IDs the snap lists for the account (`keyring_listAccountAssets`). */
  listedAssetIds: string[];
  /**
   * Balances the snap reports for asked-for assets
   * (`keyring_getAccountBalances`). Assets that are asked for but not in
   * this map are skipped by the snap — the ommissions the stale-balance
   * scenarios are about.
   */
  balances: Record<string, SnapBalanceRow>;
  /** When set, every snap call rejects (the snap is unreachable). */
  failAll: boolean;
};

/**
 * Build a mutable, scenario-shaped keyring-snap response state. Tests
 * change fields between passes to move what the snap reports — or break
 * the snap entirely — without rebuilding the messenger actions.
 *
 * @param partial - Initial state.
 * @returns The snap state with defaults filled in.
 */
export function buildSnapState(
  partial: Partial<StaleBalanceSnapState>,
): StaleBalanceSnapState {
  return {
    listedAssetIds: [],
    balances: {},
    failAll: false,
    ...partial,
  };
}

/**
 * Build the `SnapController:handleRequest` action handler for the solana
 * keyring snap, from mutable state.
 *
 * @param state - The snap response state.
 * @returns The handler, answering only `OnKeyringRequest` methods.
 */
export function createSnapHandler(state: StaleBalanceSnapState) {
  return ({
    request,
  }: {
    request?: {
      method?: string;
      params?: { id?: string; assets?: string[] };
    };
  }): Promise<Json> => {
    if (state.failAll) {
      return Promise.reject(new Error('Keyring snap unreachable'));
    }
    const { method } = request ?? {};
    if (method === 'keyring_listAccountAssets') {
      return Promise.resolve([...state.listedAssetIds] as Json);
    }
    if (method === 'keyring_getAccountBalances') {
      const requested = request?.params?.assets;
      if (!requested) {
        return Promise.resolve(
          state.balances as unknown as Record<string, Json> as Json,
        );
      }
      // Only assets the snap actually reports are answered; the rest are
      // skipped, exactly like a snap that omits assets it has no data for.
      const answered = Object.fromEntries(
        requested
          .filter((assetId) => assetId in state.balances)
          .map((assetId) => [assetId, state.balances[assetId]]),
      );
      return Promise.resolve(
        answered as unknown as Record<string, Json> as Json,
      );
    }
    return Promise.resolve(null);
  };
}
