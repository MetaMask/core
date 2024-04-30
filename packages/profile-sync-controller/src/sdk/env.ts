export enum Env {
  DEV = 'dev',
  UAT = 'uat',
  PRD = 'prd',
}

type EnvUrlsEntry = {
  authApiUrl: string;
  oidcApiUrl: string;
  userStorageApiUrl: string;
};

const ENV_URLS: Record<Env, EnvUrlsEntry> = {
  dev: {
    authApiUrl: 'https://authentication.dev-api.cx.metamask.io',
    oidcApiUrl: 'https://oidc.dev-api.cx.metamask.io',
    userStorageApiUrl: 'https://user-storage.dev-api.cx.metamask.io',
  },
  uat: {
    authApiUrl: 'https://authentication.uat-api.cx.metamask.io',
    oidcApiUrl: 'https://oidc.uat-api.cx.metamask.io',
    userStorageApiUrl: 'https://user-storage.uat-api.cx.metamask.io',
  },
  prd: {
    authApiUrl: 'https://authentication.api.cx.metamask.io',
    oidcApiUrl: 'https://oidc.api.cx.metamask.io',
    userStorageApiUrl: 'https://user-storage.api.cx.metamask.io',
  },
};

/**
 * Validates and returns correct environment endpoints
 *
 * @param env - environment field
 * @returns the correct environment url
 * @throws on invalid environment passed
 */
export function getEnvUrls(env: Env): EnvUrlsEntry {
  if (!ENV_URLS[env]) {
    throw new Error('invalid environment configuration');
  }
  return ENV_URLS[env];
}
