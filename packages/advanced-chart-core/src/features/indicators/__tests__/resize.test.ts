import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { _resetStateForTests, setWidget } from '../../../core/state.js';
import type { TVChartingLibraryWidget } from '../../../core/types.js';
import { scheduleChartWidgetResize } from '../resize.js';

describe('features/indicators/resize', () => {
  beforeEach(() => {
    _resetStateForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls widget.resize() via double-rAF', () => {
    const resize = vi.fn();
    setWidget({ resize } as unknown as TVChartingLibraryWidget);

    scheduleChartWidgetResize();

    vi.runAllTimers();
    expect(resize).toHaveBeenCalled();
  });

  it('does not throw when widget is null', () => {
    expect(() => {
      scheduleChartWidgetResize();
      vi.runAllTimers();
    }).not.toThrow();
  });

  it('swallows errors from widget.resize()', () => {
    setWidget({
      resize: () => {
        throw new Error('teardown');
      },
    } as unknown as TVChartingLibraryWidget);

    expect(() => {
      scheduleChartWidgetResize();
      vi.runAllTimers();
    }).not.toThrow();
  });

  it('falls back to setTimeout when requestAnimationFrame throws', () => {
    const resize = vi.fn();
    setWidget({ resize } as unknown as TVChartingLibraryWidget);

    const originalRAF = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (): number => {
      throw new Error('rAF unavailable');
    };

    try {
      scheduleChartWidgetResize();
      vi.runAllTimers();
      expect(resize).toHaveBeenCalled();
    } finally {
      globalThis.requestAnimationFrame = originalRAF;
    }
  });
});
