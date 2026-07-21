import { projectLogger, createModuleLogger } from '../logger';
import { forDataTypes } from '../types';
import type { AccountId, Caip19AssetId, Middleware } from '../types';
import { normalizeAssetId } from '../utils';

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
 * DetectionMiddleware builds the set of assets that downstream sources use for
 * metadata and price fetching.
 *
 * An asset is included in `detectedAssets` only when it is genuinely new:
 * - Assets from `response.assetsBalance` are included only if they are absent
 *   from BOTH `state.assetsBalance` (never tracked before) AND `state.assetsInfo`
 *   (no metadata yet). Assets already present in either collection are considered
 *   known and are intentionally excluded — PriceDataSource's own subscription
 *   handles periodic refreshes for those.
 * - Each account's custom assets from state are always included because they
 *   may have no balance yet and are explicitly managed by the user.
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
   * Get the middleware that builds detectedAssets for metadata and price fetching.
   *
   * This middleware:
   * 1. Includes assets from response.assetsBalance that are absent from both
   *    state.assetsBalance and state.assetsInfo (brand-new assets only)
   * 2. Always includes each account's custom assets from state
   * 3. Fills response.detectedAssets with the resulting asset IDs per account
   * 4. Queues detected assets that lack a price in state on
   *    request.assetsForPriceUpdate so PriceDataSource fetches them in the same
   *    pipeline pass (including the background RPC detection path)
   *
   * @returns The middleware function for the assets pipeline.
   */
  get assetsMiddleware(): Middleware {
    return forDataTypes(['balance'], async (ctx, next) => {
      const { request, response } = ctx;

      // Get state for custom assets, existing balances, and existing metadata
      const state = ctx.getAssetsState();
      const {
        customAssets: stateCustomAssets,
        assetsBalance: stateAssetsBalance,
        assetsInfo: stateAssetsInfo,
        assetsPrice: stateAssetsPrice,
      } = state;

      const detectedAssets: Record<AccountId, Caip19AssetId[]> = {};

      // 1. From balance response: only include assets that are genuinely new —
      //    not already present in state.assetsBalance or state.assetsInfo.
      if (response.assetsBalance) {
        for (const [accountId, accountBalances] of Object.entries(
          response.assetsBalance,
        )) {
          const detected: Caip19AssetId[] = [];

          const stateAccountBalances = stateAssetsBalance[accountId] ?? {};

          for (const assetId of Object.keys(
            accountBalances as Record<string, unknown>,
          )) {
            const caipAssetId = assetId as Caip19AssetId;
            // Skip if already tracked in state balances or already has metadata
            if (
              stateAccountBalances[caipAssetId] !== undefined ||
              stateAssetsInfo[caipAssetId] !== undefined
            ) {
              continue;
            }
            detected.push(caipAssetId);
          }

          // Merge custom assets for this account, applying the same filter:
          // skip if already in state balance or already has metadata.
          const customForAccount = stateCustomAssets?.[accountId] ?? [];
          for (const assetId of customForAccount) {
            if (detected.includes(assetId)) {
              continue;
            }
            if (
              stateAccountBalances[assetId] !== undefined ||
              stateAssetsInfo[assetId] !== undefined
            ) {
              continue;
            }
            detected.push(assetId);
          }

          if (detected.length > 0) {
            detectedAssets[accountId] = detected;
          }
        }
      }

      // 2. Accounts in request that weren't in balance response: include their
      //    custom assets that are not yet in state.
      for (const { account } of request.accountsWithSupportedChains) {
        const accountId = account.id;
        if (detectedAssets[accountId]) {
          continue;
        }
        const stateAccountBalances = stateAssetsBalance[accountId] ?? {};
        const customForAccount = stateCustomAssets?.[accountId] ?? [];
        const newCustomAssets = customForAccount.filter((assetId) => {
          const inBalance = stateAccountBalances[assetId] !== undefined;
          const inInfo = stateAssetsInfo[assetId] !== undefined;
          return !inBalance && !inInfo;
        });
        if (newCustomAssets.length > 0) {
          detectedAssets[accountId] = newCustomAssets;
        }
      }

      if (Object.keys(detectedAssets).length > 0) {
        response.detectedAssets = detectedAssets;

        const prices = stateAssetsPrice as Record<string, unknown>;
        const missingPriceAssets = new Set<Caip19AssetId>();

        for (const accountAssetIds of Object.values(detectedAssets)) {
          for (const assetId of accountAssetIds) {
            const normalizedAssetId = normalizeAssetId(assetId);
            if (
              prices[normalizedAssetId] === undefined &&
              prices[assetId] === undefined
            ) {
              missingPriceAssets.add(normalizedAssetId);
            }
          }
        }

        if (missingPriceAssets.size > 0) {
          request.assetsForPriceUpdate = [
            ...(request.assetsForPriceUpdate ?? []),
            ...missingPriceAssets,
          ];
        }
      }

      return next(ctx);
    });
  }
}
