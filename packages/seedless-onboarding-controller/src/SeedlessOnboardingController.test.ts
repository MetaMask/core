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
import { gcm } from '@noble/ciphers/aes';
import { utf8ToBytes } from '@noble/ciphers/utils';
import { managedNonce } from '@noble/ciphers/webcrypto';
import { Mutex } from 'async-mutex';
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
  getInitialSeedlessOnboardingControllerStateWithDefaults,
  SeedlessOnboardingController,
} from './SeedlessOnboardingController';
import type {
  SeedlessOnboardingControllerMessenger,
  SeedlessOnboardingControllerOptions,
  SeedlessOnboardingControllerState,
  VaultEncryptor,
} from './types';
import type {
  ExtractAvailableAction,
  ExtractAvailableEvent,
} from '../../base-controller/tests/helpers';
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
const refreshToken = 'refreshToken';
const revokeToken = 'revokeToken';
const accessToken = 'accessToken';
const metadataAccessToken = 'metadataAccessToken';

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
const MOCK_KEYRING_ENCRYPTION_KEY = 'mock-keyring-encryption-key';
const MOCK_SEED_PHRASE = stringToBytes(
  'horror pink muffin canal young photo magnet runway start elder patch until',
);
const MOCK_PRIVATE_KEY = stringToBytes('0xdeadbeef');

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
  baseMessenger: Messenger<
    ExtractAvailableAction<SeedlessOnboardingControllerMessenger>,
    ExtractAvailableEvent<SeedlessOnboardingControllerMessenger>
  >;
  toprfClient: ToprfSecureBackup;
  mockRefreshJWTToken: jest.Mock;
  mockRevokeRefreshToken: jest.Mock;
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

  const mockRefreshJWTToken = jest.fn().mockResolvedValue({
    idTokens: ['newIdToken'],
    metadataAccessToken: 'mock-metadata-access-token',
    accessToken: 'mock-access-token',
  });
  const mockRevokeRefreshToken = jest.fn().mockResolvedValue({
    newRevokeToken: 'newRevokeToken',
    newRefreshToken: 'newRefreshToken',
  });

  // In the withController function, before creating the controller:
  const originalFetchMetadataAccessCreds =
    SeedlessOnboardingController.prototype.fetchMetadataAccessCreds;

  jest
    .spyOn(SeedlessOnboardingController.prototype, 'fetchMetadataAccessCreds')
    .mockResolvedValue({
      metadataAccessToken: 'mock-metadata-access-token',
    });

  const controller = new SeedlessOnboardingController({
    encryptor,
    messenger,
    network: Web3AuthNetwork.Devnet,
    refreshJWTToken: mockRefreshJWTToken,
    revokeRefreshToken: mockRevokeRefreshToken,
    ...rest,
  });

  SeedlessOnboardingController.prototype.fetchMetadataAccessCreds =
    originalFetchMetadataAccessCreds;

  // default node auth token not expired for testing
  jest.spyOn(controller, 'checkNodeAuthTokenExpired').mockReturnValue(false);
  jest
    .spyOn(controller, 'checkMetadataAccessTokenExpired')
    .mockReturnValue(false);
  jest.spyOn(controller, 'checkAccessTokenExpired').mockReturnValue(false);

  const { toprfClient } = controller;
  return await fn({
    controller,
    encryptor,
    initialState: controller.state,
    messenger,
    baseMessenger,
    toprfClient,
    mockRefreshJWTToken,
    mockRevokeRefreshToken,
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
 * Creates a mock node auth token.
 *
 * @param params - The parameters for the mock node auth token.
 * @param params.exp - The expiration time of the node auth token.
 * @returns The mock node auth token.
 */
function createMockNodeAuthToken(params: { exp: number }) {
  return btoa(JSON.stringify(params));
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
  const pwEncKey = mockToprfEncryptor.derivePwEncKey(password);
  const authKeyPair = mockToprfEncryptor.deriveAuthKeyPair(password);
  const oprfKey = BigInt(0);
  const seed = stringToBytes(password);

  jest.spyOn(toprfClient, 'createLocalKey').mockResolvedValueOnce({
    encKey,
    pwEncKey,
    authKeyPair,
    oprfKey,
    seed,
  });

  return {
    encKey,
    pwEncKey,
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
 * @param keyIndex - The key index.
 *
 * @returns The mock fetchAuthPubKey result.
 */
function mockFetchAuthPubKey(
  toprfClient: ToprfSecureBackup,
  authPubKey: SEC1EncodedPublicKey = base64ToBytes(MOCK_AUTH_PUB_KEY),
  keyIndex: number = 1,
): FetchAuthPubKeyResult {
  jest.spyOn(toprfClient, 'fetchAuthPubKey').mockResolvedValue({
    authPubKey,
    keyIndex,
  });

  return {
    authPubKey,
    keyIndex,
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
  const pwEncKey = mockToprfEncryptor.derivePwEncKey(password);
  const authKeyPair = mockToprfEncryptor.deriveAuthKeyPair(password);
  const rateLimitResetResult = Promise.resolve();

  jest.spyOn(toprfClient, 'recoverEncKey').mockResolvedValueOnce({
    encKey,
    pwEncKey,
    authKeyPair,
    rateLimitResetResult,
    keyShareIndex: 1,
  });

  return {
    encKey,
    pwEncKey,
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
  const pwEncKey = mockToprfEncryptor.derivePwEncKey(newPassword);
  const authKeyPair = mockToprfEncryptor.deriveAuthKeyPair(newPassword);

  jest.spyOn(toprfClient, 'changeEncKey').mockResolvedValueOnce({
    encKey,
    pwEncKey,
    authKeyPair,
  });

  return { encKey, pwEncKey, authKeyPair };
}

/**
 * Mocks the changePassword method of the SeedlessOnboardingController instance.
 *
 * @param controller - The SeedlessOnboardingController instance.
 * @param toprfClient - The ToprfSecureBackup instance.
 * @param oldPassword - The old password.
 * @param newPassword - The new password.
 */
async function mockChangePassword<EKey>(
  controller: SeedlessOnboardingController<EKey>,
  toprfClient: ToprfSecureBackup,
  oldPassword: string,
  newPassword: string,
) {
  mockFetchAuthPubKey(
    toprfClient,
    base64ToBytes(controller.state.authPubKey as string),
  );

  // mock the recover enc key
  mockRecoverEncKey(toprfClient, oldPassword);

  // mock the change enc key
  mockChangeEncKey(toprfClient, newPassword);
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

  jest.spyOn(controller, 'fetchMetadataAccessCreds').mockResolvedValueOnce({
    metadataAccessToken: 'mock-metadata-access-token',
  });

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
 * @param pwEncKey - The password encryption key.
 * @param authKeyPair - The authentication key pair.
 * @param MOCK_PASSWORD - The mock password.
 * @param mockRevokeToken - The revoke token.
 * @param mockAccessToken - The access token.
 *
 * @returns The mock vault data.
 */
async function createMockVault(
  encKey: Uint8Array,
  pwEncKey: Uint8Array,
  authKeyPair: KeyPair,
  MOCK_PASSWORD: string,
  mockRevokeToken: string = revokeToken,
  mockAccessToken: string = accessToken,
) {
  const encryptor = createMockVaultEncryptor();

  const serializedKeyData = JSON.stringify({
    toprfEncryptionKey: bytesToBase64(encKey),
    toprfPwEncryptionKey: bytesToBase64(pwEncKey),
    toprfAuthKeyPair: JSON.stringify({
      sk: `0x${authKeyPair.sk.toString(16)}`,
      pk: bytesToBase64(authKeyPair.pk),
    }),
    revokeToken: mockRevokeToken,
    accessToken: mockAccessToken,
  });

  const { vault: encryptedMockVault, exportedKeyString } =
    await encryptor.encryptWithDetail(MOCK_PASSWORD, serializedKeyData);

  const aes = managedNonce(gcm)(pwEncKey);
  const encryptedKeyringEncryptionKey = aes.encrypt(
    utf8ToBytes(MOCK_KEYRING_ENCRYPTION_KEY),
  );

  return {
    encryptedMockVault,
    vaultEncryptionKey: exportedKeyString,
    vaultEncryptionSalt: JSON.parse(encryptedMockVault).salt,
    revokeToken: mockRevokeToken,
    accessToken: mockAccessToken,
    encryptedKeyringEncryptionKey,
    pwEncKey,
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
 * @param options.withoutMockRevokeToken - Whether to skip the revokeToken in authenticated user state.
 * @param options.withMockAuthPubKey - Whether to skip the checkPasswordOutdated method and use the mock authPubKey.
 * @param options.authPubKey - The mock authPubKey.
 * @param options.vault - The mock vault data.
 * @param options.vaultEncryptionKey - The mock vault encryption key.
 * @param options.vaultEncryptionSalt - The mock vault encryption salt.
 * @param options.encryptedKeyringEncryptionKey - The mock encrypted keyring encryption key.
 * @param options.withoutMockAccessToken - Whether to skip the accessToken in authenticated user state.
 * @param options.metadataAccessToken - The mock metadata access token.
 * @param options.accessToken - The mock access token.
 * @param options.encryptedSeedlessEncryptionKey - The mock encrypted seedless encryption key.
 * @returns The initial controller state with the mock authenticated user.
 */
function getMockInitialControllerState(options?: {
  withMockAuthenticatedUser?: boolean;
  withoutMockRevokeToken?: boolean;
  withoutMockAccessToken?: boolean;
  withMockAuthPubKey?: boolean;
  authPubKey?: string;
  vault?: string;
  vaultEncryptionKey?: string;
  vaultEncryptionSalt?: string;
  encryptedKeyringEncryptionKey?: string;
  encryptedSeedlessEncryptionKey?: string;
  metadataAccessToken?: string;
  accessToken?: string;
}): Partial<SeedlessOnboardingControllerState> {
  const state = getInitialSeedlessOnboardingControllerStateWithDefaults();

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
    state.authConnection = authConnection;
    state.nodeAuthTokens = MOCK_NODE_AUTH_TOKENS;
    state.authConnectionId = authConnectionId;
    state.groupedAuthConnectionId = groupedAuthConnectionId;
    state.userId = userId;
    state.refreshToken = refreshToken;
    state.metadataAccessToken =
      options?.metadataAccessToken ?? metadataAccessToken;
    state.isSeedlessOnboardingUserAuthenticated = true;
    if (!options?.withoutMockAccessToken || options?.accessToken) {
      state.accessToken = options?.accessToken ?? accessToken;
    }
    if (!options?.withoutMockRevokeToken) {
      state.revokeToken = revokeToken;
    }
  }

  if (options?.withMockAuthPubKey || options?.authPubKey) {
    state.authPubKey = options.authPubKey ?? MOCK_AUTH_PUB_KEY;
  }

  if (options?.encryptedKeyringEncryptionKey) {
    state.encryptedKeyringEncryptionKey = options.encryptedKeyringEncryptionKey;
  }

  if (options?.encryptedSeedlessEncryptionKey) {
    state.encryptedSeedlessEncryptionKey =
      options.encryptedSeedlessEncryptionKey;
  }

  return state;
}

describe('SeedlessOnboardingController', () => {
  describe('constructor', () => {
    it('should be able to instantiate', () => {
      const mockRefreshJWTToken = jest.fn().mockResolvedValue({
        idTokens: ['newIdToken'],
      });
      const mockRevokeRefreshToken = jest.fn().mockResolvedValue({
        newRevokeToken: 'newRevokeToken',
        newRefreshToken: 'newRefreshToken',
      });
      const { messenger } = mockSeedlessOnboardingMessenger();
      const controller = new SeedlessOnboardingController({
        messenger,
        encryptor: getDefaultSeedlessOnboardingVaultEncryptor(),
        refreshJWTToken: mockRefreshJWTToken,
        revokeRefreshToken: mockRevokeRefreshToken,
      });
      expect(controller).toBeDefined();
      expect(controller.state).toStrictEqual(
        getInitialSeedlessOnboardingControllerStateWithDefaults(),
      );
    });

    it('should be able to instantiate with an encryptor', () => {
      const mockRefreshJWTToken = jest.fn().mockResolvedValue({
        idTokens: ['newIdToken'],
      });
      const mockRevokeRefreshToken = jest.fn().mockResolvedValue({
        newRevokeToken: 'newRevokeToken',
        newRefreshToken: 'newRefreshToken',
      });
      const { messenger } = mockSeedlessOnboardingMessenger();
      const encryptor = createMockVaultEncryptor();

      expect(
        () =>
          new SeedlessOnboardingController({
            messenger,
            encryptor,
            refreshJWTToken: mockRefreshJWTToken,
            revokeRefreshToken: mockRevokeRefreshToken,
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

    it('should be able to instantiate with an authenticated user', () => {
      const mockRefreshJWTToken = jest.fn().mockResolvedValue({
        idTokens: ['newIdToken'],
      });
      const mockRevokeRefreshToken = jest.fn().mockResolvedValue({
        newRevokeToken: 'newRevokeToken',
        newRefreshToken: 'newRefreshToken',
      });
      const { messenger } = mockSeedlessOnboardingMessenger();

      const initialState = {
        nodeAuthTokens: MOCK_NODE_AUTH_TOKENS,
        authConnectionId,
        userId,
        authConnection,
        socialLoginEmail,
        refreshToken,
        revokeToken,
        metadataAccessToken,
        accessToken,
      };
      const controller = new SeedlessOnboardingController({
        messenger,
        encryptor: getDefaultSeedlessOnboardingVaultEncryptor(),
        refreshJWTToken: mockRefreshJWTToken,
        revokeRefreshToken: mockRevokeRefreshToken,
        state: initialState,
      });
      expect(controller).toBeDefined();
      expect(controller.state).toMatchObject(initialState);
    });

    it('should throw an error if the password outdated cache TTL is not a valid number', () => {
      const mockRefreshJWTToken = jest.fn().mockResolvedValue({
        idTokens: ['newIdToken'],
      });
      const mockRevokeRefreshToken = jest.fn().mockResolvedValue({
        newRevokeToken: 'newRevokeToken',
        newRefreshToken: 'newRefreshToken',
      });
      const { messenger } = mockSeedlessOnboardingMessenger();

      expect(() => {
        new SeedlessOnboardingController({
          messenger,
          refreshJWTToken: mockRefreshJWTToken,
          revokeRefreshToken: mockRevokeRefreshToken,
          // @ts-expect-error - test invalid password outdated cache TTL
          passwordOutdatedCacheTTL: 'Invalid Value',
        });
      }).toThrow(
        SeedlessOnboardingControllerErrorMessage.InvalidPasswordOutdatedCache,
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
          refreshToken,
          revokeToken,
          accessToken,
          metadataAccessToken,
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
        expect(controller.state.isSeedlessOnboardingUserAuthenticated).toBe(
          true,
        );
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
          refreshToken,
          accessToken,
          metadataAccessToken,
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
        expect(controller.state.isSeedlessOnboardingUserAuthenticated).toBe(
          true,
        );
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
          refreshToken,
          revokeToken,
          accessToken,
          metadataAccessToken,
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
        expect(controller.state.isSeedlessOnboardingUserAuthenticated).toBe(
          true,
        );
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
            refreshToken,
            revokeToken,
            accessToken,
            metadataAccessToken,
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
        expect(controller.state.isSeedlessOnboardingUserAuthenticated).toBe(
          false,
        );
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

    it('should throw FailedToFetchAuthPubKey error when fetchAuthPubKey fails', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            withMockAuthPubKey: true,
          }),
        },
        async ({ controller, toprfClient }) => {
          // Mock fetchAuthPubKey to reject with an error
          jest
            .spyOn(toprfClient, 'fetchAuthPubKey')
            .mockRejectedValueOnce(new Error('Network error'));

          await expect(controller.checkIsPasswordOutdated()).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.FailedToFetchAuthPubKey,
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
          const { encKey, pwEncKey, authKeyPair } = mockcreateLocalKey(
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
            pwEncKey,
            authKeyPair,
            MOCK_PASSWORD,
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
            controller.getSecretDataBackupState(MOCK_SEED_PHRASE),
          ).toBeDefined();
        },
      );
    });

    it('should store accessToken in the vault during backup creation', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller, toprfClient, encryptor }) => {
          // encrypt and store the secret data
          const mockSecretDataAdd = handleMockSecretDataAdd();
          jest.spyOn(toprfClient, 'persistLocalKey').mockResolvedValueOnce();
          await controller.createToprfKeyAndBackupSeedPhrase(
            MOCK_PASSWORD,
            MOCK_SEED_PHRASE,
            MOCK_KEYRING_ID,
          );

          expect(mockSecretDataAdd.isDone()).toBe(true);

          // Verify the vault was created
          expect(controller.state.vault).toBeDefined();

          // Decrypt the vault and verify accessToken is stored
          const decryptedVaultData = await encryptor.decrypt(
            MOCK_PASSWORD,
            controller.state.vault as string,
          );
          const parsedVaultData = JSON.parse(decryptedVaultData as string);

          expect(parsedVaultData.accessToken).toBe(accessToken);
          expect(parsedVaultData.revokeToken).toBe(revokeToken);
          expect(parsedVaultData.toprfEncryptionKey).toBeDefined();
          expect(parsedVaultData.toprfPwEncryptionKey).toBeDefined();
          expect(parsedVaultData.toprfAuthKeyPair).toBeDefined();
        },
      );
    });

    it('should throw error if accessToken is missing when creating new vault', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            withMockAuthPubKey: true,
            withoutMockAccessToken: true,
          }),
        },
        async ({ controller, toprfClient }) => {
          mockcreateLocalKey(toprfClient, MOCK_PASSWORD);

          // persist the local enc key
          jest.spyOn(toprfClient, 'persistLocalKey').mockResolvedValueOnce();
          // encrypt and store the secret data
          handleMockSecretDataAdd();

          await expect(
            controller.createToprfKeyAndBackupSeedPhrase(
              MOCK_PASSWORD,
              MOCK_SEED_PHRASE,
              MOCK_KEYRING_ID,
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.InvalidAccessToken,
          );

          // Verify that persistLocalKey was called
          expect(toprfClient.persistLocalKey).toHaveBeenCalledTimes(1);
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
            refreshToken,
            revokeToken,
            accessToken,
            metadataAccessToken,
          });

          const { encKey, pwEncKey, authKeyPair } = mockcreateLocalKey(
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
            pwEncKey,
            authKeyPair,
            MOCK_PASSWORD,
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
            controller.getSecretDataBackupState(MOCK_SEED_PHRASE),
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

    it('should throw error if authenticated user but refreshToken is missing', async () => {
      await withController(
        {
          state: {
            ...getMockInitialControllerState({
              withMockAuthenticatedUser: true,
            }),
            refreshToken: undefined,
          },
        },
        async ({ controller }) => {
          await expect(
            controller.createToprfKeyAndBackupSeedPhrase(
              MOCK_PASSWORD,
              MOCK_SEED_PHRASE,
              MOCK_KEYRING_ID,
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.InvalidRefreshToken,
          );
        },
      );
    });

    it('should throw error if authenticated user but metadataAccessToken is missing', async () => {
      await withController(
        {
          state: {
            ...getMockInitialControllerState({
              withMockAuthenticatedUser: true,
            }),
            metadataAccessToken: undefined,
          },
        },
        async ({ controller }) => {
          await expect(
            controller.createToprfKeyAndBackupSeedPhrase(
              MOCK_PASSWORD,
              MOCK_SEED_PHRASE,
              MOCK_KEYRING_ID,
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.InvalidMetadataAccessToken,
          );
        },
      );
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
            SeedlessOnboardingControllerErrorMessage.FailedToEncryptAndStoreSecretData,
          );
        },
      );
    });
  });

  describe('addNewSecretData', () => {
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
      const MOCK_PASSWORD_ENCRYPTION_KEY =
        mockToprfEncryptor.derivePwEncKey(MOCK_PASSWORD);
      const MOCK_AUTH_KEY_PAIR =
        mockToprfEncryptor.deriveAuthKeyPair(MOCK_PASSWORD);

      const mockResult = await createMockVault(
        MOCK_ENCRYPTION_KEY,
        MOCK_PASSWORD_ENCRYPTION_KEY,
        MOCK_AUTH_KEY_PAIR,
        MOCK_PASSWORD,
      );

      MOCK_VAULT = mockResult.encryptedMockVault;
      MOCK_VAULT_ENCRYPTION_KEY = mockResult.vaultEncryptionKey;
      MOCK_VAULT_ENCRYPTION_SALT = mockResult.vaultEncryptionSalt;
    });

    it('should throw an error if the controller is locked', async () => {
      await withController(async ({ controller }) => {
        await expect(
          controller.addNewSecretData(
            NEW_KEY_RING_1.seedPhrase,
            SecretType.Mnemonic,
            {
              keyringId: NEW_KEY_RING_1.id,
            },
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
          await controller.submitPassword(MOCK_PASSWORD);

          mockFetchAuthPubKey(
            toprfClient,
            base64ToBytes(controller.state.authPubKey as string),
          );

          // encrypt and store the secret data
          const mockSecretDataAdd = handleMockSecretDataAdd();
          await controller.addNewSecretData(
            NEW_KEY_RING_1.seedPhrase,
            SecretType.Mnemonic,
            {
              keyringId: NEW_KEY_RING_1.id,
            },
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
          await controller.submitPassword(MOCK_PASSWORD);

          mockFetchAuthPubKey(
            toprfClient,
            base64ToBytes(controller.state.authPubKey as string),
          );

          // encrypt and store the secret data
          const mockSecretDataAdd = handleMockSecretDataAdd();
          await controller.addNewSecretData(
            NEW_KEY_RING_1.seedPhrase,
            SecretType.Mnemonic,
            {
              keyringId: NEW_KEY_RING_1.id,
            },
          );

          expect(mockSecretDataAdd.isDone()).toBe(true);
          expect(controller.state.nodeAuthTokens).toBeDefined();
          expect(controller.state.nodeAuthTokens).toStrictEqual(
            MOCK_NODE_AUTH_TOKENS,
          );
          expect(controller.state.socialBackupsMetadata).toStrictEqual([
            {
              type: SecretType.Mnemonic,
              keyringId: NEW_KEY_RING_1.id,
              hash: keccak256AndHexify(NEW_KEY_RING_1.seedPhrase),
            },
          ]);

          // add another seed phrase backup
          const mockSecretDataAdd2 = handleMockSecretDataAdd();
          await controller.addNewSecretData(
            NEW_KEY_RING_2.seedPhrase,
            SecretType.Mnemonic,
            {
              keyringId: NEW_KEY_RING_2.id,
            },
          );

          expect(mockSecretDataAdd2.isDone()).toBe(true);
          expect(controller.state.nodeAuthTokens).toBeDefined();
          expect(controller.state.nodeAuthTokens).toStrictEqual(
            MOCK_NODE_AUTH_TOKENS,
          );

          const { socialBackupsMetadata } = controller.state;
          expect(socialBackupsMetadata).toStrictEqual([
            {
              type: SecretType.Mnemonic,
              keyringId: NEW_KEY_RING_1.id,
              hash: keccak256AndHexify(NEW_KEY_RING_1.seedPhrase),
            },
            {
              type: SecretType.Mnemonic,
              keyringId: NEW_KEY_RING_2.id,
              hash: keccak256AndHexify(NEW_KEY_RING_2.seedPhrase),
            },
          ]);
          // should be able to get the hash of the seed phrase backup from the state
          expect(
            controller.getSecretDataBackupState(NEW_KEY_RING_1.seedPhrase),
          ).toBeDefined();

          // should return undefined if the seed phrase is not backed up
          expect(
            controller.getSecretDataBackupState(NEW_KEY_RING_3.seedPhrase),
          ).toBeUndefined();
        },
      );
    });

    it('should be able to add Private key backup', async () => {
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
          await controller.submitPassword(MOCK_PASSWORD);

          mockFetchAuthPubKey(
            toprfClient,
            base64ToBytes(controller.state.authPubKey as string),
          );

          // encrypt and store the secret data
          const mockSecretDataAdd = handleMockSecretDataAdd();
          await controller.addNewSecretData(
            MOCK_PRIVATE_KEY,
            SecretType.PrivateKey,
          );

          expect(mockSecretDataAdd.isDone()).toBe(true);
          expect(
            controller.getSecretDataBackupState(
              MOCK_PRIVATE_KEY,
              SecretType.PrivateKey,
            ),
          ).toBeDefined();
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
            controller.addNewSecretData(
              NEW_KEY_RING_1.seedPhrase,
              SecretType.Mnemonic,
              {
                keyringId: NEW_KEY_RING_1.id,
              },
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.OutdatedPassword,
          );
        },
      );
    });

    it('should throw an error if `KeyringId` is missing when adding new Mnemonic (SRP)', async () => {
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
          await controller.submitPassword(MOCK_PASSWORD);

          mockFetchAuthPubKey(
            toprfClient,
            base64ToBytes(controller.state.authPubKey as string),
          );

          await expect(
            controller.addNewSecretData(MOCK_SEED_PHRASE, SecretType.Mnemonic),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.MissingKeyringId,
          );
        },
      );
    });
  });

  describe('fetchAllSecretData', () => {
    const MOCK_PASSWORD = 'mock-password';

    it('should be able to fetch secret data from metadata store', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller, toprfClient, initialState, encryptor }) => {
          // fetch and decrypt the secret data
          const { encKey, pwEncKey, authKeyPair } = mockRecoverEncKey(
            toprfClient,
            MOCK_PASSWORD,
          );

          const mockSecretDataGet = handleMockSecretDataGet({
            status: 200,
            body: createMockSecretDataGetResponse(
              [
                {
                  data: MOCK_SEED_PHRASE,
                  type: SecretType.Mnemonic,
                },
                {
                  data: MOCK_PRIVATE_KEY,
                  type: SecretType.PrivateKey,
                },
              ],
              MOCK_PASSWORD,
            ),
          });
          const secretData = await controller.fetchAllSecretData(MOCK_PASSWORD);

          expect(mockSecretDataGet.isDone()).toBe(true);
          expect(secretData).toBeDefined();
          expect(secretData).toHaveLength(2);
          expect(secretData[0].type).toStrictEqual(SecretType.Mnemonic);
          expect(secretData[0].data).toStrictEqual(MOCK_SEED_PHRASE);
          expect(secretData[1].type).toStrictEqual(SecretType.PrivateKey);
          expect(secretData[1].data).toStrictEqual(MOCK_PRIVATE_KEY);

          expect(controller.state.vault).toBeDefined();
          expect(controller.state.vault).not.toStrictEqual(initialState.vault);
          expect(controller.state.vault).not.toStrictEqual({});

          // verify the vault data
          const { encryptedMockVault } = await createMockVault(
            encKey,
            pwEncKey,
            authKeyPair,
            MOCK_PASSWORD,
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
          const { encKey, pwEncKey, authKeyPair } = mockRecoverEncKey(
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
          const secretData = await controller.fetchAllSecretData(MOCK_PASSWORD);

          expect(mockSecretDataGet.isDone()).toBe(true);
          expect(secretData).toBeDefined();
          expect(secretData).toHaveLength(3);

          expect(
            secretData.every((secret) => secret.type === SecretType.Mnemonic),
          ).toBe(true);

          // `fetchAndRestoreSeedPhraseMetadata` should sort the seed phrases by timestamp in ascending order and return the seed phrases in the correct order
          // the seed phrases are sorted in ascending order, so the oldest seed phrase is the first item in the array
          expect(secretData[0].data).toStrictEqual(
            stringToBytes('seedPhrase1'),
          );
          expect(secretData[1].data).toStrictEqual(
            stringToBytes('seedPhrase2'),
          );
          expect(secretData[2].data).toStrictEqual(
            stringToBytes('seedPhrase3'),
          );

          // verify the vault data
          const { encryptedMockVault } = await createMockVault(
            encKey,
            pwEncKey,
            authKeyPair,
            MOCK_PASSWORD,
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
            refreshToken,
            revokeToken,
            accessToken,
            metadataAccessToken,
          },
        },
        async ({ controller, toprfClient, initialState, encryptor }) => {
          // fetch and decrypt the secret data
          const { encKey, pwEncKey, authKeyPair } = mockRecoverEncKey(
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
          const secretData = await controller.fetchAllSecretData(MOCK_PASSWORD);

          expect(mockSecretDataGet.isDone()).toBe(true);
          expect(secretData).toBeDefined();
          expect(secretData[0].type).toStrictEqual(SecretType.Mnemonic);
          expect(secretData[0].data).toStrictEqual(MOCK_SEED_PHRASE);

          expect(controller.state.vault).toBeDefined();
          expect(controller.state.vault).not.toBe(initialState.vault);
          expect(controller.state.vault).not.toStrictEqual({});

          // verify the vault data
          const { encryptedMockVault } = await createMockVault(
            encKey,
            pwEncKey,
            authKeyPair,
            MOCK_PASSWORD,
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

    it('should be able to fetch seed phrases with cached encryption key without providing password', async () => {
      const mockToprfEncryptor = createMockToprfEncryptor();

      const MOCK_ENCRYPTION_KEY =
        mockToprfEncryptor.deriveEncKey(MOCK_PASSWORD);
      const MOCK_PASSWORD_ENCRYPTION_KEY =
        mockToprfEncryptor.derivePwEncKey(MOCK_PASSWORD);
      const MOCK_AUTH_KEY_PAIR =
        mockToprfEncryptor.deriveAuthKeyPair(MOCK_PASSWORD);

      const mockResult = await createMockVault(
        MOCK_ENCRYPTION_KEY,
        MOCK_PASSWORD_ENCRYPTION_KEY,
        MOCK_AUTH_KEY_PAIR,
        MOCK_PASSWORD,
      );

      const MOCK_VAULT = mockResult.encryptedMockVault;
      const MOCK_VAULT_ENCRYPTION_KEY = mockResult.vaultEncryptionKey;
      const MOCK_VAULT_ENCRYPTION_SALT = mockResult.vaultEncryptionSalt;

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

          const mockSecretDataGet = handleMockSecretDataGet({
            status: 200,
            body: createMockSecretDataGetResponse(
              [MOCK_SEED_PHRASE],
              MOCK_PASSWORD,
            ),
          });

          const secretData = await controller.fetchAllSecretData();

          expect(mockSecretDataGet.isDone()).toBe(true);
          expect(secretData).toBeDefined();
          expect(secretData).toHaveLength(1);
          expect(secretData[0].type).toStrictEqual(SecretType.Mnemonic);
          expect(secretData[0].data).toStrictEqual(MOCK_SEED_PHRASE);
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
            controller.fetchAllSecretData('INCORRECT_PASSWORD'),
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
            controller.fetchAllSecretData('INCORRECT_PASSWORD'),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.FailedToFetchSecretMetadata,
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
            controller.fetchAllSecretData(MOCK_PASSWORD),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.InvalidSecretMetadata,
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
                remainingTime: 250,
                message: 'Rate limit in effect',
                lockTime: 300,
                guessCount: 7,
              },
            }),
          );

          await expect(
            controller.fetchAllSecretData(MOCK_PASSWORD),
          ).rejects.toStrictEqual(
            new RecoveryError(
              SeedlessOnboardingControllerErrorMessage.TooManyLoginAttempts,
              {
                remainingTime: 250,
                numberOfAttempts: 7,
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
            controller.fetchAllSecretData(MOCK_PASSWORD),
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
            controller.fetchAllSecretData(MOCK_PASSWORD),
          ).rejects.toStrictEqual(
            new RecoveryError(
              SeedlessOnboardingControllerErrorMessage.LoginFailedError,
            ),
          );
        },
      );
    });

    it('should throw an error if the user does not have encrypted seed phrase metadata', async () => {
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
          await expect(
            controller.fetchAllSecretData(MOCK_PASSWORD),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.NoSecretDataFound,
          );

          expect(mockSecretDataGet.isDone()).toBe(true);
          expect(controller.state.vault).toBeUndefined();
          expect(controller.state.vault).toBe(initialState.vault);
        },
      );
    });

    it('should throw an error if the primary secret data is not a mnemonic', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller, toprfClient }) => {
          mockRecoverEncKey(toprfClient, MOCK_PASSWORD);

          const mockSecretDataGet = handleMockSecretDataGet({
            status: 200,
            body: createMockSecretDataGetResponse(
              [
                {
                  data: MOCK_PRIVATE_KEY,
                  type: SecretType.PrivateKey,
                },
              ],
              MOCK_PASSWORD,
            ),
          });

          await expect(
            controller.fetchAllSecretData(MOCK_PASSWORD),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.InvalidPrimarySecretDataType,
          );

          expect(mockSecretDataGet.isDone()).toBe(true);
        },
      );
    });
  });

  describe('submitPassword', () => {
    const MOCK_PASSWORD = 'mock-password';

    it('should be able to unlock the vault with password', async () => {
      const mockToprfEncryptor = createMockToprfEncryptor();

      const MOCK_ENCRYPTION_KEY =
        mockToprfEncryptor.deriveEncKey(MOCK_PASSWORD);
      const MOCK_PASSWORD_ENCRYPTION_KEY =
        mockToprfEncryptor.derivePwEncKey(MOCK_PASSWORD);
      const MOCK_AUTH_KEY_PAIR =
        mockToprfEncryptor.deriveAuthKeyPair(MOCK_PASSWORD);

      const mockResult = await createMockVault(
        MOCK_ENCRYPTION_KEY,
        MOCK_PASSWORD_ENCRYPTION_KEY,
        MOCK_AUTH_KEY_PAIR,
        MOCK_PASSWORD,
      );

      const mockVault = mockResult.encryptedMockVault;
      await withController(
        {
          state: {
            vault: mockVault,
          },
        },
        async ({ controller }) => {
          await controller.submitPassword(MOCK_PASSWORD);

          expect(controller.state.vault).toBe(mockVault);
        },
      );
    });

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

    it('should throw an error if vault unlocked has invalid authentication data', async () => {
      const mockVault = JSON.stringify({ foo: 'bar' });

      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            vault: mockVault,
          }),
        },
        async ({ controller, encryptor }) => {
          jest
            .spyOn(encryptor, 'decryptWithKey')
            .mockResolvedValueOnce(mockVault);
          await expect(
            controller.submitPassword(MOCK_PASSWORD),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.InvalidVaultData,
          );
        },
      );
    });

    it('should throw an error if vault unlocked has an unexpected shape', async () => {
      const mockVault = 'corrupted-vault-json';

      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            vault: mockVault,
          }),
        },
        async ({ controller, encryptor }) => {
          jest.spyOn(encryptor, 'decryptWithDetail').mockResolvedValueOnce({
            vault: mockVault,
            exportedKeyString: 'mock-encryption-key',
            salt: 'mock-salt',
          });
          await expect(
            controller.submitPassword(MOCK_PASSWORD),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.VaultDataError,
          );

          jest.spyOn(encryptor, 'decryptWithDetail').mockResolvedValueOnce({
            vault: null,
            exportedKeyString: 'mock-encryption-key',
            salt: 'mock-salt',
          });
          await expect(
            controller.submitPassword(MOCK_PASSWORD),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.VaultDataError,
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
      const MOCK_PASSWORD_ENCRYPTION_KEY =
        mockToprfEncryptor.derivePwEncKey(MOCK_PASSWORD);
      const MOCK_AUTH_KEY_PAIR =
        mockToprfEncryptor.deriveAuthKeyPair(MOCK_PASSWORD);

      const mockResult = await createMockVault(
        MOCK_ENCRYPTION_KEY,
        MOCK_PASSWORD_ENCRYPTION_KEY,
        MOCK_AUTH_KEY_PAIR,
        MOCK_PASSWORD,
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
            data: MOCK_SEED_PHRASE,
            type: SecretType.Mnemonic,
          });
          const MOCK_SEED_PHRASE_HASH = keccak256AndHexify(MOCK_SEED_PHRASE);
          expect(controller.state.socialBackupsMetadata).toStrictEqual([
            {
              type: SecretType.Mnemonic,
              keyringId: MOCK_KEYRING_ID,
              hash: MOCK_SEED_PHRASE_HASH,
            },
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
            data: MOCK_SEED_PHRASE,
            type: SecretType.Mnemonic,
          });
          const MOCK_SEED_PHRASE_HASH = keccak256AndHexify(MOCK_SEED_PHRASE);
          expect(controller.state.socialBackupsMetadata).toStrictEqual([
            {
              type: SecretType.Mnemonic,
              keyringId: MOCK_KEYRING_ID,
              hash: MOCK_SEED_PHRASE_HASH,
            },
          ]);

          controller.updateBackupMetadataState({
            keyringId: MOCK_KEYRING_ID,
            data: MOCK_SEED_PHRASE,
            type: SecretType.Mnemonic,
          });
          expect(controller.state.socialBackupsMetadata).toStrictEqual([
            {
              type: SecretType.Mnemonic,
              keyringId: MOCK_KEYRING_ID,
              hash: MOCK_SEED_PHRASE_HASH,
            },
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
              data: MOCK_SEED_PHRASE,
              type: SecretType.Mnemonic,
            },
            {
              keyringId: MOCK_KEYRING_ID_2,
              data: MOCK_SEED_PHRASE_2,
              type: SecretType.Mnemonic,
            },
          ]);
          const MOCK_SEED_PHRASE_HASH = keccak256AndHexify(MOCK_SEED_PHRASE);
          const MOCK_SEED_PHRASE_2_HASH =
            keccak256AndHexify(MOCK_SEED_PHRASE_2);
          expect(controller.state.socialBackupsMetadata).toStrictEqual([
            {
              keyringId: MOCK_KEYRING_ID,
              hash: MOCK_SEED_PHRASE_HASH,
              type: SecretType.Mnemonic,
            },
            {
              keyringId: MOCK_KEYRING_ID_2,
              hash: MOCK_SEED_PHRASE_2_HASH,
              type: SecretType.Mnemonic,
            },
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
            refreshToken,
            revokeToken,
            accessToken,
            metadataAccessToken,
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

    it('should not call recoverEncKey when vault data is available and keyIndex is returned from fetchAuthPubKey', async () => {
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

          const LATEST_KEY_INDEX = 5;

          // Mock fetchAuthPubKey to return a specific key index
          mockFetchAuthPubKey(
            toprfClient,
            base64ToBytes(controller.state.authPubKey as string),
            LATEST_KEY_INDEX,
          );

          const recoverEncKeySpy = jest.spyOn(toprfClient, 'recoverEncKey');

          mockChangeEncKey(toprfClient, NEW_MOCK_PASSWORD);

          const changeEncKeySpy = jest.spyOn(toprfClient, 'changeEncKey');

          // Call changePassword (now without keyIndex parameter)
          await controller.changePassword(NEW_MOCK_PASSWORD, MOCK_PASSWORD);

          // Verify that recoverEncKey was NOT called since vault data is available and key index is provided
          expect(recoverEncKeySpy).not.toHaveBeenCalled();

          // Verify that changeEncKey was called with the fetched key index
          expect(changeEncKeySpy).toHaveBeenCalledWith(
            expect.objectContaining({
              newKeyShareIndex: LATEST_KEY_INDEX,
              newPassword: NEW_MOCK_PASSWORD,
            }),
          );
        },
      );
    });

    it('should call recoverEncKey when keyIndex is missing', async () => {
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

          // Mock fetchAuthPubKey to return falsy keyIndex (simulating missing latestKeyIndex)
          // This will cause newKeyShareIndex to be falsy, triggering the recovery path
          jest.spyOn(toprfClient, 'fetchAuthPubKey').mockResolvedValueOnce({
            authPubKey: base64ToBytes(controller.state.authPubKey as string),
            keyIndex: 0, // This is falsy and will trigger the recovery path
          });

          const recoverEncKeySpy = jest.spyOn(toprfClient, 'recoverEncKey');
          const { encKey, pwEncKey, authKeyPair } = mockRecoverEncKey(
            toprfClient,
            MOCK_PASSWORD,
          );

          mockChangeEncKey(toprfClient, NEW_MOCK_PASSWORD);

          const changeEncKeySpy = jest.spyOn(toprfClient, 'changeEncKey');

          // Call changePassword
          await controller.changePassword(NEW_MOCK_PASSWORD, MOCK_PASSWORD);

          // Verify that recoverEncKey was called due to missing keyIndex
          expect(recoverEncKeySpy).toHaveBeenCalledWith(
            expect.objectContaining({
              password: MOCK_PASSWORD,
            }),
          );

          // Verify that changeEncKey was called with recovered data
          expect(changeEncKeySpy).toHaveBeenCalledWith(
            expect.objectContaining({
              oldEncKey: encKey,
              oldPwEncKey: pwEncKey,
              oldAuthKeyPair: authKeyPair,
              newPassword: NEW_MOCK_PASSWORD,
            }),
          );
        },
      );
    });

    it('should throw FailedToFetchAuthPubKey error when fetchAuthPubKey fails', async () => {
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

          // Mock fetchAuthPubKey to reject with an error
          jest
            .spyOn(toprfClient, 'fetchAuthPubKey')
            .mockRejectedValueOnce(new Error('Network error'));

          await expect(
            controller.changePassword(NEW_MOCK_PASSWORD, MOCK_PASSWORD),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.FailedToFetchAuthPubKey,
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
            getInitialSeedlessOnboardingControllerStateWithDefaults(),
          );
        },
      );
    });
  });

  describe('vault', () => {
    const MOCK_PASSWORD = 'mock-password';

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
            controller.createToprfKeyAndBackupSeedPhrase(
              // @ts-expect-error Intentionally passing wrong password type
              123,
              MOCK_SEED_PHRASE,
              'MOCK_KEYRING_ID',
            ),
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
      const mutexAcquireSpy = jest
        .spyOn(Mutex.prototype, 'acquire')
        .mockResolvedValueOnce(jest.fn());

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

          await controller.setLocked();

          // verify that the mutex acquire was called
          expect(mutexAcquireSpy).toHaveBeenCalled();

          await expect(
            controller.addNewSecretData(MOCK_SEED_PHRASE, SecretType.Mnemonic, {
              keyringId: MOCK_KEYRING_ID,
            }),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.ControllerLocked,
          );
        },
      );
    });
  });

  describe('SeedPhraseMetadata', () => {
    it('should be able to create a seed phrase metadata with default options', () => {
      // should be able to create a SecretMetadata instance via constructor
      const seedPhraseMetadata = new SecretMetadata(MOCK_SEED_PHRASE);
      expect(seedPhraseMetadata.data).toBeDefined();
      expect(seedPhraseMetadata.timestamp).toBeDefined();
      expect(seedPhraseMetadata.type).toBe(SecretType.Mnemonic);
      expect(seedPhraseMetadata.version).toBe(SecretMetadataVersion.V1);

      // should be able to create a SecretMetadata instance with a timestamp via constructor
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
      const mockPrivKeyString = '0xdeadbeef';
      const secret1 = new SecretMetadata<string>(mockPrivKeyString, {
        type: SecretType.PrivateKey,
      });
      const secret2 = new SecretMetadata<Uint8Array>(MOCK_SEED_PHRASE, {
        type: SecretType.Mnemonic,
      });

      const secrets = [secret1.toBytes(), secret2.toBytes()];

      const parsedSecrets =
        SecretMetadata.parseSecretsFromMetadataStore(secrets);
      expect(parsedSecrets).toHaveLength(2);
      expect(parsedSecrets[0].data).toBe(mockPrivKeyString);
      expect(parsedSecrets[0].type).toBe(SecretType.PrivateKey);
      expect(parsedSecrets[1].data).toStrictEqual(MOCK_SEED_PHRASE);
      expect(parsedSecrets[1].type).toBe(SecretType.Mnemonic);
    });

    it('should be able to filter the array of SecretMetadata by type', () => {
      const mockPrivKeyString = '0xdeadbeef';
      const secret1 = new SecretMetadata<string>(mockPrivKeyString, {
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
      expect(privateKeySecrets[0].data).toBe(mockPrivKeyString);
      expect(privateKeySecrets[0].type).toBe(SecretType.PrivateKey);
    });
  });

  describe('store and recover keyring encryption key', () => {
    const GLOBAL_PASSWORD = 'global-password';
    const RECOVERED_PASSWORD = 'recovered-password';

    it('should store and recover keyring encryption key', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            withMockAuthPubKey: true,
          }),
        },
        async ({ controller, toprfClient }) => {
          // Setup and store keyring encryption key.
          await mockCreateToprfKeyAndBackupSeedPhrase(
            toprfClient,
            controller,
            RECOVERED_PASSWORD,
            MOCK_SEED_PHRASE,
            MOCK_KEYRING_ID,
          );

          await controller.storeKeyringEncryptionKey(
            MOCK_KEYRING_ENCRYPTION_KEY,
          );

          // Mock recoverEncKey for the global password
          const mockToprfEncryptor = createMockToprfEncryptor();
          const encKey = mockToprfEncryptor.deriveEncKey(GLOBAL_PASSWORD);
          const pwEncKey = mockToprfEncryptor.derivePwEncKey(GLOBAL_PASSWORD);
          const authKeyPair =
            mockToprfEncryptor.deriveAuthKeyPair(GLOBAL_PASSWORD);
          jest.spyOn(toprfClient, 'recoverEncKey').mockResolvedValueOnce({
            encKey,
            authKeyPair,
            pwEncKey,
            rateLimitResetResult: Promise.resolve(),
            keyShareIndex: 1,
          });

          // Mock toprfClient.recoverPassword
          const recoveredPwEncKey =
            mockToprfEncryptor.derivePwEncKey(RECOVERED_PASSWORD);
          jest.spyOn(toprfClient, 'recoverPwEncKey').mockResolvedValueOnce({
            pwEncKey: recoveredPwEncKey,
          });

          await controller.setLocked();

          await controller.submitGlobalPassword({
            globalPassword: GLOBAL_PASSWORD,
          });

          const keyringEncryptionKey =
            await controller.loadKeyringEncryptionKey();

          expect(keyringEncryptionKey).toStrictEqual(
            MOCK_KEYRING_ENCRYPTION_KEY,
          );
          expect(toprfClient.recoverEncKey).toHaveBeenCalled();
          expect(toprfClient.recoverPwEncKey).toHaveBeenCalled();
        },
      );
    });

    it('should throw if key not set', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            withMockAuthPubKey: true,
            vault: 'mock-vault',
          }),
        },
        async ({ controller, toprfClient }) => {
          await expect(
            controller.storeKeyringEncryptionKey(''),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.WrongPasswordType,
          );

          // Setup and store keyring encryption key.
          await mockCreateToprfKeyAndBackupSeedPhrase(
            toprfClient,
            controller,
            RECOVERED_PASSWORD,
            MOCK_SEED_PHRASE,
            MOCK_KEYRING_ID,
          );

          await expect(controller.loadKeyringEncryptionKey()).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.EncryptedKeyringEncryptionKeyNotSet,
          );
        },
      );
    });

    it('should store and load keyring encryption key', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            withMockAuthPubKey: true,
          }),
        },
        async ({ controller, toprfClient }) => {
          // Setup and store keyring encryption key.
          await mockCreateToprfKeyAndBackupSeedPhrase(
            toprfClient,
            controller,
            RECOVERED_PASSWORD,
            MOCK_SEED_PHRASE,
            MOCK_KEYRING_ID,
          );

          await controller.storeKeyringEncryptionKey(
            MOCK_KEYRING_ENCRYPTION_KEY,
          );

          const result = await controller.loadKeyringEncryptionKey();
          expect(result).toStrictEqual(MOCK_KEYRING_ENCRYPTION_KEY);
        },
      );
    });

    it('should load keyring encryption key after change password', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            withMockAuthPubKey: true,
          }),
        },
        async ({ controller, toprfClient }) => {
          // Setup and store keyring encryption key.
          await mockCreateToprfKeyAndBackupSeedPhrase(
            toprfClient,
            controller,
            RECOVERED_PASSWORD,
            MOCK_SEED_PHRASE,
            MOCK_KEYRING_ID,
          );

          await controller.storeKeyringEncryptionKey(
            MOCK_KEYRING_ENCRYPTION_KEY,
          );

          await mockChangePassword(
            controller,
            toprfClient,
            RECOVERED_PASSWORD,
            GLOBAL_PASSWORD,
          );

          await controller.changePassword(GLOBAL_PASSWORD, RECOVERED_PASSWORD);

          const result = await controller.loadKeyringEncryptionKey();

          expect(result).toStrictEqual(MOCK_KEYRING_ENCRYPTION_KEY);
        },
      );
    });

    it('should recover keyring encryption key after change password', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            withMockAuthPubKey: true,
          }),
        },
        async ({ controller, toprfClient }) => {
          // Setup and store keyring encryption key.
          await mockCreateToprfKeyAndBackupSeedPhrase(
            toprfClient,
            controller,
            RECOVERED_PASSWORD,
            MOCK_SEED_PHRASE,
            MOCK_KEYRING_ID,
          );

          await controller.storeKeyringEncryptionKey(
            MOCK_KEYRING_ENCRYPTION_KEY,
          );

          await mockChangePassword(
            controller,
            toprfClient,
            RECOVERED_PASSWORD,
            GLOBAL_PASSWORD,
          );

          await controller.changePassword(GLOBAL_PASSWORD, RECOVERED_PASSWORD);

          // Mock recoverEncKey for the global password
          const mockToprfEncryptor = createMockToprfEncryptor();
          const encKey = mockToprfEncryptor.deriveEncKey(GLOBAL_PASSWORD);
          const pwEncKey = mockToprfEncryptor.derivePwEncKey(GLOBAL_PASSWORD);
          const authKeyPair =
            mockToprfEncryptor.deriveAuthKeyPair(GLOBAL_PASSWORD);
          jest.spyOn(toprfClient, 'recoverEncKey').mockResolvedValueOnce({
            encKey,
            pwEncKey,
            authKeyPair,
            rateLimitResetResult: Promise.resolve(),
            keyShareIndex: 1,
          });

          // Mock toprfClient.recoverPwEncKey
          const recoveredPwEncKey =
            mockToprfEncryptor.derivePwEncKey(GLOBAL_PASSWORD);
          jest.spyOn(toprfClient, 'recoverPwEncKey').mockResolvedValueOnce({
            pwEncKey: recoveredPwEncKey,
          });

          await controller.setLocked();

          await controller.submitGlobalPassword({
            globalPassword: GLOBAL_PASSWORD,
          });

          const keyringEncryptionKey =
            await controller.loadKeyringEncryptionKey();

          expect(keyringEncryptionKey).toStrictEqual(
            MOCK_KEYRING_ENCRYPTION_KEY,
          );
        },
      );
    });

    it('should throw if encryptedKeyringEncryptionKey not set', async () => {
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
          const pwEncKey = mockToprfEncryptor.derivePwEncKey(GLOBAL_PASSWORD);
          const authKeyPair =
            mockToprfEncryptor.deriveAuthKeyPair(GLOBAL_PASSWORD);
          jest.spyOn(toprfClient, 'recoverEncKey').mockResolvedValueOnce({
            encKey,
            pwEncKey,
            authKeyPair,
            rateLimitResetResult: Promise.resolve(),
            keyShareIndex: 1,
          });

          // Mock toprfClient.recoverPwEncKey
          const recoveredPwEncKey =
            mockToprfEncryptor.derivePwEncKey(RECOVERED_PASSWORD);
          jest.spyOn(toprfClient, 'recoverPwEncKey').mockResolvedValueOnce({
            pwEncKey: recoveredPwEncKey,
          });

          await expect(
            controller.submitGlobalPassword({
              globalPassword: GLOBAL_PASSWORD,
            }),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.CouldNotRecoverPassword,
          );
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
            controller.submitGlobalPassword({
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
            controller.submitGlobalPassword({
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
          const pwEncKey = mockToprfEncryptor.derivePwEncKey(GLOBAL_PASSWORD);
          const authKeyPair =
            mockToprfEncryptor.deriveAuthKeyPair(GLOBAL_PASSWORD);
          jest.spyOn(toprfClient, 'recoverEncKey').mockResolvedValueOnce({
            encKey,
            pwEncKey,
            authKeyPair,
            rateLimitResetResult: Promise.resolve(),
            keyShareIndex: 1,
          });

          jest
            .spyOn(toprfClient, 'recoverPwEncKey')
            .mockRejectedValueOnce(
              new TOPRFError(
                TOPRFErrorCode.CouldNotFetchPassword,
                'Could not fetch password',
              ),
            );

          await expect(
            controller.submitGlobalPassword({
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
          const pwEncKey = mockToprfEncryptor.derivePwEncKey(GLOBAL_PASSWORD);
          const authKeyPair =
            mockToprfEncryptor.deriveAuthKeyPair(GLOBAL_PASSWORD);
          jest.spyOn(toprfClient, 'recoverEncKey').mockResolvedValueOnce({
            encKey,
            pwEncKey,
            authKeyPair,
            rateLimitResetResult: Promise.resolve(),
            keyShareIndex: 1,
          });

          jest
            .spyOn(toprfClient, 'recoverPwEncKey')
            .mockRejectedValueOnce(new Error('Unknown error'));

          await expect(
            controller.submitGlobalPassword({
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

    it('should throw MaxKeyChainLengthExceeded error when max key chain length is exceeded', async () => {
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
          const pwEncKey = mockToprfEncryptor.derivePwEncKey(GLOBAL_PASSWORD);
          const authKeyPair =
            mockToprfEncryptor.deriveAuthKeyPair(GLOBAL_PASSWORD);

          // Mock recoverEncKey to succeed
          jest.spyOn(toprfClient, 'recoverEncKey').mockResolvedValueOnce({
            encKey,
            pwEncKey,
            authKeyPair,
            rateLimitResetResult: Promise.resolve(),
            keyShareIndex: 1,
          });

          // Mock recoverPwEncKey to throw max key chain length error
          jest
            .spyOn(toprfClient, 'recoverPwEncKey')
            .mockRejectedValueOnce(
              new TOPRFError(
                TOPRFErrorCode.MaxKeyChainLengthExceeded,
                'Max key chain length exceeded',
              ),
            );

          await expect(
            controller.submitGlobalPassword({
              globalPassword: GLOBAL_PASSWORD,
            }),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.MaxKeyChainLengthExceeded,
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
    let initialPwEncKey: Uint8Array; // Store initial pwEncKey for vault creation
    let initialEncryptedSeedlessEncryptionKey: Uint8Array; // Store initial encryptedSeedlessEncryptionKey for vault creation

    // Generate initial keys and vault state before tests run
    beforeAll(async () => {
      const mockToprfEncryptor = createMockToprfEncryptor();
      initialEncKey = mockToprfEncryptor.deriveEncKey(OLD_PASSWORD);
      initialPwEncKey = mockToprfEncryptor.derivePwEncKey(OLD_PASSWORD);
      initialAuthKeyPair = mockToprfEncryptor.deriveAuthKeyPair(OLD_PASSWORD);
      INITIAL_AUTH_PUB_KEY = bytesToBase64(initialAuthKeyPair.pk);

      const mockResult = await createMockVault(
        initialEncKey,
        initialPwEncKey,
        initialAuthKeyPair,
        OLD_PASSWORD,
      );

      MOCK_VAULT = mockResult.encryptedMockVault;
      MOCK_VAULT_ENCRYPTION_KEY = mockResult.vaultEncryptionKey;
      MOCK_VAULT_ENCRYPTION_SALT = mockResult.vaultEncryptionSalt;

      const aes = managedNonce(gcm)(initialPwEncKey);
      initialEncryptedSeedlessEncryptionKey = aes.encrypt(
        utf8ToBytes(MOCK_VAULT_ENCRYPTION_KEY),
      );
    });

    // Remove beforeEach as setup is done in beforeAll now

    it('should successfully sync the latest global password', async () => {
      const b64EncKey = bytesToBase64(initialEncryptedSeedlessEncryptionKey);
      await withController(
        {
          // Pass the pre-generated state values
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            authPubKey: INITIAL_AUTH_PUB_KEY, // Use the base64 encoded key
            vault: MOCK_VAULT,
            vaultEncryptionKey: MOCK_VAULT_ENCRYPTION_KEY,
            vaultEncryptionSalt: MOCK_VAULT_ENCRYPTION_SALT,
            withMockAuthPubKey: true,
            encryptedSeedlessEncryptionKey: b64EncKey,
          }),
        },
        async ({ controller, toprfClient, encryptor }) => {
          // Unlock controller first - requires vaultEncryptionKey/Salt or password
          // Since we provide key/salt in state, submitPassword isn't strictly needed here
          // but we keep it to match the method's requirement of being unlocked
          // We'll use the key/salt implicitly by not providing password to unlockVaultAndGetBackupEncKey
          await controller.submitPassword(OLD_PASSWORD); // Unlock using the standard method

          const recoverEncKeySpy = jest.spyOn(toprfClient, 'recoverEncKey');
          const encryptorSpy = jest.spyOn(encryptor, 'encryptWithDetail');

          // Mock recoverEncKey for the new global password
          const mockToprfEncryptor = createMockToprfEncryptor();
          const newEncKey = mockToprfEncryptor.deriveEncKey(GLOBAL_PASSWORD);
          const newPwEncKey =
            mockToprfEncryptor.derivePwEncKey(GLOBAL_PASSWORD);
          const newAuthKeyPair =
            mockToprfEncryptor.deriveAuthKeyPair(GLOBAL_PASSWORD);

          recoverEncKeySpy.mockResolvedValueOnce({
            encKey: newEncKey,
            pwEncKey: newPwEncKey,
            authKeyPair: newAuthKeyPair,
            rateLimitResetResult: Promise.resolve(),
            keyShareIndex: 1,
          });

          // We still need verifyPassword to work conceptually, even if unlock is bypassed
          // verifyPasswordSpy.mockResolvedValueOnce(); // Don't mock, let the real one run inside syncLatestGlobalPassword

          await controller.setLocked();

          // Mock recoverEncKey for the global password
          const encKey = mockToprfEncryptor.deriveEncKey(GLOBAL_PASSWORD);
          const pwEncKey = mockToprfEncryptor.derivePwEncKey(GLOBAL_PASSWORD);
          const authKeyPair =
            mockToprfEncryptor.deriveAuthKeyPair(GLOBAL_PASSWORD);
          jest.spyOn(toprfClient, 'recoverEncKey').mockResolvedValueOnce({
            encKey,
            pwEncKey,
            authKeyPair,
            rateLimitResetResult: Promise.resolve(),
            keyShareIndex: 1,
          });

          // Mock toprfClient.recoverPwEncKey
          const recoveredPwEncKey =
            mockToprfEncryptor.derivePwEncKey(OLD_PASSWORD);
          jest.spyOn(toprfClient, 'recoverPwEncKey').mockResolvedValueOnce({
            pwEncKey: recoveredPwEncKey,
          });

          await controller.submitGlobalPassword({
            globalPassword: GLOBAL_PASSWORD,
          });

          await controller.syncLatestGlobalPassword({
            globalPassword: GLOBAL_PASSWORD,
          });

          // Assertions
          expect(recoverEncKeySpy).toHaveBeenCalledWith(
            expect.objectContaining({ password: GLOBAL_PASSWORD }),
          );

          // Check if vault was re-encrypted with the new password and keys
          const expectedSerializedVaultData = JSON.stringify({
            toprfEncryptionKey: bytesToBase64(newEncKey),
            toprfPwEncryptionKey: bytesToBase64(newPwEncKey),
            toprfAuthKeyPair: JSON.stringify({
              sk: bigIntToHex(newAuthKeyPair.sk),
              pk: bytesToBase64(newAuthKeyPair.pk),
            }),
            revokeToken: controller.state.revokeToken,
            accessToken: controller.state.accessToken,
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

          const recoverEncKeySpy = jest
            .spyOn(toprfClient, 'recoverEncKey')
            .mockRejectedValueOnce(
              new RecoveryError(
                SeedlessOnboardingControllerErrorMessage.LoginFailedError,
              ),
            );

          await expect(
            controller.syncLatestGlobalPassword({
              globalPassword: GLOBAL_PASSWORD,
            }),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.LoginFailedError,
          );

          expect(recoverEncKeySpy).toHaveBeenCalledWith(
            expect.objectContaining({ password: GLOBAL_PASSWORD }),
          );
        },
      );
    });

    it('should throw an error if creating the new vault fails', async () => {
      const state = getMockInitialControllerState({
        withMockAuthenticatedUser: true,
        authPubKey: INITIAL_AUTH_PUB_KEY,
        vault: MOCK_VAULT,
        vaultEncryptionKey: MOCK_VAULT_ENCRYPTION_KEY,
        vaultEncryptionSalt: MOCK_VAULT_ENCRYPTION_SALT,
      });
      delete state.revokeToken;
      delete state.accessToken;

      await withController(
        {
          state,
        },
        async ({ controller, toprfClient, encryptor }) => {
          // Unlock controller first
          await controller.submitPassword(OLD_PASSWORD);

          const recoverEncKeySpy = jest.spyOn(toprfClient, 'recoverEncKey');
          const encryptorSpy = jest.spyOn(encryptor, 'encryptWithDetail');

          // Make recoverEncKey succeed
          const mockToprfEncryptor = createMockToprfEncryptor();
          const newEncKey = mockToprfEncryptor.deriveEncKey(GLOBAL_PASSWORD);
          const newPwEncKey =
            mockToprfEncryptor.derivePwEncKey(GLOBAL_PASSWORD);
          const newAuthKeyPair =
            mockToprfEncryptor.deriveAuthKeyPair(GLOBAL_PASSWORD);

          recoverEncKeySpy.mockResolvedValueOnce({
            encKey: newEncKey,
            pwEncKey: newPwEncKey,
            authKeyPair: newAuthKeyPair,
            rateLimitResetResult: Promise.resolve(),
            keyShareIndex: 1,
          });

          // Make encryptWithDetail always fail to ensure we catch any call to it
          encryptorSpy.mockRejectedValue(new Error('Vault creation failed'));

          await expect(
            controller.syncLatestGlobalPassword({
              globalPassword: GLOBAL_PASSWORD,
            }),
          ).rejects.toThrow('Vault creation failed');

          expect(recoverEncKeySpy).toHaveBeenCalledWith(
            expect.objectContaining({ password: GLOBAL_PASSWORD }),
          );
          expect(encryptorSpy).toHaveBeenCalled();
        },
      );
    });

    /**
     * This test is to verify that the controller throws an error if the encryption salt is expired.
     * The test creates a mock vault with a different salt value in the state to simulate an expired salt.
     * It then creates mock keys associated with the new global password and uses these values as mock return values for the recoverEncKey and recoverPwEncKey calls.
     * The test expects the controller to throw an error indicating that the password could not be recovered since the encryption salt from state is different from the salt in the mock vault.
     */
    it('should throw an error if the encryption salt is expired', async () => {
      const encryptedSeedlessEncryptionKey = bytesToBase64(
        initialEncryptedSeedlessEncryptionKey,
      );
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            authPubKey: INITIAL_AUTH_PUB_KEY, // Use the base64 encoded key
            vault: MOCK_VAULT,
            vaultEncryptionKey: MOCK_VAULT_ENCRYPTION_KEY,
            // Mock a different salt value in state to simulate an expired salt
            vaultEncryptionSalt: 'DIFFERENT-SALT',
            withMockAuthPubKey: true,
            encryptedSeedlessEncryptionKey,
          }),
        },
        async ({ controller, toprfClient }) => {
          // Here we are creating mock keys associated with the new global password
          // and these values are used as mock return values for the recoverEncKey and recoverPwEncKey calls
          const mockToprfEncryptor = createMockToprfEncryptor();
          const newEncKey = mockToprfEncryptor.deriveEncKey(GLOBAL_PASSWORD);
          const newPwEncKey =
            mockToprfEncryptor.derivePwEncKey(GLOBAL_PASSWORD);
          const newAuthKeyPair =
            mockToprfEncryptor.deriveAuthKeyPair(GLOBAL_PASSWORD);

          const recoverEncKeySpy = jest
            .spyOn(toprfClient, 'recoverEncKey')
            .mockResolvedValueOnce({
              encKey: newEncKey,
              pwEncKey: newPwEncKey,
              authKeyPair: newAuthKeyPair,
              rateLimitResetResult: Promise.resolve(),
              keyShareIndex: 1,
            });

          const recoverPwEncKeySpy = jest
            .spyOn(toprfClient, 'recoverPwEncKey')
            .mockResolvedValueOnce({
              pwEncKey: initialPwEncKey,
            });

          await expect(
            controller.submitGlobalPassword({
              globalPassword: GLOBAL_PASSWORD,
            }),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.CouldNotRecoverPassword,
          );

          expect(recoverEncKeySpy).toHaveBeenCalled();
          expect(recoverPwEncKeySpy).toHaveBeenCalled();
        },
      );
    });
  });

  describe('token refresh functionality', () => {
    const MOCK_PASSWORD = 'mock-password';
    const NEW_MOCK_PASSWORD = 'new-mock-password';

    describe('checkNodeAuthTokenExpired with token refresh', () => {
      it('should return true if the node auth token is expired', async () => {
        await withController(
          {
            state: {
              ...getMockInitialControllerState({
                withMockAuthenticatedUser: true,
              }),
              nodeAuthTokens: [
                {
                  authToken: createMockNodeAuthToken({
                    exp: Date.now() / 1000 - 1000,
                  }),
                  nodeIndex: 0,
                  nodePubKey: 'mock-node-pub-key',
                },
              ],
            },
          },
          async ({ controller }) => {
            const isExpired = controller.checkNodeAuthTokenExpired();
            expect(isExpired).toBe(false);
          },
        );
      });

      it('should return false if the node auth token is not expired', async () => {
        await withController(
          {
            state: {
              ...getMockInitialControllerState({
                withMockAuthenticatedUser: true,
              }),
              nodeAuthTokens: [
                {
                  authToken: createMockNodeAuthToken({
                    exp: Date.now() / 1000 + 1000,
                  }),
                  nodeIndex: 0,
                  nodePubKey: 'mock-node-pub-key',
                },
              ],
            },
          },
          async ({ controller }) => {
            const isExpired = controller.checkNodeAuthTokenExpired();
            expect(isExpired).toBe(false);
          },
        );
      });
    });

    describe('checkIsPasswordOutdated with token refresh', () => {
      it('should retry checkIsPasswordOutdated after refreshing expired tokens', async () => {
        await withController(
          {
            state: {
              ...getMockInitialControllerState({
                withMockAuthenticatedUser: true,
                withMockAuthPubKey: true,
              }),
              nodeAuthTokens: MOCK_NODE_AUTH_TOKENS.map((v) => ({
                ...v,
                authToken: createMockNodeAuthToken({
                  exp: Date.now() / 1000 - 1000,
                }),
              })),
            },
          },
          async ({ controller, toprfClient, mockRefreshJWTToken }) => {
            mockFetchAuthPubKey(
              toprfClient,
              base64ToBytes(controller.state.authPubKey as string),
            );

            jest.spyOn(controller, 'checkNodeAuthTokenExpired').mockRestore();

            // Mock authenticate for token refresh
            jest.spyOn(toprfClient, 'authenticate').mockResolvedValue({
              nodeAuthTokens: MOCK_NODE_AUTH_TOKENS,
              isNewUser: false,
            });

            await controller.checkIsPasswordOutdated();

            expect(mockRefreshJWTToken).toHaveBeenCalled();
          },
        );
      });
    });

    describe('changePassword with token refresh', () => {
      it('should retry changePassword after refreshing expired tokens', async () => {
        await withController(
          {
            state: getMockInitialControllerState({
              withMockAuthenticatedUser: true,
              withMockAuthPubKey: true,
            }),
          },
          async ({ controller, toprfClient, mockRefreshJWTToken }) => {
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

            // Mock the recover enc key
            mockRecoverEncKey(toprfClient, MOCK_PASSWORD);

            // Mock changeEncKey to fail first with token expired error, then succeed
            const mockToprfEncryptor = createMockToprfEncryptor();
            const newEncKey =
              mockToprfEncryptor.deriveEncKey(NEW_MOCK_PASSWORD);
            const newPwEncKey =
              mockToprfEncryptor.derivePwEncKey(NEW_MOCK_PASSWORD);
            const newAuthKeyPair =
              mockToprfEncryptor.deriveAuthKeyPair(NEW_MOCK_PASSWORD);

            jest
              .spyOn(toprfClient, 'changeEncKey')
              .mockImplementationOnce(() => {
                // Mock the recover enc key for second time
                mockRecoverEncKey(toprfClient, NEW_MOCK_PASSWORD);

                // First call fails with token expired error
                throw new TOPRFError(
                  TOPRFErrorCode.AuthTokenExpired,
                  'Auth token expired',
                );
              })
              .mockResolvedValueOnce({
                encKey: newEncKey,
                pwEncKey: newPwEncKey,
                authKeyPair: newAuthKeyPair,
              });

            // Mock authenticate for token refresh
            jest.spyOn(toprfClient, 'authenticate').mockResolvedValue({
              nodeAuthTokens: MOCK_NODE_AUTH_TOKENS,
              isNewUser: false,
            });

            await controller.changePassword(NEW_MOCK_PASSWORD, MOCK_PASSWORD);

            // Verify that getNewRefreshToken was called
            expect(mockRefreshJWTToken).toHaveBeenCalledWith({
              connection: controller.state.authConnection,
              refreshToken,
            });

            // Verify that changeEncKey was called twice (once failed, once succeeded)
            expect(toprfClient.changeEncKey).toHaveBeenCalledTimes(2);

            // Verify that authenticate was called during token refresh
            expect(toprfClient.authenticate).toHaveBeenCalled();
          },
        );
      });

      it('should fail if token refresh fails during changePassword', async () => {
        await withController(
          {
            state: getMockInitialControllerState({
              withMockAuthenticatedUser: true,
              withMockAuthPubKey: true,
            }),
          },
          async ({ controller, toprfClient, mockRefreshJWTToken }) => {
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

            // Mock the recover enc key
            mockRecoverEncKey(toprfClient, MOCK_PASSWORD);

            // Mock changeEncKey to always fail with token expired error
            jest
              .spyOn(toprfClient, 'changeEncKey')
              .mockImplementationOnce(() => {
                throw new TOPRFError(
                  TOPRFErrorCode.AuthTokenExpired,
                  'Auth token expired',
                );
              });

            // Mock getNewRefreshToken to fail
            mockRefreshJWTToken.mockRejectedValueOnce(
              new Error('Failed to get new refresh token'),
            );

            await expect(
              controller.changePassword(NEW_MOCK_PASSWORD, MOCK_PASSWORD),
            ).rejects.toThrow(
              SeedlessOnboardingControllerErrorMessage.FailedToChangePassword,
            );

            // Verify that getNewRefreshToken was called
            expect(mockRefreshJWTToken).toHaveBeenCalled();
          },
        );
      });

      it('should not retry on non-token-related errors during changePassword', async () => {
        await withController(
          {
            state: getMockInitialControllerState({
              withMockAuthenticatedUser: true,
              withMockAuthPubKey: true,
            }),
          },
          async ({ controller, toprfClient, mockRefreshJWTToken }) => {
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

            // Mock the recover enc key
            mockRecoverEncKey(toprfClient, MOCK_PASSWORD);

            // Mock changeEncKey to fail with a non-token error
            jest
              .spyOn(toprfClient, 'changeEncKey')
              .mockRejectedValue(new Error('Some other error'));

            await expect(
              controller.changePassword(NEW_MOCK_PASSWORD, MOCK_PASSWORD),
            ).rejects.toThrow(
              SeedlessOnboardingControllerErrorMessage.FailedToChangePassword,
            );

            // Verify that getNewRefreshToken was NOT called
            expect(mockRefreshJWTToken).not.toHaveBeenCalled();

            // Verify that changeEncKey was only called once (no retry)
            expect(toprfClient.changeEncKey).toHaveBeenCalledTimes(1);
          },
        );
      });
    });

    describe('syncLatestGlobalPassword with token refresh', () => {
      const OLD_PASSWORD = 'old-mock-password';
      const GLOBAL_PASSWORD = 'new-global-password';
      let MOCK_VAULT: string;
      let MOCK_VAULT_ENCRYPTION_KEY: string;
      let MOCK_VAULT_ENCRYPTION_SALT: string;
      let INITIAL_AUTH_PUB_KEY: string;
      let initialAuthKeyPair: KeyPair; // Store initial keypair for vault creation
      let initialEncKey: Uint8Array; // Store initial encKey for vault creation
      let initialPwEncKey: Uint8Array; // Store initial pwEncKey for vault creation

      // Generate initial keys and vault state before tests run
      beforeAll(async () => {
        const mockToprfEncryptor = createMockToprfEncryptor();
        initialEncKey = mockToprfEncryptor.deriveEncKey(OLD_PASSWORD);
        initialPwEncKey = mockToprfEncryptor.derivePwEncKey(OLD_PASSWORD);
        initialAuthKeyPair = mockToprfEncryptor.deriveAuthKeyPair(OLD_PASSWORD);
        INITIAL_AUTH_PUB_KEY = bytesToBase64(initialAuthKeyPair.pk);

        const mockResult = await createMockVault(
          initialEncKey,
          initialPwEncKey,
          initialAuthKeyPair,
          OLD_PASSWORD,
        );

        MOCK_VAULT = mockResult.encryptedMockVault;
        MOCK_VAULT_ENCRYPTION_KEY = mockResult.vaultEncryptionKey;
        MOCK_VAULT_ENCRYPTION_SALT = mockResult.vaultEncryptionSalt;
      });

      it('should retry syncLatestGlobalPassword after refreshing expired tokens', async () => {
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
          async ({
            controller,
            toprfClient,
            encryptor,
            mockRefreshJWTToken,
          }) => {
            // Unlock controller first
            await controller.submitPassword(OLD_PASSWORD);

            const recoverEncKeySpy = jest.spyOn(toprfClient, 'recoverEncKey');
            const encryptorSpy = jest.spyOn(encryptor, 'encryptWithDetail');

            // Mock recoverEncKey for the new global password
            const mockToprfEncryptor = createMockToprfEncryptor();
            const newEncKey = mockToprfEncryptor.deriveEncKey(GLOBAL_PASSWORD);
            const newPwEncKey =
              mockToprfEncryptor.derivePwEncKey(GLOBAL_PASSWORD);
            const newAuthKeyPair =
              mockToprfEncryptor.deriveAuthKeyPair(GLOBAL_PASSWORD);

            // Mock recoverEncKey to fail first with token expired error, then succeed
            recoverEncKeySpy
              .mockImplementationOnce(() => {
                throw new TOPRFError(
                  TOPRFErrorCode.AuthTokenExpired,
                  'Auth token expired',
                );
              })
              .mockResolvedValueOnce({
                encKey: newEncKey,
                pwEncKey: newPwEncKey,
                authKeyPair: newAuthKeyPair,
                rateLimitResetResult: Promise.resolve(),
                keyShareIndex: 1,
              });

            // Mock authenticate for token refresh
            jest.spyOn(toprfClient, 'authenticate').mockResolvedValue({
              nodeAuthTokens: MOCK_NODE_AUTH_TOKENS,
              isNewUser: false,
            });

            await controller.syncLatestGlobalPassword({
              globalPassword: GLOBAL_PASSWORD,
            });

            // Verify that getNewRefreshToken was called
            expect(mockRefreshJWTToken).toHaveBeenCalledWith({
              connection: controller.state.authConnection,
              refreshToken: controller.state.refreshToken,
            });

            // Verify that recoverEncKey was called twice (once failed, once succeeded)
            expect(recoverEncKeySpy).toHaveBeenCalledTimes(2);

            // Verify that authenticate was called during token refresh
            expect(toprfClient.authenticate).toHaveBeenCalled();

            // Check if vault was re-encrypted with the new password and keys
            const expectedSerializedVaultData = JSON.stringify({
              toprfEncryptionKey: bytesToBase64(newEncKey),
              toprfPwEncryptionKey: bytesToBase64(newPwEncKey),
              toprfAuthKeyPair: JSON.stringify({
                sk: bigIntToHex(newAuthKeyPair.sk),
                pk: bytesToBase64(newAuthKeyPair.pk),
              }),
              revokeToken: controller.state.revokeToken,
              accessToken: controller.state.accessToken,
            });
            expect(encryptorSpy).toHaveBeenCalledWith(
              GLOBAL_PASSWORD,
              expectedSerializedVaultData,
            );

            // Check if authPubKey was updated in state
            expect(controller.state.authPubKey).toBe(
              bytesToBase64(newAuthKeyPair.pk),
            );
          },
        );
      });

      it('should fail if token refresh fails during syncLatestGlobalPassword', async () => {
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
          async ({ controller, toprfClient, mockRefreshJWTToken }) => {
            // Unlock controller first
            await controller.submitPassword(OLD_PASSWORD);

            // Mock recoverEncKey to fail with token expired error
            jest
              .spyOn(toprfClient, 'recoverEncKey')
              .mockImplementationOnce(() => {
                throw new TOPRFError(
                  TOPRFErrorCode.AuthTokenExpired,
                  'Auth token expired',
                );
              });

            // Mock getNewRefreshToken to fail
            mockRefreshJWTToken.mockRejectedValueOnce(
              new Error('Failed to get new refresh token'),
            );

            await expect(
              controller.syncLatestGlobalPassword({
                globalPassword: GLOBAL_PASSWORD,
              }),
            ).rejects.toThrow(
              SeedlessOnboardingControllerErrorMessage.AuthenticationError,
            );

            // Verify that getNewRefreshToken was called
            expect(mockRefreshJWTToken).toHaveBeenCalled();
          },
        );
      });

      it('should not retry on non-token-related errors during syncLatestGlobalPassword', async () => {
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
          async ({ controller, toprfClient, mockRefreshJWTToken }) => {
            // Unlock controller first
            await controller.submitPassword(OLD_PASSWORD);

            // Mock recoverEncKey to fail with a non-token error
            jest
              .spyOn(toprfClient, 'recoverEncKey')
              .mockRejectedValue(new Error('Some other error'));

            await expect(
              controller.syncLatestGlobalPassword({
                globalPassword: GLOBAL_PASSWORD,
              }),
            ).rejects.toThrow(
              SeedlessOnboardingControllerErrorMessage.LoginFailedError,
            );

            // Verify that getNewRefreshToken was NOT called
            expect(mockRefreshJWTToken).not.toHaveBeenCalled();

            // Verify that recoverEncKey was only called once (no retry)
            expect(toprfClient.recoverEncKey).toHaveBeenCalledTimes(1);
          },
        );
      });
    });

    describe('addNewSecretData with token refresh', () => {
      const NEW_KEY_RING = {
        id: 'new-keyring-1',
        seedPhrase: stringToBytes('new mock seed phrase 1'),
      };

      it('should retry addNewSecretData after refreshing expired tokens', async () => {
        const mockToprfEncryptor = createMockToprfEncryptor();
        const MOCK_ENCRYPTION_KEY =
          mockToprfEncryptor.deriveEncKey(MOCK_PASSWORD);
        const MOCK_PW_ENCRYPTION_KEY =
          mockToprfEncryptor.derivePwEncKey(MOCK_PASSWORD);
        const MOCK_AUTH_KEY_PAIR =
          mockToprfEncryptor.deriveAuthKeyPair(MOCK_PASSWORD);
        const { encryptedMockVault, vaultEncryptionKey, vaultEncryptionSalt } =
          await createMockVault(
            MOCK_ENCRYPTION_KEY,
            MOCK_PW_ENCRYPTION_KEY,
            MOCK_AUTH_KEY_PAIR,
            MOCK_PASSWORD,
          );

        await withController(
          {
            state: getMockInitialControllerState({
              withMockAuthenticatedUser: true,
              withMockAuthPubKey: true,
              vault: encryptedMockVault,
              vaultEncryptionKey,
              vaultEncryptionSalt,
            }),
          },
          async ({ controller, toprfClient, mockRefreshJWTToken }) => {
            await controller.submitPassword(MOCK_PASSWORD);

            jest
              .spyOn(toprfClient, 'addSecretDataItem')
              .mockImplementationOnce(() => {
                // First call fails with token expired error
                throw new TOPRFError(
                  TOPRFErrorCode.AuthTokenExpired,
                  'Auth token expired',
                );
              })
              .mockResolvedValueOnce();

            // Mock authenticate for token refresh
            jest.spyOn(toprfClient, 'authenticate').mockResolvedValue({
              nodeAuthTokens: MOCK_NODE_AUTH_TOKENS,
              isNewUser: false,
            });

            mockFetchAuthPubKey(
              toprfClient,
              base64ToBytes(controller.state.authPubKey as string),
            );

            await controller.addNewSecretData(
              NEW_KEY_RING.seedPhrase,
              SecretType.Mnemonic,
              {
                keyringId: NEW_KEY_RING.id,
              },
            );

            // Verify that getNewRefreshToken was called
            expect(mockRefreshJWTToken).toHaveBeenCalled();

            // Verify that addSecretDataItem was called twice
            expect(toprfClient.addSecretDataItem).toHaveBeenCalledTimes(2);
          },
        );
      });
    });

    describe('fetchAllSecretData with token refresh', () => {
      it('should retry fetchAllSecretData after refreshing expired tokens', async () => {
        await withController(
          {
            state: getMockInitialControllerState({
              withMockAuthenticatedUser: true,
            }),
          },
          async ({ controller, toprfClient, mockRefreshJWTToken }) => {
            await mockCreateToprfKeyAndBackupSeedPhrase(
              toprfClient,
              controller,
              MOCK_PASSWORD,
              MOCK_SEED_PHRASE,
              MOCK_KEYRING_ID,
            );

            // Mock recoverEncKey
            mockRecoverEncKey(toprfClient, MOCK_PASSWORD);

            jest
              .spyOn(toprfClient, 'fetchAllSecretDataItems')
              .mockImplementationOnce(() => {
                // Mock the recover enc key for second time
                mockRecoverEncKey(toprfClient, MOCK_PASSWORD);
                // First call fails with token expired error
                throw new TOPRFError(
                  TOPRFErrorCode.AuthTokenExpired,
                  'Auth token expired',
                );
              })
              .mockResolvedValueOnce([]);

            // Mock authenticate for token refresh
            jest.spyOn(toprfClient, 'authenticate').mockResolvedValue({
              nodeAuthTokens: MOCK_NODE_AUTH_TOKENS,
              isNewUser: false,
            });

            await controller.submitPassword(MOCK_PASSWORD);

            await expect(
              controller.fetchAllSecretData(MOCK_PASSWORD),
            ).rejects.toThrow(
              SeedlessOnboardingControllerErrorMessage.NoSecretDataFound,
            );

            expect(mockRefreshJWTToken).toHaveBeenCalled();
            expect(toprfClient.fetchAllSecretDataItems).toHaveBeenCalledTimes(
              2,
            );
          },
        );
      });
    });

    describe('createToprfKeyAndBackupSeedPhrase with token refresh', () => {
      it('should retry createToprfKeyAndBackupSeedPhrase after refreshing expired tokens', async () => {
        await withController(
          {
            state: getMockInitialControllerState({
              withMockAuthenticatedUser: true,
            }),
          },
          async ({ controller, toprfClient, mockRefreshJWTToken }) => {
            // Mock createLocalKey
            mockcreateLocalKey(toprfClient, MOCK_PASSWORD);

            // Mock addSecretDataItem
            jest
              .spyOn(toprfClient, 'addSecretDataItem')
              .mockImplementationOnce(() => {
                // First call fails with token expired error
                throw new TOPRFError(
                  TOPRFErrorCode.AuthTokenExpired,
                  'Auth token expired',
                );
              })
              .mockResolvedValueOnce();

            // persist the local enc key
            const persistLocalKeySpy = jest
              .spyOn(toprfClient, 'persistLocalKey')
              .mockResolvedValueOnce();

            // Mock authenticate for token refresh
            const authenticateSpy = jest
              .spyOn(toprfClient, 'authenticate')
              .mockResolvedValueOnce({
                nodeAuthTokens: MOCK_NODE_AUTH_TOKENS,
                isNewUser: false,
              });

            await controller.createToprfKeyAndBackupSeedPhrase(
              MOCK_PASSWORD,
              MOCK_SEED_PHRASE,
              MOCK_KEYRING_ID,
            );

            expect(mockRefreshJWTToken).toHaveBeenCalled();
            expect(authenticateSpy).toHaveBeenCalled();
            // should only call persistLocalKey once after the refresh token
            expect(persistLocalKeySpy).toHaveBeenCalledTimes(1);
          },
        );
      });

      it('should retry createToprfKeyAndBackupSeedPhrase after refreshing expired tokens in persistOprfKey', async () => {
        await withController(
          {
            state: getMockInitialControllerState({
              withMockAuthenticatedUser: true,
            }),
          },
          async ({ controller, toprfClient, mockRefreshJWTToken }) => {
            // Mock createLocalKey
            mockcreateLocalKey(toprfClient, MOCK_PASSWORD);

            // persist the local enc key
            const persistLocalKeySpy = jest
              .spyOn(toprfClient, 'persistLocalKey')
              .mockImplementationOnce(() => {
                // First call fails with token expired error
                throw new TOPRFError(
                  TOPRFErrorCode.AuthTokenExpired,
                  'Auth token expired',
                );
              })
              .mockResolvedValueOnce();

            // Mock addSecretDataItem
            const addSecretDataItemSpy = jest
              .spyOn(toprfClient, 'addSecretDataItem')
              .mockResolvedValue();

            // Mock authenticate for token refresh
            const authenticateSpy = jest
              .spyOn(toprfClient, 'authenticate')
              .mockResolvedValueOnce({
                nodeAuthTokens: MOCK_NODE_AUTH_TOKENS,
                isNewUser: false,
              });

            await controller.createToprfKeyAndBackupSeedPhrase(
              MOCK_PASSWORD,
              MOCK_SEED_PHRASE,
              MOCK_KEYRING_ID,
            );

            expect(mockRefreshJWTToken).toHaveBeenCalled();
            expect(addSecretDataItemSpy).toHaveBeenCalledTimes(1);
            expect(authenticateSpy).toHaveBeenCalled();
            // should call persistLocalKey twice, once for the first call and another from the refresh token
            expect(persistLocalKeySpy).toHaveBeenCalledTimes(2);
          },
        );
      });
    });

    describe('recover keyring encryption key with token refresh', () => {
      // const OLD_PASSWORD = 'old-mock-password';
      // const GLOBAL_PASSWORD = 'new-global-password';
      let MOCK_VAULT: string;
      let MOCK_VAULT_ENCRYPTION_KEY: string;
      let MOCK_VAULT_ENCRYPTION_SALT: string;
      let INITIAL_AUTH_PUB_KEY: string;
      let initialAuthKeyPair: KeyPair; // Store initial keypair for vault creation
      let initialEncKey: Uint8Array; // Store initial encKey for vault creation
      let initialPwEncKey: Uint8Array; // Store initial pwEncKey for vault creation
      let initialEncryptedSeedlessEncryptionKey: Uint8Array; // Store initial encryptedSeedlessEncryptionKey for vault creation
      // Generate initial keys and vault state before tests run
      beforeAll(async () => {
        const mockToprfEncryptor = createMockToprfEncryptor();
        initialEncKey = mockToprfEncryptor.deriveEncKey(MOCK_PASSWORD);
        initialPwEncKey = mockToprfEncryptor.derivePwEncKey(MOCK_PASSWORD);

        initialAuthKeyPair =
          mockToprfEncryptor.deriveAuthKeyPair(MOCK_PASSWORD);
        INITIAL_AUTH_PUB_KEY = bytesToBase64(initialAuthKeyPair.pk);

        const mockResult = await createMockVault(
          initialEncKey,
          initialPwEncKey,
          initialAuthKeyPair,
          MOCK_PASSWORD,
        );

        MOCK_VAULT = mockResult.encryptedMockVault;
        MOCK_VAULT_ENCRYPTION_KEY = mockResult.vaultEncryptionKey;
        MOCK_VAULT_ENCRYPTION_SALT = mockResult.vaultEncryptionSalt;
        const aes = managedNonce(gcm)(mockResult.pwEncKey);
        initialEncryptedSeedlessEncryptionKey = aes.encrypt(
          utf8ToBytes(MOCK_VAULT_ENCRYPTION_KEY),
        );
      });

      it('should retry after refreshing expired tokens', async () => {
        await withController(
          {
            state: getMockInitialControllerState({
              withMockAuthPubKey: true,
              withMockAuthenticatedUser: true,
              authPubKey: INITIAL_AUTH_PUB_KEY,
              vault: MOCK_VAULT,
              vaultEncryptionKey: MOCK_VAULT_ENCRYPTION_KEY,
              vaultEncryptionSalt: MOCK_VAULT_ENCRYPTION_SALT,
              encryptedSeedlessEncryptionKey: bytesToBase64(
                initialEncryptedSeedlessEncryptionKey,
              ),
            }),
          },
          async ({ controller, toprfClient, mockRefreshJWTToken }) => {
            await controller.submitPassword(MOCK_PASSWORD);

            // Mock recoverEncKey
            mockRecoverEncKey(toprfClient, MOCK_PASSWORD);
            // second call after refresh token
            mockRecoverEncKey(toprfClient, MOCK_PASSWORD);

            // Mock recoverPassword
            jest
              .spyOn(toprfClient, 'recoverPwEncKey')
              .mockImplementationOnce(() => {
                // First call fails with token expired error
                throw new TOPRFError(
                  TOPRFErrorCode.AuthTokenExpired,
                  'Auth token expired',
                );
              })
              .mockResolvedValueOnce({
                pwEncKey: initialPwEncKey,
              });

            // Mock authenticate for token refresh
            jest.spyOn(toprfClient, 'authenticate').mockResolvedValueOnce({
              nodeAuthTokens: MOCK_NODE_AUTH_TOKENS,
              isNewUser: false,
            });

            await controller.submitGlobalPassword({
              globalPassword: MOCK_PASSWORD,
            });

            expect(mockRefreshJWTToken).toHaveBeenCalled();
            expect(toprfClient.recoverPwEncKey).toHaveBeenCalledTimes(2);
          },
        );
      });
    });

    describe('refreshAuthTokens', () => {
      it('should successfully refresh node auth tokens', async () => {
        const mockToprfEncryptor = createMockToprfEncryptor();
        const MOCK_ENCRYPTION_KEY =
          mockToprfEncryptor.deriveEncKey(MOCK_PASSWORD);
        const MOCK_PW_ENCRYPTION_KEY =
          mockToprfEncryptor.derivePwEncKey(MOCK_PASSWORD);
        const MOCK_AUTH_KEY_PAIR =
          mockToprfEncryptor.deriveAuthKeyPair(MOCK_PASSWORD);
        const { encryptedMockVault, vaultEncryptionKey, vaultEncryptionSalt } =
          await createMockVault(
            MOCK_ENCRYPTION_KEY,
            MOCK_PW_ENCRYPTION_KEY,
            MOCK_AUTH_KEY_PAIR,
            MOCK_PASSWORD,
          );

        await withController(
          {
            state: getMockInitialControllerState({
              withMockAuthenticatedUser: true,
              vault: encryptedMockVault,
              vaultEncryptionKey,
              vaultEncryptionSalt,
            }),
          },
          async ({ controller, toprfClient, mockRefreshJWTToken }) => {
            await controller.submitPassword(MOCK_PASSWORD);

            // Mock authenticate for token refresh
            jest.spyOn(toprfClient, 'authenticate').mockResolvedValue({
              nodeAuthTokens: [
                {
                  authToken: 'newAuthToken1',
                  nodeIndex: 1,
                  nodePubKey: 'newNodePubKey1',
                },
                {
                  authToken: 'newAuthToken2',
                  nodeIndex: 2,
                  nodePubKey: 'newNodePubKey2',
                },
                {
                  authToken: 'newAuthToken3',
                  nodeIndex: 3,
                  nodePubKey: 'newNodePubKey3',
                },
              ],
              isNewUser: false,
            });

            await controller.refreshAuthTokens();

            expect(mockRefreshJWTToken).toHaveBeenCalledWith({
              connection: controller.state.authConnection,
              refreshToken: controller.state.refreshToken,
            });

            expect(toprfClient.authenticate).toHaveBeenCalledWith({
              authConnectionId: controller.state.authConnectionId,
              userId: controller.state.userId,
              idTokens: ['newIdToken'],
              groupedAuthConnectionId: controller.state.groupedAuthConnectionId,
            });
          },
        );
      });

      it('should throw error if controller not authenticated', async () => {
        await withController(async ({ controller }) => {
          await expect(controller.refreshAuthTokens()).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.MissingAuthUserInfo,
          );
        });
      });

      it('should throw error when token refresh fails', async () => {
        await withController(
          {
            state: getMockInitialControllerState({
              withMockAuthenticatedUser: true,
            }),
          },
          async ({ controller, mockRefreshJWTToken }) => {
            // Mock token refresh to fail
            mockRefreshJWTToken.mockRejectedValueOnce(
              new Error('Refresh failed'),
            );

            // Call refreshAuthTokens and expect it to throw
            await expect(controller.refreshAuthTokens()).rejects.toThrow(
              SeedlessOnboardingControllerErrorMessage.AuthenticationError,
            );

            expect(mockRefreshJWTToken).toHaveBeenCalledTimes(1);
            expect(mockRefreshJWTToken).toHaveBeenCalledWith({
              connection: controller.state.authConnection,
              refreshToken: controller.state.refreshToken,
            });
          },
        );
      });

      it('should throw error when re-authentication fails after token refresh', async () => {
        await withController(
          {
            state: getMockInitialControllerState({
              withMockAuthenticatedUser: true,
            }),
          },
          async ({ controller, mockRefreshJWTToken, toprfClient }) => {
            // Mock token refresh to succeed
            mockRefreshJWTToken.mockResolvedValueOnce({
              idTokens: ['new-token'],
            });

            // Mock authenticate to fail
            jest
              .spyOn(toprfClient, 'authenticate')
              .mockRejectedValueOnce(new Error('Authentication failed'));

            // Call refreshAuthTokens and expect it to throw
            await expect(controller.refreshAuthTokens()).rejects.toThrow(
              SeedlessOnboardingControllerErrorMessage.AuthenticationError,
            );

            expect(mockRefreshJWTToken).toHaveBeenCalledTimes(1);
            expect(toprfClient.authenticate).toHaveBeenCalledTimes(1);
          },
        );
      });
    });
  });

  describe('revokeRefreshToken', () => {
    const MOCK_PASSWORD = 'mock-password';
    const CURRENT_REVOKE_TOKEN = 'current-revoke-token';
    const NEW_REVOKE_TOKEN = 'new-revoke-token';
    const NEW_REFRESH_TOKEN = 'new-refresh-token';
    let MOCK_VAULT: string;
    let MOCK_VAULT_ENCRYPTION_KEY: string;
    let MOCK_VAULT_ENCRYPTION_SALT: string;

    beforeEach(async () => {
      const mockToprfEncryptor = createMockToprfEncryptor();

      const MOCK_ENCRYPTION_KEY =
        mockToprfEncryptor.deriveEncKey(MOCK_PASSWORD);
      const MOCK_PASSWORD_ENCRYPTION_KEY =
        mockToprfEncryptor.derivePwEncKey(MOCK_PASSWORD);
      const MOCK_AUTH_KEY_PAIR =
        mockToprfEncryptor.deriveAuthKeyPair(MOCK_PASSWORD);

      const mockResult = await createMockVault(
        MOCK_ENCRYPTION_KEY,
        MOCK_PASSWORD_ENCRYPTION_KEY,
        MOCK_AUTH_KEY_PAIR,
        MOCK_PASSWORD,
        CURRENT_REVOKE_TOKEN,
      );

      MOCK_VAULT = mockResult.encryptedMockVault;
      MOCK_VAULT_ENCRYPTION_KEY = mockResult.vaultEncryptionKey;
      MOCK_VAULT_ENCRYPTION_SALT = mockResult.vaultEncryptionSalt;
    });

    it('should successfully revoke refresh token and update vault', async () => {
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
        async ({ controller, mockRevokeRefreshToken, encryptor }) => {
          // Mock the revokeRefreshToken to return new tokens
          mockRevokeRefreshToken.mockResolvedValueOnce({
            newRevokeToken: NEW_REVOKE_TOKEN,
            newRefreshToken: NEW_REFRESH_TOKEN,
          });

          const encryptorSpy = jest.spyOn(encryptor, 'encryptWithDetail');

          await controller.revokeRefreshToken(MOCK_PASSWORD);

          // Verify that revokeRefreshToken was called with correct parameters
          expect(mockRevokeRefreshToken).toHaveBeenCalledWith({
            connection: controller.state.authConnection,
            revokeToken: CURRENT_REVOKE_TOKEN,
          });

          // Verify that the vault was updated with new serialized data
          expect(encryptorSpy).toHaveBeenCalled();

          // Verify that state was updated with new tokens
          expect(controller.state.revokeToken).toBe(NEW_REVOKE_TOKEN);
          expect(controller.state.refreshToken).toBe(NEW_REFRESH_TOKEN);
        },
      );
    });

    it('should throw error if revoke token is missing from vault', async () => {
      const mockToprfEncryptor = createMockToprfEncryptor();
      const MOCK_ENCRYPTION_KEY =
        mockToprfEncryptor.deriveEncKey(MOCK_PASSWORD);
      const MOCK_PASSWORD_ENCRYPTION_KEY =
        mockToprfEncryptor.derivePwEncKey(MOCK_PASSWORD);
      const MOCK_AUTH_KEY_PAIR =
        mockToprfEncryptor.deriveAuthKeyPair(MOCK_PASSWORD);

      // Create vault data without revoke token manually
      const encryptor = createMockVaultEncryptor();
      const serializedKeyData = JSON.stringify({
        toprfEncryptionKey: bytesToBase64(MOCK_ENCRYPTION_KEY),
        toprfPwEncryptionKey: bytesToBase64(MOCK_PASSWORD_ENCRYPTION_KEY),
        toprfAuthKeyPair: JSON.stringify({
          sk: `0x${MOCK_AUTH_KEY_PAIR.sk.toString(16)}`,
          pk: bytesToBase64(MOCK_AUTH_KEY_PAIR.pk),
        }),
        // Intentionally omit revokeToken
        accessToken,
      });

      const { vault: encryptedMockVault, exportedKeyString } =
        await encryptor.encryptWithDetail(MOCK_PASSWORD, serializedKeyData);

      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            withMockAuthPubKey: true,
            vault: encryptedMockVault,
            vaultEncryptionKey: exportedKeyString,
            vaultEncryptionSalt: JSON.parse(encryptedMockVault).salt,
          }),
        },
        async ({ controller }) => {
          await expect(
            controller.revokeRefreshToken(MOCK_PASSWORD),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.InvalidRevokeToken,
          );
        },
      );
    });

    it('should throw error if revokeRefreshToken fails', async () => {
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
        async ({ controller, mockRevokeRefreshToken }) => {
          // Mock revokeRefreshToken to fail
          mockRevokeRefreshToken.mockRejectedValueOnce(
            new Error('Failed to revoke refresh token'),
          );

          await expect(
            controller.revokeRefreshToken(MOCK_PASSWORD),
          ).rejects.toThrow('Failed to revoke refresh token');

          expect(mockRevokeRefreshToken).toHaveBeenCalledWith({
            connection: controller.state.authConnection,
            revokeToken: CURRENT_REVOKE_TOKEN,
          });
        },
      );
    });
    it('should throw error if vault unlock fails', async () => {
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
        async ({ controller, encryptor }) => {
          // Mock vault decryption to fail
          jest
            .spyOn(encryptor, 'decryptWithKey')
            .mockRejectedValueOnce(new Error('Failed to decrypt vault'));

          await expect(
            controller.revokeRefreshToken(MOCK_PASSWORD),
          ).rejects.toThrow('Failed to decrypt vault');
        },
      );
    });
    it('should throw error if vault update fails', async () => {
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
        async ({ controller, mockRevokeRefreshToken, encryptor }) => {
          // Mock revokeRefreshToken to succeed
          mockRevokeRefreshToken.mockResolvedValueOnce({
            newRevokeToken: NEW_REVOKE_TOKEN,
            newRefreshToken: NEW_REFRESH_TOKEN,
          });

          // Mock vault encryption to fail during update
          jest
            .spyOn(encryptor, 'encryptWithDetail')
            .mockRejectedValueOnce(new Error('Failed to encrypt vault'));

          await expect(
            controller.revokeRefreshToken(MOCK_PASSWORD),
          ).rejects.toThrow('Failed to encrypt vault');

          expect(mockRevokeRefreshToken).toHaveBeenCalled();
        },
      );
    });
  });

  describe('fetchMetadataAccessCreds', () => {
    const createMockJWTToken = (exp: number) => {
      const payload = { exp };
      const encodedPayload = btoa(JSON.stringify(payload));
      return `header.${encodedPayload}.signature`;
    };

    it('should return the current metadata access token if not expired', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const validToken = createMockJWTToken(futureExp);

      const { messenger } = mockSeedlessOnboardingMessenger();
      const controller = new SeedlessOnboardingController({
        messenger,
        encryptor: createMockVaultEncryptor(),
        refreshJWTToken: jest.fn(),
        revokeRefreshToken: jest.fn(),
        state: getMockInitialControllerState({
          withMockAuthenticatedUser: true,
          metadataAccessToken: validToken,
        }),
      });

      const result = await controller.fetchMetadataAccessCreds();

      expect(result).toStrictEqual({
        metadataAccessToken: validToken,
      });
    });

    it('should throw error if metadataAccessToken is missing', async () => {
      const { messenger } = mockSeedlessOnboardingMessenger();
      const state = getMockInitialControllerState({
        withMockAuthenticatedUser: true,
      });
      delete state.metadataAccessToken;
      const controller = new SeedlessOnboardingController({
        messenger,
        encryptor: createMockVaultEncryptor(),
        refreshJWTToken: jest.fn(),
        revokeRefreshToken: jest.fn(),
        state,
      });

      await expect(controller.fetchMetadataAccessCreds()).rejects.toThrow(
        SeedlessOnboardingControllerErrorMessage.InvalidMetadataAccessToken,
      );
    });

    it('should call refreshAuthTokens if metadataAccessToken is expired', async () => {
      const pastExp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const expiredToken = createMockJWTToken(pastExp);
      const { messenger } = mockSeedlessOnboardingMessenger();
      const controller = new SeedlessOnboardingController({
        messenger,
        encryptor: createMockVaultEncryptor(),
        refreshJWTToken: jest.fn(),
        revokeRefreshToken: jest.fn(),
        state: getMockInitialControllerState({
          withMockAuthenticatedUser: true,
          metadataAccessToken: expiredToken,
        }),
      });

      // mock refreshAuthTokens to return a new token
      jest.spyOn(controller, 'refreshAuthTokens').mockResolvedValue();

      await controller.fetchMetadataAccessCreds();

      expect(controller.refreshAuthTokens).toHaveBeenCalled();
    });
  });

  describe('checkMetadataAccessTokenExpired', () => {
    const createMockJWTToken = (exp: number) => {
      const payload = { exp };
      const encodedPayload = btoa(JSON.stringify(payload));
      return `header.${encodedPayload}.signature`;
    };

    it('should return false if metadata access token is not expired', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const validToken = createMockJWTToken(futureExp);

      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            metadataAccessToken: validToken,
          }),
        },
        async ({ controller }) => {
          // Restore the original implementation to test the real logic
          jest
            .spyOn(controller, 'checkMetadataAccessTokenExpired')
            .mockRestore();

          const result = controller.checkMetadataAccessTokenExpired();
          expect(result).toBe(false);
        },
      );
    });

    it('should return true if metadata access token is expired', async () => {
      const pastExp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const expiredToken = createMockJWTToken(pastExp);

      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            metadataAccessToken: expiredToken,
          }),
        },
        async ({ controller }) => {
          // Restore the original implementation to test the real logic
          jest
            .spyOn(controller, 'checkMetadataAccessTokenExpired')
            .mockRestore();

          const result = controller.checkMetadataAccessTokenExpired();
          expect(result).toBe(true);
        },
      );
    });

    it('should return true if user is not authenticated', async () => {
      await withController(async ({ controller }) => {
        // Restore the original implementation to test the real logic
        jest.spyOn(controller, 'checkMetadataAccessTokenExpired').mockRestore();

        const result = controller.checkMetadataAccessTokenExpired();
        expect(result).toBe(true);
      });
    });

    it('should return true if token has invalid format', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            metadataAccessToken: 'invalid.token.format',
          }),
        },
        async ({ controller }) => {
          // Restore the original implementation to test the real logic
          jest
            .spyOn(controller, 'checkMetadataAccessTokenExpired')
            .mockRestore();

          const result = controller.checkMetadataAccessTokenExpired();
          expect(result).toBe(true);
        },
      );
    });
  });

  describe('checkAccessTokenExpired', () => {
    const createMockJWTToken = (exp: number) => {
      const payload = { exp };
      const encodedPayload = btoa(JSON.stringify(payload));
      return `header.${encodedPayload}.signature`;
    };

    it('should return false if access token is not expired', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const validToken = createMockJWTToken(futureExp);

      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            accessToken: validToken,
          }),
        },
        async ({ controller }) => {
          // Restore the original implementation to test the real logic
          jest.spyOn(controller, 'checkAccessTokenExpired').mockRestore();

          const result = controller.checkAccessTokenExpired();
          expect(result).toBe(false);
        },
      );
    });

    it('should return true if access token is expired', async () => {
      const pastExp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const expiredToken = createMockJWTToken(pastExp);

      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            accessToken: expiredToken,
          }),
        },
        async ({ controller }) => {
          // Restore the original implementation to test the real logic
          jest.spyOn(controller, 'checkAccessTokenExpired').mockRestore();

          const result = controller.checkAccessTokenExpired();
          expect(result).toBe(true);
        },
      );
    });

    it('should return true if access token is missing', async () => {
      const state = getMockInitialControllerState({
        withMockAuthenticatedUser: true,
      });
      delete state.accessToken;
      await withController(
        {
          state,
        },
        async ({ controller }) => {
          // Restore the original implementation to test the real logic
          jest.spyOn(controller, 'checkAccessTokenExpired').mockRestore();

          const result = controller.checkAccessTokenExpired();
          expect(result).toBe(true);
        },
      );
    });

    it('should return true if user is not authenticated', async () => {
      await withController(async ({ controller }) => {
        // Restore the original implementation to test the real logic
        jest.spyOn(controller, 'checkAccessTokenExpired').mockRestore();

        const result = controller.checkAccessTokenExpired();
        expect(result).toBe(true);
      });
    });

    it('should return true if token has invalid format', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            metadataAccessToken: 'invalid.token.format',
          }),
        },
        async ({ controller }) => {
          // Restore the original implementation to test the real logic
          jest.spyOn(controller, 'checkAccessTokenExpired').mockRestore();

          const result = controller.checkAccessTokenExpired();
          expect(result).toBe(true);
        },
      );
    });
  });

  describe('#getAccessToken', () => {
    const MOCK_PASSWORD = 'mock-password';

    it('should retrieve the access token from the vault if it is not available in the state', async () => {
      const mockToprfEncryptor = createMockToprfEncryptor();
      const MOCK_ENCRYPTION_KEY =
        mockToprfEncryptor.deriveEncKey(MOCK_PASSWORD);
      const MOCK_PASSWORD_ENCRYPTION_KEY =
        mockToprfEncryptor.derivePwEncKey(MOCK_PASSWORD);
      const MOCK_AUTH_KEY_PAIR =
        mockToprfEncryptor.deriveAuthKeyPair(MOCK_PASSWORD);

      const mockResult = await createMockVault(
        MOCK_ENCRYPTION_KEY,
        MOCK_PASSWORD_ENCRYPTION_KEY,
        MOCK_AUTH_KEY_PAIR,
        MOCK_PASSWORD,
      );

      const MOCK_VAULT = mockResult.encryptedMockVault;
      const MOCK_VAULT_ENCRYPTION_KEY = mockResult.vaultEncryptionKey;
      const MOCK_VAULT_ENCRYPTION_SALT = mockResult.vaultEncryptionSalt;

      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            withoutMockAccessToken: true,
            vault: MOCK_VAULT,
            vaultEncryptionKey: MOCK_VAULT_ENCRYPTION_KEY,
            vaultEncryptionSalt: MOCK_VAULT_ENCRYPTION_SALT,
          }),
        },
        async ({ controller, toprfClient }) => {
          // fetch and decrypt the secret data
          mockRecoverEncKey(toprfClient, MOCK_PASSWORD);

          const mockSecretDataGet = handleMockSecretDataGet({
            status: 200,
            body: createMockSecretDataGetResponse(
              [
                {
                  data: MOCK_SEED_PHRASE,
                  type: SecretType.Mnemonic,
                },
                {
                  data: MOCK_PRIVATE_KEY,
                  type: SecretType.PrivateKey,
                },
              ],
              MOCK_PASSWORD,
            ),
          });

          const secretData = await controller.fetchAllSecretData(MOCK_PASSWORD);
          expect(secretData).toBeDefined();
          expect(secretData).toHaveLength(2);
          expect(secretData[0].type).toStrictEqual(SecretType.Mnemonic);
          expect(secretData[0].data).toStrictEqual(MOCK_SEED_PHRASE);
          expect(secretData[1].type).toStrictEqual(SecretType.PrivateKey);
          expect(secretData[1].data).toStrictEqual(MOCK_PRIVATE_KEY);

          expect(mockSecretDataGet.isDone()).toBe(true);
        },
      );
    });

    it('should throw error if access token is not available either in the state or the vault', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            withoutMockAccessToken: true,
          }),
        },
        async ({ controller, toprfClient }) => {
          // fetch and decrypt the secret data
          mockRecoverEncKey(toprfClient, MOCK_PASSWORD);

          const mockSecretDataGet = handleMockSecretDataGet({
            status: 200,
            body: createMockSecretDataGetResponse(
              [
                {
                  data: MOCK_SEED_PHRASE,
                  type: SecretType.Mnemonic,
                },
                {
                  data: MOCK_PRIVATE_KEY,
                  type: SecretType.PrivateKey,
                },
              ],
              MOCK_PASSWORD,
            ),
          });

          await expect(
            controller.fetchAllSecretData(MOCK_PASSWORD),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.InvalidAccessToken,
          );

          expect(mockSecretDataGet.isDone()).toBe(true);
        },
      );
    });
  });
});
