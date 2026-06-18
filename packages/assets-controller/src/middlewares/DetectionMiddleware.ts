import { projectLogger, createModuleLogger } from '../logger';
import { forDataTypes } from '../types';
import type { AccountId, Caip19AssetId, Middleware } from '../types';

// ============================================================================
// CONSTANTS
// ============================================================================

const CONTROLLER_NAME = 'DetectionMiddleware';

// Logger for debugging
createModuleLogger(projectLogger, CONTROLLER_NAME);

// ============================================================================
// DETECTION MIDDLEWARE
// ============================================================================

/**
 * DetectionMiddleware builds the set of newly detected assets that downstream
 * sources use for one-off metadata and price fetching.
 *
 * "Detected" means new relative to the AssetsController state: an asset is only
 * reported for an account when it is not already tracked in
 * `state.assetsBalance[accountId]`. Assets already known to the controller are
 * excluded so that:
 * - `AssetsController:assetsDetected` events only fire for genuinely new assets
 * - prices/metadata are fetched once for new assets (recurring price refreshes
 *   are handled by the price subscription, not by this detection path)
 *
 * This middleware:
 * - Includes assets from response.assetsBalance that are not yet in state
 * - Includes each account's custom assets from state that are not yet tracked
 *   (so newly added custom tokens get metadata and prices before they have a
 *   balance entry)
 * - Fills response.detectedAssets with these new asset IDs per account
 *
 * TokenDataSource and PriceDataSource both key off detectedAssets. TokenDataSource
 * then filters to only fetch metadata for assets that lack it; PriceDataSource
 * fetches prices for all detected assets.
 *
 * Usage:
 * ```typescript
 * const detectionMiddleware = new DetectionMiddleware();
 * const middleware = detectionMiddleware.assetsMiddleware;
 * ```
 */
export class DetectionMiddleware {
  readonly name = CONTROLLER_NAME;

  getName(): string {
    return this.name;
  }

  /**
   * Get the middleware that builds detectedAssets for one-off metadata and
   * price fetching.
   *
   * This middleware:
   * 1. Includes assets from response.assetsBalance that are not already tracked
   *    in state (`state.assetsBalance[accountId]`)
   * 2. Merges each account's custom assets from state that are not yet tracked
   * 3. Fills response.detectedAssets with these new asset IDs per account
   *
   * @returns The middleware function for the assets pipeline.
   */
  get assetsMiddleware(): Middleware {
    return forDataTypes(['balance'], async (ctx, next) => {
      const { request, response } = ctx;

      // Get state to compare against already-tracked assets
      const state = ctx.getAssetsState();
      const { customAssets: stateCustomAssets, assetsBalance: stateBalances } =
        state;

      const detectedAssets: Record<AccountId, Caip19AssetId[]> = {};

      // Returns the set of asset IDs already tracked for an account in state.
      const getKnownAssets = (accountId: AccountId): Set<Caip19AssetId> =>
        new Set(
          Object.keys(stateBalances?.[accountId] ?? {}) as Caip19AssetId[],
        );

      // 1. From balance response: include only assets that are new relative to state
      if (response.assetsBalance) {
        for (const [accountId, accountBalances] of Object.entries(
          response.assetsBalance,
        )) {
          const knownAssets = getKnownAssets(accountId);
          const detected: Caip19AssetId[] = [];

          for (const assetId of Object.keys(
            accountBalances as Record<string, unknown>,
          ) as Caip19AssetId[]) {
            if (!knownAssets.has(assetId)) {
              detected.push(assetId);
            }
          }

          // Merge this account's custom assets from state that aren't tracked yet
          const customForAccount = stateCustomAssets?.[accountId] ?? [];
          for (const assetId of customForAccount) {
            if (!knownAssets.has(assetId) && !detected.includes(assetId)) {
              detected.push(assetId);
            }
          }

          if (detected.length > 0) {
            detectedAssets[accountId] = detected;
          }
        }
      }

      // 2. Accounts in request that weren't in balance response: include their
      //    custom assets that are not already tracked in state
      for (const { account } of request.accountsWithSupportedChains) {
        const accountId = account.id;
        if (detectedAssets[accountId]) {
          continue;
        }
        const knownAssets = getKnownAssets(accountId);
        const newCustomAssets = (stateCustomAssets?.[accountId] ?? []).filter(
          (assetId) => !knownAssets.has(assetId),
        );
        if (newCustomAssets.length > 0) {
          detectedAssets[accountId] = newCustomAssets;
        }
      }

      if (Object.keys(detectedAssets).length > 0) {
        response.detectedAssets = detectedAssets;
      }

      return next(ctx);
    });
  }
}
