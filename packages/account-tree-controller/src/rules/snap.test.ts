import {
  AccountGroupType,
  toAccountGroupId,
  toAccountWalletId,
  AccountWalletType,
} from '@metamask/account-api';
import { Messenger } from '@metamask/base-controller';
import { EthAccountType, EthMethod, EthScope } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { AccountGroupObjectOf } from '../group';
import type {
  AccountTreeControllerMessenger,
  AccountTreeControllerActions,
  AccountTreeControllerEvents,
  AllowedActions,
  AllowedEvents,
} from '../types';
import { SnapRule } from './snap';

const ETH_EOA_METHODS = [
  EthMethod.PersonalSign,
  EthMethod.Sign,
  EthMethod.SignTransaction,
  EthMethod.SignTypedDataV1,
  EthMethod.SignTypedDataV3,
  EthMethod.SignTypedDataV4,
] as const;

const MOCK_SNAP_1 = {
  id: 'local:mock-snap-id-1',
  name: 'Mock Snap 1',
  enabled: true,
  manifest: {
    proposedName: 'Mock Snap 1',
  },
};

const MOCK_SNAP_ACCOUNT_2: InternalAccount = {
  id: 'mock-snap-id-2',
  address: '0x789',
  options: {},
  methods: [...ETH_EOA_METHODS],
  type: EthAccountType.Eoa,
  scopes: [EthScope.Eoa],
  metadata: {
    name: 'Snap Acc 2',
    keyring: { type: KeyringTypes.snap },
    snap: MOCK_SNAP_1,
    importTime: 0,
    lastSelected: 0,
  },
};

/**
 * Creates a new root messenger instance for testing.
 *
 * @returns A new Messenger instance.
 */
function getRootMessenger() {
  return new Messenger<
    AccountTreeControllerActions | AllowedActions,
    AccountTreeControllerEvents | AllowedEvents
  >();
}

/**
 * Retrieves a restricted messenger for the AccountTreeController.
 *
 * @param messenger - The root messenger instance. Defaults to a new Messenger created by getRootMessenger().
 * @returns The restricted messenger for the AccountTreeController.
 */
function getAccountTreeControllerMessenger(
  messenger = getRootMessenger(),
): AccountTreeControllerMessenger {
  return messenger.getRestricted({
    name: 'AccountTreeController',
    allowedEvents: [
      'AccountsController:accountAdded',
      'AccountsController:accountRemoved',
      'AccountsController:selectedAccountChange',
    ],
    allowedActions: [
      'AccountsController:listMultichainAccounts',
      'AccountsController:getAccount',
      'AccountsController:getSelectedAccount',
      'AccountsController:setSelectedAccount',
      'KeyringController:getState',
      'SnapController:get',
    ],
  });
}

describe('SnapRule', () => {
  describe('getComputedAccountGroupName', () => {
    it('uses BaseRule implementation', () => {
      const rootMessenger = getRootMessenger();
      const messenger = getAccountTreeControllerMessenger(rootMessenger);
      const rule = new SnapRule(messenger);

      rootMessenger.registerActionHandler(
        'AccountsController:getAccount',
        () => MOCK_SNAP_ACCOUNT_2,
      );

      const group: AccountGroupObjectOf<AccountGroupType.SingleAccount> = {
        id: toAccountGroupId(
          toAccountWalletId(AccountWalletType.Snap, MOCK_SNAP_1.id),
          MOCK_SNAP_ACCOUNT_2.address,
        ),
        type: AccountGroupType.SingleAccount,
        accounts: [MOCK_SNAP_ACCOUNT_2.id],
        metadata: {
          name: MOCK_SNAP_ACCOUNT_2.metadata.name,
          pinned: false,
          hidden: false,
        },
      };

      expect(rule.getComputedAccountGroupName(group)).toBe(
        MOCK_SNAP_ACCOUNT_2.metadata.name,
      );
    });

    it('returns empty string when account is not found', () => {
      const rootMessenger = getRootMessenger();
      const messenger = getAccountTreeControllerMessenger(rootMessenger);
      const rule = new SnapRule(messenger);

      rootMessenger.registerActionHandler(
        'AccountsController:getAccount',
        () => undefined,
      );

      const group: AccountGroupObjectOf<AccountGroupType.SingleAccount> = {
        id: toAccountGroupId(
          toAccountWalletId(AccountWalletType.Snap, MOCK_SNAP_1.id),
          MOCK_SNAP_ACCOUNT_2.address,
        ),
        type: AccountGroupType.SingleAccount,
        accounts: [MOCK_SNAP_ACCOUNT_2.id],
        metadata: {
          name: MOCK_SNAP_ACCOUNT_2.metadata.name,
          pinned: false,
          hidden: false,
        },
      };

      expect(rule.getComputedAccountGroupName(group)).toBe('');
    });
  });

  describe('getDefaultAccountGroupName', () => {
    it('uses BaseRule implementation', () => {
      const rootMessenger = getRootMessenger();
      const messenger = getAccountTreeControllerMessenger(rootMessenger);
      const rule = new SnapRule(messenger);

      const group: AccountGroupObjectOf<AccountGroupType.SingleAccount> = {
        id: toAccountGroupId(
          toAccountWalletId(AccountWalletType.Snap, MOCK_SNAP_1.id),
          MOCK_SNAP_ACCOUNT_2.address,
        ),
        type: AccountGroupType.SingleAccount,
        accounts: [MOCK_SNAP_ACCOUNT_2.id],
        metadata: {
          name: MOCK_SNAP_ACCOUNT_2.metadata.name,
          pinned: false,
          hidden: false,
        },
      };

      expect(rule.getDefaultAccountGroupName(group, 0)).toBe('Account 1');
      expect(rule.getDefaultAccountGroupName(group, 1)).toBe('Account 2');
      expect(rule.getDefaultAccountGroupName(group, 5)).toBe('Account 6');
    });
  });
});
