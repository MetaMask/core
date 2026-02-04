/**
 * Chart utility functions for Perps candlestick data
 * These functions are protocol-agnostic and used for candle calculations.
 */

import { CandlePeriod, TimeDuration } from '../types/chart';

/**
 * Maximum number of candles to fetch (memory management)
 */
const MAX_CANDLE_COUNT = 500;

/**
 * Minimum number of candles to fetch (basic functionality)
 */
const MIN_CANDLE_COUNT = 10;

/**
 * Convert candle period to minutes
 *
 * @param candlePeriod - The candle period enum value
 * @returns Period duration in minutes
 */
function getPeriodInMinutes(candlePeriod: CandlePeriod | string): number {
  switch (candlePeriod) {
    case CandlePeriod.OneMinute:
      return 1;
    case CandlePeriod.ThreeMinutes:
      return 3;
    case CandlePeriod.FiveMinutes:
      return 5;
    case CandlePeriod.FifteenMinutes:
      return 15;
    case CandlePeriod.ThirtyMinutes:
      return 30;
    case CandlePeriod.OneHour:
      return 60;
    case CandlePeriod.TwoHours:
      return 120;
    case CandlePeriod.FourHours:
      return 240;
    case CandlePeriod.EightHours:
      return 480;
    case CandlePeriod.TwelveHours:
      return 720;
    case CandlePeriod.OneDay:
      return 1440; // 24 * 60
    case CandlePeriod.ThreeDays:
      return 4320; // 3 * 24 * 60
    case CandlePeriod.OneWeek:
      return 10080; // 7 * 24 * 60
    case CandlePeriod.OneMonth:
      return 43200; // 30 * 24 * 60 (approximate)
    default:
      return 60; // Default to 1h
  }
}

/**
 * Convert duration to total minutes
 *
 * @param duration - The time duration enum value
 * @returns Total duration in minutes
 */
function getDurationInMinutes(duration: TimeDuration | string): number {
  switch (duration) {
    case TimeDuration.OneHour:
      return 60; // 1 hour
    case TimeDuration.OneDay:
      return 60 * 24; // 1 day
    case TimeDuration.OneWeek:
      return 60 * 24 * 7; // 1 week
    case TimeDuration.OneMonth:
      return 60 * 24 * 30; // 1 month (30 days)
    case TimeDuration.YearToDate:
      return 60 * 24 * 365; // Year to date (365 days max)
    case TimeDuration.Max:
      return 60 * 24 * 365 * 2; // Max (2 years)
    default:
      return 60 * 24; // Default to 1 day
  }
}

/**
 * Calculate the number of candles to fetch based on duration and candle period
 *
 * @param duration - The time duration (e.g., '1hr', '1d', '1w')
 * @param candlePeriod - The candle period (e.g., '1m', '15m', '1h')
 * @returns Number of candles to fetch (capped between MIN and MAX)
 */
export function calculateCandleCount(
  duration: TimeDuration | string,
  candlePeriod: CandlePeriod | string,
): number {
  const periodInMinutes = getPeriodInMinutes(candlePeriod);
  const durationInMinutes = getDurationInMinutes(duration);

  // Calculate number of candles needed
  const candleCount = Math.ceil(durationInMinutes / periodInMinutes);

  // Cap at MAX_CANDLE_COUNT candles max for memory management
  // Allow minimum of MIN_CANDLE_COUNT candles for basic functionality
  return Math.min(Math.max(candleCount, MIN_CANDLE_COUNT), MAX_CANDLE_COUNT);
}
