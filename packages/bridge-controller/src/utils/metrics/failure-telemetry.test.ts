import { FailurePhase, SwapBridgeErrorCode } from './constants.js';
import { getQuoteFetchErrorCode } from './failure-telemetry.js';
import type {
  FailureTelemetryProperties,
  HashPresenceProperties,
} from './types.js';

describe('failure-telemetry', () => {
  describe('getQuoteFetchErrorCode', () => {
    it('returns missing_error_object when nothing was thrown', () => {
      expect(getQuoteFetchErrorCode(undefined)).toBe(
        SwapBridgeErrorCode.MissingErrorObject,
      );
      expect(getQuoteFetchErrorCode(null)).toBe(
        SwapBridgeErrorCode.MissingErrorObject,
      );
    });

    it('returns quote_fetch_failed for Error instances', () => {
      expect(getQuoteFetchErrorCode(new Error('Network error'))).toBe(
        SwapBridgeErrorCode.QuoteFetchFailed,
      );
    });

    it('returns non_error_rejection for strings and plain objects', () => {
      expect(getQuoteFetchErrorCode('timeout')).toBe(
        SwapBridgeErrorCode.NonErrorRejection,
      );
      expect(getQuoteFetchErrorCode({ reason: 'no quotes' })).toBe(
        SwapBridgeErrorCode.NonErrorRejection,
      );
    });
  });

  describe('required classifier types', () => {
    it('requires all hash-presence and failure-telemetry fields', () => {
      const hashPresence: HashPresenceProperties = {
        source_hash_present: true,
        destination_hash_present: false,
      };
      const failureTelemetry: FailureTelemetryProperties = {
        ...hashPresence,
        failure_phase: FailurePhase.Broadcast,
        error_code: SwapBridgeErrorCode.Unknown,
      };

      expect(failureTelemetry.source_hash_present).toBe(true);
      expect(failureTelemetry.destination_hash_present).toBe(false);
      expect(failureTelemetry.error_code).toBe(SwapBridgeErrorCode.Unknown);
    });
  });
});
