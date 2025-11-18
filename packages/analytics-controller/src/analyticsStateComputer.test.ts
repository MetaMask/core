import type { AnalyticsControllerState } from './AnalyticsController';
import { computeEnabledState } from './analyticsStateComputer';

describe('analyticsStateComputer', () => {
  describe('computeEnabledState', () => {
    const defaultAnalyticsId = '550e8400-e29b-41d4-a716-446655440000';

    it.each([
      {
        optedInForRegularAccount: true,
        optedInForSocialAccount: true,
        expectedEnabled: true,
        description: 'both opt-ins are true',
      },
      {
        optedInForRegularAccount: false,
        optedInForSocialAccount: true,
        expectedEnabled: true,
        description: 'only social opt-in is true',
      },
      {
        optedInForRegularAccount: true,
        optedInForSocialAccount: false,
        expectedEnabled: true,
        description: 'only regular opt-in is true',
      },
      {
        optedInForRegularAccount: false,
        optedInForSocialAccount: false,
        expectedEnabled: false,
        description: 'both opt-ins are false',
      },
    ])(
      'computes enabled state based on optedInForRegularAccount OR optedInForSocialAccount when $description',
      ({ optedInForRegularAccount, optedInForSocialAccount, expectedEnabled }) => {
        const state: AnalyticsControllerState = {
          optedInForRegularAccount,
          optedInForSocialAccount,
          analyticsId: defaultAnalyticsId,
        };

        const result = computeEnabledState(state);

        expect(result).toBe(expectedEnabled);
      },
    );
  });
});
