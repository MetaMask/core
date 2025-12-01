import type { AnalyticsControllerState } from './AnalyticsController';
import { analyticsControllerSelectors } from './selectors';

describe('analyticsControllerSelectors', () => {
  const defaultAnalyticsId = '550e8400-e29b-41d4-a716-446655440000';

  describe('selectAnalyticsId', () => {
    it('returns the analyticsId from state', () => {
      const state: AnalyticsControllerState = {
        optedIn: false,
        analyticsId: defaultAnalyticsId,
      };

      const result = analyticsControllerSelectors.selectAnalyticsId(state);

      expect(result).toBe(defaultAnalyticsId);
    });
  });

  describe('selectOptedIn', () => {
    it.each([[true], [false]])('returns %s when optedIn is %s', (optedIn) => {
      const state: AnalyticsControllerState = {
        optedIn,
        analyticsId: defaultAnalyticsId,
      };

      const result = analyticsControllerSelectors.selectOptedIn(state);

      expect(result).toBe(optedIn);
    });
  });

  describe('selectEnabled', () => {
    it.each([
      [false, false],
      [true, true],
    ])('when optedIn=%s, returns %s', (optedIn, expected) => {
      const state: AnalyticsControllerState = {
        optedIn,
        analyticsId: defaultAnalyticsId,
      };

      const result = analyticsControllerSelectors.selectEnabled(state);

      expect(result).toBe(expected);
    });

    it.each([[false], [true]])(
      'returns the same value as selectOptedIn when optedIn=%s (currently equivalent)',
      (optedIn) => {
        const state: AnalyticsControllerState = {
          optedIn,
          analyticsId: defaultAnalyticsId,
        };

        const optedInResult = analyticsControllerSelectors.selectOptedIn(state);
        const enabledResult = analyticsControllerSelectors.selectEnabled(state);

        expect(enabledResult).toBe(optedInResult);
      },
    );
  });
});
