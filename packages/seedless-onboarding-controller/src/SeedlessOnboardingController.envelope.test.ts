import type { AnalyticsTrackingEvent } from '@metamask/analytics-controller';
import { deriveStateFromMetadata } from '@metamask/base-controller';
import { encrypt } from '@metamask/cryptography/aes-gcm';
import type {
  EnvelopeKeys,
  FetchedSecretDataItem,
  KeyPair,
  ToprfSecureBackup,
} from '@metamask/toprf-secure-backup';
import {
  EncAccountDataType,
  TOPRFError,
  TOPRFErrorCode,
} from '@metamask/toprf-secure-backup';
import {
  base64ToBytes,
  bigIntToHex,
  bytesToBase64,
  bytesToHex,
  concatBytes,
  stringToBytes,
} from '@metamask/utils';
import type { Mock, MockInstance } from 'vitest';
import { describe, expect, it, vi } from 'vitest';

import type { RootMessenger } from '../tests/__fixtures__/mockMessenger.js';
import {
  authConnectionId as MOCK_AUTH_CONNECTION_ID,
  createMockToprfEncryptor,
  getMockInitialControllerState,
  groupedAuthConnectionId as MOCK_GROUPED_AUTH_CONNECTION_ID,
  MOCK_KEYRING_ID,
  MOCK_NODE_AUTH_TOKENS,
  MOCK_SEED_PHRASE,
  mockCreateToprfKeyAndBackupSeedPhrase,
  userId as MOCK_USER_ID,
  withController,
} from '../tests/controller-helpers.js';
import { deriveTestEnvelopeKeys } from '../tests/mocks/envelopeKeys.js';
import { createMockJWTToken } from '../tests/mocks/utils.js';
import {
  SeedlessOnboardingControllerErrorMessage,
  SeedlessOnboardingMigrationVersion,
} from './constants.js';
import {
  openEnvelope,
  sealEnvelope,
  serializeEnvelope,
} from './envelope/envelope-keys.js';
import type { ControlRecord, VaultKeySet } from './envelope/envelope-keys.js';
import { EnvelopeStore } from './envelope/EnvelopeStore.js';
import {
  decryptPendingMigration,
  encryptPendingMigration,
} from './envelope/pending-migration.js';
import type { PendingEnvelopeMigration } from './envelope/pending-migration.js';
import { SecretMetadata } from './SecretMetadata.js';
import { getEnvelopeStatus } from './state.js';
import type { SeedlessOnboardingControllerState } from './types.js';
import { SeedlessEnvelopeMigrationCheckpointEventName } from './utils/analytics.js';

describe('SeedlessOnboardingController', () => {
  describe('MFA recovery', () => {
    const MOCK_PASSWORD = 'mock-password';
    const NEW_PASSWORD = 'new-password';
    const RECOVERED_PASSWORD = 'recovered-password';
    const RECOVERY_SECRET = new Uint8Array(32).fill(7);
    const RECOVERY_SECRET_HEX = bytesToHex(RECOVERY_SECRET);
    const AAL2_USER_ID = 'mock-profile-id';
    const futureExp = (): number => Math.floor(Date.now() / 1000) + 3600;
    const AAL2_NODE_AUTH_TOKENS = [
      { authToken: 'aal2Token1', nodeIndex: 1, nodePubKey: 'nodePubKey' },
      { authToken: 'aal2Token2', nodeIndex: 2, nodePubKey: 'nodePubKey2' },
      { authToken: 'aal2Token3', nodeIndex: 3, nodePubKey: 'nodePubKey3' },
    ];
    const AAL2_AUTH_CONNECTION_ID = 'mm-recovery-dev-aal2-common';
    const AAL2_GROUPED_AUTH_CONNECTION_ID = 'mm-recovery-aal2-dev';
    const LOCK_ID = 'mock-lock-id';

    /**
     * Derives the keys the mock TOPRF network gives a password.
     *
     * @param password - The password.
     * @returns The keys and the envelope keys.
     */
    function keysFor(password: string): {
      encKey: Uint8Array;
      pwEncKey: Uint8Array;
      authKeyPair: KeyPair;
      envelopeKeys: EnvelopeKeys;
    } {
      const encryptor = createMockToprfEncryptor();
      return {
        encKey: encryptor.deriveEncKey(password),
        pwEncKey: encryptor.derivePwEncKey(password),
        authKeyPair: encryptor.deriveAuthKeyPair(password),
        envelopeKeys: deriveTestEnvelopeKeys(stringToBytes(password)),
      };
    }

    /**
     * @param password - The password the vault was created with.
     * @returns The vault key set created for that password.
     */
    function vaultKeySetFor(password: string = MOCK_PASSWORD): VaultKeySet {
      const { encKey, pwEncKey, authKeyPair } = keysFor(password);
      return { authKeyPair, encKey, localWrapKey: pwEncKey };
    }

    type StoredItem = {
      encKey: string;
      dataType?: EncAccountDataType;
      data: Uint8Array;
    };

    type MetadataStore = Map<string, Map<string, StoredItem>>;

    type SpiedMethod =
      | 'fetchAuthPubKey'
      | 'recoverEncKey'
      | 'createLocalKey'
      | 'persistLocalKey'
      | 'addSecretDataItem'
      | 'fetchAllSecretDataItems'
      | 'acquireMetadataLock'
      | 'releaseMetadataLock';

    type MockNetwork = {
      store: MetadataStore;
      setGlobalPassword: (password: string) => void;
      registerRecoverySecret: (secret: string) => void;
      envelopeStore: EnvelopeStore;
      spies: {
        [Method in SpiedMethod]: MockInstance<ToprfSecureBackup[Method]>;
      };
    };

    /**
     * Mocks the TOPRF nodes and the metadata store for both verifiers.
     *
     * The password verifier answers for the current global password, the
     * recovery verifier for the registered Recovery Secret. Metadata items
     * are kept per partition (auth public key) and only decrypt under the key
     * they were written with.
     *
     * @param toprfClient - The ToprfSecureBackup instance.
     * @param options - The options.
     * @param options.store - The metadata store, shared between devices.
     * @param options.globalPassword - The global password.
     * @param options.recoverySecret - The registered Recovery Secret, if any.
     * @param options.droppedDataTypes - Data types whose writes the store
     * acknowledges but does not keep.
     * @returns The mock network.
     */
    function mockNetwork(
      toprfClient: ToprfSecureBackup,
      {
        store = new Map(),
        globalPassword = MOCK_PASSWORD,
        recoverySecret,
        droppedDataTypes = [],
      }: {
        store?: MetadataStore;
        globalPassword?: string;
        recoverySecret?: string;
        droppedDataTypes?: EncAccountDataType[];
      } = {},
    ): MockNetwork {
      let globalKey = { password: globalPassword, keyIndex: 1 };
      let registeredRecoverySecret = recoverySecret;
      const localKeys = new Map<string, string>();
      const isRecovery = (authConnectionId: string): boolean =>
        authConnectionId === AAL2_AUTH_CONNECTION_ID;

      const spies = {
        fetchAuthPubKey: vi
          .spyOn(toprfClient, 'fetchAuthPubKey')
          .mockImplementation(async () => ({
            authPubKey: keysFor(globalKey.password).authKeyPair.pk,
            keyIndex: globalKey.keyIndex,
          })),
        recoverEncKey: vi
          .spyOn(toprfClient, 'recoverEncKey')
          .mockImplementation(async ({ authConnectionId, password }) => {
            const expected = isRecovery(authConnectionId)
              ? registeredRecoverySecret
              : globalKey.password;
            if (password !== expected) {
              throw new TOPRFError(
                TOPRFErrorCode.CouldNotDeriveEncryptionKey,
                'could not derive',
              );
            }
            return {
              ...keysFor(password),
              keyShareIndex: globalKey.keyIndex,
              rateLimitResetResult: Promise.resolve(),
            };
          }),
        createLocalKey: vi
          .spyOn(toprfClient, 'createLocalKey')
          .mockImplementation(async ({ password }) => {
            const keys = keysFor(password);
            localKeys.set(bytesToHex(keys.authKeyPair.pk), password);
            return {
              ...keys,
              seed: stringToBytes(password),
              oprfKey: 5n,
            };
          }),
        persistLocalKey: vi
          .spyOn(toprfClient, 'persistLocalKey')
          .mockImplementation(async ({ authConnectionId, authPubKey }) => {
            const password = localKeys.get(bytesToHex(authPubKey));
            if (password === undefined) {
              throw new Error('persisting an unknown key');
            }
            if (isRecovery(authConnectionId)) {
              registeredRecoverySecret = password;
            } else {
              globalKey = { password, keyIndex: globalKey.keyIndex + 1 };
            }
          }),
        addSecretDataItem: vi
          .spyOn(toprfClient, 'addSecretDataItem')
          .mockImplementation(
            async ({ encKey, authKeyPair, secretData, itemId, dataType }) => {
              if (
                dataType !== undefined &&
                droppedDataTypes.includes(dataType)
              ) {
                return;
              }
              const partitionId = bytesToHex(authKeyPair.pk);
              const partition = store.get(partitionId) ?? new Map();
              partition.set(itemId ?? `server-item-${partition.size}`, {
                encKey: bytesToHex(encKey),
                dataType,
                data: secretData,
              });
              store.set(partitionId, partition);
            },
          ),
        fetchAllSecretDataItems: vi
          .spyOn(toprfClient, 'fetchAllSecretDataItems')
          .mockImplementation(async ({ decKey, authKeyPair }) => {
            const partition = store.get(bytesToHex(authKeyPair.pk));
            const items: FetchedSecretDataItem[] = [];
            for (const [itemId, item] of partition ?? []) {
              if (item.encKey !== bytesToHex(decKey)) {
                throw new Error('decryption failed');
              }
              items.push({
                itemId,
                data: item.data,
                version: 'v2',
                dataType: item.dataType,
              });
            }
            return items;
          }),
        acquireMetadataLock: vi
          .spyOn(toprfClient, 'acquireMetadataLock')
          .mockResolvedValue(LOCK_ID),
        releaseMetadataLock: vi
          .spyOn(toprfClient, 'releaseMetadataLock')
          .mockResolvedValue(undefined),
      };

      return {
        store,
        setGlobalPassword: (password) => {
          globalKey = { password, keyIndex: globalKey.keyIndex + 1 };
        },
        registerRecoverySecret: (secret) => {
          registeredRecoverySecret = secret;
        },
        envelopeStore: new EnvelopeStore({ getToprfClient: () => toprfClient }),
        spies,
      };
    }

    type ControllerArgs = Parameters<
      NonNullable<Parameters<typeof withController<unknown>>[1]>
    >[0];

    type UnlockedControllerArgs = ControllerArgs & {
      trackEvent: Mock<(event: AnalyticsTrackingEvent) => void>;
    };

    /**
     * Runs the callback with an unlocked controller that holds a vault, and
     * a mock `AnalyticsController:trackEvent` handler.
     *
     * @param fn - The callback.
     * @param options - The options.
     * @param options.password - The password to create the vault with.
     * @param options.groupedAuthConnectionId - Overrides the grouped auth
     * connection ID of the authenticated user.
     * @returns Whatever the callback returns.
     */
    async function withUnlockedController<ReturnValue>(
      fn: (args: UnlockedControllerArgs) => Promise<ReturnValue>,
      {
        password = MOCK_PASSWORD,
        ...overrides
      }: { password?: string; groupedAuthConnectionId?: undefined } = {},
    ): Promise<ReturnValue> {
      return await withController(
        {
          state: {
            ...getMockInitialControllerState({
              withMockAuthenticatedUser: true,
            }),
            ...overrides,
          },
        },
        async (args) => {
          await mockCreateToprfKeyAndBackupSeedPhrase(
            args.toprfClient,
            args.controller,
            args.baseMessenger,
            password,
            MOCK_SEED_PHRASE,
            MOCK_KEYRING_ID,
          );
          args.controller.setMigrationVersion(
            SeedlessOnboardingMigrationVersion.V1,
          );
          vi.clearAllMocks();
          const trackEvent: UnlockedControllerArgs['trackEvent'] = vi.fn();
          args.baseMessenger.registerActionHandler(
            'AnalyticsController:trackEvent',
            trackEvent,
          );
          return await fn({ ...args, trackEvent });
        },
      );
    }

    /**
     * Authenticates the controller at aal2.
     *
     * @param args - The controller test arguments.
     * @param args.toprfClient - The ToprfSecureBackup instance.
     * @param args.baseMessenger - The root messenger.
     * @param options - The options.
     * @param options.hasRecoveryShare - Whether the nodes hold a
     * recovery verifier share.
     */
    async function authenticateAal2(
      {
        toprfClient,
        baseMessenger,
      }: { toprfClient: ToprfSecureBackup; baseMessenger: RootMessenger },
      { hasRecoveryShare }: { hasRecoveryShare: boolean },
    ): Promise<void> {
      vi.spyOn(toprfClient, 'authenticate').mockResolvedValueOnce({
        nodeAuthTokens: AAL2_NODE_AUTH_TOKENS,
        isNewUser: !hasRecoveryShare,
      });
      await baseMessenger.call(
        'SeedlessOnboardingController:authenticateForRecovery',
        {
          aal2Token: createMockJWTToken({
            exp: futureExp(),
            sub: AAL2_USER_ID,
          }),
          authConnectionId: AAL2_AUTH_CONNECTION_ID,
          groupedAuthConnectionId: AAL2_GROUPED_AUTH_CONNECTION_ID,
        },
      );
    }

    /**
     * Migrates the controller's vault to envelopes, registering the
     * Recovery Secret first.
     *
     * @param args - The controller test arguments.
     * @param network - The mock network.
     */
    async function migrate(
      args: ControllerArgs,
      network: MockNetwork,
    ): Promise<void> {
      await authenticateAal2(args, { hasRecoveryShare: false });
      await args.baseMessenger.call(
        'SeedlessOnboardingController:migrateToEnvelope',
        { recoverySecret: RECOVERY_SECRET },
      );
      vi.clearAllMocks();
      expect(args.controller.state.envelope).toBeDefined();
      expect(network.store.size).toBeGreaterThan(0);
    }

    /**
     * Opens the envelope stored for a seed.
     *
     * @param network - The mock network.
     * @param seedSource - The password or Recovery Secret hex the seed is
     * evaluated for.
     * @param path - The envelope path.
     * @returns The newest sealed vault key set, or undefined if there is none.
     */
    async function openStoredEnvelope(
      network: MockNetwork,
      seedSource: string,
      path: 'password' | 'recovery-secret',
    ): Promise<VaultKeySet | undefined> {
      const keys = deriveTestEnvelopeKeys(stringToBytes(seedSource));
      const [envelope] = await network.envelopeStore.fetchEnvelopes(keys, path);
      return envelope && (await openEnvelope(envelope, keys.wrapKey, path));
    }

    /**
     * @param network - The mock network.
     * @param vaultKeySet - The vault key set.
     * @returns The stored control records of the vault, by ascending `seq`.
     */
    async function fetchControlRecords(
      network: MockNetwork,
      vaultKeySet: VaultKeySet = vaultKeySetFor(),
    ): Promise<ControlRecord[]> {
      const records =
        await network.envelopeStore.fetchControlRecords(vaultKeySet);
      return records.sort((a, b) => a.seq - b.seq);
    }

    /**
     * @param password - The password.
     * @returns The base64 encoded auth public key of the password.
     */
    function authPubKeyOf(password: string): string {
      return bytesToBase64(keysFor(password).authKeyPair.pk);
    }

    /**
     * @param password - The password whose auth key the record registers.
     * @returns A control record for the password.
     */
    function controlRecordFor(password: string): ControlRecord {
      return {
        v: 1,
        seq: 1,
        passwordNamespace: {
          verifier: MOCK_GROUPED_AUTH_CONNECTION_ID,
          verifierId: MOCK_USER_ID,
          authSk: bigIntToHex(keysFor(password).authKeyPair.sk),
          keyIndex: 1,
        },
        migratedAt: 1,
      };
    }

    /**
     * Stores the primary seed phrase in the vault partition of a vault key
     * set, replacing its secrets but keeping its control records.
     *
     * @param store - The metadata store.
     * @param vaultKeySet - The vault key set.
     */
    function storeSeedPhrase(
      store: MetadataStore,
      vaultKeySet: VaultKeySet,
    ): void {
      const partitionId = bytesToHex(vaultKeySet.authKeyPair.pk);
      const partition = new Map(
        [...(store.get(partitionId) ?? [])].filter(
          ([, item]) => item.dataType === EncAccountDataType.EnvelopeControl,
        ),
      );
      partition.set('server-item-seed', {
        encKey: bytesToHex(vaultKeySet.encKey),
        dataType: EncAccountDataType.PrimarySrp,
        data: new SecretMetadata(MOCK_SEED_PHRASE, {
          dataType: EncAccountDataType.PrimarySrp,
        }).toBytes(),
      });
      store.set(partitionId, partition);
    }

    /**
     * Deletes the control records from the vault partition of a vault key
     * set, keeping its secrets.
     *
     * @param store - The metadata store.
     * @param vaultKeySet - The vault key set.
     */
    function deleteControlRecords(
      store: MetadataStore,
      vaultKeySet: VaultKeySet = vaultKeySetFor(),
    ): void {
      const partition = store.get(bytesToHex(vaultKeySet.authKeyPair.pk));
      for (const [itemId, item] of partition ?? []) {
        if (item.dataType === EncAccountDataType.EnvelopeControl) {
          partition?.delete(itemId);
        }
      }
    }

    /**
     * Runs the callback with an authenticated controller that has no vault.
     *
     * @param fn - The callback.
     * @returns Whatever the callback returns.
     */
    async function withNewDeviceController<ReturnValue>(
      fn: (args: ControllerArgs) => Promise<ReturnValue>,
    ): Promise<ReturnValue> {
      return await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
          }),
        },
        fn,
      );
    }

    /**
     * Migrates a vault on one device, then changes its password to
     * `NEW_PASSWORD`, leaving the store as a migrated account whose password
     * has moved on since migration.
     *
     * @returns The shared metadata store.
     */
    async function createMigratedAccount(): Promise<MetadataStore> {
      const store: MetadataStore = new Map();
      await withUnlockedController(async (args) => {
        await migrate(args, mockNetwork(args.toprfClient, { store }));
        await args.baseMessenger.call(
          'SeedlessOnboardingController:changePassword',
          NEW_PASSWORD,
          MOCK_PASSWORD,
        );
      });
      storeSeedPhrase(store, vaultKeySetFor());
      return store;
    }

    /**
     * Recovers the vault keys on a new device with the Recovery Secret,
     * without creating the local vault.
     *
     * @param args - The controller test arguments.
     * @returns The recovered secrets.
     */
    async function recoverSecrets(
      args: ControllerArgs,
    ): Promise<SecretMetadata[]> {
      await authenticateAal2(args, { hasRecoveryShare: true });
      return await args.baseMessenger.call(
        'SeedlessOnboardingController:recoverWithRecoverySecret',
        { recoverySecret: RECOVERY_SECRET },
      );
    }

    /**
     * Creates the local vault from the recovered vault keys.
     *
     * @param args - The controller test arguments.
     * @param password - The password of the new local vault.
     */
    async function setLocalPassword(
      args: ControllerArgs,
      password: string = RECOVERED_PASSWORD,
    ): Promise<void> {
      await args.baseMessenger.call(
        'SeedlessOnboardingController:setLocalPassword',
        { password },
      );
    }

    /**
     * Recovers the account on a new device with the Recovery Secret and
     * creates the local vault.
     *
     * @param args - The controller test arguments.
     * @param password - The password of the new local vault.
     * @returns The recovered secrets.
     */
    async function recover(
      args: ControllerArgs,
      password: string = RECOVERED_PASSWORD,
    ): Promise<SecretMetadata[]> {
      const secrets = await recoverSecrets(args);
      await setLocalPassword(args, password);
      return secrets;
    }

    describe('authenticateForRecovery', () => {
      it('throws without a successful authenticate and does not call the recovery verifier', async () => {
        await withController(
          { state: getMockInitialControllerState() },
          async ({ toprfClient, baseMessenger }) => {
            const authenticateSpy = vi.spyOn(toprfClient, 'authenticate');

            await expect(
              baseMessenger.call(
                'SeedlessOnboardingController:authenticateForRecovery',
                {
                  aal2Token: createMockJWTToken({
                    exp: futureExp(),
                    sub: AAL2_USER_ID,
                  }),
                  authConnectionId: AAL2_AUTH_CONNECTION_ID,
                  groupedAuthConnectionId: AAL2_GROUPED_AUTH_CONNECTION_ID,
                },
              ),
            ).rejects.toThrow(
              SeedlessOnboardingControllerErrorMessage.MissingAuthUserInfo,
            );
            expect(authenticateSpy).not.toHaveBeenCalled();
          },
        );
      });

      it('authenticates on the recovery verifier with the token sub and stores the aal2 set', async () => {
        const exp = futureExp();
        const aal2Token = createMockJWTToken({ exp, sub: AAL2_USER_ID });
        await withController(
          {
            state: getMockInitialControllerState({
              withMockAuthenticatedUser: true,
            }),
          },
          async ({
            controller,
            toprfClient,
            baseMessenger,
            mockRefreshJWTToken,
          }) => {
            const authenticateSpy = vi
              .spyOn(toprfClient, 'authenticate')
              .mockResolvedValue({
                nodeAuthTokens: AAL2_NODE_AUTH_TOKENS,
                isNewUser: false,
              });
            const before = controller.state;

            await baseMessenger.call(
              'SeedlessOnboardingController:authenticateForRecovery',
              {
                aal2Token,
                authConnectionId: AAL2_AUTH_CONNECTION_ID,
                groupedAuthConnectionId: AAL2_GROUPED_AUTH_CONNECTION_ID,
              },
            );

            expect(mockRefreshJWTToken).not.toHaveBeenCalled();
            expect(authenticateSpy).toHaveBeenCalledWith({
              authConnectionId: AAL2_AUTH_CONNECTION_ID,
              groupedAuthConnectionId: AAL2_GROUPED_AUTH_CONNECTION_ID,
              userId: AAL2_USER_ID,
              idTokens: [aal2Token],
            });
            expect(controller.state.recoverySession).toStrictEqual({
              nodeAuthTokens: AAL2_NODE_AUTH_TOKENS,
              expiresAt: exp,
              userId: AAL2_USER_ID,
              authConnectionId: AAL2_AUTH_CONNECTION_ID,
              groupedAuthConnectionId: AAL2_GROUPED_AUTH_CONNECTION_ID,
              hasRecoveryShare: true,
            });
            expect(controller.state.nodeAuthTokens).toStrictEqual(
              before.nodeAuthTokens,
            );
            expect(controller.state.accessToken).toBe(before.accessToken);
            expect(controller.state.metadataAccessToken).toBe(
              before.metadataAccessToken,
            );
          },
        );
      });

      it.each([
        ['expired', createMockJWTToken({ exp: 1 })],
        ['malformed', 'not-a-jwt'],
        [
          'missing exp',
          createMockJWTToken({ exp: undefined as unknown as number }),
        ],
        [
          'missing sub',
          createMockJWTToken({ sub: undefined as unknown as string }),
        ],
      ])(
        'rejects an %s aal2 token without refreshing or authenticating',
        async (_name, aal2Token) => {
          await withController(
            {
              state: getMockInitialControllerState({
                withMockAuthenticatedUser: true,
              }),
            },
            async ({
              controller,
              toprfClient,
              baseMessenger,
              mockRefreshJWTToken,
            }) => {
              const authenticateSpy = vi.spyOn(toprfClient, 'authenticate');

              await expect(
                baseMessenger.call(
                  'SeedlessOnboardingController:authenticateForRecovery',
                  {
                    aal2Token,
                    authConnectionId: AAL2_AUTH_CONNECTION_ID,
                    groupedAuthConnectionId: AAL2_GROUPED_AUTH_CONNECTION_ID,
                  },
                ),
              ).rejects.toThrow(
                SeedlessOnboardingControllerErrorMessage.Aal2Required,
              );

              expect(mockRefreshJWTToken).not.toHaveBeenCalled();
              expect(authenticateSpy).not.toHaveBeenCalled();
              expect(controller.state.recoverySession).toBeUndefined();
            },
          );
        },
      );

      it.each([
        ['an empty authConnectionId', { authConnectionId: '' }],
        [
          'a missing authConnectionId',
          { authConnectionId: undefined as unknown as string },
        ],
        ['an empty groupedAuthConnectionId', { groupedAuthConnectionId: '' }],
        [
          'a missing groupedAuthConnectionId',
          { groupedAuthConnectionId: undefined as unknown as string },
        ],
      ])('rejects %s without authenticating', async (_name, overrides) => {
        await withController(
          {
            state: getMockInitialControllerState({
              withMockAuthenticatedUser: true,
            }),
          },
          async ({ controller, toprfClient, baseMessenger }) => {
            const authenticateSpy = vi.spyOn(toprfClient, 'authenticate');

            await expect(
              baseMessenger.call(
                'SeedlessOnboardingController:authenticateForRecovery',
                {
                  aal2Token: createMockJWTToken({
                    exp: futureExp(),
                    sub: AAL2_USER_ID,
                  }),
                  authConnectionId: AAL2_AUTH_CONNECTION_ID,
                  groupedAuthConnectionId: AAL2_GROUPED_AUTH_CONNECTION_ID,
                  ...overrides,
                },
              ),
            ).rejects.toThrow(
              SeedlessOnboardingControllerErrorMessage.MissingAuthUserInfo,
            );

            expect(authenticateSpy).not.toHaveBeenCalled();
            expect(controller.state.recoverySession).toBeUndefined();
          },
        );
      });

      it('throws AuthenticationError when authenticating fails', async () => {
        await withController(
          {
            state: getMockInitialControllerState({
              withMockAuthenticatedUser: true,
            }),
          },
          async ({ controller, toprfClient, baseMessenger }) => {
            vi.spyOn(toprfClient, 'authenticate').mockRejectedValueOnce(
              new Error('authenticate'),
            );

            await expect(
              baseMessenger.call(
                'SeedlessOnboardingController:authenticateForRecovery',
                {
                  aal2Token: createMockJWTToken({
                    exp: futureExp(),
                    sub: AAL2_USER_ID,
                  }),
                  authConnectionId: AAL2_AUTH_CONNECTION_ID,
                  groupedAuthConnectionId: AAL2_GROUPED_AUTH_CONNECTION_ID,
                },
              ),
            ).rejects.toThrow(
              SeedlessOnboardingControllerErrorMessage.AuthenticationError,
            );

            expect(controller.state.recoverySession).toBeUndefined();
          },
        );
      });

      it('does not persist or log the recovery session', async () => {
        await withController(
          {
            state: {
              recoverySession: {
                nodeAuthTokens: AAL2_NODE_AUTH_TOKENS,
                expiresAt: futureExp(),
                userId: AAL2_USER_ID,
                authConnectionId: AAL2_AUTH_CONNECTION_ID,
                groupedAuthConnectionId: AAL2_GROUPED_AUTH_CONNECTION_ID,
                hasRecoveryShare: true,
              },
            },
          },
          ({ controller }) => {
            for (const property of [
              'persist',
              'includeInStateLogs',
              'includeInDebugSnapshot',
              'usedInUi',
            ] as const) {
              const derived = deriveStateFromMetadata(
                controller.state,
                controller.metadata,
                property,
              );
              expect(derived).not.toHaveProperty('recoverySession');
            }
          },
        );
      });

      it.each([
        ['the controller is locked', 'SeedlessOnboardingController:setLocked'],
        ['the state is cleared', 'SeedlessOnboardingController:clearState'],
      ] as const)('clears the aal2 state when %s', async (_name, action) => {
        await withController(
          {
            state: getMockInitialControllerState({
              withMockAuthenticatedUser: true,
            }),
          },
          async ({ controller, toprfClient, baseMessenger }) => {
            await authenticateAal2(
              { toprfClient, baseMessenger },
              { hasRecoveryShare: true },
            );
            expect(controller.state.recoverySession).toBeDefined();

            await baseMessenger.call(action);

            expect(controller.state.recoverySession).toBeUndefined();
          },
        );
      });
    });

    describe('migrateToEnvelope', () => {
      const MIGRATION_ID = 'seeded-migration-id';
      const OTHER_RECOVERY_SECRET = new Uint8Array(32).fill(9);
      const OTHER_RECOVERY_SECRET_HEX = bytesToHex(OTHER_RECOVERY_SECRET);
      const PENDING_MIGRATION_AAD = 'mm-envelope-v1/pending-migration';

      const WRITE_STEPS = [
        'acquireMetadataLock',
        'fetchAuthPubKey',
        'fetchAllSecretDataItems:vault',
        'addSecretDataItem:rbek',
        'fetchAllSecretDataItems:rbek',
        'addSecretDataItem:vault',
        'fetchAllSecretDataItems:vault',
        'releaseMetadataLock',
        'checkpoint:ENVELOPES_WRITTEN',
        'trackEvent:ENVELOPES_WRITTEN',
        'checkpoint:cleared',
        'trackEvent:COMPLETED',
      ];

      type SealedCheckpoint = Extract<
        PendingEnvelopeMigration,
        { phase: 'ENVELOPES_SEALED' }
      >;

      type CheckpointWatcher = Mock<(checkpoint: string | undefined) => void>;

      /**
       * @param args - The controller test arguments.
       * @param args.baseMessenger - The root messenger.
       * @param recoverySecret - The Recovery Secret to migrate with.
       */
      async function migrateToEnvelope(
        { baseMessenger }: { baseMessenger: RootMessenger },
        recoverySecret: Uint8Array = RECOVERY_SECRET,
      ): Promise<void> {
        await baseMessenger.call(
          'SeedlessOnboardingController:migrateToEnvelope',
          { recoverySecret },
        );
      }

      /**
       * @returns The envelope keys of the Recovery Secret partition.
       */
      function recoveryEnvelopeKeys(): EnvelopeKeys {
        return keysFor(RECOVERY_SECRET_HEX).envelopeKeys;
      }

      /**
       * @param authKeyPair - The auth key pair of a metadata partition.
       * @returns `vault` for the vault partition, `rbek` for the Recovery
       * Secret envelope partition, or the hex public key otherwise.
       */
      function partitionOf(authKeyPair: KeyPair): string {
        const pk = bytesToHex(authKeyPair.pk);
        if (pk === bytesToHex(vaultKeySetFor().authKeyPair.pk)) {
          return 'vault';
        }
        if (pk === bytesToHex(recoveryEnvelopeKeys().authKeyPair.pk)) {
          return 'rbek';
        }
        return pk;
      }

      /**
       * @returns The envelope state of the migrated vault.
       */
      function expectedEnvelopeState(): SeedlessOnboardingControllerState['envelope'] {
        return {
          v: 1,
          vaultAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
          passwordAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
        };
      }

      /**
       * @param options - The options.
       * @param options.keyIndex - The key index of the password OPRF key.
       * @param options.verifier - The password verifier.
       * @returns The first control record of the vault.
       */
      function expectedControlRecord({
        keyIndex = 1,
        verifier = MOCK_GROUPED_AUTH_CONNECTION_ID,
      }: { keyIndex?: number; verifier?: string } = {}): ControlRecord {
        return {
          v: 1,
          seq: 1,
          passwordNamespace: {
            verifier,
            verifierId: MOCK_USER_ID,
            authSk: bigIntToHex(vaultKeySetFor().authKeyPair.sk),
            keyIndex,
          },
          migratedAt: expect.any(Number),
        };
      }

      /**
       * @param phase - The reported phase.
       * @param resumed - Whether the call started from a checkpoint.
       * @returns The checkpoint analytics event.
       */
      function checkpointEvent(
        phase: string,
        resumed: boolean,
      ): AnalyticsTrackingEvent {
        return {
          name: SeedlessEnvelopeMigrationCheckpointEventName,
          properties: { phase, resumed },
          sensitiveProperties: {},
          saveDataRecording: false,
          hasProperties: true,
        };
      }

      /**
       * @param overrides - Fields to override.
       * @returns An RS_TOPRF_REGISTERED checkpoint for the Recovery Secret.
       */
      function registeredCheckpoint(
        overrides: Partial<
          Extract<PendingEnvelopeMigration, { phase: 'RS_TOPRF_REGISTERED' }>
        > = {},
      ): PendingEnvelopeMigration {
        return {
          v: 1,
          phase: 'RS_TOPRF_REGISTERED',
          id: MIGRATION_ID,
          recoverySecret: RECOVERY_SECRET_HEX,
          rsAuthPubKey: authPubKeyOf(RECOVERY_SECRET_HEX),
          ...overrides,
        };
      }

      /**
       * @returns An ENVELOPES_SEALED checkpoint of the vault.
       */
      async function sealedCheckpoint(): Promise<SealedCheckpoint> {
        const keys = recoveryEnvelopeKeys();
        return {
          v: 1,
          phase: 'ENVELOPES_SEALED',
          id: MIGRATION_ID,
          recoverySecret: RECOVERY_SECRET_HEX,
          rsAuthPubKey: authPubKeyOf(RECOVERY_SECRET_HEX),
          vaultAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
          recoveryEnvelope: {
            keys,
            envelope: await sealEnvelope(
              keys.wrapKey,
              'recovery-secret',
              vaultKeySetFor(),
            ),
          },
          control: { ...expectedControlRecord(), migratedAt: 1 },
        };
      }

      /**
       * @param controller - The controller.
       * @param recipe - Mutates the state.
       */
      function updateState(
        controller: ControllerArgs['controller'],
        recipe: (state: SeedlessOnboardingControllerState) => void,
      ): void {
        // @ts-expect-error Accessing protected method for testing
        controller.update(recipe);
      }

      /**
       * Stores a checkpoint in the controller state.
       *
       * @param controller - The controller.
       * @param checkpoint - The checkpoint, or the raw stored value.
       * @returns The stored value.
       */
      async function seedCheckpoint(
        controller: ControllerArgs['controller'],
        checkpoint: PendingEnvelopeMigration | string,
      ): Promise<string> {
        const encrypted =
          typeof checkpoint === 'string'
            ? checkpoint
            : await encryptPendingMigration(
                checkpoint,
                vaultKeySetFor().localWrapKey,
              );
        updateState(controller, (state) => {
          state.pendingEnvelopeMigration = encrypted;
        });
        return encrypted;
      }

      /**
       * @param encrypted - The stored checkpoint.
       * @returns The checkpoint, or undefined when there is none or it does
       * not decrypt under the vault keys.
       */
      async function readCheckpoint(
        encrypted: string | undefined,
      ): Promise<PendingEnvelopeMigration | undefined> {
        return encrypted === undefined
          ? undefined
          : await decryptPendingMigration(
              encrypted,
              vaultKeySetFor().localWrapKey,
            );
      }

      /**
       * Records every value `pendingEnvelopeMigration` takes.
       *
       * @param baseMessenger - The root messenger.
       * @returns A mock called with each new stored checkpoint, and with
       * undefined once it is cleared.
       */
      function watchCheckpoints(
        baseMessenger: RootMessenger,
      ): CheckpointWatcher {
        const checkpoints: CheckpointWatcher = vi.fn();
        baseMessenger.subscribe(
          'SeedlessOnboardingController:stateChange',
          (checkpoint: string | undefined) => checkpoints(checkpoint),
          (state: SeedlessOnboardingControllerState) =>
            state.pendingEnvelopeMigration,
        );
        return checkpoints;
      }

      /**
       * @param checkpoints - The checkpoint watcher.
       * @returns Each stored checkpoint, in order.
       */
      async function readCheckpoints(
        checkpoints: CheckpointWatcher,
      ): Promise<(PendingEnvelopeMigration | undefined)[]> {
        return await Promise.all(
          checkpoints.mock.calls.map(async ([checkpoint]) =>
            readCheckpoint(checkpoint),
          ),
        );
      }

      /**
       * Merges the TOPRF calls, the stored checkpoints and the analytics
       * events into one ordered list. Metadata item calls are labelled with
       * their partition.
       *
       * @param network - The mock network.
       * @param checkpoints - The checkpoint watcher.
       * @param trackEvent - The analytics handler.
       * @returns The labels, in call order.
       */
      async function readTimeline(
        network: MockNetwork,
        checkpoints: CheckpointWatcher,
        trackEvent: UnlockedControllerArgs['trackEvent'],
      ): Promise<string[]> {
        const entries: { order: number; label: string }[] = [];
        const record = (orders: number[], labels: string[]): void => {
          orders.forEach((order, index) => {
            entries.push({ order, label: labels[index] });
          });
        };
        const { addSecretDataItem, fetchAllSecretDataItems, ...others } =
          network.spies;
        for (const [method, spy] of Object.entries(others)) {
          record(
            spy.mock.invocationCallOrder,
            spy.mock.calls.map(() => method),
          );
        }
        record(
          addSecretDataItem.mock.invocationCallOrder,
          addSecretDataItem.mock.calls.map(
            ([{ authKeyPair }]) =>
              `addSecretDataItem:${partitionOf(authKeyPair)}`,
          ),
        );
        record(
          fetchAllSecretDataItems.mock.invocationCallOrder,
          fetchAllSecretDataItems.mock.calls.map(
            ([{ authKeyPair }]) =>
              `fetchAllSecretDataItems:${partitionOf(authKeyPair)}`,
          ),
        );
        record(
          checkpoints.mock.invocationCallOrder,
          await Promise.all(
            checkpoints.mock.calls.map(async ([checkpoint]) =>
              checkpoint === undefined
                ? 'checkpoint:cleared'
                : `checkpoint:${(await readCheckpoint(checkpoint))?.phase ?? 'unreadable'}`,
            ),
          ),
        );
        record(
          trackEvent.mock.invocationCallOrder,
          trackEvent.mock.calls.map(
            ([{ properties }]) => `trackEvent:${properties.phase as string}`,
          ),
        );
        return entries
          .sort((a, b) => a.order - b.order)
          .map(({ label }) => label);
      }

      /**
       * Makes the first call of a TOPRF client method that matches reject
       * with `network`. Other calls keep the mock implementation.
       *
       * @param spy - The spied method.
       * @param matches - Selects the call to fail. Defaults to the first call.
       */
      function failOnce<Fn extends (params: never) => Promise<unknown>>(
        spy: MockInstance<Fn>,
        matches?: (params: Parameters<Fn>[0]) => boolean,
      ): void {
        const implementation = spy.getMockImplementation() as unknown as (
          params: Parameters<Fn>[0],
        ) => Promise<unknown>;
        let failed = false;
        spy.mockImplementation((async (params: Parameters<Fn>[0]) => {
          if (!failed && (matches?.(params) ?? true)) {
            failed = true;
            throw new Error('network');
          }
          return await implementation(params);
        }) as unknown as Parameters<MockInstance<Fn>['mockImplementation']>[0]);
      }

      /**
       * @param checkpoints - The checkpoint watcher.
       * @returns The id of each stored checkpoint, in order.
       */
      async function readCheckpointIds(
        checkpoints: CheckpointWatcher,
      ): Promise<string[]> {
        return (await readCheckpoints(checkpoints)).flatMap((checkpoint) =>
          checkpoint ? [checkpoint.id] : [],
        );
      }

      /**
       * Makes the store keep a Recovery Secret envelope sealing other vault
       * keys instead of the one written.
       *
       * @param network - The mock network.
       */
      function tamperRecoveryEnvelopeWrites(network: MockNetwork): void {
        const addSecretDataItem =
          network.spies.addSecretDataItem.getMockImplementation();
        network.spies.addSecretDataItem.mockImplementation(async (params) =>
          addSecretDataItem?.(
            params.dataType === EncAccountDataType.KeyEnvelope
              ? {
                  ...params,
                  secretData: serializeEnvelope(
                    await sealEnvelope(
                      recoveryEnvelopeKeys().wrapKey,
                      'recovery-secret',
                      vaultKeySetFor('other-password'),
                    ),
                  ),
                }
              : params,
          ),
        );
      }

      /**
       * @param network - The mock network.
       * @param dataType - The data type of the items.
       * @returns The hex encoded data of each attempted write of the data
       * type, including failed ones.
       */
      function writtenItems(
        network: MockNetwork,
        dataType: EncAccountDataType,
      ): string[] {
        return network.spies.addSecretDataItem.mock.calls
          .filter(([params]) => params.dataType === dataType)
          .map(([{ secretData }]) => bytesToHex(secretData));
      }

      /**
       * @param network - The mock network.
       * @returns The ciphertexts of the stored Recovery Secret envelopes.
       */
      async function storedRecoveryEnvelopeCts(
        network: MockNetwork,
      ): Promise<string[]> {
        const envelopes = await network.envelopeStore.fetchEnvelopes(
          recoveryEnvelopeKeys(),
          'recovery-secret',
        );
        return envelopes.map(({ ct }) => ct);
      }

      it('registers the Recovery Secret, writes the control record and its envelope, and adopts the vault keys', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient } = args;
          const network = mockNetwork(toprfClient);
          await authenticateAal2(args, { hasRecoveryShare: false });

          await migrateToEnvelope(args);

          const vaultKeySet = vaultKeySetFor();
          expect(network.spies.createLocalKey).toHaveBeenCalledTimes(1);
          expect(network.spies.createLocalKey).toHaveBeenCalledWith({
            password: RECOVERY_SECRET_HEX,
          });
          expect(network.spies.persistLocalKey).toHaveBeenCalledTimes(1);
          expect(network.spies.persistLocalKey).toHaveBeenCalledWith(
            expect.objectContaining({
              nodeAuthTokens: AAL2_NODE_AUTH_TOKENS,
              authConnectionId: AAL2_AUTH_CONNECTION_ID,
              authPubKey: keysFor(RECOVERY_SECRET_HEX).authKeyPair.pk,
            }),
          );
          expect(controller.state.recoverySession?.hasRecoveryShare).toBe(true);
          expect(network.spies.recoverEncKey).not.toHaveBeenCalled();
          expect(
            await openStoredEnvelope(network, MOCK_PASSWORD, 'password'),
          ).toBeUndefined();
          expect(
            await openStoredEnvelope(
              network,
              RECOVERY_SECRET_HEX,
              'recovery-secret',
            ),
          ).toStrictEqual(vaultKeySet);
          expect(await fetchControlRecords(network)).toStrictEqual([
            expectedControlRecord(),
          ]);
          expect(controller.state.envelope).toStrictEqual(
            expectedEnvelopeState(),
          );
          expect(controller.state.pendingEnvelopeMigration).toBeUndefined();
        });
      });

      it('registers the Recovery Secret, checkpoints, seals, and under the lock writes and reads back the Recovery Secret envelope before the control record', async () => {
        await withUnlockedController(async (args) => {
          const { toprfClient, trackEvent } = args;
          const network = mockNetwork(toprfClient);
          await authenticateAal2(args, { hasRecoveryShare: false });
          const checkpoints = watchCheckpoints(args.baseMessenger);

          await migrateToEnvelope(args);

          expect(
            await readTimeline(network, checkpoints, trackEvent),
          ).toStrictEqual([
            'createLocalKey',
            'persistLocalKey',
            'checkpoint:RS_TOPRF_REGISTERED',
            'trackEvent:RS_TOPRF_REGISTERED',
            'fetchAuthPubKey',
            'fetchAllSecretDataItems:vault',
            'checkpoint:ENVELOPES_SEALED',
            'trackEvent:ENVELOPES_SEALED',
            ...WRITE_STEPS,
          ]);
        });
      });

      it('checks the password with aal1 tokens and locks the vault partition', async () => {
        await withUnlockedController(async (args) => {
          const { toprfClient } = args;
          const network = mockNetwork(toprfClient);
          await authenticateAal2(args, { hasRecoveryShare: false });

          await migrateToEnvelope(args);

          const aal1Request = {
            nodeAuthTokens: MOCK_NODE_AUTH_TOKENS,
            authConnectionId: MOCK_AUTH_CONNECTION_ID,
            groupedAuthConnectionId: MOCK_GROUPED_AUTH_CONNECTION_ID,
            userId: MOCK_USER_ID,
          };
          expect(network.spies.fetchAuthPubKey.mock.calls).toStrictEqual([
            [aal1Request],
            [aal1Request],
          ]);
          const { authKeyPair } = vaultKeySetFor();
          expect(network.spies.acquireMetadataLock.mock.calls).toStrictEqual([
            [authKeyPair],
          ]);
          expect(network.spies.releaseMetadataLock.mock.calls).toStrictEqual([
            [authKeyPair, LOCK_ID],
          ]);
        });
      });

      it('persists each phase under one attempt id and writes the sealed envelopes', async () => {
        await withUnlockedController(async (args) => {
          const { toprfClient } = args;
          const network = mockNetwork(toprfClient);
          await authenticateAal2(args, { hasRecoveryShare: false });
          const checkpoints = watchCheckpoints(args.baseMessenger);

          await migrateToEnvelope(args);

          const stored = await readCheckpoints(checkpoints);
          expect(stored).toHaveLength(4);
          const [registered, sealed, written, cleared] = stored;
          expect(registered).toStrictEqual({
            v: 1,
            phase: 'RS_TOPRF_REGISTERED',
            id: expect.any(String),
            recoverySecret: RECOVERY_SECRET_HEX,
            rsAuthPubKey: authPubKeyOf(RECOVERY_SECRET_HEX),
          });
          const id = registered?.id;
          expect(id).not.toBe('');
          expect(sealed).toStrictEqual({
            v: 1,
            phase: 'ENVELOPES_SEALED',
            id,
            recoverySecret: RECOVERY_SECRET_HEX,
            rsAuthPubKey: authPubKeyOf(RECOVERY_SECRET_HEX),
            vaultAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
            recoveryEnvelope: {
              keys: recoveryEnvelopeKeys(),
              envelope: {
                v: 1,
                path: 'recovery-secret',
                vaultAuthPubKey: bytesToHex(vaultKeySetFor().authKeyPair.pk),
                ct: expect.any(String),
              },
            },
            control: expectedControlRecord(),
          });
          expect(written).toStrictEqual({
            v: 1,
            phase: 'ENVELOPES_WRITTEN',
            id,
            vaultAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
          });
          expect(cleared).toBeUndefined();
          const { recoveryEnvelope, control } = sealed as SealedCheckpoint;
          expect(await storedRecoveryEnvelopeCts(network)).toStrictEqual([
            recoveryEnvelope.envelope.ct,
          ]);
          expect(await fetchControlRecords(network)).toStrictEqual([control]);
        });
      });

      it('leaves the secret data and the vault untouched', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient } = args;
          const network = mockNetwork(toprfClient);
          await authenticateAal2(args, { hasRecoveryShare: false });
          const { vault, authPubKey } = controller.state;

          await migrateToEnvelope(args);

          const vaultPartition = network.store.get(
            bytesToHex(vaultKeySetFor().authKeyPair.pk),
          ) as Map<string, StoredItem>;
          expect(
            [...vaultPartition.values()].map(({ dataType }) => dataType),
          ).toStrictEqual([EncAccountDataType.EnvelopeControl]);
          expect(
            network.spies.addSecretDataItem.mock.calls.map(
              ([{ dataType }]) => dataType,
            ),
          ).toStrictEqual([
            EncAccountDataType.KeyEnvelope,
            EncAccountDataType.EnvelopeControl,
          ]);
          expect(controller.state.vault).toBe(vault);
          expect(controller.state.authPubKey).toBe(authPubKey);
        });
      });

      it('compares the live password key with the vault auth key, not the cached authPubKey', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient } = args;
          mockNetwork(toprfClient);
          await authenticateAal2(args, { hasRecoveryShare: false });
          updateState(controller, (state) => {
            state.authPubKey = authPubKeyOf('other-password');
          });

          await migrateToEnvelope(args);

          expect(controller.state.envelope).toStrictEqual(
            expectedEnvelopeState(),
          );
        });
      });

      it('records the key index of the live password key in the control record', async () => {
        await withUnlockedController(async (args) => {
          const { toprfClient } = args;
          const network = mockNetwork(toprfClient);
          network.setGlobalPassword(MOCK_PASSWORD);
          await authenticateAal2(args, { hasRecoveryShare: false });

          await migrateToEnvelope(args);

          expect(await fetchControlRecords(network)).toStrictEqual([
            expectedControlRecord({ keyIndex: 2 }),
          ]);
        });
      });

      it('names the auth connection as the verifier without a grouped auth connection', async () => {
        await withUnlockedController(
          async (args) => {
            const { controller, toprfClient } = args;
            const network = mockNetwork(toprfClient);
            await authenticateAal2(args, { hasRecoveryShare: false });

            await migrateToEnvelope(args);

            expect(
              (await fetchControlRecords(network))[0].passwordNamespace
                .verifier,
            ).toBe(controller.state.authConnectionId);
          },
          { groupedAuthConnectionId: undefined },
        );
      });

      it('evaluates an already registered Recovery Secret instead of registering it', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient } = args;
          const network = mockNetwork(toprfClient, {
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          await authenticateAal2(args, { hasRecoveryShare: true });
          const checkpoints = watchCheckpoints(args.baseMessenger);

          await migrateToEnvelope(args);

          expect(network.spies.createLocalKey).not.toHaveBeenCalled();
          expect(network.spies.persistLocalKey).not.toHaveBeenCalled();
          expect(network.spies.recoverEncKey).toHaveBeenCalledTimes(1);
          expect(network.spies.recoverEncKey).toHaveBeenCalledWith(
            expect.objectContaining({
              nodeAuthTokens: AAL2_NODE_AUTH_TOKENS,
              authConnectionId: AAL2_AUTH_CONNECTION_ID,
              password: RECOVERY_SECRET_HEX,
            }),
          );
          expect((await readCheckpoints(checkpoints))[0]).toStrictEqual(
            registeredCheckpoint({ id: expect.any(String) }),
          );
          expect(
            await openStoredEnvelope(
              network,
              RECOVERY_SECRET_HEX,
              'recovery-secret',
            ),
          ).toStrictEqual(vaultKeySetFor());
          expect(controller.state.envelope).toStrictEqual(
            expectedEnvelopeState(),
          );
        });
      });

      it('throws RecoveryKeyShareConflict when the registered key belongs to another Recovery Secret', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient, trackEvent } = args;
          const network = mockNetwork(toprfClient, {
            recoverySecret: OTHER_RECOVERY_SECRET_HEX,
          });
          await authenticateAal2(args, { hasRecoveryShare: true });

          await expect(migrateToEnvelope(args)).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.RecoveryKeyShareConflict,
          );

          expect(network.spies.fetchAuthPubKey).not.toHaveBeenCalled();
          expect(network.spies.addSecretDataItem).not.toHaveBeenCalled();
          expect(trackEvent).not.toHaveBeenCalled();
          expect(controller.state.envelope).toBeUndefined();
          expect(controller.state.pendingEnvelopeMigration).toBeUndefined();
        });
      });

      it('rethrows other recovery verifier errors', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient } = args;
          const network = mockNetwork(toprfClient, {
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          network.spies.recoverEncKey.mockRejectedValueOnce(
            new Error('nodes unavailable'),
          );
          await authenticateAal2(args, { hasRecoveryShare: true });

          await expect(migrateToEnvelope(args)).rejects.toThrow(
            'nodes unavailable',
          );
          expect(network.spies.addSecretDataItem).not.toHaveBeenCalled();
          expect(controller.state.pendingEnvelopeMigration).toBeUndefined();
        });
      });

      it('throws Aal2Required and clears the session when the aal2 tokens expire', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient } = args;
          const network = mockNetwork(toprfClient, {
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          network.spies.recoverEncKey.mockRejectedValueOnce(
            new TOPRFError(TOPRFErrorCode.AuthTokenExpired, 'expired'),
          );
          await authenticateAal2(args, { hasRecoveryShare: true });

          await expect(migrateToEnvelope(args)).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.Aal2Required,
          );
          expect(controller.state.recoverySession).toBeUndefined();
          expect(controller.state.pendingEnvelopeMigration).toBeUndefined();
        });
      });

      it('throws Aal2Required without a recovery session', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient } = args;
          const network = mockNetwork(toprfClient);

          await expect(migrateToEnvelope(args)).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.Aal2Required,
          );
          expect(network.spies.createLocalKey).not.toHaveBeenCalled();
          expect(network.spies.addSecretDataItem).not.toHaveBeenCalled();
          expect(controller.state.pendingEnvelopeMigration).toBeUndefined();
        });
      });

      it('completes when resetting the Recovery Secret rate limit fails', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient } = args;
          const network = mockNetwork(toprfClient, {
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          network.spies.recoverEncKey.mockImplementationOnce(async () => ({
            ...keysFor(RECOVERY_SECRET_HEX),
            keyShareIndex: 1,
            rateLimitResetResult: Promise.reject(new Error('rate limit')),
          }));
          await authenticateAal2(args, { hasRecoveryShare: true });

          await migrateToEnvelope(args);

          expect(controller.state.envelope).toStrictEqual(
            expectedEnvelopeState(),
          );
        });
      });

      it('completes when releasing the metadata lock fails', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient } = args;
          const network = mockNetwork(toprfClient);
          network.spies.releaseMetadataLock.mockRejectedValueOnce(
            new Error('release'),
          );
          await authenticateAal2(args, { hasRecoveryShare: false });

          await migrateToEnvelope(args);

          expect(controller.state.envelope).toStrictEqual(
            expectedEnvelopeState(),
          );
        });
      });

      it('does not checkpoint when registering the Recovery Secret fails', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient } = args;
          const network = mockNetwork(toprfClient);
          network.spies.persistLocalKey.mockRejectedValueOnce(
            new Error('network'),
          );
          await authenticateAal2(args, { hasRecoveryShare: false });

          await expect(migrateToEnvelope(args)).rejects.toThrow('network');
          expect(controller.state.pendingEnvelopeMigration).toBeUndefined();
          expect(network.spies.fetchAuthPubKey).not.toHaveBeenCalled();

          await migrateToEnvelope(args);

          expect(network.spies.createLocalKey).toHaveBeenCalledTimes(2);
          expect(network.spies.persistLocalKey).toHaveBeenCalledTimes(2);
          expect(controller.state.envelope).toStrictEqual(
            expectedEnvelopeState(),
          );
        });
      });

      it('throws OutdatedPassword after registering the Recovery Secret when the password changed elsewhere', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient } = args;
          const network = mockNetwork(toprfClient, {
            globalPassword: NEW_PASSWORD,
          });
          await authenticateAal2(args, { hasRecoveryShare: false });
          const checkpoints = watchCheckpoints(args.baseMessenger);

          await expect(migrateToEnvelope(args)).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.OutdatedPassword,
          );

          expect(network.spies.persistLocalKey).toHaveBeenCalledTimes(1);
          expect(await readCheckpoints(checkpoints)).toStrictEqual([
            registeredCheckpoint({ id: expect.any(String) }),
          ]);
          expect(
            await readCheckpoint(controller.state.pendingEnvelopeMigration),
          ).toStrictEqual(registeredCheckpoint({ id: expect.any(String) }));
          expect(network.spies.acquireMetadataLock).not.toHaveBeenCalled();
          expect(network.spies.addSecretDataItem).not.toHaveBeenCalled();
          expect(controller.state.envelope).toBeUndefined();
        });
      });

      it('rolls back to RS_TOPRF_REGISTERED when the password changes under the metadata lock', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient, trackEvent } = args;
          const network = mockNetwork(toprfClient);
          network.spies.acquireMetadataLock.mockImplementationOnce(async () => {
            network.setGlobalPassword(NEW_PASSWORD);
            return LOCK_ID;
          });
          await authenticateAal2(args, { hasRecoveryShare: false });
          const checkpoints = watchCheckpoints(args.baseMessenger);

          await expect(migrateToEnvelope(args)).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.OutdatedPassword,
          );

          const [registered] = await readCheckpoints(checkpoints);
          expect(registered).toStrictEqual(
            registeredCheckpoint({ id: expect.any(String) }),
          );
          expect(
            await readCheckpoint(controller.state.pendingEnvelopeMigration),
          ).toStrictEqual(registered);
          expect(network.spies.releaseMetadataLock).toHaveBeenCalledWith(
            vaultKeySetFor().authKeyPair,
            LOCK_ID,
          );
          expect(network.spies.addSecretDataItem).not.toHaveBeenCalled();
          expect(trackEvent.mock.calls).toStrictEqual([
            [checkpointEvent('RS_TOPRF_REGISTERED', false)],
            [checkpointEvent('ENVELOPES_SEALED', false)],
          ]);
          expect(controller.state.envelope).toBeUndefined();

          await expect(migrateToEnvelope(args)).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.OutdatedPassword,
          );

          expect(network.spies.createLocalKey).toHaveBeenCalledTimes(1);
          expect(network.spies.persistLocalKey).toHaveBeenCalledTimes(1);
          expect(network.spies.recoverEncKey).toHaveBeenCalledTimes(1);
          expect(network.spies.recoverEncKey).toHaveBeenCalledWith(
            expect.objectContaining({
              authConnectionId: AAL2_AUTH_CONNECTION_ID,
              password: RECOVERY_SECRET_HEX,
            }),
          );
          expect(network.spies.acquireMetadataLock).toHaveBeenCalledTimes(1);
          expect(
            await readCheckpoint(controller.state.pendingEnvelopeMigration),
          ).toStrictEqual(registered);
        });
      });

      it.each([
        [
          'RS_TOPRF_REGISTERED',
          'the password check',
          SeedlessOnboardingControllerErrorMessage.FailedToFetchAuthPubKey,
          1,
          (network: MockNetwork): void =>
            failOnce(network.spies.fetchAuthPubKey),
        ],
        [
          'ENVELOPES_SEALED',
          'acquiring the metadata lock',
          'network',
          0,
          (network: MockNetwork): void =>
            failOnce(network.spies.acquireMetadataLock),
        ],
        [
          'RS_TOPRF_REGISTERED',
          'fetching the control records before sealing',
          SeedlessOnboardingControllerErrorMessage.FailedToFetchSecretMetadata,
          1,
          (network: MockNetwork): void =>
            failOnce(
              network.spies.fetchAllSecretDataItems,
              ({ authKeyPair }) => partitionOf(authKeyPair) === 'vault',
            ),
        ],
        [
          'ENVELOPES_SEALED',
          'fetching the control records under the metadata lock',
          SeedlessOnboardingControllerErrorMessage.FailedToFetchSecretMetadata,
          0,
          (network: MockNetwork): void =>
            failOnce(
              network.spies.fetchAllSecretDataItems,
              () => network.spies.acquireMetadataLock.mock.calls.length > 0,
            ),
        ],
        [
          'ENVELOPES_SEALED',
          'writing the control record',
          'network',
          0,
          (network: MockNetwork): void =>
            failOnce(
              network.spies.addSecretDataItem,
              ({ dataType }) => dataType === EncAccountDataType.EnvelopeControl,
            ),
        ],
        [
          'ENVELOPES_SEALED',
          'writing the Recovery Secret envelope',
          'network',
          0,
          (network: MockNetwork): void =>
            failOnce(
              network.spies.addSecretDataItem,
              ({ dataType }) => dataType === EncAccountDataType.KeyEnvelope,
            ),
        ],
        [
          'ENVELOPES_SEALED',
          'reading back the Recovery Secret envelope',
          SeedlessOnboardingControllerErrorMessage.FailedToFetchSecretMetadata,
          0,
          (network: MockNetwork): void =>
            failOnce(
              network.spies.fetchAllSecretDataItems,
              ({ authKeyPair }) => partitionOf(authKeyPair) === 'rbek',
            ),
        ],
      ] as const)(
        'resumes from %s after %s fails, writing the same bytes',
        async (phase, _step, error, recoverEncKeyCalls, failStep) => {
          await withUnlockedController(async (args) => {
            const { controller, toprfClient } = args;
            const network = mockNetwork(toprfClient);
            await authenticateAal2(args, { hasRecoveryShare: false });
            const checkpoints = watchCheckpoints(args.baseMessenger);
            failStep(network);

            await expect(migrateToEnvelope(args)).rejects.toThrow(error);
            expect(
              (await readCheckpoint(controller.state.pendingEnvelopeMigration))
                ?.phase,
            ).toBe(phase);
            expect(controller.state.envelope).toBeUndefined();

            await migrateToEnvelope(args);

            expect(network.spies.createLocalKey).toHaveBeenCalledTimes(1);
            expect(network.spies.persistLocalKey).toHaveBeenCalledTimes(1);
            expect(network.spies.recoverEncKey).toHaveBeenCalledTimes(
              recoverEncKeyCalls,
            );
            expect(
              new Set(writtenItems(network, EncAccountDataType.KeyEnvelope))
                .size,
            ).toBe(1);
            expect(
              new Set(writtenItems(network, EncAccountDataType.EnvelopeControl))
                .size,
            ).toBe(1);
            expect(new Set(await readCheckpointIds(checkpoints)).size).toBe(1);
            expect(await fetchControlRecords(network)).toStrictEqual([
              expectedControlRecord(),
            ]);
            expect(
              await openStoredEnvelope(
                network,
                RECOVERY_SECRET_HEX,
                'recovery-secret',
              ),
            ).toStrictEqual(vaultKeySetFor());
            expect(controller.state.pendingEnvelopeMigration).toBeUndefined();
            expect(controller.state.envelope).toStrictEqual(
              expectedEnvelopeState(),
            );
          });
        },
      );

      it('resumes RS_TOPRF_REGISTERED by re-deriving the Recovery Secret keys without registering them again', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient, trackEvent } = args;
          const network = mockNetwork(toprfClient, {
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          await authenticateAal2(args, { hasRecoveryShare: true });
          await seedCheckpoint(controller, registeredCheckpoint());
          const checkpoints = watchCheckpoints(args.baseMessenger);

          await migrateToEnvelope(args);

          expect(
            await readTimeline(network, checkpoints, trackEvent),
          ).toStrictEqual([
            'recoverEncKey',
            'fetchAuthPubKey',
            'fetchAllSecretDataItems:vault',
            'checkpoint:ENVELOPES_SEALED',
            'trackEvent:ENVELOPES_SEALED',
            ...WRITE_STEPS,
          ]);
          expect(network.spies.recoverEncKey).toHaveBeenCalledWith(
            expect.objectContaining({
              nodeAuthTokens: AAL2_NODE_AUTH_TOKENS,
              authConnectionId: AAL2_AUTH_CONNECTION_ID,
              password: RECOVERY_SECRET_HEX,
            }),
          );
          expect(await readCheckpointIds(checkpoints)).toStrictEqual([
            MIGRATION_ID,
            MIGRATION_ID,
          ]);
          expect(controller.state.envelope).toStrictEqual(
            expectedEnvelopeState(),
          );
        });
      });

      it.each([
        [
          'the nodes return another Recovery Secret auth key',
          {
            registered: RECOVERY_SECRET_HEX,
            rsAuthPubKey: authPubKeyOf(OTHER_RECOVERY_SECRET_HEX),
          },
        ],
        [
          'the nodes hold another Recovery Secret',
          {
            registered: OTHER_RECOVERY_SECRET_HEX,
            rsAuthPubKey: authPubKeyOf(RECOVERY_SECRET_HEX),
          },
        ],
      ])(
        'throws RecoveryKeyShareConflict on resume and keeps the checkpoint when %s',
        async (_name, { registered, rsAuthPubKey }) => {
          await withUnlockedController(async (args) => {
            const { controller, toprfClient, trackEvent } = args;
            const network = mockNetwork(toprfClient, {
              recoverySecret: registered,
            });
            await authenticateAal2(args, { hasRecoveryShare: true });
            const seeded = await seedCheckpoint(
              controller,
              registeredCheckpoint({ rsAuthPubKey }),
            );

            await expect(migrateToEnvelope(args)).rejects.toThrow(
              SeedlessOnboardingControllerErrorMessage.RecoveryKeyShareConflict,
            );

            expect(controller.state.pendingEnvelopeMigration).toBe(seeded);
            expect(network.spies.recoverEncKey).toHaveBeenCalledTimes(1);
            expect(network.spies.createLocalKey).not.toHaveBeenCalled();
            expect(network.spies.persistLocalKey).not.toHaveBeenCalled();
            expect(network.spies.fetchAuthPubKey).not.toHaveBeenCalled();
            expect(network.spies.acquireMetadataLock).not.toHaveBeenCalled();
            expect(network.spies.addSecretDataItem).not.toHaveBeenCalled();
            expect(trackEvent).not.toHaveBeenCalled();
            expect(controller.state.envelope).toBeUndefined();
          });
        },
      );

      it('resumes ENVELOPES_SEALED without a recovery session and writes the checkpointed envelopes', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient, trackEvent } = args;
          const network = mockNetwork(toprfClient);
          const sealed = await sealedCheckpoint();
          await seedCheckpoint(controller, sealed);
          const checkpoints = watchCheckpoints(args.baseMessenger);

          await migrateToEnvelope(args);

          expect(
            await readTimeline(network, checkpoints, trackEvent),
          ).toStrictEqual(WRITE_STEPS);
          expect(await readCheckpoints(checkpoints)).toStrictEqual([
            {
              v: 1,
              phase: 'ENVELOPES_WRITTEN',
              id: MIGRATION_ID,
              vaultAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
            },
            undefined,
          ]);
          expect(await storedRecoveryEnvelopeCts(network)).toStrictEqual([
            sealed.recoveryEnvelope.envelope.ct,
          ]);
          expect(await fetchControlRecords(network)).toStrictEqual([
            sealed.control,
          ]);
          expect(controller.state.envelope).toStrictEqual(
            expectedEnvelopeState(),
          );
        });
      });

      it('keeps the ENVELOPES_SEALED checkpoint when the password check under the metadata lock fails', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient } = args;
          const network = mockNetwork(toprfClient);
          const sealed = await sealedCheckpoint();
          await seedCheckpoint(controller, sealed);
          failOnce(network.spies.fetchAuthPubKey);

          await expect(migrateToEnvelope(args)).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.FailedToFetchAuthPubKey,
          );

          expect(
            await readCheckpoint(controller.state.pendingEnvelopeMigration),
          ).toStrictEqual(sealed);
          expect(network.spies.releaseMetadataLock).toHaveBeenCalledTimes(1);
          expect(network.spies.addSecretDataItem).not.toHaveBeenCalled();

          await migrateToEnvelope(args);

          expect(network.spies.recoverEncKey).not.toHaveBeenCalled();
          expect(await storedRecoveryEnvelopeCts(network)).toStrictEqual([
            sealed.recoveryEnvelope.envelope.ct,
          ]);
          expect(controller.state.envelope).toStrictEqual(
            expectedEnvelopeState(),
          );
        });
      });

      it('rolls a resumed ENVELOPES_SEALED checkpoint back to RS_TOPRF_REGISTERED when the password changed', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient, trackEvent } = args;
          const network = mockNetwork(toprfClient, {
            globalPassword: NEW_PASSWORD,
          });
          const sealed = await sealedCheckpoint();
          await seedCheckpoint(controller, sealed);

          await expect(migrateToEnvelope(args)).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.OutdatedPassword,
          );

          expect(
            await readCheckpoint(controller.state.pendingEnvelopeMigration),
          ).toStrictEqual(
            registeredCheckpoint({
              id: sealed.id,
              recoverySecret: sealed.recoverySecret,
              rsAuthPubKey: sealed.rsAuthPubKey,
            }),
          );
          expect(network.spies.releaseMetadataLock).toHaveBeenCalledTimes(1);
          expect(network.spies.addSecretDataItem).not.toHaveBeenCalled();
          expect(trackEvent).not.toHaveBeenCalled();
          expect(controller.state.envelope).toBeUndefined();
        });
      });

      it('completes an ENVELOPES_WRITTEN checkpoint after checking the live password key, without writes', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient, trackEvent } = args;
          const network = mockNetwork(toprfClient);
          await seedCheckpoint(controller, {
            v: 1,
            phase: 'ENVELOPES_WRITTEN',
            id: MIGRATION_ID,
            vaultAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
          });
          const checkpoints = watchCheckpoints(args.baseMessenger);

          await migrateToEnvelope(args);

          expect(
            await readTimeline(network, checkpoints, trackEvent),
          ).toStrictEqual([
            'fetchAuthPubKey',
            'fetchAllSecretDataItems:vault',
            'checkpoint:cleared',
            'trackEvent:COMPLETED',
          ]);
          expect(controller.state.envelope).toStrictEqual(
            expectedEnvelopeState(),
          );
          expect(controller.state.pendingEnvelopeMigration).toBeUndefined();
        });
      });

      it('completes an ENVELOPES_WRITTEN checkpoint with the live password key after a password change', async () => {
        const store = await createMigratedAccount();

        await withUnlockedController(async (args) => {
          const { controller, toprfClient } = args;
          mockNetwork(toprfClient, { store, globalPassword: NEW_PASSWORD });
          await seedCheckpoint(controller, {
            v: 1,
            phase: 'ENVELOPES_WRITTEN',
            id: MIGRATION_ID,
            vaultAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
          });

          await migrateToEnvelope(args);

          expect(controller.state.envelope).toStrictEqual({
            v: 1,
            vaultAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
            passwordAuthPubKey: authPubKeyOf(NEW_PASSWORD),
          });
          expect(controller.state.pendingEnvelopeMigration).toBeUndefined();
        });
      });

      it('keeps an ENVELOPES_WRITTEN checkpoint and throws OutdatedPassword when no control record matches the live password key', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient } = args;
          const network = mockNetwork(toprfClient);
          await network.envelopeStore.writeControlRecord(
            vaultKeySetFor(),
            controlRecordFor('other-password'),
          );
          const seeded = await seedCheckpoint(controller, {
            v: 1,
            phase: 'ENVELOPES_WRITTEN',
            id: MIGRATION_ID,
            vaultAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
          });

          await expect(migrateToEnvelope(args)).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.OutdatedPassword,
          );

          expect(controller.state.pendingEnvelopeMigration).toBe(seeded);
          expect(controller.state.envelope).toBeUndefined();
        });
      });

      it('resumes a pending checkpoint when the envelope state is already set', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient } = args;
          mockNetwork(toprfClient);
          updateState(controller, (state) => {
            state.envelope = {
              v: 1,
              vaultAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
              passwordAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
            };
          });
          await seedCheckpoint(controller, {
            v: 1,
            phase: 'ENVELOPES_WRITTEN',
            id: MIGRATION_ID,
            vaultAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
          });

          await migrateToEnvelope(args);

          expect(controller.state.envelope).toStrictEqual(
            expectedEnvelopeState(),
          );
          expect(controller.state.pendingEnvelopeMigration).toBeUndefined();
        });
      });

      it('does nothing when the envelope state is set and the checkpoint is not usable', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient, trackEvent } = args;
          const network = mockNetwork(toprfClient);
          const envelope: SeedlessOnboardingControllerState['envelope'] = {
            v: 1,
            vaultAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
            passwordAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
          };
          updateState(controller, (state) => {
            state.envelope = envelope;
          });
          await seedCheckpoint(controller, 'not-a-checkpoint');

          await migrateToEnvelope(args);

          for (const spy of Object.values(network.spies)) {
            expect(spy).not.toHaveBeenCalled();
          }
          expect(trackEvent).not.toHaveBeenCalled();
          expect(controller.state.envelope).toStrictEqual(envelope);
        });
      });

      it('writes only the Recovery Secret envelope when another device migrated the vault first', async () => {
        const store: MetadataStore = new Map();
        await withUnlockedController(async (args) => {
          await migrate(args, mockNetwork(args.toprfClient, { store }));
        });

        await withUnlockedController(async (args) => {
          const { controller, toprfClient, trackEvent } = args;
          const network = mockNetwork(toprfClient, {
            store,
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          await authenticateAal2(args, { hasRecoveryShare: true });
          const checkpoints = watchCheckpoints(args.baseMessenger);
          expect(controller.state.envelope).toBeUndefined();

          await migrateToEnvelope(args);

          expect(
            await readTimeline(network, checkpoints, trackEvent),
          ).toStrictEqual([
            'recoverEncKey',
            'checkpoint:RS_TOPRF_REGISTERED',
            'trackEvent:RS_TOPRF_REGISTERED',
            'fetchAuthPubKey',
            'fetchAllSecretDataItems:vault',
            'checkpoint:ENVELOPES_SEALED',
            'trackEvent:ENVELOPES_SEALED',
            'acquireMetadataLock',
            'fetchAuthPubKey',
            'fetchAllSecretDataItems:vault',
            'addSecretDataItem:rbek',
            'fetchAllSecretDataItems:rbek',
            'releaseMetadataLock',
            'checkpoint:ENVELOPES_WRITTEN',
            'trackEvent:ENVELOPES_WRITTEN',
            'checkpoint:cleared',
            'trackEvent:COMPLETED',
          ]);
          expect(await fetchControlRecords(network)).toHaveLength(1);
          expect(await storedRecoveryEnvelopeCts(network)).toHaveLength(2);
          expect(
            await openStoredEnvelope(
              network,
              RECOVERY_SECRET_HEX,
              'recovery-secret',
            ),
          ).toStrictEqual(vaultKeySetFor());
          expect(controller.state.envelope).toStrictEqual(
            expectedEnvelopeState(),
          );
          expect(controller.state.pendingEnvelopeMigration).toBeUndefined();
        });
      });

      it('writes no control record while the Recovery Secret envelope is missing, so another device can complete the migration', async () => {
        const store: MetadataStore = new Map();
        await withUnlockedController(async (args) => {
          const { controller, toprfClient } = args;
          const network = mockNetwork(toprfClient, { store });
          await authenticateAal2(args, { hasRecoveryShare: false });
          failOnce(
            network.spies.addSecretDataItem,
            ({ dataType }) => dataType === EncAccountDataType.KeyEnvelope,
          );

          await expect(migrateToEnvelope(args)).rejects.toThrow('network');

          expect(await fetchControlRecords(network)).toStrictEqual([]);
          expect(
            (await readCheckpoint(controller.state.pendingEnvelopeMigration))
              ?.phase,
          ).toBe('ENVELOPES_SEALED');
        });
        storeSeedPhrase(store, vaultKeySetFor());

        await withNewDeviceController(async (args) => {
          const { controller, toprfClient } = args;
          const network = mockNetwork(toprfClient, {
            store,
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          await controller.restoreVaultWithPassword({
            password: MOCK_PASSWORD,
          });
          expect(controller.state.envelope).toBeUndefined();
          controller.setMigrationVersion(SeedlessOnboardingMigrationVersion.V1);
          await authenticateAal2(args, { hasRecoveryShare: true });

          await migrateToEnvelope(args);

          expect(
            await openStoredEnvelope(
              network,
              RECOVERY_SECRET_HEX,
              'recovery-secret',
            ),
          ).toStrictEqual(vaultKeySetFor());
          expect(controller.state.envelope).toStrictEqual(
            expectedEnvelopeState(),
          );
        });
      });

      it.each([
        [
          'RS_TOPRF_REGISTERED',
          async (): Promise<PendingEnvelopeMigration> => registeredCheckpoint(),
        ],
        ['ENVELOPES_SEALED', sealedCheckpoint],
      ] as const)(
        'completes an %s checkpoint without writing a control record when another device migrated the vault and changed the password',
        async (_phase, createCheckpoint) => {
          const store = await createMigratedAccount();

          await withUnlockedController(async (args) => {
            const { controller, toprfClient } = args;
            const network = mockNetwork(toprfClient, {
              store,
              globalPassword: NEW_PASSWORD,
              recoverySecret: RECOVERY_SECRET_HEX,
            });
            await authenticateAal2(args, { hasRecoveryShare: true });
            await seedCheckpoint(controller, await createCheckpoint());

            await migrateToEnvelope(args);

            expect(
              writtenItems(network, EncAccountDataType.EnvelopeControl),
            ).toStrictEqual([]);
            expect(
              (await fetchControlRecords(network)).map(({ seq }) => seq),
            ).toStrictEqual([1, 2]);
            expect(
              await openStoredEnvelope(
                network,
                RECOVERY_SECRET_HEX,
                'recovery-secret',
              ),
            ).toStrictEqual(vaultKeySetFor());
            expect(controller.state.pendingEnvelopeMigration).toBeUndefined();
            expect(controller.state.envelope).toStrictEqual({
              v: 1,
              vaultAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
              passwordAuthPubKey: authPubKeyOf(NEW_PASSWORD),
            });
          });
        },
      );

      it('throws OutdatedPassword before sealing when no stored control record matches the live password key', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient } = args;
          const network = mockNetwork(toprfClient);
          await network.envelopeStore.writeControlRecord(
            vaultKeySetFor(),
            controlRecordFor('other-password'),
          );
          network.spies.addSecretDataItem.mockClear();
          await authenticateAal2(args, { hasRecoveryShare: false });

          await expect(migrateToEnvelope(args)).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.OutdatedPassword,
          );

          expect(network.spies.addSecretDataItem).not.toHaveBeenCalled();
          expect(network.spies.acquireMetadataLock).not.toHaveBeenCalled();
          expect(
            (await readCheckpoint(controller.state.pendingEnvelopeMigration))
              ?.phase,
          ).toBe('RS_TOPRF_REGISTERED');
          expect(controller.state.envelope).toBeUndefined();
        });
      });

      it('rolls back to RS_TOPRF_REGISTERED when no stored control record matches the live password key under the metadata lock', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient } = args;
          const network = mockNetwork(toprfClient);
          await seedCheckpoint(controller, await sealedCheckpoint());
          await network.envelopeStore.writeControlRecord(
            vaultKeySetFor(),
            controlRecordFor('other-password'),
          );
          network.spies.addSecretDataItem.mockClear();

          await expect(migrateToEnvelope(args)).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.OutdatedPassword,
          );

          expect(network.spies.addSecretDataItem).not.toHaveBeenCalled();
          expect(network.spies.releaseMetadataLock).toHaveBeenCalledWith(
            vaultKeySetFor().authKeyPair,
            LOCK_ID,
          );
          expect(
            await readCheckpoint(controller.state.pendingEnvelopeMigration),
          ).toStrictEqual(registeredCheckpoint());
          expect(controller.state.envelope).toBeUndefined();
        });
      });

      it('throws EnvelopeControlRecordNotFound when the control record does not read back, after writing the Recovery Secret envelope', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient } = args;
          const network = mockNetwork(toprfClient, {
            droppedDataTypes: [EncAccountDataType.EnvelopeControl],
          });
          await authenticateAal2(args, { hasRecoveryShare: false });

          await expect(migrateToEnvelope(args)).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.EnvelopeControlRecordNotFound,
          );

          expect(
            writtenItems(network, EncAccountDataType.KeyEnvelope),
          ).toHaveLength(1);
          expect(await fetchControlRecords(network)).toStrictEqual([]);
          expect(network.spies.releaseMetadataLock).toHaveBeenCalledTimes(1);
          expect(
            (await readCheckpoint(controller.state.pendingEnvelopeMigration))
              ?.phase,
          ).toBe('ENVELOPES_SEALED');
          expect(controller.state.envelope).toBeUndefined();
        });
      });

      it('throws InvalidEnvelope when the Recovery Secret envelope does not read back', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient } = args;
          mockNetwork(toprfClient, {
            droppedDataTypes: [EncAccountDataType.KeyEnvelope],
          });
          await authenticateAal2(args, { hasRecoveryShare: false });

          await expect(migrateToEnvelope(args)).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.InvalidEnvelope,
          );
          expect(
            (await readCheckpoint(controller.state.pendingEnvelopeMigration))
              ?.phase,
          ).toBe('ENVELOPES_SEALED');
          expect(controller.state.envelope).toBeUndefined();
        });
      });

      it('throws InvalidEnvelope when the stored envelope seals other vault keys', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient } = args;
          const network = mockNetwork(toprfClient);
          tamperRecoveryEnvelopeWrites(network);
          await authenticateAal2(args, { hasRecoveryShare: false });

          await expect(migrateToEnvelope(args)).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.InvalidEnvelope,
          );
          expect(controller.state.envelope).toBeUndefined();
        });
      });

      it('discards a checkpoint of another Recovery Secret and starts over', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient, trackEvent } = args;
          const network = mockNetwork(toprfClient);
          failOnce(network.spies.acquireMetadataLock);
          await authenticateAal2(args, { hasRecoveryShare: false });
          await expect(
            migrateToEnvelope(args, OTHER_RECOVERY_SECRET),
          ).rejects.toThrow('network');
          const stale = await readCheckpoint(
            controller.state.pendingEnvelopeMigration,
          );
          expect(stale).toMatchObject({
            phase: 'ENVELOPES_SEALED',
            recoverySecret: OTHER_RECOVERY_SECRET_HEX,
          });
          network.registerRecoverySecret(RECOVERY_SECRET_HEX);
          trackEvent.mockClear();
          const checkpoints = watchCheckpoints(args.baseMessenger);

          await migrateToEnvelope(args);

          const [registered] = await readCheckpoints(checkpoints);
          expect(registered).toStrictEqual(
            registeredCheckpoint({ id: expect.any(String) }),
          );
          expect(registered?.id).not.toBe(stale?.id);
          expect(network.spies.recoverEncKey).toHaveBeenCalledWith(
            expect.objectContaining({
              authConnectionId: AAL2_AUTH_CONNECTION_ID,
              password: RECOVERY_SECRET_HEX,
            }),
          );
          expect(trackEvent.mock.calls).toStrictEqual([
            [checkpointEvent('RS_TOPRF_REGISTERED', false)],
            [checkpointEvent('ENVELOPES_SEALED', false)],
            [checkpointEvent('ENVELOPES_WRITTEN', false)],
            [checkpointEvent('COMPLETED', false)],
          ]);
          expect(
            await openStoredEnvelope(
              network,
              RECOVERY_SECRET_HEX,
              'recovery-secret',
            ),
          ).toStrictEqual(vaultKeySetFor());
          expect(
            await openStoredEnvelope(
              network,
              OTHER_RECOVERY_SECRET_HEX,
              'recovery-secret',
            ),
          ).toBeUndefined();
          expect(controller.state.envelope).toStrictEqual(
            expectedEnvelopeState(),
          );
        });
      });

      it.each([
        [
          'a checkpoint of an unknown version',
          async (): Promise<string> => {
            const { iv, ciphertext } = await encrypt(
              vaultKeySetFor().localWrapKey as Uint8Array<ArrayBuffer>,
              stringToBytes(
                JSON.stringify({
                  v: 2,
                  recoverySecret: RECOVERY_SECRET_HEX,
                  passwordAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
                }),
              ),
              { additionalData: stringToBytes(PENDING_MIGRATION_AAD) },
            );
            return bytesToBase64(concatBytes([iv, ciphertext]));
          },
        ],
        [
          'a checkpoint that does not decrypt',
          async (): Promise<string> => 'not-a-checkpoint',
        ],
        [
          'a checkpoint of another vault',
          async (): Promise<string> =>
            encryptPendingMigration(
              registeredCheckpoint(),
              vaultKeySetFor('other-password').localWrapKey,
            ),
        ],
      ])('ignores %s and starts over', async (_name, createCheckpoint) => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient, trackEvent } = args;
          const network = mockNetwork(toprfClient);
          await authenticateAal2(args, { hasRecoveryShare: false });
          await seedCheckpoint(controller, await createCheckpoint());
          const checkpoints = watchCheckpoints(args.baseMessenger);

          await migrateToEnvelope(args);

          expect(network.spies.createLocalKey).toHaveBeenCalledTimes(1);
          expect(network.spies.persistLocalKey).toHaveBeenCalledTimes(1);
          expect((await readCheckpoints(checkpoints))[0]).toStrictEqual(
            registeredCheckpoint({ id: expect.any(String) }),
          );
          expect(
            trackEvent.mock.calls.map(([{ properties }]) => properties.resumed),
          ).toStrictEqual([false, false, false, false]);
          expect(controller.state.envelope).toStrictEqual(
            expectedEnvelopeState(),
          );
          expect(controller.state.pendingEnvelopeMigration).toBeUndefined();
        });
      });

      it('does nothing when the vault is already envelope-managed', async () => {
        await withUnlockedController(async (args) => {
          const network = mockNetwork(args.toprfClient);
          await migrate(args, network);

          await migrateToEnvelope(args);

          for (const spy of Object.values(network.spies)) {
            expect(spy).not.toHaveBeenCalled();
          }
          expect(args.trackEvent).not.toHaveBeenCalled();
        });
      });

      it('reports each checkpoint and the completion', async () => {
        await withUnlockedController(async (args) => {
          const { toprfClient, trackEvent } = args;
          mockNetwork(toprfClient);
          await authenticateAal2(args, { hasRecoveryShare: false });

          await migrateToEnvelope(args);

          expect(trackEvent.mock.calls).toStrictEqual([
            [checkpointEvent('RS_TOPRF_REGISTERED', false)],
            [checkpointEvent('ENVELOPES_SEALED', false)],
            [checkpointEvent('ENVELOPES_WRITTEN', false)],
            [checkpointEvent('COMPLETED', false)],
          ]);
        });
      });

      it('reports the phases of a resumed migration as resumed', async () => {
        await withUnlockedController(async (args) => {
          const { toprfClient, trackEvent } = args;
          const network = mockNetwork(toprfClient);
          failOnce(network.spies.acquireMetadataLock);
          await authenticateAal2(args, { hasRecoveryShare: false });

          await expect(migrateToEnvelope(args)).rejects.toThrow('network');
          expect(trackEvent.mock.calls).toStrictEqual([
            [checkpointEvent('RS_TOPRF_REGISTERED', false)],
            [checkpointEvent('ENVELOPES_SEALED', false)],
          ]);
          trackEvent.mockClear();

          await migrateToEnvelope(args);

          expect(trackEvent.mock.calls).toStrictEqual([
            [checkpointEvent('ENVELOPES_WRITTEN', true)],
            [checkpointEvent('COMPLETED', true)],
          ]);
        });
      });

      it('completes when reporting a checkpoint fails', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient, trackEvent } = args;
          mockNetwork(toprfClient);
          trackEvent.mockRejectedValue(new Error('analytics'));
          await authenticateAal2(args, { hasRecoveryShare: false });

          await migrateToEnvelope(args);

          expect(trackEvent).toHaveBeenCalledTimes(4);
          expect(controller.state.envelope).toStrictEqual(
            expectedEnvelopeState(),
          );
          expect(controller.state.pendingEnvelopeMigration).toBeUndefined();
        });
      });

      it('completes when the analytics handler throws', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient, trackEvent } = args;
          mockNetwork(toprfClient);
          trackEvent.mockImplementation(() => {
            throw new Error('analytics');
          });
          await authenticateAal2(args, { hasRecoveryShare: false });

          await migrateToEnvelope(args);

          expect(trackEvent).toHaveBeenCalledTimes(4);
          expect(controller.state.envelope).toStrictEqual(
            expectedEnvelopeState(),
          );
          expect(controller.state.pendingEnvelopeMigration).toBeUndefined();
        });
      });

      it('leaves the password path on the vault keys until the first password change', async () => {
        await withUnlockedController(async (args) => {
          const network = mockNetwork(args.toprfClient);
          await migrate(args, network);
          expect(
            await openStoredEnvelope(network, MOCK_PASSWORD, 'password'),
          ).toBeUndefined();

          await args.baseMessenger.call(
            'SeedlessOnboardingController:changePassword',
            NEW_PASSWORD,
            MOCK_PASSWORD,
          );

          expect(
            await openStoredEnvelope(network, NEW_PASSWORD, 'password'),
          ).toStrictEqual(vaultKeySetFor());
        });
      });

      it('throws EnvelopeMigrationRequiresDataTypes before the data type migration', async () => {
        await withUnlockedController(async (args) => {
          const network = mockNetwork(args.toprfClient);
          await authenticateAal2(args, { hasRecoveryShare: false });
          args.controller.setMigrationVersion(
            0 as SeedlessOnboardingMigrationVersion,
          );

          await expect(migrateToEnvelope(args)).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.EnvelopeMigrationRequiresDataTypes,
          );
          expect(network.spies.createLocalKey).not.toHaveBeenCalled();
        });
      });

      it('throws ControllerLocked when locked', async () => {
        await withUnlockedController(async (args) => {
          await args.baseMessenger.call(
            'SeedlessOnboardingController:setLocked',
          );

          await expect(migrateToEnvelope(args)).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.ControllerLocked,
          );
        });
      });

      it('persists the envelope state and checkpoint, but keeps the checkpoint out of logs', async () => {
        await withController(
          {
            state: {
              envelope: {
                v: 1,
                vaultAuthPubKey: 'vault',
                passwordAuthPubKey: 'password',
              },
              pendingEnvelopeMigration: 'encrypted',
            },
          },
          ({ controller }) => {
            const derive = (
              property:
                | 'persist'
                | 'includeInStateLogs'
                | 'includeInDebugSnapshot'
                | 'usedInUi',
            ): Record<string, unknown> =>
              deriveStateFromMetadata(
                controller.state,
                controller.metadata,
                property,
              );

            expect(derive('persist')).toMatchObject({
              envelope: controller.state.envelope,
              pendingEnvelopeMigration: 'encrypted',
            });
            expect(derive('includeInStateLogs')).toHaveProperty('envelope');
            expect(derive('includeInStateLogs')).not.toHaveProperty(
              'pendingEnvelopeMigration',
            );
            expect(derive('includeInDebugSnapshot')).not.toHaveProperty(
              'envelope',
            );
            expect(derive('usedInUi')).not.toHaveProperty('envelope');
          },
        );
      });
    });

    describe('changePassword on an envelope-managed vault', () => {
      it('seals the vault keys for the new password and swaps the password OPRF key', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient, baseMessenger } = args;
          const network = mockNetwork(toprfClient);
          await migrate(args, network);
          const changeEncKeySpy = vi.spyOn(toprfClient, 'changeEncKey');
          const vaultKeySet = vaultKeySetFor();

          await baseMessenger.call(
            'SeedlessOnboardingController:changePassword',
            NEW_PASSWORD,
            MOCK_PASSWORD,
          );

          expect(changeEncKeySpy).not.toHaveBeenCalled();
          expect(network.spies.persistLocalKey).toHaveBeenCalledWith(
            expect.objectContaining({
              authConnectionId: controller.state.authConnectionId,
              oprfKey: 5n,
              authPubKey: keysFor(NEW_PASSWORD).authKeyPair.pk,
              keyShareIndex: 1,
              oldAuthKeyPair: {
                sk: vaultKeySet.authKeyPair.sk,
                pk: expect.any(Uint8Array),
              },
            }),
          );
          expect(
            await openStoredEnvelope(network, NEW_PASSWORD, 'password'),
          ).toStrictEqual(vaultKeySet);
          expect(
            (await fetchControlRecords(network)).map(
              ({ seq, passwordNamespace }) => ({
                seq,
                keyIndex: passwordNamespace.keyIndex,
              }),
            ),
          ).toStrictEqual([
            { seq: 1, keyIndex: 1 },
            { seq: 2, keyIndex: 2 },
          ]);
          expect(controller.state.envelope).toStrictEqual({
            v: 1,
            vaultAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
            passwordAuthPubKey: authPubKeyOf(NEW_PASSWORD),
          });
          expect(controller.state.authPubKey).toBe(authPubKeyOf(MOCK_PASSWORD));
          expect(
            await controller.checkIsPasswordOutdated({ skipCache: true }),
          ).toBe(false);
          expect(
            await controller.verifyVaultPassword(NEW_PASSWORD),
          ).toBeUndefined();
        });
      });

      it('writes the envelope and control record, then swaps the key, under the vault metadata lock', async () => {
        await withUnlockedController(async (args) => {
          const { toprfClient, baseMessenger } = args;
          const network = mockNetwork(toprfClient);
          await migrate(args, network);
          const order: string[] = [];
          network.spies.acquireMetadataLock.mockImplementationOnce(async () => {
            order.push('lock');
            return LOCK_ID;
          });
          const addSecretDataItem =
            network.spies.addSecretDataItem.getMockImplementation();
          network.spies.addSecretDataItem.mockImplementation(async (params) => {
            order.push(`write:${params.dataType}`);
            return addSecretDataItem?.(params);
          });
          const persistLocalKey =
            network.spies.persistLocalKey.getMockImplementation();
          network.spies.persistLocalKey.mockImplementation(async (params) => {
            order.push('persist');
            return persistLocalKey?.(params);
          });
          network.spies.releaseMetadataLock.mockImplementationOnce(async () => {
            order.push('release');
          });

          await baseMessenger.call(
            'SeedlessOnboardingController:changePassword',
            NEW_PASSWORD,
            MOCK_PASSWORD,
          );

          expect(order).toStrictEqual([
            'lock',
            `write:${EncAccountDataType.KeyEnvelope}`,
            `write:${EncAccountDataType.EnvelopeControl}`,
            'persist',
            'release',
          ]);
          expect(network.spies.acquireMetadataLock).toHaveBeenCalledWith(
            vaultKeySetFor().authKeyPair,
          );
        });
      });

      it('chains password changes through the control record', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient, baseMessenger } = args;
          const network = mockNetwork(toprfClient);
          await migrate(args, network);
          await baseMessenger.call(
            'SeedlessOnboardingController:changePassword',
            NEW_PASSWORD,
            MOCK_PASSWORD,
          );
          network.spies.persistLocalKey.mockClear();

          await baseMessenger.call(
            'SeedlessOnboardingController:changePassword',
            'newer-password',
            NEW_PASSWORD,
          );

          expect(network.spies.persistLocalKey).toHaveBeenCalledWith(
            expect.objectContaining({
              keyShareIndex: 2,
              oldAuthKeyPair: {
                sk: keysFor(NEW_PASSWORD).authKeyPair.sk,
                pk: expect.any(Uint8Array),
              },
            }),
          );
          expect(
            await openStoredEnvelope(network, 'newer-password', 'password'),
          ).toStrictEqual(vaultKeySetFor());
          expect(
            (await fetchControlRecords(network)).map(({ seq }) => seq),
          ).toStrictEqual([1, 2, 3]);
          expect(controller.state.envelope?.passwordAuthPubKey).toBe(
            authPubKeyOf('newer-password'),
          );
        });
      });

      it('does not swap the key when the password changes under the lock', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient, baseMessenger } = args;
          const network = mockNetwork(toprfClient);
          await migrate(args, network);
          network.spies.acquireMetadataLock.mockImplementationOnce(async () => {
            network.setGlobalPassword('other-password');
            return LOCK_ID;
          });

          await expect(
            baseMessenger.call(
              'SeedlessOnboardingController:changePassword',
              NEW_PASSWORD,
              MOCK_PASSWORD,
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.FailedToChangePassword,
          );

          expect(network.spies.persistLocalKey).not.toHaveBeenCalled();
          expect(network.spies.addSecretDataItem).not.toHaveBeenCalled();
          expect(network.spies.releaseMetadataLock).toHaveBeenCalled();
          expect(controller.state.envelope?.passwordAuthPubKey).toBe(
            authPubKeyOf(MOCK_PASSWORD),
          );
        });
      });

      it('keeps the vault under the old password when swapping the key fails', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient, baseMessenger } = args;
          const network = mockNetwork(toprfClient);
          await migrate(args, network);
          network.spies.persistLocalKey.mockRejectedValueOnce(
            new Error('persist'),
          );

          await expect(
            baseMessenger.call(
              'SeedlessOnboardingController:changePassword',
              NEW_PASSWORD,
              MOCK_PASSWORD,
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.FailedToChangePassword,
          );

          expect(
            await controller.verifyVaultPassword(MOCK_PASSWORD),
          ).toBeUndefined();
          expect(controller.state.envelope?.passwordAuthPubKey).toBe(
            authPubKeyOf(MOCK_PASSWORD),
          );
        });
      });

      it('throws when the vault is envelope-managed but its control record is missing', async () => {
        await withUnlockedController(async (args) => {
          const { toprfClient, baseMessenger } = args;
          const network = mockNetwork(toprfClient);
          await migrate(args, network);
          deleteControlRecords(network.store);

          await expect(
            baseMessenger.call(
              'SeedlessOnboardingController:changePassword',
              NEW_PASSWORD,
              MOCK_PASSWORD,
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.FailedToChangePassword,
          );
          expect(network.spies.persistLocalKey).not.toHaveBeenCalled();
        });
      });

      it('throws when no control record matches the password OPRF key', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient, baseMessenger } = args;
          const network = mockNetwork(toprfClient);
          await migrate(args, network);
          // the nodes report a key no control record knows of
          network.spies.fetchAuthPubKey.mockResolvedValue({
            authPubKey: keysFor('unknown').authKeyPair.pk,
            keyIndex: 1,
          });
          vi.spyOn(controller, 'checkIsPasswordOutdated').mockResolvedValue(
            false,
          );

          await expect(
            baseMessenger.call(
              'SeedlessOnboardingController:changePassword',
              NEW_PASSWORD,
              MOCK_PASSWORD,
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.FailedToChangePassword,
          );
          expect(network.spies.persistLocalKey).not.toHaveBeenCalled();
        });
      });

      it('adopts a vault another device migrated', async () => {
        const store: MetadataStore = new Map();
        await withUnlockedController(async (args) => {
          await migrate(args, mockNetwork(args.toprfClient, { store }));
        });

        await withUnlockedController(
          async ({ controller, toprfClient, baseMessenger }) => {
            const network = mockNetwork(toprfClient, { store });
            const changeEncKeySpy = vi.spyOn(toprfClient, 'changeEncKey');
            expect(controller.state.envelope).toBeUndefined();

            await baseMessenger.call(
              'SeedlessOnboardingController:changePassword',
              NEW_PASSWORD,
              MOCK_PASSWORD,
            );

            expect(changeEncKeySpy).not.toHaveBeenCalled();
            expect(
              await openStoredEnvelope(network, NEW_PASSWORD, 'password'),
            ).toStrictEqual(vaultKeySetFor());
            expect(controller.state.envelope).toStrictEqual({
              v: 1,
              vaultAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
              passwordAuthPubKey: authPubKeyOf(NEW_PASSWORD),
            });
          },
        );
      });
    });

    describe('syncLatestGlobalPassword on an envelope-managed vault', () => {
      it('keeps the vault keys and re-encrypts the vault under the global password', async () => {
        const store: MetadataStore = new Map();
        await withUnlockedController(async (args) => {
          await migrate(args, mockNetwork(args.toprfClient, { store }));
          await args.baseMessenger.call(
            'SeedlessOnboardingController:changePassword',
            NEW_PASSWORD,
            MOCK_PASSWORD,
          );
        });

        await withUnlockedController(async ({ controller, toprfClient }) => {
          mockNetwork(toprfClient, { store, globalPassword: NEW_PASSWORD });
          const { authPubKey } = controller.state;

          await controller.syncLatestGlobalPassword({
            globalPassword: NEW_PASSWORD,
          });

          expect(controller.state.authPubKey).toBe(authPubKey);
          expect(controller.state.envelope).toStrictEqual({
            v: 1,
            vaultAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
            passwordAuthPubKey: authPubKeyOf(NEW_PASSWORD),
          });
          expect(
            await controller.verifyVaultPassword(NEW_PASSWORD),
          ).toBeUndefined();
          expect(
            await controller.checkIsPasswordOutdated({ skipCache: true }),
          ).toBe(false);
        });
      });

      it('marks the vault envelope-managed when the password still derives the vault keys', async () => {
        const store: MetadataStore = new Map();
        await withUnlockedController(async (args) => {
          await migrate(args, mockNetwork(args.toprfClient, { store }));
        });
        storeSeedPhrase(store, vaultKeySetFor());

        await withUnlockedController(async ({ controller, toprfClient }) => {
          mockNetwork(toprfClient, { store });
          expect(controller.state.envelope).toBeUndefined();

          await controller.syncLatestGlobalPassword({
            globalPassword: MOCK_PASSWORD,
          });

          expect(controller.state.authPubKey).toBe(authPubKeyOf(MOCK_PASSWORD));
          expect(controller.state.envelope).toStrictEqual({
            v: 1,
            vaultAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
            passwordAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
          });
        });
      });

      it('keeps the envelope state of a migrated vault that has no password envelope yet', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient } = args;
          await migrate(args, mockNetwork(toprfClient));

          await controller.syncLatestGlobalPassword({
            globalPassword: MOCK_PASSWORD,
          });

          expect(controller.state.envelope).toStrictEqual({
            v: 1,
            vaultAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
            passwordAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
          });
          expect(
            await controller.verifyVaultPassword(MOCK_PASSWORD),
          ).toBeUndefined();
        });
      });

      it('throws PasswordEnvelopeNotFound without touching the vault when the global password has no envelope', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient } = args;
          const network = mockNetwork(toprfClient);
          await migrate(args, network);
          network.setGlobalPassword(NEW_PASSWORD);
          const { vault, envelope, authPubKey } = controller.state;

          await expect(
            controller.syncLatestGlobalPassword({
              globalPassword: NEW_PASSWORD,
            }),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.PasswordEnvelopeNotFound,
          );

          expect(controller.state.vault).toBe(vault);
          expect(controller.state.envelope).toStrictEqual(envelope);
          expect(controller.state.authPubKey).toBe(authPubKey);
          expect(network.spies.addSecretDataItem).not.toHaveBeenCalled();
        });
      });

      it('throws PasswordEnvelopeNotFound when the password envelope is missing from the store', async () => {
        const store = await createMigratedAccount();
        store.delete(
          bytesToHex(keysFor(NEW_PASSWORD).envelopeKeys.authKeyPair.pk),
        );

        await withUnlockedController(async ({ controller, toprfClient }) => {
          mockNetwork(toprfClient, { store, globalPassword: NEW_PASSWORD });
          const envelope = {
            v: 1 as const,
            vaultAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
            passwordAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
          };
          // @ts-expect-error Accessing protected method for testing
          controller.update((state) => {
            state.envelope = envelope;
          });
          const { vault } = controller.state;

          await expect(
            controller.syncLatestGlobalPassword({
              globalPassword: NEW_PASSWORD,
            }),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.PasswordEnvelopeNotFound,
          );

          expect(controller.state.vault).toBe(vault);
          expect(controller.state.envelope).toStrictEqual(envelope);
          expect(
            await controller.verifyVaultPassword(MOCK_PASSWORD),
          ).toBeUndefined();
        });
      });

      it('throws PasswordEnvelopeNotFound when the global password derives the keys of another envelope-managed vault', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient } = args;
          const network = mockNetwork(toprfClient);
          await migrate(args, network);
          await network.envelopeStore.writeControlRecord(
            vaultKeySetFor('other-password'),
            controlRecordFor('other-password'),
          );
          network.setGlobalPassword('other-password');
          const { vault, envelope } = controller.state;

          await expect(
            controller.syncLatestGlobalPassword({
              globalPassword: 'other-password',
            }),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.PasswordEnvelopeNotFound,
          );

          expect(controller.state.vault).toBe(vault);
          expect(controller.state.envelope).toStrictEqual(envelope);
        });
      });

      it('does not treat a failed envelope fetch as a legacy vault', async () => {
        await withUnlockedController(async ({ controller, toprfClient }) => {
          const network = mockNetwork(toprfClient, {
            globalPassword: NEW_PASSWORD,
          });
          network.spies.fetchAllSecretDataItems.mockRejectedValue(
            new Error('network'),
          );
          const { vault } = controller.state;

          await expect(
            controller.syncLatestGlobalPassword({
              globalPassword: NEW_PASSWORD,
            }),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.FailedToFetchSecretMetadata,
          );
          expect(controller.state.vault).toBe(vault);
        });
      });
    });

    describe('submitGlobalPassword on an envelope-managed vault', () => {
      it('unlocks with the vault keys sealed for the global password', async () => {
        const store: MetadataStore = new Map();
        await withUnlockedController(async (args) => {
          await migrate(args, mockNetwork(args.toprfClient, { store }));
          await args.baseMessenger.call(
            'SeedlessOnboardingController:changePassword',
            NEW_PASSWORD,
            MOCK_PASSWORD,
          );
        });

        await withUnlockedController(
          async ({ controller, toprfClient, baseMessenger }) => {
            mockNetwork(toprfClient, { store, globalPassword: NEW_PASSWORD });
            const recoverPwEncKeySpy = vi.spyOn(toprfClient, 'recoverPwEncKey');
            await baseMessenger.call('SeedlessOnboardingController:setLocked');

            await controller.submitGlobalPassword({
              globalPassword: NEW_PASSWORD,
            });

            expect(recoverPwEncKeySpy).not.toHaveBeenCalled();
            expect(controller.state.isSeedlessOnboardingUserAuthenticated).toBe(
              true,
            );
            expect(
              await controller.verifyVaultPassword(MOCK_PASSWORD),
            ).toBeUndefined();
          },
        );
      });

      it('walks the password key chain from the vault keys when the device lags behind', async () => {
        const store: MetadataStore = new Map();
        await withUnlockedController(async (args) => {
          await migrate(args, mockNetwork(args.toprfClient, { store }));
        });

        await withUnlockedController(
          async ({ controller, toprfClient, baseMessenger }) => {
            mockNetwork(toprfClient, { store });
            const recoverPwEncKeySpy = vi
              .spyOn(toprfClient, 'recoverPwEncKey')
              .mockResolvedValue({
                pwEncKey: keysFor('stale-password').pwEncKey,
              });
            await baseMessenger.call('SeedlessOnboardingController:setLocked');

            await controller.submitGlobalPassword({
              globalPassword: MOCK_PASSWORD,
            });

            const vaultKeySet = vaultKeySetFor();
            expect(recoverPwEncKeySpy).toHaveBeenCalledWith({
              targetAuthPubKey: base64ToBytes(authPubKeyOf('stale-password')),
              curPwEncKey: vaultKeySet.localWrapKey,
              curAuthKeyPair: vaultKeySet.authKeyPair,
              maxPwChainLength: 5,
            });
            expect(
              await controller.verifyVaultPassword('stale-password'),
            ).toBeUndefined();
          },
          { password: 'stale-password' },
        );
      });

      it('does not treat a failed envelope fetch as a legacy vault', async () => {
        await withUnlockedController(
          async ({ controller, toprfClient, baseMessenger }) => {
            const network = mockNetwork(toprfClient);
            network.spies.fetchAllSecretDataItems.mockRejectedValue(
              new Error('network'),
            );
            const recoverPwEncKeySpy = vi.spyOn(toprfClient, 'recoverPwEncKey');
            await baseMessenger.call('SeedlessOnboardingController:setLocked');

            await expect(
              controller.submitGlobalPassword({
                globalPassword: MOCK_PASSWORD,
              }),
            ).rejects.toThrow(
              SeedlessOnboardingControllerErrorMessage.CouldNotRecoverPassword,
            );
            expect(recoverPwEncKeySpy).not.toHaveBeenCalled();
          },
        );
      });
    });

    describe('restoreVaultWithPassword on a new device', () => {
      it('restores with the vault keys sealed for the password after an envelope password change', async () => {
        const store: MetadataStore = new Map();
        await withUnlockedController(async (args) => {
          await migrate(args, mockNetwork(args.toprfClient, { store }));
          await args.baseMessenger.call(
            'SeedlessOnboardingController:changePassword',
            NEW_PASSWORD,
            MOCK_PASSWORD,
          );
        });
        storeSeedPhrase(store, vaultKeySetFor());

        await withNewDeviceController(async ({ controller, toprfClient }) => {
          mockNetwork(toprfClient, { store, globalPassword: NEW_PASSWORD });

          const secrets = await controller.restoreVaultWithPassword({
            password: NEW_PASSWORD,
          });

          expect(secrets.map(({ data }) => data)).toStrictEqual([
            MOCK_SEED_PHRASE,
          ]);
          expect(controller.state.authPubKey).toBe(authPubKeyOf(MOCK_PASSWORD));
          expect(controller.state.envelope).toStrictEqual({
            v: 1,
            vaultAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
            passwordAuthPubKey: authPubKeyOf(NEW_PASSWORD),
          });
          expect(
            await controller.verifyVaultPassword(NEW_PASSWORD),
          ).toBeUndefined();
        });
      });

      it('clears a pending password reset when the vault is restored with the global password', async () => {
        const store = await createMigratedAccount();

        await withNewDeviceController(async (args) => {
          const { controller, toprfClient, baseMessenger } = args;
          mockNetwork(toprfClient, {
            store,
            globalPassword: NEW_PASSWORD,
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          await recover(args);
          expect(controller.state.isLocalPassword).toBe(true);

          await controller.restoreVaultWithPassword({ password: NEW_PASSWORD });

          expect(controller.state.isLocalPassword).toBeUndefined();
          await expect(
            baseMessenger.call(
              'SeedlessOnboardingController:resetPasswordWithVaultKeys',
              { newPassword: 'reset-password' },
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.PasswordResetRequiresRecovery,
          );
        });
      });

      it('clears a pending envelope migration checkpoint from the replaced vault', async () => {
        const store = await createMigratedAccount();

        await withController(
          {
            state: {
              ...getMockInitialControllerState({
                withMockAuthenticatedUser: true,
              }),
              pendingEnvelopeMigration: 'encrypted',
            },
          },
          async ({ controller, toprfClient }) => {
            mockNetwork(toprfClient, { store, globalPassword: NEW_PASSWORD });

            await controller.restoreVaultWithPassword({
              password: NEW_PASSWORD,
            });

            expect(controller.state.pendingEnvelopeMigration).toBeUndefined();
            expect(getEnvelopeStatus(controller.state).isMigrationPending).toBe(
              false,
            );
            expect(controller.state.envelope).toBeDefined();
          },
        );
      });

      it('keeps a checkpoint that still decrypts under the restored vault keys, so an interrupted migration can resume', async () => {
        await withUnlockedController(async (args) => {
          const { controller, baseMessenger } = args;
          const network = mockNetwork(args.toprfClient);
          await authenticateAal2(args, { hasRecoveryShare: false });
          vi.spyOn(
            EnvelopeStore.prototype,
            'writeEnvelope',
          ).mockRejectedValueOnce(new Error('interrupted'));
          await expect(
            baseMessenger.call(
              'SeedlessOnboardingController:migrateToEnvelope',
              { recoverySecret: RECOVERY_SECRET },
            ),
          ).rejects.toThrow('interrupted');
          storeSeedPhrase(network.store, vaultKeySetFor());

          await controller.restoreVaultWithPassword({
            password: MOCK_PASSWORD,
          });

          expect(getEnvelopeStatus(controller.state)).toStrictEqual({
            isEnvelopeManaged: false,
            isMigrationPending: true,
            isLocalPassword: false,
          });
          await baseMessenger.call(
            'SeedlessOnboardingController:migrateToEnvelope',
            { recoverySecret: RECOVERY_SECRET },
          );
          expect(
            await openStoredEnvelope(
              network,
              RECOVERY_SECRET_HEX,
              'recovery-secret',
            ),
          ).toStrictEqual(vaultKeySetFor());
          expect(controller.state.pendingEnvelopeMigration).toBeUndefined();
        });
      });

      it('clears a stale envelope when the restored vault is not envelope-managed', async () => {
        const store: MetadataStore = new Map();
        storeSeedPhrase(store, vaultKeySetFor());

        await withController(
          {
            state: {
              ...getMockInitialControllerState({
                withMockAuthenticatedUser: true,
              }),
              envelope: {
                v: 1,
                vaultAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
                passwordAuthPubKey: authPubKeyOf(NEW_PASSWORD),
              },
            },
          },
          async ({ controller, toprfClient }) => {
            mockNetwork(toprfClient, { store });

            await controller.restoreVaultWithPassword({
              password: MOCK_PASSWORD,
            });

            expect(controller.state.envelope).toBeUndefined();
          },
        );
      });

      it('restores a migrated vault with the password keys before any envelope password change', async () => {
        const store: MetadataStore = new Map();
        await withUnlockedController(async (args) => {
          await migrate(args, mockNetwork(args.toprfClient, { store }));
        });
        storeSeedPhrase(store, vaultKeySetFor());

        await withNewDeviceController(async ({ controller, toprfClient }) => {
          mockNetwork(toprfClient, { store });

          const secrets = await controller.restoreVaultWithPassword({
            password: MOCK_PASSWORD,
          });

          expect(secrets.map(({ data }) => data)).toStrictEqual([
            MOCK_SEED_PHRASE,
          ]);
          expect(controller.state.authPubKey).toBe(authPubKeyOf(MOCK_PASSWORD));
          expect(controller.state.envelope).toStrictEqual({
            v: 1,
            vaultAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
            passwordAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
          });
        });
      });

      it('restores with the password keys when the password has no envelope', async () => {
        const store: MetadataStore = new Map();
        storeSeedPhrase(store, vaultKeySetFor());

        await withNewDeviceController(async ({ controller, toprfClient }) => {
          mockNetwork(toprfClient, { store });

          const secrets = await controller.restoreVaultWithPassword({
            password: MOCK_PASSWORD,
          });

          expect(secrets.map(({ data }) => data)).toStrictEqual([
            MOCK_SEED_PHRASE,
          ]);
          expect(controller.state.authPubKey).toBe(authPubKeyOf(MOCK_PASSWORD));
          expect(controller.state.envelope).toBeUndefined();
        });
      });

      it('does not fall back to the password keys when the envelope fetch fails', async () => {
        const store: MetadataStore = new Map();
        storeSeedPhrase(store, vaultKeySetFor());

        await withNewDeviceController(async ({ controller, toprfClient }) => {
          const network = mockNetwork(toprfClient, { store });
          network.spies.fetchAllSecretDataItems.mockRejectedValueOnce(
            new Error('network'),
          );

          await expect(
            controller.restoreVaultWithPassword({ password: MOCK_PASSWORD }),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.FailedToFetchSecretMetadata,
          );
          expect(network.spies.fetchAllSecretDataItems).toHaveBeenCalledTimes(
            1,
          );
          expect(controller.state.vault).toBeUndefined();
        });
      });
    });

    describe('control records in the vault partition', () => {
      /**
       * @param network - The mock network.
       * @returns The calls that fetched the vault partition.
       */
      function vaultPartitionFetches(network: MockNetwork): unknown[] {
        const vaultPk = bytesToHex(vaultKeySetFor().authKeyPair.pk);
        return network.spies.fetchAllSecretDataItems.mock.calls.filter(
          ([{ authKeyPair }]) => bytesToHex(authKeyPair.pk) === vaultPk,
        );
      }

      it('fetchAllSecretData returns only the secrets of the vault partition', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient } = args;
          const network = mockNetwork(toprfClient);
          await migrate(args, network);
          storeSeedPhrase(network.store, vaultKeySetFor());
          expect(await fetchControlRecords(network)).toHaveLength(1);
          network.spies.fetchAllSecretDataItems.mockClear();

          const secrets = await controller.fetchAllSecretData();

          expect(secrets.map(({ data }) => data)).toStrictEqual([
            MOCK_SEED_PHRASE,
          ]);
          expect(vaultPartitionFetches(network)).toHaveLength(1);
        });
      });

      it('fetchAllSecretData does not write the vault or the envelope state of an envelope-managed vault', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient, encryptor } = args;
          const network = mockNetwork(toprfClient);
          await migrate(args, network);
          storeSeedPhrase(network.store, vaultKeySetFor());
          const vaultBefore = controller.state.vault;
          const envelopeBefore = controller.state.envelope;
          const encryptWithDetailSpy = vi.spyOn(encryptor, 'encryptWithDetail');
          const encryptWithKeySpy = vi.spyOn(encryptor, 'encryptWithKey');

          const secrets = await controller.fetchAllSecretData();

          expect(secrets.map(({ data }) => data)).toStrictEqual([
            MOCK_SEED_PHRASE,
          ]);
          expect(controller.state.vault).toBe(vaultBefore);
          expect(controller.state.envelope).toStrictEqual(envelopeBefore);
          expect(network.spies.recoverEncKey).not.toHaveBeenCalled();
          expect(encryptWithDetailSpy).not.toHaveBeenCalled();
          expect(encryptWithKeySpy).not.toHaveBeenCalled();
        });
      });

      it('ignores a malformed control record with the highest seq in changePassword and restoreVaultWithPassword', async () => {
        const store: MetadataStore = new Map();
        await withUnlockedController(async (args) => {
          const network = mockNetwork(args.toprfClient, { store });
          await migrate(args, network);
          storeSeedPhrase(store, vaultKeySetFor());
          const malformed = controlRecordFor(MOCK_PASSWORD);
          malformed.seq = 5;
          malformed.passwordNamespace.authSk = 'zz';
          store
            .get(bytesToHex(vaultKeySetFor().authKeyPair.pk))
            ?.set('control-malformed', {
              encKey: bytesToHex(vaultKeySetFor().encKey),
              dataType: EncAccountDataType.EnvelopeControl,
              data: stringToBytes(JSON.stringify(malformed)),
            });

          await args.baseMessenger.call(
            'SeedlessOnboardingController:changePassword',
            NEW_PASSWORD,
            MOCK_PASSWORD,
          );

          expect(
            (await fetchControlRecords(network)).map(({ seq }) => seq),
          ).toStrictEqual([1, 2]);
        });

        await withNewDeviceController(async ({ controller, toprfClient }) => {
          mockNetwork(toprfClient, { store, globalPassword: NEW_PASSWORD });

          const secrets = await controller.restoreVaultWithPassword({
            password: NEW_PASSWORD,
          });

          expect(secrets.map(({ data }) => data)).toStrictEqual([
            MOCK_SEED_PHRASE,
          ]);
          expect(controller.state.envelope).toStrictEqual({
            v: 1,
            vaultAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
            passwordAuthPubKey: authPubKeyOf(NEW_PASSWORD),
          });
        });
      });

      it('fetchAllSecretData throws NoSecretDataFound when the vault partition holds only control records', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient } = args;
          const network = mockNetwork(toprfClient);
          await migrate(args, network);
          expect(await fetchControlRecords(network)).toHaveLength(1);

          await expect(controller.fetchAllSecretData()).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.NoSecretDataFound,
          );
        });
      });

      it('restoreVaultWithPassword does not mark the vault envelope-managed when no control record matches the password', async () => {
        await withNewDeviceController(async ({ controller, toprfClient }) => {
          const network = mockNetwork(toprfClient);
          storeSeedPhrase(network.store, vaultKeySetFor());
          await network.envelopeStore.writeControlRecord(
            vaultKeySetFor(),
            controlRecordFor('other-password'),
          );
          network.spies.fetchAllSecretDataItems.mockClear();

          const secrets = await controller.restoreVaultWithPassword({
            password: MOCK_PASSWORD,
          });

          expect(secrets.map(({ data }) => data)).toStrictEqual([
            MOCK_SEED_PHRASE,
          ]);
          expect(controller.state.authPubKey).toBe(authPubKeyOf(MOCK_PASSWORD));
          expect(controller.state.envelope).toBeUndefined();
          expect(vaultPartitionFetches(network)).toHaveLength(1);
        });
      });

      it('syncLatestGlobalPassword does not mark the vault envelope-managed when no control record matches the password', async () => {
        await withUnlockedController(async ({ controller, toprfClient }) => {
          const network = mockNetwork(toprfClient);
          storeSeedPhrase(network.store, vaultKeySetFor());
          await network.envelopeStore.writeControlRecord(
            vaultKeySetFor(),
            controlRecordFor('other-password'),
          );

          await controller.syncLatestGlobalPassword({
            globalPassword: MOCK_PASSWORD,
          });

          expect(controller.state.envelope).toBeUndefined();
          expect(controller.state.authPubKey).toBe(authPubKeyOf(MOCK_PASSWORD));
        });
      });

      it('runMigrations migrates the secrets and ignores the control records', async () => {
        await withUnlockedController(async ({ controller, toprfClient }) => {
          const network = mockNetwork(toprfClient);
          network.store.set(
            bytesToHex(vaultKeySetFor().authKeyPair.pk),
            new Map([
              [
                'legacy-seed',
                {
                  encKey: bytesToHex(vaultKeySetFor().encKey),
                  data: new SecretMetadata(MOCK_SEED_PHRASE).toBytes(),
                },
              ],
            ]),
          );
          await network.envelopeStore.writeControlRecord(
            vaultKeySetFor(),
            controlRecordFor(MOCK_PASSWORD),
          );
          const updateSecretDataItemSpy = vi
            .spyOn(toprfClient, 'updateSecretDataItem')
            .mockResolvedValue(undefined);
          const batchUpdateSecretDataItemsSpy = vi
            .spyOn(toprfClient, 'batchUpdateSecretDataItems')
            .mockResolvedValue(undefined);
          controller.setMigrationVersion(
            0 as SeedlessOnboardingMigrationVersion,
          );

          expect(await controller.runMigrations()).toBe(true);

          expect(updateSecretDataItemSpy).toHaveBeenCalledTimes(1);
          expect(updateSecretDataItemSpy).toHaveBeenCalledWith({
            itemId: 'legacy-seed',
            dataType: EncAccountDataType.PrimarySrp,
            authKeyPair: vaultKeySetFor().authKeyPair,
          });
          expect(batchUpdateSecretDataItemsSpy).not.toHaveBeenCalled();
          expect(controller.state.migrationVersion).toBe(
            SeedlessOnboardingMigrationVersion.V1,
          );
        });
      });

      it('legacy changePassword refuses to move a vault partition with a control item and writes nothing', async () => {
        await withUnlockedController(async ({ controller, toprfClient }) => {
          const network = mockNetwork(toprfClient);
          storeSeedPhrase(network.store, vaultKeySetFor());
          // an unparseable control item hides from the control record check,
          // so the legacy path runs
          network.store
            .get(bytesToHex(vaultKeySetFor().authKeyPair.pk))
            ?.set('control-item', {
              encKey: bytesToHex(vaultKeySetFor().encKey),
              dataType: EncAccountDataType.EnvelopeControl,
              data: stringToBytes('garbage'),
            });
          const batchAddSecretData = vi.fn();
          vi.spyOn(toprfClient, 'changeEncKey').mockImplementation(
            async ({ oldEncKey, oldAuthKeyPair, transformDataItems }) => {
              const items = await toprfClient.fetchAllSecretDataItems({
                decKey: oldEncKey,
                authKeyPair: oldAuthKeyPair,
              });
              batchAddSecretData(transformDataItems?.(items));
              throw new Error('unreachable');
            },
          );
          const { vault } = controller.state;

          await expect(
            controller.changePassword(NEW_PASSWORD, MOCK_PASSWORD),
          ).rejects.toMatchObject({
            message:
              SeedlessOnboardingControllerErrorMessage.FailedToChangePassword,
            cause: expect.objectContaining({
              message:
                SeedlessOnboardingControllerErrorMessage.EnvelopeVaultRequiresEnvelopePasswordChange,
            }),
          });

          expect(batchAddSecretData).not.toHaveBeenCalled();
          expect(network.spies.addSecretDataItem).not.toHaveBeenCalled();
          expect(network.spies.persistLocalKey).not.toHaveBeenCalled();
          expect(controller.state.vault).toBe(vault);
          expect(controller.state.envelope).toBeUndefined();
        });
      });
    });

    describe('checkIsPasswordOutdated on an envelope-managed vault', () => {
      it('compares against the password OPRF key the vault last synced with', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient } = args;
          const network = mockNetwork(toprfClient);
          await migrate(args, network);

          expect(
            await controller.checkIsPasswordOutdated({ skipCache: true }),
          ).toBe(false);

          network.setGlobalPassword(NEW_PASSWORD);

          expect(
            await controller.checkIsPasswordOutdated({ skipCache: true }),
          ).toBe(true);
        });
      });
    });

    describe('recoverWithRecoverySecret', () => {
      it('returns the secret data with the vault keys sealed for the Recovery Secret, without creating a vault', async () => {
        const store = await createMigratedAccount();

        await withNewDeviceController(async (args) => {
          const { controller, toprfClient } = args;
          const network = mockNetwork(toprfClient, {
            store,
            globalPassword: NEW_PASSWORD,
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          const { authPubKey } = controller.state;

          const secrets = await recoverSecrets(args);

          expect(secrets.map(({ data }) => data)).toStrictEqual([
            MOCK_SEED_PHRASE,
          ]);
          expect(network.spies.recoverEncKey).toHaveBeenCalledTimes(1);
          expect(network.spies.recoverEncKey).toHaveBeenCalledWith(
            expect.objectContaining({
              nodeAuthTokens: AAL2_NODE_AUTH_TOKENS,
              authConnectionId: AAL2_AUTH_CONNECTION_ID,
              userId: AAL2_USER_ID,
              password: RECOVERY_SECRET_HEX,
            }),
          );
          expect(network.spies.createLocalKey).not.toHaveBeenCalled();
          expect(network.spies.persistLocalKey).not.toHaveBeenCalled();
          expect(controller.state.vault).toBeUndefined();
          expect(controller.state.authPubKey).toBe(authPubKey);
          expect(controller.state.envelope).toBeUndefined();
          expect(controller.state.recoverySession).toBeDefined();
        });
      });

      it('keeps a pending envelope migration checkpoint until setLocalPassword', async () => {
        const store = await createMigratedAccount();

        await withController(
          {
            state: {
              ...getMockInitialControllerState({
                withMockAuthenticatedUser: true,
              }),
              pendingEnvelopeMigration: 'encrypted',
            },
          },
          async (args) => {
            const { controller, toprfClient } = args;
            mockNetwork(toprfClient, {
              store,
              globalPassword: NEW_PASSWORD,
              recoverySecret: RECOVERY_SECRET_HEX,
            });

            await recoverSecrets(args);

            expect(controller.state.pendingEnvelopeMigration).toBe('encrypted');
            expect(controller.state.vault).toBeUndefined();
          },
        );
      });

      it('reports the password as outdated only once it changes after recovery', async () => {
        const store = await createMigratedAccount();

        await withNewDeviceController(async (args) => {
          const { controller, toprfClient } = args;
          const network = mockNetwork(toprfClient, {
            store,
            globalPassword: NEW_PASSWORD,
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          await recover(args);

          expect(
            await controller.checkIsPasswordOutdated({ skipCache: true }),
          ).toBe(false);

          network.setGlobalPassword('other-password');

          expect(
            await controller.checkIsPasswordOutdated({ skipCache: true }),
          ).toBe(true);
        });
      });

      it('throws RecoveryEnvelopeNotFound when the nodes hold no Recovery Secret share', async () => {
        await withNewDeviceController(async (args) => {
          const { controller, toprfClient, baseMessenger } = args;
          const network = mockNetwork(toprfClient);
          await authenticateAal2(args, { hasRecoveryShare: false });

          await expect(
            baseMessenger.call(
              'SeedlessOnboardingController:recoverWithRecoverySecret',
              { recoverySecret: RECOVERY_SECRET },
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.RecoveryEnvelopeNotFound,
          );
          expect(network.spies.recoverEncKey).not.toHaveBeenCalled();
          expect(controller.state.vault).toBeUndefined();
        });
      });

      it('throws RecoveryEnvelopeNotFound when the Recovery Secret has no envelope', async () => {
        await withNewDeviceController(async (args) => {
          const { controller, toprfClient } = args;
          mockNetwork(toprfClient, { recoverySecret: RECOVERY_SECRET_HEX });

          await expect(recoverSecrets(args)).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.RecoveryEnvelopeNotFound,
          );
          expect(controller.state.vault).toBeUndefined();
          expect(controller.state.envelope).toBeUndefined();
        });
      });

      it('throws InvalidEnvelope when no envelope opens', async () => {
        await withNewDeviceController(async (args) => {
          const { controller, toprfClient } = args;
          const network = mockNetwork(toprfClient, {
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          await network.envelopeStore.writeEnvelope(
            deriveTestEnvelopeKeys(stringToBytes(RECOVERY_SECRET_HEX)),
            await sealEnvelope(
              deriveTestEnvelopeKeys(stringToBytes('other-seed')).wrapKey,
              'recovery-secret',
              vaultKeySetFor(),
            ),
          );

          await expect(recoverSecrets(args)).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.InvalidEnvelope,
          );
          expect(controller.state.vault).toBeUndefined();
        });
      });

      it('throws RecoveryKeyShareConflict for another Recovery Secret', async () => {
        const store = await createMigratedAccount();

        await withNewDeviceController(async (args) => {
          const { controller, toprfClient } = args;
          mockNetwork(toprfClient, {
            store,
            recoverySecret: bytesToHex(new Uint8Array(32).fill(8)),
          });

          await expect(recoverSecrets(args)).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.RecoveryKeyShareConflict,
          );
          expect(controller.state.vault).toBeUndefined();
        });
      });

      it('throws Aal2Required without a recovery session', async () => {
        await withNewDeviceController(
          async ({ toprfClient, baseMessenger }) => {
            const network = mockNetwork(toprfClient, {
              recoverySecret: RECOVERY_SECRET_HEX,
            });

            await expect(
              baseMessenger.call(
                'SeedlessOnboardingController:recoverWithRecoverySecret',
                { recoverySecret: RECOVERY_SECRET },
              ),
            ).rejects.toThrow(
              SeedlessOnboardingControllerErrorMessage.Aal2Required,
            );
            expect(network.spies.recoverEncKey).not.toHaveBeenCalled();
          },
        );
      });

      it('does not create a vault when the vault holds no secret data', async () => {
        const store = await createMigratedAccount();
        store.delete(bytesToHex(vaultKeySetFor().authKeyPair.pk));

        await withNewDeviceController(async (args) => {
          const { controller, toprfClient } = args;
          mockNetwork(toprfClient, {
            store,
            recoverySecret: RECOVERY_SECRET_HEX,
          });

          await expect(recoverSecrets(args)).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.NoSecretDataFound,
          );
          expect(controller.state.vault).toBeUndefined();
          expect(controller.state.envelope).toBeUndefined();
        });
      });
    });

    describe('setLocalPassword', () => {
      it('creates the local vault from the vault keys recovered with the Recovery Secret', async () => {
        const store = await createMigratedAccount();

        await withNewDeviceController(async (args) => {
          const { controller, toprfClient } = args;
          const network = mockNetwork(toprfClient, {
            store,
            globalPassword: NEW_PASSWORD,
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          await recoverSecrets(args);

          await setLocalPassword(args);

          expect(network.spies.createLocalKey).not.toHaveBeenCalled();
          expect(network.spies.persistLocalKey).not.toHaveBeenCalled();
          expect(controller.state.authPubKey).toBe(authPubKeyOf(MOCK_PASSWORD));
          expect(controller.state.envelope).toStrictEqual({
            v: 1,
            vaultAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
            passwordAuthPubKey: authPubKeyOf(NEW_PASSWORD),
          });
          expect(controller.state.isLocalPassword).toBe(true);
          expect(
            await controller.verifyVaultPassword(RECOVERED_PASSWORD),
          ).toBeUndefined();
        });
      });

      it('throws EnvelopeControlRecordNotFound without creating a vault when no control record matched during recovery', async () => {
        const store = await createMigratedAccount();
        deleteControlRecords(store);

        await withNewDeviceController(async (args) => {
          const { controller, toprfClient } = args;
          mockNetwork(toprfClient, {
            store,
            globalPassword: NEW_PASSWORD,
            recoverySecret: RECOVERY_SECRET_HEX,
          });

          const secrets = await recoverSecrets(args);

          expect(secrets.map(({ data }) => data)).toStrictEqual([
            MOCK_SEED_PHRASE,
          ]);
          await expect(setLocalPassword(args)).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.EnvelopeControlRecordNotFound,
          );
          expect(controller.state.vault).toBeUndefined();
          expect(controller.state.envelope).toBeUndefined();
          expect(controller.state.isLocalPassword).toBeUndefined();
        });
      });

      it('throws EnvelopeControlRecordNotFound when the live password key moved past every control record', async () => {
        const store = await createMigratedAccount();

        await withNewDeviceController(async (args) => {
          const { controller, toprfClient } = args;
          mockNetwork(toprfClient, {
            store,
            globalPassword: 'other-password',
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          await recoverSecrets(args);

          await expect(setLocalPassword(args)).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.EnvelopeControlRecordNotFound,
          );
          expect(controller.state.vault).toBeUndefined();
        });
      });

      it('syncs the global password over the local password and clears isLocalPassword', async () => {
        const store = await createMigratedAccount();

        await withNewDeviceController(async (args) => {
          const { controller, toprfClient } = args;
          mockNetwork(toprfClient, {
            store,
            globalPassword: NEW_PASSWORD,
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          await recover(args);

          await controller.syncLatestGlobalPassword({
            globalPassword: NEW_PASSWORD,
          });

          expect(controller.state.isLocalPassword).toBeUndefined();
          expect(controller.state.envelope).toStrictEqual({
            v: 1,
            vaultAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
            passwordAuthPubKey: authPubKeyOf(NEW_PASSWORD),
          });
          expect(
            await controller.checkIsPasswordOutdated({ skipCache: true }),
          ).toBe(false);
          expect(
            await controller.verifyVaultPassword(NEW_PASSWORD),
          ).toBeUndefined();
        });
      });

      it('changes the password from the local password and clears isLocalPassword', async () => {
        const store = await createMigratedAccount();

        await withNewDeviceController(async (args) => {
          const { controller, toprfClient, baseMessenger } = args;
          const network = mockNetwork(toprfClient, {
            store,
            globalPassword: NEW_PASSWORD,
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          await recover(args);

          await baseMessenger.call(
            'SeedlessOnboardingController:changePassword',
            'changed-password',
            RECOVERED_PASSWORD,
          );

          expect(network.spies.persistLocalKey).toHaveBeenCalled();
          expect(
            await openStoredEnvelope(network, 'changed-password', 'password'),
          ).toStrictEqual(vaultKeySetFor());
          expect(controller.state.isLocalPassword).toBeUndefined();
          expect(controller.state.envelope).toStrictEqual({
            v: 1,
            vaultAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
            passwordAuthPubKey: authPubKeyOf('changed-password'),
          });
          expect(
            await controller.checkIsPasswordOutdated({ skipCache: true }),
          ).toBe(false);
          expect(
            await controller.verifyVaultPassword('changed-password'),
          ).toBeUndefined();
        });
      });

      it('discards a pending envelope migration checkpoint but keeps the recovery session', async () => {
        const store = await createMigratedAccount();

        await withController(
          {
            state: {
              ...getMockInitialControllerState({
                withMockAuthenticatedUser: true,
              }),
              pendingEnvelopeMigration: 'encrypted',
            },
          },
          async (args) => {
            const { controller, toprfClient } = args;
            mockNetwork(toprfClient, {
              store,
              globalPassword: NEW_PASSWORD,
              recoverySecret: RECOVERY_SECRET_HEX,
            });
            await recoverSecrets(args);
            expect(controller.state.pendingEnvelopeMigration).toBe('encrypted');

            await setLocalPassword(args);

            expect(controller.state.pendingEnvelopeMigration).toBeUndefined();
            expect(controller.state.recoverySession).toBeDefined();
          },
        );
      });

      it('throws RecoveryRequired without a prior recovery', async () => {
        await withNewDeviceController(async (args) => {
          const { controller, toprfClient } = args;
          const network = mockNetwork(toprfClient, {
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          await authenticateAal2(args, { hasRecoveryShare: true });

          await expect(setLocalPassword(args)).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.RecoveryRequired,
          );
          expect(network.spies.recoverEncKey).not.toHaveBeenCalled();
          expect(controller.state.vault).toBeUndefined();
          expect(controller.state.envelope).toBeUndefined();
        });
      });

      it('throws Aal2Required and clears the session when the recovery session has expired', async () => {
        const store = await createMigratedAccount();

        await withController(
          {
            state: {
              ...getMockInitialControllerState({
                withMockAuthenticatedUser: true,
              }),
              pendingEnvelopeMigration: 'encrypted',
            },
          },
          async (args) => {
            const { controller, toprfClient } = args;
            mockNetwork(toprfClient, {
              store,
              globalPassword: NEW_PASSWORD,
              recoverySecret: RECOVERY_SECRET_HEX,
            });
            await recoverSecrets(args);
            const now = Date.now();
            vi.spyOn(Date, 'now').mockReturnValue(now + 2 * 60 * 60 * 1000);

            await expect(setLocalPassword(args)).rejects.toThrow(
              SeedlessOnboardingControllerErrorMessage.Aal2Required,
            );
            expect(controller.state.recoverySession).toBeUndefined();
            expect(controller.state.vault).toBeUndefined();
            expect(controller.state.envelope).toBeUndefined();
            expect(controller.state.pendingEnvelopeMigration).toBe('encrypted');
          },
        );
      });

      it('adds secret data without the global password while the local password is set', async () => {
        const store = await createMigratedAccount();

        await withNewDeviceController(async (args) => {
          const { controller, toprfClient } = args;
          mockNetwork(toprfClient, {
            store,
            globalPassword: NEW_PASSWORD,
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          await recover(args);

          await controller.addNewSecretData(
            stringToBytes('new mock seed phrase'),
            EncAccountDataType.ImportedSrp,
            { keyringId: 'new-keyring' },
          );

          const secrets = await controller.fetchAllSecretData();
          expect(secrets.map(({ data }) => data)).toStrictEqual(
            expect.arrayContaining([
              MOCK_SEED_PHRASE,
              stringToBytes('new mock seed phrase'),
            ]),
          );
          expect(controller.state.isLocalPassword).toBe(true);
        });
      });

      it('fetches secret data without a password while the local password is set', async () => {
        const store = await createMigratedAccount();

        await withNewDeviceController(async (args) => {
          const { controller, toprfClient } = args;
          mockNetwork(toprfClient, {
            store,
            globalPassword: NEW_PASSWORD,
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          await recover(args);

          const secrets = await controller.fetchAllSecretData();

          expect(secrets.map(({ data }) => data)).toStrictEqual([
            MOCK_SEED_PHRASE,
          ]);
          expect(controller.state.isLocalPassword).toBe(true);
        });
      });

      it('unlocks with the local password after a lock', async () => {
        const store = await createMigratedAccount();

        await withNewDeviceController(async (args) => {
          const { controller, toprfClient, baseMessenger } = args;
          mockNetwork(toprfClient, {
            store,
            globalPassword: NEW_PASSWORD,
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          await recover(args);
          await controller.setLocked();

          await baseMessenger.call(
            'SeedlessOnboardingController:submitPassword',
            RECOVERED_PASSWORD,
          );

          expect(controller.state.isLocalPassword).toBe(true);
          expect(
            (await controller.fetchAllSecretData()).map(({ data }) => data),
          ).toStrictEqual([MOCK_SEED_PHRASE]);
        });
      });

      it('refuses createToprfKeyAndBackupSeedPhrase when a vault exists', async () => {
        const store = await createMigratedAccount();

        await withNewDeviceController(async (args) => {
          const { toprfClient, baseMessenger } = args;
          const network = mockNetwork(toprfClient, {
            store,
            globalPassword: NEW_PASSWORD,
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          await recover(args);

          await expect(
            baseMessenger.call(
              'SeedlessOnboardingController:createToprfKeyAndBackupSeedPhrase',
              RECOVERED_PASSWORD,
              stringToBytes('another seed phrase'),
              'another-keyring',
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.VaultAlreadyExists,
          );
          expect(network.spies.createLocalKey).not.toHaveBeenCalled();
        });
      });

      it('identifies incomplete metadata backup with the local password', async () => {
        const store = await createMigratedAccount();

        await withNewDeviceController(async (args) => {
          const { controller, toprfClient, baseMessenger } = args;
          mockNetwork(toprfClient, {
            store,
            globalPassword: NEW_PASSWORD,
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          await recover(args);

          expect(
            await baseMessenger.call(
              'SeedlessOnboardingController:identifyIncompleteMetadataBackup',
              RECOVERED_PASSWORD,
            ),
          ).toBeUndefined();
          expect(controller.state.isLocalPassword).toBe(true);
        });
      });

      it('returns the access token after setLocalPassword', async () => {
        const store = await createMigratedAccount();

        await withNewDeviceController(async (args) => {
          const { controller, toprfClient } = args;
          mockNetwork(toprfClient, {
            store,
            globalPassword: NEW_PASSWORD,
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          await recover(args);

          expect(await controller.getAccessToken()).toBe(
            controller.state.accessToken,
          );
        });
      });

      it('does not use the recovered keys for a different user', async () => {
        const store = await createMigratedAccount();

        await withNewDeviceController(async (args) => {
          const { controller, toprfClient, baseMessenger } = args;
          mockNetwork(toprfClient, {
            store,
            globalPassword: NEW_PASSWORD,
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          await recoverSecrets(args);

          vi.spyOn(toprfClient, 'authenticate').mockResolvedValueOnce({
            nodeAuthTokens: AAL2_NODE_AUTH_TOKENS,
            isNewUser: false,
          });
          await baseMessenger.call(
            'SeedlessOnboardingController:authenticate',
            {
              idTokens: ['other-user-id-token'],
              accessToken: 'other-access-token',
              metadataAccessToken: 'other-metadata-access-token',
              authConnection: controller.state.authConnection!,
              authConnectionId: controller.state.authConnectionId!,
              groupedAuthConnectionId: controller.state.groupedAuthConnectionId,
              userId: 'other-user@example.com',
              refreshToken: 'other-refresh-token',
            },
          );

          await expect(setLocalPassword(args)).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.RecoveryRequired,
          );
          expect(controller.state.vault).toBeUndefined();
        });
      });

      it('keeps the recovered keys when authenticate runs again for the same user', async () => {
        const store = await createMigratedAccount();

        await withNewDeviceController(async (args) => {
          const { controller, toprfClient, baseMessenger } = args;
          mockNetwork(toprfClient, {
            store,
            globalPassword: NEW_PASSWORD,
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          await recoverSecrets(args);

          vi.spyOn(toprfClient, 'authenticate').mockResolvedValueOnce({
            nodeAuthTokens: AAL2_NODE_AUTH_TOKENS,
            isNewUser: false,
          });
          await baseMessenger.call(
            'SeedlessOnboardingController:authenticate',
            {
              idTokens: ['same-user-id-token'],
              accessToken: 'same-user-access-token',
              metadataAccessToken: 'same-user-metadata-access-token',
              authConnection: controller.state.authConnection!,
              authConnectionId: controller.state.authConnectionId!,
              groupedAuthConnectionId: controller.state.groupedAuthConnectionId,
              userId: controller.state.userId!,
              refreshToken: 'same-user-refresh-token',
            },
          );

          await setLocalPassword(args);

          expect(
            await controller.verifyVaultPassword(RECOVERED_PASSWORD),
          ).toBeUndefined();
        });
      });

      it('throws RecoveryRequired on a second call', async () => {
        const store = await createMigratedAccount();

        await withNewDeviceController(async (args) => {
          const { controller, toprfClient } = args;
          mockNetwork(toprfClient, {
            store,
            globalPassword: NEW_PASSWORD,
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          await recover(args);

          await expect(
            setLocalPassword(args, 'another-password'),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.RecoveryRequired,
          );
          expect(
            await controller.verifyVaultPassword(RECOVERED_PASSWORD),
          ).toBeUndefined();
        });
      });

      it.each([
        ['the controller is locked', 'SeedlessOnboardingController:setLocked'],
        ['the state is cleared', 'SeedlessOnboardingController:clearState'],
      ] as const)(
        'throws RecoveryRequired when %s after recovery',
        async (_name, action) => {
          const store = await createMigratedAccount();

          await withNewDeviceController(async (args) => {
            const { controller, toprfClient, baseMessenger } = args;
            mockNetwork(toprfClient, {
              store,
              globalPassword: NEW_PASSWORD,
              recoverySecret: RECOVERY_SECRET_HEX,
            });
            await recoverSecrets(args);

            const {
              authConnection,
              authConnectionId,
              groupedAuthConnectionId,
              userId,
            } = controller.state;
            await baseMessenger.call(action);
            // the social login is needed again before the aal2 session
            vi.spyOn(toprfClient, 'authenticate').mockResolvedValueOnce({
              nodeAuthTokens: AAL2_NODE_AUTH_TOKENS,
              isNewUser: false,
            });
            await baseMessenger.call(
              'SeedlessOnboardingController:authenticate',
              {
                idTokens: ['idToken'],
                accessToken: 'accessToken',
                metadataAccessToken: 'metadataAccessToken',
                authConnection: authConnection!,
                authConnectionId: authConnectionId!,
                groupedAuthConnectionId,
                userId: userId!,
                refreshToken: 'refreshToken',
                revokeToken: 'revokeToken',
              },
            );
            await authenticateAal2(args, { hasRecoveryShare: true });

            await expect(setLocalPassword(args)).rejects.toThrow(
              SeedlessOnboardingControllerErrorMessage.RecoveryRequired,
            );
            expect(controller.state.vault).toBeUndefined();
          });
        },
      );
    });

    describe('resetPasswordWithVaultKeys', () => {
      it('sets a new global password after recovery without the old password', async () => {
        const store = await createMigratedAccount();

        await withNewDeviceController(async (args) => {
          const { controller, toprfClient, baseMessenger } = args;
          const network = mockNetwork(toprfClient, {
            store,
            globalPassword: NEW_PASSWORD,
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          await recover(args);
          const changeEncKeySpy = vi.spyOn(toprfClient, 'changeEncKey');

          await baseMessenger.call(
            'SeedlessOnboardingController:resetPasswordWithVaultKeys',
            { newPassword: RECOVERED_PASSWORD },
          );

          expect(changeEncKeySpy).not.toHaveBeenCalled();
          expect(network.spies.persistLocalKey).toHaveBeenCalledWith(
            expect.objectContaining({
              authConnectionId: controller.state.authConnectionId,
              authPubKey: keysFor(RECOVERED_PASSWORD).authKeyPair.pk,
              keyShareIndex: 1,
              oldAuthKeyPair: {
                sk: keysFor(NEW_PASSWORD).authKeyPair.sk,
                pk: expect.any(Uint8Array),
              },
            }),
          );
          expect(
            await openStoredEnvelope(network, RECOVERED_PASSWORD, 'password'),
          ).toStrictEqual(vaultKeySetFor());
          expect(
            (await fetchControlRecords(network)).map(({ seq }) => seq),
          ).toStrictEqual([1, 2, 3]);
          expect(controller.state.authPubKey).toBe(authPubKeyOf(MOCK_PASSWORD));
          expect(controller.state.envelope).toStrictEqual({
            v: 1,
            vaultAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
            passwordAuthPubKey: authPubKeyOf(RECOVERED_PASSWORD),
          });
          expect(controller.state.isLocalPassword).toBeUndefined();
          expect(
            await controller.checkIsPasswordOutdated({ skipCache: true }),
          ).toBe(false);
          expect(
            await controller.verifyVaultPassword(RECOVERED_PASSWORD),
          ).toBeUndefined();
        });

        await withNewDeviceController(async ({ controller, toprfClient }) => {
          mockNetwork(toprfClient, {
            store,
            globalPassword: RECOVERED_PASSWORD,
          });

          const secrets = await controller.restoreVaultWithPassword({
            password: RECOVERED_PASSWORD,
          });

          expect(secrets.map(({ data }) => data)).toStrictEqual([
            MOCK_SEED_PHRASE,
          ]);
        });
      });

      it('re-encrypts the vault under the new password and keeps the keyring encryption key', async () => {
        const store = await createMigratedAccount();

        await withNewDeviceController(async (args) => {
          const { controller, toprfClient, baseMessenger } = args;
          mockNetwork(toprfClient, {
            store,
            globalPassword: NEW_PASSWORD,
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          await recover(args);
          await controller.storeKeyringEncryptionKey('keyring-key');

          await baseMessenger.call(
            'SeedlessOnboardingController:resetPasswordWithVaultKeys',
            { newPassword: 'reset-password' },
          );

          expect(
            await controller.verifyVaultPassword('reset-password'),
          ).toBeUndefined();
          expect(await controller.loadKeyringEncryptionKey()).toBe(
            'keyring-key',
          );
        });
      });

      it('allows changePassword once the password is reset', async () => {
        const store = await createMigratedAccount();

        await withNewDeviceController(async (args) => {
          const { controller, toprfClient, baseMessenger } = args;
          mockNetwork(toprfClient, {
            store,
            globalPassword: NEW_PASSWORD,
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          await recover(args);
          await baseMessenger.call(
            'SeedlessOnboardingController:resetPasswordWithVaultKeys',
            { newPassword: 'reset-password' },
          );

          await baseMessenger.call(
            'SeedlessOnboardingController:changePassword',
            'changed-password',
            'reset-password',
          );

          expect(
            await controller.verifyVaultPassword('changed-password'),
          ).toBeUndefined();
        });
      });

      it('throws PasswordResetRequiresRecovery on a vault that is not envelope-managed', async () => {
        await withUnlockedController(async (args) => {
          const network = mockNetwork(args.toprfClient);
          await authenticateAal2(args, { hasRecoveryShare: true });

          await expect(
            args.baseMessenger.call(
              'SeedlessOnboardingController:resetPasswordWithVaultKeys',
              { newPassword: NEW_PASSWORD },
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.PasswordResetRequiresRecovery,
          );
          expect(network.spies.persistLocalKey).not.toHaveBeenCalled();
        });
      });

      it('throws PasswordResetRequiresRecovery when the local password is synced, even with a recovery session', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient, baseMessenger } = args;
          const network = mockNetwork(toprfClient);
          await migrate(args, network);
          expect(controller.state.recoverySession).toBeDefined();

          await expect(
            baseMessenger.call(
              'SeedlessOnboardingController:resetPasswordWithVaultKeys',
              { newPassword: NEW_PASSWORD },
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.PasswordResetRequiresRecovery,
          );
          expect(network.spies.persistLocalKey).not.toHaveBeenCalled();
          expect(
            await controller.verifyVaultPassword(MOCK_PASSWORD),
          ).toBeUndefined();
        });
      });

      it('throws PasswordResetRequiresRecovery on a second reset', async () => {
        const store = await createMigratedAccount();

        await withNewDeviceController(async (args) => {
          const { toprfClient, baseMessenger } = args;
          const network = mockNetwork(toprfClient, {
            store,
            globalPassword: NEW_PASSWORD,
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          await recover(args);
          await baseMessenger.call(
            'SeedlessOnboardingController:resetPasswordWithVaultKeys',
            { newPassword: 'reset-password' },
          );
          network.spies.persistLocalKey.mockClear();

          await expect(
            baseMessenger.call(
              'SeedlessOnboardingController:resetPasswordWithVaultKeys',
              { newPassword: 'another-password' },
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.PasswordResetRequiresRecovery,
          );
          expect(network.spies.persistLocalKey).not.toHaveBeenCalled();
        });
      });

      it('throws Aal2Required and clears the session when the recovery session has expired', async () => {
        const store = await createMigratedAccount();

        await withNewDeviceController(async (args) => {
          const { controller, toprfClient, baseMessenger } = args;
          const network = mockNetwork(toprfClient, {
            store,
            globalPassword: NEW_PASSWORD,
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          await recover(args);
          const now = Date.now();
          vi.spyOn(Date, 'now').mockReturnValue(now + 2 * 60 * 60 * 1000);

          await expect(
            baseMessenger.call(
              'SeedlessOnboardingController:resetPasswordWithVaultKeys',
              { newPassword: 'reset-password' },
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.Aal2Required,
          );
          expect(network.spies.persistLocalKey).not.toHaveBeenCalled();
          expect(controller.state.recoverySession).toBeUndefined();
          expect(
            await controller.verifyVaultPassword(RECOVERED_PASSWORD),
          ).toBeUndefined();
        });
      });

      it('throws EnvelopeControlRecordNotFound when no control record matches the password OPRF key', async () => {
        const store = await createMigratedAccount();

        await withNewDeviceController(async (args) => {
          const { controller, toprfClient, baseMessenger } = args;
          const network = mockNetwork(toprfClient, {
            store,
            globalPassword: NEW_PASSWORD,
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          await recover(args);
          // a legacy password change elsewhere left no control record behind
          network.setGlobalPassword('other-password');

          await expect(
            baseMessenger.call(
              'SeedlessOnboardingController:resetPasswordWithVaultKeys',
              { newPassword: 'reset-password' },
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.EnvelopeControlRecordNotFound,
          );
          expect(network.spies.persistLocalKey).not.toHaveBeenCalled();
          expect(
            await controller.verifyVaultPassword(RECOVERED_PASSWORD),
          ).toBeUndefined();
        });
      });

      it('keeps the vault under the old password when swapping the key fails', async () => {
        const store = await createMigratedAccount();

        await withNewDeviceController(async (args) => {
          const { controller, toprfClient, baseMessenger } = args;
          const network = mockNetwork(toprfClient, {
            store,
            globalPassword: NEW_PASSWORD,
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          await recover(args);
          network.spies.persistLocalKey.mockRejectedValueOnce(
            new Error('persist'),
          );

          await expect(
            baseMessenger.call(
              'SeedlessOnboardingController:resetPasswordWithVaultKeys',
              { newPassword: 'reset-password' },
            ),
          ).rejects.toThrow('persist');

          expect(
            await controller.verifyVaultPassword(RECOVERED_PASSWORD),
          ).toBeUndefined();
          expect(controller.state.envelope?.passwordAuthPubKey).toBe(
            authPubKeyOf(NEW_PASSWORD),
          );
          expect(controller.state.isLocalPassword).toBe(true);
        });
      });

      it('throws ControllerLocked when locked', async () => {
        await withUnlockedController(async ({ baseMessenger }) => {
          await baseMessenger.call('SeedlessOnboardingController:setLocked');

          await expect(
            baseMessenger.call(
              'SeedlessOnboardingController:resetPasswordWithVaultKeys',
              { newPassword: NEW_PASSWORD },
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.ControllerLocked,
          );
        });
      });
    });
  });
});
