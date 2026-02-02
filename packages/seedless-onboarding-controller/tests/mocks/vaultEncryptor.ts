import type {
  EncryptionKey,
  EncryptionResult,
  KeyDerivationOptions,
} from '@metamask/browser-passworder';
import type { Json } from '@metamask/utils';
import { webcrypto } from 'node:crypto';

import type { VaultEncryptor } from '../../src/types';

export default class MockVaultEncryptor
  implements
    VaultEncryptor<EncryptionKey | webcrypto.CryptoKey, KeyDerivationOptions>
{
  defaultDerivationParams: KeyDerivationOptions = {
    algorithm: 'PBKDF2',
    params: {
      iterations: 10_000,
    },
  };

  defaultSalt = 'RANDOM_SALT';

  async encryptWithDetail(
    password: string,
    dataObj: Json,
    salt: string = this.defaultSalt,
    keyDerivationOptions: KeyDerivationOptions = this.defaultDerivationParams,
  ): Promise<{ vault: string; exportedKeyString: string }> {
    const key = await this.keyFromPassword(
      password,
      salt,
      true,
      keyDerivationOptions,
    );
    const exportedKeyString = await this.exportKey(key);
    const vault = await this.encrypt(password, dataObj, key, salt);

    return {
      vault,
      exportedKeyString,
    };
  }

  async decryptWithDetail(
    password: string,
    text: string,
  ): Promise<{ vault: string; exportedKeyString: string; salt: string }> {
    const payload = JSON.parse(text);
    const { salt, keyMetadata } = payload;
    const key = await this.keyFromPassword(password, salt, true, keyMetadata);
    const exportedKeyString = await this.exportKey(key);
    const vault = (await this.decrypt(password, text, key)) as string;

    return {
      exportedKeyString,
      vault,
      salt,
    };
  }

  async importKey(keyString: string): Promise<EncryptionKey> {
    try {
      const parsedKey = JSON.parse(keyString);
      const key = await webcrypto.subtle.importKey(
        'jwk',
        parsedKey,
        'AES-GCM',
        false,
        ['encrypt', 'decrypt'],
      );
      return {
        key,
        derivationOptions: this.defaultDerivationParams,
      };
    } catch (error) {
      console.error(error);
      throw new Error('Failed to import key');
    }
  }

  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  async exportKey(cryptoKey: CryptoKey | EncryptionKey): Promise<string> {
    const key = 'key' in cryptoKey ? cryptoKey.key : cryptoKey;
    const exportedKey = await webcrypto.subtle.exportKey('jwk', key);

    return JSON.stringify(exportedKey);
  }

  async keyFromPassword(
    password: string,
    salt: string,
    exportable: boolean = true,
    opts: KeyDerivationOptions = this.defaultDerivationParams,
  ): Promise<EncryptionKey | webcrypto.CryptoKey> {
    const passBuffer = Buffer.from(password);
    const saltBuffer = Buffer.from(salt, 'base64');

    const key = await webcrypto.subtle.importKey(
      'raw',
      passBuffer,
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey'],
    );

    const encKey = await webcrypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBuffer,
        iterations: opts.params.iterations,
        hash: 'SHA-256',
      },
      key,
      { name: 'AES-GCM', length: 256 },
      exportable,
      ['encrypt', 'decrypt'],
    );

    return encKey;
  }

  async encryptWithKey(
    encryptionKey: EncryptionKey | webcrypto.CryptoKey,
    data: unknown,
  ): Promise<EncryptionResult> {
    const dataString = JSON.stringify(data);
    const dataBuffer = Buffer.from(dataString);
    const vector = webcrypto.getRandomValues(new Uint8Array(16));

    const key = 'key' in encryptionKey ? encryptionKey.key : encryptionKey;
    const encBuff = await webcrypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: vector,
      },
      key,
      dataBuffer,
    );

    const buffer = new Uint8Array(encBuff);
    const vectorStr = Buffer.from(vector).toString('base64');
    const vaultStr = Buffer.from(buffer).toString('base64');
    const encryptionResult: EncryptionResult = {
      data: vaultStr,
      iv: vectorStr,
    };

    if ('derivationOptions' in encryptionKey) {
      encryptionResult.keyMetadata = encryptionKey.derivationOptions;
    }

    return encryptionResult;
  }

  async decryptWithKey(
    encryptionKey: EncryptionKey | webcrypto.CryptoKey,
    payload: EncryptionResult,
  ): Promise<unknown> {
    let encData: EncryptionResult;
    if (typeof payload === 'string') {
      encData = JSON.parse(payload);
    } else {
      encData = payload;
    }

    const encryptedData = Buffer.from(encData.data, 'base64');
    const vector = Buffer.from(encData.iv, 'base64');
    const key = 'key' in encryptionKey ? encryptionKey.key : encryptionKey;

    const result = await webcrypto.subtle.decrypt(
      { name: 'AES-GCM', iv: vector },
      key,
      encryptedData,
    );

    const decryptedData = new Uint8Array(result);
    const decryptedStr = Buffer.from(decryptedData).toString();
    const decryptedObj = JSON.parse(decryptedStr);

    return decryptedObj;
  }

  async encrypt(
    password: string,
    dataObj: Json,
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    key?: EncryptionKey | CryptoKey,
    salt: string = this.defaultSalt,
    keyDerivationOptions = this.defaultDerivationParams,
  ): Promise<string> {
    const cryptoKey =
      key ??
      (await this.keyFromPassword(password, salt, false, keyDerivationOptions));
    const payload = await this.encryptWithKey(cryptoKey, dataObj);
    payload.salt = salt;
    return JSON.stringify(payload);
  }

  async decrypt(
    password: string,
    text: string,
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    encryptionKey?: EncryptionKey | CryptoKey,
  ): Promise<unknown> {
    const payload = JSON.parse(text);
    const { salt, keyMetadata } = payload;

    let cryptoKey = encryptionKey;
    cryptoKey ??= await this.keyFromPassword(
      password,
      salt,
      false,
      keyMetadata,
    );

    const key = 'key' in cryptoKey ? cryptoKey.key : cryptoKey;

    const result = await this.decryptWithKey(key, payload);
    return result;
  }

  generateSalt(): string {
    return this.defaultSalt;
  }
}
