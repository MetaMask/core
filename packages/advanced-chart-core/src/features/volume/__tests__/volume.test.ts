import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import {
  _resetStateForTests,
  getVolumeIsOverlay,
  getVolumeStudyId,
  setChartReady,
  setTheme,
  setVolumeIsOverlay,
  setVolumeStudyId,
  setWidget,
} from '../../../core/state.js';
import type {
  ChartTheme,
  TVActiveChart,
  TVChartingLibraryWidget,
} from '../../../core/types.js';
import { handleToggleVolume } from '../index.js';

type ChartMock = {
  createStudy: Mock;
  removeEntity: Mock;
  getAllPanesHeight: Mock;
  setAllPanesHeight: Mock;
};

const makeChart = (
  createStudyImpl?: Mock,
): {
  chart: TVActiveChart;
  mock: ChartMock;
} => {
  const mock: ChartMock = {
    createStudy: createStudyImpl ?? vi.fn().mockResolvedValue('vol-1'),
    removeEntity: vi.fn(),
    getAllPanesHeight: vi.fn().mockReturnValue([300, 100]),
    setAllPanesHeight: vi.fn(),
  };
  return { chart: mock as unknown as TVActiveChart, mock };
};

const setupReadyWidget = (chart: TVActiveChart): void => {
  setWidget({ activeChart: () => chart } as unknown as TVChartingLibraryWidget);
  setChartReady(true);
};

const theme: ChartTheme = {
  successColor: 'rgb(0,255,0)',
  errorColor: 'rgb(255,0,0)',
} as ChartTheme;

describe('handleToggleVolume', () => {
  beforeEach(() => {
    _resetStateForTests();
    setTheme(theme);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
      (callback: FrameRequestCallback) => {
        const frameTime = 0;
        callback(frameTime);
        return 0;
      },
    );
  });

  afterEach(() => vi.restoreAllMocks());

  it('removes the existing volume study when visible=false', () => {
    const { chart, mock } = makeChart();
    setupReadyWidget(chart);
    setVolumeStudyId('vol-existing');
    setVolumeIsOverlay(false);

    handleToggleVolume({ visible: false });

    expect(mock.removeEntity).toHaveBeenCalledWith('vol-existing');
    expect(getVolumeStudyId()).toBeNull();
    expect(getVolumeIsOverlay()).toBeNull();
  });

  it('creates a sub-pane volume study when visible=true and volumeOverlay omitted', async () => {
    const createStudy = vi.fn().mockResolvedValue('new-vol');
    const { chart, mock } = makeChart(createStudy);
    setupReadyWidget(chart);

    handleToggleVolume({ visible: true });

    expect(mock.createStudy).toHaveBeenCalledWith(
      'Volume',
      false,
      false,
      {},
      expect.objectContaining({ 'volume.color.0': 'rgb(255,0,0)' }),
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(getVolumeStudyId()).toBe('new-vol');
    expect(getVolumeIsOverlay()).toBe(false);
  });

  it('creates an overlay-mode volume study when volumeOverlay=true', async () => {
    const createStudy = vi.fn().mockResolvedValue('new-vol');
    const { chart, mock } = makeChart(createStudy);
    setupReadyWidget(chart);

    handleToggleVolume({ visible: true, volumeOverlay: true });

    expect(mock.createStudy).toHaveBeenCalledWith(
      'Volume',
      true,
      false,
      {},
      expect.objectContaining({ 'volume.transparency': 70 }),
      { priceScale: 'no-scale' },
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(getVolumeIsOverlay()).toBe(true);
  });

  it('switches from sub-pane to overlay by removing then recreating', async () => {
    const createStudy = vi.fn().mockResolvedValue('vol-2');
    const { chart, mock } = makeChart(createStudy);
    setupReadyWidget(chart);
    setVolumeStudyId('vol-existing');
    setVolumeIsOverlay(false);

    handleToggleVolume({ visible: true, volumeOverlay: true });

    expect(mock.removeEntity).toHaveBeenCalledWith('vol-existing');
    expect(mock.createStudy).toHaveBeenCalledWith(
      'Volume',
      true,
      false,
      {},
      expect.any(Object),
      { priceScale: 'no-scale' },
    );
  });

  it('no-ops when widget is not ready', () => {
    expect(() => handleToggleVolume({ visible: true })).not.toThrow();
  });

  it('no-ops when payload is null', () => {
    const { chart } = makeChart();
    setupReadyWidget(chart);
    expect(() =>
      handleToggleVolume(null as unknown as { visible: boolean }),
    ).not.toThrow();
  });

  it('no-ops on visible=false when no existing study', () => {
    const { chart, mock } = makeChart();
    setupReadyWidget(chart);
    handleToggleVolume({ visible: false });
    expect(mock.removeEntity).not.toHaveBeenCalled();
    expect(getVolumeIsOverlay()).toBeNull();
  });

  it('swallows removeEntity errors on visible=false', () => {
    const { chart } = makeChart();
    vi.spyOn(chart as unknown as ChartMock, 'removeEntity').mockImplementation(
      () => {
        throw new Error('disposed');
      },
    );
    const bridge = { postMessage: vi.fn() };
    window.ReactNativeWebView = bridge;
    setupReadyWidget(chart);
    setVolumeStudyId('vol-existing');
    setVolumeIsOverlay(false);

    handleToggleVolume({ visible: false });

    expect(getVolumeStudyId()).toBeNull();
    expect(bridge.postMessage).toHaveBeenCalledWith(
      expect.stringContaining('"type":"ERROR"'),
    );
  });

  it('does not re-create when same overlay mode is already active', async () => {
    const createStudy = vi.fn().mockResolvedValue('vol-1');
    const { chart } = makeChart(createStudy);
    setupReadyWidget(chart);

    handleToggleVolume({ visible: true, volumeOverlay: true });
    await Promise.resolve();
    await Promise.resolve();

    createStudy.mockClear();
    handleToggleVolume({ visible: true, volumeOverlay: true });
    expect(createStudy).not.toHaveBeenCalled();
  });

  it('applies sub-pane heights after creating a sub-pane study', async () => {
    const createStudy = vi.fn().mockResolvedValue('new-vol');
    const { chart, mock } = makeChart(createStudy);
    setupReadyWidget(chart);

    handleToggleVolume({ visible: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(mock.setAllPanesHeight).toHaveBeenCalled();
    const heights = mock.setAllPanesHeight.mock.calls[0][0] as number[];
    expect(heights[0] + heights[1]).toBe(400);
  });

  it('builds overrides without theme colors when theme is null', () => {
    const createStudy = vi.fn().mockResolvedValue('vol-x');
    const { chart, mock } = makeChart(createStudy);
    setupReadyWidget(chart);
    setTheme(null as unknown as ChartTheme);

    handleToggleVolume({ visible: true });
    expect(mock.createStudy).toHaveBeenCalledWith(
      'Volume',
      false,
      false,
      {},
      expect.objectContaining({ 'volume ma.display': 0 }),
    );
  });

  it('swallows createStudy rejection', async () => {
    const createStudy = vi.fn().mockRejectedValue(new Error('study fail'));
    const { chart } = makeChart(createStudy);
    const bridge = { postMessage: vi.fn() };
    window.ReactNativeWebView = bridge;
    setupReadyWidget(chart);

    handleToggleVolume({ visible: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(bridge.postMessage).toHaveBeenCalledWith(
      expect.stringContaining('"type":"ERROR"'),
    );
  });
});

describe('registerVolumeThemeSync', () => {
  beforeEach(() => {
    _resetStateForTests();
    setTheme(theme);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
      (callback: FrameRequestCallback) => {
        const frameTime = 0;
        callback(frameTime);
        return 0;
      },
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it('recolors volume study when theme changes', async () => {
    const { registerVolumeThemeSync: registerVolumeTheme } =
      await import('../index.js');
    const { applyThemeColors } = await import('../../../widget/theme.js');
    const applyOverrides = vi.fn();
    const createStudy = vi.fn().mockResolvedValue('vol-sync');
    const chart = {
      createStudy,
      removeEntity: vi.fn(),
      getAllPanesHeight: vi.fn().mockReturnValue([300, 100]),
      setAllPanesHeight: vi.fn(),
      getStudyById: () => ({ applyOverrides }),
    } as unknown as TVActiveChart;
    setWidget({
      activeChart: () => chart,
    } as unknown as TVChartingLibraryWidget);
    setChartReady(true);

    registerVolumeTheme();

    handleToggleVolume({ visible: true, volumeOverlay: true });
    await Promise.resolve();
    await Promise.resolve();

    applyThemeColors({ successColor: 'rgb(0,200,0)' });
    expect(applyOverrides).toHaveBeenCalledWith(
      expect.objectContaining({
        'volume.color.1': expect.any(String),
      }),
    );
  });
});
