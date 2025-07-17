import type { Messenger } from '@metamask/base-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import { EvmAccountProvider } from './EvmAccountProvider';
import {
  getMultichainAccountControllerMessenger,
  getRootMessenger,
  MOCK_HD_ACCOUNT_1,
  MOCK_HD_ACCOUNT_2,
} from '../tests';
import type {
  AllowedActions,
  AllowedEvents,
  MultichainAccountControllerActions,
  MultichainAccountControllerEvents,
} from '../types';

/**
 * Sets up a EvmAccountProvider for testing.
 *
 * @param options - Configuration options for setup.
 * @param options.messenger - An optional messenger instance to use. Defaults to a new Messenger.
 * @param options.accounts - List of accounts to use.
 * @returns An object containing the controller instance and the messenger.
 */
function setup({
  messenger = getRootMessenger(),
  accounts = [],
}: {
  messenger?: Messenger<
    MultichainAccountControllerActions | AllowedActions,
    MultichainAccountControllerEvents | AllowedEvents
  >;
  accounts?: InternalAccount[];
} = {}): {
  provider: EvmAccountProvider;
  messenger: Messenger<
    MultichainAccountControllerActions | AllowedActions,
    MultichainAccountControllerEvents | AllowedEvents
  >;
} {
  messenger.registerActionHandler(
    'AccountsController:listMultichainAccounts',
    () => accounts,
  );

  const provider = new EvmAccountProvider(
    getMultichainAccountControllerMessenger(messenger),
  );

  return {
    provider,
    messenger,
  };
}

describe('EvmAccountProvider', () => {
  it('gets accounts', () => {
    const accounts = [MOCK_HD_ACCOUNT_1, MOCK_HD_ACCOUNT_2];
    const { provider } = setup({
      accounts,
    });

    expect(provider.getAccounts()).toStrictEqual(accounts);
  });

  it('gets a specific account', () => {
    const account = MOCK_HD_ACCOUNT_1;
    const { provider } = setup({
      accounts: [account],
    });

    expect(provider.getAccount(account.id)).toStrictEqual(account);
  });

  it('throws if account does not exist', () => {
    const account = MOCK_HD_ACCOUNT_1;
    const { provider } = setup({
      accounts: [account],
    });

    const unknownAccount = MOCK_HD_ACCOUNT_2;
    expect(() => provider.getAccount(unknownAccount.id)).toThrow(
      `Unable to find account: ${unknownAccount.id}`,
    );
  });
});
