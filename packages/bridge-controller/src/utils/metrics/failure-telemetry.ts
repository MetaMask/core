/* eslint-disable @typescript-eslint/naming-convention */
import { FailurePhase, SwapBridgeErrorCode } from './constants.js';

export type HashPresenceProperties = {
  source_hash_present: boolean;
  destination_hash_present: boolean;
};

export type FailureTelemetryProperties = HashPresenceProperties & {
  failure_phase: FailurePhase;
  error_code: SwapBridgeErrorCode;
};

/**
 * Classify a thrown value for Quotes Error. Quote fetch always stays in the
 * `quote` phase; this only chooses `error_code`.
 *
 * @param error - The thrown value from quote fetch.
 * @returns The Mixpanel `error_code`.
 */
export const getQuoteFetchErrorCode = (error: unknown): SwapBridgeErrorCode => {
  if (error === undefined || error === null) {
    return SwapBridgeErrorCode.MissingErrorObject;
  }
  if (error instanceof Error) {
    return SwapBridgeErrorCode.QuoteFetchFailed;
  }
  return SwapBridgeErrorCode.NonErrorRejection;
};

/**
 * Classify a thrown value from submit (sign/broadcast) catch paths.
 *
 * @param error - The thrown value from submit.
 * @returns The Mixpanel `error_code`.
 */
export const getSubmitErrorCode = (error: unknown): SwapBridgeErrorCode => {
  if (error === undefined || error === null) {
    return SwapBridgeErrorCode.MissingErrorObject;
  }
  if (error instanceof Error) {
    return SwapBridgeErrorCode.Unknown;
  }
  return SwapBridgeErrorCode.NonErrorRejection;
};

/**
 * @param sourceHash - Source tx hash if known at emit time.
 * @param destinationHash - Destination tx hash if known at emit time.
 * @returns Boolean hash-presence properties.
 */
export const getHashPresenceProperties = (
  sourceHash?: string | null,
  destinationHash?: string | null,
): HashPresenceProperties => {
  return {
    source_hash_present: Boolean(sourceHash),
    destination_hash_present: Boolean(destinationHash),
  };
};

/**
 * Prefer destination_execution over source_execution over poll.
 *
 * @param hashPresence - Hash presence at emit time.
 * @returns The Mixpanel `failure_phase` for a status/polling Failed event.
 */
export const getStatusFailurePhase = (
  hashPresence: HashPresenceProperties,
): FailurePhase => {
  if (hashPresence.destination_hash_present) {
    return FailurePhase.DestinationExecution;
  }
  if (hashPresence.source_hash_present) {
    return FailurePhase.SourceExecution;
  }
  return FailurePhase.Poll;
};

/**
 * Telemetry for Failed events emitted from the submit catch (no tx hash yet).
 *
 * @param error - The thrown value from submit.
 * @returns Phase, error code, and hash-presence flags.
 */
export const getSubmitFailureTelemetry = (
  error: unknown,
): FailureTelemetryProperties => {
  return {
    failure_phase: FailurePhase.Broadcast,
    error_code: getSubmitErrorCode(error),
    source_hash_present: false,
    destination_hash_present: false,
  };
};

/**
 * Telemetry for Failed events derived from a status poll.
 *
 * @param sourceHash - Source tx hash if known.
 * @param destinationHash - Destination tx hash if known.
 * @returns Phase, error code, and hash-presence flags.
 */
export const getStatusFailureTelemetry = (
  sourceHash?: string | null,
  destinationHash?: string | null,
): FailureTelemetryProperties => {
  const hashPresence = getHashPresenceProperties(sourceHash, destinationHash);
  return {
    ...hashPresence,
    failure_phase: getStatusFailurePhase(hashPresence),
    error_code: SwapBridgeErrorCode.StatusFailedWithoutReason,
  };
};
