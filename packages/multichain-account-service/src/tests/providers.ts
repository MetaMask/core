import type { Bip44Account } from '@metamask/account-api';
import { BtcScope, EthScope, SolScope, TrxScope } from '@metamask/keyring-api';
import type { KeyringAccount } from '@metamask/keyring-api';
import type { KeyringCapabilities } from '@metamask/keyring-api/v2';

import { AccountProviderWrapper, EvmAccountProvider } from '../providers';
import { GroupIndexRange } from '../utils';

export type MockAccountProvider = {
  mockAccounts: KeyringAccount[];
  accounts: Set<KeyringAccount['id']>;
  capabilities: KeyringCapabilities;
  constructor: jest.Mock;
  alignAccounts: jest.Mock;
  init: jest.Mock;
  resyncAccounts: jest.Mock;
  getAccount: jest.Mock;
  getAccounts: jest.Mock;
  createAccounts: jest.Mock;
  discoverAccounts: jest.Mock;
  isAccountCompatible: jest.Mock;
  getName: jest.Mock;
  isEnabled: boolean;
  isDisabled: jest.Mock;
  setEnabled: jest.Mock;
};

export function makeMockAccountProvider(
  accounts: KeyringAccount[] = [],
): MockAccountProvider {
  return {
    mockAccounts: accounts,
    accounts: new Set(),
    capabilities: {
      scopes: [
        SolScope.Devnet,
        SolScope.Testnet,
        BtcScope.Testnet,
        TrxScope.Shasta,
        EthScope.Eoa,
      ],
      bip44: { deriveIndex: true },
    },
    constructor: jest.fn(),
    alignAccounts: jest.fn(),
    init: jest.fn(),
    resyncAccounts: jest.fn(),
    getAccount: jest.fn(),
    getAccounts: jest.fn(),
    createAccounts: jest.fn(),
    discoverAccounts: jest.fn(),
    isAccountCompatible: jest.fn(),
    getName: jest.fn(),
    isDisabled: jest.fn(),
    setEnabled: jest.fn(),
    isEnabled: true,
  };
}

export function setupBip44AccountProvider({
  name = 'Mocked Provider',
  accounts,
  mocks = makeMockAccountProvider(),
  index,
}: {
  name?: string;
  mocks?: MockAccountProvider;
  accounts: KeyringAccount[];
  filter?: (account: KeyringAccount) => boolean;
  index?: number;
}): MockAccountProvider {
  // You can mock this and all other mocks will re-use that list
  // of accounts.
  mocks.mockAccounts = accounts;
  mocks.accounts = new Set(accounts.map((account) => account.id));
  // Toggle enabled state only
  mocks.setEnabled.mockImplementation((enabled: boolean) => {
    mocks.isEnabled = enabled;
  });
  mocks.isDisabled.mockImplementation(() => !mocks.isEnabled);

  const getAccounts = (): KeyringAccount[] =>
    mocks.mockAccounts.filter((account) =>
      [...mocks.accounts].includes(account.id),
    );

  mocks.getName.mockImplementation(() => name);

  mocks.getAccounts.mockImplementation(getAccounts);
  mocks.getAccount.mockImplementation(
    (id: Bip44Account<KeyringAccount>['id']) =>
      // Assuming this never fails.
      getAccounts().find((account) => account.id === id),
  );
  mocks.createAccounts.mockResolvedValue([]);
  mocks.init.mockImplementation(
    (accountIds: Bip44Account<KeyringAccount>['id'][]) => {
      accountIds.forEach((id) => mocks.accounts.add(id));
    },
  );

  if (index === 0) {
    // Make the first provider to always be an `EvmAccountProvider`, since we
    // check for this pre-condition in some methods.
    Object.setPrototypeOf(mocks, EvmAccountProvider.prototype);
  }

  if (index !== 0) {
    Object.setPrototypeOf(mocks, AccountProviderWrapper.prototype);
  }

  return mocks;
}

/**
 * Helper to mock a single createAccounts call while updating the provider's
 * internal state so subsequent getAccount/getAccounts can resolve the accounts.
 *
 * @param provider - The mock provider whose createAccounts call to mock.
 * @param created - The accounts to be returned and persisted in the mock state.
 */
export function mockCreateAccountsOnce(
  provider: MockAccountProvider,
  created: KeyringAccount[],
): void {
  provider.createAccounts.mockImplementationOnce(async () => {
    // Add newly created accounts to the provider's internal store
    for (const acc of created) {
      if (!provider.mockAccounts.some((a) => a.id === acc.id)) {
        provider.mockAccounts.push(acc);
      }
    }
    // Merge IDs into the visible list used by getAccounts/getAccount
    const ids = created.map((a) => a.id);
    for (const id of ids) {
      provider.accounts.add(id);
    }

    return created;
  });
}

/**
 * Helper to convert a group index range to an array of group indices, inclusive of the
 * start and end indices.
 *
 * @param range - The range.
 * @param range.from - The starting index of the range (inclusive).
 * @param range.to - The ending index of the range (inclusive).
 * @returns An array of group indices from `from` to `to`, inclusive.
 */
export function toGroupIndexRangeArray({
  from = 0,
  to,
}: GroupIndexRange): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}
