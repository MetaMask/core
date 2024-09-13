import type { EthKeyring } from '@metamask/keyring-internal-api';
import type { Hex, Json } from '@metamask/utils';

export class MockErc4337Keyring implements EthKeyring<Json> {
  static type = 'ERC-4337 Keyring';

  public type = MockErc4337Keyring.type;

  async serialize(): Promise<Json> {
    return {};
  }

  async deserialize() {
    // Empty
  }

  async getAccounts(): Promise<Hex[]> {
    return [];
  }

  async addAccounts(_: number): Promise<Hex[]> {
    return [];
  }

  prepareUserOperation = jest.fn();

  patchUserOperation = jest.fn();

  signUserOperation = jest.fn();
}
