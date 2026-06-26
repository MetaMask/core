/**
 * Error codes for RampsController.
 * These codes are returned to the UI layer for translation.
 */
export const RAMPS_ERROR_CODES = {
  CIRCUIT_BREAKER_OPEN: 'CIRCUIT_BREAKER_OPEN',
} as const;

export type RampsErrorCode =
  (typeof RAMPS_ERROR_CODES)[keyof typeof RAMPS_ERROR_CODES];
