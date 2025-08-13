import type { Bip44Account } from '@metamask/account-api';
import {
  AccountGroupType,
  toMultichainAccountGroupId,
  toMultichainAccountWalletId,
} from '@metamask/account-api';
import { Messenger } from '@metamask/base-controller';
import {
  EthAccountType,
  EthMethod,
  EthScope,
  KeyringAccountEntropyTypeOption,
} from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { AccountGroupObject } from './group';
import { BaseRule } from './rule';
import type {
  AccountTreeControllerMessenger,
  AccountTreeControllerActions,
  AccountTreeControllerEvents,
  AllowedActions,
  AllowedEvents,
} from './types';

const ETH_EOA_METHODS = [
  EthMethod.PersonalSign,
  EthMethod.Sign,
  EthMethod.SignTransaction,
  EthMethod.SignTypedDataV1,
  EthMethod.SignTypedDataV3,
  EthMethod.SignTypedDataV4,
] as const;

const MOCK_HD_ACCOUNT_1: Bip44Account<InternalAccount> = {
  id: 'mock-id-1',
  address: '0x123',
  options: {
    entropy: {
      type: KeyringAccountEntropyTypeOption.Mnemonic,
      id: 'mock-keyring-id-1',
      groupIndex: 0,
      derivationPath: '',
    },
  },
  methods: [...ETH_EOA_METHODS],
  type: EthAccountType.Eoa,
  scopes: [EthScope.Eoa],
  metadata: {
    name: 'Account 1',
    keyring: { type: KeyringTypes.hd },
    importTime: 0,
    lastSelected: 0,
    nameLastUpdatedAt: 0,
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

describe('BaseRule', () => {
  describe('getComputedAccountGroupName', () => {
    it('returns empty string when account is not found', () => {
      const rootMessenger = getRootMessenger();
      const messenger = getAccountTreeControllerMessenger(rootMessenger);
      const rule = new BaseRule(messenger);

      rootMessenger.registerActionHandler(
        'AccountsController:getAccount',
        () => undefined,
      );

      const group: AccountGroupObject = {
        id: toMultichainAccountGroupId(
          toMultichainAccountWalletId('test'),
          MOCK_HD_ACCOUNT_1.options.entropy.groupIndex,
        ),
        type: AccountGroupType.MultichainAccount,
        accounts: [MOCK_HD_ACCOUNT_1.id],
        metadata: {
          name: MOCK_HD_ACCOUNT_1.metadata.name,
          entropy: {
            groupIndex: MOCK_HD_ACCOUNT_1.options.entropy.groupIndex,
          },
          pinned: false,
          hidden: false,
        },
      };

      expect(rule.getComputedAccountGroupName(group)).toBe('');
    });

    it('returns account name when account is found', () => {
      const rootMessenger = getRootMessenger();
      const messenger = getAccountTreeControllerMessenger(rootMessenger);
      const rule = new BaseRule(messenger);

      rootMessenger.registerActionHandler(
        'AccountsController:getAccount',
        () => MOCK_HD_ACCOUNT_1,
      );

      const group: AccountGroupObject = {
        id: toMultichainAccountGroupId(
          toMultichainAccountWalletId('test'),
          MOCK_HD_ACCOUNT_1.options.entropy.groupIndex,
        ),
        type: AccountGroupType.MultichainAccount,
        accounts: [MOCK_HD_ACCOUNT_1.id],
        metadata: {
          name: MOCK_HD_ACCOUNT_1.metadata.name,
          entropy: {
            groupIndex: MOCK_HD_ACCOUNT_1.options.entropy.groupIndex,
          },
          pinned: false,
          hidden: false,
        },
      };

      expect(rule.getComputedAccountGroupName(group)).toBe(
        MOCK_HD_ACCOUNT_1.metadata.name,
      );
    });
  });

  describe('getDefaultAccountGroupName', () => {
    it('returns empty string when no index is provided', () => {
      const rootMessenger = getRootMessenger();
      const messenger = getAccountTreeControllerMessenger(rootMessenger);
      const rule = new BaseRule(messenger);

      const group: AccountGroupObject = {
        id: toMultichainAccountGroupId(
          toMultichainAccountWalletId('test'),
          MOCK_HD_ACCOUNT_1.options.entropy.groupIndex,
        ),
        type: AccountGroupType.MultichainAccount,
        accounts: [MOCK_HD_ACCOUNT_1.id],
        metadata: {
          name: MOCK_HD_ACCOUNT_1.metadata.name,
          entropy: {
            groupIndex: MOCK_HD_ACCOUNT_1.options.entropy.groupIndex,
          },
          pinned: false,
          hidden: false,
        },
      };

      expect(rule.getDefaultAccountGroupName()).toBe('');
    });

    it('returns formatted account name when index is provided', () => {
      const rootMessenger = getRootMessenger();
      const messenger = getAccountTreeControllerMessenger(rootMessenger);
      const rule = new BaseRule(messenger);

      const group: AccountGroupObject = {
        id: toMultichainAccountGroupId(
          toMultichainAccountWalletId('test'),
          MOCK_HD_ACCOUNT_1.options.entropy.groupIndex,
        ),
        type: AccountGroupType.MultichainAccount,
        accounts: [MOCK_HD_ACCOUNT_1.id],
        metadata: {
          name: MOCK_HD_ACCOUNT_1.metadata.name,
          entropy: {
            groupIndex: MOCK_HD_ACCOUNT_1.options.entropy.groupIndex,
          },
          pinned: false,
          hidden: false,
        },
      };

      expect(rule.getDefaultAccountGroupName(0)).toBe('Account 1');
      expect(rule.getDefaultAccountGroupName(1)).toBe('Account 2');
      expect(rule.getDefaultAccountGroupName(5)).toBe('Account 6');
    });
  });
});
