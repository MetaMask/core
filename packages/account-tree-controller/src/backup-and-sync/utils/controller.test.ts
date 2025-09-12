import { AccountWalletType, AccountGroupType } from '@metamask/account-api';

import {
  getLocalEntropyWallets,
  getLocalGroupsForEntropyWallet,
  createStateSnapshot,
  restoreStateFromSnapshot,
  type StateSnapshot,
  getLocalGroupForEntropyWallet,
} from './controller';
import type { AccountTreeController } from '../../AccountTreeController';
import type {
  AccountWalletEntropyObject,
  AccountWalletKeyringObject,
} from '../../wallet';
import type { BackupAndSyncContext } from '../types';

describe('BackupAndSyncUtils - Controller', () => {
  let mockContext: BackupAndSyncContext;
  let mockController: AccountTreeController;
  let mockControllerStateUpdateFn: jest.Mock;

  beforeEach(() => {
    mockControllerStateUpdateFn = jest.fn();

    mockController = {
      state: {
        accountTree: {
          wallets: {},
          selectedAccountGroup: '',
        },
        accountGroupsMetadata: {},
        accountWalletsMetadata: {},
      },
      init: jest.fn(),
    } as unknown as AccountTreeController;

    mockContext = {
      controller: mockController,
      controllerStateUpdateFn: mockControllerStateUpdateFn,
      messenger: {} as unknown as BackupAndSyncContext['messenger'],
      traceFn: jest.fn(),
      groupIdToWalletId: new Map(),
      emitAnalyticsEventFn: jest.fn(),
    };

    // Set up the mock implementation for controllerStateUpdateFn
    mockControllerStateUpdateFn.mockImplementation((updateFn) => {
      updateFn(mockController.state);
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getLocalEntropyWallets', () => {
    it('returns empty array when no wallets exist', () => {
      const result = getLocalEntropyWallets(mockContext);
      expect(result).toStrictEqual([]);
    });

    it('returns only entropy wallets', () => {
      const entropyWallet = {
        id: 'entropy:wallet-1',
        type: AccountWalletType.Entropy,
        name: 'Entropy Wallet',
        groups: {},
      } as unknown as AccountWalletEntropyObject;

      const keyringWallet = {
        id: 'keyring:wallet-2',
        type: AccountWalletType.Keyring,
        name: 'Keyring Wallet',
        groups: {},
      } as unknown as AccountWalletKeyringObject;

      mockController.state.accountTree.wallets = {
        'entropy:wallet-1': entropyWallet,
        'keyring:wallet-2': keyringWallet,
      };

      const result = getLocalEntropyWallets(mockContext);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(entropyWallet);
    });

    it('filters out non-entropy wallets correctly', () => {
      mockController.state.accountTree.wallets = {
        'entropy:wallet-1': {
          type: AccountWalletType.Entropy,
        } as unknown as AccountWalletEntropyObject,
        'keyring:wallet-2': {
          type: AccountWalletType.Keyring,
        } as unknown as AccountWalletKeyringObject,
        'entropy:wallet-3': {
          type: AccountWalletType.Entropy,
        } as unknown as AccountWalletEntropyObject,
      };

      const result = getLocalEntropyWallets(mockContext);
      expect(result).toHaveLength(2);
      expect(result.every((w) => w.type === AccountWalletType.Entropy)).toBe(
        true,
      );
    });
  });

  describe('getLocalGroupsForEntropyWallet', () => {
    it('returns empty array when wallet does not exist', () => {
      const result = getLocalGroupsForEntropyWallet(
        mockContext,
        'entropy:non-existent',
      );

      expect(result).toStrictEqual([]);
    });

    it('returns groups for entropy wallet', () => {
      const group = {
        id: 'entropy:wallet-1/group-1',
        type: AccountGroupType.MultichainAccount,
        name: 'Group 1',
        metadata: { entropy: { groupIndex: 0 } },
      };

      const entropyWallet = {
        id: 'entropy:wallet-1',
        type: AccountWalletType.Entropy,
        name: 'Entropy Wallet',
        groups: {
          'entropy:wallet-1/group-1': group,
        },
      } as unknown as AccountWalletEntropyObject;

      mockController.state.accountTree.wallets = {
        'entropy:wallet-1': entropyWallet,
      };

      const result = getLocalGroupsForEntropyWallet(
        mockContext,
        'entropy:wallet-1',
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(group);
    });

    it('returns empty array for wallet without groups', () => {
      const entropyWallet = {
        id: 'entropy:wallet-1',
        type: AccountWalletType.Entropy,
        name: 'Entropy Wallet',
        groups: {},
      } as unknown as AccountWalletEntropyObject;

      mockController.state.accountTree.wallets = {
        'entropy:wallet-1': entropyWallet,
      };

      const result = getLocalGroupsForEntropyWallet(
        mockContext,
        'entropy:wallet-1',
      );

      expect(result).toStrictEqual([]);
    });
  });

  describe('getLocalGroupForEntropyWallet', () => {
    it('returns undefined when wallet does not exist', () => {
      const result = getLocalGroupForEntropyWallet(
        mockContext,
        'entropy:non-existent',
        0,
      );

      expect(result).toBeUndefined();
    });

    it('returns undefined when wallet is not entropy type', () => {
      const keyringWallet = {
        id: 'keyring:wallet-2',
        type: AccountWalletType.Keyring,
        name: 'Keyring Wallet',
        groups: {},
      } as unknown as AccountWalletKeyringObject;

      mockController.state.accountTree.wallets = {
        'keyring:wallet-2': keyringWallet,
      };

      const result = getLocalGroupForEntropyWallet(mockContext, 'wallet-2', 0);

      expect(result).toBeUndefined();
    });

    it('returns group when it exists', () => {
      const group = {
        id: 'entropy:wallet-1/0',
        type: AccountGroupType.MultichainAccount,
        name: 'Group 0',
        metadata: { entropy: { groupIndex: 0 } },
      };

      const entropyWallet = {
        id: 'entropy:wallet-1',
        type: AccountWalletType.Entropy,
        name: 'Entropy Wallet',
        groups: {
          'entropy:wallet-1/0': group,
        },
      } as unknown as AccountWalletEntropyObject;

      mockController.state.accountTree.wallets = {
        'entropy:wallet-1': entropyWallet,
      };

      const result = getLocalGroupForEntropyWallet(mockContext, 'wallet-1', 0);

      expect(result).toBe(group);
    });

    it('returns undefined when group does not exist', () => {
      const entropyWallet = {
        id: 'entropy:wallet-1',
        type: AccountWalletType.Entropy,
        name: 'Entropy Wallet',
        groups: {},
      } as unknown as AccountWalletEntropyObject;

      mockController.state.accountTree.wallets = {
        'entropy:wallet-1': entropyWallet,
      };

      const result = getLocalGroupForEntropyWallet(mockContext, 'wallet-1', 0);

      expect(result).toBeUndefined();
    });
  });

  describe('createStateSnapshot', () => {
    it('creates a deep copy of state properties', () => {
      const originalState = {
        accountGroupsMetadata: { test: { name: 'Test' } },
        accountWalletsMetadata: { test: { name: 'Test' } },
        selectedAccountGroup: 'entropy:test-group/group' as const,
        wallets: {
          'entropy:test': { name: 'Test Wallet' },
        } as unknown as AccountWalletEntropyObject,
      };

      mockController.state.accountGroupsMetadata =
        originalState.accountGroupsMetadata;
      mockController.state.accountWalletsMetadata =
        originalState.accountWalletsMetadata;
      mockController.state.accountTree.selectedAccountGroup =
        originalState.selectedAccountGroup;
      mockController.state.accountTree.wallets = originalState.wallets;

      const snapshot = createStateSnapshot(mockContext);

      expect(snapshot.accountGroupsMetadata).toStrictEqual(
        originalState.accountGroupsMetadata,
      );
      expect(snapshot.accountWalletsMetadata).toStrictEqual(
        originalState.accountWalletsMetadata,
      );
      expect(snapshot.selectedAccountGroup).toBe(
        originalState.selectedAccountGroup,
      );
      expect(snapshot.accountTreeWallets).toStrictEqual(originalState.wallets);
    });

    it('creates independent copies (deep clone)', () => {
      const originalGroupsMetadata = {
        'entropy:test-group/test': {
          name: {
            value: 'Original',
            lastUpdatedAt: 1234567890,
          },
        },
      };

      mockController.state.accountGroupsMetadata = originalGroupsMetadata;

      const snapshot = createStateSnapshot(mockContext);

      // Modify original state
      mockController.state.accountGroupsMetadata[
        'entropy:test-group/test'
      ].name = {
        value: 'Modified',
        lastUpdatedAt: Date.now(),
      };

      // Snapshot should remain unchanged
      expect(
        snapshot.accountGroupsMetadata['entropy:test-group/test'].name,
      ).toStrictEqual({
        value: 'Original',
        lastUpdatedAt: 1234567890,
      });
    });
  });

  describe('restoreStateFromSnapshot', () => {
    let mockSnapshot: StateSnapshot;

    beforeEach(() => {
      mockSnapshot = {
        accountGroupsMetadata: { test: { name: 'Restored Group' } },
        accountWalletsMetadata: { test: { name: 'Restored Wallet' } },
        selectedAccountGroup: 'entropy:restored-group/group',
        accountTreeWallets: {
          'entropy:test': { name: 'Restored Wallet Object' },
        },
      } as unknown as StateSnapshot;
    });

    it('restores all snapshot properties to state', () => {
      restoreStateFromSnapshot(mockContext, mockSnapshot);

      expect(mockController.state.accountGroupsMetadata).toStrictEqual(
        mockSnapshot.accountGroupsMetadata,
      );
      expect(mockController.state.accountWalletsMetadata).toStrictEqual(
        mockSnapshot.accountWalletsMetadata,
      );
      expect(
        mockController.state.accountTree.selectedAccountGroup,
      ).toStrictEqual(mockSnapshot.selectedAccountGroup);
      expect(mockController.state.accountTree.wallets).toStrictEqual(
        mockSnapshot.accountTreeWallets,
      );
    });

    it('calls controllerStateUpdateFn with update function', () => {
      restoreStateFromSnapshot(mockContext, mockSnapshot);

      expect(mockControllerStateUpdateFn).toHaveBeenCalledTimes(1);
      expect(mockControllerStateUpdateFn).toHaveBeenCalledWith(
        expect.any(Function),
      );
    });

    it('calls controller.init() after state restoration', () => {
      restoreStateFromSnapshot(mockContext, mockSnapshot);

      expect(mockController.init).toHaveBeenCalledTimes(1);
    });

    it('calls init after state update', () => {
      const callOrder: string[] = [];

      mockControllerStateUpdateFn.mockImplementation((updateFn) => {
        callOrder.push('updateFn');
        updateFn(mockController.state);
      });

      (mockController.init as jest.Mock).mockImplementation(() => {
        callOrder.push('init');
      });

      restoreStateFromSnapshot(mockContext, mockSnapshot);

      expect(callOrder).toStrictEqual(['updateFn', 'init']);
    });
  });
});
