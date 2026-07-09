/**
 * Integration tests for the generated Price API bindings
 * (`src/generated/price-api`, produced by `yarn codegen`) and the
 * {@link PricesApiRequestClient} that backs them.
 *
 * @jest-environment node
 */

import { assert, is } from '@metamask/superstruct';
import { QueryClient } from '@tanstack/query-core';
import { getResponse } from 'msw';

import { PricesApiRequestClient } from './query-client';
import {
  createCoinGeckoSpotPrice,
  createExchangeRateInfo,
  createGetV1SupportedNetworksQueryResponse,
  createHistoricalPrices,
  createMarketData,
  createSupportedNetworks,
  createTopToken,
  createV3SpotPrice,
} from '../../generated/price-api/mocks';
import {
  getV1SupportedNetworksHandler,
  handlers,
} from '../../generated/price-api/msw';
import {
  fetchV1HistoricalPrices,
  fetchV1SupportedNetworks,
  fetchV3SpotPrices,
  getV3SpotPricesQueryKey,
  getV3SpotPricesQueryOptions,
} from '../../generated/price-api/queries';
import {
  CoinGeckoSpotPriceStruct,
  ExchangeRateInfoStruct,
  HistoricalPricesStruct,
  MarketDataStruct,
  SupportedNetworksStruct,
  TopTokenStruct,
  V3SpotPriceStruct,
} from '../../generated/price-api/schemas';

/**
 * Routes all `fetch` calls through the generated MSW handlers, so requests
 * made by the `BaseApiClient` transport are answered with the generated mock
 * data.
 *
 * @param requestHandlers - The MSW handlers to serve responses from.
 */
function serveMswHandlers(
  requestHandlers: Parameters<typeof getResponse>[0],
): void {
  (globalThis as { fetch: unknown }).fetch = jest.fn(
    async (input: string | URL): Promise<Response> => {
      const response = await getResponse(
        requestHandlers,
        new Request(String(input)),
      );
      if (!response) {
        throw new Error(`No MSW handler matched: ${String(input)}`);
      }
      return response;
    },
  );
}

/**
 * Creates a request client with caching and retries disabled.
 *
 * @returns The request client under test.
 */
function createTestClient(): PricesApiRequestClient {
  return new PricesApiRequestClient({
    clientProduct: 'test-client',
    clientVersion: '1.0.0',
    queryClient: new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
          staleTime: 0,
        },
      },
    }),
  });
}

describe('generated Price API bindings', () => {
  describe('generated mocks and structs', () => {
    it.each([
      ['SupportedNetworks', createSupportedNetworks(), SupportedNetworksStruct],
      ['ExchangeRateInfo', createExchangeRateInfo(), ExchangeRateInfoStruct],
      [
        'CoinGeckoSpotPrice',
        createCoinGeckoSpotPrice(),
        CoinGeckoSpotPriceStruct,
      ],
      ['MarketData', createMarketData(), MarketDataStruct],
      ['V3SpotPrice', createV3SpotPrice(), V3SpotPriceStruct],
      ['HistoricalPrices', createHistoricalPrices(), HistoricalPricesStruct],
      ['TopToken', createTopToken(), TopTokenStruct],
    ])('the generated %s mock satisfies its struct', (_name, mock, struct) => {
      expect(is(mock, struct)).toBe(true);
    });

    it('rejects data that does not match the struct', () => {
      expect(() =>
        assert({ fullSupport: 'not-an-array' }, SupportedNetworksStruct),
      ).toThrow(
        'At path: fullSupport -- Expected an array value, but received: "not-an-array"',
      );
    });
  });

  describe('query options', () => {
    it('builds a scoped query key including the parameters', () => {
      expect(
        getV3SpotPricesQueryKey({ assetIds: 'eip155:1/slip44:60' }),
      ).toStrictEqual([
        'prices',
        'getV3SpotPrices',
        { assetIds: 'eip155:1/slip44:60' },
      ]);
    });

    it('exposes TanStack Query options usable with any QueryClient', async () => {
      const client = createTestClient();
      const request = jest
        .spyOn(client, 'request')
        .mockResolvedValue({ 'eip155:1/slip44:60': { price: 3254.48 } });

      const options = getV3SpotPricesQueryOptions(client, {
        assetIds: 'eip155:1/slip44:60',
      });
      const result = await client.queryClient.fetchQuery(options);

      expect(request).toHaveBeenCalledWith({
        method: 'get',
        url: '/v3/spot-prices',
        params: { assetIds: 'eip155:1/slip44:60' },
        signal: expect.any(AbortSignal),
      });
      expect(result).toStrictEqual({
        'eip155:1/slip44:60': { price: 3254.48 },
      });
    });

    it('rejects responses that fail struct validation', async () => {
      const client = createTestClient();
      jest
        .spyOn(client, 'request')
        .mockResolvedValue({ 'eip155:1/slip44:60': { price: 'not-a-number' } });

      await expect(
        fetchV3SpotPrices(client, { assetIds: 'eip155:1/slip44:60' }),
      ).rejects.toThrow(
        'At path: eip155:1/slip44:60 -- Expected the value to satisfy a union of `type | literal`, but received: [object Object]',
      );
    });
  });

  describe('end-to-end through the generated MSW handlers', () => {
    it('fetches and validates mock data served by the handlers', async () => {
      serveMswHandlers(handlers);
      const client = createTestClient();

      const networks = await fetchV1SupportedNetworks(client);

      // The generated mocks are seeded, so the round-trip result is exactly
      // the generated mock data — and it satisfies the generated struct.
      expect(networks).toStrictEqual(
        createGetV1SupportedNetworksQueryResponse(),
      );
      expect(is(networks, SupportedNetworksStruct)).toBe(true);
    });

    it('interpolates path parameters and serializes query parameters', async () => {
      serveMswHandlers(handlers);
      const client = createTestClient();

      const prices = await fetchV1HistoricalPrices(
        client,
        { chainId: 1, tokenAddress: '0x6b175474e89094c44da98b954eedeac495271d0f' },
        { vsCurrency: 'eur', timePeriod: '7d' },
      );

      expect(is(prices, HistoricalPricesStruct)).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://price.api.cx.metamask.io/v1/chains/1/historical-prices/0x6b175474e89094c44da98b954eedeac495271d0f?vsCurrency=eur&timePeriod=7d',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('supports overriding handler data', async () => {
      const supportedNetworks = {
        fullSupport: ['eip155:1'],
        partialSupport: [],
      };
      serveMswHandlers([getV1SupportedNetworksHandler(supportedNetworks)]);
      const client = createTestClient();

      expect(await fetchV1SupportedNetworks(client)).toStrictEqual(
        supportedNetworks,
      );
    });

    it('deduplicates requests through the QueryClient', async () => {
      serveMswHandlers(handlers);
      const client = new PricesApiRequestClient({
        clientProduct: 'test-client',
        queryClient: new QueryClient({
          defaultOptions: {
            queries: { retry: false, staleTime: 60_000 },
          },
        }),
      });

      const [first, second] = await Promise.all([
        fetchV1SupportedNetworks(client),
        fetchV1SupportedNetworks(client),
      ]);

      expect(first).toStrictEqual(second);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
