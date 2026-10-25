import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  _resetStateForTests,
  bumpOhlcvGeneration,
  isSlbCenteringPending,
  setChartReady,
  setOhlcvData,
  setSlbCenteringPending,
  setSlbMode,
  setVisibleFromMs,
  setVisibleToMs,
  setWidget,
} from '../../../core/state.js';
import type {
  OHLCVBar,
  TVActiveChart,
  TVChartingLibraryWidget,
  TVSubscription,
} from '../../../core/types.js';
import {
  _resetSocialLeaderboardForTests,
  slbCenterViewport,
  slbHandleGetBars,
  slbScheduleInitialCentering,
} from '../index.js';

// One bar per hour; last bar at t = 10h so a trade window ending well before it
// is a "historical frame" and a window ending at it is a "trailing frame".
const HOUR_MS = 60 * 60 * 1000;
const bars: OHLCVBar[] = Array.from({ length: 11 }, (_, i) => ({
  time: i * HOUR_MS,
  open: 1,
  high: 1,
  low: 1,
  close: 1 + i,
}));
const LAST_BAR_MS = 10 * HOUR_MS;

type SetRangeCall = {
  range: { from: number; to: number };
  options?: { percentRightMargin?: number };
};

type StubChart = {
  chart: TVActiveChart;
  setRangeCalls: SetRangeCall[];
  /** Fire the onDataLoaded subscribers, simulating TradingView's load event. */
  fireDataLoaded: () => void;
};

function makeStubChart(): StubChart {
  const setRangeCalls: SetRangeCall[] = [];
  const subscribers: (() => void)[] = [];
  const subscription: TVSubscription = {
    subscribe: (_scope, callback) => {
      subscribers.push(callback as () => void);
    },
    unsubscribe: (_scope, callback) => {
      const idx = subscribers.indexOf(callback as () => void);
      if (idx >= 0) {
        subscribers.splice(idx, 1);
      }
    },
  };
  const chart = {
    onDataLoaded: () => subscription,
    setVisibleRange: (
      range: { from: number; to: number },
      options?: { percentRightMargin?: number },
    ) => {
      setRangeCalls.push({ range: { ...range }, options });
    },
  } as unknown as TVActiveChart;
  return {
    chart,
    setRangeCalls,
    fireDataLoaded: () => subscribers.slice().forEach((callback) => callback()),
  };
}

function installWidget(chart: TVActiveChart): TVChartingLibraryWidget {
  const widget = {
    activeChart: () => chart,
  } as unknown as TVChartingLibraryWidget;
  setWidget(widget);
  setChartReady(true);
  return widget;
}

describe('slbCenterViewport', () => {
  beforeEach(() => {
    _resetStateForTests();
    _resetSocialLeaderboardForTests();
    setOhlcvData(bars);
    setSlbMode(true);
    setSlbCenteringPending(true);
    vi.useFakeTimers();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
      (callback: FrameRequestCallback) => {
        setTimeout(() => callback(Date.now()), 16);
        return 0;
      },
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('no-ops when slbMode is off', () => {
    setSlbMode(false);
    const stub = makeStubChart();
    installWidget(stub.chart);
    slbCenterViewport(stub.chart);
    stub.fireDataLoaded();
    expect(stub.setRangeCalls).toHaveLength(0);
  });

  it('no-ops when centering is not pending', () => {
    setSlbCenteringPending(false);
    const stub = makeStubChart();
    installWidget(stub.chart);
    slbCenterViewport(stub.chart);
    stub.fireDataLoaded();
    expect(stub.setRangeCalls).toHaveLength(0);
  });

  it('no-ops when visible bounds are missing', () => {
    const stub = makeStubChart();
    installWidget(stub.chart);
    setVisibleFromMs(null);
    setVisibleToMs(null);
    slbCenterViewport(stub.chart);
    stub.fireDataLoaded();
    expect(stub.setRangeCalls).toHaveLength(0);
  });

  it('trailing frame: a single anchored setVisibleRange after data load', () => {
    const stub = makeStubChart();
    installWidget(stub.chart);
    // Trade window ends at the latest bar → trailing frame.
    setVisibleFromMs(8 * HOUR_MS);
    setVisibleToMs(LAST_BAR_MS);

    slbCenterViewport(stub.chart);
    expect(stub.setRangeCalls).toHaveLength(0); // waits for onDataLoaded

    stub.fireDataLoaded();
    vi.advanceTimersByTime(1000);

    // Exactly one call, anchored with percentRightMargin: 0, and no hold loop.
    expect(stub.setRangeCalls).toHaveLength(1);
    expect(stub.setRangeCalls[0].options).toStrictEqual({
      percentRightMargin: 0,
    });
  });

  it('historical frame: re-asserts the range across the hold window without percentRightMargin', () => {
    const stub = makeStubChart();
    installWidget(stub.chart);
    // Trade window ends well before the latest bar → historical frame.
    setVisibleFromMs(Number(HOUR_MS));
    setVisibleToMs(3 * HOUR_MS);

    slbCenterViewport(stub.chart);
    stub.fireDataLoaded();

    // First assertion fires synchronously; more arrive across the hold window.
    expect(stub.setRangeCalls.length).toBeGreaterThanOrEqual(1);
    vi.advanceTimersByTime(1000);
    expect(stub.setRangeCalls.length).toBeGreaterThan(1);

    // The historical-frame path must NOT pass percentRightMargin (it would
    // re-anchor the viewport to the latest candle).
    stub.setRangeCalls.forEach((call) => {
      expect(call.options).toBeUndefined();
    });

    // The framed range covers the trade window (1h..3h in seconds), not "today".
    const first = stub.setRangeCalls[0].range;
    expect(first.from).toBeLessThan(1 * 60 * 60);
    expect(first.to).toBeGreaterThanOrEqual(3 * 60 * 60);
    expect(first.to).toBeLessThan(LAST_BAR_MS / 1000);
  });

  it('historical frame: the hold loop stops re-asserting after the hold window', () => {
    const stub = makeStubChart();
    installWidget(stub.chart);
    setVisibleFromMs(Number(HOUR_MS));
    setVisibleToMs(3 * HOUR_MS);

    slbCenterViewport(stub.chart);
    stub.fireDataLoaded();
    vi.advanceTimersByTime(2000);
    const settled = stub.setRangeCalls.length;
    vi.advanceTimersByTime(2000);
    expect(stub.setRangeCalls).toHaveLength(settled);
  });

  it('historical frame: a stale data generation cancels the hold', () => {
    const stub = makeStubChart();
    installWidget(stub.chart);
    setVisibleFromMs(Number(HOUR_MS));
    setVisibleToMs(3 * HOUR_MS);

    slbCenterViewport(stub.chart);
    stub.fireDataLoaded();
    const before = stub.setRangeCalls.length;

    // A fresh series arrives mid-hold → the in-flight hold must stop.
    bumpOhlcvGeneration();
    vi.advanceTimersByTime(1000);
    expect(stub.setRangeCalls).toHaveLength(before);
  });

  it('drops the framing when the data generation changed before the load event', () => {
    const stub = makeStubChart();
    installWidget(stub.chart);
    setVisibleFromMs(Number(HOUR_MS));
    setVisibleToMs(3 * HOUR_MS);

    slbCenterViewport(stub.chart);
    bumpOhlcvGeneration(); // superseded before onDataLoaded fires
    stub.fireDataLoaded();
    vi.advanceTimersByTime(1000);
    expect(stub.setRangeCalls).toHaveLength(0);
  });

  it('immediate mode: applies the visible range synchronously without onDataLoaded', () => {
    const stub = makeStubChart();
    installWidget(stub.chart);
    setVisibleFromMs(8 * HOUR_MS);
    setVisibleToMs(LAST_BAR_MS);

    slbCenterViewport(stub.chart, { immediate: true });
    // Should fire immediately — no need to call fireDataLoaded.
    expect(stub.setRangeCalls).toHaveLength(1);
    expect(stub.setRangeCalls[0].options).toStrictEqual({
      percentRightMargin: 0,
    });
  });

  it('immediate mode: historical frame applies hold loop synchronously', () => {
    const stub = makeStubChart();
    installWidget(stub.chart);
    setVisibleFromMs(Number(HOUR_MS));
    setVisibleToMs(3 * HOUR_MS);

    slbCenterViewport(stub.chart, { immediate: true });
    // First assertion fires synchronously from the hold loop.
    expect(stub.setRangeCalls.length).toBeGreaterThanOrEqual(1);
    vi.advanceTimersByTime(1000);
    expect(stub.setRangeCalls.length).toBeGreaterThan(1);

    const first = stub.setRangeCalls[0].range;
    expect(first.from).toBeLessThan(1 * 60 * 60);
    expect(first.to).toBeGreaterThanOrEqual(3 * 60 * 60);
  });

  it('clears the centering-pending flag after framing', () => {
    const stub = makeStubChart();
    installWidget(stub.chart);
    setVisibleFromMs(8 * HOUR_MS);
    setVisibleToMs(LAST_BAR_MS);

    slbCenterViewport(stub.chart);
    stub.fireDataLoaded();

    // A second invocation should now no-op (pending was cleared).
    stub.setRangeCalls.length = 0;
    slbCenterViewport(stub.chart);
    stub.fireDataLoaded();
    vi.advanceTimersByTime(1000);
    expect(stub.setRangeCalls).toHaveLength(0);
  });

  it('historical frame: a newer hold supersedes the running one', () => {
    const stub = makeStubChart();
    installWidget(stub.chart);
    setVisibleFromMs(Number(HOUR_MS));
    setVisibleToMs(3 * HOUR_MS);
    slbCenterViewport(stub.chart, { immediate: true });

    setSlbCenteringPending(true);
    setVisibleFromMs(2 * HOUR_MS);
    setVisibleToMs(4 * HOUR_MS);
    slbCenterViewport(stub.chart, { immediate: true });
    stub.setRangeCalls.length = 0;
    vi.advanceTimersByTime(1000);

    expect(stub.setRangeCalls.length).toBeGreaterThan(0);
    stub.setRangeCalls.forEach((call) => {
      expect(call.range.to).toBeGreaterThanOrEqual(4 * 60 * 60);
    });
  });

  it('historical frame: the hold stops when the chart is torn down', () => {
    const stub = makeStubChart();
    installWidget(stub.chart);
    setVisibleFromMs(Number(HOUR_MS));
    setVisibleToMs(3 * HOUR_MS);

    slbCenterViewport(stub.chart, { immediate: true });
    const before = stub.setRangeCalls.length;
    setWidget(null);
    vi.advanceTimersByTime(1000);

    expect(stub.setRangeCalls).toHaveLength(before);
  });

  it('historical frame: falls back to setTimeout when requestAnimationFrame throws', () => {
    vi.mocked(window.requestAnimationFrame).mockImplementation(() => {
      throw new Error('rAF unavailable');
    });
    const stub = makeStubChart();
    installWidget(stub.chart);
    setVisibleFromMs(Number(HOUR_MS));
    setVisibleToMs(3 * HOUR_MS);

    slbCenterViewport(stub.chart, { immediate: true });
    vi.advanceTimersByTime(1000);

    expect(stub.setRangeCalls.length).toBeGreaterThan(1);
  });

  it('drops the framing when centering is no longer pending at the load event', () => {
    const stub = makeStubChart();
    installWidget(stub.chart);
    setVisibleFromMs(8 * HOUR_MS);
    setVisibleToMs(LAST_BAR_MS);

    slbCenterViewport(stub.chart);
    setSlbCenteringPending(false);
    stub.fireDataLoaded();

    expect(stub.setRangeCalls).toHaveLength(0);
  });

  it('treats the frame as trailing when no bars are loaded', () => {
    setOhlcvData([]);
    const stub = makeStubChart();
    installWidget(stub.chart);
    setVisibleFromMs(Number(HOUR_MS));
    setVisibleToMs(3 * HOUR_MS);

    slbCenterViewport(stub.chart, { immediate: true });

    expect(stub.setRangeCalls).toHaveLength(1);
    expect(stub.setRangeCalls[0].options).toStrictEqual({
      percentRightMargin: 0,
    });
  });

  it('reports errors and keeps centering pending when setting the range fails', () => {
    const bridge = { postMessage: vi.fn() };
    window.ReactNativeWebView = bridge;
    const chart = {
      setVisibleRange: () => {
        throw new Error('mid teardown');
      },
    } as unknown as TVActiveChart;
    installWidget(chart);
    setVisibleFromMs(8 * HOUR_MS);
    setVisibleToMs(LAST_BAR_MS);

    slbCenterViewport(chart, { immediate: true });

    expect(bridge.postMessage).toHaveBeenCalledWith(
      expect.stringContaining('"type":"ERROR"'),
    );
    expect(isSlbCenteringPending()).toBe(true);
  });
});

describe('slbScheduleInitialCentering', () => {
  beforeEach(() => {
    _resetStateForTests();
    _resetSocialLeaderboardForTests();
    setOhlcvData(bars);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('no-ops when slbMode is off', () => {
    setSlbMode(false);
    expect(() => slbScheduleInitialCentering()).not.toThrow();
  });

  it('no-ops when the widget is not ready', () => {
    setSlbMode(true);
    setSlbCenteringPending(true);
    expect(() => slbScheduleInitialCentering()).not.toThrow();
  });

  it('centers the active chart once its data loads', () => {
    setSlbMode(true);
    setSlbCenteringPending(true);
    setVisibleFromMs(8 * HOUR_MS);
    setVisibleToMs(LAST_BAR_MS);
    const stub = makeStubChart();
    installWidget(stub.chart);

    slbScheduleInitialCentering();
    stub.fireDataLoaded();

    expect(stub.setRangeCalls).toHaveLength(1);
  });

  it('reports errors when the active chart is unavailable', () => {
    setSlbMode(true);
    setSlbCenteringPending(true);
    const bridge = { postMessage: vi.fn() };
    window.ReactNativeWebView = bridge;
    setWidget({
      activeChart: () => {
        throw new Error('disposed');
      },
    } as unknown as TVChartingLibraryWidget);
    setChartReady(true);

    expect(() => slbScheduleInitialCentering()).not.toThrow();
    expect(bridge.postMessage).toHaveBeenCalledWith(
      expect.stringContaining('"type":"ERROR"'),
    );
  });
});

describe('slbHandleGetBars', () => {
  beforeEach(() => {
    _resetStateForTests();
  });

  it('returns false and does not respond when slbMode is off', () => {
    setSlbMode(false);
    const onResult = vi.fn();
    expect(slbHandleGetBars(onResult)).toBe(false);
    expect(onResult).not.toHaveBeenCalled();
  });

  it('signals noData and returns true when slbMode is on', () => {
    setSlbMode(true);
    const onResult = vi.fn();
    expect(slbHandleGetBars(onResult)).toBe(true);
    expect(onResult).toHaveBeenCalledWith([], { noData: true });
  });
});
