import { deriveStateFromMetadata } from '@metamask/base-controller';
import type {
  ApiPlatformClient,
  V6BalanceItem,
  V6BalancesResponse,
} from '@metamask/core-backend';
import {
  BtcAccountType,
  EthAccountType,
  SolAccountType,
  SolMethod,
  SolScope,
} from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { MOCK_ANY_NAMESPACE, Messenger } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import type { FeatureFlags } from '@metamask/remote-feature-flag-controller';

import { createMockInternalAccount } from '../../../accounts-controller/tests/mocks.js';
import { DEFI_SUPPORTED_NETWORKS } from './build-defi-balances-query.js';
import type { DeFiPositionsControllerV2Messenger } from './DeFiPositionsControllerV2.js';
import {
  DeFiPositionsControllerV2,
  getDefaultDeFiPositionsControllerV2State,
} from './DeFiPositionsControllerV2.js';

/** Mirrors the internal defaults in `defi-controller-v2-feature-flag.ts`. */
const DEFI_CONTROLLER_V2_FEATURE_FLAG = 'defiControllerV2';
const DEFAULT_PROCESSING_POLL_INTERVAL_MS = 5_000;
const DEFAULT_PROCESSING_POLL_MAX_ATTEMPTS = 5;

const EVM_ADDRESS = '0x0000000000000000000000000000000000000001';
const SOLANA_ADDRESS = 'So11111111111111111111111111111111111111112';

const GROUP_ACCOUNTS = [
  createMockInternalAccount({
    id: 'evm-account-id',
    address: EVM_ADDRESS,
    type: EthAccountType.Eoa,
  }),
  createMockInternalAccount({
    id: 'btc-account-id',
    type: BtcAccountType.P2wpkh,
  }),
];

const GROUP_ACCOUNTS_WITH_SOLANA: InternalAccount[] = [
  ...GROUP_ACCOUNTS,
  {
    id: 'solana-account-id',
    address: SOLANA_ADDRESS,
    options: {},
    methods: [SolMethod.SendAndConfirmTransaction],
    scopes: [SolScope.Mainnet],
    type: SolAccountType.DataAccount,
    metadata: {
      name: 'Solana Account',
      keyring: { type: KeyringTypes.snap },
      importTime: Date.now(),
      lastSelected: Date.now(),
      snap: {
        id: 'mock-sol-snap',
      },
    },
  },
];

const GROUP_ACCOUNTS_NO_SUPPORTED = [
  createMockInternalAccount({
    id: 'btc-account-id',
    type: BtcAccountType.P2wpkh,
  }),
];

const DEFAULT_DEFI_BALANCE: V6BalanceItem = {
  accountId: `eip155:0:${EVM_ADDRESS}`,
  object: 'defi',
  type: 'erc20',
  assetId: 'eip155:1/erc20:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  name: 'Wrapped Ether',
  symbol: 'WETH',
  decimals: 18,
  balance: '1',
  price: '2000',
  metadata: {
    protocolId: 'aave-v3',
    productName: 'Aave V3',
    description: 'Aave V3 on ethereum',
    protocolUrl: 'https://aave.com/',
    protocolIconUrl: 'https://example.com/aave.png',
    positionType: 'deposit',
    poolAddress: '0xpool',
    groupId: 'group-aave-1',
  },
};

type AllDeFiPositionsControllerV2Actions =
  MessengerActions<DeFiPositionsControllerV2Messenger>;

type AllDeFiPositionsControllerV2Events =
  MessengerEvents<DeFiPositionsControllerV2Messenger>;

type RootMessenger = Messenger<
  MockAnyNamespace,
  AllDeFiPositionsControllerV2Actions,
  AllDeFiPositionsControllerV2Events
>;

/**
 * Builds a minimal successful v6 balances response for the EVM account.
 *
 * @param overrides - Optional response overrides.
 * @returns A v6 balances response.
 */
function buildMockBalancesResponse(
  overrides?: Partial<V6BalancesResponse>,
): V6BalancesResponse {
  return {
    unprocessedNetworks: [],
    unprocessedIncludeAssetIds: [],
    balances: [DEFAULT_DEFI_BALANCE],
    ...overrides,
  };
}

/**
 * Builds a processing balances response for the EVM account. DeFi rows for
 * processing accounts are omitted from `balances` until indexing completes.
 *
 * @returns A v6 balances response listing the EVM account in
 * `processingDefiPositions`.
 */
function buildProcessingBalancesResponse(): V6BalancesResponse {
  return buildMockBalancesResponse({
    balances: [],
    processingDefiPositions: [`eip155:1:${EVM_ADDRESS}`],
  });
}

/**
 * Sets up the V2 controller with the given configuration.
 *
 * @param config - Configuration for the mock setup.
 * @param config.isEnabled - Whether the controller is enabled.
 * @param config.getVsCurrency - Fiat currency getter.
 * @param config.remoteFeatureFlags - Remote feature flags returned by
 * `RemoteFeatureFlagController:getState` (defaults to empty).
 * @param config.mockGroupAccounts - Accounts returned for the selected group.
 * @param config.getGroupAccounts - Getter for the selected group accounts
 * (preferred when the selection changes between fetches).
 * @param config.mockFetchV6MultiAccountBalances - Mock API fetch function.
 * @param config.captureException - Mock Sentry capture function.
 * @param config.state - Initial controller state.
 * @returns The controller instance and mocks.
 */
function setupController({
  isEnabled = (): boolean => true,
  getVsCurrency = (): string => 'USD',
  remoteFeatureFlags = {},
  mockGroupAccounts = GROUP_ACCOUNTS,
  getGroupAccounts,
  mockFetchV6MultiAccountBalances = jest
    .fn()
    .mockResolvedValue(buildMockBalancesResponse()),
  captureException = jest.fn(),
  state,
}: {
  isEnabled?: () => boolean;
  getVsCurrency?: () => string;
  remoteFeatureFlags?: FeatureFlags;
  mockGroupAccounts?: InternalAccount[];
  getGroupAccounts?: () => InternalAccount[];
  mockFetchV6MultiAccountBalances?: jest.Mock;
  captureException?: jest.Mock;
  state?: Partial<ReturnType<typeof getDefaultDeFiPositionsControllerV2State>>;
} = {}): {
  controller: DeFiPositionsControllerV2;
  controllerMessenger: Messenger<
    'DeFiPositionsControllerV2',
    AllDeFiPositionsControllerV2Actions,
    AllDeFiPositionsControllerV2Events,
    RootMessenger
  >;
  mockFetchV6MultiAccountBalances: jest.Mock;
  mockInvalidateQueries: jest.Mock;
  mockGetV6MultiAccountBalancesQueryOptions: jest.Mock;
  mockCaptureException: jest.Mock;
} {
  const messenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
    captureException,
  });

  messenger.registerActionHandler(
    'AccountTreeController:getAccountsFromSelectedAccountGroup',
    () => getGroupAccounts?.() ?? mockGroupAccounts,
  );
  messenger.registerActionHandler(
    'RemoteFeatureFlagController:getState',
    () => ({
      remoteFeatureFlags,
      cacheTimestamp: 0,
    }),
  );

  const controllerMessenger = new Messenger<
    'DeFiPositionsControllerV2',
    AllDeFiPositionsControllerV2Actions,
    AllDeFiPositionsControllerV2Events,
    RootMessenger
  >({
    namespace: 'DeFiPositionsControllerV2',
    parent: messenger,
  });
  messenger.delegate({
    messenger: controllerMessenger,
    actions: [
      'AccountTreeController:getAccountsFromSelectedAccountGroup',
      'RemoteFeatureFlagController:getState',
    ],
  });

  const mockInvalidateQueries = jest.fn().mockResolvedValue(undefined);
  const mockGetV6MultiAccountBalancesQueryOptions = jest.fn().mockReturnValue({
    queryKey: ['accounts', 'balances', 'v6'],
  });

  const apiClient = {
    accounts: {
      fetchV6MultiAccountBalances: mockFetchV6MultiAccountBalances,
      getV6MultiAccountBalancesQueryOptions:
        mockGetV6MultiAccountBalancesQueryOptions,
      queryClient: {
        invalidateQueries: mockInvalidateQueries,
      },
    },
  } as unknown as ApiPlatformClient;

  const controller = new DeFiPositionsControllerV2({
    messenger: controllerMessenger,
    apiClient,
    isEnabled,
    getVsCurrency,
    state,
  });

  return {
    controller,
    controllerMessenger,
    mockFetchV6MultiAccountBalances,
    mockInvalidateQueries,
    mockGetV6MultiAccountBalancesQueryOptions,
    mockCaptureException: captureException,
  };
}

describe('DeFiPositionsControllerV2', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('sets default state', () => {
    const { controller } = setupController();

    expect(controller.state).toStrictEqual(
      getDefaultDeFiPositionsControllerV2State(),
    );
  });

  it('does not fetch when the controller is disabled', async () => {
    const { controller, mockFetchV6MultiAccountBalances } = setupController({
      isEnabled: () => false,
    });

    await controller.fetchDeFiPositions();

    expect(mockFetchV6MultiAccountBalances).not.toHaveBeenCalled();
    expect(controller.state).toStrictEqual(
      getDefaultDeFiPositionsControllerV2State(),
    );
  });

  it('does not fetch when the selected group has no supported accounts', async () => {
    const { controller, mockFetchV6MultiAccountBalances } = setupController({
      mockGroupAccounts: GROUP_ACCOUNTS_NO_SUPPORTED,
    });

    await controller.fetchDeFiPositions();

    expect(mockFetchV6MultiAccountBalances).not.toHaveBeenCalled();
    expect(controller.state).toStrictEqual(
      getDefaultDeFiPositionsControllerV2State(),
    );
  });

  it('fetches positions and stores them keyed by internal account ID', async () => {
    const { controller, mockFetchV6MultiAccountBalances } = setupController();

    await controller.fetchDeFiPositions();

    expect(mockFetchV6MultiAccountBalances).toHaveBeenCalledTimes(1);
    expect(mockFetchV6MultiAccountBalances).toHaveBeenCalledWith(
      [`eip155:0:${EVM_ADDRESS.toLowerCase()}`],
      {
        networks: DEFI_SUPPORTED_NETWORKS.filter((network) =>
          network.startsWith('eip155:'),
        ),
        includeDeFiBalances: true,
        forceFetchDeFiPositions: true,
        includePrices: true,
        vsCurrency: 'usd',
      },
      {},
    );

    expect(controller.state.allDeFiPositionsV2['evm-account-id']).toHaveLength(
      1,
    );
    expect(
      controller.state.allDeFiPositionsV2['evm-account-id'][0],
    ).toMatchObject({
      protocolId: 'aave-v3',
      productName: 'Aave V3',
      chainId: 'eip155:1',
      marketValue: 2000,
    });
  });

  it('maps mixed-case EVM response account IDs back to internal IDs', async () => {
    const mockFetchV6MultiAccountBalances = jest.fn().mockResolvedValue(
      buildMockBalancesResponse({
        balances: [
          {
            ...DEFAULT_DEFI_BALANCE,
            accountId: `eip155:0:${EVM_ADDRESS.toUpperCase()}`,
          },
        ],
      }),
    );

    const { controller } = setupController({
      mockFetchV6MultiAccountBalances,
    });

    await controller.fetchDeFiPositions();

    expect(controller.state.allDeFiPositionsV2).toHaveProperty(
      'evm-account-id',
    );
    expect(controller.state.allDeFiPositionsV2['evm-account-id']).toHaveLength(
      1,
    );
  });

  it('requests Solana and EVM networks when both accounts are present', async () => {
    const mockFetchV6MultiAccountBalances = jest
      .fn()
      .mockResolvedValue(buildMockBalancesResponse({ balances: [] }));

    const { controller, mockFetchV6MultiAccountBalances: mockFetch } =
      setupController({
        mockGroupAccounts: GROUP_ACCOUNTS_WITH_SOLANA,
        mockFetchV6MultiAccountBalances,
      });

    await controller.fetchDeFiPositions();

    const expectedEvmNetworks = DEFI_SUPPORTED_NETWORKS.filter((network) =>
      network.startsWith('eip155:'),
    );
    const expectedSolanaNetworks = DEFI_SUPPORTED_NETWORKS.filter((network) =>
      network.startsWith('solana:'),
    );

    expect(mockFetch).toHaveBeenCalledWith(
      [
        `eip155:0:${EVM_ADDRESS.toLowerCase()}`,
        `solana:${SolScope.Mainnet.split(':')[1]}:${SOLANA_ADDRESS}`,
      ],
      {
        networks: [...expectedEvmNetworks, ...expectedSolanaNetworks],
        includeDeFiBalances: true,
        forceFetchDeFiPositions: true,
        includePrices: true,
        vsCurrency: 'usd',
      },
      {},
    );
    expect(controller.state.allDeFiPositionsV2).toStrictEqual({
      'evm-account-id': [],
      'solana-account-id': [],
    });
  });

  it('polls until processing accounts become ready and keeps prior state meanwhile', async () => {
    jest.useFakeTimers();

    const {
      controller,
      mockFetchV6MultiAccountBalances,
      mockInvalidateQueries,
    } = setupController({
      mockFetchV6MultiAccountBalances: jest
        .fn()
        .mockResolvedValueOnce(buildMockBalancesResponse())
        .mockResolvedValueOnce(buildProcessingBalancesResponse())
        .mockResolvedValueOnce(buildMockBalancesResponse()),
    });

    await controller.fetchDeFiPositions();
    const cached = controller.state.allDeFiPositionsV2['evm-account-id'];
    expect(cached).toHaveLength(1);

    const secondFetch = controller.fetchDeFiPositions({ forceRefresh: true });
    await Promise.resolve();
    expect(mockFetchV6MultiAccountBalances).toHaveBeenCalledTimes(2);
    expect(controller.state.allDeFiPositionsV2['evm-account-id']).toBe(cached);
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(DEFAULT_PROCESSING_POLL_INTERVAL_MS);
    await secondFetch;

    expect(mockFetchV6MultiAccountBalances).toHaveBeenCalledTimes(3);
    expect(mockFetchV6MultiAccountBalances).toHaveBeenLastCalledWith(
      expect.any(Array),
      expect.objectContaining({ vsCurrency: 'usd' }),
      { staleTime: 0 },
    );
    expect(controller.state.allDeFiPositionsV2['evm-account-id']).toHaveLength(
      1,
    );
    expect(controller.state.allDeFiPositionsV2['evm-account-id']).not.toBe(
      cached,
    );
  });

  it('does not report attempt count to Sentry when the first fetch succeeds', async () => {
    const { controller, mockCaptureException, mockInvalidateQueries } =
      setupController();

    await controller.fetchDeFiPositions();

    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mockInvalidateQueries).not.toHaveBeenCalled();
  });

  it('reports attempt count to Sentry when positions become ready after polling', async () => {
    jest.useFakeTimers();

    const { controller, mockCaptureException } = setupController({
      mockFetchV6MultiAccountBalances: jest
        .fn()
        .mockResolvedValueOnce(buildProcessingBalancesResponse())
        .mockResolvedValueOnce(buildProcessingBalancesResponse())
        .mockResolvedValueOnce(buildMockBalancesResponse()),
    });

    const fetchPromise = controller.fetchDeFiPositions();
    await Promise.resolve();
    expect(mockCaptureException).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(DEFAULT_PROCESSING_POLL_INTERVAL_MS);
    await Promise.resolve();
    expect(mockCaptureException).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(DEFAULT_PROCESSING_POLL_INTERVAL_MS);
    await fetchPromise;

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'DeFiPositionsV2FetchAttempts',
        message:
          'DeFiPositionsControllerV2: positions ready after 3 attempt(s)',
      }),
    );
  });

  it('reports to Sentry when polling hits the max limit while still processing', async () => {
    jest.useFakeTimers();

    const mockFetchV6MultiAccountBalances = jest
      .fn()
      .mockResolvedValue(buildProcessingBalancesResponse());
    const { controller, mockCaptureException } = setupController({
      mockFetchV6MultiAccountBalances,
    });

    const fetchPromise = controller.fetchDeFiPositions();

    for (let i = 0; i < DEFAULT_PROCESSING_POLL_MAX_ATTEMPTS - 1; i++) {
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(DEFAULT_PROCESSING_POLL_INTERVAL_MS);
    }

    await fetchPromise;

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'DeFiPositionsV2ProcessingPollExhausted',
        message: `DeFiPositionsControllerV2: still processing after ${DEFAULT_PROCESSING_POLL_MAX_ATTEMPTS} attempt(s)`,
      }),
    );
  });

  it('keeps prior state for all accounts while any account is still processing', async () => {
    jest.useFakeTimers();

    const solanaDefiBalance: V6BalanceItem = {
      accountId: `solana:${SolScope.Mainnet.split(':')[1]}:${SOLANA_ADDRESS}`,
      object: 'defi',
      type: 'erc20',
      assetId: `${SolScope.Mainnet}/token:${SOLANA_ADDRESS}`,
      name: 'Wrapped SOL',
      symbol: 'WSOL',
      decimals: 9,
      balance: '1',
      price: '100',
      metadata: {
        protocolId: 'marinade',
        productName: 'Marinade',
        description: 'Marinade on solana',
        protocolUrl: 'https://marinade.finance/',
        protocolIconUrl: 'https://example.com/marinade.png',
        positionType: 'staked',
        poolAddress: 'pool',
        groupId: 'group-marinade-1',
      },
    };
    const {
      controller,
      mockInvalidateQueries,
      mockFetchV6MultiAccountBalances,
    } = setupController({
      mockGroupAccounts: GROUP_ACCOUNTS_WITH_SOLANA,
      mockFetchV6MultiAccountBalances: jest
        .fn()
        .mockResolvedValueOnce(
          buildMockBalancesResponse({
            balances: [DEFAULT_DEFI_BALANCE, solanaDefiBalance],
          }),
        )
        .mockResolvedValueOnce(
          // The EVM account is still indexing; its DeFi rows are omitted, so
          // writing this response would wrongly clear the EVM positions.
          buildMockBalancesResponse({
            balances: [solanaDefiBalance],
            processingDefiPositions: [`eip155:1:${EVM_ADDRESS}`],
          }),
        )
        .mockResolvedValueOnce(
          buildMockBalancesResponse({
            balances: [DEFAULT_DEFI_BALANCE],
          }),
        ),
    });

    await controller.fetchDeFiPositions();
    const evmPositions = controller.state.allDeFiPositionsV2['evm-account-id'];
    const solanaPositions =
      controller.state.allDeFiPositionsV2['solana-account-id'];
    expect(evmPositions).toHaveLength(1);
    expect(solanaPositions).toHaveLength(1);

    const secondFetch = controller.fetchDeFiPositions({ forceRefresh: true });
    await Promise.resolve();

    // Processing response: keep prior state for every account.
    expect(controller.state.allDeFiPositionsV2['evm-account-id']).toBe(
      evmPositions,
    );
    expect(controller.state.allDeFiPositionsV2['solana-account-id']).toBe(
      solanaPositions,
    );
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(DEFAULT_PROCESSING_POLL_INTERVAL_MS);
    await secondFetch;

    expect(mockFetchV6MultiAccountBalances).toHaveBeenCalledTimes(3);
    expect(controller.state.allDeFiPositionsV2['evm-account-id']).toHaveLength(
      1,
    );
    expect(controller.state.allDeFiPositionsV2['evm-account-id']).not.toBe(
      evmPositions,
    );
    expect(
      controller.state.allDeFiPositionsV2['solana-account-id'],
    ).toStrictEqual([]);
  });

  it('stops polling after the max attempt limit while still processing', async () => {
    jest.useFakeTimers();

    const mockFetchV6MultiAccountBalances = jest
      .fn()
      .mockResolvedValue(buildProcessingBalancesResponse());

    const { controller, mockInvalidateQueries } = setupController({
      mockFetchV6MultiAccountBalances,
    });

    const fetchPromise = controller.fetchDeFiPositions();

    for (let i = 0; i < DEFAULT_PROCESSING_POLL_MAX_ATTEMPTS - 1; i++) {
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(DEFAULT_PROCESSING_POLL_INTERVAL_MS);
    }

    await fetchPromise;

    expect(mockFetchV6MultiAccountBalances).toHaveBeenCalledTimes(
      DEFAULT_PROCESSING_POLL_MAX_ATTEMPTS,
    );
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(
      DEFAULT_PROCESSING_POLL_MAX_ATTEMPTS,
    );
    expect(controller.state.allDeFiPositionsV2).toStrictEqual({});
  });

  it('uses maxAttempts and pollInterval from the defiControllerV2 remote flag', async () => {
    jest.useFakeTimers();

    const remoteMaxAttempts = 3;
    const remotePollInterval = 1_000;
    const mockFetchV6MultiAccountBalances = jest
      .fn()
      .mockResolvedValue(buildProcessingBalancesResponse());

    const { controller, mockInvalidateQueries } = setupController({
      mockFetchV6MultiAccountBalances,
      remoteFeatureFlags: {
        [DEFI_CONTROLLER_V2_FEATURE_FLAG]: {
          maxAttempts: remoteMaxAttempts,
          pollInterval: remotePollInterval,
        },
      },
    });

    const fetchPromise = controller.fetchDeFiPositions();

    for (let i = 0; i < remoteMaxAttempts - 1; i++) {
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(remotePollInterval);
    }

    await fetchPromise;

    expect(mockFetchV6MultiAccountBalances).toHaveBeenCalledTimes(
      remoteMaxAttempts,
    );
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(remoteMaxAttempts);
    expect(controller.state.allDeFiPositionsV2).toStrictEqual({});
  });

  it('shares one in-flight promise across concurrent fetchDeFiPositions calls', async () => {
    let resolveFetch!: (value: V6BalancesResponse) => void;
    const mockFetchV6MultiAccountBalances = jest.fn().mockImplementation(
      () =>
        new Promise<V6BalancesResponse>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const { controller } = setupController({
      mockFetchV6MultiAccountBalances,
    });

    const first = controller.fetchDeFiPositions();
    const second = controller.fetchDeFiPositions({ forceRefresh: true });

    expect(mockFetchV6MultiAccountBalances).toHaveBeenCalledTimes(1);

    resolveFetch(buildMockBalancesResponse());
    await Promise.all([first, second]);

    expect(mockFetchV6MultiAccountBalances).toHaveBeenCalledTimes(1);
  });

  it('starts a new fetch when vsCurrency changes during an in-flight call', async () => {
    let vsCurrency = 'USD';

    let resolveUsdFetch!: (value: V6BalancesResponse) => void;
    const mockFetchV6MultiAccountBalances = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<V6BalancesResponse>((resolve) => {
            resolveUsdFetch = resolve;
          }),
      )
      .mockResolvedValueOnce(buildMockBalancesResponse());

    const { controller } = setupController({
      getVsCurrency: () => vsCurrency,
      mockFetchV6MultiAccountBalances,
    });

    const usdFetch = controller.fetchDeFiPositions();
    await Promise.resolve();
    expect(mockFetchV6MultiAccountBalances).toHaveBeenCalledTimes(1);
    expect(mockFetchV6MultiAccountBalances).toHaveBeenLastCalledWith(
      expect.any(Array),
      expect.objectContaining({ vsCurrency: 'usd' }),
      {},
    );

    vsCurrency = 'EUR';
    const eurFetch = controller.fetchDeFiPositions({ forceRefresh: true });
    await Promise.resolve();

    // Different fiat currency must not join the USD in-flight promise.
    expect(mockFetchV6MultiAccountBalances).toHaveBeenCalledTimes(2);
    expect(mockFetchV6MultiAccountBalances).toHaveBeenLastCalledWith(
      expect.any(Array),
      expect.objectContaining({ vsCurrency: 'eur' }),
      { staleTime: 0 },
    );

    resolveUsdFetch(buildMockBalancesResponse());
    await Promise.all([usdFetch, eurFetch]);

    expect(mockFetchV6MultiAccountBalances).toHaveBeenCalledTimes(2);
  });

  it('starts a new fetch when selection changes during an in-flight call', async () => {
    const otherEvmAddress = '0x0000000000000000000000000000000000000002';
    const otherEvmAccount = createMockInternalAccount({
      id: 'evm-account-id-2',
      address: otherEvmAddress,
      type: EthAccountType.Eoa,
    });
    let groupAccounts: InternalAccount[] = GROUP_ACCOUNTS;

    let resolveFirstFetch!: (value: V6BalancesResponse) => void;
    const mockFetchV6MultiAccountBalances = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<V6BalancesResponse>((resolve) => {
            resolveFirstFetch = resolve;
          }),
      )
      .mockResolvedValueOnce(
        buildMockBalancesResponse({
          balances: [
            {
              ...DEFAULT_DEFI_BALANCE,
              accountId: `eip155:0:${otherEvmAddress}`,
            },
          ],
        }),
      );

    const { controller } = setupController({
      getGroupAccounts: () => groupAccounts,
      mockFetchV6MultiAccountBalances,
    });

    const firstFetch = controller.fetchDeFiPositions();
    await Promise.resolve();
    expect(mockFetchV6MultiAccountBalances).toHaveBeenCalledTimes(1);
    expect(mockFetchV6MultiAccountBalances.mock.calls[0][0]).toContain(
      `eip155:0:${EVM_ADDRESS}`,
    );

    groupAccounts = [otherEvmAccount];
    const secondFetch = controller.fetchDeFiPositions({ forceRefresh: true });
    await Promise.resolve();

    // Different selection does not join the in-flight promise.
    expect(mockFetchV6MultiAccountBalances).toHaveBeenCalledTimes(2);
    expect(mockFetchV6MultiAccountBalances).toHaveBeenLastCalledWith(
      expect.arrayContaining([`eip155:0:${otherEvmAddress}`]),
      expect.objectContaining({ vsCurrency: 'usd' }),
      { staleTime: 0 },
    );

    resolveFirstFetch(buildMockBalancesResponse());
    await Promise.all([firstFetch, secondFetch]);

    // The prior request may still write the old group; the new fetch writes the
    // new group.
    expect(controller.state.allDeFiPositionsV2['evm-account-id']).toHaveLength(
      1,
    );
    expect(
      controller.state.allDeFiPositionsV2['evm-account-id-2'],
    ).toHaveLength(1);
  });

  it('rejoins an in-flight fetch when switching back to the same accounts', async () => {
    const otherEvmAddress = '0x0000000000000000000000000000000000000002';
    const otherEvmAccount = createMockInternalAccount({
      id: 'evm-account-id-2',
      address: otherEvmAddress,
      type: EthAccountType.Eoa,
    });
    let groupAccounts: InternalAccount[] = GROUP_ACCOUNTS;

    let resolveFirstFetch!: (value: V6BalancesResponse) => void;
    let resolveSecondFetch!: (value: V6BalancesResponse) => void;
    const mockFetchV6MultiAccountBalances = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<V6BalancesResponse>((resolve) => {
            resolveFirstFetch = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<V6BalancesResponse>((resolve) => {
            resolveSecondFetch = resolve;
          }),
      );

    const { controller } = setupController({
      getGroupAccounts: () => groupAccounts,
      mockFetchV6MultiAccountBalances,
    });

    const firstFetch = controller.fetchDeFiPositions();
    await Promise.resolve();

    groupAccounts = [otherEvmAccount];
    const secondFetch = controller.fetchDeFiPositions();
    await Promise.resolve();
    expect(mockFetchV6MultiAccountBalances).toHaveBeenCalledTimes(2);

    groupAccounts = GROUP_ACCOUNTS;
    const thirdFetch = controller.fetchDeFiPositions();

    // Switched back to the first group — join its still-in-flight promise.
    expect(mockFetchV6MultiAccountBalances).toHaveBeenCalledTimes(2);

    resolveFirstFetch(buildMockBalancesResponse());
    resolveSecondFetch(buildMockBalancesResponse({ balances: [] }));
    await Promise.all([firstFetch, secondFetch, thirdFetch]);

    expect(mockFetchV6MultiAccountBalances).toHaveBeenCalledTimes(2);
    expect(controller.state.allDeFiPositionsV2['evm-account-id']).toHaveLength(
      1,
    );
    expect(
      controller.state.allDeFiPositionsV2['evm-account-id-2'],
    ).toStrictEqual([]);
  });

  it('merges fetched accounts into state without clearing other accounts', async () => {
    const otherEvmAddress = '0x0000000000000000000000000000000000000002';
    const otherEvmAccount = createMockInternalAccount({
      id: 'evm-account-id-2',
      address: otherEvmAddress,
      type: EthAccountType.Eoa,
    });
    let groupAccounts: InternalAccount[] = GROUP_ACCOUNTS;
    const { controller } = setupController({
      getGroupAccounts: () => groupAccounts,
      mockFetchV6MultiAccountBalances: jest
        .fn()
        .mockResolvedValueOnce(buildMockBalancesResponse())
        .mockResolvedValueOnce(buildMockBalancesResponse({ balances: [] })),
    });

    await controller.fetchDeFiPositions();
    expect(controller.state.allDeFiPositionsV2['evm-account-id']).toHaveLength(
      1,
    );

    groupAccounts = [otherEvmAccount];
    await controller.fetchDeFiPositions();

    expect(controller.state.allDeFiPositionsV2).toStrictEqual({
      'evm-account-id': expect.any(Array),
      'evm-account-id-2': [],
    });
    expect(controller.state.allDeFiPositionsV2['evm-account-id']).toHaveLength(
      1,
    );
  });

  it('passes staleTime: 0 to the apiClient when forceRefresh is true', async () => {
    const { controller, mockFetchV6MultiAccountBalances } = setupController();

    await controller.fetchDeFiPositions({ forceRefresh: true });

    expect(mockFetchV6MultiAccountBalances).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ vsCurrency: 'usd' }),
      { staleTime: 0 },
    );
  });

  it('passes the current vsCurrency to the apiClient', async () => {
    let vsCurrency = 'USD';
    const { controller, mockFetchV6MultiAccountBalances } = setupController({
      getVsCurrency: () => vsCurrency,
    });

    await controller.fetchDeFiPositions();
    expect(mockFetchV6MultiAccountBalances).toHaveBeenLastCalledWith(
      expect.any(Array),
      expect.objectContaining({ vsCurrency: 'usd' }),
      {},
    );

    vsCurrency = 'EUR';
    await controller.fetchDeFiPositions();

    expect(mockFetchV6MultiAccountBalances).toHaveBeenLastCalledWith(
      expect.any(Array),
      expect.objectContaining({ vsCurrency: 'eur' }),
      {},
    );
  });

  it('keeps prior state when a fetch fails', async () => {
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const mockFetchV6MultiAccountBalances = jest
      .fn()
      .mockResolvedValueOnce(buildMockBalancesResponse())
      .mockRejectedValueOnce(new Error('network error'));

    const { controller } = setupController({
      mockFetchV6MultiAccountBalances,
    });

    await controller.fetchDeFiPositions();
    expect(controller.state.allDeFiPositionsV2['evm-account-id']).toHaveLength(
      1,
    );

    await controller.fetchDeFiPositions();
    expect(mockFetchV6MultiAccountBalances).toHaveBeenCalledTimes(2);
    expect(controller.state.allDeFiPositionsV2['evm-account-id']).toHaveLength(
      1,
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to fetch DeFi positions',
      expect.any(Error),
    );
  });

  it('exposes fetchDeFiPositions via the messenger', async () => {
    const { controllerMessenger, mockFetchV6MultiAccountBalances } =
      setupController();

    await controllerMessenger.call(
      'DeFiPositionsControllerV2:fetchDeFiPositions',
    );

    expect(mockFetchV6MultiAccountBalances).toHaveBeenCalledTimes(1);
  });

  describe('metadata', () => {
    it('includes expected state in debug snapshots', () => {
      const { controller } = setupController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInDebugSnapshot',
        ),
      ).toMatchInlineSnapshot(`{}`);
    });

    it('includes expected state in state logs', () => {
      const { controller } = setupController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInStateLogs',
        ),
      ).toMatchInlineSnapshot(`{}`);
    });

    it('persists expected state', () => {
      const { controller } = setupController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'persist',
        ),
      ).toMatchInlineSnapshot(`
        {
          "allDeFiPositionsV2": {},
        }
      `);
    });

    it('exposes expected state to UI', () => {
      const { controller } = setupController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'usedInUi',
        ),
      ).toMatchInlineSnapshot(`
        {
          "allDeFiPositionsV2": {},
        }
      `);
    });
  });
});
