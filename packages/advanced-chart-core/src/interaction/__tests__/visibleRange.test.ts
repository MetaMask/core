import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import {
  _resetStateForTests,
  setChartReady,
  setWidget,
} from '../../core/state.js';
import type {
  TVActiveChart,
  TVChartingLibraryWidget,
} from '../../core/types.js';
import {
  _resetVisibleRangeForTests,
  attachVisibleRangeListeners,
} from '../visibleRange.js';

type MockBridge = {
  postMessage: Mock<(...args: [string]) => void>;
};

const installRNBridge = (): MockBridge => {
  const bridge: MockBridge = { postMessage: vi.fn() };
  window.ReactNativeWebView = bridge;
  return bridge;
};

const makeChart = (): {
  chart: TVActiveChart;
  emitZoom: () => void;
  emitPan: () => void;
} => {
  let zoomCb: (() => void) | null = null;
  let panCb: (() => void) | null = null;
  const chart = {
    getTimeScale: () => ({
      barSpacingChanged: (): {
        subscribe: (scope: unknown, callback: () => void) => void;
        unsubscribe: () => undefined;
      } => ({
        subscribe: (_scope: unknown, callback: () => void): void => {
          zoomCb = callback;
        },
        unsubscribe: (): undefined => undefined,
      }),
      setRightOffset: (): undefined => undefined,
    }),
    onVisibleRangeChanged: () => ({
      subscribe: (_scope: unknown, callback: () => void): void => {
        panCb = callback;
      },
      unsubscribe: (): undefined => undefined,
    }),
  } as unknown as TVActiveChart;
  return {
    chart,
    emitZoom: () => zoomCb?.(),
    emitPan: () => panCb?.(),
  };
};

describe('attachVisibleRangeListeners', () => {
  beforeEach(() => {
    _resetStateForTests();
    _resetVisibleRangeForTests();
    delete window.ReactNativeWebView;
    setWidget({} as unknown as TVChartingLibraryWidget);
    setChartReady(true);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces zoom and emits CHART_INTERACTED with type=zoom', () => {
    const bridge = installRNBridge();
    const { chart, emitZoom } = makeChart();
    attachVisibleRangeListeners(chart);
    emitZoom();
    emitZoom();
    emitZoom();
    expect(bridge.postMessage).not.toHaveBeenCalled();
    vi.advanceTimersByTime(450);
    expect(bridge.postMessage).toHaveBeenCalledTimes(1);
    const last = bridge.postMessage.mock.calls[0][0];
    expect(last).toContain('"interaction_type":"zoom"');
  });

  it('debounces pan and emits CHART_INTERACTED with type=pan', () => {
    const bridge = installRNBridge();
    const { chart, emitPan } = makeChart();
    attachVisibleRangeListeners(chart);
    emitPan();
    vi.advanceTimersByTime(450);
    const last = bridge.postMessage.mock.calls[0][0];
    expect(last).toContain('"interaction_type":"pan"');
  });

  it('does not emit zoom when widget is null', () => {
    const bridge = installRNBridge();
    setWidget(null);
    const { chart, emitZoom } = makeChart();
    attachVisibleRangeListeners(chart);
    emitZoom();
    vi.advanceTimersByTime(450);
    expect(bridge.postMessage).not.toHaveBeenCalled();
  });

  it('does not emit pan when chart is not ready', () => {
    const bridge = installRNBridge();
    setChartReady(false);
    const { chart, emitPan } = makeChart();
    attachVisibleRangeListeners(chart);
    emitPan();
    vi.advanceTimersByTime(450);
    expect(bridge.postMessage).not.toHaveBeenCalled();
  });

  it('reports error to RN when barSpacingChanged throws', () => {
    const bridge = installRNBridge();
    const chart = {
      getTimeScale: () => ({
        barSpacingChanged: (): { subscribe: () => void } => ({
          subscribe: (): void => {
            throw new Error('getTimeScale fail');
          },
        }),
      }),
      onVisibleRangeChanged: () => ({
        subscribe: vi.fn(),
      }),
    } as unknown as TVActiveChart;

    attachVisibleRangeListeners(chart);

    expect(bridge.postMessage).toHaveBeenCalledWith(
      expect.stringContaining('"type":"ERROR"'),
    );
  });

  it('reports error to RN when onVisibleRangeChanged throws', () => {
    const bridge = installRNBridge();
    const chart = {
      getTimeScale: () => ({
        barSpacingChanged: (): { subscribe: Mock } => ({
          subscribe: vi.fn(),
        }),
      }),
      onVisibleRangeChanged: () => ({
        subscribe: (): void => {
          throw new Error('visibleRange fail');
        },
      }),
    } as unknown as TVActiveChart;

    attachVisibleRangeListeners(chart);

    expect(bridge.postMessage).toHaveBeenCalledWith(
      expect.stringContaining('"type":"ERROR"'),
    );
  });

  it('skips pan within 500ms after a zoom', () => {
    const bridge = installRNBridge();
    const { chart, emitZoom, emitPan } = makeChart();
    attachVisibleRangeListeners(chart);
    emitZoom();
    vi.advanceTimersByTime(450); // zoom fires
    bridge.postMessage.mockClear();
    emitPan();
    vi.advanceTimersByTime(450);
    expect(bridge.postMessage).not.toHaveBeenCalled();
  });
});
