/**
 * Status values for data deletion requests from Segment API.
 * Values match Segment API response values exactly.
 */
export const DATA_DELETE_STATUSES = {
  Failed: 'FAILED',
  Finished: 'FINISHED',
  Initialized: 'INITIALIZED',
  Invalid: 'INVALID',
  NotSupported: 'NOT_SUPPORTED',
  PartialSuccess: 'PARTIAL_SUCCESS',
  Running: 'RUNNING',
  Unknown: 'UNKNOWN',
} as const;

/**
 * Type union for data deletion status values.
 */
export type DataDeleteStatus =
  (typeof DATA_DELETE_STATUSES)[keyof typeof DATA_DELETE_STATUSES];

/**
 * Response status for deletion regulation operations.
 */
export const DATA_DELETE_RESPONSE_STATUSES = {
  Success: 'ok',
  Failure: 'error',
} as const;

/**
 * Type union for data deletion response status values.
 */
export type DataDeleteResponseStatus =
  (typeof DATA_DELETE_RESPONSE_STATUSES)[keyof typeof DATA_DELETE_RESPONSE_STATUSES];

/**
 * Response from creating a data deletion task.
 */
export type IDeleteRegulationResponse = {
  status: DataDeleteResponseStatus;
  regulateId?: string; // Using exact API field name from Segment API response
  error?: string;
};

/**
 * Status information for a data deletion request.
 */
export type IDeleteRegulationStatus = {
  deletionRequestTimestamp?: number;
  hasCollectedDataSinceDeletionRequest: boolean;
  dataDeletionRequestStatus: DataDeleteStatus;
};

/**
 * Response from checking data deletion status.
 */
export type IDeleteRegulationStatusResponse = {
  status: DataDeleteResponseStatus;
  dataDeleteStatus: DataDeleteStatus;
};

/**
 * Timestamp for deletion regulation creation (milliseconds since epoch).
 */
export type DataDeleteTimestamp = number | undefined;

/**
 * Regulation ID from Segment API.
 * This type uses `undefined` (rather than `null`) to match the return type of selectors
 * and getter methods that convert `null` state values to `undefined` for consistency
 * with optional return types. The controller state stores `null`, but external APIs
 * return `undefined` for optional values.
 */
export type DataDeleteRegulationId = string | undefined;
