import { computeEnabledState } from './analyticsStateComputer';
import type { AnalyticsControllerState } from './AnalyticsController';

describe('analyticsStateComputer', () => {
  describe('computeEnabledState', () => {
    const defaultAnalyticsId = '550e8400-e29b-41d4-a716-446655440000';

    it('returns true when optIn=true and socialOptIn=true', () => {
      const state: AnalyticsControllerState = {
        user_optedIn: true,
        user_socialOptedIn: true,
        user_analyticsId: defaultAnalyticsId,
      };

      const result = computeEnabledState(state);

      expect(result).toBe(true);
    });

    it('returns true when optIn=false and socialOptIn=true', () => {
      const state: AnalyticsControllerState = {
        user_optedIn: false,
        user_socialOptedIn: true,
        user_analyticsId: defaultAnalyticsId,
      };

      const result = computeEnabledState(state);

      expect(result).toBe(true);
    });

    it('returns true when optIn=true and socialOptIn=false', () => {
      const state: AnalyticsControllerState = {
        user_optedIn: true,
        user_socialOptedIn: false,
        user_analyticsId: defaultAnalyticsId,
      };

      const result = computeEnabledState(state);

      expect(result).toBe(true);
    });

    it('returns false when optIn=false and socialOptIn=false', () => {
      const state: AnalyticsControllerState = {
        user_optedIn: false,
        user_socialOptedIn: false,
        user_analyticsId: defaultAnalyticsId,
      };

      const result = computeEnabledState(state);

      expect(result).toBe(false);
    });

    it('computes enabled state based on user_optedIn OR user_socialOptedIn', () => {
      const bothOptedIn: AnalyticsControllerState = {
        user_optedIn: true,
        user_socialOptedIn: true,
        user_analyticsId: defaultAnalyticsId,
      };

      const onlyRegularOptedIn: AnalyticsControllerState = {
        user_optedIn: true,
        user_socialOptedIn: false,
        user_analyticsId: defaultAnalyticsId,
      };

      const onlySocialOptedIn: AnalyticsControllerState = {
        user_optedIn: false,
        user_socialOptedIn: true,
        user_analyticsId: defaultAnalyticsId,
      };

      const neitherOptedIn: AnalyticsControllerState = {
        user_optedIn: false,
        user_socialOptedIn: false,
        user_analyticsId: defaultAnalyticsId,
      };

      expect(computeEnabledState(bothOptedIn)).toBe(true);
      expect(computeEnabledState(onlyRegularOptedIn)).toBe(true);
      expect(computeEnabledState(onlySocialOptedIn)).toBe(true);
      expect(computeEnabledState(neitherOptedIn)).toBe(false);
    });
  });
});

