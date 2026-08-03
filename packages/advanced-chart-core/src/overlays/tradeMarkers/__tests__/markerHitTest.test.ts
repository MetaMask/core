import {
  _resetStateForTests,
  setChartReady,
  setOhlcvData,
  setWidget,
} from '../../../core/state.js';
import type {
  OHLCVBar,
  TVActiveChart,
  TVChartingLibraryWidget,
  TVCrosshairParams,
  TVWidgetEvent,
} from '../../../core/types.js';
import {
  _resetMarkerHitTestForTests,
  attachMarkerHitTest,
  findTradeMarkerIdNearPoint,
} from '../markerHitTest.js';
import {
  _resetTradeMarkerStateForTests,
  getShapesByMarkerId,
  setMarkers,
} from '../state.js';

const sampleBars: OHLCVBar[] = [
  { time: 1_000, open: 1, high: 1, low: 1, close: 10 },
  { time: 2_000, open: 1, high: 1, low: 1, close: 20 },
  { time: 3_000, open: 1, high: 1, low: 1, close: 30 },
];

type MockBridge = {
  postMessage: jest.Mock<void, [string]>;
};

// Test-shim hooks attached to the mocked TradingView widget/globals. These
// names mirror the runtime shim contract and cannot be renamed, so they keep
// the same narrowly-scoped naming-convention exception the source modules use
// for external markers (see `widget/externalLinkBridge.ts`).
type CrosshairCallbackHost = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  __crosshairCb: ((params: TVCrosshairParams) => void) | null;
};

type WidgetWithFire = TVChartingLibraryWidget & {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  __fire: (event: string) => void;
};

// Minimal shapes for the inline chart mocks below. Annotating the enclosing
// arrows with these lets the nested mock methods be contextually typed, which
// satisfies explicit-function-return-type without per-leaf annotations.
type MockPriceRange = { from: number; to: number };
type MockTimeScale = { width: () => number };
type MockPriceScale = {
  getVisiblePriceRange: () => MockPriceRange;
  isInverted: () => boolean;
  getMode: () => number;
};
type MockPane = {
  getMainSourcePriceScale: () => MockPriceScale;
  getHeight: () => number;
};

function installBridge(): MockBridge {
  const bridge: MockBridge = { postMessage: jest.fn() };
  window.ReactNativeWebView = bridge;
  return bridge;
}

function makeChart(width: number): TVActiveChart {
  return {
    getVisibleBarsRange: () => ({ from: 1, to: 3 }),
    getVisibleRange: () => ({ from: 1, to: 3 }),
    getTimeScale: () => ({
      setRightOffset: () => undefined,
      barSpacingChanged: () => ({
        subscribe: () => undefined,
        unsubscribe: () => undefined,
      }),
      width: () => width,
    }),
    // No panes → priceToY returns null → dyPx = 0
    crossHairMoved: () => ({
      subscribe: (
        _scope: unknown,
        callback: (params: TVCrosshairParams) => void,
      ): void => {
        (globalThis as unknown as CrosshairCallbackHost).__crosshairCb =
          callback;
      },
      unsubscribe: () => undefined,
    }),
  } as unknown as TVActiveChart;
}

function makeWidget(chart: TVActiveChart): WidgetWithFire {
  const subscribers: Record<string, () => void> = {};
  const widget = {
    activeChart: () => chart,
    subscribe: (event: TVWidgetEvent, callback: () => void): void => {
      subscribers[event] = callback;
    },
  } as unknown as WidgetWithFire;
  widget.__fire = (event: string): void => {
    subscribers[event]?.();
  };
  return widget;
}

describe('findTradeMarkerIdNearPoint', () => {
  beforeEach(() => {
    _resetStateForTests();
    _resetTradeMarkerStateForTests();
    _resetMarkerHitTestForTests();
    setOhlcvData(sampleBars);
  });

  it('returns null when no markers cached', () => {
    setWidget(makeWidget(makeChart(300)));
    setChartReady(true);
    setMarkers([]);
    expect(findTradeMarkerIdNearPoint(2, 0)).toBeNull();
  });

  it('returns null when marker is off-screen (not drawn)', () => {
    const chart = makeChart(300);
    setWidget(makeWidget(chart));
    setChartReady(true);
    setMarkers([{ id: 'a', time: 2_000, intent: 'enter' }]);
    // Not present in shapesByMarkerId → drawn.has(id) === false → skipped.
    expect(findTradeMarkerIdNearPoint(2, 0)).toBeNull();
  });

  it('returns marker id when tap is within radius', () => {
    const chart = makeChart(300);
    setWidget(makeWidget(chart));
    setChartReady(true);
    setMarkers([{ id: 'a', time: 2_000, intent: 'enter' }]);
    // Register drawn shape so hit-test doesn't skip it.
    getShapesByMarkerId().set('a', { fill: 'f', ring: 'r' });
    // Tap exactly on the marker time (2s), offsetY undefined → dyPx=0.
    expect(findTradeMarkerIdNearPoint(2, undefined)).toBe('a');
  });

  it('returns null when tap is outside radius', () => {
    const chart = makeChart(300);
    setWidget(makeWidget(chart));
    setChartReady(true);
    setMarkers([{ id: 'a', time: 2_000, intent: 'enter' }]);
    getShapesByMarkerId().set('a', { fill: 'f', ring: 'r' });
    // pxPerSec = 300 / (3-1) = 150. Tap at time 1 → dx = (2-1)*150 = 150px.
    // 150 > 26 (radius) → null.
    expect(findTradeMarkerIdNearPoint(1, undefined)).toBeNull();
  });
});

describe('findTradeMarkerIdNearPoint — edge cases', () => {
  beforeEach(() => {
    _resetStateForTests();
    _resetTradeMarkerStateForTests();
    _resetMarkerHitTestForTests();
    setOhlcvData(sampleBars);
  });

  it('returns null when widget is not ready', () => {
    expect(findTradeMarkerIdNearPoint(2, 0)).toBeNull();
  });

  it('returns null when timeSec is NaN', () => {
    setWidget(makeWidget(makeChart(300)));
    setChartReady(true);
    setMarkers([{ id: 'a', time: 2_000, intent: 'enter' }]);
    getShapesByMarkerId().set('a', { fill: 'f', ring: 'r' });
    expect(findTradeMarkerIdNearPoint(NaN, 0)).toBeNull();
  });

  it('returns null when chart.activeChart() throws', () => {
    const widget = {
      activeChart: () => {
        throw new Error('disposed');
      },
    } as unknown as TVChartingLibraryWidget;
    setWidget(widget);
    setChartReady(true);
    setMarkers([{ id: 'a', time: 2_000, intent: 'enter' }]);
    getShapesByMarkerId().set('a', { fill: 'f', ring: 'r' });
    expect(findTradeMarkerIdNearPoint(2, 0)).toBeNull();
  });

  it('returns null when getTimeScale().width() is 0', () => {
    const chart = makeChart(0);
    setWidget(makeWidget(chart));
    setChartReady(true);
    setMarkers([{ id: 'a', time: 2_000, intent: 'enter' }]);
    getShapesByMarkerId().set('a', { fill: 'f', ring: 'r' });
    expect(findTradeMarkerIdNearPoint(2, 0)).toBeNull();
  });

  it('falls back to getVisibleRange when getVisibleBarsRange is absent', () => {
    const chart = {
      getVisibleRange: () => ({ from: 1, to: 3 }),
      getTimeScale: (): MockTimeScale => ({ width: () => 300 }),
    } as unknown as TVActiveChart;
    setWidget(makeWidget(chart));
    setChartReady(true);
    setMarkers([{ id: 'a', time: 2_000, intent: 'enter' }]);
    getShapesByMarkerId().set('a', { fill: 'f', ring: 'r' });
    expect(findTradeMarkerIdNearPoint(2, undefined)).toBe('a');
  });

  it('returns null when neither getVisibleBarsRange nor getVisibleRange are available', () => {
    const chart = {
      getTimeScale: (): MockTimeScale => ({ width: () => 300 }),
    } as unknown as TVActiveChart;
    setWidget(makeWidget(chart));
    setChartReady(true);
    setMarkers([{ id: 'a', time: 2_000, intent: 'enter' }]);
    getShapesByMarkerId().set('a', { fill: 'f', ring: 'r' });
    expect(findTradeMarkerIdNearPoint(2, 0)).toBeNull();
  });

  it('uses priceToY for Y-distance when offsetY is provided and panes exist', () => {
    const chart = {
      getVisibleBarsRange: () => ({ from: 1, to: 3 }),
      getTimeScale: (): MockTimeScale => ({ width: () => 300 }),
      getPanes: (): MockPane[] => [
        {
          getMainSourcePriceScale: () => ({
            getVisiblePriceRange: () => ({ from: 0, to: 100 }),
            isInverted: () => false,
            getMode: () => 0,
          }),
          getHeight: () => 400,
        },
      ],
    } as unknown as TVActiveChart;
    setWidget(makeWidget(chart));
    setChartReady(true);
    setMarkers([{ id: 'a', time: 2_000, intent: 'enter' }]);
    getShapesByMarkerId().set('a', { fill: 'f', ring: 'r' });
    // Marker snaps to bar at time 2_000, close=20
    // priceToY: hi=100, lo=0, price=20, h=400 → y = (100-20)/100 * 400 = 320
    // offsetY=320 → dyPx=0, dxPx=0 → dist=0 → within radius
    expect(findTradeMarkerIdNearPoint(2, 320)).toBe('a');
  });

  it('handles log scale mode in priceToY', () => {
    const chart = {
      getVisibleBarsRange: () => ({ from: 1, to: 3 }),
      getTimeScale: (): MockTimeScale => ({ width: () => 300 }),
      getPanes: (): MockPane[] => [
        {
          getMainSourcePriceScale: () => ({
            getVisiblePriceRange: () => ({ from: 10, to: 1000 }),
            isInverted: () => false,
            getMode: () => 1,
          }),
          getHeight: () => 400,
        },
      ],
    } as unknown as TVActiveChart;
    setWidget(makeWidget(chart));
    setChartReady(true);
    setMarkers([{ id: 'a', time: 2_000, intent: 'enter' }]);
    getShapesByMarkerId().set('a', { fill: 'f', ring: 'r' });
    // Log mode with valid prices → should compute Y without error
    expect(findTradeMarkerIdNearPoint(2, 200)).toBeDefined();
  });

  it('handles inverted price scale', () => {
    const chart = {
      getVisibleBarsRange: () => ({ from: 1, to: 3 }),
      getTimeScale: (): MockTimeScale => ({ width: () => 300 }),
      getPanes: (): MockPane[] => [
        {
          getMainSourcePriceScale: () => ({
            getVisiblePriceRange: () => ({ from: 0, to: 100 }),
            isInverted: () => true,
            getMode: () => 0,
          }),
          getHeight: () => 400,
        },
      ],
    } as unknown as TVActiveChart;
    setWidget(makeWidget(chart));
    setChartReady(true);
    setMarkers([{ id: 'a', time: 2_000, intent: 'enter' }]);
    getShapesByMarkerId().set('a', { fill: 'f', ring: 'r' });
    // Inverted: y = (price-lo)/(hi-lo)*h = (20-0)/(100-0)*400 = 80
    expect(findTradeMarkerIdNearPoint(2, 80)).toBe('a');
  });

  it('returns null when getPanes returns empty array', () => {
    const chart = {
      getVisibleBarsRange: () => ({ from: 1, to: 3 }),
      getTimeScale: (): MockTimeScale => ({ width: () => 300 }),
      getPanes: (): MockPane[] => [],
    } as unknown as TVActiveChart;
    setWidget(makeWidget(chart));
    setChartReady(true);
    setMarkers([{ id: 'a', time: 2_000, intent: 'enter' }]);
    getShapesByMarkerId().set('a', { fill: 'f', ring: 'r' });
    // priceToY returns null → dyPx=0 → only X distance matters
    // dxPx=0 → within radius
    expect(findTradeMarkerIdNearPoint(2, 9999)).toBe('a');
  });

  it('skips markers with invalid time', () => {
    const chart = makeChart(300);
    setWidget(makeWidget(chart));
    setChartReady(true);
    setMarkers([{ id: 'a', time: NaN, intent: 'enter' }]);
    getShapesByMarkerId().set('a', { fill: 'f', ring: 'r' });
    expect(findTradeMarkerIdNearPoint(2, 0)).toBeNull();
  });

  it('uses marker.price when snap returns null price', () => {
    const chart = {
      getVisibleBarsRange: () => ({ from: 1, to: 3 }),
      getTimeScale: (): MockTimeScale => ({ width: () => 300 }),
      getPanes: (): MockPane[] => [
        {
          getMainSourcePriceScale: () => ({
            getVisiblePriceRange: () => ({ from: 0, to: 100 }),
            isInverted: () => false,
            getMode: () => 0,
          }),
          getHeight: () => 400,
        },
      ],
    } as unknown as TVActiveChart;
    setWidget(makeWidget(chart));
    setChartReady(true);
    // Empty OHLCV so snapMarkerToNearestBar returns null → falls back to marker.price
    setOhlcvData([]);
    setMarkers([{ id: 'a', time: 2_000, intent: 'enter', price: 50 }]);
    getShapesByMarkerId().set('a', { fill: 'f', ring: 'r' });
    // priceToY(50) = (100-50)/100*400 = 200 → dyPx = 200-200 = 0, dxPx = 0 → dist=0
    expect(findTradeMarkerIdNearPoint(2, 200)).toBe('a');
  });
});

describe('attachMarkerHitTest', () => {
  beforeEach(() => {
    _resetStateForTests();
    _resetTradeMarkerStateForTests();
    _resetMarkerHitTestForTests();
    setOhlcvData(sampleBars);
    delete window.ReactNativeWebView;
  });

  it('posts TRADE_MARKER_PRESSED on a fresh tap landing on a marker', () => {
    const bridge = installBridge();
    const chart = makeChart(300);
    const widget = makeWidget(chart);
    setWidget(widget);
    setChartReady(true);
    setMarkers([{ id: 'a', time: 2_000, intent: 'enter' }]);
    getShapesByMarkerId().set('a', { fill: 'f', ring: 'r' });

    attachMarkerHitTest(widget, chart);

    // Simulate the crosshair capturing a tap point at the marker's time.
    const crosshairHandler = (globalThis as unknown as CrosshairCallbackHost)
      .__crosshairCb;
    crosshairHandler?.({ time: 2, price: 20, offsetY: undefined });

    // Release.
    widget.__fire('mouse_up');
    expect(bridge.postMessage).toHaveBeenCalledTimes(1);
    const call = bridge.postMessage.mock.calls[0][0];
    expect(JSON.parse(call)).toStrictEqual({
      type: 'TRADE_MARKER_PRESSED',
      payload: { id: 'a' },
    });
  });

  it('does not post when release lands off any marker', () => {
    const bridge = installBridge();
    const chart = makeChart(300);
    const widget = makeWidget(chart);
    setWidget(widget);
    setChartReady(true);
    setMarkers([{ id: 'a', time: 2_000, intent: 'enter' }]);
    getShapesByMarkerId().set('a', { fill: 'f', ring: 'r' });

    attachMarkerHitTest(widget, chart);

    const crosshairHandler = (globalThis as unknown as CrosshairCallbackHost)
      .__crosshairCb;
    crosshairHandler?.({ time: 1, price: 10, offsetY: undefined }); // ~150px away from marker

    widget.__fire('mouse_up');
    expect(bridge.postMessage).not.toHaveBeenCalled();
  });

  it('consumes the tap point on release so a second mouse_up does not re-fire', () => {
    const bridge = installBridge();
    const chart = makeChart(300);
    const widget = makeWidget(chart);
    setWidget(widget);
    setChartReady(true);
    setMarkers([{ id: 'a', time: 2_000, intent: 'enter' }]);
    getShapesByMarkerId().set('a', { fill: 'f', ring: 'r' });

    attachMarkerHitTest(widget, chart);
    const crosshairHandler = (globalThis as unknown as CrosshairCallbackHost)
      .__crosshairCb;
    crosshairHandler?.({ time: 2, price: 20, offsetY: undefined });

    widget.__fire('mouse_up');
    widget.__fire('mouse_up');
    expect(bridge.postMessage).toHaveBeenCalledTimes(1);
  });

  it('ignores crosshair events with missing price or time', () => {
    const bridge = installBridge();
    const chart = makeChart(300);
    const widget = makeWidget(chart);
    setWidget(widget);
    setChartReady(true);

    attachMarkerHitTest(widget, chart);
    const crosshairHandler = (globalThis as unknown as CrosshairCallbackHost)
      .__crosshairCb;

    crosshairHandler?.({
      time: undefined,
      price: undefined,
    } as unknown as TVCrosshairParams);
    widget.__fire('mouse_up');
    // No marker pressed — tap point was never recorded.
    expect(bridge.postMessage).not.toHaveBeenCalled();
  });

  it('reports error when crossHairMoved subscription throws', () => {
    const bridge = installBridge();
    const chart = {
      crossHairMoved: () => {
        throw new Error('subscription fail');
      },
    } as unknown as TVActiveChart;
    const widget = makeWidget(chart);
    setWidget(widget);
    setChartReady(true);

    attachMarkerHitTest(widget, chart);
    expect(bridge.postMessage).toHaveBeenCalledWith(
      expect.stringContaining('"type":"ERROR"'),
    );
  });

  it('reports error when widget.subscribe throws', () => {
    const bridge = installBridge();
    const chart = makeChart(300);
    const widget = {
      activeChart: () => chart,
      subscribe: () => {
        throw new Error('subscribe fail');
      },
    } as unknown as TVChartingLibraryWidget;
    setWidget(widget);
    setChartReady(true);

    attachMarkerHitTest(widget, chart);
    expect(bridge.postMessage).toHaveBeenCalledWith(
      expect.stringContaining('"type":"ERROR"'),
    );
  });
});
