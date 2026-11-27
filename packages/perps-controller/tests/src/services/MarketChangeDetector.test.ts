import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MARKET_STATE_CONFIRM_MS } from '../../../src/constants/perpsConfig.js';
import { MarketChangeDetector } from '../../../src/services/MarketChangeDetector.js';

describe('MarketChangeDetector', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: 1_000_000 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const later = (ms: number): void => {
    vi.setSystemTime(Date.now() + ms);
  };

  it('reports a listing at once, and nothing for a frame that matches', () => {
    const detector = new MarketChangeDetector([['1', false]]);

    expect(detector.update([['1', false]], true)).toBe(false);
    expect(
      detector.update(
        [
          ['1', false],
          ['2', false],
        ],
        true,
      ),
    ).toBe(true);
    expect(detector.update([['2', false]], false)).toBe(false);
  });

  it('reports a market quoted again once that lasted the confirm window', () => {
    const detector = new MarketChangeDetector([['1', true]]);

    expect(detector.update([['1', false]], true)).toBe(false);
    later(MARKET_STATE_CONFIRM_MS - 1);
    expect(detector.update([['1', false]], true)).toBe(false);
    later(1);
    expect(detector.update([['1', false]], true)).toBe(true);
    // Its new state is the known one now.
    later(MARKET_STATE_CONFIRM_MS);
    expect(detector.update([['1', false]], true)).toBe(false);
  });

  it('reports nothing for a market that flips back inside the window, and starts the window over', () => {
    const detector = new MarketChangeDetector([['1', false]]);

    expect(detector.update([['1', true]], true)).toBe(false);
    later(MARKET_STATE_CONFIRM_MS - 1);
    expect(detector.update([['1', false]], true)).toBe(false);
    expect(detector.update([['1', true]], true)).toBe(false);
    later(MARKET_STATE_CONFIRM_MS - 1);
    expect(detector.update([['1', true]], true)).toBe(false);
    later(1);
    expect(detector.update([['1', true]], true)).toBe(true);
  });

  it('takes a market absent from a partial frame as unchanged, and from a complete one as removed', () => {
    const detector = new MarketChangeDetector([
      ['1', false],
      ['2', false],
    ]);

    expect(detector.update([['1', false]], false)).toBe(false);
    expect(detector.update([['1', false]], true)).toBe(true);
    expect(detector.update([['1', false]], true)).toBe(false);
  });

  it('seeds from a partial first frame without losing a market a later complete frame lists', () => {
    const detector = new MarketChangeDetector([['1', false]]);

    expect(
      detector.update(
        [
          ['1', false],
          ['2', false],
        ],
        true,
      ),
    ).toBe(true);
    expect(detector.update([['2', false]], false)).toBe(false);
  });
});
