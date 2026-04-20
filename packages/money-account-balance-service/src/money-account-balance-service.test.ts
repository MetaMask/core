import { Contract } from '@ethersproject/contracts';
import { Web3Provider } from '@ethersproject/providers';
import { DEFAULT_MAX_RETRIES, HttpError } from '@metamask/controller-utils';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import nock, { cleanAll as nockCleanAll } from 'nock';

import { VedaResponseValidationError } from './errors';
import type { MoneyAccountBalanceServiceMessenger } from './money-account-balance-service';
import {
  MoneyAccountBalanceService,
  serviceName,
} from './money-account-balance-service';

jest.mock('@ethersproject/contracts');
jest.mock('@ethersproject/providers');

const MockContract = Contract as jest.MockedClass<typeof Contract>;
const MockWeb3Provider = Web3Provider as jest.MockedClass<typeof Web3Provider>;

// ============================================================
// Fixtures
// ============================================================

const MOCK_VAULT_ADDRESS =
  '0xVaultAddress000000000000000000000000000000' as const;
const MOCK_ACCOUNTANT_ADDRESS =
  '0xAccountantAddr000000000000000000000000000' as const;
const MOCK_UNDERLYING_TOKEN_ADDRESS =
  '0xMusdAddress0000000000000000000000000000000' as const;
const MOCK_ACCOUNT_ADDRESS =
  '0xUserAccount0000000000000000000000000000000' as const;
const MOCK_NETWORK_CLIENT_ID = 'arbitrum-mainnet';

const DEFAULT_CONFIG = {
  vaultAddress: MOCK_VAULT_ADDRESS,
  vaultChainId: '0xa4b1' as const,
  accountantAddress: MOCK_ACCOUNTANT_ADDRESS,
  underlyingTokenAddress: MOCK_UNDERLYING_TOKEN_ADDRESS,
  underlyingTokenDecimals: 6,
};

const MOCK_NETWORK_CONFIG = {
  chainId: '0xa4b1' as const,
  rpcEndpoints: [
    {
      networkClientId: MOCK_NETWORK_CLIENT_ID,
      url: 'https://arb1.arbitrum.io/rpc',
    },
  ],
  defaultRpcEndpointIndex: 0,
  name: 'Arbitrum One',
  nativeCurrency: 'ETH',
  blockExplorerUrls: [],
};

// A bare object suffices — Web3Provider and Contract are mocked at the module level.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MOCK_PROVIDER = {} as any;

const MOCK_VAULT_APY_RAW_RESPONSE = {
  Response: {
    aggregation_period: '7 days',
    apy: 0.055,
    chain_allocation: { arbitrum: 1.0 },
    fees: 0.005,
    global_apy_breakdown: {
      fee: 0.005,
      maturity_apy: 0.03,
      real_apy: 0.05,
    },
    performance_fees: 0.001,
    real_apy_breakdown: [
      {
        allocation: 1.0,
        apy: 0.055,
        apy_net: 0.05,
        chain: 'arbitrum',
        protocol: 'aave',
      },
    ],
    timestamp: '2024-01-01T00:00:00Z',
  },
};

const MOCK_VAULT_APY_NORMALIZED = {
  aggregationPeriod: '7 days',
  apy: 0.055,
  chainAllocation: { arbitrum: 1.0 },
  fees: 0.005,
  globalApyBreakdown: {
    fee: 0.005,
    maturityApy: 0.03,
    realApy: 0.05,
  },
  performanceFees: 0.001,
  realApyBreakdown: [
    {
      allocation: 1.0,
      apy: 0.055,
      apyNet: 0.05,
      chain: 'arbitrum',
      protocol: 'aave',
    },
  ],
  timestamp: '2024-01-01T00:00:00Z',
};

// ============================================================
// Messenger helpers
// ============================================================

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<MoneyAccountBalanceServiceMessenger>,
  MessengerEvents<MoneyAccountBalanceServiceMessenger>
>;

function createRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

function createServiceMessenger(
  rootMessenger: RootMessenger,
): MoneyAccountBalanceServiceMessenger {
  return new Messenger({
    namespace: serviceName,
    parent: rootMessenger,
  });
}

// ============================================================
// Factory
// ============================================================

/**
 * Builds the service under test with messenger action stubs for the two
 * NetworkController dependencies.
 *
 * @param args - Optional overrides for the service constructor options.
 * @param args.options - Partial constructor options merged over {@link DEFAULT_CONFIG}.
 * @returns The constructed service together with messenger instances and mock stubs.
 */
function createService({
  options = {},
}: {
  options?: Partial<
    ConstructorParameters<typeof MoneyAccountBalanceService>[0]
  >;
} = {}): {
  service: MoneyAccountBalanceService;
  rootMessenger: RootMessenger;
  messenger: MoneyAccountBalanceServiceMessenger;
  mockGetNetworkConfig: jest.Mock;
  mockGetNetworkClient: jest.Mock;
} {
  const rootMessenger = createRootMessenger();
  const messenger = createServiceMessenger(rootMessenger);

  const mockGetNetworkConfig = jest.fn().mockReturnValue(MOCK_NETWORK_CONFIG);
  const mockGetNetworkClient = jest.fn().mockReturnValue({
    provider: MOCK_PROVIDER,
  });

  rootMessenger.registerActionHandler(
    'NetworkController:getNetworkConfigurationByChainId',
    mockGetNetworkConfig,
  );
  rootMessenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    mockGetNetworkClient,
  );

  rootMessenger.delegate({
    actions: [
      'NetworkController:getNetworkConfigurationByChainId',
      'NetworkController:getNetworkClientById',
    ],
    events: [],
    messenger,
  });

  const service = new MoneyAccountBalanceService({
    messenger,
    ...DEFAULT_CONFIG,
    ...options,
  });

  return {
    service,
    rootMessenger,
    messenger,
    mockGetNetworkConfig,
    mockGetNetworkClient,
  };
}

/**
 * Configures the Contract mock so that `balanceOf` resolves to an object
 * whose `.toString()` returns `balance`.
 *
 * @param balance - The raw uint256 balance string to return.
 */
function mockErc20BalanceOf(balance: string): void {
  MockContract.mockImplementation(
    () =>
      ({
        balanceOf: jest.fn().mockResolvedValue({ toString: () => balance }),
      }) as unknown as Contract,
  );
}

/**
 * Configures the Contract mock so that `getRate` resolves to an object
 * whose `.toString()` returns `rate`.
 *
 * @param rate - The raw uint256 rate string to return.
 */
function mockAccountantGetRate(rate: string): void {
  MockContract.mockImplementation(
    () =>
      ({
        getRate: jest.fn().mockResolvedValue({ toString: () => rate }),
      }) as unknown as Contract,
  );
}

/**
 * Configures the Contract mock to route calls to the correct contract method
 * based on the address. Used when `getMusdEquivalentValue` creates two
 * contracts in the same call — the vault (balanceOf) and the accountant
 * (getRate).
 *
 * @param vaultBalance - The raw uint256 balance string for the vault share contract.
 * @param exchangeRate - The raw uint256 rate string for the accountant contract.
 */
function mockContractsByAddress(
  vaultBalance: string,
  exchangeRate: string,
): void {
  const contractMocksByAddress: Record<string, Partial<Contract>> = {
    [MOCK_VAULT_ADDRESS]: {
      balanceOf: jest.fn().mockResolvedValue({ toString: () => vaultBalance }),
    },
    [MOCK_ACCOUNTANT_ADDRESS]: {
      getRate: jest.fn().mockResolvedValue({ toString: () => exchangeRate }),
    },
  };

  MockContract.mockImplementation(
    (address) => contractMocksByAddress[address] as unknown as Contract,
  );
}

// ============================================================
// Tests
// ============================================================

describe('MoneyAccountBalanceService', () => {
  beforeEach(() => {
    MockWeb3Provider.mockImplementation(() => ({}) as unknown as Web3Provider);
    nockCleanAll();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  // ----------------------------------------------------------
  // getMusdBalance
  // ----------------------------------------------------------

  describe('getMusdBalance', () => {
    it('returns the mUSD balance for the given address', async () => {
      mockErc20BalanceOf('5000000');
      const { service } = createService();

      const result = await service.getMusdBalance(MOCK_ACCOUNT_ADDRESS);

      expect(result).toStrictEqual({ balance: '5000000' });
    });

    it('calls balanceOf on the underlying token contract, not the vault', async () => {
      mockErc20BalanceOf('5000000');
      const { service } = createService();

      await service.getMusdBalance(MOCK_ACCOUNT_ADDRESS);

      expect(MockContract).toHaveBeenCalledWith(
        MOCK_UNDERLYING_TOKEN_ADDRESS,
        expect.anything(),
        expect.anything(),
      );
      expect(MockContract).not.toHaveBeenCalledWith(
        MOCK_VAULT_ADDRESS,
        expect.anything(),
        expect.anything(),
      );
    });

    it('is also callable via the messenger action', async () => {
      mockErc20BalanceOf('5000000');
      const { rootMessenger } = createService();

      const result = await rootMessenger.call(
        'MoneyAccountBalanceService:getMusdBalance',
        MOCK_ACCOUNT_ADDRESS,
      );

      expect(result).toStrictEqual({ balance: '5000000' });
    });

    it('throws if no network configuration is found for the vault chain', async () => {
      const { service, mockGetNetworkConfig } = createService();
      mockGetNetworkConfig.mockReturnValue(undefined);

      await expect(
        service.getMusdBalance(MOCK_ACCOUNT_ADDRESS),
      ).rejects.toThrow('No network configuration found for chain 0xa4b1');
    });

    it('throws if the network client has no provider', async () => {
      const { service, mockGetNetworkClient } = createService();
      mockGetNetworkClient.mockReturnValue({ provider: null });

      await expect(
        service.getMusdBalance(MOCK_ACCOUNT_ADDRESS),
      ).rejects.toThrow('No provider found for chain 0xa4b1');
    });

    it('uses the network client at defaultRpcEndpointIndex, not always index 0', async () => {
      mockErc20BalanceOf('1000000');
      const { service, mockGetNetworkConfig, mockGetNetworkClient } =
        createService();
      mockGetNetworkConfig.mockReturnValue({
        ...MOCK_NETWORK_CONFIG,
        rpcEndpoints: [
          {
            networkClientId: 'client-at-index-0',
            url: 'https://rpc0.example.com',
          },
          {
            networkClientId: 'client-at-index-1',
            url: 'https://rpc1.example.com',
          },
        ],
        defaultRpcEndpointIndex: 1,
      });

      await service.getMusdBalance(MOCK_ACCOUNT_ADDRESS);

      expect(mockGetNetworkClient).toHaveBeenCalledWith('client-at-index-1');
      expect(mockGetNetworkClient).not.toHaveBeenCalledWith(
        'client-at-index-0',
      );
    });
  });

  // ----------------------------------------------------------
  // getMusdSHFvdBalance
  // ----------------------------------------------------------

  describe('getMusdSHFvdBalance', () => {
    it('returns the vault share balance for the given address', async () => {
      mockErc20BalanceOf('3000000');
      const { service } = createService();

      const result = await service.getMusdSHFvdBalance(MOCK_ACCOUNT_ADDRESS);

      expect(result).toStrictEqual({ balance: '3000000' });
    });

    it('calls balanceOf on the vault contract, not the underlying token', async () => {
      mockErc20BalanceOf('3000000');
      const { service } = createService();

      await service.getMusdSHFvdBalance(MOCK_ACCOUNT_ADDRESS);

      expect(MockContract).toHaveBeenCalledWith(
        MOCK_VAULT_ADDRESS,
        expect.anything(),
        expect.anything(),
      );
      expect(MockContract).not.toHaveBeenCalledWith(
        MOCK_UNDERLYING_TOKEN_ADDRESS,
        expect.anything(),
        expect.anything(),
      );
    });

    it('throws if no network configuration is found for the vault chain', async () => {
      const { service, mockGetNetworkConfig } = createService();
      mockGetNetworkConfig.mockReturnValue(undefined);

      await expect(
        service.getMusdSHFvdBalance(MOCK_ACCOUNT_ADDRESS),
      ).rejects.toThrow('No network configuration found for chain 0xa4b1');
    });

    it('throws if the network client has no provider', async () => {
      const { service, mockGetNetworkClient } = createService();
      mockGetNetworkClient.mockReturnValue({ provider: null });

      await expect(
        service.getMusdSHFvdBalance(MOCK_ACCOUNT_ADDRESS),
      ).rejects.toThrow('No provider found for chain 0xa4b1');
    });
  });

  // ----------------------------------------------------------
  // getExchangeRate
  // ----------------------------------------------------------

  describe('getExchangeRate', () => {
    it('returns the exchange rate from the Accountant contract', async () => {
      mockAccountantGetRate('1050000');
      const { service } = createService();

      const result = await service.getExchangeRate();

      expect(result).toStrictEqual({ rate: '1050000' });
    });

    it('calls getRate on the accountant contract address', async () => {
      mockAccountantGetRate('1050000');
      const { service } = createService();

      await service.getExchangeRate();

      expect(MockContract).toHaveBeenCalledWith(
        MOCK_ACCOUNTANT_ADDRESS,
        expect.anything(),
        expect.anything(),
      );
    });

    it('throws if no network configuration is found for the vault chain', async () => {
      const { service, mockGetNetworkConfig } = createService();
      mockGetNetworkConfig.mockReturnValue(undefined);

      await expect(service.getExchangeRate()).rejects.toThrow(
        'No network configuration found for chain 0xa4b1',
      );
    });

    it('throws if the network client has no provider', async () => {
      const { service, mockGetNetworkClient } = createService();
      mockGetNetworkClient.mockReturnValue({ provider: null });

      await expect(service.getExchangeRate()).rejects.toThrow(
        'No provider found for chain 0xa4b1',
      );
    });

    it('returns the cached rate when called without options within the default stale window', async () => {
      const mockGetRate = jest
        .fn()
        .mockResolvedValue({ toString: () => '1050000' });
      MockContract.mockImplementation(
        () => ({ getRate: mockGetRate }) as unknown as Contract,
      );
      const { service } = createService();

      // Seed the cache
      await service.getExchangeRate();

      mockGetRate.mockResolvedValue({ toString: () => '1100000' });

      // Get cached value
      const result = await service.getExchangeRate();

      expect(result).toStrictEqual({ rate: '1050000' });
      expect(mockGetRate).toHaveBeenCalledTimes(1);
    });

    it('refetches when called with staleTime: 0 even if a cached value exists', async () => {
      const mockGetRate = jest
        .fn()
        .mockResolvedValue({ toString: () => '1050000' });
      MockContract.mockImplementation(
        () => ({ getRate: mockGetRate }) as unknown as Contract,
      );
      const { service } = createService();

      // Seed the cache
      const firstResult = await service.getExchangeRate();
      expect(firstResult).toStrictEqual({ rate: '1050000' });

      mockGetRate.mockResolvedValue({ toString: () => '1100000' });

      // Refetch the value
      const freshResult = await service.getExchangeRate({ staleTime: 0 });

      expect(freshResult).toStrictEqual({ rate: '1100000' });
      expect(mockGetRate).toHaveBeenCalledTimes(2);
    });
  });

  // ----------------------------------------------------------
  // getMusdEquivalentValue
  // ----------------------------------------------------------

  describe('getMusdEquivalentValue', () => {
    it('returns the vault share balance, exchange rate, and computed mUSD-equivalent value', async () => {
      // balance = 2_000_000, rate = 1_100_000, decimals = 6
      // equivalent = (2_000_000 * 1_100_000) / 10^6 = 2_200_000
      mockContractsByAddress('2000000', '1100000');

      const { service } = createService();

      const result = await service.getMusdEquivalentValue(MOCK_ACCOUNT_ADDRESS);

      expect(result).toStrictEqual({
        musdSHFvdBalance: '2000000',
        exchangeRate: '1100000',
        musdEquivalentValue: '2200000',
      });
    });

    it('returns zero musdEquivalentValue when the vault share balance is zero', async () => {
      mockContractsByAddress('0', '1100000');

      const { service } = createService();

      const result = await service.getMusdEquivalentValue(MOCK_ACCOUNT_ADDRESS);

      expect(result.musdEquivalentValue).toBe('0');
    });

    it('truncates (floors) fractional mUSD when the product is not evenly divisible', async () => {
      // balance = 7, rate = 1_500_000, decimals = 6
      // => (7 * 1_500_000) / 1_000_000 = 10_500_000 / 1_000_000 = 10 (BigInt floors)
      mockContractsByAddress('7', '1500000');

      const { service } = createService();

      const result = await service.getMusdEquivalentValue(MOCK_ACCOUNT_ADDRESS);

      expect(result.musdEquivalentValue).toBe('10');
    });
  });

  // ----------------------------------------------------------
  // getVaultApy
  // ----------------------------------------------------------

  describe('getVaultApy', () => {
    it('returns the normalized vault APY from the Veda performance API', async () => {
      nock('https://api.sevenseas.capital')
        .get(`/performance/arbitrum/${MOCK_VAULT_ADDRESS}`)
        .reply(200, MOCK_VAULT_APY_RAW_RESPONSE);

      const { service } = createService();

      const result = await service.getVaultApy();

      expect(result).toStrictEqual(MOCK_VAULT_APY_NORMALIZED);
    });

    it('throws HttpError on a non-200 response', async () => {
      nock('https://api.sevenseas.capital')
        .get(`/performance/arbitrum/${MOCK_VAULT_ADDRESS}`)
        .times(DEFAULT_MAX_RETRIES + 1)
        .reply(500);

      const { service } = createService();

      await expect(service.getVaultApy()).rejects.toThrow(
        new HttpError(500, "Veda performance API failed with status '500'"),
      );
    });

    it('throws VedaResponseValidationError on a malformed response body', async () => {
      nock('https://api.sevenseas.capital')
        .get(`/performance/arbitrum/${MOCK_VAULT_ADDRESS}`)
        .reply(200, { unexpected: 'shape' });

      const { service } = createService();

      await expect(service.getVaultApy()).rejects.toThrow(
        new VedaResponseValidationError(
          'Malformed response received from Veda performance API',
        ),
      );
    });

    it.each([
      { description: 'missing Response key', body: {} },
      {
        description: 'missing apy field',
        body: {
          Response: { ...MOCK_VAULT_APY_RAW_RESPONSE.Response, apy: undefined },
        },
      },
      {
        description: 'apy is not a number',
        body: {
          Response: { ...MOCK_VAULT_APY_RAW_RESPONSE.Response, apy: 'high' },
        },
      },
      {
        description: 'missing timestamp field',
        body: {
          Response: {
            ...MOCK_VAULT_APY_RAW_RESPONSE.Response,
            timestamp: undefined,
          },
        },
      },
    ])(
      'throws VedaResponseValidationError when response is malformed: $description',
      async ({ body }) => {
        nock('https://api.sevenseas.capital')
          .get(`/performance/arbitrum/${MOCK_VAULT_ADDRESS}`)
          .reply(200, body);

        const { service } = createService();

        await expect(service.getVaultApy()).rejects.toThrow(
          VedaResponseValidationError,
        );
      },
    );

    it('accepts and normalizes a sparse response where only apy and timestamp are present', async () => {
      const sparseResponse = {
        Response: {
          aggregation_period: '7 days',
          apy: 0,
          chain_allocation: { arbitrum: 0 },
          fees: 0,
          global_apy_breakdown: { fee: 0, maturity_apy: 0, real_apy: 0 },
          maturity_apy_breakdown: [],
          real_apy_breakdown: [],
          timestamp: 'Fri, 10 Apr 2026 22:05:54 GMT',
        },
      };

      nock('https://api.sevenseas.capital')
        .get(`/performance/arbitrum/${MOCK_VAULT_ADDRESS}`)
        .reply(200, sparseResponse);

      const { service } = createService();

      const result = await service.getVaultApy();

      expect(result.apy).toBe(0);
      expect(result.timestamp).toBe('Fri, 10 Apr 2026 22:05:54 GMT');
      expect(result.realApyBreakdown).toStrictEqual([]);
    });

    it('accepts a response that omits all optional fields', async () => {
      const minimalResponse = {
        Response: {
          apy: 0.03,
          timestamp: '2026-01-01T00:00:00Z',
        },
      };

      nock('https://api.sevenseas.capital')
        .get(`/performance/arbitrum/${MOCK_VAULT_ADDRESS}`)
        .reply(200, minimalResponse);

      const { service } = createService();

      const result = await service.getVaultApy();

      expect(result).toStrictEqual({
        aggregationPeriod: undefined,
        apy: 0.03,
        chainAllocation: undefined,
        fees: undefined,
        globalApyBreakdown: undefined,
        performanceFees: undefined,
        realApyBreakdown: undefined,
        timestamp: '2026-01-01T00:00:00Z',
      });
    });

    it('does not retry on VedaResponseValidationError', async () => {
      // Only one nock scope — if retry happened, the second call would throw a
      // different error (nock "no match" instead of VedaResponseValidationError).
      nock('https://api.sevenseas.capital')
        .get(`/performance/arbitrum/${MOCK_VAULT_ADDRESS}`)
        .once()
        .reply(200, { unexpected: 'shape' });

      const { service } = createService();

      await expect(service.getVaultApy()).rejects.toThrow(
        VedaResponseValidationError,
      );
    });

    it('falls back to the default network name for unknown chain IDs', async () => {
      // 0x1 is not in VEDA_API_NETWORK_NAMES, so DEFAULT_VEDA_API_NETWORK_NAME
      // ('arbitrum') should be used. Nock matches on exact URL, so if the wrong
      // network name were used the request would throw instead of returning data.
      nock('https://api.sevenseas.capital')
        .get(`/performance/arbitrum/${MOCK_VAULT_ADDRESS}`)
        .reply(200, MOCK_VAULT_APY_RAW_RESPONSE);

      const { service } = createService({
        options: { vaultChainId: '0x1' as const },
      });

      const result = await service.getVaultApy();

      expect(result).toStrictEqual(MOCK_VAULT_APY_NORMALIZED);
    });
  });
});

describe('VedaResponseValidationError', () => {
  it('uses the default message when constructed with no argument', () => {
    const error = new VedaResponseValidationError();

    expect(error.message).toBe('Malformed response received from Veda API');
    expect(error.name).toBe('VedaResponseValidationError');
  });
});
