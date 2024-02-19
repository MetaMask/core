const mockHex = '0xabcdef0123456789';
export const mockKey = Buffer.alloc(32);
let cacheVal: any;

export default class MockEncryptor {
  async encrypt(password: string, dataObj: any) {
    return JSON.stringify({
      ...this.encryptWithKey(password, dataObj),
      salt: this.generateSalt(),
    });
  }

  async decrypt(_password: string, _text: string) {
    return cacheVal || {};
  }

  async encryptWithKey(_key: string, dataObj: any) {
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

  async decryptWithKey(key: string, text: string) {
    return this.decrypt(key, text);
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
