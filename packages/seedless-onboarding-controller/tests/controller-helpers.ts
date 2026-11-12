import type {
  EncryptionKey,
  KeyDerivationOptions,
} from '@metamask/browser-passworder';
import type {
  DefaultEncryptionResult,
  Encryptor,
} from '@metamask/keyring-controller';
import type {
  EnvelopeKeys,
  KeyPair,
  ToprfSecureBackup,
} from '@metamask/toprf-secure-backup';
import { stringToBytes } from '@metamask/utils';
import type { webcrypto } from 'node:crypto';
import type { Mock, MockInstance } from 'vitest';
import { vi } from 'vitest';

import { AuthConnection, Web3AuthNetwork } from '../src/constants.js';
import type {
  SeedlessOnboardingControllerMessenger,
  SeedlessOnboardingControllerOptions,
} from '../src/SeedlessOnboardingController.js';
import {
  SeedlessOnboardingController,
  getInitialSeedlessOnboardingControllerStateWithDefaults,
} from '../src/SeedlessOnboardingController.js';
import type { SeedlessOnboardingControllerState } from '../src/types.js';
import type {
  MockKeyringControllerMessenger,
  RootMessenger,
} from './__fixtures__/mockMessenger.js';
import { mockSeedlessOnboardingMessenger } from './__fixtures__/mockMessenger.js';
import { handleMockSecretDataAdd } from './__fixtures__/topfClient.js';
import { deriveTestEnvelopeKeys } from './mocks/envelopeKeys.js';
import { MockToprfEncryptorDecryptor } from './mocks/toprfEncryptor.js';
import MockVaultEncryptor from './mocks/vaultEncryptor.js';

export const authConnection = AuthConnection.Google;
export const authConnectionId = 'seedless-onboarding';
export const groupedAuthConnectionId = 'auth-server';
export const userId = 'user-test@gmail.com';
export const idTokens = ['idToken'];
export const refreshToken = 'refreshToken';
export const revokeToken = 'revokeToken';
export const accessToken = 'accessToken';
export const metadataAccessToken = 'metadataAccessToken';

export const MOCK_NODE_AUTH_TOKENS = [
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

export const MOCK_KEYRING_ID = 'mock-keyring-id';
const STRING_MOCK_SEED_PHRASE =
  'horror pink muffin canal young photo magnet runway start elder patch until';
export const MOCK_SEED_PHRASE = stringToBytes(STRING_MOCK_SEED_PHRASE);

export const MOCK_AUTH_PUB_KEY = 'A09CwPHdl/qo2AjBOHen5d4QORaLedxOrSdgReq8IhzQ';

type WithControllerCallback<ReturnValue, EKey, SupportedKeyDerivationOptions> =
  ({
    controller,
    initialState,
    encryptor,
    messenger,
  }: {
    controller: SeedlessOnboardingController<
      EKey,
      SupportedKeyDerivationOptions,
      DefaultEncryptionResult<SupportedKeyDerivationOptions>
    >;
    encryptor: Encryptor<
      EKey,
      SupportedKeyDerivationOptions,
      DefaultEncryptionResult<SupportedKeyDerivationOptions>
    >;
    initialState: SeedlessOnboardingControllerState;
    messenger: SeedlessOnboardingControllerMessenger;
    baseMessenger: RootMessenger;
    keyringControllerMessenger: MockKeyringControllerMessenger;
    toprfClient: ToprfSecureBackup;
    mockRefreshJWTToken: Mock;
    mockRevokeRefreshToken: Mock;
    mockRenewRefreshToken: Mock;
  }) => Promise<ReturnValue> | ReturnValue;

type WithControllerOptions<EKey, SupportedKeyDerivationParams> = Partial<
  SeedlessOnboardingControllerOptions<
    EKey,
    SupportedKeyDerivationParams,
    DefaultEncryptionResult<SupportedKeyDerivationParams>
  >
>;

type WithControllerArgs<ReturnValue, EKey, SupportedKeyDerivationParams> =
  | [WithControllerCallback<ReturnValue, EKey, SupportedKeyDerivationParams>]
  | [
      WithControllerOptions<EKey, SupportedKeyDerivationParams>,
      WithControllerCallback<ReturnValue, EKey, SupportedKeyDerivationParams>,
    ];

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
export async function withController<ReturnValue>(
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

  const mockRefreshJWTToken = vi.fn().mockResolvedValue({
    idTokens: ['newIdToken'],
    metadataAccessToken: 'mock-metadata-access-token',
    accessToken,
  });
  const mockRevokeRefreshToken = vi.fn().mockResolvedValue(undefined);
  const mockRenewRefreshToken = vi.fn().mockResolvedValue({
    newRevokeToken: 'newRevokeToken',
    newRefreshToken: 'newRefreshToken',
  });

  // In the withController function, before creating the controller:
  const originalFetchMetadataAccessCreds =
    // eslint-disable-next-line vitest/unbound-method -- testing mock
    SeedlessOnboardingController.prototype.fetchMetadataAccessCreds;

  vi.spyOn(
    SeedlessOnboardingController.prototype,
    'fetchMetadataAccessCreds',
  ).mockResolvedValue({
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
  vi.spyOn(controller, 'checkNodeAuthTokenExpired').mockReturnValue(false);
  vi.spyOn(controller, 'checkMetadataAccessTokenExpired').mockReturnValue(
    false,
  );
  vi.spyOn(controller, 'checkAccessTokenExpired').mockReturnValue(false);

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
export function createMockToprfEncryptor(): MockToprfEncryptorDecryptor {
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
export function mockcreateLocalKey(
  toprfClient: ToprfSecureBackup,
  password: string,
): {
  encKey: Uint8Array;
  pwEncKey: Uint8Array;
  authKeyPair: KeyPair;
  oprfKey: bigint;
  seed: Uint8Array;
  envelopeKeys: EnvelopeKeys;
  createLocalKeySpy: MockInstance;
} {
  const mockToprfEncryptor = createMockToprfEncryptor();

  const encKey = mockToprfEncryptor.deriveEncKey(password);
  const pwEncKey = mockToprfEncryptor.derivePwEncKey(password);
  const authKeyPair = mockToprfEncryptor.deriveAuthKeyPair(password);
  const oprfKey = BigInt(0);
  const seed = stringToBytes(password);
  const envelopeKeys = deriveTestEnvelopeKeys(seed);

  const createLocalKeySpy = vi
    .spyOn(toprfClient, 'createLocalKey')
    .mockResolvedValueOnce({
      encKey,
      pwEncKey,
      authKeyPair,
      oprfKey,
      seed,
      envelopeKeys,
    });

  return {
    encKey,
    pwEncKey,
    authKeyPair,
    oprfKey,
    seed,
    envelopeKeys,
    createLocalKeySpy,
  };
}

/**
 * Mocks the createToprfKeyAndBackupSeedPhrase method of the SeedlessOnboardingController instance.
 *
 * @param toprfClient - The ToprfSecureBackup instance.
 * @param controller - The SeedlessOnboardingController instance.
 * @param baseMessenger - The root messenger to call the method through.
 * @param password - The mock password.
 * @param seedPhrase - The mock seed phrase.
 * @param keyringId - The mock keyring id.
 */
export async function mockCreateToprfKeyAndBackupSeedPhrase<
  EKey,
  SupportedKeyDerivationParams,
>(
  toprfClient: ToprfSecureBackup,
  controller: SeedlessOnboardingController<EKey, SupportedKeyDerivationParams>,
  baseMessenger: RootMessenger,
  password: string,
  seedPhrase: Uint8Array,
  keyringId: string,
): Promise<void> {
  mockcreateLocalKey(toprfClient, password);

  vi.spyOn(controller, 'fetchMetadataAccessCreds').mockResolvedValueOnce({
    metadataAccessToken: 'mock-metadata-access-token',
  });

  // persist the local enc key
  vi.spyOn(toprfClient, 'persistLocalKey').mockResolvedValueOnce();
  // encrypt and store the secret data
  handleMockSecretDataAdd();
  await baseMessenger.call(
    'SeedlessOnboardingController:createToprfKeyAndBackupSeedPhrase',
    password,
    seedPhrase,
    keyringId,
  );
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
export function getMockInitialControllerState(options?: {
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
