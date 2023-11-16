import type { ExportableKeyEncryptor } from '@metamask/eth-keyring-controller/dist/types';

const mockHex = '0xabcdef0123456789';
export const mockKey = Buffer.alloc(32);
let cacheVal: any;

export default class MockEncryptor implements ExportableKeyEncryptor {
  async encrypt(password: string, dataObj: any) {
    return JSON.stringify({
      ...this.encryptWithKey(password, dataObj),
      salt: this.generateSalt(),
    });
  }

  async decrypt(_password: string, _text: string) {
    return cacheVal || {};
  }

  async encryptWithKey(_key: unknown, dataObj: any) {
    cacheVal = dataObj;
    return {
      data: mockHex,
      iv: 'anIv',
    };
  }

  async encryptWithDetail(key: string, dataObj: any) {
    return {
      vault: await this.encrypt(key, dataObj),
      exportedKeyString: mockKey.toString('hex'),
    };
  }

  async decryptWithDetail(key: string, text: string) {
    return {
      vault: await this.decrypt(key, text),
      salt: this.generateSalt(),
      exportedKeyString: mockKey.toString('hex'),
    };
  }

  async decryptWithKey(key: unknown, text: string) {
    return this.decrypt(key as string, text);
  }

  async keyFromPassword(_password: string) {
    return mockKey;
  }

  async importKey(_key: string) {
    return {};
  }

  generateSalt() {
    return 'WHADDASALT!';
  }
}
