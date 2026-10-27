import type { AnalyticsTrackingEvent } from './AnalyticsPlatformAdapter.types.js';

/**
 * Analytics event emitted for a caught error.
 */
export const ERROR_OCCURRED_EVENT_NAME = 'Error Occurred';

/**
 * Segment-safe cap for `error_message`, including the truncation ellipsis.
 */
const MAX_ERROR_MESSAGE_LENGTH = 500;

const ELLIPSIS = '…';

/**
 * Default volume-control configuration for {@link reserveErrorOccurredEvent}.
 *
 * `samplingRate` is the probability from 0 to 1 that an individual event is emitted.
 * `dedupWindowMs` suppresses a repeated signature inside this window.
 * `sessionCap` is the maximum number of events emitted per controller instance.
 * A caller-supplied cap above this default is clamped down to it.
 */
export const DEFAULT_ERROR_TRACKING_OPTIONS = {
  samplingRate: 1,
  dedupWindowMs: 10_000,
  sessionCap: 50,
} as const;

/**
 * Volume-control knobs for {@link reserveErrorOccurredEvent}.
 */
export type TrackErrorVolumeControls = {
  /**
   * Per-event sampling rate between 0 and 1. 1 always emits.
   */
  samplingRate?: number;

  /**
   * Deduplication window in milliseconds. Events that share a signature
   * inside this window are suppressed.
   */
  dedupWindowMs?: number;

  /**
   * Maximum number of events emitted for this controller instance.
   * May only lower {@link DEFAULT_ERROR_TRACKING_OPTIONS.sessionCap}.
   * Larger values are clamped so a caller cannot raise the session bound.
   */
  sessionCap?: number;
};

/**
 * Options for reporting a caught error as an `Error Occurred` event.
 */
export type TrackErrorAsAnalyticsOptions = {
  /**
   * Unique discriminator for this error case.
   *
   * Use one value per distinct failure circumstance (for example
   * `swap-quote-fetch` or `clear-metametrics-data`), not a shared label for
   * every error in a file or package.
   */
  source: string;

  /**
   * Optional sampling, deduplication, and session-cap overrides.
   */
  volumeControls?: TrackErrorVolumeControls;
};

/**
 * In-memory volume-control state for one controller instance.
 *
 * This is not persisted. A new controller starts with a fresh budget.
 */
export type ErrorTrackingSession = {
  emittedCount: number;
  lastEmittedAtBySignature: Map<string, number>;
};

/**
 * Budget held for an event that has not yet been delivered.
 */
export type ErrorTrackingReservation = {
  signature: string;
  reservedAt: number;
};

/**
 * An event that passed volume controls, plus the reservation to release if
 * delivery throws.
 */
export type ReservedErrorOccurredEvent = {
  event: AnalyticsTrackingEvent;
  reservation: ErrorTrackingReservation;
};

/**
 * Normalizes whitespace and caps length for an analytics `error_message`.
 *
 * @param message - Raw error text.
 * @returns Sanitized message safe to send in analytics.
 */
function sanitizeErrorMessage(message: string): string {
  const trimmed = message.replace(/\s+/gu, ' ').trim();
  if (trimmed.length <= MAX_ERROR_MESSAGE_LENGTH) {
    return trimmed;
  }

  return `${trimmed.slice(0, MAX_ERROR_MESSAGE_LENGTH - ELLIPSIS.length)}${ELLIPSIS}`;
}

/**
 * Normalizes any thrown value into a sanitized message.
 *
 * Stack traces are dropped. `null` and `undefined` become `Unknown error`.
 *
 * @param error - The caught value to normalize.
 * @returns The sanitized error message.
 */
function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return sanitizeErrorMessage(error.message);
  }

  if (error === null || error === undefined) {
    return 'Unknown error';
  }

  if (typeof error === 'string') {
    return sanitizeErrorMessage(error);
  }

  if (
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return sanitizeErrorMessage(error.message);
  }

  if (typeof error === 'number') {
    return sanitizeErrorMessage(error.toString());
  }

  return 'Unknown error';
}

/**
 * Resolves the sampling rate, clamping to [0, 1] and falling back to the
 * default for non-finite values. A caller bug must not disable sampling:
 * NaN comparisons are always false and would otherwise emit every event.
 *
 * @param samplingRate - Caller-supplied rate, or undefined for the default.
 * @returns A finite sampling rate between 0 and 1.
 */
function resolveSamplingRate(samplingRate?: number): number {
  const fallback = DEFAULT_ERROR_TRACKING_OPTIONS.samplingRate;
  if (typeof samplingRate !== 'number' || !Number.isFinite(samplingRate)) {
    return fallback;
  }

  return Math.min(Math.max(samplingRate, 0), 1);
}

/**
 * Resolves a volume-control number, falling back to the default for
 * non-finite or negative values.
 *
 * @param value - Caller-supplied value, or undefined for the default.
 * @param fallback - Default used when the input is invalid.
 * @returns A finite, non-negative number.
 */
function resolveNonNegativeNumber(
  value: number | undefined,
  fallback: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return fallback;
  }

  return value;
}

/**
 * Applies volume controls and reserves session budget when the error should
 * be emitted.
 *
 * The signature is the event name, source, and sanitized message.
 * Call {@link releaseErrorTrackingReservation} if delivery throws, so a
 * failed report does not consume the cap or suppress the next attempt.
 *
 * @param session - Mutable per-controller volume-control state.
 * @param error - The caught value to report.
 * @param options - Source and optional volume controls.
 * @param now - Current time in milliseconds. Defaults to `Date.now()`.
 * @param randomSample - Sample in [0, 1). Defaults to `Math.random()`.
 * @returns The event to send and its reservation, or `undefined` when the
 * error is suppressed.
 */
export function reserveErrorOccurredEvent(
  session: ErrorTrackingSession,
  error: unknown,
  options: TrackErrorAsAnalyticsOptions,
  now: number = Date.now(),
  randomSample: number = Math.random(),
): ReservedErrorOccurredEvent | undefined {
  const { source } = options;
  const volumeControls = options.volumeControls ?? {};
  const samplingRate = resolveSamplingRate(volumeControls.samplingRate);
  const dedupWindowMs = resolveNonNegativeNumber(
    volumeControls.dedupWindowMs,
    DEFAULT_ERROR_TRACKING_OPTIONS.dedupWindowMs,
  );
  // The global cap is a hard ceiling. A caller-supplied sessionCap may
  // only lower it, never raise it.
  const sessionCap = Math.min(
    resolveNonNegativeNumber(
      volumeControls.sessionCap,
      DEFAULT_ERROR_TRACKING_OPTIONS.sessionCap,
    ),
    DEFAULT_ERROR_TRACKING_OPTIONS.sessionCap,
  );

  if (session.emittedCount >= sessionCap) {
    return undefined;
  }

  // Inclusive comparison so a rate of 0 never emits, including on a 0 draw.
  if (randomSample >= samplingRate) {
    return undefined;
  }

  const errorMessage = normalizeError(error);
  const signature = [ERROR_OCCURRED_EVENT_NAME, source, errorMessage].join(':');
  const lastEmittedAt = session.lastEmittedAtBySignature.get(signature);
  if (lastEmittedAt !== undefined && now - lastEmittedAt < dedupWindowMs) {
    return undefined;
  }

  const reservedAt = now;
  session.emittedCount += 1;
  session.lastEmittedAtBySignature.set(signature, reservedAt);

  return {
    event: {
      name: ERROR_OCCURRED_EVENT_NAME,
      properties: {
        source,
        error_message: errorMessage,
      },
      sensitiveProperties: {},
      saveDataRecording: false,
      hasProperties: true,
    },
    reservation: {
      signature,
      reservedAt,
    },
  };
}

/**
 * Releases a reservation after delivery throws.
 *
 * The session budget is not consumed, and the next identical error is not
 * suppressed by deduplication.
 *
 * @param session - Mutable per-controller volume-control state.
 * @param reservation - The reservation returned with the event.
 */
export function releaseErrorTrackingReservation(
  session: ErrorTrackingSession,
  reservation: ErrorTrackingReservation,
): void {
  session.emittedCount = Math.max(0, session.emittedCount - 1);
  if (
    session.lastEmittedAtBySignature.get(reservation.signature) ===
    reservation.reservedAt
  ) {
    session.lastEmittedAtBySignature.delete(reservation.signature);
  }
}
