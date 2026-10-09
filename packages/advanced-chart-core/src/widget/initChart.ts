// TradingView widget creation and onChartReady orchestration.
//
// Ported from chartLogic.js initChart() / onChartReady (lines ~5242-5601),
// stripped of:
//   - chrome-related branches (useCustomLabels / useCustomDashed) — Phase 4
//   - data-dependent gating (`window.ohlcvData.length === 0`) — Phase 2 calls
//     this function only once data is in
//   - custom crosshair listener + chart-interaction analytics — Phase 2
//     (interaction/) will own this
//   - line-end overlays / last-price overlays / legend overlay refresh —
//     Phase 4 deletes the first two; Phase 3 owns the legend
//
// Phase 1's job is the constructor call + onChartReady hook + library load
// orchestration. Phase 2 wires the datafeed.

import { postToRN, reportErrorToRN } from '../core/bridge.js';
import { loadTradingViewLibrary } from '../core/loadLibrary.js';
import {
  getWidget,
  setWidget,
  setChartReady,
  getCurrentSymbol,
  getCurrentResolution,
  getCurrentChartType,
  getTheme,
  getHasExplicitCurrentPriceLine,
} from '../core/state.js';
import { resolveUserTimezone } from '../core/timezone.js';
import { ChartType } from '../core/types.js';
import type {
  ChartConfig,
  ChartFeaturesConfig,
  ChartTheme,
  TVChartingLibraryWidget,
} from '../core/types.js';
import { installTradingViewExternalOpenBridge } from './externalLinkBridge.js';
import {
  getBuiltInScaleLabelOverrides,
  getSeriesColorOverrides,
  getCandleStyleOverrides,
  getThemeLineColor,
  getThemeLastPriceLineColor,
} from './theme.js';

/**
 * Generates a 19-shade palette from a base hex color, light→base→dark.
 * Used for TradingView `custom_themes.dark.color{1,3}`. Ported verbatim
 * from chartLogic.js `generatePaletteShades` (~line 999).
 *
 * @param hexColor - The base color as a `#rrggbb` hex string.
 * @returns An array of 19 `#rrggbb` shades from light to dark.
 */
export function generatePaletteShades(hexColor: string): string[] {
  const red = Number.parseInt(hexColor.slice(1, 3), 16);
  const green = Number.parseInt(hexColor.slice(3, 5), 16);
  const blue = Number.parseInt(hexColor.slice(5, 7), 16);
  const shades: string[] = [];
  for (let i = 0; i < 19; i++) {
    const ratio = i / 18;
    let shadeRed: number;
    let shadeGreen: number;
    let shadeBlue: number;
    if (ratio < 0.5) {
      const factor = 1 - ratio * 2;
      shadeRed = Math.round(red + (255 - red) * factor);
      shadeGreen = Math.round(green + (255 - green) * factor);
      shadeBlue = Math.round(blue + (255 - blue) * factor);
    } else {
      const factor = (ratio - 0.5) * 2;
      shadeRed = Math.round(red * (1 - factor));
      shadeGreen = Math.round(green * (1 - factor));
      shadeBlue = Math.round(blue * (1 - factor));
    }
    const packed =
      0x100_0000 + shadeRed * 0x1_0000 + shadeGreen * 0x100 + shadeBlue;
    shades.push(`#${packed.toString(16).slice(1)}`);
  }
  return shades;
}

const BASE_ENABLED_FEATURES: readonly string[] = [
  'study_templates',
  'iframe_loading_same_origin',
];

function resolveEnabledFeatures(features: ChartFeaturesConfig): string[] {
  const list = [...BASE_ENABLED_FEATURES];
  if (features.showBuiltInLegend) {
    list.push('always_show_legend_values_on_mobile');
  }
  return list;
}

function resolveDisabledFeatures(features: ChartFeaturesConfig): string[] {
  const list = (features.disabledFeatures ?? []).slice();
  if (!features.enableDrawingTools) {
    list.push('left_toolbar', 'context_menus');
  }
  if (!features.showBuiltInLegend) {
    list.push('legend_widget');
  }
  list.push('use_localstorage_for_settings');
  return list;
}

function buildWidgetOverrides(
  theme: ChartTheme,
  features?: ChartFeaturesConfig,
): Record<string, unknown> {
  const gridLineColor = theme.gridLineColor ?? 'transparent';
  const showLegend = features?.showBuiltInLegend === true;
  return {
    'paneProperties.background': theme.backgroundColor,
    'paneProperties.backgroundType': 'solid',
    'paneProperties.vertGridProperties.color': gridLineColor,
    'paneProperties.horzGridProperties.color': gridLineColor,
    'scalesProperties.lineColor': theme.backgroundColor,
    'scalesProperties.textColor': theme.textColor,
    'timeScale.borderColor': theme.backgroundColor,
    'scalesProperties.fontSize': 12,
    'scalesProperties.showStudyLastValue': false,
    'scalesProperties.showSeriesLastValue': true,
    'scalesProperties.showSymbolLabels': false,
    'scalesProperties.showRightScale': true,
    'scalesProperties.showLeftScale': false,
    'scalesProperties.showPriceScaleCrosshairLabel': true,
    'scalesProperties.showTimeScaleCrosshairLabel': true,
    'paneProperties.legendProperties.showSeriesTitle': false,
    'paneProperties.legendProperties.showSeriesOHLC': showLegend,
    'paneProperties.legendProperties.showBarChange': showLegend,
    'paneProperties.legendProperties.showVolume': showLegend,
    'paneProperties.legendProperties.showBackground': false,
    'paneProperties.legendProperties.showStudyTitles': showLegend,
    'paneProperties.legendProperties.showStudyArguments': showLegend,
    'paneProperties.legendProperties.showStudyValues': showLegend,
    'mainSeriesProperties.showPriceLine': !getHasExplicitCurrentPriceLine(),
    'mainSeriesProperties.priceLineColor': getThemeLastPriceLineColor(theme),
    // Pane margins keep candle (high/low fit) and line (close-only fit) charts
    // visually consistent. Without them, line auto-fits tighter and looks
    // zoomed in vs the candle chart for the same OHLCV.
    'paneProperties.topMargin': 12,
    'paneProperties.bottomMargin': 8,
    ...getCandleStyleOverrides(theme),
    ...getSeriesColorOverrides(
      getThemeLineColor(theme),
      getThemeLastPriceLineColor(theme),
    ),
    ...getBuiltInScaleLabelOverrides(theme),
  };
}

export type CreateChartWidgetOptions = {
  /** Datafeed object; Phase 1 has no real datafeed — Phase 2 supplies one. */
  datafeed: unknown;
  /**
   * Optional initial timeframe (visible-from / visible-to). Phase 2's
   * ohlcvIngestion module computes this from SET_OHLCV_DATA payload.
   */
  timeframe?: { type: 'time-range'; from: number; to: number };
  /** Custom formatters object (e.g. priceFormatterFactory). Phase 2 supplies. */
  customFormatters?: Record<string, unknown>;
  /** Resolved TV timezone string. Defaults to the device's IANA zone via `resolveUserTimezone()`. */
  timezone?: string;
  /** Callback fired exactly once when the widget is ready. */
  onReady?: (widget: TVChartingLibraryWidget) => void;
};

/**
 * Builds the TradingView widget. Returns the widget; the caller is expected
 * to store it via setWidget(). Emits CHART_READY + CHART_LAYOUT_SETTLED to
 * RN when the widget reports onChartReady.
 *
 * @param config - The resolved chart configuration.
 * @param options - Widget construction options (datafeed, formatters, etc.).
 * @returns The constructed TradingView widget.
 */
export function createChartWidget(
  config: ChartConfig,
  options: CreateChartWidgetOptions,
): TVChartingLibraryWidget {
  const { TradingView } = window;
  if (!TradingView) {
    throw new Error('TradingView library not loaded');
  }
  const theme = getTheme();
  if (!theme) {
    throw new Error('Theme not initialised — call initThemeFromConfig first');
  }

  const features = config.features ?? {};
  const disabledFeatures = resolveDisabledFeatures(features);

  const TvWidget = TradingView.widget;
  const widget = new TvWidget({
    symbol: getCurrentSymbol(),
    interval: getCurrentResolution(),
    timeframe: options.timeframe,
    container: 'tv_chart_container',
    datafeed: options.datafeed,
    library_path: config.libraryUrl,
    locale: 'en',
    custom_formatters: options.customFormatters,
    timezone: options.timezone ?? resolveUserTimezone(),
    fullscreen: false,
    autosize: true,
    theme: 'Dark',
    disabled_features: disabledFeatures,
    enabled_features: resolveEnabledFeatures(features),
    custom_themes: {
      dark: {
        color1: generatePaletteShades(theme.successColor),
        color3: generatePaletteShades(theme.errorColor),
      },
    },
    overrides: buildWidgetOverrides(theme, features),
    loading_screen: {
      backgroundColor: theme.backgroundColor,
      foregroundColor: theme.successColor,
    },
  });

  setWidget(widget);

  widget.onChartReady(() => {
    setChartReady(true);

    // Apply the stored chart type before revealing the chart. RN sends
    // SET_CHART_TYPE before SET_OHLCV_DATA, so the state already holds
    // the user's selection by the time onChartReady fires. Applying it
    // here prevents the brief candlestick flash for line-chart users.
    const storedType = getCurrentChartType();
    if (storedType !== ChartType.Candles) {
      try {
        widget.activeChart().setChartType(storedType);
      } catch (error) {
        reportErrorToRN(error);
      }
    }

    hideLoadingOverlay();
    installTradingViewExternalOpenBridge();
    postToRN('CHART_READY', {});
    scheduleChartLayoutSettledNotify();
    if (options.onReady) {
      try {
        options.onReady(widget);
      } catch (error) {
        reportErrorToRN(error);
      }
    }
  });

  return widget;
}

function hideLoadingOverlay(): void {
  try {
    const el = document.getElementById('loading-overlay');
    el?.classList.add('hidden');
  } catch {
    // Loading overlay may be absent in non-template contexts (e.g. tests).
  }
}

/**
 * Posts CHART_LAYOUT_SETTLED after two rAF ticks so RN's skeleton overlay
 * can hide once TradingView has actually laid out. Mirrors legacy
 * scheduleChartLayoutSettledNotify (~line 118).
 */
export function scheduleChartLayoutSettledNotify(): void {
  const send = (): void => {
    if (getWidget()) {
      postToRN('CHART_LAYOUT_SETTLED', {});
    }
  };
  try {
    requestAnimationFrame(() => {
      requestAnimationFrame(send);
    });
  } catch {
    setTimeout(send, 48);
  }
}

/**
 * Ensures library is loaded, then awaits caller-provided pre-widget setup.
 * Phase 2's ohlcvIngestion calls this once SET_OHLCV_DATA arrives.
 *
 * @param libraryUrl - Base URL to load the TradingView library from.
 */
export async function ensureLibraryLoaded(libraryUrl: string): Promise<void> {
  await loadTradingViewLibrary(libraryUrl);
}
