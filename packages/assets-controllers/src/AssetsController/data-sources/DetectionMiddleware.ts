import type { Messenger } from '@metamask/messenger';

import { projectLogger, createModuleLogger } from '../../logger';
import {
  forDataTypes,
  type AccountId,
  type Caip19AssetId,
  type Middleware,
} from '../types';

// ============================================================================
// CONSTANTS
// ============================================================================

const CONTROLLER_NAME = 'DetectionMiddleware';

const log = createModuleLogger(projectLogger, CONTROLLER_NAME);

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
export type DetectionMiddlewareActions = DetectionMiddlewareGetAssetsMiddlewareAction;

export type DetectionMiddlewareMessenger = Messenger<
  typeof CONTROLLER_NAME,
  DetectionMiddlewareActions,
  never
>;

// ============================================================================
// OPTIONS
// ============================================================================

export interface DetectionMiddlewareOptions {
  messenger: DetectionMiddlewareMessenger;
}

// ============================================================================
// DETECTION MIDDLEWARE
// ============================================================================

/**
 * DetectionMiddleware identifies newly discovered assets.
 *
 * This middleware:
 * - Compares assets in the response with assets in state
 * - Assets in response but not in state are considered "detected"
 * - Fills response.detectedAssets with newly detected asset IDs per account
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
   * Get the middleware for detecting new assets.
   */
  get assetsMiddleware(): Middleware {
    return forDataTypes(['balance'], async (ctx, next) => {
      const result = await next(ctx);
      const { response } = result;

      if (!response.assetsBalance) {
        return result;
      }

      const { assetsBalance: stateBalance } = ctx.getAssetsState();
      const detectedAssets: Record<AccountId, Caip19AssetId[]> = {};

      for (const [accountId, accountBalances] of Object.entries(response.assetsBalance)) {
        const stateAccountBalances = stateBalance[accountId] ?? {};
        const detected: Caip19AssetId[] = [];

        for (const assetId of Object.keys(accountBalances as Record<string, unknown>)) {
          // Asset is detected if it's not in state
          if (!stateAccountBalances[assetId as Caip19AssetId]) {
            detected.push(assetId as Caip19AssetId);
          }
        }

        if (detected.length > 0) {
          detectedAssets[accountId] = detected;
        }
      }

      if (Object.keys(detectedAssets).length > 0) {
        response.detectedAssets = detectedAssets;

        log('Detected new assets', {
          accountCount: Object.keys(detectedAssets).length,
          totalAssets: Object.values(detectedAssets).reduce((sum, arr) => sum + arr.length, 0),
          byAccount: Object.fromEntries(
            Object.entries(detectedAssets).map(([accountId, assets]) => [
              accountId,
              { count: assets.length, assets: assets.slice(0, 5) },
            ]),
          ),
        });
      }

      return result;
    });
  }
}
