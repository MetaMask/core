import type { Hex } from '@metamask/utils';

import type { TokenListToken } from './TokenListController';
import { buildTokenListMap, TokenListService } from './TokenListService';
import { fetchTokenListByChainId } from './token-service';

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
    expect(
      map['0xabc0000000000000000000000000000000000001'].iconUrl,
    ).toContain('https://static.cx.metamask.io');
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

  it('treats an undefined API response as an empty list', async () => {
    mockedFetchTokenListByChainId.mockResolvedValue(undefined);

    const service = new TokenListService();
    await expect(service.fetchTokensByChainId('0x1' as Hex)).resolves.toStrictEqual(
      {},
    );

    service.destroy();
  });

  it('clearing the cache via destroy causes the next fetch to hit the network again', async () => {
    const chainId = '0x1' as Hex;
    mockedFetchTokenListByChainId.mockResolvedValue([]);

    const service = new TokenListService();
    await service.fetchTokensByChainId(chainId);
    await service.fetchTokensByChainId(chainId);
    expect(mockedFetchTokenListByChainId).toHaveBeenCalledTimes(1);

    service.destroy();

    await service.fetchTokensByChainId(chainId);
    expect(mockedFetchTokenListByChainId).toHaveBeenCalledTimes(2);
  });
});
