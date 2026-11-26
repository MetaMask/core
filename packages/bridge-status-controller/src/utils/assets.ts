import type { AssetsControllerGetAssetsAction } from '@metamask/assets-controller';
import type { CaipAssetType, CaipChainId } from '@metamask/utils';

import type { BridgeStatusControllerMessenger } from '../types.js';

type Account = Parameters<
  AssetsControllerGetAssetsAction['handler']
>[0][number];

export const addCustomAsset = async (
  messenger: BridgeStatusControllerMessenger,
  accountId: Account['id'],
  assetId: CaipAssetType,
): Promise<void> => {
  await messenger.call(
    'AssetsController:addCustomAsset',
    accountId,
    assetId,
    undefined,
    true,
  );
};

export const refreshAssets = async (
  messenger: BridgeStatusControllerMessenger,
  account: Account,
  chainIds: CaipChainId[],
): Promise<void> => {
  await messenger.call('AssetsController:getAssets', [account], {
    chainIds,
    forceUpdate: true,
    bypassServerCache: true,
  });
};
