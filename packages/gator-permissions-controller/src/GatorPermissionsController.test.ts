import type { AccountSigner } from '@metamask/7715-permission-types';
import { deriveStateFromMetadata } from '@metamask/base-controller';
import {
  createTimestampTerms,
  createNativeTokenStreamingTerms,
  ROOT_AUTHORITY,
} from '@metamask/delegation-core';
import {
  CHAIN_ID,
  DELEGATOR_CONTRACTS,
} from '@metamask/delegation-deployments';
import {
  MOCK_ANY_NAMESPACE,
  Messenger,
  type MessengerActions,
  type MessengerEvents,
  type MockAnyNamespace,
} from '@metamask/messenger';
import type { HandleSnapRequest, HasSnap } from '@metamask/snaps-controllers';
import type { SnapId } from '@metamask/snaps-sdk';
import type { TransactionMeta } from '@metamask/transaction-controller';
import { hexToBigInt, numberToHex, type Hex } from '@metamask/utils';

import { DELEGATION_FRAMEWORK_VERSION } from './constants';
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
  GatorPermissionsMap,
  StoredGatorPermission,
  PermissionTypesWithCustom,
  RevocationParams,
} from './types';

const MOCK_CHAIN_ID_1: Hex = '0xaa36a7';
const MOCK_CHAIN_ID_2: Hex = '0x1';
const MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID =
  'local:http://localhost:8082' as SnapId;
const MOCK_GATOR_PERMISSIONS_STORAGE_ENTRIES: StoredGatorPermission<
  AccountSigner,
  PermissionTypesWithCustom
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
        pendingRevocations: [],
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
        'npm:@metamask/gator-permissions-snap' as SnapId,
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
          expect(permission.permissionResponse.signer).toBeUndefined();
          expect(permission.permissionResponse.dependencyInfo).toBeUndefined();
          expect(permission.permissionResponse.rules).toBeUndefined();
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

    it('fetches gator permissions with optional params', async () => {
      const mockHandleRequestHandler = jest
        .fn()
        .mockResolvedValue(MOCK_GATOR_PERMISSIONS_STORAGE_ENTRIES);
      const rootMessenger = getRootMessenger({
        snapControllerHandleRequestActionHandler: mockHandleRequestHandler,
      });

      const controller = new GatorPermissionsController({
        messenger: getMessenger(rootMessenger),
      });

      await controller.enableGatorPermissions();

      const params = { origin: 'https://example.com', chainId: '0x1' };
      await controller.fetchAndUpdateGatorPermissions(params);

      expect(mockHandleRequestHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          request: expect.objectContaining({
            params,
          }),
        }),
      );
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

  describe('metadata', () => {
    it('includes expected state in debug snapshots', () => {
      const controller = new GatorPermissionsController({
        messenger: getGatorPermissionsControllerMessenger(),
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInDebugSnapshot',
        ),
      ).toMatchInlineSnapshot(`Object {}`);
    });

    it('includes expected state in state logs', () => {
      const controller = new GatorPermissionsController({
        messenger: getGatorPermissionsControllerMessenger(),
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInStateLogs',
        ),
      ).toMatchInlineSnapshot(`
        Object {
          "gatorPermissionsMapSerialized": "{\\"native-token-stream\\":{},\\"native-token-periodic\\":{},\\"erc20-token-stream\\":{},\\"erc20-token-periodic\\":{},\\"other\\":{}}",
          "gatorPermissionsProviderSnapId": "npm:@metamask/gator-permissions-snap",
          "isFetchingGatorPermissions": false,
          "isGatorPermissionsEnabled": false,
          "pendingRevocations": Array [],
        }
      `);
    });

    it('persists expected state', () => {
      const controller = new GatorPermissionsController({
        messenger: getGatorPermissionsControllerMessenger(),
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'persist',
        ),
      ).toMatchInlineSnapshot(`
        Object {
          "gatorPermissionsMapSerialized": "{\\"native-token-stream\\":{},\\"native-token-periodic\\":{},\\"erc20-token-stream\\":{},\\"erc20-token-periodic\\":{},\\"other\\":{}}",
          "isGatorPermissionsEnabled": false,
        }
      `);
    });

    it('exposes expected state to UI', () => {
      const controller = new GatorPermissionsController({
        messenger: getGatorPermissionsControllerMessenger(),
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'usedInUi',
        ),
      ).toMatchInlineSnapshot(`
        Object {
          "gatorPermissionsMapSerialized": "{\\"native-token-stream\\":{},\\"native-token-periodic\\":{},\\"erc20-token-stream\\":{},\\"erc20-token-periodic\\":{},\\"other\\":{}}",
          "pendingRevocations": Array [],
        }
      `);
    });
  });

  describe('decodePermissionFromPermissionContextForOrigin', () => {
    const chainId = CHAIN_ID.sepolia;
    const contracts =
      DELEGATOR_CONTRACTS[DELEGATION_FRAMEWORK_VERSION][chainId];

    const delegatorAddressA =
      '0x1111111111111111111111111111111111111111' as Hex;
    const delegateAddressB =
      '0x2222222222222222222222222222222222222222' as Hex;
    const metamaskOrigin = 'https://metamask.io';
    const buildMetadata = (justification: string) => ({
      justification,
      origin: metamaskOrigin,
    });

    let controller: GatorPermissionsController;

    beforeEach(() => {
      controller = new GatorPermissionsController({
        messenger: getGatorPermissionsControllerMessenger(),
      });
    });

    it('throws if contracts are not found', () => {
      expect(() =>
        controller.decodePermissionFromPermissionContextForOrigin({
          origin: controller.permissionsProviderSnapId,
          chainId: 999999,
          delegation: {
            caveats: [],
            delegator: '0x1111111111111111111111111111111111111111',
            delegate: '0x2222222222222222222222222222222222222222',
            authority: ROOT_AUTHORITY as Hex,
          },
          metadata: buildMetadata(''),
        }),
      ).toThrow('Contracts not found for chainId: 999999');
    });

    it('decodes a native-token-stream permission successfully', () => {
      const {
        TimestampEnforcer,
        NativeTokenStreamingEnforcer,
        ExactCalldataEnforcer,
        NonceEnforcer,
      } = contracts;

      const delegator = delegatorAddressA;
      const delegate = delegateAddressB;

      const timestampBeforeThreshold = 1720000;
      const expiryTerms = createTimestampTerms(
        { timestampAfterThreshold: 0, timestampBeforeThreshold },
        { out: 'hex' },
      );

      const initialAmount = 123456n;
      const maxAmount = 999999n;
      const amountPerSecond = 1n;
      const startTime = 1715664;
      const streamTerms = createNativeTokenStreamingTerms(
        { initialAmount, maxAmount, amountPerSecond, startTime },
        { out: 'hex' },
      );

      const caveats = [
        {
          enforcer: TimestampEnforcer,
          terms: expiryTerms,
          args: '0x',
        } as const,
        {
          enforcer: NativeTokenStreamingEnforcer,
          terms: streamTerms,
          args: '0x',
        } as const,
        { enforcer: ExactCalldataEnforcer, terms: '0x', args: '0x' } as const,
        { enforcer: NonceEnforcer, terms: '0x', args: '0x' } as const,
      ];

      const delegation = {
        delegate,
        delegator,
        authority: ROOT_AUTHORITY as Hex,
        caveats,
      };

      const result = controller.decodePermissionFromPermissionContextForOrigin({
        origin: controller.permissionsProviderSnapId,
        chainId,
        delegation,
        metadata: buildMetadata('Test justification'),
      });

      expect(result.chainId).toBe(numberToHex(chainId));
      expect(result.address).toBe(delegator);
      expect(result.signer).toStrictEqual({
        type: 'account',
        data: { address: delegate },
      });
      expect(result.permission.type).toBe('native-token-stream');
      expect(result.expiry).toBe(timestampBeforeThreshold);
      // amounts are hex-encoded in decoded data; startTime is numeric
      expect(result.permission.data.startTime).toBe(startTime);
      // BigInt fields are encoded as hex; compare after decoding
      expect(hexToBigInt(result.permission.data.initialAmount)).toBe(
        initialAmount,
      );
      expect(hexToBigInt(result.permission.data.maxAmount)).toBe(maxAmount);
      expect(hexToBigInt(result.permission.data.amountPerSecond)).toBe(
        amountPerSecond,
      );
      expect(result.permission.justification).toBe('Test justification');
    });

    it('throws when origin does not match permissions provider', () => {
      expect(() =>
        controller.decodePermissionFromPermissionContextForOrigin({
          origin: 'not-the-provider',
          chainId: 1,
          delegation: {
            delegate: '0x1',
            delegator: '0x2',
            authority: ROOT_AUTHORITY as Hex,
            caveats: [],
          },
          metadata: buildMetadata(''),
        }),
      ).toThrow('Origin not-the-provider not allowed');
    });

    it('throws when enforcers do not identify a supported permission', () => {
      const { TimestampEnforcer, ValueLteEnforcer } = contracts;

      const expiryTerms = createTimestampTerms(
        { timestampAfterThreshold: 0, timestampBeforeThreshold: 100 },
        { out: 'hex' },
      );

      const caveats = [
        {
          enforcer: TimestampEnforcer,
          terms: expiryTerms,
          args: '0x',
        } as const,
        // Include a forbidden/irrelevant enforcer without required counterparts
        { enforcer: ValueLteEnforcer, terms: '0x', args: '0x' } as const,
      ];

      expect(() =>
        controller.decodePermissionFromPermissionContextForOrigin({
          origin: controller.permissionsProviderSnapId,
          chainId,
          delegation: {
            delegate: delegatorAddressA,
            delegator: delegateAddressB,
            authority: ROOT_AUTHORITY as Hex,
            caveats,
          },
          metadata: buildMetadata(''),
        }),
      ).toThrow('Failed to decode permission');
    });

    it('throws when authority is not ROOT_AUTHORITY', () => {
      const {
        TimestampEnforcer,
        NativeTokenStreamingEnforcer,
        ExactCalldataEnforcer,
        NonceEnforcer,
      } = contracts;

      const delegator = delegatorAddressA;
      const delegate = delegateAddressB;

      const timestampBeforeThreshold = 2000;
      const expiryTerms = createTimestampTerms(
        { timestampAfterThreshold: 0, timestampBeforeThreshold },
        { out: 'hex' },
      );

      const initialAmount = 1n;
      const maxAmount = 2n;
      const amountPerSecond = 1n;
      const startTime = 1715000;
      const streamTerms = createNativeTokenStreamingTerms(
        { initialAmount, maxAmount, amountPerSecond, startTime },
        { out: 'hex' },
      );

      const caveats = [
        {
          enforcer: TimestampEnforcer,
          terms: expiryTerms,
          args: '0x',
        } as const,
        {
          enforcer: NativeTokenStreamingEnforcer,
          terms: streamTerms,
          args: '0x',
        } as const,
        { enforcer: ExactCalldataEnforcer, terms: '0x', args: '0x' } as const,
        { enforcer: NonceEnforcer, terms: '0x', args: '0x' } as const,
      ];

      const invalidAuthority =
        '0x0000000000000000000000000000000000000000' as Hex;

      expect(() =>
        controller.decodePermissionFromPermissionContextForOrigin({
          origin: controller.permissionsProviderSnapId,
          chainId,
          delegation: {
            delegate,
            delegator,
            authority: invalidAuthority,
            caveats,
          },
          metadata: buildMetadata(''),
        }),
      ).toThrow('Failed to decode permission');
    });
  });

  describe('submitRevocation', () => {
    it('should successfully submit a revocation when gator permissions are enabled', async () => {
      const mockHandleRequestHandler = jest.fn().mockResolvedValue(undefined);
      const messenger = getMessenger(
        getRootMessenger({
          snapControllerHandleRequestActionHandler: mockHandleRequestHandler,
        }),
      );

      const controller = new GatorPermissionsController({
        messenger,
        state: {
          isGatorPermissionsEnabled: true,
          gatorPermissionsProviderSnapId:
            MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID,
          pendingRevocations: [
            {
              txId: 'test-tx-id',
              permissionContext: '0x1234567890abcdef1234567890abcdef12345678',
            },
          ],
        },
      });

      const revocationParams: RevocationParams = {
        permissionContext: '0x1234567890abcdef1234567890abcdef12345678',
      };

      await controller.submitRevocation(revocationParams);

      expect(mockHandleRequestHandler).toHaveBeenCalledWith({
        snapId: MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID,
        origin: 'metamask',
        handler: 'onRpcRequest',
        request: {
          jsonrpc: '2.0',
          method: 'permissionsProvider_submitRevocation',
          params: revocationParams,
        },
      });
      expect(controller.pendingRevocations).toStrictEqual([]);
    });

    it('should throw GatorPermissionsNotEnabledError when gator permissions are disabled', async () => {
      const messenger = getMessenger();
      const controller = new GatorPermissionsController({
        messenger,
        state: {
          isGatorPermissionsEnabled: false,
        },
      });

      const revocationParams: RevocationParams = {
        permissionContext: '0x1234567890abcdef1234567890abcdef12345678',
      };

      await expect(
        controller.submitRevocation(revocationParams),
      ).rejects.toThrow('Gator permissions are not enabled');
    });

    it('should throw GatorPermissionsProviderError when snap request fails', async () => {
      const mockHandleRequestHandler = jest
        .fn()
        .mockRejectedValue(new Error('Snap request failed'));
      const messenger = getMessenger(
        getRootMessenger({
          snapControllerHandleRequestActionHandler: mockHandleRequestHandler,
        }),
      );

      const controller = new GatorPermissionsController({
        messenger,
        state: {
          isGatorPermissionsEnabled: true,
          gatorPermissionsProviderSnapId:
            MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID,
        },
      });

      const revocationParams: RevocationParams = {
        permissionContext: '0x1234567890abcdef1234567890abcdef12345678',
      };

      await expect(
        controller.submitRevocation(revocationParams),
      ).rejects.toThrow(
        'Failed to handle snap request to gator permissions provider for method permissionsProvider_submitRevocation',
      );
    });
  });

  describe('addPendingRevocation', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should submit revocation when transaction is confirmed', async () => {
      const mockHandleRequestHandler = jest.fn().mockResolvedValue(undefined);
      const rootMessenger = getRootMessenger({
        snapControllerHandleRequestActionHandler: mockHandleRequestHandler,
      });
      const messenger = getMessenger(rootMessenger);

      const controller = new GatorPermissionsController({
        messenger,
        state: {
          isGatorPermissionsEnabled: true,
          gatorPermissionsProviderSnapId:
            MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID,
        },
      });

      const txId = 'test-tx-id';
      const permissionContext = '0x1234567890abcdef1234567890abcdef12345678';

      await controller.addPendingRevocation({ txId, permissionContext });

      // Emit transaction approved event (user confirms)
      rootMessenger.publish('TransactionController:transactionApproved', {
        transactionMeta: { id: txId } as TransactionMeta,
      });

      // Emit transaction confirmed event
      rootMessenger.publish('TransactionController:transactionConfirmed', {
        id: txId,
      } as TransactionMeta);

      // Wait for async operations
      await Promise.resolve();

      expect(mockHandleRequestHandler).toHaveBeenCalledWith({
        snapId: MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID,
        origin: 'metamask',
        handler: 'onRpcRequest',
        request: {
          jsonrpc: '2.0',
          method: 'permissionsProvider_submitRevocation',
          params: { permissionContext },
        },
      });
    });

    it('should cleanup without adding to state when transaction is rejected by user', async () => {
      const mockHandleRequestHandler = jest.fn().mockResolvedValue(undefined);
      const rootMessenger = getRootMessenger({
        snapControllerHandleRequestActionHandler: mockHandleRequestHandler,
      });
      const messenger = getMessenger(rootMessenger);

      const controller = new GatorPermissionsController({
        messenger,
        state: {
          isGatorPermissionsEnabled: true,
          gatorPermissionsProviderSnapId:
            MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID,
        },
      });

      const txId = 'test-tx-id';
      const permissionContext = '0x1234567890abcdef1234567890abcdef12345678';

      await controller.addPendingRevocation({ txId, permissionContext });

      // Verify pending revocation is not in state yet
      expect(controller.pendingRevocations).toStrictEqual([]);

      // Emit transaction rejected event (user cancels)
      rootMessenger.publish('TransactionController:transactionRejected', {
        transactionMeta: { id: txId } as TransactionMeta,
      });

      // Wait for async operations
      await Promise.resolve();

      // Should not call submitRevocation
      expect(mockHandleRequestHandler).not.toHaveBeenCalled();
      // Should not be in pending revocations
      expect(controller.pendingRevocations).toStrictEqual([]);
    });

    it('should cleanup without submitting revocation when transaction fails', async () => {
      const mockHandleRequestHandler = jest.fn().mockResolvedValue(undefined);
      const rootMessenger = getRootMessenger({
        snapControllerHandleRequestActionHandler: mockHandleRequestHandler,
      });
      const messenger = getMessenger(rootMessenger);

      const controller = new GatorPermissionsController({
        messenger,
        state: {
          isGatorPermissionsEnabled: true,
          gatorPermissionsProviderSnapId:
            MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID,
        },
      });

      const txId = 'test-tx-id';
      const permissionContext = '0x1234567890abcdef1234567890abcdef12345678';

      await controller.addPendingRevocation({ txId, permissionContext });

      // Emit transaction failed event
      rootMessenger.publish('TransactionController:transactionFailed', {
        transactionMeta: { id: txId } as TransactionMeta,
        error: 'Transaction failed',
      });

      // Wait for async operations
      await Promise.resolve();

      // Should not call submitRevocation
      expect(mockHandleRequestHandler).not.toHaveBeenCalled();
    });

    it('should cleanup without submitting revocation when transaction is dropped', async () => {
      const mockHandleRequestHandler = jest.fn().mockResolvedValue(undefined);
      const rootMessenger = getRootMessenger({
        snapControllerHandleRequestActionHandler: mockHandleRequestHandler,
      });
      const messenger = getMessenger(rootMessenger);

      const controller = new GatorPermissionsController({
        messenger,
        state: {
          isGatorPermissionsEnabled: true,
          gatorPermissionsProviderSnapId:
            MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID,
        },
      });

      const txId = 'test-tx-id';
      const permissionContext = '0x1234567890abcdef1234567890abcdef12345678';

      await controller.addPendingRevocation({ txId, permissionContext });

      // Emit transaction dropped event
      rootMessenger.publish('TransactionController:transactionDropped', {
        transactionMeta: { id: txId } as TransactionMeta,
      });

      // Wait for async operations
      await Promise.resolve();

      // Should not call submitRevocation
      expect(mockHandleRequestHandler).not.toHaveBeenCalled();
    });

    it('should cleanup without submitting revocation when timeout is reached', async () => {
      const mockHandleRequestHandler = jest.fn().mockResolvedValue(undefined);
      const rootMessenger = getRootMessenger({
        snapControllerHandleRequestActionHandler: mockHandleRequestHandler,
      });
      const messenger = getMessenger(rootMessenger);

      const controller = new GatorPermissionsController({
        messenger,
        state: {
          isGatorPermissionsEnabled: true,
          gatorPermissionsProviderSnapId:
            MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID,
        },
      });

      const txId = 'test-tx-id';
      const permissionContext = '0x1234567890abcdef1234567890abcdef12345678';

      await controller.addPendingRevocation({ txId, permissionContext });

      // Fast-forward time by 2 hours
      jest.advanceTimersByTime(2 * 60 * 60 * 1000);

      // Wait for async operations
      await Promise.resolve();

      // Should not call submitRevocation
      expect(mockHandleRequestHandler).not.toHaveBeenCalled();
    });

    it('should add to pending revocations state only after user approval', async () => {
      const mockHandleRequestHandler = jest.fn().mockResolvedValue(undefined);
      const rootMessenger = getRootMessenger({
        snapControllerHandleRequestActionHandler: mockHandleRequestHandler,
      });
      const messenger = getMessenger(rootMessenger);

      const controller = new GatorPermissionsController({
        messenger,
        state: {
          isGatorPermissionsEnabled: true,
          gatorPermissionsProviderSnapId:
            MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID,
        },
      });

      const txId = 'test-tx-id';
      const permissionContext = '0x1234567890abcdef1234567890abcdef12345678';

      await controller.addPendingRevocation({ txId, permissionContext });

      // Before approval, pending revocation should not be in state
      expect(controller.pendingRevocations).toStrictEqual([]);

      // Emit transaction approved event (user confirms)
      rootMessenger.publish('TransactionController:transactionApproved', {
        transactionMeta: { id: txId } as TransactionMeta,
      });

      // After approval, pending revocation should be in state
      expect(controller.pendingRevocations).toStrictEqual([
        { txId, permissionContext },
      ]);
    });

    it('should not submit revocation for different transaction IDs', async () => {
      const mockHandleRequestHandler = jest.fn().mockResolvedValue(undefined);
      const rootMessenger = getRootMessenger({
        snapControllerHandleRequestActionHandler: mockHandleRequestHandler,
      });
      const messenger = getMessenger(rootMessenger);

      const controller = new GatorPermissionsController({
        messenger,
        state: {
          isGatorPermissionsEnabled: true,
          gatorPermissionsProviderSnapId:
            MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID,
        },
      });

      const txId = 'test-tx-id';
      const permissionContext = '0x1234567890abcdef1234567890abcdef12345678';

      await controller.addPendingRevocation({ txId, permissionContext });

      // Emit transaction approved event for our transaction
      rootMessenger.publish('TransactionController:transactionApproved', {
        transactionMeta: { id: txId } as TransactionMeta,
      });

      // Emit transaction confirmed event for different transaction
      rootMessenger.publish('TransactionController:transactionConfirmed', {
        id: 'different-tx-id',
      } as TransactionMeta);

      // Wait for async operations
      await Promise.resolve();

      // Should not call submitRevocation for different transaction
      expect(mockHandleRequestHandler).not.toHaveBeenCalled();
    });

    it('should handle revocation submission errors gracefully', async () => {
      const mockHandleRequestHandler = jest
        .fn()
        .mockRejectedValue(new Error('Revocation submission failed'));
      const rootMessenger = getRootMessenger({
        snapControllerHandleRequestActionHandler: mockHandleRequestHandler,
      });
      const messenger = getMessenger(rootMessenger);

      const controller = new GatorPermissionsController({
        messenger,
        state: {
          isGatorPermissionsEnabled: true,
          gatorPermissionsProviderSnapId:
            MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID,
        },
      });

      const txId = 'test-tx-id';
      const permissionContext = '0x1234567890abcdef1234567890abcdef12345678';

      await controller.addPendingRevocation({ txId, permissionContext });

      // Emit transaction approved event (user confirms)
      rootMessenger.publish('TransactionController:transactionApproved', {
        transactionMeta: { id: txId } as TransactionMeta,
      });

      // Emit transaction confirmed event
      rootMessenger.publish('TransactionController:transactionConfirmed', {
        id: txId,
      } as TransactionMeta);

      // Wait for async operations
      await Promise.resolve();

      // Should have attempted to call submitRevocation even though it failed
      expect(mockHandleRequestHandler).toHaveBeenCalled();
    });

    it('should throw GatorPermissionsNotEnabledError when gator permissions are disabled', async () => {
      const messenger = getMessenger();
      const controller = new GatorPermissionsController({
        messenger,
        state: {
          isGatorPermissionsEnabled: false,
        },
      });

      const txId = 'test-tx-id';
      const permissionContext = '0x1234567890abcdef1234567890abcdef12345678';

      await expect(
        controller.addPendingRevocation({ txId, permissionContext }),
      ).rejects.toThrow('Gator permissions are not enabled');
    });
  });

  describe('get pendingRevocations', () => {
    it('should return the pending revocations list', () => {
      const messenger = getMessenger();
      const controller = new GatorPermissionsController({
        messenger,
        state: {
          isGatorPermissionsEnabled: true,
          gatorPermissionsProviderSnapId:
            MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID,
          pendingRevocations: [
            {
              txId: 'test-tx-id',
              permissionContext: '0x1234567890abcdef1234567890abcdef12345678',
            },
          ],
        },
      });

      expect(controller.pendingRevocations).toStrictEqual([
        {
          txId: 'test-tx-id',
          permissionContext: '0x1234567890abcdef1234567890abcdef12345678',
        },
      ]);
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
    events: [
      'TransactionController:transactionApproved',
      'TransactionController:transactionRejected',
      'TransactionController:transactionConfirmed',
      'TransactionController:transactionFailed',
      'TransactionController:transactionDropped',
    ],
  });
  return gatorPermissionsControllerMessenger;
}

/**
 * Shorthand alias for getGatorPermissionsControllerMessenger.
 *
 * @param rootMessenger - The root messenger to restrict.
 * @returns The controller messenger.
 */
function getMessenger(
  rootMessenger = getRootMessenger(),
): GatorPermissionsControllerMessenger {
  return getGatorPermissionsControllerMessenger(rootMessenger);
}
