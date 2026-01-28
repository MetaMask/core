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
 * The service throws errors on failure, so this type only represents the Success case.
 */
export type DeleteRegulationResponse = {
  status: typeof DATA_DELETE_RESPONSE_STATUSES.Success;
  regulateId: string; // Using exact API field name from Segment API response
};

/**
 * Status information for a data deletion request.
 */
export type DeleteRegulationStatus = {
  deletionRequestTimestamp?: number;
  hasCollectedDataSinceDeletionRequest: boolean;
  dataDeletionRequestStatus: DataDeleteStatus;
};

/**
 * Response from checking data deletion status.
 */
export type DeleteRegulationStatusResponse = {
  status: DataDeleteResponseStatus;
  dataDeleteStatus: DataDeleteStatus;
};
