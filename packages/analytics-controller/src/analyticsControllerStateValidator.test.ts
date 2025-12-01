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
    ])(
      'throws with correct error message format for invalid input: %s',
      (analyticsId) => {
        let expectedMessage: string;
        if (analyticsId === undefined) {
          expectedMessage = 'undefined';
        } else if (analyticsId === null) {
          expectedMessage = 'null';
        } else {
          expectedMessage = JSON.stringify(analyticsId);
        }

        const state = {
          optedIn: false,
          analyticsId,
        } as unknown as AnalyticsControllerState;

        expect(() => validateAnalyticsControllerState(state)).toThrow(
          `Invalid analyticsId: expected a valid UUIDv4, but got ${expectedMessage}`,
        );
      },
    );

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
