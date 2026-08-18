import { TERMINAL_API_CONFIG } from '../../../src/constants/perpsConfig.js';
import { TerminalMarketService } from '../../../src/services/TerminalMarketService.js';
import type { PerpsPlatformDependencies } from '../../../src/types/index.js';
import { createMockInfrastructure } from '../../helpers/serviceMocks.js';

const SNAPSHOT_NOW = 1_700_000_030_000;
const HUGE_FINITE_DECIMAL = `1${'0'.repeat(308)}`;

const createSnapshotMarket = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  symbol: 'BTC',
  provider: 'hyperliquid',
  dex: 'main',
  name: 'Bitcoin',
  description: 'Original cryptocurrency',
  iconUrl: 'https://example.com/btc.png',
  szDecimals: 5,
  maxLeverage: 50,
  markPrice: '50000',
  price: '50000',
  midPrice: '50001',
  oraclePrice: '49999',
  change24h: '125',
  changePercent24h: 0.25,
  funding: '0.0001',
  volume24h: '1000000',
  openInterest: '1000000',
  category: 'crypto',
  keywords: ['bitcoin'],
  tags: ['top-10'],
  listedAt: 1_600_000_000_000,
  trend: [
    [SNAPSHOT_NOW - 3_600_000, '49000'],
    [SNAPSHOT_NOW - 1_000, '50000'],
  ],
  ...overrides,
});

const createGlobalSnapshot = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  schemaVersion: 2,
  provider: 'hyperliquid',
  network: 'mainnet',
  enabledDexes: ['main'],
  fingerprint:
    'sha256:21c2aec213ce0cf6c0d8624570abfe1a07dd68f7ee2f4e07e9fe2785d3d0212c',
  generatedAt: SNAPSHOT_NOW - 1_000,
  receivedAt: SNAPSHOT_NOW - 2_000,
  maxAgeMs: 60_000,
  complete: true,
  perDexErrors: [],
  markets: [createSnapshotMarket()],
  ...overrides,
});

const okJsonResponse = (body: unknown): Response =>
  ({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  }) as Response;

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

    it('uses the full marketDataUrl without path concatenation', async () => {
      mockDeps.terminalApi = {
        marketDataUrl: 'https://terminal.api.cx.metamask.io/v1/perpetuals',
      };

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

    it('maps Terminal category pre_ipo to marketType pre-ipo when marketType is absent', async () => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () =>
          Promise.resolve([
            {
              symbol: 'xyz:UNITREE',
              name: 'Unitree Technology',
              category: 'pre_ipo',
            },
            {
              symbol: 'xyz:CXMT',
              name: 'ChangXin Technology',
              category: 'pre_ipo',
            },
            {
              symbol: 'xyz:SKHY',
              name: 'SK Hynix ADR',
              category: 'pre_ipo',
            },
          ]),
      } as Response);

      const { metadata } = await service.fetchMarkets();

      expect(metadata.get('xyz:UNITREE')?.marketType).toBe('pre-ipo');
      expect(metadata.get('xyz:CXMT')?.marketType).toBe('pre-ipo');
      expect(metadata.get('xyz:SKHY')?.marketType).toBe('pre-ipo');
    });

    it('prefers explicit marketType over category pre_ipo', async () => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () =>
          Promise.resolve([
            {
              symbol: 'xyz:UNITREE',
              name: 'Unitree Technology',
              category: 'pre_ipo',
              marketType: 'stock',
            },
          ]),
      } as Response);

      const { metadata } = await service.fetchMarkets();

      expect(metadata.get('xyz:UNITREE')?.marketType).toBe('stock');
    });

    it('maps Terminal category stocks to marketType stock when marketType is absent', async () => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () =>
          Promise.resolve([
            { symbol: 'xyz:CBRS', name: 'Cerebras Systems', category: 'stocks' },
          ]),
      } as Response);

      const { metadata } = await service.fetchMarkets();

      expect(metadata.get('xyz:CBRS')?.marketType).toBe('stock');
    });

    it('does not map an unknown Terminal category to marketType', async () => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () =>
          Promise.resolve([
            { symbol: 'xyz:FOO', name: 'Foo', category: 'unknown' },
          ]),
      } as Response);

      const { metadata } = await service.fetchMarkets();

      expect(metadata.get('xyz:FOO')?.marketType).toBeUndefined();
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

  describe('fetchGlobalSnapshot', () => {
    beforeEach(() => {
      jest.spyOn(Date, 'now').mockReturnValue(SNAPSHOT_NOW);
      mockDeps.terminalApi = {
        ...mockDeps.terminalApi,
        globalSnapshotUrl:
          'https://terminal.test-api.cx.metamask.io/v2/perpetuals',
      };
    });

    it('strictly validates and maps a fresh v2 snapshot', async () => {
      jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(okJsonResponse(createGlobalSnapshot()));

      const result = await service.fetchGlobalSnapshot({
        provider: 'hyperliquid',
        network: 'mainnet',
        enabledDexes: ['main'],
      });

      expect(result).toStrictEqual({
        markets: [
          {
            symbol: 'BTC',
            name: 'Bitcoin',
            description: 'Original cryptocurrency',
            maxLeverage: '50x',
            price: '$50000.00',
            change24h: '+$125.00',
            change24hPercent: '0.25%',
            volume: '$1000000',
            openInterest: '$1000000',
            fundingRate: 0.0001,
            marketSource: undefined,
            marketType: 'crypto',
            isHip3: false,
            isNewMarket: false,
            keywords: ['bitcoin'],
            tags: ['top-10'],
            categories: ['crypto'],
            listedAt: 1_600_000_000_000,
            trend: [
              [SNAPSHOT_NOW - 3_600_000, '49000'],
              [SNAPSHOT_NOW - 1_000, '50000'],
            ],
            dataSource: 'terminal-global-snapshot-mark',
            sourceExpiresAt: SNAPSHOT_NOW + 28_000,
          },
        ],
        expiresAt: SNAPSHOT_NOW + 28_000,
      });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://terminal.test-api.cx.metamask.io/v2/perpetuals?provider=hyperliquid&network=mainnet&dexes=main',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('keeps main first when canonicalizing requested DEXes', async () => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      } as Response);

      await expect(
        service.fetchGlobalSnapshot({
          provider: 'hyperliquid',
          network: 'mainnet',
          enabledDexes: ['flx', 'main'],
        }),
      ).rejects.toThrow('Terminal global snapshot returned 503');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://terminal.test-api.cx.metamask.io/v2/perpetuals?provider=hyperliquid&network=mainnet&dexes=main%2Cflx',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it.each([
      ['unknown top-level key', createGlobalSnapshot({ extra: true })],
      [
        'unknown market key',
        createGlobalSnapshot({
          markets: [createSnapshotMarket({ extra: true })],
        }),
      ],
      [
        'incoherent mark-based percent',
        createGlobalSnapshot({
          markets: [createSnapshotMarket({ changePercent24h: 9 })],
        }),
      ],
      [
        'incoherent deprecated price alias',
        createGlobalSnapshot({
          markets: [createSnapshotMarket({ price: '50001' })],
        }),
      ],
      [
        'overflowing mark/change subtraction',
        createGlobalSnapshot({
          markets: [
            createSnapshotMarket({
              markPrice: HUGE_FINITE_DECIMAL,
              change24h: `-${HUGE_FINITE_DECIMAL}`,
              changePercent24h: 0,
            }),
          ],
        }),
      ],
      [
        'unordered trend timestamps',
        createGlobalSnapshot({
          markets: [
            createSnapshotMarket({
              trend: [
                [SNAPSHOT_NOW - 1_000, '50000'],
                [SNAPSHOT_NOW - 2_000, '49999'],
              ],
            }),
          ],
        }),
      ],
      [
        'future trend timestamp',
        createGlobalSnapshot({
          markets: [
            createSnapshotMarket({
              trend: [[SNAPSHOT_NOW + 1, '50000']],
            }),
          ],
        }),
      ],
      [
        'seconds-based listedAt timestamp',
        createGlobalSnapshot({
          markets: [createSnapshotMarket({ listedAt: 1_700_000_000 })],
        }),
      ],
    ])('rejects %s', async (_name, snapshot) => {
      jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(okJsonResponse(snapshot));

      await expect(
        service.fetchGlobalSnapshot({
          provider: 'hyperliquid',
          network: 'mainnet',
          enabledDexes: ['main'],
        }),
      ).rejects.toThrow('Terminal global snapshot');
    });

    it.each([
      ['empty', []],
      ['single-point', [[SNAPSHOT_NOW - 1_000, '50000']]],
      [
        'irregular or stale',
        [
          [SNAPSHOT_NOW - 10_800_000, '49000'],
          [SNAPSHOT_NOW - 1_000, '50000'],
        ],
      ],
    ])('accepts %s optional trend data', async (_name, trend) => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        okJsonResponse(
          createGlobalSnapshot({
            markets: [createSnapshotMarket({ trend })],
          }),
        ),
      );

      const result = await service.fetchGlobalSnapshot({
        provider: 'hyperliquid',
        network: 'mainnet',
        enabledDexes: ['main'],
      });

      expect(result).toMatchObject({ markets: [{ trend }] });
    });

    it('rejects a response larger than the snapshot payload limit', async () => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve('x'.repeat(1_048_577)),
      } as Response);

      await expect(
        service.fetchGlobalSnapshot({
          provider: 'hyperliquid',
          network: 'mainnet',
          enabledDexes: ['main'],
        }),
      ).rejects.toThrow('payload exceeds');
    });

    it('rejects an oversized Content-Length before allocating response text', async () => {
      const text = jest.fn().mockRejectedValue(new Error('must not read'));
      jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: {
          get: jest.fn().mockReturnValue('1048577'),
        } as unknown as Headers,
        text,
      } as Response);

      await expect(
        service.fetchGlobalSnapshot({
          provider: 'hyperliquid',
          network: 'mainnet',
          enabledDexes: ['main'],
        }),
      ).rejects.toThrow('payload exceeds');
      expect(text).not.toHaveBeenCalled();
    });

    it('aborts when the response body stalls', async () => {
      jest.useFakeTimers();
      jest.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
        const signal = init?.signal as AbortSignal;
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: { get: () => null } as unknown as Headers,
          text: () =>
            new Promise((_resolve, reject) => {
              signal.addEventListener('abort', () => {
                reject(
                  signal.reason instanceof Error
                    ? signal.reason
                    : new Error(String(signal.reason)),
                );
              });
            }),
        } as Response);
      });

      const pending = service.fetchGlobalSnapshot({
        provider: 'hyperliquid',
        network: 'mainnet',
        enabledDexes: ['main'],
      });
      await Promise.resolve();

      jest.advanceTimersByTime(TERMINAL_API_CONFIG.FetchTimeoutMs);

      await expect(pending).rejects.toThrow(
        'Terminal global snapshot timed out',
      );
      jest.useRealTimers();
    });

    it.each([
      ['version', { schemaVersion: 1 }],
      ['provider', { provider: 'other' }],
      ['network', { network: 'testnet' }],
      ['DEX set', { enabledDexes: ['main', 'xyz'] }],
      ['fingerprint', { fingerprint: 'sha256:wrong' }],
      ['empty markets', { markets: [] }],
      ['incomplete', { complete: false }],
      ['per-DEX error', { perDexErrors: [{ dex: 'main', error: 'TIMEOUT' }] }],
      ['future generatedAt', { generatedAt: SNAPSHOT_NOW + 5_001 }],
      ['future receivedAt', { receivedAt: SNAPSHOT_NOW + 5_001 }],
      [
        'stale source age',
        {
          generatedAt: SNAPSHOT_NOW - 31_000,
          receivedAt: SNAPSHOT_NOW - 31_000,
          maxAgeMs: 60_000,
        },
      ],
    ])('rejects a snapshot with invalid %s', async (_name, overrides) => {
      jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(okJsonResponse(createGlobalSnapshot(overrides)));

      await expect(
        service.fetchGlobalSnapshot({
          provider: 'hyperliquid',
          network: 'mainnet',
          enabledDexes: ['main'],
        }),
      ).rejects.toThrow('Terminal global snapshot');
    });

    it('accepts timestamps within the producer clock-skew allowance', async () => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        okJsonResponse(
          createGlobalSnapshot({
            generatedAt: SNAPSHOT_NOW + 5_000,
            receivedAt: SNAPSHOT_NOW + 5_000,
          }),
        ),
      );

      const result = await service.fetchGlobalSnapshot({
        provider: 'hyperliquid',
        network: 'mainnet',
        enabledDexes: ['main'],
      });

      expect(result.markets).toStrictEqual(expect.any(Array));
    });

    it.each([
      ['oracle price', { oraclePrice: '0' }],
      ['mid price', { midPrice: '0' }],
    ])('rejects a non-positive %s', async (_name, marketOverrides) => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        okJsonResponse(
          createGlobalSnapshot({
            markets: [createSnapshotMarket(marketOverrides)],
          }),
        ),
      );

      await expect(
        service.fetchGlobalSnapshot({
          provider: 'hyperliquid',
          network: 'mainnet',
          enabledDexes: ['main'],
        }),
      ).rejects.toThrow('reference price');
    });

    it.each([
      ['duplicate market', [createSnapshotMarket(), createSnapshotMarket()]],
      [
        'missing requested DEX',
        [
          createSnapshotMarket(),
          createSnapshotMarket({
            symbol: 'BTC2',
          }),
        ],
      ],
      ['invalid open interest', [createSnapshotMarket({ openInterest: '-1' })]],
      ['empty non-null name', [createSnapshotMarket({ name: '' })]],
    ])('rejects %s', async (_name, markets) => {
      const needsXyz = _name === 'missing requested DEX';
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        okJsonResponse(
          createGlobalSnapshot({
            ...(needsXyz && {
              enabledDexes: ['main', 'xyz'],
              fingerprint:
                'sha256:2680c000d74e6b46aaddfc5f944442d235961fcdf1d9063af15989285be39bb7',
            }),
            markets,
          }),
        ),
      );

      await expect(
        service.fetchGlobalSnapshot({
          provider: 'hyperliquid',
          network: 'mainnet',
          enabledDexes: needsXyz ? ['main', 'xyz'] : ['main'],
        }),
      ).rejects.toThrow('Terminal global snapshot');
    });

    it('coalesces same-key requests and isolates different identities', async () => {
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(okJsonResponse(createGlobalSnapshot()))
        .mockResolvedValueOnce(
          okJsonResponse(
            createGlobalSnapshot({
              network: 'testnet',
              fingerprint:
                'sha256:0077720707e8b99ea78df074cdaa58522d331b47f7dcd9bd7cff6f706ffd44db',
            }),
          ),
        );
      const request = {
        provider: 'hyperliquid' as const,
        network: 'mainnet' as const,
        enabledDexes: ['main'],
      };

      await Promise.all([
        service.fetchGlobalSnapshot(request),
        service.fetchGlobalSnapshot(request),
      ]);
      await service.fetchGlobalSnapshot({
        ...request,
        network: 'testnet',
      });

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('bounds cache TTL by source age and the 30-second consumer cap', async () => {
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(okJsonResponse(createGlobalSnapshot()));
      const request = {
        provider: 'hyperliquid' as const,
        network: 'mainnet' as const,
        enabledDexes: ['main'],
      };

      await service.fetchGlobalSnapshot(request);
      jest.spyOn(Date, 'now').mockReturnValue(SNAPSHOT_NOW + 27_999);
      await service.fetchGlobalSnapshot(request);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      jest.spyOn(Date, 'now').mockReturnValue(SNAPSHOT_NOW + 28_000);
      await expect(service.fetchGlobalSnapshot(request)).rejects.toThrow(
        'stale',
      );
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('does not cache rejected data', async () => {
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(
          okJsonResponse(createGlobalSnapshot({ fingerprint: 'invalid' })),
        );
      const request = {
        provider: 'hyperliquid' as const,
        network: 'mainnet' as const,
        enabledDexes: ['main'],
      };

      await expect(service.fetchGlobalSnapshot(request)).rejects.toThrow(
        'Terminal global snapshot',
      );
      await expect(service.fetchGlobalSnapshot(request)).rejects.toThrow(
        'Terminal global snapshot',
      );

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('keeps the legacy cache separate and clears both accepted caches', async () => {
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(okJsonResponse(createGlobalSnapshot()))
        .mockResolvedValueOnce(okJsonResponse(mockApiResponse))
        .mockResolvedValueOnce(okJsonResponse(createGlobalSnapshot()));
      const request = {
        provider: 'hyperliquid' as const,
        network: 'mainnet' as const,
        enabledDexes: ['main'],
      };

      await service.fetchGlobalSnapshot(request);
      await service.fetchMarkets();
      service.clearCache();
      await service.fetchGlobalSnapshot(request);

      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it('does not reuse or recache an in-flight response after clearCache', async () => {
      let resolveFirst: ((response: Response) => void) | undefined;
      let resolveSecond: ((response: Response) => void) | undefined;
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockImplementationOnce(
          () =>
            new Promise<Response>((resolve) => {
              resolveFirst = resolve;
            }),
        )
        .mockImplementationOnce(
          () =>
            new Promise<Response>((resolve) => {
              resolveSecond = resolve;
            }),
        );
      const request = {
        provider: 'hyperliquid' as const,
        network: 'mainnet' as const,
        enabledDexes: ['main'],
      };

      const oldRequest = service.fetchGlobalSnapshot(request);
      service.clearCache();
      const newRequest = service.fetchGlobalSnapshot(request);
      resolveFirst?.(okJsonResponse(createGlobalSnapshot()));
      await oldRequest;
      resolveSecond?.(okJsonResponse(createGlobalSnapshot()));
      const fresh = await newRequest;
      const cached = await service.fetchGlobalSnapshot(request);

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(cached).toStrictEqual(fresh);
      expect(cached).not.toBe(fresh);
    });

    it('does not expose mutable references from the validated cache', async () => {
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(okJsonResponse(createGlobalSnapshot()));
      const request = {
        provider: 'hyperliquid' as const,
        network: 'mainnet' as const,
        enabledDexes: ['main'],
      };

      const first = await service.fetchGlobalSnapshot(request);
      first.markets[0].trend?.push([SNAPSHOT_NOW, '1']);
      first.markets.splice(0);
      const second = await service.fetchGlobalSnapshot(request);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(second.markets).toHaveLength(1);
      expect(second.markets[0].trend).toHaveLength(2);
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
