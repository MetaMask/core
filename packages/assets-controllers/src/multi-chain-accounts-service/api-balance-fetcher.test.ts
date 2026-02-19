import type { InternalAccount } from '@metamask/keyring-internal-api';
import BN from 'bn.js';

import { AccountsApiBalanceFetcher } from './api-balance-fetcher';
import type { ChainIdHex, ChecksumAddress } from './api-balance-fetcher';
import type { GetBalancesResponse } from './types';
import { createMockInternalAccount } from '../../../accounts-controller/tests/mocks';
import { SUPPORTED_NETWORKS_ACCOUNTS_API_V4 } from '../constants';
import * as ConstantsModule from '../constants';

// Mock dependencies that cause import issues
jest.mock('../AssetsContractController', () => ({
  STAKING_CONTRACT_ADDRESS_BY_CHAINID: {
    '0x1': '0x4FEF9D741011476750A243aC70b9789a63dd47Df',
    '0x4268': '0x4FEF9D741011476750A243aC70b9789a63dd47Df',
  },
}));

const MOCK_ADDRESS_1 = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const MOCK_ADDRESS_2 = '0x742d35cc6675c4f17f41140100aa83a4b1fa4c82';
const MOCK_CHAIN_ID = '0x1' as ChainIdHex;
const MOCK_UNSUPPORTED_CHAIN_ID = '0x999' as ChainIdHex;
const ZERO_ADDRESS =
  '0x0000000000000000000000000000000000000000' as ChecksumAddress;
const STAKING_CONTRACT_ADDRESS =
  '0x4FEF9D741011476750A243aC70b9789a63dd47Df' as ChecksumAddress;

type TokenBalance = GetBalancesResponse['balances'][number];

const createMockNativeTokenBalance = (
  overrides?: Partial<TokenBalance>,
): TokenBalance => ({
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
  ...overrides,
});
const createMockERCTokenBalance = (
  overrides?: Partial<TokenBalance>,
): TokenBalance => ({
  object: 'token',
  address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  name: 'Dai Stablecoin',
  symbol: 'DAI',
  decimals: 18,
  chainId: 1,
  balance: '100.0',
  accountAddress: 'eip155:1:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
  ...overrides,
});

const MOCK_BALANCES_RESPONSE: GetBalancesResponse = {
  count: 3,
  balances: [
    createMockNativeTokenBalance(),
    createMockERCTokenBalance(),
    createMockNativeTokenBalance({
      balance: '2.0',
      accountAddress: 'eip155:1:0x742d35cc6675c4f17f41140100aa83a4b1fa4c82',
    }),
  ],
  unprocessedNetworks: [],
};

const MOCK_LARGE_BALANCES_RESPONSE_BATCH_1: GetBalancesResponse = {
  count: 2,
  balances: [
    createMockNativeTokenBalance({ balance: '1.0' }),
    createMockERCTokenBalance({ name: 'Dai', balance: '50.0' }),
  ],
  unprocessedNetworks: [],
};

const MOCK_LARGE_BALANCES_RESPONSE_BATCH_2: GetBalancesResponse = {
  count: 1,
  balances: [
    createMockNativeTokenBalance({
      balance: '2.0',
      accountAddress: 'eip155:1:0x742d35cc6675c4f17f41140100aa83a4b1fa4c82',
    }),
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
  safelyExecuteWithTimeout: jest.fn(),
  toHex: jest.fn(),
  toChecksumHexAddress: jest.fn(),
}));

jest.mock('./multi-chain-accounts', () => ({
  fetchMultiChainBalancesV4: jest.fn(),
}));

jest.mock('../assetsUtil', () => ({
  accountAddressToCaipReference: jest.fn(),
  reduceInBatchesSerially: jest.fn(),
  SupportedStakedBalanceNetworks: {
    Mainnet: '0x1',
    Hoodi: '0x4268',
  },
  STAKING_CONTRACT_ADDRESS_BY_CHAINID: {
    '0x1': '0x4FEF9D741011476750A243aC70b9789a63dd47Df',
    '0x4268': '0x4FEF9D741011476750A243aC70b9789a63dd47Df',
  },
}));

jest.mock('@ethersproject/contracts', () => ({
  Contract: jest.fn(),
}));

jest.mock('@ethersproject/bignumber', () => ({
  BigNumber: {
    from: jest.fn(),
  },
}));

jest.mock('@ethersproject/providers', () => ({
  Web3Provider: jest.fn(),
}));

const mockSafelyExecute = jest.requireMock(
  '@metamask/controller-utils',
).safelyExecute;
const mockSafelyExecuteWithTimeout = jest.requireMock(
  '@metamask/controller-utils',
).safelyExecuteWithTimeout;
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

    // Mock safelyExecuteWithTimeout to just execute the function
    mockSafelyExecuteWithTimeout.mockImplementation(
      async (operation: () => Promise<unknown>) => {
        try {
          return await operation();
        } catch {
          return undefined;
        }
      },
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

    it('should create instance with getProvider function for staked balance functionality', () => {
      const mockGetProvider = jest.fn();
      balanceFetcher = new AccountsApiBalanceFetcher(
        'extension',
        mockGetProvider,
      );
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

      expect(result).toStrictEqual({ balances: [] });
      expect(mockFetchMultiChainBalancesV4).not.toHaveBeenCalled();
    });

    it('should return empty array when no supported chain IDs are provided', async () => {
      const result = await balanceFetcher.fetch({
        chainIds: [MOCK_UNSUPPORTED_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      expect(result).toStrictEqual({ balances: [] });
      expect(mockFetchMultiChainBalancesV4).not.toHaveBeenCalled();
    });

    it('should skip API and return unprocessedChainIds when getIsWebSocketActive returns true', async () => {
      const getIsWebSocketActive = jest.fn().mockReturnValue(true);
      balanceFetcher = new AccountsApiBalanceFetcher(
        'extension',
        undefined,
        undefined,
        getIsWebSocketActive,
      );

      const result = await balanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      expect(getIsWebSocketActive).toHaveBeenCalled();
      expect(mockFetchMultiChainBalancesV4).not.toHaveBeenCalled();
      expect(result).toStrictEqual({
        balances: [],
        unprocessedChainIds: [MOCK_CHAIN_ID],
      });
    });

    it('should call API when getIsWebSocketActive returns false', async () => {
      const getIsWebSocketActive = jest.fn().mockReturnValue(false);
      balanceFetcher = new AccountsApiBalanceFetcher(
        'extension',
        undefined,
        undefined,
        getIsWebSocketActive,
      );
      mockFetchMultiChainBalancesV4.mockResolvedValue(MOCK_BALANCES_RESPONSE);

      await balanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      expect(getIsWebSocketActive).toHaveBeenCalled();
      expect(mockFetchMultiChainBalancesV4).toHaveBeenCalled();
    });

    it('should fetch balances for selected account only', async () => {
      const selectedAccountResponse: GetBalancesResponse = {
        count: 2,
        balances: [
          createMockNativeTokenBalance({
            accountAddress: `eip155:1:${MOCK_ADDRESS_1}`,
          }),
          createMockERCTokenBalance({
            accountAddress: `eip155:1:${MOCK_ADDRESS_1}`,
          }),
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
        undefined,
      );

      expect(result.balances).toHaveLength(2);
      expect(result.balances[0]).toStrictEqual({
        success: true,
        value: new BN('1500000000000000000'),
        account: MOCK_ADDRESS_1,
        token: '0x0000000000000000000000000000000000000000',
        chainId: '0x1',
      });
      expect(result.balances[1]).toStrictEqual({
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
        undefined,
      );

      expect(result.balances).toHaveLength(3);
    });

    it('should convert unprocessedNetworks from decimal to hex chain IDs', async () => {
      const responseWithUnprocessed = {
        count: 1,
        balances: [
          createMockNativeTokenBalance({
            accountAddress: `eip155:1:${MOCK_ADDRESS_1}`,
          }),
        ],
        unprocessedNetworks: [137, 42161, 10, 8453], // Polygon, Arbitrum, Optimism, Base (in decimal)
      };

      mockFetchMultiChainBalancesV4.mockResolvedValue(responseWithUnprocessed);

      const result = await balanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      // Verify conversion from decimal to hex
      expect(result.unprocessedChainIds).toBeDefined();
      expect(result.unprocessedChainIds).toStrictEqual([
        '0x89', // 137 -> 0x89 (Polygon)
        '0xa4b1', // 42161 -> 0xa4b1 (Arbitrum)
        '0xa', // 10 -> 0xa (Optimism)
        '0x2105', // 8453 -> 0x2105 (Base)
      ]);
    });

    it('should handle large batch requests using reduceInBatchesSerially', async () => {
      // Create a large number of CAIP addresses to exceed ACCOUNTS_API_BATCH_SIZE (50)
      const largeAccountList: InternalAccount[] = [];
      const caipAddresses: string[] = [];

      for (let i = 0; i < 60; i++) {
        const address =
          `0x${'0'.repeat(39)}${i.toString().padStart(1, '0')}` as ChecksumAddress;
        largeAccountList.push(createMockInternalAccount({ address }));
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
        batchSize: 20,
        eachBatch: expect.any(Function),
        initialResult: [],
      });

      expect(mockFetchMultiChainBalancesV4).toHaveBeenCalledTimes(2);
      // Should have more results due to native token guarantees for all 60 accounts
      expect(result.balances.length).toBeGreaterThan(3);
    });

    it('should collect unprocessedNetworks from multiple batches', async () => {
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

      // Mock reduceInBatchesSerially to simulate batching behavior
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

      // Mock the API to return different unprocessedNetworks for each batch
      mockFetchMultiChainBalancesV4
        .mockResolvedValueOnce({
          count: 0,
          balances: [],
          unprocessedNetworks: [137, 42161], // Batch 1: Polygon and Arbitrum
        })
        .mockResolvedValueOnce({
          count: 0,
          balances: [],
          unprocessedNetworks: [10, 137], // Batch 2: Optimism and Polygon (duplicate)
        });

      const result = await balanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: true,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: largeAccountList,
      });

      // Should have been called twice (2 batches)
      expect(mockFetchMultiChainBalancesV4).toHaveBeenCalledTimes(2);

      // should have collected all unique networks from both batches
      // The Set deduplicates 137 (Polygon) which appears in both batches
      expect(result.unprocessedChainIds).toBeDefined();
      expect(result.unprocessedChainIds).toStrictEqual(
        expect.arrayContaining(['0x89', '0xa4b1', '0xa']),
      );
      expect(result.unprocessedChainIds).toHaveLength(3); // No duplicates
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

      // Should have native token guarantee even with missing account address
      expect(result.balances).toHaveLength(1);
      expect(result.balances[0].token).toBe(ZERO_ADDRESS);
      expect(result.balances[0].success).toBe(true);
      expect(result.balances[0].value).toStrictEqual(new BN('0'));
    });

    it('should correctly convert balance values with different decimals', async () => {
      const responseWithDifferentDecimals: GetBalancesResponse = {
        count: 2,
        balances: [
          createMockERCTokenBalance({ name: 'Dai', balance: '123.456789' }),
          createMockERCTokenBalance({
            address: '0xA0b86a33E6441c86c33E1C6B9cD964c0BA2A86B',
            symbol: 'USDC',
            name: 'USD Coin',
            decimals: 6,
            balance: '100.5',
          }),
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

      expect(result.balances).toHaveLength(3); // 2 tokens + native token guarantee

      // DAI with 18 decimals: 123.456789 -> using string-based conversion
      // Convert received hex value to decimal to get the correct expected value
      const expectedDaiValue = new BN('6b14e9f7e4f5a5000', 16);
      expect(result.balances[0]).toStrictEqual({
        success: true,
        value: expectedDaiValue,
        account: MOCK_ADDRESS_1,
        token: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
        chainId: '0x1',
      });

      // USDC with 6 decimals: 100.5 * 10^6
      expect(result.balances[1]).toStrictEqual({
        success: true,
        value: new BN('100500000'),
        account: MOCK_ADDRESS_1,
        token: '0xA0b86a33E6441c86c33E1C6B9cD964c0BA2A86B',
        chainId: '0x1',
      });
    });

    it('should handle multiple chain IDs', async () => {
      mockFetchMultiChainBalancesV4.mockResolvedValue(MOCK_BALANCES_RESPONSE);

      await balanceFetcher.fetch({
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
        undefined,
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
        undefined,
      );
    });
  });

  describe('native token guarantee', () => {
    beforeEach(() => {
      balanceFetcher = new AccountsApiBalanceFetcher('extension');
    });

    it('should include native token entry for addresses even when API does not return native balance', async () => {
      const responseWithoutNative: GetBalancesResponse = {
        count: 1,
        balances: [createMockERCTokenBalance()],
        unprocessedNetworks: [],
      };

      mockFetchMultiChainBalancesV4.mockResolvedValue(responseWithoutNative);

      const result = await balanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      expect(result.balances).toHaveLength(2); // DAI token + native token (zero balance)

      // Should include the DAI token
      const daiBalance = result.balances.find(
        (res) => res.token === '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      );
      expect(daiBalance).toBeDefined();
      expect(daiBalance?.success).toBe(true);

      // Should include native token with zero balance
      const nativeBalance = result.balances.find(
        (res) => res.token === ZERO_ADDRESS,
      );
      expect(nativeBalance).toBeDefined();
      expect(nativeBalance?.success).toBe(true);
      expect(nativeBalance?.value).toStrictEqual(new BN('0'));
      expect(nativeBalance?.account).toBe(MOCK_ADDRESS_1);
      expect(nativeBalance?.chainId).toBe(MOCK_CHAIN_ID);
    });

    it('should include native token entries for all addresses when querying multiple accounts', async () => {
      const responsePartialNative: GetBalancesResponse = {
        count: 2,
        balances: [
          createMockNativeTokenBalance(),
          // Native balance missing for MOCK_ADDRESS_2
          createMockERCTokenBalance({
            name: 'Dai',
            balance: '50.0',
            accountAddress:
              'eip155:1:0x742d35cc6675c4f17f41140100aa83a4b1fa4c82',
          }),
        ],
        unprocessedNetworks: [],
      };

      mockFetchMultiChainBalancesV4.mockResolvedValue(responsePartialNative);

      const result = await balanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: true,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      // Should have 4 entries: ETH for addr1, DAI for addr2, and native (0) for addr2
      expect(result.balances).toHaveLength(3);

      // Verify native balances for both addresses
      const nativeBalances = result.balances.filter(
        (res) => res.token === ZERO_ADDRESS,
      );
      expect(nativeBalances).toHaveLength(2);

      const nativeAddr1 = nativeBalances.find(
        (res) => res.account === MOCK_ADDRESS_1,
      );
      const nativeAddr2 = nativeBalances.find(
        (res) => res.account === MOCK_ADDRESS_2,
      );

      expect(nativeAddr1?.value).toStrictEqual(new BN('1500000000000000000')); // 1.5 ETH
      expect(nativeAddr2?.value).toStrictEqual(new BN('0')); // Zero balance (not returned by API)
    });
  });

  describe('erc20 token zero balance guarantee', () => {
    const arrangeBalanceFetcher = (): AccountsApiBalanceFetcher => {
      const responseWithoutErc20: GetBalancesResponse = {
        count: 1,
        // Example of no erc20 balance, but does contain native token balance
        balances: [createMockNativeTokenBalance({ chainId: 1 })],
        unprocessedNetworks: [],
      };

      mockFetchMultiChainBalancesV4.mockResolvedValue(responseWithoutErc20);

      balanceFetcher = new AccountsApiBalanceFetcher(
        'extension',
        undefined,
        () => ({
          [MOCK_ADDRESS_1]: {
            '0x1': {
              [ZERO_ADDRESS]: {},
              '0x0xaf88d065e77c8cC2239327C5EDb3A432268e5831': '0x814a20', // previously had balance, should be zero now if api doesn't return it
            },
          },
        }),
      );

      return balanceFetcher;
    };

    it('should include erc20 token entry for addresses even when API does not return erc20 balance', async () => {
      balanceFetcher = arrangeBalanceFetcher();

      const result = await balanceFetcher.fetch({
        chainIds: ['0x1'],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      expect(result.balances).toHaveLength(2);
      expect(result.balances[0].token).toStrictEqual(ZERO_ADDRESS);
      expect(result.balances[1].token).toBe(
        '0x0xaf88d065e77c8cC2239327C5EDb3A432268e5831'.toLowerCase(),
      );
      expect(result.balances[1].value).toStrictEqual(new BN('0')); // balance is zero now since API did not return a value for this token
    });

    it('should not include erc20 token entry for chains that are not supported by account API', async () => {
      balanceFetcher = arrangeBalanceFetcher();

      balanceFetcher = new AccountsApiBalanceFetcher(
        'extension',
        undefined,
        () => ({
          [MOCK_ADDRESS_1]: {
            '0x1': {
              [ZERO_ADDRESS]: {},
            },
            // Avalanche is not a supported chain, so balances should not be zeroed out
            '0xa86a': {
              [ZERO_ADDRESS]: {},
              '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E': '0x814a20', // USDC AVAX has balance, should not be zeroed out
            },
          },
        }),
      );

      const result = await balanceFetcher.fetch({
        chainIds: ['0x1', '0xa86a' as ChainIdHex],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      console.log(result.balances);
      expect(result.balances).toHaveLength(1);
      expect(result.balances[0]).toStrictEqual(
        expect.objectContaining({
          chainId: '0x1',
          token: ZERO_ADDRESS,
          value: expect.any(BN),
        }),
      );
    });
  });

  describe('staked balance functionality', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mockProvider: any;
    let mockGetProvider: jest.Mock;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mockContract: any;

    beforeEach(() => {
      // Setup contract mock with required methods
      mockContract = {
        getShares: jest.fn(),
        convertToAssets: jest.fn(),
      };

      // Mock the Contract constructor to return our mock contract
      const mockContractConstructor = jest.requireMock(
        '@ethersproject/contracts',
      ).Contract;
      mockContractConstructor.mockImplementation(() => mockContract);

      mockProvider = {
        call: jest.fn(),
      };
      mockGetProvider = jest.fn().mockReturnValue(mockProvider);
      balanceFetcher = new AccountsApiBalanceFetcher(
        'extension',
        mockGetProvider,
      );
    });

    it('should fetch staked balances when getProvider is available', async () => {
      // Mock successful staking contract calls with BigNumber-like objects
      const mockShares = {
        toString: (): string => '1000000000000000000', // 1 share
        gt: jest.fn().mockReturnValue(true), // shares > 0
      };
      const mockAssets = {
        toString: (): string => '2000000000000000000', // 2 ETH equivalent
      };

      mockContract.getShares.mockResolvedValue(mockShares);
      mockContract.convertToAssets.mockResolvedValue(mockAssets);

      mockFetchMultiChainBalancesV4.mockResolvedValue(MOCK_BALANCES_RESPONSE);

      const result = await balanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: true,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      // Should include API balances + staked balance
      expect(result.balances.length).toBeGreaterThan(3); // Original 3 + staked balances

      // Check for staked balance
      const stakedBalance = result.balances.find(
        (res) => res.token === STAKING_CONTRACT_ADDRESS,
      );
      expect(stakedBalance).toBeDefined();
      expect(stakedBalance?.success).toBe(true);
      expect(stakedBalance?.value).toStrictEqual(new BN('2000000000000000000')); // 2 ETH
    });

    it('should handle zero staked balances', async () => {
      // Mock staking contract calls to return zero shares
      const mockZeroShares = {
        toString: (): string => '0', // 0 shares
        gt: jest.fn().mockReturnValue(false), // shares = 0, not > 0
      };
      mockContract.getShares.mockResolvedValue(mockZeroShares);

      mockFetchMultiChainBalancesV4.mockResolvedValue(MOCK_BALANCES_RESPONSE);

      const result = await balanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      // Should include staked balance entry with zero value when shares are zero
      const stakedBalance = result.balances.find(
        (res) => res.token === STAKING_CONTRACT_ADDRESS,
      );
      expect(stakedBalance).toBeDefined();
      expect(stakedBalance?.success).toBe(true);
      expect(stakedBalance?.value).toStrictEqual(new BN('0'));
    });

    it('should handle staking contract errors gracefully', async () => {
      // Mock staking contract call to fail
      mockContract.getShares.mockRejectedValue(
        new Error('Contract call failed'),
      );

      mockFetchMultiChainBalancesV4.mockResolvedValue(MOCK_BALANCES_RESPONSE);

      const result = await balanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      // Should still return API balances + native token guarantee, but failed staked balance
      expect(result.balances.length).toBeGreaterThan(2); // API results + native token + failed staking
      const stakedBalance = result.balances.find(
        (res) => res.token === STAKING_CONTRACT_ADDRESS,
      );
      expect(stakedBalance).toBeDefined();
      expect(stakedBalance?.success).toBe(false);
    });

    it('should skip staked balance fetching for unsupported chains', async () => {
      const unsupportedChainResponse: GetBalancesResponse = {
        count: 1,
        balances: [
          {
            object: 'token',
            address: ZERO_ADDRESS,
            symbol: 'MATIC',
            name: 'Polygon',
            decimals: 18,
            chainId: parseInt(MOCK_UNSUPPORTED_CHAIN_ID, 16),
            balance: '1.0',
            accountAddress: `eip155:${parseInt(MOCK_UNSUPPORTED_CHAIN_ID, 16)}:${MOCK_ADDRESS_1}`,
          },
        ],
        unprocessedNetworks: [],
      };

      mockFetchMultiChainBalancesV4.mockResolvedValue(unsupportedChainResponse);

      const result = await balanceFetcher.fetch({
        chainIds: [MOCK_UNSUPPORTED_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      // Should not call provider for unsupported chains
      expect(mockGetProvider).not.toHaveBeenCalled();
      expect(mockProvider.call).not.toHaveBeenCalled();

      // Should not include staked balance
      const stakedBalance = result.balances.find(
        (res) => res.token === STAKING_CONTRACT_ADDRESS,
      );
      expect(stakedBalance).toBeUndefined();
    });

    it('should skip staked balance fetching for API-supported but staking-unsupported chains', async () => {
      // Use Polygon (0x89) - it's supported by the API but NOT supported for staking
      const polygonChainId = '0x89' as ChainIdHex;

      // Mock API response for Polygon
      const polygonResponse: GetBalancesResponse = {
        count: 1,
        balances: [
          {
            object: 'token',
            address: ZERO_ADDRESS,
            symbol: 'MATIC',
            name: 'Polygon',
            decimals: 18,
            chainId: parseInt(polygonChainId, 16),
            balance: '1.0',
            accountAddress: `eip155:${parseInt(polygonChainId, 16)}:${MOCK_ADDRESS_1}`,
          },
        ],
        unprocessedNetworks: [],
      };

      mockFetchMultiChainBalancesV4.mockResolvedValue(polygonResponse);

      const result = await balanceFetcher.fetch({
        chainIds: [polygonChainId], // Polygon is API-supported but not staking-supported
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      // Should include native token but no staked balance for Polygon
      expect(result.balances.length).toBeGreaterThan(0);
      const stakedBalance = result.balances.find(
        (res) => res.token === STAKING_CONTRACT_ADDRESS,
      );
      expect(stakedBalance).toBeUndefined(); // No staked balance for unsupported staking chain

      // Should have native token balance
      const nativeBalance = result.balances.find(
        (res) => res.token === ZERO_ADDRESS,
      );
      expect(nativeBalance).toBeDefined();
    });

    it('should skip staked balance when supported network has no contract address', async () => {
      // In the current implementation, is essentially unreachable because
      // SupportedStakedBalanceNetworks and STAKING_CONTRACT_ADDRESS_BY_CHAINID are always in sync.
      // However, we can create a test scenario by directly testing the #fetchStakedBalances method
      // with a mock configuration where this mismatch exists.

      // The test mocks define hoodi as '0x4268', but let's temporarily modify the mock
      // to remove '0x4268' from STAKING_CONTRACT_ADDRESS_BY_CHAINID while keeping it
      // in SupportedStakedBalanceNetworks

      const testChainId = '0x4268' as ChainIdHex; // Use the mock hoodi chain ID

      // Get the mocked module
      const mockAssetsController = jest.requireMock(
        '../AssetsContractController',
      );

      // Store original mock
      const originalContractAddresses =
        mockAssetsController.STAKING_CONTRACT_ADDRESS_BY_CHAINID;

      // Temporarily remove '0x4268' from contract addresses
      mockAssetsController.STAKING_CONTRACT_ADDRESS_BY_CHAINID = {
        '0x1': '0x4FEF9D741011476750A243aC70b9789a63dd47Df', // Keep mainnet
        // Remove '0x4268' (hoodi) from contract addresses
      };

      // Also need to add '0x4268' to supported API networks temporarily
      const originalSupported = [...SUPPORTED_NETWORKS_ACCOUNTS_API_V4];
      Object.defineProperty(
        ConstantsModule,
        'SUPPORTED_NETWORKS_ACCOUNTS_API_V4',
        { value: [...SUPPORTED_NETWORKS_ACCOUNTS_API_V4, testChainId] },
      );

      try {
        // Mock API response for the test chain
        const testResponse: GetBalancesResponse = {
          count: 1,
          balances: [
            {
              object: 'token',
              address: ZERO_ADDRESS,
              symbol: 'HOD',
              name: 'Hoodi Token',
              decimals: 18,
              chainId: parseInt(testChainId, 16),
              balance: '1.0',
              accountAddress: `eip155:${parseInt(testChainId, 16)}:${MOCK_ADDRESS_1}`,
            },
          ],
          unprocessedNetworks: [],
        };

        mockFetchMultiChainBalancesV4.mockResolvedValue(testResponse);

        const result = await balanceFetcher.fetch({
          chainIds: [testChainId], // 0x4268 is in mocked SupportedStakedBalanceNetworks but not in modified STAKING_CONTRACT_ADDRESS_BY_CHAINID
          queryAllAccounts: false,
          selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
          allAccounts: MOCK_INTERNAL_ACCOUNTS,
        });

        // Should include native token but no staked balance due to missing contract address
        expect(result.balances.length).toBeGreaterThan(0);
        const stakedBalance = result.balances.find(
          (res) => res.token === STAKING_CONTRACT_ADDRESS,
        );
        expect(stakedBalance).toBeUndefined(); // No staked balance due to missing contract address

        // Should have native token balance
        const nativeBalance = result.balances.find(
          (res) => res.token === ZERO_ADDRESS,
        );
        expect(nativeBalance).toBeDefined();
      } finally {
        // Restore original mocks
        mockAssetsController.STAKING_CONTRACT_ADDRESS_BY_CHAINID =
          originalContractAddresses;

        // Restore original supported networks
        Object.defineProperty(
          ConstantsModule,
          'SUPPORTED_NETWORKS_ACCOUNTS_API_V4',
          { value: [...originalSupported] },
        );
      }
    });

    it('should handle contract setup errors gracefully', async () => {
      // This test covers the outer catch block in #fetchStakedBalances
      // when contract creation fails

      // Setup mocks for contract creation failure
      const mockProvider2 = {
        call: jest.fn(),
      };
      const mockGetProvider2 = jest.fn().mockReturnValue(mockProvider2);

      // Mock Contract constructor to throw an error
      const mockContractConstructor = jest.requireMock(
        '@ethersproject/contracts',
      ).Contract;
      mockContractConstructor.mockImplementation(() => {
        throw new Error('Contract creation failed');
      });

      const testFetcher = new AccountsApiBalanceFetcher(
        'extension',
        mockGetProvider2,
      );

      // Setup console.error spy to verify the error is logged
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      try {
        mockFetchMultiChainBalancesV4.mockResolvedValue(MOCK_BALANCES_RESPONSE);

        const result = await testFetcher.fetch({
          chainIds: [MOCK_CHAIN_ID], // Use mainnet which has staking support
          queryAllAccounts: false,
          selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
          allAccounts: MOCK_INTERNAL_ACCOUNTS,
        });

        // Should still return API balances and native token guarantee, but no staked balances
        expect(result.balances.length).toBeGreaterThan(0);

        // Verify console.error was called with contract setup error
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining(
            'Error setting up staking contract for chain',
          ),
          expect.any(Error),
        );

        // Should not have any staked balance due to contract setup failure
        const stakedBalance = result.balances.find(
          (res) => res.token === STAKING_CONTRACT_ADDRESS,
        );
        expect(stakedBalance).toBeUndefined();
      } finally {
        consoleSpy.mockRestore();
        // Restore the original Contract mock implementation
        mockContractConstructor.mockReset();
      }
    });

    it('should handle staked balances when getProvider is not provided', async () => {
      // Create fetcher without getProvider
      const fetcherWithoutProvider = new AccountsApiBalanceFetcher('extension');

      mockFetchMultiChainBalancesV4.mockResolvedValue(MOCK_BALANCES_RESPONSE);

      const result = await fetcherWithoutProvider.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      // Should return API balances plus native token guarantee (but no staked balances)
      expect(result.balances).toHaveLength(3); // Original API results + native token
      const stakedBalance = result.balances.find(
        (res) => res.token === STAKING_CONTRACT_ADDRESS,
      );
      expect(stakedBalance).toBeUndefined();
    });
  });

  describe('additional coverage tests', () => {
    beforeEach(() => {
      balanceFetcher = new AccountsApiBalanceFetcher('extension');
    });

    it('should test checksum and toCaipAccount helper functions indirectly', async () => {
      mockToChecksumHexAddress.mockReturnValue('0xCHECKSUMMED');
      mockAccountAddressToCaipReference.mockReturnValue(
        'eip155:1:0xCHECKSUMMED',
      );

      mockFetchMultiChainBalancesV4.mockResolvedValue({
        count: 0,
        balances: [],
        unprocessedNetworks: [],
      });

      await balanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      expect(mockToChecksumHexAddress).toHaveBeenCalled();
      expect(mockAccountAddressToCaipReference).toHaveBeenCalled();
    });

    it('should handle the single account branch', async () => {
      // This specifically tests the else branch that adds single account
      mockFetchMultiChainBalancesV4.mockResolvedValue(MOCK_BALANCES_RESPONSE);

      const result = await balanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      expect(mockAccountAddressToCaipReference).toHaveBeenCalledWith(
        MOCK_CHAIN_ID,
        MOCK_ADDRESS_1,
      );
      expect(result.balances.length).toBeGreaterThan(0);
    });

    it('should handle balance parsing errors gracefully', async () => {
      const responseWithNaNBalance: GetBalancesResponse = {
        count: 1,
        balances: [
          createMockERCTokenBalance({
            name: 'Dai',
            balance: 'not-a-number',
          }),
        ],
        unprocessedNetworks: [],
      };

      mockFetchMultiChainBalancesV4.mockResolvedValue(responseWithNaNBalance);

      const result = await balanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      // Should have native token (guaranteed) and failed balance
      expect(result.balances).toHaveLength(2);

      const failedBalance = result.balances.find(
        (res) => res.token === '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      );
      expect(failedBalance?.success).toBe(false);
      expect(failedBalance?.value).toBeUndefined();
    });

    it('should handle parallel fetching of API balances and staked balances', async () => {
      // Setup contract mock with required methods
      const localMockContract = {
        getShares: jest.fn().mockResolvedValue({ toString: () => '0' }),
        convertToAssets: jest.fn(),
      };

      // Mock the Contract constructor to return our mock contract
      const mockContractConstructor = jest.requireMock(
        '@ethersproject/contracts',
      ).Contract;
      mockContractConstructor.mockImplementation(() => localMockContract);

      const mockGetProvider = jest.fn();
      const mockProvider = {
        call: jest
          .fn()
          .mockResolvedValue(
            '0x0000000000000000000000000000000000000000000000000000000000000000',
          ),
      };
      mockGetProvider.mockReturnValue(mockProvider);

      const fetcherWithProvider = new AccountsApiBalanceFetcher(
        'extension',
        mockGetProvider,
      );

      mockFetchMultiChainBalancesV4.mockResolvedValue(MOCK_BALANCES_RESPONSE);

      const result = await fetcherWithProvider.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: true,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      // Verify both API balances and staked balance processing occurred
      expect(mockFetchMultiChainBalancesV4).toHaveBeenCalled();
      expect(mockGetProvider).toHaveBeenCalledWith(MOCK_CHAIN_ID);
      expect(result.balances.length).toBeGreaterThan(0);
    });

    it('should handle native balance tracking and guarantee (lines 304-306, 322-338)', async () => {
      const responseWithMixedBalances: GetBalancesResponse = {
        count: 3,
        balances: [
          createMockNativeTokenBalance({ balance: '1.0' }),
          createMockERCTokenBalance({
            name: 'Dai',
            balance: '100.0',
            accountAddress:
              'eip155:1:0x742d35cc6675c4f17f41140100aa83a4b1fa4c82',
          }),
          // Missing native balance for second address
        ],
        unprocessedNetworks: [],
      };

      mockFetchMultiChainBalancesV4.mockResolvedValue(
        responseWithMixedBalances,
      );

      const result = await balanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: true,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      // Should have guaranteed native balances for both addresses
      const nativeBalances = result.balances.filter(
        (res) => res.token === ZERO_ADDRESS,
      );
      expect(nativeBalances).toHaveLength(2);

      const addr1Native = nativeBalances.find(
        (res) => res.account === MOCK_ADDRESS_1,
      );
      const addr2Native = nativeBalances.find(
        (res) => res.account === MOCK_ADDRESS_2,
      );

      expect(addr1Native?.value).toStrictEqual(new BN('1000000000000000000')); // 1 ETH from API
      expect(addr2Native?.value).toStrictEqual(new BN('0')); // Zero balance (guaranteed)
    });
  });

  describe('staked balance internal method coverage', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mockProvider: any;
    let mockGetProvider: jest.Mock;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mockContract: any;

    beforeEach(() => {
      // Setup contract mock with required methods
      mockContract = {
        getShares: jest.fn(),
        convertToAssets: jest.fn(),
      };

      // Mock the Contract constructor to return our mock contract
      const mockContractConstructor = jest.requireMock(
        '@ethersproject/contracts',
      ).Contract;
      mockContractConstructor.mockImplementation(() => mockContract);

      mockProvider = {
        call: jest.fn(),
      };
      mockGetProvider = jest.fn().mockReturnValue(mockProvider);
      balanceFetcher = new AccountsApiBalanceFetcher(
        'extension',
        mockGetProvider,
      );
    });

    it('should test full staked balance flow with successful shares and conversion', async () => {
      // Mock successful getShares call with BigNumber-like object
      const mockShares = {
        toString: (): string => '1000000000000000000', // 1 share
        gt: jest.fn().mockReturnValue(true), // shares > 0
      };
      mockContract.getShares.mockResolvedValue(mockShares);

      // Mock successful convertToAssets call
      const mockAssets = {
        toString: (): string => '2000000000000000000', // 2 ETH equivalent
      };
      mockContract.convertToAssets.mockResolvedValue(mockAssets);

      mockFetchMultiChainBalancesV4.mockResolvedValue({
        count: 0,
        balances: [],
        unprocessedNetworks: [],
      });

      const result = await balanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      // Should include staked balance
      const stakedBalance = result.balances.find(
        (res) => res.token === STAKING_CONTRACT_ADDRESS,
      );
      expect(stakedBalance).toBeDefined();
      expect(stakedBalance?.success).toBe(true);
      expect(stakedBalance?.value).toStrictEqual(new BN('2000000000000000000'));
    });

    it('should handle contract call failures in staking flow', async () => {
      // Mock getShares to fail
      mockContract.getShares.mockRejectedValue(new Error('Contract error'));

      mockFetchMultiChainBalancesV4.mockResolvedValue({
        count: 0,
        balances: [],
        unprocessedNetworks: [],
      });

      const result = await balanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      // Should include failed staked balance when contract calls fail
      const stakedBalance = result.balances.find(
        (res) => res.token === STAKING_CONTRACT_ADDRESS,
      );
      expect(stakedBalance).toBeDefined();
      expect(stakedBalance?.success).toBe(false);
    });

    it('should handle conversion failures after successful shares fetch', async () => {
      // Mock successful getShares with BigNumber-like object
      const mockShares = {
        toString: (): string => '1000000000000000000',
        gt: jest.fn().mockReturnValue(true), // shares > 0
      };
      mockContract.getShares.mockResolvedValue(mockShares);

      // Mock failed convertToAssets
      mockContract.convertToAssets.mockRejectedValue(
        new Error('Conversion failed'),
      );

      mockFetchMultiChainBalancesV4.mockResolvedValue({
        count: 0,
        balances: [],
        unprocessedNetworks: [],
      });

      const result = await balanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      // Should include failed staked balance when conversion fails
      const stakedBalance = result.balances.find(
        (res) => res.token === STAKING_CONTRACT_ADDRESS,
      );
      expect(stakedBalance).toBeDefined();
      expect(stakedBalance?.success).toBe(false);
    });

    it('should handle zero shares from staking contract', async () => {
      // Mock getShares returning zero with BigNumber-like object
      const mockZeroShares = {
        toString: (): string => '0',
        gt: jest.fn().mockReturnValue(false), // shares = 0, not > 0
      };
      mockContract.getShares.mockResolvedValue(mockZeroShares);

      mockFetchMultiChainBalancesV4.mockResolvedValue({
        count: 0,
        balances: [],
        unprocessedNetworks: [],
      });

      const result = await balanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      // Should include staked balance with zero value when shares are zero
      const stakedBalance = result.balances.find(
        (res) => res.token === STAKING_CONTRACT_ADDRESS,
      );
      expect(stakedBalance).toBeDefined();
      expect(stakedBalance?.success).toBe(true);
      expect(stakedBalance?.value).toStrictEqual(new BN('0'));
    });

    it('should handle multiple addresses with staking', async () => {
      // Mock different shares for different addresses with BigNumber-like objects
      const mockAddr1Shares = {
        toString: (): string => '1000000000000000000', // addr1: 1 share
        gt: jest.fn().mockReturnValue(true), // shares > 0
      };
      const mockAddr2Shares = {
        toString: (): string => '0', // addr2: 0 shares
        gt: jest.fn().mockReturnValue(false), // shares = 0
      };

      mockContract.getShares
        .mockResolvedValueOnce(mockAddr1Shares)
        .mockResolvedValueOnce(mockAddr2Shares);

      mockContract.convertToAssets.mockResolvedValueOnce({
        toString: () => '2000000000000000000',
      }); // addr1: 2 ETH

      mockFetchMultiChainBalancesV4.mockResolvedValue({
        count: 0,
        balances: [],
        unprocessedNetworks: [],
      });

      const result = await balanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: true,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      // Should include staked balance entries for both addresses
      const stakedBalances = result.balances.filter(
        (res) => res.token === STAKING_CONTRACT_ADDRESS,
      );
      expect(stakedBalances).toHaveLength(2);

      // First address should have non-zero balance
      const addr1Balance = stakedBalances.find(
        (res) => res.account === MOCK_ADDRESS_1,
      );
      expect(addr1Balance).toBeDefined();
      expect(addr1Balance?.success).toBe(true);
      expect(addr1Balance?.value).toStrictEqual(new BN('2000000000000000000'));

      // Second address should have zero balance
      const addr2Balance = stakedBalances.find(
        (res) => res.account === MOCK_ADDRESS_2,
      );
      expect(addr2Balance).toBeDefined();
      expect(addr2Balance?.success).toBe(true);
      expect(addr2Balance?.value).toStrictEqual(new BN('0'));
    });
  });

  describe('API error handling and recovery', () => {
    beforeEach(() => {
      balanceFetcher = new AccountsApiBalanceFetcher('extension');
    });

    it('should throw error when API fails (error propagates for RPC fallback)', async () => {
      // Setup successful staking contract (but it won't be reached)
      const mockShares = {
        toString: (): string => '1000000000000000000',
        gt: jest.fn().mockReturnValue(true),
      };
      const mockAssets = {
        toString: (): string => '2000000000000000000',
      };

      const localMockContract = {
        getShares: jest.fn().mockResolvedValue(mockShares),
        convertToAssets: jest.fn().mockResolvedValue(mockAssets),
      };

      const mockContractConstructor = jest.requireMock(
        '@ethersproject/contracts',
      ).Contract;
      mockContractConstructor.mockImplementation(() => localMockContract);

      const mockProvider = { call: jest.fn() };
      const mockGetProvider = jest.fn().mockReturnValue(mockProvider);

      const fetcherWithProvider = new AccountsApiBalanceFetcher(
        'extension',
        mockGetProvider,
      );

      // Make API fail - safelyExecuteWithTimeout will return undefined
      mockFetchMultiChainBalancesV4.mockRejectedValue(new Error('API failure'));

      // Should now throw error immediately to allow RPC fallback in TokenBalancesController
      await expect(
        fetcherWithProvider.fetch({
          chainIds: [MOCK_CHAIN_ID],
          queryAllAccounts: false,
          selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
          allAccounts: MOCK_INTERNAL_ACCOUNTS,
        }),
      ).rejects.toThrow('Accounts API request timed out or failed');
    });
  });

  describe('precision handling in balance conversion', () => {
    beforeEach(() => {
      balanceFetcher = new AccountsApiBalanceFetcher('extension');
    });

    it('should correctly handle high precision balances like PEPE token case', async () => {
      const highPrecisionResponse: GetBalancesResponse = {
        count: 1,
        balances: [
          {
            object: 'token',
            address: '0x25d887ce7a35172c62febfd67a1856f20faebb00',
            symbol: 'PEPE',
            name: 'Pepe',
            decimals: 18,
            chainId: 42161,
            balance: '568013.300780982071882412',
            accountAddress:
              'eip155:42161:0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
          },
        ],
        unprocessedNetworks: [],
      };

      mockFetchMultiChainBalancesV4.mockResolvedValue(highPrecisionResponse);

      const result = await balanceFetcher.fetch({
        chainIds: ['0xa4b1' as ChainIdHex], // Arbitrum
        queryAllAccounts: false,
        selectedAccount:
          '0xd8da6bf26964af9d7eed9e03e53415d37aa96045' as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      expect(result.balances).toHaveLength(2); // PEPE token + native token guarantee

      const pepeBalance = result.balances.find(
        (res) => res.token === '0x25d887ce7a35172c62febfd67a1856f20faebb00',
      );
      expect(pepeBalance).toBeDefined();
      expect(pepeBalance?.success).toBe(true);

      // Expected: 568013.300780982071882412 with 18 decimals
      // = 568013300780982071882412 (no precision loss)
      expect(pepeBalance?.value).toStrictEqual(
        new BN('568013300780982071882412'),
      );
    });

    it('should handle balances with fewer decimal places than token decimals', async () => {
      const responseWithShortDecimals: GetBalancesResponse = {
        count: 1,
        balances: [
          {
            object: 'token',
            address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
            symbol: 'DAI',
            name: 'Dai',
            decimals: 18,
            chainId: 1,
            balance: '100.5', // Only 1 decimal place, needs padding
            accountAddress:
              'eip155:1:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
          },
        ],
        unprocessedNetworks: [],
      };

      mockFetchMultiChainBalancesV4.mockResolvedValue(
        responseWithShortDecimals,
      );

      const result = await balanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      const daiBalance = result.balances.find(
        (res) => res.token === '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      );
      expect(daiBalance?.success).toBe(true);

      // Expected: 100.5 with 18 decimals = 100500000000000000000
      expect(daiBalance?.value).toStrictEqual(new BN('100500000000000000000'));
    });

    it('should handle balances with no decimal places', async () => {
      const responseWithIntegerBalance: GetBalancesResponse = {
        count: 1,
        balances: [
          {
            object: 'token',
            address: '0xA0b86a33E6441c86c33E1C6B9cD964c0BA2A86B',
            symbol: 'USDC',
            name: 'USD Coin',
            decimals: 6,
            chainId: 1,
            balance: '1000', // No decimal point
            accountAddress:
              'eip155:1:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
          },
        ],
        unprocessedNetworks: [],
      };

      mockFetchMultiChainBalancesV4.mockResolvedValue(
        responseWithIntegerBalance,
      );

      const result = await balanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      const usdcBalance = result.balances.find(
        (res) => res.token === '0xA0b86a33E6441c86c33E1C6B9cD964c0BA2A86B',
      );
      expect(usdcBalance?.success).toBe(true);

      // Expected: 1000 with 6 decimals = 1000000000
      expect(usdcBalance?.value).toStrictEqual(new BN('1000000000'));
    });

    it('should handle balances with more decimal places than token decimals', async () => {
      const responseWithExtraDecimals: GetBalancesResponse = {
        count: 1,
        balances: [
          createMockERCTokenBalance({
            address: '0xA0b86a33E6441c86c33E1C6B9cD964c0BA2A86B',
            symbol: 'USDC',
            name: 'USD Coin',
            decimals: 6,
            balance: '100.1234567890123', // 13 decimal places, token has 6
          }),
        ],
        unprocessedNetworks: [],
      };

      mockFetchMultiChainBalancesV4.mockResolvedValue(
        responseWithExtraDecimals,
      );

      const result = await balanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      const usdcBalance = result.balances.find(
        (res) => res.token === '0xA0b86a33E6441c86c33E1C6B9cD964c0BA2A86B',
      );
      expect(usdcBalance?.success).toBe(true);

      // Expected: 100.1234567890123 truncated to 6 decimals = 100.123456 = 100123456
      expect(usdcBalance?.value).toStrictEqual(new BN('100123456'));
    });

    it('should handle very large numbers with high precision', async () => {
      const responseWithLargeNumber: GetBalancesResponse = {
        count: 1,
        balances: [
          createMockERCTokenBalance({
            address: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
            symbol: 'SHIB',
            name: 'Shiba Inu',
            balance: '123456789123456789.123456789123456789', // Very large with high precision
          }),
        ],
        unprocessedNetworks: [],
      };

      mockFetchMultiChainBalancesV4.mockResolvedValue(responseWithLargeNumber);

      const result = await balanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      const shibBalance = result.balances.find(
        (res) => res.token === '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
      );
      expect(shibBalance?.success).toBe(true);

      // Expected: 123456789123456789.123456789123456789 with 18 decimals
      // = 123456789123456789123456789123456789
      expect(shibBalance?.value).toStrictEqual(
        new BN('123456789123456789123456789123456789'),
      );
    });

    it('should handle zero balances correctly', async () => {
      const responseWithZeroBalance: GetBalancesResponse = {
        count: 1,
        balances: [createMockERCTokenBalance({ name: 'Dai', balance: '0' })],
        unprocessedNetworks: [],
      };

      mockFetchMultiChainBalancesV4.mockResolvedValue(responseWithZeroBalance);

      const result = await balanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      const daiBalance = result.balances.find(
        (res) => res.token === '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      );
      expect(daiBalance?.success).toBe(true);
      expect(daiBalance?.value).toStrictEqual(new BN('0'));
    });

    it('should handle balance starting with decimal point', async () => {
      const responseWithDecimalStart: GetBalancesResponse = {
        count: 1,
        balances: [
          createMockERCTokenBalance({
            name: 'Dai',
            balance: '.123456789', // Starts with decimal point
          }),
        ],
        unprocessedNetworks: [],
      };

      mockFetchMultiChainBalancesV4.mockResolvedValue(responseWithDecimalStart);

      const result = await balanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      const daiBalance = result.balances.find(
        (res) => res.token === '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      );
      expect(daiBalance?.success).toBe(true);

      // Expected: .123456789 with 18 decimals = 0.123456789000000000 = 123456789000000000
      expect(daiBalance?.value).toStrictEqual(new BN('123456789000000000'));
    });

    it('should maintain precision compared to old floating-point method', async () => {
      // This test demonstrates that the new method maintains precision where the old method would fail
      const precisionTestResponse: GetBalancesResponse = {
        count: 1,
        balances: [
          createMockERCTokenBalance({
            name: 'Dai',
            balance: '1234567890123456.123456789012345678', // High precision that would cause floating-point issues
          }),
        ],
        unprocessedNetworks: [],
      };

      mockFetchMultiChainBalancesV4.mockResolvedValue(precisionTestResponse);

      const result = await balanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      const daiBalance = result.balances.find(
        (res) => res.token === '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      );
      expect(daiBalance?.success).toBe(true);

      // New method: 1234567890123456.123456789012345678 with 18 decimals
      // = 1234567890123456 + 123456789012345678 = 1234567890123456123456789012345678
      expect(daiBalance?.value).toStrictEqual(
        new BN('1234567890123456123456789012345678'),
      );

      // Old method would have precision loss due to JavaScript floating-point limitations
      const oldMethodCalculation =
        parseFloat('1234567890123456.123456789012345678') * 10 ** 18;

      // The new method should maintain all digits precisely, while old method loses precision
      // We can verify this by checking that our result has the expected exact digits
      expect(daiBalance?.value?.toString()).toBe(
        '1234567890123456123456789012345678',
      );

      // And verify that the old method would produce different (less precise) results
      expect(oldMethodCalculation.toString()).toContain('e+'); // Should be in scientific notation
    });

    it('should handle balance string with only integer part', async () => {
      // Test the default destructuring values when balance has no decimal point
      const responseWithZeroBalance: GetBalancesResponse = {
        count: 1,
        balances: [
          createMockNativeTokenBalance({
            balance: '0', // Just "0", no decimal point - tests integerPart='0', decimalPart=''
          }),
        ],
        unprocessedNetworks: [],
      };

      mockFetchMultiChainBalancesV4.mockResolvedValue(responseWithZeroBalance);

      const result = await balanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      const ethBalance = result.balances.find(
        (res) => res.token === ZERO_ADDRESS,
      );
      expect(ethBalance?.success).toBe(true);
      expect(ethBalance?.value).toStrictEqual(new BN('0'));
    });

    it('should accumulate balances correctly in batch processing', async () => {
      // This test explicitly verifies balances from multiple batches are combined correctly
      const largeAccountList: InternalAccount[] = [];
      const caipAddresses: string[] = [];

      // Create 60 accounts to force batching (50 per batch)
      for (let i = 0; i < 60; i++) {
        const address = `0x${i.toString(16).padStart(40, '0')}` as const;
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

      // Mock batching behavior
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

          // First batch: workingResult will be [] (initialResult)
          let result = await eachBatch(initialResult, batch1, 0);
          // Second batch: workingResult will be the result from batch1å
          result = await eachBatch(result, batch2, 1);

          return result;
        },
      );

      const batch1Response: GetBalancesResponse = {
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
            accountAddress: `eip155:1:${caipAddresses[0].split(':')[2]}`,
          },
        ],
        unprocessedNetworks: [],
      };

      const batch2Response: GetBalancesResponse = {
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
            accountAddress: `eip155:1:${caipAddresses[50].split(':')[2]}`,
          },
        ],
        unprocessedNetworks: [],
      };

      mockFetchMultiChainBalancesV4
        .mockResolvedValueOnce(batch1Response)
        .mockResolvedValueOnce(batch2Response);

      const result = await balanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: true,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: largeAccountList,
      });

      // Should have called API twice (2 batches)
      expect(mockFetchMultiChainBalancesV4).toHaveBeenCalledTimes(2);

      // Should have balances from both batches accumulated
      // The batching logic combines results from multiple API calls
      const ethBalances = result.balances.filter(
        (res) => res.token === ZERO_ADDRESS,
      );

      // Should have at least 2 native token balances (from both batches + guarantees for all accounts)
      expect(ethBalances.length).toBeGreaterThanOrEqual(2);

      // Verify that we have successful balance entries
      const successfulBalances = ethBalances.filter((b) => b.success);
      expect(successfulBalances.length).toBeGreaterThan(0);
    });

    it('should handle falsy workingResult in batch accumulation', async () => {
      // This test explicitly covers the "|| []" fallback
      // when workingResult is undefined/null (first batch)
      const largeAccountList: InternalAccount[] = [];
      const caipAddresses: string[] = [];

      // Create 55 accounts to force batching
      for (let i = 0; i < 55; i++) {
        const address = `0x${i.toString(16).padStart(40, '0')}` as const;
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

      // Mock batching to pass undefined/null as workingResult for first batch
      mockReduceInBatchesSerially.mockImplementation(
        async ({
          eachBatch,
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

          // Pass undefined as first argument to test "|| []" branch
          // This simulates the case where workingResult might be undefined
          let result = await eachBatch(undefined, batch1, 0);
          result = await eachBatch(result, batch2, 1);

          return result;
        },
      );

      const batch1Response: GetBalancesResponse = {
        count: 1,
        balances: [
          {
            object: 'token',
            address: '0x0000000000000000000000000000000000000000',
            symbol: 'ETH',
            name: 'Ether',
            decimals: 18,
            chainId: 1,
            balance: '5.0',
            accountAddress: `eip155:1:${caipAddresses[0].split(':')[2]}`,
          },
        ],
        unprocessedNetworks: [],
      };

      const batch2Response: GetBalancesResponse = {
        count: 1,
        balances: [
          {
            object: 'token',
            address: '0x0000000000000000000000000000000000000000',
            symbol: 'ETH',
            name: 'Ether',
            decimals: 18,
            chainId: 1,
            balance: '10.0',
            accountAddress: `eip155:1:${caipAddresses[50].split(':')[2]}`,
          },
        ],
        unprocessedNetworks: [],
      };

      mockFetchMultiChainBalancesV4
        .mockResolvedValueOnce(batch1Response)
        .mockResolvedValueOnce(batch2Response);

      const result = await balanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: true,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: largeAccountList,
      });

      // When workingResult is undefined, it uses [] via the "|| []" fallback
      expect(mockFetchMultiChainBalancesV4).toHaveBeenCalledTimes(2);

      // Should still have balances from both batches despite undefined workingResult
      const ethBalances = result.balances.filter(
        (res) => res.token === ZERO_ADDRESS,
      );
      expect(ethBalances.length).toBeGreaterThan(0);
    });

    it('should throw error when API fails (safelyExecuteWithTimeout returns undefined)', async () => {
      const mockApiError = new Error('Complete API failure');

      // Mock fetchMultiChainBalancesV4 to throw - safelyExecuteWithTimeout will catch and return undefined
      mockFetchMultiChainBalancesV4.mockRejectedValue(mockApiError);

      // Create a balance fetcher WITHOUT staking provider
      const balanceFetcherNoStaking = new AccountsApiBalanceFetcher(
        'extension',
      );

      // Should throw immediately when apiResponse is undefined
      await expect(
        balanceFetcherNoStaking.fetch({
          chainIds: [MOCK_CHAIN_ID],
          queryAllAccounts: false,
          selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
          allAccounts: MOCK_INTERNAL_ACCOUNTS,
        }),
      ).rejects.toThrow('Accounts API request timed out or failed');
    });
  });
});
