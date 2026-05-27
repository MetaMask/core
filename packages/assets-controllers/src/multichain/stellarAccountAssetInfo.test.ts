import type { CaipAssetType } from '@metamask/utils';

import {
  isStellarClassicTrustlineInactiveForAsset,
  isStellarTrustlineInactiveFromBalanceExtra,
  stellarAssetInfoExtraToBalanceExtra,
} from './stellarAccountAssetInfo';

const stellarClassic =
  'stellar:pubnet/asset:USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' as CaipAssetType;

describe('stellarAccountAssetInfo', () => {
  describe('isStellarTrustlineInactiveFromBalanceExtra', () => {
    it('returns true when extra is missing', () => {
      expect(isStellarTrustlineInactiveFromBalanceExtra(undefined)).toBe(true);
    });

    it('returns true when limit is zero', () => {
      expect(
        isStellarTrustlineInactiveFromBalanceExtra({ limit: '0' }),
      ).toBe(true);
    });

    it('returns false when limit is positive', () => {
      expect(
        isStellarTrustlineInactiveFromBalanceExtra({ limit: '1000' }),
      ).toBe(false);
    });
  });

  describe('isStellarClassicTrustlineInactiveForAsset', () => {
    it('uses balance extra when present', () => {
      expect(
        isStellarClassicTrustlineInactiveForAsset(
          stellarClassic,
          { limit: '1' },
          true,
        ),
      ).toBe(false);
    });

    it('does not mark inactive when balance row exists but extra is not merged yet', () => {
      expect(
        isStellarClassicTrustlineInactiveForAsset(
          stellarClassic,
          undefined,
          true,
        ),
      ).toBe(false);
    });

    it('treats portfolio classic with no balance row as inactive', () => {
      expect(
        isStellarClassicTrustlineInactiveForAsset(stellarClassic, undefined),
      ).toBe(true);
    });

    it('returns false for non-classic assets', () => {
      const nativeXlm =
        'stellar:pubnet/slip44:148' as CaipAssetType;
      expect(
        isStellarClassicTrustlineInactiveForAsset(nativeXlm, undefined),
      ).toBe(false);
    });
  });

  describe('stellarAssetInfoExtraToBalanceExtra', () => {
    it('maps snap extra to balance extra', () => {
      expect(
        stellarAssetInfoExtraToBalanceExtra({
          limit: '1',
          authorized: true,
        }),
      ).toStrictEqual({ limit: '1', authorized: true });
    });
  });
});
