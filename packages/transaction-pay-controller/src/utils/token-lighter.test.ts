import type { CaipAssetType } from '@metamask/utils';
import { describe, expect, it } from 'vitest';

import { LIGHTER_USDC_STAND_IN_ASSET_ID } from '../strategy/server/lighter.js';
import type { TransactionPayControllerMessenger } from '../types.js';
import { getAssetFiatRate } from './token.js';

const LIGHTER_ASSET_ID_MOCK = 'lighter:mainnet/perps:usdc' as CaipAssetType;

/**
 * Build a messenger exposing only the state `getAssetFiatRate` reads.
 *
 * @param assetsPrice - Prices keyed by asset ID.
 * @returns The messenger mock.
 */
function buildMessenger(
  assetsPrice: Record<string, unknown>,
): TransactionPayControllerMessenger {
  return {
    call: (action: string) =>
      action === 'AssetsController:getState'
        ? { assetsPrice }
        : { remoteFeatureFlags: {} },
  } as unknown as TransactionPayControllerMessenger;
}

describe('getAssetFiatRate for Lighter assets', () => {
  it('prices a Lighter asset using the mainnet USDC stand-in as a stablecoin', () => {
    const messenger = buildMessenger({
      [LIGHTER_USDC_STAND_IN_ASSET_ID]: {
        assetPriceType: 'fungible',
        lastUpdated: 0,
        price: 0.85,
        usdPrice: 0.999,
      },
    });

    expect(getAssetFiatRate(messenger, LIGHTER_ASSET_ID_MOCK)).toStrictEqual({
      fiatRate: '0.85',
      usdRate: '1',
    });
  });

  it('returns undefined if the stand-in asset has no price', () => {
    const messenger = buildMessenger({});

    expect(getAssetFiatRate(messenger, LIGHTER_ASSET_ID_MOCK)).toBeUndefined();
  });
});
