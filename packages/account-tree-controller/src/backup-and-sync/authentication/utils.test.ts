import { getProfileId } from './utils';
import type { AccountTreeController } from '../../AccountTreeController';
import type { BackupAndSyncContext } from '../types';

describe('BackupAndSyncAuthentication - Utils', () => {
  describe('getProfileId', () => {
    const mockMessenger = {
      call: jest.fn(),
    };

    const mockContext: BackupAndSyncContext = {
      messenger: mockMessenger as unknown as BackupAndSyncContext['messenger'],
      controller: {} as AccountTreeController,
      controllerStateUpdateFn: jest.fn(),
      traceFn: jest.fn(),
      groupIdToWalletId: new Map(),
      emitAnalyticsEventFn: jest.fn(),
    };

    const mockEntropySourceId = 'entropy-123';
    const mockSessionProfile = {
      profileId: 'test-profile-id-123',
      identifierId: 'test-identifier-id',
      metaMetricsId: 'test-metametrics-id',
    };

    it('calls AuthenticationController:getSessionProfile', async () => {
      mockMessenger.call.mockResolvedValue(mockSessionProfile);

      const result1 = await getProfileId(mockContext);

      expect(mockMessenger.call).toHaveBeenCalledWith(
        'AuthenticationController:getSessionProfile',
        undefined,
      );

      const result2 = await getProfileId(mockContext, mockEntropySourceId);

      expect(mockMessenger.call).toHaveBeenCalledWith(
        'AuthenticationController:getSessionProfile',
        mockEntropySourceId,
      );

      expect(result1).toBe(mockSessionProfile.profileId);
      expect(result2).toBe(mockSessionProfile.profileId);
    });

    it('returns undefined if AuthenticationController:getSessionProfile throws', async () => {
      mockMessenger.call.mockRejectedValue(new Error('Test error'));

      const result = await getProfileId(mockContext);

      expect(result).toBeUndefined();
    });
  });
});
