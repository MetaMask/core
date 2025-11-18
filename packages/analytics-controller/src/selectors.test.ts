import type { AnalyticsControllerState } from './AnalyticsController';
import { analyticsControllerSelectors } from './selectors';
import * as analyticsStateComputer from './analyticsStateComputer';

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
    it.each([[true], [false]])(
      'returns %s when optedInForSocialAccount is %s',
      (optedInForSocialAccount) => {
        const state: AnalyticsControllerState = {
          optedInForSocialAccount,
        };

        const result = analyticsControllerSelectors.selectSocialOptedIn(state);

        expect(result).toBe(optedInForSocialAccount);
      },
    );
  });

  describe('selectEnabled', () => {
    it.each([[true], [false]])(
      'returns %s from computeEnabledState',
      (expectedValue) => {
        jest
          .spyOn(analyticsStateComputer, 'computeEnabledState')
          .mockReturnValue(expectedValue);

        const state: AnalyticsControllerState = {
          optedInForRegularAccount: false,
          optedInForSocialAccount: false,
          analyticsId: defaultAnalyticsId,
        };

        const result = analyticsControllerSelectors.selectEnabled(state);

        expect(analyticsStateComputer.computeEnabledState).toHaveBeenCalledWith(state);
        expect(result).toBe(expectedValue);
      },
    );
  });
});

