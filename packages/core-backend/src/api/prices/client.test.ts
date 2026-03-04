/**
 * Prices API Client Tests - price.api.cx.metamask.io
 */

import type {
  PriceSupportedNetworksResponse,
  V1ExchangeRatesResponse,
  V3SpotPricesResponse,
} from './types';
import type { ApiPlatformClient } from '../ApiPlatformClient';
import { API_URLS } from '../shared-types';
import type { FetchOptions } from '../shared-types';
import {
  createMockResponse,
  mockFetch,
  setupTestEnvironment,
} from '../test-utils';

describe('PricesApiClient', () => {
  let client: ApiPlatformClient;

  beforeEach(() => {
    ({ client } = setupTestEnvironment());
  });

  describe('Supported Networks', () => {
    it('fetches price v1 supported networks', async () => {
      const mockResponse = {
        fullSupport: ['0x1', '0x89'],
        partialSupport: ['0x38'],
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.prices.fetchPriceV1SupportedNetworks();

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        `${API_URLS.PRICES}/v1/supportedNetworks`,
        expect.any(Object),
      );
    });

    it('fetches price v2 supported networks', async () => {
      const mockResponse = {
        fullSupport: ['eip155:1', 'eip155:137'],
        partialSupport: ['eip155:56'],
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.prices.fetchPriceV2SupportedNetworks();

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        `${API_URLS.PRICES}/v2/supportedNetworks`,
        expect.any(Object),
      );
    });
  });

  describe('Exchange Rates', () => {
    it('fetches exchange rates for base currency', async () => {
      const mockResponse: V1ExchangeRatesResponse = {
        USD: {
          name: 'US Dollar',
          ticker: 'USD',
          value: 1,
          currencyType: 'fiat',
        },
        EUR: { name: 'Euro', ticker: 'EUR', value: 0.85, currencyType: 'fiat' },
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.prices.fetchV1ExchangeRates('USD');

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/exchange-rates'),
        expect.any(Object),
      );
    });

    it('returns empty object for empty baseCurrency', async () => {
      const result = await client.prices.fetchV1ExchangeRates('');

      expect(result).toStrictEqual({});
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('fetches fiat exchange rates', async () => {
      const mockResponse: V1ExchangeRatesResponse = {
        USD: {
          name: 'US Dollar',
          ticker: 'USD',
          value: 1,
          currencyType: 'fiat',
        },
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.prices.fetchV1FiatExchangeRates();

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/exchange-rates/fiat'),
        expect.any(Object),
      );
    });

    it('fetches crypto exchange rates', async () => {
      const mockResponse: V1ExchangeRatesResponse = {
        BTC: {
          name: 'Bitcoin',
          ticker: 'BTC',
          value: 45000,
          currencyType: 'crypto',
        },
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.prices.fetchV1CryptoExchangeRates();

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/exchange-rates/crypto'),
        expect.any(Object),
      );
    });
  });

  describe('Spot Prices', () => {
    it('fetches v1 spot prices by coin IDs', async () => {
      const mockResponse = {
        ethereum: { id: 'ethereum', price: 2500 },
        bitcoin: { id: 'bitcoin', price: 45000 },
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.prices.fetchV1SpotPricesByCoinIds([
        'ethereum',
        'bitcoin',
      ]);

      expect(result).toStrictEqual(mockResponse);
    });

    it('returns empty object for empty coinIds array', async () => {
      const result = await client.prices.fetchV1SpotPricesByCoinIds([]);

      expect(result).toStrictEqual({});
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('fetches v3 spot prices by asset IDs', async () => {
      const mockResponse: V3SpotPricesResponse = {
        'eip155:1/slip44:60': { price: 2500, pricePercentChange1d: 2.5 },
        'eip155:137/slip44:60': { price: 0.85, pricePercentChange1d: -1.2 },
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.prices.fetchV3SpotPrices([
        'eip155:1/slip44:60',
        'eip155:137/slip44:60',
      ]);

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v3/spot-prices'),
        expect.any(Object),
      );
    });

    it('returns empty object for empty assetIds array in v3 spot prices', async () => {
      const result = await client.prices.fetchV3SpotPrices([]);

      expect(result).toStrictEqual({});
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('fetches v1 token prices by chain', async () => {
      const mockResponse = {
        '0xtoken1': { usd: 1.5 },
        '0xtoken2': { usd: 2.0 },
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.prices.fetchV1TokenPrices('0x1', [
        '0xtoken1',
        '0xtoken2',
      ]);

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/chains/1/spot-prices'),
        expect.any(Object),
      );
    });

    it('returns empty object for empty tokenAddresses in v1 token prices', async () => {
      const result = await client.prices.fetchV1TokenPrices('0x1', []);

      expect(result).toStrictEqual({});
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('fetchV1TokenPrice throws on request error', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ error: 'Not found' }, 404, 'Not Found'),
      );

      await expect(
        client.prices.fetchV1TokenPrice('0x1', '0xtoken', 'usd'),
      ).rejects.toThrow(Error);
    });

    it('fetches single token price successfully', async () => {
      const mockResponse = {
        price: 2500,
        currency: 'usd',
        priceChange1d: 50,
        pricePercentChange1d: 2.0,
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.prices.fetchV1TokenPrice(
        '0x1',
        '0xtoken',
        'usd',
      );

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/chains/1/spot-prices/0xtoken'),
        expect.any(Object),
      );
    });

    it('fetches v1 spot price by coin ID', async () => {
      const mockResponse = {
        id: 'ethereum',
        price: 2500,
        marketCap: 300000000000,
        totalVolume: 15000000000,
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.prices.fetchV1SpotPriceByCoinId(
        'ethereum',
        'usd',
      );

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/spot-prices/ethereum'),
        expect.any(Object),
      );
    });

    it('fetches v2 spot prices', async () => {
      const mockResponse = {
        '0xtoken1': {
          price: 1.5,
          currency: 'usd',
          priceChange1d: 0.05,
          pricePercentChange1d: 3.5,
        },
        '0xtoken2': {
          price: 2.0,
          currency: 'usd',
          priceChange1d: -0.1,
          pricePercentChange1d: -4.8,
        },
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.prices.fetchV2SpotPrices(
        '0x1',
        ['0xtoken1', '0xtoken2'],
        {
          currency: 'usd',
          includeMarketData: true,
        },
      );

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v2/chains/1/spot-prices'),
        expect.any(Object),
      );
    });

    it('returns empty object for empty tokenAddresses in v2 spot prices', async () => {
      const result = await client.prices.fetchV2SpotPrices('0x1', []);

      expect(result).toStrictEqual({});
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Historical Prices', () => {
    it('fetches historical prices by coin ID', async () => {
      const mockResponse = {
        prices: [[1704067200000, 2500]],
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.prices.fetchV1HistoricalPricesByCoinId(
        'ethereum',
        {
          currency: 'usd',
          timePeriod: '7d',
        },
      );

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/historical-prices/ethereum'),
        expect.any(Object),
      );
    });

    it('fetches v3 historical prices', async () => {
      const mockResponse = {
        prices: [[1704067200000, 2500]],
        marketCaps: [[1704067200000, 300000000000]],
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.prices.fetchV3HistoricalPrices(
        'eip155:1',
        'slip44:60',
        { currency: 'usd', timePeriod: '7d' },
      );

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v3/historical-prices/eip155:1/slip44:60'),
        expect.any(Object),
      );
    });

    it('fetches historical prices by token addresses', async () => {
      const mockResponse = {
        prices: [
          [1704067200000, 1.5],
          [1704153600000, 1.6],
        ],
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result =
        await client.prices.fetchV1HistoricalPricesByTokenAddresses(
          '0x1',
          ['0xtoken1', '0xtoken2'],
          {
            currency: 'usd',
            timePeriod: '7d',
            from: 1704067200,
            to: 1704672000,
          },
        );

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/chains/1/historical-prices'),
        expect.any(Object),
      );
    });

    it('fetches v1 historical prices for single token', async () => {
      const mockResponse = {
        prices: [
          [1704067200000, 2500],
          [1704153600000, 2550],
        ],
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.prices.fetchV1HistoricalPrices(
        '0x1',
        '0xtoken',
        {
          currency: 'usd',
          timeRange: '30d',
        },
      );

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/chains/1/historical-prices/0xtoken'),
        expect.any(Object),
      );
    });

    it('fetches historical price graph by coin ID', async () => {
      const mockResponse = {
        prices: [
          [1704067200000, 2500],
          [1704153600000, 2550],
        ],
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.prices.fetchV1HistoricalPriceGraphByCoinId(
        'ethereum',
        {
          currency: 'usd',
          includeOHLC: true,
        },
      );

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/historical-prices-graph/ethereum'),
        expect.any(Object),
      );
    });

    it('fetches historical price graph by token address', async () => {
      const mockResponse = {
        prices: [
          [1704067200000, 1.5],
          [1704153600000, 1.6],
        ],
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result =
        await client.prices.fetchV1HistoricalPriceGraphByTokenAddress(
          '0x1',
          '0xtoken',
          { currency: 'usd', includeOHLC: false },
        );

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/chains/1/historical-prices-graph/0xtoken'),
        expect.any(Object),
      );
    });
  });

  describe('Default Parameter Values', () => {
    it('uses default currency for fetchV1SpotPriceByCoinId', async () => {
      const mockResponse = { ethereum: { usd: 2500 } };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      await client.prices.fetchV1SpotPriceByCoinId('ethereum');

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('vsCurrency=usd');
    });

    it('uses custom currency for fetchV1SpotPriceByCoinId', async () => {
      const mockResponse = { ethereum: { eth: 1 } };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      await client.prices.fetchV1SpotPriceByCoinId('ethereum', 'eth');

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('vsCurrency=eth');
    });

    it('uses default currency for fetchV1TokenPrice', async () => {
      const mockResponse = { price: 1.5 };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      await client.prices.fetchV1TokenPrice('0x1', '0xtoken');

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('vsCurrency=usd');
    });

    it('uses custom currency for fetchV1TokenPrice', async () => {
      const mockResponse = { price: 0.0006 };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      await client.prices.fetchV1TokenPrice('0x1', '0xtoken', 'eth');

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('vsCurrency=eth');
    });

    it('uses default options for fetchV2SpotPrices', async () => {
      const mockResponse = { '0xtoken': { price: 1.5 } };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      await client.prices.fetchV2SpotPrices('0x1', ['0xtoken']);

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('vsCurrency=usd');
      expect(calledUrl).toContain('includeMarketData=true');
    });

    it('uses default options for fetchV1HistoricalPrices', async () => {
      const mockResponse = { prices: [[1704067200000, 1.5]] };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      await client.prices.fetchV1HistoricalPrices('0x1', '0xtoken');

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('vsCurrency=usd');
      expect(calledUrl).toContain('timePeriod=7d');
    });

    it('uses default options for fetchV1HistoricalPriceGraphByCoinId', async () => {
      const mockResponse = { prices: [[1704067200000, 1.5]] };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      await client.prices.fetchV1HistoricalPriceGraphByCoinId('ethereum');

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('vsCurrency=usd');
      expect(calledUrl).toContain('includeOHLC=false');
    });

    it('uses default options for fetchV1HistoricalPriceGraphByTokenAddress', async () => {
      const mockResponse = { prices: [[1704067200000, 1.5]] };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      await client.prices.fetchV1HistoricalPriceGraphByTokenAddress(
        '0x1',
        '0xtoken',
      );

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('vsCurrency=usd');
      expect(calledUrl).toContain('includeOHLC=false');
    });
  });

  describe('get*QueryOptions default currency branch', () => {
    it('getV1SpotPriceByCoinIdQueryOptions uses default currency usd when not passed', () => {
      const options =
        client.prices.getV1SpotPriceByCoinIdQueryOptions('ethereum');
      expect(options.queryKey).toStrictEqual([
        'prices',
        'v1SpotPriceByCoinId',
        'ethereum',
        'usd',
      ]);
    });

    it('getV1TokenPriceQueryOptions uses default currency usd when not passed', () => {
      const options = client.prices.getV1TokenPriceQueryOptions(
        '0x1',
        '0xabc123',
      );
      expect(options.queryKey).toStrictEqual([
        'prices',
        'v1TokenPrice',
        '0x1',
        '0xabc123',
        'usd',
      ]);
    });
  });

  describe('get*QueryOptions empty-input short-circuit', () => {
    it('getV1SpotPricesByCoinIdsQueryOptions queryFn returns {} for empty coinIds without calling fetch', async () => {
      const options = client.prices.getV1SpotPricesByCoinIdsQueryOptions([]);
      if (!options.queryFn) {
        throw new Error('queryFn is required');
      }
      const result = await options.queryFn({
        queryKey: options.queryKey,
        signal: new AbortController().signal,
        meta: undefined,
      });

      expect(result).toStrictEqual({});
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('getV1TokenPricesQueryOptions queryFn returns {} for empty tokenAddresses without calling fetch', async () => {
      const options = client.prices.getV1TokenPricesQueryOptions('0x1', []);
      if (!options.queryFn) {
        throw new Error('queryFn is required');
      }
      const result = await options.queryFn({
        queryKey: options.queryKey,
        signal: new AbortController().signal,
        meta: undefined,
      });

      expect(result).toStrictEqual({});
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('getV2SpotPricesQueryOptions queryFn returns {} for empty tokenAddresses without calling fetch', async () => {
      const options = client.prices.getV2SpotPricesQueryOptions('0x1', []);
      if (!options.queryFn) {
        throw new Error('queryFn is required');
      }
      const result = await options.queryFn({
        queryKey: options.queryKey,
        signal: new AbortController().signal,
        meta: undefined,
      });

      expect(result).toStrictEqual({});
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('getV3SpotPricesQueryOptions queryFn returns {} for empty assetIds without calling fetch', async () => {
      const options = client.prices.getV3SpotPricesQueryOptions([]);
      if (!options.queryFn) {
        throw new Error('queryFn is required');
      }
      const result = await options.queryFn({
        queryKey: options.queryKey,
        signal: new AbortController().signal,
        meta: undefined,
      });

      expect(result).toStrictEqual({});
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('getV1ExchangeRatesQueryOptions queryFn returns {} for empty baseCurrency without calling fetch', async () => {
      const options = client.prices.getV1ExchangeRatesQueryOptions('');
      if (!options.queryFn) {
        throw new Error('queryFn is required');
      }
      const result = await options.queryFn({
        queryKey: options.queryKey,
        signal: new AbortController().signal,
        meta: undefined,
      });

      expect(result).toStrictEqual({});
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('getV1SpotPriceByCoinIdQueryOptions queryFn returns safe empty result for empty coinId without calling fetch', async () => {
      const options = client.prices.getV1SpotPriceByCoinIdQueryOptions('');
      if (!options.queryFn) {
        throw new Error('queryFn is required');
      }
      const result = await options.queryFn({
        queryKey: options.queryKey,
        signal: new AbortController().signal,
        meta: undefined,
      });

      expect(result).toStrictEqual({ id: '', price: 0 });
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('get*QueryOptions pass-through options (select, initialPageParam)', () => {
    it('getPriceV1SupportedNetworksQueryOptions merges select and initialPageParam from options', () => {
      const select = (
        data: PriceSupportedNetworksResponse,
      ): PriceSupportedNetworksResponse => data;
      const options = client.prices.getPriceV1SupportedNetworksQueryOptions({
        select,
        initialPageParam: 0,
      } as unknown as FetchOptions);
      expect(options.queryKey).toStrictEqual(['prices', 'v1SupportedNetworks']);
      const opts = options as unknown as Record<string, unknown>;
      expect(opts.select).toBe(select);
      expect(opts.initialPageParam).toBe(0);
    });

    it('getPriceV1SupportedNetworksQueryOptions applies staleTime and gcTime from options', () => {
      const options = client.prices.getPriceV1SupportedNetworksQueryOptions({
        staleTime: 100,
        gcTime: 200,
      });
      expect(options.staleTime).toBe(100);
      expect(options.gcTime).toBe(200);
    });
  });
});
