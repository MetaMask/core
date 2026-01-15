import {
  analyticsPrivacyControllerSelectors,
  getDefaultAnalyticsPrivacyControllerState,
} from '.';
import type { AnalyticsPrivacyControllerState } from './AnalyticsPrivacyController';

describe('analyticsPrivacyControllerSelectors', () => {
  describe('selectDataRecorded', () => {
    it('returns the dataRecorded flag from state', () => {
      const state: AnalyticsPrivacyControllerState = {
        ...getDefaultAnalyticsPrivacyControllerState(),
        dataRecorded: true,
      };

      expect(
        analyticsPrivacyControllerSelectors.selectDataRecorded(state),
      ).toBe(true);
    });

    it('returns false when dataRecorded is false', () => {
      const state: AnalyticsPrivacyControllerState = {
        ...getDefaultAnalyticsPrivacyControllerState(),
        dataRecorded: false,
      };

      expect(
        analyticsPrivacyControllerSelectors.selectDataRecorded(state),
      ).toBe(false);
    });
  });

  describe('selectDeleteRegulationId', () => {
    it('returns the deleteRegulationId when set', () => {
      const state: AnalyticsPrivacyControllerState = {
        ...getDefaultAnalyticsPrivacyControllerState(),
        deleteRegulationId: 'test-regulation-id',
      };

      expect(
        analyticsPrivacyControllerSelectors.selectDeleteRegulationId(state),
      ).toBe('test-regulation-id');
    });

    it('returns undefined when deleteRegulationId is null', () => {
      const state: AnalyticsPrivacyControllerState = {
        ...getDefaultAnalyticsPrivacyControllerState(),
        deleteRegulationId: null,
      };

      expect(
        analyticsPrivacyControllerSelectors.selectDeleteRegulationId(state),
      ).toBeUndefined();
    });
  });

  describe('selectDeleteRegulationTimestamp', () => {
    it('returns the deleteRegulationTimestamp when set', () => {
      const testTimestamp = new Date('2026-01-15T12:00:00Z').getTime();
      const state: AnalyticsPrivacyControllerState = {
        ...getDefaultAnalyticsPrivacyControllerState(),
        deleteRegulationTimestamp: testTimestamp,
      };

      expect(
        analyticsPrivacyControllerSelectors.selectDeleteRegulationTimestamp(state),
      ).toBe(testTimestamp);
    });

    it('returns undefined when deleteRegulationTimestamp is null', () => {
      const state: AnalyticsPrivacyControllerState = {
        ...getDefaultAnalyticsPrivacyControllerState(),
        deleteRegulationTimestamp: null,
      };

      expect(
        analyticsPrivacyControllerSelectors.selectDeleteRegulationTimestamp(state),
      ).toBeUndefined();
    });
  });
});
