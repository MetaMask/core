// Default OHLCV paginator — fetches older bars from the MetaMask Price API.
//
// Used by widget/datafeed.ts when state.ohlcvPagination has a cursor. Phase 6
// adds pagination/rnBacked.ts as an alternative strategy (consumer-supplied
// fetchOlderBars callback for Perps' RN-backed candle source).
//
// Ported from chartLogic.js `fetchOlderBars` (lines ~4991-5072), trimmed of
// the layout-settle pending machinery and trade-marker refresh hook (those
// belong to later phases / are gone after Phase 4).

import { reportErrorToRN } from '../core/bridge.js';
import { notifyDataLifecycle } from '../core/dataLifecycle.js';
import {
  bumpOhlcvGeneration,
  getOhlcvGeneration,
  getOhlcvPagination,
  prependOhlcvBars,
  setOhlcvPagination,
} from '../core/state.js';
import type { OHLCVBar } from '../core/types.js';

export const OHLCV_BASE_URL = 'https://price.api.cx.metamask.io/v3/ohlcv-chart';

export type PriceApiCandle = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type PriceApiResponse = {
  data: PriceApiCandle[];
  nextCursor?: string | null;
  hasNext?: boolean;
};

export type FetchOlderBarsRequest = {
  /** Oldest known bar.time (ms) when the request was deferred — used to slice the response. */
  oldestAtDefer: number;
};

export type FetchOlderBarsResult = {
  /** Bars strictly older than `oldestAtDefer`. */
  olderBars: OHLCVBar[];
  /** True when there are no older bars to deliver (let TV mark `noData: true`). */
  noData: boolean;
};

/**
 * Fetches the next page from the Price API and merges new bars into state.
 * Resolves with the slice strictly older than `oldestAtDefer` (TV's getBars
 * wants only bars before its current visible window). Returns `noData: true`
 * when the cursor is exhausted or the response yields no older bars.
 *
 * Aborts with `noData: true` when ohlcvGeneration changes mid-flight (a newer
 * SET_OHLCV_DATA has invalidated this fetch).
 *
 * @param request - The pagination request describing the cursor and window.
 * @returns The older-bars slice plus a `noData` flag.
 */
export async function fetchOlderBarsFromPriceApi(
  request: FetchOlderBarsRequest,
): Promise<FetchOlderBarsResult> {
  const pag = getOhlcvPagination();
  if (!pag.nextCursor || !pag.hasMore || !pag.assetId) {
    return { olderBars: [], noData: true };
  }

  const generation = getOhlcvGeneration();

  const params: string[] = [];
  params.push(`nextCursor=${encodeURIComponent(pag.nextCursor)}`);
  if (pag.vsCurrency) {
    params.push(`vsCurrency=${encodeURIComponent(pag.vsCurrency)}`);
  }
  const url = `${OHLCV_BASE_URL}/${pag.assetId}?${params.join('&')}`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    if (generation !== getOhlcvGeneration()) {
      return { olderBars: [], noData: true };
    }
    reportErrorToRN(error);
    return { olderBars: [], noData: true };
  }

  if (!response.ok) {
    if (generation !== getOhlcvGeneration()) {
      return { olderBars: [], noData: true };
    }
    reportErrorToRN(new Error(`OHLCV API error: ${response.status}`));
    return { olderBars: [], noData: true };
  }

  let parsed: PriceApiResponse;
  try {
    parsed = (await response.json()) as PriceApiResponse;
  } catch (error) {
    reportErrorToRN(error);
    return { olderBars: [], noData: true };
  }

  if (generation !== getOhlcvGeneration()) {
    return { olderBars: [], noData: true };
  }

  if (!parsed || !Array.isArray(parsed.data)) {
    reportErrorToRN(new Error('OHLCV API response: invalid payload'));
    return { olderBars: [], noData: true };
  }

  const newBars: OHLCVBar[] = parsed.data.map((candle) => ({
    time: candle.timestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
  }));

  setOhlcvPagination({
    ...pag,
    nextCursor: parsed.nextCursor ?? null,
    hasMore: Boolean(parsed.hasNext),
  });

  if (newBars.length > 0) {
    prependOhlcvBars(newBars);
    notifyDataLifecycle('ohlcvPrepended');
  }

  const olderBars = newBars.filter((b) => b.time < request.oldestAtDefer);
  return { olderBars, noData: olderBars.length === 0 };
}

/**
 * Test-only helper: invalidates any in-flight fetches by bumping the generation.
 */
export function invalidateInFlightFetches(): void {
  bumpOhlcvGeneration();
}
