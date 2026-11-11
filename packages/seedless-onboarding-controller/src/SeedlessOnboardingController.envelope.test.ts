import { deriveStateFromMetadata } from '@metamask/base-controller';
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
  bytesToBase64,
  bytesToHex,
  stringToBytes,
} from '@metamask/utils';
import type { MockInstance } from 'vitest';
import { describe, expect, it, vi } from 'vitest';

import type { RootMessenger } from '../tests/__fixtures__/mockMessenger.js';
import {
  createMockToprfEncryptor,
  getMockInitialControllerState,
  MOCK_KEYRING_ID,
  MOCK_SEED_PHRASE,
  mockCreateToprfKeyAndBackupSeedPhrase,
  withController,
} from '../tests/controller-helpers.js';
import { deriveTestEnvelopeKeys } from '../tests/mocks/envelopeKeys.js';
import { createMockJWTToken } from '../tests/mocks/utils.js';
import {
  SeedlessOnboardingControllerErrorMessage,
  SeedlessOnboardingMigrationVersion,
} from './constants.js';
import {
  deriveControlKeys,
  openEnvelope,
  sealEnvelope,
  serializeEnvelope,
} from './envelope/envelope-keys.js';
import type { ControlRecord, VaultKeySet } from './envelope/envelope-keys.js';
import { EnvelopeStore } from './envelope/EnvelopeStore.js';
import { SecretMetadata } from './SecretMetadata.js';

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

    /**
     * Runs the callback with an unlocked controller that holds a vault.
     *
     * @param fn - The callback.
     * @param options - The options.
     * @param options.password - The password to create the vault with.
     * @param options.groupedAuthConnectionId - Overrides the grouped auth
     * connection ID of the authenticated user.
     * @returns Whatever the callback returns.
     */
    async function withUnlockedController<ReturnValue>(
      fn: (args: ControllerArgs) => Promise<ReturnValue>,
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
          return await fn(args);
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
      const records = await network.envelopeStore.fetchControlRecords(
        deriveControlKeys(vaultKeySet),
      );
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
     * Stores the primary seed phrase in the secret data partition of a
     * vault key set.
     *
     * @param store - The metadata store.
     * @param vaultKeySet - The vault key set.
     */
    function storeSeedPhrase(
      store: MetadataStore,
      vaultKeySet: VaultKeySet,
    ): void {
      store.set(
        bytesToHex(vaultKeySet.authKeyPair.pk),
        new Map([
          [
            'server-item-0',
            {
              encKey: bytesToHex(vaultKeySet.encKey),
              dataType: EncAccountDataType.PrimarySrp,
              data: new SecretMetadata(MOCK_SEED_PHRASE, {
                dataType: EncAccountDataType.PrimarySrp,
              }).toBytes(),
            },
          ],
        ]),
      );
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
      it('registers the Recovery Secret, writes its envelope and the control record, and adopts the vault keys', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient, baseMessenger } = args;
          const network = mockNetwork(toprfClient);
          await authenticateAal2(args, { hasRecoveryShare: false });

          await baseMessenger.call(
            'SeedlessOnboardingController:migrateToEnvelope',
            { recoverySecret: RECOVERY_SECRET },
          );

          const vaultKeySet = vaultKeySetFor();
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
            {
              v: 1,
              seq: 1,
              passwordNamespace: {
                verifier: controller.state.groupedAuthConnectionId,
                verifierId: controller.state.userId,
                authSk: expect.any(String),
                keyIndex: 1,
                enabled: true,
              },
              migratedAt: expect.any(Number),
            },
          ]);
          expect(network.spies.acquireMetadataLock).toHaveBeenCalledWith(
            vaultKeySet.authKeyPair,
          );
          expect(network.spies.releaseMetadataLock).toHaveBeenCalledWith(
            vaultKeySet.authKeyPair,
            LOCK_ID,
          );
          expect(controller.state.envelope).toStrictEqual({
            v: 1,
            vaultAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
            passwordAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
          });
          expect(controller.state.pendingEnvelopeMigration).toBeUndefined();
        });
      });

      it('leaves the secret data and the vault untouched', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient, baseMessenger } = args;
          const network = mockNetwork(toprfClient);
          await authenticateAal2(args, { hasRecoveryShare: false });
          const { vault, authPubKey } = controller.state;

          await baseMessenger.call(
            'SeedlessOnboardingController:migrateToEnvelope',
            { recoverySecret: RECOVERY_SECRET },
          );

          expect(
            network.store.has(bytesToHex(vaultKeySetFor().authKeyPair.pk)),
          ).toBe(false);
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

      it('evaluates an already registered Recovery Secret instead of registering it', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient, baseMessenger } = args;
          const network = mockNetwork(toprfClient, {
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          await authenticateAal2(args, { hasRecoveryShare: true });

          await baseMessenger.call(
            'SeedlessOnboardingController:migrateToEnvelope',
            { recoverySecret: RECOVERY_SECRET },
          );

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
          expect(
            await openStoredEnvelope(
              network,
              RECOVERY_SECRET_HEX,
              'recovery-secret',
            ),
          ).toStrictEqual(vaultKeySetFor());
          expect(controller.state.envelope).toBeDefined();
        });
      });

      it('throws RecoveryKeyShareConflict when the registered key belongs to another Recovery Secret', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient, baseMessenger } = args;
          const network = mockNetwork(toprfClient, {
            recoverySecret: bytesToHex(new Uint8Array(32).fill(8)),
          });
          await authenticateAal2(args, { hasRecoveryShare: true });

          await expect(
            baseMessenger.call(
              'SeedlessOnboardingController:migrateToEnvelope',
              { recoverySecret: RECOVERY_SECRET },
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.RecoveryKeyShareConflict,
          );

          expect(network.spies.addSecretDataItem).not.toHaveBeenCalled();
          expect(controller.state.envelope).toBeUndefined();
          expect(controller.state.pendingEnvelopeMigration).toBeUndefined();
        });
      });

      it('rethrows other recovery verifier errors', async () => {
        await withUnlockedController(async (args) => {
          const { toprfClient, baseMessenger } = args;
          const network = mockNetwork(toprfClient, {
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          network.spies.recoverEncKey.mockRejectedValueOnce(
            new Error('nodes unavailable'),
          );
          await authenticateAal2(args, { hasRecoveryShare: true });

          await expect(
            baseMessenger.call(
              'SeedlessOnboardingController:migrateToEnvelope',
              { recoverySecret: RECOVERY_SECRET },
            ),
          ).rejects.toThrow('nodes unavailable');
          expect(network.spies.addSecretDataItem).not.toHaveBeenCalled();
        });
      });

      it('throws Aal2Required and clears the session when the aal2 tokens expire', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient, baseMessenger } = args;
          const network = mockNetwork(toprfClient, {
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          network.spies.recoverEncKey.mockRejectedValueOnce(
            new TOPRFError(TOPRFErrorCode.AuthTokenExpired, 'expired'),
          );
          await authenticateAal2(args, { hasRecoveryShare: true });

          await expect(
            baseMessenger.call(
              'SeedlessOnboardingController:migrateToEnvelope',
              { recoverySecret: RECOVERY_SECRET },
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.Aal2Required,
          );
          expect(controller.state.recoverySession).toBeUndefined();
        });
      });

      it('completes when resetting the Recovery Secret rate limit fails', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient, baseMessenger } = args;
          const network = mockNetwork(toprfClient, {
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          network.spies.recoverEncKey.mockImplementationOnce(async () => ({
            ...keysFor(RECOVERY_SECRET_HEX),
            keyShareIndex: 1,
            rateLimitResetResult: Promise.reject(new Error('rate limit')),
          }));
          await authenticateAal2(args, { hasRecoveryShare: true });

          await baseMessenger.call(
            'SeedlessOnboardingController:migrateToEnvelope',
            { recoverySecret: RECOVERY_SECRET },
          );

          expect(controller.state.envelope).toBeDefined();
        });
      });

      it('completes when releasing the metadata lock fails', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient, baseMessenger } = args;
          const network = mockNetwork(toprfClient);
          network.spies.releaseMetadataLock.mockRejectedValueOnce(
            new Error('release'),
          );
          await authenticateAal2(args, { hasRecoveryShare: false });

          await baseMessenger.call(
            'SeedlessOnboardingController:migrateToEnvelope',
            { recoverySecret: RECOVERY_SECRET },
          );

          expect(controller.state.envelope).toBeDefined();
        });
      });

      it('names the auth connection as the verifier without a grouped auth connection', async () => {
        await withUnlockedController(
          async (args) => {
            const { controller, toprfClient, baseMessenger } = args;
            const network = mockNetwork(toprfClient);
            await authenticateAal2(args, { hasRecoveryShare: false });

            await baseMessenger.call(
              'SeedlessOnboardingController:migrateToEnvelope',
              { recoverySecret: RECOVERY_SECRET },
            );

            expect(
              (await fetchControlRecords(network))[0].passwordNamespace
                .verifier,
            ).toBe(controller.state.authConnectionId);
          },
          { groupedAuthConnectionId: undefined },
        );
      });

      it('throws InvalidEnvelope when the stored envelope seals other vault keys', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient, baseMessenger } = args;
          const network = mockNetwork(toprfClient);
          const addSecretDataItem =
            network.spies.addSecretDataItem.getMockImplementation();
          network.spies.addSecretDataItem.mockImplementationOnce(
            async (params) =>
              addSecretDataItem?.({
                ...params,
                secretData: serializeEnvelope(
                  await sealEnvelope(
                    deriveTestEnvelopeKeys(stringToBytes(RECOVERY_SECRET_HEX))
                      .wrapKey,
                    'recovery-secret',
                    vaultKeySetFor('other-password'),
                  ),
                ),
              }),
          );
          await authenticateAal2(args, { hasRecoveryShare: false });

          await expect(
            baseMessenger.call(
              'SeedlessOnboardingController:migrateToEnvelope',
              { recoverySecret: RECOVERY_SECRET },
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.InvalidEnvelope,
          );
          expect(controller.state.envelope).toBeUndefined();
        });
      });

      it('throws Aal2Required without a recovery session', async () => {
        await withUnlockedController(async ({ toprfClient, baseMessenger }) => {
          const network = mockNetwork(toprfClient);

          await expect(
            baseMessenger.call(
              'SeedlessOnboardingController:migrateToEnvelope',
              { recoverySecret: RECOVERY_SECRET },
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.Aal2Required,
          );
          expect(network.spies.addSecretDataItem).not.toHaveBeenCalled();
        });
      });

      it('throws OutdatedPassword when the password changed elsewhere', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient, baseMessenger } = args;
          const network = mockNetwork(toprfClient, {
            globalPassword: NEW_PASSWORD,
          });
          await authenticateAal2(args, { hasRecoveryShare: false });

          await expect(
            baseMessenger.call(
              'SeedlessOnboardingController:migrateToEnvelope',
              { recoverySecret: RECOVERY_SECRET },
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.OutdatedPassword,
          );
          expect(network.spies.createLocalKey).not.toHaveBeenCalled();
          expect(network.spies.addSecretDataItem).not.toHaveBeenCalled();
          expect(controller.state.envelope).toBeUndefined();
        });
      });

      it('discards the checkpoint when the password changes before the envelopes are written', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient, baseMessenger } = args;
          const network = mockNetwork(toprfClient);
          network.spies.acquireMetadataLock.mockImplementationOnce(async () => {
            network.setGlobalPassword(NEW_PASSWORD);
            return LOCK_ID;
          });
          await authenticateAal2(args, { hasRecoveryShare: false });

          await expect(
            baseMessenger.call(
              'SeedlessOnboardingController:migrateToEnvelope',
              { recoverySecret: RECOVERY_SECRET },
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.OutdatedPassword,
          );

          expect(network.spies.addSecretDataItem).not.toHaveBeenCalled();
          expect(network.spies.releaseMetadataLock).toHaveBeenCalledWith(
            vaultKeySetFor().authKeyPair,
            LOCK_ID,
          );
          expect(controller.state.pendingEnvelopeMigration).toBeUndefined();
          expect(controller.state.envelope).toBeUndefined();
        });
      });

      it('resumes from the checkpoint after a failed write', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient, baseMessenger } = args;
          const network = mockNetwork(toprfClient);
          network.spies.addSecretDataItem.mockRejectedValueOnce(
            new Error('network'),
          );
          await authenticateAal2(args, { hasRecoveryShare: false });

          await expect(
            baseMessenger.call(
              'SeedlessOnboardingController:migrateToEnvelope',
              { recoverySecret: RECOVERY_SECRET },
            ),
          ).rejects.toThrow('network');
          expect(controller.state.pendingEnvelopeMigration).toStrictEqual(
            expect.any(String),
          );
          expect(controller.state.envelope).toBeUndefined();
          const recoverEncKeyCalls =
            network.spies.recoverEncKey.mock.calls.length;

          await baseMessenger.call(
            'SeedlessOnboardingController:migrateToEnvelope',
            { recoverySecret: RECOVERY_SECRET },
          );

          expect(network.spies.recoverEncKey).toHaveBeenCalledTimes(
            recoverEncKeyCalls,
          );
          expect(network.spies.createLocalKey).toHaveBeenCalledTimes(1);
          expect(network.spies.persistLocalKey).toHaveBeenCalledTimes(1);
          expect(
            await openStoredEnvelope(
              network,
              RECOVERY_SECRET_HEX,
              'recovery-secret',
            ),
          ).toStrictEqual(vaultKeySetFor());
          expect(controller.state.pendingEnvelopeMigration).toBeUndefined();
          expect(controller.state.envelope).toBeDefined();
        });
      });

      it('re-seals when the checkpoint belongs to another Recovery Secret', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient, baseMessenger } = args;
          const otherSecret = new Uint8Array(32).fill(9);
          const network = mockNetwork(toprfClient);
          network.spies.addSecretDataItem.mockRejectedValueOnce(
            new Error('network'),
          );
          await authenticateAal2(args, { hasRecoveryShare: false });
          await expect(
            baseMessenger.call(
              'SeedlessOnboardingController:migrateToEnvelope',
              { recoverySecret: otherSecret },
            ),
          ).rejects.toThrow('network');
          // the escrow registration was redone with another Recovery Secret
          network.registerRecoverySecret(RECOVERY_SECRET_HEX);

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
          expect(controller.state.envelope).toBeDefined();
        });
      });

      it('throws InvalidEnvelope when an envelope does not read back', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient, baseMessenger } = args;
          const network = mockNetwork(toprfClient);
          network.spies.addSecretDataItem.mockResolvedValueOnce(undefined);
          await authenticateAal2(args, { hasRecoveryShare: false });

          await expect(
            baseMessenger.call(
              'SeedlessOnboardingController:migrateToEnvelope',
              { recoverySecret: RECOVERY_SECRET },
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.InvalidEnvelope,
          );
          expect(controller.state.envelope).toBeUndefined();
          expect(controller.state.pendingEnvelopeMigration).toBeDefined();
        });
      });

      it('throws InvalidEnvelope when the control record does not read back', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient, baseMessenger } = args;
          mockNetwork(toprfClient, {
            droppedDataTypes: [EncAccountDataType.EnvelopeControl],
          });
          await authenticateAal2(args, { hasRecoveryShare: false });

          await expect(
            baseMessenger.call(
              'SeedlessOnboardingController:migrateToEnvelope',
              { recoverySecret: RECOVERY_SECRET },
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.InvalidEnvelope,
          );
          expect(controller.state.envelope).toBeUndefined();
        });
      });

      it('does nothing when the vault is already envelope-managed', async () => {
        await withUnlockedController(async (args) => {
          const network = mockNetwork(args.toprfClient);
          await migrate(args, network);

          await args.baseMessenger.call(
            'SeedlessOnboardingController:migrateToEnvelope',
            { recoverySecret: RECOVERY_SECRET },
          );

          expect(network.spies.fetchAuthPubKey).not.toHaveBeenCalled();
          expect(network.spies.addSecretDataItem).not.toHaveBeenCalled();
        });
      });

      it('adopts the envelope state when another device migrated the same vault', async () => {
        const store: MetadataStore = new Map();
        await withUnlockedController(async (args) => {
          await migrate(args, mockNetwork(args.toprfClient, { store }));
        });

        await withUnlockedController(async ({ controller, toprfClient }) => {
          const network = mockNetwork(toprfClient, { store });
          expect(controller.state.envelope).toBeUndefined();

          await controller.migrateToEnvelope({
            recoverySecret: RECOVERY_SECRET,
          });

          expect(network.spies.createLocalKey).not.toHaveBeenCalled();
          expect(network.spies.addSecretDataItem).not.toHaveBeenCalled();
          expect(await fetchControlRecords(network)).toHaveLength(1);
          expect(controller.state.envelope).toStrictEqual({
            v: 1,
            vaultAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
            passwordAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
          });
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

          await expect(
            args.baseMessenger.call(
              'SeedlessOnboardingController:migrateToEnvelope',
              { recoverySecret: RECOVERY_SECRET },
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.EnvelopeMigrationRequiresDataTypes,
          );
          expect(network.spies.createLocalKey).not.toHaveBeenCalled();
        });
      });

      it('throws ControllerLocked when locked', async () => {
        await withUnlockedController(async ({ baseMessenger }) => {
          await baseMessenger.call('SeedlessOnboardingController:setLocked');

          await expect(
            baseMessenger.call(
              'SeedlessOnboardingController:migrateToEnvelope',
              { recoverySecret: RECOVERY_SECRET },
            ),
          ).rejects.toThrow(
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
          network.store.delete(
            bytesToHex(deriveControlKeys(vaultKeySetFor()).ctrlAuth.pk),
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

      it('falls back to the legacy layout when the global password has no envelope', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient } = args;
          const network = mockNetwork(toprfClient);
          await migrate(args, network);
          network.setGlobalPassword(NEW_PASSWORD);

          await controller.syncLatestGlobalPassword({
            globalPassword: NEW_PASSWORD,
          });

          expect(controller.state.envelope).toBeUndefined();
          expect(controller.state.authPubKey).toBe(authPubKeyOf(NEW_PASSWORD));
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

    describe('fetchAllSecretData with a password on a new device', () => {
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

          const secrets = await controller.fetchAllSecretData(NEW_PASSWORD);

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

      it('keeps a pending password reset when the vault is restored with the global password', async () => {
        const store = await createMigratedAccount();

        await withNewDeviceController(async (args) => {
          const { controller, toprfClient, baseMessenger } = args;
          mockNetwork(toprfClient, {
            store,
            globalPassword: NEW_PASSWORD,
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          await recover(args);

          await controller.fetchAllSecretData(NEW_PASSWORD);

          expect(controller.state.isLocalPassword).toBe(true);
          await expect(
            baseMessenger.call(
              'SeedlessOnboardingController:changePassword',
              'changed-password',
              NEW_PASSWORD,
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.PasswordResetPending,
          );
        });
      });

      it('restores a migrated vault with the password keys before any envelope password change', async () => {
        const store: MetadataStore = new Map();
        await withUnlockedController(async (args) => {
          await migrate(args, mockNetwork(args.toprfClient, { store }));
        });
        storeSeedPhrase(store, vaultKeySetFor());

        await withNewDeviceController(async ({ controller, toprfClient }) => {
          mockNetwork(toprfClient, { store });

          const secrets = await controller.fetchAllSecretData(MOCK_PASSWORD);

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

          const secrets = await controller.fetchAllSecretData(MOCK_PASSWORD);

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
            controller.fetchAllSecretData(MOCK_PASSWORD),
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

      it('reports the password as outdated after the local vault is created', async () => {
        const store = await createMigratedAccount();

        await withNewDeviceController(async (args) => {
          const { controller, toprfClient } = args;
          mockNetwork(toprfClient, {
            store,
            globalPassword: NEW_PASSWORD,
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          await recover(args);

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
          });
          expect(controller.state.isLocalPassword).toBe(true);
          expect(
            await controller.verifyVaultPassword(RECOVERED_PASSWORD),
          ).toBeUndefined();
        });
      });

      it('blocks syncLatestGlobalPassword until the password is reset', async () => {
        const store = await createMigratedAccount();

        await withNewDeviceController(async (args) => {
          const { controller, toprfClient } = args;
          const network = mockNetwork(toprfClient, {
            store,
            globalPassword: NEW_PASSWORD,
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          await recover(args);
          network.spies.recoverEncKey.mockClear();

          await expect(
            controller.syncLatestGlobalPassword({
              globalPassword: NEW_PASSWORD,
            }),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.PasswordResetPending,
          );
          expect(network.spies.recoverEncKey).not.toHaveBeenCalled();
          expect(
            await controller.verifyVaultPassword(RECOVERED_PASSWORD),
          ).toBeUndefined();
        });
      });

      it('blocks changePassword until the password is reset', async () => {
        const store = await createMigratedAccount();

        await withNewDeviceController(async (args) => {
          const { controller, toprfClient, baseMessenger } = args;
          const network = mockNetwork(toprfClient, {
            store,
            globalPassword: NEW_PASSWORD,
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          await recover(args);

          await expect(
            baseMessenger.call(
              'SeedlessOnboardingController:changePassword',
              'changed-password',
              RECOVERED_PASSWORD,
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.PasswordResetPending,
          );
          expect(network.spies.persistLocalKey).not.toHaveBeenCalled();
          expect(
            await controller.verifyVaultPassword(RECOVERED_PASSWORD),
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

            await baseMessenger.call(action);
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

          const secrets =
            await controller.fetchAllSecretData(RECOVERED_PASSWORD);

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
          expect(controller.state.envelope?.passwordAuthPubKey).toBeUndefined();
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
