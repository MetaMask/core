import { MockKeyring } from './mockKeyring';

export class MockMutableKeyring extends MockKeyring {
  static type = 'Mock Mutable Keyring';

  public type = 'Mock Mutable Keyring';

  #updated: boolean = false;

  update() {
    this.#updated = true;
  }

  async serialize() {
    return Promise.resolve({
      updated: this.#updated,
    });
  }
}
