import type { AnalyticsControllerState } from './AnalyticsController';
import { validateAnalyticsState } from './analyticsStateValidator';

describe('analyticsStateValidator', () => {
  describe('validateAnalyticsState', () => {
    const validUUIDv4 = '550e8400-e29b-41d4-a716-446655440000';

    it('does not throw when analyticsId is a valid UUIDv4', () => {
      const state: AnalyticsControllerState = {
        optedInForRegularAccount: false,
        optedInForSocialAccount: false,
        analyticsId: validUUIDv4,
      };

      expect(() => validateAnalyticsState(state)).not.toThrow();
    });

    it('throws when analyticsId is undefined', () => {
      const state = {
        optedInForRegularAccount: false,
        optedInForSocialAccount: false,
        analyticsId: undefined,
      } as unknown as AnalyticsControllerState;

      expect(() => validateAnalyticsState(state)).toThrow(
        'Invalid analyticsId: expected a valid UUIDv4, but got undefined',
      );
    });

    it('throws when analyticsId is null', () => {
      const state = {
        optedInForRegularAccount: false,
        optedInForSocialAccount: false,
        analyticsId: null,
      } as unknown as AnalyticsControllerState;

      expect(() => validateAnalyticsState(state)).toThrow(
        'Invalid analyticsId: expected a valid UUIDv4, but got null',
      );
    });

    it('throws when analyticsId is an empty string', () => {
      const state: AnalyticsControllerState = {
        optedInForRegularAccount: false,
        optedInForSocialAccount: false,
        analyticsId: '',
      };

      expect(() => validateAnalyticsState(state)).toThrow(
        'Invalid analyticsId: expected a valid UUIDv4, but got ""',
      );
    });

    it('throws when analyticsId is not a valid UUID', () => {
      const state: AnalyticsControllerState = {
        optedInForRegularAccount: false,
        optedInForSocialAccount: false,
        analyticsId: 'not-a-uuid',
      };

      expect(() => validateAnalyticsState(state)).toThrow(
        'Invalid analyticsId: expected a valid UUIDv4, but got "not-a-uuid"',
      );
    });

    it('throws when analyticsId is a valid UUID but not version 4', () => {
      // UUIDv1 example
      const uuidV1 = 'c232ab00-9414-11e8-8eb2-f2801f1b9fd1';
      const state: AnalyticsControllerState = {
        optedInForRegularAccount: false,
        optedInForSocialAccount: false,
        analyticsId: uuidV1,
      };

      expect(() => validateAnalyticsState(state)).toThrow(
        `Invalid analyticsId: expected a valid UUIDv4, but got "${uuidV1}"`,
      );
    });

    it('throws with correct error message format for various invalid inputs', () => {
      const testCases = [
        { analyticsId: undefined, expectedMessage: 'undefined' },
        { analyticsId: null, expectedMessage: 'null' },
        { analyticsId: '', expectedMessage: '""' },
        { analyticsId: 'invalid', expectedMessage: '"invalid"' },
        { analyticsId: '12345', expectedMessage: '"12345"' },
        { analyticsId: '550e8400-e29b-41d4-a716', expectedMessage: '"550e8400-e29b-41d4-a716"' },
      ];

      testCases.forEach(({ analyticsId, expectedMessage }) => {
        const state = {
          optedInForRegularAccount: false,
          optedInForSocialAccount: false,
          analyticsId,
        } as unknown as AnalyticsControllerState;

        expect(() => validateAnalyticsState(state)).toThrow(
          `Invalid analyticsId: expected a valid UUIDv4, but got ${expectedMessage}`,
        );
      });
    });

    it('validates different valid UUIDv4 formats', () => {
      const validUUIDs = [
        '550e8400-e29b-41d4-a716-446655440000',
        '123e4567-e89b-42d3-a456-426614174000',
        '00000000-0000-4000-8000-000000000000',
        'ffffffff-ffff-4fff-8fff-ffffffffffff',
      ];

      validUUIDs.forEach((uuid) => {
        const state: AnalyticsControllerState = {
          optedInForRegularAccount: false,
          optedInForSocialAccount: false,
          analyticsId: uuid,
        };

        expect(() => validateAnalyticsState(state)).not.toThrow();
      });
    });
  });
});

