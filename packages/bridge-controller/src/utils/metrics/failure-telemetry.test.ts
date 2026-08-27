import { SwapBridgeErrorCode } from './constants.js';
import { getQuoteFetchErrorCode } from './failure-telemetry.js';

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
});
