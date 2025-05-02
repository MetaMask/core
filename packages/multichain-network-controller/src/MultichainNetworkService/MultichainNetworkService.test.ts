import { KnownCaipNamespace, type CaipAccountId } from '@metamask/utils';

import { MultichainNetworkService } from './MultichainNetworkService';
import {
  type ActiveNetworksResponse,
  MULTICHAIN_ACCOUNTS_CLIENT_HEADER,
  MULTICHAIN_ACCOUNTS_CLIENT_ID,
  MULTICHAIN_ACCOUNTS_BASE_URL,
} from '../api/accounts-api';

describe('MultichainNetworkService', () => {
  const mockFetch = jest.fn();
  const MOCK_EVM_ADDRESS = '0x1234567890123456789012345678901234567890';
  const MOCK_EVM_CHAIN_1 = '1';
  const MOCK_EVM_CHAIN_137 = '137';
  const validAccountIds: CaipAccountId[] = [
    `${KnownCaipNamespace.Eip155}:${MOCK_EVM_CHAIN_1}:${MOCK_EVM_ADDRESS}`,
    `${KnownCaipNamespace.Eip155}:${MOCK_EVM_CHAIN_137}:${MOCK_EVM_ADDRESS}`,
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
    it('returns empty response for empty account list without making network requests', async () => {
      const service = new MultichainNetworkService({
        fetch: mockFetch,
      });

      const result = await service.fetchNetworkActivity([]);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result).toStrictEqual({ activeNetworks: [] });
    });

    it('makes request with correct URL and headers for single batch', async () => {
      const mockResponse: ActiveNetworksResponse = {
        activeNetworks: [
          `${KnownCaipNamespace.Eip155}:${MOCK_EVM_CHAIN_1}:${MOCK_EVM_ADDRESS}`,
          `${KnownCaipNamespace.Eip155}:${MOCK_EVM_CHAIN_137}:${MOCK_EVM_ADDRESS}`,
        ],
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

    it('batches requests when account IDs exceed batch size', async () => {
      const manyAccountIds: CaipAccountId[] = [];
      for (let i = 1; i <= 30; i++) {
        manyAccountIds.push(
          `${KnownCaipNamespace.Eip155}:${i}:${MOCK_EVM_ADDRESS}` as CaipAccountId,
        );
      }

      const firstBatchResponse = {
        activeNetworks: manyAccountIds.slice(0, 20),
      };
      const secondBatchResponse = { activeNetworks: manyAccountIds.slice(20) };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(firstBatchResponse),
        })
        .mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(secondBatchResponse),
        });

      const service = new MultichainNetworkService({
        fetch: mockFetch,
      });

      const result = await service.fetchNetworkActivity(manyAccountIds);

      expect(mockFetch).toHaveBeenCalled();

      for (const accountId of manyAccountIds) {
        expect(result.activeNetworks).toContain(accountId);
      }
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
      ).rejects.toThrow(
        'At path: activeNetworks -- Expected an array value, but received: undefined',
      );
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
