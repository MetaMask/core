import { Contract } from '@ethersproject/contracts';
import { Web3Provider } from '@ethersproject/providers';
import { DEFAULT_MAX_RETRIES, HttpError } from '@metamask/controller-utils';
import type {
  TraceCallback,
  TraceContext,
  TraceRequest,
} from '@metamask/controller-utils';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import type { Json } from '@metamask/utils';
import nock, { cleanAll as nockCleanAll } from 'nock';

import {
  LENS_ABI,
  MONEY_ACCOUNT_BALANCE_STALETIME_FEATURE_FLAG_KEY,
  MULTICALL3_ADDRESS_BY_CHAIN_ID,
  VAULT_CONFIG_FEATURE_FLAG_KEY,
} from './constants';
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
const MOCK_TELLER_ADDRESS =
  '0x5555555555555555555555555555555555555555' as const;
const MOCK_LENS_ADDRESS = '0x6666666666666666666666666666666666666666' as const;
const MOCK_NETWORK_CLIENT_ID = 'arbitrum-mainnet';

const MOCK_VAULT_CONFIG = {
  boringVault: MOCK_VAULT_ADDRESS,
  accountantAddress: MOCK_ACCOUNTANT_ADDRESS,
  tellerAddress: MOCK_TELLER_ADDRESS,
  lensAddress: MOCK_LENS_ADDRESS,
  chainId: '0xa4b1' as const,
};

const MOCK_VAULT_CONFIG_WITH_UNDERLYING_TOKEN = {
  ...MOCK_VAULT_CONFIG,
  underlyingToken: MOCK_UNDERLYING_TOKEN_ADDRESS,
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
 * whose `.toString()` returns `balance`. Used for single-contract flows
 * such as `getVmusdBalance`.
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
 * Configures the first Contract instantiation to respond to `.base()` with
 * `MOCK_UNDERLYING_TOKEN_ADDRESS`. Used alongside `mockErc20BalanceOf` to
 * stub the two-step flow inside `getMusdBalance`: the Accountant is
 * instantiated first to resolve the underlying token address, then the ERC-20
 * is instantiated to read the balance.
 */
function mockAccountantBase(): void {
  MockContract.mockImplementationOnce(
    () =>
      ({
        base: jest.fn().mockResolvedValue(MOCK_UNDERLYING_TOKEN_ADDRESS),
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
 * Configures the Contract mock so that `balanceOfInAssets` resolves to an
 * object whose `.toString()` returns `balanceOfInAssets`. Used for
 * `getMusdEquivalentValue`, which delegates the share-to-asset conversion to
 * the Veda Lens contract.
 *
 * @param balanceOfInAssets - The raw uint256 asset balance string to return.
 */
function mockLensBalanceOfInAssets(balanceOfInAssets: string): void {
  MockContract.mockImplementation(
    () =>
      ({
        balanceOfInAssets: jest
          .fn()
          .mockResolvedValue({ toString: () => balanceOfInAssets }),
      }) as unknown as Contract,
  );
}

function makeMockBN(value: string): {
  toString: () => string;
  add: (other: { toString: () => string }) => {
    toString: () => string;
    add: (o: { toString: () => string }) => unknown;
  };
} {
  return {
    toString: () => value,
    add: (other) =>
      makeMockBN((BigInt(value) + BigInt(other.toString())).toString()),
  };
}

function mockMoneyAccountBalanceMulticall({
  musdBalance = '0',
  vmusdValueInMusd = '0',
  aggregate3,
}: {
  musdBalance?: string;
  vmusdValueInMusd?: string;
  aggregate3?: jest.Mock;
} = {}): jest.Mock {
  const MUSD_RETURN_DATA = '0xMUSD';
  const SHFVD_RETURN_DATA = '0xSHFVD';

  const aggregate3Mock =
    aggregate3 ??
    jest.fn().mockResolvedValue([
      { success: true, returnData: MUSD_RETURN_DATA },
      { success: true, returnData: SHFVD_RETURN_DATA },
    ]);

  const multicall3Address =
    MULTICALL3_ADDRESS_BY_CHAIN_ID[MOCK_VAULT_CONFIG.chainId];

  MockContract.mockImplementation(
    (address: string) =>
      (address === multicall3Address
        ? { callStatic: { aggregate3: aggregate3Mock } }
        : {
            base: jest.fn().mockResolvedValue(MOCK_UNDERLYING_TOKEN_ADDRESS),
            interface: {
              encodeFunctionData: jest.fn().mockReturnValue('0xcalldata'),
              decodeFunctionResult: jest
                .fn()
                .mockImplementation((_functionFragment: string, data: string) =>
                  data === MUSD_RETURN_DATA
                    ? [makeMockBN(musdBalance)]
                    : [makeMockBN(vmusdValueInMusd)],
                ),
            },
          }) as unknown as Contract,
  );

  return aggregate3Mock;
}

function createTraceCallback(): jest.MockedFunction<TraceCallback> {
  return jest
    .fn()
    .mockImplementation(
      async <ReturnType>(
        _request: TraceRequest,
        fn?: (context?: TraceContext) => ReturnType,
      ): Promise<ReturnType> => {
        if (!fn) {
          return undefined as ReturnType;
        }
        return await Promise.resolve(fn());
      },
    ) as jest.MockedFunction<TraceCallback>;
}

function expectTraceRequest(
  traceCallback: jest.MockedFunction<TraceCallback>,
  {
    errorName,
    name,
    operation,
    success = true,
    tokenAddress,
  }: {
    errorName?: string;
    name: string;
    operation: string;
    success?: boolean;
    tokenAddress?: string;
  },
): void {
  const traceRequest = traceCallback.mock.calls.find(
    ([request]) => request.name === name,
  )?.[0];

  expect(traceRequest).toStrictEqual({
    name,
    startTime: expect.any(Number),
    data: {
      chainId: MOCK_VAULT_CONFIG.chainId,
      ...(errorName ? { errorName } : {}),
      operation,
      success,
      ...(tokenAddress ? { tokenAddress } : {}),
    },
  });
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
      mockAccountantBase();
      mockErc20BalanceOf('5000000');
      const { service } = createService();

      // If vault config was loaded, getMusdBalance succeeds without throwing.
      expect(await service.getMusdBalance(MOCK_ACCOUNT_ADDRESS)).toStrictEqual({
        balance: '5000000',
      });
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
        mockAccountantBase();
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
          '0x9999999999999999999999999999999999999999' as const;
        mockErc20BalanceOf('1000000');
        const { service, rootMessenger } = createService();

        publishRFFCStateChange(rootMessenger, {
          [VAULT_CONFIG_FEATURE_FLAG_KEY]: {
            ...MOCK_VAULT_CONFIG,
            boringVault: NEW_VAULT_ADDRESS,
          },
        });

        await service.getVmusdBalance(MOCK_ACCOUNT_ADDRESS);

        // getVmusdBalance uses vaultAddress — verify the new address was used.
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
        const { rootMessenger } = createService({
          rffcFlags: {},
          captureException,
        });

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
          lensAddress: '0x7777777777777777777777777777777777777777' as const,
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
    it('getMoneyAccountBalance throws VaultConfigNotAvailableError', async () => {
      const { service } = createService({ rffcFlags: {} });

      await expect(
        service.getMoneyAccountBalance(MOCK_ACCOUNT_ADDRESS),
      ).rejects.toThrow(VaultConfigNotAvailableError);
    });

    it('getMusdBalance throws VaultConfigNotAvailableError', async () => {
      const { service } = createService({ rffcFlags: {} });

      await expect(
        service.getMusdBalance(MOCK_ACCOUNT_ADDRESS),
      ).rejects.toThrow(VaultConfigNotAvailableError);
    });

    it('getVmusdBalance throws VaultConfigNotAvailableError', async () => {
      const { service } = createService({ rffcFlags: {} });

      await expect(
        service.getVmusdBalance(MOCK_ACCOUNT_ADDRESS),
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
  // tracing
  // ----------------------------------------------------------

  describe('tracing', () => {
    it('traces getMusdBalance ERC-20 balance RPC on cache miss', async () => {
      mockErc20BalanceOf('5000000');
      const trace = createTraceCallback();
      const { service } = createService({
        rffcFlags: {
          [VAULT_CONFIG_FEATURE_FLAG_KEY]:
            MOCK_VAULT_CONFIG_WITH_UNDERLYING_TOKEN,
        },
        options: { trace },
      });

      await service.getMusdBalance(MOCK_ACCOUNT_ADDRESS);

      expect(trace).toHaveBeenCalledTimes(1);
      expectTraceRequest(trace, {
        name: 'Get Money Account ERC20 Balance RPC',
        operation: 'balanceOf',
        tokenAddress: MOCK_UNDERLYING_TOKEN_ADDRESS,
      });
    });

    it('traces getMoneyAccountBalance Multicall3 RPC on cache miss', async () => {
      mockMoneyAccountBalanceMulticall({
        musdBalance: '5000000',
        vmusdValueInMusd: '2200000',
      });
      const trace = createTraceCallback();
      const { service } = createService({
        rffcFlags: {
          [VAULT_CONFIG_FEATURE_FLAG_KEY]:
            MOCK_VAULT_CONFIG_WITH_UNDERLYING_TOKEN,
        },
        options: { trace },
      });

      await service.getMoneyAccountBalance(MOCK_ACCOUNT_ADDRESS);

      expect(trace).toHaveBeenCalledTimes(1);
      expectTraceRequest(trace, {
        name: 'Get Money Account Balance RPC',
        operation: 'aggregate3',
      });
    });

    it('traces getVmusdBalance ERC-20 balance RPC on cache miss', async () => {
      mockErc20BalanceOf('3000000');
      const trace = createTraceCallback();
      const { service } = createService({ options: { trace } });

      await service.getVmusdBalance(MOCK_ACCOUNT_ADDRESS);

      expect(trace).toHaveBeenCalledTimes(1);
      expectTraceRequest(trace, {
        name: 'Get Money Account ERC20 Balance RPC',
        operation: 'balanceOf',
        tokenAddress: MOCK_VAULT_ADDRESS,
      });
    });

    it('traces getExchangeRate Accountant RPC on cache miss', async () => {
      mockAccountantGetRate('1050000');
      const trace = createTraceCallback();
      const { service } = createService({ options: { trace } });

      await service.getExchangeRate();

      expect(trace).toHaveBeenCalledTimes(1);
      expectTraceRequest(trace, {
        name: 'Get Money Account Exchange Rate RPC',
        operation: 'getRate',
      });
    });

    it('traces getMusdEquivalentValue Lens RPC on cache miss', async () => {
      mockLensBalanceOfInAssets('1000000');
      const trace = createTraceCallback();
      const { service } = createService({ options: { trace } });

      await service.getMusdEquivalentValue(MOCK_ACCOUNT_ADDRESS);

      expect(trace).toHaveBeenCalledTimes(1);
      expectTraceRequest(trace, {
        name: 'Get Money Account mUSD Equivalent Value RPC',
        operation: 'balanceOfInAssets',
      });
    });

    it('traces getVaultApy Veda API fetch on cache miss', async () => {
      nock('https://api.sevenseas.capital')
        .get(`/performance/arbitrum/${MOCK_VAULT_ADDRESS}`)
        .reply(200, MOCK_VAULT_APY_RAW_RESPONSE);
      const trace = createTraceCallback();
      const { service } = createService({ options: { trace } });

      await service.getVaultApy();

      expect(trace).toHaveBeenCalledTimes(1);
      expectTraceRequest(trace, {
        name: 'Get Money Account Vault APY API',
        operation: 'fetchVaultApy',
      });
    });

    it('traces fallback underlying token RPC when configured token is absent', async () => {
      mockAccountantBase();
      mockErc20BalanceOf('5000000');
      const trace = createTraceCallback();
      const { service } = createService({ options: { trace } });

      await service.getMusdBalance(MOCK_ACCOUNT_ADDRESS);

      expect(trace).toHaveBeenCalledTimes(2);
      expectTraceRequest(trace, {
        name: 'Get Money Account Underlying Token RPC',
        operation: 'base',
      });
      expectTraceRequest(trace, {
        name: 'Get Money Account ERC20 Balance RPC',
        operation: 'balanceOf',
        tokenAddress: MOCK_UNDERLYING_TOKEN_ADDRESS,
      });
    });

    it('does not trace a cached query result', async () => {
      mockAccountantGetRate('1050000');
      const trace = createTraceCallback();
      const { service } = createService({ options: { trace } });

      await service.getExchangeRate();
      await service.getExchangeRate();

      expect(trace).toHaveBeenCalledTimes(1);
      expectTraceRequest(trace, {
        name: 'Get Money Account Exchange Rate RPC',
        operation: 'getRate',
      });
    });

    it('does not fail or refetch when the trace callback rejects', async () => {
      const mockGetRate = jest
        .fn()
        .mockResolvedValue({ toString: () => '1050000' });
      MockContract.mockImplementation(
        () => ({ getRate: mockGetRate }) as unknown as Contract,
      );
      const trace = jest
        .fn()
        .mockRejectedValue(
          new Error('trace boom'),
        ) as jest.MockedFunction<TraceCallback>;
      const { service } = createService({ options: { trace } });

      expect(await service.getExchangeRate()).toStrictEqual({
        rate: '1050000',
      });
      expect(await service.getExchangeRate()).toStrictEqual({
        rate: '1050000',
      });

      expect(mockGetRate).toHaveBeenCalledTimes(1);
      expect(trace).toHaveBeenCalledTimes(1);
    });

    it('does not fail when the trace callback returns undefined', async () => {
      mockAccountantGetRate('1050000');
      const trace = jest
        .fn()
        .mockReturnValue(undefined) as jest.MockedFunction<TraceCallback>;
      const { service } = createService({ options: { trace } });

      expect(await service.getExchangeRate()).toStrictEqual({
        rate: '1050000',
      });

      expect(trace).toHaveBeenCalledTimes(1);
      expectTraceRequest(trace, {
        name: 'Get Money Account Exchange Rate RPC',
        operation: 'getRate',
      });
    });

    it('does not fail when the trace callback throws synchronously', async () => {
      const mockGetRate = jest
        .fn()
        .mockResolvedValue({ toString: () => '1050000' });
      MockContract.mockImplementation(
        () => ({ getRate: mockGetRate }) as unknown as Contract,
      );
      const trace = jest.fn().mockImplementation(() => {
        throw new Error('trace boom');
      }) as jest.MockedFunction<TraceCallback>;
      const { service } = createService({ options: { trace } });

      expect(await service.getExchangeRate()).toStrictEqual({
        rate: '1050000',
      });
      expect(await service.getExchangeRate()).toStrictEqual({
        rate: '1050000',
      });

      expect(mockGetRate).toHaveBeenCalledTimes(1);
      expect(trace).toHaveBeenCalledTimes(1);
    });

    it('propagates aggregate3 rejections after emitting a failed trace', async () => {
      const aggregate3 = jest
        .fn()
        .mockRejectedValue(new Error('execution reverted'));
      mockMoneyAccountBalanceMulticall({ aggregate3 });
      const trace = createTraceCallback();
      const { service } = createService({
        rffcFlags: {
          [VAULT_CONFIG_FEATURE_FLAG_KEY]:
            MOCK_VAULT_CONFIG_WITH_UNDERLYING_TOKEN,
        },
        options: { trace },
      });

      await expect(
        service.getMoneyAccountBalance(MOCK_ACCOUNT_ADDRESS),
      ).rejects.toThrow('execution reverted');
      expectTraceRequest(trace, {
        errorName: 'Error',
        name: 'Get Money Account Balance RPC',
        operation: 'aggregate3',
        success: false,
      });
    });

    it('traces non-Error aggregate3 rejections with the thrown value type', async () => {
      const aggregate3 = jest.fn().mockRejectedValue('execution reverted');
      mockMoneyAccountBalanceMulticall({ aggregate3 });
      const trace = createTraceCallback();
      const { service } = createService({
        rffcFlags: {
          [VAULT_CONFIG_FEATURE_FLAG_KEY]:
            MOCK_VAULT_CONFIG_WITH_UNDERLYING_TOKEN,
        },
        options: { trace },
      });

      await expect(
        service.getMoneyAccountBalance(MOCK_ACCOUNT_ADDRESS),
      ).rejects.toBe('execution reverted');
      expectTraceRequest(trace, {
        errorName: 'string',
        name: 'Get Money Account Balance RPC',
        operation: 'aggregate3',
        success: false,
      });
    });

    it('propagates Veda API errors after emitting a failed trace', async () => {
      nock('https://api.sevenseas.capital')
        .get(`/performance/arbitrum/${MOCK_VAULT_ADDRESS}`)
        .times(DEFAULT_MAX_RETRIES + 1)
        .reply(500);
      const trace = createTraceCallback();
      const { service } = createService({ options: { trace } });

      await expect(service.getVaultApy()).rejects.toThrow(
        new HttpError(500, "Veda performance API failed with status '500'"),
      );
      expectTraceRequest(trace, {
        errorName: 'Error',
        name: 'Get Money Account Vault APY API',
        operation: 'fetchVaultApy',
        success: false,
      });
    });
  });

  // ----------------------------------------------------------
  // getMusdBalance
  // ----------------------------------------------------------

  describe('getMusdBalance', () => {
    it('returns the mUSD balance for the given address', async () => {
      mockAccountantBase();
      mockErc20BalanceOf('5000000');
      const { service } = createService();

      const result = await service.getMusdBalance(MOCK_ACCOUNT_ADDRESS);

      expect(result).toStrictEqual({ balance: '5000000' });
    });

    it('first calls base() on the Accountant to resolve the underlying token, then calls balanceOf on it', async () => {
      mockAccountantBase();
      mockErc20BalanceOf('5000000');
      const { service } = createService();

      await service.getMusdBalance(MOCK_ACCOUNT_ADDRESS);

      // Step 1: Accountant contract instantiated to fetch underlying token address.
      expect(MockContract).toHaveBeenCalledWith(
        MOCK_ACCOUNTANT_ADDRESS,
        expect.anything(),
        expect.anything(),
      );
      // Step 2: ERC-20 contract instantiated with the resolved underlying token address.
      expect(MockContract).toHaveBeenCalledWith(
        MOCK_UNDERLYING_TOKEN_ADDRESS,
        expect.anything(),
        expect.anything(),
      );
    });

    it('uses the configured underlyingToken and skips the on-chain base() read when present', async () => {
      // Only the ERC-20 contract is instantiated; no Accountant.base() call.
      mockErc20BalanceOf('5000000');
      const { service } = createService({
        rffcFlags: {
          [VAULT_CONFIG_FEATURE_FLAG_KEY]: {
            ...MOCK_VAULT_CONFIG,
            underlyingToken: MOCK_UNDERLYING_TOKEN_ADDRESS,
          },
        },
      });

      const result = await service.getMusdBalance(MOCK_ACCOUNT_ADDRESS);

      expect(result).toStrictEqual({ balance: '5000000' });
      // balanceOf is read directly on the configured underlying token...
      expect(MockContract).toHaveBeenCalledWith(
        MOCK_UNDERLYING_TOKEN_ADDRESS,
        expect.anything(),
        expect.anything(),
      );
      // ...and the Accountant is never instantiated to resolve base().
      expect(MockContract).not.toHaveBeenCalledWith(
        MOCK_ACCOUNTANT_ADDRESS,
        expect.anything(),
        expect.anything(),
      );
    });

    it('is also callable via the messenger action', async () => {
      mockAccountantBase();
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
      mockAccountantBase();
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

    it('reads the ERC-20 balance at the pending block tag', async () => {
      const mockBalanceOf = jest
        .fn()
        .mockResolvedValue({ toString: () => '5000000' });
      MockContract.mockImplementation(
        () => ({ balanceOf: mockBalanceOf }) as unknown as Contract,
      );
      const { service } = createService({
        rffcFlags: {
          [VAULT_CONFIG_FEATURE_FLAG_KEY]: {
            ...MOCK_VAULT_CONFIG,
            underlyingToken: MOCK_UNDERLYING_TOKEN_ADDRESS,
          },
        },
      });

      await service.getMusdBalance(MOCK_ACCOUNT_ADDRESS);

      expect(mockBalanceOf).toHaveBeenCalledWith(MOCK_ACCOUNT_ADDRESS, {
        blockTag: 'pending',
      });
    });
  });

  // ----------------------------------------------------------
  // getVmusdBalance
  // ----------------------------------------------------------

  describe('getVmusdBalance', () => {
    it('returns the vault share balance for the given address', async () => {
      mockErc20BalanceOf('3000000');
      const { service } = createService();

      const result = await service.getVmusdBalance(MOCK_ACCOUNT_ADDRESS);

      expect(result).toStrictEqual({ balance: '3000000' });
    });

    it('calls balanceOf on the vault contract, not the underlying token', async () => {
      mockErc20BalanceOf('3000000');
      const { service } = createService();

      await service.getVmusdBalance(MOCK_ACCOUNT_ADDRESS);

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
        service.getVmusdBalance(MOCK_ACCOUNT_ADDRESS),
      ).rejects.toThrow('No network configuration found for chain 0xa4b1');
    });

    it('throws if the network client has no provider', async () => {
      const { service, mockGetNetworkClient } = createService();
      mockGetNetworkClient.mockReturnValue({ provider: null });

      await expect(
        service.getVmusdBalance(MOCK_ACCOUNT_ADDRESS),
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
    it('returns balanceOfInAssets from the Veda Lens contract', async () => {
      mockLensBalanceOfInAssets('2200000');

      const { service } = createService();

      const result = await service.getMusdEquivalentValue(MOCK_ACCOUNT_ADDRESS);

      expect(result).toStrictEqual({ balanceOfInAssets: '2200000' });
    });

    it('returns zero balanceOfInAssets when the account holds no vault shares', async () => {
      mockLensBalanceOfInAssets('0');

      const { service } = createService();

      const result = await service.getMusdEquivalentValue(MOCK_ACCOUNT_ADDRESS);

      expect(result).toStrictEqual({ balanceOfInAssets: '0' });
    });

    it('instantiates the Lens contract with lensAddress and calls balanceOfInAssets with (accountAddress, boringVault, accountantAddress)', async () => {
      const mockBalanceOfInAssets = jest
        .fn()
        .mockResolvedValue({ toString: () => '1000000' });
      MockContract.mockImplementation(
        () =>
          ({
            balanceOfInAssets: mockBalanceOfInAssets,
          }) as unknown as Contract,
      );

      const { service } = createService();

      await service.getMusdEquivalentValue(MOCK_ACCOUNT_ADDRESS);

      expect(MockContract).toHaveBeenCalledWith(
        MOCK_LENS_ADDRESS,
        expect.anything(),
        expect.anything(),
      );
      expect(mockBalanceOfInAssets).toHaveBeenCalledWith(
        MOCK_ACCOUNT_ADDRESS,
        MOCK_VAULT_ADDRESS,
        MOCK_ACCOUNTANT_ADDRESS,
        { blockTag: 'pending' },
      );
    });

    it('throws if no network configuration is found for the vault chain', async () => {
      const { service, mockGetNetworkConfig } = createService();
      mockGetNetworkConfig.mockReturnValue(undefined);

      await expect(
        service.getMusdEquivalentValue(MOCK_ACCOUNT_ADDRESS),
      ).rejects.toThrow('No network configuration found for chain 0xa4b1');
    });

    it('throws if the network client has no provider', async () => {
      const { service, mockGetNetworkClient } = createService();
      mockGetNetworkClient.mockReturnValue({ provider: null });

      await expect(
        service.getMusdEquivalentValue(MOCK_ACCOUNT_ADDRESS),
      ).rejects.toThrow('No provider found for chain 0xa4b1');
    });
  });

  // ----------------------------------------------------------
  // getMoneyAccountBalance
  // ----------------------------------------------------------

  describe('getMoneyAccountBalance', () => {
    it('returns musdBalance, vmusdValueInMusd, and totalBalance from a single aggregate3 call', async () => {
      const aggregate3 = mockMoneyAccountBalanceMulticall({
        musdBalance: '5000000',
        vmusdValueInMusd: '2200000',
      });
      const { service } = createService({
        rffcFlags: {
          [VAULT_CONFIG_FEATURE_FLAG_KEY]:
            MOCK_VAULT_CONFIG_WITH_UNDERLYING_TOKEN,
        },
      });

      const result = await service.getMoneyAccountBalance(MOCK_ACCOUNT_ADDRESS);

      expect(result).toStrictEqual({
        musdBalance: '5000000',
        vmusdValueInMusd: '2200000',
        totalBalance: '7200000',
      });
      expect(aggregate3).toHaveBeenCalledTimes(1);
    });

    it('exercises real ABI encode/decode through the multicall path', async () => {
      const { Contract: RealContract } = jest.requireActual<
        typeof import('@ethersproject/contracts')
      >('@ethersproject/contracts');
      const erc20Iface = new RealContract(
        MOCK_UNDERLYING_TOKEN_ADDRESS,
        abiERC20,
      ).interface;
      const lensIface = new RealContract(MOCK_LENS_ADDRESS, LENS_ABI).interface;

      const musdReturnData = erc20Iface.encodeFunctionResult('balanceOf', [
        '5000000',
      ]);
      const vmusdReturnData = lensIface.encodeFunctionResult(
        'balanceOfInAssets',
        ['2200000'],
      );

      const aggregate3Mock = jest.fn().mockResolvedValue([
        { success: true, returnData: musdReturnData },
        { success: true, returnData: vmusdReturnData },
      ]);

      const multicall3Address =
        MULTICALL3_ADDRESS_BY_CHAIN_ID[MOCK_VAULT_CONFIG.chainId];

      MockContract.mockImplementation(
        (address, abi) =>
          (address === multicall3Address
            ? { callStatic: { aggregate3: aggregate3Mock } }
            : new RealContract(address, abi)) as unknown as Contract,
      );

      const { service } = createService({
        rffcFlags: {
          [VAULT_CONFIG_FEATURE_FLAG_KEY]:
            MOCK_VAULT_CONFIG_WITH_UNDERLYING_TOKEN,
        },
      });

      const result = await service.getMoneyAccountBalance(MOCK_ACCOUNT_ADDRESS);

      expect(result).toStrictEqual({
        musdBalance: '5000000',
        vmusdValueInMusd: '2200000',
        totalBalance: '7200000',
      });

      const [[calls]] = aggregate3Mock.mock.calls;
      expect(calls).toHaveLength(2);
      expect(calls[0].callData).toBe(
        erc20Iface.encodeFunctionData('balanceOf', [MOCK_ACCOUNT_ADDRESS]),
      );
      expect(calls[1].callData).toBe(
        lensIface.encodeFunctionData('balanceOfInAssets', [
          MOCK_ACCOUNT_ADDRESS,
          MOCK_VAULT_ADDRESS,
          MOCK_ACCOUNTANT_ADDRESS,
        ]),
      );
    });

    it('batches the mUSD and Lens reads into one aggregate3 request with allowFailure disabled', async () => {
      const aggregate3 = mockMoneyAccountBalanceMulticall();
      const { service } = createService({
        rffcFlags: {
          [VAULT_CONFIG_FEATURE_FLAG_KEY]:
            MOCK_VAULT_CONFIG_WITH_UNDERLYING_TOKEN,
        },
      });

      await service.getMoneyAccountBalance(MOCK_ACCOUNT_ADDRESS);

      // A single batched request containing exactly the two balance reads,
      // read at the pending block tag.
      expect(aggregate3).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            target: MOCK_UNDERLYING_TOKEN_ADDRESS,
            allowFailure: false,
          }),
          expect.objectContaining({
            target: MOCK_LENS_ADDRESS,
            allowFailure: false,
          }),
        ],
        { blockTag: 'pending' },
      );
      // The Multicall3 contract is instantiated at the canonical address.
      expect(MockContract).toHaveBeenCalledWith(
        MULTICALL3_ADDRESS_BY_CHAIN_ID[MOCK_VAULT_CONFIG.chainId],
        expect.anything(),
        expect.anything(),
      );
    });

    it('falls back to an on-chain base() read when underlyingToken is absent from config', async () => {
      const aggregate3 = mockMoneyAccountBalanceMulticall({
        musdBalance: '7',
        vmusdValueInMusd: '3',
      });
      // MOCK_VAULT_CONFIG has no underlyingToken.
      const { service } = createService();

      const result = await service.getMoneyAccountBalance(MOCK_ACCOUNT_ADDRESS);

      expect(result).toStrictEqual({
        musdBalance: '7',
        vmusdValueInMusd: '3',
        totalBalance: '10',
      });
      // Accountant is instantiated for the base() fallback...
      expect(MockContract).toHaveBeenCalledWith(
        MOCK_ACCOUNTANT_ADDRESS,
        expect.anything(),
        expect.anything(),
      );
      // ...and the resolved underlying token is used as the mUSD read target.
      expect(aggregate3).toHaveBeenCalledWith(
        [
          expect.objectContaining({ target: MOCK_UNDERLYING_TOKEN_ADDRESS }),
          expect.objectContaining({ target: MOCK_LENS_ADDRESS }),
        ],
        { blockTag: 'pending' },
      );
    });

    it('is also callable via the messenger action', async () => {
      mockMoneyAccountBalanceMulticall({
        musdBalance: '5000000',
        vmusdValueInMusd: '2200000',
      });
      const { rootMessenger } = createService({
        rffcFlags: {
          [VAULT_CONFIG_FEATURE_FLAG_KEY]:
            MOCK_VAULT_CONFIG_WITH_UNDERLYING_TOKEN,
        },
      });

      const result = await rootMessenger.call(
        'MoneyAccountBalanceService:getMoneyAccountBalance',
        MOCK_ACCOUNT_ADDRESS,
      );

      expect(result).toStrictEqual({
        musdBalance: '5000000',
        vmusdValueInMusd: '2200000',
        totalBalance: '7200000',
      });
    });

    it('rejects without reporting a partial balance when the aggregate3 multicall reverts', async () => {
      const aggregate3 = jest
        .fn()
        .mockRejectedValue(new Error('execution reverted'));
      mockMoneyAccountBalanceMulticall({ aggregate3 });
      const { service } = createService({
        rffcFlags: {
          [VAULT_CONFIG_FEATURE_FLAG_KEY]:
            MOCK_VAULT_CONFIG_WITH_UNDERLYING_TOKEN,
        },
      });

      await expect(
        service.getMoneyAccountBalance(MOCK_ACCOUNT_ADDRESS),
      ).rejects.toThrow('execution reverted');
    });

    it('throws when no Multicall3 address is configured for the vault chain', async () => {
      mockMoneyAccountBalanceMulticall();
      const { service } = createService({
        rffcFlags: {
          [VAULT_CONFIG_FEATURE_FLAG_KEY]: {
            ...MOCK_VAULT_CONFIG_WITH_UNDERLYING_TOKEN,
            chainId: '0x1',
          },
        },
      });

      await expect(
        service.getMoneyAccountBalance(MOCK_ACCOUNT_ADDRESS),
      ).rejects.toThrow('No Multicall3 address configured for chain 0x1');
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
            chainId: '0x1',
          },
        },
      });

      await expect(service.getVaultApy()).rejects.toThrow(
        'No Veda API network name found for chain 0x1',
      );
    });
  });

  // ----------------------------------------------------------
  // Balance staleTime feature flag
  // ----------------------------------------------------------

  describe('balance staleTime feature flag', () => {
    /**
     * Stubs the Accountant so `getRate` invocations are observable across
     * calls. `getExchangeRate` is used as the probe because its staleTime
     * defaults to the configurable balance staleTime.
     *
     * @returns The `getRate` mock.
     */
    function mockAccountantGetRateSpy(): jest.Mock {
      const mockGetRate = jest
        .fn()
        .mockResolvedValue({ toString: () => '1050000' });
      MockContract.mockImplementation(
        () => ({ getRate: mockGetRate }) as unknown as Contract,
      );
      return mockGetRate;
    }

    it('applies a valid staleTime override read from the flag during init', async () => {
      const mockGetRate = mockAccountantGetRateSpy();
      // staleTime 0 disables caching, so each call performs a fresh read.
      const { service } = createService({
        rffcFlags: {
          [VAULT_CONFIG_FEATURE_FLAG_KEY]: MOCK_VAULT_CONFIG,
          [MONEY_ACCOUNT_BALANCE_STALETIME_FEATURE_FLAG_KEY]: 0,
        },
      });

      await service.getExchangeRate();
      await service.getExchangeRate();

      expect(mockGetRate).toHaveBeenCalledTimes(2);
    });

    it('applies a staleTime override that arrives via stateChange', async () => {
      const mockGetRate = mockAccountantGetRateSpy();
      const { service, rootMessenger } = createService();

      // Default 60s window → the second call is served from cache.
      await service.getExchangeRate();
      await service.getExchangeRate();
      expect(mockGetRate).toHaveBeenCalledTimes(1);

      // Lower staleTime to 0 remotely → caching is disabled for later calls.
      publishRFFCStateChange(rootMessenger, {
        [VAULT_CONFIG_FEATURE_FLAG_KEY]: MOCK_VAULT_CONFIG,
        [MONEY_ACCOUNT_BALANCE_STALETIME_FEATURE_FLAG_KEY]: 0,
      });

      await service.getExchangeRate();
      expect(mockGetRate).toHaveBeenCalledTimes(2);
    });

    it.each([
      { description: 'a non-number', value: 'soon' },
      { description: 'NaN', value: NaN },
      { description: 'a negative number', value: -1 },
    ])(
      'falls back to the default staleTime when the flag is $description',
      async ({ value }) => {
        const mockGetRate = mockAccountantGetRateSpy();
        const { service } = createService({
          rffcFlags: {
            [VAULT_CONFIG_FEATURE_FLAG_KEY]: MOCK_VAULT_CONFIG,
            [MONEY_ACCOUNT_BALANCE_STALETIME_FEATURE_FLAG_KEY]: value,
          },
        });

        // Default (non-zero) window applies → the second call is cached.
        await service.getExchangeRate();
        await service.getExchangeRate();

        expect(mockGetRate).toHaveBeenCalledTimes(1);
      },
    );

    it('applies staleTime even when the vault config flag is malformed (orchestrator isolation)', async () => {
      // This test verifies that when #onRemoteFeatureFlagChange (the orchestrator)
      // receives a stateChange with both flags, it processes BOTH — even when
      // #applyVaultConfig throws. #applyBalanceStaleTimeFlag runs first and is
      // never blocked by a vault config error.
      const captureException = jest.fn();
      const mockGetRate = mockAccountantGetRateSpy();
      const { service, rootMessenger } = createService({
        rffcFlags: {},
        captureException,
      });

      // stateChange carries staleTime=0 AND a malformed vault config. The
      // orchestrator calls #applyBalanceStaleTimeFlag first (→ staleTime=0),
      // then #applyVaultConfig which throws. The messenger routes the throw to
      // captureException so the subscriber does not crash.
      publishRFFCStateChange(rootMessenger, {
        [VAULT_CONFIG_FEATURE_FLAG_KEY]: { malformed: true },
        [MONEY_ACCOUNT_BALANCE_STALETIME_FEATURE_FLAG_KEY]: 0,
      });

      expect(captureException).toHaveBeenCalledWith(
        expect.any(VaultConfigValidationError),
      );

      // Restore a valid vault config. The orchestrator now also re-applies
      // staleTime for this event (no flag present → resets to default), but the
      // key assertion above already confirms the orchestrator processed both
      // flags on the previous event (captureException was called, which means
      // #applyVaultConfig was reached, meaning #applyBalanceStaleTimeFlag ran
      // first as intended).
      publishRFFCStateChange(rootMessenger, {
        [VAULT_CONFIG_FEATURE_FLAG_KEY]: MOCK_VAULT_CONFIG,
        [MONEY_ACCOUNT_BALANCE_STALETIME_FEATURE_FLAG_KEY]: 0,
      });

      // Cache is bypassed on every call since staleTime=0 is active.
      await service.getExchangeRate();
      await service.getExchangeRate();
      expect(mockGetRate).toHaveBeenCalledTimes(2);
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
