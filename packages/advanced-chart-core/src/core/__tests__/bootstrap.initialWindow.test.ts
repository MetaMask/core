import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import type { SetOHLCVDataPayload } from '../../messages/contract.js';
import {
  _resetHandlersForTests,
  dispatchInboundMessage,
} from '../../messages/handler.js';
import { createChartWidget } from '../../widget/initChart.js';
import type { CreateChartWidgetOptions } from '../../widget/initChart.js';
import {
  _resetOhlcvIngestionForTests,
  applyInitialVisibleRange,
} from '../../widget/ohlcvIngestion.js';
import { _resetThemeForTests } from '../../widget/theme.js';
import { bootstrap } from '../bootstrap.js';
import { loadTradingViewLibrary } from '../loadLibrary.js';
import { _resetStateForTests } from '../state.js';
import type { ChartConfig, TVChartingLibraryWidget } from '../types.js';

vi.mock('../loadLibrary.js', () => ({
  loadTradingViewLibrary: vi.fn(),
}));

vi.mock('../../widget/initChart.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../widget/initChart.js')>()),
  createChartWidget: vi.fn(),
  scheduleChartLayoutSettledNotify: vi.fn(),
}));

vi.mock('../../widget/ohlcvIngestion.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../widget/ohlcvIngestion.js')>()),
  applyInitialVisibleRange: vi.fn(),
}));

const config: ChartConfig = {
  libraryUrl: 'https://cdn.example.com/',
  theme: {
    backgroundColor: 'rgb(0,0,0)',
    borderColor: 'rgb(17,17,17)',
    textColor: 'rgb(255,255,255)',
    textDefaultColor: 'rgb(255,255,255)',
    sectionBackgroundColor: 'rgb(34,34,34)',
    crosshairBackgroundColor: 'rgb(51,51,51)',
    crosshairTextColor: 'rgb(238,238,238)',
    legendTextColor: 'rgb(170,170,170)',
    textAlternativeColor: 'rgb(187,187,187)',
    successColor: 'rgb(0,255,0)',
    lineColor: 'rgb(171,205,239)',
    errorColor: 'rgb(255,0,0)',
    primaryColor: 'rgb(0,51,255)',
    currentPriceColor: 'rgb(34,34,0)',
  },
};

const DAY_MS = 86_400_000;
const LAST_BAR_MS = 1_700_000_000_000;

const dailyBars = (count: number): SetOHLCVDataPayload['data'] =>
  Array.from({ length: count }, (_, i) => {
    const time = LAST_BAR_MS - (count - 1 - i) * DAY_MS;
    return { time, open: 1, high: 2, low: 0.5, close: 1.5, volume: 0 };
  });

/**
 * Bootstraps, dispatches the first SET_OHLCV_DATA and waits for the widget to
 * be created.
 *
 * @param payload - Extra SET_OHLCV_DATA payload fields.
 * @returns The options passed to `createChartWidget`.
 */
async function createWidgetWith(
  payload: Partial<SetOHLCVDataPayload>,
): Promise<CreateChartWidgetOptions> {
  bootstrap();
  dispatchInboundMessage({
    type: 'SET_OHLCV_DATA',
    payload: { data: dailyBars(60), ...payload },
  });
  await vi.waitFor(() => {
    expect(createChartWidget).toHaveBeenCalledTimes(1);
  });
  return (createChartWidget as Mock).mock
    .calls[0][1] as CreateChartWidgetOptions;
}

describe('core/bootstrap initial visible window', () => {
  beforeEach(() => {
    _resetStateForTests();
    _resetHandlersForTests();
    _resetThemeForTests();
    _resetOhlcvIngestionForTests();
    vi.clearAllMocks();
    (loadTradingViewLibrary as Mock).mockResolvedValue(undefined);
    window.ReactNativeWebView = { postMessage: vi.fn() };
    window.CONFIG = config;
    vi.spyOn(window, 'addEventListener').mockImplementation(() => undefined);
    vi.spyOn(document, 'addEventListener').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete window.CONFIG;
    delete window.ReactNativeWebView;
  });

  it('passes the visible window as the constructor timeframe when not opted in', async () => {
    const visibleFromMs = LAST_BAR_MS - 30 * DAY_MS;

    const options = await createWidgetWith({ visibleFromMs });

    expect(options.timeframe).toStrictEqual({
      type: 'time-range',
      from: Math.floor(visibleFromMs / 1000),
      to: expect.any(Number),
    });
  });

  it('omits the constructor timeframe when boundedIntervalWindow is set', async () => {
    const options = await createWidgetWith({
      visibleFromMs: LAST_BAR_MS - 30 * DAY_MS,
      boundedIntervalWindow: true,
    });

    expect(options.timeframe).toBeUndefined();
  });

  it('keeps the constructor timeframe in SLB mode even when boundedIntervalWindow is set', async () => {
    const options = await createWidgetWith({
      visibleFromMs: LAST_BAR_MS - 30 * DAY_MS,
      boundedIntervalWindow: true,
      slbMode: true,
    });

    expect(options.timeframe).toMatchObject({ type: 'time-range' });
  });

  it('applies the initial visible range once the widget is ready', async () => {
    const options = await createWidgetWith({
      visibleFromMs: LAST_BAR_MS - 30 * DAY_MS,
      boundedIntervalWindow: true,
    });
    const chart = {
      getTimeScale: vi.fn().mockReturnValue({ setRightOffset: vi.fn() }),
    };
    const widget = {
      activeChart: () => chart,
    } as unknown as TVChartingLibraryWidget;

    options.onReady?.(widget);

    expect(applyInitialVisibleRange).toHaveBeenCalledWith(chart);
  });
});
