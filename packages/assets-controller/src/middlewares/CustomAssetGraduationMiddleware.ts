import { KnownCaipNamespace, parseCaipChainId } from '@metamask/utils';

import { projectLogger, createModuleLogger } from '../logger';
import { forDataTypes } from '../types';
import type { AccountId, Caip19AssetId, Middleware } from '../types';

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
      const result = await next(ctx);

      const accountId = this.#getSelectedAccountId();
      if (!accountId) {
        return result;
      }

      const state = result.getAssetsState();
      const customForAccount = state.customAssets?.[accountId] ?? [];
      if (customForAccount.length === 0) {
        return result;
      }

      const returnedBalances =
        result.response.assetsBalance?.[accountId] ?? {};
      const returnedAssetIds = Object.keys(returnedBalances) as Caip19AssetId[];
      if (returnedAssetIds.length === 0) {
        return result;
      }

      const customSet = new Set(customForAccount);
      for (const assetId of returnedAssetIds) {
        if (!customSet.has(assetId)) {
          continue;
        }
        if (!isEvmAssetId(assetId)) {
          continue;
        }
        log('Graduating custom asset', { accountId, assetId });
        this.#removeCustomAsset(accountId, assetId);
      }

      return result;
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
  const [chainId] = assetId.split('/');
  try {
    const { namespace } = parseCaipChainId(chainId);
    return namespace === KnownCaipNamespace.Eip155;
  } catch {
    return false;
  }
}
