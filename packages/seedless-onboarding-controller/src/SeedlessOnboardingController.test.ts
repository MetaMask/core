import { keccak256AndHexify } from '@metamask/auth-network-utils';
import type { Messenger } from '@metamask/base-controller';
import type { EncryptionKey } from '@metamask/browser-passworder';
import {
  encrypt,
  decrypt,
  decryptWithDetail,
  encryptWithDetail,
  decryptWithKey as decryptWithKeyBrowserPassworder,
  importKey as importKeyBrowserPassworder,
} from '@metamask/browser-passworder';
import {
  TOPRFError,
  type FetchAuthPubKeyResult,
  type SEC1EncodedPublicKey,
  type ChangeEncryptionKeyResult,
  type KeyPair,
  type NodeAuthTokens,
  type RecoverEncryptionKeyResult,
  type ToprfSecureBackup,
  TOPRFErrorCode,
} from '@metamask/toprf-secure-backup';
import {
  base64ToBytes,
  bytesToBase64,
  stringToBytes,
  bigIntToHex,
} from '@metamask/utils';
import type { webcrypto } from 'node:crypto';

import {
  Web3AuthNetwork,
  SeedlessOnboardingControllerErrorMessage,
  AuthConnection,
  SecretType,
  SecretMetadataVersion,
} from './constants';
import { PasswordSyncError, RecoveryError } from './errors';
import { SecretMetadata } from './SecretMetadata';
import {
  getDefaultSeedlessOnboardingControllerState,
  SeedlessOnboardingController,
} from './SeedlessOnboardingController';
import type {
  AllowedActions,
  AllowedEvents,
  SeedlessOnboardingControllerMessenger,
  SeedlessOnboardingControllerOptions,
  SeedlessOnboardingControllerState,
  VaultEncryptor,
} from './types';
import { mockSeedlessOnboardingMessenger } from '../tests/__fixtures__/mockMessenger';
import {
  handleMockSecretDataGet,
  handleMockSecretDataAdd,
  handleMockCommitment,
  handleMockAuthenticate,
} from '../tests/__fixtures__/topfClient';
import {
  createMockSecretDataGetResponse,
  MULTIPLE_MOCK_SECRET_METADATA,
} from '../tests/mocks/toprf';
import { MockToprfEncryptorDecryptor } from '../tests/mocks/toprfEncryptor';
import MockVaultEncryptor from '../tests/mocks/vaultEncryptor';

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

const MOCK_KEYRING_ID = 'mock-keyring-id';
const MOCK_SEED_PHRASE = stringToBytes(
  'horror pink muffin canal young photo magnet runway start elder patch until',
);

const MOCK_AUTH_PUB_KEY = 'A09CwPHdl/qo2AjBOHen5d4QORaLedxOrSdgReq8IhzQ';
const MOCK_AUTH_PUB_KEY_OUTDATED =
  'Ao2sa8imX7SD4KE4fJLoJ/iBufmaBxSFygG1qUhW2qAb';

type WithControllerCallback<ReturnValue, EKey> = ({
  controller,
  initialState,
  encryptor,
  messenger,
}: {
  controller: SeedlessOnboardingController<EKey>;
  encryptor: VaultEncryptor<EKey>;
  initialState: SeedlessOnboardingControllerState;
  messenger: SeedlessOnboardingControllerMessenger;
  baseMessenger: Messenger<AllowedActions, AllowedEvents>;
  toprfClient: ToprfSecureBackup;
}) => Promise<ReturnValue> | ReturnValue;

type WithControllerOptions<EKey> = Partial<
  SeedlessOnboardingControllerOptions<EKey>
>;

type WithControllerArgs<ReturnValue, EKey> =
  | [WithControllerCallback<ReturnValue, EKey>]
  | [WithControllerOptions<EKey>, WithControllerCallback<ReturnValue, EKey>];

/**
 * Get the default vault encryptor for the Seedless Onboarding Controller.
 *
 * By default, we'll use the encryption utilities from `@metamask/browser-passworder`.
 *
 * @returns The default vault encryptor for the Seedless Onboarding Controller.
 */
function getDefaultSeedlessOnboardingVaultEncryptor() {
  return {
    encrypt,
    encryptWithDetail,
    decrypt,
    decryptWithDetail,
    decryptWithKey: decryptWithKeyBrowserPassworder as (
      key: unknown,
      payload: unknown,
    ) => Promise<unknown>,
    importKey: importKeyBrowserPassworder,
  };
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
  ...args: WithControllerArgs<ReturnValue, EncryptionKey | webcrypto.CryptoKey>
) {
  const [{ ...rest }, fn] = args.length === 2 ? args : [{}, args[0]];
  const encryptor = new MockVaultEncryptor();
  const { messenger, baseMessenger } = mockSeedlessOnboardingMessenger();

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
    baseMessenger,
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

  jest.spyOn(toprfClient, 'createLocalKey').mockResolvedValueOnce({
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
 * Mocks the fetchAuthPubKey method of the ToprfSecureBackup instance.
 *
 * @param toprfClient - The ToprfSecureBackup instance.
 * @param authPubKey - The mock authPubKey.
 *
 * @returns The mock fetchAuthPubKey result.
 */
function mockFetchAuthPubKey(
  toprfClient: ToprfSecureBackup,
  authPubKey: SEC1EncodedPublicKey = base64ToBytes(MOCK_AUTH_PUB_KEY),
): FetchAuthPubKeyResult {
  jest.spyOn(toprfClient, 'fetchAuthPubKey').mockResolvedValue({
    authPubKey,
  });

  return {
    authPubKey,
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
 * Mocks the createToprfKeyAndBackupSeedPhrase method of the SeedlessOnboardingController instance.
 *
 * @param toprfClient - The ToprfSecureBackup instance.
 * @param controller - The SeedlessOnboardingController instance.
 * @param password - The mock password.
 * @param seedPhrase - The mock seed phrase.
 * @param keyringId - The mock keyring id.
 */
async function mockCreateToprfKeyAndBackupSeedPhrase<EKey>(
  toprfClient: ToprfSecureBackup,
  controller: SeedlessOnboardingController<EKey>,
  password: string,
  seedPhrase: Uint8Array,
  keyringId: string,
) {
  mockcreateLocalKey(toprfClient, password);

  // persist the local enc key
  jest.spyOn(toprfClient, 'persistLocalKey').mockResolvedValueOnce();
  // encrypt and store the secret data
  handleMockSecretDataAdd();
  await controller.createToprfKeyAndBackupSeedPhrase(
    password,
    seedPhrase,
    keyringId,
  );
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

  const { vault: encryptedMockVault, exportedKeyString } =
    await encryptor.encryptWithDetail(MOCK_PASSWORD, serializedKeyData);

  return {
    encryptedMockVault,
    vaultEncryptionKey: exportedKeyString,
    vaultEncryptionSalt: JSON.parse(encryptedMockVault).salt,
  };
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

/**
 * Returns the initial controller state with the optional mock state data.
 *
 * @param options - The options.
 * @param options.withMockAuthenticatedUser - Whether to skip the authenticate method and use the mock authenticated user.
 * @param options.withMockAuthPubKey - Whether to skip the checkPasswordOutdated method and use the mock authPubKey.
 * @param options.authPubKey - The mock authPubKey.
 * @param options.vault - The mock vault data.
 * @param options.vaultEncryptionKey - The mock vault encryption key.
 * @param options.vaultEncryptionSalt - The mock vault encryption salt.
 * @returns The initial controller state with the mock authenticated user.
 */
function getMockInitialControllerState(options?: {
  withMockAuthenticatedUser?: boolean;
  withMockAuthPubKey?: boolean;
  authPubKey?: string;
  vault?: string;
  vaultEncryptionKey?: string;
  vaultEncryptionSalt?: string;
}): Partial<SeedlessOnboardingControllerState> {
  const state = getDefaultSeedlessOnboardingControllerState();

  if (options?.vault) {
    state.vault = options.vault;
  }

  if (options?.vaultEncryptionKey) {
    state.vaultEncryptionKey = options.vaultEncryptionKey;
  }

  if (options?.vaultEncryptionSalt) {
    state.vaultEncryptionSalt = options.vaultEncryptionSalt;
  }

  if (options?.withMockAuthenticatedUser) {
    state.nodeAuthTokens = MOCK_NODE_AUTH_TOKENS;
    state.authConnectionId = authConnectionId;
    state.groupedAuthConnectionId = groupedAuthConnectionId;
    state.userId = userId;
  }

  if (options?.withMockAuthPubKey || options?.authPubKey) {
    state.authPubKey = options.authPubKey ?? MOCK_AUTH_PUB_KEY;
  }

  return state;
}

describe('SeedlessOnboardingController', () => {
  describe('constructor', () => {
    it('should be able to instantiate', () => {
      const { messenger } = mockSeedlessOnboardingMessenger();
      const controller = new SeedlessOnboardingController({
        messenger,
        encryptor: getDefaultSeedlessOnboardingVaultEncryptor(),
      });
      expect(controller).toBeDefined();
      expect(controller.state).toStrictEqual(
        getDefaultSeedlessOnboardingControllerState(),
      );
    });

    it('should be able to instantiate with an encryptor', () => {
      const { messenger } = mockSeedlessOnboardingMessenger();
      const encryptor = createMockVaultEncryptor();

      expect(
        () =>
          new SeedlessOnboardingController({
            messenger,
            encryptor,
          }),
      ).not.toThrow();
    });

    it('should be able to instantiate with a toprfKeyDeriver', async () => {
      const deriveKeySpy = jest.fn();
      const MOCK_PASSWORD = 'mock-password';

      const keyDeriver = {
        deriveKey: (seed: Uint8Array, salt: Uint8Array) => {
          deriveKeySpy(seed, salt);
          return Promise.resolve(new Uint8Array());
        },
      };

      await withController(
        {
          toprfKeyDeriver: keyDeriver,
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller, toprfClient }) => {
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
          expect(deriveKeySpy).toHaveBeenCalled();
        },
      );
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
          SeedlessOnboardingControllerErrorMessage.AuthenticationError,
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

  describe('checkPasswordOutdated', () => {
    it('should return false if password is not outdated (authPubKey matches)', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            withMockAuthPubKey: true,
          }),
        },
        async ({ controller, toprfClient }) => {
          const spy = jest.spyOn(toprfClient, 'fetchAuthPubKey');
          mockFetchAuthPubKey(toprfClient, base64ToBytes(MOCK_AUTH_PUB_KEY));
          const result = await controller.checkIsPasswordOutdated();
          expect(result).toBe(false);
          // Call again to test cache
          const result2 = await controller.checkIsPasswordOutdated();
          expect(result2).toBe(false);
          // Should only call fetchAuthPubKey once due to cache
          expect(spy).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('should return true if password is outdated (authPubKey does not match)', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            authPubKey: MOCK_AUTH_PUB_KEY_OUTDATED,
          }),
        },
        async ({ controller, toprfClient }) => {
          const spy = jest.spyOn(toprfClient, 'fetchAuthPubKey');
          mockFetchAuthPubKey(toprfClient, base64ToBytes(MOCK_AUTH_PUB_KEY));
          const result = await controller.checkIsPasswordOutdated();
          expect(result).toBe(true);
          // Call again to test cache
          const result2 = await controller.checkIsPasswordOutdated();
          expect(result2).toBe(true);
          // Should only call fetchAuthPubKey once due to cache
          expect(spy).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('should bypass cache if skipCache is true', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            withMockAuthPubKey: true,
          }),
        },
        async ({ controller, toprfClient }) => {
          const spy = jest.spyOn(toprfClient, 'fetchAuthPubKey');
          mockFetchAuthPubKey(toprfClient, base64ToBytes(MOCK_AUTH_PUB_KEY));
          const result = await controller.checkIsPasswordOutdated({
            skipCache: true,
          });
          expect(result).toBe(false);
          // Call again with skipCache: true, should call fetchAuthPubKey again
          const result2 = await controller.checkIsPasswordOutdated({
            skipCache: true,
          });
          expect(result2).toBe(false);
          expect(spy).toHaveBeenCalledTimes(2);
        },
      );
    });

    it('should throw SRPNotBackedUpError if no authPubKey in state', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller }) => {
          await expect(controller.checkIsPasswordOutdated()).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.SRPNotBackedUpError,
          );
        },
      );
    });

    it('should throw InsufficientAuthToken if no nodeAuthTokens in state', async () => {
      await withController(
        {
          state: {
            ...getMockInitialControllerState({
              withMockAuthenticatedUser: true,
              withMockAuthPubKey: true,
            }),
            nodeAuthTokens: undefined,
          },
        },
        async ({ controller }) => {
          await expect(controller.checkIsPasswordOutdated()).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.InsufficientAuthToken,
          );
        },
      );
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
          const { encryptedMockVault } = await createMockVault(
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
          const { encryptedMockVault } = await createMockVault(
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
          SeedlessOnboardingControllerErrorMessage.MissingAuthUserInfo,
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
            SeedlessOnboardingControllerErrorMessage.InsufficientAuthToken,
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
            SeedlessOnboardingControllerErrorMessage.FailedToPersistOprfKey,
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
            SeedlessOnboardingControllerErrorMessage.FailedToEncryptAndStoreSeedPhraseBackup,
          );
        },
      );
    });
  });

  describe('addNewSeedPhraseBackup', () => {
    const MOCK_PASSWORD = 'mock-password';
    const NEW_KEY_RING_1 = {
      id: 'new-keyring-1',
      seedPhrase: stringToBytes('new mock seed phrase 1'),
    };
    const NEW_KEY_RING_2 = {
      id: 'new-keyring-2',
      seedPhrase: stringToBytes('new mock seed phrase 2'),
    };
    const NEW_KEY_RING_3 = {
      id: 'new-keyring-3',
      seedPhrase: stringToBytes('new mock seed phrase 3'),
    };
    let MOCK_VAULT = '';
    let MOCK_VAULT_ENCRYPTION_KEY = '';
    let MOCK_VAULT_ENCRYPTION_SALT = '';

    beforeEach(async () => {
      const mockToprfEncryptor = createMockToprfEncryptor();

      const MOCK_ENCRYPTION_KEY =
        mockToprfEncryptor.deriveEncKey(MOCK_PASSWORD);
      const MOCK_AUTH_KEY_PAIR =
        mockToprfEncryptor.deriveAuthKeyPair(MOCK_PASSWORD);

      const mockResult = await createMockVault(
        MOCK_ENCRYPTION_KEY,
        MOCK_AUTH_KEY_PAIR,
        MOCK_PASSWORD,
        MOCK_NODE_AUTH_TOKENS,
      );

      MOCK_VAULT = mockResult.encryptedMockVault;
      MOCK_VAULT_ENCRYPTION_KEY = mockResult.vaultEncryptionKey;
      MOCK_VAULT_ENCRYPTION_SALT = mockResult.vaultEncryptionSalt;
    });

    it('should throw an error if the controller is locked', async () => {
      await withController(async ({ controller }) => {
        await expect(
          controller.addNewSeedPhraseBackup(
            NEW_KEY_RING_1.seedPhrase,
            NEW_KEY_RING_1.id,
          ),
        ).rejects.toThrow(
          SeedlessOnboardingControllerErrorMessage.ControllerLocked,
        );
      });
    });

    it('should be able to add a new seed phrase backup', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            withMockAuthPubKey: true,
            vault: MOCK_VAULT,
            vaultEncryptionKey: MOCK_VAULT_ENCRYPTION_KEY,
            vaultEncryptionSalt: MOCK_VAULT_ENCRYPTION_SALT,
          }),
        },
        async ({ controller, toprfClient }) => {
          mockFetchAuthPubKey(
            toprfClient,
            base64ToBytes(controller.state.authPubKey as string),
          );

          await controller.submitPassword(MOCK_PASSWORD);

          // encrypt and store the secret data
          const mockSecretDataAdd = handleMockSecretDataAdd();
          await controller.addNewSeedPhraseBackup(
            NEW_KEY_RING_1.seedPhrase,
            NEW_KEY_RING_1.id,
          );

          expect(mockSecretDataAdd.isDone()).toBe(true);
          expect(controller.state.nodeAuthTokens).toBeDefined();
          expect(controller.state.nodeAuthTokens).toStrictEqual(
            MOCK_NODE_AUTH_TOKENS,
          );
        },
      );
    });

    it('should be able to add a new seed phrase backup to the existing seed phrase backups', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            withMockAuthPubKey: true,
            vault: MOCK_VAULT,
            vaultEncryptionKey: MOCK_VAULT_ENCRYPTION_KEY,
            vaultEncryptionSalt: MOCK_VAULT_ENCRYPTION_SALT,
          }),
        },
        async ({ controller, toprfClient }) => {
          mockFetchAuthPubKey(
            toprfClient,
            base64ToBytes(controller.state.authPubKey as string),
          );

          await controller.submitPassword(MOCK_PASSWORD);

          // encrypt and store the secret data
          const mockSecretDataAdd = handleMockSecretDataAdd();
          await controller.addNewSeedPhraseBackup(
            NEW_KEY_RING_1.seedPhrase,
            NEW_KEY_RING_1.id,
          );

          expect(mockSecretDataAdd.isDone()).toBe(true);
          expect(controller.state.nodeAuthTokens).toBeDefined();
          expect(controller.state.nodeAuthTokens).toStrictEqual(
            MOCK_NODE_AUTH_TOKENS,
          );
          expect(controller.state.socialBackupsMetadata).toStrictEqual([
            {
              id: NEW_KEY_RING_1.id,
              hash: keccak256AndHexify(NEW_KEY_RING_1.seedPhrase),
            },
          ]);

          // add another seed phrase backup
          const mockSecretDataAdd2 = handleMockSecretDataAdd();
          await controller.addNewSeedPhraseBackup(
            NEW_KEY_RING_2.seedPhrase,
            NEW_KEY_RING_2.id,
          );

          expect(mockSecretDataAdd2.isDone()).toBe(true);
          expect(controller.state.nodeAuthTokens).toBeDefined();
          expect(controller.state.nodeAuthTokens).toStrictEqual(
            MOCK_NODE_AUTH_TOKENS,
          );

          const { socialBackupsMetadata } = controller.state;
          expect(socialBackupsMetadata).toStrictEqual([
            {
              id: NEW_KEY_RING_1.id,
              hash: keccak256AndHexify(NEW_KEY_RING_1.seedPhrase),
            },
            {
              id: NEW_KEY_RING_2.id,
              hash: keccak256AndHexify(NEW_KEY_RING_2.seedPhrase),
            },
          ]);
          // should be able to get the hash of the seed phrase backup from the state
          expect(
            controller.getSeedPhraseBackupHash(NEW_KEY_RING_1.seedPhrase),
          ).toBeDefined();

          // should return undefined if the seed phrase is not backed up
          expect(
            controller.getSeedPhraseBackupHash(NEW_KEY_RING_3.seedPhrase),
          ).toBeUndefined();
        },
      );
    });

    it('should throw an error if failed to parse vault data', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            withMockAuthPubKey: true,
            vault: MOCK_VAULT,
            vaultEncryptionKey: MOCK_VAULT_ENCRYPTION_KEY,
            vaultEncryptionSalt: MOCK_VAULT_ENCRYPTION_SALT,
          }),
        },
        async ({ controller, encryptor, toprfClient }) => {
          mockFetchAuthPubKey(
            toprfClient,
            base64ToBytes(controller.state.authPubKey as string),
          );

          await controller.submitPassword(MOCK_PASSWORD);

          jest
            .spyOn(encryptor, 'decryptWithKey')
            .mockResolvedValueOnce('{ "foo": "bar"');
          await expect(
            controller.addNewSeedPhraseBackup(
              NEW_KEY_RING_1.seedPhrase,
              NEW_KEY_RING_1.id,
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.InvalidVaultData,
          );
        },
      );
    });

    it('should throw error if encryptionKey is missing', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            vault: MOCK_VAULT,
          }),
        },
        async ({ controller, toprfClient, encryptor }) => {
          mockcreateLocalKey(toprfClient, MOCK_PASSWORD);

          // persist the local enc key
          jest.spyOn(toprfClient, 'persistLocalKey').mockResolvedValueOnce();
          // encrypt and store the secret data
          handleMockSecretDataAdd();

          jest.spyOn(encryptor, 'encryptWithDetail').mockResolvedValueOnce({
            vault: MOCK_VAULT,
            // @ts-expect-error intentional test case
            exportedKeyString: undefined,
          });

          await controller.createToprfKeyAndBackupSeedPhrase(
            MOCK_PASSWORD,
            NEW_KEY_RING_1.seedPhrase,
            NEW_KEY_RING_1.id,
          );

          mockFetchAuthPubKey(
            toprfClient,
            base64ToBytes(controller.state.authPubKey as string),
          );

          await expect(
            controller.addNewSeedPhraseBackup(
              NEW_KEY_RING_2.seedPhrase,
              NEW_KEY_RING_2.id,
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.MissingCredentials,
          );
        },
      );
    });

    it('should throw error if encryptionSalt is different from the one in the vault', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller, toprfClient }) => {
          await mockCreateToprfKeyAndBackupSeedPhrase(
            toprfClient,
            controller,
            MOCK_PASSWORD,
            MOCK_SEED_PHRASE,
            MOCK_KEYRING_ID,
          );

          mockFetchAuthPubKey(
            toprfClient,
            base64ToBytes(controller.state.authPubKey as string),
          );

          // intentionally mock the JSON.parse to return an object with a different salt
          jest.spyOn(global.JSON, 'parse').mockReturnValueOnce({
            salt: 'different-salt',
          });

          await expect(
            controller.addNewSeedPhraseBackup(
              NEW_KEY_RING_1.seedPhrase,
              NEW_KEY_RING_1.id,
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.ExpiredCredentials,
          );
        },
      );
    });

    it('should throw error if encryptionKey is of an unexpected type', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            vault: MOCK_VAULT,
          }),
        },
        async ({ controller, toprfClient, encryptor }) => {
          mockcreateLocalKey(toprfClient, MOCK_PASSWORD);

          // persist the local enc key
          jest.spyOn(toprfClient, 'persistLocalKey').mockResolvedValueOnce();
          // encrypt and store the secret data
          handleMockSecretDataAdd();

          jest.spyOn(encryptor, 'encryptWithDetail').mockResolvedValueOnce({
            vault: MOCK_VAULT,
            // @ts-expect-error intentional test case
            exportedKeyString: 123,
          });

          await controller.createToprfKeyAndBackupSeedPhrase(
            MOCK_PASSWORD,
            NEW_KEY_RING_1.seedPhrase,
            NEW_KEY_RING_1.id,
          );

          mockFetchAuthPubKey(
            toprfClient,
            base64ToBytes(controller.state.authPubKey as string),
          );

          await expect(
            controller.addNewSeedPhraseBackup(
              NEW_KEY_RING_2.seedPhrase,
              NEW_KEY_RING_2.id,
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.WrongPasswordType,
          );
        },
      );
    });

    it('should throw an error if vault unlocked has an unexpected shape', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            vault: MOCK_VAULT,
          }),
        },
        async ({ controller, toprfClient, encryptor }) => {
          mockcreateLocalKey(toprfClient, MOCK_PASSWORD);

          // persist the local enc key
          jest.spyOn(toprfClient, 'persistLocalKey').mockResolvedValueOnce();
          // encrypt and store the secret data
          handleMockSecretDataAdd();

          jest.spyOn(encryptor, 'encryptWithDetail').mockResolvedValueOnce({
            vault: MOCK_VAULT,
            exportedKeyString: MOCK_VAULT_ENCRYPTION_KEY,
          });

          await controller.createToprfKeyAndBackupSeedPhrase(
            MOCK_PASSWORD,
            NEW_KEY_RING_1.seedPhrase,
            NEW_KEY_RING_1.id,
          );

          mockFetchAuthPubKey(
            toprfClient,
            base64ToBytes(controller.state.authPubKey as string),
          );

          jest
            .spyOn(encryptor, 'decryptWithKey')
            .mockResolvedValueOnce({ foo: 'bar' });
          await expect(
            controller.addNewSeedPhraseBackup(
              NEW_KEY_RING_2.seedPhrase,
              NEW_KEY_RING_2.id,
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.InvalidVaultData,
          );

          jest.spyOn(encryptor, 'decryptWithKey').mockResolvedValueOnce('null');
          await expect(
            controller.addNewSeedPhraseBackup(
              NEW_KEY_RING_2.seedPhrase,
              NEW_KEY_RING_2.id,
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.VaultDataError,
          );
        },
      );
    });

    it('should throw an error if vault unlocked has invalid authentication data', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            vault: MOCK_VAULT,
          }),
        },
        async ({ controller, toprfClient, encryptor }) => {
          mockcreateLocalKey(toprfClient, MOCK_PASSWORD);

          // persist the local enc key
          jest.spyOn(toprfClient, 'persistLocalKey').mockResolvedValueOnce();
          // encrypt and store the secret data
          handleMockSecretDataAdd();

          jest.spyOn(encryptor, 'encryptWithDetail').mockResolvedValueOnce({
            vault: MOCK_VAULT,
            exportedKeyString: MOCK_VAULT_ENCRYPTION_KEY,
          });

          await controller.createToprfKeyAndBackupSeedPhrase(
            MOCK_PASSWORD,
            NEW_KEY_RING_1.seedPhrase,
            NEW_KEY_RING_1.id,
          );

          mockFetchAuthPubKey(
            toprfClient,
            base64ToBytes(controller.state.authPubKey as string),
          );

          jest
            .spyOn(encryptor, 'decryptWithKey')
            .mockResolvedValueOnce(MOCK_VAULT);
          await expect(
            controller.addNewSeedPhraseBackup(
              NEW_KEY_RING_2.seedPhrase,
              NEW_KEY_RING_2.id,
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.VaultDataError,
          );
        },
      );
    });

    it('should throw an error if password is outdated', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            authPubKey: MOCK_AUTH_PUB_KEY_OUTDATED,
            vault: MOCK_VAULT,
            vaultEncryptionKey: MOCK_VAULT_ENCRYPTION_KEY,
            vaultEncryptionSalt: MOCK_VAULT_ENCRYPTION_SALT,
          }),
        },
        async ({ controller, toprfClient }) => {
          mockFetchAuthPubKey(toprfClient, base64ToBytes(MOCK_AUTH_PUB_KEY));
          await controller.submitPassword(MOCK_PASSWORD);
          await expect(
            controller.addNewSeedPhraseBackup(
              NEW_KEY_RING_1.seedPhrase,
              NEW_KEY_RING_1.id,
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.OutdatedPassword,
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
          const { encryptedMockVault } = await createMockVault(
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
              MULTIPLE_MOCK_SECRET_METADATA,
              MOCK_PASSWORD,
            ),
          });
          const secretData =
            await controller.fetchAllSeedPhrases(MOCK_PASSWORD);

          expect(mockSecretDataGet.isDone()).toBe(true);
          expect(secretData).toBeDefined();

          // `fetchAndRestoreSeedPhraseMetadata` should sort the seed phrases by timestamp in ascending order and return the seed phrases in the correct order
          // the seed phrases are sorted in ascending order, so the oldest seed phrase is the first item in the array
          expect(secretData).toStrictEqual([
            stringToBytes('seedPhrase1'),
            stringToBytes('seedPhrase2'),
            stringToBytes('seedPhrase3'),
          ]);

          // verify the vault data
          const { encryptedMockVault } = await createMockVault(
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
          const { encryptedMockVault } = await createMockVault(
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
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.LoginFailedError,
          );
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
            SeedlessOnboardingControllerErrorMessage.FailedToFetchSeedPhraseMetadata,
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
            SeedlessOnboardingControllerErrorMessage.FailedToFetchSeedPhraseMetadata,
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
              SeedlessOnboardingControllerErrorMessage.TooManyLoginAttempts,
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
              SeedlessOnboardingControllerErrorMessage.IncorrectPassword,
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
              SeedlessOnboardingControllerErrorMessage.LoginFailedError,
            ),
          );
        },
      );
    });
  });

  describe('submitPassword', () => {
    const MOCK_PASSWORD = 'mock-password';

    it('should throw error if the vault is missing', async () => {
      await withController(async ({ controller }) => {
        await expect(controller.submitPassword(MOCK_PASSWORD)).rejects.toThrow(
          SeedlessOnboardingControllerErrorMessage.VaultError,
        );
      });
    });

    it('should throw error if the password is invalid', async () => {
      await withController(
        {
          state: {
            vault: 'MOCK_VAULT',
          },
        },
        async ({ controller }) => {
          // @ts-expect-error intentional test case
          await expect(controller.submitPassword(123)).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.WrongPasswordType,
          );
        },
      );
    });
  });

  describe('verifyPassword', () => {
    const MOCK_PASSWORD = 'mock-password';

    it('should not throw an error if the password is valid', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            vault: 'MOCK_VAULT',
          }),
        },
        async ({ controller, encryptor }) => {
          jest.spyOn(encryptor, 'decrypt').mockResolvedValueOnce('MOCK_VAULT');

          expect(async () => {
            await controller.verifyVaultPassword(MOCK_PASSWORD);
          }).not.toThrow();
        },
      );
    });

    it('should throw an error if the password is invalid', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            vault: 'MOCK_VAULT',
          }),
        },
        async ({ controller, encryptor }) => {
          jest
            .spyOn(encryptor, 'decrypt')
            .mockRejectedValueOnce(new Error('Incorrect password'));

          await expect(
            controller.verifyVaultPassword(MOCK_PASSWORD),
          ).rejects.toThrow('Incorrect password');
        },
      );
    });

    it('should throw an error if the vault is missing', async () => {
      await withController(async ({ controller }) => {
        await expect(
          controller.verifyVaultPassword(MOCK_PASSWORD),
        ).rejects.toThrow(SeedlessOnboardingControllerErrorMessage.VaultError);
      });
    });
  });

  describe('updateBackupMetadataState', () => {
    const MOCK_PASSWORD = 'mock-password';
    let MOCK_VAULT: string;
    let MOCK_VAULT_ENCRYPTION_KEY: string;
    let MOCK_VAULT_ENCRYPTION_SALT: string;

    beforeEach(async () => {
      const mockToprfEncryptor = createMockToprfEncryptor();

      const MOCK_ENCRYPTION_KEY =
        mockToprfEncryptor.deriveEncKey(MOCK_PASSWORD);
      const MOCK_AUTH_KEY_PAIR =
        mockToprfEncryptor.deriveAuthKeyPair(MOCK_PASSWORD);

      const mockResult = await createMockVault(
        MOCK_ENCRYPTION_KEY,
        MOCK_AUTH_KEY_PAIR,
        MOCK_PASSWORD,
        MOCK_NODE_AUTH_TOKENS,
      );

      MOCK_VAULT = mockResult.encryptedMockVault;
      MOCK_VAULT_ENCRYPTION_KEY = mockResult.vaultEncryptionKey;
      MOCK_VAULT_ENCRYPTION_SALT = mockResult.vaultEncryptionSalt;
    });

    it('should be able to update the backup metadata state', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            vault: MOCK_VAULT,
            vaultEncryptionKey: MOCK_VAULT_ENCRYPTION_KEY,
            vaultEncryptionSalt: MOCK_VAULT_ENCRYPTION_SALT,
          }),
        },
        async ({ controller }) => {
          await controller.submitPassword(MOCK_PASSWORD);

          controller.updateBackupMetadataState({
            keyringId: MOCK_KEYRING_ID,
            seedPhrase: MOCK_SEED_PHRASE,
          });
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
            vault: MOCK_VAULT,
            vaultEncryptionKey: MOCK_VAULT_ENCRYPTION_KEY,
            vaultEncryptionSalt: MOCK_VAULT_ENCRYPTION_SALT,
          }),
        },
        async ({ controller }) => {
          await controller.submitPassword(MOCK_PASSWORD);

          controller.updateBackupMetadataState({
            keyringId: MOCK_KEYRING_ID,
            seedPhrase: MOCK_SEED_PHRASE,
          });
          const MOCK_SEED_PHRASE_HASH = keccak256AndHexify(MOCK_SEED_PHRASE);
          expect(controller.state.socialBackupsMetadata).toStrictEqual([
            { id: MOCK_KEYRING_ID, hash: MOCK_SEED_PHRASE_HASH },
          ]);

          controller.updateBackupMetadataState({
            keyringId: MOCK_KEYRING_ID,
            seedPhrase: MOCK_SEED_PHRASE,
          });
          expect(controller.state.socialBackupsMetadata).toStrictEqual([
            { id: MOCK_KEYRING_ID, hash: MOCK_SEED_PHRASE_HASH },
          ]);
        },
      );
    });

    it('should be able to update the backup metadata state with an array of backups', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            vault: MOCK_VAULT,
            vaultEncryptionKey: MOCK_VAULT_ENCRYPTION_KEY,
            vaultEncryptionSalt: MOCK_VAULT_ENCRYPTION_SALT,
          }),
        },
        async ({ controller }) => {
          await controller.submitPassword(MOCK_PASSWORD);
          const MOCK_SEED_PHRASE_2 = stringToBytes('mock-seed-phrase-2');
          const MOCK_KEYRING_ID_2 = 'mock-keyring-id-2';

          controller.updateBackupMetadataState([
            {
              keyringId: MOCK_KEYRING_ID,
              seedPhrase: MOCK_SEED_PHRASE,
            },
            {
              keyringId: MOCK_KEYRING_ID_2,
              seedPhrase: MOCK_SEED_PHRASE_2,
            },
          ]);
          const MOCK_SEED_PHRASE_HASH = keccak256AndHexify(MOCK_SEED_PHRASE);
          const MOCK_SEED_PHRASE_2_HASH =
            keccak256AndHexify(MOCK_SEED_PHRASE_2);
          expect(controller.state.socialBackupsMetadata).toStrictEqual([
            { id: MOCK_KEYRING_ID, hash: MOCK_SEED_PHRASE_HASH },
            { id: MOCK_KEYRING_ID_2, hash: MOCK_SEED_PHRASE_2_HASH },
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
            withMockAuthPubKey: true,
          }),
        },
        async ({ controller, toprfClient }) => {
          await mockCreateToprfKeyAndBackupSeedPhrase(
            toprfClient,
            controller,
            MOCK_PASSWORD,
            MOCK_SEED_PHRASE,
            MOCK_KEYRING_ID,
          );

          // verify the vault data before update password
          expect(controller.state.vault).toBeDefined();
          expect(controller.state.authPubKey).toBeDefined();

          mockFetchAuthPubKey(
            toprfClient,
            base64ToBytes(controller.state.authPubKey as string),
          );
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
            authPubKey: MOCK_AUTH_PUB_KEY,
          },
        },
        async ({ controller, toprfClient }) => {
          await mockCreateToprfKeyAndBackupSeedPhrase(
            toprfClient,
            controller,
            MOCK_PASSWORD,
            MOCK_SEED_PHRASE,
            MOCK_KEYRING_ID,
          );

          // verify the vault data before update password
          expect(controller.state.vault).toBeDefined();
          expect(controller.state.authPubKey).toBeDefined();

          mockFetchAuthPubKey(
            toprfClient,
            base64ToBytes(controller.state.authPubKey as string),
          );

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

    it('should throw an error if the controller is locked', async () => {
      await withController(async ({ controller }) => {
        await expect(
          controller.changePassword(NEW_MOCK_PASSWORD, MOCK_PASSWORD),
        ).rejects.toThrow(
          SeedlessOnboardingControllerErrorMessage.ControllerLocked,
        );
      });
    });

    it('should throw error if password is outdated', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            vault: MOCK_VAULT,
            authPubKey: MOCK_AUTH_PUB_KEY_OUTDATED,
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller, toprfClient }) => {
          await mockCreateToprfKeyAndBackupSeedPhrase(
            toprfClient,
            controller,
            MOCK_PASSWORD,
            MOCK_SEED_PHRASE,
            MOCK_KEYRING_ID,
          );
          mockFetchAuthPubKey(toprfClient);

          // mock the recover enc key
          mockRecoverEncKey(toprfClient, MOCK_PASSWORD);

          await expect(
            controller.changePassword(NEW_MOCK_PASSWORD, MOCK_PASSWORD),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.OutdatedPassword,
          );
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
        async ({ controller, encryptor, baseMessenger }) => {
          // unlock the controller
          baseMessenger.publish('KeyringController:unlock');
          await new Promise((resolve) => setTimeout(resolve, 100));

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
            withMockAuthPubKey: true,
          }),
        },
        async ({ controller, toprfClient }) => {
          await mockCreateToprfKeyAndBackupSeedPhrase(
            toprfClient,
            controller,
            MOCK_PASSWORD,
            MOCK_SEED_PHRASE,
            MOCK_KEYRING_ID,
          );

          mockFetchAuthPubKey(
            toprfClient,
            base64ToBytes(controller.state.authPubKey as string),
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
            SeedlessOnboardingControllerErrorMessage.FailedToChangePassword,
          );
        },
      );
    });
  });

  describe('clearState', () => {
    it('should clear the state', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller }) => {
          const { state } = controller;

          expect(state.nodeAuthTokens).toBeDefined();
          expect(state.userId).toBeDefined();
          expect(state.authConnectionId).toBeDefined();

          controller.clearState();
          expect(controller.state).toStrictEqual(
            getDefaultSeedlessOnboardingControllerState(),
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
            SeedlessOnboardingControllerErrorMessage.InvalidEmptyPassword,
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
            SeedlessOnboardingControllerErrorMessage.WrongPasswordType,
          );

          expect(mockSecretDataAdd.isDone()).toBe(true);
        },
      );
    });
  });

  describe('lock', () => {
    const MOCK_PASSWORD = 'mock-password';

    it('should lock the controller', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller, toprfClient }) => {
          await mockCreateToprfKeyAndBackupSeedPhrase(
            toprfClient,
            controller,
            MOCK_PASSWORD,
            MOCK_SEED_PHRASE,
            MOCK_KEYRING_ID,
          );

          controller.setLocked();

          await expect(
            controller.addNewSeedPhraseBackup(
              MOCK_SEED_PHRASE,
              MOCK_KEYRING_ID,
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.ControllerLocked,
          );
        },
      );
    });

    it('should lock the controller when the keyring is locked', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller, baseMessenger, toprfClient }) => {
          await mockCreateToprfKeyAndBackupSeedPhrase(
            toprfClient,
            controller,
            MOCK_PASSWORD,
            MOCK_SEED_PHRASE,
            MOCK_KEYRING_ID,
          );

          baseMessenger.publish('KeyringController:lock');

          await expect(
            controller.addNewSeedPhraseBackup(
              MOCK_SEED_PHRASE,
              MOCK_KEYRING_ID,
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.ControllerLocked,
          );
        },
      );
    });

    it('should unlock the controller when the keyring is unlocked', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller, baseMessenger }) => {
          await expect(
            controller.addNewSeedPhraseBackup(
              MOCK_SEED_PHRASE,
              MOCK_KEYRING_ID,
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.ControllerLocked,
          );

          baseMessenger.publish('KeyringController:unlock');

          await new Promise((resolve) => setTimeout(resolve, 100));

          controller.updateBackupMetadataState({
            keyringId: MOCK_KEYRING_ID,
            seedPhrase: MOCK_SEED_PHRASE,
          });

          const MOCK_SEED_PHRASE_HASH = keccak256AndHexify(MOCK_SEED_PHRASE);
          expect(controller.state.socialBackupsMetadata).toStrictEqual([
            { id: MOCK_KEYRING_ID, hash: MOCK_SEED_PHRASE_HASH },
          ]);
        },
      );
    });
  });

  describe('SeedPhraseMetadata', () => {
    it('should be able to create a seed phrase metadata with default options', () => {
      // should be able to create a SeedPhraseMetadata instance via constructor
      const seedPhraseMetadata = new SecretMetadata(MOCK_SEED_PHRASE);
      expect(seedPhraseMetadata.data).toBeDefined();
      expect(seedPhraseMetadata.timestamp).toBeDefined();
      expect(seedPhraseMetadata.type).toBe(SecretType.Mnemonic);
      expect(seedPhraseMetadata.version).toBe(SecretMetadataVersion.V1);

      // should be able to create a SeedPhraseMetadata instance with a timestamp via constructor
      const timestamp = 18_000;
      const seedPhraseMetadata2 = new SecretMetadata(MOCK_SEED_PHRASE, {
        timestamp,
      });
      expect(seedPhraseMetadata2.data).toBeDefined();
      expect(seedPhraseMetadata2.timestamp).toBe(timestamp);
      expect(seedPhraseMetadata2.data).toStrictEqual(MOCK_SEED_PHRASE);
      expect(seedPhraseMetadata2.type).toBe(SecretType.Mnemonic);
    });

    it('should be able to add metadata to a seed phrase', () => {
      const timestamp = 18_000;
      const seedPhraseMetadata = new SecretMetadata(MOCK_SEED_PHRASE, {
        type: SecretType.PrivateKey,
        timestamp,
      });
      expect(seedPhraseMetadata.type).toBe(SecretType.PrivateKey);
      expect(seedPhraseMetadata.timestamp).toBe(timestamp);
    });

    it('should be able to correctly create `SecretMetadata` Array for batch seedphrases', () => {
      const seedPhrases = ['seed phrase 1', 'seed phrase 2', 'seed phrase 3'];
      const rawSeedPhrases = seedPhrases.map((srp) => ({
        value: stringToBytes(srp),
        options: {
          type: SecretType.Mnemonic,
        },
      }));

      const seedPhraseMetadataArray = SecretMetadata.fromBatch(rawSeedPhrases);
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
      const seedPhraseMetadata = new SecretMetadata(MOCK_SEED_PHRASE);
      const serializedSeedPhraseBytes = seedPhraseMetadata.toBytes();

      const parsedSeedPhraseMetadata = SecretMetadata.fromRawMetadata(
        serializedSeedPhraseBytes,
      );
      expect(parsedSeedPhraseMetadata.data).toBeDefined();
      expect(parsedSeedPhraseMetadata.timestamp).toBeDefined();
      expect(parsedSeedPhraseMetadata.data).toStrictEqual(MOCK_SEED_PHRASE);
    });

    it('should be able to sort seed phrase metadata', () => {
      const mockSeedPhraseMetadata1 = new SecretMetadata(MOCK_SEED_PHRASE, {
        timestamp: 1000,
      });
      const mockSeedPhraseMetadata2 = new SecretMetadata(MOCK_SEED_PHRASE, {
        timestamp: 2000,
      });

      // sort in ascending order
      const sortedSeedPhraseMetadata = SecretMetadata.sort(
        [mockSeedPhraseMetadata1, mockSeedPhraseMetadata2],
        'asc',
      );
      expect(sortedSeedPhraseMetadata[0].timestamp).toBeLessThan(
        sortedSeedPhraseMetadata[1].timestamp,
      );

      // sort in descending order
      const sortedSeedPhraseMetadataDesc = SecretMetadata.sort(
        [mockSeedPhraseMetadata1, mockSeedPhraseMetadata2],
        'desc',
      );
      expect(sortedSeedPhraseMetadataDesc[0].timestamp).toBeGreaterThan(
        sortedSeedPhraseMetadataDesc[1].timestamp,
      );
    });

    it('should be able to overwrite the default Generic DataType', () => {
      const secret1 = new SecretMetadata<string>('private-key-1', {
        type: SecretType.PrivateKey,
      });
      expect(secret1.data).toBe('private-key-1');
      expect(secret1.type).toBe(SecretType.PrivateKey);
      expect(secret1.version).toBe(SecretMetadataVersion.V1);

      // should be able to convert to bytes
      const secret1Bytes = secret1.toBytes();
      const parsedSecret1 =
        SecretMetadata.fromRawMetadata<string>(secret1Bytes);
      expect(parsedSecret1.data).toBe('private-key-1');
      expect(parsedSecret1.type).toBe(SecretType.PrivateKey);
      expect(parsedSecret1.version).toBe(SecretMetadataVersion.V1);

      const secret2 = new SecretMetadata<Uint8Array>(MOCK_SEED_PHRASE, {
        type: SecretType.Mnemonic,
      });
      expect(secret2.data).toStrictEqual(MOCK_SEED_PHRASE);
      expect(secret2.type).toBe(SecretType.Mnemonic);

      const secret2Bytes = secret2.toBytes();
      const parsedSecret2 =
        SecretMetadata.fromRawMetadata<Uint8Array>(secret2Bytes);
      expect(parsedSecret2.data).toStrictEqual(MOCK_SEED_PHRASE);
      expect(parsedSecret2.type).toBe(SecretType.Mnemonic);
    });

    it('should be able to parse the array of Mixed SecretMetadata', () => {
      const MOCK_PRIVATE_KEY = 'private-key-1';
      const secret1 = new SecretMetadata<string>(MOCK_PRIVATE_KEY, {
        type: SecretType.PrivateKey,
      });
      const secret2 = new SecretMetadata<Uint8Array>(MOCK_SEED_PHRASE, {
        type: SecretType.Mnemonic,
      });

      const secrets = [secret1.toBytes(), secret2.toBytes()];

      const parsedSecrets =
        SecretMetadata.parseSecretsFromMetadataStore(secrets);
      expect(parsedSecrets).toHaveLength(2);
      expect(parsedSecrets[0].data).toBe(MOCK_PRIVATE_KEY);
      expect(parsedSecrets[0].type).toBe(SecretType.PrivateKey);
      expect(parsedSecrets[1].data).toStrictEqual(MOCK_SEED_PHRASE);
      expect(parsedSecrets[1].type).toBe(SecretType.Mnemonic);
    });

    it('should be able to filter the array of SecretMetadata by type', () => {
      const MOCK_PRIVATE_KEY = 'MOCK_PRIVATE_KEY';
      const secret1 = new SecretMetadata<string>(MOCK_PRIVATE_KEY, {
        type: SecretType.PrivateKey,
      });
      const secret2 = new SecretMetadata<Uint8Array>(MOCK_SEED_PHRASE, {
        type: SecretType.Mnemonic,
      });
      const secret3 = new SecretMetadata(MOCK_SEED_PHRASE);

      const secrets = [secret1.toBytes(), secret2.toBytes(), secret3.toBytes()];

      const mnemonicSecrets = SecretMetadata.parseSecretsFromMetadataStore(
        secrets,
        SecretType.Mnemonic,
      );
      expect(mnemonicSecrets).toHaveLength(2);
      expect(mnemonicSecrets[0].data).toStrictEqual(MOCK_SEED_PHRASE);
      expect(mnemonicSecrets[0].type).toBe(SecretType.Mnemonic);
      expect(mnemonicSecrets[1].data).toStrictEqual(MOCK_SEED_PHRASE);
      expect(mnemonicSecrets[1].type).toBe(SecretType.Mnemonic);

      const privateKeySecrets = SecretMetadata.parseSecretsFromMetadataStore(
        secrets,
        SecretType.PrivateKey,
      );

      expect(privateKeySecrets).toHaveLength(1);
      expect(privateKeySecrets[0].data).toBe(MOCK_PRIVATE_KEY);
      expect(privateKeySecrets[0].type).toBe(SecretType.PrivateKey);
    });
  });

  describe('recoverCurrentDevicePassword', () => {
    const GLOBAL_PASSWORD = 'global-password';
    const RECOVERED_PASSWORD = 'recovered-password';

    it('should recover the password for the current device', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            withMockAuthPubKey: true,
          }),
        },
        async ({ controller, toprfClient }) => {
          // Mock recoverEncKey for the global password
          const mockToprfEncryptor = createMockToprfEncryptor();
          const encKey = mockToprfEncryptor.deriveEncKey(GLOBAL_PASSWORD);
          const authKeyPair =
            mockToprfEncryptor.deriveAuthKeyPair(GLOBAL_PASSWORD);
          jest.spyOn(toprfClient, 'recoverEncKey').mockResolvedValueOnce({
            encKey,
            authKeyPair,
            rateLimitResetResult: Promise.resolve(),
            keyShareIndex: 1,
          });

          // Mock toprfClient.recoverPassword
          jest.spyOn(toprfClient, 'recoverPassword').mockResolvedValueOnce({
            password: RECOVERED_PASSWORD,
          });

          const result = await controller.recoverCurrentDevicePassword({
            globalPassword: GLOBAL_PASSWORD,
          });

          expect(result).toStrictEqual({ password: RECOVERED_PASSWORD });
          expect(toprfClient.recoverEncKey).toHaveBeenCalled();
          expect(toprfClient.recoverPassword).toHaveBeenCalled();
        },
      );
    });

    it('should throw SRPNotBackedUpError if no authPubKey in state', async () => {
      await withController(
        {
          state: getMockInitialControllerState({}),
        },
        async ({ controller }) => {
          await expect(
            controller.recoverCurrentDevicePassword({
              globalPassword: GLOBAL_PASSWORD,
            }),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.SRPNotBackedUpError,
          );
        },
      );
    });

    it('should propagate errors from recoverEncKey', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            withMockAuthPubKey: true,
          }),
        },
        async ({ controller, toprfClient }) => {
          jest
            .spyOn(toprfClient, 'recoverEncKey')
            .mockRejectedValueOnce(
              new TOPRFError(
                TOPRFErrorCode.CouldNotDeriveEncryptionKey,
                'Could not derive encryption key',
              ),
            );

          await expect(
            controller.recoverCurrentDevicePassword({
              globalPassword: GLOBAL_PASSWORD,
            }),
          ).rejects.toStrictEqual(
            new RecoveryError(
              SeedlessOnboardingControllerErrorMessage.IncorrectPassword,
            ),
          );
        },
      );
    });

    it('should propagate errors from toprfClient.recoverPassword', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            withMockAuthPubKey: true,
          }),
        },
        async ({ controller, toprfClient }) => {
          const mockToprfEncryptor = createMockToprfEncryptor();
          const encKey = mockToprfEncryptor.deriveEncKey(GLOBAL_PASSWORD);
          const authKeyPair =
            mockToprfEncryptor.deriveAuthKeyPair(GLOBAL_PASSWORD);
          jest.spyOn(toprfClient, 'recoverEncKey').mockResolvedValueOnce({
            encKey,
            authKeyPair,
            rateLimitResetResult: Promise.resolve(),
            keyShareIndex: 1,
          });

          jest
            .spyOn(toprfClient, 'recoverPassword')
            .mockRejectedValueOnce(
              new TOPRFError(
                TOPRFErrorCode.CouldNotFetchPassword,
                'Could not fetch password',
              ),
            );

          await expect(
            controller.recoverCurrentDevicePassword({
              globalPassword: GLOBAL_PASSWORD,
            }),
          ).rejects.toStrictEqual(
            new PasswordSyncError(
              SeedlessOnboardingControllerErrorMessage.CouldNotRecoverPassword,
            ),
          );
        },
      );
    });

    it('should not propagate unknown errors from #toprfClient.recoverPassword', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            withMockAuthPubKey: true,
          }),
        },
        async ({ controller, toprfClient }) => {
          const mockToprfEncryptor = createMockToprfEncryptor();
          const encKey = mockToprfEncryptor.deriveEncKey(GLOBAL_PASSWORD);
          const authKeyPair =
            mockToprfEncryptor.deriveAuthKeyPair(GLOBAL_PASSWORD);
          jest.spyOn(toprfClient, 'recoverEncKey').mockResolvedValueOnce({
            encKey,
            authKeyPair,
            rateLimitResetResult: Promise.resolve(),
            keyShareIndex: 1,
          });

          jest
            .spyOn(toprfClient, 'recoverPassword')
            .mockRejectedValueOnce(new Error('Unknown error'));

          await expect(
            controller.recoverCurrentDevicePassword({
              globalPassword: GLOBAL_PASSWORD,
            }),
          ).rejects.toStrictEqual(
            new PasswordSyncError(
              SeedlessOnboardingControllerErrorMessage.CouldNotRecoverPassword,
            ),
          );
        },
      );
    });
  });

  describe('syncLatestGlobalPassword', () => {
    const OLD_PASSWORD = 'old-mock-password';
    const GLOBAL_PASSWORD = 'new-global-password';
    let MOCK_VAULT: string;
    let MOCK_VAULT_ENCRYPTION_KEY: string;
    let MOCK_VAULT_ENCRYPTION_SALT: string;
    let INITIAL_AUTH_PUB_KEY: string;
    let initialAuthKeyPair: KeyPair; // Store initial keypair for vault creation
    let initialEncKey: Uint8Array; // Store initial encKey for vault creation

    // Generate initial keys and vault state before tests run
    beforeAll(async () => {
      const mockToprfEncryptor = createMockToprfEncryptor();
      initialEncKey = mockToprfEncryptor.deriveEncKey(OLD_PASSWORD);
      initialAuthKeyPair = mockToprfEncryptor.deriveAuthKeyPair(OLD_PASSWORD);
      INITIAL_AUTH_PUB_KEY = bytesToBase64(initialAuthKeyPair.pk);

      const mockResult = await createMockVault(
        initialEncKey,
        initialAuthKeyPair,
        OLD_PASSWORD,
        MOCK_NODE_AUTH_TOKENS,
      );

      MOCK_VAULT = mockResult.encryptedMockVault;
      MOCK_VAULT_ENCRYPTION_KEY = mockResult.vaultEncryptionKey;
      MOCK_VAULT_ENCRYPTION_SALT = mockResult.vaultEncryptionSalt;
    });

    // Remove beforeEach as setup is done in beforeAll now

    it('should successfully sync the latest global password', async () => {
      await withController(
        {
          // Pass the pre-generated state values
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            authPubKey: INITIAL_AUTH_PUB_KEY, // Use the base64 encoded key
            vault: MOCK_VAULT,
            vaultEncryptionKey: MOCK_VAULT_ENCRYPTION_KEY,
            vaultEncryptionSalt: MOCK_VAULT_ENCRYPTION_SALT,
          }),
        },
        async ({ controller, toprfClient, encryptor }) => {
          // Unlock controller first - requires vaultEncryptionKey/Salt or password
          // Since we provide key/salt in state, submitPassword isn't strictly needed here
          // but we keep it to match the method's requirement of being unlocked
          // We'll use the key/salt implicitly by not providing password to unlockVaultAndGetBackupEncKey
          await controller.submitPassword(OLD_PASSWORD); // Unlock using the standard method

          const verifyPasswordSpy = jest.spyOn(
            controller,
            'verifyVaultPassword',
          );
          const recoverEncKeySpy = jest.spyOn(toprfClient, 'recoverEncKey');
          const encryptorSpy = jest.spyOn(encryptor, 'encryptWithDetail');

          // Mock recoverEncKey for the new global password
          const mockToprfEncryptor = createMockToprfEncryptor();
          const newEncKey = mockToprfEncryptor.deriveEncKey(GLOBAL_PASSWORD);
          const newAuthKeyPair =
            mockToprfEncryptor.deriveAuthKeyPair(GLOBAL_PASSWORD);

          recoverEncKeySpy.mockResolvedValueOnce({
            encKey: newEncKey,
            authKeyPair: newAuthKeyPair,
            rateLimitResetResult: Promise.resolve(),
            keyShareIndex: 1,
          });

          // We still need verifyPassword to work conceptually, even if unlock is bypassed
          // verifyPasswordSpy.mockResolvedValueOnce(); // Don't mock, let the real one run inside syncLatestGlobalPassword

          await controller.syncLatestGlobalPassword({
            oldPassword: OLD_PASSWORD,
            globalPassword: GLOBAL_PASSWORD,
          });

          // Assertions
          expect(verifyPasswordSpy).toHaveBeenCalledWith(OLD_PASSWORD, {
            skipLock: true, // skip lock since we already have the lock
          });
          expect(recoverEncKeySpy).toHaveBeenCalledWith(
            expect.objectContaining({ password: GLOBAL_PASSWORD }),
          );

          // Check if vault was re-encrypted with the new password and keys
          const expectedSerializedVaultData = JSON.stringify({
            authTokens: controller.state.nodeAuthTokens,
            toprfEncryptionKey: bytesToBase64(newEncKey),
            toprfAuthKeyPair: JSON.stringify({
              sk: bigIntToHex(newAuthKeyPair.sk),
              pk: bytesToBase64(newAuthKeyPair.pk),
            }),
          });
          expect(encryptorSpy).toHaveBeenCalledWith(
            GLOBAL_PASSWORD,
            expectedSerializedVaultData,
          );

          // Check if authPubKey was updated in state
          expect(controller.state.authPubKey).toBe(
            bytesToBase64(newAuthKeyPair.pk),
          );
          // Check if vault content actually changed
          expect(controller.state.vault).not.toBe(MOCK_VAULT);
        },
      );
    });

    it('should throw an error if the old password verification fails', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            authPubKey: INITIAL_AUTH_PUB_KEY,
            vault: MOCK_VAULT,
            vaultEncryptionKey: MOCK_VAULT_ENCRYPTION_KEY,
            vaultEncryptionSalt: MOCK_VAULT_ENCRYPTION_SALT,
          }),
        },
        async ({ controller }) => {
          // Unlock controller first
          await controller.submitPassword(OLD_PASSWORD);

          const verifyPasswordSpy = jest
            .spyOn(controller, 'verifyVaultPassword')
            .mockRejectedValueOnce(new Error('Incorrect old password'));

          await expect(
            controller.syncLatestGlobalPassword({
              oldPassword: 'WRONG_OLD_PASSWORD',
              globalPassword: GLOBAL_PASSWORD,
            }),
          ).rejects.toThrow('Incorrect old password');

          expect(verifyPasswordSpy).toHaveBeenCalledWith('WRONG_OLD_PASSWORD', {
            skipLock: true, // skip lock since we already have the lock
          });
        },
      );
    });

    it('should throw an error if recovering the encryption key for the global password fails', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            authPubKey: INITIAL_AUTH_PUB_KEY,
            vault: MOCK_VAULT,
            vaultEncryptionKey: MOCK_VAULT_ENCRYPTION_KEY,
            vaultEncryptionSalt: MOCK_VAULT_ENCRYPTION_SALT,
          }),
        },
        async ({ controller, toprfClient }) => {
          // Unlock controller first
          await controller.submitPassword(OLD_PASSWORD);

          const verifyPasswordSpy = jest
            .spyOn(controller, 'verifyVaultPassword')
            .mockResolvedValueOnce();
          const recoverEncKeySpy = jest
            .spyOn(toprfClient, 'recoverEncKey')
            .mockRejectedValueOnce(
              new RecoveryError(
                SeedlessOnboardingControllerErrorMessage.LoginFailedError,
              ),
            );

          await expect(
            controller.syncLatestGlobalPassword({
              oldPassword: OLD_PASSWORD,
              globalPassword: GLOBAL_PASSWORD,
            }),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.LoginFailedError,
          );

          expect(verifyPasswordSpy).toHaveBeenCalledWith(OLD_PASSWORD, {
            skipLock: true, // skip lock since we already have the lock
          });
          expect(recoverEncKeySpy).toHaveBeenCalledWith(
            expect.objectContaining({ password: GLOBAL_PASSWORD }),
          );
        },
      );
    });

    it('should throw an error if creating the new vault fails', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            authPubKey: INITIAL_AUTH_PUB_KEY,
            vault: MOCK_VAULT,
            vaultEncryptionKey: MOCK_VAULT_ENCRYPTION_KEY,
            vaultEncryptionSalt: MOCK_VAULT_ENCRYPTION_SALT,
          }),
        },
        async ({ controller, toprfClient, encryptor }) => {
          // Unlock controller first
          await controller.submitPassword(OLD_PASSWORD);

          const verifyPasswordSpy = jest
            .spyOn(controller, 'verifyVaultPassword')
            .mockResolvedValueOnce();
          const recoverEncKeySpy = jest.spyOn(toprfClient, 'recoverEncKey');
          const encryptorSpy = jest
            .spyOn(encryptor, 'encryptWithDetail')
            .mockRejectedValueOnce(new Error('Vault creation failed'));

          // Mock recoverEncKey for the new global password
          const mockToprfEncryptor = createMockToprfEncryptor();
          const newEncKey = mockToprfEncryptor.deriveEncKey(GLOBAL_PASSWORD);
          const newAuthKeyPair =
            mockToprfEncryptor.deriveAuthKeyPair(GLOBAL_PASSWORD);

          recoverEncKeySpy.mockResolvedValueOnce({
            encKey: newEncKey,
            authKeyPair: newAuthKeyPair,
            rateLimitResetResult: Promise.resolve(),
            keyShareIndex: 1,
          });

          await expect(
            controller.syncLatestGlobalPassword({
              oldPassword: OLD_PASSWORD,
              globalPassword: GLOBAL_PASSWORD,
            }),
          ).rejects.toThrow('Vault creation failed');

          expect(verifyPasswordSpy).toHaveBeenCalledWith(OLD_PASSWORD, {
            skipLock: true, // skip lock since we already have the lock
          });
          expect(recoverEncKeySpy).toHaveBeenCalledWith(
            expect.objectContaining({ password: GLOBAL_PASSWORD }),
          );
          expect(encryptorSpy).toHaveBeenCalled();
        },
      );
    });
  });
});
