import { Messenger } from '@metamask/base-controller';
import type { SnapId } from '@metamask/snaps-sdk';
import type { Hex } from '@metamask/utils';

import type {
  AllowedActions,
  AllowedEvents,
  GatorPermissionsControllerConfig,
} from './GatorPermissionsController';
import GatorPermissionsController from './GatorPermissionsController';
import {
  mockCustomPermissionStorageEntry,
  mockErc20TokenPeriodicStorageEntry,
  mockErc20TokenStreamStorageEntry,
  mockGatorPermissionsStorageEntriesFactory,
  mockNativeTokenPeriodicStorageEntry,
  mockNativeTokenStreamStorageEntry,
} from './test/mocks';
import type { GatorPermissionsMap } from './types';

const MOCK_CHAIN_ID_1: Hex = '0xaa36a7';
const MOCK_CHAIN_ID_2: Hex = '0x1';

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
        erc20TokenPeriodic: 5,
        custom: {
          count: 2,
          data: [
            {
              customData: 'customData-0',
            },
            {
              customData: 'customData-1',
            },
          ],
        },
      },
      [MOCK_CHAIN_ID_2]: {
        nativeTokenStream: 5,
        nativeTokenPeriodic: 5,
        erc20TokenStream: 5,
        erc20TokenPeriodic: 5,
        custom: {
          count: 2,
          data: [
            {
              customData: 'customData-0',
            },
            {
              customData: 'customData-1',
            },
          ],
        },
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
    expect(controller.state.gatorPermissionsMapSerialized).toStrictEqual(
      JSON.stringify({
        'native-token-stream': {},
        'native-token-periodic': {},
        'erc20-token-stream': {},
        'erc20-token-periodic': {},
        other: {},
      }),
    );
    expect(controller.state.isFetchingGatorPermissions).toBe(false);
  });

  it('creates GatorPermissionsController with custom state', () => {
    const customState = {
      isGatorPermissionsEnabled: true,
      gatorPermissionsMap: JSON.stringify({
        'native-token-stream': {},
        'native-token-periodic': {},
        'erc20-token-stream': {},
        'erc20-token-periodic': {},
        other: {},
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
    expect(controller.state.gatorPermissionsMapSerialized).toBe(
      customState.gatorPermissionsMap,
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

    await controller.enableGatorPermissions();
    expect(controller.state.isGatorPermissionsEnabled).toBe(true);

    await controller.disableGatorPermissions();

    expect(controller.state.isGatorPermissionsEnabled).toBe(false);
    expect(controller.state.gatorPermissionsMapSerialized).toBe(
      JSON.stringify({
        'native-token-stream': {},
        'native-token-periodic': {},
        'erc20-token-stream': {},
        'erc20-token-periodic': {},
        other: {},
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

    await controller.enableGatorPermissions();

    const result = await controller.fetchAndUpdateGatorPermissions();

    expect(result).toStrictEqual({
      'native-token-stream': expect.any(Object),
      'native-token-periodic': expect.any(Object),
      'erc20-token-stream': expect.any(Object),
      'erc20-token-periodic': expect.any(Object),
      other: expect.any(Object),
    });

    // Check that each permission type has the expected chainId
    expect(result['native-token-stream'][MOCK_CHAIN_ID_1]).toHaveLength(5);
    expect(result['native-token-periodic'][MOCK_CHAIN_ID_1]).toHaveLength(5);
    expect(result['erc20-token-stream'][MOCK_CHAIN_ID_1]).toHaveLength(5);
    expect(result['native-token-stream'][MOCK_CHAIN_ID_2]).toHaveLength(5);
    expect(result['native-token-periodic'][MOCK_CHAIN_ID_2]).toHaveLength(5);
    expect(result['erc20-token-stream'][MOCK_CHAIN_ID_2]).toHaveLength(5);
    expect(result.other[MOCK_CHAIN_ID_1]).toHaveLength(2);
    expect(result.other[MOCK_CHAIN_ID_2]).toHaveLength(2);
    expect(controller.state.isFetchingGatorPermissions).toBe(false);

    // check that the gator permissions map is sanitized
    const sanitizedCheck = (permissionType: keyof GatorPermissionsMap) => {
      const flattenedStoredGatorPermissions = Object.values(
        result[permissionType],
      ).flat();
      flattenedStoredGatorPermissions.forEach((permission) => {
        expect(
          permission.permissionResponse.isAdjustmentAllowed,
        ).toBeUndefined();
        expect(permission.permissionResponse.accountMeta).toBeUndefined();
        expect(permission.permissionResponse.signer).toBeUndefined();
      });
    };

    sanitizedCheck('native-token-stream');
    sanitizedCheck('native-token-periodic');
    sanitizedCheck('erc20-token-stream');
    sanitizedCheck('erc20-token-periodic');
    sanitizedCheck('other');
  });

  it('throws error when gator permissions are not enabled', async () => {
    const { messenger } = createMockGatorPermissionsMessenger();

    const controller = new GatorPermissionsController({
      messenger,
      config: mockGatorPermissionsControllerConfig,
    });

    await expect(controller.fetchAndUpdateGatorPermissions()).rejects.toThrow(
      'Failed to fetch gator permissions',
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

    await controller.enableGatorPermissions();

    const result = await controller.fetchAndUpdateGatorPermissions();

    expect(result).toStrictEqual({
      'native-token-stream': {},
      'native-token-periodic': {},
      'erc20-token-stream': {},
      'erc20-token-periodic': {},
      other: {},
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

    await controller.enableGatorPermissions();

    const result = await controller.fetchAndUpdateGatorPermissions();

    expect(result).toStrictEqual({
      'native-token-stream': {},
      'native-token-periodic': {},
      'erc20-token-stream': {},
      'erc20-token-periodic': {},
      other: {},
    });
  });

  it('handles error during fetch and update', async () => {
    const { messenger, mockGetGrantedPermissions } =
      createMockGatorPermissionsMessenger();

    mockGetGrantedPermissions.mockRejectedValue(new Error('Storage error'));

    const controller = new GatorPermissionsController({
      messenger,
      config: mockGatorPermissionsControllerConfig,
    });

    await controller.enableGatorPermissions();

    await expect(controller.fetchAndUpdateGatorPermissions()).rejects.toThrow(
      'Failed to fetch gator permissions',
    );

    expect(controller.state.isFetchingGatorPermissions).toBe(false);
  });
});

describe('gator-permissions-controller - gatorPermissionsMap getter tests', () => {
  it('returns parsed gator permissions map', () => {
    const { messenger } = createMockGatorPermissionsMessenger();

    const controller = new GatorPermissionsController({
      messenger,
      config: mockGatorPermissionsControllerConfig,
    });

    const { gatorPermissionsMap } = controller;

    expect(gatorPermissionsMap).toStrictEqual({
      'native-token-stream': {},
      'native-token-periodic': {},
      'erc20-token-stream': {},
      'erc20-token-periodic': {},
      other: {},
    });
  });

  it('returns parsed gator permissions map with data when state is provided', () => {
    const { messenger } = createMockGatorPermissionsMessenger();
    const mockState = {
      'native-token-stream': {
        '0x1': [mockNativeTokenStreamStorageEntry('0x1')],
      },
      'native-token-periodic': {
        '0x2': [mockNativeTokenPeriodicStorageEntry('0x2')],
      },
      'erc20-token-stream': {
        '0x3': [mockErc20TokenStreamStorageEntry('0x3')],
      },
      'erc20-token-periodic': {
        '0x4': [mockErc20TokenPeriodicStorageEntry('0x4')],
      },
      other: {
        '0x5': [
          mockCustomPermissionStorageEntry('0x5', {
            customData: 'customData-0',
          }),
        ],
      },
    };

    const controller = new GatorPermissionsController({
      messenger,
      config: mockGatorPermissionsControllerConfig,
      state: {
        gatorPermissionsMapSerialized: JSON.stringify(mockState),
      },
    });

    const { gatorPermissionsMap } = controller;

    expect(gatorPermissionsMap).toStrictEqual(mockState);
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
