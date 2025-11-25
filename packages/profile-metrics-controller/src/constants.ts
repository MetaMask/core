export enum Env {
  DEV = 'dev',
  UAT = 'uat',
  PRD = 'prd',
}

const ENV_URLS: Record<Env, string> = {
  dev: 'https://authentication.dev-api.cx.metamask.io/api/v2',
  uat: 'https://authentication.uat-api.cx.metamask.io/api/v2',
  prd: 'https://authentication.api.cx.metamask.io/api/v2',
};

/**
 * Validates and returns correct environment endpoints
 *
 * @param env - environment field
 * @returns the correct environment url
 * @throws on invalid environment passed
 */
export function getEnvUrl(env: Env): string {
  if (!ENV_URLS[env]) {
    throw new Error('invalid environment configuration');
  }
  return ENV_URLS[env];
}
