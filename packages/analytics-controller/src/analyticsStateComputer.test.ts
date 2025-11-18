import type { AnalyticsControllerState } from './AnalyticsController';
import { computeEnabledState } from './analyticsStateComputer';

describe('analyticsStateComputer', () => {
  describe('computeEnabledState', () => {
    const defaultAnalyticsId = '550e8400-e29b-41d4-a716-446655440000';

    it('returns true when optedInForRegularAccount=true and optedInForSocialAccount=true', () => {
      const state: AnalyticsControllerState = {
        optedInForRegularAccount: true,
        optedInForSocialAccount: true,
        analyticsId: defaultAnalyticsId,
      };

      const result = computeEnabledState(state);

      expect(result).toBe(true);
    });

    it('returns true when optedInForRegularAccount=false and optedInForSocialAccount=true', () => {
      const state: AnalyticsControllerState = {
        optedInForRegularAccount: false,
        optedInForSocialAccount: true,
        analyticsId: defaultAnalyticsId,
      };

      const result = computeEnabledState(state);

      expect(result).toBe(true);
    });

    it('returns true when optedInForRegularAccount=true and optedInForSocialAccount=false', () => {
      const state: AnalyticsControllerState = {
        optedInForRegularAccount: true,
        optedInForSocialAccount: false,
        analyticsId: defaultAnalyticsId,
      };

      const result = computeEnabledState(state);

      expect(result).toBe(true);
    });

    it('returns false when optedInForRegularAccount=false and optedInForSocialAccount=false', () => {
      const state: AnalyticsControllerState = {
        optedInForRegularAccount: false,
        optedInForSocialAccount: false,
        analyticsId: defaultAnalyticsId,
      };

      const result = computeEnabledState(state);

      expect(result).toBe(false);
    });

    it('computes enabled state based on optedInForRegularAccount OR optedInForSocialAccount', () => {
      const bothOptedIn: AnalyticsControllerState = {
        optedInForRegularAccount: true,
        optedInForSocialAccount: true,
        analyticsId: defaultAnalyticsId,
      };

      const onlyRegularOptedIn: AnalyticsControllerState = {
        optedInForRegularAccount: true,
        optedInForSocialAccount: false,
        analyticsId: defaultAnalyticsId,
      };

      const onlySocialOptedIn: AnalyticsControllerState = {
        optedInForRegularAccount: false,
        optedInForSocialAccount: true,
        analyticsId: defaultAnalyticsId,
      };

      const neitherOptedIn: AnalyticsControllerState = {
        optedInForRegularAccount: false,
        optedInForSocialAccount: false,
        analyticsId: defaultAnalyticsId,
      };

      expect(computeEnabledState(bothOptedIn)).toBe(true);
      expect(computeEnabledState(onlyRegularOptedIn)).toBe(true);
      expect(computeEnabledState(onlySocialOptedIn)).toBe(true);
      expect(computeEnabledState(neitherOptedIn)).toBe(false);
    });
  });
});
