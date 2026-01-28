import {
  analyticsPrivacyControllerSelectors,
  getDefaultAnalyticsPrivacyControllerState,
} from '.';
import type { AnalyticsPrivacyControllerState } from './AnalyticsPrivacyController';

describe('analyticsPrivacyControllerSelectors', () => {
  describe('selectHasCollectedDataSinceDeletionRequest', () => {
    it('returns true when hasCollectedDataSinceDeletionRequest is true in state', () => {
      const state: AnalyticsPrivacyControllerState = {
        ...getDefaultAnalyticsPrivacyControllerState(),
        hasCollectedDataSinceDeletionRequest: true,
      };

      expect(
        analyticsPrivacyControllerSelectors.selectHasCollectedDataSinceDeletionRequest(
          state,
        ),
      ).toBe(true);
    });

    it('returns false when hasCollectedDataSinceDeletionRequest is false in state', () => {
      const state: AnalyticsPrivacyControllerState = {
        ...getDefaultAnalyticsPrivacyControllerState(),
        hasCollectedDataSinceDeletionRequest: false,
      };

      expect(
        analyticsPrivacyControllerSelectors.selectHasCollectedDataSinceDeletionRequest(
          state,
        ),
      ).toBe(false);
    });
  });

  describe('selectDeleteRegulationId', () => {
    it('returns deleteRegulationId string when set in state', () => {
      const state: AnalyticsPrivacyControllerState = {
        ...getDefaultAnalyticsPrivacyControllerState(),
        deleteRegulationId: 'test-regulation-id',
      };

      expect(
        analyticsPrivacyControllerSelectors.selectDeleteRegulationId(state),
      ).toBe('test-regulation-id');
    });

    it('returns undefined when deleteRegulationId is not set in state', () => {
      const state: AnalyticsPrivacyControllerState = {
        ...getDefaultAnalyticsPrivacyControllerState(),
      };

      expect(
        analyticsPrivacyControllerSelectors.selectDeleteRegulationId(state),
      ).toBeUndefined();
    });
  });

  describe('selectDeleteRegulationTimestamp', () => {
    it('returns deleteRegulationTimestamp number when set in state', () => {
      const testTimestamp = new Date('2026-01-15T12:00:00Z').getTime();
      const state: AnalyticsPrivacyControllerState = {
        ...getDefaultAnalyticsPrivacyControllerState(),
        deleteRegulationTimestamp: testTimestamp,
      };

      expect(
        analyticsPrivacyControllerSelectors.selectDeleteRegulationTimestamp(
          state,
        ),
      ).toBe(testTimestamp);
    });

    it('returns undefined when deleteRegulationTimestamp is not set in state', () => {
      const state: AnalyticsPrivacyControllerState = {
        ...getDefaultAnalyticsPrivacyControllerState(),
      };

      expect(
        analyticsPrivacyControllerSelectors.selectDeleteRegulationTimestamp(
          state,
        ),
      ).toBeUndefined();
    });
  });
});
