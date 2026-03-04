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
import { MOCK_ANY_NAMESPACE, Messenger } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import type { HandleSnapRequest, HasSnap } from '@metamask/snaps-controllers';
import type { SnapId } from '@metamask/snaps-sdk';
import type { TransactionMeta } from '@metamask/transaction-controller';
import { TransactionStatus } from '@metamask/transaction-controller';
import { hexToBigInt, numberToHex } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import { DELEGATION_FRAMEWORK_VERSION } from './constants';
import { GatorPermissionsFetchError } from './errors';
import type { GatorPermissionsControllerMessenger } from './GatorPermissionsController';
import GatorPermissionsController from './GatorPermissionsController';
import type {
  PermissionInfoWithMetadata,
  StoredGatorPermission,
  RevocationParams,
  SupportedPermissionType,
} from './types';
import { flushPromises } from '../../../tests/helpers';
import {
  mockGatorPermissionsStorageEntriesFactory,
  mockNativeTokenStreamStorageEntry,
} from '../tests/mocks';

const MOCK_CHAIN_ID_1: Hex = '0xaa36a7';
const MOCK_CHAIN_ID_2: Hex = '0x1';
const MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID =
  'local:http://localhost:8082' as SnapId;

const DEFAULT_TEST_CONFIG = {
  supportedPermissionTypes: [
    'native-token-stream',
    'native-token-periodic',
    'erc20-token-stream',
    'erc20-token-periodic',
    'erc20-token-revocation',
  ] as SupportedPermissionType[],
};

const MOCK_GATOR_PERMISSIONS_STORAGE_ENTRIES: StoredGatorPermission[] =
  mockGatorPermissionsStorageEntriesFactory({
    [MOCK_CHAIN_ID_1]: {
      nativeTokenStream: 5,
      nativeTokenPeriodic: 5,
      erc20TokenStream: 5,
      erc20TokenPeriodic: 5,
    },
    [MOCK_CHAIN_ID_2]: {
      nativeTokenStream: 5,
      nativeTokenPeriodic: 5,
      erc20TokenStream: 5,
      erc20TokenPeriodic: 5,
    },
  });

describe('GatorPermissionsController', () => {
  describe('constructor', () => {
    it('creates GatorPermissionsController with config and default state', () => {
      const controller = new GatorPermissionsController({
        messenger: getGatorPermissionsControllerMessenger(),
        config: DEFAULT_TEST_CONFIG,
      });

      expect(controller.state.grantedPermissions).toStrictEqual([]);
      expect(controller.state.isFetchingGatorPermissions).toBe(false);
      expect(controller.state.lastSyncedTimestamp).toBe(-1);
      expect(controller.supportedPermissionTypes).toStrictEqual(
        DEFAULT_TEST_CONFIG.supportedPermissionTypes,
      );
    });

    it('creates GatorPermissionsController with config and state override', () => {
      const customState = {
        grantedPermissions: [] as PermissionInfoWithMetadata[],
        pendingRevocations: [],
        lastSyncedTimestamp: -1,
      };

      const controller = new GatorPermissionsController({
        messenger: getGatorPermissionsControllerMessenger(),
        config: {
          ...DEFAULT_TEST_CONFIG,
          gatorPermissionsProviderSnapId:
            MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID,
        },
        state: customState,
      });

      expect(controller.gatorPermissionsProviderSnapId).toBe(
        MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID,
      );
      expect(controller.state.grantedPermissions).toStrictEqual([]);
    });

    it('creates GatorPermissionsController with specified gatorPermissionsProviderSnapId', () => {
      const controller = new GatorPermissionsController({
        messenger: getGatorPermissionsControllerMessenger(),
        config: {
          ...DEFAULT_TEST_CONFIG,
          gatorPermissionsProviderSnapId:
            MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID,
        },
      });

      expect(controller.gatorPermissionsProviderSnapId).toBe(
        MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID,
      );
      expect(controller.state.isFetchingGatorPermissions).toBe(false);
    });

    it('isFetchingGatorPermissions is false on initialization', () => {
      const controller = new GatorPermissionsController({
        messenger: getGatorPermissionsControllerMessenger(),
        config: DEFAULT_TEST_CONFIG,
      });

      expect(controller.state.isFetchingGatorPermissions).toBe(false);
    });

    it('isFetchingGatorPermissions is always false when the controller is created', () => {
      const controller = new GatorPermissionsController({
        messenger: getGatorPermissionsControllerMessenger(),
        config: DEFAULT_TEST_CONFIG,
        state: { isFetchingGatorPermissions: true },
      });

      expect(controller.state.isFetchingGatorPermissions).toBe(false);
    });
  });

  describe('fetchAndUpdateGatorPermissions', () => {
    it('fetches and updates gator permissions successfully', async () => {
      // Create mock data with rules to verify they are preserved
      const mockStorageEntriesWithRules = [
        ...MOCK_GATOR_PERMISSIONS_STORAGE_ENTRIES,
        {
          ...mockNativeTokenStreamStorageEntry(MOCK_CHAIN_ID_1),
          permissionResponse: {
            ...mockNativeTokenStreamStorageEntry(MOCK_CHAIN_ID_1)
              .permissionResponse,
            rules: [
              {
                type: 'test-rule',
                isAdjustmentAllowed: false,
                data: {
                  target: '0x1234567890123456789012345678901234567890',
                  signature: '0xabcd',
                  expiry: 1735689600, // Example expiry timestamp
                },
              },
            ],
          },
        },
      ];

      const mockHandleRequestHandler = jest
        .fn()
        .mockResolvedValue(mockStorageEntriesWithRules);
      const rootMessenger = getRootMessenger({
        snapControllerHandleRequestActionHandler: mockHandleRequestHandler,
      });

      const controller = new GatorPermissionsController({
        messenger: getGatorPermissionsControllerMessenger(rootMessenger),
        config: DEFAULT_TEST_CONFIG,
      });

      await controller.fetchAndUpdateGatorPermissions();

      const { grantedPermissions } = controller.state;
      expect(Array.isArray(grantedPermissions)).toBe(true);
      expect(grantedPermissions).toHaveLength(
        mockStorageEntriesWithRules.length,
      );
      expect(controller.state.isFetchingGatorPermissions).toBe(false);
      expect(controller.state.lastSyncedTimestamp).not.toBe(-1);

      grantedPermissions.forEach((entry) => {
        expect(entry.permissionResponse).toBeDefined();
        expect(entry.siteOrigin).toBeDefined();
        // Sanitized response omits internal fields (to, dependencies)
        expect(
          (entry.permissionResponse as Record<string, unknown>).to,
        ).toBeUndefined();
        expect(
          (entry.permissionResponse as Record<string, unknown>).dependencies,
        ).toBeUndefined();
      });

      // Specifically verify that the entry with rules has rules preserved
      const entryWithRules = grantedPermissions.find(
        (entry) => entry.permissionResponse.rules !== undefined,
      );
      expect(entryWithRules).toBeDefined();
      expect(entryWithRules?.permissionResponse.rules).toBeDefined();
      expect(entryWithRules?.permissionResponse.rules).toStrictEqual([
        {
          type: 'test-rule',
          isAdjustmentAllowed: false,
          data: {
            target: '0x1234567890123456789012345678901234567890',
            signature: '0xabcd',
            expiry: 1735689600,
          },
        },
      ]);
    });

    it('categorizes erc20-token-revocation permissions into its own bucket', async () => {
      const chainId = '0x1' as Hex;
      // Create a minimal revocation permission entry and cast to satisfy types
      const revocationEntry = {
        permissionResponse: {
          chainId,
          from: '0x0000000000000000000000000000000000000001',
          to: '0x0000000000000000000000000000000000000002',
          permission: {
            type: 'erc20-token-revocation',
            isAdjustmentAllowed: false,
            // Data shape is enforced by external types; not relevant for categorization
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data: {} as any,
          },
          context: '0xdeadbeef',
          dependencies: [],
          delegationManager: '0x0000000000000000000000000000000000000003',
        },
        siteOrigin: 'https://example.org',
      } as unknown;
      const rootMessenger = getRootMessenger({
        snapControllerHandleRequestActionHandler: async () =>
          [revocationEntry] as unknown,
      });
      const controller = new GatorPermissionsController({
        messenger: getGatorPermissionsControllerMessenger(rootMessenger),
        config: DEFAULT_TEST_CONFIG,
      });

      await controller.fetchAndUpdateGatorPermissions();

      const { grantedPermissions } = controller.state;
      expect(grantedPermissions).toHaveLength(1);
      expect(grantedPermissions[0].permissionResponse.permission.type).toBe(
        'erc20-token-revocation',
      );
      expect(grantedPermissions[0].permissionResponse.chainId).toBe(chainId);
    });

    it('handles null permissions data', async () => {
      const rootMessenger = getRootMessenger({
        snapControllerHandleRequestActionHandler: async () => null,
      });

      const controller = new GatorPermissionsController({
        messenger: getGatorPermissionsControllerMessenger(rootMessenger),
        config: DEFAULT_TEST_CONFIG,
      });

      await controller.fetchAndUpdateGatorPermissions();

      expect(controller.state.grantedPermissions).toStrictEqual([]);
    });

    it('handles empty permissions data', async () => {
      const rootMessenger = getRootMessenger({
        snapControllerHandleRequestActionHandler: async () => [],
      });

      const controller = new GatorPermissionsController({
        messenger: getGatorPermissionsControllerMessenger(rootMessenger),
        config: DEFAULT_TEST_CONFIG,
      });

      await controller.fetchAndUpdateGatorPermissions();

      expect(controller.state.grantedPermissions).toStrictEqual([]);
    });

    it('handles error during fetch and update', async () => {
      const rootMessenger = getRootMessenger({
        snapControllerHandleRequestActionHandler: async () => {
          throw new Error('Storage error');
        },
      });

      const controller = new GatorPermissionsController({
        messenger: getGatorPermissionsControllerMessenger(rootMessenger),
        config: DEFAULT_TEST_CONFIG,
      });

      await expect(controller.fetchAndUpdateGatorPermissions()).rejects.toThrow(
        'Failed to fetch gator permissions',
      );

      expect(controller.state.isFetchingGatorPermissions).toBe(false);
      expect(controller.state.lastSyncedTimestamp).toBe(-1);
    });

    it('returns the same promise when called concurrently', async () => {
      let resolveRequest:
        | ((value: StoredGatorPermission[]) => void)
        | undefined;

      const requestPromise = new Promise<StoredGatorPermission[]>((resolve) => {
        resolveRequest = resolve;
      });
      const mockHandleRequestHandler = jest
        .fn()
        .mockReturnValue(requestPromise);
      const rootMessenger = getRootMessenger({
        snapControllerHandleRequestActionHandler: mockHandleRequestHandler,
      });

      const controller = new GatorPermissionsController({
        messenger: getGatorPermissionsControllerMessenger(rootMessenger),
        config: DEFAULT_TEST_CONFIG,
      });

      const promise1 = controller.fetchAndUpdateGatorPermissions();
      const promise2 = controller.fetchAndUpdateGatorPermissions();

      expect(promise1).toBe(promise2);

      resolveRequest?.(MOCK_GATOR_PERMISSIONS_STORAGE_ENTRIES);
      await promise1;
    });

    it('performs a new sync when called after previous sync completes', async () => {
      const mockHandleRequestHandler = jest
        .fn()
        .mockResolvedValue(MOCK_GATOR_PERMISSIONS_STORAGE_ENTRIES);
      const rootMessenger = getRootMessenger({
        snapControllerHandleRequestActionHandler: mockHandleRequestHandler,
      });

      const controller = new GatorPermissionsController({
        messenger: getGatorPermissionsControllerMessenger(rootMessenger),
        config: DEFAULT_TEST_CONFIG,
      });

      await controller.fetchAndUpdateGatorPermissions();
      expect(mockHandleRequestHandler).toHaveBeenCalledTimes(1);

      await controller.fetchAndUpdateGatorPermissions();
      expect(mockHandleRequestHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe('initialize', () => {
    it('calls fetchAndUpdateGatorPermissions when lastSyncedTimestamp is -1', async () => {
      const mockHandleRequestHandler = jest
        .fn()
        .mockResolvedValue(MOCK_GATOR_PERMISSIONS_STORAGE_ENTRIES);
      const rootMessenger = getRootMessenger({
        snapControllerHandleRequestActionHandler: mockHandleRequestHandler,
      });

      const controller = new GatorPermissionsController({
        messenger: getGatorPermissionsControllerMessenger(rootMessenger),
        config: DEFAULT_TEST_CONFIG,
      });

      expect(controller.state.lastSyncedTimestamp).toBe(-1);

      await controller.initialize();

      expect(mockHandleRequestHandler).toHaveBeenCalledTimes(1);
      expect(controller.state.lastSyncedTimestamp).not.toBe(-1);
      expect(controller.state.grantedPermissions.length).toBeGreaterThan(0);
    });

    it('does not call fetchAndUpdateGatorPermissions when lastSyncedTimestamp is recent', async () => {
      const mockHandleRequestHandler = jest
        .fn()
        .mockResolvedValue(MOCK_GATOR_PERMISSIONS_STORAGE_ENTRIES);
      const rootMessenger = getRootMessenger({
        snapControllerHandleRequestActionHandler: mockHandleRequestHandler,
      });

      const recentTimestamp = Date.now() - 1000; // 1 second ago
      const controller = new GatorPermissionsController({
        messenger: getGatorPermissionsControllerMessenger(rootMessenger),
        config: DEFAULT_TEST_CONFIG,
        state: { lastSyncedTimestamp: recentTimestamp },
      });

      await controller.initialize();

      expect(mockHandleRequestHandler).not.toHaveBeenCalled();
      expect(controller.state.lastSyncedTimestamp).toBe(recentTimestamp);
    });

    it('calls fetchAndUpdateGatorPermissions when lastSyncedTimestamp is older than sync interval', async () => {
      const mockHandleRequestHandler = jest
        .fn()
        .mockResolvedValue(MOCK_GATOR_PERMISSIONS_STORAGE_ENTRIES);
      const rootMessenger = getRootMessenger({
        snapControllerHandleRequestActionHandler: mockHandleRequestHandler,
      });

      const thirtyOneDaysMs = 31 * 24 * 60 * 60 * 1000;
      const staleTimestamp = Date.now() - thirtyOneDaysMs;
      const controller = new GatorPermissionsController({
        messenger: getGatorPermissionsControllerMessenger(rootMessenger),
        config: DEFAULT_TEST_CONFIG,
        state: { lastSyncedTimestamp: staleTimestamp },
      });

      await controller.initialize();

      expect(mockHandleRequestHandler).toHaveBeenCalledTimes(1);
      expect(controller.state.lastSyncedTimestamp).not.toBe(staleTimestamp);
    });

    it('respects custom maxSyncIntervalMs from config', async () => {
      const mockHandleRequestHandler = jest
        .fn()
        .mockResolvedValue(MOCK_GATOR_PERMISSIONS_STORAGE_ENTRIES);
      const rootMessenger = getRootMessenger({
        snapControllerHandleRequestActionHandler: mockHandleRequestHandler,
      });

      const maxSyncIntervalMs = 500;
      const lastSyncedTwoSecondsAgo = Date.now() - 2000;
      const controller = new GatorPermissionsController({
        messenger: getGatorPermissionsControllerMessenger(rootMessenger),
        config: {
          ...DEFAULT_TEST_CONFIG,
          maxSyncIntervalMs,
        },
        state: { lastSyncedTimestamp: lastSyncedTwoSecondsAgo },
      });

      await controller.initialize();

      expect(mockHandleRequestHandler).toHaveBeenCalledTimes(1);
      expect(controller.state.lastSyncedTimestamp).not.toBe(
        lastSyncedTwoSecondsAgo,
      );
    });
  });

  describe('message handlers tests', () => {
    it('registers all message handlers', () => {
      const messenger = getGatorPermissionsControllerMessenger();
      const mockRegisterActionHandler = jest.spyOn(
        messenger,
        'registerActionHandler',
      );

      const controller = new GatorPermissionsController({
        messenger,
        config: DEFAULT_TEST_CONFIG,
      });

      expect(controller).toBeDefined();

      expect(mockRegisterActionHandler).toHaveBeenCalledWith(
        'GatorPermissionsController:fetchAndUpdateGatorPermissions',
        expect.any(Function),
      );
    });
  });

  describe('metadata', () => {
    it('includes expected state in debug snapshots', () => {
      const controller = new GatorPermissionsController({
        messenger: getGatorPermissionsControllerMessenger(),
        config: DEFAULT_TEST_CONFIG,
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInDebugSnapshot',
        ),
      ).toMatchInlineSnapshot(`{}`);
    });

    it('includes expected state in state logs', () => {
      const controller = new GatorPermissionsController({
        messenger: getGatorPermissionsControllerMessenger(),
        config: DEFAULT_TEST_CONFIG,
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInStateLogs',
        ),
      ).toMatchInlineSnapshot(`
        {
          "grantedPermissions": [],
          "isFetchingGatorPermissions": false,
          "lastSyncedTimestamp": -1,
          "pendingRevocations": [],
        }
      `);
    });

    it('persists expected state', () => {
      const controller = new GatorPermissionsController({
        messenger: getGatorPermissionsControllerMessenger(),
        config: DEFAULT_TEST_CONFIG,
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'persist',
        ),
      ).toMatchInlineSnapshot(`
        {
          "grantedPermissions": [],
          "lastSyncedTimestamp": -1,
        }
      `);
    });

    it('exposes expected state to UI', () => {
      const controller = new GatorPermissionsController({
        messenger: getGatorPermissionsControllerMessenger(),
        config: DEFAULT_TEST_CONFIG,
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'usedInUi',
        ),
      ).toMatchInlineSnapshot(`
        {
          "grantedPermissions": [],
          "isFetchingGatorPermissions": false,
          "pendingRevocations": [],
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
    const buildMetadata = (
      justification: string,
    ): { justification: string; origin: string } => ({
      justification,
      origin: metamaskOrigin,
    });

    let controller: GatorPermissionsController;

    beforeEach(() => {
      controller = new GatorPermissionsController({
        messenger: getGatorPermissionsControllerMessenger(),
        config: DEFAULT_TEST_CONFIG,
      });
    });

    it('throws if contracts are not found', () => {
      expect(() =>
        controller.decodePermissionFromPermissionContextForOrigin({
          origin: controller.gatorPermissionsProviderSnapId,
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
        origin: controller.gatorPermissionsProviderSnapId,
        chainId,
        delegation,
        metadata: buildMetadata('Test justification'),
      });

      expect(result.chainId).toBe(numberToHex(chainId));
      expect(result.from).toBe(delegator);
      expect(result.to).toStrictEqual(delegate);
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
          origin: controller.gatorPermissionsProviderSnapId,
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
          origin: controller.gatorPermissionsProviderSnapId,
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
        config: {
          ...DEFAULT_TEST_CONFIG,
          gatorPermissionsProviderSnapId:
            MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID,
        },
        state: {
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
        txHash: undefined,
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
      expect(controller.state.pendingRevocations).toStrictEqual([]);
    });

    it('should submit revocation when controller is configured', async () => {
      const mockHandleRequestHandler = jest.fn().mockResolvedValue(undefined);
      const messenger = getMessenger(
        getRootMessenger({
          snapControllerHandleRequestActionHandler: mockHandleRequestHandler,
        }),
      );
      const controller = new GatorPermissionsController({
        messenger,
        config: DEFAULT_TEST_CONFIG,
      });

      const revocationParams: RevocationParams = {
        permissionContext: '0x1234567890abcdef1234567890abcdef12345678',
        txHash: undefined,
      };

      expect(
        await controller.submitRevocation(revocationParams),
      ).toBeUndefined();
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
        config: {
          ...DEFAULT_TEST_CONFIG,
          gatorPermissionsProviderSnapId:
            MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID,
        },
      });

      const revocationParams: RevocationParams = {
        permissionContext: '0x1234567890abcdef1234567890abcdef12345678',
        txHash: undefined,
      };

      await expect(
        controller.submitRevocation(revocationParams),
      ).rejects.toThrow(
        'Failed to handle snap request to gator permissions provider for method permissionsProvider_submitRevocation',
      );
    });

    it('should clear pending revocation in finally block even if refresh fails', async () => {
      const mockHandleRequestHandler = jest.fn().mockResolvedValue(undefined);
      const messenger = getMessenger(
        getRootMessenger({
          snapControllerHandleRequestActionHandler: mockHandleRequestHandler,
        }),
      );

      const controller = new GatorPermissionsController({
        messenger,
        config: {
          ...DEFAULT_TEST_CONFIG,
          gatorPermissionsProviderSnapId:
            MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID,
        },
        state: {
          pendingRevocations: [
            {
              txId: 'test-tx-id',
              permissionContext: '0x1234567890abcdef1234567890abcdef12345678',
            },
          ],
        },
      });

      // Mock fetchAndUpdateGatorPermissions to fail with GatorPermissionsFetchError
      // (which is what it actually throws in real scenarios)
      const fetchError = new GatorPermissionsFetchError({
        message: 'Failed to fetch gator permissions',
        cause: new Error('Refresh failed'),
      });
      jest
        .spyOn(controller, 'fetchAndUpdateGatorPermissions')
        .mockRejectedValue(fetchError);

      const revocationParams: RevocationParams = {
        permissionContext: '0x1234567890abcdef1234567890abcdef12345678',
        txHash: undefined,
      };

      // Should throw GatorPermissionsFetchError (not GatorPermissionsProviderError)
      // because revocation succeeded but refresh failed
      await expect(
        controller.submitRevocation(revocationParams),
      ).rejects.toThrow(GatorPermissionsFetchError);

      // Verify the error message indicates refresh failure, not revocation failure
      await expect(
        controller.submitRevocation(revocationParams),
      ).rejects.toThrow(
        'Failed to refresh permissions list after successful revocation',
      );

      // Pending revocation should still be cleared despite refresh failure
      expect(controller.state.pendingRevocations).toStrictEqual([]);
    });
  });

  describe('submitDirectRevocation', () => {
    it('should add to pending revocations and immediately submit revocation', async () => {
      const mockHandleRequestHandler = jest.fn().mockResolvedValue(undefined);
      const messenger = getMessenger(
        getRootMessenger({
          snapControllerHandleRequestActionHandler: mockHandleRequestHandler,
        }),
      );

      const controller = new GatorPermissionsController({
        messenger,
        config: {
          ...DEFAULT_TEST_CONFIG,
          gatorPermissionsProviderSnapId:
            MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID,
        },
      });

      const revocationParams: RevocationParams = {
        permissionContext: '0x1234567890abcdef1234567890abcdef12345678',
        txHash: undefined,
      };

      await controller.submitDirectRevocation(revocationParams);

      // Should have called submitRevocation
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

      // Pending revocation should be cleared after successful submission
      expect(controller.state.pendingRevocations).toStrictEqual([]);
    });

    it('should add pending revocation with placeholder txId', async () => {
      const mockHandleRequestHandler = jest.fn().mockResolvedValue(undefined);
      const messenger = getMessenger(
        getRootMessenger({
          snapControllerHandleRequestActionHandler: mockHandleRequestHandler,
        }),
      );

      const controller = new GatorPermissionsController({
        messenger,
        config: {
          ...DEFAULT_TEST_CONFIG,
          gatorPermissionsProviderSnapId:
            MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID,
        },
      });

      const permissionContext =
        '0x1234567890abcdef1234567890abcdef12345678' as Hex;
      const revocationParams: RevocationParams = {
        permissionContext,
        txHash: undefined,
      };

      // Spy on submitRevocation to check pending state before it's called
      const submitRevocationSpy = jest.spyOn(controller, 'submitRevocation');

      await controller.submitDirectRevocation(revocationParams);

      // Verify that pending revocation was added (before submitRevocation clears it)
      // We check by verifying submitRevocation was called, which clears pending
      expect(submitRevocationSpy).toHaveBeenCalledWith(revocationParams);
      expect(controller.state.pendingRevocations).toStrictEqual([]);
    });

    it('should clear pending revocation even if submitRevocation fails (finally block)', async () => {
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
        config: {
          ...DEFAULT_TEST_CONFIG,
          gatorPermissionsProviderSnapId:
            MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID,
        },
      });

      const permissionContext =
        '0x1234567890abcdef1234567890abcdef12345678' as Hex;
      const revocationParams: RevocationParams = {
        permissionContext,
        txHash: undefined,
      };

      await expect(
        controller.submitDirectRevocation(revocationParams),
      ).rejects.toThrow(
        'Failed to handle snap request to gator permissions provider for method permissionsProvider_submitRevocation',
      );

      // Pending revocation is cleared in finally block even if submission failed
      // This prevents stuck state, though the error is still thrown for caller handling
      expect(controller.state.pendingRevocations).toStrictEqual([]);
    });
  });

  describe('isPendingRevocation', () => {
    it('should return true when permission context is in pending revocations', () => {
      const messenger = getMessenger();
      const permissionContext =
        '0x1234567890abcdef1234567890abcdef12345678' as Hex;
      const controller = new GatorPermissionsController({
        messenger,
        config: {
          ...DEFAULT_TEST_CONFIG,
          gatorPermissionsProviderSnapId:
            MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID,
        },
        state: {
          pendingRevocations: [
            {
              txId: 'test-tx-id',
              permissionContext,
            },
          ],
        },
      });

      expect(controller.isPendingRevocation(permissionContext)).toBe(true);
    });

    it('should return false when permission context is not in pending revocations', () => {
      const messenger = getMessenger();
      const controller = new GatorPermissionsController({
        messenger,
        config: {
          ...DEFAULT_TEST_CONFIG,
          gatorPermissionsProviderSnapId:
            MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID,
        },
        state: {
          pendingRevocations: [
            {
              txId: 'test-tx-id',
              permissionContext: '0x1234567890abcdef1234567890abcdef12345678',
            },
          ],
        },
      });

      expect(
        controller.isPendingRevocation(
          '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdef' as Hex,
        ),
      ).toBe(false);
    });

    it('should be case-insensitive when checking permission context', () => {
      const messenger = getMessenger();
      const permissionContext =
        '0x1234567890abcdef1234567890abcdef12345678' as Hex;
      const controller = new GatorPermissionsController({
        messenger,
        config: {
          ...DEFAULT_TEST_CONFIG,
          gatorPermissionsProviderSnapId:
            MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID,
        },
        state: {
          pendingRevocations: [
            {
              txId: 'test-tx-id',
              permissionContext: permissionContext.toLowerCase() as Hex,
            },
          ],
        },
      });

      expect(
        controller.isPendingRevocation(permissionContext.toUpperCase() as Hex),
      ).toBe(true);
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
        config: {
          ...DEFAULT_TEST_CONFIG,
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
        status: TransactionStatus.confirmed,
      } as TransactionMeta);

      await flushPromises();

      // Verify submitRevocation was called
      expect(mockHandleRequestHandler).toHaveBeenCalledWith({
        snapId: MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID,
        origin: 'metamask',
        handler: 'onRpcRequest',
        request: {
          jsonrpc: '2.0',
          method: 'permissionsProvider_submitRevocation',
          params: { permissionContext, txHash: undefined },
        },
      });

      // Verify that permissions are refreshed after revocation (getGrantedPermissions is called)
      expect(mockHandleRequestHandler).toHaveBeenCalledWith({
        snapId: MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID,
        origin: 'metamask',
        handler: 'onRpcRequest',
        request: {
          jsonrpc: '2.0',
          method: 'permissionsProvider_getGrantedPermissions',
          params: { isRevoked: false },
        },
      });
    });

    it('should throw and error if the transaction fails', async () => {
      const mockHandleRequestHandler = jest.fn().mockResolvedValue(undefined);
      const rootMessenger = getRootMessenger({
        snapControllerHandleRequestActionHandler: mockHandleRequestHandler,
      });
      const messenger = getMessenger(rootMessenger);

      const controller = new GatorPermissionsController({
        messenger,
        config: {
          ...DEFAULT_TEST_CONFIG,
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
        status: TransactionStatus.failed,
      } as TransactionMeta);

      await flushPromises();

      // Should not call submitRevocation
      expect(mockHandleRequestHandler).toHaveBeenCalledTimes(1);

      // Verify that permissions are refreshed after revocation (getGrantedPermissions is called)
      expect(mockHandleRequestHandler).toHaveBeenCalledWith({
        snapId: MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID,
        origin: 'metamask',
        handler: 'onRpcRequest',
        request: {
          jsonrpc: '2.0',
          method: 'permissionsProvider_getGrantedPermissions',
          params: { isRevoked: false },
        },
      });

      // Should not be in pending revocations
      expect(controller.state.pendingRevocations).toStrictEqual([]);
    });

    it('should submit revocation metadata when transaction is confirmed', async () => {
      const mockHandleRequestHandler = jest.fn().mockResolvedValue(undefined);
      const rootMessenger = getRootMessenger({
        snapControllerHandleRequestActionHandler: mockHandleRequestHandler,
      });
      const messenger = getMessenger(rootMessenger);

      const controller = new GatorPermissionsController({
        messenger,
        config: {
          ...DEFAULT_TEST_CONFIG,
          gatorPermissionsProviderSnapId:
            MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID,
        },
      });

      const txId = 'test-tx-id';
      const permissionContext = '0x1234567890abcdef1234567890abcdef12345678';
      const hash = '0x-mock-hash';

      await controller.addPendingRevocation({ txId, permissionContext });

      // Emit transaction approved event (user confirms)
      rootMessenger.publish('TransactionController:transactionApproved', {
        transactionMeta: { id: txId } as TransactionMeta,
      });

      // Emit transaction confirmed event
      rootMessenger.publish('TransactionController:transactionConfirmed', {
        id: txId,
        status: TransactionStatus.confirmed,
        hash,
      } as TransactionMeta);

      await flushPromises();

      // Verify submitRevocation was called
      expect(mockHandleRequestHandler).toHaveBeenCalledWith({
        snapId: MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID,
        origin: 'metamask',
        handler: 'onRpcRequest',
        request: {
          jsonrpc: '2.0',
          method: 'permissionsProvider_submitRevocation',
          params: {
            permissionContext,
            txHash: hash,
          },
        },
      });

      // Verify that permissions are refreshed after revocation (getGrantedPermissions is called)
      expect(mockHandleRequestHandler).toHaveBeenCalledWith({
        snapId: MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID,
        origin: 'metamask',
        handler: 'onRpcRequest',
        request: {
          jsonrpc: '2.0',
          method: 'permissionsProvider_getGrantedPermissions',
          params: { isRevoked: false },
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
        config: {
          ...DEFAULT_TEST_CONFIG,
          gatorPermissionsProviderSnapId:
            MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID,
        },
      });

      const txId = 'test-tx-id';
      const permissionContext = '0x1234567890abcdef1234567890abcdef12345678';

      await controller.addPendingRevocation({ txId, permissionContext });

      // Verify pending revocation is not in state yet
      expect(controller.state.pendingRevocations).toStrictEqual([]);

      // Emit transaction rejected event (user cancels)
      rootMessenger.publish('TransactionController:transactionRejected', {
        transactionMeta: { id: txId } as TransactionMeta,
      });

      // Wait for async operations
      await Promise.resolve();

      // Should not call submitRevocation
      expect(mockHandleRequestHandler).not.toHaveBeenCalled();
      // Should not be in pending revocations
      expect(controller.state.pendingRevocations).toStrictEqual([]);
    });

    it('should cleanup and refresh permissions without submitting revocation when transaction fails', async () => {
      const mockHandleRequestHandler = jest.fn().mockResolvedValue(undefined);
      const rootMessenger = getRootMessenger({
        snapControllerHandleRequestActionHandler: mockHandleRequestHandler,
      });
      const messenger = getMessenger(rootMessenger);

      const controller = new GatorPermissionsController({
        messenger,
        config: {
          ...DEFAULT_TEST_CONFIG,
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

      // Should refresh permissions with isRevoked: false
      expect(mockHandleRequestHandler).toHaveBeenCalledWith({
        handler: 'onRpcRequest',
        origin: 'metamask',
        request: {
          jsonrpc: '2.0',
          method: 'permissionsProvider_getGrantedPermissions',
          params: { isRevoked: false },
        },
        snapId: MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID,
      });

      // Should not be in pending revocations
      expect(controller.state.pendingRevocations).toStrictEqual([]);
    });

    it('should cleanup and refresh permissions without submitting revocation when transaction is dropped', async () => {
      const mockHandleRequestHandler = jest.fn().mockResolvedValue(undefined);
      const rootMessenger = getRootMessenger({
        snapControllerHandleRequestActionHandler: mockHandleRequestHandler,
      });
      const messenger = getMessenger(rootMessenger);

      const controller = new GatorPermissionsController({
        messenger,
        config: {
          ...DEFAULT_TEST_CONFIG,
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

      // Should refresh permissions with isRevoked: false
      expect(mockHandleRequestHandler).toHaveBeenCalledWith({
        handler: 'onRpcRequest',
        origin: 'metamask',
        request: {
          jsonrpc: '2.0',
          method: 'permissionsProvider_getGrantedPermissions',
          params: { isRevoked: false },
        },
        snapId: MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID,
      });

      // Should not be in pending revocations
      expect(controller.state.pendingRevocations).toStrictEqual([]);
    });

    it('should handle error when refreshing permissions after transaction fails', async () => {
      const mockError = new Error('Failed to fetch permissions');
      const mockHandleRequestHandler = jest.fn().mockRejectedValue(mockError);
      const rootMessenger = getRootMessenger({
        snapControllerHandleRequestActionHandler: mockHandleRequestHandler,
      });
      const messenger = getMessenger(rootMessenger);

      const controller = new GatorPermissionsController({
        messenger,
        config: {
          ...DEFAULT_TEST_CONFIG,
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

      // Wait for async operations and catch blocks to execute
      await Promise.resolve();
      await Promise.resolve();

      // Should have attempted to refresh permissions
      expect(mockHandleRequestHandler).toHaveBeenCalled();

      // Should not be in pending revocations
      expect(controller.state.pendingRevocations).toStrictEqual([]);
    });

    it('should handle error when refreshing permissions after transaction is dropped', async () => {
      const mockError = new Error('Failed to fetch permissions');
      const mockHandleRequestHandler = jest.fn().mockRejectedValue(mockError);
      const rootMessenger = getRootMessenger({
        snapControllerHandleRequestActionHandler: mockHandleRequestHandler,
      });
      const messenger = getMessenger(rootMessenger);

      const controller = new GatorPermissionsController({
        messenger,
        config: {
          ...DEFAULT_TEST_CONFIG,
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

      // Wait for async operations and catch blocks to execute
      await Promise.resolve();
      await Promise.resolve();

      // Should have attempted to refresh permissions
      expect(mockHandleRequestHandler).toHaveBeenCalled();

      // Should not be in pending revocations
      expect(controller.state.pendingRevocations).toStrictEqual([]);
    });

    it('should cleanup without submitting revocation when timeout is reached', async () => {
      const mockHandleRequestHandler = jest.fn().mockResolvedValue(undefined);
      const rootMessenger = getRootMessenger({
        snapControllerHandleRequestActionHandler: mockHandleRequestHandler,
      });
      const messenger = getMessenger(rootMessenger);

      const controller = new GatorPermissionsController({
        messenger,
        config: {
          ...DEFAULT_TEST_CONFIG,
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
        config: {
          ...DEFAULT_TEST_CONFIG,
          gatorPermissionsProviderSnapId:
            MOCK_GATOR_PERMISSIONS_PROVIDER_SNAP_ID,
        },
      });

      const txId = 'test-tx-id';
      const permissionContext = '0x1234567890abcdef1234567890abcdef12345678';

      await controller.addPendingRevocation({ txId, permissionContext });

      // Before approval, pending revocation should not be in state
      expect(controller.state.pendingRevocations).toStrictEqual([]);

      // Emit transaction approved event (user confirms)
      rootMessenger.publish('TransactionController:transactionApproved', {
        transactionMeta: { id: txId } as TransactionMeta,
      });

      // After approval, pending revocation should be in state
      expect(controller.state.pendingRevocations).toStrictEqual([
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
        config: {
          ...DEFAULT_TEST_CONFIG,
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
        status: TransactionStatus.confirmed,
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
        config: {
          ...DEFAULT_TEST_CONFIG,
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
        status: TransactionStatus.confirmed,
      } as TransactionMeta);

      // Wait for async operations
      await Promise.resolve();

      // Should have attempted to call submitRevocation even though it failed
      expect(mockHandleRequestHandler).toHaveBeenCalled();
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
