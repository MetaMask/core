import type { AccountsController } from '@metamask/accounts-controller';
import { Messenger } from '@metamask/base-controller';
import { getDefaultNetworkControllerState } from '@metamask/network-controller';
import { StakeSdk, StakingApiService } from '@metamask/stake-sdk';

import {
  EarnController,
  type EarnControllerState,
  getDefaultEarnControllerState,
  type EarnControllerMessenger,
  type EarnControllerEvents,
  type EarnControllerActions,
  type AllowedActions,
  type AllowedEvents,
} from './EarnController';

jest.mock('@metamask/stake-sdk', () => ({
  StakeSdk: {
    create: jest.fn().mockImplementation(() => ({
      pooledStakingContract: {
        connectSignerOrProvider: jest.fn(), // Mock connectSignerOrProvider
      },
    })),
  },
  StakingApiService: jest.fn().mockImplementation(() => ({
    getPooledStakes: jest.fn(),
    getPooledStakingEligibility: jest.fn(),
    getVaultData: jest.fn(),
    getVaultDailyApys: jest.fn(),
    getVaultApyAverages: jest.fn(),
  })),
}));

/**
 * Builds a new instance of the Messenger class for the AccountsController.
 *
 * @returns A new instance of the Messenger class for the AccountsController.
 */
function buildMessenger() {
  return new Messenger<
    EarnControllerActions | AllowedActions,
    EarnControllerEvents | AllowedEvents
  >();
}

/**
 * Constructs the messenger which is restricted to relevant EarnController
 * actions and events.
 *
 * @param rootMessenger - The root messenger to restrict.
 * @returns The restricted messenger.
 */
function getEarnControllerMessenger(
  rootMessenger = buildMessenger(),
): EarnControllerMessenger {
  return rootMessenger.getRestricted({
    name: 'EarnController',
    allowedActions: [
      'NetworkController:getState',
      'NetworkController:getNetworkClientById',
      'AccountsController:getSelectedAccount',
    ],
    allowedEvents: [
      'NetworkController:stateChange',
      'AccountsController:selectedAccountChange',
    ],
  });
}

type InternalAccount = ReturnType<AccountsController['getSelectedAccount']>;

const createMockInternalAccount = ({
  id = '123e4567-e89b-12d3-a456-426614174000',
  address = '0x2990079bcdee240329a520d2444386fc119da21a',
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

const mockPooledStakes = {
  account: '0x1234',
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
  oneDay: '3.047713358665092375',
  oneWeek: '3.25756026351317301786',
  oneMonth: '3.25616054301749304217',
  threeMonths: '3.31863306662107446672',
  sixMonths: '3.05557344496273894133',
  oneYear: '0',
};

const setupController = ({
  options = {},

  mockGetNetworkClientById = jest.fn(() => ({
    configuration: { chainId: '0x1' },
    provider: {
      request: jest.fn(),
      on: jest.fn(),
      removeListener: jest.fn(),
    },
  })),

  mockGetNetworkControllerState = jest.fn(() => ({
    selectedNetworkClientId: '1',
    networkConfigurations: {
      '1': { chainId: '0x1' },
    },
  })),

  mockGetSelectedAccount = jest.fn(() => ({
    address: '0x1234',
  })),
}: {
  options?: Partial<ConstructorParameters<typeof EarnController>[0]>;
  mockGetNetworkClientById?: jest.Mock;
  mockGetNetworkControllerState?: jest.Mock;
  mockGetSelectedAccount?: jest.Mock;
} = {}) => {
  const messenger = buildMessenger();

  messenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    mockGetNetworkClientById,
  );
  messenger.registerActionHandler(
    'NetworkController:getState',
    mockGetNetworkControllerState,
  );
  messenger.registerActionHandler(
    'AccountsController:getSelectedAccount',
    mockGetSelectedAccount,
  );

  const earnControllerMessenger = getEarnControllerMessenger(messenger);

  const controller = new EarnController({
    messenger: earnControllerMessenger,
    ...options,
  });

  return { controller, messenger };
};

const StakingApiServiceMock = jest.mocked(StakingApiService);
let mockedStakingApiService: Partial<StakingApiService>;

describe('EarnController', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Apply StakeSdk mock before initializing EarnController
    (StakeSdk.create as jest.Mock).mockImplementation(() => ({
      pooledStakingContract: {
        connectSignerOrProvider: jest.fn(),
      },
    }));

    mockedStakingApiService = {
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
    } as Partial<StakingApiService>;

    StakingApiServiceMock.mockImplementation(
      () => mockedStakingApiService as StakingApiService,
    );
  });

  describe('constructor', () => {
    it('initializes with default state when no state is provided', () => {
      const { controller } = setupController();
      expect(controller.state).toStrictEqual(getDefaultEarnControllerState());
    });

    it('uses provided state to initialize', () => {
      const customState: Partial<EarnControllerState> = {
        pooled_staking: {
          pooledStakes: mockPooledStakes,
          exchangeRate: '1.5',
          vaultMetadata: mockVaultMetadata,
          isEligible: true,
          vaultDailyApys: mockPooledStakingVaultDailyApys,
          vaultApyAverages: mockPooledStakingVaultApyAverages,
        },
        lastUpdated: 1234567890,
      };

      const { controller } = setupController({
        options: { state: customState },
      });

      expect(controller.state).toStrictEqual({
        ...getDefaultEarnControllerState(),
        ...customState,
      });
    });
  });

  describe('SDK initialization', () => {
    it('initializes SDK with correct chain ID on construction', () => {
      setupController();
      expect(StakeSdk.create).toHaveBeenCalledWith({
        chainId: 1,
      });
    });

    it('handles SDK initialization failure gracefully by avoiding known errors', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      (StakeSdk.create as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Unsupported chainId');
      });

      // Unsupported chain id should not result in console error statement
      setupController();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('handles SDK initialization failure gracefully by logging error', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      (StakeSdk.create as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Network error');
      });

      // Unexpected error should be logged
      setupController();
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('reinitializes SDK when network changes', () => {
      const { messenger } = setupController();

      messenger.publish(
        'NetworkController:stateChange',
        {
          ...getDefaultNetworkControllerState(),
          selectedNetworkClientId: '2',
        },
        [],
      );

      expect(StakeSdk.create).toHaveBeenCalledTimes(2);
      expect(mockedStakingApiService.getPooledStakes).toHaveBeenCalled();
    });

    it('does not initialize sdk if the provider is null', () => {
      setupController({
        mockGetNetworkClientById: jest.fn(() => ({
          provider: null,
          configuration: { chainId: '0x1' },
        })),
      });
      expect(StakeSdk.create).not.toHaveBeenCalled();
    });
  });

  describe('refreshPooledStakingData', () => {
    it('updates state with fetched staking data', async () => {
      const { controller } = setupController();
      await controller.refreshPooledStakingData();

      expect(controller.state.pooled_staking).toStrictEqual({
        pooledStakes: mockPooledStakes,
        exchangeRate: '1.5',
        vaultMetadata: mockVaultMetadata,
        vaultDailyApys: mockPooledStakingVaultDailyApys,
        vaultApyAverages: mockPooledStakingVaultApyAverages,
        isEligible: true,
      });
      expect(controller.state.lastUpdated).toBeDefined();
    });

    it('does not invalidate cache when refreshing state', async () => {
      const { controller } = setupController();
      await controller.refreshPooledStakingData();

      expect(mockedStakingApiService.getPooledStakes).toHaveBeenNthCalledWith(
        // First call occurs during setupController()
        2,
        ['0x1234'],
        1,
        false,
      );
    });

    it('invalidates cache when refreshing state', async () => {
      const { controller } = setupController();
      await controller.refreshPooledStakingData(true);

      expect(mockedStakingApiService.getPooledStakes).toHaveBeenNthCalledWith(
        // First call occurs during setupController()
        2,
        ['0x1234'],
        1,
        true,
      );
    });

    it('handles API errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockedStakingApiService = {
        getPooledStakes: jest.fn().mockImplementation(() => {
          throw new Error('API Error');
        }),
        getPooledStakingEligibility: jest.fn().mockImplementation(() => {
          throw new Error('API Error');
        }),
        getVaultData: jest.fn().mockImplementation(() => {
          throw new Error('API Error');
        }),
      };

      StakingApiServiceMock.mockImplementation(
        () => mockedStakingApiService as StakingApiService,
      );

      const { controller } = setupController();

      await expect(controller.refreshPooledStakingData()).rejects.toThrow(
        'Failed to refresh some staking data: API Error, API Error, API Error',
      );
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    // if no account is selected, it should not fetch stakes data but still update vault metadata, vault daily apys and vault apy averages.
    it('does not fetch staking data if no account is selected', async () => {
      const { controller } = setupController({
        mockGetSelectedAccount: jest.fn(() => null),
      });

      expect(mockedStakingApiService.getPooledStakes).not.toHaveBeenCalled();

      await controller.refreshPooledStakingData();

      expect(controller.state.pooled_staking.pooledStakes).toStrictEqual(
        getDefaultEarnControllerState().pooled_staking.pooledStakes,
      );
      expect(controller.state.pooled_staking.vaultMetadata).toStrictEqual(
        mockVaultMetadata,
      );
      expect(controller.state.pooled_staking.vaultDailyApys).toStrictEqual(
        mockPooledStakingVaultDailyApys,
      );
      expect(controller.state.pooled_staking.vaultApyAverages).toStrictEqual(
        mockPooledStakingVaultApyAverages,
      );
      expect(controller.state.pooled_staking.isEligible).toBe(false);
    });
  });

  describe('refreshPooledStakes', () => {
    it('fetches without resetting cache when resetCache is false', async () => {
      const { controller } = setupController();
      await controller.refreshPooledStakes(false);

      // Assertion on second call since the first is part of controller setup.
      expect(mockedStakingApiService.getPooledStakes).toHaveBeenNthCalledWith(
        2,
        ['0x1234'],
        1,
        false,
      );
    });

    it('fetches without resetting cache when resetCache is undefined', async () => {
      const { controller } = setupController();
      await controller.refreshPooledStakes();

      // Assertion on second call since the first is part of controller setup.
      expect(mockedStakingApiService.getPooledStakes).toHaveBeenNthCalledWith(
        2,
        ['0x1234'],
        1,
        false,
      );
    });

    it('fetches while resetting cache', async () => {
      const { controller } = setupController();
      await controller.refreshPooledStakes(true);

      // Assertion on second call since the first is part of controller setup.
      expect(mockedStakingApiService.getPooledStakes).toHaveBeenNthCalledWith(
        2,
        ['0x1234'],
        1,
        true,
      );
    });
  });

  describe('subscription handlers', () => {
    const firstAccount = createMockInternalAccount({
      address: '0x1234',
    });

    it('updates staking data when network changes', () => {
      const { controller, messenger } = setupController();
      jest.spyOn(controller, 'refreshPooledStakingData').mockResolvedValue();
      messenger.publish(
        'NetworkController:stateChange',
        {
          ...getDefaultNetworkControllerState(),
          selectedNetworkClientId: '2',
        },
        [],
      );

      expect(controller.refreshPooledStakingData).toHaveBeenCalled();
    });

    it('updates staking data when selected account changes', () => {
      const { controller, messenger } = setupController();
      jest.spyOn(controller, 'refreshPooledStakingData').mockResolvedValue();
      messenger.publish(
        'AccountsController:selectedAccountChange',
        firstAccount,
      );
      expect(controller.refreshPooledStakingData).toHaveBeenCalled();
    });
  });
});
