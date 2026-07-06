import { HandlerType } from '@metamask/snaps-utils';
import type { CaipChainId } from '@metamask/utils';

import type { Caip19AssetId } from '../types';
import {
  createGetAccountAssetInfoClientRequest,
  createInvalidatedAccountAssetInfo,
  fetchAccountAssetInfoFromSnap,
  filterAssetsForAccountAssetEnrichment,
  GET_ACCOUNT_ASSET_INFO_CLIENT_METHOD,
  isAccountAssetInfoEnrichmentAvailable,
  mergeAssetBalanceRow,
} from './account-asset-enrichment';

const stellarClassic =
  'stellar:pubnet/asset:USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' as Caip19AssetId;

describe('account-asset-enrichment utils', () => {
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
  });

  describe('createInvalidatedAccountAssetInfo', () => {
    it('sets limit to zero', () => {
      expect(createInvalidatedAccountAssetInfo()).toStrictEqual({
        limit: '0',
      });
    });

    it('preserves prior authorized and sponsored fields', () => {
      expect(
        createInvalidatedAccountAssetInfo({
          limit: '1000',
          authorized: true,
          sponsored: false,
        }),
      ).toStrictEqual({
        limit: '0',
        authorized: true,
        sponsored: false,
      });
    });
  });

  describe('mergeAssetBalanceRow', () => {
    it('preserves existing accountAssetInfo when incoming row omits it', () => {
      expect(
        mergeAssetBalanceRow(
          { amount: '1', accountAssetInfo: { limit: '500' } },
          { amount: '2' },
        ),
      ).toStrictEqual({
        amount: '2',
        accountAssetInfo: { limit: '500' },
      });
    });

    it('uses incoming accountAssetInfo when provided', () => {
      expect(
        mergeAssetBalanceRow(
          { amount: '1', accountAssetInfo: { limit: '500' } },
          { amount: '2', accountAssetInfo: { limit: '1000' } },
        ),
      ).toStrictEqual({
        amount: '2',
        accountAssetInfo: { limit: '1000' },
      });
    });

    it('seeds zero amount when no prior row exists', () => {
      expect(mergeAssetBalanceRow(undefined, { amount: '5' })).toStrictEqual({
        amount: '5',
      });
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
});
