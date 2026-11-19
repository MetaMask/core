import type { AnalyticsTrackingEvent } from '@metamask/analytics-controller';
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
  bigIntToHex,
  bytesToBase64,
  bytesToHex,
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
  parseEnvelope,
  sealEnvelope,
  serializeControlRecord,
  serializeEnvelope,
} from './envelope/envelope-keys.js';
import type { ControlRecord, VaultKeySet } from './envelope/envelope-keys.js';
import { EnvelopeStore } from './envelope/EnvelopeStore.js';
import { SecretMetadata } from './SecretMetadata.js';
import { getEnvelopeStatus } from './state.js';
import type {
  AuthenticatedUserDetails,
  SeedlessOnboardingControllerState,
} from './types.js';
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
    const RECOVERY_REQUEST = {
      nodeAuthTokens: AAL2_NODE_AUTH_TOKENS,
      authConnectionId: AAL2_AUTH_CONNECTION_ID,
      groupedAuthConnectionId: AAL2_GROUPED_AUTH_CONNECTION_ID,
      userId: AAL2_USER_ID,
    };
    const PASSWORD_REQUEST = {
      nodeAuthTokens: MOCK_NODE_AUTH_TOKENS,
      authConnectionId: MOCK_AUTH_CONNECTION_ID,
      groupedAuthConnectionId: MOCK_GROUPED_AUTH_CONNECTION_ID,
      userId: MOCK_USER_ID,
    };

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
      | 'batchAddSecretDataItems'
      | 'fetchAllSecretDataItems'
      | 'acquireMetadataLock'
      | 'releaseMetadataLock';

    /**
     * An OPRF key held by the nodes: the password or Recovery Secret it
     * evaluates, and the seed the evaluation yields.
     */
    type OprfKey = { password: string; seed: string };

    type MockNetwork = {
      store: MetadataStore;
      setGlobalPassword: (password: string) => void;
      getRecoveryKey: () => OprfKey | undefined;
      getCreatedKeys: () => OprfKey[];
      envelopeStore: EnvelopeStore;
      spies: {
        [Method in SpiedMethod]: MockInstance<ToprfSecureBackup[Method]>;
      };
    };

    /**
     * @param authConnectionId - The auth connection ID of a TOPRF request.
     * @returns Whether the request is for the recovery verifier.
     */
    function isRecovery(authConnectionId: string): boolean {
      return authConnectionId === AAL2_AUTH_CONNECTION_ID;
    }

    /**
     * Mocks the TOPRF nodes and the metadata store for both verifiers.
     *
     * The password verifier answers for the current global password, the
     * recovery verifier for the committed Recovery Secret OPRF key, and
     * `fetchAuthPubKey` on the recovery verifier throws
     * `CouldNotDeriveThresholdAuthPubKey` while it holds none. Each
     * `createLocalKey` picks a fresh OPRF key, so its seed is the password
     * the first time and differs on every later call for the same password.
     *
     * Metadata items are kept per partition (auth public key) and only
     * decrypt under the key they were written with. Like the Metadata
     * Service, `addSecretDataItem` is rejected while the partition is locked
     * and `batchAddSecretDataItems` requires the lock.
     *
     * @param toprfClient - The ToprfSecureBackup instance.
     * @param options - The options.
     * @param options.store - The metadata store, shared between devices.
     * @param options.globalPassword - The global password.
     * @param options.recoverySecret - The Recovery Secret whose OPRF key the
     * recovery verifier holds, if any.
     * @param options.recoverySeed - The seed of that key. Defaults to the
     * Recovery Secret.
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
        recoverySeed = recoverySecret,
        droppedDataTypes = [],
      }: {
        store?: MetadataStore;
        globalPassword?: string;
        recoverySecret?: string;
        recoverySeed?: string;
        droppedDataTypes?: EncAccountDataType[];
      } = {},
    ): MockNetwork {
      let globalKey = {
        password: globalPassword,
        seed: globalPassword,
        keyIndex: 1,
      };
      let recoveryKey: OprfKey | undefined =
        recoverySecret === undefined || recoverySeed === undefined
          ? undefined
          : { password: recoverySecret, seed: recoverySeed };
      const createdKeys: OprfKey[] = [];
      const lockedPartitions = new Map<string, string>();

      const storeItem = (
        partitionId: string,
        item: StoredItem,
        itemId?: string,
      ): void => {
        if (
          item.dataType !== undefined &&
          droppedDataTypes.includes(item.dataType)
        ) {
          return;
        }
        const partition = store.get(partitionId) ?? new Map();
        partition.set(itemId ?? `server-item-${partition.size}`, item);
        store.set(partitionId, partition);
      };

      const spies = {
        fetchAuthPubKey: vi
          .spyOn(toprfClient, 'fetchAuthPubKey')
          .mockImplementation(async ({ authConnectionId }) => {
            if (!isRecovery(authConnectionId)) {
              return {
                authPubKey: keysFor(globalKey.seed).authKeyPair.pk,
                keyIndex: globalKey.keyIndex,
              };
            }
            if (!recoveryKey) {
              throw TOPRFError.couldNotDeriveThresholdAuthPubKey();
            }
            return {
              authPubKey: keysFor(recoveryKey.seed).authKeyPair.pk,
              keyIndex: 1,
            };
          }),
        recoverEncKey: vi
          .spyOn(toprfClient, 'recoverEncKey')
          .mockImplementation(async ({ authConnectionId, password }) => {
            const key = isRecovery(authConnectionId) ? recoveryKey : globalKey;
            if (!key || password !== key.password) {
              throw new TOPRFError(
                TOPRFErrorCode.CouldNotDeriveEncryptionKey,
                'could not derive',
              );
            }
            return {
              ...keysFor(key.seed),
              keyShareIndex: globalKey.keyIndex,
              rateLimitResetResult: Promise.resolve(),
            };
          }),
        createLocalKey: vi
          .spyOn(toprfClient, 'createLocalKey')
          .mockImplementation(async ({ password }) => {
            const attempt = createdKeys.filter(
              (key) => key.password === password,
            ).length;
            const seed = attempt === 0 ? password : `${password}#${attempt}`;
            createdKeys.push({ password, seed });
            return {
              ...keysFor(seed),
              seed: stringToBytes(seed),
              oprfKey: BigInt(4 + createdKeys.length),
            };
          }),
        persistLocalKey: vi
          .spyOn(toprfClient, 'persistLocalKey')
          .mockImplementation(async ({ authConnectionId, authPubKey }) => {
            const key = createdKeys.find(({ seed }) =>
              pubKeysMatch(keysFor(seed).authKeyPair.pk, authPubKey),
            );
            if (!key) {
              throw new Error('persisting an unknown key');
            }
            if (isRecovery(authConnectionId)) {
              recoveryKey = key;
            } else {
              globalKey = { ...key, keyIndex: globalKey.keyIndex + 1 };
            }
          }),
        addSecretDataItem: vi
          .spyOn(toprfClient, 'addSecretDataItem')
          .mockImplementation(
            async ({ encKey, authKeyPair, secretData, itemId, dataType }) => {
              const partitionId = bytesToHex(authKeyPair.pk);
              if (lockedPartitions.has(partitionId)) {
                throw new Error('partition is locked');
              }
              storeItem(
                partitionId,
                { encKey: bytesToHex(encKey), dataType, data: secretData },
                itemId,
              );
            },
          ),
        batchAddSecretDataItems: vi
          .spyOn(toprfClient, 'batchAddSecretDataItems')
          .mockImplementation(async ({ encKey, authKeyPair, secretData }) => {
            const partitionId = bytesToHex(authKeyPair.pk);
            if (!lockedPartitions.has(partitionId)) {
              throw new Error('partition is not locked');
            }
            secretData.forEach(({ data, itemId, dataType }, index) => {
              const itemEncKey = Array.isArray(encKey) ? encKey[index] : encKey;
              storeItem(
                partitionId,
                { encKey: bytesToHex(itemEncKey), dataType, data },
                itemId,
              );
            });
          }),
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
          .mockImplementation(async (authKeyPair) => {
            const partitionId = bytesToHex(authKeyPair.pk);
            if (lockedPartitions.has(partitionId)) {
              throw new Error('partition is already locked');
            }
            lockedPartitions.set(partitionId, LOCK_ID);
            return LOCK_ID;
          }),
        releaseMetadataLock: vi
          .spyOn(toprfClient, 'releaseMetadataLock')
          .mockImplementation(async (authKeyPair, lockId) => {
            const partitionId = bytesToHex(authKeyPair.pk);
            if (lockedPartitions.get(partitionId) === lockId) {
              lockedPartitions.delete(partitionId);
            }
          }),
      };

      return {
        store,
        setGlobalPassword: (password) => {
          globalKey = {
            password,
            seed: password,
            keyIndex: globalKey.keyIndex + 1,
          };
        },
        getRecoveryKey: () => recoveryKey,
        getCreatedKeys: () => [...createdKeys],
        envelopeStore: new EnvelopeStore({ getToprfClient: () => toprfClient }),
        spies,
      };
    }

    /**
     * @param a - A public key.
     * @param b - Another public key.
     * @returns Whether both keys have the same bytes.
     */
    function pubKeysMatch(a: Uint8Array, b: Uint8Array): boolean {
      return bytesToHex(a) === bytesToHex(b);
    }

    /**
     * Runs a callback before the first call of a TOPRF client method, then
     * keeps the mock implementation.
     *
     * @param spy - The spied method.
     * @param callback - The callback.
     */
    function beforeFirstCall<
      Fn extends (...params: never[]) => Promise<unknown>,
    >(spy: MockInstance<Fn>, callback: () => void): void {
      const implementation = spy.getMockImplementation() as unknown as (
        ...params: Parameters<Fn>
      ) => Promise<unknown>;
      spy.mockImplementationOnce((async (...params: Parameters<Fn>) => {
        callback();
        return await implementation(...params);
      }) as unknown as Parameters<MockInstance<Fn>['mockImplementation']>[0]);
    }

    /**
     * @param network - The mock network.
     * @param index - The index of the `createLocalKey` call.
     * @returns The result of the call.
     */
    async function readCreatedLocalKey(
      network: MockNetwork,
      index = 0,
    ): Promise<Awaited<ReturnType<ToprfSecureBackup['createLocalKey']>>> {
      return await (network.spies.createLocalKey.mock.results[index]
        .value as ReturnType<ToprfSecureBackup['createLocalKey']>);
    }

    /**
     * Makes the first call of a TOPRF client method that matches reject.
     * Other calls keep the mock implementation.
     *
     * @param spy - The spied method.
     * @param matches - Selects the call to fail. Defaults to the first call.
     * @param error - The rejection. Defaults to an error `network`.
     */
    function failOnce<Fn extends (params: never) => Promise<unknown>>(
      spy: MockInstance<Fn>,
      matches?: (params: Parameters<Fn>[0]) => boolean,
      error: Error = new Error('network'),
    ): void {
      const implementation = spy.getMockImplementation() as unknown as (
        params: Parameters<Fn>[0],
      ) => Promise<unknown>;
      let failed = false;
      spy.mockImplementation((async (params: Parameters<Fn>[0]) => {
        if (!failed && (matches?.(params) ?? true)) {
          failed = true;
          throw error;
        }
        return await implementation(params);
      }) as unknown as Parameters<MockInstance<Fn>['mockImplementation']>[0]);
    }

    /**
     * @param network - The mock network.
     * @param authKeyPair - The auth key pair of a metadata partition.
     * @returns `vault` for the vault partition, `rbek` for a Recovery Secret
     * envelope partition, `pbek` for a password envelope partition, or the
     * hex public key otherwise.
     */
    function partitionOf(network: MockNetwork, authKeyPair: KeyPair): string {
      if (pubKeysMatch(authKeyPair.pk, vaultKeySetFor().authKeyPair.pk)) {
        return 'vault';
      }
      const key = network
        .getCreatedKeys()
        .find(({ seed }) =>
          pubKeysMatch(
            keysFor(seed).envelopeKeys.authKeyPair.pk,
            authKeyPair.pk,
          ),
        );
      if (key) {
        return key.password === RECOVERY_SECRET_HEX ? 'rbek' : 'pbek';
      }
      return bytesToHex(authKeyPair.pk);
    }

    /**
     * Labels a TOPRF client call with the verifier or the metadata partition
     * it addresses.
     *
     * @param network - The mock network.
     * @param method - The called method.
     * @param params - The first call argument.
     * @returns The label.
     */
    function labelCall(
      network: MockNetwork,
      method: SpiedMethod,
      params: unknown,
    ): string {
      switch (method) {
        case 'fetchAuthPubKey':
        case 'recoverEncKey':
        case 'persistLocalKey': {
          const { authConnectionId } = params as { authConnectionId: string };
          return `${method}:${isRecovery(authConnectionId) ? 'recovery' : 'password'}`;
        }
        case 'addSecretDataItem':
        case 'batchAddSecretDataItems':
        case 'fetchAllSecretDataItems': {
          const { authKeyPair } = params as { authKeyPair: KeyPair };
          return `${method}:${partitionOf(network, authKeyPair)}`;
        }
        case 'acquireMetadataLock':
        case 'releaseMetadataLock':
          return `${method}:${partitionOf(network, params as KeyPair)}`;
        default:
          return method;
      }
    }

    /**
     * Merges the TOPRF client calls and, optionally, the analytics events
     * into one ordered list.
     *
     * @param network - The mock network.
     * @param trackEvent - The analytics handler.
     * @returns The labels, in call order.
     */
    function readTimeline(
      network: MockNetwork,
      trackEvent?: Mock<(event: AnalyticsTrackingEvent) => void>,
    ): string[] {
      const entries: { order: number; label: string }[] = [];
      for (const method of Object.keys(network.spies) as SpiedMethod[]) {
        const { mock } = network.spies[method] as unknown as MockInstance<
          (params: unknown) => unknown
        >;
        mock.calls.forEach(([params], index) => {
          entries.push({
            order: mock.invocationCallOrder[index],
            label: labelCall(network, method, params),
          });
        });
      }
      trackEvent?.mock.calls.forEach(([{ properties }], index) => {
        entries.push({
          order: trackEvent.mock.invocationCallOrder[index],
          label: `trackEvent:${properties.phase as string}`,
        });
      });
      return entries
        .sort((a, b) => a.order - b.order)
        .map(({ label }) => label);
    }

    /**
     * Stores a control record in the vault partition of a vault key set,
     * bypassing the metadata lock.
     *
     * @param store - The metadata store.
     * @param record - The control record.
     * @param vaultKeySet - The vault key set.
     */
    function storeControlRecord(
      store: MetadataStore,
      record: ControlRecord,
      vaultKeySet: VaultKeySet = vaultKeySetFor(),
    ): void {
      const partitionId = bytesToHex(vaultKeySet.authKeyPair.pk);
      const partition = store.get(partitionId) ?? new Map();
      partition.set(`server-control-${partition.size}`, {
        encKey: bytesToHex(vaultKeySet.encKey),
        dataType: EncAccountDataType.EnvelopeControl,
        data: serializeControlRecord(record),
      });
      store.set(partitionId, partition);
    }

    /**
     * @param store - The metadata store.
     * @returns The number of stored Recovery Secret envelopes, across all
     * partitions.
     */
    function countStoredRecoveryEnvelopes(store: MetadataStore): number {
      let count = 0;
      for (const partition of store.values()) {
        for (const { dataType, data } of partition.values()) {
          if (
            dataType === EncAccountDataType.KeyEnvelope &&
            parseEnvelope(data).path === 'recovery-secret'
          ) {
            count += 1;
          }
        }
      }
      return count;
    }

    /**
     * Deletes the Recovery Secret envelopes from every partition.
     *
     * @param store - The metadata store.
     */
    function deleteStoredRecoveryEnvelopes(store: MetadataStore): void {
      for (const partition of store.values()) {
        for (const [itemId, { dataType, data }] of partition) {
          if (
            dataType === EncAccountDataType.KeyEnvelope &&
            parseEnvelope(data).path === 'recovery-secret'
          ) {
            partition.delete(itemId);
          }
        }
      }
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
     * @param state - The controller state.
     * @returns The social login of the authenticated user.
     * @throws If no user is authenticated.
     */
    function socialLoginOf(
      state: SeedlessOnboardingControllerState,
    ): Pick<
      AuthenticatedUserDetails,
      | 'authConnection'
      | 'authConnectionId'
      | 'groupedAuthConnectionId'
      | 'userId'
    > {
      const {
        authConnection,
        authConnectionId,
        groupedAuthConnectionId,
        userId,
      } = state;
      if (!authConnection || !authConnectionId || !userId) {
        throw new Error('no authenticated user');
      }
      return {
        authConnection,
        authConnectionId,
        groupedAuthConnectionId,
        userId,
      };
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
      await authenticateAal2(args, { hasRecoveryShare: true });
      return await args.baseMessenger.call(
        'SeedlessOnboardingController:recoverWithRecoverySecret',
        { recoverySecret: RECOVERY_SECRET, password },
      );
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
      const WRITE_PATH = [
        'fetchAuthPubKey:recovery',
        'createLocalKey',
        'addSecretDataItem:rbek',
        'fetchAllSecretDataItems:rbek',
        'persistLocalKey:recovery',
        'acquireMetadataLock:vault',
        'batchAddSecretDataItems:vault',
        'releaseMetadataLock:vault',
      ];

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
       * @param options - The options.
       * @param options.password - The password of the live password key.
       * @param options.vaultPassword - The password the vault keys derive
       * from.
       * @returns The envelope state of the migrated vault.
       */
      function expectedEnvelopeState({
        password = MOCK_PASSWORD,
        vaultPassword = MOCK_PASSWORD,
      }: {
        password?: string;
        vaultPassword?: string;
      } = {}): SeedlessOnboardingControllerState['envelope'] {
        return {
          v: 1,
          vaultAuthPubKey: authPubKeyOf(vaultPassword),
          passwordAuthPubKey: authPubKeyOf(password),
        };
      }

      /**
       * @param options - The options.
       * @param options.keyIndex - The key index of the password OPRF key.
       * @param options.verifier - The password verifier.
       * @param options.vaultPassword - The password the vault keys derive
       * from.
       * @returns The first control record of the vault.
       */
      function expectedControlRecord({
        keyIndex = 1,
        verifier = MOCK_GROUPED_AUTH_CONNECTION_ID,
        vaultPassword = MOCK_PASSWORD,
      }: {
        keyIndex?: number;
        verifier?: string;
        vaultPassword?: string;
      } = {}): ControlRecord {
        return {
          v: 1,
          seq: 1,
          passwordNamespace: {
            verifier,
            verifierId: MOCK_USER_ID,
            authSk: bigIntToHex(vaultKeySetFor(vaultPassword).authKeyPair.sk),
            keyIndex,
          },
          migratedAt: expect.any(Number),
        };
      }

      /**
       * @param phase - The reported phase.
       * @param partial - Whether the recovery verifier already held a
       * Recovery Secret OPRF key when the attempt started.
       * @returns The checkpoint analytics event.
       */
      function checkpointEvent(
        phase: 'STARTED' | 'COMPLETED',
        partial: boolean,
      ): AnalyticsTrackingEvent {
        return {
          name: SeedlessEnvelopeMigrationCheckpointEventName,
          properties: { phase, partial },
          sensitiveProperties: {},
          saveDataRecording: false,
          hasProperties: true,
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
       * @param network - The mock network.
       * @returns The write path calls, in call order.
       */
      function readWritePath(network: MockNetwork): string[] {
        return readTimeline(network).filter((label) =>
          WRITE_PATH.includes(label),
        );
      }

      /**
       * @param network - The mock network.
       * @returns The calls made while the vault partition was locked.
       */
      function readLockedCalls(network: MockNetwork): string[] {
        const timeline = readTimeline(network);
        return timeline.slice(
          timeline.indexOf('acquireMetadataLock:vault') + 1,
          timeline.indexOf('releaseMetadataLock:vault'),
        );
      }

      /**
       * @param network - The mock network.
       * @param label - The call label.
       * @returns How often the call was made.
       */
      function countCalls(network: MockNetwork, label: string): number {
        return readTimeline(network).filter((entry) => entry === label).length;
      }

      /**
       * @param network - The mock network.
       */
      function expectNoMigrationWrites(network: MockNetwork): void {
        expect(network.spies.createLocalKey).not.toHaveBeenCalled();
        expect(network.spies.addSecretDataItem).not.toHaveBeenCalled();
        expect(network.spies.batchAddSecretDataItems).not.toHaveBeenCalled();
        expect(network.spies.persistLocalKey).not.toHaveBeenCalled();
      }

      /**
       * Makes the first password verifier request under the vault lock fail.
       *
       * @param network - The mock network.
       */
      function failPasswordCheckUnderLock(network: MockNetwork): void {
        failOnce(
          network.spies.fetchAuthPubKey,
          ({ authConnectionId }) =>
            !isRecovery(authConnectionId) &&
            network.spies.acquireMetadataLock.mock.calls.length > 0,
        );
      }

      /**
       * @param controller - The controller.
       */
      function removeRecoverySession(
        controller: ControllerArgs['controller'],
      ): void {
        updateState(controller, (state) => {
          delete state.recoverySession;
        });
      }

      /**
       * Moves the clock past the expiry of the recovery session.
       */
      function expireRecoverySession(): void {
        vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2 * 60 * 60 * 1000);
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
                      params.encKey,
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
       * Makes the first `persistLocalKey` call commit the key at the nodes,
       * then fail as if its response was lost.
       *
       * @param network - The mock network.
       */
      function loseFirstCommitResponse(network: MockNetwork): void {
        const persistLocalKey =
          network.spies.persistLocalKey.getMockImplementation();
        network.spies.persistLocalKey.mockImplementationOnce(async (params) => {
          await persistLocalKey?.(params);
          throw new Error('network');
        });
      }

      /**
       * Mocks a legacy password change at the nodes: the vault partition
       * moves to the keys of the new password, which becomes global.
       *
       * @param toprfClient - The ToprfSecureBackup instance.
       * @param network - The mock network.
       */
      function mockLegacyChangeEncKey(
        toprfClient: ToprfSecureBackup,
        network: MockNetwork,
      ): void {
        vi.spyOn(toprfClient, 'changeEncKey').mockImplementation(
          async ({
            oldEncKey,
            oldAuthKeyPair,
            newPassword,
            transformDataItems,
          }) => {
            const items = await toprfClient.fetchAllSecretDataItems({
              decKey: oldEncKey,
              authKeyPair: oldAuthKeyPair,
            });
            transformDataItems?.(items);
            const { encKey, pwEncKey, authKeyPair } = keysFor(
              newPassword as string,
            );
            const oldPartitionId = bytesToHex(oldAuthKeyPair.pk);
            const moved = new Map(
              [...(network.store.get(oldPartitionId) ?? [])].map(
                ([itemId, item]) => [
                  itemId,
                  { ...item, encKey: bytesToHex(encKey) },
                ],
              ),
            );
            network.store.delete(oldPartitionId);
            network.store.set(bytesToHex(authKeyPair.pk), moved);
            network.setGlobalPassword(newPassword as string);
            return { encKey, pwEncKey, authKeyPair };
          },
        );
      }

      /**
       * Recovers the secrets with the Recovery Secret on a new device that
       * shares the metadata store and the nodes of `network`.
       *
       * @param network - The mock network.
       * @param options - The options.
       * @param options.globalPassword - The global password.
       * @param options.vaultPassword - The password the vault keys derive
       * from.
       * @returns The recovered secrets.
       */
      async function recoverOnNewDevice(
        network: MockNetwork,
        {
          globalPassword = MOCK_PASSWORD,
          vaultPassword = MOCK_PASSWORD,
        }: { globalPassword?: string; vaultPassword?: string } = {},
      ): Promise<SecretMetadata[]> {
        const recoveryKey = network.getRecoveryKey();
        storeSeedPhrase(network.store, vaultKeySetFor(vaultPassword));
        return await withNewDeviceController(async (args) => {
          mockNetwork(args.toprfClient, {
            store: network.store,
            globalPassword,
            recoverySecret: recoveryKey?.password,
            recoverySeed: recoveryKey?.seed,
          });
          return await recover(args);
        });
      }

      describe('without a Recovery Secret OPRF key at the nodes', () => {
        it('registers a fresh Recovery Secret OPRF key, writes the Recovery Secret envelope and the control record, and adopts the vault keys', async () => {
          await withUnlockedController(async (args) => {
            const { controller, toprfClient } = args;
            const network = mockNetwork(toprfClient);
            await authenticateAal2(args, { hasRecoveryShare: false });

            await migrateToEnvelope(args);

            expect(network.spies.createLocalKey).toHaveBeenCalledTimes(1);
            expect(network.spies.createLocalKey).toHaveBeenCalledWith({
              password: RECOVERY_SECRET_HEX,
            });
            const { oprfKey, authKeyPair, seed } =
              await readCreatedLocalKey(network);
            expect(seed.every((byte) => byte === 0)).toBe(true);
            expect(network.spies.persistLocalKey).toHaveBeenCalledTimes(1);
            expect(network.spies.persistLocalKey).toHaveBeenCalledWith({
              ...RECOVERY_REQUEST,
              oprfKey,
              authPubKey: authKeyPair.pk,
            });
            expect(network.getRecoveryKey()).toStrictEqual({
              password: RECOVERY_SECRET_HEX,
              seed: RECOVERY_SECRET_HEX,
            });
            expect(network.spies.recoverEncKey).not.toHaveBeenCalled();
            expect(
              await openStoredEnvelope(
                network,
                RECOVERY_SECRET_HEX,
                'recovery-secret',
              ),
            ).toStrictEqual(vaultKeySetFor());
            expect(
              await openStoredEnvelope(network, MOCK_PASSWORD, 'password'),
            ).toBeUndefined();
            expect(await fetchControlRecords(network)).toStrictEqual([
              expectedControlRecord(),
            ]);
            expect(controller.state.recoverySession?.hasRecoveryShare).toBe(
              true,
            );
            expect(controller.state.envelope).toStrictEqual(
              expectedEnvelopeState(),
            );
            expect(controller.state).not.toHaveProperty(
              'pendingEnvelopeMigration',
            );
          });
        });

        it('writes and reads back the Recovery Secret envelope and registers the Recovery Secret OPRF key outside the vault lock, then writes the control record under it last', async () => {
          await withUnlockedController(async (args) => {
            const network = mockNetwork(args.toprfClient);
            await authenticateAal2(args, { hasRecoveryShare: false });

            await migrateToEnvelope(args);

            expect(readWritePath(network)).toStrictEqual(WRITE_PATH);
            expect(
              readTimeline(network).filter((label) =>
                /^(addSecretDataItem|batchAddSecretDataItems|persistLocalKey)/u.test(
                  label,
                ),
              ),
            ).toStrictEqual([
              'addSecretDataItem:rbek',
              'persistLocalKey:recovery',
              'batchAddSecretDataItems:vault',
            ]);
          });
        });

        it('checks the recovery verifier with the recovery session before anything else', async () => {
          await withUnlockedController(async (args) => {
            const network = mockNetwork(args.toprfClient);
            await authenticateAal2(args, { hasRecoveryShare: false });

            await migrateToEnvelope(args);

            expect(readTimeline(network)[0]).toBe('fetchAuthPubKey:recovery');
            expect(network.spies.fetchAuthPubKey).toHaveBeenCalledWith(
              RECOVERY_REQUEST,
            );
          });
        });

        it('re-checks the live password key with aal1 tokens, and the control records, under the vault lock', async () => {
          await withUnlockedController(async (args) => {
            const network = mockNetwork(args.toprfClient);
            await authenticateAal2(args, { hasRecoveryShare: false });

            await migrateToEnvelope(args);

            expect(readLockedCalls(network)).toStrictEqual([
              'fetchAuthPubKey:password',
              'fetchAllSecretDataItems:vault',
              'batchAddSecretDataItems:vault',
              'fetchAllSecretDataItems:vault',
            ]);
            expect(network.spies.fetchAuthPubKey).toHaveBeenCalledWith(
              PASSWORD_REQUEST,
            );
            const { authKeyPair } = vaultKeySetFor();
            expect(network.spies.acquireMetadataLock.mock.calls).toStrictEqual([
              [authKeyPair],
            ]);
            expect(network.spies.releaseMetadataLock.mock.calls).toStrictEqual([
              [authKeyPair, LOCK_ID],
            ]);
          });
        });

        it('writes the control record as a batch under the vault lock', async () => {
          await withUnlockedController(async (args) => {
            const network = mockNetwork(args.toprfClient);
            await authenticateAal2(args, { hasRecoveryShare: false });

            await migrateToEnvelope(args);

            const vaultKeySet = vaultKeySetFor();
            expect(network.spies.batchAddSecretDataItems).toHaveBeenCalledTimes(
              1,
            );
            expect(network.spies.batchAddSecretDataItems).toHaveBeenCalledWith({
              secretData: [
                {
                  data: expect.any(Uint8Array),
                  dataType: EncAccountDataType.EnvelopeControl,
                },
              ],
              encKey: vaultKeySet.encKey,
              authKeyPair: vaultKeySet.authKeyPair,
            });
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
            ).toStrictEqual([EncAccountDataType.KeyEnvelope]);
            expect(controller.state.vault).toBe(vault);
            expect(controller.state.authPubKey).toBe(authPubKey);
          });
        });

        it('lets a new device recover the vault keys with the Recovery Secret', async () => {
          await withUnlockedController(async (args) => {
            const network = mockNetwork(args.toprfClient);
            await authenticateAal2(args, { hasRecoveryShare: false });

            await migrateToEnvelope(args);

            expect(
              (await recoverOnNewDevice(network)).map(({ data }) => data),
            ).toStrictEqual([MOCK_SEED_PHRASE]);
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
            const network = mockNetwork(args.toprfClient);
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

        it('completes when the commit response is lost but the recovery verifier then holds the key', async () => {
          await withUnlockedController(async (args) => {
            const { controller, toprfClient, trackEvent } = args;
            const network = mockNetwork(toprfClient);
            loseFirstCommitResponse(network);
            await authenticateAal2(args, { hasRecoveryShare: false });

            await migrateToEnvelope(args);

            expect(countCalls(network, 'fetchAuthPubKey:recovery')).toBe(2);
            expect(network.spies.persistLocalKey).toHaveBeenCalledTimes(1);
            expect(controller.state.recoverySession?.hasRecoveryShare).toBe(
              true,
            );
            expect(controller.state.envelope).toStrictEqual(
              expectedEnvelopeState(),
            );
            expect(trackEvent.mock.calls).toStrictEqual([
              [checkpointEvent('STARTED', false)],
              [checkpointEvent('COMPLETED', false)],
            ]);
          });
        });

        it('rethrows a failed commit when the recovery verifier still holds no key', async () => {
          await withUnlockedController(async (args) => {
            const { controller, toprfClient } = args;
            const network = mockNetwork(toprfClient);
            failOnce(network.spies.persistLocalKey);
            await authenticateAal2(args, { hasRecoveryShare: false });

            await expect(migrateToEnvelope(args)).rejects.toThrow('network');

            expect(countCalls(network, 'fetchAuthPubKey:recovery')).toBe(2);
            expect(network.getRecoveryKey()).toBeUndefined();
            expect(controller.state.recoverySession?.hasRecoveryShare).toBe(
              false,
            );
            expect(controller.state.envelope).toBeUndefined();
          });
        });

        it.each([
          [
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
            'reading back the Recovery Secret envelope',
            SeedlessOnboardingControllerErrorMessage.FailedToFetchSecretMetadata,
            1,
            (network: MockNetwork): void =>
              failOnce(
                network.spies.fetchAllSecretDataItems,
                ({ authKeyPair }) =>
                  partitionOf(network, authKeyPair) === 'rbek',
              ),
          ],
          [
            'registering the Recovery Secret OPRF key',
            'network',
            1,
            (network: MockNetwork): void =>
              failOnce(network.spies.persistLocalKey),
          ],
        ] as const)(
          'retries with a fresh Recovery Secret OPRF key after %s fails, leaving the earlier Recovery Secret envelope as an orphan',
          async (_step, error, recoveryEnvelopesAfterFailure, failStep) => {
            await withUnlockedController(async (args) => {
              const { controller, toprfClient } = args;
              const network = mockNetwork(toprfClient);
              await authenticateAal2(args, { hasRecoveryShare: false });
              failStep(network);

              await expect(migrateToEnvelope(args)).rejects.toThrow(error);

              expect(network.getRecoveryKey()).toBeUndefined();
              expect(countStoredRecoveryEnvelopes(network.store)).toBe(
                recoveryEnvelopesAfterFailure,
              );
              expect(await fetchControlRecords(network)).toHaveLength(0);
              expect(controller.state.envelope).toBeUndefined();

              await migrateToEnvelope(args);

              const [first, second] = network.getCreatedKeys();
              expect(network.spies.createLocalKey).toHaveBeenCalledTimes(2);
              expect(second.seed).not.toBe(first.seed);
              expect(network.getRecoveryKey()).toStrictEqual(second);
              expect(countStoredRecoveryEnvelopes(network.store)).toBe(
                recoveryEnvelopesAfterFailure + 1,
              );
              expect(
                await openStoredEnvelope(
                  network,
                  second.seed,
                  'recovery-secret',
                ),
              ).toStrictEqual(vaultKeySetFor());
              expect(await fetchControlRecords(network)).toStrictEqual([
                expectedControlRecord(),
              ]);
              expect(controller.state.envelope).toStrictEqual(
                expectedEnvelopeState(),
              );
              expect(
                (await recoverOnNewDevice(network)).map(({ data }) => data),
              ).toStrictEqual([MOCK_SEED_PHRASE]);
            });
          },
        );

        it.each([
          [
            'acquiring the metadata lock',
            'network',
            (network: MockNetwork): void =>
              failOnce(network.spies.acquireMetadataLock),
          ],
          [
            'checking the live password key under the metadata lock',
            SeedlessOnboardingControllerErrorMessage.FailedToFetchAuthPubKey,
            failPasswordCheckUnderLock,
          ],
          [
            'writing the control record',
            'network',
            (network: MockNetwork): void =>
              failOnce(network.spies.batchAddSecretDataItems),
          ],
        ] as const)(
          'leaves the migration uncommitted after %s fails, and a retry writes the control record with the registered Recovery Secret OPRF key',
          async (_step, error, failStep) => {
            await withUnlockedController(async (args) => {
              const { controller, toprfClient, trackEvent } = args;
              const network = mockNetwork(toprfClient);
              await authenticateAal2(args, { hasRecoveryShare: false });
              failStep(network);

              await expect(migrateToEnvelope(args)).rejects.toThrow(error);

              const [first] = network.getCreatedKeys();
              expect(network.getRecoveryKey()).toStrictEqual(first);
              expect(await fetchControlRecords(network)).toHaveLength(0);
              expect(controller.state.envelope).toBeUndefined();
              trackEvent.mockClear();

              await migrateToEnvelope(args);

              expect(network.spies.createLocalKey).toHaveBeenCalledTimes(1);
              expect(network.spies.persistLocalKey).toHaveBeenCalledTimes(1);
              expect(network.getRecoveryKey()).toStrictEqual(first);
              expect(countStoredRecoveryEnvelopes(network.store)).toBe(1);
              expect(await fetchControlRecords(network)).toStrictEqual([
                expectedControlRecord(),
              ]);
              expect(controller.state.envelope).toStrictEqual(
                expectedEnvelopeState(),
              );
              expect(trackEvent.mock.calls).toStrictEqual([
                [checkpointEvent('STARTED', true)],
                [checkpointEvent('COMPLETED', true)],
              ]);
              expect(
                (await recoverOnNewDevice(network)).map(({ data }) => data),
              ).toStrictEqual([MOCK_SEED_PHRASE]);
            });
          },
        );

        it('throws OutdatedPassword without registering the Recovery Secret OPRF key when the password changed elsewhere', async () => {
          await withUnlockedController(async (args) => {
            const { controller, toprfClient } = args;
            const network = mockNetwork(toprfClient, {
              globalPassword: NEW_PASSWORD,
            });
            await authenticateAal2(args, { hasRecoveryShare: false });

            await expect(migrateToEnvelope(args)).rejects.toThrow(
              SeedlessOnboardingControllerErrorMessage.OutdatedPassword,
            );

            expect(
              network.spies.batchAddSecretDataItems,
            ).not.toHaveBeenCalled();
            expect(network.spies.persistLocalKey).not.toHaveBeenCalled();
            expect(controller.state.envelope).toBeUndefined();
          });
        });

        it('throws OutdatedPassword without writing the control record when the password changes under the vault lock', async () => {
          await withUnlockedController(async (args) => {
            const { controller, toprfClient, trackEvent } = args;
            const network = mockNetwork(toprfClient);
            beforeFirstCall(network.spies.acquireMetadataLock, () =>
              network.setGlobalPassword(NEW_PASSWORD),
            );
            await authenticateAal2(args, { hasRecoveryShare: false });

            await expect(migrateToEnvelope(args)).rejects.toThrow(
              SeedlessOnboardingControllerErrorMessage.OutdatedPassword,
            );

            expect(
              network.spies.batchAddSecretDataItems,
            ).not.toHaveBeenCalled();
            expect(network.spies.persistLocalKey).toHaveBeenCalledTimes(1);
            expect(network.spies.releaseMetadataLock).toHaveBeenCalledWith(
              vaultKeySetFor().authKeyPair,
              LOCK_ID,
            );
            expect(countStoredRecoveryEnvelopes(network.store)).toBe(1);
            expect(await fetchControlRecords(network)).toStrictEqual([]);
            expect(trackEvent.mock.calls).toStrictEqual([
              [checkpointEvent('STARTED', false)],
            ]);
            expect(controller.state.envelope).toBeUndefined();
          });
        });

        it('throws EnvelopeMigrationInconsistent without writes when the vault has a control record but the recovery verifier holds no key', async () => {
          await withUnlockedController(async (args) => {
            const { controller, toprfClient, trackEvent } = args;
            const network = mockNetwork(toprfClient);
            storeControlRecord(network.store, controlRecordFor(MOCK_PASSWORD));
            await authenticateAal2(args, { hasRecoveryShare: false });

            await expect(migrateToEnvelope(args)).rejects.toThrow(
              SeedlessOnboardingControllerErrorMessage.EnvelopeMigrationInconsistent,
            );

            expectNoMigrationWrites(network);
            expect(trackEvent).not.toHaveBeenCalled();
            expect(await fetchControlRecords(network)).toHaveLength(1);
            expect(controller.state.envelope).toBeUndefined();
          });
        });

        it('throws EnvelopeControlRecordNotFound after registering the Recovery Secret OPRF key when the control record does not read back, leaving the migration uncommitted', async () => {
          await withUnlockedController(async (args) => {
            const { controller, toprfClient } = args;
            const network = mockNetwork(toprfClient, {
              droppedDataTypes: [EncAccountDataType.EnvelopeControl],
            });
            await authenticateAal2(args, { hasRecoveryShare: false });

            await expect(migrateToEnvelope(args)).rejects.toThrow(
              SeedlessOnboardingControllerErrorMessage.EnvelopeControlRecordNotFound,
            );

            expect(countStoredRecoveryEnvelopes(network.store)).toBe(1);
            expect(network.spies.releaseMetadataLock).toHaveBeenCalledTimes(1);
            expect(network.getRecoveryKey()).toStrictEqual(
              network.getCreatedKeys()[0],
            );
            expect(await fetchControlRecords(network)).toHaveLength(0);
            expect(controller.state.envelope).toBeUndefined();
          });
        });

        it('throws InvalidEnvelope before locking the vault when the Recovery Secret envelope does not read back', async () => {
          await withUnlockedController(async (args) => {
            const { controller, toprfClient } = args;
            const network = mockNetwork(toprfClient, {
              droppedDataTypes: [EncAccountDataType.KeyEnvelope],
            });
            await authenticateAal2(args, { hasRecoveryShare: false });

            await expect(migrateToEnvelope(args)).rejects.toThrow(
              SeedlessOnboardingControllerErrorMessage.InvalidEnvelope,
            );

            expect(network.spies.acquireMetadataLock).not.toHaveBeenCalled();
            expect(network.spies.persistLocalKey).not.toHaveBeenCalled();
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

            expect(network.spies.persistLocalKey).not.toHaveBeenCalled();
            expect(controller.state.envelope).toBeUndefined();
          });
        });
      });

      describe('with a partial migration', () => {
        it('throws RecoveryKeyShareConflict without writes when the recovery verifier holds the key of another Recovery Secret', async () => {
          await withUnlockedController(async (args) => {
            const { controller, toprfClient } = args;
            const network = mockNetwork(toprfClient, {
              recoverySecret: bytesToHex(new Uint8Array(32).fill(9)),
            });
            await authenticateAal2(args, { hasRecoveryShare: true });

            await expect(migrateToEnvelope(args)).rejects.toThrow(
              SeedlessOnboardingControllerErrorMessage.RecoveryKeyShareConflict,
            );

            expectNoMigrationWrites(network);
            expect(await fetchControlRecords(network)).toHaveLength(0);
            expect(controller.state.envelope).toBeUndefined();
          });
        });

        it('throws without writes when the Recovery Secret envelopes of the registered key cannot be fetched', async () => {
          await withUnlockedController(async (args) => {
            const { controller, toprfClient } = args;
            const network = mockNetwork(toprfClient, {
              recoverySecret: RECOVERY_SECRET_HEX,
            });
            const { envelopeKeys } = keysFor(RECOVERY_SECRET_HEX);
            failOnce(network.spies.fetchAllSecretDataItems, ({ authKeyPair }) =>
              pubKeysMatch(authKeyPair.pk, envelopeKeys.authKeyPair.pk),
            );
            await authenticateAal2(args, { hasRecoveryShare: true });

            await expect(migrateToEnvelope(args)).rejects.toThrow(
              SeedlessOnboardingControllerErrorMessage.FailedToFetchSecretMetadata,
            );

            expectNoMigrationWrites(network);
            expect(controller.state.envelope).toBeUndefined();
          });
        });

        /**
         * Stores a Recovery Secret envelope under the registered key that is
         * sealed with another wrap key, so it does not open.
         *
         * @param network - The mock network.
         */
        async function storeUnopenableRecoveryEnvelope(
          network: MockNetwork,
        ): Promise<void> {
          const { envelopeKeys } = keysFor(RECOVERY_SECRET_HEX);
          network.store.set(
            bytesToHex(envelopeKeys.authKeyPair.pk),
            new Map([
              [
                'server-item-rbek',
                {
                  encKey: bytesToHex(envelopeKeys.wrapKey),
                  dataType: EncAccountDataType.KeyEnvelope,
                  data: serializeEnvelope(
                    await sealEnvelope(
                      keysFor('other-password').envelopeKeys.wrapKey,
                      'recovery-secret',
                      vaultKeySetFor(),
                    ),
                  ),
                },
              ],
            ]),
          );
        }

        it.each([
          [
            'no Recovery Secret envelope exists',
            async (): Promise<void> => undefined,
          ],
          [
            'the newest Recovery Secret envelope does not open',
            storeUnopenableRecoveryEnvelope,
          ],
        ])(
          'seals the vault keys under the registered key when %s, then writes the control record',
          async (_name, storeEnvelopes) => {
            await withUnlockedController(async (args) => {
              const { controller, toprfClient } = args;
              const network = mockNetwork(toprfClient, {
                recoverySecret: RECOVERY_SECRET_HEX,
              });
              await storeEnvelopes(network);
              await authenticateAal2(args, { hasRecoveryShare: true });

              await migrateToEnvelope(args);

              expect(network.spies.createLocalKey).not.toHaveBeenCalled();
              expect(network.spies.persistLocalKey).not.toHaveBeenCalled();
              expect(
                await openStoredEnvelope(
                  network,
                  RECOVERY_SECRET_HEX,
                  'recovery-secret',
                ),
              ).toStrictEqual(vaultKeySetFor());
              expect(await fetchControlRecords(network)).toStrictEqual([
                expectedControlRecord(),
              ]);
              expect(controller.state.envelope).toStrictEqual(
                expectedEnvelopeState(),
              );
              expect(
                (await recoverOnNewDevice(network)).map(({ data }) => data),
              ).toStrictEqual([MOCK_SEED_PHRASE]);
            });
          },
        );

        it('seals the new vault keys under the registered key after a legacy password change rotated them before the control record was written', async () => {
          await withUnlockedController(async (args) => {
            const { controller, toprfClient, baseMessenger } = args;
            const network = mockNetwork(toprfClient);
            mockLegacyChangeEncKey(toprfClient, network);
            failOnce(network.spies.acquireMetadataLock);
            await authenticateAal2(args, { hasRecoveryShare: false });
            await expect(migrateToEnvelope(args)).rejects.toThrow('network');
            expect(countStoredRecoveryEnvelopes(network.store)).toBe(1);
            await baseMessenger.call(
              'SeedlessOnboardingController:changePassword',
              NEW_PASSWORD,
              MOCK_PASSWORD,
            );

            await migrateToEnvelope(args);

            const newVaultKeySet = vaultKeySetFor(NEW_PASSWORD);
            expect(network.spies.createLocalKey).toHaveBeenCalledTimes(1);
            expect(countStoredRecoveryEnvelopes(network.store)).toBe(2);
            expect(
              await fetchControlRecords(network, newVaultKeySet),
            ).toStrictEqual([
              expectedControlRecord({
                keyIndex: 2,
                vaultPassword: NEW_PASSWORD,
              }),
            ]);
            expect(
              await openStoredEnvelope(
                network,
                network.getCreatedKeys()[0].seed,
                'recovery-secret',
              ),
            ).toStrictEqual(newVaultKeySet);
            expect(controller.state.envelope).toStrictEqual(
              expectedEnvelopeState({
                password: NEW_PASSWORD,
                vaultPassword: NEW_PASSWORD,
              }),
            );
            expect(
              (
                await recoverOnNewDevice(network, {
                  globalPassword: NEW_PASSWORD,
                  vaultPassword: NEW_PASSWORD,
                })
              ).map(({ data }) => data),
            ).toStrictEqual([MOCK_SEED_PHRASE]);
          });
        });
      });

      describe('with a Recovery Secret OPRF key at the nodes', () => {
        it('checks the Recovery Secret and writes nothing when the vault has a control record', async () => {
          await withUnlockedController(async (args) => {
            const { controller, trackEvent } = args;
            const network = mockNetwork(args.toprfClient);
            await migrate(args, network);
            updateState(controller, (state) => {
              delete state.envelope;
            });

            await migrateToEnvelope(args);

            expectNoMigrationWrites(network);
            expect(network.spies.recoverEncKey).toHaveBeenCalledWith({
              ...RECOVERY_REQUEST,
              password: RECOVERY_SECRET_HEX,
            });
            expect(network.spies.fetchAuthPubKey).toHaveBeenCalledWith(
              RECOVERY_REQUEST,
            );
            expect(trackEvent).not.toHaveBeenCalled();
            expect(controller.state.envelope).toStrictEqual(
              expectedEnvelopeState(),
            );
          });
        });

        it('checks the recovery verifier again when the vault is already envelope-managed', async () => {
          await withUnlockedController(async (args) => {
            const { controller, trackEvent } = args;
            const network = mockNetwork(args.toprfClient);
            await migrate(args, network);

            await migrateToEnvelope(args);

            expect(network.spies.fetchAuthPubKey).toHaveBeenCalledWith(
              RECOVERY_REQUEST,
            );
            expectNoMigrationWrites(network);
            expect(trackEvent).not.toHaveBeenCalled();
            expect(controller.state.envelope).toStrictEqual(
              expectedEnvelopeState(),
            );
          });
        });

        it('throws RecoveryKeyShareConflict without writes when the vault is already envelope-managed and the Recovery Secret is another one', async () => {
          await withUnlockedController(async (args) => {
            const { controller, trackEvent } = args;
            const network = mockNetwork(args.toprfClient);
            await migrate(args, network);
            const envelopeBefore = controller.state.envelope;

            await expect(
              migrateToEnvelope(args, new Uint8Array(32).fill(9)),
            ).rejects.toThrow(
              SeedlessOnboardingControllerErrorMessage.RecoveryKeyShareConflict,
            );

            expectNoMigrationWrites(network);
            expect(trackEvent).not.toHaveBeenCalled();
            expect(controller.state.envelope).toStrictEqual(envelopeBefore);
          });
        });

        it('seals the vault keys for the Recovery Secret again when the vault is already envelope-managed and its Recovery Secret envelope is missing', async () => {
          await withUnlockedController(async (args) => {
            const { controller } = args;
            const network = mockNetwork(args.toprfClient);
            await migrate(args, network);
            deleteStoredRecoveryEnvelopes(network.store);

            await migrateToEnvelope(args);

            expect(network.spies.createLocalKey).not.toHaveBeenCalled();
            expect(network.spies.persistLocalKey).not.toHaveBeenCalled();
            expect(
              network.spies.batchAddSecretDataItems,
            ).not.toHaveBeenCalled();
            expect(network.spies.addSecretDataItem).toHaveBeenCalledTimes(1);
            expect(countStoredRecoveryEnvelopes(network.store)).toBe(1);
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

        it('adopts a vault another device migrated, without writes', async () => {
          const store: MetadataStore = new Map();
          let recoveryKey: OprfKey | undefined;
          await withUnlockedController(async (args) => {
            const network = mockNetwork(args.toprfClient, { store });
            await migrate(args, network);
            recoveryKey = network.getRecoveryKey();
          });

          await withUnlockedController(async (args) => {
            const { controller, toprfClient, trackEvent } = args;
            const network = mockNetwork(toprfClient, {
              store,
              recoverySecret: recoveryKey?.password,
              recoverySeed: recoveryKey?.seed,
            });
            await authenticateAal2(args, { hasRecoveryShare: true });
            expect(controller.state.envelope).toBeUndefined();

            await migrateToEnvelope(args);

            expectNoMigrationWrites(network);
            expect(trackEvent).not.toHaveBeenCalled();
            expect(controller.state.envelope).toStrictEqual(
              expectedEnvelopeState(),
            );
          });
        });

        it('adopts the live password key when another device migrated the vault and changed the password', async () => {
          const store = await createMigratedAccount();

          await withUnlockedController(async (args) => {
            const { controller, toprfClient } = args;
            const network = mockNetwork(toprfClient, {
              store,
              globalPassword: NEW_PASSWORD,
              recoverySecret: RECOVERY_SECRET_HEX,
            });
            await authenticateAal2(args, { hasRecoveryShare: true });

            await migrateToEnvelope(args);

            expectNoMigrationWrites(network);
            expect(controller.state.envelope).toStrictEqual(
              expectedEnvelopeState({ password: NEW_PASSWORD }),
            );
          });
        });

        it('throws OutdatedPassword when no control record matches the live password key', async () => {
          await withUnlockedController(async (args) => {
            const { controller, toprfClient } = args;
            const network = mockNetwork(toprfClient, {
              recoverySecret: RECOVERY_SECRET_HEX,
            });
            storeControlRecord(
              network.store,
              controlRecordFor('other-password'),
            );
            await authenticateAal2(args, { hasRecoveryShare: true });

            await expect(migrateToEnvelope(args)).rejects.toThrow(
              SeedlessOnboardingControllerErrorMessage.OutdatedPassword,
            );

            expectNoMigrationWrites(network);
            expect(controller.state.envelope).toBeUndefined();
          });
        });

        it('writes only the control record when a migrated vault lost it', async () => {
          await withUnlockedController(async (args) => {
            const { controller } = args;
            const network = mockNetwork(args.toprfClient);
            await migrate(args, network);
            deleteControlRecords(network.store);
            updateState(controller, (state) => {
              delete state.envelope;
            });

            await migrateToEnvelope(args);

            expect(network.spies.createLocalKey).not.toHaveBeenCalled();
            expect(network.spies.addSecretDataItem).not.toHaveBeenCalled();
            expect(network.spies.persistLocalKey).not.toHaveBeenCalled();
            expect(network.spies.batchAddSecretDataItems).toHaveBeenCalledTimes(
              1,
            );
            expect(await fetchControlRecords(network)).toStrictEqual([
              expectedControlRecord(),
            ]);
            expect(controller.state.envelope).toStrictEqual(
              expectedEnvelopeState(),
            );
          });
        });
      });

      describe('recovery session', () => {
        it.each([
          [
            'missing',
            'not migrated',
            async ({ controller }: ControllerArgs): Promise<void> =>
              removeRecoverySession(controller),
          ],
          [
            'missing',
            'already migrated',
            async (
              args: ControllerArgs,
              network: MockNetwork,
            ): Promise<void> => {
              await migrate(args, network);
              removeRecoverySession(args.controller);
            },
          ],
          [
            'expired',
            'not migrated',
            async (args: ControllerArgs): Promise<void> => {
              await authenticateAal2(args, { hasRecoveryShare: false });
              expireRecoverySession();
            },
          ],
          [
            'expired',
            'already migrated',
            async (
              args: ControllerArgs,
              network: MockNetwork,
            ): Promise<void> => {
              await migrate(args, network);
              expireRecoverySession();
            },
          ],
        ] as const)(
          'throws Aal2Required when the recovery session is %s and the vault is %s',
          async (_session, _vault, prepare) => {
            await withUnlockedController(async (args) => {
              const { controller } = args;
              const network = mockNetwork(args.toprfClient);
              await prepare(args, network);
              const { envelope } = controller.state;

              await expect(migrateToEnvelope(args)).rejects.toThrow(
                SeedlessOnboardingControllerErrorMessage.Aal2Required,
              );

              expect(network.spies.fetchAuthPubKey).not.toHaveBeenCalledWith(
                RECOVERY_REQUEST,
              );
              expectNoMigrationWrites(network);
              expect(controller.state.recoverySession).toBeUndefined();
              expect(controller.state.envelope).toStrictEqual(envelope);
            });
          },
        );

        it('throws Aal2Required and clears the session when the recovery verifier rejects the aal2 tokens', async () => {
          await withUnlockedController(async (args) => {
            const { controller, toprfClient } = args;
            const network = mockNetwork(toprfClient);
            failOnce(
              network.spies.fetchAuthPubKey,
              ({ authConnectionId }) => isRecovery(authConnectionId),
              new TOPRFError(TOPRFErrorCode.AuthTokenExpired, 'expired'),
            );
            await authenticateAal2(args, { hasRecoveryShare: false });

            await expect(migrateToEnvelope(args)).rejects.toThrow(
              SeedlessOnboardingControllerErrorMessage.Aal2Required,
            );

            expectNoMigrationWrites(network);
            expect(controller.state.recoverySession).toBeUndefined();
          });
        });

        it('rethrows other recovery verifier errors', async () => {
          await withUnlockedController(async (args) => {
            const { controller, toprfClient } = args;
            const network = mockNetwork(toprfClient);
            failOnce(
              network.spies.fetchAuthPubKey,
              ({ authConnectionId }) => isRecovery(authConnectionId),
              new Error('nodes unavailable'),
            );
            await authenticateAal2(args, { hasRecoveryShare: false });

            await expect(migrateToEnvelope(args)).rejects.toThrow(
              'nodes unavailable',
            );

            expectNoMigrationWrites(network);
            expect(controller.state.recoverySession).toBeDefined();
            expect(controller.state.envelope).toBeUndefined();
          });
        });
      });

      describe('analytics', () => {
        it('reports a fresh migration as started and completed, not partial', async () => {
          await withUnlockedController(async (args) => {
            const { toprfClient, trackEvent } = args;
            const network = mockNetwork(toprfClient);
            await authenticateAal2(args, { hasRecoveryShare: false });

            await migrateToEnvelope(args);

            expect(trackEvent.mock.calls).toStrictEqual([
              [checkpointEvent('STARTED', false)],
              [checkpointEvent('COMPLETED', false)],
            ]);
            const timeline = readTimeline(network, trackEvent);
            expect(timeline.indexOf('trackEvent:STARTED')).toBeLessThan(
              timeline.indexOf('addSecretDataItem:rbek'),
            );
            expect(timeline.at(-1)).toBe('trackEvent:COMPLETED');
          });
        });

        it('reports the retry of a partial migration as partial', async () => {
          await withUnlockedController(async (args) => {
            const { toprfClient, trackEvent } = args;
            const network = mockNetwork(toprfClient);
            failOnce(network.spies.acquireMetadataLock);
            await authenticateAal2(args, { hasRecoveryShare: false });
            await expect(migrateToEnvelope(args)).rejects.toThrow('network');
            expect(trackEvent.mock.calls).toStrictEqual([
              [checkpointEvent('STARTED', false)],
            ]);
            trackEvent.mockClear();

            await migrateToEnvelope(args);

            expect(trackEvent.mock.calls).toStrictEqual([
              [checkpointEvent('STARTED', true)],
              [checkpointEvent('COMPLETED', true)],
            ]);
          });
        });

        it('reports a retry as not partial when the failed attempt registered no Recovery Secret OPRF key', async () => {
          await withUnlockedController(async (args) => {
            const { toprfClient, trackEvent } = args;
            const network = mockNetwork(toprfClient);
            failOnce(network.spies.persistLocalKey);
            await authenticateAal2(args, { hasRecoveryShare: false });
            await expect(migrateToEnvelope(args)).rejects.toThrow('network');
            trackEvent.mockClear();

            await migrateToEnvelope(args);

            expect(trackEvent.mock.calls).toStrictEqual([
              [checkpointEvent('STARTED', false)],
              [checkpointEvent('COMPLETED', false)],
            ]);
          });
        });

        it('completes when reporting fails', async () => {
          await withUnlockedController(async (args) => {
            const { controller, toprfClient, trackEvent } = args;
            mockNetwork(toprfClient);
            trackEvent.mockRejectedValue(new Error('analytics'));
            await authenticateAal2(args, { hasRecoveryShare: false });

            await migrateToEnvelope(args);

            expect(trackEvent).toHaveBeenCalledTimes(2);
            expect(controller.state.envelope).toStrictEqual(
              expectedEnvelopeState(),
            );
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

            expect(trackEvent).toHaveBeenCalledTimes(2);
            expect(controller.state.envelope).toStrictEqual(
              expectedEnvelopeState(),
            );
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

          await expect(migrateToEnvelope(args)).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.EnvelopeMigrationRequiresDataTypes,
          );
          expectNoMigrationWrites(network);
        });
      });

      it.each([
        ['empty', new Uint8Array(0)],
        ['31 bytes', new Uint8Array(31).fill(1)],
        ['33 bytes', new Uint8Array(33).fill(1)],
        ['not a Uint8Array', Array(32).fill(1) as unknown as Uint8Array],
      ])(
        'throws InvalidRecoverySecret without any call when the Recovery Secret is %s',
        async (_name, recoverySecret) => {
          await withUnlockedController(async (args) => {
            const network = mockNetwork(args.toprfClient);
            await authenticateAal2(args, { hasRecoveryShare: false });

            await expect(
              migrateToEnvelope(args, recoverySecret),
            ).rejects.toThrow(
              SeedlessOnboardingControllerErrorMessage.InvalidRecoverySecret,
            );
            expect(network.spies.fetchAuthPubKey).not.toHaveBeenCalled();
            expectNoMigrationWrites(network);
          });
        },
      );

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

      it('persists the envelope state and keeps no migration checkpoint', async () => {
        await withController(
          {
            state: {
              envelope: {
                v: 1,
                vaultAuthPubKey: 'vault',
                passwordAuthPubKey: 'password',
              },
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
            });
            // Public keys only, but they fingerprint the account across logs.
            expect(derive('includeInStateLogs')).not.toHaveProperty('envelope');
            expect(derive('includeInDebugSnapshot')).not.toHaveProperty(
              'envelope',
            );
            expect(derive('usedInUi')).not.toHaveProperty('envelope');
            expect(controller.metadata).not.toHaveProperty(
              'pendingEnvelopeMigration',
            );
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
              oprfKey: (await readCreatedLocalKey(network)).oprfKey,
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

          await baseMessenger.call(
            'SeedlessOnboardingController:changePassword',
            NEW_PASSWORD,
            MOCK_PASSWORD,
          );

          expect(
            readTimeline(network).filter((label) =>
              [
                'acquireMetadataLock:vault',
                'addSecretDataItem:pbek',
                'batchAddSecretDataItems:vault',
                'persistLocalKey:password',
                'releaseMetadataLock:vault',
              ].includes(label),
            ),
          ).toStrictEqual([
            'acquireMetadataLock:vault',
            'addSecretDataItem:pbek',
            'batchAddSecretDataItems:vault',
            'persistLocalKey:password',
            'releaseMetadataLock:vault',
          ]);
          expect(network.spies.batchAddSecretDataItems).toHaveBeenCalledWith({
            secretData: [
              {
                data: expect.any(Uint8Array),
                dataType: EncAccountDataType.EnvelopeControl,
              },
            ],
            encKey: vaultKeySetFor().encKey,
            authKeyPair: vaultKeySetFor().authKeyPair,
          });
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
          beforeFirstCall(network.spies.acquireMetadataLock, () =>
            network.setGlobalPassword('other-password'),
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
          expect(network.spies.addSecretDataItem).not.toHaveBeenCalled();
          expect(network.spies.batchAddSecretDataItems).not.toHaveBeenCalled();
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

      it('throws PasswordEnvelopeNotFound without touching the vault when the password envelope holds another vault key set', async () => {
        await withUnlockedController(async (args) => {
          const { controller, toprfClient } = args;
          const network = mockNetwork(toprfClient);
          await migrate(args, network);
          const { envelopeKeys } = keysFor(NEW_PASSWORD);
          await network.envelopeStore.writeEnvelope(
            envelopeKeys,
            await sealEnvelope(
              envelopeKeys.wrapKey,
              'password',
              vaultKeySetFor('other-password'),
            ),
          );
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
          expect(
            await controller.verifyVaultPassword(MOCK_PASSWORD),
          ).toBeUndefined();
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
          storeControlRecord(
            network.store,
            controlRecordFor('other-password'),
            vaultKeySetFor('other-password'),
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

      it('restores a partially migrated vault as not envelope-managed, so the migration can be retried', async () => {
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
            isLocalPassword: false,
          });
          await baseMessenger.call(
            'SeedlessOnboardingController:migrateToEnvelope',
            { recoverySecret: RECOVERY_SECRET },
          );
          const recoveryKey = network.getRecoveryKey();
          expect(recoveryKey).toStrictEqual(network.getCreatedKeys()[1]);
          expect(
            await openStoredEnvelope(
              network,
              recoveryKey?.seed as string,
              'recovery-secret',
            ),
          ).toStrictEqual(vaultKeySetFor());
          expect(controller.state).not.toHaveProperty(
            'pendingEnvelopeMigration',
          );
        });
      });

      it.each([
        [
          'registering the Recovery Secret OPRF key',
          (network: MockNetwork): void =>
            failOnce(network.spies.persistLocalKey),
        ],
        [
          'writing the control record',
          (network: MockNetwork): void =>
            failOnce(network.spies.batchAddSecretDataItems),
        ],
      ] as const)(
        'restores a vault whose migration failed at %s as not envelope-managed, and a retry on the restoring device completes it',
        async (_step, failStep) => {
          const store: MetadataStore = new Map();
          let recoveryKey: OprfKey | undefined;
          await withUnlockedController(async (args) => {
            const network = mockNetwork(args.toprfClient, { store });
            failStep(network);
            await authenticateAal2(args, { hasRecoveryShare: false });
            await expect(
              args.baseMessenger.call(
                'SeedlessOnboardingController:migrateToEnvelope',
                { recoverySecret: RECOVERY_SECRET },
              ),
            ).rejects.toThrow('network');
            expect(await fetchControlRecords(network)).toHaveLength(0);
            recoveryKey = network.getRecoveryKey();
          });
          storeSeedPhrase(store, vaultKeySetFor());

          await withNewDeviceController(async (args) => {
            const { controller, baseMessenger, toprfClient } = args;
            const network = mockNetwork(toprfClient, {
              store,
              recoverySecret: recoveryKey?.password,
              recoverySeed: recoveryKey?.seed,
            });

            await controller.restoreVaultWithPassword({
              password: MOCK_PASSWORD,
            });

            expect(getEnvelopeStatus(controller.state)).toStrictEqual({
              isEnvelopeManaged: false,
              isLocalPassword: false,
            });
            controller.setMigrationVersion(
              SeedlessOnboardingMigrationVersion.V1,
            );
            await authenticateAal2(args, {
              hasRecoveryShare: recoveryKey !== undefined,
            });
            await baseMessenger.call(
              'SeedlessOnboardingController:migrateToEnvelope',
              { recoverySecret: RECOVERY_SECRET },
            );
            expect(getEnvelopeStatus(controller.state).isEnvelopeManaged).toBe(
              true,
            );
            recoveryKey = network.getRecoveryKey();
          });

          await withNewDeviceController(async (args) => {
            mockNetwork(args.toprfClient, {
              store,
              recoverySecret: recoveryKey?.password,
              recoverySeed: recoveryKey?.seed,
            });
            expect((await recover(args)).map(({ data }) => data)).toStrictEqual(
              [MOCK_SEED_PHRASE],
            );
          });
        },
      );

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
          storeControlRecord(network.store, controlRecordFor('other-password'));
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
          storeControlRecord(network.store, controlRecordFor('other-password'));

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
          storeControlRecord(network.store, controlRecordFor(MOCK_PASSWORD));
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
      it('returns the secret data with the vault keys sealed for the Recovery Secret, and creates the local vault under the password', async () => {
        const store = await createMigratedAccount();

        await withNewDeviceController(async (args) => {
          const { controller, toprfClient } = args;
          const network = mockNetwork(toprfClient, {
            store,
            globalPassword: NEW_PASSWORD,
            recoverySecret: RECOVERY_SECRET_HEX,
          });

          const secrets = await recover(args);

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
          expect(controller.state.authPubKey).toBe(authPubKeyOf(MOCK_PASSWORD));
          expect(controller.state.envelope).toStrictEqual({
            v: 1,
            vaultAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
            passwordAuthPubKey: authPubKeyOf(NEW_PASSWORD),
          });
          expect(controller.state.isLocalPassword).toBe(true);
          expect(controller.state.recoverySession).toBeDefined();
          expect(
            await controller.verifyVaultPassword(RECOVERED_PASSWORD),
          ).toBeUndefined();
        });
      });

      it('replaces the vault of a device whose envelope state names the recovered vault keys', async () => {
        const store = await createMigratedAccount();

        await withNewDeviceController(async (args) => {
          const { controller, toprfClient } = args;
          mockNetwork(toprfClient, {
            store,
            globalPassword: NEW_PASSWORD,
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          // @ts-expect-error Accessing protected method for testing
          controller.update((state) => {
            state.envelope = {
              v: 1,
              vaultAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
              passwordAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
            };
          });

          await recover(args);

          expect(controller.state.envelope).toStrictEqual({
            v: 1,
            vaultAuthPubKey: authPubKeyOf(MOCK_PASSWORD),
            passwordAuthPubKey: authPubKeyOf(NEW_PASSWORD),
          });
          expect(
            await controller.verifyVaultPassword(RECOVERED_PASSWORD),
          ).toBeUndefined();
        });
      });

      it('throws RecoveryEnvelopeNotFound without touching the state when the envelope state names other vault keys', async () => {
        const store = await createMigratedAccount();

        await withNewDeviceController(async (args) => {
          const { controller, toprfClient } = args;
          const network = mockNetwork(toprfClient, {
            store,
            globalPassword: NEW_PASSWORD,
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          const envelope = {
            v: 1 as const,
            vaultAuthPubKey: authPubKeyOf('other-password'),
            passwordAuthPubKey: authPubKeyOf('other-password'),
          };
          // @ts-expect-error Accessing protected method for testing
          controller.update((state) => {
            state.envelope = envelope;
          });

          await expect(recover(args)).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.RecoveryEnvelopeNotFound,
          );
          expect(network.spies.fetchAllSecretDataItems).toHaveBeenCalledTimes(
            1,
          );
          expect(controller.state.vault).toBeUndefined();
          expect(controller.state.envelope).toStrictEqual(envelope);
          expect(controller.state.isLocalPassword).toBeUndefined();
        });
      });

      it('throws EnvelopeControlRecordNotFound without creating a vault when no control record matches the live password key', async () => {
        const store = await createMigratedAccount();
        deleteControlRecords(store);
        storeControlRecord(store, controlRecordFor('other-password'));

        await withNewDeviceController(async (args) => {
          const { controller, toprfClient } = args;
          mockNetwork(toprfClient, {
            store,
            globalPassword: NEW_PASSWORD,
            recoverySecret: RECOVERY_SECRET_HEX,
          });

          await expect(recover(args)).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.EnvelopeControlRecordNotFound,
          );
          expect(controller.state.vault).toBeUndefined();
          expect(controller.state.envelope).toBeUndefined();
          expect(controller.state.isLocalPassword).toBeUndefined();
        });
      });

      it('throws EnvelopeControlRecordNotFound without creating a vault when the live password key moved past every control record', async () => {
        const store = await createMigratedAccount();

        await withNewDeviceController(async (args) => {
          const { controller, toprfClient } = args;
          mockNetwork(toprfClient, {
            store,
            globalPassword: 'other-password',
            recoverySecret: RECOVERY_SECRET_HEX,
          });

          await expect(recover(args)).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.EnvelopeControlRecordNotFound,
          );
          expect(controller.state.vault).toBeUndefined();
          expect(controller.state.envelope).toBeUndefined();
        });
      });

      it('throws Aal2Required and clears the session without creating a vault when the recovery session has expired', async () => {
        const store = await createMigratedAccount();

        await withNewDeviceController(async (args) => {
          const { controller, toprfClient, baseMessenger } = args;
          const network = mockNetwork(toprfClient, {
            store,
            globalPassword: NEW_PASSWORD,
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          await authenticateAal2(args, { hasRecoveryShare: true });
          const now = Date.now();
          vi.spyOn(Date, 'now').mockReturnValue(now + 2 * 60 * 60 * 1000);

          await expect(
            baseMessenger.call(
              'SeedlessOnboardingController:recoverWithRecoverySecret',
              { recoverySecret: RECOVERY_SECRET, password: RECOVERED_PASSWORD },
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.Aal2Required,
          );
          expect(network.spies.recoverEncKey).not.toHaveBeenCalled();
          expect(controller.state.recoverySession).toBeUndefined();
          expect(controller.state.vault).toBeUndefined();
          expect(controller.state.envelope).toBeUndefined();
        });
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
              { recoverySecret: RECOVERY_SECRET, password: RECOVERED_PASSWORD },
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

          await expect(recover(args)).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.RecoveryEnvelopeNotFound,
          );
          expect(controller.state.vault).toBeUndefined();
          expect(controller.state.envelope).toBeUndefined();
        });
      });

      it('throws RecoveryEnvelopeNotFound when the migration that sealed the vault keys wrote no control record', async () => {
        const store = await createMigratedAccount();
        deleteControlRecords(store);

        await withNewDeviceController(async (args) => {
          const { controller, toprfClient } = args;
          mockNetwork(toprfClient, {
            store,
            globalPassword: NEW_PASSWORD,
            recoverySecret: RECOVERY_SECRET_HEX,
          });

          await expect(recover(args)).rejects.toThrow(
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

          await expect(recover(args)).rejects.toThrow(
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

          await expect(recover(args)).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.RecoveryKeyShareConflict,
          );
          expect(controller.state.vault).toBeUndefined();
        });
      });

      it('rethrows other errors of the recovery verifier', async () => {
        const store = await createMigratedAccount();

        await withNewDeviceController(async (args) => {
          const { controller, toprfClient } = args;
          const network = mockNetwork(toprfClient, {
            store,
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          failOnce(network.spies.recoverEncKey);

          await expect(recover(args)).rejects.toThrow('network');
          expect(network.spies.recoverEncKey).toHaveBeenCalledTimes(1);
          expect(controller.state.vault).toBeUndefined();
        });
      });

      it('recovers when resetting the recovery verifier rate limit fails', async () => {
        const store = await createMigratedAccount();

        await withNewDeviceController(async (args) => {
          const { toprfClient } = args;
          const network = mockNetwork(toprfClient, {
            store,
            globalPassword: NEW_PASSWORD,
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          network.spies.recoverEncKey.mockImplementationOnce(async () => ({
            ...keysFor(RECOVERY_SECRET_HEX),
            keyShareIndex: 1,
            rateLimitResetResult: Promise.reject(new Error('rate limit')),
          }));

          const secrets = await recover(args);

          expect(secrets.map(({ data }) => data)).toStrictEqual([
            MOCK_SEED_PHRASE,
          ]);
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
                {
                  recoverySecret: RECOVERY_SECRET,
                  password: RECOVERED_PASSWORD,
                },
              ),
            ).rejects.toThrow(
              SeedlessOnboardingControllerErrorMessage.Aal2Required,
            );
            expect(network.spies.recoverEncKey).not.toHaveBeenCalled();
          },
        );
      });

      it.each([
        ['empty', new Uint8Array(0)],
        ['31 bytes', new Uint8Array(31).fill(1)],
        ['33 bytes', new Uint8Array(33).fill(1)],
        ['not a Uint8Array', Array(32).fill(1) as unknown as Uint8Array],
      ])(
        'throws InvalidRecoverySecret without any call when the Recovery Secret is %s',
        async (_name, recoverySecret) => {
          await withNewDeviceController(async (args) => {
            const { controller, toprfClient, baseMessenger } = args;
            const network = mockNetwork(toprfClient, {
              recoverySecret: RECOVERY_SECRET_HEX,
            });
            await authenticateAal2(args, { hasRecoveryShare: true });

            await expect(
              baseMessenger.call(
                'SeedlessOnboardingController:recoverWithRecoverySecret',
                { recoverySecret, password: RECOVERED_PASSWORD },
              ),
            ).rejects.toThrow(
              SeedlessOnboardingControllerErrorMessage.InvalidRecoverySecret,
            );
            expect(network.spies.recoverEncKey).not.toHaveBeenCalled();
            expect(controller.state.vault).toBeUndefined();
          });
        },
      );

      it('does not create a vault when the vault holds no secret data', async () => {
        const store = await createMigratedAccount();
        store.delete(bytesToHex(vaultKeySetFor().authKeyPair.pk));

        await withNewDeviceController(async (args) => {
          const { controller, toprfClient } = args;
          mockNetwork(toprfClient, {
            store,
            recoverySecret: RECOVERY_SECRET_HEX,
          });

          await expect(recover(args)).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.NoSecretDataFound,
          );
          expect(controller.state.vault).toBeUndefined();
          expect(controller.state.envelope).toBeUndefined();
        });
      });
    });

    describe('after recovery', () => {
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

      it('keeps the recovery session when authenticate runs again for the same user', async () => {
        const store = await createMigratedAccount();

        await withNewDeviceController(async (args) => {
          const { controller, toprfClient, baseMessenger } = args;
          mockNetwork(toprfClient, {
            store,
            globalPassword: NEW_PASSWORD,
            recoverySecret: RECOVERY_SECRET_HEX,
          });
          await recover(args);
          const { recoverySession } = controller.state;

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
              ...socialLoginOf(controller.state),
              refreshToken: 'same-user-refresh-token',
            },
          );

          expect(controller.state.recoverySession).toStrictEqual(
            recoverySession,
          );
        });
      });

      it('returns the access token after recovery', async () => {
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
