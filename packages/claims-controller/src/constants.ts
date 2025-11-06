export const CONTROLLER_NAME = 'ClaimsController';

export const SERVICE_NAME = 'ClaimsService';

export enum Env {
  DEV = 'dev',
  UAT = 'uat',
  PRD = 'prd',
}

export enum ClaimStatusEnum {
  // created but not yet submitted to Intercom
  CREATED = 'created',
  // submitted to Intercom
  SUBMITTED = 'submitted',
  // in progress by Intercom
  IN_PROGRESS = 'in_progress',
  // waiting for customer reply
  WAITING_FOR_CUSTOMER = 'waiting_for_customer',
  // approved by Intercom
  APPROVED = 'approved',
  // rejected by Intercom
  REJECTED = 'rejected',
  // unknown status
  UNKNOWN = 'unknown',
}

export const CLAIMS_API_URL: Record<Env, string> = {
  [Env.DEV]: 'https://claims.dev-api.cx.metamask.io',
  [Env.UAT]: 'https://claims.uat-api.cx.metamask.io',
  [Env.PRD]: 'https://claims.api.cx.metamask.io',
};

export enum HttpContentTypeHeader {
  APPLICATION_JSON = 'application/json',
  MULTIPART_FORM_DATA = 'multipart/form-data',
}
