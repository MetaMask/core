import type { SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';

import type { ChainId, Caip19AssetId, DataResponse } from '../types';
import {
  GET_ACCOUNT_ASSET_INFO_CLIENT_METHOD,
  hasAccountAssetInfoEnrichmentCandidate,
  isAccountAssetInfoEnrichmentAvailable,
  SnapAccountAssetInfoEnricher,
} from './snap-account-asset-info-enrichment';

const STELLAR_PUBNET = 'stellar:pubnet' as ChainId;
const STELLAR_TESTNET = 'stellar:testnet' as ChainId;
const SOLANA_MAINNET = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as ChainId;
const STELLAR_SNAP_ID = 'npm:@metamask/stellar-wallet-snap' as SnapId;

const MOCK_STELLAR_USDC_ASSET =
  'stellar:pubnet/asset:USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' as Caip19AssetId;
const MOCK_STELLAR_ASSET_2 =
  'stellar:pubnet/asset:USDT-GCQTGZQQ5G4PTM2GL7CDIFKUBIPEC52BROAQIAPW53XBRJVN6ZJVTG6' as Caip19AssetId;
const MOCK_SOL_ASSET =
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501' as Caip19AssetId;

describe('snap-account-asset-info-enrichment', () => {
  describe('isAccountAssetInfoEnrichmentAvailable', () => {
    it('returns true for Stellar chains', () => {
      expect(isAccountAssetInfoEnrichmentAvailable(STELLAR_PUBNET)).toBe(true);
      expect(isAccountAssetInfoEnrichmentAvailable(STELLAR_TESTNET)).toBe(true);
    });

    it('returns false for non-enrichment chains', () => {
      expect(isAccountAssetInfoEnrichmentAvailable(SOLANA_MAINNET)).toBe(false);
    });
  });

  describe('hasAccountAssetInfoEnrichmentCandidate', () => {
    const accountId = 'mock-account-id';

    it('returns true for Stellar asset when Snap ID exists', () => {
      const result = hasAccountAssetInfoEnrichmentCandidate({
        assetsBalance: {
          [accountId]: {
            [MOCK_STELLAR_USDC_ASSET]: { amount: '25' },
          },
        },
        getSnapIdForChain: () => STELLAR_SNAP_ID,
      });

      expect(result).toBe(true);
    });

    it('returns false for Stellar asset when no Snap ID exists', () => {
      const result = hasAccountAssetInfoEnrichmentCandidate({
        assetsBalance: {
          [accountId]: {
            [MOCK_STELLAR_USDC_ASSET]: { amount: '25' },
          },
        },
        getSnapIdForChain: () => undefined,
      });

      expect(result).toBe(false);
    });

    it('returns false for non-Stellar asset', () => {
      const result = hasAccountAssetInfoEnrichmentCandidate({
        assetsBalance: {
          [accountId]: {
            [MOCK_SOL_ASSET]: { amount: '100' },
          },
        },
        getSnapIdForChain: () => STELLAR_SNAP_ID,
      });

      expect(result).toBe(false);
    });

    it('ignores malformed asset IDs', () => {
      const result = hasAccountAssetInfoEnrichmentCandidate({
        assetsBalance: {
          [accountId]: {
            ['not-a-caip-asset' as Caip19AssetId]: { amount: '1' },
          },
        },
        getSnapIdForChain: () => STELLAR_SNAP_ID,
      });

      expect(result).toBe(false);
    });
  });

  describe('SnapAccountAssetInfoEnricher', () => {
    const accountId = 'mock-account-id';

    function createAccountAssets(): NonNullable<
      DataResponse['assetsBalance']
    >[string] {
      return {
        [MOCK_STELLAR_USDC_ASSET]: { amount: '25' },
      };
    }

    function createEnricher(
      callSnapRequest: jest.Mock,
    ): SnapAccountAssetInfoEnricher {
      return new SnapAccountAssetInfoEnricher({
        getSnapIdForChain: () => STELLAR_SNAP_ID,
        callSnapRequest,
      });
    }

    it('enriches Stellar assets with accountAssetInfo', async () => {
      const assetsBalance = createAccountAssets();
      const callSnapRequest = jest.fn().mockResolvedValue({
        [MOCK_STELLAR_USDC_ASSET]: {
          limit: '1000',
          authorized: true,
          sponsored: false,
        },
      });
      const enricher = createEnricher(callSnapRequest);

      await enricher.enrichAccount({ accountId, assetsBalance });

      expect(callSnapRequest).toHaveBeenCalledWith({
        snapId: STELLAR_SNAP_ID,
        origin: 'metamask',
        handler: HandlerType.OnClientRequest,
        request: {
          jsonrpc: '2.0',
          method: GET_ACCOUNT_ASSET_INFO_CLIENT_METHOD,
          params: {
            accountId,
            scope: STELLAR_PUBNET,
            assets: [MOCK_STELLAR_USDC_ASSET],
          },
        },
      });
      expect(assetsBalance[MOCK_STELLAR_USDC_ASSET]).toStrictEqual({
        amount: '25',
        accountAssetInfo: {
          limit: '1000',
          authorized: true,
          sponsored: false,
        },
      });
    });

    it('requests all assets on a chain in a single getAccountAssetInfo call', async () => {
      const assetsBalance: NonNullable<
        DataResponse['assetsBalance']
      >[string] = {
        [MOCK_STELLAR_USDC_ASSET]: { amount: '10' },
        [MOCK_STELLAR_ASSET_2]: { amount: '20' },
      };
      const callSnapRequest = jest.fn().mockResolvedValue({
        [MOCK_STELLAR_USDC_ASSET]: { limit: '1000', authorized: true },
        [MOCK_STELLAR_ASSET_2]: { limit: '500', authorized: false },
      });
      const enricher = createEnricher(callSnapRequest);

      await enricher.enrichAccount({ accountId, assetsBalance });

      expect(callSnapRequest).toHaveBeenCalledTimes(1);
      expect(callSnapRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          request: expect.objectContaining({
            params: expect.objectContaining({
              assets: expect.arrayContaining([
                MOCK_STELLAR_USDC_ASSET,
                MOCK_STELLAR_ASSET_2,
              ]),
            }),
          }),
        }),
      );
      expect(assetsBalance[MOCK_STELLAR_USDC_ASSET]).toStrictEqual({
        amount: '10',
        accountAssetInfo: { limit: '1000', authorized: true },
      });
      expect(assetsBalance[MOCK_STELLAR_ASSET_2]).toStrictEqual({
        amount: '20',
        accountAssetInfo: { limit: '500', authorized: false },
      });
    });

    it('returns balances without accountAssetInfo when enrichment hangs past timeout', async () => {
      jest.useFakeTimers();

      const assetsBalance = createAccountAssets();
      const callSnapRequest = jest.fn(() => new Promise(() => undefined));
      const enricher = createEnricher(callSnapRequest);

      const enrichPromise = enricher.enrichAccount({
        accountId,
        assetsBalance,
      });

      await jest.advanceTimersByTimeAsync(20_000);
      await enrichPromise;

      expect(assetsBalance[MOCK_STELLAR_USDC_ASSET]).toStrictEqual({
        amount: '25',
      });
      expect(
        (
          assetsBalance[MOCK_STELLAR_USDC_ASSET] as Record<string, unknown>
        )?.accountAssetInfo,
      ).toBeUndefined();

      jest.useRealTimers();
    });

    it('skips enrichment when no Snap ID is available for the chain', async () => {
      const assetsBalance = createAccountAssets();
      const callSnapRequest = jest.fn();
      const enricher = new SnapAccountAssetInfoEnricher({
        getSnapIdForChain: (): SnapId | undefined => undefined,
        callSnapRequest,
      });

      await enricher.enrichAccount({ accountId, assetsBalance });

      expect(callSnapRequest).not.toHaveBeenCalled();
      expect(assetsBalance[MOCK_STELLAR_USDC_ASSET]).toStrictEqual({
        amount: '25',
      });
    });
  });
});
