import type { AnalyticsControllerState } from './AnalyticsController';
import { analyticsControllerSelectors } from './selectors';

describe('analyticsControllerSelectors', () => {
  const defaultAnalyticsId = '550e8400-e29b-41d4-a716-446655440000';

  describe('selectAnalyticsId', () => {
    it('returns the analyticsId from state', () => {
      const state: AnalyticsControllerState = {
        optedInForRegularAccount: false,
        optedInForSocialAccount: false,
        analyticsId: defaultAnalyticsId,
      };

      const result = analyticsControllerSelectors.selectAnalyticsId(state);

      expect(result).toBe(defaultAnalyticsId);
    });

    it('returns different analyticsId when state has different value', () => {
      const differentId = '123e4567-e89b-42d3-a456-426614174000';
      const state: AnalyticsControllerState = {
        optedInForRegularAccount: false,
        optedInForSocialAccount: false,
        analyticsId: differentId,
      };

      const result = analyticsControllerSelectors.selectAnalyticsId(state);

      expect(result).toBe(differentId);
      expect(result).not.toBe(defaultAnalyticsId);
    });
  });

  describe('selectOptedIn', () => {
    it('returns true when optedInForRegularAccount is true', () => {
      const state: AnalyticsControllerState = {
        optedInForRegularAccount: true,
        optedInForSocialAccount: false,
        analyticsId: defaultAnalyticsId,
      };

      const result = analyticsControllerSelectors.selectOptedIn(state);

      expect(result).toBe(true);
    });

    it('returns false when optedInForRegularAccount is false', () => {
      const state: AnalyticsControllerState = {
        optedInForRegularAccount: false,
        optedInForSocialAccount: false,
        analyticsId: defaultAnalyticsId,
      };

      const result = analyticsControllerSelectors.selectOptedIn(state);

      expect(result).toBe(false);
    });

    it('returns false even when optedInForSocialAccount is true', () => {
      const state: AnalyticsControllerState = {
        optedInForRegularAccount: false,
        optedInForSocialAccount: true,
        analyticsId: defaultAnalyticsId,
      };

      const result = analyticsControllerSelectors.selectOptedIn(state);

      expect(result).toBe(false);
    });
  });

  describe('selectSocialOptedIn', () => {
    it('returns true when optedInForSocialAccount is true', () => {
      const state: AnalyticsControllerState = {
        optedInForRegularAccount: false,
        optedInForSocialAccount: true,
        analyticsId: defaultAnalyticsId,
      };

      const result = analyticsControllerSelectors.selectSocialOptedIn(state);

      expect(result).toBe(true);
    });

    it('returns false when optedInForSocialAccount is false', () => {
      const state: AnalyticsControllerState = {
        optedInForRegularAccount: false,
        optedInForSocialAccount: false,
        analyticsId: defaultAnalyticsId,
      };

      const result = analyticsControllerSelectors.selectSocialOptedIn(state);

      expect(result).toBe(false);
    });

    it('returns false even when optedInForRegularAccount is true', () => {
      const state: AnalyticsControllerState = {
        optedInForRegularAccount: true,
        optedInForSocialAccount: false,
        analyticsId: defaultAnalyticsId,
      };

      const result = analyticsControllerSelectors.selectSocialOptedIn(state);

      expect(result).toBe(false);
    });
  });

  describe('selectEnabled', () => {
    it('returns true when optedInForRegularAccount=true and optedInForSocialAccount=true', () => {
      const state: AnalyticsControllerState = {
        optedInForRegularAccount: true,
        optedInForSocialAccount: true,
        analyticsId: defaultAnalyticsId,
      };

      const result = analyticsControllerSelectors.selectEnabled(state);

      expect(result).toBe(true);
    });

    it('returns true when optedInForRegularAccount=false and optedInForSocialAccount=true', () => {
      const state: AnalyticsControllerState = {
        optedInForRegularAccount: false,
        optedInForSocialAccount: true,
        analyticsId: defaultAnalyticsId,
      };

      const result = analyticsControllerSelectors.selectEnabled(state);

      expect(result).toBe(true);
    });

    it('returns true when optedInForRegularAccount=true and optedInForSocialAccount=false', () => {
      const state: AnalyticsControllerState = {
        optedInForRegularAccount: true,
        optedInForSocialAccount: false,
        analyticsId: defaultAnalyticsId,
      };

      const result = analyticsControllerSelectors.selectEnabled(state);

      expect(result).toBe(true);
    });

    it('returns false when optedInForRegularAccount=false and optedInForSocialAccount=false', () => {
      const state: AnalyticsControllerState = {
        optedInForRegularAccount: false,
        optedInForSocialAccount: false,
        analyticsId: defaultAnalyticsId,
      };

      const result = analyticsControllerSelectors.selectEnabled(state);

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

      expect(analyticsControllerSelectors.selectEnabled(bothOptedIn)).toBe(true);
      expect(analyticsControllerSelectors.selectEnabled(onlyRegularOptedIn)).toBe(true);
      expect(analyticsControllerSelectors.selectEnabled(onlySocialOptedIn)).toBe(true);
      expect(analyticsControllerSelectors.selectEnabled(neitherOptedIn)).toBe(false);
    });
  });
});

