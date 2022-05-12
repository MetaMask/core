import { timeSince } from '.';

describe('time utilities', () => {
  describe('timeSince', () => {
    it('computes the elapsed time', () => {
      const currentTime = 10;
      jest.spyOn(Date, 'now').mockImplementation(() => currentTime);

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
