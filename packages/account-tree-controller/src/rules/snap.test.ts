import {
  AccountGroupType,
  toAccountGroupId,
  toAccountWalletId,
  AccountWalletType,
} from '@metamask/account-api';
import { Messenger } from '@metamask/base-controller';
import {
  EthAccountType,
  EthMethod,
  EthScope,
} from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import { SnapRule } from './snap';
import type {
  AccountTreeControllerMessenger,
  AccountTreeControllerActions,
  AccountTreeControllerEvents,
  AllowedActions,
  AllowedEvents,
} from '../types';
import type { AccountGroupObjectOf } from '../group';
import type { AccountWalletObjectOf } from '../wallet';

const ETH_EOA_METHODS = [
  EthMethod.PersonalSign,
  EthMethod.Sign,
  EthMethod.SignTransaction,
  EthMethod.SignTypedDataV1,
  EthMethod.SignTypedDataV3,
  EthMethod.SignTypedDataV4,
] as const;

const MOCK_SNAP_1 = {
  id: 'npm:@metamask/test-snap' as any,
  manifest: {
    proposedName: 'Test Snap',
  },
  initialPermissions: {},
  version: '1.0.0',
  enabled: true,
  blocked: false,
};

const MOCK_SNAP_ACCOUNT_1: InternalAccount = {
  id: 'mock-snap-account-id-1',
  address: '0xABC',
  options: {},
  methods: [...ETH_EOA_METHODS],
  type: EthAccountType.Eoa,
  scopes: [EthScope.Eoa],
  metadata: {
    name: 'Snap Account 1',
    keyring: { type: KeyringTypes.snap },
    snap: { name: 'Test Snap', id: MOCK_SNAP_1.id, enabled: true },
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
    it('returns computed name from base class', () => {
      const rootMessenger = getRootMessenger();
      const messenger = getAccountTreeControllerMessenger(rootMessenger);
      const rule = new SnapRule(messenger);

      // Mock the AccountsController to return an account
      rootMessenger.registerActionHandler(
        'AccountsController:getAccount',
        (accountId: string) => {
          if (accountId === MOCK_SNAP_ACCOUNT_1.id) {
            return MOCK_SNAP_ACCOUNT_1;
          }
          return undefined;
        },
      );

      const group: AccountGroupObjectOf<AccountGroupType.SingleAccount> = {
        id: toAccountGroupId(
          toAccountWalletId(AccountWalletType.Snap, MOCK_SNAP_1.id),
          MOCK_SNAP_ACCOUNT_1.id,
        ),
        type: AccountGroupType.SingleAccount,
        accounts: [MOCK_SNAP_ACCOUNT_1.id],
        metadata: {
          name: '',
          pinned: false,
          hidden: false,
        },
      };

      // Should return the account's metadata name since it exists and is non-empty
      const computedName = rule.getComputedAccountGroupName(group);
      expect(computedName).toBe(MOCK_SNAP_ACCOUNT_1.metadata.name);
    });

    it('returns empty string when account not found', () => {
      const rootMessenger = getRootMessenger();
      const messenger = getAccountTreeControllerMessenger(rootMessenger);
      const rule = new SnapRule(messenger);

      // Mock the AccountsController to return undefined (account not found)
      rootMessenger.registerActionHandler(
        'AccountsController:getAccount',
        () => undefined,
      );

      const group: AccountGroupObjectOf<AccountGroupType.SingleAccount> = {
        id: toAccountGroupId(
          toAccountWalletId(AccountWalletType.Snap, MOCK_SNAP_1.id),
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
  });

  describe('getDefaultAccountGroupName', () => {
    it('returns default name from base class based on index', () => {
      const rootMessenger = getRootMessenger();
      const messenger = getAccountTreeControllerMessenger(rootMessenger);
      const rule = new SnapRule(messenger);

      const group: AccountGroupObjectOf<AccountGroupType.SingleAccount> = {
        id: toAccountGroupId(
          toAccountWalletId(AccountWalletType.Snap, MOCK_SNAP_1.id),
          MOCK_SNAP_ACCOUNT_1.id,
        ),
        type: AccountGroupType.SingleAccount,
        accounts: [MOCK_SNAP_ACCOUNT_1.id],
        metadata: {
          name: MOCK_SNAP_ACCOUNT_1.metadata.name,
          pinned: false,
          hidden: false,
        },
      };

      expect(rule.getDefaultAccountGroupName(group, 0)).toBe('Account 1');
      expect(rule.getDefaultAccountGroupName(group, 1)).toBe('Account 2');
      expect(rule.getDefaultAccountGroupName(group, 5)).toBe('Account 6');
    });
  });

  describe('getDefaultAccountWalletName', () => {
    it('returns snap proposed name when available', () => {
      const rootMessenger = getRootMessenger();
      const messenger = getAccountTreeControllerMessenger(rootMessenger);
      const rule = new SnapRule(messenger);

      // Mock SnapController to return snap with proposed name
      rootMessenger.registerActionHandler(
        'SnapController:get',
        (snapId: string) => {
          if (snapId === MOCK_SNAP_1.id) {
            return MOCK_SNAP_1 as any;
          }
          return undefined;
        },
      );

      const wallet: AccountWalletObjectOf<AccountWalletType.Snap> = {
        id: toAccountWalletId(AccountWalletType.Snap, MOCK_SNAP_1.id),
        type: AccountWalletType.Snap,
        groups: {},
        metadata: {
          name: '',
          snap: { id: MOCK_SNAP_1.id as any },
        },
      };

      expect(rule.getDefaultAccountWalletName(wallet)).toBe('Test Snap');
    });

    it('returns cleaned snap ID when no proposed name available', () => {
      const rootMessenger = getRootMessenger();
      const messenger = getAccountTreeControllerMessenger(rootMessenger);
      const rule = new SnapRule(messenger);

      const snapWithoutProposedName = {
        id: 'npm:@metamask/example-snap' as any,
        manifest: {
          // No proposedName
        },
        initialPermissions: {},
        version: '1.0.0',
        enabled: true,
        blocked: false,
      };

      // Mock SnapController to return snap without proposed name
      rootMessenger.registerActionHandler(
        'SnapController:get',
        (snapId: string) => {
          if (snapId === snapWithoutProposedName.id) {
            return snapWithoutProposedName as any;
          }
          return undefined;
        },
      );

      const wallet: AccountWalletObjectOf<AccountWalletType.Snap> = {
        id: toAccountWalletId(AccountWalletType.Snap, snapWithoutProposedName.id),
        type: AccountWalletType.Snap,
        groups: {},
        metadata: {
          name: '',
          snap: { id: snapWithoutProposedName.id as any },
        },
      };

      // Should strip "npm:" prefix and return clean name
      expect(rule.getDefaultAccountWalletName(wallet)).toBe(undefined);
    });

    it('returns cleaned snap ID when snap not found', () => {
      const rootMessenger = getRootMessenger();
      const messenger = getAccountTreeControllerMessenger(rootMessenger);
      const rule = new SnapRule(messenger);

      // Mock SnapController to return undefined (snap not found)
      rootMessenger.registerActionHandler(
        'SnapController:get',
        () => undefined,
      );

      const snapId = 'npm:@metamask/missing-snap';
      const wallet: AccountWalletObjectOf<AccountWalletType.Snap> = {
        id: toAccountWalletId(AccountWalletType.Snap, snapId),
        type: AccountWalletType.Snap,
        groups: {},
        metadata: {
          name: '',
          snap: { id: snapId as any },
        },
      };

      // Should strip "npm:" prefix and return clean name
      expect(rule.getDefaultAccountWalletName(wallet)).toBe('@metamask/missing-snap');
    });
  });
});