import { describe, expect, it } from 'vitest';

import {
  canonicalResolution,
  detectResolution,
  INTERVAL_MS_TO_TV,
  resolveResolution,
} from '../resolution.js';

const bars = (intervals: number[]): { time: number }[] => {
  const out: { time: number }[] = [{ time: 0 }];
  let time = 0;
  for (const ms of intervals) {
    time += ms;
    out.push({ time });
  }
  return out;
};

describe('detectResolution', () => {
  it('returns default "5" for fewer than 2 bars', () => {
    expect(detectResolution([])).toBe('5');
    expect(detectResolution([{ time: 0 }])).toBe('5');
  });

  it.each(Object.entries(INTERVAL_MS_TO_TV))(
    'maps %s ms steps → %s',
    (intervalMs, expected) => {
      const data = bars(Array(5).fill(Number(intervalMs)));
      expect(detectResolution(data)).toBe(expected);
    },
  );

  it('uses the median diff to ignore single-bar gaps', () => {
    // 4× one-minute diffs + 1× ten-minute gap. Median = 60_000 → "1".
    const data = bars([60_000, 60_000, 10 * 60_000, 60_000, 60_000]);
    expect(detectResolution(data)).toBe('1');
  });

  it('snaps to the closest defined interval', () => {
    // 6.5 min between bars → closest mapped is 5min ("5") not 15min ("15").
    const data = bars([390_000, 390_000, 390_000]);
    expect(detectResolution(data)).toBe('5');
  });
});

describe('canonicalResolution', () => {
  it('expands single-letter shorthands', () => {
    expect(canonicalResolution('D')).toBe('1D');
    expect(canonicalResolution('W')).toBe('1W');
    expect(canonicalResolution('M')).toBe('1M');
    expect(canonicalResolution('S')).toBe('1S');
  });

  it('leaves canonical resolutions unchanged', () => {
    expect(canonicalResolution('1')).toBe('1');
    expect(canonicalResolution('60')).toBe('60');
    expect(canonicalResolution('1D')).toBe('1D');
    expect(canonicalResolution('3D')).toBe('3D');
  });
});

describe('resolveResolution', () => {
  // 5m candles with missing bars: median gap is 3m, so detection says "3".
  const irregularFiveMinute = bars([180_000, 180_000, 180_000, 300_000]);

  it('falls back to detection when no explicit resolution is given', () => {
    expect(resolveResolution(undefined, irregularFiveMinute)).toBe('3');
  });

  it.each(['1', '5', '15', '60', '240', '1D', '1W', '1M'])(
    'uses the explicit resolution %s over irregular bar spacing',
    (resolution) => {
      expect(resolveResolution(resolution, irregularFiveMinute)).toBe(
        resolution,
      );
    },
  );

  it.each([
    ['D', '1D'],
    ['W', '1W'],
    ['M', '1M'],
  ])('canonicalizes the %s shorthand to %s', (shorthand, expected) => {
    expect(resolveResolution(shorthand, irregularFiveMinute)).toBe(expected);
  });

  it.each(['', '7', '1h', '2D'])(
    'falls back to detection for invalid explicit resolution %j',
    (resolution) => {
      expect(resolveResolution(resolution, irregularFiveMinute)).toBe('3');
    },
  );
});
