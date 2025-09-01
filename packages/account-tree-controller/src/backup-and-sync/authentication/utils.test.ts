import { getProfileId } from './utils';
import type { BackupAndSyncContext } from '../types';
import type { AccountTreeController } from 'src/AccountTreeController';

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
      enableDebugLogging: false,
      disableMultichainAccountSyncing: false,
    };

    const mockEntropySourceId = 'entropy-123';
    const mockSessionProfile = {
      profileId: 'test-profile-id-123',
      identifierId: 'test-identifier-id',
      metaMetricsId: 'test-metametrics-id',
    };

    it('should call AuthenticationController:getSessionProfile', async () => {
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
  });
});
