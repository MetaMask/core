/**
 * The status of a geolocation fetch operation.
 */
export type GeolocationRequestStatus =
  | 'idle'
  | 'loading'
  | 'complete'
  | 'error';

/**
 * Deployment environment for API endpoint selection.
 */
export enum Env {
  DEV = 'dev',
  UAT = 'uat',
  PRD = 'prd',
}
