import type { Bip44Account } from '@metamask/account-api';
import {
  AccountCreationType,
  BtcScope,
  EthScope,
  SolScope,
  TrxScope,
} from '@metamask/keyring-api';
import type {
  CreateAccountOptions,
  EntropySourceId,
  KeyringAccount,
  KeyringCapabilities,
} from '@metamask/keyring-api';

import {
  AccountProviderWrapper,
  EvmAccountProvider,
  BaseBip44AccountProvider,
} from '../providers';

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
  mocks.alignAccounts.mockImplementation(
    async ({
      entropySource,
      groupIndex,
    }: {
      entropySource: EntropySourceId;
      groupIndex: number;
    }) => {
      if (mocks.isDisabled()) {
        const wrapperAlign = (
          AccountProviderWrapper.prototype as unknown as {
            alignAccounts: (
              this: { isEnabled: boolean },
              opts: { entropySource: EntropySourceId; groupIndex: number },
            ) => Promise<string[]>;
          }
        ).alignAccounts;
        const ids = await wrapperAlign.call(
          { isEnabled: false, isDisabled: () => true },
          { entropySource, groupIndex },
        );
        return ids;
      }
      const createdAccounts = await mocks.createAccounts({
        type: AccountCreationType.Bip44DeriveIndex,
        entropySource,
        groupIndex,
      });

      const baseAlign = (
        BaseBip44AccountProvider.prototype as unknown as {
          alignAccounts: (
            this: {
              createAccounts: (
                options: CreateAccountOptions,
              ) => Promise<unknown[]>;
            },
            opts: { entropySource: EntropySourceId; groupIndex: number },
          ) => Promise<string[]>;
        }
      ).alignAccounts;
      const ids = await baseAlign.call(
        { createAccounts: async () => createdAccounts },
        { entropySource, groupIndex },
      );

      return ids;
    },
  );
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
