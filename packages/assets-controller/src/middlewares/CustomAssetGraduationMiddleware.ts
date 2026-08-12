import { KnownCaipNamespace } from '@metamask/utils';

import { forDataTypes } from '../types.js';
import type {
  AccountId,
  AssetBalance,
  Caip19AssetId,
  Middleware,
} from '../types.js';
import { safeNormalizeAssetId } from '../utils/index.js';

const CONTROLLER_NAME = 'CustomAssetGraduationMiddleware';

export type CustomAssetGraduationMiddlewareOptions = {
  getSelectedAccountId: () => AccountId | undefined;
  removeCustomAsset: (accountId: AccountId, assetId: Caip19AssetId) => void;
};

/**
 * CustomAssetGraduationMiddleware removes EVM assets from `customAssets` when
 * an upstream balance source (AccountsAPI / Websocket) reports a non-zero
 * balance for them. Once a detector sees the asset with a real balance, it
 * no longer needs to be tracked as "custom" — the regular detection flow
 * will keep it fresh.
 *
 * Rules:
 * - Only the selected account's custom assets are considered. Switching the
 *   selected account triggers a fresh fetch, which re-runs graduation
 *   against the new account's balances.
 * - Only EVM (CAIP-2 namespace `eip155`) assets graduate. Non-EVM custom
 *   assets (Solana, BTC, Tron, etc. — served by Snap data sources) are left
 *   alone.
 * - Only positive balances graduate. A zero balance from AccountsAPI means
 *   the API knows about the token but the user does not currently hold it;
 *   keeping it in `customAssets` ensures RPC keeps polling so a future
 *   incoming transfer is reflected promptly.
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
      // AccountActivityDataSource does not — so we normalize the response
      // side here to make the comparison robust to lower-case addresses
      // delivered over the websocket.
      const customSet = new Set(customForAccount);
      for (const rawAssetId of returnedAssetIds) {
        if (!isEvmAssetId(rawAssetId)) {
          continue;
        }
        if (!hasPositiveBalance(returnedBalances[rawAssetId])) {
          continue;
        }
        const normalizedAssetId = safeNormalizeAssetId(rawAssetId);
        if (!customSet.has(normalizedAssetId)) {
          continue;
        }
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
 * Whether a balance entry reports a strictly positive amount. AccountsAPI
 * may return zero for tokens it indexes but the user no longer holds; we
 * treat those as non-graduating so RPC keeps polling and surfaces any
 * future incoming transfer immediately.
 *
 * `AssetBalance.amount` is already a human-readable decimal string from
 * both AccountsApi (e.g. "0.283549083429656057") and the websocket data
 * source (which divides by `decimals` before emitting), so a `Number()`
 * sign check is safe: `NaN`, `undefined`, empty strings, and zero all
 * fail the comparison.
 *
 * @param balance - The balance entry from the response.
 * @returns `true` when the balance amount represents a value greater than 0.
 */
function hasPositiveBalance(balance: AssetBalance | undefined): boolean {
  return Number(balance?.amount) > 0;
}
