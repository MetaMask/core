import type { ChainId } from '../types';
import { TokensApiClient } from './TokensApiClient';
import type { TokensApiClientConfig } from './TokensApiClient';

// =============================================================================
// CONSTANTS
// =============================================================================

const MAINNET_CHAIN_ID = '0x1' as ChainId;
const POLYGON_CHAIN_ID = '0x89' as ChainId;

const EXPECTED_BASE_URL = 'https://tokens.api.cx.metamask.io/v3/chains';

// =============================================================================
// HELPERS
// =============================================================================

type MockApiToken = {
  assetId: string;
  symbol?: string;
  name?: string;
  decimals?: number;
  occurrences?: number;
};

function createMockResponse(
  data: MockApiToken[],
  status = 200,
): jest.Mocked<Response> {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue({ data }),
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
      it('converts hex chain ID to CAIP chain ID in the URL', async () => {
        const mockFetch = createMockFetch(createMockResponse([]));
        const client = buildClient({ fetch: mockFetch });

        await client.fetchTokenList(MAINNET_CHAIN_ID);

        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).toContain(`${EXPECTED_BASE_URL}/eip155:1/assets`);
      });

      it('correctly converts a non-mainnet hex chain ID', async () => {
        const mockFetch = createMockFetch(createMockResponse([]));
        const client = buildClient({ fetch: mockFetch });

        await client.fetchTokenList(POLYGON_CHAIN_ID);

        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).toContain(`${EXPECTED_BASE_URL}/eip155:137/assets`);
      });

      it('includes all required query parameters', async () => {
        const mockFetch = createMockFetch(createMockResponse([]));
        const client = buildClient({ fetch: mockFetch });

        await client.fetchTokenList(MAINNET_CHAIN_ID);

        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).toContain('first=25');
        expect(url).toContain('includeOccurrences=true');
        expect(url).toContain('includeMetadata=true');
        expect(url).toContain('occurrenceFloor=3');
        expect(url).toContain('includeRwaData=true');
        expect(url).toContain('excludeDescription=true');
      });
    });

    describe('successful responses', () => {
      it('returns an empty array when the API returns no data', async () => {
        const mockFetch = createMockFetch(createMockResponse([]));
        const client = buildClient({ fetch: mockFetch });

        const result = await client.fetchTokenList(MAINNET_CHAIN_ID);

        expect(result).toStrictEqual([]);
      });

      it('maps a valid erc20 token entry to a TokenListEntry', async () => {
        const mockFetch = createMockFetch(
          createMockResponse([
            {
              assetId:
                'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
              symbol: 'USDC',
              name: 'USD Coin',
              decimals: 6,
              occurrences: 10,
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
          },
        ]);
      });

      it('returns multiple entries when the API returns multiple erc20 tokens', async () => {
        const mockFetch = createMockFetch(
          createMockResponse([
            {
              assetId:
                'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
              symbol: 'USDC',
              name: 'USD Coin',
              decimals: 6,
              occurrences: 10,
            },
            {
              assetId:
                'eip155:1/erc20:0xdAC17F958D2ee523a2206206994597C13D831ec7',
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

      it('extracts the contract address from the assetId', async () => {
        const tokenAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
        const mockFetch = createMockFetch(
          createMockResponse([
            {
              assetId: `eip155:1/erc20:${tokenAddress}`,
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
              assetId:
                'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
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
              assetId:
                'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
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
              assetId:
                'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
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
              assetId:
                'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
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

    describe('filtering non-erc20 assets', () => {
      it('filters out native slip44 assets', async () => {
        const mockFetch = createMockFetch(
          createMockResponse([
            {
              assetId: 'eip155:1/slip44:60',
              symbol: 'ETH',
              name: 'Ether',
              decimals: 18,
            },
            {
              assetId:
                'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
              symbol: 'USDC',
              name: 'USD Coin',
              decimals: 6,
            },
          ]),
        );
        const client = buildClient({ fetch: mockFetch });

        const result = await client.fetchTokenList(MAINNET_CHAIN_ID);

        expect(result).toHaveLength(1);
        expect(result[0].symbol).toBe('USDC');
      });

      it('filters out erc721 assets', async () => {
        const mockFetch = createMockFetch(
          createMockResponse([
            {
              assetId:
                'eip155:1/erc721:0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D',
              symbol: 'BAYC',
              name: 'Bored Ape Yacht Club',
              decimals: 0,
            },
          ]),
        );
        const client = buildClient({ fetch: mockFetch });

        const result = await client.fetchTokenList(MAINNET_CHAIN_ID);

        expect(result).toStrictEqual([]);
      });

      it('returns an empty array when all items are non-erc20', async () => {
        const mockFetch = createMockFetch(
          createMockResponse([
            {
              assetId: 'eip155:1/slip44:60',
              symbol: 'ETH',
              name: 'Ether',
              decimals: 18,
            },
            {
              assetId:
                'eip155:1/erc721:0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D',
              symbol: 'BAYC',
              name: 'BAYC',
              decimals: 0,
            },
          ]),
        );
        const client = buildClient({ fetch: mockFetch });

        const result = await client.fetchTokenList(MAINNET_CHAIN_ID);

        expect(result).toStrictEqual([]);
      });
    });

    describe('error handling', () => {
      it('throws when the API returns a 404', async () => {
        const mockFetch = createMockFetch(createMockResponse([], 404));
        const client = buildClient({ fetch: mockFetch });

        await expect(client.fetchTokenList(MAINNET_CHAIN_ID)).rejects.toThrow(
          'Tokens API responded with 404 for eip155:1',
        );
      });

      it('throws when the API returns a 500', async () => {
        const mockFetch = createMockFetch(createMockResponse([], 500));
        const client = buildClient({ fetch: mockFetch });

        await expect(client.fetchTokenList(MAINNET_CHAIN_ID)).rejects.toThrow(
          'Tokens API responded with 500 for eip155:1',
        );
      });

      it('includes the CAIP chain ID in the error message', async () => {
        const mockFetch = createMockFetch(createMockResponse([], 503));
        const client = buildClient({ fetch: mockFetch });

        await expect(client.fetchTokenList(POLYGON_CHAIN_ID)).rejects.toThrow(
          'eip155:137',
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
    });
  });
});
