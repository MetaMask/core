import {
  performLegacyAccountSyncing,
  disableLegacyAccountSyncingForAllWallets,
} from './legacy';
import { getProfileId } from '../authentication/utils';
import { pushWalletToUserStorage } from '../user-storage';
import { getLocalEntropyWallets } from '../utils';
import { BackupAndSyncAnalyticsEvents } from '../analytics';
import type { BackupAndSyncContext } from '../types';

jest.mock('../authentication/utils');
jest.mock('../user-storage');
jest.mock('../utils');

const mockGetProfileId = getProfileId as jest.MockedFunction<
  typeof getProfileId
>;
const mockPushWalletToUserStorage =
  pushWalletToUserStorage as jest.MockedFunction<
    typeof pushWalletToUserStorage
  >;
const mockGetLocalEntropyWallets =
  getLocalEntropyWallets as jest.MockedFunction<typeof getLocalEntropyWallets>;

describe('BackupAndSync - Syncing - Legacy', () => {
  let mockContext: BackupAndSyncContext;

  beforeEach(() => {
    mockContext = {
      messenger: {
        call: jest.fn(),
      },
      emitAnalyticsEventFn: jest.fn(),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('performLegacyAccountSyncing', () => {
    it('should sync internal accounts and emit analytics event', async () => {
      mockGetProfileId.mockResolvedValue('test-profile-id');

      await performLegacyAccountSyncing(mockContext);

      expect(mockContext.messenger.call).toHaveBeenCalledWith(
        'UserStorageController:syncInternalAccountsWithUserStorage',
      );
      expect(mockGetProfileId).toHaveBeenCalledWith(mockContext);
      expect(mockContext.emitAnalyticsEventFn).toHaveBeenCalledWith({
        action: BackupAndSyncAnalyticsEvents.LEGACY_SYNCING_DONE,
        profileId: 'test-profile-id',
      });
    });
  });

  describe('disableLegacyAccountSyncingForAllWallets', () => {
    it('should disable legacy syncing for all local entropy wallets', async () => {
      const mockWallets = [
        { id: 'entropy:wallet-1' },
        { id: 'entropy:wallet-2' },
      ] as any;

      mockGetLocalEntropyWallets.mockReturnValue(mockWallets);
      mockPushWalletToUserStorage.mockResolvedValue();

      await disableLegacyAccountSyncingForAllWallets(mockContext);

      expect(mockGetLocalEntropyWallets).toHaveBeenCalledWith(mockContext);
      expect(mockPushWalletToUserStorage).toHaveBeenCalledTimes(2);
      expect(mockPushWalletToUserStorage).toHaveBeenCalledWith(
        mockContext,
        mockWallets[0],
        { isLegacyAccountSyncingDisabled: true },
      );
      expect(mockPushWalletToUserStorage).toHaveBeenCalledWith(
        mockContext,
        mockWallets[1],
        { isLegacyAccountSyncingDisabled: true },
      );
    });

    it('should handle empty wallets array', async () => {
      mockGetLocalEntropyWallets.mockReturnValue([]);

      await disableLegacyAccountSyncingForAllWallets(mockContext);

      expect(mockGetLocalEntropyWallets).toHaveBeenCalledWith(mockContext);
      expect(mockPushWalletToUserStorage).not.toHaveBeenCalled();
    });
  });
});
