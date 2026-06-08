import type { CaipAssetType, CaipChainId } from '@metamask/utils';

import {
  accountAssetExtraNeedsRefresh,
  filterAssetsForAccountAssetEnrichment,
  filterStellarClassicAssetsForEnrichment,
  isAccountAssetInfoEnrichmentAvailable,
} from './accountAssetEnrichment';

const stellarClassic =
  'stellar:pubnet/asset:USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' as CaipAssetType;

describe('accountAssetEnrichment', () => {
  describe('isAccountAssetInfoEnrichmentAvailable', () => {
    it('returns true for Stellar pubnet', () => {
      expect(
        isAccountAssetInfoEnrichmentAvailable('stellar:pubnet' as CaipChainId),
      ).toBe(true);
    });

    it('returns true for Stellar testnet', () => {
      expect(
        isAccountAssetInfoEnrichmentAvailable(
          'stellar:testnet' as CaipChainId,
        ),
      ).toBe(true);
    });

    it('returns false for unsupported chains', () => {
      expect(
        isAccountAssetInfoEnrichmentAvailable(
          'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as CaipChainId,
        ),
      ).toBe(false);
    });
  });

  describe('filterAssetsForAccountAssetEnrichment', () => {
    it('returns assets on the enrichment-enabled chain', () => {
      expect(
        filterAssetsForAccountAssetEnrichment(
          [stellarClassic],
          'stellar:pubnet' as CaipChainId,
        ),
      ).toStrictEqual([stellarClassic]);
    });

    it('returns empty when chain does not support enrichment', () => {
      expect(
        filterAssetsForAccountAssetEnrichment(
          [stellarClassic],
          'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as CaipChainId,
        ),
      ).toStrictEqual([]);
    });

    it('excludes assets on a different chain than the caller scope', () => {
      expect(
        filterAssetsForAccountAssetEnrichment(
          [stellarClassic],
          'stellar:testnet' as CaipChainId,
        ),
      ).toStrictEqual([]);
    });
  });

  describe('filterStellarClassicAssetsForEnrichment', () => {
    it('includes Stellar classic assets on an enrichment-enabled chain', () => {
      expect(
        filterStellarClassicAssetsForEnrichment(
          [stellarClassic],
          'stellar:pubnet' as CaipChainId,
        ),
      ).toStrictEqual([stellarClassic]);
    });

    it('excludes native XLM slip44 assets', () => {
      expect(
        filterStellarClassicAssetsForEnrichment(
          ['stellar:pubnet/slip44:148' as CaipAssetType],
          'stellar:pubnet' as CaipChainId,
        ),
      ).toStrictEqual([]);
    });
  });

  describe('accountAssetExtraNeedsRefresh', () => {
    it('returns true when extra is undefined', () => {
      expect(accountAssetExtraNeedsRefresh(undefined)).toBe(true);
    });

    it('returns true when limit is missing or zero', () => {
      expect(accountAssetExtraNeedsRefresh({})).toBe(true);
      expect(accountAssetExtraNeedsRefresh({ limit: '0' })).toBe(true);
    });

    it('returns false when limit is positive', () => {
      expect(accountAssetExtraNeedsRefresh({ limit: '1000' })).toBe(false);
    });
  });
});
