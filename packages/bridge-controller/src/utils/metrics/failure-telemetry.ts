import { SwapBridgeErrorCode } from './constants.js';

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
