import { Messenger } from '@metamask/base-controller';
import type { SnapId } from '@metamask/snaps-sdk';
import type { Hex } from '@metamask/utils';

import type {
  AllowedActions,
  AllowedEvents,
  GatorPermissionsControllerConfig,
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

const MOCK_CHAIN_ID_1: Hex = '0xaa36a7';
const MOCK_CHAIN_ID_2: Hex = '0x1';

type MockGatorPermissionsStorageEntriesConfig = {
  [chainId: string]: {
    nativeTokenStream: number;
    nativeTokenPeriodic: number;
    erc20TokenStream: number;
  };
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
): StoredGatorPermission<AccountSigner, PermissionTypes>[] {
  return Array.from({ length: amount }, (_, index: number) => ({
    ...mockStorageEntry,
    permissionResponse: {
      ...mockStorageEntry.permissionResponse,
      expiry: mockStorageEntry.permissionResponse.expiry + index,
    },
  }));
}

/**
 * Creates a mock gator permissions storage entry
 *
 * @param config - The config for the mock gator permissions storage entries.
 * @returns Mock gator permissions storage entry
 */
function mockGatorPermissionsStorageEntriesFactory(
  config: MockGatorPermissionsStorageEntriesConfig,
): StoredGatorPermission<AccountSigner, PermissionTypes>[] {
  const result: StoredGatorPermission<AccountSigner, PermissionTypes>[] = [];

  // Create entries for each chainId
  Object.entries(config).forEach(([chainId, counts]) => {
    const mockNativeTokenStreamStorageEntry: StoredGatorPermission<
      AccountSigner,
      NativeTokenStreamPermission
    > = {
      permissionResponse: {
        chainId: chainId as Hex,
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
        chainId: chainId as Hex,
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
        chainId: chainId as Hex,
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

    result.push(
      ...createMockGatorPermissionsStorageEntries(
        counts.nativeTokenStream,
        mockNativeTokenStreamStorageEntry,
      ),
      ...createMockGatorPermissionsStorageEntries(
        counts.nativeTokenPeriodic,
        mockNativeTokenPeriodicStorageEntry,
      ),
      ...createMockGatorPermissionsStorageEntries(
        counts.erc20TokenStream,
        mockErc20TokenStreamStorageEntry,
      ),
    );
  });

  return result;
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
    allowedActions: ['SnapController:handleRequest', 'SnapController:has'],
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
  const mockGetGrantedPermissions = jest.fn().mockResolvedValue(
    mockGatorPermissionsStorageEntriesFactory({
      [MOCK_CHAIN_ID_1]: {
        nativeTokenStream: 5,
        nativeTokenPeriodic: 5,
        erc20TokenStream: 5,
      },
      [MOCK_CHAIN_ID_2]: {
        nativeTokenStream: 5,
        nativeTokenPeriodic: 5,
        erc20TokenStream: 5,
      },
    }),
  );
  const mockHasSnap = jest.fn().mockResolvedValue(true);

  mockCall.mockImplementation((...args) => {
    const [actionType] = args;
    if (actionType === 'SnapController:handleRequest') {
      return mockGetGrantedPermissions();
    }
    if (actionType === 'SnapController:has') {
      return mockHasSnap();
    }

    throw new Error(
      `MOCK_FAIL - unsupported messenger call: ${actionType as string}`,
    );
  });

  return {
    messenger,
    baseMessenger,
    mockGetGrantedPermissions,
    mockHasSnap,
  };
}

const mockGatorPermissionsControllerConfig: GatorPermissionsControllerConfig = {
  gatorPermissionsProviderSnapId: 'local:http://localhost:8082' as SnapId,
};

describe('gator-permissions-controller - constructor() tests', () => {
  it('creates GatorPermissionsController with default state', () => {
    const controller = new GatorPermissionsController({
      messenger: createMockGatorPermissionsMessenger().messenger,
      config: mockGatorPermissionsControllerConfig,
    });

    expect(controller.state.isGatorPermissionsEnabled).toBe(false);
    expect(controller.state.gatorPermissionsListStringify).toStrictEqual(
      JSON.stringify({
        'native-token-stream': {},
        'native-token-periodic': {},
        'erc20-token-stream': {},
      }),
    );
    expect(controller.state.isFetchingGatorPermissions).toBe(false);
  });

  it('creates GatorPermissionsController with custom state', () => {
    const customState = {
      isGatorPermissionsEnabled: true,
      gatorPermissionsListStringify: JSON.stringify({
        'native-token-stream': {},
        'native-token-periodic': {},
        'erc20-token-stream': {},
      }),
    };

    const controller = new GatorPermissionsController({
      messenger: createMockGatorPermissionsMessenger().messenger,
      config: mockGatorPermissionsControllerConfig,
      state: customState,
    });

    expect(controller.permissionsProviderSnapId).toBe(
      mockGatorPermissionsControllerConfig.gatorPermissionsProviderSnapId,
    );
    expect(controller.state.isGatorPermissionsEnabled).toBe(true);
    expect(controller.state.gatorPermissionsListStringify).toBe(
      customState.gatorPermissionsListStringify,
    );
  });

  it('creates GatorPermissionsController with default config', () => {
    const controller = new GatorPermissionsController({
      messenger: createMockGatorPermissionsMessenger().messenger,
    });

    expect(controller.permissionsProviderSnapId).toBe(
      '@metamask/gator-permissions-snap' as SnapId,
    );
    expect(controller.state.isGatorPermissionsEnabled).toBe(false);
    expect(controller.state.isFetchingGatorPermissions).toBe(false);
  });
});

describe('gator-permissions-controller - disableGatorPermissions() tests', () => {
  it('disables gator permissions successfully', async () => {
    const { messenger } = createMockGatorPermissionsMessenger();

    const controller = new GatorPermissionsController({
      messenger,
      config: mockGatorPermissionsControllerConfig,
    });

    // Enable first
    await controller.enableGatorPermissions();
    expect(controller.state.isGatorPermissionsEnabled).toBe(true);

    // Then disable
    await controller.disableGatorPermissions();

    expect(controller.state.isGatorPermissionsEnabled).toBe(false);
    expect(controller.state.gatorPermissionsListStringify).toBe(
      JSON.stringify({
        'native-token-stream': {},
        'native-token-periodic': {},
        'erc20-token-stream': {},
      }),
    );
  });
});

describe('gator-permissions-controller - fetchAndUpdateGatorPermissions() tests', () => {
  it('fetches and updates gator permissions successfully', async () => {
    const { messenger } = createMockGatorPermissionsMessenger();

    const controller = new GatorPermissionsController({
      messenger,
      config: mockGatorPermissionsControllerConfig,
    });

    // Enable first
    await controller.enableGatorPermissions();

    const result = await controller.fetchAndUpdateGatorPermissions();

    expect(result).toStrictEqual({
      'native-token-stream': expect.any(Object),
      'native-token-periodic': expect.any(Object),
      'erc20-token-stream': expect.any(Object),
    });

    // Check that each permission type has the expected chainId
    expect(result['native-token-stream'][MOCK_CHAIN_ID_1]).toHaveLength(5);
    expect(result['native-token-periodic'][MOCK_CHAIN_ID_1]).toHaveLength(5);
    expect(result['erc20-token-stream'][MOCK_CHAIN_ID_1]).toHaveLength(5);
    expect(result['native-token-stream'][MOCK_CHAIN_ID_2]).toHaveLength(5);
    expect(result['native-token-periodic'][MOCK_CHAIN_ID_2]).toHaveLength(5);
    expect(result['erc20-token-stream'][MOCK_CHAIN_ID_2]).toHaveLength(5);
    expect(controller.state.isFetchingGatorPermissions).toBe(false);
  });

  it('throws error when gator permissions are not enabled', async () => {
    const { messenger } = createMockGatorPermissionsMessenger();

    const controller = new GatorPermissionsController({
      messenger,
      config: mockGatorPermissionsControllerConfig,
    });

    await expect(controller.fetchAndUpdateGatorPermissions()).rejects.toThrow(
      'Gator permissions are not enabled',
    );
  });

  it('handles null permissions data', async () => {
    const { messenger, mockGetGrantedPermissions } =
      createMockGatorPermissionsMessenger();

    mockGetGrantedPermissions.mockResolvedValue(null);

    const controller = new GatorPermissionsController({
      messenger,
      config: mockGatorPermissionsControllerConfig,
    });

    // Enable first
    await controller.enableGatorPermissions();

    const result = await controller.fetchAndUpdateGatorPermissions();

    expect(result).toStrictEqual({
      'native-token-stream': {},
      'native-token-periodic': {},
      'erc20-token-stream': {},
    });
  });

  it('handles empty permissions data', async () => {
    const { messenger, mockGetGrantedPermissions } =
      createMockGatorPermissionsMessenger();

    mockGetGrantedPermissions.mockResolvedValue([]);

    const controller = new GatorPermissionsController({
      messenger,
      config: mockGatorPermissionsControllerConfig,
    });

    // Enable first
    await controller.enableGatorPermissions();

    const result = await controller.fetchAndUpdateGatorPermissions();

    expect(result).toStrictEqual({
      'native-token-stream': {},
      'native-token-periodic': {},
      'erc20-token-stream': {},
    });
  });

  it('throws error for invalid permission type', async () => {
    const { messenger, mockGetGrantedPermissions } =
      createMockGatorPermissionsMessenger();

    mockGetGrantedPermissions.mockResolvedValue([
      {
        permissionResponse: {
          chainId: '0x1' as Hex,
          address: '0x123',
          expiry: 1750291200,
          isAdjustmentAllowed: true,
          signer: { type: 'account', data: { address: '0x123' } },
          permission: { type: 'invalid-type' },
          context: '0x00000000',
          accountMeta: [],
          signerMeta: {},
        },
        siteOrigin: 'http://localhost:8000',
      },
    ]);

    const controller = new GatorPermissionsController({
      messenger,
      config: mockGatorPermissionsControllerConfig,
    });

    // Enable first
    await controller.enableGatorPermissions();

    await expect(controller.fetchAndUpdateGatorPermissions()).rejects.toThrow(
      'Unsupported permission type: invalid-type',
    );
  });

  it('throws error for non-account signer type', async () => {
    const { messenger, mockGetGrantedPermissions } =
      createMockGatorPermissionsMessenger();

    mockGetGrantedPermissions.mockResolvedValue([
      {
        permissionResponse: {
          chainId: '0x1' as Hex,
          address: '0x123',
          expiry: 1750291200,
          isAdjustmentAllowed: true,
          signer: { type: 'wallet', data: {} },
          permission: { type: 'native-token-stream' },
          context: '0x00000000',
          accountMeta: [],
          signerMeta: {},
        },
        siteOrigin: 'http://localhost:8000',
      },
    ]);

    const controller = new GatorPermissionsController({
      messenger,
      config: mockGatorPermissionsControllerConfig,
    });

    // Enable first
    await controller.enableGatorPermissions();

    await expect(controller.fetchAndUpdateGatorPermissions()).rejects.toThrow(
      'Invalid permission signer type. Only account signer is supported',
    );
  });

  it('handles error during fetch and update', async () => {
    const { messenger, mockGetGrantedPermissions } =
      createMockGatorPermissionsMessenger();

    mockGetGrantedPermissions.mockRejectedValue(new Error('Storage error'));

    const controller = new GatorPermissionsController({
      messenger,
      config: mockGatorPermissionsControllerConfig,
    });

    // Enable first
    await controller.enableGatorPermissions();

    await expect(controller.fetchAndUpdateGatorPermissions()).rejects.toThrow(
      'Storage error',
    );

    expect(controller.state.isFetchingGatorPermissions).toBe(false);
  });
});

describe('gator-permissions-controller - gatorPermissionsList getter tests', () => {
  it('returns parsed gator permissions list', () => {
    const { messenger } = createMockGatorPermissionsMessenger();

    const controller = new GatorPermissionsController({
      messenger,
      config: mockGatorPermissionsControllerConfig,
    });

    const permissionsList = controller.gatorPermissionsList;

    expect(permissionsList).toStrictEqual({
      'native-token-stream': {},
      'native-token-periodic': {},
      'erc20-token-stream': {},
    });
  });

  it('returns parsed gator permissions list with data', () => {
    const { messenger } = createMockGatorPermissionsMessenger();

    const controller = new GatorPermissionsController({
      messenger,
      config: mockGatorPermissionsControllerConfig,
      state: {
        gatorPermissionsListStringify: JSON.stringify({
          'native-token-stream': { '0x1': [{ id: '1' }] },
          'native-token-periodic': { '0x2': [{ id: '2' }] },
          'erc20-token-stream': { '0x3': [{ id: '3' }] },
        }),
      },
    });

    const permissionsList = controller.gatorPermissionsList;

    expect(permissionsList).toStrictEqual({
      'native-token-stream': { '0x1': [{ id: '1' }] },
      'native-token-periodic': { '0x2': [{ id: '2' }] },
      'erc20-token-stream': { '0x3': [{ id: '3' }] },
    });
  });
});

describe('gator-permissions-controller - private methods tests', () => {
  it('clears loading states on initialization', () => {
    const { messenger } = createMockGatorPermissionsMessenger();

    const controller = new GatorPermissionsController({
      messenger,
      config: mockGatorPermissionsControllerConfig,
    });

    expect(controller.state.isFetchingGatorPermissions).toBe(false);
  });

  it('asserts gator permissions are enabled', async () => {
    const { messenger } = createMockGatorPermissionsMessenger();

    const controller = new GatorPermissionsController({
      messenger,
      config: mockGatorPermissionsControllerConfig,
    });

    // Should not throw when enabled
    await controller.enableGatorPermissions();
    expect(controller.state.isGatorPermissionsEnabled).toBe(true);
  });
});

describe('gator-permissions-controller - message handlers tests', () => {
  it('registers all message handlers', () => {
    const { messenger } = createMockGatorPermissionsMessenger();
    const mockRegisterActionHandler = jest.spyOn(
      messenger,
      'registerActionHandler',
    );

    new GatorPermissionsController({
      messenger,
      config: mockGatorPermissionsControllerConfig,
    });

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
  it('enables gator permissions successfully', async () => {
    const { messenger } = createMockGatorPermissionsMessenger();

    const controller = new GatorPermissionsController({
      messenger,
      config: mockGatorPermissionsControllerConfig,
    });

    await controller.enableGatorPermissions();

    expect(controller.state.isGatorPermissionsEnabled).toBe(true);
  });
});
