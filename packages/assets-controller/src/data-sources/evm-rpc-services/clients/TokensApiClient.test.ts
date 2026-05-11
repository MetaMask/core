import type { ChainId } from '../types';
import { TokensApiClient } from './TokensApiClient';
import type {
  TokensApiClientConfig,
  TokenListQueryClient,
} from './TokensApiClient';

// =============================================================================
// CONSTANTS
// =============================================================================

const MAINNET_CHAIN_ID = '0x1' as ChainId;
const POLYGON_CHAIN_ID = '0x89' as ChainId;
const LINEA_MAINNET_CHAIN_ID = '0xe708' as ChainId;
const MEGAETH_MAINNET_CHAIN_ID = '0x10e6' as ChainId;
const TEMPO_MAINNET_CHAIN_ID = '0x1079' as ChainId;

const EXPECTED_BASE_URL = 'https://token.api.cx.metamask.io/tokens';

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Mirrors the response shape returned by `token.api.cx.metamask.io/tokens/{chainId}`,
 * matching what `TokenListController` consumes via `fetchTokenListByChainId`.
 */
type MockApiToken = {
  address: string;
  symbol?: string;
  name?: string;
  decimals?: number;
  occurrences?: number;
  aggregators?: string[];
  iconUrl?: string;
};

function createMockResponse(
  data: MockApiToken[],
  status = 200,
): jest.Mocked<Response> {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(data),
  } as unknown as jest.Mocked<Response>;
}

function createMockFetch(
  response: jest.Mocked<Response>,
): jest.MockedFunction<typeof globalThis.fetch> {
  return jest.fn().mockResolvedValue(response);
}

function buildClient(config?: TokensApiClientConfig): TokensApiClient {
  return new TokensApiClient(config);
}

// =============================================================================
// TESTS
// =============================================================================

describe('TokensApiClient', () => {
  describe('constructor', () => {
    it('uses globalThis.fetch by default', async () => {
      const globalFetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(createMockResponse([]));

      const client = new TokensApiClient();
      await client.fetchTokenList(MAINNET_CHAIN_ID);

      expect(globalFetchSpy).toHaveBeenCalledTimes(1);
      globalFetchSpy.mockRestore();
    });

    it('uses the provided fetch function instead of globalThis.fetch', async () => {
      const mockFetch = createMockFetch(createMockResponse([]));
      const client = buildClient({ fetch: mockFetch });

      await client.fetchTokenList(MAINNET_CHAIN_ID);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('fetchTokenList', () => {
    describe('URL construction', () => {
      it('hits the same `token.api.cx.metamask.io/tokens/{decimalChainId}` endpoint as TokenListController', async () => {
        const mockFetch = createMockFetch(createMockResponse([]));
        const client = buildClient({ fetch: mockFetch });

        await client.fetchTokenList(MAINNET_CHAIN_ID);

        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).toContain(`${EXPECTED_BASE_URL}/1?`);
      });

      it('converts non-mainnet hex chain IDs to their decimal form in the URL', async () => {
        const mockFetch = createMockFetch(createMockResponse([]));
        const client = buildClient({ fetch: mockFetch });

        await client.fetchTokenList(POLYGON_CHAIN_ID);

        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).toContain(`${EXPECTED_BASE_URL}/137?`);
      });

      it('includes the same query parameters as TokenListController', async () => {
        const mockFetch = createMockFetch(createMockResponse([]));
        const client = buildClient({ fetch: mockFetch });

        await client.fetchTokenList(MAINNET_CHAIN_ID);

        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).toContain('occurrenceFloor=3');
        expect(url).toContain('includeNativeAssets=false');
        expect(url).toContain('includeTokenFees=false');
        expect(url).toContain('includeAssetType=false');
        expect(url).toContain('includeERC20Permit=false');
        expect(url).toContain('includeStorage=false');
        expect(url).toContain('includeRwaData=true');
      });

      it('does not pass a `first` cap so the API returns the full per-chain list', async () => {
        // Detection deliberately scans the entire occurrenceFloor list (no
        // top-N slice) — guard against a client-side cap creeping back in.
        const mockFetch = createMockFetch(createMockResponse([]));
        const client = buildClient({ fetch: mockFetch });

        await client.fetchTokenList(MAINNET_CHAIN_ID);

        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).not.toMatch(/[?&]first=/u);
      });

      it.each([
        ['Linea mainnet', LINEA_MAINNET_CHAIN_ID],
        ['MegaETH mainnet', MEGAETH_MAINNET_CHAIN_ID],
        ['Tempo mainnet', TEMPO_MAINNET_CHAIN_ID],
      ])(
        'lowers occurrenceFloor to 1 on %s (matching TokenListController)',
        async (_label, chainId) => {
          const mockFetch = createMockFetch(createMockResponse([]));
          const client = buildClient({ fetch: mockFetch });

          await client.fetchTokenList(chainId);

          const [url] = mockFetch.mock.calls[0] as [string];
          expect(url).toContain('occurrenceFloor=1');
          expect(url).not.toContain('occurrenceFloor=3');
        },
      );
    });

    describe('successful responses', () => {
      it('returns an empty array when the API returns no data', async () => {
        const mockFetch = createMockFetch(createMockResponse([]));
        const client = buildClient({ fetch: mockFetch });

        const result = await client.fetchTokenList(MAINNET_CHAIN_ID);

        expect(result).toStrictEqual([]);
      });

      it('maps a valid token entry to a TokenListEntry preserving aggregators and iconUrl', async () => {
        const mockFetch = createMockFetch(
          createMockResponse([
            {
              address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
              symbol: 'USDC',
              name: 'USD Coin',
              decimals: 6,
              occurrences: 10,
              aggregators: ['coinGecko', 'oneInch', 'sushiSwap'],
              iconUrl: 'https://example.com/usdc.png',
            },
          ]),
        );
        const client = buildClient({ fetch: mockFetch });

        const result = await client.fetchTokenList(MAINNET_CHAIN_ID);

        expect(result).toStrictEqual([
          {
            address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            symbol: 'USDC',
            name: 'USD Coin',
            decimals: 6,
            occurrences: 10,
            aggregators: ['coinGecko', 'oneInch', 'sushiSwap'],
            iconUrl: 'https://example.com/usdc.png',
          },
        ]);
      });

      it('returns multiple entries when the API returns multiple tokens', async () => {
        const mockFetch = createMockFetch(
          createMockResponse([
            {
              address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
              symbol: 'USDC',
              name: 'USD Coin',
              decimals: 6,
              occurrences: 10,
            },
            {
              address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
              symbol: 'USDT',
              name: 'Tether USD',
              decimals: 6,
              occurrences: 8,
            },
          ]),
        );
        const client = buildClient({ fetch: mockFetch });

        const result = await client.fetchTokenList(MAINNET_CHAIN_ID);

        expect(result).toHaveLength(2);
        expect(result[0].symbol).toBe('USDC');
        expect(result[1].symbol).toBe('USDT');
      });

      it('preserves the address as returned by the API', async () => {
        const tokenAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
        const mockFetch = createMockFetch(
          createMockResponse([
            {
              address: tokenAddress,
              symbol: 'USDC',
              name: 'USD Coin',
              decimals: 6,
            },
          ]),
        );
        const client = buildClient({ fetch: mockFetch });

        const [entry] = await client.fetchTokenList(MAINNET_CHAIN_ID);

        expect(entry.address).toBe(tokenAddress);
      });
    });

    describe('optional field defaults', () => {
      it('defaults symbol to empty string when missing', async () => {
        const mockFetch = createMockFetch(
          createMockResponse([
            {
              address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
              name: 'USD Coin',
              decimals: 6,
            },
          ]),
        );
        const client = buildClient({ fetch: mockFetch });

        const [entry] = await client.fetchTokenList(MAINNET_CHAIN_ID);

        expect(entry.symbol).toBe('');
      });

      it('defaults name to empty string when missing', async () => {
        const mockFetch = createMockFetch(
          createMockResponse([
            {
              address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
              symbol: 'USDC',
              decimals: 6,
            },
          ]),
        );
        const client = buildClient({ fetch: mockFetch });

        const [entry] = await client.fetchTokenList(MAINNET_CHAIN_ID);

        expect(entry.name).toBe('');
      });

      it('defaults decimals to 18 when missing', async () => {
        const mockFetch = createMockFetch(
          createMockResponse([
            {
              address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
              symbol: 'USDC',
              name: 'USD Coin',
            },
          ]),
        );
        const client = buildClient({ fetch: mockFetch });

        const [entry] = await client.fetchTokenList(MAINNET_CHAIN_ID);

        expect(entry.decimals).toBe(18);
      });

      it('includes occurrences as undefined when not present in the response', async () => {
        const mockFetch = createMockFetch(
          createMockResponse([
            {
              address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
              symbol: 'USDC',
              name: 'USD Coin',
              decimals: 6,
            },
          ]),
        );
        const client = buildClient({ fetch: mockFetch });

        const [entry] = await client.fetchTokenList(MAINNET_CHAIN_ID);

        expect(entry.occurrences).toBeUndefined();
      });
    });

    describe('Linea mainnet aggregator filter', () => {
      // Mirrors the filter applied in `fetchTokenListByChainId`
      // (assets-controllers/src/token-service.ts) so the RPC token detector
      // sees the same Linea token set as TokenListController.
      it('keeps entries flagged by `lineaTeam` regardless of aggregator count', async () => {
        const mockFetch = createMockFetch(
          createMockResponse([
            {
              address: '0x1111111111111111111111111111111111111111',
              symbol: 'A',
              name: 'A',
              decimals: 18,
              aggregators: ['lineaTeam'],
            },
          ]),
        );
        const client = buildClient({ fetch: mockFetch });

        const result = await client.fetchTokenList(LINEA_MAINNET_CHAIN_ID);

        expect(result).toHaveLength(1);
      });

      it('keeps entries with at least 3 aggregators even without `lineaTeam`', async () => {
        const mockFetch = createMockFetch(
          createMockResponse([
            {
              address: '0x2222222222222222222222222222222222222222',
              symbol: 'B',
              name: 'B',
              decimals: 18,
              aggregators: ['agg1', 'agg2', 'agg3'],
            },
          ]),
        );
        const client = buildClient({ fetch: mockFetch });

        const result = await client.fetchTokenList(LINEA_MAINNET_CHAIN_ID);

        expect(result).toHaveLength(1);
      });

      it('drops entries with fewer than 3 aggregators and no `lineaTeam` flag', async () => {
        const mockFetch = createMockFetch(
          createMockResponse([
            {
              address: '0x3333333333333333333333333333333333333333',
              symbol: 'C',
              name: 'C',
              decimals: 18,
              aggregators: ['agg1', 'agg2'],
            },
          ]),
        );
        const client = buildClient({ fetch: mockFetch });

        const result = await client.fetchTokenList(LINEA_MAINNET_CHAIN_ID);

        expect(result).toStrictEqual([]);
      });

      it('drops entries missing the aggregators field on Linea', async () => {
        const mockFetch = createMockFetch(
          createMockResponse([
            {
              address: '0x4444444444444444444444444444444444444444',
              symbol: 'D',
              name: 'D',
              decimals: 18,
            },
          ]),
        );
        const client = buildClient({ fetch: mockFetch });

        const result = await client.fetchTokenList(LINEA_MAINNET_CHAIN_ID);

        expect(result).toStrictEqual([]);
      });

      it('does not apply the Linea filter on other chains', async () => {
        const mockFetch = createMockFetch(
          createMockResponse([
            {
              address: '0x5555555555555555555555555555555555555555',
              symbol: 'E',
              name: 'E',
              decimals: 18,
              aggregators: ['agg1'],
            },
          ]),
        );
        const client = buildClient({ fetch: mockFetch });

        const result = await client.fetchTokenList(MAINNET_CHAIN_ID);

        expect(result).toHaveLength(1);
      });
    });

    describe('error handling', () => {
      it('throws when the API returns a 404', async () => {
        const mockFetch = createMockFetch(createMockResponse([], 404));
        const client = buildClient({ fetch: mockFetch });

        await expect(client.fetchTokenList(MAINNET_CHAIN_ID)).rejects.toThrow(
          'Tokens API responded with 404 for chain 0x1',
        );
      });

      it('throws when the API returns a 500', async () => {
        const mockFetch = createMockFetch(createMockResponse([], 500));
        const client = buildClient({ fetch: mockFetch });

        await expect(client.fetchTokenList(MAINNET_CHAIN_ID)).rejects.toThrow(
          'Tokens API responded with 500 for chain 0x1',
        );
      });

      it('includes the hex chain ID in the error message', async () => {
        const mockFetch = createMockFetch(createMockResponse([], 503));
        const client = buildClient({ fetch: mockFetch });

        await expect(client.fetchTokenList(POLYGON_CHAIN_ID)).rejects.toThrow(
          '0x89',
        );
      });

      it('propagates network errors thrown by fetch', async () => {
        const networkError = new Error('Network failure');
        const mockFetch = jest.fn().mockRejectedValue(networkError);
        const client = buildClient({
          fetch: mockFetch as unknown as typeof globalThis.fetch,
        });

        await expect(client.fetchTokenList(MAINNET_CHAIN_ID)).rejects.toThrow(
          'Network failure',
        );
      });

      it('returns an empty array if the response is not a JSON array', async () => {
        const malformed = {
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue({ unexpected: 'shape' }),
        } as unknown as jest.Mocked<Response>;
        const mockFetch = jest.fn().mockResolvedValue(malformed);
        const client = buildClient({
          fetch: mockFetch as unknown as typeof globalThis.fetch,
        });

        const result = await client.fetchTokenList(MAINNET_CHAIN_ID);

        expect(result).toStrictEqual([]);
      });
    });

    describe('TanStack Query caching', () => {
      // Minimal in-memory cache that mimics the surface of TanStack Query's
      // `QueryClient.fetchQuery`: dedupes by serialized queryKey and never
      // expires within a test (sufficient for asserting cache hits).
      const buildFakeQueryClient = (): TokenListQueryClient => {
        const cache = new Map<string, Promise<unknown>>();
        return {
          fetchQuery: async <TData>({
            queryKey,
            queryFn,
          }: {
            queryKey: readonly unknown[];
            queryFn: () => Promise<TData>;
          }): Promise<TData> => {
            const key = JSON.stringify(queryKey);
            const cached = cache.get(key) as Promise<TData> | undefined;
            if (cached) {
              return cached;
            }
            const pending = queryFn();
            cache.set(key, pending);
            return pending;
          },
        };
      };

      it('reuses the cached response on the second call for the same chain', async () => {
        const mockFetch = createMockFetch(
          createMockResponse([
            {
              address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
              symbol: 'USDC',
              name: 'USD Coin',
              decimals: 6,
              occurrences: 10,
            },
          ]),
        );
        const queryClient = buildFakeQueryClient();
        const client = buildClient({ fetch: mockFetch, queryClient });

        const first = await client.fetchTokenList(MAINNET_CHAIN_ID);
        const second = await client.fetchTokenList(MAINNET_CHAIN_ID);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(second).toStrictEqual(first);
      });

      it('refetches when called with a different chain id', async () => {
        const mockFetch = createMockFetch(createMockResponse([]));
        const queryClient = buildFakeQueryClient();
        const client = buildClient({ fetch: mockFetch, queryClient });

        await client.fetchTokenList(MAINNET_CHAIN_ID);
        await client.fetchTokenList(POLYGON_CHAIN_ID);

        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      it('dedupes concurrent in-flight requests for the same chain', async () => {
        // The fake QueryClient stores the in-flight Promise on the first call
        // and returns it for subsequent callers — same behaviour as TanStack
        // Query, and the property the detector relies on across accounts.
        let resolveFetch: ((value: Response) => void) | undefined;
        const mockFetch = jest.fn(
          () =>
            new Promise<Response>((resolve) => {
              resolveFetch = resolve;
            }),
        );
        const queryClient = buildFakeQueryClient();
        const client = buildClient({
          fetch: mockFetch as unknown as typeof globalThis.fetch,
          queryClient,
        });

        const a = client.fetchTokenList(MAINNET_CHAIN_ID);
        const b = client.fetchTokenList(MAINNET_CHAIN_ID);

        resolveFetch?.(createMockResponse([]));
        await Promise.all([a, b]);

        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      it('does not cap the page size in the cached path either', async () => {
        const mockFetch = createMockFetch(createMockResponse([]));
        const queryClient = buildFakeQueryClient();
        const client = buildClient({ fetch: mockFetch, queryClient });

        await client.fetchTokenList(MAINNET_CHAIN_ID);

        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).not.toMatch(/[?&]first=/u);
      });

      it('falls back to direct fetch when no queryClient is provided', async () => {
        const mockFetch = createMockFetch(createMockResponse([]));
        const client = buildClient({ fetch: mockFetch });

        await client.fetchTokenList(MAINNET_CHAIN_ID);
        await client.fetchTokenList(MAINNET_CHAIN_ID);

        // Without a queryClient there is no cache, so each call hits the network.
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });
    });
  });
});
