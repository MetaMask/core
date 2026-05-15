import type { CaipAssetType, CaipChainId } from '@metamask/utils';

import {
  isStellarCaipChain,
  isStellarClassicAssetCaip19,
  isStellarTrustlineTrackedAsset,
} from './stellarTrustline';

describe('stellarTrustline', () => {
  describe('isStellarCaipChain', () => {
    it('returns true for Stellar pubnet CAIP-2 id', () => {
      expect(isStellarCaipChain('stellar:pubnet' as CaipChainId)).toBe(true);
    });

    it('returns false for Solana chain id', () => {
      expect(
        isStellarCaipChain(
          'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as CaipChainId,
        ),
      ).toBe(false);
    });
  });

  describe('isStellarClassicAssetCaip19', () => {
    const stellarClassicAsset =
      'stellar:pubnet/asset:USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' as CaipAssetType;

    it('returns true for Stellar classic asset id', () => {
      expect(isStellarClassicAssetCaip19(stellarClassicAsset)).toBe(true);
    });

    it('returns false for Stellar native slip44', () => {
      const native = 'stellar:pubnet/slip44:148' as CaipAssetType;
      expect(isStellarClassicAssetCaip19(native)).toBe(false);
    });

    it('returns false for Stellar sep41 (Soroban) asset', () => {
      const sep41 =
        'stellar:pubnet/sep41:CAUP7NFABXE5TJRL3FKTPMWRLC7IAXYDCTHQRFSCLR5TMGKHOOQO772J' as CaipAssetType;
      expect(isStellarClassicAssetCaip19(sep41)).toBe(false);
    });
  });

  describe('isStellarTrustlineTrackedAsset', () => {
    const stellarClassicAsset =
      'stellar:pubnet/asset:USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' as CaipAssetType;

    it('returns true for Stellar classic asset', () => {
      expect(isStellarTrustlineTrackedAsset(stellarClassicAsset)).toBe(true);
    });

    it('returns false for Stellar native slip44', () => {
      const native = 'stellar:pubnet/slip44:148' as CaipAssetType;
      expect(isStellarTrustlineTrackedAsset(native)).toBe(false);
    });

    it('returns false for Stellar sep41 (Soroban) asset', () => {
      const sep41 =
        'stellar:pubnet/sep41:CAUP7NFABXE5TJRL3FKTPMWRLC7IAXYDCTHQRFSCLR5TMGKHOOQO772J' as CaipAssetType;
      expect(isStellarTrustlineTrackedAsset(sep41)).toBe(false);
    });

    it('returns false for Solana SPL token', () => {
      const spl =
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN' as CaipAssetType;
      expect(isStellarTrustlineTrackedAsset(spl)).toBe(false);
    });
  });
});
