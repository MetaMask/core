/**
 * Status values for data deletion requests from Segment API.
 * Enum member names match Segment API response values exactly.
 */
/* eslint-disable @typescript-eslint/naming-convention */
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
/* eslint-enable @typescript-eslint/naming-convention */

/**
 * Response status for deletion regulation operations.
 * Enum member names match API response values exactly.
 */
/* eslint-disable @typescript-eslint/naming-convention */
export enum DataDeleteResponseStatus {
  ok = 'ok',
  error = 'error',
}
/* eslint-enable @typescript-eslint/naming-convention */

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
