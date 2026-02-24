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
 * DetectionMiddleware builds the set of assets that downstream sources use for
 * metadata and price fetching.
 *
 * This middleware:
 * - Includes every asset that appears in response.assetsBalance (so prices and
 *   metadata are fetched for existing assets as well as new ones)
 * - Includes each account's custom assets from state (so custom tokens get
 *   metadata and prices even when they have no balance yet)
 * - Fills response.detectedAssets with these asset IDs per account
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
   * Get the middleware that builds detectedAssets for metadata and price fetching.
   *
   * This middleware:
   * 1. Includes all assets from response.assetsBalance (so prices are fetched for existing assets too)
   * 2. Merges each account's custom assets from state
   * 3. Fills response.detectedAssets with these asset IDs per account
   *
   * @returns The middleware function for the assets pipeline.
   */
  get assetsMiddleware(): Middleware {
    return forDataTypes(['balance'], async (ctx, next) => {
      const { request, response } = ctx;

      // Get state for custom assets
      const state = ctx.getAssetsState();
      const { customAssets: stateCustomAssets } = state;

      const detectedAssets: Record<AccountId, Caip19AssetId[]> = {};

      // 1. From balance response: include every asset with balance (so prices + metadata path include existing assets)
      if (response.assetsBalance) {
        for (const [accountId, accountBalances] of Object.entries(
          response.assetsBalance,
        )) {
          const detected: Caip19AssetId[] = [];

          for (const assetId of Object.keys(
            accountBalances as Record<string, unknown>,
          )) {
            detected.push(assetId as Caip19AssetId);
          }

          // Merge this account's custom assets from state
          const customForAccount = stateCustomAssets?.[accountId] ?? [];
          for (const assetId of customForAccount) {
            if (!detected.includes(assetId)) {
              detected.push(assetId);
            }
          }

          if (detected.length > 0) {
            detectedAssets[accountId] = detected;
          }
        }
      }

      // 2. Accounts in request that weren't in balance response: include their custom assets
      for (const { account } of request.accountsWithSupportedChains) {
        const accountId = account.id;
        if (detectedAssets[accountId]) {
          continue;
        }
        const customForAccount = stateCustomAssets?.[accountId] ?? [];
        if (customForAccount.length > 0) {
          detectedAssets[accountId] = customForAccount;
        }
      }

      if (Object.keys(detectedAssets).length > 0) {
        response.detectedAssets = detectedAssets;
      }

      return next(ctx);
    });
  }
}
