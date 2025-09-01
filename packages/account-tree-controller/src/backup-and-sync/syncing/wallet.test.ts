import { compareAndSyncMetadata } from './metadata';
import {
  syncWalletMetadataAndCheckIfPushNeeded,
  syncWalletMetadata,
} from './wallet';
import type { AccountWalletEntropyObject } from '../../wallet';
import { BackupAndSyncAnalyticsEvents } from '../analytics';
import type { BackupAndSyncContext, UserStorageSyncedWallet } from '../types';
import { pushWalletToUserStorage } from '../user-storage/network-operations';

jest.mock('./metadata');
jest.mock('../user-storage/network-operations');
jest.mock('../utils', () => ({
  contextualLogger: {
    warn: jest.fn(),
  },
}));

const mockCompareAndSyncMetadata =
  compareAndSyncMetadata as jest.MockedFunction<typeof compareAndSyncMetadata>;
const mockPushWalletToUserStorage =
  pushWalletToUserStorage as jest.MockedFunction<
    typeof pushWalletToUserStorage
  >;

describe('BackupAndSync - Syncing - Wallet', () => {
  let mockContext: BackupAndSyncContext;
  let mockLocalWallet: AccountWalletEntropyObject;
  let mockWalletFromUserStorage: UserStorageSyncedWallet;

  beforeEach(() => {
    mockContext = {
      controller: {
        state: {
          accountWalletsMetadata: {},
        },
        setAccountWalletName: jest.fn(),
      },
      enableDebugLogging: false,
    } as any;

    mockLocalWallet = {
      id: 'entropy:wallet-1',
      name: 'Test Wallet',
    } as any;

    mockWalletFromUserStorage = {
      name: { value: 'Remote Wallet', lastUpdatedAt: 2000 },
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('syncWalletMetadataAndCheckIfPushNeeded', () => {
    it('should return true when wallet does not exist in user storage but has local metadata', async () => {
      mockContext.controller.state.accountWalletsMetadata[mockLocalWallet.id] =
        {
          name: { value: 'Local Name', lastUpdatedAt: 1000 },
        };
      mockContext.enableDebugLogging = true;

      const result = await syncWalletMetadataAndCheckIfPushNeeded(
        mockContext,
        mockLocalWallet,
        null,
        'test-profile',
      );

      expect(result).toBe(true);
    });

    it('should return false when wallet does not exist in user storage and has no local metadata', async () => {
      mockContext.enableDebugLogging = true;

      const result = await syncWalletMetadataAndCheckIfPushNeeded(
        mockContext,
        mockLocalWallet,
        null,
        'test-profile',
      );

      expect(result).toBe(false);
    });

    it('should sync name metadata and return push decision', async () => {
      mockContext.controller.state.accountWalletsMetadata[mockLocalWallet.id] =
        {
          name: { value: 'Local Name', lastUpdatedAt: 1000 },
        };
      mockCompareAndSyncMetadata.mockResolvedValue(true);

      const result = await syncWalletMetadataAndCheckIfPushNeeded(
        mockContext,
        mockLocalWallet,
        mockWalletFromUserStorage,
        'test-profile',
      );

      expect(mockCompareAndSyncMetadata).toHaveBeenCalledWith({
        context: mockContext,
        localMetadata: { value: 'Local Name', lastUpdatedAt: 1000 },
        userStorageMetadata: { value: 'Remote Wallet', lastUpdatedAt: 2000 },
        validateUserStorageValue: expect.any(Function),
        applyLocalUpdate: expect.any(Function),
        analytics: {
          event: BackupAndSyncAnalyticsEvents.WALLET_RENAMED,
          profileId: 'test-profile',
        },
      });
      expect(result).toBe(true);
    });

    it('should call setAccountWalletName when applying local update', async () => {
      mockContext.controller.state.accountWalletsMetadata[mockLocalWallet.id] =
        {
          name: { value: 'Local Name', lastUpdatedAt: 1000 },
        };

      let applyLocalUpdate: Function;
      mockCompareAndSyncMetadata.mockImplementation(async (options: any) => {
        applyLocalUpdate = options.applyLocalUpdate;
        return false;
      });

      await syncWalletMetadataAndCheckIfPushNeeded(
        mockContext,
        mockLocalWallet,
        mockWalletFromUserStorage,
        'test-profile',
      );

      await applyLocalUpdate!('New Name');
      expect(mockContext.controller.setAccountWalletName).toHaveBeenCalledWith(
        mockLocalWallet.id,
        'New Name',
      );
    });

    it('should validate user storage values using the schema validator', async () => {
      mockContext.controller.state.accountWalletsMetadata[mockLocalWallet.id] =
        {
          name: { value: 'Local Name', lastUpdatedAt: 1000 },
        };

      let validateUserStorageValue: Function;
      mockCompareAndSyncMetadata.mockImplementation(async (options: any) => {
        validateUserStorageValue = options.validateUserStorageValue;
        return false;
      });

      await syncWalletMetadataAndCheckIfPushNeeded(
        mockContext,
        mockLocalWallet,
        mockWalletFromUserStorage,
        'test-profile',
      );

      expect(validateUserStorageValue!('valid string')).toBe(true);
      expect(validateUserStorageValue!(123)).toBe(false);
      expect(validateUserStorageValue!(null)).toBe(false);
      expect(validateUserStorageValue!(undefined)).toBe(false);
    });
  });

  describe('syncWalletMetadata', () => {
    it('should push to user storage when sync check returns true', async () => {
      mockContext.controller.state.accountWalletsMetadata[mockLocalWallet.id] =
        {
          name: { value: 'Local Name', lastUpdatedAt: 1000 },
        };
      mockCompareAndSyncMetadata.mockResolvedValue(true);

      await syncWalletMetadata(
        mockContext,
        mockLocalWallet,
        mockWalletFromUserStorage,
        'test-profile',
      );

      expect(mockPushWalletToUserStorage).toHaveBeenCalledWith(
        mockContext,
        mockLocalWallet,
      );
    });

    it('should not push to user storage when sync check returns false', async () => {
      mockCompareAndSyncMetadata.mockResolvedValue(false);

      await syncWalletMetadata(
        mockContext,
        mockLocalWallet,
        mockWalletFromUserStorage,
        'test-profile',
      );

      expect(mockPushWalletToUserStorage).not.toHaveBeenCalled();
    });
  });
});
