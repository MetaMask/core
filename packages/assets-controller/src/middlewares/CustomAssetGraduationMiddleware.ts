import { KnownCaipNamespace } from '@metamask/utils';

import { projectLogger, createModuleLogger } from '../logger';
import { forDataTypes } from '../types';
import type { AccountId, Caip19AssetId, Middleware } from '../types';
import { normalizeAssetId } from '../utils';

const CONTROLLER_NAME = 'CustomAssetGraduationMiddleware';

const log = createModuleLogger(projectLogger, CONTROLLER_NAME);

export type CustomAssetGraduationMiddlewareOptions = {
  getSelectedAccountId: () => AccountId | undefined;
  removeCustomAsset: (accountId: AccountId, assetId: Caip19AssetId) => void;
};

/**
 * CustomAssetGraduationMiddleware removes EVM assets from `customAssets` when
 * an upstream balance source (AccountsAPI / Websocket) reports a balance for
 * them. Once a detector sees the asset, it no longer needs to be tracked as
 * "custom" — the regular detection flow will keep it fresh.
 *
 * Rules:
 * - Only the selected account's custom assets are considered.
 * - Only EVM (CAIP-2 namespace `eip155`) assets graduate. Non-EVM custom
 *   assets (Solana, BTC, Tron, etc. — served by Snap data sources) are left
 *   alone.
 */
export class CustomAssetGraduationMiddleware {
  readonly name = CONTROLLER_NAME;

  readonly #getSelectedAccountId: () => AccountId | undefined;

  readonly #removeCustomAsset: (
    accountId: AccountId,
    assetId: Caip19AssetId,
  ) => void;

  constructor(options: CustomAssetGraduationMiddlewareOptions) {
    this.#getSelectedAccountId = options.getSelectedAccountId;
    this.#removeCustomAsset = options.removeCustomAsset;
  }

  getName(): string {
    return this.name;
  }

  get assetsMiddleware(): Middleware {
    return forDataTypes(['balance'], async (ctx, next) => {
      // Inspect the response BEFORE calling next() so we only consider
      // balances populated by upstream middleware (AccountsApi / Websocket /
      // Staked). This middleware is positioned in the pipeline before the
      // RPC fallback — RPC intentionally carries custom assets and must
      // never trigger graduation.
      const accountId = this.#getSelectedAccountId();
      if (!accountId) {
        return next(ctx);
      }

      const state = ctx.getAssetsState();
      const customForAccount = state.customAssets?.[accountId] ?? [];
      if (customForAccount.length === 0) {
        return next(ctx);
      }

      const returnedBalances = ctx.response.assetsBalance?.[accountId] ?? {};
      const returnedAssetIds = Object.keys(returnedBalances) as Caip19AssetId[];
      if (returnedAssetIds.length === 0) {
        return next(ctx);
      }

      // customAssets state is stored with checksummed/normalized asset IDs.
      // AccountsApiDataSource normalizes its response IDs, but
      // BackendWebsocketDataSource does not — so we normalize the response
      // side here to make the comparison robust to lower-case addresses
      // delivered over the websocket.
      const customSet = new Set(customForAccount);
      for (const rawAssetId of returnedAssetIds) {
        if (!isEvmAssetId(rawAssetId)) {
          continue;
        }
        const normalizedAssetId = safeNormalize(rawAssetId);
        if (!customSet.has(normalizedAssetId)) {
          continue;
        }
        log('Graduating custom asset', {
          accountId,
          assetId: normalizedAssetId,
        });
        this.#removeCustomAsset(accountId, normalizedAssetId);
      }

      return next(ctx);
    });
  }
}

/**
 * Check whether a CAIP-19 asset ID belongs to an EVM chain.
 *
 * @param assetId - The CAIP-19 asset ID to inspect.
 * @returns `true` when the asset's chain namespace is `eip155`.
 */
function isEvmAssetId(assetId: Caip19AssetId): boolean {
  // CAIP-19 format: <namespace>:<chainRef>/<assetNamespace>:<assetRef>
  // The chain namespace is always the segment before the first colon.
  const namespace = assetId.split(':')[0];
  return namespace === KnownCaipNamespace.Eip155;
}

/**
 * Normalize a CAIP-19 asset ID, returning the original on failure. Some
 * malformed IDs (e.g. an asset reference that fails address checksumming)
 * make `normalizeAssetId` throw — in that case we fall back to the raw ID
 * so the graduation pass can still proceed for other assets.
 *
 * @param assetId - The CAIP-19 asset ID to normalize.
 * @returns The normalized ID, or the original on failure.
 */
function safeNormalize(assetId: Caip19AssetId): Caip19AssetId {
  try {
    return normalizeAssetId(assetId);
  } catch {
    return assetId;
  }
}
