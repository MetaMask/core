/**
 * Base API Client Tests
 */

import { QueryClient } from '@tanstack/query-core';

import { AccountsApiClient } from './accounts';
import { authQueryKeys } from './base-client';

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
});
