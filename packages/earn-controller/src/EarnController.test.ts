import type { AccountsController } from '@metamask/accounts-controller';
import { ControllerMessenger } from '@metamask/base-controller';
import { getDefaultNetworkControllerState } from '@metamask/network-controller';
import { StakeSdk, StakingApiService } from '@metamask/stake-sdk';

import {
  EarnController,
  EarnProductType,
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
  })),
}));

/**
 * Builds a new instance of the ControllerMessenger class for the AccountsController.
 *
 * @returns A new instance of the ControllerMessenger class for the AccountsController.
 */
function buildMessenger() {
  return new ControllerMessenger<
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
      'NetworkController:networkDidChange',
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
    scopes: ['eip155'],
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
const mockVaultData = {
  apy: '5.5',
  capacity: '1000000',
  feePercent: 10,
  totalAssets: '500000',
  vaultAddress: '0xabcd',
};

describe('EarnController', () => {
  let messenger: EarnControllerMessenger;
  let baseMessenger: ControllerMessenger<
    EarnControllerActions | AllowedActions,
    EarnControllerEvents | AllowedEvents
  >;
  let mockGetNetworkClient: jest.Mock;
  let mockGetState: jest.Mock;
  let mockGetSelectedAccount: jest.Mock;

  beforeEach(() => {
    // Apply StakeSdk mock before initializing EarnController
    (StakeSdk.create as jest.Mock).mockImplementation(() => ({
      pooledStakingContract: {
        connectSignerOrProvider: jest.fn(), // Prevent undefined error
      },
    }));

    (StakeSdk.create as jest.Mock).mockClear();

    // Create a fresh messenger for each test
    baseMessenger = buildMessenger();

    // Create mocks but with default implementations
    mockGetNetworkClient = jest.fn().mockImplementation(() => ({
      configuration: { chainId: '0x1' },
      provider: {
        request: jest.fn(),
        on: jest.fn(),
        removeListener: jest.fn(),
      },
    }));

    mockGetState = jest.fn().mockImplementation(() => ({
      selectedNetworkClientId: '1',
      networkConfigurations: {
        '1': { chainId: '0x1' },
      },
    }));

    mockGetSelectedAccount = jest.fn().mockImplementation(() => ({
      address: '0x1234',
    }));

    // Register handlers once
    baseMessenger.registerActionHandler(
      'NetworkController:getNetworkClientById',
      mockGetNetworkClient,
    );
    baseMessenger.registerActionHandler(
      'NetworkController:getState',
      mockGetState,
    );
    baseMessenger.registerActionHandler(
      'AccountsController:getSelectedAccount',
      mockGetSelectedAccount,
    );

    messenger = getEarnControllerMessenger(baseMessenger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('initializes with default state when no state is provided', () => {
      const controller = new EarnController({
        messenger,
      });
      expect(controller.state).toStrictEqual(getDefaultEarnControllerState());
    });

    it('uses provided state to initialize', () => {
      const customState: Partial<EarnControllerState> = {
        [EarnProductType.POOLED_STAKING]: {
          pooledStakes: {
            account: '0x1234',
            lifetimeRewards: '100',
            assets: '1000',
            exitRequests: [],
          },
          exchangeRate: '1.5',
          vaultData: {
            apy: '5.5',
            capacity: '1000000',
            feePercent: 10,
            totalAssets: '500000',
            vaultAddress: '0xabcd',
          },
          isEligible: true,
        },
        lastUpdated: 1234567890,
      };

      const controller = new EarnController({
        messenger,
        state: customState,
      });

      expect(controller.state).toStrictEqual({
        ...getDefaultEarnControllerState(),
        ...customState,
      });
    });
  });

  describe('SDK initialization', () => {
    it('initializes SDK with correct chain ID on construction', () => {
      new EarnController({ messenger });

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
      new EarnController({ messenger });
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('handles SDK initialization failure gracefully by logging error', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      (StakeSdk.create as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Network error');
      });

      // Unexpected error should be logged
      new EarnController({ messenger });
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('reinitializes SDK when network changes', () => {
      const mockedStakingApiService = {
        getPooledStakes: jest.fn().mockResolvedValue({
          accounts: [mockPooledStakes],
          exchangeRate: '1.5',
        }),
        getPooledStakingEligibility: jest.fn().mockResolvedValue({
          eligible: true,
        }),
        getVaultData: jest.fn().mockResolvedValue(mockVaultData),
      };

      (StakingApiService as jest.Mock).mockImplementation(
        () => mockedStakingApiService,
      );
      new EarnController({
        messenger,
      });

      baseMessenger.publish('NetworkController:networkDidChange', {
        ...getDefaultNetworkControllerState(),
        selectedNetworkClientId: '2',
      });

      expect(StakeSdk.create).toHaveBeenCalledTimes(2);
      expect(mockedStakingApiService.getPooledStakes).toHaveBeenCalled();
    });

    it('does not initialize sdk if the provider is null', () => {
      // Override implementation for this specific test
      mockGetNetworkClient.mockImplementation(() => ({
        provider: null,
      }));

      new EarnController({ messenger });
      expect(StakeSdk.create).not.toHaveBeenCalled();
    });
  });

  describe('fetchAndUpdateStakingData', () => {
    let controller: EarnController;

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('updates state with fetched staking data', async () => {
      const mockedStakingApiService = {
        getPooledStakes: jest.fn().mockResolvedValue({
          accounts: [mockPooledStakes],
          exchangeRate: '1.5',
        }),
        getPooledStakingEligibility: jest.fn().mockResolvedValue({
          eligible: true,
        }),
        getVaultData: jest.fn().mockResolvedValue(mockVaultData),
      };

      (StakingApiService as jest.Mock).mockImplementation(
        () => mockedStakingApiService,
      );

      controller = new EarnController({ messenger });
      await controller.refreshPooledStakingData();

      expect(controller.state[EarnProductType.POOLED_STAKING]).toStrictEqual({
        pooledStakes: mockPooledStakes,
        exchangeRate: '1.5',
        vaultData: mockVaultData,
        isEligible: true,
      });
      expect(controller.state.lastUpdated).toBeDefined();
    });

    it('handles API errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const mockedStakingApiService = {
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

      (StakingApiService as jest.Mock).mockImplementation(
        () => mockedStakingApiService,
      );

      controller = new EarnController({ messenger });

      await controller.refreshPooledStakingData();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to fetch pooled stakes:',
        expect.any(Error),
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to fetch staking eligibility:',
        expect.any(Error),
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to fetch vault data:',
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });

    // if no account is selected, it should not fetch staking data
    it('does not fetch staking data if no account is selected', async () => {
      mockGetSelectedAccount.mockImplementation(() => null);
      controller = new EarnController({ messenger });
      await controller.refreshPooledStakingData();
      expect(controller.state[EarnProductType.POOLED_STAKING]).toStrictEqual(
        getDefaultEarnControllerState()[EarnProductType.POOLED_STAKING],
      );
    });
  });

  describe('subscription handlers', () => {
    let controller: EarnController;

    const firstAccount = createMockInternalAccount({
      address: '0x1234',
    });

    beforeEach(() => {
      controller = new EarnController({ messenger });
      jest.spyOn(controller, 'refreshPooledStakingData').mockResolvedValue();
    });

    it('updates staking data when network changes', () => {
      baseMessenger.publish('NetworkController:networkDidChange', {
        ...getDefaultNetworkControllerState(),
        selectedNetworkClientId: '2',
      });

      expect(controller.refreshPooledStakingData).toHaveBeenCalled();
    });

    it('updates staking data when selected account changes', () => {
      baseMessenger.publish(
        'AccountsController:selectedAccountChange',
        firstAccount,
      );
      expect(controller.refreshPooledStakingData).toHaveBeenCalled();
    });
  });
});
