import {
  analyticsDataRegulationControllerSelectors,
  getDefaultAnalyticsDataRegulationControllerState,
} from '.';
import type { AnalyticsDataRegulationControllerState } from './AnalyticsDataRegulationController';

describe('analyticsDataRegulationControllerSelectors', () => {
  describe('selectHasCollectedDataSinceDeletionRequest', () => {
    it('returns true when hasCollectedDataSinceDeletionRequest is true in state', () => {
      const state: AnalyticsDataRegulationControllerState = {
        ...getDefaultAnalyticsDataRegulationControllerState(),
        hasCollectedDataSinceDeletionRequest: true,
      };

      expect(
        analyticsDataRegulationControllerSelectors.selectHasCollectedDataSinceDeletionRequest(
          state,
        ),
      ).toBe(true);
    });

    it('returns false when hasCollectedDataSinceDeletionRequest is false in state', () => {
      const state: AnalyticsDataRegulationControllerState = {
        ...getDefaultAnalyticsDataRegulationControllerState(),
        hasCollectedDataSinceDeletionRequest: false,
      };

      expect(
        analyticsDataRegulationControllerSelectors.selectHasCollectedDataSinceDeletionRequest(
          state,
        ),
      ).toBe(false);
    });
  });

  describe('selectDeleteRegulationId', () => {
    it('returns deleteRegulationId string when set in state', () => {
      const state: AnalyticsDataRegulationControllerState = {
        ...getDefaultAnalyticsDataRegulationControllerState(),
        deleteRegulationId: 'test-regulation-id',
      };

      expect(
        analyticsDataRegulationControllerSelectors.selectDeleteRegulationId(state),
      ).toBe('test-regulation-id');
    });

    it('returns undefined when deleteRegulationId is not set in state', () => {
      const state: AnalyticsDataRegulationControllerState = {
        ...getDefaultAnalyticsDataRegulationControllerState(),
      };

      expect(
        analyticsDataRegulationControllerSelectors.selectDeleteRegulationId(state),
      ).toBeUndefined();
    });
  });

  describe('selectDeleteRegulationTimestamp', () => {
    it('returns deleteRegulationTimestamp number when set in state', () => {
      const testTimestamp = new Date('2026-01-15T12:00:00Z').getTime();
      const state: AnalyticsDataRegulationControllerState = {
        ...getDefaultAnalyticsDataRegulationControllerState(),
        deleteRegulationTimestamp: testTimestamp,
      };

      expect(
        analyticsDataRegulationControllerSelectors.selectDeleteRegulationTimestamp(
          state,
        ),
      ).toBe(testTimestamp);
    });

    it('returns undefined when deleteRegulationTimestamp is not set in state', () => {
      const state: AnalyticsDataRegulationControllerState = {
        ...getDefaultAnalyticsDataRegulationControllerState(),
      };

      expect(
        analyticsDataRegulationControllerSelectors.selectDeleteRegulationTimestamp(
          state,
        ),
      ).toBeUndefined();
    });
  });
});
