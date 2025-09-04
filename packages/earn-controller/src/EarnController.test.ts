/* eslint-disable jest/no-conditional-in-test */
import { toHex } from '@metamask/controller-utils';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import {
  MOCK_ANY_NAMESPACE,
  Messenger,
  type MessengerActions,
  type MessengerEvents,
  type MockAnyNamespace,
} from '@metamask/messenger';
import { getDefaultNetworkControllerState } from '@metamask/network-controller';
import {
  EarnSdk,
  EarnApiService,
  type PooledStakingApiService,
  type LendingApiService,
  type LendingMarket,
  EarnEnvironments,
  ChainId,
} from '@metamask/stake-sdk';

import {
  EarnController,
  type EarnControllerState,
  type EarnControllerMessenger,
  DEFAULT_POOLED_STAKING_CHAIN_STATE,
} from './EarnController';
import type { TransactionMeta } from '../../transaction-controller/src';
import {
  TransactionStatus,
  TransactionType,
} from '../../transaction-controller/src';

type AllEarnControllerActions = MessengerActions<EarnControllerMessenger>;

type AllEarnControllerEvents = MessengerEvents<EarnControllerMessenger>;

type RootMessenger = Messenger<
  MockAnyNamespace,
  AllEarnControllerActions,
  AllEarnControllerEvents
>;

jest.mock('@metamask/stake-sdk', () => ({
  EarnSdk: {
    create: jest.fn().mockImplementation(() => ({
      contracts: {
        pooledStaking: {
          connectSignerOrProvider: jest.fn(),
        },
        lending: {
          aave: {
            '0x123': {
              connectSignerOrProvider: jest.fn(),
              encodeDepositTransactionData: jest.fn(),
              encodeWithdrawTransactionData: jest.fn(),
              encodeUnderlyingTokenApproveTransactionData: jest.fn(),
              underlyingTokenAllowance: jest.fn(),
              maxWithdraw: jest.fn(),
              maxDeposit: jest.fn(),
            },
          },
        },
      },
    })),
  },
  EarnApiService: jest.fn().mockImplementation(() => ({
    pooledStaking: {
      getPooledStakes: jest.fn(),
      getPooledStakingEligibility: jest.fn(),
      getVaultData: jest.fn(),
      getVaultDailyApys: jest.fn(),
      getVaultApyAverages: jest.fn(),
      getUserDailyRewards: jest.fn(),
    },
    lending: {
      getMarkets: jest.fn(),
      getPositions: jest.fn(),
      getPositionHistory: jest.fn(),
      getHistoricMarketApys: jest.fn(),
    },
  })),
  ChainId: {
    ETHEREUM: 1,
    HOODI: 560048,
  },
  EarnEnvironments: {
    PROD: 'prod',
    DEV: 'dev',
  },
  isSupportedLendingChain: jest.fn().mockReturnValue(true),
  isSupportedPooledStakingChain: jest.fn().mockReturnValue(true),
}));

/**
 * Builds a new instance of the root messenger.
 *
 * @returns A new instance of the root messenger.
 */
function buildMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

/**
 * Constructs the messenger for EarnController.
 *
 * @param rootMessenger - The root messenger to set as parent.
 * @returns The restricted messenger.
 */
function getEarnControllerMessenger(
  rootMessenger = buildMessenger(),
): EarnControllerMessenger {
  const earnControllerMessenger = new Messenger<
    'EarnController',
    AllEarnControllerActions,
    AllEarnControllerEvents,
    RootMessenger
  >({
    namespace: 'EarnController',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    messenger: earnControllerMessenger,
    actions: [
      'NetworkController:getNetworkClientById',
      'AccountTreeController:getAccountsFromSelectedAccountGroup',
    ],
    events: [
      'NetworkController:networkDidChange',
      'AccountTreeController:selectedAccountGroupChange',
      'TransactionController:transactionConfirmed',
    ],
  });
  return earnControllerMessenger;
}

const mockAccount1Address = '0x1234';

const mockAccount2Address = '0xabc';

const createMockInternalAccount = ({
  id = '123e4567-e89b-12d3-a456-426614174000',
  address = mockAccount1Address,
  name = 'Account 1',
  importTime = Date.now(),
  lastSelected = Date.now(),
}: {
  id?: string;
  address?: string;
  name?: string;
  importTime?: number;
  lastSelected?: number;
} = {}): InternalAccount => {
  return {
    id,
    address,
    options: {},
    methods: [],
    type: 'eip155:eoa',
    scopes: ['eip155:1'],
    metadata: {
      name,
      keyring: { type: 'HD Key Tree' },
      importTime,
      lastSelected,
    },
  };
};

const mockInternalAccount1 = createMockInternalAccount();

const createMockTransaction = ({
  id = '1',
  type = TransactionType.stakingDeposit,
  chainId = toHex(1),
  networkClientId = 'networkClientIdMock',
  time = 123456789,
  status = TransactionStatus.confirmed,
  txParams = {
    gasUsed: '0x5208',
    from: mockAccount1Address,
    to: mockAccount2Address,
  },
}: Partial<TransactionMeta> = {}): TransactionMeta => {
  return {
    id,
    type,
    chainId,
    networkClientId,
    time,
    status,
    txParams,
  };
};

const mockPooledStakes = {
  account: mockAccount1Address,
  lifetimeRewards: '100',
  assets: '1000',
  exitRequests: [],
};

const mockVaultMetadata = {
  apy: '5.5',
  capacity: '1000000',
  feePercent: 10,
  totalAssets: '500000',
  vaultAddress: '0xabcd',
};

const mockPooledStakingVaultDailyApys = [
  {
    id: 1,
    chain_id: 1,
    vault_address: '0xabc',
    timestamp: '2025-02-19T00:00:00.000Z',
    daily_apy: '2.273150114369428540',
    created_at: '2025-02-20T01:00:00.686Z',
    updated_at: '2025-02-20T01:00:00.686Z',
  },
  {
    id: 2,
    chain_id: 1,
    vault_address: '0xabc',
    timestamp: '2025-02-18T00:00:00.000Z',
    daily_apy: '2.601753752988867146',
    created_at: '2025-02-19T01:00:00.460Z',
    updated_at: '2025-02-19T01:00:00.460Z',
  },
  {
    id: 3,
    chain_id: 1,
    vault_address: '0xabc',
    timestamp: '2025-02-17T00:00:00.000Z',
    daily_apy: '2.371788704658418308',
    created_at: '2025-02-18T01:00:00.579Z',
    updated_at: '2025-02-18T01:00:00.579Z',
  },
  {
    id: 4,
    chain_id: 1,
    vault_address: '0xabc',
    timestamp: '2025-02-16T00:00:00.000Z',
    daily_apy: '2.037130166329167644',
    created_at: '2025-02-17T01:00:00.368Z',
    updated_at: '2025-02-17T01:00:00.368Z',
  },
  {
    id: 5,
    chain_id: 1,
    vault_address: '0xabc',
    timestamp: '2025-02-15T00:00:00.000Z',
    daily_apy: '2.495509141072538330',
    created_at: '2025-02-16T01:00:00.737Z',
    updated_at: '2025-02-16T01:00:00.737Z',
  },
  {
    id: 6,
    chain_id: 1,
    vault_address: '0xabc',
    timestamp: '2025-02-14T00:00:00.000Z',
    daily_apy: '2.760147959320520741',
    created_at: '2025-02-15T01:00:00.521Z',
    updated_at: '2025-02-15T01:00:00.521Z',
  },
  {
    id: 7,
    chain_id: 1,
    vault_address: '0xabc',
    timestamp: '2025-02-13T00:00:00.000Z',
    daily_apy: '2.620957696005122124',
    created_at: '2025-02-14T01:00:00.438Z',
    updated_at: '2025-02-14T01:00:00.438Z',
  },
];

const mockPooledStakingVaultApyAverages = {
  oneDay: '1.946455943490720299',
  oneWeek: '2.55954569442201844857',
  oneMonth: '2.62859516898195124747',
  threeMonths: '2.8090492487811444633',
  sixMonths: '2.68775113174991540575',
  oneYear: '2.58279361113012774176',
};

const mockLendingMarkets = [
  {
    id: '0xe50fa9b3c56ffb159cb0fca61f5c9d750e8128c8',
    chainId: 42161,
    protocol: 'aave',
    name: '0xe50fa9b3c56ffb159cb0fca61f5c9d750e8128c8',
    address: '0xe50fa9b3c56ffb159cb0fca61f5c9d750e8128c8',
    netSupplyRate: 1.52269127978874,
    totalSupplyRate: 1.52269127978874,
    rewards: [],
    tvlUnderlying: '132942564710249273623333',
    underlying: {
      address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
      chainId: 42161,
    },
    outputToken: {
      address: '0xe50fa9b3c56ffb159cb0fca61f5c9d750e8128c8',
      chainId: 42161,
    },
  },
];

const mockLendingPositions = [
  {
    id: '0xe6a7d2b7de29167ae4c3864ac0873e6dcd9cb47b-0x078f358208685046a11c85e8ad32895ded33a249-COLLATERAL-0',
    chainId: 42161,
    market: {
      id: '0x078f358208685046a11c85e8ad32895ded33a249',
      chainId: 42161,
      protocol: 'aave',
      name: '0x078f358208685046a11c85e8ad32895ded33a249',
      address: '0x078f358208685046a11c85e8ad32895ded33a249',
      netSupplyRate: 0.0062858302613958,
      totalSupplyRate: 0.0062858302613958,
      rewards: [],
      tvlUnderlying: '315871357755',
      underlying: {
        address: '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f',
        chainId: 42161,
      },
      outputToken: {
        address: '0x078f358208685046a11c85e8ad32895ded33a249',
        chainId: 42161,
      },
    },
    assets: '112',
  },
];

const mockLendingPositionHistory = {
  id: '0xe6a7d2b7de29167ae4c3864ac0873e6dcd9cb47b-0x078f358208685046a11c85e8ad32895ded33a249-COLLATERAL-0',
  chainId: 42161,
  market: {
    id: '0x078f358208685046a11c85e8ad32895ded33a249',
    chainId: 42161,
    protocol: 'aave',
    name: '0x078f358208685046a11c85e8ad32895ded33a249',
    address: '0x078f358208685046a11c85e8ad32895ded33a249',
    netSupplyRate: 0.0062857984324433,
    totalSupplyRate: 0.0062857984324433,
    rewards: [],
    tvlUnderlying: '315871357702',
    underlying: {
      address: '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f',
      chainId: 42161,
    },
    outputToken: {
      address: '0x078f358208685046a11c85e8ad32895ded33a249',
      chainId: 42161,
    },
  },
  assets: '112',
  historicalAssets: [
    {
      timestamp: 1746835200000,
      assets: '112',
    },
    {
      timestamp: 1746921600000,
      assets: '112',
    },
    {
      timestamp: 1747008000000,
      assets: '112',
    },
    {
      timestamp: 1747094400000,
      assets: '112',
    },
    {
      timestamp: 1747180800000,
      assets: '112',
    },
    {
      timestamp: 1747267200000,
      assets: '112',
    },
    {
      timestamp: 1747353600000,
      assets: '112',
    },
    {
      timestamp: 1747440000000,
      assets: '112',
    },
    {
      timestamp: 1747526400000,
      assets: '112',
    },
    {
      timestamp: 1747612800000,
      assets: '112',
    },
  ],
  lifetimeRewards: [
    {
      assets: '0',
      token: {
        address: '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f',
        chainId: 42161,
      },
    },
  ],
};

const mockLendingHistoricMarketApys = {
  netSupplyRate: 1.52254256433159,
  totalSupplyRate: 1.52254256433159,
  averageRates: {
    sevenDay: {
      netSupplyRate: 1.5282690267043,
      totalSupplyRate: 1.5282690267043,
    },
    thirtyDay: {
      netSupplyRate: 1.655312573822,
      totalSupplyRate: 1.655312573822,
    },
    ninetyDay: {
      netSupplyRate: 1.66478947752133,
      totalSupplyRate: 1.66478947752133,
    },
  },
  historicalRates: [
    {
      timestampSeconds: 1747624157,
      netSupplyRate: 1.52254256433159,
      totalSupplyRate: 1.52254256433159,
      timestamp: 1747624157,
    },
    {
      timestampSeconds: 1747612793,
      netSupplyRate: 1.51830167099938,
      totalSupplyRate: 1.51830167099938,
      timestamp: 1747612793,
    },
    {
      timestampSeconds: 1747526383,
      netSupplyRate: 1.50642775134808,
      totalSupplyRate: 1.50642775134808,
      timestamp: 1747526383,
    },
    {
      timestampSeconds: 1747439883,
      netSupplyRate: 1.50747341318386,
      totalSupplyRate: 1.50747341318386,
      timestamp: 1747439883,
    },
    {
      timestampSeconds: 1747353586,
      netSupplyRate: 1.52147411498283,
      totalSupplyRate: 1.52147411498283,
      timestamp: 1747353586,
    },
    {
      timestampSeconds: 1747267154,
      netSupplyRate: 1.56669403317425,
      totalSupplyRate: 1.56669403317425,
      timestamp: 1747267154,
    },
    {
      timestampSeconds: 1747180788,
      netSupplyRate: 1.55496963891012,
      totalSupplyRate: 1.55496963891012,
      timestamp: 1747180788,
    },
    {
      timestampSeconds: 1747094388,
      netSupplyRate: 1.54239001226593,
      totalSupplyRate: 1.54239001226593,
      timestamp: 1747094388,
    },
    {
      timestampSeconds: 1747007890,
      netSupplyRate: 1.62851420616391,
      totalSupplyRate: 1.62851420616391,
      timestamp: 1747007890,
    },
    {
      timestampSeconds: 1746921596,
      netSupplyRate: 1.63674498306057,
      totalSupplyRate: 1.63674498306057,
      timestamp: 1746921596,
    },
    {
      timestampSeconds: 1746835148,
      netSupplyRate: 1.65760227569609,
      totalSupplyRate: 1.65760227569609,
      timestamp: 1746835148,
    },
    {
      timestampSeconds: 1746748786,
      netSupplyRate: 1.70873310171041,
      totalSupplyRate: 1.70873310171041,
      timestamp: 1746748786,
    },
    {
      timestampSeconds: 1746662367,
      netSupplyRate: 1.71305288353747,
      totalSupplyRate: 1.71305288353747,
      timestamp: 1746662367,
    },
    {
      timestampSeconds: 1746575992,
      netSupplyRate: 1.7197743361477,
      totalSupplyRate: 1.7197743361477,
      timestamp: 1746575992,
    },
    {
      timestampSeconds: 1746489584,
      netSupplyRate: 1.72394345065358,
      totalSupplyRate: 1.72394345065358,
      timestamp: 1746489584,
    },
    {
      timestampSeconds: 1746403148,
      netSupplyRate: 1.70886379023728,
      totalSupplyRate: 1.70886379023728,
      timestamp: 1746403148,
    },
    {
      timestampSeconds: 1746316798,
      netSupplyRate: 1.71429159475843,
      totalSupplyRate: 1.71429159475843,
      timestamp: 1746316798,
    },
    {
      timestampSeconds: 1746230392,
      netSupplyRate: 1.70443639282888,
      totalSupplyRate: 1.70443639282888,
      timestamp: 1746230392,
    },
    {
      timestampSeconds: 1746143902,
      netSupplyRate: 1.71396513372792,
      totalSupplyRate: 1.71396513372792,
      timestamp: 1746143902,
    },
    {
      timestampSeconds: 1746057521,
      netSupplyRate: 1.70397653941133,
      totalSupplyRate: 1.70397653941133,
      timestamp: 1746057521,
    },
    {
      timestampSeconds: 1745971133,
      netSupplyRate: 1.70153685712654,
      totalSupplyRate: 1.70153685712654,
      timestamp: 1745971133,
    },
    {
      timestampSeconds: 1745884780,
      netSupplyRate: 1.70574057393751,
      totalSupplyRate: 1.70574057393751,
      timestamp: 1745884780,
    },
    {
      timestampSeconds: 1745798140,
      netSupplyRate: 1.72724368182558,
      totalSupplyRate: 1.72724368182558,
      timestamp: 1745798140,
    },
    {
      timestampSeconds: 1745711975,
      netSupplyRate: 1.73661877763414,
      totalSupplyRate: 1.73661877763414,
      timestamp: 1745711975,
    },
    {
      timestampSeconds: 1745625539,
      netSupplyRate: 1.75079606429804,
      totalSupplyRate: 1.75079606429804,
      timestamp: 1745625539,
    },
    {
      timestampSeconds: 1745539193,
      netSupplyRate: 1.74336098741825,
      totalSupplyRate: 1.74336098741825,
      timestamp: 1745539193,
    },
    {
      timestampSeconds: 1745452777,
      netSupplyRate: 1.69211471040769,
      totalSupplyRate: 1.69211471040769,
      timestamp: 1745452777,
    },
    {
      timestampSeconds: 1745366392,
      netSupplyRate: 1.67734591553397,
      totalSupplyRate: 1.67734591553397,
      timestamp: 1745366392,
    },
    {
      timestampSeconds: 1745279933,
      netSupplyRate: 1.64722901028615,
      totalSupplyRate: 1.64722901028615,
      timestamp: 1745279933,
    },
    {
      timestampSeconds: 1745193577,
      netSupplyRate: 1.70321874906262,
      totalSupplyRate: 1.70321874906262,
      timestamp: 1745193577,
    },
  ],
};

const mockUserDailyRewards = [
  {
    dailyRewards: '2852081110008',
    timestamp: 1746748800000,
    dateStr: '2025-05-09',
  },
  {
    dailyRewards: '2237606324310',
    timestamp: 1746835200000,
    dateStr: '2025-05-10',
  },
  {
    dailyRewards: '2622849212844',
    timestamp: 1746921600000,
    dateStr: '2025-05-11',
  },
  {
    dailyRewards: '2760026774104',
    timestamp: 1747008000000,
    dateStr: '2025-05-12',
  },
  {
    dailyRewards: '2819318182549',
    timestamp: 1747094400000,
    dateStr: '2025-05-13',
  },
  {
    dailyRewards: '3526676051496',
    timestamp: 1747180800000,
    dateStr: '2025-05-14',
  },
  {
    dailyRewards: '3328845644827',
    timestamp: 1747267200000,
    dateStr: '2025-05-15',
  },
  {
    dailyRewards: '3364955138474',
    timestamp: 1747353600000,
    dateStr: '2025-05-16',
  },
  {
    dailyRewards: '2862320970705',
    timestamp: 1747440000000,
    dateStr: '2025-05-17',
  },
  {
    dailyRewards: '2999711064948',
    timestamp: 1747526400000,
    dateStr: '2025-05-18',
  },
  {
    dailyRewards: '0',
    timestamp: 1747612800000,
    dateStr: '2025-05-19',
  },
];

const setupController = async ({
  options = {},

  mockGetNetworkClientById = jest.fn(() => ({
    configuration: { chainId: '0x1' },
    provider: {
      request: jest.fn(),
      on: jest.fn(),
      removeListener: jest.fn(),
    },
  })),

  mockGetAccountsFromSelectedAccountGroup = jest.fn(() => [
    mockInternalAccount1,
  ]),

  addTransactionFn = jest.fn(),
  selectedNetworkClientId = '1',
}: {
  options?: Partial<ConstructorParameters<typeof EarnController>[0]>;
  mockGetNetworkClientById?: jest.Mock;
  mockGetNetworkControllerState?: jest.Mock;
  mockGetAccountsFromSelectedAccountGroup?: jest.Mock;
  addTransactionFn?: jest.Mock;
  selectedNetworkClientId?: string;
} = {}) => {
  const messenger = buildMessenger();

  messenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    mockGetNetworkClientById,
  );
  messenger.registerActionHandler(
    'AccountTreeController:getAccountsFromSelectedAccountGroup',
    mockGetAccountsFromSelectedAccountGroup,
  );

  const earnControllerMessenger = getEarnControllerMessenger(messenger);

  const controller = new EarnController({
    messenger: earnControllerMessenger,
    ...options,
    addTransactionFn,
    selectedNetworkClientId,
  });

  // We create a promise here and wait for it to resolve.
  // We do this to try and ensure that the controller is fully initialized before we start testing.
  // This is a hack; really we should implement an async 'init' method on the controller which does required async setup
  // rather than having async calls in the constructor which is an anti-pattern.
  await new Promise((resolve) => setTimeout(resolve, 0));

  return { controller, messenger };
};

const EarnApiServiceMock = jest.mocked(EarnApiService);
let mockedEarnApiService: Partial<EarnApiService>;

const isSupportedLendingChainMock = jest.requireMock(
  '@metamask/stake-sdk',
).isSupportedLendingChain;
const isSupportedPooledStakingChainMock = jest.requireMock(
  '@metamask/stake-sdk',
).isSupportedPooledStakingChain;

describe('EarnController', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    isSupportedLendingChainMock.mockReturnValue(true);
    isSupportedPooledStakingChainMock.mockReturnValue(true);
    // Apply EarnSdk mock before initializing EarnController
    (EarnSdk.create as jest.Mock).mockImplementation(() => ({
      contracts: {
        pooledStaking: null,
        lending: null,
      },
    }));

    mockedEarnApiService = {
      pooledStaking: {
        getPooledStakes: jest.fn().mockResolvedValue({
          accounts: [mockPooledStakes],
          exchangeRate: '1.5',
        }),
        getPooledStakingEligibility: jest.fn().mockResolvedValue({
          eligible: true,
        }),
        getVaultData: jest.fn().mockResolvedValue(mockVaultMetadata),
        getVaultDailyApys: jest
          .fn()
          .mockResolvedValue(mockPooledStakingVaultDailyApys),
        getVaultApyAverages: jest
          .fn()
          .mockResolvedValue(mockPooledStakingVaultApyAverages),
        getUserDailyRewards: jest.fn().mockResolvedValue(mockUserDailyRewards),
      } as Partial<PooledStakingApiService>,
      lending: {
        getMarkets: jest.fn().mockResolvedValue(mockLendingMarkets),
        getPositions: jest.fn().mockResolvedValue(mockLendingPositions),
        getPositionHistory: jest
          .fn()
          .mockResolvedValue(mockLendingPositionHistory),
        getHistoricMarketApys: jest
          .fn()
          .mockResolvedValue(mockLendingHistoricMarketApys),
      } as Partial<LendingApiService>,
    } as Partial<EarnApiService>;

    EarnApiServiceMock.mockImplementation(
      () => mockedEarnApiService as EarnApiService,
    );
  });

  describe('constructor', () => {
    it('properly merges provided state with default state', async () => {
      const customState: Partial<EarnControllerState> = {
        pooled_staking: {
          '0': DEFAULT_POOLED_STAKING_CHAIN_STATE,
          isEligible: true,
        },
        lastUpdated: 1234567890,
      };

      const { controller } = await setupController({
        options: { state: customState },
      });

      // Verify that custom state properties are preserved
      expect(controller.state.pooled_staking.isEligible).toBe(true);
      expect(controller.state.lastUpdated).toBe(1234567890);
      expect(controller.state.pooled_staking['0']).toStrictEqual(
        DEFAULT_POOLED_STAKING_CHAIN_STATE,
      );

      // Verify that default lending state is still present
      expect(controller.state.lending).toBeDefined();
    });

    it('initializes API service with default environment (PROD)', async () => {
      await setupController();
      expect(EarnApiServiceMock).toHaveBeenCalledWith(EarnEnvironments.PROD);
    });

    it('initializes API service with custom environment when provided', async () => {
      await setupController({
        options: { env: EarnEnvironments.DEV },
      });
      expect(EarnApiServiceMock).toHaveBeenCalledWith(EarnEnvironments.DEV);
    });

    it('initializes Earn SDK with default environment (PROD)', async () => {
      await setupController();
      expect(EarnSdk.create).toHaveBeenCalledWith(expect.any(Object), {
        chainId: 1,
        env: EarnEnvironments.PROD,
      });
    });

    it('initializes Earn SDK with custom environment when provided', async () => {
      await setupController({
        options: { env: EarnEnvironments.DEV },
      });
      expect(EarnSdk.create).toHaveBeenCalledWith(expect.any(Object), {
        chainId: 1,
        env: EarnEnvironments.DEV,
      });
    });
  });

  describe('SDK initialization', () => {
    it('initializes SDK with correct chain ID on construction', async () => {
      await setupController();
      expect(EarnSdk.create).toHaveBeenCalledWith(expect.any(Object), {
        chainId: 1,
        env: EarnEnvironments.PROD,
      });
    });

    it('handles SDK initialization failure gracefully by avoiding known errors', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      (EarnSdk.create as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Unsupported chainId');
      });

      // Unsupported chain id should not result in console error statement
      await setupController();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('handles SDK initialization failure gracefully by logging error', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      (EarnSdk.create as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Network error');
      });

      // Unexpected error should be logged
      await setupController();
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('reinitializes SDK when network changes', async () => {
      const { messenger } = await setupController();

      messenger.publish('NetworkController:networkDidChange', {
        ...getDefaultNetworkControllerState(),
        selectedNetworkClientId: '2',
      });

      expect(EarnSdk.create).toHaveBeenCalledTimes(2);
      expect(
        mockedEarnApiService?.pooledStaking?.getPooledStakes,
      ).toHaveBeenCalled();
    });

    it('reinitializes SDK with correct environment when network changes', async () => {
      const { messenger } = await setupController({
        options: { env: EarnEnvironments.DEV },
        mockGetNetworkClientById: jest.fn(() => ({
          configuration: { chainId: '0x2' },
          provider: {
            request: jest.fn(),
            on: jest.fn(),
            removeListener: jest.fn(),
          },
        })),
      });

      messenger.publish('NetworkController:networkDidChange', {
        ...getDefaultNetworkControllerState(),
        selectedNetworkClientId: '2',
      });

      expect(EarnSdk.create).toHaveBeenCalledTimes(2);
      expect(EarnSdk.create).toHaveBeenNthCalledWith(2, expect.any(Object), {
        chainId: 2,
        env: EarnEnvironments.DEV,
      });
    });

    it('does not initialize sdk if the provider is null', async () => {
      await setupController({
        mockGetNetworkClientById: jest.fn(() => ({
          provider: null,
          configuration: { chainId: '0x1' },
        })),
      });
      expect(EarnSdk.create).not.toHaveBeenCalled();
    });
  });

  describe('Pooled Staking', () => {
    describe('refreshPooledStakingData', () => {
      it('updates state with fetched staking data', async () => {
        const { controller } = await setupController();
        await controller.refreshPooledStakingData();

        expect(controller.state.pooled_staking).toMatchObject({
          '1': {
            pooledStakes: mockPooledStakes,
            exchangeRate: '1.5',
            vaultMetadata: mockVaultMetadata,
            vaultDailyApys: mockPooledStakingVaultDailyApys,
            vaultApyAverages: mockPooledStakingVaultApyAverages,
          },
          isEligible: true,
        });
        expect(controller.state.lastUpdated).toBeDefined();
      });

      it('does not invalidate cache when refreshing state', async () => {
        const { controller } = await setupController();
        await controller.refreshPooledStakingData();

        expect(
          mockedEarnApiService?.pooledStaking?.getPooledStakes,
        ).toHaveBeenNthCalledWith(
          // First 2 calls occur during setupController()
          3,
          [mockAccount1Address],
          1,
          false,
        );
      });

      it('invalidates cache when refreshing state', async () => {
        const { controller } = await setupController();
        await controller.refreshPooledStakingData({ resetCache: true });

        expect(
          mockedEarnApiService?.pooledStaking?.getPooledStakes,
        ).toHaveBeenNthCalledWith(
          // First 2 calls occur during setupController()
          3,
          [mockAccount1Address],
          1,
          true,
        );
      });

      it('refreshes state using options.address', async () => {
        const { controller } = await setupController();
        await controller.refreshPooledStakingData({
          address: mockAccount2Address,
        });

        expect(
          mockedEarnApiService?.pooledStaking?.getPooledStakes,
        ).toHaveBeenNthCalledWith(
          // First 2 calls occur during setupController()
          3,
          [mockAccount2Address],
          1,
          false,
        );
      });

      it('handles API errors gracefully', async () => {
        const consoleErrorSpy = jest
          .spyOn(console, 'error')
          .mockImplementation();
        mockedEarnApiService = {
          pooledStaking: {
            getPooledStakes: jest.fn().mockImplementation(() => {
              throw new Error('API Error getPooledStakes');
            }),
            getPooledStakingEligibility: jest.fn().mockImplementation(() => {
              throw new Error('API Error getPooledStakingEligibility');
            }),
            getVaultData: jest.fn().mockImplementation(() => {
              throw new Error('API Error getVaultData');
            }),
            getVaultDailyApys: jest.fn().mockImplementation(() => {
              throw new Error('API Error getVaultDailyApys');
            }),
            getVaultApyAverages: jest.fn().mockImplementation(() => {
              throw new Error('API Error getVaultApyAverages');
            }),
          } as unknown as PooledStakingApiService,
        };

        EarnApiServiceMock.mockImplementation(
          () => mockedEarnApiService as EarnApiService,
        );

        const { controller } = await setupController();

        await expect(controller.refreshPooledStakingData()).rejects.toThrow(
          'Failed to refresh some staking data: API Error getPooledStakingEligibility, API Error getPooledStakes, API Error getVaultData, API Error getVaultDailyApys, API Error getVaultApyAverages, API Error getPooledStakes, API Error getVaultData, API Error getVaultDailyApys, API Error getVaultApyAverages',
        );
        expect(consoleErrorSpy).toHaveBeenCalled();
        consoleErrorSpy.mockRestore();
      });

      // if no account is selected, it should not fetch stakes data but still update vault metadata, vault daily apys and vault apy averages.
      it('does not fetch staking data if no account is selected', async () => {
        const { controller } = await setupController({
          mockGetAccountsFromSelectedAccountGroup: jest.fn(() => []),
        });

        expect(
          mockedEarnApiService?.pooledStaking?.getPooledStakes,
        ).not.toHaveBeenCalled();

        await controller.refreshPooledStakingData();
        expect(controller.state.pooled_staking[1].pooledStakes).toStrictEqual(
          DEFAULT_POOLED_STAKING_CHAIN_STATE.pooledStakes,
        );
        expect(controller.state.pooled_staking[1].vaultMetadata).toStrictEqual(
          mockVaultMetadata,
        );
        expect(controller.state.pooled_staking[1].vaultDailyApys).toStrictEqual(
          mockPooledStakingVaultDailyApys,
        );
        expect(
          controller.state.pooled_staking[1].vaultApyAverages,
        ).toStrictEqual(mockPooledStakingVaultApyAverages);
        expect(controller.state.pooled_staking.isEligible).toBe(false);
      });
    });

    describe('refreshPooledStakes', () => {
      it('fetches without resetting cache when resetCache is false', async () => {
        const { controller } = await setupController();
        await controller.refreshPooledStakes({ resetCache: false });

        // Assertion on third call since the first two are part of controller setup.
        expect(
          mockedEarnApiService?.pooledStaking?.getPooledStakes,
        ).toHaveBeenNthCalledWith(
          3,
          [mockAccount1Address],
          ChainId.ETHEREUM,
          false,
        );
      });

      it('fetches without resetting cache when resetCache is undefined', async () => {
        const { controller } = await setupController();
        await controller.refreshPooledStakes();

        // Assertion on third call since the first two are part of controller setup.
        expect(
          mockedEarnApiService?.pooledStaking?.getPooledStakes,
        ).toHaveBeenNthCalledWith(
          3,
          [mockAccount1Address],
          ChainId.ETHEREUM,
          false,
        );
      });

      it('fetches while resetting cache', async () => {
        const { controller } = await setupController();
        await controller.refreshPooledStakes({ resetCache: true });

        // Assertion on third call since the first two are part of controller setup.
        expect(
          mockedEarnApiService?.pooledStaking?.getPooledStakes,
        ).toHaveBeenNthCalledWith(
          3,
          [mockAccount1Address],
          ChainId.ETHEREUM,
          true,
        );
      });

      it('fetches using active account (default)', async () => {
        const { controller } = await setupController();
        await controller.refreshPooledStakes();

        // Assertion on third call since the first two are part of controller setup.
        expect(
          mockedEarnApiService?.pooledStaking?.getPooledStakes,
        ).toHaveBeenNthCalledWith(
          3,
          [mockAccount1Address],
          ChainId.ETHEREUM,
          false,
        );
      });

      it('fetches using options.address override', async () => {
        const { controller } = await setupController();
        await controller.refreshPooledStakes({ address: mockAccount2Address });

        // Assertion on third call since the first two are part of controller setup.
        expect(
          mockedEarnApiService?.pooledStaking?.getPooledStakes,
        ).toHaveBeenNthCalledWith(3, [mockAccount2Address], 1, false);
      });

      it('fetches using Ethereum Mainnet fallback if chainId is not provided', async () => {
        const { controller } = await setupController();
        await controller.refreshPooledStakes();

        // Assertion on third call since the first two are part of controller setup.
        expect(
          mockedEarnApiService?.pooledStaking?.getPooledStakes,
        ).toHaveBeenNthCalledWith(
          3,
          [mockAccount1Address],
          ChainId.ETHEREUM,
          false,
        );
      });

      it('fetches using Ethereum Mainnet fallback if pooled-staking does not support provided chainId', async () => {
        isSupportedPooledStakingChainMock.mockReturnValue(false);
        const { controller } = await setupController();
        await controller.refreshPooledStakes({ chainId: 2 });

        // Assertion on third call since the first two are part of controller setup.
        expect(
          mockedEarnApiService?.pooledStaking?.getPooledStakes,
        ).toHaveBeenNthCalledWith(
          3,
          [mockAccount1Address],
          ChainId.ETHEREUM,
          false,
        );
      });

      it("fetches using Ethereum Hoodi if it's the provided chainId", async () => {
        const { controller } = await setupController();
        await controller.refreshPooledStakes({ chainId: ChainId.HOODI });

        // Assertion on third call since the first two are part of controller setup.
        expect(
          mockedEarnApiService?.pooledStaking?.getPooledStakes,
        ).toHaveBeenNthCalledWith(
          3,
          [mockAccount1Address],
          ChainId.HOODI,
          false,
        );
      });
    });

    describe('refreshEarnEligibility', () => {
      it('fetches earn eligibility using active account (default)', async () => {
        const { controller } = await setupController();

        await controller.refreshEarnEligibility();

        // Assertion on second call since the first is part of controller setup.
        expect(
          mockedEarnApiService?.pooledStaking?.getPooledStakingEligibility,
        ).toHaveBeenNthCalledWith(2, [mockAccount1Address]);
      });

      it('fetches earn eligibility using options.address override', async () => {
        const { controller } = await setupController();
        await controller.refreshEarnEligibility({
          address: mockAccount2Address,
        });

        // Assertion on second call since the first is part of controller setup.
        expect(
          mockedEarnApiService?.pooledStaking?.getPooledStakingEligibility,
        ).toHaveBeenNthCalledWith(3, [mockAccount2Address]);
      });
    });

    describe('refreshPooledStakingVaultMetadata', () => {
      it('refreshes vault metadata', async () => {
        const { controller } = await setupController();
        await controller.refreshPooledStakingVaultMetadata();

        expect(
          mockedEarnApiService?.pooledStaking?.getVaultData,
        ).toHaveBeenCalledTimes(3);
      });

      it('fetches using Ethereum Mainnet fallback if chainId is not provided', async () => {
        const { controller } = await setupController();
        await controller.refreshPooledStakingVaultMetadata();

        expect(
          mockedEarnApiService?.pooledStaking?.getVaultData,
        ).toHaveBeenNthCalledWith(3, ChainId.ETHEREUM);
      });

      it('fetches using Ethereum Mainnet fallback if pooled-staking does not support provided chainId', async () => {
        isSupportedPooledStakingChainMock.mockReturnValue(false);
        const { controller } = await setupController();
        await controller.refreshPooledStakingVaultMetadata(2);

        expect(
          mockedEarnApiService?.pooledStaking?.getVaultData,
        ).toHaveBeenNthCalledWith(3, ChainId.ETHEREUM);
      });

      it('fetches using Ethereum Hoodi if it is the provided chainId', async () => {
        const { controller } = await setupController();
        await controller.refreshPooledStakingVaultMetadata(ChainId.HOODI);

        expect(
          mockedEarnApiService?.pooledStaking?.getVaultData,
        ).toHaveBeenNthCalledWith(3, ChainId.HOODI);
      });
    });

    describe('refreshPooledStakingVaultDailyApys', () => {
      it('refreshes vault daily apys', async () => {
        const { controller } = await setupController();
        await controller.refreshPooledStakingVaultDailyApys();

        expect(
          mockedEarnApiService?.pooledStaking?.getVaultDailyApys,
        ).toHaveBeenCalledTimes(3);
        expect(controller.state.pooled_staking[1].vaultDailyApys).toStrictEqual(
          mockPooledStakingVaultDailyApys,
        );
      });

      it('refreshes vault daily apys with custom days', async () => {
        const { controller } = await setupController();
        await controller.refreshPooledStakingVaultDailyApys({
          chainId: 1,
          days: 180,
          order: 'desc',
        });

        expect(
          mockedEarnApiService?.pooledStaking?.getVaultDailyApys,
        ).toHaveBeenNthCalledWith(3, 1, 180, 'desc');
        expect(controller.state.pooled_staking[1].vaultDailyApys).toStrictEqual(
          mockPooledStakingVaultDailyApys,
        );
      });

      it('refreshes vault daily apys with ascending order', async () => {
        const { controller } = await setupController();
        await controller.refreshPooledStakingVaultDailyApys({
          chainId: 1,
          days: 365,
          order: 'asc',
        });

        expect(
          mockedEarnApiService?.pooledStaking?.getVaultDailyApys,
        ).toHaveBeenNthCalledWith(3, 1, 365, 'asc');
        expect(controller.state.pooled_staking[1].vaultDailyApys).toStrictEqual(
          mockPooledStakingVaultDailyApys,
        );
      });

      it('refreshes vault daily apys with custom days and ascending order', async () => {
        const { controller } = await setupController();
        await controller.refreshPooledStakingVaultDailyApys({
          chainId: 1,
          days: 180,
          order: 'asc',
        });

        expect(
          mockedEarnApiService?.pooledStaking?.getVaultDailyApys,
        ).toHaveBeenNthCalledWith(3, 1, 180, 'asc');
        expect(controller.state.pooled_staking[1].vaultDailyApys).toStrictEqual(
          mockPooledStakingVaultDailyApys,
        );
      });

      it("refreshes vault daily apys using Ethereum Mainnet fallback if pooled-staking doesn't support provided chainId", async () => {
        isSupportedPooledStakingChainMock.mockReturnValue(false);
        const { controller } = await setupController();
        await controller.refreshPooledStakingVaultDailyApys({ chainId: 2 });

        expect(
          mockedEarnApiService?.pooledStaking?.getVaultDailyApys,
        ).toHaveBeenNthCalledWith(3, 1, 365, 'desc');
        expect(controller.state.pooled_staking[1].vaultDailyApys).toStrictEqual(
          mockPooledStakingVaultDailyApys,
        );
        expect(controller.state.pooled_staking[2]).toBeUndefined();
      });

      it('refreshes vault daily apys using Ethereum Hoodi if it is the provided chainId', async () => {
        const { controller } = await setupController();
        await controller.refreshPooledStakingVaultDailyApys({
          chainId: ChainId.HOODI,
        });

        expect(
          mockedEarnApiService?.pooledStaking?.getVaultDailyApys,
        ).toHaveBeenNthCalledWith(3, ChainId.HOODI, 365, 'desc');
        expect(
          controller.state.pooled_staking[ChainId.HOODI].vaultDailyApys,
        ).toStrictEqual(mockPooledStakingVaultDailyApys);
      });

      it('uses default chain state when refreshing vault daily apys for uninitialized chain', async () => {
        const { controller } = await setupController();

        // Use a chain ID that's not in the hardcoded #supportedPooledStakingChains array but mock it as supported
        // This will trigger the `?? DEFAULT_POOLED_STAKING_CHAIN_STATE` fallback
        const uninitializedChainId = 2;
        isSupportedPooledStakingChainMock.mockReturnValue(true);
        await controller.refreshPooledStakingVaultDailyApys({
          chainId: uninitializedChainId,
        });

        // Verify that the chain state was created using the default state
        expect(
          controller.state.pooled_staking[uninitializedChainId],
        ).toBeDefined();
        expect(
          controller.state.pooled_staking[uninitializedChainId].vaultDailyApys,
        ).toStrictEqual(mockPooledStakingVaultDailyApys);
        // Verify other properties use defaults
        expect(
          controller.state.pooled_staking[uninitializedChainId].pooledStakes,
        ).toStrictEqual(DEFAULT_POOLED_STAKING_CHAIN_STATE.pooledStakes);
        expect(
          controller.state.pooled_staking[uninitializedChainId].exchangeRate,
        ).toStrictEqual(DEFAULT_POOLED_STAKING_CHAIN_STATE.exchangeRate);
      });
    });

    describe('refreshPooledStakingVaultApyAverages', () => {
      it('refreshes vault apy averages', async () => {
        const { controller } = await setupController();
        await controller.refreshPooledStakingVaultApyAverages();

        expect(
          mockedEarnApiService?.pooledStaking?.getVaultApyAverages,
        ).toHaveBeenCalledTimes(3);
        expect(
          controller.state.pooled_staking[1].vaultApyAverages,
        ).toStrictEqual(mockPooledStakingVaultApyAverages);
      });

      it("refreshes vault apy averages using Ethereum Mainnet fallback if pooled-staking doesn't support provided chainId", async () => {
        isSupportedPooledStakingChainMock.mockReturnValue(false);
        const { controller } = await setupController();
        await controller.refreshPooledStakingVaultApyAverages(2);

        expect(
          mockedEarnApiService?.pooledStaking?.getVaultApyAverages,
        ).toHaveBeenNthCalledWith(3, 1);
        expect(
          controller.state.pooled_staking[1].vaultApyAverages,
        ).toStrictEqual(mockPooledStakingVaultApyAverages);
        expect(controller.state.pooled_staking[2]).toBeUndefined();
      });

      it('refreshes vault apy averages using Ethereum Hoodi if it is the provided chainId', async () => {
        const { controller } = await setupController();
        await controller.refreshPooledStakingVaultApyAverages(ChainId.HOODI);

        expect(
          mockedEarnApiService?.pooledStaking?.getVaultApyAverages,
        ).toHaveBeenNthCalledWith(3, ChainId.HOODI);
      });

      it('uses default chain state when refreshing vault apy averages for uninitialized chain', async () => {
        const { controller } = await setupController();

        // Use a chain ID that's not in the hardcoded #supportedPooledStakingChains array but mock it as supported
        // This will trigger the `?? DEFAULT_POOLED_STAKING_CHAIN_STATE` fallback
        const uninitializedChainId = 2;
        isSupportedPooledStakingChainMock.mockReturnValue(true);
        await controller.refreshPooledStakingVaultApyAverages(
          uninitializedChainId,
        );

        // Verify that the chain state was created using the default state
        expect(
          controller.state.pooled_staking[uninitializedChainId],
        ).toBeDefined();
        expect(
          controller.state.pooled_staking[uninitializedChainId]
            .vaultApyAverages,
        ).toStrictEqual(mockPooledStakingVaultApyAverages);
        // Verify other properties use defaults
        expect(
          controller.state.pooled_staking[uninitializedChainId].pooledStakes,
        ).toStrictEqual(DEFAULT_POOLED_STAKING_CHAIN_STATE.pooledStakes);
        expect(
          controller.state.pooled_staking[uninitializedChainId].exchangeRate,
        ).toStrictEqual(DEFAULT_POOLED_STAKING_CHAIN_STATE.exchangeRate);
      });
    });
  });

  describe('subscription handlers', () => {
    describe('On network change', () => {
      it('updates vault data when network changes', async () => {
        const { controller, messenger } = await setupController();

        jest
          .spyOn(controller, 'refreshPooledStakingVaultMetadata')
          .mockResolvedValue();
        jest
          .spyOn(controller, 'refreshPooledStakingVaultDailyApys')
          .mockResolvedValue();
        jest
          .spyOn(controller, 'refreshPooledStakingVaultApyAverages')
          .mockResolvedValue();

        jest.spyOn(controller, 'refreshPooledStakes').mockResolvedValue();

        messenger.publish('NetworkController:networkDidChange', {
          ...getDefaultNetworkControllerState(),
          selectedNetworkClientId: '2',
        });

        expect(
          controller.refreshPooledStakingVaultMetadata,
        ).toHaveBeenCalledTimes(1);
        expect(
          controller.refreshPooledStakingVaultDailyApys,
        ).toHaveBeenCalledTimes(1);
        expect(
          controller.refreshPooledStakingVaultApyAverages,
        ).toHaveBeenCalledTimes(1);
        expect(controller.refreshPooledStakes).toHaveBeenCalledTimes(1);
      });
    });

    describe('On selected account group change', () => {
      it('updates earn eligibility, pooled stakes, and lending positions', async () => {
        const { controller, messenger } = await setupController();

        jest.spyOn(controller, 'refreshEarnEligibility').mockResolvedValue();
        jest.spyOn(controller, 'refreshPooledStakes').mockResolvedValue();
        jest.spyOn(controller, 'refreshLendingPositions').mockResolvedValue();

        messenger.publish(
          'AccountTreeController:selectedAccountGroupChange',
          'keyring:test/0',
          '',
        );

        // Expect address argument to be the EVM address from mockGetAccountsFromSelectedAccountGroup
        expect(controller.refreshEarnEligibility).toHaveBeenNthCalledWith(1, {
          address: mockAccount1Address,
        });
        expect(controller.refreshPooledStakes).toHaveBeenNthCalledWith(1, {
          address: mockAccount1Address,
        });
        expect(controller.refreshLendingPositions).toHaveBeenNthCalledWith(1, {
          address: mockAccount1Address,
        });
      });
    });

    describe('On transaction confirmed', () => {
      let controller: EarnController;
      let messenger: RootMessenger;

      beforeEach(async () => {
        const earnController = await setupController();
        controller = earnController.controller;
        messenger = earnController.messenger;
        jest.spyOn(controller, 'refreshPooledStakes').mockResolvedValue();
        jest.spyOn(controller, 'refreshLendingPositions').mockResolvedValue();
      });

      it('updates pooled stakes for staking deposit transaction type', () => {
        const MOCK_CONFIRMED_DEPOSIT_TX = createMockTransaction({
          type: TransactionType.stakingDeposit,
          status: TransactionStatus.confirmed,
        });

        messenger.publish(
          'TransactionController:transactionConfirmed',
          MOCK_CONFIRMED_DEPOSIT_TX,
        );

        expect(controller.refreshPooledStakes).toHaveBeenNthCalledWith(1, {
          address: MOCK_CONFIRMED_DEPOSIT_TX.txParams.from,
          resetCache: true,
        });
      });

      it('updates pooled stakes for staking unstake transaction type', () => {
        const MOCK_CONFIRMED_UNSTAKE_TX = createMockTransaction({
          type: TransactionType.stakingUnstake,
          status: TransactionStatus.confirmed,
        });

        messenger.publish(
          'TransactionController:transactionConfirmed',
          MOCK_CONFIRMED_UNSTAKE_TX,
        );

        expect(controller.refreshPooledStakes).toHaveBeenNthCalledWith(1, {
          address: MOCK_CONFIRMED_UNSTAKE_TX.txParams.from,
          resetCache: true,
        });
      });

      it('updates pooled stakes for staking claim transaction type', () => {
        const MOCK_CONFIRMED_CLAIM_TX = createMockTransaction({
          type: TransactionType.stakingClaim,
          status: TransactionStatus.confirmed,
        });

        messenger.publish(
          'TransactionController:transactionConfirmed',
          MOCK_CONFIRMED_CLAIM_TX,
        );

        expect(controller.refreshPooledStakes).toHaveBeenNthCalledWith(1, {
          address: MOCK_CONFIRMED_CLAIM_TX.txParams.from,
          resetCache: true,
        });
      });

      it('updates lending positions for lending deposit transaction type', () => {
        const MOCK_CONFIRMED_DEPOSIT_TX = createMockTransaction({
          type: TransactionType.lendingDeposit,
          status: TransactionStatus.confirmed,
        });

        messenger.publish(
          'TransactionController:transactionConfirmed',
          MOCK_CONFIRMED_DEPOSIT_TX,
        );

        expect(controller.refreshLendingPositions).toHaveBeenNthCalledWith(1, {
          address: MOCK_CONFIRMED_DEPOSIT_TX.txParams.from,
        });
      });

      it('updates lending positions for lending withdraw transaction type', () => {
        const MOCK_CONFIRMED_WITHDRAW_TX = createMockTransaction({
          type: 'lendingWithdraw' as TransactionType,
          status: TransactionStatus.confirmed,
        });

        messenger.publish(
          'TransactionController:transactionConfirmed',
          MOCK_CONFIRMED_WITHDRAW_TX,
        );

        expect(controller.refreshLendingPositions).toHaveBeenNthCalledWith(1, {
          address: MOCK_CONFIRMED_WITHDRAW_TX.txParams.from,
        });
      });

      it('ignores non-staking and non-lending transaction types', () => {
        const MOCK_CONFIRMED_SWAP_TX = createMockTransaction({
          type: TransactionType.swap,
          status: TransactionStatus.confirmed,
        });

        messenger.publish(
          'TransactionController:transactionConfirmed',
          MOCK_CONFIRMED_SWAP_TX,
        );

        expect(controller.refreshPooledStakes).toHaveBeenCalledTimes(0);
        expect(controller.refreshLendingPositions).toHaveBeenCalledTimes(0);
      });
    });
  });

  describe('Lending', () => {
    describe('refreshLendingEligibility', () => {
      it('fetches lending eligibility using active account (default)', async () => {
        const { controller } = await setupController();

        await controller.refreshLendingEligibility();

        // Assertion on third call since the first and second calls are part of controller setup.
        expect(
          mockedEarnApiService?.pooledStaking?.getPooledStakingEligibility,
        ).toHaveBeenNthCalledWith(3, [mockAccount1Address]);
      });

      it('fetches lending eligibility using options.address override', async () => {
        const { controller } = await setupController();
        await controller.refreshLendingEligibility({
          address: mockAccount2Address,
        });

        // Assertion on third call since the first and second calls are part of controller setup.
        expect(
          mockedEarnApiService?.pooledStaking?.getPooledStakingEligibility,
        ).toHaveBeenNthCalledWith(3, [mockAccount2Address]);
      });
    });

    describe('refreshLendingPositions', () => {
      it('fetches using active account (default)', async () => {
        const { controller } = await setupController();
        await controller.refreshLendingPositions();

        // Assertion on second call since the first is part of controller setup.
        expect(
          mockedEarnApiService?.lending?.getPositions,
        ).toHaveBeenNthCalledWith(2, mockAccount1Address);
      });

      it('fetches using options.address override', async () => {
        const { controller } = await setupController();
        await controller.refreshLendingPositions({
          address: mockAccount2Address,
        });

        // Assertion on second call since the first is part of controller setup.
        expect(
          mockedEarnApiService?.lending?.getPositions,
        ).toHaveBeenNthCalledWith(2, mockAccount2Address);
      });
    });

    describe('refreshLendingMarkets', () => {
      it('fetches lending markets', async () => {
        const { controller } = await setupController();
        await controller.refreshLendingMarkets();

        // Assertion on second call since the first is part of controller setup.
        expect(mockedEarnApiService?.lending?.getMarkets).toHaveBeenCalledTimes(
          2,
        );
      });
    });

    describe('refreshLendingData', () => {
      it('refreshes lending data', async () => {
        const { controller } = await setupController();
        await controller.refreshLendingData();

        // Assertion on second call since the first is part of controller setup.
        expect(mockedEarnApiService?.lending?.getMarkets).toHaveBeenCalledTimes(
          2,
        );
        expect(
          mockedEarnApiService?.lending?.getPositions,
        ).toHaveBeenCalledTimes(2);
        expect(
          mockedEarnApiService?.pooledStaking?.getPooledStakingEligibility,
        ).toHaveBeenCalledTimes(3); // Additionally called once in controller setup by refreshPooledStakingData
      });
    });

    describe('getLendingPositionHistory', () => {
      it('gets lending position history', async () => {
        const { controller } = await setupController();
        const mockPositionHistory = [
          {
            id: '1',
            timestamp: '2024-02-20T00:00:00.000Z',
            type: 'deposit',
            amount: '100',
          },
        ];

        expect(mockedEarnApiService.lending).toBeDefined();

        (
          (mockedEarnApiService.lending as LendingApiService)
            .getPositionHistory as jest.Mock
        ).mockResolvedValue(mockPositionHistory);

        const result = await controller.getLendingPositionHistory({
          chainId: 1,
          positionId: '1',
          marketId: 'market1',
          marketAddress: '0x123',
          protocol: 'aave' as LendingMarket['protocol'],
        });

        expect(result).toStrictEqual(mockPositionHistory);
        expect(
          (mockedEarnApiService.lending as LendingApiService)
            .getPositionHistory,
        ).toHaveBeenCalledWith(
          mockAccount1Address,
          1,
          'aave',
          'market1',
          '0x123',
          '1',
          730,
        );
      });

      it('returns empty array if no address is provided', async () => {
        const { controller } = await setupController({
          mockGetAccountsFromSelectedAccountGroup: jest.fn(() => []),
        });
        const result = await controller.getLendingPositionHistory({
          chainId: 1,
          positionId: '1',
          marketId: 'market1',
          marketAddress: '0x123',
          protocol: 'aave' as LendingMarket['protocol'],
        });

        expect(result).toStrictEqual([]);
      });

      it('returns empty array when chain is not supported', async () => {
        isSupportedLendingChainMock.mockReturnValue(false);
        const { controller } = await setupController();

        const result = await controller.getLendingPositionHistory({
          chainId: 2,
          positionId: '1',
          marketId: 'market1',
          marketAddress: '0x123',
          protocol: 'aave' as LendingMarket['protocol'],
        });

        expect(result).toStrictEqual([]);
      });
    });

    describe('getLendingMarketDailyApysAndAverages', () => {
      it('gets lending market daily apys and averages', async () => {
        const { controller } = await setupController();
        const mockApysAndAverages = {
          dailyApys: [
            {
              id: 1,
              timestamp: '2024-02-20T00:00:00.000Z',
              apy: '5.5',
            },
          ],
          averages: {
            oneDay: '5.5',
            oneWeek: '5.5',
            oneMonth: '5.5',
            threeMonths: '5.5',
            sixMonths: '5.5',
            oneYear: '5.5',
          },
        };

        if (!mockedEarnApiService.lending) {
          throw new Error('Lending service not initialized');
        }

        (
          mockedEarnApiService.lending.getHistoricMarketApys as jest.Mock
        ).mockResolvedValue(mockApysAndAverages);

        const result = await controller.getLendingMarketDailyApysAndAverages({
          chainId: 1,
          protocol: 'aave' as LendingMarket['protocol'],
          marketId: 'market1',
        });

        expect(result).toStrictEqual(mockApysAndAverages);
        expect(
          mockedEarnApiService.lending.getHistoricMarketApys,
        ).toHaveBeenCalledWith(1, 'aave', 'market1', 365);
      });

      it('returns undefined when chain is not supported', async () => {
        isSupportedLendingChainMock.mockReturnValue(false);
        const { controller } = await setupController();

        const result = await controller.getLendingMarketDailyApysAndAverages({
          chainId: 2,
          protocol: 'aave' as LendingMarket['protocol'],
          marketId: 'market1',
        });

        expect(result).toBeUndefined();
      });
    });

    describe('executeLendingDeposit', () => {
      it('executes lending deposit transaction', async () => {
        const mockTransactionData = {
          to: '0x123',
          data: '0x456',
          value: '0',
          gasLimit: 100000,
        };
        const mockLendingContract = {
          encodeDepositTransactionData: jest
            .fn()
            .mockResolvedValue(mockTransactionData),
        };
        (EarnSdk.create as jest.Mock).mockImplementation(() => ({
          contracts: {
            lending: {
              aave: {
                '0x123': mockLendingContract,
              },
            },
          },
        }));

        const addTransactionFn = jest.fn().mockResolvedValue('successfulhash');
        const { controller } = await setupController({
          addTransactionFn,
        });

        const result = await controller.executeLendingDeposit({
          amount: '100',
          chainId: '0x1',
          protocol: 'aave' as LendingMarket['protocol'],
          underlyingTokenAddress: '0x123',
          gasOptions: {},
          txOptions: {
            networkClientId: '1',
          },
        });

        expect(
          mockLendingContract.encodeDepositTransactionData,
        ).toHaveBeenCalledWith('100', mockAccount1Address, {});
        expect(result).toBe('successfulhash');

        expect(addTransactionFn).toHaveBeenCalledWith(
          {
            ...mockTransactionData,
            value: '0',
            chainId: '0x1',
            gasLimit: toHex(mockTransactionData.gasLimit),
          },
          {
            networkClientId: '1',
          },
        );
      });

      it('executes lending deposit transaction with 0 gasLimit', async () => {
        const mockTransactionData = {
          to: '0x123',
          data: '0x456',
          value: '0',
          gasLimit: 0,
        };
        const mockLendingContract = {
          encodeDepositTransactionData: jest
            .fn()
            .mockResolvedValue(mockTransactionData),
        };
        (EarnSdk.create as jest.Mock).mockImplementation(() => ({
          contracts: {
            lending: {
              aave: {
                '0x123': mockLendingContract,
              },
            },
          },
        }));
        const addTransactionFn = jest.fn().mockResolvedValue('successfulhash');

        const { controller } = await setupController({
          addTransactionFn,
        });

        const result = await controller.executeLendingDeposit({
          amount: '100',
          chainId: '0x1',
          protocol: 'aave' as LendingMarket['protocol'],
          underlyingTokenAddress: '0x123',
          gasOptions: {},
          txOptions: {
            networkClientId: '1',
          },
        });

        expect(
          mockLendingContract.encodeDepositTransactionData,
        ).toHaveBeenCalledWith('100', mockAccount1Address, {});
        expect(result).toBe('successfulhash');

        expect(addTransactionFn).toHaveBeenCalledWith(
          {
            ...mockTransactionData,
            value: '0',
            chainId: '0x1',
            gasLimit: undefined,
          },
          {
            networkClientId: '1',
          },
        );
      });

      it('handles error when encodeDepositTransactionData throws', async () => {
        const contractError = new Error('Contract Error');
        const mockLendingContract = {
          encodeDepositTransactionData: jest
            .fn()
            .mockRejectedValue(contractError),
        };

        (EarnSdk.create as jest.Mock).mockImplementation(() => ({
          contracts: {
            lending: {
              aave: {
                '0x123': mockLendingContract,
              },
            },
          },
        }));

        const { controller } = await setupController();

        await expect(
          controller.executeLendingDeposit({
            amount: '100',
            chainId: '0x1',
            protocol: 'aave' as LendingMarket['protocol'],
            underlyingTokenAddress: '0x123',
            gasOptions: {},
            txOptions: {
              networkClientId: '1',
            },
          }),
        ).rejects.toThrow(contractError);
      });

      it('handles transaction data not found', async () => {
        const { controller } = await setupController();
        await expect(
          controller.executeLendingDeposit({
            amount: '100',
            chainId: '0x1',
            protocol: 'aave' as LendingMarket['protocol'],
            underlyingTokenAddress: '0x123',
            gasOptions: {},
            txOptions: {
              networkClientId: '1',
            },
          }),
        ).rejects.toThrow('Transaction data not found');
      });

      it('handles selected network client id not found', async () => {
        const mockTransactionData = {
          to: '0x123',
          data: '0x456',
          value: '0',
          gasLimit: 100000,
        };
        const mockLendingContract = {
          encodeDepositTransactionData: jest
            .fn()
            .mockResolvedValue(mockTransactionData),
        };

        (EarnSdk.create as jest.Mock).mockImplementation(() => ({
          contracts: {
            lending: {
              aave: {
                '0x123': mockLendingContract,
              },
            },
          },
        }));

        const { controller } = await setupController({
          selectedNetworkClientId: '',
        });

        await expect(
          controller.executeLendingDeposit({
            amount: '100',
            chainId: '0x1',
            protocol: 'aave' as LendingMarket['protocol'],
            underlyingTokenAddress: '0x123',
            gasOptions: {},
            txOptions: {
              networkClientId: '1',
            },
          }),
        ).rejects.toThrow('Selected network client id not found');
      });

      it('handles no selected account address found', async () => {
        const { controller } = await setupController({
          mockGetAccountsFromSelectedAccountGroup: jest.fn(() => []),
        });
        await expect(
          controller.executeLendingDeposit({
            amount: '100',
            chainId: '0x1',
            protocol: 'aave' as LendingMarket['protocol'],
            underlyingTokenAddress: '0x123',
            gasOptions: {},
            txOptions: {
              networkClientId: '1',
            },
          }),
        ).rejects.toThrow('No EVM-compatible account address found');
      });
    });

    describe('executeLendingWithdraw', () => {
      it('executes lending withdraw transaction', async () => {
        const mockTransactionData = {
          to: '0x123',
          data: '0x456',
          value: '0',
          gasLimit: 100000,
        };

        const mockLendingContract = {
          encodeWithdrawTransactionData: jest
            .fn()
            .mockResolvedValue(mockTransactionData),
        };

        (EarnSdk.create as jest.Mock).mockImplementation(() => ({
          contracts: {
            lending: {
              aave: {
                '0x123': mockLendingContract,
              },
            },
          },
        }));

        const addTransactionFn = jest.fn().mockResolvedValue('successfulhash');
        const { controller } = await setupController({
          addTransactionFn,
        });

        const result = await controller.executeLendingWithdraw({
          amount: '100',
          chainId: '0x1',
          protocol: 'aave' as LendingMarket['protocol'],
          underlyingTokenAddress: '0x123',
          gasOptions: {},
          txOptions: {
            networkClientId: '1',
          },
        });

        expect(
          mockLendingContract.encodeWithdrawTransactionData,
        ).toHaveBeenCalledWith('100', mockAccount1Address, {});
        expect(result).toBe('successfulhash');
        expect(addTransactionFn).toHaveBeenCalledWith(
          {
            ...mockTransactionData,
            value: '0',
            chainId: '0x1',
            gasLimit: toHex(mockTransactionData.gasLimit),
          },
          {
            networkClientId: '1',
          },
        );
      });

      it('executes lending withdraw transaction with 0 gasLimit', async () => {
        const mockTransactionData = {
          to: '0x123',
          data: '0x456',
          value: '0',
          gasLimit: 0,
        };

        const mockLendingContract = {
          encodeWithdrawTransactionData: jest
            .fn()
            .mockResolvedValue(mockTransactionData),
        };

        (EarnSdk.create as jest.Mock).mockImplementation(() => ({
          contracts: {
            lending: {
              aave: {
                '0x123': mockLendingContract,
              },
            },
          },
        }));

        const addTransactionFn = jest.fn().mockResolvedValue('successfulhash');
        const { controller } = await setupController({
          addTransactionFn,
        });

        const result = await controller.executeLendingWithdraw({
          amount: '100',
          chainId: '0x1',
          protocol: 'aave' as LendingMarket['protocol'],
          underlyingTokenAddress: '0x123',
          gasOptions: {},
          txOptions: {
            networkClientId: '1',
          },
        });

        expect(
          mockLendingContract.encodeWithdrawTransactionData,
        ).toHaveBeenCalledWith('100', mockAccount1Address, {});
        expect(result).toBe('successfulhash');
        expect(addTransactionFn).toHaveBeenCalledWith(
          {
            ...mockTransactionData,
            value: '0',
            chainId: '0x1',
            gasLimit: undefined,
          },
          {
            networkClientId: '1',
          },
        );
      });

      it('handles transaction data not found', async () => {
        const { controller } = await setupController();
        await expect(
          controller.executeLendingWithdraw({
            amount: '100',
            chainId: '0x1',
            protocol: 'aave' as LendingMarket['protocol'],
            underlyingTokenAddress: '0x123',
            gasOptions: {},
            txOptions: {
              networkClientId: '1',
            },
          }),
        ).rejects.toThrow('Transaction data not found');
      });

      it('handles selected network client id not found', async () => {
        const mockTransactionData = {
          to: '0x123',
          data: '0x456',
          value: '0',
          gasLimit: 100000,
        };
        const mockLendingContract = {
          encodeWithdrawTransactionData: jest
            .fn()
            .mockResolvedValue(mockTransactionData),
        };

        (EarnSdk.create as jest.Mock).mockImplementation(() => ({
          contracts: {
            lending: {
              aave: {
                '0x123': mockLendingContract,
              },
            },
          },
        }));

        const { controller } = await setupController({
          selectedNetworkClientId: '',
        });

        await expect(
          controller.executeLendingWithdraw({
            amount: '100',
            chainId: '0x1',
            protocol: 'aave' as LendingMarket['protocol'],
            underlyingTokenAddress: '0x123',
            gasOptions: {},
            txOptions: {
              networkClientId: '1',
            },
          }),
        ).rejects.toThrow('Selected network client id not found');
      });

      it('handles no selected account address found', async () => {
        const { controller } = await setupController({
          mockGetAccountsFromSelectedAccountGroup: jest.fn(() => []),
        });
        await expect(
          controller.executeLendingWithdraw({
            amount: '100',
            chainId: '0x1',
            protocol: 'aave' as LendingMarket['protocol'],
            underlyingTokenAddress: '0x123',
            gasOptions: {},
            txOptions: {
              networkClientId: '1',
            },
          }),
        ).rejects.toThrow('No EVM-compatible account address found');
      });
    });

    describe('executeLendingTokenApprove', () => {
      it('executes lending token approve transaction', async () => {
        const mockTransactionData = {
          to: '0x123',
          data: '0x456',
          value: '0',
          gasLimit: 100000,
        };

        const mockLendingContract = {
          encodeUnderlyingTokenApproveTransactionData: jest
            .fn()
            .mockResolvedValue(mockTransactionData),
        };

        (EarnSdk.create as jest.Mock).mockImplementation(() => ({
          contracts: {
            lending: {
              aave: {
                '0x123': mockLendingContract,
              },
            },
          },
        }));

        const addTransactionFn = jest.fn().mockResolvedValue('successfulhash');
        const { controller } = await setupController({
          addTransactionFn,
        });

        const result = await controller.executeLendingTokenApprove({
          amount: '100',
          chainId: '0x1',
          protocol: 'aave' as LendingMarket['protocol'],
          underlyingTokenAddress: '0x123',
          gasOptions: {},
          txOptions: {
            networkClientId: '1',
          },
        });

        expect(
          mockLendingContract.encodeUnderlyingTokenApproveTransactionData,
        ).toHaveBeenCalledWith('100', mockAccount1Address, {});
        expect(result).toBe('successfulhash');
        expect(addTransactionFn).toHaveBeenCalledWith(
          {
            ...mockTransactionData,
            value: '0',
            chainId: '0x1',
            gasLimit: toHex(mockTransactionData.gasLimit),
          },
          {
            networkClientId: '1',
          },
        );
      });

      it('executes lending token approve transaction with 0 gasLimit', async () => {
        const mockTransactionData = {
          to: '0x123',
          data: '0x456',
          value: '0',
          gasLimit: 0,
        };

        const mockLendingContract = {
          encodeUnderlyingTokenApproveTransactionData: jest
            .fn()
            .mockResolvedValue(mockTransactionData),
        };

        (EarnSdk.create as jest.Mock).mockImplementation(() => ({
          contracts: {
            lending: {
              aave: {
                '0x123': mockLendingContract,
              },
            },
          },
        }));

        const addTransactionFn = jest.fn().mockResolvedValue('successfulhash');
        const { controller } = await setupController({
          addTransactionFn,
        });

        const result = await controller.executeLendingTokenApprove({
          amount: '100',
          chainId: '0x1',
          protocol: 'aave' as LendingMarket['protocol'],
          underlyingTokenAddress: '0x123',
          gasOptions: {},
          txOptions: {
            networkClientId: '1',
          },
        });

        expect(
          mockLendingContract.encodeUnderlyingTokenApproveTransactionData,
        ).toHaveBeenCalledWith('100', mockAccount1Address, {});
        expect(result).toBe('successfulhash');
        expect(addTransactionFn).toHaveBeenCalledWith(
          {
            ...mockTransactionData,
            value: '0',
            chainId: '0x1',
            gasLimit: undefined,
          },
          {
            networkClientId: '1',
          },
        );
      });

      it('handles transaction data not found', async () => {
        const { controller } = await setupController();
        await expect(
          controller.executeLendingTokenApprove({
            amount: '100',
            chainId: '0x1',
            protocol: 'aave' as LendingMarket['protocol'],
            underlyingTokenAddress: '0x123',
            gasOptions: {},
            txOptions: {
              networkClientId: '1',
            },
          }),
        ).rejects.toThrow('Transaction data not found');
      });

      it('handles selected network client id not found', async () => {
        const mockTransactionData = {
          to: '0x123',
          data: '0x456',
          value: '0',
          gasLimit: 100000,
        };
        const mockLendingContract = {
          encodeUnderlyingTokenApproveTransactionData: jest
            .fn()
            .mockResolvedValue(mockTransactionData),
        };

        (EarnSdk.create as jest.Mock).mockImplementation(() => ({
          contracts: {
            lending: {
              aave: {
                '0x123': mockLendingContract,
              },
            },
          },
        }));

        const { controller } = await setupController({
          selectedNetworkClientId: '',
        });

        await expect(
          controller.executeLendingTokenApprove({
            amount: '100',
            chainId: '0x1',
            protocol: 'aave' as LendingMarket['protocol'],
            underlyingTokenAddress: '0x123',
            gasOptions: {},
            txOptions: {
              networkClientId: '1',
            },
          }),
        ).rejects.toThrow('Selected network client id not found');
      });

      it('handles no selected account address found', async () => {
        const { controller } = await setupController({
          mockGetAccountsFromSelectedAccountGroup: jest.fn(() => []),
        });
        await expect(
          controller.executeLendingTokenApprove({
            amount: '100',
            chainId: '0x1',
            protocol: 'aave' as LendingMarket['protocol'],
            underlyingTokenAddress: '0x123',
            gasOptions: {},
            txOptions: {
              networkClientId: '1',
            },
          }),
        ).rejects.toThrow('No EVM-compatible account address found');
      });
    });

    describe('getLendingTokenAllowance', () => {
      it('gets lending token allowance', async () => {
        const mockAllowance = '1000';

        const mockLendingContract = {
          underlyingTokenAllowance: jest.fn().mockResolvedValue(mockAllowance),
        };

        (EarnSdk.create as jest.Mock).mockImplementation(() => ({
          contracts: {
            lending: {
              aave: {
                '0x123': mockLendingContract,
              },
            },
          },
        }));

        const { controller } = await setupController();

        const result = await controller.getLendingTokenAllowance(
          'aave' as LendingMarket['protocol'],
          '0x123',
        );

        expect(
          mockLendingContract.underlyingTokenAllowance,
        ).toHaveBeenCalledWith(mockAccount1Address);
        expect(result).toBe(mockAllowance);
      });

      it('doesn`t call underlyingTokenAllowance if no account address found', async () => {
        const mockLendingContract = {
          underlyingTokenAllowance: jest.fn().mockResolvedValue(0),
        };

        (EarnSdk.create as jest.Mock).mockImplementation(() => ({
          contracts: {
            lending: {
              aave: {
                '0x123': mockLendingContract,
              },
            },
          },
        }));

        const { controller } = await setupController({
          mockGetAccountsFromSelectedAccountGroup: jest.fn(() => []),
        });

        await controller.getLendingTokenAllowance(
          'aave' as LendingMarket['protocol'],
          '0x123',
        );

        expect(
          mockLendingContract.underlyingTokenAllowance,
        ).not.toHaveBeenCalled();
      });
    });

    describe('getLendingTokenMaxWithdraw', () => {
      it('gets lending token max withdraw', async () => {
        const mockMaxWithdraw = '1000';

        const mockLendingContract = {
          maxWithdraw: jest.fn().mockResolvedValue(mockMaxWithdraw),
        };

        (EarnSdk.create as jest.Mock).mockImplementation(() => ({
          contracts: {
            lending: {
              aave: {
                '0x123': mockLendingContract,
              },
            },
          },
        }));

        const { controller } = await setupController();

        const result = await controller.getLendingTokenMaxWithdraw(
          'aave' as LendingMarket['protocol'],
          '0x123',
        );

        expect(mockLendingContract.maxWithdraw).toHaveBeenCalledWith(
          mockAccount1Address,
        );
        expect(result).toBe(mockMaxWithdraw);
      });

      it('doesn`t call maxWithdraw if no account address found', async () => {
        const mockLendingContract = {
          maxWithdraw: jest.fn().mockResolvedValue(0),
        };

        (EarnSdk.create as jest.Mock).mockImplementation(() => ({
          contracts: {
            lending: {
              aave: {
                '0x123': mockLendingContract,
              },
            },
          },
        }));

        const { controller } = await setupController({
          mockGetAccountsFromSelectedAccountGroup: jest.fn(() => []),
        });

        await controller.getLendingTokenMaxWithdraw(
          'aave' as LendingMarket['protocol'],
          '0x123',
        );

        expect(mockLendingContract.maxWithdraw).not.toHaveBeenCalled();
      });
    });

    describe('getLendingTokenMaxDeposit', () => {
      it('gets lending token max deposit', async () => {
        const mockMaxDeposit = '1000';

        const mockLendingContract = {
          maxDeposit: jest.fn().mockResolvedValue(mockMaxDeposit),
        };

        (EarnSdk.create as jest.Mock).mockImplementation(() => ({
          contracts: {
            lending: {
              aave: {
                '0x123': mockLendingContract,
              },
            },
          },
        }));

        const { controller } = await setupController();

        const result = await controller.getLendingTokenMaxDeposit(
          'aave' as LendingMarket['protocol'],
          '0x123',
        );

        expect(mockLendingContract.maxDeposit).toHaveBeenCalledWith(
          mockAccount1Address,
        );
        expect(result).toBe(mockMaxDeposit);
      });

      it('doesn`t call maxDeposit if no account address found', async () => {
        const mockLendingContract = {
          maxDeposit: jest.fn().mockResolvedValue(0),
        };

        (EarnSdk.create as jest.Mock).mockImplementation(() => ({
          contracts: {
            lending: {
              aave: {
                '0x123': mockLendingContract,
              },
            },
          },
        }));

        const { controller } = await setupController({
          mockGetAccountsFromSelectedAccountGroup: jest.fn(() => []),
        });

        await controller.getLendingTokenMaxDeposit(
          'aave' as LendingMarket['protocol'],
          '0x123',
        );

        expect(mockLendingContract.maxDeposit).not.toHaveBeenCalled();
      });
    });
  });
});
