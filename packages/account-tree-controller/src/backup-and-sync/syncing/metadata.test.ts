import { compareAndSyncMetadata } from './metadata';
import type { BackupAndSyncContext } from '../types';
import { BackupAndSyncAnalyticsEvents } from '../analytics';

describe('BackupAndSync - Syncing - Metadata', () => {
  let mockContext: BackupAndSyncContext;
  let mockApplyLocalUpdate: jest.Mock;
  let mockValidateUserStorageValue: jest.Mock;

  beforeEach(() => {
    mockApplyLocalUpdate = jest.fn();
    mockValidateUserStorageValue = jest.fn().mockReturnValue(true);

    mockContext = {
      emitAnalyticsEventFn: jest.fn(),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('compareAndSyncMetadata', () => {
    it('should return false when values are identical', async () => {
      const result = await compareAndSyncMetadata({
        context: mockContext,
        localMetadata: { value: 'test', lastUpdatedAt: 1000 },
        userStorageMetadata: { value: 'test', lastUpdatedAt: 2000 },
        applyLocalUpdate: mockApplyLocalUpdate,
        validateUserStorageValue: mockValidateUserStorageValue,
      });

      expect(result).toBe(false);
      expect(mockApplyLocalUpdate).not.toHaveBeenCalled();
      expect(mockContext.emitAnalyticsEventFn).not.toHaveBeenCalled();
    });

    it('should apply user storage value when it is more recent and valid', async () => {
      const result = await compareAndSyncMetadata({
        context: mockContext,
        localMetadata: { value: 'old', lastUpdatedAt: 1000 },
        userStorageMetadata: { value: 'new', lastUpdatedAt: 2000 },
        applyLocalUpdate: mockApplyLocalUpdate,
        validateUserStorageValue: mockValidateUserStorageValue,
        analytics: {
          event: BackupAndSyncAnalyticsEvents.GROUP_RENAMED,
          profileId: 'test-profile',
        },
      });

      expect(result).toBe(false);
      expect(mockApplyLocalUpdate).toHaveBeenCalledWith('new');
      expect(mockContext.emitAnalyticsEventFn).toHaveBeenCalledWith({
        action: BackupAndSyncAnalyticsEvents.GROUP_RENAMED,
        profileId: 'test-profile',
      });
    });

    it('should return true when local value is more recent', async () => {
      const result = await compareAndSyncMetadata({
        context: mockContext,
        localMetadata: { value: 'new', lastUpdatedAt: 2000 },
        userStorageMetadata: { value: 'old', lastUpdatedAt: 1000 },
        applyLocalUpdate: mockApplyLocalUpdate,
        validateUserStorageValue: mockValidateUserStorageValue,
      });

      expect(result).toBe(true);
      expect(mockApplyLocalUpdate).not.toHaveBeenCalled();
      expect(mockContext.emitAnalyticsEventFn).not.toHaveBeenCalled();
    });

    it('should return true when user storage value is invalid', async () => {
      mockValidateUserStorageValue.mockReturnValue(false);

      const result = await compareAndSyncMetadata({
        context: mockContext,
        localMetadata: { value: 'local', lastUpdatedAt: 1000 },
        userStorageMetadata: { value: 'invalid', lastUpdatedAt: 2000 },
        applyLocalUpdate: mockApplyLocalUpdate,
        validateUserStorageValue: mockValidateUserStorageValue,
      });

      expect(result).toBe(true);
      expect(mockApplyLocalUpdate).not.toHaveBeenCalled();
      expect(mockContext.emitAnalyticsEventFn).not.toHaveBeenCalled();
    });

    it('should apply user storage value when no local metadata exists', async () => {
      const result = await compareAndSyncMetadata({
        context: mockContext,
        localMetadata: undefined,
        userStorageMetadata: { value: 'remote', lastUpdatedAt: 1000 },
        applyLocalUpdate: mockApplyLocalUpdate,
        validateUserStorageValue: mockValidateUserStorageValue,
      });

      expect(result).toBe(false);
      expect(mockApplyLocalUpdate).toHaveBeenCalledWith('remote');
    });

    it('should not emit analytics when no analytics config provided', async () => {
      await compareAndSyncMetadata({
        context: mockContext,
        localMetadata: { value: 'old', lastUpdatedAt: 1000 },
        userStorageMetadata: { value: 'new', lastUpdatedAt: 2000 },
        applyLocalUpdate: mockApplyLocalUpdate,
        validateUserStorageValue: mockValidateUserStorageValue,
      });

      expect(mockContext.emitAnalyticsEventFn).not.toHaveBeenCalled();
    });

    it('should handle async applyLocalUpdate function', async () => {
      const asyncUpdate = jest.fn().mockResolvedValue(undefined);

      await compareAndSyncMetadata({
        context: mockContext,
        localMetadata: { value: 'old', lastUpdatedAt: 1000 },
        userStorageMetadata: { value: 'new', lastUpdatedAt: 2000 },
        applyLocalUpdate: asyncUpdate,
        validateUserStorageValue: mockValidateUserStorageValue,
      });

      expect(asyncUpdate).toHaveBeenCalledWith('new');
    });
  });
});
