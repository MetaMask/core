import { keccak256AndHexify } from '@metamask/auth-network-utils';
import { deriveStateFromMetadata } from '@metamask/base-controller';
import type {
  EncryptionKey,
  KeyDerivationOptions,
} from '@metamask/browser-passworder';
import {
  encrypt,
  decrypt,
  decryptWithDetail,
  encryptWithDetail,
  decryptWithKey as decryptWithKeyBrowserPassworder,
  importKey as importKeyBrowserPassworder,
  exportKey as exportKeyBrowserPassworder,
  generateSalt as generateSaltBrowserPassworder,
  keyFromPassword as keyFromPasswordBrowserPassworder,
} from '@metamask/browser-passworder';
import {
  EncAccountDataType,
  TOPRFError,
  TOPRFErrorCode,
} from '@metamask/toprf-secure-backup';
import type {
  FetchAuthPubKeyResult,
  SEC1EncodedPublicKey,
  ChangeEncryptionKeyResult,
  KeyPair,
  RecoverEncryptionKeyResult,
  ToprfSecureBackup,
} from '@metamask/toprf-secure-backup';
import {
  base64ToBytes,
  bytesToBase64,
  bytesToString,
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
  SeedlessOnboardingMigrationVersion,
  AuthConnection,
  SecretType,
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
  MockKeyringControllerMessenger,
  RootMessenger,
} from '../tests/__fixtures__/mockMessenger';
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
const STRING_MOCK_SEED_PHRASE =
  'horror pink muffin canal young photo magnet runway start elder patch until';
const MOCK_SEED_PHRASE = stringToBytes(STRING_MOCK_SEED_PHRASE);
const STRING_MOCK_PRIVATE_KEY = '0xdeadbeef';
const MOCK_PRIVATE_KEY = stringToBytes(STRING_MOCK_PRIVATE_KEY);

const MOCK_AUTH_PUB_KEY = 'A09CwPHdl/qo2AjBOHen5d4QORaLedxOrSdgReq8IhzQ';
const MOCK_AUTH_PUB_KEY_OUTDATED =
  'Ao2sa8imX7SD4KE4fJLoJ/iBufmaBxSFygG1qUhW2qAb';

type WithControllerCallback<ReturnValue, EKey, SupportedKeyDerivationOptions> =
  ({
    controller,
    initialState,
    encryptor,
    messenger,
  }: {
    controller: SeedlessOnboardingController<
      EKey,
      SupportedKeyDerivationOptions
    >;
    encryptor: VaultEncryptor<EKey, SupportedKeyDerivationOptions>;
    initialState: SeedlessOnboardingControllerState;
    messenger: SeedlessOnboardingControllerMessenger;
    baseMessenger: RootMessenger;
    keyringControllerMessenger: MockKeyringControllerMessenger;
    toprfClient: ToprfSecureBackup;
    mockRefreshJWTToken: jest.Mock;
    mockRevokeRefreshToken: jest.Mock;
    mockRenewRefreshToken: jest.Mock;
  }) => Promise<ReturnValue> | ReturnValue;

type WithControllerOptions<EKey, SupportedKeyDerivationParams> = Partial<
  SeedlessOnboardingControllerOptions<EKey, SupportedKeyDerivationParams>
>;

type WithControllerArgs<ReturnValue, EKey, SupportedKeyDerivationParams> =
  | [WithControllerCallback<ReturnValue, EKey, SupportedKeyDerivationParams>]
  | [
      WithControllerOptions<EKey, SupportedKeyDerivationParams>,
      WithControllerCallback<ReturnValue, EKey, SupportedKeyDerivationParams>,
    ];

/**
 * Get the default vault encryptor for the Seedless Onboarding Controller.
 *
 * By default, we'll use the encryption utilities from `@metamask/browser-passworder`.
 *
 * @returns The default vault encryptor for the Seedless Onboarding Controller.
 */
function getDefaultSeedlessOnboardingVaultEncryptor(): VaultEncryptor<
  EncryptionKey | webcrypto.CryptoKey,
  KeyDerivationOptions
> {
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
    exportKey: exportKeyBrowserPassworder,
    generateSalt: generateSaltBrowserPassworder,
    keyFromPassword: keyFromPasswordBrowserPassworder,
  };
}

/**
 * Builds a mock encryptor for the vault.
 *
 * @returns The mock encryptor.
 */
function createMockVaultEncryptor(): MockVaultEncryptor {
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
  ...args: WithControllerArgs<
    ReturnValue,
    EncryptionKey | webcrypto.CryptoKey,
    KeyDerivationOptions
  >
): Promise<ReturnValue> {
  const [{ ...rest }, fn] = args.length === 2 ? args : [{}, args[0]];
  const encryptor = new MockVaultEncryptor();
  const { messenger, baseMessenger, keyringControllerMessenger } =
    mockSeedlessOnboardingMessenger();

  const mockRefreshJWTToken = jest.fn().mockResolvedValue({
    idTokens: ['newIdToken'],
    metadataAccessToken: 'mock-metadata-access-token',
    accessToken,
  });
  const mockRevokeRefreshToken = jest.fn().mockResolvedValue(undefined);
  const mockRenewRefreshToken = jest.fn().mockResolvedValue({
    newRevokeToken: 'newRevokeToken',
    newRefreshToken: 'newRefreshToken',
  });

  // In the withController function, before creating the controller:
  const originalFetchMetadataAccessCreds =
    // eslint-disable-next-line jest/unbound-method -- testing mock
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
    renewRefreshToken: mockRenewRefreshToken,
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
    keyringControllerMessenger,
    toprfClient,
    mockRefreshJWTToken,
    mockRevokeRefreshToken,
    mockRenewRefreshToken,
  });
}

/**
 * Builds a mock ToprfEncryptor.
 *
 * @returns The mock ToprfEncryptor.
 */
function createMockToprfEncryptor(): MockToprfEncryptorDecryptor {
  return new MockToprfEncryptorDecryptor();
}

/**
 * Creates a mock node auth token.
 *
 * @param params - The parameters for the mock node auth token.
 * @param params.exp - The expiration time of the node auth token.
 * @returns The mock node auth token.
 */
function createMockNodeAuthToken(params: { exp: number }): string {
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
function mockcreateLocalKey(
  toprfClient: ToprfSecureBackup,
  password: string,
): {
  encKey: Uint8Array;
  pwEncKey: Uint8Array;
  authKeyPair: KeyPair;
  oprfKey: bigint;
  seed: Uint8Array;
  createLocalKeySpy: jest.SpyInstance;
} {
  const mockToprfEncryptor = createMockToprfEncryptor();

  const encKey = mockToprfEncryptor.deriveEncKey(password);
  const pwEncKey = mockToprfEncryptor.derivePwEncKey(password);
  const authKeyPair = mockToprfEncryptor.deriveAuthKeyPair(password);
  const oprfKey = BigInt(0);
  const seed = stringToBytes(password);

  const createLocalKeySpy = jest
    .spyOn(toprfClient, 'createLocalKey')
    .mockResolvedValueOnce({
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
    createLocalKeySpy,
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
 * @param options - Mock options
 * @param options.mockRejectOnceWithTokenError - Whether to mock the recoverEncKey method to reject with a token error.
 * @returns The mock recoverEncKey result.
 */
function mockRecoverEncKey(
  toprfClient: ToprfSecureBackup,
  password: string,
  options?: {
    mockRejectOnceWithTokenError?: unknown;
  },
): RecoverEncryptionKeyResult & { recoverEncKeySpy: jest.SpyInstance } {
  const mockToprfEncryptor = createMockToprfEncryptor();

  const encKey = mockToprfEncryptor.deriveEncKey(password);
  const pwEncKey = mockToprfEncryptor.derivePwEncKey(password);
  const authKeyPair = mockToprfEncryptor.deriveAuthKeyPair(password);
  const rateLimitResetResult = Promise.resolve();

  let recoverEncKeySpy: jest.SpyInstance;

  if (options?.mockRejectOnceWithTokenError) {
    recoverEncKeySpy = jest
      .spyOn(toprfClient, 'recoverEncKey')
      .mockRejectedValueOnce(
        new TOPRFError(TOPRFErrorCode.AuthTokenExpired, 'Auth token expired'),
      )
      .mockResolvedValueOnce({
        encKey,
        pwEncKey,
        authKeyPair,
        rateLimitResetResult,
        keyShareIndex: 1,
      });
  } else {
    recoverEncKeySpy = jest
      .spyOn(toprfClient, 'recoverEncKey')
      .mockResolvedValueOnce({
        encKey,
        pwEncKey,
        authKeyPair,
        rateLimitResetResult,
        keyShareIndex: 1,
      });
  }

  return {
    encKey,
    pwEncKey,
    authKeyPair,
    rateLimitResetResult,
    keyShareIndex: 1,
    recoverEncKeySpy,
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
): Promise<void> {
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
async function mockCreateToprfKeyAndBackupSeedPhrase<
  EKey,
  SupportedKeyDerivationParams,
>(
  toprfClient: ToprfSecureBackup,
  controller: SeedlessOnboardingController<EKey, SupportedKeyDerivationParams>,
  password: string,
  seedPhrase: Uint8Array,
  keyringId: string,
): Promise<void> {
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
  // eslint-disable-next-line @typescript-eslint/naming-convention
  MOCK_PASSWORD: string,
  mockRevokeToken: string = revokeToken,
  mockAccessToken: string = accessToken,
): Promise<{
  encryptedMockVault: string;
  vaultEncryptionKey: string;
  vaultEncryptionSalt: string;
  revokeToken: string;
  accessToken: string;
  encryptedKeyringEncryptionKey: Uint8Array;
  pwEncKey: Uint8Array;
}> {
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
async function decryptVault(
  vault: string,
  password: string,
): Promise<{
  toprfEncryptionKey: Uint8Array;
  toprfAuthKeyPair: KeyPair;
}> {
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
 * @param options.pendingToBeRevokedTokens - The mock pending to be revoked tokens.
 * @param options.migrationVersion - The mock migration version.
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
  pendingToBeRevokedTokens?:
    | {
        refreshToken: string;
        revokeToken: string;
      }[]
    | undefined;
  migrationVersion?: number;
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
    if (options?.pendingToBeRevokedTokens !== undefined) {
      state.pendingToBeRevokedTokens = options.pendingToBeRevokedTokens;
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

  if (options?.migrationVersion !== undefined) {
    state.migrationVersion = options.migrationVersion;
  }

  return state;
}

describe('SeedlessOnboardingController', () => {
  describe('constructor', () => {
    it('should be able to instantiate', () => {
      const mockRefreshJWTToken = jest.fn().mockResolvedValue({
        idTokens: ['newIdToken'],
      });
      const mockRevokeRefreshToken = jest.fn().mockResolvedValue(undefined);
      const mockRenewRefreshToken = jest.fn().mockResolvedValue({
        newRevokeToken: 'newRevokeToken',
        newRefreshToken: 'newRefreshToken',
      });
      const { messenger } = mockSeedlessOnboardingMessenger();
      const controller = new SeedlessOnboardingController({
        messenger,
        encryptor: getDefaultSeedlessOnboardingVaultEncryptor(),
        refreshJWTToken: mockRefreshJWTToken,
        revokeRefreshToken: mockRevokeRefreshToken,
        renewRefreshToken: mockRenewRefreshToken,
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
      const mockRevokeRefreshToken = jest.fn().mockResolvedValue(undefined);
      const mockRenewRefreshToken = jest.fn().mockResolvedValue({
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
            renewRefreshToken: mockRenewRefreshToken,
          }),
      ).not.toThrow();
    });

    it('should be able to instantiate with a toprfKeyDeriver', async () => {
      const deriveKeySpy = jest.fn();
      const MOCK_PASSWORD = 'mock-password';

      const keyDeriver = {
        deriveKey: (
          seed: Uint8Array,
          salt: Uint8Array,
        ): Promise<Uint8Array> => {
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
      const mockRevokeRefreshToken = jest.fn().mockResolvedValue(undefined);
      const mockRenewRefreshToken = jest.fn().mockResolvedValue({
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
        renewRefreshToken: mockRenewRefreshToken,
        state: initialState,
      });
      expect(controller).toBeDefined();
      expect(controller.state).toMatchObject(initialState);
    });

    it('should throw an error if the password outdated cache TTL is not a valid number', () => {
      const mockRefreshJWTToken = jest.fn().mockResolvedValue({
        idTokens: ['newIdToken'],
      });
      const mockRevokeRefreshToken = jest.fn().mockResolvedValue(undefined);
      const mockRenewRefreshToken = jest.fn().mockResolvedValue({
        newRevokeToken: 'newRevokeToken',
        newRefreshToken: 'newRefreshToken',
      });
      const { messenger } = mockSeedlessOnboardingMessenger();

      expect(() => {
        // eslint-disable-next-line no-new -- for testing
        new SeedlessOnboardingController({
          messenger,
          refreshJWTToken: mockRefreshJWTToken,
          revokeRefreshToken: mockRevokeRefreshToken,
          renewRefreshToken: mockRenewRefreshToken,
          // @ts-expect-error - test invalid password outdated cache TTL
          passwordOutdatedCacheTTL: 'Invalid Value',
        });
      }).toThrow(
        SeedlessOnboardingControllerErrorMessage.InvalidPasswordOutdatedCache,
      );
    });
  });

  describe('fetchNodeDetails', () => {
    it('should be able to fetch the node details', async () => {
      await withController(async ({ controller, toprfClient }) => {
        const getNodeDetailsSpy = jest
          .spyOn(toprfClient, 'getNodeDetails')
          .mockResolvedValue({
            // @ts-expect-error - test node details
            nodeDetails: [],
          });

        await controller.preloadToprfNodeDetails();

        expect(getNodeDetailsSpy).toHaveBeenCalled();
      });
    });

    it('should not throw an error if the node details fetch fails', async () => {
      await withController(async ({ controller, toprfClient }) => {
        const getNodeDetailsSpy = jest
          .spyOn(toprfClient, 'getNodeDetails')
          .mockRejectedValueOnce(new Error('Failed to fetch node details'));
        await controller.preloadToprfNodeDetails();
        expect(getNodeDetailsSpy).toHaveBeenCalled();
      });
    });
  });

  describe('authenticate', () => {
    it('should be able to register a new user', async () => {
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
          isNewUser: false,
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
          revokeToken,
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

  describe('checkIsSeedlessOnboardingUserAuthenticated', () => {
    it('should return true if the user is authenticated', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller }) => {
          expect(await controller.getIsUserAuthenticated()).toBe(true);
        },
      );
    });

    it('should return false if the user is not authenticated (accessToken is missing)', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            withoutMockAccessToken: true, // missing accessToken
          }),
        },
        async ({ controller }) => {
          expect(await controller.getIsUserAuthenticated()).toBe(false);
        },
      );
    });

    it('should return false if the user is not authenticated (revokeToken is missing)', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            withoutMockRevokeToken: true, // missing revokeToken
          }),
        },
        async ({ controller }) => {
          expect(await controller.getIsUserAuthenticated()).toBe(false);
        },
      );
    });

    it('should return false if the user is not authenticated (social login details are missing)', async () => {
      await withController(async ({ controller }) => {
        expect(await controller.getIsUserAuthenticated()).toBe(false);
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

          expect(controller.state.migrationVersion).toBe(
            SeedlessOnboardingMigrationVersion.V1,
          );
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

    it('should refresh token and create new seed phrase backup in case of token errors', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller, toprfClient, initialState, encryptor }) => {
          const { encKey, pwEncKey, authKeyPair, createLocalKeySpy } =
            mockcreateLocalKey(toprfClient, MOCK_PASSWORD);

          // persist the local enc key
          const persistLocalKeySpy = jest
            .spyOn(toprfClient, 'persistLocalKey')
            .mockRejectedValueOnce(
              new TOPRFError(
                TOPRFErrorCode.InvalidAuthToken,
                'Invalid auth token',
              ),
            ) // first call fails with invalid auth token error
            .mockResolvedValueOnce();
          // encrypt and store the secret data
          const mockSecretDataAdd = handleMockSecretDataAdd();

          const authenticateSpy = jest
            .spyOn(toprfClient, 'authenticate')
            .mockResolvedValue({
              nodeAuthTokens: MOCK_NODE_AUTH_TOKENS,
              isNewUser: false,
            });

          await controller.createToprfKeyAndBackupSeedPhrase(
            MOCK_PASSWORD,
            MOCK_SEED_PHRASE,
            MOCK_KEYRING_ID,
          );

          expect(mockSecretDataAdd.isDone()).toBe(true);

          // should call persistLocalKey twice and authenticate once
          expect(persistLocalKeySpy).toHaveBeenCalledTimes(2); // should call persistLocalKey twice for the first fail attempt due to invalid auth token error and the second attempt succeeds
          expect(authenticateSpy).toHaveBeenCalledTimes(1); // should call authenticate once for the token refresh
          expect(createLocalKeySpy).toHaveBeenCalledTimes(1); // should call createLocalKey only once coz the local toprf key creation should not be affected by token errors

          expect(controller.state.vault).toBeDefined();
          expect(controller.state.vault).not.toBe(initialState.vault);
          expect(controller.state.vault).not.toStrictEqual({});

          // verify the vault data
          const { encryptedMockVault } = await createMockVault(
            encKey,
            pwEncKey,
            authKeyPair,
            MOCK_PASSWORD,
            controller.state.revokeToken,
          );

          const expectedVaultValue = await encryptor.decrypt(
            MOCK_PASSWORD,
            encryptedMockVault,
          );
          const resultedVaultValue = await encryptor.decrypt(
            MOCK_PASSWORD,
            controller.state.vault as string,
          );

          expect(resultedVaultValue).toStrictEqual(expectedVaultValue);

          // should be able to get the hash of the seed phrase backup from the state
          expect(
            controller.getSecretDataBackupState(MOCK_SEED_PHRASE),
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

    it('should throw error if revokeToken is missing when creating new vault', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            withMockAuthPubKey: true,
            withoutMockRevokeToken: true,
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
            SeedlessOnboardingControllerErrorMessage.InvalidRevokeToken,
          );
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
            EncAccountDataType.ImportedSrp,
            {
              keyringId: NEW_KEY_RING_1.id,
            },
          ),
        ).rejects.toThrow(
          SeedlessOnboardingControllerErrorMessage.ControllerLocked,
        );
      });
    });

    it('should throw an error if PrimarySrp dataType is passed', async () => {
      await withController(async ({ controller }) => {
        await expect(
          controller.addNewSecretData(
            NEW_KEY_RING_1.seedPhrase,
            EncAccountDataType.PrimarySrp,
            {
              keyringId: NEW_KEY_RING_1.id,
            },
          ),
        ).rejects.toThrow(
          SeedlessOnboardingControllerErrorMessage.PrimarySrpCannotBeAddedViaAddNewSecretData,
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
            EncAccountDataType.ImportedSrp,
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
            EncAccountDataType.ImportedSrp,
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
            EncAccountDataType.ImportedSrp,
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
            EncAccountDataType.ImportedPrivateKey,
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
              EncAccountDataType.ImportedSrp,
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
            controller.addNewSecretData(
              MOCK_SEED_PHRASE,
              EncAccountDataType.ImportedSrp,
            ),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.MissingKeyringId,
          );
        },
      );
    });
  });

  describe('runMigrations', () => {
    const MOCK_PASSWORD = 'mock-password';
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

    it('should throw error if controller is locked', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller }) => {
          await expect(controller.runMigrations()).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.ControllerLocked,
          );
        },
      );
    });

    it('should skip migration if migration version is already at latest', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            withMockAuthPubKey: true,
            vault: MOCK_VAULT,
            vaultEncryptionKey: MOCK_VAULT_ENCRYPTION_KEY,
            vaultEncryptionSalt: MOCK_VAULT_ENCRYPTION_SALT,
            migrationVersion: SeedlessOnboardingMigrationVersion.V1,
          }),
        },
        async ({ controller, toprfClient }) => {
          await controller.submitPassword(MOCK_PASSWORD);

          mockFetchAuthPubKey(
            toprfClient,
            base64ToBytes(controller.state.authPubKey as string),
          );

          const fetchAllSecretDataSpy = jest.spyOn(
            toprfClient,
            'fetchAllSecretDataItems',
          );

          await controller.runMigrations();

          // Should not fetch data since migration is already complete
          expect(fetchAllSecretDataSpy).not.toHaveBeenCalled();
        },
      );
    });

    it('should migrate legacy items, skip already-migrated and special items, and handle sorting', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            withMockAuthPubKey: true,
            vault: MOCK_VAULT,
            vaultEncryptionKey: MOCK_VAULT_ENCRYPTION_KEY,
            vaultEncryptionSalt: MOCK_VAULT_ENCRYPTION_SALT,
            migrationVersion: 0,
          }),
        },
        async ({ controller, toprfClient }) => {
          await controller.submitPassword(MOCK_PASSWORD);

          mockFetchAuthPubKey(
            toprfClient,
            base64ToBytes(controller.state.authPubKey as string),
          );

          // Return items in shuffled order to test sorting
          // v1 items have no dataType and no createdAt (legacy)
          // v2 items have both dataType and createdAt
          jest.spyOn(toprfClient, 'fetchAllSecretDataItems').mockResolvedValue([
            // Private key (v1 legacy, needs migration)
            {
              data: stringToBytes(
                JSON.stringify({
                  data: bytesToBase64(MOCK_PRIVATE_KEY),
                  timestamp: 3000,
                  type: SecretType.PrivateKey,
                  version: 'v1',
                }),
              ),
              itemId: 'pk-1',
              version: 'v1',
              dataType: undefined,
              createdAt: undefined,
            },
            // Already migrated SRP (v2 with dataType and createdAt)
            {
              data: stringToBytes(
                JSON.stringify({
                  data: bytesToBase64(stringToBytes('already migrated srp')),
                  timestamp: 500,
                  type: SecretType.Mnemonic,
                  version: 'v1',
                }),
              ),
              itemId: 'srp-migrated',
              version: 'v2',
              dataType: EncAccountDataType.ImportedSrp,
              createdAt: '00000000-0000-1000-8000-000000000000',
            },
            // Second SRP (v1 legacy, needs migration)
            {
              data: stringToBytes(
                JSON.stringify({
                  data: bytesToBase64(stringToBytes('another mnemonic')),
                  timestamp: 2000,
                  type: SecretType.Mnemonic,
                  version: 'v1',
                }),
              ),
              itemId: 'srp-2',
              version: 'v1',
              dataType: undefined,
              createdAt: undefined,
            },
            // PW_BACKUP item with corrupted PrimarySrp dataType (should be ignored for hasPrimarySrp calculation)
            {
              data: stringToBytes(
                JSON.stringify({
                  data: bytesToBase64(stringToBytes('password backup')),
                  timestamp: 100,
                  type: SecretType.Mnemonic,
                  version: 'v1',
                }),
              ),
              itemId: 'PW_BACKUP',
              version: 'v1',
              dataType: EncAccountDataType.PrimarySrp, // Corrupted: PW_BACKUP should not affect hasPrimarySrp
              createdAt: undefined,
            },
            // Item with undefined itemId and corrupted PrimarySrp (should be ignored)
            {
              data: stringToBytes(
                JSON.stringify({
                  data: bytesToBase64(stringToBytes('orphaned item')),
                  timestamp: 50,
                  type: SecretType.Mnemonic,
                  version: 'v1',
                }),
              ),
              itemId: undefined as unknown as string,
              version: 'v1',
              dataType: EncAccountDataType.PrimarySrp, // Corrupted: undefined itemId should not affect hasPrimarySrp
              createdAt: undefined,
            },
            // First SRP (v1 legacy, needs migration, oldest by timestamp)
            {
              data: stringToBytes(
                JSON.stringify({
                  data: bytesToBase64(MOCK_SEED_PHRASE),
                  timestamp: 1000,
                  type: SecretType.Mnemonic,
                  version: 'v1',
                }),
              ),
              itemId: 'srp-1',
              version: 'v1',
              dataType: undefined,
              createdAt: undefined,
            },
            // Unknown type item (v1 legacy)
            {
              data: stringToBytes(
                JSON.stringify({
                  data: bytesToBase64(stringToBytes('unknown data')),
                  timestamp: 4000,
                  type: 'unknownType',
                  version: 'v1',
                }),
              ),
              itemId: 'unknown-1',
              version: 'v1',
              dataType: undefined,
              createdAt: undefined,
            },
          ]);

          const batchUpdateSpy = jest
            .spyOn(toprfClient, 'batchUpdateSecretDataItems')
            .mockResolvedValue();

          await controller.runMigrations();

          // srp-1 -> PrimarySrp, srp-2 -> ImportedSrp, pk-1 -> ImportedPrivateKey
          // Skipped: srp-migrated, PW_BACKUP, undefined itemId, unknown-1
          // Note: PW_BACKUP and undefined itemId items have corrupted PrimarySrp dataType,
          // but they should be ignored when determining hasPrimarySrp, so srp-1 still gets PrimarySrp
          expect(batchUpdateSpy).toHaveBeenCalledWith({
            updateItems: [
              { itemId: 'srp-1', dataType: EncAccountDataType.PrimarySrp },
              { itemId: 'srp-2', dataType: EncAccountDataType.ImportedSrp },
              {
                itemId: 'pk-1',
                dataType: EncAccountDataType.ImportedPrivateKey,
              },
            ],
            authKeyPair: expect.any(Object),
          });
          expect(controller.state.migrationVersion).toBe(
            SeedlessOnboardingMigrationVersion.V1,
          );
        },
      );
    });

    it('should update migration version even if no items need updating', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            withMockAuthPubKey: true,
            vault: MOCK_VAULT,
            vaultEncryptionKey: MOCK_VAULT_ENCRYPTION_KEY,
            vaultEncryptionSalt: MOCK_VAULT_ENCRYPTION_SALT,
            migrationVersion: 0,
          }),
        },
        async ({ controller, toprfClient }) => {
          await controller.submitPassword(MOCK_PASSWORD);

          mockFetchAuthPubKey(
            toprfClient,
            base64ToBytes(controller.state.authPubKey as string),
          );

          // All items already have dataType
          jest.spyOn(toprfClient, 'fetchAllSecretDataItems').mockResolvedValue([
            {
              data: stringToBytes(
                JSON.stringify({
                  data: bytesToBase64(MOCK_SEED_PHRASE),
                  timestamp: 1000,
                  type: SecretType.Mnemonic,
                  version: 'v1',
                }),
              ),
              itemId: 'srp-1',
              version: 'v2',
              dataType: EncAccountDataType.PrimarySrp,
              createdAt: '00000001-0000-1000-8000-000000000001',
            },
          ]);

          const updateSpy = jest.spyOn(toprfClient, 'updateSecretDataItem');
          const batchUpdateSpy = jest.spyOn(
            toprfClient,
            'batchUpdateSecretDataItems',
          );

          await controller.runMigrations();

          expect(updateSpy).not.toHaveBeenCalled();
          expect(batchUpdateSpy).not.toHaveBeenCalled();
          expect(controller.state.migrationVersion).toBe(
            SeedlessOnboardingMigrationVersion.V1,
          );
        },
      );
    });

    it('should handle no secret data found', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            withMockAuthPubKey: true,
            vault: MOCK_VAULT,
            vaultEncryptionKey: MOCK_VAULT_ENCRYPTION_KEY,
            vaultEncryptionSalt: MOCK_VAULT_ENCRYPTION_SALT,
            migrationVersion: 0,
          }),
        },
        async ({ controller, toprfClient }) => {
          await controller.submitPassword(MOCK_PASSWORD);

          mockFetchAuthPubKey(
            toprfClient,
            base64ToBytes(controller.state.authPubKey as string),
          );

          jest
            .spyOn(toprfClient, 'fetchAllSecretDataItems')
            .mockResolvedValue([]);

          await controller.runMigrations();

          expect(controller.state.migrationVersion).toBe(
            SeedlessOnboardingMigrationVersion.V1,
          );
        },
      );
    });

    it('should use updateSecretDataItem when only one item needs migration', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            withMockAuthPubKey: true,
            vault: MOCK_VAULT,
            vaultEncryptionKey: MOCK_VAULT_ENCRYPTION_KEY,
            vaultEncryptionSalt: MOCK_VAULT_ENCRYPTION_SALT,
            migrationVersion: 0,
          }),
        },
        async ({ controller, toprfClient }) => {
          await controller.submitPassword(MOCK_PASSWORD);

          mockFetchAuthPubKey(
            toprfClient,
            base64ToBytes(controller.state.authPubKey as string),
          );

          // Only one item needs migration
          jest.spyOn(toprfClient, 'fetchAllSecretDataItems').mockResolvedValue([
            {
              data: stringToBytes(
                JSON.stringify({
                  data: bytesToBase64(MOCK_SEED_PHRASE),
                  timestamp: 1000,
                  type: SecretType.Mnemonic,
                  version: 'v1',
                }),
              ),
              itemId: 'srp-1',
              version: 'v1',
              dataType: undefined,
              createdAt: '00000001-0000-1000-8000-000000000001',
            },
          ]);

          const updateSpy = jest
            .spyOn(toprfClient, 'updateSecretDataItem')
            .mockResolvedValue();
          const batchUpdateSpy = jest.spyOn(
            toprfClient,
            'batchUpdateSecretDataItems',
          );

          await controller.runMigrations();

          expect(updateSpy).toHaveBeenCalledWith({
            itemId: 'srp-1',
            dataType: EncAccountDataType.PrimarySrp,
            authKeyPair: expect.any(Object),
          });
          expect(batchUpdateSpy).not.toHaveBeenCalled();
          expect(controller.state.migrationVersion).toBe(
            SeedlessOnboardingMigrationVersion.V1,
          );
        },
      );
    });

    it('should rethrow non-NoSecretDataFound errors during migration', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            withMockAuthPubKey: true,
            vault: MOCK_VAULT,
            vaultEncryptionKey: MOCK_VAULT_ENCRYPTION_KEY,
            vaultEncryptionSalt: MOCK_VAULT_ENCRYPTION_SALT,
            migrationVersion: 0,
          }),
        },
        async ({ controller, toprfClient }) => {
          await controller.submitPassword(MOCK_PASSWORD);

          mockFetchAuthPubKey(
            toprfClient,
            base64ToBytes(controller.state.authPubKey as string),
          );

          jest
            .spyOn(toprfClient, 'fetchAllSecretDataItems')
            .mockRejectedValue(new Error('Network error'));

          await expect(controller.runMigrations()).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.FailedToFetchSecretMetadata,
          );

          expect(controller.state.migrationVersion).toBe(0);
        },
      );
    });

    it('should preserve PrimarySrp designation even with inconsistent storageVersion', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            withMockAuthPubKey: true,
            vault: MOCK_VAULT,
            vaultEncryptionKey: MOCK_VAULT_ENCRYPTION_KEY,
            vaultEncryptionSalt: MOCK_VAULT_ENCRYPTION_SALT,
            migrationVersion: 0,
          }),
        },
        async ({ controller, toprfClient }) => {
          await controller.submitPassword(MOCK_PASSWORD);

          mockFetchAuthPubKey(
            toprfClient,
            base64ToBytes(controller.state.authPubKey as string),
          );

          // Simulate inconsistent state: dataType is PrimarySrp but storageVersion is 'v1'
          jest.spyOn(toprfClient, 'fetchAllSecretDataItems').mockResolvedValue([
            {
              data: stringToBytes(
                JSON.stringify({
                  data: bytesToBase64(MOCK_SEED_PHRASE),
                  timestamp: 1000,
                  type: SecretType.Mnemonic,
                }),
              ),
              itemId: 'srp-1',
              version: 'v1', // Inconsistent: should be 'v2' if dataType is set
              dataType: EncAccountDataType.PrimarySrp,
              createdAt: undefined,
            },
            {
              data: stringToBytes(
                JSON.stringify({
                  data: bytesToBase64(MOCK_SEED_PHRASE),
                  timestamp: 2000,
                  type: SecretType.Mnemonic,
                }),
              ),
              itemId: 'srp-2',
              version: 'v1',
              dataType: undefined,
              createdAt: undefined,
            },
          ]);

          const batchUpdateSpy = jest
            .spyOn(toprfClient, 'batchUpdateSecretDataItems')
            .mockResolvedValue();

          await controller.runMigrations();

          expect(batchUpdateSpy).toHaveBeenCalledWith({
            updateItems: [
              { itemId: 'srp-1', dataType: EncAccountDataType.PrimarySrp },
              { itemId: 'srp-2', dataType: EncAccountDataType.ImportedSrp },
            ],
            authKeyPair: expect.any(Object),
          });
        },
      );
    });
  });

  describe('setMigrationVersion', () => {
    it('should set the migration version directly', async () => {
      await withController({}, async ({ controller }) => {
        expect(controller.state.migrationVersion).toBe(0);

        controller.setMigrationVersion(SeedlessOnboardingMigrationVersion.V1);

        expect(controller.state.migrationVersion).toBe(
          SeedlessOnboardingMigrationVersion.V1,
        );
      });
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
                  itemId: 'srp-item-id',
                  dataType: EncAccountDataType.PrimarySrp,
                  createdAt: '00000001-0000-1000-8000-000000000001',
                },
                {
                  data: MOCK_PRIVATE_KEY,
                  type: SecretType.PrivateKey,
                  itemId: 'pk-item-id',
                  dataType: EncAccountDataType.ImportedPrivateKey,
                  createdAt: '00000002-0000-1000-8000-000000000002',
                },
              ],
              MOCK_PASSWORD,
            ),
          });
          const secretData = await controller.fetchAllSecretData(MOCK_PASSWORD);

          expect(mockSecretDataGet.isDone()).toBe(true);
          expect(secretData).toBeDefined();
          expect(secretData).toHaveLength(2);
          // Verify secret metadata
          expect(secretData[0].type).toStrictEqual(SecretType.Mnemonic);
          expect(secretData[0].data).toStrictEqual(MOCK_SEED_PHRASE);
          expect(secretData[1].type).toStrictEqual(SecretType.PrivateKey);
          expect(secretData[1].data).toStrictEqual(MOCK_PRIVATE_KEY);
          // Verify storage metadata
          expect(secretData[0].itemId).toBe('srp-item-id');
          expect(secretData[0].dataType).toBe(EncAccountDataType.PrimarySrp);
          expect(secretData[0].createdAt).toBe(
            '00000001-0000-1000-8000-000000000001',
          );
          expect(secretData[1].itemId).toBe('pk-item-id');
          expect(secretData[1].dataType).toBe(
            EncAccountDataType.ImportedPrivateKey,
          );
          expect(secretData[1].createdAt).toBe(
            '00000002-0000-1000-8000-000000000002',
          );

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
            secretData.every((item) => item.type === SecretType.Mnemonic),
          ).toBe(true);

          // Sorted: PrimarySrp first, then by createdAt (TIMEUUID timestamp)
          expect(secretData[0].data).toStrictEqual(
            stringToBytes('seedPhrase1'),
          );
          expect(secretData[0].itemId).toBe('srp-1');
          expect(secretData[0].dataType).toBe(EncAccountDataType.PrimarySrp);
          expect(secretData[0].createdAt).toBe(
            '00000001-0000-1000-8000-000000000001',
          );
          expect(secretData[1].data).toStrictEqual(
            stringToBytes('seedPhrase2'),
          );
          expect(secretData[1].itemId).toBe('srp-2');
          expect(secretData[1].dataType).toBe(EncAccountDataType.ImportedSrp);
          expect(secretData[1].createdAt).toBe(
            '00000002-0000-1000-8000-000000000002',
          );
          expect(secretData[2].data).toStrictEqual(
            stringToBytes('seedPhrase3'),
          );
          expect(secretData[2].itemId).toBe('srp-3');
          expect(secretData[2].dataType).toBe(EncAccountDataType.ImportedSrp);
          expect(secretData[2].createdAt).toBe(
            '00000003-0000-1000-8000-000000000003',
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
              [
                {
                  data: MOCK_SEED_PHRASE,
                  type: SecretType.Mnemonic,
                  itemId: 'primary-srp-id',
                  dataType: EncAccountDataType.PrimarySrp,
                  createdAt: '00000001-0000-1000-8000-000000000001',
                },
              ],
              MOCK_PASSWORD,
            ),
          });
          const secretData = await controller.fetchAllSecretData(MOCK_PASSWORD);

          expect(mockSecretDataGet.isDone()).toBe(true);
          expect(secretData).toBeDefined();
          expect(secretData[0].type).toStrictEqual(SecretType.Mnemonic);
          expect(secretData[0].data).toStrictEqual(MOCK_SEED_PHRASE);
          expect(secretData[0].itemId).toBe('primary-srp-id');
          expect(secretData[0].dataType).toBe(EncAccountDataType.PrimarySrp);
          expect(secretData[0].createdAt).toBe(
            '00000001-0000-1000-8000-000000000001',
          );

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

    it('should be able to retry fetchAllSecretData on auth token errors', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            accessToken,
          }),
        },
        async ({ controller, toprfClient, initialState, encryptor }) => {
          // fetch and decrypt the secret data
          const { encKey, pwEncKey, authKeyPair, recoverEncKeySpy } =
            mockRecoverEncKey(toprfClient, MOCK_PASSWORD, {
              mockRejectOnceWithTokenError: true,
            });

          const mockSecretDataGet = handleMockSecretDataGet({
            status: 200,
            body: createMockSecretDataGetResponse(
              [
                {
                  data: MOCK_SEED_PHRASE,
                  type: SecretType.Mnemonic,
                  itemId: 'primary-srp-id',
                  dataType: EncAccountDataType.PrimarySrp,
                },
              ],
              MOCK_PASSWORD,
            ),
          });

          const authenticateSpy = jest
            .spyOn(toprfClient, 'authenticate')
            .mockResolvedValue({
              nodeAuthTokens: MOCK_NODE_AUTH_TOKENS,
              isNewUser: false,
            });

          const secretData = await controller.fetchAllSecretData(MOCK_PASSWORD);

          expect(mockSecretDataGet.isDone()).toBe(true);
          expect(secretData).toBeDefined();
          // should call recoverEncKey twice and authenticate once
          expect(recoverEncKeySpy).toHaveBeenCalledTimes(2); // should call recoverEncKey twice for the first fail attempt due to token expired error and the second success attempt
          expect(authenticateSpy).toHaveBeenCalledTimes(1); // should call authenticate once for the token refresh

          expect(secretData[0].type).toStrictEqual(SecretType.Mnemonic);
          expect(secretData[0].data).toStrictEqual(MOCK_SEED_PHRASE);
          expect(secretData[0].itemId).toBe('primary-srp-id');
          expect(secretData[0].dataType).toBe(EncAccountDataType.PrimarySrp);

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
              [
                {
                  data: MOCK_SEED_PHRASE,
                  type: SecretType.Mnemonic,
                  itemId: 'primary-srp-id',
                  dataType: EncAccountDataType.PrimarySrp,
                  createdAt: '00000001-0000-1000-8000-000000000001',
                },
              ],
              MOCK_PASSWORD,
            ),
          });

          const secretData = await controller.fetchAllSecretData();

          expect(mockSecretDataGet.isDone()).toBe(true);
          expect(secretData).toBeDefined();
          expect(secretData).toHaveLength(1);
          expect(secretData[0].type).toStrictEqual(SecretType.Mnemonic);
          expect(secretData[0].data).toStrictEqual(MOCK_SEED_PHRASE);
          expect(secretData[0].itemId).toBe('primary-srp-id');
          expect(secretData[0].dataType).toBe(EncAccountDataType.PrimarySrp);
          expect(secretData[0].createdAt).toBe(
            '00000001-0000-1000-8000-000000000001',
          );
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
              {
                data: stringToBytes(JSON.stringify({ key: 'value' })),
                itemId: 'test-item-id',
                version: 'v2',
              },
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
                  itemId: 'pk-id',
                  dataType: EncAccountDataType.ImportedPrivateKey,
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

    it('should sort PrimarySrp first regardless of createdAt order', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller, toprfClient }) => {
          mockRecoverEncKey(toprfClient, MOCK_PASSWORD);

          // PrimarySrp has later createdAt but should still come first
          const mockSecretDataGet = handleMockSecretDataGet({
            status: 200,
            body: createMockSecretDataGetResponse(
              [
                {
                  data: new Uint8Array(Buffer.from('importedSrp', 'utf-8')),
                  type: SecretType.Mnemonic,
                  itemId: 'imported-srp-id',
                  dataType: EncAccountDataType.ImportedSrp,
                  createdAt: '00000001-0000-1000-8000-000000000001',
                },
                {
                  data: new Uint8Array(Buffer.from('primarySrp', 'utf-8')),
                  type: SecretType.Mnemonic,
                  itemId: 'primary-srp-id',
                  dataType: EncAccountDataType.PrimarySrp,
                  createdAt: '00000002-0000-1000-8000-000000000002',
                },
              ],
              MOCK_PASSWORD,
            ),
          });

          const secretData = await controller.fetchAllSecretData(MOCK_PASSWORD);

          expect(mockSecretDataGet.isDone()).toBe(true);
          expect(secretData).toHaveLength(2);
          // PrimarySrp should be first despite having later createdAt
          expect(secretData[0].dataType).toBe(EncAccountDataType.PrimarySrp);
          expect(secretData[0].data).toStrictEqual(stringToBytes('primarySrp'));
          expect(secretData[1].dataType).toBe(EncAccountDataType.ImportedSrp);
          expect(secretData[1].data).toStrictEqual(
            stringToBytes('importedSrp'),
          );
        },
      );
    });

    it('should fall back to timestamp sorting when createdAt is null (legacy data)', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller, toprfClient }) => {
          mockRecoverEncKey(toprfClient, MOCK_PASSWORD);

          // Mixed createdAt: some with TIMEUUID, some without (legacy)
          // Legacy items (null createdAt) should come before items with createdAt
          // to maintain sort transitivity
          const mockSecretDataGet = handleMockSecretDataGet({
            status: 200,
            body: createMockSecretDataGetResponse(
              [
                {
                  data: new Uint8Array(Buffer.from('srp2', 'utf-8')),
                  timestamp: 200,
                  type: SecretType.Mnemonic,
                  itemId: 'srp-2',
                  // No dataType or createdAt (legacy)
                },
                {
                  data: new Uint8Array(Buffer.from('srp1', 'utf-8')),
                  timestamp: 100,
                  type: SecretType.Mnemonic,
                  itemId: 'srp-1',
                  // No dataType or createdAt (legacy)
                },
                {
                  data: new Uint8Array(
                    Buffer.from('importedWithCreatedAt', 'utf-8'),
                  ),
                  timestamp: 300,
                  type: SecretType.Mnemonic,
                  itemId: 'imported-with-createdAt',
                  dataType: EncAccountDataType.ImportedSrp,
                  createdAt: '00000001-0000-1000-8000-000000000001',
                },
              ],
              MOCK_PASSWORD,
            ),
          });

          const secretData = await controller.fetchAllSecretData(MOCK_PASSWORD);

          expect(mockSecretDataGet.isDone()).toBe(true);
          expect(secretData).toHaveLength(3);
          // Legacy items (no createdAt) sorted by timestamp (oldest first)
          expect(secretData[0].data).toStrictEqual(stringToBytes('srp1'));
          expect(secretData[0].dataType).toBeUndefined();
          expect(secretData[0].createdAt).toBeUndefined();
          expect(secretData[1].data).toStrictEqual(stringToBytes('srp2'));
          expect(secretData[1].dataType).toBeUndefined();
          expect(secretData[1].createdAt).toBeUndefined();
          // Item with createdAt comes after legacy items
          expect(secretData[2].data).toStrictEqual(
            stringToBytes('importedWithCreatedAt'),
          );
          expect(secretData[2].createdAt).toBe(
            '00000001-0000-1000-8000-000000000001',
          );
        },
      );
    });

    it('should throw an error if the first item has non-primary dataType', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller, toprfClient }) => {
          mockRecoverEncKey(toprfClient, MOCK_PASSWORD);

          // ImportedSrp as first item (no PrimarySrp) - should throw
          const mockSecretDataGet = handleMockSecretDataGet({
            status: 200,
            body: createMockSecretDataGetResponse(
              [
                {
                  data: MOCK_SEED_PHRASE,
                  type: SecretType.Mnemonic,
                  itemId: 'imported-srp-id',
                  dataType: EncAccountDataType.ImportedSrp,
                  createdAt: '00000001-0000-1000-8000-000000000001',
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
      const mockVault = JSON.stringify({ foo: 'bar', salt: 'baz' });

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
            controller.addNewSecretData(
              MOCK_SEED_PHRASE,
              EncAccountDataType.ImportedSrp,
              {
                keyringId: MOCK_KEYRING_ID,
              },
            ),
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
      // V2 fields should be undefined
      expect(seedPhraseMetadata.dataType).toBeUndefined();
      expect(seedPhraseMetadata.itemId).toBeUndefined();
      expect(seedPhraseMetadata.createdAt).toBeUndefined();
      expect(seedPhraseMetadata.storageVersion).toBeUndefined();

      // should be able to create a SecretMetadata instance with a timestamp via constructor
      const timestamp = 18_000;
      const seedPhraseMetadata2 = new SecretMetadata(MOCK_SEED_PHRASE, {
        timestamp,
      });
      expect(seedPhraseMetadata2.data).toBeDefined();
      expect(seedPhraseMetadata2.timestamp).toBe(timestamp);
      expect(seedPhraseMetadata2.data).toStrictEqual(MOCK_SEED_PHRASE);
      expect(seedPhraseMetadata2.type).toBe(SecretType.Mnemonic);
      expect(seedPhraseMetadata2.dataType).toBeUndefined();
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

    it('should be able to serialized and parse a seed phrase metadata', () => {
      const seedPhraseMetadata = new SecretMetadata(MOCK_SEED_PHRASE);
      const serializedSeedPhraseBytes = seedPhraseMetadata.toBytes();

      const parsedSeedPhraseMetadata = SecretMetadata.fromRawMetadata(
        serializedSeedPhraseBytes,
        {},
      );
      expect(parsedSeedPhraseMetadata.data).toBeDefined();
      expect(parsedSeedPhraseMetadata.timestamp).toBeDefined();
      expect(parsedSeedPhraseMetadata.data).toStrictEqual(MOCK_SEED_PHRASE);
    });

    it('should be able to compare seed phrase metadata by timestamp', () => {
      const mockSeedPhraseMetadata1 = new SecretMetadata(MOCK_SEED_PHRASE, {
        timestamp: 1000,
      });
      const mockSeedPhraseMetadata2 = new SecretMetadata(MOCK_SEED_PHRASE, {
        timestamp: 2000,
      });

      // ascending order: earlier timestamp first
      expect(
        SecretMetadata.compareByTimestamp(
          mockSeedPhraseMetadata1,
          mockSeedPhraseMetadata2,
          'asc',
        ),
      ).toBeLessThan(0);

      // descending order: later timestamp first
      expect(
        SecretMetadata.compareByTimestamp(
          mockSeedPhraseMetadata1,
          mockSeedPhraseMetadata2,
          'desc',
        ),
      ).toBeGreaterThan(0);

      // default order (no parameter): should use ascending order
      expect(
        SecretMetadata.compareByTimestamp(
          mockSeedPhraseMetadata1,
          mockSeedPhraseMetadata2,
        ),
      ).toBeLessThan(0);
    });

    describe('compare', () => {
      it('should sort PrimarySrp first regardless of createdAt or timestamp', () => {
        const primarySrp = new SecretMetadata(MOCK_SEED_PHRASE, {
          timestamp: 2000,
          dataType: EncAccountDataType.PrimarySrp,
          createdAt: '00000002-0000-1000-8000-000000000002',
        });
        const importedSrp = new SecretMetadata(MOCK_SEED_PHRASE, {
          timestamp: 1000,
          dataType: EncAccountDataType.ImportedSrp,
          createdAt: '00000001-0000-1000-8000-000000000001',
        });

        expect(
          SecretMetadata.compare(primarySrp, importedSrp, 'asc'),
        ).toBeLessThan(0);
        expect(
          SecretMetadata.compare(importedSrp, primarySrp, 'asc'),
        ).toBeGreaterThan(0);
        // Also in desc order
        expect(
          SecretMetadata.compare(primarySrp, importedSrp, 'desc'),
        ).toBeLessThan(0);
      });

      it('should return 0 when both items are PrimarySrp (handles data corruption gracefully)', () => {
        const primarySrp1 = new SecretMetadata(MOCK_SEED_PHRASE, {
          timestamp: 1000,
          dataType: EncAccountDataType.PrimarySrp,
          createdAt: '00000001-0000-1000-8000-000000000001',
        });
        const primarySrp2 = new SecretMetadata(MOCK_SEED_PHRASE, {
          timestamp: 2000,
          dataType: EncAccountDataType.PrimarySrp,
          createdAt: '00000002-0000-1000-8000-000000000002',
        });

        expect(SecretMetadata.compare(primarySrp1, primarySrp2, 'asc')).toBe(0);
        expect(SecretMetadata.compare(primarySrp2, primarySrp1, 'asc')).toBe(0);
        expect(SecretMetadata.compare(primarySrp1, primarySrp2, 'desc')).toBe(
          0,
        );
      });

      it('should compare by createdAt (TIMEUUID) when both have createdAt', () => {
        const earlier = new SecretMetadata(MOCK_SEED_PHRASE, {
          timestamp: 1000,
          dataType: EncAccountDataType.ImportedSrp,
          createdAt: '00000001-0000-1000-8000-000000000001',
        });
        const later = new SecretMetadata(MOCK_SEED_PHRASE, {
          timestamp: 2000,
          dataType: EncAccountDataType.ImportedSrp,
          createdAt: '00000002-0000-1000-8000-000000000002',
        });

        expect(SecretMetadata.compare(earlier, later, 'asc')).toBeLessThan(0);
        expect(SecretMetadata.compare(later, earlier, 'asc')).toBeGreaterThan(
          0,
        );
        expect(SecretMetadata.compare(earlier, later, 'desc')).toBeGreaterThan(
          0,
        );
      });

      it('should sort legacy items (null createdAt) before items with createdAt in asc order', () => {
        const legacyItem = new SecretMetadata(MOCK_SEED_PHRASE, {
          timestamp: 2000,
          dataType: EncAccountDataType.ImportedSrp,
          // no createdAt (legacy)
        });
        const newItem = new SecretMetadata(MOCK_SEED_PHRASE, {
          timestamp: 1000,
          dataType: EncAccountDataType.ImportedSrp,
          createdAt: '00000001-0000-1000-8000-000000000001',
        });

        expect(SecretMetadata.compare(legacyItem, newItem, 'asc')).toBeLessThan(
          0,
        );
        expect(
          SecretMetadata.compare(newItem, legacyItem, 'asc'),
        ).toBeGreaterThan(0);
        // In desc order, legacy item comes after new item
        expect(
          SecretMetadata.compare(legacyItem, newItem, 'desc'),
        ).toBeGreaterThan(0);
        // In desc order, new item comes before legacy item
        expect(
          SecretMetadata.compare(newItem, legacyItem, 'desc'),
        ).toBeLessThan(0);
      });

      it('should fall back to timestamp when both have null createdAt', () => {
        const earlier = new SecretMetadata(MOCK_SEED_PHRASE, {
          timestamp: 1000,
          dataType: EncAccountDataType.ImportedSrp,
        });
        const later = new SecretMetadata(MOCK_SEED_PHRASE, {
          timestamp: 2000,
          dataType: EncAccountDataType.ImportedSrp,
        });

        expect(SecretMetadata.compare(earlier, later, 'asc')).toBeLessThan(0);
        expect(SecretMetadata.compare(later, earlier, 'asc')).toBeGreaterThan(
          0,
        );
        expect(SecretMetadata.compare(earlier, later, 'desc')).toBeGreaterThan(
          0,
        );
      });

      it('should use asc order by default', () => {
        const earlier = new SecretMetadata(MOCK_SEED_PHRASE, {
          timestamp: 1000,
          dataType: EncAccountDataType.ImportedSrp,
        });
        const later = new SecretMetadata(MOCK_SEED_PHRASE, {
          timestamp: 2000,
          dataType: EncAccountDataType.ImportedSrp,
        });

        expect(SecretMetadata.compare(earlier, later)).toBeLessThan(0);
      });
    });

    it('should default type to Mnemonic when parsing metadata without type field', () => {
      // Create raw metadata JSON without type field
      const rawMetadataWithoutType = JSON.stringify({
        data: bytesToBase64(MOCK_SEED_PHRASE),
        timestamp: Date.now(),
      });
      const rawMetadataBytes = stringToBytes(rawMetadataWithoutType);

      const parsed = SecretMetadata.fromRawMetadata(rawMetadataBytes, {});
      expect(parsed.type).toBe(SecretType.Mnemonic);
      expect(parsed.data).toStrictEqual(MOCK_SEED_PHRASE);
    });

    it('should be able to overwrite the default Generic DataType', () => {
      const secret1 = new SecretMetadata<string>('private-key-1', {
        type: SecretType.PrivateKey,
      });
      expect(secret1.data).toBe('private-key-1');
      expect(secret1.type).toBe(SecretType.PrivateKey);

      // should be able to convert to bytes
      const secret1Bytes = secret1.toBytes();
      const parsedSecret1 = SecretMetadata.fromRawMetadata<string>(
        secret1Bytes,
        {},
      );
      expect(parsedSecret1.data).toBe('private-key-1');
      expect(parsedSecret1.type).toBe(SecretType.PrivateKey);

      const secret2 = new SecretMetadata<Uint8Array>(MOCK_SEED_PHRASE, {
        type: SecretType.Mnemonic,
      });
      expect(secret2.data).toStrictEqual(MOCK_SEED_PHRASE);
      expect(secret2.type).toBe(SecretType.Mnemonic);

      const secret2Bytes = secret2.toBytes();
      const parsedSecret2 = SecretMetadata.fromRawMetadata<Uint8Array>(
        secret2Bytes,
        {},
      );
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

      const parsedSecrets = secrets
        .map((secret) => SecretMetadata.fromRawMetadata(secret, {}))
        .sort((a, b) => SecretMetadata.compareByTimestamp(a, b, 'asc'));
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

      const allSecrets = secrets
        .map((secret) => SecretMetadata.fromRawMetadata(secret, {}))
        .sort((a, b) => SecretMetadata.compareByTimestamp(a, b, 'asc'));

      const mnemonicSecrets = allSecrets.filter((secret) =>
        SecretMetadata.matchesType(secret, SecretType.Mnemonic),
      );
      expect(mnemonicSecrets).toHaveLength(2);
      expect(mnemonicSecrets[0].data).toStrictEqual(MOCK_SEED_PHRASE);
      expect(mnemonicSecrets[0].type).toBe(SecretType.Mnemonic);
      expect(mnemonicSecrets[1].data).toStrictEqual(MOCK_SEED_PHRASE);
      expect(mnemonicSecrets[1].type).toBe(SecretType.Mnemonic);

      const privateKeySecrets = allSecrets.filter((secret) =>
        SecretMetadata.matchesType(secret, SecretType.PrivateKey),
      );

      expect(privateKeySecrets).toHaveLength(1);
      expect(privateKeySecrets[0].data).toBe(mockPrivKeyString);
      expect(privateKeySecrets[0].type).toBe(SecretType.PrivateKey);
    });

    it('should derive type from dataType (V2)', () => {
      const srp1 = new SecretMetadata(MOCK_SEED_PHRASE, {
        dataType: EncAccountDataType.PrimarySrp,
      });
      expect(srp1.type).toBe(SecretType.Mnemonic);
      expect(srp1.dataType).toBe(EncAccountDataType.PrimarySrp);

      const srp2 = new SecretMetadata(MOCK_SEED_PHRASE, {
        dataType: EncAccountDataType.ImportedSrp,
      });
      expect(srp2.type).toBe(SecretType.Mnemonic);
      expect(srp2.dataType).toBe(EncAccountDataType.ImportedSrp);

      const pk = new SecretMetadata<string>('0xdeadbeef', {
        dataType: EncAccountDataType.ImportedPrivateKey,
      });
      expect(pk.type).toBe(SecretType.PrivateKey);
      expect(pk.dataType).toBe(EncAccountDataType.ImportedPrivateKey);
    });

    it('should be able to create SecretMetadata with storage metadata', () => {
      const secretMetadata = new SecretMetadata(MOCK_SEED_PHRASE, {
        dataType: EncAccountDataType.PrimarySrp,
        itemId: 'test-item-id',
        createdAt: '00000001-0000-1000-8000-000000000001',
      });

      expect(secretMetadata.data).toStrictEqual(MOCK_SEED_PHRASE);
      expect(secretMetadata.type).toBe(SecretType.Mnemonic);
      expect(secretMetadata.itemId).toBe('test-item-id');
      expect(secretMetadata.dataType).toBe(EncAccountDataType.PrimarySrp);
      expect(secretMetadata.createdAt).toBe(
        '00000001-0000-1000-8000-000000000001',
      );
    });

    it('should have undefined storage metadata when not provided', () => {
      const secretMetadata = new SecretMetadata(MOCK_SEED_PHRASE);

      expect(secretMetadata.data).toStrictEqual(MOCK_SEED_PHRASE);
      expect(secretMetadata.itemId).toBeUndefined();
      expect(secretMetadata.dataType).toBeUndefined();
      expect(secretMetadata.createdAt).toBeUndefined();
    });

    it('should NOT serialize storage metadata in toBytes()', () => {
      const secretMetadata = new SecretMetadata(MOCK_SEED_PHRASE, {
        dataType: EncAccountDataType.PrimarySrp,
        itemId: 'test-item-id',
        createdAt: '00000001-0000-1000-8000-000000000001',
      });

      const serializedBytes = secretMetadata.toBytes();
      const serializedString = bytesToString(serializedBytes);
      const parsed = JSON.parse(serializedString);

      // Storage metadata should NOT be in serialized data
      expect(parsed.itemId).toBeUndefined();
      expect(parsed.dataType).toBeUndefined();
      expect(parsed.createdAt).toBeUndefined();

      // Only encrypted metadata should be present
      expect(parsed.data).toBeDefined();
      expect(parsed.timestamp).toBeDefined();
      expect(parsed.type).toBe(SecretType.Mnemonic);
    });

    it('should be able to parse raw metadata with storage metadata', () => {
      const originalMetadata = new SecretMetadata(MOCK_SEED_PHRASE, {
        type: SecretType.Mnemonic,
      });
      const serializedBytes = originalMetadata.toBytes();

      const parsedMetadata = SecretMetadata.fromRawMetadata(serializedBytes, {
        itemId: 'server-assigned-id',
        dataType: EncAccountDataType.ImportedSrp,
        createdAt: '00000002-0000-1000-8000-000000000002',
      });

      expect(parsedMetadata.data).toStrictEqual(MOCK_SEED_PHRASE);
      expect(parsedMetadata.type).toBe(SecretType.Mnemonic);
      expect(parsedMetadata.itemId).toBe('server-assigned-id');
      expect(parsedMetadata.dataType).toBe(EncAccountDataType.ImportedSrp);
      expect(parsedMetadata.createdAt).toBe(
        '00000002-0000-1000-8000-000000000002',
      );
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
        revokeToken,
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

    it('should skip access token check when vault is locked', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            withMockAuthPubKey: true,
          }),
        },
        async ({ controller, toprfClient }) => {
          // Ensure the controller is locked
          await controller.setLocked();

          // Mock fetchAuthPubKey to return a valid response
          jest.spyOn(toprfClient, 'fetchAuthPubKey').mockResolvedValue({
            authPubKey: base64ToBytes(MOCK_AUTH_PUB_KEY),
            keyIndex: 1,
          });

          // Mock the token expiration checks
          jest
            .spyOn(controller, 'checkNodeAuthTokenExpired')
            .mockReturnValue(false);
          jest
            .spyOn(controller, 'checkMetadataAccessTokenExpired')
            .mockReturnValue(false);
          jest
            .spyOn(controller, 'checkAccessTokenExpired')
            .mockReturnValue(true);

          // This should not trigger token refresh since access token check is skipped when locked
          await controller.checkIsPasswordOutdated();

          // Verify that refreshAuthTokens was not called
          expect(controller.checkAccessTokenExpired).not.toHaveBeenCalled();
        },
      );
    });

    it('should not retry on non-token-related errors in executeWithTokenRefresh', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            withMockAuthPubKey: true,
          }),
        },
        async ({ controller, toprfClient }) => {
          // Mock fetchAuthPubKey to throw a non-token-related error
          jest
            .spyOn(toprfClient, 'fetchAuthPubKey')
            .mockRejectedValue(new Error('Network error'));

          // This should throw the wrapped error without retrying
          await expect(controller.checkIsPasswordOutdated()).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.FailedToFetchAuthPubKey,
          );

          // Verify that fetchAuthPubKey was only called once (no retry)
          expect(toprfClient.fetchAuthPubKey).toHaveBeenCalledTimes(1);
        },
      );
    });

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
              nodeAuthTokens: MOCK_NODE_AUTH_TOKENS.map((nodeAuthToken) => ({
                ...nodeAuthToken,
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
              SeedlessOnboardingControllerErrorMessage.FailedToRefreshJWTTokens,
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
              EncAccountDataType.ImportedSrp,
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
              SeedlessOnboardingControllerErrorMessage.FailedToRefreshJWTTokens,
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

  describe('fetchMetadataAccessCreds', () => {
    const createMockJWTToken = (exp: number): string => {
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
        renewRefreshToken: jest.fn(),
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
        renewRefreshToken: jest.fn(),
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
        renewRefreshToken: jest.fn(),
      });

      // mock refreshAuthTokens to return a new token
      jest.spyOn(controller, 'refreshAuthTokens').mockResolvedValue();

      await controller.fetchMetadataAccessCreds();

      expect(controller.refreshAuthTokens).toHaveBeenCalled();
    });
  });

  describe('checkMetadataAccessTokenExpired', () => {
    const createMockJWTToken = (exp: number): string => {
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
    const createMockJWTToken = (exp: number): string => {
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

    it('should return true if user is not authenticated', async () => {
      await withController(async ({ controller }) => {
        // Restore the original implementation to test the real logic
        jest.spyOn(controller, 'checkAccessTokenExpired').mockRestore();

        const result = controller.checkAccessTokenExpired();
        expect(result).toBe(true);
      });
    });

    it('should return true if access token is missing', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            withoutMockAccessToken: true,
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

  describe('#getAccessTokenAndRevokeToken', () => {
    const MOCK_PASSWORD = 'mock-password';

    it('should retrieve the access token and revoke token from the vault if it is not available in the state', async () => {
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
            withoutMockRevokeToken: true,
            vault: MOCK_VAULT,
            vaultEncryptionKey: MOCK_VAULT_ENCRYPTION_KEY,
            vaultEncryptionSalt: MOCK_VAULT_ENCRYPTION_SALT,
          }),
        },
        async ({ controller, toprfClient }) => {
          // fetch and decrypt the secret data
          mockRecoverEncKey(toprfClient, MOCK_PASSWORD);

          // mock the secret data get
          jest
            .spyOn(toprfClient, 'fetchAllSecretDataItems')
            .mockResolvedValueOnce([
              {
                data: stringToBytes(
                  JSON.stringify({
                    data: bytesToBase64(MOCK_SEED_PHRASE),
                    timestamp: 1234567890,
                    type: SecretType.Mnemonic,
                    version: 'v1',
                  }),
                ),
                itemId: 'primary-srp-id',
                version: 'v2',
                dataType: EncAccountDataType.PrimarySrp,
                createdAt: '00000001-0000-1000-8000-000000000001',
              },
              {
                data: stringToBytes(
                  JSON.stringify({
                    data: bytesToBase64(MOCK_PRIVATE_KEY),
                    timestamp: 1234567890,
                    type: SecretType.PrivateKey,
                    version: 'v1',
                  }),
                ),
                itemId: 'pk-id',
                version: 'v2',
                dataType: EncAccountDataType.ImportedPrivateKey,
                createdAt: '00000002-0000-1000-8000-000000000002',
              },
            ]);

          const secretData = await controller.fetchAllSecretData(MOCK_PASSWORD);
          expect(secretData).toBeDefined();
          expect(secretData).toHaveLength(2);
          expect(secretData[0].type).toStrictEqual(SecretType.Mnemonic);
          expect(secretData[0].data).toStrictEqual(MOCK_SEED_PHRASE);
          expect(secretData[0].itemId).toBe('primary-srp-id');
          expect(secretData[0].dataType).toBe(EncAccountDataType.PrimarySrp);
          expect(secretData[0].createdAt).toBe(
            '00000001-0000-1000-8000-000000000001',
          );
          expect(secretData[1].type).toStrictEqual(SecretType.PrivateKey);
          expect(secretData[1].data).toStrictEqual(MOCK_PRIVATE_KEY);
          expect(secretData[1].itemId).toBe('pk-id');
          expect(secretData[1].dataType).toBe(
            EncAccountDataType.ImportedPrivateKey,
          );
          expect(secretData[1].createdAt).toBe(
            '00000002-0000-1000-8000-000000000002',
          );
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
          // assert that the vault is not available in the state
          expect(controller.state.vault).toBeUndefined();

          // fetch and decrypt the secret data
          mockRecoverEncKey(toprfClient, MOCK_PASSWORD);

          jest
            .spyOn(toprfClient, 'fetchAllSecretDataItems')
            .mockResolvedValueOnce([
              {
                data: stringToBytes(
                  JSON.stringify({
                    data: 'value',
                    timestamp: 1234567890,
                    type: 'mnemonic',
                    version: 'v1',
                  }),
                ),
                itemId: 'test-item-id',
                version: 'v2',
              },
            ]);

          await expect(
            controller.fetchAllSecretData(MOCK_PASSWORD),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.InvalidAccessToken,
          );
        },
      );
    });
  });

  describe('renewRefreshToken', () => {
    const MOCK_PASSWORD = 'mock-password';
    const MOCK_REVOKE_TOKEN = 'newRevokeToken';

    it('should successfully renew refresh token and update vault', async () => {
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
        MOCK_REVOKE_TOKEN,
      );

      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            vault: mockResult.encryptedMockVault,
            vaultEncryptionKey: mockResult.vaultEncryptionKey,
            vaultEncryptionSalt: mockResult.vaultEncryptionSalt,
          }),
        },
        async ({ controller, mockRenewRefreshToken }) => {
          await controller.renewRefreshToken(MOCK_PASSWORD);

          expect(mockRenewRefreshToken).toHaveBeenCalledWith({
            connection: controller.state.authConnection,
            revokeToken: controller.state.revokeToken,
          });
        },
      );
    });

    it('should throw error if revoke token is missing', async () => {
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
            vault: encryptedMockVault,
            vaultEncryptionKey: exportedKeyString,
            vaultEncryptionSalt: JSON.parse(encryptedMockVault).salt,
          }),
        },
        async ({ controller }) => {
          await expect(
            controller.renewRefreshToken(MOCK_PASSWORD),
          ).rejects.toThrow(
            SeedlessOnboardingControllerErrorMessage.InvalidRevokeToken,
          );
        },
      );
    });
  });

  describe('revokePendingRefreshTokens', () => {
    it('should revoke all pending refresh tokens', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            pendingToBeRevokedTokens: [
              {
                refreshToken: 'old-refresh-token-1',
                revokeToken: 'old-revoke-token-1',
              },
              {
                refreshToken: 'old-refresh-token-2',
                revokeToken: 'old-revoke-token-2',
              },
            ],
          }),
        },
        async ({ controller, mockRevokeRefreshToken }) => {
          await controller.revokePendingRefreshTokens();

          expect(mockRevokeRefreshToken).toHaveBeenCalledTimes(2);
          expect(mockRevokeRefreshToken).toHaveBeenCalledWith({
            connection: controller.state.authConnection,
            revokeToken: 'old-revoke-token-1',
          });
          expect(mockRevokeRefreshToken).toHaveBeenCalledWith({
            connection: controller.state.authConnection,
            revokeToken: 'old-revoke-token-2',
          });
        },
      );
    });

    it('should do nothing when no pending tokens exist', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
          }),
        },
        async ({ controller, mockRevokeRefreshToken }) => {
          await controller.revokePendingRefreshTokens();

          expect(mockRevokeRefreshToken).not.toHaveBeenCalled();
        },
      );
    });

    it('should handle error when revokeRefreshToken fails and still remove token from pending list', async () => {
      await withController(
        {
          state: getMockInitialControllerState({
            withMockAuthenticatedUser: true,
            pendingToBeRevokedTokens: [
              {
                refreshToken: 'old-refresh-token-1',
                revokeToken: 'old-revoke-token-1',
              },
              {
                refreshToken: 'old-refresh-token-2',
                revokeToken: 'old-revoke-token-2',
              },
            ],
          }),
        },
        async ({ controller, mockRevokeRefreshToken }) => {
          // Mock the revokeRefreshToken to fail for the first token but succeed for the second
          mockRevokeRefreshToken
            .mockRejectedValueOnce(new Error('Revoke failed'))
            .mockResolvedValueOnce(undefined);

          await controller.revokePendingRefreshTokens();

          expect(mockRevokeRefreshToken).toHaveBeenCalledTimes(2);
          expect(mockRevokeRefreshToken).toHaveBeenCalledWith({
            connection: controller.state.authConnection,
            revokeToken: 'old-revoke-token-1',
          });
          expect(mockRevokeRefreshToken).toHaveBeenCalledWith({
            connection: controller.state.authConnection,
            revokeToken: 'old-revoke-token-2',
          });

          // Verify that both tokens were removed from the pending list
          // The first one was removed in the catch block (line 1911)
          // The second one was removed after successful revocation
          expect(controller.state.pendingToBeRevokedTokens?.length).toBe(1);
        },
      );
    });
  });

  describe('metadata', () => {
    it('includes expected state in debug snapshots', async () => {
      await withController(
        {
          state: {
            accessToken: 'accessToken',
            authPubKey: 'authPubKey',
            authConnection: AuthConnection.Google,
            authConnectionId: 'authConnectionId',
            encryptedKeyringEncryptionKey: 'encryptedKeyringEncryptionKey',
            encryptedSeedlessEncryptionKey: 'encryptedSeedlessEncryptionKey',
            groupedAuthConnectionId: 'groupedAuthConnectionId',
            isSeedlessOnboardingUserAuthenticated: true,
            metadataAccessToken: 'metadataAccessToken',
            nodeAuthTokens: [],
            passwordOutdatedCache: {
              isExpiredPwd: false,
              timestamp: 1234567890,
            },
            pendingToBeRevokedTokens: [
              { refreshToken: 'refreshToken', revokeToken: 'revokeToken' },
            ],
            refreshToken: 'refreshToken',
            revokeToken: 'revokeToken',
            socialBackupsMetadata: [],
            socialLoginEmail: 'socialLoginEmail',
            userId: 'userId',
            vault: 'vault',
            vaultEncryptionKey: 'vaultEncryptionKey',
            vaultEncryptionSalt: 'vaultEncryptionSalt',
          },
        },
        ({ controller }) => {
          expect(
            deriveStateFromMetadata(
              controller.state,
              controller.metadata,
              'includeInDebugSnapshot',
            ),
          ).toMatchInlineSnapshot(`
            Object {
              "authConnection": "google",
              "authConnectionId": "authConnectionId",
              "groupedAuthConnectionId": "groupedAuthConnectionId",
              "isSeedlessOnboardingUserAuthenticated": false,
              "migrationVersion": 0,
              "passwordOutdatedCache": Object {
                "isExpiredPwd": false,
                "timestamp": 1234567890,
              },
            }
          `);
        },
      );
    });

    it('includes expected state in state logs', async () => {
      await withController(
        {
          state: {
            accessToken: 'accessToken',
            authPubKey: 'authPubKey',
            authConnection: AuthConnection.Google,
            authConnectionId: 'authConnectionId',
            encryptedKeyringEncryptionKey: 'encryptedKeyringEncryptionKey',
            encryptedSeedlessEncryptionKey: 'encryptedSeedlessEncryptionKey',
            groupedAuthConnectionId: 'groupedAuthConnectionId',
            isSeedlessOnboardingUserAuthenticated: true,
            metadataAccessToken: 'metadataAccessToken',
            nodeAuthTokens: [],
            passwordOutdatedCache: {
              isExpiredPwd: false,
              timestamp: 1234567890,
            },
            pendingToBeRevokedTokens: [
              { refreshToken: 'refreshToken', revokeToken: 'revokeToken' },
            ],
            refreshToken: 'refreshToken',
            revokeToken: 'revokeToken',
            socialBackupsMetadata: [],
            socialLoginEmail: 'socialLoginEmail',
            userId: 'userId',
            vault: 'vault',
            vaultEncryptionKey: 'vaultEncryptionKey',
            vaultEncryptionSalt: 'vaultEncryptionSalt',
          },
        },
        ({ controller }) => {
          expect(
            deriveStateFromMetadata(
              controller.state,
              controller.metadata,
              'includeInStateLogs',
            ),
          ).toMatchInlineSnapshot(`
            Object {
              "accessToken": true,
              "authConnection": "google",
              "authConnectionId": "authConnectionId",
              "authPubKey": "authPubKey",
              "groupedAuthConnectionId": "groupedAuthConnectionId",
              "isSeedlessOnboardingUserAuthenticated": false,
              "metadataAccessToken": true,
              "migrationVersion": 0,
              "nodeAuthTokens": true,
              "passwordOutdatedCache": Object {
                "isExpiredPwd": false,
                "timestamp": 1234567890,
              },
              "pendingToBeRevokedTokens": true,
              "refreshToken": true,
              "revokeToken": true,
              "userId": "userId",
            }
          `);
        },
      );
    });

    it('persists expected state', async () => {
      await withController(
        {
          state: {
            accessToken: 'accessToken',
            authPubKey: 'authPubKey',
            authConnection: AuthConnection.Google,
            authConnectionId: 'authConnectionId',
            encryptedKeyringEncryptionKey: 'encryptedKeyringEncryptionKey',
            encryptedSeedlessEncryptionKey: 'encryptedSeedlessEncryptionKey',
            groupedAuthConnectionId: 'groupedAuthConnectionId',
            isSeedlessOnboardingUserAuthenticated: true,
            metadataAccessToken: 'metadataAccessToken',
            nodeAuthTokens: [],
            passwordOutdatedCache: {
              isExpiredPwd: false,
              timestamp: 1234567890,
            },
            pendingToBeRevokedTokens: [
              { refreshToken: 'refreshToken', revokeToken: 'revokeToken' },
            ],
            refreshToken: 'refreshToken',
            revokeToken: 'revokeToken',
            socialBackupsMetadata: [],
            socialLoginEmail: 'socialLoginEmail',
            userId: 'userId',
            vault: 'vault',
            vaultEncryptionKey: 'vaultEncryptionKey',
            vaultEncryptionSalt: 'vaultEncryptionSalt',
          },
        },
        ({ controller }) => {
          expect(
            deriveStateFromMetadata(
              controller.state,
              controller.metadata,
              'persist',
            ),
          ).toMatchInlineSnapshot(`
            Object {
              "authConnection": "google",
              "authConnectionId": "authConnectionId",
              "authPubKey": "authPubKey",
              "encryptedKeyringEncryptionKey": "encryptedKeyringEncryptionKey",
              "encryptedSeedlessEncryptionKey": "encryptedSeedlessEncryptionKey",
              "groupedAuthConnectionId": "groupedAuthConnectionId",
              "isSeedlessOnboardingUserAuthenticated": false,
              "metadataAccessToken": "metadataAccessToken",
              "migrationVersion": 0,
              "nodeAuthTokens": Array [],
              "passwordOutdatedCache": Object {
                "isExpiredPwd": false,
                "timestamp": 1234567890,
              },
              "pendingToBeRevokedTokens": Array [
                Object {
                  "refreshToken": "refreshToken",
                  "revokeToken": "revokeToken",
                },
              ],
              "refreshToken": "refreshToken",
              "socialBackupsMetadata": Array [],
              "socialLoginEmail": "socialLoginEmail",
              "userId": "userId",
              "vault": "vault",
            }
          `);
        },
      );
    });

    it('exposes expected state to UI', async () => {
      await withController(
        {
          state: {
            accessToken: 'accessToken',
            authPubKey: 'authPubKey',
            authConnection: AuthConnection.Google,
            authConnectionId: 'authConnectionId',
            encryptedKeyringEncryptionKey: 'encryptedKeyringEncryptionKey',
            encryptedSeedlessEncryptionKey: 'encryptedSeedlessEncryptionKey',
            groupedAuthConnectionId: 'groupedAuthConnectionId',
            isSeedlessOnboardingUserAuthenticated: true,
            metadataAccessToken: 'metadataAccessToken',
            nodeAuthTokens: [],
            passwordOutdatedCache: {
              isExpiredPwd: false,
              timestamp: 1234567890,
            },
            pendingToBeRevokedTokens: [
              { refreshToken: 'refreshToken', revokeToken: 'revokeToken' },
            ],
            refreshToken: 'refreshToken',
            revokeToken: 'revokeToken',
            socialBackupsMetadata: [],
            socialLoginEmail: 'socialLoginEmail',
            userId: 'userId',
            vault: 'vault',
            vaultEncryptionKey: 'vaultEncryptionKey',
            vaultEncryptionSalt: 'vaultEncryptionSalt',
          },
        },
        ({ controller }) => {
          expect(
            deriveStateFromMetadata(
              controller.state,
              controller.metadata,
              'usedInUi',
            ),
          ).toMatchInlineSnapshot(`
          Object {
            "authConnection": "google",
            "socialLoginEmail": "socialLoginEmail",
          }
        `);
        },
      );
    });
  });
});
