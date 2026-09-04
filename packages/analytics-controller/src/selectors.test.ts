import type { AnalyticsControllerState } from './AnalyticsController.js';
import type { AnalyticsEventFragment } from './EventFragment.types.js';
import { analyticsControllerSelectors } from './selectors.js';

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

  describe('selectConsentDecisionMade', () => {
    it.each([[true], [false]])(
      'returns %s when consentDecisionMade is %s',
      (consentDecisionMade) => {
        const state: AnalyticsControllerState = {
          optedIn: false,
          consentDecisionMade,
          analyticsId: defaultAnalyticsId,
        };

        const result =
          analyticsControllerSelectors.selectConsentDecisionMade(state);

        expect(result).toBe(consentDecisionMade);
      },
    );

    it('defaults to false when the field is absent', () => {
      const state: AnalyticsControllerState = {
        optedIn: false,
        analyticsId: defaultAnalyticsId,
      };

      const result =
        analyticsControllerSelectors.selectConsentDecisionMade(state);

      expect(result).toBe(false);
    });
  });

  describe('event fragment selectors', () => {
    const fragment: AnalyticsEventFragment = {
      id: 'signature-1',
      properties: { signature_type: 'personal_sign' },
      sensitiveProperties: {},
      successEvent: 'Signature Approved',
      createdAt: 1700000000000,
      lastUpdated: 1700000000000,
    };

    const stateWithFragment: AnalyticsControllerState = {
      optedIn: true,
      analyticsId: defaultAnalyticsId,
      eventFragments: { 'signature-1': fragment },
    };

    const stateWithoutFragments: AnalyticsControllerState = {
      optedIn: true,
      analyticsId: defaultAnalyticsId,
    };

    describe('selectEventFragments', () => {
      it('returns the fragments from state', () => {
        const result =
          analyticsControllerSelectors.selectEventFragments(stateWithFragment);

        expect(result).toStrictEqual({ 'signature-1': fragment });
      });

      it('returns an empty record when the field is absent', () => {
        const result = analyticsControllerSelectors.selectEventFragments(
          stateWithoutFragments,
        );

        expect(result).toStrictEqual({});
      });

      it('returns the same empty record on repeated reads', () => {
        const first = analyticsControllerSelectors.selectEventFragments(
          stateWithoutFragments,
        );
        const second = analyticsControllerSelectors.selectEventFragments(
          stateWithoutFragments,
        );

        expect(first).toBe(second);
      });

      it('does not allow mutating the empty fallback record', () => {
        const result = analyticsControllerSelectors.selectEventFragments(
          stateWithoutFragments,
        );

        expect(() => {
          result['signature-1'] = fragment;
        }).toThrow('Cannot add property');
      });
    });

    describe('selectEventFragmentById', () => {
      it('returns the matching fragment', () => {
        const result = analyticsControllerSelectors.selectEventFragmentById(
          stateWithFragment,
          'signature-1',
        );

        expect(result).toStrictEqual(fragment);
      });

      it('returns undefined for an unknown ID', () => {
        const result = analyticsControllerSelectors.selectEventFragmentById(
          stateWithFragment,
          'missing',
        );

        expect(result).toBeUndefined();
      });

      it('returns undefined when the field is absent', () => {
        const result = analyticsControllerSelectors.selectEventFragmentById(
          stateWithoutFragments,
          'signature-1',
        );

        expect(result).toBeUndefined();
      });
    });
  });
});
