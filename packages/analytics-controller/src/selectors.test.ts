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
  });

  describe('selectOptedInForRegularAccount', () => {
    it('returns true when optedInForRegularAccount is true', () => {
      const state: AnalyticsControllerState = {
        optedInForRegularAccount: true,
        optedInForSocialAccount: false,
        analyticsId: defaultAnalyticsId,
      };

      const result =
        analyticsControllerSelectors.selectOptedInForRegularAccount(state);

      expect(result).toBe(true);
    });

    it('returns false when optedInForRegularAccount is false', () => {
      const state: AnalyticsControllerState = {
        optedInForRegularAccount: false,
        optedInForSocialAccount: false,
        analyticsId: defaultAnalyticsId,
      };

      const result =
        analyticsControllerSelectors.selectOptedInForRegularAccount(state);

      expect(result).toBe(false);
    });

    it('returns false even when optedInForSocialAccount is true', () => {
      const state: AnalyticsControllerState = {
        optedInForRegularAccount: false,
        optedInForSocialAccount: true,
        analyticsId: defaultAnalyticsId,
      };

      const result =
        analyticsControllerSelectors.selectOptedInForRegularAccount(state);

      expect(result).toBe(false);
    });
  });

  describe('selectOptedInForSocialAccount', () => {
    it.each([[true], [false]])(
      'returns %s when optedInForSocialAccount is %s',
      (optedInForSocialAccount) => {
        const state: AnalyticsControllerState = {
          optedInForRegularAccount: false,
          optedInForSocialAccount,
          analyticsId: defaultAnalyticsId,
        };

        const result =
          analyticsControllerSelectors.selectOptedInForSocialAccount(state);

        expect(result).toBe(optedInForSocialAccount);
      },
    );
  });

  describe('selectEnabled', () => {
    /**
     * Tests all combinations of opt-in states:
     * 1. Neither account opted in -> analytics disabled
     * 2. Only regular account opted in -> analytics enabled
     * 3. Only social account opted in -> analytics enabled
     * 4. Both accounts opted in -> analytics enabled
     */
    it.each([
      [false, false, false],
      [true, false, true],
      [false, true, true],
      [true, true, true],
    ])(
      'when optedInForRegularAccount=%s and optedInForSocialAccount=%s, returns %s',
      (optedInForRegularAccount, optedInForSocialAccount, expected) => {
        const state: AnalyticsControllerState = {
          optedInForRegularAccount,
          optedInForSocialAccount,
          analyticsId: defaultAnalyticsId,
        };

        const result = analyticsControllerSelectors.selectEnabled(state);

        expect(result).toBe(expected);
      },
    );
  });
});
