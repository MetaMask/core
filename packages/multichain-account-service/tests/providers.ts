import type { Bip44Account } from '@metamask/account-api';
import {
  BtcScope,
  EthScope,
  SolScope,
  TrxScope,
  XlmScope,
} from '@metamask/keyring-api';
import type { KeyringAccount } from '@metamask/keyring-api';
import type { KeyringCapabilities } from '@metamask/keyring-api/v2';
import { vi } from 'vitest';
import type { Mock } from 'vitest';

import {
  AccountProviderWrapper,
  EvmAccountProvider,
} from '../src/providers/index.js';
import { GroupIndexRange } from '../src/utils.js';

export type MockAccountProvider = {
  mockAccounts: KeyringAccount[];
  accounts: Set<KeyringAccount['id']>;
  capabilities: KeyringCapabilities;
  constructor: Mock;
  alignAccounts: Mock;
  init: Mock;
  resyncAccounts: Mock;
  getAccount: Mock;
  getAccounts: Mock;
  createAccounts: Mock;
  deleteAccount: Mock;
  deleteAccounts: Mock;
  discoverAccounts: Mock;
  isAccountCompatible: Mock;
  isAligned: Mock;
  getName: Mock;
  ensureReady: Mock;
  isEnabled: boolean;
  isDisabled: Mock;
  setEnabled: Mock;
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
        XlmScope.Testnet,
        EthScope.Eoa,
      ],
      bip44: { deriveIndex: true },
    },
    constructor: vi.fn(),
    alignAccounts: vi.fn(),
    init: vi.fn(),
    resyncAccounts: vi.fn(),
    getAccount: vi.fn(),
    getAccounts: vi.fn(),
    createAccounts: vi.fn(),
    deleteAccount: vi.fn(),
    deleteAccounts: vi.fn(),
    discoverAccounts: vi.fn(),
    isAccountCompatible: vi.fn(),
    isAligned: vi.fn().mockReturnValue(false),
    getName: vi.fn(),
    ensureReady: vi.fn().mockResolvedValue(undefined),
    isDisabled: vi.fn(),
    setEnabled: vi.fn(),
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
  mocks.deleteAccounts.mockImplementation(async (ids: string[]) => {
    const failures: { id: string; error: unknown }[] = [];
    for (const id of ids) {
      try {
        await mocks.deleteAccount(id);
      } catch (error) {
        failures.push({ id, error });
      }
    }
    if (failures.length > 0) {
      return { ok: false, failures };
    }
    return { ok: true };
  });
  mocks.init.mockImplementation(
    (accountIds: Bip44Account<KeyringAccount>['id'][]) => {
      accountIds.forEach((id) => mocks.accounts.add(id));
    },
  );

  mocks.isAligned.mockImplementation(
    (
      _context: { entropySource: string; groupIndex: number },
      accountIds: string[],
    ) =>
      accountIds.length >= 1 &&
      accountIds.every((id) => mocks.accounts.has(id)),
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
