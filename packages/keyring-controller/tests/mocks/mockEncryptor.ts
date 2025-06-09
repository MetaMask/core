// Omitting jsdoc because mock is only internal and simple enough.
/* eslint-disable jsdoc/require-jsdoc */

import type {
  DetailedDecryptResult,
  DetailedEncryptionResult,
  EncryptionResult,
} from '@metamask/browser-passworder';
import type { Json } from '@metamask/utils';
import { isEqual } from 'lodash';

import type { ExportableKeyEncryptor } from '../../src/KeyringController';

export const PASSWORD = 'password123';
export const SALT = 'salt';
export const MOCK_ENCRYPTION_KEY = JSON.stringify({
  password: PASSWORD,
  salt: SALT,
});

export const DECRYPTION_ERROR = 'Decryption failed.';

function deriveKey(password: string, salt: string) {
  return {
    password,
    salt,
  };
}

export default class MockEncryptor implements ExportableKeyEncryptor {
  async encrypt(password: string, dataObj: Json): Promise<string> {
    const salt = generateSalt();
    const key = deriveKey(password, salt);
    const result = await this.encryptWithKey(key, dataObj);
    return JSON.stringify({
      ...result,
      salt,
    });
  }

  async decrypt(password: string, text: string): Promise<Json> {
    const { salt } = JSON.parse(text);
    const key = deriveKey(password, salt);
    return await this.decryptWithKey(key, text);
  }

  async encryptWithDetail(
    password: string,
    dataObj: Json,
    salt?: string,
  ): Promise<DetailedEncryptionResult> {
    const _salt = salt ?? generateSalt();
    const key = deriveKey(password, _salt);
    const result = await this.encryptWithKey(key, dataObj);
    return {
      vault: JSON.stringify({
        ...result,
        salt: _salt,
      }),
      exportedKeyString: JSON.stringify(key),
    };
  }

  async decryptWithDetail(
    password: string,
    text: string,
  ): Promise<DetailedDecryptResult> {
    const { salt } = JSON.parse(text);
    const key = deriveKey(password, salt);
    return {
      vault: await this.decryptWithKey(key, text),
      salt,
      exportedKeyString: JSON.stringify(key),
    };
  }

  async encryptWithKey(key: unknown, dataObj: Json): Promise<EncryptionResult> {
    const iv = generateIV();
    return {
      data: JSON.stringify({
        tag: { key, iv },
        value: dataObj,
      }),
      iv,
    };
  }

  async decryptWithKey(key: unknown, ciphertext: string): Promise<Json> {
    // This conditional assignment is required because sometimes the keyring
    // controller passes in the parsed object instead of the string.
    const ciphertextObj =
      typeof ciphertext === 'string' ? JSON.parse(ciphertext) : ciphertext;
    const data = JSON.parse(ciphertextObj.data);
    if (!isEqual(data.tag, { key, iv: ciphertextObj.iv })) {
      throw new Error(DECRYPTION_ERROR);
    }
    return data.value;
  }

  async importKey(key: string) {
    return JSON.parse(key);
  }

  async updateVault(_vault: string, _password: string) {
    return _vault;
  }

  isVaultUpdated(_vault: string) {
    return true;
  }
}

function generateSalt() {
  // Generate random salt.

  // return crypto.randomUUID();
  return SALT; // TODO some tests rely on fixed salt, but wouldn't it be better to generate random value here?
}

function generateIV() {
  // Generate random salt.

  // return crypto.randomUUID();
  return 'iv'; // TODO some tests rely on fixed iv, but wouldn't it be better to generate random value here?
}
