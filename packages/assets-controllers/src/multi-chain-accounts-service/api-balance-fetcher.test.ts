import type { InternalAccount } from '@metamask/keyring-internal-api';
import BN from 'bn.js';

import {
  AccountsApiBalanceFetcher,
  type ChainIdHex,
  type ChecksumAddress,
} from './api-balance-fetcher';
import type { GetBalancesResponse } from './types';
import { SUPPORTED_NETWORKS_ACCOUNTS_API_V4 } from '../constants';

const MOCK_ADDRESS_1 = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const MOCK_ADDRESS_2 = '0x742d35cc6675c4f17f41140100aa83a4b1fa4c82';
const MOCK_CHAIN_ID = '0x1' as ChainIdHex;
const MOCK_UNSUPPORTED_CHAIN_ID = '0x999' as ChainIdHex;

const MOCK_BALANCES_RESPONSE: GetBalancesResponse = {
  count: 3,
  balances: [
    {
      object: 'token',
      address: '0x0000000000000000000000000000000000000000',
      symbol: 'ETH',
      name: 'Ether',
      type: 'native',
      timestamp: '2015-07-30T03:26:13.000Z',
      decimals: 18,
      chainId: 1,
      balance: '1.5',
      accountAddress: 'eip155:1:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    },
    {
      object: 'token',
      address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      name: 'Dai Stablecoin',
      symbol: 'DAI',
      decimals: 18,
      chainId: 1,
      balance: '100.0',
      accountAddress: 'eip155:1:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    },
    {
      object: 'token',
      address: '0x0000000000000000000000000000000000000000',
      symbol: 'ETH',
      name: 'Ether',
      type: 'native',
      timestamp: '2015-07-30T03:26:13.000Z',
      decimals: 18,
      chainId: 1,
      balance: '2.0',
      accountAddress: 'eip155:1:0x742d35cc6675c4f17f41140100aa83a4b1fa4c82',
    },
  ],
  unprocessedNetworks: [],
};

const MOCK_LARGE_BALANCES_RESPONSE_BATCH_1: GetBalancesResponse = {
  count: 2,
  balances: [
    {
      object: 'token',
      address: '0x0000000000000000000000000000000000000000',
      symbol: 'ETH',
      name: 'Ether',
      decimals: 18,
      chainId: 1,
      balance: '1.0',
      accountAddress: 'eip155:1:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    },
    {
      object: 'token',
      address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      symbol: 'DAI',
      name: 'Dai',
      decimals: 18,
      chainId: 1,
      balance: '50.0',
      accountAddress: 'eip155:1:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    },
  ],
  unprocessedNetworks: [],
};

const MOCK_LARGE_BALANCES_RESPONSE_BATCH_2: GetBalancesResponse = {
  count: 1,
  balances: [
    {
      object: 'token',
      address: '0x0000000000000000000000000000000000000000',
      symbol: 'ETH',
      name: 'Ether',
      decimals: 18,
      chainId: 1,
      balance: '2.0',
      accountAddress: 'eip155:1:0x742d35cc6675c4f17f41140100aa83a4b1fa4c82',
    },
  ],
  unprocessedNetworks: [],
};

const MOCK_INTERNAL_ACCOUNTS: InternalAccount[] = [
  {
    id: '1',
    address: MOCK_ADDRESS_1,
    type: 'eip155:eoa',
    options: {},
    methods: [],
    scopes: [],
    metadata: {
      name: 'Account 1',
      importTime: Date.now(),
      keyring: {
        type: 'HD Key Tree',
      },
    },
  },
  {
    id: '2',
    address: MOCK_ADDRESS_2,
    type: 'eip155:eoa',
    options: {},
    methods: [],
    scopes: [],
    metadata: {
      name: 'Account 2',
      importTime: Date.now(),
      keyring: {
        type: 'HD Key Tree',
      },
    },
  },
];

// Mock the imports
jest.mock('@metamask/controller-utils', () => ({
  safelyExecute: jest.fn(),
  toHex: jest.fn(),
  toChecksumHexAddress: jest.fn(),
}));

jest.mock('./multi-chain-accounts', () => ({
  fetchMultiChainBalancesV4: jest.fn(),
}));

jest.mock('../assetsUtil', () => ({
  accountAddressToCaipReference: jest.fn(),
  reduceInBatchesSerially: jest.fn(),
}));

const mockSafelyExecute = jest.requireMock(
  '@metamask/controller-utils',
).safelyExecute;
const mockToHex = jest.requireMock('@metamask/controller-utils').toHex;
const mockToChecksumHexAddress = jest.requireMock(
  '@metamask/controller-utils',
).toChecksumHexAddress;
const mockFetchMultiChainBalancesV4 = jest.requireMock(
  './multi-chain-accounts',
).fetchMultiChainBalancesV4;
const mockAccountAddressToCaipReference =
  jest.requireMock('../assetsUtil').accountAddressToCaipReference;
const mockReduceInBatchesSerially =
  jest.requireMock('../assetsUtil').reduceInBatchesSerially;

describe('AccountsApiBalanceFetcher', () => {
  let balanceFetcher: AccountsApiBalanceFetcher;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mock implementations
    mockToHex.mockImplementation((value: number | string) => {
      if (typeof value === 'number') {
        return `0x${value.toString(16)}`;
      }
      return value;
    });

    mockToChecksumHexAddress.mockImplementation((address: string) => address);

    mockAccountAddressToCaipReference.mockImplementation(
      (chainId: string, address: string) =>
        `eip155:${parseInt(chainId, 16)}:${address}`,
    );

    mockSafelyExecute.mockImplementation(
      async (fn: () => Promise<void>) => await fn(),
    );
  });

  describe('constructor', () => {
    it('should create instance with default platform (extension)', () => {
      balanceFetcher = new AccountsApiBalanceFetcher();
      expect(balanceFetcher).toBeInstanceOf(AccountsApiBalanceFetcher);
    });

    it('should create instance with mobile platform', () => {
      balanceFetcher = new AccountsApiBalanceFetcher('mobile');
      expect(balanceFetcher).toBeInstanceOf(AccountsApiBalanceFetcher);
    });

    it('should create instance with extension platform', () => {
      balanceFetcher = new AccountsApiBalanceFetcher('extension');
      expect(balanceFetcher).toBeInstanceOf(AccountsApiBalanceFetcher);
    });
  });

  describe('supports', () => {
    beforeEach(() => {
      balanceFetcher = new AccountsApiBalanceFetcher();
    });

    it('should return true for supported chain IDs', () => {
      for (const chainId of SUPPORTED_NETWORKS_ACCOUNTS_API_V4) {
        expect(balanceFetcher.supports(chainId as ChainIdHex)).toBe(true);
      }
    });

    it('should return false for unsupported chain IDs', () => {
      expect(balanceFetcher.supports(MOCK_UNSUPPORTED_CHAIN_ID)).toBe(false);
      expect(balanceFetcher.supports('0x123' as ChainIdHex)).toBe(false);
    });
  });

  describe('fetch', () => {
    beforeEach(() => {
      balanceFetcher = new AccountsApiBalanceFetcher('extension');
    });

    it('should return empty array when no chain IDs are provided', async () => {
      const result = await balanceFetcher.fetch({
        chainIds: [],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      expect(result).toStrictEqual([]);
      expect(mockFetchMultiChainBalancesV4).not.toHaveBeenCalled();
    });

    it('should return empty array when no supported chain IDs are provided', async () => {
      const result = await balanceFetcher.fetch({
        chainIds: [MOCK_UNSUPPORTED_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      expect(result).toStrictEqual([]);
      expect(mockFetchMultiChainBalancesV4).not.toHaveBeenCalled();
    });

    it('should fetch balances for selected account only', async () => {
      const selectedAccountResponse = {
        count: 2,
        balances: [
          {
            object: 'token',
            address: '0x0000000000000000000000000000000000000000',
            symbol: 'ETH',
            name: 'Ether',
            type: 'native',
            timestamp: '2015-07-30T03:26:13.000Z',
            decimals: 18,
            chainId: 1,
            balance: '1.5',
            accountAddress:
              'eip155:1:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
          },
          {
            object: 'token',
            address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
            name: 'Dai Stablecoin',
            symbol: 'DAI',
            decimals: 18,
            chainId: 1,
            balance: '100.0',
            accountAddress:
              'eip155:1:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
          },
        ],
        unprocessedNetworks: [],
      };

      mockFetchMultiChainBalancesV4.mockResolvedValue(selectedAccountResponse);

      const result = await balanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      expect(mockFetchMultiChainBalancesV4).toHaveBeenCalledWith(
        {
          accountAddresses: [
            'eip155:1:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
          ],
        },
        'extension',
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toStrictEqual({
        success: true,
        value: new BN('1500000000000000000'),
        account: MOCK_ADDRESS_1,
        token: '0x0000000000000000000000000000000000000000',
        chainId: '0x1',
      });
      expect(result[1]).toStrictEqual({
        success: true,
        value: new BN('100000000000000000000'),
        account: MOCK_ADDRESS_1,
        token: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
        chainId: '0x1',
      });
    });

    it('should fetch balances for all accounts when queryAllAccounts is true', async () => {
      mockFetchMultiChainBalancesV4.mockResolvedValue(MOCK_BALANCES_RESPONSE);

      const result = await balanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: true,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      expect(mockFetchMultiChainBalancesV4).toHaveBeenCalledWith(
        {
          accountAddresses: [
            'eip155:1:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
            'eip155:1:0x742d35cc6675c4f17f41140100aa83a4b1fa4c82',
          ],
        },
        'extension',
      );

      expect(result).toHaveLength(3);
    });

    it('should handle large batch requests using reduceInBatchesSerially', async () => {
      // Create a large number of CAIP addresses to exceed ACCOUNTS_API_BATCH_SIZE (50)
      const largeAccountList: InternalAccount[] = [];
      const caipAddresses: string[] = [];

      for (let i = 0; i < 60; i++) {
        const address =
          `0x${'0'.repeat(39)}${i.toString().padStart(1, '0')}` as ChecksumAddress;
        largeAccountList.push({
          id: i.toString(),
          address,
          type: 'eip155:eoa',
          options: {},
          methods: [],
          scopes: [],
          metadata: {
            name: `Account ${i}`,
            importTime: Date.now(),
            keyring: { type: 'HD Key Tree' },
          },
        });
        caipAddresses.push(`eip155:1:${address}`);
      }

      // Mock reduceInBatchesSerially to return combined results
      mockReduceInBatchesSerially.mockImplementation(
        async ({
          eachBatch,
          initialResult,
        }: {
          eachBatch: (
            result: unknown,
            batch: unknown,
            index: number,
          ) => Promise<unknown>;
          initialResult: unknown;
        }) => {
          const batch1 = caipAddresses.slice(0, 50);
          const batch2 = caipAddresses.slice(50);

          let result = initialResult;
          result = await eachBatch(result, batch1, 0);
          result = await eachBatch(result, batch2, 1);

          return result;
        },
      );

      mockFetchMultiChainBalancesV4
        .mockResolvedValueOnce(MOCK_LARGE_BALANCES_RESPONSE_BATCH_1)
        .mockResolvedValueOnce(MOCK_LARGE_BALANCES_RESPONSE_BATCH_2);

      const result = await balanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: true,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: largeAccountList,
      });

      expect(mockReduceInBatchesSerially).toHaveBeenCalledWith({
        values: caipAddresses,
        batchSize: 50,
        eachBatch: expect.any(Function),
        initialResult: [],
      });

      expect(mockFetchMultiChainBalancesV4).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(3);
    });

    it('should handle API errors gracefully', async () => {
      mockSafelyExecute.mockResolvedValue(undefined);

      const result = await balanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      expect(result).toStrictEqual([]);
    });

    it('should handle missing account address in response', async () => {
      const responseWithMissingAccount: GetBalancesResponse = {
        count: 1,
        balances: [
          {
            object: 'token',
            address: '0x0000000000000000000000000000000000000000',
            symbol: 'ETH',
            name: 'Ether',
            decimals: 18,
            chainId: 1,
            balance: '1.0',
            // accountAddress is missing
          },
        ],
        unprocessedNetworks: [],
      };

      mockFetchMultiChainBalancesV4.mockResolvedValue(
        responseWithMissingAccount,
      );

      const result = await balanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      expect(result).toStrictEqual([]);
    });

    it('should handle invalid balance values', async () => {
      const responseWithInvalidBalance: GetBalancesResponse = {
        count: 1,
        balances: [
          {
            object: 'token',
            address: '0x0000000000000000000000000000000000000000',
            symbol: 'ETH',
            name: 'Ether',
            decimals: 18,
            chainId: 1,
            balance: 'invalid-balance',
            accountAddress:
              'eip155:1:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
          },
        ],
        unprocessedNetworks: [],
      };

      mockFetchMultiChainBalancesV4.mockResolvedValue(
        responseWithInvalidBalance,
      );

      const result = await balanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toStrictEqual({
        success: false,
        value: undefined,
        account: MOCK_ADDRESS_1,
        token: '0x0000000000000000000000000000000000000000',
        chainId: '0x1',
      });
    });

    it('should correctly convert balance values with different decimals', async () => {
      const responseWithDifferentDecimals: GetBalancesResponse = {
        count: 2,
        balances: [
          {
            object: 'token',
            address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
            symbol: 'DAI',
            name: 'Dai',
            decimals: 18,
            chainId: 1,
            balance: '123.456789',
            accountAddress:
              'eip155:1:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
          },
          {
            object: 'token',
            address: '0xA0b86a33E6441c86c33E1C6B9cD964c0BA2A86B',
            symbol: 'USDC',
            name: 'USD Coin',
            decimals: 6,
            chainId: 1,
            balance: '100.5',
            accountAddress:
              'eip155:1:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
          },
        ],
        unprocessedNetworks: [],
      };

      mockFetchMultiChainBalancesV4.mockResolvedValue(
        responseWithDifferentDecimals,
      );

      const result = await balanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      expect(result).toHaveLength(2);

      // DAI with 18 decimals: 123.456789 * 10^18 (with floating point precision)
      const expectedDaiValue = new BN(
        (parseFloat('123.456789') * 10 ** 18).toFixed(0),
      );
      expect(result[0]).toStrictEqual({
        success: true,
        value: expectedDaiValue,
        account: MOCK_ADDRESS_1,
        token: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
        chainId: '0x1',
      });

      // USDC with 6 decimals: 100.5 * 10^6
      expect(result[1]).toStrictEqual({
        success: true,
        value: new BN('100500000'),
        account: MOCK_ADDRESS_1,
        token: '0xA0b86a33E6441c86c33E1C6B9cD964c0BA2A86B',
        chainId: '0x1',
      });
    });

    it('should handle multiple chain IDs', async () => {
      mockFetchMultiChainBalancesV4.mockResolvedValue(MOCK_BALANCES_RESPONSE);

      const result = await balanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID, '0x89' as ChainIdHex], // Ethereum and Polygon
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      expect(mockAccountAddressToCaipReference).toHaveBeenCalledWith(
        MOCK_CHAIN_ID,
        MOCK_ADDRESS_1,
      );
      expect(mockAccountAddressToCaipReference).toHaveBeenCalledWith(
        '0x89',
        MOCK_ADDRESS_1,
      );

      expect(mockFetchMultiChainBalancesV4).toHaveBeenCalledWith(
        {
          accountAddresses: [
            'eip155:1:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
            'eip155:137:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
          ],
        },
        'extension',
      );
    });

    it('should pass correct platform to fetchMultiChainBalancesV4', async () => {
      const mobileBalanceFetcher = new AccountsApiBalanceFetcher('mobile');
      mockFetchMultiChainBalancesV4.mockResolvedValue(MOCK_BALANCES_RESPONSE);

      await mobileBalanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      expect(mockFetchMultiChainBalancesV4).toHaveBeenCalledWith(
        {
          accountAddresses: [
            'eip155:1:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
          ],
        },
        'mobile',
      );
    });
  });
});
