import type { EthKeyring } from '@metamask/keyring-internal-api';
import type { Hex, Json } from '@metamask/utils';
import { vi } from 'vitest';

export class MockErc4337Keyring implements EthKeyring {
  static type = 'ERC-4337 Keyring';

  public type = MockErc4337Keyring.type;

  async serialize(): Promise<Json> {
    return {};
  }

  async deserialize(): Promise<void> {
    // Empty
  }

  async getAccounts(): Promise<Hex[]> {
    return [];
  }

  async addAccounts(_: number): Promise<Hex[]> {
    return [];
  }

  prepareUserOperation = vi.fn();

  patchUserOperation = vi.fn();

  signUserOperation = vi.fn();
}
