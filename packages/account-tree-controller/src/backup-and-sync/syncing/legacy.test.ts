import { performLegacyAccountSyncing } from './legacy';
import { BackupAndSyncAnalyticsEvents } from '../analytics';
import { getProfileId } from '../authentication/utils';
import type { BackupAndSyncContext } from '../types';

jest.mock('../authentication/utils');
jest.mock('../user-storage');
jest.mock('../utils');

const mockGetProfileId = getProfileId as jest.MockedFunction<
  typeof getProfileId
>;

describe('BackupAndSync - Syncing - Legacy', () => {
  let mockContext: BackupAndSyncContext;

  beforeEach(() => {
    mockContext = {
      messenger: {
        call: jest.fn(),
      },
      emitAnalyticsEventFn: jest.fn(),
    } as unknown as BackupAndSyncContext;
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
});
