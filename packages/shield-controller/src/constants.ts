/**
 * The name of the {@link ShieldController}.
 */
export const controllerName = 'ShieldController';

/**
 * The environment for the shield backend API.
 */
export enum Env {
  DEV = 'dev',
  UAT = 'uat',
  PRD = 'prd',
}

/**
 * The shield backend API URL for each environment.
 */
export const SHIELD_API_URL_MAP: Record<Env, string> = {
  [Env.DEV]: 'https://ruleset-engine.dev-api.cx.metamask.io',
  [Env.UAT]: 'https://ruleset-engine.uat-api.cx.metamask.io',
  [Env.PRD]: 'https://ruleset-engine.api.cx.metamask.io',
};

/**
 * Get the shield backend API URL for the given environment.
 *
 * @param env - The environment.
 * @returns The base URL for the given environment.
 * @throws If the environment is invalid.
 */
export function getShieldApiBaseUrl(env: Env): string {
  const baseUrl = SHIELD_API_URL_MAP[env];
  if (!baseUrl) {
    throw new Error('invalid environment configuration');
  }
  return baseUrl;
}

/**
 * The `signTypedMessage` version
 *
 * @see https://docs.metamask.io/guide/signing-data.html
 */
export enum SignTypedDataVersion {
  V1 = 'V1',
  V3 = 'V3',
  V4 = 'V4',
}
