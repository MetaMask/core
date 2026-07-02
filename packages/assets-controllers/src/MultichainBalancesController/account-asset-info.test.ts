import { HandlerType } from '@metamask/snaps-utils';
import type { CaipAssetType, CaipChainId } from '@metamask/utils';

import {
  buildBalanceRowsWithAccountAssetInfo,
  createGetAccountAssetInfoClientRequest,
  fetchAccountAssetInfoFromSnap,
  filterAssetsForAccountAssetEnrichment,
  GET_ACCOUNT_ASSET_INFO_CLIENT_METHOD,
  isAccountAssetInfoEnrichmentAvailable,
} from './account-asset-info';

const stellarClassic =
  'stellar:pubnet/asset:USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' as CaipAssetType;

describe('MultichainBalancesController account-asset-info', () => {
  describe('isAccountAssetInfoEnrichmentAvailable', () => {
    it('returns true for Stellar pubnet', () => {
      expect(
        isAccountAssetInfoEnrichmentAvailable('stellar:pubnet' as CaipChainId),
      ).toBe(true);
    });

    it('returns true for Stellar testnet', () => {
      expect(
        isAccountAssetInfoEnrichmentAvailable('stellar:testnet' as CaipChainId),
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

    it('includes native slip44 assets on an enrichment-enabled chain', () => {
      const native = 'stellar:pubnet/slip44:148' as CaipAssetType;
      expect(
        filterAssetsForAccountAssetEnrichment(
          [native],
          'stellar:pubnet' as CaipChainId,
        ),
      ).toStrictEqual([native]);
    });
  });

  describe('createGetAccountAssetInfoClientRequest', () => {
    it('builds a snap client request with getAccountAssetInfo params', () => {
      const request = createGetAccountAssetInfoClientRequest(
        'local:stellar-snap' as never,
        {
          accountId: 'account-1',
          scope: 'stellar:pubnet' as CaipChainId,
          assets: [stellarClassic],
        },
      );

      expect(request).toStrictEqual({
        snapId: 'local:stellar-snap',
        origin: 'metamask',
        handler: HandlerType.OnClientRequest,
        request: {
          jsonrpc: '2.0',
          method: GET_ACCOUNT_ASSET_INFO_CLIENT_METHOD,
          params: {
            accountId: 'account-1',
            scope: 'stellar:pubnet',
            assets: [stellarClassic],
          },
        },
      });
    });
  });

  describe('fetchAccountAssetInfoFromSnap', () => {
    it('delegates to the request builder and caller', async () => {
      const handleSnapRequest = jest.fn().mockResolvedValue({
        [stellarClassic]: { limit: '1000' },
      });

      const result = await fetchAccountAssetInfoFromSnap(handleSnapRequest, {
        accountId: 'account-1',
        snapId: 'local:stellar-snap' as never,
        chainId: 'stellar:pubnet' as CaipChainId,
        assets: [stellarClassic],
      });

      expect(handleSnapRequest).toHaveBeenCalledWith(
        createGetAccountAssetInfoClientRequest('local:stellar-snap' as never, {
          accountId: 'account-1',
          scope: 'stellar:pubnet' as CaipChainId,
          assets: [stellarClassic],
        }),
      );
      expect(result).toStrictEqual({
        [stellarClassic]: { limit: '1000' },
      });
    });

    it('returns undefined when assets list is empty', async () => {
      const handleSnapRequest = jest.fn();

      const result = await fetchAccountAssetInfoFromSnap(handleSnapRequest, {
        accountId: 'account-1',
        snapId: 'local:stellar-snap' as never,
        chainId: 'stellar:pubnet' as CaipChainId,
        assets: [],
      });

      expect(handleSnapRequest).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('returns undefined when the snap request fails', async () => {
      const handleSnapRequest = jest
        .fn()
        .mockRejectedValue(new Error('snap failed'));

      const result = await fetchAccountAssetInfoFromSnap(handleSnapRequest, {
        accountId: 'account-1',
        snapId: 'local:stellar-snap' as never,
        chainId: 'stellar:pubnet' as CaipChainId,
        assets: [stellarClassic],
      });

      expect(result).toBeUndefined();
    });
  });

  describe('buildBalanceRowsWithAccountAssetInfo', () => {
    it('merges balance rows with enrichment accountAssetInfo fields', () => {
      expect(
        buildBalanceRowsWithAccountAssetInfo(
          [stellarClassic],
          {
            [stellarClassic]: { amount: '5', unit: 'USDC' },
          },
          {
            [stellarClassic]: { limit: '1000' },
          },
        ),
      ).toStrictEqual({
        [stellarClassic]: {
          amount: '5',
          unit: 'USDC',
          accountAssetInfo: { limit: '1000' },
        },
      });
    });

    it('uses zero placeholder when balance is missing', () => {
      expect(
        buildBalanceRowsWithAccountAssetInfo([stellarClassic], {}, undefined),
      ).toStrictEqual({
        [stellarClassic]: { amount: '0', unit: '' },
      });
    });
  });
});
