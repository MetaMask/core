import type { SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';

import type { ChainId, Caip19AssetId, DataResponse } from '../types';
import {
  GET_ACCOUNT_ASSET_INFO_CLIENT_METHOD,
  getAssetsToFetchWithEligibleCustomAssets,
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
    it('returns true for Stellar pubnet', () => {
      expect(isAccountAssetInfoEnrichmentAvailable(STELLAR_PUBNET)).toBe(true);
    });

    it('returns false for non-enrichment chains', () => {
      expect(isAccountAssetInfoEnrichmentAvailable(STELLAR_TESTNET)).toBe(false);
      expect(isAccountAssetInfoEnrichmentAvailable(SOLANA_MAINNET)).toBe(false);
    });
  });

  describe('getAssetsToFetchWithEligibleCustomAssets', () => {
    it('adds enrichable custom assets on requested chains', () => {
      const result = getAssetsToFetchWithEligibleCustomAssets({
        listedAssets: [MOCK_STELLAR_USDC_ASSET],
        customAssets: [MOCK_STELLAR_ASSET_2],
        requestedChainIds: [STELLAR_PUBNET],
      });

      expect(result).toStrictEqual(
        expect.arrayContaining([MOCK_STELLAR_USDC_ASSET, MOCK_STELLAR_ASSET_2]),
      );
    });

    it('ignores custom assets on non-enrichment chains', () => {
      const result = getAssetsToFetchWithEligibleCustomAssets({
        listedAssets: [MOCK_STELLAR_USDC_ASSET],
        customAssets: [MOCK_SOL_ASSET],
        requestedChainIds: [STELLAR_PUBNET, SOLANA_MAINNET],
      });

      expect(result).toStrictEqual([MOCK_STELLAR_USDC_ASSET]);
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

    it('enriches Stellar assets with metadata', async () => {
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
        metadata: {
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
        metadata: { limit: '1000', authorized: true },
      });
      expect(assetsBalance[MOCK_STELLAR_ASSET_2]).toStrictEqual({
        amount: '20',
        metadata: { limit: '500', authorized: false },
      });
    });

    it('deduplicates concurrent enrichment for the same account and chain', async () => {
      const assetsBalance = createAccountAssets();
      let resolveSnapRequest:
        | ((value: Record<string, unknown>) => void)
        | undefined;
      const callSnapRequest = jest.fn(
        () =>
          new Promise((resolve) => {
            resolveSnapRequest = resolve;
          }),
      );
      const enricher = createEnricher(callSnapRequest);

      const first = enricher.enrichAccount({ accountId, assetsBalance });
      const second = enricher.enrichAccount({ accountId, assetsBalance });

      expect(callSnapRequest).toHaveBeenCalledTimes(1);

      resolveSnapRequest?.({
        [MOCK_STELLAR_USDC_ASSET]: {
          limit: '1000',
          authorized: true,
        },
      });
      await Promise.all([first, second]);

      expect(callSnapRequest).toHaveBeenCalledTimes(1);
      expect(assetsBalance[MOCK_STELLAR_USDC_ASSET]).toStrictEqual({
        amount: '25',
        metadata: {
          limit: '1000',
          authorized: true,
        },
      });
    });

    it('applies shared fetch result to each distinct assetsBalance object', async () => {
      const assetsBalanceA = createAccountAssets();
      const assetsBalanceB = createAccountAssets();
      let resolveSnapRequest:
        | ((value: Record<string, unknown>) => void)
        | undefined;
      const callSnapRequest = jest.fn(
        () =>
          new Promise((resolve) => {
            resolveSnapRequest = resolve;
          }),
      );
      const enricher = createEnricher(callSnapRequest);

      const first = enricher.enrichAccount({
        accountId,
        assetsBalance: assetsBalanceA,
      });
      const second = enricher.enrichAccount({
        accountId,
        assetsBalance: assetsBalanceB,
      });

      expect(callSnapRequest).toHaveBeenCalledTimes(1);

      resolveSnapRequest?.({
        [MOCK_STELLAR_USDC_ASSET]: {
          limit: '1000',
          authorized: true,
        },
      });
      await Promise.all([first, second]);

      expect(callSnapRequest).toHaveBeenCalledTimes(1);
      expect(assetsBalanceA[MOCK_STELLAR_USDC_ASSET]).toStrictEqual({
        amount: '25',
        metadata: {
          limit: '1000',
          authorized: true,
        },
      });
      expect(assetsBalanceB[MOCK_STELLAR_USDC_ASSET]).toStrictEqual({
        amount: '25',
        metadata: {
          limit: '1000',
          authorized: true,
        },
      });
    });

    it('allows a new enrichment after the previous in-flight operation completes', async () => {
      const assetsBalance = createAccountAssets();
      const callSnapRequest = jest
        .fn()
        .mockResolvedValueOnce({
          [MOCK_STELLAR_USDC_ASSET]: { limit: '1000', authorized: true },
        })
        .mockResolvedValueOnce({
          [MOCK_STELLAR_USDC_ASSET]: { limit: '2000', authorized: false },
        });
      const enricher = createEnricher(callSnapRequest);

      await enricher.enrichAccount({ accountId, assetsBalance });
      await enricher.enrichAccount({ accountId, assetsBalance });

      expect(callSnapRequest).toHaveBeenCalledTimes(2);
      expect(assetsBalance[MOCK_STELLAR_USDC_ASSET]).toStrictEqual({
        amount: '25',
        metadata: {
          limit: '2000',
          authorized: false,
        },
      });
    });

    it('returns balances without metadata when enrichment hangs past timeout', async () => {
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
        )?.metadata,
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
