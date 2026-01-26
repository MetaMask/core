/**
 * Accounts API Client Tests - accounts.api.cx.metamask.io
 */

import type {
  V1SupportedNetworksResponse,
  V2SupportedNetworksResponse,
  V2BalancesResponse,
  V5BalancesResponse,
} from './types';
import type { ApiPlatformClient } from '../ApiPlatformClient';
import { API_URLS, HttpError } from '../shared-types';
import {
  mockFetch,
  createMockResponse,
  setupTestEnvironment,
} from '../test-utils';

describe('AccountsApiClient', () => {
  let client: ApiPlatformClient;

  beforeEach(() => {
    ({ client } = setupTestEnvironment());
  });

  describe('Supported Networks', () => {
    it('fetches v1 supported networks', async () => {
      const mockResponse: V1SupportedNetworksResponse = {
        supportedNetworks: [1, 137, 56, 43114],
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.accounts.fetchV1SupportedNetworks();

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        `${API_URLS.ACCOUNTS}/v1/supportedNetworks`,
        expect.any(Object),
      );
    });

    it('fetches v2 supported networks', async () => {
      const mockResponse: V2SupportedNetworksResponse = {
        fullSupport: [1, 137],
        partialSupport: { balances: [56] },
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.accounts.fetchV2SupportedNetworks();

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        `${API_URLS.ACCOUNTS}/v2/supportedNetworks`,
        expect.any(Object),
      );
    });
  });

  describe('Active Networks', () => {
    it('fetches v2 active networks with accountIds', async () => {
      const mockResponse = { activeNetworks: ['eip155:1', 'eip155:137'] };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const accountIds = ['eip155:1:0x123', 'eip155:137:0x456'];
      const result = await client.accounts.fetchV2ActiveNetworks(accountIds);

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v2/activeNetworks'),
        expect.any(Object),
      );
    });

    it('fetches v2 active networks with filter options', async () => {
      const mockResponse = { activeNetworks: ['eip155:1'] };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.accounts.fetchV2ActiveNetworks(
        ['eip155:1:0x123'],
        {
          filterMMListTokens: true,
          networks: ['eip155:1'],
        },
      );

      expect(result).toStrictEqual(mockResponse);
    });
  });

  describe('Balances', () => {
    it('fetches v2 balances for single address', async () => {
      const mockResponse: V2BalancesResponse = {
        count: 2,
        balances: [
          {
            object: 'token',
            address: '0x0',
            symbol: 'ETH',
            name: 'Ethereum',
            decimals: 18,
            chainId: 1,
            balance: '1000000000000000000',
          },
        ],
        unprocessedNetworks: [],
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.accounts.fetchV2Balances('0x123abc');

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v2/accounts/0x123abc/balances'),
        expect.any(Object),
      );
    });

    it('fetches v2 balances with network filter', async () => {
      const mockResponse: V2BalancesResponse = {
        count: 1,
        balances: [],
        unprocessedNetworks: [],
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      await client.accounts.fetchV2Balances('0x123abc', { networks: [1, 137] });

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('networks=1%2C137');
    });

    it('fetches v5 multi-account balances', async () => {
      const mockResponse: V5BalancesResponse = {
        count: 3,
        unprocessedNetworks: [],
        balances: [
          {
            object: 'token',
            symbol: 'ETH',
            name: 'Ethereum',
            type: 'native',
            decimals: 18,
            assetId: 'eip155:1/slip44:60',
            balance: '1000000000000000000',
            accountId: 'eip155:1:0x123',
          },
        ],
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.accounts.fetchV5MultiAccountBalances([
        'eip155:1:0x123',
        'eip155:137:0x456',
      ]);

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v5/multiaccount/balances'),
        expect.any(Object),
      );
    });

    it('fetches v2 balances with additional options', async () => {
      const mockResponse: V2BalancesResponse = {
        count: 1,
        balances: [],
        unprocessedNetworks: [],
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      await client.accounts.fetchV2BalancesWithOptions('0x123abc', {
        networks: [1, 137],
        filterSupportedTokens: true,
        includeTokenAddresses: ['0xtoken1', '0xtoken2'],
        includeStakedAssets: true,
      });

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('/v2/accounts/0x123abc/balances');
      expect(calledUrl).toContain('filterSupportedTokens=true');
      expect(calledUrl).toContain('includeStakedAssets=true');
    });

    it('fetches v4 multi-account balances', async () => {
      const mockResponse = {
        count: 2,
        balances: [
          {
            object: 'token',
            address: '0x0',
            symbol: 'ETH',
            name: 'Ethereum',
            decimals: 18,
            chainId: 1,
            balance: '1000000000000000000',
            accountAddress: '0x123',
          },
        ],
        unprocessedNetworks: [],
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.accounts.fetchV4MultiAccountBalances(
        ['0x123', '0x456'],
        { networks: [1, 137] },
      );

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v4/multiaccount/balances'),
        expect.any(Object),
      );
    });
  });

  describe('Transactions', () => {
    it('fetches transaction by hash', async () => {
      const mockResponse = {
        hash: '0xabc',
        timestamp: '2024-01-01T00:00:00Z',
        chainId: 1,
        blockNumber: 12345,
        blockHash: '0xdef',
        gas: 21000,
        gasUsed: 21000,
        gasPrice: '20000000000',
        effectiveGasPrice: '20000000000',
        nonce: 0,
        cumulativeGasUsed: 21000,
        value: '1000000000000000000',
        to: '0x456',
        from: '0x123',
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.accounts.fetchV1TransactionByHash(1, '0xabc');

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/networks/1/transactions/0xabc'),
        expect.any(Object),
      );
    });

    it('fetches account transactions', async () => {
      const mockResponse = {
        data: [],
        pageInfo: { count: 0, hasNextPage: false },
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.accounts.fetchV1AccountTransactions('0x123');

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/accounts/0x123/transactions'),
        expect.any(Object),
      );
    });

    it('fetches v4 multi-account transactions', async () => {
      const mockResponse = {
        unprocessedNetworks: [],
        pageInfo: { count: 2, hasNextPage: false },
        data: [
          {
            hash: '0xabc123',
            timestamp: '2024-01-01T00:00:00Z',
            chainId: 1,
            blockNumber: 12345,
            blockHash: '0xdef',
            gas: 21000,
            gasUsed: 21000,
            gasPrice: '20000000000',
            effectiveGasPrice: '20000000000',
            nonce: 0,
            cumulativeGasUsed: 21000,
            value: '1000000000000000000',
            to: '0x456',
            from: '0x123',
          },
        ],
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.accounts.fetchV4MultiAccountTransactions(
        ['eip155:1:0x123', 'eip155:137:0x456'],
        {
          networks: ['eip155:1'],
          sortDirection: 'DESC',
          includeLogs: true,
          includeValueTransfers: true,
          includeTxMetadata: true,
        },
      );

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v4/multiaccount/transactions'),
        expect.any(Object),
      );
    });

    it('fetches account transactions with options but no chainIds', async () => {
      const mockResponse = {
        data: [],
        pageInfo: { count: 0, hasNextPage: false },
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.accounts.fetchV1AccountTransactions('0x123', {
        cursor: 'cursor123',
        sortDirection: 'DESC',
      });

      expect(result).toStrictEqual(mockResponse);
    });
  });

  describe('Relationships', () => {
    it('fetches account relationship', async () => {
      const mockResponse = {
        txHash:
          '0x4f0ad5dc4b74ad8192d4f7a3f0865719e4f1f168eadc1054bfc3f6a31c963bbe',
        chainId: 1,
        count: 1,
        data: {
          hash: '0x4f0ad5dc4b74ad8192d4f7a3f0865719e4f1f168eadc1054bfc3f6a31c963bbe',
          timestamp: '2023-07-18T16:32:47.000Z',
          chainId: 1,
          blockNumber: 17721322,
          blockHash:
            '0xf6043d4135fdeed008ce6292b1ee270341153a3f81380d92de4c83e4b81eb4cb',
          gas: 267118,
          gasUsed: 178079,
          gasPrice: '53514828218',
          effectiveGasPrice: '53514828218',
          nonce: 1384,
          cumulativeGasUsed: 6305501,
          methodId: '0x5a9ef341',
          value: '125000000000000000',
          to: '0xc5e9ddebb09cd64dfacab4011a0d5cedaf7c9bdb',
          from: '0x1db3439a222c519ab44bb1144fc28167b4fa6ee6',
          isError: false,
          valueTransfers: [
            {
              from: '0x1db3439a222c519ab44bb1144fc28167b4fa6ee6',
              to: '0xc5e9ddebb09cd64dfacab4011a0d5cedaf7c9bdb',
              amount: '125000000000000000',
              decimal: 18,
              transferType: 'normal',
            },
          ],
          logs: [],
          transactionType: 'GENERIC_CONTRACT_CALL',
          transactionCategory: 'CONTRACT_CALL',
          readable: 'Unidentified Transaction',
          textFunctionSignature: 'reapplySubmission(string,string)',
        },
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.accounts.fetchV1AccountRelationship(
        1,
        '0x123',
        '0x456',
      );

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(
          '/v1/networks/1/accounts/0x123/relationships/0x456',
        ),
        expect.any(Object),
      );
    });

    it('handles relationship error response gracefully', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ error: 'Not found' }, 404, 'Not Found'),
      );

      await expect(
        client.accounts.fetchV1AccountRelationship(1, '0x123', '0x456'),
      ).rejects.toThrow(HttpError);
    });

    it('returns error object when relationship fetch fails with body error', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          {
            error: {
              code: 'RELATIONSHIP_NOT_FOUND',
              message: 'No relationship exists',
            },
          },
          404,
          'Not Found',
        ),
      );

      const result = await client.accounts.fetchV1AccountRelationship(
        1,
        '0x123',
        '0x456',
      );

      expect(result).toStrictEqual({
        error: {
          code: 'RELATIONSHIP_NOT_FOUND',
          message: 'No relationship exists',
        },
      });
    });
  });

  describe('NFTs', () => {
    it('fetches account NFTs', async () => {
      const mockResponse = {
        data: [
          {
            tokenId: '1',
            contractAddress: '0xnft',
            chainId: 1,
            name: 'Test NFT',
          },
        ],
        pageInfo: { count: 1, hasNextPage: false },
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.accounts.fetchV2AccountNfts('0x123');

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v2/accounts/0x123/nfts'),
        expect.any(Object),
      );
    });

    it('fetches account NFTs with cursor but no networks', async () => {
      const mockResponse = {
        data: [],
        pageInfo: { count: 0, hasNextPage: false },
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.accounts.fetchV2AccountNfts('0x123', {
        cursor: 'abc123',
      });

      expect(result).toStrictEqual(mockResponse);
    });
  });

  describe('Token Discovery', () => {
    it('fetches account tokens', async () => {
      const mockResponse = {
        data: [
          {
            address: '0xtoken',
            chainId: 1,
            symbol: 'TKN',
            name: 'Test Token',
            decimals: 18,
          },
        ],
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.accounts.fetchV2AccountTokens('0x123');

      expect(result).toStrictEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v2/accounts/0x123/tokens'),
        expect.any(Object),
      );
    });

    it('fetches account tokens with empty options', async () => {
      const mockResponse = { data: [] };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.accounts.fetchV2AccountTokens('0x123', {});

      expect(result).toStrictEqual(mockResponse);
    });
  });
});
