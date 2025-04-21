import type { EthKeyring } from '@metamask/keyring-internal-api';
import type { Json, Hex } from '@metamask/utils';

/**
 * A test keyring that returns a shallow copy of the accounts array
 * when calling getAccounts().
 *
 * This is used to test the `KeyringController`'s behavior when using this
 * keyring, to make sure that, for example, the keyring's
 * accounts array is not not used to determinate the added account after
 * an operation.
 */
export default class MockShallowGetAccountsKeyring implements EthKeyring {
  static type = 'Mock Shallow getAccounts Keyring';

  public type = MockShallowGetAccountsKeyring.type;

  public accounts: Hex[];

  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(_: any) {
    this.accounts = [];
  }

  async serialize(): Promise<Json> {
    return {};
  }

  async deserialize(state: { accounts: Hex[] }) {
    if (state) {
      this.accounts = state.accounts || [];
    }
  }

  /**
   * This method returns a shallow copy of the accounts array.
   * This means that when mutating the internal account array, the
   * array returned by this method could be also mutated, and vice-versa.
   *
   * @returns a shallow copy of the accounts array
   */
  async getAccounts(): Promise<Hex[]> {
    // Shallow copy
    return this.accounts;
  }

  // this fake method works only with n = 1
  async addAccounts(_: number): Promise<Hex[]> {
    const newAddress = `0x68612830F5E3e285E8EAcc06f19a31aEB446C5Ee`;
    this.accounts.push(newAddress);
    return [newAddress];
  }
}
