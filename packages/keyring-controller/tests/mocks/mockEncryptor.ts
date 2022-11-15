const mockHex = '0xabcdef0123456789';
const mockKey = Buffer.alloc(32);
let cacheVal: any;

export default class MockEncryptor {
  async encrypt(_password: string, dataObj: any) {
    cacheVal = dataObj;
    return Promise.resolve(mockHex);
  }

  async decrypt(_password: string, _text: string) {
    return Promise.resolve(cacheVal || {});
  }

  async encryptWithKey(key: string, dataObj: any) {
    return this.encrypt(key, dataObj);
  }

  async decryptWithKey(key: string, text: string) {
    return this.decrypt(key, text);
  }

  async keyFromPassword(_password: string) {
    return Promise.resolve(mockKey);
  }

  generateSalt() {
    return 'WHADDASALT!';
  }
}
