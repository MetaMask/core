// SET_OHLCV_DATA and REALTIME_UPDATE inbound handlers.
//
// Ported from chartLogic.js: handleSetOHLCVData (~line 507) and
// handleRealtimeUpdate (~line 658).
//
// Phase 2 simplifications vs legacy:
// - No `__mmLayoutSettlePending` / `beginDeferredLayoutSettleAfterOhlcvReload`
//   plumbing — CHART_LAYOUT_SETTLED is emitted on chart ready and on each
//   data load directly.
// - No chrome-related branches (`refreshLineChartOverlays`, line-end-dot,
//   custom dashed price line) — those features are deleted in Phase 4.
// - No trade-marker / indicator-state clear paths — Phase 5 / Phase 3 own
//   those overlays and they hook into their own message types, not into
//   SET_OHLCV_DATA's reset path.

import { postToRN, reportErrorToRN } from '../core/bridge.js';
import { notifyDataLifecycle } from '../core/dataLifecycle.js';
import { detectResolution } from '../core/resolution.js';
import {
  appendOrReplaceLastBar,
  bumpOhlcvGeneration,
  clearOhlcvPagination,
  doesLegendOwnLayoutSettle,
  getActiveStudies,
  getAtomicIntervalWindow,
  getCurrentResolution,
  getMaStudies,
  getOhlcvData,
  getOhlcvGeneration,
  getSlbMode,
  getVisibleFromMs,
  getWidget,
  isChartReady,
  setAtomicIntervalWindow,
  setCurrentResolution,
  setLegendOwnsLayoutSettle,
  setOhlcvData,
  setOhlcvPagination,
  setRnBackedPagination,
  setSlbCenteringPending,
  setSlbMode,
  setVisibleFromMs,
  setVisibleToMs,
} from '../core/state.js';
import { getApproxBarDurationSec } from '../core/timeUtils.js';
import type {
  TVActiveChart,
  TVChartingLibraryWidget,
  TVResolution,
} from '../core/types.js';
import type {
  RealtimeUpdateMessage,
  SetOHLCVDataPayload,
} from '../messages/contract.js';
import { slbCenterViewport } from '../overlays/socialLeaderboard/index.js';
import { resolveAllPendingOlderBarsNoData } from '../pagination/rnBacked.js';
import { forwardRealtimeTick } from './datafeed.js';

type FirstDataCallback = () => void;

let firstDataCallback: FirstDataCallback | null = null;
let firstDataDelivered = false;

/**
 * When active indicators exist, defers the CHART_LAYOUT_SETTLED signal to the
 * legend module so it fires after the first successful legend render — not on
 * the premature 2-rAF timer in emitLayoutSettled.
 */
function claimLegendSettleOwnership(): void {
  if (getActiveStudies().size > 0 || getMaStudies().size > 0) {
    setLegendOwnsLayoutSettle(true);
  }
}

/**
 * Registers the callback invoked the first time SET_OHLCV_DATA arrives.
 * Bootstrap wires this to widget creation (loads the TV library if needed,
 * then calls createChartWidget).
 *
 * @param callback - Invoked once when the first OHLCV data arrives.
 */
export function onFirstOhlcvData(callback: FirstDataCallback): void {
  firstDataCallback = callback;
}

export function handleSetOHLCVData(payload: SetOHLCVDataPayload): void {
  if (!payload?.data || payload.data.length === 0) {
    return;
  }

  resolveAllPendingOlderBarsNoData();

  setOhlcvData(payload.data);
  bumpOhlcvGeneration();

  if (payload.rnBackedPagination) {
    setRnBackedPagination(payload.rnBackedPagination);
  }

  const slb = Boolean(payload.slbMode);
  setSlbMode(slb);
  if (slb) {
    setSlbCenteringPending(true);
  }

  // Opt-in: default OFF so non-opt-in consumers keep today's plain
  // `setResolution` interval-switch behavior.
  setAtomicIntervalWindow(Boolean(payload.atomicIntervalWindow));

  if (payload.pagination) {
    setOhlcvPagination({
      nextCursor: payload.pagination.nextCursor ?? null,
      hasMore: Boolean(payload.pagination.hasMore),
      assetId: payload.pagination.assetId ?? null,
      vsCurrency: payload.pagination.vsCurrency ?? null,
    });
  } else {
    clearOhlcvPagination();
  }

  setVisibleFromMs(payload.visibleFromMs ?? null);
  setVisibleToMs(payload.visibleToMs ?? null);

  const newResolution = detectResolution(payload.data);
  const previousResolution = getCurrentResolution();
  setCurrentResolution(newResolution);

  const widget = getWidget();
  if (widget && isChartReady()) {
    try {
      const chart = widget.activeChart();
      if (previousResolution === newResolution) {
        // Same resolution — TV won't re-fetch via getBars, so we must
        // resetData to force it to pick up the new bars from the datafeed.
        resetDatafeedCacheBeforeHotReload(widget);
        chart.resetData();
        resetMainPriceScaleAutoScale(chart);
        notifyDataLifecycle('ohlcvReset');
        applyVisibleRange(chart);
        emitLayoutSettled();
      } else {
        // Different resolution — switch in place (no widget rebuild).
        switchResolutionInPlace(widget, newResolution);
      }
    } catch (error) {
      reportErrorToRN(error);
    }
    return;
  }

  if (!widget && firstDataCallback && !firstDataDelivered) {
    firstDataDelivered = true;
    try {
      firstDataCallback();
    } catch (error) {
      firstDataDelivered = false;
      reportErrorToRN(error);
    }
  }
}

export function handleRealtimeUpdate(
  payload: RealtimeUpdateMessage['payload'],
): void {
  if (!payload?.bar) {
    return;
  }

  const { bar } = payload;
  appendOrReplaceLastBar(bar);

  forwardRealtimeTick({
    time: bar.time,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
  });
}

/**
 * Compute the visible range (in whole seconds) for a requested start time: the
 * end is the last loaded bar plus a 2-bar right pad, falling back to
 * `Date.now()` when no bars are loaded.
 *
 * When `clampToOldest` is set (opt-in), the start is clamped so it
 * never predates the oldest loaded bar, keeping the range inside already-loaded
 * bars so framing never asks TradingView to fill an interval older than what is
 * in memory (which would trigger network pagination). When unset, the start is
 * used as-is — today's non-opt-in behavior.
 *
 * @param fromMs - Requested visible-range start, in milliseconds.
 * @param options - Range options.
 * @param options.clampToOldest - Clamp the start to the oldest loaded bar.
 * @returns The `{ from, to }` range in whole seconds.
 */
function computeVisibleRangeSec(
  fromMs: number,
  options: { clampToOldest: boolean },
): {
  from: number;
  to: number;
} {
  const data = getOhlcvData();
  const lastBar = data.at(-1);
  const oldestBarMs = data[0]?.time;
  const effectiveFromMs =
    options.clampToOldest && oldestBarMs !== undefined
      ? Math.max(fromMs, oldestBarMs)
      : fromMs;
  const toSec = lastBar
    ? Math.ceil(lastBar.time / 1000)
    : Math.ceil(Date.now() / 1000);
  const barPadSec = getApproxBarDurationSec(data) * 2;
  return { from: Math.floor(effectiveFromMs / 1000), to: toSec + barPadSec };
}

function applyVisibleRange(
  chart: TVActiveChart,
  options?: { dataAlreadyLoaded?: boolean },
): void {
  // Strategy C (SLB): center the viewport on the trade window using both
  // visibleFromMs and visibleToMs. Handled by the socialLeaderboard overlay
  // which subscribes to onDataLoaded and frames the exact trade window.
  if (getSlbMode()) {
    slbCenterViewport(chart, { immediate: options?.dataAlreadyLoaded });
    return;
  }

  const fromMs = getVisibleFromMs();
  if (fromMs === null) {
    try {
      chart.getTimeScale().setRightOffset(2);
    } catch (error) {
      reportErrorToRN(error);
    }
    return;
  }

  // Strategy A / B: anchor the visible range from `visibleFromMs` to the last
  // bar + 2-bar padding. This one-sided framing works because Token Details and
  // Perps always want the right edge near the latest candle.
  //
  // Opt-in: when `atomicIntervalWindow` is set, the start is clamped to the
  // oldest loaded bar so the pin never frames an interval older than the bars
  // in memory. Non-opt-in consumers keep the unclamped start.
  const clampToOldest = getAtomicIntervalWindow();
  const capturedGeneration = getOhlcvGeneration();
  const subscription = chart.onDataLoaded();
  const onLoaded = (): void => {
    subscription.unsubscribe(null, onLoaded);
    if (capturedGeneration !== getOhlcvGeneration()) {
      return;
    }
    try {
      const range = computeVisibleRangeSec(fromMs, { clampToOldest });
      chart.setVisibleRange(range, {
        percentRightMargin: 0,
      });
    } catch (error) {
      reportErrorToRN(error);
    }
  };
  subscription.subscribe(null, onLoaded);
}

function emitLayoutSettled(): void {
  if (doesLegendOwnLayoutSettle()) {
    return;
  }
  const send = (): void => {
    if (getWidget() && isChartReady()) {
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

function resetMainPriceScaleAutoScale(chart: TVActiveChart): void {
  try {
    if (typeof chart.getPanes !== 'function') {
      return;
    }
    const panes = chart.getPanes?.();
    const mainPane = panes?.[0];
    if (!mainPane || typeof mainPane.getMainSourcePriceScale !== 'function') {
      return;
    }
    const priceScale = mainPane.getMainSourcePriceScale();
    if (typeof priceScale?.setAutoScale === 'function') {
      priceScale.setAutoScale(true);
    }
  } catch {
    // Best-effort; failures are non-critical
  }
}

function resetDatafeedCacheBeforeHotReload(
  widget: TVChartingLibraryWidget,
): void {
  try {
    if (typeof widget.resetCache === 'function') {
      widget.resetCache();
    }
  } catch {
    // Best-effort; failures are non-critical
  }
}

/**
 * Applies the clamped per-interval visible range synchronously, for the opt-in
 * in-place resolution switch only.
 *
 * Unlike {@link applyVisibleRange} (which subscribes to `onDataLoaded`), this is
 * called from the `setResolution` callback where TradingView has already
 * finished loading the new resolution's data — so there is no further
 * `onDataLoaded` to wait for. The range is clamped to the oldest loaded bar
 * (`atomicIntervalWindow` is on whenever this runs), keeping the pin inside bars
 * already in memory so it cannot re-trigger backward pagination.
 *
 * Callers must gate on `getAtomicIntervalWindow() && !getSlbMode() &&
 * getVisibleFromMs() !== null`, so this never runs for existing (SLB /
 * non-opt-in) branches.
 *
 * @param chart - The active TradingView chart.
 */
function applyVisibleRangeImmediate(chart: TVActiveChart): void {
  const fromMs = getVisibleFromMs();
  if (fromMs === null) {
    return;
  }
  try {
    const range = computeVisibleRangeSec(fromMs, { clampToOldest: true });
    chart.setVisibleRange(range, { percentRightMargin: 0 });
  } catch (error) {
    reportErrorToRN(error);
  }
}

/**
 * Switches the live widget to a new resolution in place, without tearing it
 * down and rebuilding it.
 *
 * A bare `setResolution` makes TradingView preserve the previous interval's
 * wide visible TIME span and size the new series' first `getBars` `countBack`
 * from that span ÷ the new bar duration — a coarse→fine switch (e.g. 1W→1m)
 * then asks for hundreds of thousands of bars (the pagination storm; on
 * deep-history tokens it can hang). We avoid that by releasing the absolute
 * visible-range pin first: re-anchoring the time scale with a bar-index right
 * offset returns TradingView to count-preservation, so the switch reframes to
 * ~the visible bar count of the new resolution (bounded to ~hundreds of bars)
 * instead of the inherited span. Once the new series loads we re-apply the
 * per-interval visible range.
 *
 * Because the widget persists, studies / MA / volume / chart-type all survive
 * the switch with no re-application — and there is no blank/loading flash.
 *
 * @param widget - The live widget (kept, not rebuilt).
 * @param newResolution - The resolution detected from the incoming bars.
 */
function switchResolutionInPlace(
  widget: TVChartingLibraryWidget,
  newResolution: TVResolution,
): void {
  const chart = widget.activeChart();

  // Release the absolute visible-range pin so the switch preserves the visible
  // bar count (bounded) rather than the inherited wide time span (the storm).
  try {
    chart.getTimeScale().setRightOffset(2);
  } catch (error) {
    reportErrorToRN(error);
  }

  // With active studies, the legend owns CHART_LAYOUT_SETTLED so the host is
  // only told the layout settled once the legend has rendered values for the
  // new resolution (emitLayoutSettled below then no-ops).
  claimLegendSettleOwnership();

  try {
    chart.setResolution(newResolution, () => {
      try {
        resetMainPriceScaleAutoScale(chart);
        notifyDataLifecycle('ohlcvReset');
        // Opt-in only (Token Details / Perps): the new resolution's data is
        // already loaded by the time this callback fires, so the shared
        // `applyVisibleRange` — which waits on `onDataLoaded` — would never
        // re-fire and the per-interval window would not land. Apply it
        // synchronously instead (mirroring how SLB uses `immediate`). The range
        // is clamped to the oldest loaded bar, so it stays within bars already
        // in memory and cannot re-trigger pagination. Existing branches (SLB,
        // non-opt-in consumers) are untouched: they keep the `applyVisibleRange`
        // path below.
        if (
          getAtomicIntervalWindow() &&
          !getSlbMode() &&
          getVisibleFromMs() !== null
        ) {
          applyVisibleRangeImmediate(chart);
        } else {
          applyVisibleRange(chart, { dataAlreadyLoaded: true });
        }
        emitLayoutSettled();
      } catch (error) {
        reportErrorToRN(error);
      }
    });
  } catch (error) {
    reportErrorToRN(error);
  }
}

/** Test-only: clear the first-data trigger and the delivery flag. */
export function _resetOhlcvIngestionForTests(): void {
  firstDataCallback = null;
  firstDataDelivered = false;
}
