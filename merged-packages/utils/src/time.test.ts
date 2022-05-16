import { Duration, inMilliseconds, timeSince } from '.';

describe('time utilities', () => {
  describe('Duration', () => {
    it('has the correct values', () => {
      expect(Duration.Millisecond).toBe(1);
      expect(Duration.Second).toBe(Duration.Millisecond * 1000);
      expect(Duration.Minute).toBe(Duration.Second * 60);
      expect(Duration.Hour).toBe(Duration.Minute * 60);
      expect(Duration.Day).toBe(Duration.Hour * 24);
      expect(Duration.Week).toBe(Duration.Day * 7);
      expect(Duration.Year).toBe(Duration.Day * 365);
    });
  });

  describe('inMilliseconds', () => {
    it('throws if the number is negative or a float', () => {
      expect(() => inMilliseconds(1.1, Duration.Second)).toThrow(
        '"count" must be a non-negative integer. Received: "1.1".',
      );

      expect(() => inMilliseconds(-1, Duration.Second)).toThrow(
        '"count" must be a non-negative integer. Received: "-1".',
      );
    });

    it('counts durations correctly', () => {
      // A count that won't overflow for any Duration value.
      const getRandomCount = () => Math.floor(Math.random() * 1000);

      Object.values(Duration).forEach((duration) => {
        const count = getRandomCount();
        expect(inMilliseconds(count, duration as Duration)).toBe(
          count * (duration as Duration),
        );
      });
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
        expect(timeSince(input)).toBe(expected);
      });
    });
  });
});
