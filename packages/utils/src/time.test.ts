import { inMilliseconds, timeSince } from './index.js';

describe('time utilities', () => {
  describe('inMilliseconds', () => {
    it('throws if the number is negative or a float', () => {
      expect(() => inMilliseconds(1.1, 'second')).toThrow(
        '"count" must be a non-negative integer. Received: "1.1".',
      );

      expect(() => inMilliseconds(-1, 'second')).toThrow(
        '"count" must be a non-negative integer. Received: "-1".',
      );
    });

    it('returns the correct duration in milliseconds for a millisecond duration', () => {
      expect(inMilliseconds(1, 'millisecond')).toBe(1);
      expect(inMilliseconds(1000, 'millisecond')).toBe(1_000);
    });

    it('returns the correct duration in milliseconds for a second duration', () => {
      expect(inMilliseconds(1, 'second')).toBe(1_000);
      expect(inMilliseconds(60, 'second')).toBe(60_000);
    });

    it('returns the correct duration in milliseconds for a minute duration', () => {
      expect(inMilliseconds(1, 'minute')).toBe(60_000);
      expect(inMilliseconds(60, 'minute')).toBe(3_600_000);
    });

    it('returns the correct duration in milliseconds for an hour duration', () => {
      expect(inMilliseconds(1, 'hour')).toBe(3_600_000);
      expect(inMilliseconds(24, 'hour')).toBe(86_400_000);
    });

    it('returns the correct duration in milliseconds for a day duration', () => {
      expect(inMilliseconds(1, 'day')).toBe(86_400_000);
      expect(inMilliseconds(7, 'day')).toBe(604_800_000);
    });

    it('returns the correct duration in milliseconds for a week duration', () => {
      expect(inMilliseconds(1, 'week')).toBe(604_800_000);
      expect(inMilliseconds(52, 'week')).toBe(31_449_600_000);
    });

    it('returns the correct duration in milliseconds for a year duration', () => {
      expect(inMilliseconds(1, 'year')).toBe(31_536_000_000);
      expect(inMilliseconds(10, 'year')).toBe(315_360_000_000);
    });
  });

  describe('timeSince', () => {
    it('throws if the number is negative or a float', () => {
      expect(() => timeSince(1.1)).toThrow(
        '"timestamp" must be a non-negative integer. Received: "1.1".',
      );

      expect(() => timeSince(-1)).toThrow(
        '"timestamp" must be a non-negative integer. Received: "-1".',
      );
    });

    it('computes the elapsed time', () => {
      // Set the "current time" to "10".
      jest.spyOn(Date, 'now').mockImplementation(() => 10);

      [
        [10, 0],
        [5, 5],
        [1, 9],
        [0, 10],
      ].forEach(([input, expected]) => {
        expect(timeSince(input as number)).toBe(expected);
      });
    });
  });
});
