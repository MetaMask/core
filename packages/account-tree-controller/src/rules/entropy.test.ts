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

import { EntropyRule } from './entropy';
import type { AccountGroupObjectOf } from '../group';
import type {
  AccountTreeControllerMessenger,
  AccountTreeControllerActions,
  AccountTreeControllerEvents,
  AllowedActions,
  AllowedEvents,
} from '../types';

const ETH_EOA_METHODS = [
  EthMethod.PersonalSign,
  EthMethod.Sign,
  EthMethod.SignTransaction,
  EthMethod.SignTypedDataV1,
  EthMethod.SignTypedDataV3,
  EthMethod.SignTypedDataV4,
] as const;

const MOCK_HD_KEYRING_1 = {
  type: KeyringTypes.hd,
  metadata: { id: 'mock-keyring-id-1', name: 'HD Keyring 1' },
  accounts: ['0x123'],
};

const MOCK_HD_ACCOUNT_1: Bip44Account<InternalAccount> = {
  id: 'mock-id-1',
  address: '0x123',
  options: {
    entropy: {
      type: KeyringAccountEntropyTypeOption.Mnemonic,
      id: MOCK_HD_KEYRING_1.metadata.id,
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

describe('EntropyRule', () => {
  describe('getComputedAccountGroupName', () => {
    it('uses BaseRule implementation', () => {
      const rootMessenger = getRootMessenger();
      const messenger = getAccountTreeControllerMessenger(rootMessenger);
      const rule = new EntropyRule(messenger);

      rootMessenger.registerActionHandler(
        'AccountsController:getAccount',
        () => MOCK_HD_ACCOUNT_1,
      );

      const group: AccountGroupObjectOf<AccountGroupType.MultichainAccount> = {
        id: toMultichainAccountGroupId(
          toMultichainAccountWalletId(MOCK_HD_KEYRING_1.metadata.id),
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

    it('returns empty string when account is not found', () => {
      const rootMessenger = getRootMessenger();
      const messenger = getAccountTreeControllerMessenger(rootMessenger);
      const rule = new EntropyRule(messenger);

      rootMessenger.registerActionHandler(
        'AccountsController:getAccount',
        () => undefined,
      );

      const group: AccountGroupObjectOf<AccountGroupType.MultichainAccount> = {
        id: toMultichainAccountGroupId(
          toMultichainAccountWalletId(MOCK_HD_KEYRING_1.metadata.id),
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
  });

  describe('getDefaultAccountGroupName', () => {
    it('returns formatted account name based on index', () => {
      const rootMessenger = getRootMessenger();
      const messenger = getAccountTreeControllerMessenger(rootMessenger);
      const rule = new EntropyRule(messenger);

      const group: AccountGroupObjectOf<AccountGroupType.MultichainAccount> = {
        id: toMultichainAccountGroupId(
          toMultichainAccountWalletId(MOCK_HD_KEYRING_1.metadata.id),
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

      // Use group in a no-op assertion to silence unused variable
      expect(group.id).toBeDefined();
      expect(rule.getDefaultAccountGroupName(0)).toBe('Account 1');
      expect(rule.getDefaultAccountGroupName(1)).toBe('Account 2');
      expect(rule.getDefaultAccountGroupName(5)).toBe('Account 6');
    });

    it('getComputedAccountGroupName returns account name with EVM priority', () => {
      const rootMessenger = getRootMessenger();
      const messenger = getAccountTreeControllerMessenger(rootMessenger);
      const rule = new EntropyRule(messenger);

      const mockEvmAccount: InternalAccount = {
        ...MOCK_HD_ACCOUNT_1,
        id: 'evm-account-id',
        type: EthAccountType.Eoa,
        metadata: {
          ...MOCK_HD_ACCOUNT_1.metadata,
          name: 'EVM Account',
        },
      };

      rootMessenger.registerActionHandler(
        'AccountsController:getAccount',
        () => mockEvmAccount,
      );

      const group: AccountGroupObjectOf<AccountGroupType.MultichainAccount> = {
        id: toMultichainAccountGroupId(
          toMultichainAccountWalletId(MOCK_HD_ACCOUNT_1.options.entropy.id),
          MOCK_HD_ACCOUNT_1.options.entropy.groupIndex,
        ),
        type: AccountGroupType.MultichainAccount,
        accounts: [mockEvmAccount.id],
        metadata: {
          name: '',
          entropy: {
            groupIndex: MOCK_HD_ACCOUNT_1.options.entropy.groupIndex,
          },
          pinned: false,
          hidden: false,
        },
      };

      expect(rule.getComputedAccountGroupName(group)).toBe('EVM Account');
    });

    it('getComputedAccountGroupName returns empty string when no accounts found', () => {
      const rootMessenger = getRootMessenger();
      const messenger = getAccountTreeControllerMessenger(rootMessenger);
      const rule = new EntropyRule(messenger);

      rootMessenger.registerActionHandler(
        'AccountsController:getAccount',
        () => undefined,
      );

      const group: AccountGroupObjectOf<AccountGroupType.MultichainAccount> = {
        id: toMultichainAccountGroupId(
          toMultichainAccountWalletId(MOCK_HD_ACCOUNT_1.options.entropy.id),
          MOCK_HD_ACCOUNT_1.options.entropy.groupIndex,
        ),
        type: AccountGroupType.MultichainAccount,
        accounts: ['non-existent-account'],
        metadata: {
          name: '',
          entropy: {
            groupIndex: MOCK_HD_ACCOUNT_1.options.entropy.groupIndex,
          },
          pinned: false,
          hidden: false,
        },
      };

      expect(rule.getComputedAccountGroupName(group)).toBe('');
    });

    it('getComputedAccountGroupName returns empty string for non-EVM accounts to prevent chain-specific names', () => {
      const rootMessenger = getRootMessenger();
      const messenger = getAccountTreeControllerMessenger(rootMessenger);
      const rule = new EntropyRule(messenger);

      // Mock a non-EVM account (like Solana) that would have caused the bug
      const mockSolanaAccount: InternalAccount = {
        ...MOCK_HD_ACCOUNT_1,
        id: 'solana-account-id',
        type: 'solana:data-account' as any, // Non-EVM account type
        metadata: {
          ...MOCK_HD_ACCOUNT_1.metadata,
          name: 'Solana Account 2', // This should NOT bubble up as group name
        },
      };

      rootMessenger.registerActionHandler(
        'AccountsController:getAccount',
        (accountId: string) => {
          if (accountId === 'solana-account-id') {
            return mockSolanaAccount;
          }
          return undefined;
        },
      );

      const group: AccountGroupObjectOf<AccountGroupType.MultichainAccount> = {
        id: toMultichainAccountGroupId(
          toMultichainAccountWalletId(MOCK_HD_ACCOUNT_1.options.entropy.id),
          MOCK_HD_ACCOUNT_1.options.entropy.groupIndex,
        ),
        type: AccountGroupType.MultichainAccount,
        accounts: [mockSolanaAccount.id],
        metadata: {
          name: '',
          entropy: {
            groupIndex: MOCK_HD_ACCOUNT_1.options.entropy.groupIndex,
          },
          pinned: false,
          hidden: false,
        },
      };

      // Should return empty string, not "Solana Account 2", to fallback to default naming
      expect(rule.getComputedAccountGroupName(group)).toBe('');
    });

    it('getComputedAccountGroupName returns EVM name even when non-EVM accounts are present first', () => {
      const rootMessenger = getRootMessenger();
      const messenger = getAccountTreeControllerMessenger(rootMessenger);
      const rule = new EntropyRule(messenger);

      const mockSolanaAccount: InternalAccount = {
        ...MOCK_HD_ACCOUNT_1,
        id: 'solana-account-id',
        type: 'solana:data-account' as any,
        metadata: {
          ...MOCK_HD_ACCOUNT_1.metadata,
          name: 'Solana Account 2',
        },
      };

      const mockEvmAccount: InternalAccount = {
        ...MOCK_HD_ACCOUNT_1,
        id: 'evm-account-id',
        type: EthAccountType.Eoa,
        metadata: {
          ...MOCK_HD_ACCOUNT_1.metadata,
          name: 'Main Account',
        },
      };

      rootMessenger.registerActionHandler(
        'AccountsController:getAccount',
        (accountId: string) => {
          if (accountId === 'solana-account-id') {
            return mockSolanaAccount;
          }
          if (accountId === 'evm-account-id') {
            return mockEvmAccount;
          }
          return undefined;
        },
      );

      const group: AccountGroupObjectOf<AccountGroupType.MultichainAccount> = {
        id: toMultichainAccountGroupId(
          toMultichainAccountWalletId(MOCK_HD_ACCOUNT_1.options.entropy.id),
          MOCK_HD_ACCOUNT_1.options.entropy.groupIndex,
        ),
        type: AccountGroupType.MultichainAccount,
        accounts: [mockSolanaAccount.id, mockEvmAccount.id], // Solana first, EVM second
        metadata: {
          name: '',
          entropy: {
            groupIndex: MOCK_HD_ACCOUNT_1.options.entropy.groupIndex,
          },
          pinned: false,
          hidden: false,
        },
      };

      // Should return EVM account name, not Solana account name
      expect(rule.getComputedAccountGroupName(group)).toBe('Main Account');
    });
  });
});
