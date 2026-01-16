/**
 * Status values for data deletion requests from Segment API.
 * Enum values match Segment API response values exactly.
 */
export enum DataDeleteStatus {
  Failed = 'FAILED',
  Finished = 'FINISHED',
  Initialized = 'INITIALIZED',
  Invalid = 'INVALID',
  NotSupported = 'NOT_SUPPORTED',
  PartialSuccess = 'PARTIAL_SUCCESS',
  Running = 'RUNNING',
  Unknown = 'UNKNOWN',
}

/**
 * Response status for deletion regulation operations.
 * Enum values match API response values exactly.
 */
export enum DataDeleteResponseStatus {
  Ok = 'ok',
  Error = 'error',
}

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
 */
export type DataDeleteRegulationId = string | undefined;
