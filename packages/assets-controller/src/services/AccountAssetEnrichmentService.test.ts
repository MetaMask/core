import type { SnapId } from '@metamask/snaps-sdk';
import type { CaipChainId } from '@metamask/utils';

import type { Caip19AssetId } from '../types';
import { AccountAssetEnrichmentService } from './AccountAssetEnrichmentService';

const stellarClassic =
  'stellar:pubnet/asset:USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' as Caip19AssetId;

describe('AccountAssetEnrichmentService', () => {
  const snapId = 'local:stellar-snap' as SnapId;
  const chainId = 'stellar:pubnet' as CaipChainId;
  const accountId = 'account-1';

  it('fetches extras from the snap', async () => {
    const handleSnapRequest = jest.fn().mockResolvedValue({
      [stellarClassic]: { limit: '1000' },
    });

    const service = new AccountAssetEnrichmentService({
      handleSnapRequest,
      getSnapIdForChain: (): SnapId => snapId,
    });

    const result = await service.fetchExtras({
      accountId,
      chainId,
      assetIds: [stellarClassic],
    });

    expect(result).toStrictEqual({ [stellarClassic]: { limit: '1000' } });
    expect(handleSnapRequest).toHaveBeenCalledTimes(1);
  });

  it('returns undefined when no snap supports the chain', async () => {
    const handleSnapRequest = jest.fn();

    const service = new AccountAssetEnrichmentService({
      handleSnapRequest,
      getSnapIdForChain: (): undefined => undefined,
    });

    const result = await service.fetchExtras({
      accountId,
      chainId,
      assetIds: [stellarClassic],
    });

    expect(result).toBeUndefined();
    expect(handleSnapRequest).not.toHaveBeenCalled();
  });

  it('batches large asset lists into serial snap requests', async () => {
    const assetIds = Array.from({ length: 7 }, (_, index) => {
      return `stellar:pubnet/asset:TOK${index}-GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA` as Caip19AssetId;
    });

    const handleSnapRequest = jest.fn().mockImplementation(({ request }) => {
      const batchAssets = request.params.assets as Caip19AssetId[];
      return Object.fromEntries(
        batchAssets.map((assetId) => [assetId, { limit: '100' }]),
      );
    });

    const service = new AccountAssetEnrichmentService({
      handleSnapRequest,
      getSnapIdForChain: (): SnapId => snapId,
    });

    const result = await service.fetchExtras({
      accountId,
      chainId,
      assetIds,
    });

    expect(handleSnapRequest).toHaveBeenCalledTimes(3);
    expect(Object.keys(result ?? {})).toHaveLength(7);
  });

  it('serializes concurrent fetches for the same snap across accounts', async () => {
    const callOrder: string[] = [];
    const handleSnapRequest = jest.fn().mockImplementation(async () => {
      callOrder.push('start');
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
      callOrder.push('end');
      return { [stellarClassic]: { limit: '1000' } };
    });

    const service = new AccountAssetEnrichmentService({
      handleSnapRequest,
      getSnapIdForChain: (): SnapId => snapId,
    });

    await Promise.all([
      service.fetchExtras({
        accountId: 'account-1',
        chainId,
        assetIds: [stellarClassic],
      }),
      service.fetchExtras({
        accountId: 'account-2',
        chainId,
        assetIds: [stellarClassic],
      }),
    ]);

    expect(handleSnapRequest).toHaveBeenCalledTimes(2);
    expect(callOrder).toStrictEqual(['start', 'end', 'start', 'end']);
  });

  it('calls onBatchExtras after each successful batch', async () => {
    const assetIds = Array.from({ length: 4 }, (_, index) => {
      return `stellar:pubnet/asset:TOK${index}-GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA` as Caip19AssetId;
    });
    const onBatchExtras = jest.fn();

    const handleSnapRequest = jest.fn().mockImplementation(({ request }) => {
      const batchAssets = request.params.assets as Caip19AssetId[];
      return Object.fromEntries(
        batchAssets.map((assetId) => [assetId, { limit: '100' }]),
      );
    });

    const service = new AccountAssetEnrichmentService({
      handleSnapRequest,
      getSnapIdForChain: (): SnapId => snapId,
    });

    await service.fetchExtras({
      accountId,
      chainId,
      assetIds,
      onBatchExtras,
    });

    expect(onBatchExtras).toHaveBeenCalledTimes(2);
    expect(onBatchExtras.mock.calls[0]?.[0]).toEqual({
      [assetIds[0]]: { limit: '100' },
      [assetIds[1]]: { limit: '100' },
      [assetIds[2]]: { limit: '100' },
    });
  });

  it('deduplicates concurrent fetches for the same account, chain, and assets', async () => {
    const handleSnapRequest = jest
      .fn()
      .mockResolvedValue({ [stellarClassic]: { limit: '500' } });

    const service = new AccountAssetEnrichmentService({
      handleSnapRequest,
      getSnapIdForChain: (): SnapId => snapId,
    });

    const params = {
      accountId,
      chainId,
      assetIds: [stellarClassic],
    };

    const [first, second] = await Promise.all([
      service.fetchExtras(params),
      service.fetchExtras(params),
    ]);

    expect(handleSnapRequest).toHaveBeenCalledTimes(1);
    expect(first).toStrictEqual({ [stellarClassic]: { limit: '500' } });
    expect(second).toStrictEqual({ [stellarClassic]: { limit: '500' } });
  });
});
