import type { Bip44Account } from '@metamask/account-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { Mock } from 'vitest';
import { describe, expect, it, vi } from 'vitest';

import {
  getMultichainAccountServiceMessenger,
  getRootMessenger,
  MOCK_HD_ACCOUNT_1,
  MOCK_HD_ACCOUNT_2,
  MOCK_WALLET_1_ENTROPY_SOURCE,
} from '../../tests/index.js';
import { EvmAccountProvider } from './EvmAccountProvider.js';

function setup(): {
  accounts: Map<string, Bip44Account<InternalAccount>>;
  getAccounts: Mock<
    (ids: string[]) => (Bip44Account<InternalAccount> | undefined)[]
  >;
  provider: EvmAccountProvider;
} {
  const messenger = getRootMessenger();
  const accounts = new Map(
    [MOCK_HD_ACCOUNT_1, MOCK_HD_ACCOUNT_2].map((account) => [
      account.id,
      account,
    ]),
  );
  const getAccounts = vi.fn((ids: string[]) =>
    ids.map((id) => accounts.get(id)),
  );
  messenger.registerActionHandler(
    'AccountsController:getAccounts',
    getAccounts,
  );
  const provider = new EvmAccountProvider(
    getMultichainAccountServiceMessenger(messenger),
  );
  return { accounts, getAccounts, provider };
}

const context = { entropySource: MOCK_WALLET_1_ENTROPY_SOURCE, groupIndex: 0 };
const ids = [MOCK_HD_ACCOUNT_1.id, MOCK_HD_ACCOUNT_2.id];

describe('BaseBip44AccountProvider', () => {
  describe('init', () => {
    it('replaces the tracked snapshot while excluded accounts still exist', () => {
      const { getAccounts, provider } = setup();
      provider.init(ids);

      provider.init([MOCK_HD_ACCOUNT_2.id]);

      expect(provider.getAccounts()).toStrictEqual([MOCK_HD_ACCOUNT_2]);
      expect(getAccounts).toHaveBeenLastCalledWith([MOCK_HD_ACCOUNT_2.id]);
      expect(provider.isAligned(context, [MOCK_HD_ACCOUNT_1.id])).toBe(false);
      expect(provider.isAligned(context, [MOCK_HD_ACCOUNT_2.id])).toBe(true);
    });

    it('clears tracking when initialized with an empty snapshot', () => {
      const { getAccounts, provider } = setup();
      provider.init(ids);

      provider.init([]);

      expect(provider.getAccounts()).toStrictEqual([]);
      expect(getAccounts).toHaveBeenLastCalledWith([]);
      expect(provider.isAligned(context, ids)).toBe(false);
    });

    it('preserves order and identity while deduplicating an identical snapshot', () => {
      const { provider } = setup();
      const snapshot = [MOCK_HD_ACCOUNT_2.id, ...ids];
      provider.init(snapshot);
      provider.init(snapshot);

      const accounts = provider.getAccounts();

      expect(accounts).toStrictEqual([MOCK_HD_ACCOUNT_2, MOCK_HD_ACCOUNT_1]);
      expect(accounts[0]).toBe(MOCK_HD_ACCOUNT_2);
      expect(accounts[1]).toBe(MOCK_HD_ACCOUNT_1);
    });
  });

  describe('getAccounts', () => {
    it('omits accounts removed from the controller after initialization', () => {
      const { accounts, getAccounts, provider } = setup();
      provider.init(ids);
      accounts.delete(MOCK_HD_ACCOUNT_1.id);

      const result = provider.getAccounts();

      expect(getAccounts).toHaveBeenLastCalledWith(ids);
      expect(result).toStrictEqual([MOCK_HD_ACCOUNT_2]);
      expect(result[0]).toBe(MOCK_HD_ACCOUNT_2);
    });

    it('returns an empty list when every tracked account is missing', () => {
      const { accounts, provider } = setup();
      provider.init(ids);
      accounts.clear();

      expect(provider.getAccounts()).toStrictEqual([]);
    });

    it('returns an empty list before initialization', () => {
      const { getAccounts, provider } = setup();

      expect(provider.getAccounts()).toStrictEqual([]);
      expect(getAccounts).toHaveBeenLastCalledWith([]);
      expect(provider.isAligned(context, [])).toBe(false);
    });
  });
});
