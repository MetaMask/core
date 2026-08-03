// Time normalization helpers used across modules.
//
// Ported from chartLogic.js: normalizeChartUnixSec (line ~3564),
// chartRawTimeToUnixMs (line ~3573), getApproxBarDurationSec (line ~3587).
// Phase 2's widget/ohlcvIngestion.ts and pagination/priceApi.ts consume
// these.

/**
 * Convert a timestamp to unix seconds, accepting either ms or seconds.
 * Values ≥ 1e12 are treated as milliseconds (~Sep 2001 in seconds; safe
 * threshold). Returns null for non-finite input.
 *
 * @param value - A timestamp in seconds or milliseconds.
 * @returns The timestamp in unix seconds, or null when non-finite.
 */
export function normalizeChartUnixSec(value: unknown): number | null {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return null;
  }
  return numericValue >= 1e12
    ? Math.floor(numericValue / 1000)
    : Math.floor(numericValue);
}

/**
 * Convert a raw TradingView timestamp to unix milliseconds. Unlike
 * normalizeChartUnixSec, keeps sub-second precision when the input is already
 * in seconds (multiplies by 1000 instead of flooring).
 *
 * @param value - A raw TradingView timestamp in seconds or milliseconds.
 * @returns The timestamp in unix milliseconds, or null when non-finite.
 */
export function chartRawTimeToUnixMs(value: unknown): number | null {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return null;
  }
  if (numericValue >= 1e12) {
    return numericValue;
  }
  return numericValue * 1000;
}

const DEFAULT_BAR_DURATION_SEC = 300;
const MIN_BAR_DURATION_SEC = 60;

/**
 * Approximates the bar duration (seconds) for a series of OHLCV bars by
 * measuring the gap between the last two points. Used for visible-range
 * alignment and end-icon insets.
 *
 * Returns a sensible default when the series is too short.
 *
 * @param bars - The OHLCV bar series to measure.
 * @returns The approximate bar duration in seconds.
 */
export function getApproxBarDurationSec(
  bars: readonly { time: number }[],
): number {
  if (!bars || bars.length < 2) {
    return DEFAULT_BAR_DURATION_SEC;
  }
  const prev = bars.at(-2);
  const last = bars.at(-1);
  if (!prev || !last) {return DEFAULT_BAR_DURATION_SEC;}
  const lastMs = Math.abs(last.time - prev.time);
  return Math.max(MIN_BAR_DURATION_SEC, Math.round(lastMs / 1000));
}
