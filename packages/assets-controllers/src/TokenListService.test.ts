import { jest } from '@jest/globals';
import type { Hex } from '@metamask/utils';

import * as assetsUtil from './assetsUtil.js';
import { fetchTokenListByChainId } from './token-service.js';
import type { TokenListToken } from './TokenListController.js';
import { buildTokenListMap, TokenListService } from './TokenListService.js';

jest.mock('./token-service', () => ({
  fetchTokenListByChainId: jest.fn(),
}));

const mockedFetchTokenListByChainId = jest.mocked(fetchTokenListByChainId);

describe('buildTokenListMap', () => {
  it('maps tokens by address and applies aggregator and icon formatting', () => {
    const chainId = '0x1' as Hex;
    const tokens: TokenListToken[] = [
      {
        name: 'Sample',
        symbol: 'SMP',
        decimals: 18,
        address: '0xabc0000000000000000000000000000000000001',
        occurrences: 3,
        aggregators: ['bancor', 'cmc'],
        iconUrl: 'https://example.com/icon.png',
      },
    ];

    const map = buildTokenListMap(tokens, chainId);

    expect(Object.keys(map)).toStrictEqual([
      '0xabc0000000000000000000000000000000000001',
    ]);
    expect(map['0xabc0000000000000000000000000000000000001']).toMatchObject({
      name: 'Sample',
      symbol: 'SMP',
      decimals: 18,
      address: '0xabc0000000000000000000000000000000000001',
      aggregators: ['Bancor', 'CMC'],
    });
    expect(map['0xabc0000000000000000000000000000000000001'].iconUrl).toContain(
      'https://static.cx.metamask.io',
    );
  });

  it('returns an empty map when the token array is empty', () => {
    expect(buildTokenListMap([], '0x1' as Hex)).toStrictEqual({});
  });
});

describe('TokenListService', () => {
  beforeEach(() => {
    mockedFetchTokenListByChainId.mockReset();
  });

  it('fetches via token-service and caches results for the same chain', async () => {
    const chainId = '0xa86a' as Hex;
    const apiToken = {
      name: 'Avalanche Token',
      symbol: 'AVT',
      decimals: 18,
      address: '0x1000000000000000000000000000000000000001',
      occurrences: 5,
      aggregators: [] as string[],
      iconUrl: '',
    };
    mockedFetchTokenListByChainId.mockResolvedValue([apiToken]);

    const service = new TokenListService();
    const first = await service.fetchTokensByChainId(chainId);
    const second = await service.fetchTokensByChainId(chainId);

    expect(mockedFetchTokenListByChainId).toHaveBeenCalledTimes(1);
    expect(first).toStrictEqual(second);
    expect(first[apiToken.address]).toMatchObject({
      symbol: 'AVT',
      name: 'Avalanche Token',
    });

    service.destroy();
  });

  it('does not re-run map formatting on cache hits for the same chain', async () => {
    const chainId = '0xa86a' as Hex;
    const apiTokens = [
      {
        name: 'Token A',
        symbol: 'TKA',
        decimals: 18,
        address: '0x1000000000000000000000000000000000000001',
        occurrences: 1,
        aggregators: ['bancor'] as string[],
        iconUrl: '',
      },
      {
        name: 'Token B',
        symbol: 'TKB',
        decimals: 6,
        address: '0x2000000000000000000000000000000000000002',
        occurrences: 1,
        aggregators: ['cmc'] as string[],
        iconUrl: '',
      },
    ];
    mockedFetchTokenListByChainId.mockResolvedValue(apiTokens);

    const formatAggregatorsSpy = jest.spyOn(
      assetsUtil,
      'formatAggregatorNames',
    );
    const formatIconSpy = jest.spyOn(assetsUtil, 'formatIconUrlWithProxy');

    const service = new TokenListService();
    await service.fetchTokensByChainId(chainId);
    await service.fetchTokensByChainId(chainId);

    expect(mockedFetchTokenListByChainId).toHaveBeenCalledTimes(1);
    expect(formatAggregatorsSpy).toHaveBeenCalledTimes(2);
    expect(formatIconSpy).toHaveBeenCalledTimes(2);

    formatAggregatorsSpy.mockRestore();
    formatIconSpy.mockRestore();
    service.destroy();
  });

  it('treats an undefined API response as an empty list', async () => {
    mockedFetchTokenListByChainId.mockResolvedValue(undefined);

    const service = new TokenListService();
    expect(await service.fetchTokensByChainId('0x1' as Hex)).toStrictEqual({});

    service.destroy();
  });

  it('clearing the cache via destroy causes the next fetch to hit the network again', async () => {
    const chainId = '0x1' as Hex;
    const apiToken = {
      name: 'Restored After Destroy',
      symbol: 'RAD',
      decimals: 18,
      address: '0x1000000000000000000000000000000000000001',
      occurrences: 1,
      aggregators: [] as string[],
      iconUrl: '',
    };
    mockedFetchTokenListByChainId.mockImplementation(
      async (_chainId, abortSignal) => {
        // Mirror token-service: aborted fetches resolve to undefined, not a list.
        if (abortSignal.aborted) {
          return undefined;
        }
        return [apiToken];
      },
    );

    const service = new TokenListService();
    const first = await service.fetchTokensByChainId(chainId);
    const cached = await service.fetchTokensByChainId(chainId);
    expect(mockedFetchTokenListByChainId).toHaveBeenCalledTimes(1);
    expect(cached).toStrictEqual(first);
    expect(first[apiToken.address]).toMatchObject({ symbol: 'RAD' });

    service.destroy();

    const afterDestroy = await service.fetchTokensByChainId(chainId);
    expect(mockedFetchTokenListByChainId).toHaveBeenCalledTimes(2);
    expect(afterDestroy[apiToken.address]).toMatchObject({ symbol: 'RAD' });

    service.destroy();
  });
});
