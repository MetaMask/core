import type { BalanceUpdate } from '@metamask/core-backend';
import BigNumberJS from 'bignumber.js';

import type {
  AssetBalance,
  AssetMetadata,
  Caip19AssetId,
  DataResponse,
} from '../types';

/**
 * Convert AccountActivityMessage balance updates into a {@link DataResponse}
 * for AssetsController.
 *
 * @param updates - Balance updates from account-activity websocket payload.
 * @param accountId - Internal account UUID.
 * @param getAssetType - Resolver for asset metadata type.
 * @returns DataResponse with merge mode when balances are present.
 */
export function processAccountActivityBalanceUpdates(
  updates: BalanceUpdate[],
  accountId: string,
  getAssetType: (assetId: Caip19AssetId) => 'native' | 'erc20' | 'spl',
): DataResponse {
  const assetsBalance = Object.create(null) as Record<
    string,
    Record<Caip19AssetId, AssetBalance>
  >;
  assetsBalance[accountId] = Object.create(null) as Record<
    Caip19AssetId,
    AssetBalance
  >;
  const assetsMetadata = Object.create(null) as Record<
    Caip19AssetId,
    AssetMetadata
  >;

  for (const update of updates) {
    const { asset, postBalance } = update;

    if (!asset || !postBalance) {
      continue;
    }

    const assetId = asset.type as Caip19AssetId;

    if (asset.decimals === undefined) {
      continue;
    }

    const rawBalanceStr = postBalance.amount.startsWith('0x')
      ? BigInt(postBalance.amount).toString()
      : postBalance.amount;

    const humanReadableAmount = new BigNumberJS(rawBalanceStr)
      .dividedBy(new BigNumberJS(10).pow(asset.decimals))
      .toFixed();

    assetsBalance[accountId][assetId] = {
      amount: humanReadableAmount,
    };

    assetsMetadata[assetId] = {
      type: getAssetType(assetId),
      symbol: asset.unit,
      name: asset.unit,
      decimals: asset.decimals,
    };
  }

  const response: DataResponse = { updateMode: 'merge' };
  if (Object.keys(assetsBalance[accountId]).length > 0) {
    response.assetsBalance = assetsBalance;
    response.assetsInfo = assetsMetadata;
  }

  return response;
}
