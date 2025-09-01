import { AccountWalletType, AccountGroupType } from '@metamask/account-api';

import type { BackupAndSyncContext } from '../types';
import {
  getLocalEntropyWallets,
  getLocalGroupsForEntropyWallet,
  createStateSnapshot,
  restoreStateFromSnapshot,
  type StateSnapshot,
} from './controller';
import { contextualLogger } from './contextual-logger';

// Mock the contextual logger
jest.mock('./contextual-logger', () => ({
  contextualLogger: {
    warn: jest.fn(),
    log: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('BackupAndSyncUtils - Controller', () => {
  let mockContext: BackupAndSyncContext;
  let mockController: any;
  let mockControllerStateUpdateFn: jest.Mock;

  beforeEach(() => {
    mockControllerStateUpdateFn = jest.fn();

    mockController = {
      state: {
        accountTree: {
          wallets: {},
          selectedAccountGroup: null,
        },
        accountGroupsMetadata: {},
        accountWalletsMetadata: {},
      },
      init: jest.fn(),
    };

    mockContext = {
      controller: mockController,
      controllerStateUpdateFn: mockControllerStateUpdateFn,
      messenger: {} as any,
      traceFn: jest.fn(),
      groupIdToWalletId: new Map(),
      emitAnalyticsEventFn: jest.fn(),
      enableDebugLogging: false,
      disableMultichainAccountSyncing: false,
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
    it('should return empty array when no wallets exist', () => {
      const result = getLocalEntropyWallets(mockContext);
      expect(result).toEqual([]);
    });

    it('should return only entropy wallets', () => {
      const entropyWallet = {
        id: 'entropy:wallet-1' as any,
        type: AccountWalletType.Entropy,
        name: 'Entropy Wallet',
        groups: {},
      };

      const keyringWallet = {
        id: 'keyring:wallet-2' as any,
        type: AccountWalletType.Keyring,
        name: 'Keyring Wallet',
        groups: {},
      };

      mockController.state.accountTree.wallets = {
        'entropy:wallet-1': entropyWallet,
        'keyring:wallet-2': keyringWallet,
      };

      const result = getLocalEntropyWallets(mockContext);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(entropyWallet);
    });

    it('should filter out non-entropy wallets correctly', () => {
      mockController.state.accountTree.wallets = {
        'entropy:wallet-1': {
          type: AccountWalletType.Entropy,
          name: 'Entropy 1',
        },
        'keyring:wallet-2': {
          type: AccountWalletType.Keyring,
          name: 'Keyring 1',
        },
        'entropy:wallet-3': {
          type: AccountWalletType.Entropy,
          name: 'Entropy 2',
        },
      };

      const result = getLocalEntropyWallets(mockContext);
      expect(result).toHaveLength(2);
      expect(result.every((w) => w.type === AccountWalletType.Entropy)).toBe(
        true,
      );
    });
  });

  describe('getLocalGroupsForEntropyWallet', () => {
    it('should return empty array when wallet does not exist', () => {
      mockContext.enableDebugLogging = true;

      const result = getLocalGroupsForEntropyWallet(
        mockContext,
        'entropy:non-existent' as any,
      );

      expect(result).toEqual([]);
      expect(contextualLogger.warn).toHaveBeenCalled();
    });

    it('should return groups for entropy wallet', () => {
      const group = {
        id: 'entropy:wallet-1/group-1' as any,
        type: AccountGroupType.MultichainAccount,
        name: 'Group 1',
        metadata: { entropy: { groupIndex: 0 } },
      };

      const entropyWallet = {
        id: 'entropy:wallet-1' as any,
        type: AccountWalletType.Entropy,
        name: 'Entropy Wallet',
        groups: {
          'entropy:wallet-1/group-1': group,
        },
      };

      mockController.state.accountTree.wallets = {
        'entropy:wallet-1': entropyWallet,
      };

      const result = getLocalGroupsForEntropyWallet(
        mockContext,
        'entropy:wallet-1' as any,
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(group);
    });

    it('should return empty array for wallet without groups', () => {
      const entropyWallet = {
        id: 'entropy:wallet-1' as any,
        type: AccountWalletType.Entropy,
        name: 'Entropy Wallet',
        groups: {},
      };

      mockController.state.accountTree.wallets = {
        'entropy:wallet-1': entropyWallet,
      };

      const result = getLocalGroupsForEntropyWallet(
        mockContext,
        'entropy:wallet-1' as any,
      );

      expect(result).toEqual([]);
    });
  });

  describe('createStateSnapshot', () => {
    it('should create a deep copy of state properties', () => {
      const originalState = {
        accountGroupsMetadata: { test: { name: 'Test' } },
        accountWalletsMetadata: { test: { name: 'Test' } },
        selectedAccountGroup: 'entropy:test-group/group',
        wallets: { 'entropy:test': { name: 'Test Wallet' } as any },
      };

      mockController.state.accountGroupsMetadata =
        originalState.accountGroupsMetadata;
      mockController.state.accountWalletsMetadata =
        originalState.accountWalletsMetadata;
      mockController.state.accountTree.selectedAccountGroup =
        originalState.selectedAccountGroup;
      mockController.state.accountTree.wallets = originalState.wallets;

      const snapshot = createStateSnapshot(mockContext);

      expect(snapshot.accountGroupsMetadata).toEqual(
        originalState.accountGroupsMetadata,
      );
      expect(snapshot.accountWalletsMetadata).toEqual(
        originalState.accountWalletsMetadata,
      );
      expect(snapshot.selectedAccountGroup).toBe(
        originalState.selectedAccountGroup,
      );
      expect(snapshot.accountTreeWallets).toEqual(originalState.wallets);
    });

    it('should create independent copies (deep clone)', () => {
      const originalGroupsMetadata = { test: { name: 'Original' } };

      mockController.state.accountGroupsMetadata = originalGroupsMetadata;

      const snapshot = createStateSnapshot(mockContext);

      // Modify original state
      mockController.state.accountGroupsMetadata['test'].name = 'Modified';

      // Snapshot should remain unchanged
      expect((snapshot.accountGroupsMetadata as any)['test'].name).toBe(
        'Original',
      );
    });
  });

  describe('restoreStateFromSnapshot', () => {
    let mockSnapshot: StateSnapshot;

    beforeEach(() => {
      mockSnapshot = {
        accountGroupsMetadata: { test: { name: 'Restored Group' } } as any,
        accountWalletsMetadata: { test: { name: 'Restored Wallet' } } as any,
        selectedAccountGroup: 'entropy:restored-group/group' as any,
        accountTreeWallets: {
          'entropy:test': { name: 'Restored Wallet Object' },
        } as any,
      };
    });

    it('should restore all snapshot properties to state', () => {
      restoreStateFromSnapshot(mockContext, mockSnapshot);

      expect(mockController.state.accountGroupsMetadata).toEqual(
        mockSnapshot.accountGroupsMetadata,
      );
      expect(mockController.state.accountWalletsMetadata).toEqual(
        mockSnapshot.accountWalletsMetadata,
      );
      expect(mockController.state.accountTree.selectedAccountGroup).toEqual(
        mockSnapshot.selectedAccountGroup,
      );
      expect(mockController.state.accountTree.wallets).toEqual(
        mockSnapshot.accountTreeWallets,
      );
    });

    it('should call controllerStateUpdateFn with update function', () => {
      restoreStateFromSnapshot(mockContext, mockSnapshot);

      expect(mockControllerStateUpdateFn).toHaveBeenCalledTimes(1);
      expect(mockControllerStateUpdateFn).toHaveBeenCalledWith(
        expect.any(Function),
      );
    });

    it('should call controller.init() after state restoration', () => {
      restoreStateFromSnapshot(mockContext, mockSnapshot);

      expect(mockController.init).toHaveBeenCalledTimes(1);
    });

    it('should call init after state update', () => {
      const callOrder: string[] = [];

      mockControllerStateUpdateFn.mockImplementation((updateFn) => {
        callOrder.push('updateFn');
        updateFn(mockController.state);
      });

      mockController.init.mockImplementation(() => {
        callOrder.push('init');
      });

      restoreStateFromSnapshot(mockContext, mockSnapshot);

      expect(callOrder).toEqual(['updateFn', 'init']);
    });
  });
});
