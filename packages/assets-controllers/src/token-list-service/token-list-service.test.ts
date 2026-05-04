import * as tokenService from '../token-service';
import { TokenListService, TOKEN_LIST_STALE_TIME } from './token-list-service';

jest.mock('../token-service', () => ({
  ...jest.requireActual('../token-service'),
  fetchAndBuildTokenListMap: jest.fn(),
}));

const mockFetchAndBuildTokenListMap =
  tokenService.fetchAndBuildTokenListMap as jest.MockedFunction<
    typeof tokenService.fetchAndBuildTokenListMap
  >;

const MOCK_CHAIN_ID = '0x1' as const;

const MOCK_TOKEN_LIST = {
  '0xtoken1': {
    address: '0xtoken1',
    symbol: 'TK1',
    decimals: 18,
    name: 'Token One',
    occurrences: 5,
    aggregators: [],
    iconUrl: '',
  },
};

describe('TokenListService', () => {
  let service: TokenListService;
  const abortController = new AbortController();

  beforeEach(() => {
    jest.resetAllMocks();
    service = new TokenListService();
  });

  afterEach(() => {
    service.destroy();
  });

  describe('getTokenListForChain', () => {
    it('fetches and returns the token list from the API', async () => {
      mockFetchAndBuildTokenListMap.mockResolvedValue(MOCK_TOKEN_LIST);

      const result = await service.getTokenListForChain(
        MOCK_CHAIN_ID,
        abortController.signal,
      );

      expect(result).toStrictEqual(MOCK_TOKEN_LIST);
      expect(mockFetchAndBuildTokenListMap).toHaveBeenCalledTimes(1);
      expect(mockFetchAndBuildTokenListMap).toHaveBeenCalledWith(
        MOCK_CHAIN_ID,
        abortController.signal,
      );
    });

    it('returns an empty object when the API returns undefined', async () => {
      mockFetchAndBuildTokenListMap.mockResolvedValue(undefined);

      const result = await service.getTokenListForChain(
        MOCK_CHAIN_ID,
        abortController.signal,
      );

      expect(result).toStrictEqual({});
    });

    it('falls back to the last known good cache value when the API returns undefined after expiry', async () => {
      mockFetchAndBuildTokenListMap
        .mockResolvedValueOnce(MOCK_TOKEN_LIST)
        .mockResolvedValueOnce(undefined);

      // Populate the cache
      await service.getTokenListForChain(MOCK_CHAIN_ID, abortController.signal);

      // Advance time past the stale threshold so the next call re-fetches
      jest
        .spyOn(Date, 'now')
        .mockReturnValue(Date.now() + TOKEN_LIST_STALE_TIME + 1);

      const result = await service.getTokenListForChain(
        MOCK_CHAIN_ID,
        abortController.signal,
      );

      jest.restoreAllMocks();

      // API returned undefined → service falls back to the previously cached value
      expect(result).toStrictEqual(MOCK_TOKEN_LIST);
    });

    it('serves cached data on subsequent calls within staleTime', async () => {
      mockFetchAndBuildTokenListMap.mockResolvedValue(MOCK_TOKEN_LIST);

      const result1 = await service.getTokenListForChain(
        MOCK_CHAIN_ID,
        abortController.signal,
      );
      const result2 = await service.getTokenListForChain(
        MOCK_CHAIN_ID,
        abortController.signal,
      );

      expect(result1).toStrictEqual(MOCK_TOKEN_LIST);
      expect(result2).toStrictEqual(MOCK_TOKEN_LIST);
      // The API should only be called once — the second call hits the cache
      expect(mockFetchAndBuildTokenListMap).toHaveBeenCalledTimes(1);
    });

    it('de-duplicates concurrent in-flight requests for the same chain', async () => {
      let resolve!: (value: typeof MOCK_TOKEN_LIST) => void;
      const deferred = new Promise<typeof MOCK_TOKEN_LIST>((res) => {
        resolve = res;
      });
      mockFetchAndBuildTokenListMap.mockReturnValue(deferred);

      const [result1, result2] = await Promise.all([
        service.getTokenListForChain(MOCK_CHAIN_ID, abortController.signal),
        service.getTokenListForChain(MOCK_CHAIN_ID, abortController.signal),
        Promise.resolve().then(() => resolve(MOCK_TOKEN_LIST)),
      ]);

      expect(result1).toStrictEqual(MOCK_TOKEN_LIST);
      expect(result2).toStrictEqual(MOCK_TOKEN_LIST);
      // Only one actual fetch despite two concurrent callers
      expect(mockFetchAndBuildTokenListMap).toHaveBeenCalledTimes(1);
    });

    it('refetches after invalidate is called', async () => {
      const updatedTokenList = {
        '0xtoken2': {
          address: '0xtoken2',
          symbol: 'TK2',
          decimals: 18,
          name: 'Token Two',
          occurrences: 3,
          aggregators: [],
          iconUrl: '',
        },
      };

      mockFetchAndBuildTokenListMap
        .mockResolvedValueOnce(MOCK_TOKEN_LIST)
        .mockResolvedValueOnce(updatedTokenList);

      await service.getTokenListForChain(MOCK_CHAIN_ID, abortController.signal);
      service.invalidate(MOCK_CHAIN_ID);
      const result = await service.getTokenListForChain(
        MOCK_CHAIN_ID,
        abortController.signal,
      );

      expect(result).toStrictEqual(updatedTokenList);
      expect(mockFetchAndBuildTokenListMap).toHaveBeenCalledTimes(2);
    });

    it('uses independent caches for different chain IDs', async () => {
      const chainId2 = '0x89' as const;
      const tokenListForChain2 = {
        '0xtoken3': {
          address: '0xtoken3',
          symbol: 'TK3',
          decimals: 18,
          name: 'Token Three',
          occurrences: 4,
          aggregators: [],
          iconUrl: '',
        },
      };

      mockFetchAndBuildTokenListMap
        .mockResolvedValueOnce(MOCK_TOKEN_LIST)
        .mockResolvedValueOnce(tokenListForChain2);

      const [result1, result2] = await Promise.all([
        service.getTokenListForChain(MOCK_CHAIN_ID, abortController.signal),
        service.getTokenListForChain(chainId2, abortController.signal),
      ]);

      expect(result1).toStrictEqual(MOCK_TOKEN_LIST);
      expect(result2).toStrictEqual(tokenListForChain2);
      expect(mockFetchAndBuildTokenListMap).toHaveBeenCalledTimes(2);
    });
  });

  describe('invalidate', () => {
    it('marks the cache entry as stale without throwing', async () => {
      mockFetchAndBuildTokenListMap.mockResolvedValue(MOCK_TOKEN_LIST);
      await service.getTokenListForChain(MOCK_CHAIN_ID, abortController.signal);

      expect(() => service.invalidate(MOCK_CHAIN_ID)).not.toThrow();
    });

    it('is a no-op when called for a chain ID not yet in the cache', () => {
      expect(() => service.invalidate(MOCK_CHAIN_ID)).not.toThrow();
    });
  });

  describe('destroy', () => {
    it('clears the cache without throwing', () => {
      expect(() => service.destroy()).not.toThrow();
    });
  });

  describe('TOKEN_LIST_STALE_TIME', () => {
    it('is 4 hours in milliseconds', () => {
      expect(TOKEN_LIST_STALE_TIME).toBe(4 * 60 * 60 * 1000);
    });
  });
});
