import {
  MOCK_ANY_NAMESPACE,
  Messenger,
  type MessengerActions,
  type MessengerEvents,
  type MockAnyNamespace,
} from '@metamask/messenger';
import type { HandleSnapRequest, HasSnap } from '@metamask/snaps-controllers';
import type { SnapId } from '@metamask/snaps-sdk';
import type { Hex } from '@metamask/utils';

import type { GatorPermissionsControllerMessenger } from './GatorPermissionsController';
import GatorPermissionsController from './GatorPermissionsController';
import {
  mockCustomPermissionStorageEntry,
  mockErc20TokenPeriodicStorageEntry,
  mockErc20TokenStreamStorageEntry,
  mockGatorPermissionsStorageEntriesFactory,
  mockNativeTokenPeriodicStorageEntry,
  mockNativeTokenStreamStorageEntry,
} from './test/mocks';
import type {
  AccountSigner,
  GatorPermissionsMap,
  StoredGatorPermission,
  PermissionTypes,
} from './types';

const MOCK_CHAIN_ID_1: Hex = '0xaa36a7';
const MOCK_CHAIN_ID_2: Hex = '0x1';
const MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID =
  'local:http://localhost:8082' as SnapId;
const MOCK_GATOR_PERMISSIONS_STORAGE_ENTRIES: StoredGatorPermission<
  AccountSigner,
  PermissionTypes
>[] = mockGatorPermissionsStorageEntriesFactory({
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
});

describe('GatorPermissionsController', () => {
  describe('constructor', () => {
    it('creates GatorPermissionsController with default state', () => {
      const controller = new GatorPermissionsController({
        messenger: getGatorPermissionsControllerMessenger(),
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
        gatorPermissionsMapSerialized: JSON.stringify({
          'native-token-stream': {},
          'native-token-periodic': {},
          'erc20-token-stream': {},
          'erc20-token-periodic': {},
          other: {},
        }),
        gatorPermissionsProviderSnapId: MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID,
      };

      const controller = new GatorPermissionsController({
        messenger: getGatorPermissionsControllerMessenger(),
        state: customState,
      });

      expect(controller.state.gatorPermissionsProviderSnapId).toBe(
        MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID,
      );
      expect(controller.state.isGatorPermissionsEnabled).toBe(true);
      expect(controller.state.gatorPermissionsMapSerialized).toBe(
        customState.gatorPermissionsMapSerialized,
      );
    });

    it('creates GatorPermissionsController with default config', () => {
      const controller = new GatorPermissionsController({
        messenger: getGatorPermissionsControllerMessenger(),
      });

      expect(controller.permissionsProviderSnapId).toBe(
        '@metamask/gator-permissions-snap' as SnapId,
      );
      expect(controller.state.isGatorPermissionsEnabled).toBe(false);
      expect(controller.state.isFetchingGatorPermissions).toBe(false);
    });

    it('isFetchingGatorPermissions is false on initialization', () => {
      const controller = new GatorPermissionsController({
        messenger: getGatorPermissionsControllerMessenger(),
        state: {
          isFetchingGatorPermissions: true,
        },
      });

      expect(controller.state.isFetchingGatorPermissions).toBe(false);
    });
  });

  describe('disableGatorPermissions', () => {
    it('disables gator permissions successfully', async () => {
      const controller = new GatorPermissionsController({
        messenger: getGatorPermissionsControllerMessenger(),
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

  describe('fetchAndUpdateGatorPermissions', () => {
    it('fetches and updates gator permissions successfully', async () => {
      const controller = new GatorPermissionsController({
        messenger: getGatorPermissionsControllerMessenger(),
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
      const controller = new GatorPermissionsController({
        messenger: getGatorPermissionsControllerMessenger(),
      });

      await controller.disableGatorPermissions();

      await expect(controller.fetchAndUpdateGatorPermissions()).rejects.toThrow(
        'Failed to fetch gator permissions',
      );
    });

    it('handles null permissions data', async () => {
      const rootMessenger = getRootMessenger({
        snapControllerHandleRequestActionHandler: async () => null,
      });

      const controller = new GatorPermissionsController({
        messenger: getGatorPermissionsControllerMessenger(rootMessenger),
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
      const rootMessenger = getRootMessenger({
        snapControllerHandleRequestActionHandler: async () => [],
      });

      const controller = new GatorPermissionsController({
        messenger: getGatorPermissionsControllerMessenger(rootMessenger),
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
      const rootMessenger = getRootMessenger({
        snapControllerHandleRequestActionHandler: async () => {
          throw new Error('Storage error');
        },
      });

      const controller = new GatorPermissionsController({
        messenger: getGatorPermissionsControllerMessenger(rootMessenger),
      });

      await controller.enableGatorPermissions();

      await expect(controller.fetchAndUpdateGatorPermissions()).rejects.toThrow(
        'Failed to fetch gator permissions',
      );

      expect(controller.state.isFetchingGatorPermissions).toBe(false);
    });
  });

  describe('gatorPermissionsMap getter tests', () => {
    it('returns parsed gator permissions map', () => {
      const controller = new GatorPermissionsController({
        messenger: getGatorPermissionsControllerMessenger(),
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
        messenger: getGatorPermissionsControllerMessenger(),
        state: {
          gatorPermissionsMapSerialized: JSON.stringify(mockState),
        },
      });

      const { gatorPermissionsMap } = controller;

      expect(gatorPermissionsMap).toStrictEqual(mockState);
    });
  });

  describe('message handlers tests', () => {
    it('registers all message handlers', () => {
      const messenger = getGatorPermissionsControllerMessenger();
      const mockRegisterActionHandler = jest.spyOn(
        messenger,
        'registerActionHandler',
      );

      new GatorPermissionsController({
        messenger,
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

  describe('enableGatorPermissions', () => {
    it('enables gator permissions successfully', async () => {
      const controller = new GatorPermissionsController({
        messenger: getGatorPermissionsControllerMessenger(),
      });

      await controller.enableGatorPermissions();

      expect(controller.state.isGatorPermissionsEnabled).toBe(true);
    });
  });
});

/**
 * The union of actions that the root messenger allows.
 */
type AllGatorPermissionsControllerActions =
  MessengerActions<GatorPermissionsControllerMessenger>;

/**
 * The union of events that the root messenger allows.
 */
type AllGatorPermissionsControllerEvents =
  MessengerEvents<GatorPermissionsControllerMessenger>;

type RootMessenger = Messenger<
  MockAnyNamespace,
  AllGatorPermissionsControllerActions,
  AllGatorPermissionsControllerEvents
>;

/**
 * Constructs the root messenger. This can be used to call actions and
 * publish events within the tests for this controller.
 *
 * @param args - The arguments to this function.
 * `GatorPermissionsController:getState` action on the messenger.
 * @param args.snapControllerHandleRequestActionHandler - Used to mock the
 * `SnapController:handleRequest` action on the messenger.
 * @param args.snapControllerHasActionHandler - Used to mock the
 * `SnapController:has` action on the messenger.
 * @returns The unrestricted messenger suited for GatorPermissionsController.
 */
function getRootMessenger({
  snapControllerHandleRequestActionHandler = jest
    .fn<
      ReturnType<HandleSnapRequest['handler']>,
      Parameters<HandleSnapRequest['handler']>
    >()
    .mockResolvedValue(MOCK_GATOR_PERMISSIONS_STORAGE_ENTRIES),
  snapControllerHasActionHandler = jest
    .fn<ReturnType<HasSnap['handler']>, Parameters<HasSnap['handler']>>()
    .mockResolvedValue(true as never),
}: {
  snapControllerHandleRequestActionHandler?: HandleSnapRequest['handler'];
  snapControllerHasActionHandler?: HasSnap['handler'];
} = {}): RootMessenger {
  const rootMessenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });

  rootMessenger.registerActionHandler(
    'SnapController:handleRequest',
    snapControllerHandleRequestActionHandler,
  );
  rootMessenger.registerActionHandler(
    'SnapController:has',
    snapControllerHasActionHandler,
  );
  return rootMessenger;
}

/**
 * Constructs the messenger supporting relevant SampleGasPricesController
 * actions and events.
 *
 * @param rootMessenger - The root messenger to restrict.
 * @returns The controller messenger.
 */
function getGatorPermissionsControllerMessenger(
  rootMessenger = getRootMessenger(),
): GatorPermissionsControllerMessenger {
  const gatorPermissionsControllerMessenger = new Messenger<
    'GatorPermissionsController',
    AllGatorPermissionsControllerActions,
    AllGatorPermissionsControllerEvents,
    RootMessenger
  >({
    namespace: 'GatorPermissionsController',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    messenger: gatorPermissionsControllerMessenger,
    actions: ['SnapController:handleRequest', 'SnapController:has'],
  });
  return gatorPermissionsControllerMessenger;
}
