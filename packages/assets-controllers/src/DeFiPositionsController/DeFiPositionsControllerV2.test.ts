import { deriveStateFromMetadata } from '@metamask/base-controller';
import type {
  ApiPlatformClient,
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

import { createMockInternalAccount } from '../../../accounts-controller/tests/mocks';
import {
  DEFI_BALANCES_V6_REQUEST_OPTIONS,
  DEFI_SUPPORTED_NETWORKS,
} from './build-defi-balances-query';
import type { DeFiPositionsControllerV2Messenger } from './DeFiPositionsControllerV2';
import {
  DeFiPositionsControllerV2,
  getDefaultDeFiPositionsControllerV2State,
} from './DeFiPositionsControllerV2';

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
    accounts: [
      {
        accountId: `eip155:0:${EVM_ADDRESS}`,
        balances: [
          {
            category: 'defi',
            assetId:
              'eip155:1/erc20:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
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
          },
        ],
      },
    ],
    ...overrides,
  };
}

/**
 * Sets up the V2 controller with the given configuration.
 *
 * @param config - Configuration for the mock setup.
 * @param config.isEnabled - Whether the controller is enabled.
 * @param config.getVsCurrency - Fiat currency getter.
 * @param config.minimumFetchIntervalMs - Minimum fetch interval.
 * @param config.mockGroupAccounts - Accounts returned for the selected group.
 * @param config.mockFetchV6MultiAccountBalances - Mock API fetch function.
 * @param config.state - Initial controller state.
 * @returns The controller instance and mocks.
 */
function setupController({
  isEnabled = (): boolean => true,
  getVsCurrency = (): string => 'USD',
  minimumFetchIntervalMs,
  mockGroupAccounts = GROUP_ACCOUNTS,
  mockFetchV6MultiAccountBalances = jest
    .fn()
    .mockResolvedValue(buildMockBalancesResponse()),
  state,
}: {
  isEnabled?: () => boolean;
  getVsCurrency?: () => string;
  minimumFetchIntervalMs?: number;
  mockGroupAccounts?: InternalAccount[];
  mockFetchV6MultiAccountBalances?: jest.Mock;
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
} {
  const messenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });

  messenger.registerActionHandler(
    'AccountTreeController:getAccountsFromSelectedAccountGroup',
    () => mockGroupAccounts,
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
    actions: ['AccountTreeController:getAccountsFromSelectedAccountGroup'],
  });

  const apiClient = {
    accounts: {
      fetchV6MultiAccountBalances: mockFetchV6MultiAccountBalances,
    },
  } as unknown as ApiPlatformClient;

  const controller = new DeFiPositionsControllerV2({
    messenger: controllerMessenger,
    apiClient,
    isEnabled,
    getVsCurrency,
    minimumFetchIntervalMs,
    state,
  });

  return {
    controller,
    controllerMessenger,
    mockFetchV6MultiAccountBalances,
  };
}

describe('DeFiPositionsControllerV2', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

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
        ...DEFI_BALANCES_V6_REQUEST_OPTIONS,
        vsCurrency: 'usd',
      },
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
        accounts: [
          {
            accountId: `eip155:0:${EVM_ADDRESS.toUpperCase()}`,
            balances: [
              {
                category: 'defi',
                assetId:
                  'eip155:1/erc20:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
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
              },
            ],
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
    const mockFetchV6MultiAccountBalances = jest.fn().mockResolvedValue(
      buildMockBalancesResponse({
        accounts: [
          {
            accountId: `eip155:0:${EVM_ADDRESS}`,
            balances: [],
          },
          {
            accountId: `solana:${SolScope.Mainnet.split(':')[1]}:${SOLANA_ADDRESS}`,
            balances: [],
          },
        ],
      }),
    );

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
        ...DEFI_BALANCES_V6_REQUEST_OPTIONS,
        vsCurrency: 'usd',
      },
    );
    expect(controller.state.allDeFiPositionsV2).toStrictEqual({
      'evm-account-id': [],
      'solana-account-id': [],
    });
  });

  it('throttles repeated fetches for the same accounts within the interval', async () => {
    const { controller, mockFetchV6MultiAccountBalances } = setupController({
      minimumFetchIntervalMs: 60_000,
    });

    await controller.fetchDeFiPositions();
    await controller.fetchDeFiPositions();

    expect(mockFetchV6MultiAccountBalances).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(60_000);
    await controller.fetchDeFiPositions();

    expect(mockFetchV6MultiAccountBalances).toHaveBeenCalledTimes(2);
  });

  it('clears the throttle claim when a fetch fails so retries are allowed', async () => {
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const mockFetchV6MultiAccountBalances = jest
      .fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(buildMockBalancesResponse());

    const { controller } = setupController({
      mockFetchV6MultiAccountBalances,
    });

    await controller.fetchDeFiPositions();
    expect(mockFetchV6MultiAccountBalances).toHaveBeenCalledTimes(1);
    expect(controller.state.allDeFiPositionsV2).toStrictEqual({});
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to fetch DeFi positions',
      expect.any(Error),
    );

    await controller.fetchDeFiPositions();
    expect(mockFetchV6MultiAccountBalances).toHaveBeenCalledTimes(2);
    expect(controller.state.allDeFiPositionsV2['evm-account-id']).toHaveLength(
      1,
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
