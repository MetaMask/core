import type { CaipAssetType, CaipChainId } from '@metamask/utils';

import type { Caip19AssetId } from '../types';
import {
  STELLAR_CHAIN_ID,
  filterEligibleAssetsToFetchMetadata,
  shouldFetchAssetMetadata,
} from './stellar';

const STELLAR_SNAP_ID = 'npm:@metamask/stellar-wallet-snap';
const SOLANA_SNAP_ID = 'npm:@metamask/solana-wallet-snap';

const MOCK_STELLAR_NATIVE =
  'stellar:pubnet/slip44:148' as Caip19AssetId;
const MOCK_STELLAR_USDC =
  'stellar:pubnet/asset:USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' as Caip19AssetId;
const MOCK_SOL_ASSET =
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501' as Caip19AssetId;

describe('stellar helpers', () => {
  describe('shouldFetchAssetMetadata', () => {
    const chainToSnap: Record<CaipChainId, string> = {
      [STELLAR_CHAIN_ID]: STELLAR_SNAP_ID,
    };

    it('returns true for Stellar native or trustline assets via the Stellar snap', () => {
      expect(
        shouldFetchAssetMetadata(
          [MOCK_STELLAR_USDC],
          chainToSnap,
          STELLAR_SNAP_ID,
        ),
      ).toBe(true);
      expect(
        shouldFetchAssetMetadata(
          [MOCK_STELLAR_NATIVE],
          chainToSnap,
          STELLAR_SNAP_ID,
        ),
      ).toBe(true);
    });

    it('returns false for non-Stellar assets', () => {
      expect(
        shouldFetchAssetMetadata([MOCK_SOL_ASSET], chainToSnap, STELLAR_SNAP_ID),
      ).toBe(false);
    });

    it('returns false when the snap is not mapped to Stellar pubnet', () => {
      expect(
        shouldFetchAssetMetadata(
          [MOCK_STELLAR_USDC],
          { [STELLAR_CHAIN_ID]: SOLANA_SNAP_ID },
          STELLAR_SNAP_ID,
        ),
      ).toBe(false);
    });

    it('returns false when called from a non-Stellar snap', () => {
      expect(
        shouldFetchAssetMetadata(
          [MOCK_STELLAR_USDC],
          chainToSnap,
          SOLANA_SNAP_ID,
        ),
      ).toBe(false);
    });
  });

  describe('filterEligibleAssetsToFetchMetadata', () => {
    it('keeps only Stellar pubnet native and trustline assets', () => {
      expect(
        filterEligibleAssetsToFetchMetadata([
          MOCK_STELLAR_USDC,
          MOCK_STELLAR_NATIVE,
          MOCK_SOL_ASSET,
        ] as CaipAssetType[]),
      ).toStrictEqual([MOCK_STELLAR_USDC, MOCK_STELLAR_NATIVE]);
    });
  });
});
