export const CONTROLLER_NAME = 'ClaimsController';

export const SERVICE_NAME = 'ClaimsService';

export enum Env {
  DEV = 'dev',
  UAT = 'uat',
  PRD = 'prd',
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
