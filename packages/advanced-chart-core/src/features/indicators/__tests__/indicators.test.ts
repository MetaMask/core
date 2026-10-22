import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import {
  _resetStateForTests,
  getActiveStudies,
  getMaStudies,
  registerStudy,
  setChartReady,
  setWidget,
} from '../../../core/state.js';
import type {
  ChartConfig,
  TVActiveChart,
  TVChartingLibraryWidget,
} from '../../../core/types.js';
import {
  handleAddIndicator,
  handleRemoveIndicator,
  handleSetMAVisibility,
} from '../index.js';

type ChartMock = {
  createStudy: Mock;
  removeEntity: Mock;
  getStudyById: Mock;
  getAllPanesHeight: Mock;
  setAllPanesHeight: Mock;
  exportData: Mock;
};

const makeChart = (
  createStudyImpl?: Mock,
): {
  chart: TVActiveChart;
  mock: ChartMock;
} => {
  const mock: ChartMock = {
    createStudy: createStudyImpl ?? vi.fn().mockResolvedValue('sid-default'),
    removeEntity: vi.fn(),
    getStudyById: vi.fn().mockReturnValue(null),
    getAllPanesHeight: vi.fn().mockReturnValue([300, 100]),
    setAllPanesHeight: vi.fn(),
    exportData: vi.fn().mockResolvedValue({
      schema: [],
      data: [],
    }),
  };
  return { chart: mock as unknown as TVActiveChart, mock };
};

const installRNBridge = (): { postMessage: Mock } => {
  const bridge = { postMessage: vi.fn() };
  window.ReactNativeWebView = bridge;
  return bridge;
};

const baseConfig: ChartConfig = {
  libraryUrl: 'https://x/',
  theme: { backgroundColor: 'rgb(0,0,0)' } as ChartConfig['theme'],
};

const setupReadyWidget = (chart: TVActiveChart): void => {
  setWidget({ activeChart: () => chart } as unknown as TVChartingLibraryWidget);
  setChartReady(true);
};

describe('handleAddIndicator', () => {
  beforeEach(() => {
    _resetStateForTests();
    installRNBridge();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
      (callback: FrameRequestCallback) => {
        const frameTime = 0;
        callback(frameTime);
        return 0;
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('no-ops when no widget exists', () => {
    handleAddIndicator({ name: 'MACD' }, baseConfig);
    expect(getActiveStudies().size).toBe(0);
  });

  it('no-ops when payload has no name', () => {
    const { chart } = makeChart();
    setupReadyWidget(chart);
    handleAddIndicator({ name: '' }, baseConfig);
    expect(getActiveStudies().size).toBe(0);
  });

  it('skips duplicates', () => {
    const { chart, mock } = makeChart();
    setupReadyWidget(chart);
    registerStudy('active', 'MACD', 'existing');
    handleAddIndicator({ name: 'MACD' }, baseConfig);
    expect(mock.createStudy).not.toHaveBeenCalled();
  });

  it('registers + announces a successful add', async () => {
    const createStudy = vi.fn().mockResolvedValue('sid-macd');
    const { chart, mock } = makeChart(createStudy);
    setupReadyWidget(chart);
    handleAddIndicator({ name: 'MACD' }, baseConfig);
    // Flush microtasks for the createStudy promise.
    await Promise.resolve();
    await Promise.resolve();
    expect(mock.createStudy).toHaveBeenCalledWith(
      'MACD',
      false,
      false,
      expect.objectContaining({ in_0: 12 }),
      expect.not.objectContaining({ showLegendValues: false }),
    );
    expect(getActiveStudies().get('MACD')).toBe('sid-macd');
  });
});

describe('handleRemoveIndicator', () => {
  beforeEach(() => {
    _resetStateForTests();
    installRNBridge();
  });

  it('removes an active study and emits INDICATOR_REMOVED', () => {
    const { chart, mock } = makeChart();
    setupReadyWidget(chart);
    registerStudy('active', 'RSI', 'sid-rsi');
    handleRemoveIndicator({ name: 'RSI' });
    expect(mock.removeEntity).toHaveBeenCalledWith('sid-rsi');
    expect(getActiveStudies().has('RSI')).toBe(false);
  });

  it('no-ops when the indicator is not active', () => {
    const { chart, mock } = makeChart();
    setupReadyWidget(chart);
    handleRemoveIndicator({ name: 'RSI' });
    expect(mock.removeEntity).not.toHaveBeenCalled();
  });
});

describe('handleSetMAVisibility', () => {
  beforeEach(() => {
    _resetStateForTests();
    installRNBridge();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
      (callback: FrameRequestCallback) => {
        const frameTime = 0;
        callback(frameTime);
        return 0;
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('removes MA variants that are no longer in the visible list', () => {
    const { chart, mock } = makeChart();
    setupReadyWidget(chart);
    registerStudy('ma', 'MA5', 'sid-5');
    registerStudy('ma', 'MA10', 'sid-10');
    handleSetMAVisibility({ visible: ['MA10'] }, baseConfig);
    expect(mock.removeEntity).toHaveBeenCalledWith('sid-5');
    expect(getMaStudies().has('MA5')).toBe(false);
    expect(getMaStudies().has('MA10')).toBe(true);
  });

  it('adds new MA variants via createStudy', async () => {
    const createStudy = vi.fn().mockResolvedValue('sid-50');
    const { chart, mock } = makeChart(createStudy);
    setupReadyWidget(chart);
    handleSetMAVisibility({ visible: ['MA50'] }, baseConfig);
    await Promise.resolve();
    await Promise.resolve();
    expect(mock.createStudy).toHaveBeenCalledWith(
      'Moving Average',
      false,
      false,
      { length: 50 },
      expect.objectContaining({ 'Plot.color': expect.any(String) }),
    );
    expect(getMaStudies().get('MA50')).toBe('sid-50');
  });

  it('ignores names not in MA_LENGTHS', () => {
    const { chart, mock } = makeChart();
    setupReadyWidget(chart);
    handleSetMAVisibility({ visible: ['MAUnknown'] }, baseConfig);
    expect(mock.createStudy).not.toHaveBeenCalled();
  });
});
