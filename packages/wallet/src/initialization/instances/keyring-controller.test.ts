import { KeyringController } from '@metamask/keyring-controller';
import type {
  KeyringControllerMessenger,
  KeyringControllerOptions,
} from '@metamask/keyring-controller';
import { webcrypto } from 'crypto';

import { encryptorFactory, keyringController } from './keyring-controller';

jest.mock('@metamask/keyring-controller', () => ({
  ...jest.requireActual('@metamask/keyring-controller'),
  KeyringController: jest.fn(),
}));

describe('keyringController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('forwards keyringV2Builders to the KeyringController', () => {
    const keyringV2Builders = [
      Object.assign(jest.fn(), { type: 'Test Keyring V2' }),
    ] as KeyringControllerOptions['keyringV2Builders'];

    keyringController.init({
      state: undefined,
      messenger: {} as KeyringControllerMessenger,
      options: { keyringV2Builders },
    });

    expect(KeyringController).toHaveBeenCalledWith(
      expect.objectContaining({ keyringV2Builders }),
    );
  });
});

describe('encryptorFactory', () => {
  beforeAll(() => {
    // We can remove this once we drop Node 18
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    globalThis.crypto ??= webcrypto as typeof globalThis.crypto;

    // eslint-disable-next-line no-restricted-syntax
    if (!('CryptoKey' in globalThis)) {
      Object.defineProperty(globalThis, 'CryptoKey', {
        value: webcrypto.CryptoKey,
      });
    }
  });

  const encryptor = encryptorFactory(600_000);

  it('encrypts/decrypts using a password', async () => {
    const password = 'password';
    const data = { foo: 'bar' };

    const encrypted = await encryptor.encrypt(password, data);

    expect(JSON.parse(encrypted)).toStrictEqual({
      data: expect.any(String),
      iv: expect.any(String),
      salt: expect.any(String),
      keyMetadata: {
        algorithm: 'PBKDF2',
        params: {
          iterations: 600_000,
        },
      },
    });

    expect(await encryptor.decrypt(password, encrypted)).toStrictEqual(data);
  });

  it('encrypts/decrypts with detail using a password', async () => {
    const password = 'foo';
    const data = { bar: 'baz' };

    const encrypted = await encryptor.encryptWithDetail(password, data);

    expect(encrypted).toStrictEqual({
      vault: expect.any(String),
      exportedKeyString: expect.any(String),
    });

    const decrypted = await encryptor.decryptWithDetail(
      password,
      encrypted.vault,
    );

    expect(decrypted.exportedKeyString).toStrictEqual(
      encrypted.exportedKeyString,
    );
    expect(decrypted.vault).toStrictEqual(data);
  });
});
