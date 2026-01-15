/**
 * Status values for data deletion requests from Segment API.
 */
export enum DataDeleteStatus {
  failed = 'FAILED',
  finished = 'FINISHED',
  initialized = 'INITIALIZED',
  invalid = 'INVALID',
  notSupported = 'NOT_SUPPORTED',
  partialSuccess = 'PARTIAL_SUCCESS',
  running = 'RUNNING',
  unknown = 'UNKNOWN',
}

/**
 * Response status for deletion regulation operations.
 */
export enum DataDeleteResponseStatus {
  ok = 'ok',
  error = 'error',
}

/**
 * Response from creating a data deletion task.
 */
export interface IDeleteRegulationResponse {
  status: DataDeleteResponseStatus;
  regulateId?: string; // Using exact API field name from Segment API response
  error?: string;
}

/**
 * Status information for a data deletion request.
 */
export interface IDeleteRegulationStatus {
  deletionRequestDate?: string;
  hasCollectedDataSinceDeletionRequest: boolean;
  dataDeletionRequestStatus: DataDeleteStatus;
}

/**
 * Response from checking data deletion status.
 */
export interface IDeleteRegulationStatusResponse {
  status: DataDeleteResponseStatus;
  dataDeleteStatus: DataDeleteStatus;
}

/**
 * Date format for deletion regulation creation date (DD/MM/YYYY).
 */
export type DataDeleteDate = string | undefined;

/**
 * Regulation ID from Segment API.
 */
export type DataDeleteRegulationId = string | undefined;
