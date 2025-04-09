import type { CaipAccountId } from '@metamask/utils';

import {
  MULTICHAIN_ACCOUNTS_CLIENT_HEADER,
  MULTICHAIN_ACCOUNTS_CLIENT_ID,
  MULTICHAIN_ACCOUNTS_BASE_URL,
} from './constants';
import { MultichainNetworkService } from './MultichainNetworkService';
import type { ActiveNetworksResponse } from './types';

describe('MultichainNetworkService', () => {
  const mockFetch = jest.fn();
  const validAccountIds: CaipAccountId[] = [
    'eip155:1:0x1234567890123456789012345678901234567890' as CaipAccountId,
    'solana:1:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' as CaipAccountId,
  ];

  describe('constructor', () => {
    it('creates an instance with the provided fetch implementation', () => {
      const service = new MultichainNetworkService({
        fetch: mockFetch,
      });
      expect(service).toBeInstanceOf(MultichainNetworkService);
    });
  });

  describe('fetchNetworkActivity', () => {
    it('makes request with correct URL and headers', async () => {
      const mockResponse: ActiveNetworksResponse = {
        activeNetworks: ['eip155:1:0x1234567890123456789012345678901234567890'],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const service = new MultichainNetworkService({
        fetch: mockFetch,
      });
      const result = await service.fetchNetworkActivity(validAccountIds);

      expect(mockFetch).toHaveBeenCalledWith(
        `${MULTICHAIN_ACCOUNTS_BASE_URL}/v2/activeNetworks?accountIds=${encodeURIComponent(validAccountIds.join(','))}`,
        {
          method: 'GET',
          headers: {
            [MULTICHAIN_ACCOUNTS_CLIENT_HEADER]: MULTICHAIN_ACCOUNTS_CLIENT_ID,
            Accept: 'application/json',
          },
        },
      );
      expect(result).toStrictEqual(mockResponse);
    });

    it('throws error for non-200 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const service = new MultichainNetworkService({
        fetch: mockFetch,
      });

      await expect(
        service.fetchNetworkActivity(validAccountIds),
      ).rejects.toThrow('HTTP error! status: 404');
    });

    it('throws error for invalid response format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ invalidKey: 'invalid data' }),
      });

      const service = new MultichainNetworkService({
        fetch: mockFetch,
      });

      await expect(
        service.fetchNetworkActivity(validAccountIds),
      ).rejects.toThrow('Invalid response format from active networks API');
    });

    it('throws timeout error when request is aborted', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      const service = new MultichainNetworkService({
        fetch: mockFetch,
      });

      await expect(
        service.fetchNetworkActivity(validAccountIds),
      ).rejects.toThrow('Request timeout: Failed to fetch active networks');
    });

    it('propagates network errors', async () => {
      const networkError = new Error('Network error');
      mockFetch.mockRejectedValueOnce(networkError);

      const service = new MultichainNetworkService({
        fetch: mockFetch,
      });

      await expect(
        service.fetchNetworkActivity(validAccountIds),
      ).rejects.toThrow(networkError.message);
    });

    it('throws formatted error for non-Error failures', async () => {
      mockFetch.mockRejectedValueOnce('Unknown error');

      const service = new MultichainNetworkService({
        fetch: mockFetch,
      });

      await expect(
        service.fetchNetworkActivity(validAccountIds),
      ).rejects.toThrow('Failed to fetch active networks: Unknown error');
    });
  });
});
