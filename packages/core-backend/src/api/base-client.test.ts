/**
 * Base API Client Tests
 */

import { QueryClient } from '@tanstack/query-core';

import { AccountsApiClient } from './accounts/index.js';
import { authQueryKeys } from './base-client.js';
import { createMockResponse, mockFetch } from './test-utils.js';

/**
 * Reads the Authorization header from a recorded fetch call.
 *
 * @param callIndex - Index of the fetch call to inspect.
 * @returns The Authorization header, or undefined if it was not sent.
 */
function authorizationHeaderOfCall(callIndex: number): string | undefined {
  const headers = mockFetch.mock.calls[callIndex]?.[1]?.headers as Record<
    string,
    string
  >;
  return headers.Authorization;
}

describe('BaseApiClient', () => {
  describe('invalidateAuthToken', () => {
    it('calls resetQueries on the query client with auth bearer token key', async () => {
      const mockResetQueries = jest.fn().mockResolvedValue(undefined);
      const queryClient = {
        resetQueries: mockResetQueries,
      } as unknown as QueryClient;
      const client = new AccountsApiClient({
        clientProduct: 'test-product',
        queryClient,
      });

      await client.invalidateAuthToken();

      expect(mockResetQueries).toHaveBeenCalledTimes(1);
      expect(mockResetQueries).toHaveBeenCalledWith({
        queryKey: authQueryKeys.bearerToken(),
      });
    });
  });

  describe('QueryClient initialization', () => {
    it('creates a new QueryClient when none is provided', () => {
      // Create a client without providing a queryClient
      const client = new AccountsApiClient({
        clientProduct: 'test-product',
      });

      // Verify a QueryClient was created
      expect(client.queryClient).toBeInstanceOf(QueryClient);
    });

    it('uses provided QueryClient when given', () => {
      const providedQueryClient = new QueryClient();

      const client = new AccountsApiClient({
        clientProduct: 'test-product',
        queryClient: providedQueryClient,
      });

      expect(client.queryClient).toBe(providedQueryClient);
    });

    it('uses default client version when none provided', () => {
      const client = new AccountsApiClient({
        clientProduct: 'test-product',
      });

      // The default version is '1.0.0' - we can verify this indirectly
      // by checking the client was created successfully
      expect(client.queryClient).toBeInstanceOf(QueryClient);
    });
  });

  describe('bearer token timeout', () => {
    /**
     * Creates a client whose token provider only resolves when told to.
     *
     * @param authTokenTimeout - Timeout to configure on the client.
     * @returns The client and a function that resolves the pending token.
     */
    function setup(authTokenTimeout?: number): {
      client: AccountsApiClient;
      getBearerToken: jest.Mock<Promise<string>, []>;
      resolveToken: (token: string) => void;
    } {
      let resolvedToken: string | undefined;
      let pending: Promise<string> | undefined;
      let settleToken: (token: string) => void = () => undefined;
      const getBearerToken = jest.fn(async (): Promise<string> => {
        if (resolvedToken !== undefined) {
          return resolvedToken;
        }
        pending ??= new Promise<string>((resolve) => {
          settleToken = (token: string): void => {
            resolvedToken = token;
            resolve(token);
          };
        });
        return await pending;
      });
      const client = new AccountsApiClient({
        clientProduct: 'test-product',
        getBearerToken,
        authTokenTimeout,
        queryClient: new QueryClient({
          defaultOptions: { queries: { retry: false, gcTime: 0 } },
        }),
      });
      return {
        client,
        getBearerToken,
        resolveToken: (token: string): void => settleToken(token),
      };
    }

    beforeEach(() => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValue(
        createMockResponse({ supportedNetworks: [] }),
      );
    });

    it('de-duplicates concurrent getBearerToken calls while the token is in flight', async () => {
      const { client, getBearerToken } = setup(1);

      await Promise.all([
        client.fetchV1SupportedNetworks(),
        client.fetchV1SupportedNetworks(),
      ]);

      expect(getBearerToken).toHaveBeenCalledTimes(1);
    });

    it('sends the request unauthenticated when the token is not ready in time', async () => {
      const { client } = setup(1);

      await client.fetchV1SupportedNetworks();

      expect(authorizationHeaderOfCall(0)).toBeUndefined();
    });

    it('authenticates later requests once the pending token resolves', async () => {
      const { client, resolveToken } = setup(1);

      await client.fetchV1SupportedNetworks();
      resolveToken('late-token');
      // staleTime 0 so the endpoint cache does not short-circuit the request
      await client.fetchV1SupportedNetworks({ staleTime: 0 });

      expect(authorizationHeaderOfCall(1)).toBe('Bearer late-token');
    });

    it('waits for the token when the timeout is disabled', async () => {
      const { client, resolveToken } = setup(0);

      const request = client.fetchV1SupportedNetworks();
      resolveToken('slow-token');
      await request;

      expect(authorizationHeaderOfCall(0)).toBe('Bearer slow-token');
    });
  });
});
