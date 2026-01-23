import type { Messenger } from '@metamask/messenger';

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
// MESSENGER TYPES
// ============================================================================

/**
 * Action to get the DetectionMiddleware middleware.
 */
export type DetectionMiddlewareGetAssetsMiddlewareAction = {
  type: `${typeof CONTROLLER_NAME}:getAssetsMiddleware`;
  handler: () => Middleware;
};

/**
 * All actions exposed by DetectionMiddleware.
 */
export type DetectionMiddlewareActions =
  DetectionMiddlewareGetAssetsMiddlewareAction;

export type DetectionMiddlewareMessenger = Messenger<
  typeof CONTROLLER_NAME,
  DetectionMiddlewareActions,
  never
>;

// ============================================================================
// OPTIONS
// ============================================================================

export type DetectionMiddlewareOptions = {
  messenger: DetectionMiddlewareMessenger;
};

// ============================================================================
// DETECTION MIDDLEWARE
// ============================================================================

/**
 * DetectionMiddleware identifies assets that do not have metadata.
 *
 * This middleware:
 * - Checks assets in the response for metadata in state
 * - Assets in response but without metadata are considered "detected"
 * - Fills response.detectedAssets with asset IDs per account that lack metadata
 *
 * Usage:
 * ```typescript
 * // Create and initialize (registers messenger actions)
 * const detectionMiddleware = new DetectionMiddleware({ messenger });
 *
 * // Later, get middleware via messenger
 * const middleware = messenger.call('DetectionMiddleware:getAssetsMiddleware');
 * ```
 */
export class DetectionMiddleware {
  readonly name = CONTROLLER_NAME;

  readonly #messenger: DetectionMiddlewareMessenger;

  constructor(options: DetectionMiddlewareOptions) {
    this.#messenger = options.messenger;
    this.#registerActionHandlers();
  }

  #registerActionHandlers(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.#messenger as any).registerActionHandler(
      'DetectionMiddleware:getAssetsMiddleware',
      () => this.assetsMiddleware,
    );
  }

  /**
   * Get the middleware for detecting assets without metadata.
   *
   * This middleware:
   * 1. Extracts the response from context
   * 2. Detects assets from the response that don't have metadata
   * 3. Fills response.detectedAssets with detected asset IDs per account
   * 4. Calls next() to continue the middleware chain
   *
   * @returns The middleware function for the assets pipeline.
   */
  get assetsMiddleware(): Middleware {
    return forDataTypes(['balance'], async (ctx, next) => {
      // Extract response from context
      const { response } = ctx;

      // If no balances in response, nothing to detect - pass through
      if (!response.assetsBalance) {
        return next(ctx);
      }

      // Get metadata from state
      const { assetsMetadata: stateMetadata } = ctx.getAssetsState();

      const detectedAssets: Record<AccountId, Caip19AssetId[]> = {};

      // Detect assets from the response that don't have metadata
      for (const [accountId, accountBalances] of Object.entries(
        response.assetsBalance,
      )) {
        const detected: Caip19AssetId[] = [];

        for (const assetId of Object.keys(
          accountBalances as Record<string, unknown>,
        )) {
          // Asset is detected if it does not have metadata in state
          if (!stateMetadata[assetId as Caip19AssetId]) {
            detected.push(assetId as Caip19AssetId);
          }
        }

        if (detected.length > 0) {
          detectedAssets[accountId] = detected;
        }
      }

      // Fill detectedAssets in the response
      if (Object.keys(detectedAssets).length > 0) {
        response.detectedAssets = detectedAssets;
      }

      // Call next() to continue the middleware chain
      return next(ctx);
    });
  }
}
