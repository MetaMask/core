import {
  AccountGroupType,
  toAccountGroupId,
  toAccountWalletId,
  AccountWalletType,
} from '@metamask/account-api';
import { EthAccountType, EthMethod, EthScope } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import { KeyringRule, getAccountWalletNameFromKeyringType } from './keyring';
import {
  getAccountTreeControllerMessenger,
  getRootMessenger,
} from '../../tests/mockMessenger';
import type { AccountGroupObjectOf } from '../group';
import type {
  AccountWalletKeyringObject,
  AccountWalletObjectOf,
} from '../wallet';

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

    describe('getComputedAccountGroupName', () => {
      it('uses BaseRule implementation', () => {
        const messenger = getRootMessenger();
        const accountTreeControllerMessenger =
          getAccountTreeControllerMessenger(messenger);
        const rule = new KeyringRule(accountTreeControllerMessenger);

        messenger.registerActionHandler(
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
        const messenger = getRootMessenger();
        const accountTreeControllerMessenger =
          getAccountTreeControllerMessenger(messenger);
        const rule = new KeyringRule(accountTreeControllerMessenger);

        messenger.registerActionHandler(
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

    describe('getDefaultAccountGroupPrefix', () => {
      it.each([
        [KeyringTypes.lattice, 'Lattice Account'],
        [KeyringTypes.ledger, 'Ledger Account'],
        [KeyringTypes.oneKey, 'OneKey Account'],
        [KeyringTypes.qr, 'QR Account'],
        [KeyringTypes.trezor, 'Trezor Account'],
        [KeyringTypes.simple, 'Imported Account'],
        ['unknown', 'Unknown Account'],
      ])(
        'returns default name prefix for "$0" to be "$1"',
        (type, expectedPrefix) => {
          const rootMessenger = getRootMessenger();
          const messenger = getAccountTreeControllerMessenger(rootMessenger);
          const rule = new KeyringRule(messenger);

          const wallet = {
            metadata: {
              keyring: {
                type,
              },
            },
          } as unknown as AccountWalletKeyringObject;

          expect(rule.getDefaultAccountGroupPrefix(wallet)).toBe(
            expectedPrefix,
          );
        },
      );

      it('getComputedAccountGroupName returns computed name from base class', () => {
        const messenger = getRootMessenger();
        const accountTreeControllerMessenger =
          getAccountTreeControllerMessenger(messenger);
        const rule = new KeyringRule(accountTreeControllerMessenger);

        // Mock the AccountsController to always return the account
        messenger.registerActionHandler(
          'AccountsController:getAccount',
          () => MOCK_HARDWARE_ACCOUNT_1,
        );

        const group: AccountGroupObjectOf<AccountGroupType.SingleAccount> = {
          id: toAccountGroupId(
            toAccountWalletId(
              AccountWalletType.Keyring,
              MOCK_HARDWARE_ACCOUNT_1.metadata.keyring.type,
            ),
            MOCK_HARDWARE_ACCOUNT_1.id,
          ),
          type: AccountGroupType.SingleAccount,
          accounts: [MOCK_HARDWARE_ACCOUNT_1.id],
          metadata: {
            name: '',
            pinned: false,
            hidden: false,
          },
        };

        // Should return the account's metadata name since it exists and is non-empty
        const computedName = rule.getComputedAccountGroupName(group);
        expect(computedName).toBe(MOCK_HARDWARE_ACCOUNT_1.metadata.name);
      });

      it('getComputedAccountGroupName returns empty string when account not found', () => {
        const messenger = getRootMessenger();
        const accountTreeControllerMessenger =
          getAccountTreeControllerMessenger(messenger);
        const rule = new KeyringRule(accountTreeControllerMessenger);

        // Mock the AccountsController to return undefined (account not found)
        messenger.registerActionHandler(
          'AccountsController:getAccount',
          () => undefined,
        );

        const group: AccountGroupObjectOf<AccountGroupType.SingleAccount> = {
          id: toAccountGroupId(
            toAccountWalletId(
              AccountWalletType.Keyring,
              MOCK_HARDWARE_ACCOUNT_1.metadata.keyring.type,
            ),
            'non-existent-account-id',
          ),
          type: AccountGroupType.SingleAccount,
          accounts: ['non-existent-account-id'],
          metadata: {
            name: '',
            pinned: false,
            hidden: false,
          },
        };

        const computedName = rule.getComputedAccountGroupName(group);
        expect(computedName).toBe('');
      });

      it('getDefaultAccountWalletName returns wallet name based on keyring type', () => {
        const messenger = getRootMessenger();
        const accountTreeControllerMessenger =
          getAccountTreeControllerMessenger(messenger);
        const rule = new KeyringRule(accountTreeControllerMessenger);

        const hdWallet: AccountWalletObjectOf<AccountWalletType.Keyring> = {
          id: toAccountWalletId(AccountWalletType.Keyring, KeyringTypes.hd),
          type: AccountWalletType.Keyring,
          status: 'ready',
          groups: {},
          metadata: {
            name: '',
            keyring: { type: KeyringTypes.hd },
          },
        };

        const ledgerWallet: AccountWalletObjectOf<AccountWalletType.Keyring> = {
          id: toAccountWalletId(AccountWalletType.Keyring, KeyringTypes.ledger),
          type: AccountWalletType.Keyring,
          status: 'ready',
          groups: {},
          metadata: {
            name: '',
            keyring: { type: KeyringTypes.ledger },
          },
        };

        const trezorWallet: AccountWalletObjectOf<AccountWalletType.Keyring> = {
          id: toAccountWalletId(AccountWalletType.Keyring, KeyringTypes.trezor),
          type: AccountWalletType.Keyring,
          status: 'ready',
          groups: {},
          metadata: {
            name: '',
            keyring: { type: KeyringTypes.trezor },
          },
        };

        expect(rule.getDefaultAccountWalletName(hdWallet)).toBe('HD Wallet');
        expect(rule.getDefaultAccountWalletName(ledgerWallet)).toBe('Ledger');
        expect(rule.getDefaultAccountWalletName(trezorWallet)).toBe('Trezor');
      });
    });
  });
});
