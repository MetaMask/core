import type { EthKeyring } from '@metamask/keyring-internal-api';
import type { Json, Hex } from '@metamask/utils';

export class MockKeyring implements EthKeyring<Json> {
  static type = 'Mock Keyring';

  public type = 'Mock Keyring';

  #accounts: Hex[] = [];

  constructor(options: Record<string, unknown> | undefined = {}) {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises, @typescript-eslint/promise-function-async
    this.deserialize(options);
  }

  async init() {
    return Promise.resolve();
  }

  async addAccounts(_: number): Promise<Hex[]> {
    return Promise.resolve(this.#accounts);
  }

  async getAccounts() {
    return Promise.resolve(this.#accounts);
  }

  async serialize() {
    return Promise.resolve({});
  }

  async deserialize(_: unknown) {
    return Promise.resolve();
  }
}
