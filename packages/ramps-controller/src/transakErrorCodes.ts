/**
 * Known Transak API error codes surfaced by {@link TransakApiError}.
 *
 * Values are normalized to strings because TransakService stringifies numeric
 * codes when parsing API responses.
 */
export const TRANSAK_ERROR_CODES = {
  ORDER_EXISTS: '4005',
  PHONE_ALREADY_REGISTERED: '2020',
} as const;

export type TransakErrorCode =
  (typeof TRANSAK_ERROR_CODES)[keyof typeof TRANSAK_ERROR_CODES];
