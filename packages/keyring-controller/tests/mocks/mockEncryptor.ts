import type { ExportableKeyEncryptor } from '../../src/KeyringController';

export const PASSWORD = 'password123';
export const MOCK_ENCRYPTION_KEY = JSON.stringify({
  alg: 'A256GCM',
  ext: true,
  k: 'wYmxkxOOFBDP6F6VuuYFcRt_Po-tSLFHCWVolsHs4VI',
  // eslint-disable-next-line @typescript-eslint/naming-convention
  key_ops: ['encrypt', 'decrypt'],
  kty: 'oct',
});
export const MOCK_ENCRYPTION_SALT =
  'HQ5sfhsb8XAQRJtD+UqcImT7Ve4n3YMagrh05YTOsjk=';
export const MOCK_HARDCODED_KEY = 'key';
export const MOCK_HEX = '0xabcdef0123456789';
// eslint-disable-next-line no-restricted-globals
export const MOCK_KEY = Buffer.alloc(32);
const INVALID_PASSWORD_ERROR = 'Incorrect password.';

export default class MockEncryptor implements ExportableKeyEncryptor {
  cacheVal?: string;

  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async encrypt(password: string, dataObj: any) {
    return JSON.stringify({
      ...(await this.encryptWithKey(password, dataObj)),
      salt: this.generateSalt(),
    });
  }

  async decrypt(_password: string, _text: string) {
    if (_password && _password !== PASSWORD) {
      throw new Error(INVALID_PASSWORD_ERROR);
    }

    return JSON.parse(this.cacheVal || '') ?? {};
  }

  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async encryptWithKey(_key: unknown, dataObj: any) {
    this.cacheVal = JSON.stringify(dataObj);
    return {
      data: MOCK_HEX,
      iv: 'anIv',
    };
  }

  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async encryptWithDetail(key: string, dataObj: any) {
    return {
      vault: await this.encrypt(key, dataObj),
      exportedKeyString: MOCK_ENCRYPTION_KEY,
    };
  }

  async decryptWithDetail(key: string, text: string) {
    return {
      vault: await this.decrypt(key, text),
      salt: MOCK_ENCRYPTION_SALT,
      exportedKeyString: MOCK_ENCRYPTION_KEY,
    };
  }

  async decryptWithKey(key: unknown, text: string) {
    return JSON.parse(this.cacheVal || '') ?? {};
  }

  async keyFromPassword(_password: string, _salt?: string) {
    return JSON.parse(MOCK_ENCRYPTION_KEY);
  }

  async importKey(key: string) {
    return JSON.parse(key);
  }

  async exportKey(key: unknown) {
    return JSON.stringify(key);
  }

  async updateVault(_vault: string, _password: string) {
    return _vault;
  }

  isVaultUpdated(_vault: string) {
    return true;
  }

  generateSalt() {
    return MOCK_ENCRYPTION_SALT;
  }
}
