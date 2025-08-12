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
import { KeyringRule, getAccountWalletNameFromKeyringType } from './keyring';

describe('keyring', () => {
  describe('getAccountWalletNameFromKeyringType', () => {
    it.each(Object.values(KeyringTypes))(
      'computes wallet name from: %s',
      (type) => {
        const name = getAccountWalletNameFromKeyringType(type as KeyringTypes);

        expect(name).toBeDefined();
        expect(name.length).toBeGreaterThan(0);
      },
    );

    it('defaults to "Unknown" if keyring type is not known', () => {
      const name = getAccountWalletNameFromKeyringType(
        'Not A Keyring Type' as KeyringTypes,
      );

      expect(name).toBe('Unknown');
      expect(name.length).toBeGreaterThan(0);
    });
  });

  describe('KeyringRule', () => {
    const ETH_EOA_METHODS = [
      EthMethod.PersonalSign,
      EthMethod.Sign,
      EthMethod.SignTransaction,
      EthMethod.SignTypedDataV1,
      EthMethod.SignTypedDataV3,
      EthMethod.SignTypedDataV4,
    ] as const;

    const MOCK_HARDWARE_ACCOUNT_1: InternalAccount = {
      id: 'mock-hardware-id-1',
      address: '0xABC',
      options: {},
      methods: [...ETH_EOA_METHODS],
      type: EthAccountType.Eoa,
      scopes: [EthScope.Eoa],
      metadata: {
        name: 'Hardware Acc 1',
        keyring: { type: KeyringTypes.ledger },
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

    describe('getComputedAccountGroupName', () => {
      it('uses BaseRule implementation', () => {
        const rootMessenger = getRootMessenger();
        const messenger = getAccountTreeControllerMessenger(rootMessenger);
        const rule = new KeyringRule(messenger);

        rootMessenger.registerActionHandler(
          'AccountsController:getAccount',
          () => MOCK_HARDWARE_ACCOUNT_1,
        );

        const group: AccountGroupObjectOf<AccountGroupType.SingleAccount> = {
          id: toAccountGroupId(
            toAccountWalletId(AccountWalletType.Keyring, KeyringTypes.ledger),
            MOCK_HARDWARE_ACCOUNT_1.address,
          ),
          type: AccountGroupType.SingleAccount,
          accounts: [MOCK_HARDWARE_ACCOUNT_1.id],
          metadata: {
            name: MOCK_HARDWARE_ACCOUNT_1.metadata.name,
            pinned: false,
            hidden: false,
          },
        };

        expect(rule.getComputedAccountGroupName(group)).toBe(
          MOCK_HARDWARE_ACCOUNT_1.metadata.name,
        );
      });

      it('returns empty string when account is not found', () => {
        const rootMessenger = getRootMessenger();
        const messenger = getAccountTreeControllerMessenger(rootMessenger);
        const rule = new KeyringRule(messenger);

        rootMessenger.registerActionHandler(
          'AccountsController:getAccount',
          () => undefined,
        );

        const group: AccountGroupObjectOf<AccountGroupType.SingleAccount> = {
          id: toAccountGroupId(
            toAccountWalletId(AccountWalletType.Keyring, KeyringTypes.ledger),
            MOCK_HARDWARE_ACCOUNT_1.address,
          ),
          type: AccountGroupType.SingleAccount,
          accounts: [MOCK_HARDWARE_ACCOUNT_1.id],
          metadata: {
            name: MOCK_HARDWARE_ACCOUNT_1.metadata.name,
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
        const rule = new KeyringRule(messenger);

        const group: AccountGroupObjectOf<AccountGroupType.SingleAccount> = {
          id: toAccountGroupId(
            toAccountWalletId(AccountWalletType.Keyring, KeyringTypes.ledger),
            MOCK_HARDWARE_ACCOUNT_1.address,
          ),
          type: AccountGroupType.SingleAccount,
          accounts: [MOCK_HARDWARE_ACCOUNT_1.id],
          metadata: {
            name: MOCK_HARDWARE_ACCOUNT_1.metadata.name,
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
});
