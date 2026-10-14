export type Environment = 'dev' | 'uat' | 'prod';

const API_SUBDOMAINS = {
  dev: 'dev-api',
  uat: 'uat-api',
  prod: 'api',
} as const satisfies Record<Environment, string>;

/**
 * Returns the user-storage API base URL for the given environment.
 *
 * @param environment - The target environment.
 * @returns The base URL for the user-storage API.
 * @throws If the environment is invalid.
 */
export function getUserStorageApiUrl(environment: Environment): string {
  const subdomain = API_SUBDOMAINS[environment];
  if (!subdomain) {
    throw new Error(`Invalid environment: ${String(environment)}`);
  }
  return `https://user-storage.${subdomain}.cx.metamask.io`;
}
