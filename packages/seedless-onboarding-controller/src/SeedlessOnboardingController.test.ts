import { keccak256AndHexify } from '@metamask/auth-network-utils';
import {
  TOPRFError,
  type ChangeEncryptionKeyResult,
  type KeyPair,
  type NodeAuthTokens,
  type RecoverEncryptionKeyResult,
  type ToprfSecureBackup,
} from '@metamask/toprf-secure-backup';
import { base64ToBytes, bytesToBase64, stringToBytes } from '@metamask/utils';

import {
  Web3AuthNetwork,
  SeedlessOnboardingControllerError,
  AuthConnection,
} from './constants';
import { RecoveryError } from './errors';
import {
  getDefaultSeedlessOnboardingControllerState,
  SeedlessOnboardingController,
} from './SeedlessOnboardingController';
import { SeedPhraseMetadata } from './SeedPhraseMetadata';
import type {
  SeedlessOnboardingControllerMessenger,
  SeedlessOnboardingControllerOptions,
  SeedlessOnboardingControllerState,
} from './types';
import {
  handleMockSecretDataGet,
  handleMockSecretDataAdd,
  handleMockCommitment,
  handleMockAuthenticate,
} from '../tests/__fixtures__/topfClient';
import {
  createMockSecretDataGetResponse,
  MULTIPLE_MOCK_SEEDPHRASE_METADATA,
} from '../tests/mocks/toprf';
import { MockToprfEncryptorDecryptor } from '../tests/mocks/toprfEncryptor';
import MockVaultEncryptor from '../tests/mocks/vaultEncryptor';

type WithControllerCallback<ReturnValue> = ({
  controller,
  initialState,
  encryptor,
  messenger,
}: {
  controller: SeedlessOnboardingController;
  encryptor: MockVaultEncryptor;
  initialState: SeedlessOnboardingControllerState;
  messenger: SeedlessOnboardingControllerMessenger;
  toprfClient: ToprfSecureBackup;
}) => Promise<ReturnValue> | ReturnValue;

type WithControllerOptions = Partial<SeedlessOnboardingControllerOptions>;

type WithControllerArgs<ReturnValue> =
  | [WithControllerCallback<ReturnValue>]
  | [WithControllerOptions, WithControllerCallback<ReturnValue>];

/**
 * Creates a mock user operation messenger.
 *
 * @returns The mock user operation messenger.
 */
function buildSeedlessOnboardingControllerMessenger() {
  return {
    call: jest.fn(),
    publish: jest.fn(),
    registerActionHandler: jest.fn(),
    registerInitialEventPayload: jest.fn(),
    subscribe: jest.fn(),
  } as unknown as jest.Mocked<SeedlessOnboardingControllerMessenger>;
}

/**
 * Builds a mock encryptor for the vault.
 *
 * @returns The mock encryptor.
 */
function createMockVaultEncryptor() {
  return new MockVaultEncryptor();
}

/**
 * Builds a controller based on the given options and creates a new vault
 * and keychain, then calls the given function with that controller.
 *
 * @param args - Either a function, or an options bag + a function. The options
 * bag is equivalent to the options that KeyringController takes;
 * the function will be called with the built controller, along with its
 * preferences, encryptor and initial state.
 * @returns Whatever the callback returns.
 */
async function withController<ReturnValue>(
  ...args: WithControllerArgs<ReturnValue>
) {
  const [{ ...rest }, fn] = args.length === 2 ? args : [{}, args[0]];
  const encryptor = new MockVaultEncryptor();
  const messenger = buildSeedlessOnboardingControllerMessenger();

  const controller = new SeedlessOnboardingController({
    encryptor,
    messenger,
    network: Web3AuthNetwork.Devnet,
    ...rest,
  });
  const { toprfClient } = controller;

  return await fn({
    controller,
    encryptor,
    initialState: controller.state,
    messenger,
    toprfClient,
  });
}

/**
 * Builds a mock ToprfEncryptor.
 *
 * @returns The mock ToprfEncryptor.
 */
function createMockToprfEncryptor() {
  return new MockToprfEncryptorDecryptor();
}

/**
 * Mocks the createLocalKey method of the ToprfSecureBackup instance.
 *
 * @param toprfClient - The ToprfSecureBackup instance.
 * @param password - The mock password.
 *
 * @returns The mock createLocalKey result.
 */
function mockcreateLocalKey(toprfClient: ToprfSecureBackup, password: string) {
  const mockToprfEncryptor = createMockToprfEncryptor();

  const encKey = mockToprfEncryptor.deriveEncKey(password);
  const authKeyPair = mockToprfEncryptor.deriveAuthKeyPair(password);
  const oprfKey = BigInt(0);
  const seed = stringToBytes(password);

  jest.spyOn(toprfClient, 'createLocalKey').mockReturnValue({
    encKey,
    authKeyPair,
    oprfKey,
    seed,
  });

  return {
    encKey,
    authKeyPair,
    oprfKey,
    seed,
  };
}

/**
 * Mocks the recoverEncKey method of the ToprfSecureBackup instance.
 *
 * @param toprfClient - The ToprfSecureBackup instance.
 * @param password - The mock password.
 *
 * @returns The mock recoverEncKey result.
 */
function mockRecoverEncKey(
  toprfClient: ToprfSecureBackup,
  password: string,
): RecoverEncryptionKeyResult {
  const mockToprfEncryptor = createMockToprfEncryptor();

  const encKey = mockToprfEncryptor.deriveEncKey(password);
  const authKeyPair = mockToprfEncryptor.deriveAuthKeyPair(password);
  const rateLimitResetResult = Promise.resolve();

  jest.spyOn(toprfClient, 'recoverEncKey').mockResolvedValueOnce({
    encKey,
    authKeyPair,
    rateLimitResetResult,
    keyShareIndex: 1,
  });

  return {
    encKey,
    authKeyPair,
    rateLimitResetResult,
    keyShareIndex: 1,
  };
}

/**
 * Mocks the changeEncKey method of the ToprfSecureBackup instance.
 *
 * @param toprfClient - The ToprfSecureBackup instance.
 * @param newPassword - The new password.
 *
 * @returns The mock changeEncKey result.
 */
function mockChangeEncKey(
  toprfClient: ToprfSecureBackup,
  newPassword: string,
): ChangeEncryptionKeyResult {
  const mockToprfEncryptor = createMockToprfEncryptor();

  const encKey = mockToprfEncryptor.deriveEncKey(newPassword);
  const authKeyPair = mockToprfEncryptor.deriveAuthKeyPair(newPassword);

  jest.spyOn(toprfClient, 'changeEncKey').mockResolvedValueOnce({
    encKey,
    authKeyPair,
  });

  return { encKey, authKeyPair };
}

/**
 * Creates a mock vault.
 *
 * @param encKey - The encryption key.
 * @param authKeyPair - The authentication key pair.
 * @param MOCK_PASSWORD - The mock password.
 * @param authTokens - The authentication tokens.
 *
 * @returns The mock vault data.
 */
async function createMockVault(
  encKey: Uint8Array,
  authKeyPair: KeyPair,
  MOCK_PASSWORD: string,
  authTokens: NodeAuthTokens,
) {
  const encryptor = createMockVaultEncryptor();

  const serializedKeyData = JSON.stringify({
    authTokens,
    toprfEncryptionKey: bytesToBase64(encKey),
    toprfAuthKeyPair: JSON.stringify({
      sk: `0x${authKeyPair.sk.toString(16)}`,
      pk: bytesToBase64(authKeyPair.pk),
    }),
  });

  const encryptedMockVault = await encryptor.encrypt(
    MOCK_PASSWORD,
    serializedKeyData,
  );

  return encryptedMockVault;
}

/**
 * Decrypts the vault with the given password.
 *
 * @param vault - The vault.
 * @param password - The password.
 *
 * @returns The decrypted vault.
 */
async function decryptVault(vault: string, password: string) {
  const encryptor = createMockVaultEncryptor();

  const decryptedVault = await encryptor.decrypt(password, vault);

  const deserializedVault = JSON.parse(decryptedVault as string);

  const toprfEncryptionKey = base64ToBytes(
    deserializedVault.toprfEncryptionKey,
  );
  const parsedToprfAuthKeyPair = JSON.parse(deserializedVault.toprfAuthKeyPair);
  const toprfAuthKeyPair = {
    sk: BigInt(parsedToprfAuthKeyPair.sk),
    pk: base64ToBytes(parsedToprfAuthKeyPair.pk),
  };

  return {
    toprfEncryptionKey,
    toprfAuthKeyPair,
  };
}

const authConnection = AuthConnection.Google;
const socialLoginEmail = 'user-test@gmail.com';
const authConnectionId = 'seedless-onboarding';
const groupedAuthConnectionId = 'auth-server';
const userId = 'user-test@gmail.com';
const idTokens = ['idToken'];

const MOCK_NODE_AUTH_TOKENS = [
  {
    authToken: 'authToken',
    nodeIndex: 1,
    nodePubKey: 'nodePubKey',
  },
  {
    authToken: 'authToken2',
    nodeIndex: 2,
    nodePubKey: 'nodePubKey2',
  },
  {
    authToken: 'authToken3',
    nodeIndex: 3,
    nodePubKey: 'nodePubKey3',
  },
];

/**
 * Returns the initial controller state with the optional mock state data.
 *
 * @param options - The options.
 * @param options.withMockAuthenticatedUser - Whether to skip the authenticate method and use the mock authenticated user.
 * @param options.vault - The mock vault data.
 * @returns The initial controller state with the mock authenticated user.
 */
function getMockInitialControllerState(options?: {
  withMockAuthenticatedUser?: boolean;
  vault?: string;
}): Partial<SeedlessOnboardingControllerState> {
  const state = getDefaultSeedlessOnboardingControllerState();

  if (options?.vault) {
    state.vault = options.vault;
  }

  if (options?.withMockAuthenticatedUser) {
    state.nodeAuthTokens = MOCK_NODE_AUTH_TOKENS;
    state.authConnectionId = authConnectionId;
    state.groupedAuthConnectionId = groupedAuthConnectionId;
    state.userId = userId;
  }

  return state;
}

const MOCK_KEYRING_ID = 'mock-keyring-id';
const MOCK_SEED_PHRASE = stringToBytes(
  'horror pink muffin canal young photo magnet runway start elder patch until',
);

describe('SeedlessOnboardingController', () => {
  describe('constructor', () => {
    it('should be able to instantiate', () => {
      const messenger = buildSeedlessOnboardingControllerMessenger();
      const controller = new SeedlessOnboardingController({
        messenger,
      });
      expect(controller).toBeDefined();
      expect(controller.state).toStrictEqual({
        socialBackupsMetadata: [],
      });
    });

    it('should be able to instantiate with an encryptor', () => {
      const messenger = buildSeedlessOnboardingControllerMessenger();
      const encryptor = createMockVaultEncryptor();

      expect(
        () =>
          new SeedlessOnboardingController({
            messenger,
            encryptor,
          }),
      ).not.toThrow();
    });
  });

  describe('authenticate', () => {
    it('should be able to register a new user', async () => {
      await withController(async ({ controller, toprfClient }) => {
        jest.spyOn(toprfClient, 'authenticate').mockResolvedValue({
          nodeAuthTokens: MOCK_NODE_AUTH_TOKENS,
          isNewUser: false,
        });

        const authResult = await controller.authenticate({
          idTokens,
          authConnectionId,
          userId,
          authConnection,
          socialLoginEmail,
        });

        expect(authResult).toBeDefined();
        expect(authResult.nodeAuthTokens).toBeDefined();
        expect(authResult.isNewUser).toBe(false);

        expect(controller.state.nodeAuthTokens).toBeDefined();
        expect(controller.state.nodeAuthTokens).toStrictEqual(
          MOCK_NODE_AUTH_TOKENS,
        );
        expect(controller.state.authConnectionId).toBe(authConnectionId);
        expect(controller.state.userId).toBe(userId);
        expect(controller.state.authConnection).toBe(authConnection);
        expect(controller.state.socialLoginEmail).toBe(socialLoginEmail);
      });
    });

    it('should be able to authenticate an existing user', async () => {
      await withController(async ({ controller, toprfClient }) => {
        jest.spyOn(toprfClient, 'authenticate').mockResolvedValue({
          nodeAuthTokens: MOCK_NODE_AUTH_TOKENS,
          isNewUser: true,
        });

        const authResult = await controller.authenticate({
          idTokens,
          authConnectionId,
          userId,
          authConnection,
          socialLoginEmail,
        });

        expect(authResult).toBeDefined();
        expect(authResult.nodeAuthTokens).toBeDefined();
        expect(authResult.isNewUser).toBe(true);

        expect(controller.state.nodeAuthTokens).toBeDefined();
        expect(controller.state.nodeAuthTokens).toStrictEqual(
          MOCK_NODE_AUTH_TOKENS,
        );
        expect(controller.state.authConnectionId).toBe(authConnectionId);
        expect(controller.state.userId).toBe(userId);
        expect(controller.state.authConnection).toBe(authConnection);
        expect(controller.state.socialLoginEmail).toBe(socialLoginEmail);
      });
    });

    it('should be able to authenticate with groupedAuthConnectionId', async () => {
      await withController(async ({ controller, toprfClient }) => {
        // mock the authentication method
        jest.spyOn(toprfClient, 'authenticate').mockResolvedValue({
          nodeAuthTokens: MOCK_NODE_AUTH_TOKENS,
          isNewUser: true,
        });

        const authResult = await controller.authenticate({
          idTokens,
          authConnectionId,
          userId,
          groupedAuthConnectionId,
          authConnection,
          socialLoginEmail,
        });

        expect(authResult).toBeDefined();
        expect(authResult.nodeAuthTokens).toBeDefined();
        expect(authResult.isNewUser).toBe(true);

        expect(controller.state.nodeAuthTokens).toBeDefined();
        expect(controller.state.nodeAuthTokens).toStrictEqual(
          MOCK_NODE_AUTH_TOKENS,
        );
        expect(controller.state.authConnectionId).toBe(authConnectionId);
        expect(controller.state.groupedAuthConnectionId).toBe(
          groupedAuthConnectionId,
        );
        expect(controller.state.userId).toBe(userId);
      });
    });

    it('should throw an error if the authentication fails', async () => {
      const JSONRPC_ERROR = {
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Internal error',
        },
      };

      await withController(async ({ controller }) => {
        const handleCommitment = handleMockCommitment({
          status: 200,
          body: JSONRPC_ERROR,
        });
        const handleAuthentication = handleMockAuthenticate({
          status: 200,
          body: JSONRPC_ERROR,
        });
        await expect(
          controller.authenticate({
            idTokens,
            authConnectionId,
            groupedAuthConnectionId,
            userId,
            authConnection,
            socialLoginEmail,
          }),
        ).rejects.toThrow(
          SeedlessOnboardingControllerError.AuthenticationError,
        );
        expect(handleCommitment.isDone()).toBe(true);
        expect(handleAuthentication.isDone()).toBe(false);

        expect(controller.state.nodeAuthTokens).toBeUndefined();
        expect(controller.state.authConnectionId).toBeUndefined();
        expect(controller.state.groupedAuthConnectionId).toBeUndefined();
        expect(controller.state.userId).toBeUndefined();
      });
    });
  });

  describe('createToprfKeyAndBackupSeedPhrase', () => {
    const MOCK_PASSWORD = 'mock-password';

    it('should be able to create a seed phrase backup', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller, toprfClient, initialState, encryptor }) => {
          const { encKey, authKeyPair } = mockcreateLocalKey(
            toprfClient,
            MOCK_PASSWORD,
          );

          // persist the local enc key
          jest.spyOn(toprfClient, 'persistLocalKey').mockResolvedValueOnce();
          // encrypt and store the secret data
          const mockSecretDataAdd = handleMockSecretDataAdd();
          await controller.createToprfKeyAndBackupSeedPhrase(
            MOCK_PASSWORD,
            MOCK_SEED_PHRASE,
            MOCK_KEYRING_ID,
          );

          expect(mockSecretDataAdd.isDone()).toBe(true);

          expect(controller.state.vault).toBeDefined();
          expect(controller.state.vault).not.toBe(initialState.vault);
          expect(controller.state.vault).not.toStrictEqual({});

          // verify the vault data
          const encryptedMockVault = await createMockVault(
            encKey,
            authKeyPair,
            MOCK_PASSWORD,
            MOCK_NODE_AUTH_TOKENS,
          );

          const expectedVaultValue = await encryptor.decrypt(
            MOCK_PASSWORD,
            encryptedMockVault,
          );
          const resultedVaultValue = await encryptor.decrypt(
            MOCK_PASSWORD,
            controller.state.vault as string,
          );

          expect(expectedVaultValue).toStrictEqual(resultedVaultValue);

          // should be able to get the hash of the seed phrase backup from the state
          expect(
            controller.getSeedPhraseBackupHash(MOCK_SEED_PHRASE),
          ).toBeDefined();
        },
      );
    });

    it('should be able to create a seed phrase backup without groupedAuthConnectionId', async () => {
      await withController(
        async ({ controller, toprfClient, encryptor, initialState }) => {
          jest.spyOn(toprfClient, 'authenticate').mockResolvedValue({
            nodeAuthTokens: MOCK_NODE_AUTH_TOKENS,
            isNewUser: false,
          });

          await controller.authenticate({
            idTokens,
            authConnectionId,
            userId,
            authConnection,
            socialLoginEmail,
          });

          const { encKey, authKeyPair } = mockcreateLocalKey(
            toprfClient,
            MOCK_PASSWORD,
          );

          // persist the local enc key
          jest.spyOn(toprfClient, 'persistLocalKey').mockResolvedValueOnce();
          // encrypt and store the secret data
          const mockSecretDataAdd = handleMockSecretDataAdd();
          await controller.createToprfKeyAndBackupSeedPhrase(
            MOCK_PASSWORD,
            MOCK_SEED_PHRASE,
            MOCK_KEYRING_ID,
          );

          expect(mockSecretDataAdd.isDone()).toBe(true);

          expect(controller.state.vault).toBeDefined();
          expect(controller.state.vault).not.toBe(initialState.vault);
          expect(controller.state.vault).not.toStrictEqual({});

          // verify the vault data
          const encryptedMockVault = await createMockVault(
            encKey,
            authKeyPair,
            MOCK_PASSWORD,
            MOCK_NODE_AUTH_TOKENS,
          );

          const expectedVaultValue = await encryptor.decrypt(
            MOCK_PASSWORD,
            encryptedMockVault,
          );
          const resultedVaultValue = await encryptor.decrypt(
            MOCK_PASSWORD,
            controller.state.vault as string,
          );

          expect(expectedVaultValue).toStrictEqual(resultedVaultValue);

          // should be able to get the hash of the seed phrase backup from the state
          expect(
            controller.getSeedPhraseBackupHash(MOCK_SEED_PHRASE),
          ).toBeDefined();
        },
      );
    });

    it('should throw an error if create encryption key fails', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller, toprfClient, initialState }) => {
          jest.spyOn(toprfClient, 'createLocalKey').mockImplementation(() => {
            throw new Error('Failed to create local encryption key');
          });

          await expect(
            controller.createToprfKeyAndBackupSeedPhrase(
              MOCK_PASSWORD,
              MOCK_SEED_PHRASE,
              MOCK_KEYRING_ID,
            ),
          ).rejects.toThrow('Failed to create local encryption key');

          // verify vault is not created
          expect(controller.state.vault).toBe(initialState.vault);
        },
      );
    });

    it('should throw an error if authenticated user information is not found', async () => {
      await withController(async ({ controller, initialState }) => {
        await expect(
          controller.createToprfKeyAndBackupSeedPhrase(
            MOCK_PASSWORD,
            MOCK_SEED_PHRASE,
            MOCK_KEYRING_ID,
          ),
        ).rejects.toThrow(
          SeedlessOnboardingControllerError.MissingAuthUserInfo,
        );

        // verify vault is not created
        expect(controller.state.vault).toBe(initialState.vault);
      });
    });

    it('should throw an error if user does not have the AuthToken', async () => {
      await withController(
        { state: { userId, authConnectionId, groupedAuthConnectionId } },
        async ({ controller, initialState }) => {
          await expect(
            controller.createToprfKeyAndBackupSeedPhrase(
              MOCK_PASSWORD,
              MOCK_SEED_PHRASE,
              MOCK_KEYRING_ID,
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerError.InsufficientAuthToken,
          );

          // verify vault is not created
          expect(controller.state.vault).toBe(initialState.vault);
        },
      );
    });

    it('should throw an error if persistLocalKey fails', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller, toprfClient }) => {
          mockcreateLocalKey(toprfClient, MOCK_PASSWORD);

          jest
            .spyOn(toprfClient, 'persistLocalKey')
            .mockRejectedValueOnce(
              new Error('Failed to persist local encryption key'),
            );

          const mockSecretDataAdd = handleMockSecretDataAdd();
          await expect(
            controller.createToprfKeyAndBackupSeedPhrase(
              MOCK_PASSWORD,
              MOCK_SEED_PHRASE,
              MOCK_KEYRING_ID,
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerError.FailedToPersistOprfKey,
          );

          expect(mockSecretDataAdd.isDone()).toBe(true);
        },
      );
    });

    it('should throw an error if failed to create seedphrase backup', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller, toprfClient }) => {
          mockcreateLocalKey(toprfClient, MOCK_PASSWORD);

          jest.spyOn(toprfClient, 'persistLocalKey').mockResolvedValueOnce();

          jest
            .spyOn(toprfClient, 'addSecretDataItem')
            .mockRejectedValueOnce(new Error('Failed to add secret data item'));

          await expect(
            controller.createToprfKeyAndBackupSeedPhrase(
              MOCK_PASSWORD,
              MOCK_SEED_PHRASE,
              MOCK_KEYRING_ID,
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerError.FailedToEncryptAndStoreSeedPhraseBackup,
          );
        },
      );
    });
  });

  describe('fetchAndRestoreSeedPhrase', () => {
    const MOCK_PASSWORD = 'mock-password';

    it('should be able to restore and login with a seed phrase from metadata', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller, toprfClient, initialState, encryptor }) => {
          // fetch and decrypt the secret data
          const { encKey, authKeyPair } = mockRecoverEncKey(
            toprfClient,
            MOCK_PASSWORD,
          );

          const mockSecretDataGet = handleMockSecretDataGet({
            status: 200,
            body: createMockSecretDataGetResponse(
              [MOCK_SEED_PHRASE],
              MOCK_PASSWORD,
            ),
          });
          const secretData =
            await controller.fetchAllSeedPhrases(MOCK_PASSWORD);

          expect(mockSecretDataGet.isDone()).toBe(true);
          expect(secretData).toBeDefined();
          expect(secretData).toStrictEqual([MOCK_SEED_PHRASE]);

          expect(controller.state.vault).toBeDefined();
          expect(controller.state.vault).not.toBe(initialState.vault);
          expect(controller.state.vault).not.toStrictEqual({});

          // verify the vault data
          const encryptedMockVault = await createMockVault(
            encKey,
            authKeyPair,
            MOCK_PASSWORD,
            MOCK_NODE_AUTH_TOKENS,
          );

          const expectedVaultValue = await encryptor.decrypt(
            MOCK_PASSWORD,
            encryptedMockVault,
          );
          const resultedVaultValue = await encryptor.decrypt(
            MOCK_PASSWORD,
            controller.state.vault as string,
          );

          expect(expectedVaultValue).toStrictEqual(resultedVaultValue);
        },
      );
    });

    it('should be able to restore multiple seed phrases from metadata', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller, toprfClient, encryptor }) => {
          // fetch and decrypt the secret data
          const { encKey, authKeyPair } = mockRecoverEncKey(
            toprfClient,
            MOCK_PASSWORD,
          );

          const mockSecretDataGet = handleMockSecretDataGet({
            status: 200,
            body: createMockSecretDataGetResponse(
              MULTIPLE_MOCK_SEEDPHRASE_METADATA,
              MOCK_PASSWORD,
            ),
          });
          const secretData =
            await controller.fetchAllSeedPhrases(MOCK_PASSWORD);

          expect(mockSecretDataGet.isDone()).toBe(true);
          expect(secretData).toBeDefined();

          // `fetchAndRestoreSeedPhraseMetadata` should sort the seed phrases by timestamp and return the seed phrases in the correct order
          // the seed phrases are sorted in descending order, so the firstly created seed phrase is the latest item in the array
          expect(secretData).toStrictEqual([
            stringToBytes('seedPhrase3'),
            stringToBytes('seedPhrase2'),
            stringToBytes('seedPhrase1'),
          ]);

          // verify the vault data
          const encryptedMockVault = await createMockVault(
            encKey,
            authKeyPair,
            MOCK_PASSWORD,
            MOCK_NODE_AUTH_TOKENS,
          );

          const expectedVaultValue = await encryptor.decrypt(
            MOCK_PASSWORD,
            encryptedMockVault,
          );
          const resultedVaultValue = await encryptor.decrypt(
            MOCK_PASSWORD,
            controller.state.vault as string,
          );

          expect(expectedVaultValue).toStrictEqual(resultedVaultValue);
        },
      );
    });

    it('should be able to restore seed phrase backup without groupedAuthConnectionId', async () => {
      await withController(
        {
          state: {
            nodeAuthTokens: MOCK_NODE_AUTH_TOKENS,
            userId,
            authConnectionId,
          },
        },
        async ({ controller, toprfClient, initialState, encryptor }) => {
          // fetch and decrypt the secret data
          const { encKey, authKeyPair } = mockRecoverEncKey(
            toprfClient,
            MOCK_PASSWORD,
          );

          const mockSecretDataGet = handleMockSecretDataGet({
            status: 200,
            body: createMockSecretDataGetResponse(
              [MOCK_SEED_PHRASE],
              MOCK_PASSWORD,
            ),
          });
          const secretData =
            await controller.fetchAllSeedPhrases(MOCK_PASSWORD);

          expect(mockSecretDataGet.isDone()).toBe(true);
          expect(secretData).toBeDefined();
          expect(secretData).toStrictEqual([MOCK_SEED_PHRASE]);

          expect(controller.state.vault).toBeDefined();
          expect(controller.state.vault).not.toBe(initialState.vault);
          expect(controller.state.vault).not.toStrictEqual({});

          // verify the vault data
          const encryptedMockVault = await createMockVault(
            encKey,
            authKeyPair,
            MOCK_PASSWORD,
            MOCK_NODE_AUTH_TOKENS,
          );

          const expectedVaultValue = await encryptor.decrypt(
            MOCK_PASSWORD,
            encryptedMockVault,
          );
          const resultedVaultValue = await encryptor.decrypt(
            MOCK_PASSWORD,
            controller.state.vault as string,
          );

          expect(expectedVaultValue).toStrictEqual(resultedVaultValue);
        },
      );
    });

    it('should throw an error if the key recovery failed', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller, toprfClient }) => {
          jest
            .spyOn(toprfClient, 'recoverEncKey')
            .mockRejectedValueOnce(
              new Error('Failed to recover encryption key'),
            );

          await expect(
            controller.fetchAllSeedPhrases('INCORRECT_PASSWORD'),
          ).rejects.toThrow(SeedlessOnboardingControllerError.LoginFailedError);
        },
      );
    });

    it('should throw an error if failed to decrypt the SeedPhraseBackup data', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller, toprfClient }) => {
          mockRecoverEncKey(toprfClient, MOCK_PASSWORD);

          jest
            .spyOn(toprfClient, 'fetchAllSecretDataItems')
            .mockRejectedValueOnce(new Error('Failed to decrypt data'));

          await expect(
            controller.fetchAllSeedPhrases('INCORRECT_PASSWORD'),
          ).rejects.toThrow(
            SeedlessOnboardingControllerError.FailedToFetchSeedPhraseMetadata,
          );
        },
      );
    });

    it('should throw an error if the restored seed phrases are not in the correct shape', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller, toprfClient }) => {
          mockRecoverEncKey(toprfClient, MOCK_PASSWORD);

          // mock the incorrect data shape
          jest
            .spyOn(toprfClient, 'fetchAllSecretDataItems')
            .mockResolvedValueOnce([
              stringToBytes(JSON.stringify({ key: 'value' })),
            ]);
          await expect(
            controller.fetchAllSeedPhrases(MOCK_PASSWORD),
          ).rejects.toThrow(
            SeedlessOnboardingControllerError.FailedToFetchSeedPhraseMetadata,
          );
        },
      );
    });

    it('should handle TooManyLoginAttempts error', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller, toprfClient }) => {
          jest.spyOn(toprfClient, 'recoverEncKey').mockRejectedValueOnce(
            new TOPRFError(1009, 'Rate limit exceeded', {
              rateLimitDetails: {
                remainingTime: 300,
                message: 'Rate limit in effect',
              },
            }),
          );

          await expect(
            controller.fetchAllSeedPhrases(MOCK_PASSWORD),
          ).rejects.toStrictEqual(
            new RecoveryError(
              SeedlessOnboardingControllerError.TooManyLoginAttempts,
              {
                remainingTime: 10,
                message: 'Rate limit exceeded',
              },
            ),
          );
        },
      );
    });

    it('should handle IncorrectPassword error', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller, toprfClient }) => {
          jest
            .spyOn(toprfClient, 'recoverEncKey')
            .mockRejectedValueOnce(
              new TOPRFError(1006, 'Could not derive encryption key'),
            );

          await expect(
            controller.fetchAllSeedPhrases(MOCK_PASSWORD),
          ).rejects.toStrictEqual(
            new RecoveryError(
              SeedlessOnboardingControllerError.IncorrectPassword,
            ),
          );
        },
      );
    });

    it('should handle Unexpected error during key recovery', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller, toprfClient }) => {
          jest
            .spyOn(toprfClient, 'recoverEncKey')
            .mockRejectedValueOnce(
              new TOPRFError(1004, 'Insufficient valid responses'),
            );

          await expect(
            controller.fetchAllSeedPhrases(MOCK_PASSWORD),
          ).rejects.toStrictEqual(
            new RecoveryError(
              SeedlessOnboardingControllerError.LoginFailedError,
            ),
          );
        },
      );
    });
  });

  describe('updateBackupMetadataState', () => {
    it('should be able to update the backup metadata state', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller }) => {
          controller.updateBackupMetadataState(
            MOCK_KEYRING_ID,
            MOCK_SEED_PHRASE,
          );
          const MOCK_SEED_PHRASE_HASH = keccak256AndHexify(MOCK_SEED_PHRASE);
          expect(controller.state.socialBackupsMetadata).toStrictEqual([
            { id: MOCK_KEYRING_ID, hash: MOCK_SEED_PHRASE_HASH },
          ]);
        },
      );
    });

    it('should not update the backup metadata state if the provided keyringId is already in the state', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller }) => {
          controller.updateBackupMetadataState(
            MOCK_KEYRING_ID,
            MOCK_SEED_PHRASE,
          );
          const MOCK_SEED_PHRASE_HASH = keccak256AndHexify(MOCK_SEED_PHRASE);
          expect(controller.state.socialBackupsMetadata).toStrictEqual([
            { id: MOCK_KEYRING_ID, hash: MOCK_SEED_PHRASE_HASH },
          ]);

          controller.updateBackupMetadataState(
            MOCK_KEYRING_ID,
            MOCK_SEED_PHRASE,
          );
          expect(controller.state.socialBackupsMetadata).toStrictEqual([
            { id: MOCK_KEYRING_ID, hash: MOCK_SEED_PHRASE_HASH },
          ]);
        },
      );
    });
  });

  describe('changePassword', () => {
    const MOCK_PASSWORD = 'mock-password';
    const NEW_MOCK_PASSWORD = 'new-mock-password';
    const MOCK_VAULT = JSON.stringify({ foo: 'bar' });

    it('should be able to update new password', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller, toprfClient }) => {
          mockcreateLocalKey(toprfClient, MOCK_PASSWORD);

          // persist the local enc key
          jest.spyOn(toprfClient, 'persistLocalKey').mockResolvedValueOnce();
          // encrypt and store the secret data
          handleMockSecretDataAdd();
          await controller.createToprfKeyAndBackupSeedPhrase(
            MOCK_PASSWORD,
            MOCK_SEED_PHRASE,
            MOCK_KEYRING_ID,
          );

          // verify the vault data before update password
          expect(controller.state.vault).toBeDefined();
          const vaultBeforeUpdatePassword = controller.state.vault;
          const {
            toprfEncryptionKey: oldEncKey,
            toprfAuthKeyPair: oldAuthKeyPair,
          } = await decryptVault(
            vaultBeforeUpdatePassword as string,
            MOCK_PASSWORD,
          );

          // mock the recover enc key
          mockRecoverEncKey(toprfClient, MOCK_PASSWORD);

          // mock the change enc key
          const { encKey: newEncKey, authKeyPair: newAuthKeyPair } =
            mockChangeEncKey(toprfClient, NEW_MOCK_PASSWORD);

          await controller.changePassword(NEW_MOCK_PASSWORD, MOCK_PASSWORD);

          // verify the vault after update password
          const vaultAfterUpdatePassword = controller.state.vault;
          const {
            toprfEncryptionKey: newEncKeyFromVault,
            toprfAuthKeyPair: newAuthKeyPairFromVault,
          } = await decryptVault(
            vaultAfterUpdatePassword as string,
            NEW_MOCK_PASSWORD,
          );

          // verify that the encryption key and auth key pair are updated
          expect(newEncKeyFromVault).not.toStrictEqual(oldEncKey);
          expect(newAuthKeyPairFromVault.sk).not.toStrictEqual(
            oldAuthKeyPair.sk,
          );
          expect(newAuthKeyPairFromVault.pk).not.toStrictEqual(
            oldAuthKeyPair.pk,
          );

          // verify the vault data is updated with the new encryption key and auth key pair
          expect(newEncKeyFromVault).toStrictEqual(newEncKey);
          expect(newAuthKeyPairFromVault.sk).toStrictEqual(newAuthKeyPair.sk);
          expect(newAuthKeyPairFromVault.pk).toStrictEqual(newAuthKeyPair.pk);
        },
      );
    });

    it('should be able to update new password without groupedAuthConnectionId', async () => {
      await withController(
        {
          state: {
            nodeAuthTokens: MOCK_NODE_AUTH_TOKENS,
            userId,
            authConnectionId,
          },
        },
        async ({ controller, toprfClient }) => {
          mockcreateLocalKey(toprfClient, MOCK_PASSWORD);

          // persist the local enc key
          jest.spyOn(toprfClient, 'persistLocalKey').mockResolvedValueOnce();
          // encrypt and store the secret data
          handleMockSecretDataAdd();
          await controller.createToprfKeyAndBackupSeedPhrase(
            MOCK_PASSWORD,
            MOCK_SEED_PHRASE,
            MOCK_KEYRING_ID,
          );

          // verify the vault data before update password
          expect(controller.state.vault).toBeDefined();
          const vaultBeforeUpdatePassword = controller.state.vault;
          const {
            toprfEncryptionKey: oldEncKey,
            toprfAuthKeyPair: oldAuthKeyPair,
          } = await decryptVault(
            vaultBeforeUpdatePassword as string,
            MOCK_PASSWORD,
          );

          // mock the recover enc key
          mockRecoverEncKey(toprfClient, MOCK_PASSWORD);

          // mock the change enc key
          const { encKey: newEncKey, authKeyPair: newAuthKeyPair } =
            mockChangeEncKey(toprfClient, NEW_MOCK_PASSWORD);

          await controller.changePassword(NEW_MOCK_PASSWORD, MOCK_PASSWORD);

          // verify the vault after update password
          const vaultAfterUpdatePassword = controller.state.vault;
          const {
            toprfEncryptionKey: newEncKeyFromVault,
            toprfAuthKeyPair: newAuthKeyPairFromVault,
          } = await decryptVault(
            vaultAfterUpdatePassword as string,
            NEW_MOCK_PASSWORD,
          );

          // verify that the encryption key and auth key pair are updated
          expect(newEncKeyFromVault).not.toStrictEqual(oldEncKey);
          expect(newAuthKeyPairFromVault.sk).not.toStrictEqual(
            oldAuthKeyPair.sk,
          );
          expect(newAuthKeyPairFromVault.pk).not.toStrictEqual(
            oldAuthKeyPair.pk,
          );

          // verify the vault data is updated with the new encryption key and auth key pair
          expect(newEncKeyFromVault).toStrictEqual(newEncKey);
          expect(newAuthKeyPairFromVault.sk).toStrictEqual(newAuthKeyPair.sk);
          expect(newAuthKeyPairFromVault.pk).toStrictEqual(newAuthKeyPair.pk);
        },
      );
    });

    it('should throw an error if vault is missing', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller }) => {
          await expect(
            controller.changePassword(NEW_MOCK_PASSWORD, MOCK_PASSWORD),
          ).rejects.toThrow(SeedlessOnboardingControllerError.VaultError);
        },
      );
    });

    it('should throw an error if failed to parse vault data', async () => {
      await withController(
        {
          state: getMockInitialControllerState({ vault: '{ "foo": "bar"' }),
        },
        async ({ controller, encryptor }) => {
          jest
            .spyOn(encryptor, 'decrypt')
            .mockResolvedValueOnce('{ "foo": "bar"');
          await expect(
            controller.changePassword(NEW_MOCK_PASSWORD, MOCK_PASSWORD),
          ).rejects.toThrow(SeedlessOnboardingControllerError.InvalidVaultData);
        },
      );
    });

    it('should throw an error if vault unlocked has an unexpected shape', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            vault: MOCK_VAULT,
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller, encryptor }) => {
          jest
            .spyOn(encryptor, 'decrypt')
            .mockResolvedValueOnce({ foo: 'bar' });
          await expect(
            controller.changePassword(NEW_MOCK_PASSWORD, MOCK_PASSWORD),
          ).rejects.toThrow(SeedlessOnboardingControllerError.InvalidVaultData);

          jest.spyOn(encryptor, 'decrypt').mockResolvedValueOnce('null');
          await expect(
            controller.changePassword(NEW_MOCK_PASSWORD, MOCK_PASSWORD),
          ).rejects.toThrow(SeedlessOnboardingControllerError.VaultDataError);
        },
      );
    });

    it('should throw an error if vault unlocked has invalid authentication data', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            vault: MOCK_VAULT,
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller, encryptor }) => {
          jest.spyOn(encryptor, 'decrypt').mockResolvedValueOnce(MOCK_VAULT);
          await expect(
            controller.changePassword(NEW_MOCK_PASSWORD, MOCK_PASSWORD),
          ).rejects.toThrow(SeedlessOnboardingControllerError.VaultDataError);
        },
      );
    });

    it('should throw an error if the old password is incorrect', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            vault: MOCK_VAULT,
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller, encryptor }) => {
          jest
            .spyOn(encryptor, 'decrypt')
            .mockRejectedValueOnce(new Error('Incorrect password'));
          await expect(
            controller.changePassword(NEW_MOCK_PASSWORD, 'INCORRECT_PASSWORD'),
          ).rejects.toThrow('Incorrect password');
        },
      );
    });

    it('should throw an error if failed to change password', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller, toprfClient }) => {
          mockcreateLocalKey(toprfClient, MOCK_PASSWORD);

          // persist the local enc key
          jest.spyOn(toprfClient, 'persistLocalKey').mockResolvedValueOnce();
          // encrypt and store the secret data
          handleMockSecretDataAdd();
          await controller.createToprfKeyAndBackupSeedPhrase(
            MOCK_PASSWORD,
            MOCK_SEED_PHRASE,
            MOCK_KEYRING_ID,
          );

          // mock the recover enc key
          mockRecoverEncKey(toprfClient, MOCK_PASSWORD);

          jest
            .spyOn(toprfClient, 'changeEncKey')
            .mockRejectedValueOnce(
              new Error('Failed to change encryption key'),
            );

          await expect(
            controller.changePassword(NEW_MOCK_PASSWORD, MOCK_PASSWORD),
          ).rejects.toThrow(
            SeedlessOnboardingControllerError.FailedToChangePassword,
          );
        },
      );
    });
  });

  describe('vault', () => {
    const MOCK_PASSWORD = 'mock-password';

    it('should not create a vault if the user does not have encrypted seed phrase metadata', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller, initialState, toprfClient }) => {
          expect(initialState.vault).toBeUndefined();

          mockRecoverEncKey(toprfClient, MOCK_PASSWORD);

          const mockSecretDataGet = handleMockSecretDataGet({
            status: 200,
            body: {
              success: true,
              data: [],
            },
          });
          await controller.fetchAllSeedPhrases(MOCK_PASSWORD);

          expect(mockSecretDataGet.isDone()).toBe(true);
          expect(controller.state.vault).toBeUndefined();
          expect(controller.state.vault).toBe(initialState.vault);
        },
      );
    });

    it('should throw an error if the password is an empty string', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller, toprfClient }) => {
          // create the local enc key
          mockcreateLocalKey(toprfClient, MOCK_PASSWORD);
          // persist the local enc key
          jest.spyOn(toprfClient, 'persistLocalKey').mockResolvedValueOnce();
          // mock the secret data add
          const mockSecretDataAdd = handleMockSecretDataAdd();
          await expect(
            controller.createToprfKeyAndBackupSeedPhrase(
              '',
              MOCK_SEED_PHRASE,
              MOCK_KEYRING_ID,
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerError.InvalidEmptyPassword,
          );

          expect(mockSecretDataAdd.isDone()).toBe(true);
        },
      );
    });

    it('should throw an error if the passowrd is of wrong type', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller, toprfClient }) => {
          // create the local enc key
          mockcreateLocalKey(toprfClient, MOCK_PASSWORD);
          // persist the local enc key
          jest.spyOn(toprfClient, 'persistLocalKey').mockResolvedValueOnce();
          // mock the secret data add
          const mockSecretDataAdd = handleMockSecretDataAdd();
          await expect(
            // @ts-expect-error Intentionally passing wrong password type
            controller.createToprfKeyAndBackupSeedPhrase(123, MOCK_SEED_PHRASE),
          ).rejects.toThrow(
            SeedlessOnboardingControllerError.WrongPasswordType,
          );

          expect(mockSecretDataAdd.isDone()).toBe(true);
        },
      );
    });
  });

  describe('SeedPhraseMetadata', () => {
    it('should be able to create a seed phrase metadata', () => {
      // should be able to create a SeedPhraseMetadata instance via constructor
      const seedPhraseMetadata = new SeedPhraseMetadata(MOCK_SEED_PHRASE);
      expect(seedPhraseMetadata.seedPhrase).toBeDefined();
      expect(seedPhraseMetadata.timestamp).toBeDefined();

      // should be able to create a SeedPhraseMetadata instance with a timestamp via constructor
      const timestamp = 18_000;
      const seedPhraseMetadata2 = new SeedPhraseMetadata(
        MOCK_SEED_PHRASE,
        timestamp,
      );
      expect(seedPhraseMetadata2.seedPhrase).toBeDefined();
      expect(seedPhraseMetadata2.timestamp).toBe(timestamp);
      expect(seedPhraseMetadata2.seedPhrase).toStrictEqual(MOCK_SEED_PHRASE);
    });

    it('should be able to correctly create `SeedPhraseMetadata` Array for batch seedphrases', () => {
      const seedPhrases = ['seed phrase 1', 'seed phrase 2', 'seed phrase 3'];
      const rawSeedPhrases = seedPhrases.map(stringToBytes);

      const seedPhraseMetadataArray =
        SeedPhraseMetadata.fromBatchSeedPhrases(rawSeedPhrases);
      expect(seedPhraseMetadataArray).toHaveLength(seedPhrases.length);

      // check the timestamp, the first one should be the oldest
      expect(seedPhraseMetadataArray[0].timestamp).toBeLessThan(
        seedPhraseMetadataArray[1].timestamp,
      );
      expect(seedPhraseMetadataArray[1].timestamp).toBeLessThan(
        seedPhraseMetadataArray[2].timestamp,
      );
    });

    it('should be able to serialized and parse a seed phrase metadata', () => {
      const seedPhraseMetadata = new SeedPhraseMetadata(MOCK_SEED_PHRASE);
      const serializedSeedPhraseBytes = seedPhraseMetadata.toBytes();

      const parsedSeedPhraseMetadata = SeedPhraseMetadata.fromRawMetadata(
        serializedSeedPhraseBytes,
      );
      expect(parsedSeedPhraseMetadata.seedPhrase).toBeDefined();
      expect(parsedSeedPhraseMetadata.timestamp).toBeDefined();
      expect(parsedSeedPhraseMetadata.seedPhrase).toStrictEqual(
        MOCK_SEED_PHRASE,
      );
    });

    it('should be able to sort seed phrase metadata', () => {
      const mockSeedPhraseMetadata1 = new SeedPhraseMetadata(
        MOCK_SEED_PHRASE,
        1000,
      );
      const mockSeedPhraseMetadata2 = new SeedPhraseMetadata(
        MOCK_SEED_PHRASE,
        2000,
      );

      // sort in ascending order
      const sortedSeedPhraseMetadata = SeedPhraseMetadata.sort(
        [mockSeedPhraseMetadata1, mockSeedPhraseMetadata2],
        'asc',
      );
      expect(sortedSeedPhraseMetadata[0].timestamp).toBeLessThan(
        sortedSeedPhraseMetadata[1].timestamp,
      );

      // sort in descending order
      const sortedSeedPhraseMetadataDesc = SeedPhraseMetadata.sort(
        [mockSeedPhraseMetadata1, mockSeedPhraseMetadata2],
        'desc',
      );
      expect(sortedSeedPhraseMetadataDesc[0].timestamp).toBeGreaterThan(
        sortedSeedPhraseMetadataDesc[1].timestamp,
      );
    });
  });
});
