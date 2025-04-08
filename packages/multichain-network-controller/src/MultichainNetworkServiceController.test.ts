import type { CaipAccountId } from '@metamask/utils';

import {
  MULTICHAIN_ACCOUNTS_CLIENT_HEADER,
  MULTICHAIN_ACCOUNTS_CLIENT_ID,
  MULTICHAIN_ACCOUNTS_DOMAIN,
} from './constants';
import { MultichainNetworkServiceController } from './MultichainNetworkServiceController';
import type { ActiveNetworksResponse } from './types';

describe('MultichainNetworkServiceController', () => {
  const mockFetch = jest.fn();
  const validAccountIds: CaipAccountId[] = [
    'eip155:1:0x1234567890123456789012345678901234567890' as CaipAccountId,
    'solana:1:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' as CaipAccountId,
  ];

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('constructor', () => {
    it('creates an instance with the provided fetch function', () => {
      const service = new MultichainNetworkServiceController({
        fetch: mockFetch,
      });
      expect(service).toBeInstanceOf(MultichainNetworkServiceController);
    });
  });

  describe('fetchNetworkActivity', () => {
    it('fetches network activity with correct URL and headers', async () => {
      const mockResponse: ActiveNetworksResponse = {
        activeNetworks: ['eip155:1:0x1234567890123456789012345678901234567890'],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const service = new MultichainNetworkServiceController({
        fetch: mockFetch,
      });
      const result = await service.fetchNetworkActivity(validAccountIds);

      expect(mockFetch).toHaveBeenCalledWith(
        `${MULTICHAIN_ACCOUNTS_DOMAIN}/v2/activeNetworks?accountIds=${encodeURIComponent(validAccountIds.join(','))}`,
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

    it('throws error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const service = new MultichainNetworkServiceController({
        fetch: mockFetch,
      });

      await expect(
        service.fetchNetworkActivity(validAccountIds),
      ).rejects.toThrow('HTTP error! status: 404');
    });

    it('throws error when response format is invalid', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ invalidKey: 'invalid data' }),
      });

      const service = new MultichainNetworkServiceController({
        fetch: mockFetch,
      });

      await expect(
        service.fetchNetworkActivity(validAccountIds),
      ).rejects.toThrow('Invalid response format from active networks API');
    });

    it('handles request timeout', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      const service = new MultichainNetworkServiceController({
        fetch: mockFetch,
      });

      await expect(
        service.fetchNetworkActivity(validAccountIds),
      ).rejects.toThrow('Request timeout: Failed to fetch active networks');
    });

    it('handles generic fetch errors', async () => {
      const networkError = new Error('Network error');
      mockFetch.mockRejectedValueOnce(networkError);

      const service = new MultichainNetworkServiceController({
        fetch: mockFetch,
      });

      await expect(
        service.fetchNetworkActivity(validAccountIds),
      ).rejects.toThrow(networkError.message);
    });

    it('handles non-Error fetch failures', async () => {
      mockFetch.mockRejectedValueOnce('Unknown error');

      const service = new MultichainNetworkServiceController({
        fetch: mockFetch,
      });

      await expect(
        service.fetchNetworkActivity(validAccountIds),
      ).rejects.toThrow('Failed to fetch active networks: Unknown error');
    });
  });
});
