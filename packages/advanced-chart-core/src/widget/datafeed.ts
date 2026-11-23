// TradingView UDF datafeed object passed into the widget constructor.
//
// Ported from chartLogic.js `customDatafeed` (lines ~5074-5203) and its
// helpers `filterBarsForRange` (~4944), `fetchOlderBars` (~4991).
// Phase 2 wires the default Price API paginator; Phase 6 swaps in
// pagination/rnBacked.ts when consumers opt into the custom strategy.

import { reportErrorToRN, safeStringify } from '../core/bridge.js';
import {
  getOhlcvData,
  getOhlcvPagination,
  getRealtimeCallbacks,
  getRnBackedPagination,
  registerRealtimeCallback,
  unregisterRealtimeCallback,
} from '../core/state.js';
import type {
  GetBarsCallback,
  GetBarsErrorCallback,
  OHLCVBar,
  PeriodParams,
  RealtimeTickCallback,
  SymbolInfo,
  TVBar,
  TVDatafeed,
  TVResolution,
} from '../core/types.js';
import { slbHandleGetBars } from '../overlays/socialLeaderboard/index.js';
import { fetchOlderBarsFromPriceApi } from '../pagination/priceApi.js';
import { requestOlderBarsFromRN } from '../pagination/rnBacked.js';
import { getConfiguredPriceDecimals } from './priceFormatter.js';

const SUPPORTED_RESOLUTIONS: TVResolution[] = [
  '1',
  '3',
  '5',
  '15',
  '30',
  '60',
  '120',
  '240',
  '480',
  '720',
  '1D',
  '3D',
  '1W',
  '1M',
];

const DEFAULT_VARIABLE_TICK_SIZE = [
  '0.0000000001',
  '0.000001',
  '0.00000001',
  '0.0001',
  '0.000001',
  '0.01',
  '0.0001',
  '1',
  '0.01',
  '10000',
  '0.1',
].join(' ');

const PERPS_VARIABLE_TICK_SIZE = [
  '0.0000000001',
  '0.000001',
  '0.00000001',
  '0.0001',
  '0.000001',
  '0.01',
  '0.0001',
  '10000',
  '1',
].join(' ');

function getVariableTickSize(): string {
  return getConfiguredPriceDecimals() === null
    ? DEFAULT_VARIABLE_TICK_SIZE
    : PERPS_VARIABLE_TICK_SIZE;
}

function getPriceScale(): number {
  return getConfiguredPriceDecimals() === null ? 100 : 10000000000;
}

/**
 * Upper bound on the `countBack` we will honor for an RN-backed (Strategy B)
 * backward pagination request.
 *
 * On a coarse→fine resolution switch (e.g. 1W→1m) TradingView inherits the
 * previous interval's wide visible TIME range and sizes the first backward
 * `getBars` `countBack` to fill that range at the new resolution — e.g. a
 * ~1-year span at 1m resolves to ~550,000 bars. It then auto-fires successive
 * `firstDataRequest:false` calls, each decremented by the bars we return,
 * walking history back years and firing hundreds of host fetches (the
 * "pagination storm"). The in-place resolution switch releases the visible-range
 * pin before switching so TradingView preserves the visible bar count rather
 * than the inherited span, which prevents this upstream; this clamp is a final
 * backstop in case an over-large `countBack` still reaches the datafeed.
 *
 * A genuine user scroll-back only ever asks for roughly a viewport's worth of
 * bars plus a buffer — orders of magnitude below this bound — so clamping here
 * stops the inherited-range artifact without affecting real scroll-back. This
 * is deliberately NOT applied to the first request (which returns in-memory
 * bars above). Requests above this bound are clamped (not halted) so
 * scroll-back still works but each individual RN fetch stays bounded.
 */
const MAX_RNBACKED_PAGINATION_COUNTBACK = 5_000;

/**
 * Strips internal fields from an OHLCVBar to the shape TV expects.
 *
 * @param bar - The internal OHLCV bar.
 * @returns The bar in the shape TradingView expects.
 */
function toTVBar(bar: OHLCVBar): TVBar {
  return {
    time: bar.time,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
  };
}

/**
 * Filters the in-memory OHLCV array to the requested time window.
 * Mirrors legacy `filterBarsForRange`: returns bars in [fromMs, toMs); if
 * fewer than countBack bars match, falls back to the last countBack bars
 * before toMs.
 *
 * @param fromMs - Inclusive start of the window, in milliseconds.
 * @param toMs - Exclusive end of the window, in milliseconds.
 * @param countBack - Minimum number of bars TradingView expects.
 * @returns The matching bars in the requested window.
 */
export function filterBarsForRange(
  fromMs: number,
  toMs: number,
  countBack: number,
): TVBar[] {
  const all = getOhlcvData();
  const inRange: TVBar[] = [];
  for (const bar of all) {
    if (bar.time >= fromMs && bar.time < toMs) {
      inRange.push(toTVBar(bar));
    }
  }
  if (inRange.length >= countBack) {
    return inRange;
  }

  const beforeTo: OHLCVBar[] = all.filter((b) => b.time < toMs);
  const startIdx = Math.max(0, beforeTo.length - countBack);
  return beforeTo.slice(startIdx).map(toTVBar);
}

export const customDatafeed: TVDatafeed = {
  onReady(callback) {
    setTimeout(() => {
      callback({
        supported_resolutions: SUPPORTED_RESOLUTIONS,
        supports_marks: false,
        supports_timescale_marks: false,
        supports_time: true,
      });
    }, 0);
  },

  searchSymbols(_userInput, _exchange, _symbolType, onResult) {
    onResult([]);
  },

  resolveSymbol(symbolName, onResolve, _onError) {
    const info: SymbolInfo = {
      name: symbolName,
      ticker: symbolName,
      description: symbolName,
      type: 'crypto',
      session: '24x7',
      timezone: 'Etc/UTC',
      exchange: '',
      minmov: 1,
      pricescale: getPriceScale(),
      variable_tick_size: getVariableTickSize(),
      has_intraday: true,
      has_daily: true,
      has_weekly_and_monthly: true,
      supported_resolutions: SUPPORTED_RESOLUTIONS,
      volume_precision: 0,
      data_status: 'endofday',
    };
    setTimeout(() => onResolve(info), 0);
  },

  getBars(
    _symbolInfo: SymbolInfo,
    resolution: TVResolution,
    periodParams: PeriodParams,
    onResult: GetBarsCallback,
    onError: GetBarsErrorCallback,
  ) {
    try {
      const fromMs = periodParams.from * 1000;
      const toMs = periodParams.to * 1000;
      const bars = filterBarsForRange(fromMs, toMs, periodParams.countBack);
      if (bars.length > 0) {
        onResult(bars, { noData: false });
        return;
      }

      const all = getOhlcvData();
      if (periodParams.firstDataRequest || all.length === 0) {
        onResult([], { noData: true });
        return;
      }

      const oldestAtDefer = all[0].time;
      const pag = getOhlcvPagination();

      // Strategy C (SLB): all data is pre-loaded by RN — no pagination.
      if (slbHandleGetBars(onResult)) {
        return;
      }

      // Strategy A (Price API / Token Details):
      if (pag.assetId) {
        fetchOlderBarsFromPriceApi({ oldestAtDefer })
          .then(({ olderBars, noData }) => {
            onResult(olderBars, { noData });
            return undefined;
          })
          .catch((error) => {
            reportErrorToRN(error);
            onResult([], { noData: true });
          });
        // Strategy B (RN-backed / Perps):
      } else if (getRnBackedPagination().enabled) {
        // Clamp the inherited-range pagination storm (see
        // MAX_RNBACKED_PAGINATION_COUNTBACK). An over-threshold countBack is the
        // post-resolution-switch artifact, never a real scroll-back, so clamp it
        // to keep scroll-back functional while bounding each individual RN fetch.
        const effectiveCountBack = Math.min(
          periodParams.countBack,
          MAX_RNBACKED_PAGINATION_COUNTBACK,
        );
        requestOlderBarsFromRN({
          resolution,
          fromSec: periodParams.from,
          toSec: periodParams.to,
          countBack: effectiveCountBack,
          onResult,
        });
      } else {
        onResult([], { noData: true });
      }
    } catch (error) {
      let errMsg: string;
      if (error instanceof Error) {
        errMsg = error.message;
      } else if (typeof error === 'string') {
        errMsg = error;
      } else {
        errMsg = safeStringify(error);
      }
      onError(errMsg);
    }
  },

  subscribeBars(
    _symbolInfo: SymbolInfo,
    _resolution: TVResolution,
    onTick: RealtimeTickCallback,
    listenerGuid: string,
  ) {
    registerRealtimeCallback(listenerGuid, onTick);
  },

  unsubscribeBars(listenerGuid: string) {
    unregisterRealtimeCallback(listenerGuid);
  },
};

/**
 * Forward a realtime tick to every TradingView subscribeBars listener.
 * Called from widget/ohlcvIngestion.ts on REALTIME_UPDATE.
 *
 * @param tick - The realtime bar to forward to listeners.
 */
export function forwardRealtimeTick(tick: TVBar): void {
  const callbacks = getRealtimeCallbacks();
  for (const guid of Object.keys(callbacks)) {
    try {
      callbacks[guid](tick);
    } catch (error) {
      reportErrorToRN(error);
    }
  }
}
