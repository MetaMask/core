import { Contract } from '@ethersproject/contracts';
import { Web3Provider } from '@ethersproject/providers';
import { DEFAULT_MAX_RETRIES, HttpError } from '@metamask/controller-utils';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import type { Json } from '@metamask/utils';
import nock, { cleanAll as nockCleanAll } from 'nock';

import { VAULT_CONFIG_FEATURE_FLAG_KEY } from './constants';
import {
  VaultConfigNotAvailableError,
  VaultConfigValidationError,
  VedaResponseValidationError,
} from './errors';
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
  '0x1111111111111111111111111111111111111111' as const;
const MOCK_ACCOUNTANT_ADDRESS =
  '0x2222222222222222222222222222222222222222' as const;
const MOCK_UNDERLYING_TOKEN_ADDRESS =
  '0x3333333333333333333333333333333333333333' as const;
const MOCK_ACCOUNT_ADDRESS =
  '0x4444444444444444444444444444444444444444' as const;
const MOCK_NETWORK_CLIENT_ID = 'arbitrum-mainnet';

const MOCK_VAULT_CONFIG = {
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

// Web3Provider is mocked at the module level so type correctness is irrelevant.
const MOCK_PROVIDER = {} as unknown as ConstructorParameters<
  typeof Web3Provider
>[0];

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

function createRootMessenger(
  captureException?: (error: Error) => void,
): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE, captureException });
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
 * Publishes a `RemoteFeatureFlagController:stateChange` event via the root
 * messenger, simulating a flag update from RemoteFeatureFlagController.
 *
 * @param rootMessenger - The root messenger to publish on.
 * @param remoteFeatureFlags - The new flags object.
 */
function publishRFFCStateChange(
  rootMessenger: RootMessenger,
  remoteFeatureFlags: Record<string, Json>,
): void {
  rootMessenger.publish(
    'RemoteFeatureFlagController:stateChange',
    { remoteFeatureFlags, cacheTimestamp: Date.now() },
    [],
  );
}

/**
 * Builds the service under test with messenger action stubs for all
 * dependencies, including RemoteFeatureFlagController.
 *
 * By default, `init()` is called and the RFFC state contains a valid
 * `moneyVaultConfig`. Pass `rffcFlags` to override, or `callInit: false` to
 * skip the eager init.
 *
 * A `captureException` mock is wired onto the root messenger by default so
 * that subscriber errors (e.g. `VaultConfigValidationError`) are routed there
 * instead of `console.error`. Pass your own mock to assert on it.
 *
 * @param args - Optional overrides.
 * @param args.rffcFlags - Flags to return from `RemoteFeatureFlagController:getState`.
 * @param args.callInit - Whether to call `service.init()` after construction. Defaults to true.
 * @param args.captureException - Error reporter wired on the root messenger.
 * @param args.options - Partial constructor options for the service.
 * @returns The constructed service together with messenger instances and mock stubs.
 */
function createService({
  rffcFlags = { [VAULT_CONFIG_FEATURE_FLAG_KEY]: MOCK_VAULT_CONFIG },
  callInit = true,
  captureException = jest.fn(),
  options = {},
}: {
  rffcFlags?: Record<string, Json>;
  callInit?: boolean;
  captureException?: jest.Mock;
  options?: Partial<
    ConstructorParameters<typeof MoneyAccountBalanceService>[0]
  >;
} = {}): {
  service: MoneyAccountBalanceService;
  rootMessenger: RootMessenger;
  messenger: MoneyAccountBalanceServiceMessenger;
  mockGetNetworkConfig: jest.Mock;
  mockGetNetworkClient: jest.Mock;
  mockGetRFFCState: jest.Mock;
  captureException: jest.Mock;
} {
  const rootMessenger = createRootMessenger(captureException);
  const messenger = createServiceMessenger(rootMessenger);

  const mockGetNetworkConfig = jest.fn().mockReturnValue(MOCK_NETWORK_CONFIG);
  const mockGetNetworkClient = jest.fn().mockReturnValue({
    provider: MOCK_PROVIDER,
  });
  const mockGetRFFCState = jest
    .fn()
    .mockReturnValue({ remoteFeatureFlags: rffcFlags, cacheTimestamp: 0 });

  rootMessenger.registerActionHandler(
    'NetworkController:getNetworkConfigurationByChainId',
    mockGetNetworkConfig,
  );
  rootMessenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    mockGetNetworkClient,
  );
  rootMessenger.registerActionHandler(
    'RemoteFeatureFlagController:getState',
    mockGetRFFCState,
  );

  rootMessenger.delegate({
    actions: [
      'NetworkController:getNetworkConfigurationByChainId',
      'NetworkController:getNetworkClientById',
      'RemoteFeatureFlagController:getState',
    ],
    // eslint-disable-next-line no-restricted-syntax
    events: ['RemoteFeatureFlagController:stateChange'],
    messenger,
  });

  const service = new MoneyAccountBalanceService({ messenger, ...options });

  if (callInit) {
    service.init();
  }

  return {
    service,
    rootMessenger,
    messenger,
    mockGetNetworkConfig,
    mockGetNetworkClient,
    mockGetRFFCState,
    captureException,
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
    MockContract.mockReset();
    MockWeb3Provider.mockImplementation(() => ({}) as unknown as Web3Provider);
    nockCleanAll();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  // ----------------------------------------------------------
  // init
  // ----------------------------------------------------------

  describe('init', () => {
    it('loads vault config when RemoteFeatureFlagController already has valid flags', async () => {
      mockErc20BalanceOf('5000000');
      const { service } = createService();

      // If vault config was loaded, getMusdBalance succeeds without throwing.
      expect(
        await service.getMusdBalance(MOCK_ACCOUNT_ADDRESS),
      ).toStrictEqual({ balance: '5000000' });
    });

    it('leaves config undefined and degrades gracefully when flag key is absent', async () => {
      const { service } = createService({ rffcFlags: {} });

      await expect(
        service.getMusdBalance(MOCK_ACCOUNT_ADDRESS),
      ).rejects.toThrow(VaultConfigNotAvailableError);
    });

    it('leaves config undefined and degrades gracefully when the flag value is malformed', async () => {
      const { service } = createService({
        rffcFlags: {
          [VAULT_CONFIG_FEATURE_FLAG_KEY]: { notAValidConfig: true },
        },
      });

      await expect(
        service.getMusdBalance(MOCK_ACCOUNT_ADDRESS),
      ).rejects.toThrow(VaultConfigNotAvailableError);
    });

    it('does not throw when RemoteFeatureFlagController is not yet registered', () => {
      const rootMessenger = createRootMessenger();
      const messenger = createServiceMessenger(rootMessenger);

      // Do NOT register RemoteFeatureFlagController:getState or delegate it.
      rootMessenger.registerActionHandler(
        'NetworkController:getNetworkConfigurationByChainId',
        jest.fn(),
      );
      rootMessenger.registerActionHandler(
        'NetworkController:getNetworkClientById',
        jest.fn(),
      );
      rootMessenger.delegate({
        actions: [
          'NetworkController:getNetworkConfigurationByChainId',
          'NetworkController:getNetworkClientById',
        ],
        events: [],
        messenger,
      });

      const service = new MoneyAccountBalanceService({ messenger });

      expect(() => service.init()).not.toThrow();
    });
  });

  // ----------------------------------------------------------
  // RemoteFeatureFlagController:stateChange subscription
  // ----------------------------------------------------------

  describe('RemoteFeatureFlagController:stateChange subscription', () => {
    describe('config lifecycle', () => {
      it('sets vault config when a valid config arrives via subscription', async () => {
        mockErc20BalanceOf('9000000');
        // Start with no flags so config is absent after init.
        const { service, rootMessenger } = createService({ rffcFlags: {} });

        publishRFFCStateChange(rootMessenger, {
          [VAULT_CONFIG_FEATURE_FLAG_KEY]: MOCK_VAULT_CONFIG,
        });

        expect(
          await service.getMusdBalance(MOCK_ACCOUNT_ADDRESS),
        ).toStrictEqual({ balance: '9000000' });
      });

      it('uses the updated vault address after config changes', async () => {
        const NEW_VAULT_ADDRESS =
          '0x5555555555555555555555555555555555555555' as const;
        mockErc20BalanceOf('1000000');
        const { service, rootMessenger } = createService();

        publishRFFCStateChange(rootMessenger, {
          [VAULT_CONFIG_FEATURE_FLAG_KEY]: {
            ...MOCK_VAULT_CONFIG,
            vaultAddress: NEW_VAULT_ADDRESS,
          },
        });

        await service.getMusdSHFvdBalance(MOCK_ACCOUNT_ADDRESS);

        // getMusdSHFvdBalance uses vaultAddress — verify the new address was used.
        expect(MockContract).toHaveBeenCalledWith(
          NEW_VAULT_ADDRESS,
          expect.anything(),
          expect.anything(),
        );
        expect(MockContract).not.toHaveBeenCalledWith(
          MOCK_VAULT_ADDRESS,
          expect.anything(),
          expect.anything(),
        );
      });

      it('clears vault config when the flag key is removed from remoteFeatureFlags', async () => {
        const { service, rootMessenger } = createService();

        publishRFFCStateChange(rootMessenger, {});

        await expect(
          service.getMusdBalance(MOCK_ACCOUNT_ADDRESS),
        ).rejects.toThrow(VaultConfigNotAvailableError);
      });

      it('clears vault config and routes VaultConfigValidationError when a malformed config arrives after valid config', async () => {
        const captureException = jest.fn();
        const { service, rootMessenger } = createService({ captureException });

        publishRFFCStateChange(rootMessenger, {
          [VAULT_CONFIG_FEATURE_FLAG_KEY]: { malformed: true },
        });

        // Messenger routes the thrown VaultConfigValidationError to captureException.
        expect(captureException).toHaveBeenCalledWith(
          expect.any(VaultConfigValidationError),
        );

        // Config has been cleared so subsequent calls throw VaultConfigNotAvailableError.
        await expect(
          service.getMusdBalance(MOCK_ACCOUNT_ADDRESS),
        ).rejects.toThrow(VaultConfigNotAvailableError);
      });

      it('routes VaultConfigValidationError to captureException when malformed config arrives with no prior config', () => {
        const captureException = jest.fn();
        const { rootMessenger } = createService({ rffcFlags: {}, captureException });

        publishRFFCStateChange(rootMessenger, {
          [VAULT_CONFIG_FEATURE_FLAG_KEY]: { malformed: true },
        });

        expect(captureException).toHaveBeenCalledWith(
          expect.any(VaultConfigValidationError),
        );
      });

    });

    describe('cache invalidation', () => {
      it('does NOT invalidate queries when config is set for the first time via subscription', () => {
        const { service, rootMessenger } = createService({ rffcFlags: {} });
        const invalidateQueriesSpy = jest.spyOn(service, 'invalidateQueries');

        publishRFFCStateChange(rootMessenger, {
          [VAULT_CONFIG_FEATURE_FLAG_KEY]: MOCK_VAULT_CONFIG,
        });

        expect(invalidateQueriesSpy).not.toHaveBeenCalled();
      });

      it('invalidates queries when config changes to a different valid config', () => {
        const { service, rootMessenger } = createService();
        const invalidateQueriesSpy = jest.spyOn(service, 'invalidateQueries');

        const updatedConfig = {
          ...MOCK_VAULT_CONFIG,
          underlyingTokenDecimals: 18,
        };
        publishRFFCStateChange(rootMessenger, {
          [VAULT_CONFIG_FEATURE_FLAG_KEY]: updatedConfig,
        });

        expect(invalidateQueriesSpy).toHaveBeenCalledTimes(1);
      });

      it('does NOT invalidate queries when the same config arrives again', () => {
        const { service, rootMessenger } = createService();
        const invalidateQueriesSpy = jest.spyOn(service, 'invalidateQueries');

        publishRFFCStateChange(rootMessenger, {
          [VAULT_CONFIG_FEATURE_FLAG_KEY]: { ...MOCK_VAULT_CONFIG },
        });

        expect(invalidateQueriesSpy).not.toHaveBeenCalled();
      });

      it('invalidates queries when the flag key is removed after valid config was set', () => {
        const { service, rootMessenger } = createService();
        const invalidateQueriesSpy = jest.spyOn(service, 'invalidateQueries');

        publishRFFCStateChange(rootMessenger, {});

        expect(invalidateQueriesSpy).toHaveBeenCalledTimes(1);
      });

      it('does NOT invalidate queries when absent flag key arrives with no prior config', () => {
        const { service, rootMessenger } = createService({ rffcFlags: {} });
        const invalidateQueriesSpy = jest.spyOn(service, 'invalidateQueries');

        publishRFFCStateChange(rootMessenger, {});

        expect(invalidateQueriesSpy).not.toHaveBeenCalled();
      });

      it('invalidates queries when a malformed config arrives after valid config was set', () => {
        const { service, rootMessenger } = createService();
        const invalidateQueriesSpy = jest.spyOn(service, 'invalidateQueries');

        publishRFFCStateChange(rootMessenger, {
          [VAULT_CONFIG_FEATURE_FLAG_KEY]: { malformed: true },
        });

        expect(invalidateQueriesSpy).toHaveBeenCalledTimes(1);
      });

      it('does NOT invalidate queries when a malformed config arrives with no prior config', () => {
        const { service, rootMessenger } = createService({ rffcFlags: {} });
        const invalidateQueriesSpy = jest.spyOn(service, 'invalidateQueries');

        publishRFFCStateChange(rootMessenger, {
          [VAULT_CONFIG_FEATURE_FLAG_KEY]: { malformed: true },
        });

        expect(invalidateQueriesSpy).not.toHaveBeenCalled();
      });
    });
  });

  // ----------------------------------------------------------
  // VaultConfigNotAvailableError — all public methods
  // ----------------------------------------------------------

  describe('when vault config is not available', () => {
    it('getMusdBalance throws VaultConfigNotAvailableError', async () => {
      const { service } = createService({ rffcFlags: {} });

      await expect(
        service.getMusdBalance(MOCK_ACCOUNT_ADDRESS),
      ).rejects.toThrow(VaultConfigNotAvailableError);
    });

    it('getMusdSHFvdBalance throws VaultConfigNotAvailableError', async () => {
      const { service } = createService({ rffcFlags: {} });

      await expect(
        service.getMusdSHFvdBalance(MOCK_ACCOUNT_ADDRESS),
      ).rejects.toThrow(VaultConfigNotAvailableError);
    });

    it('getExchangeRate throws VaultConfigNotAvailableError', async () => {
      const { service } = createService({ rffcFlags: {} });

      await expect(service.getExchangeRate()).rejects.toThrow(
        VaultConfigNotAvailableError,
      );
    });

    it('getMusdEquivalentValue throws VaultConfigNotAvailableError', async () => {
      const { service } = createService({ rffcFlags: {} });

      await expect(
        service.getMusdEquivalentValue(MOCK_ACCOUNT_ADDRESS),
      ).rejects.toThrow(VaultConfigNotAvailableError);
    });

    it('getVaultApy throws VaultConfigNotAvailableError', async () => {
      const { service } = createService({ rffcFlags: {} });

      await expect(service.getVaultApy()).rejects.toThrow(
        VaultConfigNotAvailableError,
      );
    });
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

      // Seed the cache.
      await service.getExchangeRate();

      mockGetRate.mockResolvedValue({ toString: () => '1100000' });

      // Second call should return the cached value.
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

      // Seed the cache.
      const firstResult = await service.getExchangeRate();
      expect(firstResult).toStrictEqual({ rate: '1050000' });

      mockGetRate.mockResolvedValue({ toString: () => '1100000' });

      // Refetch using staleTime: 0.
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

    it('accepts and normalizes a response with zero values and empty array breakdowns', async () => {
      // All optional fields are present but carry zero / empty values — verifies
      // that falsy values are not accidentally dropped during normalization.
      const zeroValuesResponse = {
        Response: {
          aggregation_period: '7 days',
          apy: 0,
          chain_allocation: { arbitrum: 0 },
          fees: 0,
          global_apy_breakdown: { fee: 0, maturity_apy: 0, real_apy: 0 },
          performance_fees: 0,
          real_apy_breakdown: [],
          timestamp: 'Fri, 10 Apr 2026 22:05:54 GMT',
        },
      };

      nock('https://api.sevenseas.capital')
        .get(`/performance/arbitrum/${MOCK_VAULT_ADDRESS}`)
        .reply(200, zeroValuesResponse);

      const { service } = createService();

      const result = await service.getVaultApy();

      expect(result.apy).toBe(0);
      expect(result.fees).toBe(0);
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

    it('throws when the vault chain ID has no Veda API network name mapping', async () => {
      const { service } = createService({
        rffcFlags: {
          [VAULT_CONFIG_FEATURE_FLAG_KEY]: {
            ...MOCK_VAULT_CONFIG,
            vaultChainId: '0x1',
          },
        },
      });

      await expect(service.getVaultApy()).rejects.toThrow(
        'No Veda API network name found for chain 0x1',
      );
    });
  });
});

// ============================================================
// Error class unit tests
// ============================================================

describe('VaultConfigNotAvailableError', () => {
  it('has the expected message and name', () => {
    const error = new VaultConfigNotAvailableError();

    expect(error.message).toBe(
      'MoneyAccountBalanceService: vault config is not available. ' +
        'RemoteFeatureFlagController may not have fetched flags yet.',
    );
    expect(error.name).toBe('VaultConfigNotAvailableError');
  });
});

describe('VaultConfigValidationError', () => {
  it('uses the default message when constructed with no argument', () => {
    const error = new VaultConfigValidationError();

    expect(error.message).toBe(
      'MoneyAccountBalanceService: vault config from remote feature flags is malformed.',
    );
    expect(error.name).toBe('VaultConfigValidationError');
  });

  it('uses a custom message when one is provided', () => {
    const error = new VaultConfigValidationError('custom message');

    expect(error.message).toBe('custom message');
    expect(error.name).toBe('VaultConfigValidationError');
  });
});

describe('VedaResponseValidationError', () => {
  it('uses the default message when constructed with no argument', () => {
    const error = new VedaResponseValidationError();

    expect(error.message).toBe('Malformed response received from Veda API');
    expect(error.name).toBe('VedaResponseValidationError');
  });
});
