// Centralised price-scale + pane-layout overrides.
//
// Ported from chartLogic.js `applyChartScaleLayout` (~line 1270). Applied on
// every chart-type switch and once on chart-ready so candle and line charts
// share the same visible Y range. Without paneProperties.topMargin /
// bottomMargin, TV auto-fits the line series tighter than the candle series
// (close-only vs high/low) and the line chart looks zoomed in.
//
// Phase 2 simplifications vs legacy:
// - Drops chrome-related toggles (showSeriesLastValue/CrosshairLabel
//   conditionals — TV built-in always on now)
// - Drops DOM overflow unclip / hide-price-scale-buttons (no chrome to hide)

import { reportErrorToRN } from '../core/bridge.js';
import {
  getConfig,
  getTheme,
  getWidget,
  isChartReady,
  getHasExplicitCurrentPriceLine,
} from '../core/state.js';
import type { ChartType, TVChartingLibraryWidget } from '../core/types.js';
import { getThemeLastPriceLineColor } from './theme.js';

const PANE_TOP_MARGIN = 12;
const PANE_BOTTOM_MARGIN = 8;

function buildScaleLayoutOverrides(): Record<string, unknown> {
  const theme = getTheme();
  if (!theme) {
    return {};
  }
  const gridLineColor = theme.gridLineColor ?? 'transparent';
  const hidePaneSeparator = getConfig()?.features?.hidePaneSeparator === true;
  const separatorColor = hidePaneSeparator
    ? theme.backgroundColor
    : theme.borderColor;

  return {
    'scalesProperties.showRightScale': true,
    'scalesProperties.showLeftScale': false,
    'scalesProperties.showSeriesLastValue': true,
    'scalesProperties.showStudyLastValue': false,
    'scalesProperties.showSymbolLabels': false,
    'scalesProperties.showPriceScaleCrosshairLabel': true,
    'scalesProperties.showTimeScaleCrosshairLabel': true,
    'mainSeriesProperties.showPriceLine': !getHasExplicitCurrentPriceLine(),
    'paneProperties.vertGridProperties.color': gridLineColor,
    'paneProperties.horzGridProperties.color': gridLineColor,
    'paneProperties.topMargin': PANE_TOP_MARGIN,
    'paneProperties.bottomMargin': PANE_BOTTOM_MARGIN,
    ...(theme?.backgroundColor
      ? {
          'timeScale.borderColor': theme.backgroundColor,
          'scalesProperties.lineColor': theme.backgroundColor,
        }
      : {}),
    ...(separatorColor
      ? { 'paneProperties.separatorColor': separatorColor }
      : {}),
    ...(theme
      ? {
          'mainSeriesProperties.priceLineColor':
            getThemeLastPriceLineColor(theme),
        }
      : {}),
  };
}

/**
 * Apply the scale-layout overrides plus re-attach the main series to the
 * right price scale. Safe to call multiple times. Errors are forwarded to RN.
 *
 * @param _type - Reserved for the chart type; currently unused.
 */
export function applyScaleLayout(_type?: ChartType): void {
  const widget = getWidget();
  if (!widget || !isChartReady()) {
    return;
  }
  try {
    widget.applyOverrides(buildScaleLayoutOverrides());
  } catch (error) {
    reportErrorToRN(error);
    return;
  }
  syncMainSeriesToRightScale(widget);
}

function syncMainSeriesToRightScale(widget: TVChartingLibraryWidget): void {
  try {
    const chart = widget.activeChart();
    // `detachToRight()` ALWAYS creates a *new* right price scale. If the main
    // series is already on a right scale, re-running it mints a second scale
    // and — when an overlay (e.g. a moving-average study) already occupies the
    // first one — orphans that overlay onto its own scale. That produces the
    // "two price scales" + offset-overlay bug when a chart-type switch re-runs
    // this after a study was added. So only detach when the series isn't
    // already on a right scale.
    const pane0 = chart.getPanes?.()?.[0];
    const rightCount = pane0?.getRightPriceScales?.()?.length ?? 0;
    if (rightCount >= 1) {
      return;
    }
    chart.getSeries().detachToRight();
  } catch {
    // detachToRight can fail mid-teardown; safe to ignore.
  }
}
