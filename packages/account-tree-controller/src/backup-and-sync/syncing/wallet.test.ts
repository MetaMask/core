import { compareAndSyncMetadata } from './metadata';
import {
  syncWalletMetadataAndCheckIfPushNeeded,
  syncWalletMetadata,
} from './wallet';
import type { AccountWalletEntropyObject } from '../../wallet';
import { BackupAndSyncAnalyticsEvents } from '../analytics';
import type { BackupAndSyncContext, UserStorageSyncedWallet } from '../types';
import { pushWalletToUserStorage } from '../user-storage/network-operations';
import { createMockContextualLogger } from '../utils/test-utils';

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
      contextualLogger: createMockContextualLogger({
        isEnabled: true,
      }),
    } as unknown as BackupAndSyncContext;

    mockLocalWallet = {
      id: 'entropy:wallet-1',
      name: 'Test Wallet',
    } as unknown as AccountWalletEntropyObject;

    mockWalletFromUserStorage = {
      name: { value: 'Remote Wallet', lastUpdatedAt: 2000 },
    } as unknown as UserStorageSyncedWallet;
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

      const result = await syncWalletMetadataAndCheckIfPushNeeded(
        mockContext,
        mockLocalWallet,
        null,
        'test-profile',
      );

      expect(result).toBe(true);
    });

    it('should return true when wallet does not exist in user storage and has no local metadata', async () => {
      const result = await syncWalletMetadataAndCheckIfPushNeeded(
        mockContext,
        mockLocalWallet,
        null,
        'test-profile',
      );

      expect(result).toBe(true);
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

      let applyLocalUpdate:
        | Parameters<typeof compareAndSyncMetadata>[0]['applyLocalUpdate']
        | undefined;
      mockCompareAndSyncMetadata.mockImplementation(
        async (options: Parameters<typeof compareAndSyncMetadata>[0]) => {
          applyLocalUpdate = options.applyLocalUpdate;
          return false;
        },
      );

      await syncWalletMetadataAndCheckIfPushNeeded(
        mockContext,
        mockLocalWallet,
        mockWalletFromUserStorage,
        'test-profile',
      );

      expect(applyLocalUpdate).toBeDefined();
      /* eslint-disable jest/no-conditional-in-test */
      /* eslint-disable jest/no-conditional-expect */
      if (applyLocalUpdate) {
        await applyLocalUpdate('New Name');
        expect(
          mockContext.controller.setAccountWalletName,
        ).toHaveBeenCalledWith(mockLocalWallet.id, 'New Name');
      }
      /* eslint-enable jest/no-conditional-in-test */
      /* eslint-enable jest/no-conditional-expect */
    });

    it('should validate user storage values using the schema validator', async () => {
      mockContext.controller.state.accountWalletsMetadata[mockLocalWallet.id] =
        {
          name: { value: 'Local Name', lastUpdatedAt: 1000 },
        };

      let validateUserStorageValue:
        | Parameters<
            typeof compareAndSyncMetadata
          >[0]['validateUserStorageValue']
        | undefined;
      mockCompareAndSyncMetadata.mockImplementation(
        async (options: Parameters<typeof compareAndSyncMetadata>[0]) => {
          validateUserStorageValue = options.validateUserStorageValue;
          return false;
        },
      );

      await syncWalletMetadataAndCheckIfPushNeeded(
        mockContext,
        mockLocalWallet,
        mockWalletFromUserStorage,
        'test-profile',
      );

      expect(validateUserStorageValue).toBeDefined();
      /* eslint-disable jest/no-conditional-in-test */
      /* eslint-disable jest/no-conditional-expect */
      if (validateUserStorageValue) {
        expect(validateUserStorageValue('valid string')).toBe(true);
        expect(validateUserStorageValue(123)).toBe(false);
        expect(validateUserStorageValue(null)).toBe(false);
        expect(validateUserStorageValue(undefined)).toBe(false);
      }
      /* eslint-enable jest/no-conditional-in-test */
      /* eslint-enable jest/no-conditional-expect */
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
