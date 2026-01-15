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

  describe('selectDeleteRegulationDate', () => {
    it('returns the deleteRegulationDate when set', () => {
      const state: AnalyticsPrivacyControllerState = {
        ...getDefaultAnalyticsPrivacyControllerState(),
        deleteRegulationDate: '15/01/2024',
      };

      expect(
        analyticsPrivacyControllerSelectors.selectDeleteRegulationDate(state),
      ).toBe('15/01/2024');
    });

    it('returns undefined when deleteRegulationDate is null', () => {
      const state: AnalyticsPrivacyControllerState = {
        ...getDefaultAnalyticsPrivacyControllerState(),
        deleteRegulationDate: null,
      };

      expect(
        analyticsPrivacyControllerSelectors.selectDeleteRegulationDate(state),
      ).toBeUndefined();
    });
  });
});
