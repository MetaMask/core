import type { EthKeyring } from '@metamask/keyring-internal-api';
import type { Hex, Json } from '@metamask/utils';

export class MockKeyring implements EthKeyring {
  static type = 'Mock Keyring';

  public type = 'Mock Keyring';

  readonly #accounts: Hex[] = [];

  constructor(options: Record<string, unknown> | undefined = {}) {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.deserialize(options);
  }

  async init(): Promise<void> {
    return Promise.resolve();
  }

  async addAccounts(_: number): Promise<Hex[]> {
    return Promise.resolve(this.#accounts);
  }

  async getAccounts(): Promise<Hex[]> {
    return Promise.resolve(this.#accounts);
  }

  async serialize(): Promise<Json> {
    return Promise.resolve({});
  }

  async deserialize(_: unknown): Promise<void> {
    return Promise.resolve();
  }
}
