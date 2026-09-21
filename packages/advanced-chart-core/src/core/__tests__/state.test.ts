import {
  _resetStateForTests,
  getCurrentResolution,
  getCurrentSymbol,
  getLibraryError,
  getTheme,
  getWidget,
  isChartReady,
  isLibraryLoaded,
  setChartReady,
  setCurrentResolution,
  setCurrentSymbol,
  setLibraryError,
  setLibraryLoaded,
  setTheme,
  setWidget,
} from '../state.js';
import type { ChartTheme, TVChartingLibraryWidget } from '../types.js';

const stubWidget = {} as TVChartingLibraryWidget;
const stubTheme = { backgroundColor: 'rgb(0,0,0)' } as ChartTheme;

describe('core/state', () => {
  beforeEach(() => {
    _resetStateForTests();
  });

  it('defaults to unmounted state', () => {
    expect(getWidget()).toBeNull();
    expect(isChartReady()).toBe(false);
    expect(getCurrentSymbol()).toBe('ASSET');
    expect(getCurrentResolution()).toBe('5');
    expect(getTheme()).toBeNull();
    expect(isLibraryLoaded()).toBe(false);
    expect(getLibraryError()).toBeNull();
  });

  it('stores and returns the widget reference', () => {
    setWidget(stubWidget);
    expect(getWidget()).toBe(stubWidget);
    setWidget(null);
    expect(getWidget()).toBeNull();
  });

  it('tracks chart-ready, symbol, resolution, theme, library state', () => {
    setChartReady(true);
    setCurrentSymbol('BTC/USD');
    setCurrentResolution('60');
    setTheme(stubTheme);
    setLibraryLoaded(true);
    setLibraryError('boom');

    expect(isChartReady()).toBe(true);
    expect(getCurrentSymbol()).toBe('BTC/USD');
    expect(getCurrentResolution()).toBe('60');
    expect(getTheme()).toBe(stubTheme);
    expect(isLibraryLoaded()).toBe(true);
    expect(getLibraryError()).toBe('boom');
  });

  it('_resetStateForTests restores defaults', () => {
    setChartReady(true);
    setCurrentSymbol('FOO');
    _resetStateForTests();

    expect(isChartReady()).toBe(false);
    expect(getCurrentSymbol()).toBe('ASSET');
  });
});
