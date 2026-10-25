import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import {
  _resetStateForTests,
  getActiveStudies,
  getMaStudies,
  registerStudy,
  setChartReady,
  setSubPaneHeightRatio,
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

  it('ignores reserved object keys as names', () => {
    const { chart, mock } = makeChart();
    setupReadyWidget(chart);
    handleAddIndicator({ name: '__proto__' }, baseConfig);
    expect(mock.createStudy).not.toHaveBeenCalled();
  });

  it('keeps pane heights when adding an indicator on the main pane', async () => {
    const createStudy = vi.fn().mockResolvedValue('sid-bol');
    const { chart, mock } = makeChart(createStudy);
    setupReadyWidget(chart);
    handleAddIndicator({ name: 'BOL' }, baseConfig);
    await Promise.resolve();
    await Promise.resolve();
    expect(getActiveStudies().get('BOL')).toBe('sid-bol');
    expect(mock.setAllPanesHeight).not.toHaveBeenCalled();
  });

  it.each([
    {
      reason: 'an Error',
      rejection: new Error('boom'),
      expected: 'Failed to add indicator: boom',
    },
    { reason: 'a non Error value', rejection: 'boom', expected: 'boom' },
  ])(
    'reports a createStudy rejection with $reason',
    async ({ rejection, expected }) => {
      const createStudy = vi.fn().mockRejectedValue(rejection);
      const { chart } = makeChart(createStudy);
      setupReadyWidget(chart);
      const bridge = installRNBridge();
      handleAddIndicator({ name: 'MACD' }, baseConfig);
      await Promise.resolve();
      await Promise.resolve();
      expect(getActiveStudies().has('MACD')).toBe(false);
      expect(bridge.postMessage).toHaveBeenCalledWith(
        expect.stringContaining(expected),
      );
    },
  );
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

  it('no-ops when no widget exists', () => {
    registerStudy('active', 'RSI', 'sid-rsi');
    handleRemoveIndicator({ name: 'RSI' });
    expect(getActiveStudies().get('RSI')).toBe('sid-rsi');
  });

  it.each([
    { reason: 'no name', indicatorName: '' },
    { reason: 'a reserved object key', indicatorName: 'constructor' },
  ])('no-ops for $reason', ({ indicatorName }) => {
    const { chart, mock } = makeChart();
    setupReadyWidget(chart);
    handleRemoveIndicator({ name: indicatorName });
    expect(mock.removeEntity).not.toHaveBeenCalled();
  });

  it('rebalances the remaining sub panes after removing a sub pane study', () => {
    const { chart, mock } = makeChart();
    mock.getStudyById.mockReturnValue({ paneIndex: () => 1 });
    setupReadyWidget(chart);
    setSubPaneHeightRatio(0.25);
    registerStudy('active', 'RSI', 'sid-rsi');
    registerStudy('active', 'MACD', 'sid-macd');

    handleRemoveIndicator({ name: 'RSI' });

    expect(mock.removeEntity).toHaveBeenCalledWith('sid-rsi');
    expect(mock.setAllPanesHeight).toHaveBeenCalled();
  });

  it('reports errors when removing the study fails', () => {
    const { chart, mock } = makeChart();
    mock.removeEntity.mockImplementation(() => {
      throw new Error('disposed');
    });
    const bridge = installRNBridge();
    setupReadyWidget(chart);
    registerStudy('active', 'RSI', 'sid-rsi');

    handleRemoveIndicator({ name: 'RSI' });

    expect(getActiveStudies().has('RSI')).toBe(false);
    expect(bridge.postMessage).toHaveBeenCalledWith(
      expect.stringContaining('"type":"ERROR"'),
    );
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

  it('no-ops when no widget exists', () => {
    registerStudy('ma', 'MA5', 'sid-5');
    handleSetMAVisibility({ visible: [] }, baseConfig);
    expect(getMaStudies().get('MA5')).toBe('sid-5');
  });

  it('no-ops when the payload is missing', () => {
    const { chart, mock } = makeChart();
    setupReadyWidget(chart);
    registerStudy('ma', 'MA5', 'sid-5');
    handleSetMAVisibility(
      null as unknown as Parameters<typeof handleSetMAVisibility>[0],
      baseConfig,
    );
    expect(mock.removeEntity).not.toHaveBeenCalled();
  });

  it('removes every MA variant when the visible list is missing', () => {
    const { chart, mock } = makeChart();
    setupReadyWidget(chart);
    registerStudy('ma', 'MA5', 'sid-5');
    handleSetMAVisibility(
      {} as Parameters<typeof handleSetMAVisibility>[0],
      baseConfig,
    );
    expect(mock.removeEntity).toHaveBeenCalledWith('sid-5');
    expect(getMaStudies().size).toBe(0);
  });

  it('reports errors when removing an MA variant fails', () => {
    const { chart, mock } = makeChart();
    mock.removeEntity.mockImplementation(() => {
      throw new Error('disposed');
    });
    const bridge = installRNBridge();
    setupReadyWidget(chart);
    registerStudy('ma', 'MA5', 'sid-5');

    handleSetMAVisibility({ visible: [] }, baseConfig);

    expect(getMaStudies().has('MA5')).toBe(false);
    expect(bridge.postMessage).toHaveBeenCalledWith(
      expect.stringContaining('"type":"ERROR"'),
    );
  });

  it('reports MA variants that fail to be created', async () => {
    const createStudy = vi.fn().mockRejectedValue(new Error('boom'));
    const { chart } = makeChart(createStudy);
    const bridge = installRNBridge();
    setupReadyWidget(chart);

    handleSetMAVisibility({ visible: ['MA20'] }, baseConfig);
    await Promise.resolve();
    await Promise.resolve();

    expect(getMaStudies().has('MA20')).toBe(false);
    expect(bridge.postMessage).toHaveBeenCalledWith(
      expect.stringContaining('MA creation failed: MA20'),
    );
  });
});
