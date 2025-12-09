import type { AnalyticsControllerState } from './AnalyticsController';
import { validateAnalyticsControllerState } from './analyticsControllerStateValidator';

describe('analyticsControllerStateValidator', () => {
  describe('validateAnalyticsControllerState', () => {
    const validUUIDv4 = '550e8400-e29b-41d4-a716-446655440000';

    it('does not throw when analyticsId is a valid UUIDv4', () => {
      const state: AnalyticsControllerState = {
        optedIn: false,
        analyticsId: validUUIDv4,
      };

      expect(() => validateAnalyticsControllerState(state)).not.toThrow();
    });

    it.each([
      [undefined],
      [null],
      [''],
      ['not-a-uuid'],
      ['12345'],
      ['550e8400-e29b-41d4-a716'],
      ['c232ab00-9414-11e8-8eb2-f2801f1b9fd1'],
    ])('throws error for invalid input: %s', (analyticsId) => {
      const state: AnalyticsControllerState = {
        optedIn: false,
        // @ts-expect-error Invalid input.
        analyticsId,
      };

      expect(() => validateAnalyticsControllerState(state)).toThrow(
        'Invalid analyticsId',
      );
    });

    it.each([
      ['550e8400-e29b-41d4-a716-446655440000'],
      ['123e4567-e89b-42d3-a456-426614174000'],
      ['00000000-0000-4000-8000-000000000000'],
      ['ffffffff-ffff-4fff-8fff-ffffffffffff'],
    ])('validates valid UUIDv4 format: %s', (uuid) => {
      const state: AnalyticsControllerState = {
        optedIn: false,
        analyticsId: uuid,
      };

      expect(() => validateAnalyticsControllerState(state)).not.toThrow();
    });
  });
});
