import { Messenger } from '@metamask/base-controller';

import type {
  AllowedActions,
  AllowedEvents,
} from './GatorPermissionsController';
import GatorPermissionsController from './GatorPermissionsController';
import type {
  AccountSigner,
  Erc20TokenStreamPermission,
  NativeTokenPeriodicPermission,
  NativeTokenStreamPermission,
  PermissionTypes,
  StoredGatorPermission,
} from './types';

type MockGatorPermissionsStorageEntriesConfig = {
  nativeTokenStream: number;
  nativeTokenPeriodic: number;
  erc20TokenStream: number;
};

/**
 * Creates a mock gator permissions storage entry
 *
 * @param amount - The amount of mock gator permissions storage entries to create.
 * @param mockStorageEntry - The mock gator permissions storage entry to create.
 * @returns Mock gator permissions storage entry
 */
function createMockGatorPermissionsStorageEntries(
  amount: number,
  mockStorageEntry: StoredGatorPermission<AccountSigner, PermissionTypes>,
): string[] {
  return Array.from({ length: amount }, (index: number) =>
    JSON.stringify({
      ...mockStorageEntry,
      expiry: mockStorageEntry.permissionResponse.expiry + index,
    }),
  );
}

/**
 * Creates a mock gator permissions storage entry
 *
 * @param config - The config for the mock gator permissions storage entries.
 * @returns Mock gator permissions storage entry
 */
function mockGatorPermissionsStorageEntriesFactory(
  config: MockGatorPermissionsStorageEntriesConfig,
): string[] {
  const mockNativeTokenStreamStorageEntry: StoredGatorPermission<
    AccountSigner,
    NativeTokenStreamPermission
  > = {
    permissionResponse: {
      chainId: '0xaa36a7',
      address: '0xB68c70159E9892DdF5659ec42ff9BD2bbC23e778',
      expiry: 1750291200,
      isAdjustmentAllowed: true,
      signer: {
        type: 'account',
        data: { address: '0x4f71DA06987BfeDE90aF0b33E1e3e4ffDCEE7a63' },
      },
      permission: {
        type: 'native-token-stream',
        data: {
          maxAmount: '0x22b1c8c1227a0000',
          initialAmount: '0x6f05b59d3b20000',
          amountPerSecond: '0x6f05b59d3b20000',
          startTime: 1747699200,
          justification:
            'This is a very important request for streaming allowance for some very important thing',
        },
        rules: {},
      },
      context: '0x00000000',
      accountMeta: [
        {
          factory: '0x69Aa2f9fe1572F1B640E1bbc512f5c3a734fc77c',
          factoryData: '0x0000000',
        },
      ],
      signerMeta: {
        delegationManager: '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3',
      },
    },
    siteOrigin: 'http://localhost:8000',
  };

  const mockNativeTokenPeriodicStorageEntry: StoredGatorPermission<
    AccountSigner,
    NativeTokenPeriodicPermission
  > = {
    permissionResponse: {
      chainId: '0xaa36a7',
      address: '0xB68c70159E9892DdF5659ec42ff9BD2bbC23e778',
      expiry: 1750291200,
      isAdjustmentAllowed: true,
      signer: {
        type: 'account',
        data: { address: '0x4f71DA06987BfeDE90aF0b33E1e3e4ffDCEE7a63' },
      },
      permission: {
        type: 'native-token-periodic',
        data: {
          periodAmount: '0x22b1c8c1227a0000',
          periodDuration: 1747699200,
          startTime: 1747699200,
          justification:
            'This is a very important request for streaming allowance for some very important thing',
        },
        rules: {},
      },
      context: '0x00000000',
      accountMeta: [
        {
          factory: '0x69Aa2f9fe1572F1B640E1bbc512f5c3a734fc77c',
          factoryData: '0x0000000',
        },
      ],
      signerMeta: {
        delegationManager: '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3',
      },
    },
    siteOrigin: 'http://localhost:8000',
  };

  const mockErc20TokenStreamStorageEntry: StoredGatorPermission<
    AccountSigner,
    Erc20TokenStreamPermission
  > = {
    permissionResponse: {
      chainId: '0xaa36a7',
      address: '0xB68c70159E9892DdF5659ec42ff9BD2bbC23e778',
      expiry: 1750291200,
      isAdjustmentAllowed: true,
      signer: {
        type: 'account',
        data: { address: '0x4f71DA06987BfeDE90aF0b33E1e3e4ffDCEE7a63' },
      },
      permission: {
        type: 'erc20-token-stream',
        data: {
          initialAmount: '0x22b1c8c1227a0000',
          maxAmount: '0x6f05b59d3b20000',
          amountPerSecond: '0x6f05b59d3b20000',
          startTime: 1747699200,
          tokenAddress: '0xB68c70159E9892DdF5659ec42ff9BD2bbC23e778',
          justification:
            'This is a very important request for streaming allowance for some very important thing',
        },
        rules: {},
      },
      context: '0x00000000',
      accountMeta: [
        {
          factory: '0x69Aa2f9fe1572F1B640E1bbc512f5c3a734fc77c',
          factoryData: '0x0000000',
        },
      ],
      signerMeta: {
        delegationManager: '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3',
      },
    },
    siteOrigin: 'http://localhost:8000',
  };

  return [
    ...createMockGatorPermissionsStorageEntries(
      config.nativeTokenStream,
      mockNativeTokenStreamStorageEntry,
    ),
    ...createMockGatorPermissionsStorageEntries(
      config.nativeTokenPeriodic,
      mockNativeTokenPeriodicStorageEntry,
    ),
    ...createMockGatorPermissionsStorageEntries(
      config.erc20TokenStream,
      mockErc20TokenStreamStorageEntry,
    ),
  ];
}

/**
 * Jest Test Utility - create Gator Permissions Messenger
 *
 * @returns Gator Permissions Messenger
 */
function createGatorPermissionsMessenger() {
  const baseMessenger = new Messenger<AllowedActions, AllowedEvents>();
  const messenger = baseMessenger.getRestricted({
    name: 'GatorPermissionsController',
    allowedActions: [
      'AuthenticationController:isSignedIn',
      'AuthenticationController:performSignIn',
      'UserStorageController:performGetStorageAllFeatureEntries',
    ],
    allowedEvents: [],
  });

  return { messenger, baseMessenger };
}

/**
 * Jest Test Utility - create Mock Gator Permissions Messenger
 *
 * @returns Mock Gator Permissions Messenger
 */
function createMockGatorPermissionsMessenger() {
  const { baseMessenger, messenger } = createGatorPermissionsMessenger();

  const mockCall = jest.spyOn(messenger, 'call');
  const mockIsSignedIn = jest.fn();
  const mockPerformSignIn = jest.fn();
  const mockGetStorageAllFeatureEntries = jest.fn().mockResolvedValue(
    mockGatorPermissionsStorageEntriesFactory({
      nativeTokenStream: 5,
      nativeTokenPeriodic: 5,
      erc20TokenStream: 5,
    }),
  );

  mockCall.mockImplementation((...args) => {
    const [actionType] = args;
    if (actionType === 'AuthenticationController:isSignedIn') {
      return mockIsSignedIn();
    }

    if (actionType === 'AuthenticationController:performSignIn') {
      return mockPerformSignIn();
    }

    if (
      actionType === 'UserStorageController:performGetStorageAllFeatureEntries'
    ) {
      return mockGetStorageAllFeatureEntries();
    }

    throw new Error(
      `MOCK_FAIL - unsupported messenger call: ${actionType as string}`,
    );
  });

  return {
    messenger,
    baseMessenger,
    mockIsSignedIn,
    mockPerformSignIn,
    mockGetStorageAllFeatureEntries,
  };
}

describe('gator-permissions-controller - constructor() tests', () => {
  it('creates GatorPermissionsController with default state', () => {
    const controller = new GatorPermissionsController({
      messenger: createMockGatorPermissionsMessenger().messenger,
    });

    expect(controller.state.isGatorPermissionsEnabled).toBe(false);
    expect(controller.state.gatorPermissionsListStringify).toStrictEqual(
      JSON.stringify({
        'native-token-stream': [],
        'native-token-periodic': [],
        'erc20-token-stream': [],
      }),
    );
    expect(controller.state.isFetchingGatorPermissions).toBe(false);
    expect(controller.state.isUpdatingGatorPermissions).toBe(false);
  });

  it('creates GatorPermissionsController with custom state', () => {
    const customState = {
      isGatorPermissionsEnabled: true,
      gatorPermissionsListStringify: JSON.stringify({
        'native-token-stream': [],
        'native-token-periodic': [],
        'erc20-token-stream': [],
      }),
    };

    const controller = new GatorPermissionsController({
      messenger: createMockGatorPermissionsMessenger().messenger,
      state: customState,
    });

    expect(controller.state.isGatorPermissionsEnabled).toBe(true);
    expect(controller.state.gatorPermissionsListStringify).toBe(
      customState.gatorPermissionsListStringify,
    );
  });
});

describe('gator-permissions-controller - disableGatorPermissions() tests', () => {
  it('disables gator permissions successfully', async () => {
    const { messenger, mockIsSignedIn } = createMockGatorPermissionsMessenger();

    // Mock user already signed in
    mockIsSignedIn.mockReturnValue(true);

    const controller = new GatorPermissionsController({ messenger });

    // Enable first
    await controller.enableGatorPermissions();
    expect(controller.state.isGatorPermissionsEnabled).toBe(true);

    // Then disable
    await controller.disableGatorPermissions();

    expect(controller.state.isGatorPermissionsEnabled).toBe(false);
    expect(controller.state.gatorPermissionsListStringify).toBe(
      JSON.stringify({
        'native-token-stream': [],
        'native-token-periodic': [],
        'erc20-token-stream': [],
      }),
    );
  });
});

describe('gator-permissions-controller - fetchAndUpdateGatorPermissions() tests', () => {
  it('fetches and updates gator permissions successfully', async () => {
    const { messenger, mockIsSignedIn } = createMockGatorPermissionsMessenger();

    // Mock user already signed in
    mockIsSignedIn.mockReturnValue(true);

    const controller = new GatorPermissionsController({ messenger });

    // Enable first
    await controller.enableGatorPermissions();

    const result = await controller.fetchAndUpdateGatorPermissions();

    expect(result).toStrictEqual({
      'native-token-stream': expect.any(Array),
      'native-token-periodic': expect.any(Array),
      'erc20-token-stream': expect.any(Array),
    });

    expect(result['native-token-stream']).toHaveLength(5);
    expect(result['native-token-periodic']).toHaveLength(5);
    expect(result['erc20-token-stream']).toHaveLength(5);
    expect(controller.state.isFetchingGatorPermissions).toBe(false);
  });

  it('throws error when gator permissions are not enabled', async () => {
    const { messenger } = createMockGatorPermissionsMessenger();

    const controller = new GatorPermissionsController({ messenger });

    await expect(controller.fetchAndUpdateGatorPermissions()).rejects.toThrow(
      'Failed to fetch gator permissions',
    );
  });

  it('handles null permissions data', async () => {
    const { messenger, mockGetStorageAllFeatureEntries, mockIsSignedIn } =
      createMockGatorPermissionsMessenger();

    mockGetStorageAllFeatureEntries.mockResolvedValue(null);
    mockIsSignedIn.mockReturnValue(true);

    const controller = new GatorPermissionsController({ messenger });

    // Enable first
    await controller.enableGatorPermissions();

    const result = await controller.fetchAndUpdateGatorPermissions();

    expect(result).toStrictEqual({
      'native-token-stream': [],
      'native-token-periodic': [],
      'erc20-token-stream': [],
    });
  });

  it('handles empty permissions data', async () => {
    const { messenger, mockGetStorageAllFeatureEntries, mockIsSignedIn } =
      createMockGatorPermissionsMessenger();

    mockGetStorageAllFeatureEntries.mockResolvedValue([]);
    mockIsSignedIn.mockReturnValue(true);

    const controller = new GatorPermissionsController({ messenger });

    // Enable first
    await controller.enableGatorPermissions();

    const result = await controller.fetchAndUpdateGatorPermissions();

    expect(result).toStrictEqual({
      'native-token-stream': [],
      'native-token-periodic': [],
      'erc20-token-stream': [],
    });
  });

  it('throws error for invalid permission type', async () => {
    const { messenger, mockGetStorageAllFeatureEntries, mockIsSignedIn } =
      createMockGatorPermissionsMessenger();

    mockGetStorageAllFeatureEntries.mockResolvedValue([
      JSON.stringify({
        permissionResponse: {
          signer: { type: 'account', data: { address: '0x123' } },
          permission: { type: 'invalid-type' },
        },
        siteOrigin: 'http://localhost:8000',
      }),
    ]);
    mockIsSignedIn.mockReturnValue(true);

    const controller = new GatorPermissionsController({ messenger });

    // Enable first
    await controller.enableGatorPermissions();

    await expect(controller.fetchAndUpdateGatorPermissions()).rejects.toThrow(
      'Failed to fetch gator permissions',
    );
  });

  it('throws error for non-account signer type', async () => {
    const { messenger, mockGetStorageAllFeatureEntries, mockIsSignedIn } =
      createMockGatorPermissionsMessenger();

    mockGetStorageAllFeatureEntries.mockResolvedValue([
      JSON.stringify({
        permissionResponse: {
          signer: { type: 'wallet', data: {} },
          permission: { type: 'native-token-stream' },
        },
        siteOrigin: 'http://localhost:8000',
      }),
    ]);
    mockIsSignedIn.mockReturnValue(true);

    const controller = new GatorPermissionsController({ messenger });

    // Enable first
    await controller.enableGatorPermissions();

    await expect(controller.fetchAndUpdateGatorPermissions()).rejects.toThrow(
      'Failed to fetch gator permissions',
    );
  });

  it('handles error during fetch and update', async () => {
    const { messenger, mockGetStorageAllFeatureEntries, mockIsSignedIn } =
      createMockGatorPermissionsMessenger();

    mockGetStorageAllFeatureEntries.mockRejectedValue(
      new Error('Storage error'),
    );
    mockIsSignedIn.mockReturnValue(true);

    const controller = new GatorPermissionsController({ messenger });

    // Enable first
    await controller.enableGatorPermissions();

    await expect(controller.fetchAndUpdateGatorPermissions()).rejects.toThrow(
      'Failed to fetch gator permissions',
    );

    expect(controller.state.isFetchingGatorPermissions).toBe(false);
  });
});

describe('gator-permissions-controller - gatorPermissionsList getter tests', () => {
  it('returns parsed gator permissions list', () => {
    const { messenger } = createMockGatorPermissionsMessenger();

    const controller = new GatorPermissionsController({ messenger });

    const permissionsList = controller.gatorPermissionsList;

    expect(permissionsList).toStrictEqual({
      'native-token-stream': [],
      'native-token-periodic': [],
      'erc20-token-stream': [],
    });
  });

  it('returns parsed gator permissions list with data', () => {
    const { messenger } = createMockGatorPermissionsMessenger();

    const controller = new GatorPermissionsController({
      messenger,
      state: {
        gatorPermissionsListStringify: JSON.stringify({
          'native-token-stream': [{ id: '1' }],
          'native-token-periodic': [{ id: '2' }],
          'erc20-token-stream': [{ id: '3' }],
        }),
      },
    });

    const permissionsList = controller.gatorPermissionsList;

    expect(permissionsList).toStrictEqual({
      'native-token-stream': [{ id: '1' }],
      'native-token-periodic': [{ id: '2' }],
      'erc20-token-stream': [{ id: '3' }],
    });
  });
});

describe('gator-permissions-controller - private methods tests', () => {
  it('clears loading states on initialization', () => {
    const { messenger } = createMockGatorPermissionsMessenger();

    const controller = new GatorPermissionsController({ messenger });

    expect(controller.state.isFetchingGatorPermissions).toBe(false);
    expect(controller.state.isUpdatingGatorPermissions).toBe(false);
  });

  it('asserts gator permissions are enabled', async () => {
    const { messenger, mockIsSignedIn } = createMockGatorPermissionsMessenger();

    // Mock user already signed in
    mockIsSignedIn.mockReturnValue(true);

    const controller = new GatorPermissionsController({ messenger });

    // Should not throw when enabled
    await controller.enableGatorPermissions();
    expect(controller.state.isGatorPermissionsEnabled).toBe(true);
  });

  it('asserts gator permissions are not enabled', async () => {
    const { messenger } = createMockGatorPermissionsMessenger();

    const controller = new GatorPermissionsController({ messenger });

    await expect(controller.fetchAndUpdateGatorPermissions()).rejects.toThrow(
      'Failed to fetch gator permissions',
    );
  });
});

describe('gator-permissions-controller - message handlers tests', () => {
  it('registers all message handlers', () => {
    const { messenger } = createMockGatorPermissionsMessenger();
    const mockRegisterActionHandler = jest.spyOn(
      messenger,
      'registerActionHandler',
    );

    new GatorPermissionsController({ messenger });

    expect(mockRegisterActionHandler).toHaveBeenCalledWith(
      'GatorPermissionsController:fetchAndUpdateGatorPermissions',
      expect.any(Function),
    );
    expect(mockRegisterActionHandler).toHaveBeenCalledWith(
      'GatorPermissionsController:enableGatorPermissions',
      expect.any(Function),
    );
    expect(mockRegisterActionHandler).toHaveBeenCalledWith(
      'GatorPermissionsController:disableGatorPermissions',
      expect.any(Function),
    );
  });
});

describe('gator-permissions-controller - enableGatorPermissions() tests', () => {
  it('enables gator permissions successfully when user is already signed in', async () => {
    const { messenger, mockIsSignedIn } = createMockGatorPermissionsMessenger();

    // Mock user already signed in
    mockIsSignedIn.mockReturnValue(true);

    const controller = new GatorPermissionsController({ messenger });

    await controller.enableGatorPermissions();

    expect(controller.state.isGatorPermissionsEnabled).toBe(true);
    expect(controller.state.isUpdatingGatorPermissions).toBe(false);
  });

  it('enables gator permissions successfully when user needs to sign in', async () => {
    const { messenger, mockIsSignedIn, mockPerformSignIn } =
      createMockGatorPermissionsMessenger();

    // Mock user not signed in initially, then signed in after sign in
    mockIsSignedIn.mockReturnValueOnce(false).mockReturnValueOnce(true);
    mockPerformSignIn.mockResolvedValue(undefined);

    const controller = new GatorPermissionsController({ messenger });

    await controller.enableGatorPermissions();

    expect(controller.state.isGatorPermissionsEnabled).toBe(true);
    expect(controller.state.isUpdatingGatorPermissions).toBe(false);
    expect(mockPerformSignIn).toHaveBeenCalled();
  });

  it('handles error during enableGatorPermissions when signIn fails', async () => {
    const { messenger, mockIsSignedIn, mockPerformSignIn } =
      createMockGatorPermissionsMessenger();

    // Mock user not signed in and sign in fails
    mockIsSignedIn.mockReturnValue(false);
    mockPerformSignIn.mockRejectedValue(new Error('Sign in failed'));

    const controller = new GatorPermissionsController({ messenger });

    await expect(controller.enableGatorPermissions()).rejects.toThrow(
      'Unable to enable gator permissions',
    );

    expect(controller.state.isGatorPermissionsEnabled).toBe(false);
    expect(controller.state.isUpdatingGatorPermissions).toBe(false);
  });
});

describe('gator-permissions-controller - auth methods tests', () => {
  it('calls signIn when user is not signed in', async () => {
    const { messenger, mockIsSignedIn, mockPerformSignIn } =
      createMockGatorPermissionsMessenger();

    mockIsSignedIn.mockReturnValue(false);
    mockPerformSignIn.mockResolvedValue(undefined);

    const controller = new GatorPermissionsController({ messenger });

    await controller.enableGatorPermissions();

    expect(mockPerformSignIn).toHaveBeenCalled();
  });
});
