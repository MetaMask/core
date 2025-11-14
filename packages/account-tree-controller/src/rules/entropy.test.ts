import type { Bip44Account } from '@metamask/account-api';
import {
  AccountGroupType,
  toMultichainAccountGroupId,
  toMultichainAccountWalletId,
} from '@metamask/account-api';
import {
  EthAccountType,
  EthMethod,
  EthScope,
  KeyringAccountEntropyTypeOption,
  SolAccountType,
} from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { AccountWalletEntropyObject } from 'src/wallet';

import { EntropyRule } from './entropy';
import {
  getAccountTreeControllerMessenger,
  getRootMessenger,
} from '../../tests/mockMessenger';
import type { AccountGroupObjectOf } from '../group';

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

describe('EntropyRule', () => {
  describe('getComputedAccountGroupName', () => {
    it('uses BaseRule implementation', () => {
      const messenger = getRootMessenger();
      const accountTreeControllerMessenger =
        getAccountTreeControllerMessenger(messenger);
      const rule = new EntropyRule(accountTreeControllerMessenger);

      messenger.registerActionHandler(
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
      const messenger = getRootMessenger();
      const accountTreeControllerMessenger =
        getAccountTreeControllerMessenger(messenger);
      const rule = new EntropyRule(accountTreeControllerMessenger);

      messenger.registerActionHandler(
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

  describe('getDefaultAccountGroupPrefix', () => {
    it('returns formatted account name prefix', () => {
      const rootMessenger = getRootMessenger();
      const messenger = getAccountTreeControllerMessenger(rootMessenger);
      const rule = new EntropyRule(messenger);
      // The entropy wallet object is not used here.
      const wallet = {} as unknown as AccountWalletEntropyObject;

      expect(rule.getDefaultAccountGroupPrefix(wallet)).toBe('Account');
    });

    it('getComputedAccountGroupName returns account name with EVM priority', () => {
      const messenger = getRootMessenger();
      const accountTreeControllerMessenger =
        getAccountTreeControllerMessenger(messenger);
      const rule = new EntropyRule(accountTreeControllerMessenger);

      const mockEvmAccount: InternalAccount = {
        ...MOCK_HD_ACCOUNT_1,
        id: 'evm-account-id',
        type: EthAccountType.Eoa,
        metadata: {
          ...MOCK_HD_ACCOUNT_1.metadata,
          name: 'EVM Account',
        },
      };

      messenger.registerActionHandler(
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
      const messenger = getRootMessenger();
      const accountTreeControllerMessenger =
        getAccountTreeControllerMessenger(messenger);
      const rule = new EntropyRule(accountTreeControllerMessenger);

      messenger.registerActionHandler(
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
      const messenger = getRootMessenger();
      const accountTreeControllerMessenger =
        getAccountTreeControllerMessenger(messenger);
      const rule = new EntropyRule(accountTreeControllerMessenger);

      const mockSolanaAccount: InternalAccount = {
        ...MOCK_HD_ACCOUNT_1,
        id: 'solana-account-id',
        type: SolAccountType.DataAccount,
        metadata: {
          ...MOCK_HD_ACCOUNT_1.metadata,
          name: 'Solana Account 2', // This should NOT bubble up as group name
        },
      };

      messenger.registerActionHandler(
        'AccountsController:getAccount',
        (accountId: string) => {
          const accounts: Record<string, InternalAccount> = {
            'solana-account-id': mockSolanaAccount,
          };
          return accounts[accountId];
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
        type: SolAccountType.DataAccount,
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
          const accounts: Record<string, InternalAccount> = {
            'solana-account-id': mockSolanaAccount,
            'evm-account-id': mockEvmAccount,
          };
          return accounts[accountId];
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
