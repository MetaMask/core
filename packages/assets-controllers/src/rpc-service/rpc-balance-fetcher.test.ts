import type { Web3Provider } from '@ethersproject/providers';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { NetworkClient } from '@metamask/network-controller';
import BN from 'bn.js';

import {
  RpcBalanceFetcher,
  type ChainIdHex,
  type ChecksumAddress,
} from './rpc-balance-fetcher';
import type { TokensControllerState } from '../TokensController';

const MOCK_ADDRESS_1 = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const MOCK_ADDRESS_2 = '0x742d35cc6675c4f17f41140100aa83a4b1fa4c82';
const MOCK_TOKEN_ADDRESS_1 = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
const MOCK_TOKEN_ADDRESS_2 = '0xA0b86a33E6441c86c33E1C6B9cD964c0BA2A86B';
const MOCK_CHAIN_ID = '0x1' as ChainIdHex;
const MOCK_CHAIN_ID_2 = '0x89' as ChainIdHex;
const ZERO_ADDRESS =
  '0x0000000000000000000000000000000000000000' as ChecksumAddress;
const STAKING_CONTRACT_ADDRESS =
  '0x4FEF9D741011476750A243aC70b9789a63dd47Df' as ChecksumAddress;

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

const MOCK_TOKENS_STATE: {
  allTokens: TokensControllerState['allTokens'];
  allDetectedTokens: TokensControllerState['allDetectedTokens'];
} = {
  allTokens: {
    [MOCK_CHAIN_ID]: {
      [MOCK_ADDRESS_1]: [
        {
          address: MOCK_TOKEN_ADDRESS_1,
          decimals: 18,
          symbol: 'DAI',
          name: 'Dai Stablecoin',
        },
      ],
      [MOCK_ADDRESS_2]: [
        {
          address: MOCK_TOKEN_ADDRESS_2,
          decimals: 6,
          symbol: 'USDC',
          name: 'USD Coin',
        },
      ],
    },
    [MOCK_CHAIN_ID_2]: {
      [MOCK_ADDRESS_1]: [
        {
          address: MOCK_TOKEN_ADDRESS_1,
          decimals: 18,
          symbol: 'DAI',
          name: 'Dai Stablecoin',
        },
      ],
    },
  },
  allDetectedTokens: {
    [MOCK_CHAIN_ID]: {
      [MOCK_ADDRESS_1]: [
        {
          address: MOCK_TOKEN_ADDRESS_2,
          decimals: 6,
          symbol: 'USDC',
          name: 'USD Coin (Detected)',
        },
      ],
    },
  },
};

const MOCK_TOKEN_BALANCES = {
  [MOCK_TOKEN_ADDRESS_1]: {
    [MOCK_ADDRESS_1]: new BN('1000000000000000000'), // 1 DAI
    [MOCK_ADDRESS_2]: new BN('2000000000000000000'), // 2 DAI
  },
  [MOCK_TOKEN_ADDRESS_2]: {
    [MOCK_ADDRESS_1]: new BN('500000000'), // 500 USDC
    [MOCK_ADDRESS_2]: null, // Failed balance
  },
  [ZERO_ADDRESS]: {
    [MOCK_ADDRESS_1]: new BN('3000000000000000000'), // 3 ETH
    [MOCK_ADDRESS_2]: new BN('4000000000000000000'), // 4 ETH
  },
};

const MOCK_STAKED_BALANCES = {
  [MOCK_ADDRESS_1]: new BN('5000000000000000000'), // 5 ETH staked
  [MOCK_ADDRESS_2]: new BN('6000000000000000000'), // 6 ETH staked
};

// Mock the imports
jest.mock('@metamask/controller-utils', () => ({
  toChecksumHexAddress: jest.fn(),
}));

jest.mock('../multicall', () => ({
  getTokenBalancesForMultipleAddresses: jest.fn(),
}));

const mockToChecksumHexAddress = jest.requireMock(
  '@metamask/controller-utils',
).toChecksumHexAddress;
const mockGetTokenBalancesForMultipleAddresses =
  jest.requireMock('../multicall').getTokenBalancesForMultipleAddresses;

describe('RpcBalanceFetcher', () => {
  let rpcBalanceFetcher: RpcBalanceFetcher;
  let mockProvider: jest.Mocked<Web3Provider>;
  let mockGetProvider: jest.Mock;
  let mockGetNetworkClient: jest.Mock;
  let mockGetTokensState: jest.Mock;
  let mockNetworkClient: jest.Mocked<NetworkClient>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock provider
    mockProvider = {
      send: jest.fn(),
    } as unknown as jest.Mocked<Web3Provider>;

    // Setup mock network client
    mockNetworkClient = {
      blockTracker: {
        checkForLatestBlock: jest.fn().mockResolvedValue(undefined),
      },
    } as unknown as jest.Mocked<NetworkClient>;

    // Setup mock functions
    mockGetProvider = jest.fn().mockReturnValue(mockProvider);
    mockGetNetworkClient = jest.fn().mockReturnValue(mockNetworkClient);
    mockGetTokensState = jest.fn().mockReturnValue(MOCK_TOKENS_STATE);

    // Setup mock implementations
    mockToChecksumHexAddress.mockImplementation((address: string) => {
      // Properly checksum the staking contract address for tests
      if (
        address.toLowerCase() === '0x4fef9d741011476750a243ac70b9789a63dd47df'
      ) {
        return '0x4FEF9D741011476750A243aC70b9789a63dd47Df';
      }
      // For other addresses, use the actual implementation
      const { toChecksumHexAddress } = jest.requireActual(
        '@metamask/controller-utils',
      );
      return toChecksumHexAddress(address);
    });

    mockGetTokenBalancesForMultipleAddresses.mockResolvedValue({
      tokenBalances: MOCK_TOKEN_BALANCES,
      stakedBalances: MOCK_STAKED_BALANCES,
    });

    mockProvider.send.mockResolvedValue('0x12345'); // Mock block number

    rpcBalanceFetcher = new RpcBalanceFetcher(
      mockGetProvider,
      mockGetNetworkClient,
      mockGetTokensState,
    );
  });

  describe('constructor', () => {
    it('should create instance with provider, network client, and tokens state getters', () => {
      expect(rpcBalanceFetcher).toBeInstanceOf(RpcBalanceFetcher);
    });
  });

  describe('supports', () => {
    it('should always return true (fallback provider)', () => {
      expect(rpcBalanceFetcher.supports()).toBe(true);
    });
  });

  describe('fetch', () => {
    it('should return empty array when no chain IDs are provided', async () => {
      const result = await rpcBalanceFetcher.fetch({
        chainIds: [],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      expect(result).toStrictEqual([]);
      expect(mockGetTokensState).not.toHaveBeenCalled();
      expect(mockGetProvider).not.toHaveBeenCalled();
    });

    it('should fetch balances for selected account only', async () => {
      // Use a simpler tokens state for this test
      const simpleTokensState = {
        allTokens: {
          [MOCK_CHAIN_ID]: {
            [MOCK_ADDRESS_1]: [
              {
                address: MOCK_TOKEN_ADDRESS_1,
                decimals: 18,
                symbol: 'DAI',
                name: 'Dai Stablecoin',
              },
            ],
          },
        },
        allDetectedTokens: {},
      };
      mockGetTokensState.mockReturnValue(simpleTokensState);

      const result = await rpcBalanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      expect(mockGetTokensState).toHaveBeenCalled();
      expect(mockGetProvider).toHaveBeenCalledWith(MOCK_CHAIN_ID);
      expect(mockGetNetworkClient).toHaveBeenCalledWith(MOCK_CHAIN_ID);
      expect(
        mockNetworkClient.blockTracker.checkForLatestBlock,
      ).toHaveBeenCalled();
      expect(mockGetTokenBalancesForMultipleAddresses).toHaveBeenCalledWith(
        [
          {
            accountAddress: MOCK_ADDRESS_1,
            tokenAddresses: [MOCK_TOKEN_ADDRESS_1, ZERO_ADDRESS],
          },
        ],
        MOCK_CHAIN_ID,
        mockProvider,
        true,
        true,
      );

      // Should return all balances from the mock (DAI for both accounts + USDC + ETH for both)
      expect(result.length).toBeGreaterThan(0);

      // Check that we get balances for the selected account
      const address1Balances = result.filter(
        (r) => r.account === MOCK_ADDRESS_1,
      );
      expect(address1Balances.length).toBeGreaterThan(0);
    });

    it('should fetch balances for all accounts when queryAllAccounts is true', async () => {
      const result = await rpcBalanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: true,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      // With queryAllAccounts=true, the function includes native tokens with each account's token group
      expect(mockGetTokenBalancesForMultipleAddresses).toHaveBeenCalledWith(
        [
          {
            accountAddress: MOCK_ADDRESS_1,
            tokenAddresses: [
              MOCK_TOKEN_ADDRESS_1,
              MOCK_TOKEN_ADDRESS_2,
              ZERO_ADDRESS,
            ],
          },
          {
            accountAddress: MOCK_ADDRESS_2,
            tokenAddresses: [MOCK_TOKEN_ADDRESS_2, ZERO_ADDRESS],
          },
        ],
        MOCK_CHAIN_ID,
        mockProvider,
        true,
        true,
      );

      // Should return all balances from the mock
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle multiple chain IDs', async () => {
      await rpcBalanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID, MOCK_CHAIN_ID_2],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      expect(mockGetProvider).toHaveBeenCalledWith(MOCK_CHAIN_ID);
      expect(mockGetProvider).toHaveBeenCalledWith(MOCK_CHAIN_ID_2);
      expect(mockGetTokenBalancesForMultipleAddresses).toHaveBeenCalledTimes(2);
    });

    it('should handle null balances as failed', async () => {
      const result = await rpcBalanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_2 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      // Check that we have failed balances (null values)
      const failedBalances = result.filter((r) => !r.success);
      expect(failedBalances.length).toBeGreaterThan(0);

      // Verify the failed balance structure
      expect(failedBalances[0]).toMatchObject({
        success: false,
        value: null,
        account: expect.any(String),
        token: expect.any(String),
        chainId: MOCK_CHAIN_ID,
      });
    });

    it('should skip chains with no account token groups', async () => {
      // Mock empty tokens state
      mockGetTokensState.mockReturnValue({
        allTokens: {},
        allDetectedTokens: {},
      });

      const result = await rpcBalanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      // Even with no tokens, native token and staked balances will still be processed
      expect(result.length).toBeGreaterThan(0);
      expect(mockGetProvider).toHaveBeenCalled();
      expect(mockGetTokenBalancesForMultipleAddresses).toHaveBeenCalled();
    });

    it('should call blockTracker to ensure latest block', async () => {
      await rpcBalanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      expect(
        mockNetworkClient.blockTracker.checkForLatestBlock,
      ).toHaveBeenCalled();
    });

    it('should handle blockTracker errors gracefully', async () => {
      (
        mockNetworkClient.blockTracker.checkForLatestBlock as jest.Mock
      ).mockRejectedValue(new Error('BlockTracker error'));

      await expect(
        rpcBalanceFetcher.fetch({
          chainIds: [MOCK_CHAIN_ID],
          queryAllAccounts: false,
          selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
          allAccounts: MOCK_INTERNAL_ACCOUNTS,
        }),
      ).rejects.toThrow('BlockTracker error');
    });

    it('should handle multicall errors gracefully', async () => {
      mockGetTokenBalancesForMultipleAddresses.mockRejectedValue(
        new Error('Multicall error'),
      );

      await expect(
        rpcBalanceFetcher.fetch({
          chainIds: [MOCK_CHAIN_ID],
          queryAllAccounts: false,
          selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
          allAccounts: MOCK_INTERNAL_ACCOUNTS,
        }),
      ).rejects.toThrow('Multicall error');
    });
  });

  describe('Token grouping integration (via fetch)', () => {
    it('should handle empty tokens state correctly', async () => {
      mockGetTokensState.mockReturnValue({
        allTokens: {},
        allDetectedTokens: {},
      });

      const result = await rpcBalanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      // Even with no tokens, native token and staked balances will still be processed
      expect(result.length).toBeGreaterThan(0);
      expect(mockGetTokenBalancesForMultipleAddresses).toHaveBeenCalled();
    });

    it('should merge imported and detected tokens correctly', async () => {
      const tokensStateWithBoth = {
        allTokens: {
          [MOCK_CHAIN_ID]: {
            [MOCK_ADDRESS_1]: [
              {
                address: MOCK_TOKEN_ADDRESS_1,
                decimals: 18,
                symbol: 'DAI',
              },
            ],
          },
        },
        allDetectedTokens: {
          [MOCK_CHAIN_ID]: {
            [MOCK_ADDRESS_1]: [
              {
                address: MOCK_TOKEN_ADDRESS_2,
                decimals: 6,
                symbol: 'USDC',
              },
            ],
          },
        },
      };

      mockGetTokensState.mockReturnValue(tokensStateWithBoth);

      await rpcBalanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      expect(mockGetTokenBalancesForMultipleAddresses).toHaveBeenCalledWith(
        [
          {
            accountAddress: MOCK_ADDRESS_1,
            tokenAddresses: [
              MOCK_TOKEN_ADDRESS_1,
              MOCK_TOKEN_ADDRESS_2,
              ZERO_ADDRESS,
            ],
          },
        ],
        MOCK_CHAIN_ID,
        mockProvider,
        true,
        true,
      );
    });

    it('should include native token when queryAllAccounts is true and no other tokens', async () => {
      mockGetTokensState.mockReturnValue({
        allTokens: {},
        allDetectedTokens: {},
      });

      await rpcBalanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: true,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      expect(mockGetTokenBalancesForMultipleAddresses).toHaveBeenCalledWith(
        [
          {
            accountAddress: MOCK_ADDRESS_1,
            tokenAddresses: [ZERO_ADDRESS],
          },
          {
            accountAddress: MOCK_ADDRESS_2,
            tokenAddresses: [ZERO_ADDRESS],
          },
        ],
        MOCK_CHAIN_ID,
        mockProvider,
        true,
        true,
      );
    });

    it('should filter to selected account only when queryAllAccounts is false', async () => {
      const tokensStateMultipleAccounts = {
        allTokens: {
          [MOCK_CHAIN_ID]: {
            [MOCK_ADDRESS_1]: [
              {
                address: MOCK_TOKEN_ADDRESS_1,
                decimals: 18,
                symbol: 'DAI',
              },
            ],
            [MOCK_ADDRESS_2]: [
              {
                address: MOCK_TOKEN_ADDRESS_2,
                decimals: 6,
                symbol: 'USDC',
              },
            ],
          },
        },
        allDetectedTokens: {},
      };

      mockGetTokensState.mockReturnValue(tokensStateMultipleAccounts);

      await rpcBalanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      expect(mockGetTokenBalancesForMultipleAddresses).toHaveBeenCalledWith(
        [
          {
            accountAddress: MOCK_ADDRESS_1,
            tokenAddresses: [MOCK_TOKEN_ADDRESS_1, ZERO_ADDRESS],
          },
        ],
        MOCK_CHAIN_ID,
        mockProvider,
        true,
        true,
      );
    });

    it('should handle duplicate tokens in the same group', async () => {
      const tokensStateWithDuplicates = {
        allTokens: {
          [MOCK_CHAIN_ID]: {
            [MOCK_ADDRESS_1]: [
              {
                address: MOCK_TOKEN_ADDRESS_1,
                decimals: 18,
                symbol: 'DAI',
              },
            ],
          },
        },
        allDetectedTokens: {
          [MOCK_CHAIN_ID]: {
            [MOCK_ADDRESS_1]: [
              {
                address: MOCK_TOKEN_ADDRESS_1, // Same token as in imported
                decimals: 18,
                symbol: 'DAI',
              },
            ],
          },
        },
      };

      mockGetTokensState.mockReturnValue(tokensStateWithDuplicates);

      await rpcBalanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      // Should include duplicate tokens (this tests the actual behavior)
      expect(mockGetTokenBalancesForMultipleAddresses).toHaveBeenCalledWith(
        [
          {
            accountAddress: MOCK_ADDRESS_1,
            tokenAddresses: [
              MOCK_TOKEN_ADDRESS_1,
              MOCK_TOKEN_ADDRESS_1,
              ZERO_ADDRESS,
            ],
          },
        ],
        MOCK_CHAIN_ID,
        mockProvider,
        true,
        true,
      );
    });
  });

  describe('staked balance functionality', () => {
    it('should include staked balances in results when returned by multicall', async () => {
      const result = await rpcBalanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      // Should include staked balance for the selected account only (queryAllAccounts: false)
      const stakingResults = result.filter(
        (r) => r.token === STAKING_CONTRACT_ADDRESS,
      );
      const stakedBalance1 = stakingResults.find(
        (r) => r.account === MOCK_ADDRESS_1,
      );

      expect(stakedBalance1).toBeDefined();
      expect(stakedBalance1?.success).toBe(true);
      expect(stakedBalance1?.value).toStrictEqual(
        MOCK_STAKED_BALANCES[MOCK_ADDRESS_1],
      );

      // Should not include staked balance for other accounts when queryAllAccounts: false
      const stakedBalance2 = stakingResults.find(
        (r) => r.account === MOCK_ADDRESS_2,
      );
      expect(stakedBalance2).toBeUndefined();
    });

    it('should include zero staked balance entry when no staked balance is returned', async () => {
      // Mock multicall to return no staked balances
      mockGetTokenBalancesForMultipleAddresses.mockResolvedValue({
        tokenBalances: MOCK_TOKEN_BALANCES,
        stakedBalances: {},
      });

      const result = await rpcBalanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      // Should still include staked balance entries with zero values
      const stakingResults = result.filter(
        (r) => r.token === STAKING_CONTRACT_ADDRESS,
      );
      const stakedBalance = stakingResults.find(
        (r) => r.account === MOCK_ADDRESS_1,
      );

      expect(stakedBalance).toBeDefined();
      expect(stakedBalance?.success).toBe(true);
      expect(stakedBalance?.value).toStrictEqual(new BN('0'));
    });

    it('should handle staked balances with queryAllAccounts', async () => {
      const result = await rpcBalanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: true,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      // Should include staked balances for all accounts when queryAllAccounts: true
      const stakedBalances = result.filter(
        (r) => r.token === STAKING_CONTRACT_ADDRESS,
      );

      expect(stakedBalances).toHaveLength(2);

      const stakedBalance1 = stakedBalances.find(
        (r) => r.account === MOCK_ADDRESS_1,
      );
      const stakedBalance2 = stakedBalances.find(
        (r) => r.account === MOCK_ADDRESS_2,
      );

      expect(stakedBalance1?.value).toStrictEqual(
        MOCK_STAKED_BALANCES[MOCK_ADDRESS_1],
      );
      expect(stakedBalance2?.value).toStrictEqual(
        MOCK_STAKED_BALANCES[MOCK_ADDRESS_2],
      );
    });

    it('should handle unsupported chains gracefully (no staking)', async () => {
      const result = await rpcBalanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID_2], // Polygon - no staking support
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      // Should not include any staking balances for unsupported chains
      const stakedBalances = result.filter(
        (r) => r.token === STAKING_CONTRACT_ADDRESS,
      );

      expect(stakedBalances).toHaveLength(0);
    });
  });

  describe('native token always included', () => {
    it('should always include native token entry for selected account even when balance is zero', async () => {
      // Mock multicall to return no native balance
      const tokensWithoutNative = { ...MOCK_TOKEN_BALANCES };
      delete tokensWithoutNative[ZERO_ADDRESS];

      mockGetTokenBalancesForMultipleAddresses.mockResolvedValue({
        tokenBalances: tokensWithoutNative,
        stakedBalances: MOCK_STAKED_BALANCES,
      });

      const result = await rpcBalanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: false,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      // Should still include native token entry with zero value
      const nativeResults = result.filter((r) => r.token === ZERO_ADDRESS);
      const nativeBalance = nativeResults.find(
        (r) => r.account === MOCK_ADDRESS_1,
      );

      expect(nativeBalance).toBeDefined();
      expect(nativeBalance?.success).toBe(true);
      expect(nativeBalance?.value).toStrictEqual(new BN('0'));
    });

    it('should include native token for all accounts when queryAllAccounts is true', async () => {
      const result = await rpcBalanceFetcher.fetch({
        chainIds: [MOCK_CHAIN_ID],
        queryAllAccounts: true,
        selectedAccount: MOCK_ADDRESS_1 as ChecksumAddress,
        allAccounts: MOCK_INTERNAL_ACCOUNTS,
      });

      // Should include native balances for all accounts
      const nativeBalances = result.filter((r) => r.token === ZERO_ADDRESS);

      expect(nativeBalances).toHaveLength(2);

      const nativeBalance1 = nativeBalances.find(
        (r) => r.account === MOCK_ADDRESS_1,
      );
      const nativeBalance2 = nativeBalances.find(
        (r) => r.account === MOCK_ADDRESS_2,
      );

      expect(nativeBalance1?.value).toStrictEqual(
        MOCK_TOKEN_BALANCES[ZERO_ADDRESS][MOCK_ADDRESS_1],
      );
      expect(nativeBalance2?.value).toStrictEqual(
        MOCK_TOKEN_BALANCES[ZERO_ADDRESS][MOCK_ADDRESS_2],
      );
    });
  });
});
