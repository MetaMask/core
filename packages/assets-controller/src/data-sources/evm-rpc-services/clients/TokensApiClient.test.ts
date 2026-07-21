import { jest } from '@jest/globals';

import type { ChainId } from '../types/index.js';
import { TokensApiClient } from './TokensApiClient.js';
import type {
  TokensApiClientConfig,
  TokenListQueryClient,
} from './TokensApiClient.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const MAINNET_CHAIN_ID = '0x1' as ChainId;
const POLYGON_CHAIN_ID = '0x89' as ChainId;
const LINEA_MAINNET_CHAIN_ID = '0xe708' as ChainId;
const MEGAETH_MAINNET_CHAIN_ID = '0x10e6' as ChainId;
const TEMPO_MAINNET_CHAIN_ID = '0x1079' as ChainId;
// 0xDEF1 = 57073 decimal — intentionally absent from DEFAULT_SUPPORTED_NETWORKS
const UNSUPPORTED_CHAIN_ID = '0xDEF1' as ChainId;

const EXPECTED_BASE_URL = 'https://token.api.cx.metamask.io/tokens';

/**
 * The default supported-networks payload used by `createMockFetch`.
 * Includes every chain ID referenced in the tests so that existing test cases
 * continue to reach the token-list endpoint without modification.
 */
const DEFAULT_SUPPORTED_NETWORKS = {
  fullSupport: [
    'eip155:1', // MAINNET_CHAIN_ID    (0x1)
    'eip155:137', // POLYGON_CHAIN_ID    (0x89)
    'eip155:59144', // LINEA_MAINNET_CHAIN_ID (0xe708)
  ],
  partialSupport: [
    'eip155:4326', // MEGAETH_MAINNET_CHAIN_ID (0x10e6)
    'eip155:4217', // TEMPO_MAINNET_CHAIN_ID   (0x1079)
  ],
};

// =============================================================================
// HELPERS
// =============================================================================

function createMockResponse(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any,
  status = 200,
): jest.Mocked<Response> {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(data),
  } as unknown as jest.Mocked<Response>;
}

/**
 * Creates a mock fetch that routes `/v2/supportedNetworks` to
 * `DEFAULT_SUPPORTED_NETWORKS` and every other URL to `tokenListResponse`.
 * This mirrors production behaviour and avoids breaking existing tests that
 * only care about the token-list response.
 *
 * @param tokenListResponse - The mocked response for token-list requests.
 * @param supportedNetworks - Override for the supported-networks payload.
 * @param supportedNetworks.fullSupport - Chains with full support.
 * @param supportedNetworks.partialSupport - Chains with partial support.
 * @returns A Jest mock of the global `fetch` function.
 */
function createMockFetch(
  tokenListResponse: jest.Mocked<Response>,
  supportedNetworks: {
    fullSupport?: string[];
    partialSupport?: string[];
  } = DEFAULT_SUPPORTED_NETWORKS,
): jest.MockedFunction<typeof globalThis.fetch> {
  return jest.fn((url: string | URL) => {
    if (url.toString().includes('/v2/supportedNetworks')) {
      return Promise.resolve(createMockResponse(supportedNetworks));
    }
    return Promise.resolve(tokenListResponse);
  }) as unknown as jest.MockedFunction<typeof globalThis.fetch>;
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
      // The global spy returns `createMockResponse([])` for every URL.
      // The supported-networks call gets [] which produces an empty supported-
      // chain set → mainnet is treated as unsupported → token-list fetch is
      // skipped. Total: exactly 1 call (to the supported-networks endpoint).
      const globalFetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(createMockResponse([]));

      const client = new TokensApiClient();
      await client.fetchTokenList(MAINNET_CHAIN_ID);

      expect(globalFetchSpy).toHaveBeenCalledTimes(1);
      expect(globalFetchSpy.mock.calls[0]?.[0]).toContain(
        '/v2/supportedNetworks',
      );
      globalFetchSpy.mockRestore();
    });

    it('uses the provided fetch function instead of globalThis.fetch', async () => {
      // With routing: 1 supported-networks call + 1 token-list call = 2 total.
      const mockFetch = createMockFetch(createMockResponse([]));
      const client = buildClient({ fetch: mockFetch });

      await client.fetchTokenList(MAINNET_CHAIN_ID);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('fetchTokenList', () => {
    describe('URL construction', () => {
      // The supported-networks check is call[0]; the token-list request is call[1].

      it('hits the same `token.api.cx.metamask.io/tokens/{decimalChainId}` endpoint as TokenListController', async () => {
        const mockFetch = createMockFetch(createMockResponse([]));
        const client = buildClient({ fetch: mockFetch });

        await client.fetchTokenList(MAINNET_CHAIN_ID);

        const [url] = mockFetch.mock.calls[1] as [string];
        expect(url).toContain(`${EXPECTED_BASE_URL}/1?`);
      });

      it('converts non-mainnet hex chain IDs to their decimal form in the URL', async () => {
        const mockFetch = createMockFetch(createMockResponse([]));
        const client = buildClient({ fetch: mockFetch });

        await client.fetchTokenList(POLYGON_CHAIN_ID);

        const [url] = mockFetch.mock.calls[1] as [string];
        expect(url).toContain(`${EXPECTED_BASE_URL}/137?`);
      });

      it('includes the same query parameters as TokenListController', async () => {
        const mockFetch = createMockFetch(createMockResponse([]));
        const client = buildClient({ fetch: mockFetch });

        await client.fetchTokenList(MAINNET_CHAIN_ID);

        const [url] = mockFetch.mock.calls[1] as [string];
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

        const [url] = mockFetch.mock.calls[1] as [string];
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

          const [url] = mockFetch.mock.calls[1] as [string];
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
      it('returns an empty array when the API returns a 404', async () => {
        const mockFetch = createMockFetch(createMockResponse([], 404));
        const client = buildClient({ fetch: mockFetch });

        expect(await client.fetchTokenList(MAINNET_CHAIN_ID)).toStrictEqual([]);
      });

      it('returns an empty array when the API returns a 500', async () => {
        const mockFetch = createMockFetch(createMockResponse([], 500));
        const client = buildClient({ fetch: mockFetch });

        expect(await client.fetchTokenList(MAINNET_CHAIN_ID)).toStrictEqual([]);
      });

      it('returns an empty array when the API returns a non-2xx status', async () => {
        const mockFetch = createMockFetch(createMockResponse([], 503));
        const client = buildClient({ fetch: mockFetch });

        expect(await client.fetchTokenList(POLYGON_CHAIN_ID)).toStrictEqual([]);
      });

      it('returns an empty array when fetch throws a network error', async () => {
        // The supported-networks call throws → .catch(() => false) in
        // fetchTokenList treats the chain as unsupported → returns [].
        const networkError = new Error('Network failure');
        const mockFetch = jest.fn().mockRejectedValue(networkError);
        const client = buildClient({
          fetch: mockFetch as unknown as typeof globalThis.fetch,
        });

        expect(await client.fetchTokenList(MAINNET_CHAIN_ID)).toStrictEqual([]);
      });

      it('returns an empty array if the token-list response is not a JSON array', async () => {
        const mockFetch = createMockFetch(
          createMockResponse({ unexpected: 'shape' }),
        );
        const client = buildClient({
          fetch: mockFetch as unknown as typeof globalThis.fetch,
        });

        const result = await client.fetchTokenList(MAINNET_CHAIN_ID);

        expect(result).toStrictEqual([]);
      });
    });

    describe('supported networks check', () => {
      it('returns an empty array for a chain not in the supported-networks list', async () => {
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

        const result = await client.fetchTokenList(UNSUPPORTED_CHAIN_ID);

        expect(result).toStrictEqual([]);
      });

      it('does not call the token-list endpoint for unsupported chains', async () => {
        const mockFetch = createMockFetch(createMockResponse([]));
        const client = buildClient({ fetch: mockFetch });

        await client.fetchTokenList(UNSUPPORTED_CHAIN_ID);

        const calledUrls = (mockFetch.mock.calls as [string][]).map(
          ([url]) => url,
        );
        expect(
          calledUrls.every((url) => url.includes('/v2/supportedNetworks')),
        ).toBe(true);
      });

      it('returns token list for a chain in fullSupport', async () => {
        const token = {
          address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        };
        const mockFetch = createMockFetch(createMockResponse([token]));
        const client = buildClient({ fetch: mockFetch });

        const result = await client.fetchTokenList(MAINNET_CHAIN_ID);

        expect(result).toHaveLength(1);
        expect(result[0].symbol).toBe('USDC');
      });

      it('returns token list for a chain in partialSupport', async () => {
        const token = {
          address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        };
        const mockFetch = createMockFetch(createMockResponse([token]));
        const client = buildClient({ fetch: mockFetch });

        // 0x10e6 = 4326 = eip155:4326 which is in partialSupport above
        const result = await client.fetchTokenList(MEGAETH_MAINNET_CHAIN_ID);

        expect(result).toHaveLength(1);
      });

      it('returns empty array when the supported-networks endpoint returns non-2xx', async () => {
        const mockFetch = jest.fn((url: string | URL) => {
          if (url.toString().includes('/v2/supportedNetworks')) {
            return Promise.resolve(createMockResponse({}, 503));
          }
          return Promise.resolve(createMockResponse([]));
        }) as unknown as jest.MockedFunction<typeof globalThis.fetch>;
        const client = buildClient({ fetch: mockFetch });

        const result = await client.fetchTokenList(MAINNET_CHAIN_ID);

        expect(result).toStrictEqual([]);
      });

      it('returns empty array when the supported-networks endpoint throws', async () => {
        const mockFetch = jest.fn((url: string | URL) => {
          if (url.toString().includes('/v2/supportedNetworks')) {
            return Promise.reject(new Error('Network error'));
          }
          return Promise.resolve(createMockResponse([]));
        }) as unknown as jest.MockedFunction<typeof globalThis.fetch>;
        const client = buildClient({ fetch: mockFetch });

        const result = await client.fetchTokenList(MAINNET_CHAIN_ID);

        expect(result).toStrictEqual([]);
      });

      it('caches the supported-networks result and does not refetch within TTL', async () => {
        const mockFetch = createMockFetch(createMockResponse([]));
        const client = buildClient({ fetch: mockFetch });

        await client.fetchTokenList(MAINNET_CHAIN_ID);
        await client.fetchTokenList(MAINNET_CHAIN_ID);

        const supportedNetworksCalls = (
          mockFetch.mock.calls as [string][]
        ).filter(([url]) => url.includes('/v2/supportedNetworks'));

        // Supported-networks endpoint is only hit once despite two fetchTokenList calls.
        expect(supportedNetworksCalls).toHaveLength(1);
      });

      it('deduplicates concurrent supported-networks requests', async () => {
        // Both concurrent fetchTokenList calls should share the single
        // in-flight /v2/supportedNetworks request.
        let resolveSupportedNetworks: ((value: Response) => void) | undefined;

        const mockFetch = jest.fn((url: string | URL) => {
          if (url.toString().includes('/v2/supportedNetworks')) {
            return new Promise<Response>((resolve) => {
              resolveSupportedNetworks = resolve;
            });
          }
          return Promise.resolve(createMockResponse([]));
        }) as unknown as jest.MockedFunction<typeof globalThis.fetch>;

        const client = buildClient({ fetch: mockFetch });

        const a = client.fetchTokenList(MAINNET_CHAIN_ID);
        const b = client.fetchTokenList(MAINNET_CHAIN_ID);

        // Resolve the one shared in-flight request.
        resolveSupportedNetworks?.(
          createMockResponse(DEFAULT_SUPPORTED_NETWORKS),
        );
        await Promise.all([a, b]);

        const supportedNetworksCalls = (
          mockFetch.mock.calls as [string][]
        ).filter(([url]) => url.includes('/v2/supportedNetworks'));

        expect(supportedNetworksCalls).toHaveLength(1);
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

        // 1 supported-networks call + 1 token-list call on first; nothing on second.
        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(second).toStrictEqual(first);
      });

      it('refetches when called with a different chain id', async () => {
        const mockFetch = createMockFetch(createMockResponse([]));
        const queryClient = buildFakeQueryClient();
        const client = buildClient({ fetch: mockFetch, queryClient });

        await client.fetchTokenList(MAINNET_CHAIN_ID);
        await client.fetchTokenList(POLYGON_CHAIN_ID);

        // 1 supported-networks + 1 mainnet token-list + 1 polygon token-list = 3
        expect(mockFetch).toHaveBeenCalledTimes(3);
      });

      it('dedupes concurrent in-flight token-list requests for the same chain', async () => {
        // The supported-networks call resolves immediately; the token-list
        // response is held pending so we can assert deduplication.
        let resolveTokenList: ((value: Response) => void) | undefined;
        const mockFetch = jest.fn((url: string | URL) => {
          if (url.toString().includes('/v2/supportedNetworks')) {
            return Promise.resolve(
              createMockResponse(DEFAULT_SUPPORTED_NETWORKS),
            );
          }
          return new Promise<Response>((resolve) => {
            resolveTokenList = resolve;
          });
        }) as unknown as jest.MockedFunction<typeof globalThis.fetch>;

        const queryClient = buildFakeQueryClient();
        const client = buildClient({ fetch: mockFetch, queryClient });

        const a = client.fetchTokenList(MAINNET_CHAIN_ID);
        const b = client.fetchTokenList(MAINNET_CHAIN_ID);

        // Yield to the event loop so the supported-networks microtasks drain
        // and both callers reach queryClient.fetchQuery (setting resolveTokenList).
        await new Promise<void>((resolve) => setTimeout(resolve, 0));

        resolveTokenList?.(createMockResponse([]));
        await Promise.all([a, b]);

        // 1 supported-networks call + 1 deduplicated token-list call = 2 total
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      it('does not cap the page size in the cached path either', async () => {
        const mockFetch = createMockFetch(createMockResponse([]));
        const queryClient = buildFakeQueryClient();
        const client = buildClient({ fetch: mockFetch, queryClient });

        await client.fetchTokenList(MAINNET_CHAIN_ID);

        const [url] = mockFetch.mock.calls[1] as [string];
        expect(url).not.toMatch(/[?&]first=/u);
      });

      it('falls back to direct fetch when no queryClient is provided', async () => {
        const mockFetch = createMockFetch(createMockResponse([]));
        const client = buildClient({ fetch: mockFetch });

        await client.fetchTokenList(MAINNET_CHAIN_ID);
        await client.fetchTokenList(MAINNET_CHAIN_ID);

        // Without a queryClient there is no token-list cache:
        // call 1: 1 supported-networks + 1 token-list = 2
        // call 2: supported-networks cached + 1 token-list = 1
        // total = 3
        expect(mockFetch).toHaveBeenCalledTimes(3);
      });
    });
  });
});
