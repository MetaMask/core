import { TERMINAL_API_CONFIG } from '../../../src/constants/perpsConfig.js';
import { TerminalMarketService } from '../../../src/services/TerminalMarketService.js';
import type { PerpsPlatformDependencies } from '../../../src/types/index.js';
import { createMockInfrastructure } from '../../helpers/serviceMocks.js';

describe('TerminalMarketService', () => {
  let mockDeps: jest.Mocked<PerpsPlatformDependencies>;
  let service: TerminalMarketService;

  const mockApiResponse = [
    {
      symbol: 'BTC',
      name: 'Bitcoin',
      description: 'The original cryptocurrency and largest by market cap.',
      szDecimals: 5,
      maxLeverage: 50,
      marginTableId: 0,
      keywords: ['crypto', 'layer-1'],
      tags: ['top-10'],
      categories: ['crypto'],
      marketType: 'crypto',
    },
    {
      symbol: 'ETH',
      name: 'Ethereum',
      szDecimals: 4,
      maxLeverage: 25,
      marginTableId: 1,
      keywords: ['defi', 'layer-1'],
    },
    {
      symbol: 'xyz:TSLA',
      name: 'Tesla',
      szDecimals: 2,
      maxLeverage: 5,
      marginTableId: 2,
      onlyIsolated: true,
      marketType: 'stock',
      tags: ['us-equities'],
      categories: ['stock'],
    },
  ];

  beforeEach(() => {
    mockDeps = createMockInfrastructure();
    service = new TerminalMarketService(mockDeps);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('fetchMarkets', () => {
    it('fetches and maps markets successfully', async () => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve(mockApiResponse),
      } as Response);

      const { markets, metadata } = await service.fetchMarkets();

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://terminal.test-api.cx.metamask.io/v1/perpetuals',
        expect.objectContaining({
          method: 'GET',
          signal: expect.any(AbortSignal),
        }),
      );

      expect(markets).toHaveLength(3);
      expect(markets[0]).toStrictEqual({
        name: 'BTC',
        szDecimals: 5,
        maxLeverage: 50,
        marginTableId: 0,
      });
      expect(markets[2]).toStrictEqual({
        name: 'xyz:TSLA',
        szDecimals: 2,
        maxLeverage: 5,
        marginTableId: 2,
        onlyIsolated: true,
      });

      expect(metadata.size).toBe(3);
      expect(metadata.get('BTC')).toStrictEqual({
        name: 'Bitcoin',
        description: 'The original cryptocurrency and largest by market cap.',
        keywords: ['crypto', 'layer-1'],
        tags: ['top-10'],
        categories: ['crypto'],
        marketType: 'crypto',
      });
      expect(metadata.get('ETH')).toStrictEqual({
        name: 'Ethereum',
        keywords: ['defi', 'layer-1'],
      });
      expect(metadata.get('xyz:TSLA')).toStrictEqual({
        name: 'Tesla',
        marketType: 'stock',
        tags: ['us-equities'],
        categories: ['stock'],
      });
    });

    it('uses the full terminalApiUrl without path concatenation', async () => {
      (mockDeps as Record<string, unknown>).terminalApiUrl =
        'https://terminal.api.cx.metamask.io/v1/perpetuals';

      jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve([]),
      } as Response);

      await service.fetchMarkets();

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://terminal.api.cx.metamask.io/v1/perpetuals',
        expect.any(Object),
      );
    });

    it('throws on non-2xx response', async () => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({}),
      } as Response);

      await expect(service.fetchMarkets()).rejects.toThrow(
        'Terminal API returned 500: Internal Server Error',
      );
    });

    it('throws on non-array response body', async () => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve({ data: [] }),
      } as Response);

      await expect(service.fetchMarkets()).rejects.toThrow(
        'Terminal API returned non-array body: object',
      );
    });

    it('throws on network error', async () => {
      jest
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('Network request failed'));

      await expect(service.fetchMarkets()).rejects.toThrow(
        'Network request failed',
      );
    });

    it('aborts fetch when timeout elapses', async () => {
      jest.useFakeTimers();

      jest.spyOn(globalThis, 'fetch').mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            (init?.signal as AbortSignal)?.addEventListener('abort', () => {
              const { reason } = init?.signal as AbortSignal;
              reject(
                reason instanceof Error ? reason : new Error(String(reason)),
              );
            });
          }),
      );

      const promise = service.fetchMarkets();

      jest.advanceTimersByTime(TERMINAL_API_CONFIG.FetchTimeoutMs);

      await expect(promise).rejects.toThrow('Terminal API fetch timed out');

      jest.useRealTimers();
    });

    it('returns empty arrays for empty API response', async () => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve([]),
      } as Response);

      const { markets, metadata } = await service.fetchMarkets();

      expect(markets).toHaveLength(0);
      expect(metadata.size).toBe(0);
    });

    it('filters out items with missing or empty symbol', async () => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () =>
          Promise.resolve([
            { symbol: '', name: 'Empty' },
            { symbol: 'VALID', name: 'Valid' },
          ]),
      } as Response);

      const { markets, metadata } = await service.fetchMarkets();

      expect(markets).toHaveLength(1);
      expect(markets[0]?.name).toBe('VALID');
      expect(metadata.size).toBe(1);
      expect(metadata.has('VALID')).toBe(true);
    });

    it('filters out items that fail schema validation and logs errors', async () => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () =>
          Promise.resolve([
            { symbol: 123 },
            { name: 'NoSymbol' },
            'not-an-object',
            { symbol: 'VALID', name: 'Valid' },
          ]),
      } as Response);

      const { markets, metadata } = await service.fetchMarkets();

      expect(markets).toHaveLength(1);
      expect(markets[0]?.name).toBe('VALID');
      expect(metadata.size).toBe(1);
      expect(mockDeps.logger.error).toHaveBeenCalledTimes(3);
      expect(mockDeps.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Terminal API item failed schema validation',
        }),
        expect.objectContaining({
          tags: { feature: 'perps', source: 'terminal-api' },
          context: expect.objectContaining({
            name: 'TerminalMarketService.validateItems',
          }),
        }),
      );
    });

    it('accepts items with extra properties returned by the backend', async () => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () =>
          Promise.resolve([
            {
              symbol: 'BTC',
              name: 'Bitcoin',
              szDecimals: 5,
              maxLeverage: 50,
              marginTableId: 0,
              // Extra properties not in the schema
              price: 67000.5,
              iconUrl: 'https://example.com/btc.png',
              trend: 'bullish',
              volume24h: 1234567890,
              sparklineData: [65000, 66000, 67000],
            },
          ]),
      } as Response);

      const { markets, metadata } = await service.fetchMarkets();

      expect(markets).toHaveLength(1);
      expect(markets[0]).toStrictEqual({
        name: 'BTC',
        szDecimals: 5,
        maxLeverage: 50,
        marginTableId: 0,
      });
      expect(metadata.get('BTC')?.name).toBe('Bitcoin');
      expect(mockDeps.logger.error).not.toHaveBeenCalled();
    });

    it('accepts only known MarketCategory values as marketType', async () => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () =>
          Promise.resolve([
            { symbol: 'BTC', name: 'Bitcoin', marketType: 'crypto' },
            { symbol: 'TSLA', name: 'Tesla', marketType: 'stock' },
            { symbol: 'MEME', name: 'MemeCoin', marketType: 'meme' },
            { symbol: 'FOO', name: 'Foo', marketType: '' },
          ]),
      } as Response);

      const { metadata } = await service.fetchMarkets();

      expect(metadata.get('BTC')?.marketType).toBe('crypto');
      expect(metadata.get('TSLA')?.marketType).toBe('stock');
      expect(metadata.get('MEME')?.marketType).toBeUndefined();
      expect(metadata.get('FOO')?.marketType).toBeUndefined();
    });

    it('uses defaults for missing numeric fields', async () => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve([{ symbol: 'FOO' }]),
      } as Response);

      const { markets } = await service.fetchMarkets();

      expect(markets[0]).toStrictEqual({
        name: 'FOO',
        szDecimals: 0,
        maxLeverage: 1,
        marginTableId: 0,
      });
    });

    it('omits name from metadata when Terminal does not supply one', async () => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve([{ symbol: 'UNKNOWN' }]),
      } as Response);

      const { metadata } = await service.fetchMarkets();

      expect(metadata.get('UNKNOWN')?.name).toBeUndefined();
    });

    it('captures description when Terminal supplies one', async () => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () =>
          Promise.resolve([
            {
              symbol: 'ETH',
              name: 'Ethereum',
              description: 'The leading smart contract platform.',
            },
          ]),
      } as Response);

      const { metadata } = await service.fetchMarkets();

      expect(metadata.get('ETH')?.description).toBe(
        'The leading smart contract platform.',
      );
    });

    it('omits description when Terminal supplies null or empty', async () => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () =>
          Promise.resolve([
            { symbol: 'ORBS', name: 'Orbs', description: null },
            { symbol: 'FOO', name: 'Foo', description: '' },
            { symbol: 'BAR', name: 'Bar' },
          ]),
      } as Response);

      const { metadata } = await service.fetchMarkets();

      expect(metadata.get('ORBS')?.description).toBeUndefined();
      expect(metadata.get('FOO')?.description).toBeUndefined();
      expect(metadata.get('BAR')?.description).toBeUndefined();
    });

    describe('listedAt handling', () => {
      it('passes through a numeric listedAt as-is', async () => {
        const epochMs = 1_700_000_000_000;
        jest.spyOn(globalThis, 'fetch').mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () =>
            Promise.resolve([
              { symbol: 'BTC', name: 'Bitcoin', listedAt: epochMs },
            ]),
        } as Response);

        const { metadata } = await service.fetchMarkets();

        expect(metadata.get('BTC')?.listedAt).toBe(epochMs);
      });

      it('parses an ISO string listedAt to epoch ms', async () => {
        const isoString = '2023-11-14T22:13:20.000Z';
        const expectedMs = Date.parse(isoString);
        jest.spyOn(globalThis, 'fetch').mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () =>
            Promise.resolve([
              { symbol: 'ETH', name: 'Ethereum', listedAt: isoString },
            ]),
        } as Response);

        const { metadata } = await service.fetchMarkets();

        expect(metadata.get('ETH')?.listedAt).toBe(expectedMs);
      });

      it('omits listedAt when the string is not a valid date', async () => {
        jest.spyOn(globalThis, 'fetch').mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () =>
            Promise.resolve([
              { symbol: 'DOGE', name: 'Dogecoin', listedAt: 'not-a-date' },
            ]),
        } as Response);

        const { metadata } = await service.fetchMarkets();

        expect(metadata.get('DOGE')?.listedAt).toBeUndefined();
      });

      it('omits listedAt when the value is null', async () => {
        jest.spyOn(globalThis, 'fetch').mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () => Promise.resolve([{ symbol: 'SOL', listedAt: null }]),
        } as Response);

        const { metadata } = await service.fetchMarkets();

        expect(metadata.get('SOL')?.listedAt).toBeUndefined();
      });

      it('omits listedAt when the field is absent', async () => {
        jest.spyOn(globalThis, 'fetch').mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () => Promise.resolve([{ symbol: 'AVAX' }]),
        } as Response);

        const { metadata } = await service.fetchMarkets();

        expect(metadata.get('AVAX')?.listedAt).toBeUndefined();
      });
    });
  });

  describe('cache behavior', () => {
    it('returns cached data on second call within TTL', async () => {
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve(mockApiResponse),
      } as Response);

      const first = await service.fetchMarkets();
      const second = await service.fetchMarkets();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(second.markets).toBe(first.markets);
      expect(second.metadata).toBe(first.metadata);
    });

    it('fetches again after cache is cleared', async () => {
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve(mockApiResponse),
      } as Response);

      await service.fetchMarkets();
      service.clearCache();
      await service.fetchMarkets();

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('fetches again after TTL expires', async () => {
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve(mockApiResponse),
      } as Response);

      await service.fetchMarkets();

      // Advance time past TTL (5 minutes)
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 6 * 60 * 1000);

      await service.fetchMarkets();

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('logError', () => {
    it('logs error to Sentry via deps.logger', () => {
      const error = new Error('fetch failed');
      service.logError(error, 'getMarkets');

      expect(mockDeps.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'fetch failed' }),
        expect.objectContaining({
          tags: { feature: 'perps', source: 'terminal-api' },
          context: {
            name: 'TerminalMarketService.getMarkets',
            data: {
              url: 'https://terminal.test-api.cx.metamask.io/v1/perpetuals',
            },
          },
        }),
      );
    });
  });
});
