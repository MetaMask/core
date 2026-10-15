import type { EthKeyring } from '@metamask/keyring-internal-api';
import type { Hex, Json } from '@metamask/utils';
import type { Mock } from 'vitest';
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

  // Annotated explicitly: the type `vi.fn()` infers names `Procedure` from
  // inside Vitest's own build, which TypeScript rejects as unportable (TS2883).
  prepareUserOperation: Mock = vi.fn();

  patchUserOperation: Mock = vi.fn();

  signUserOperation: Mock = vi.fn();
}
