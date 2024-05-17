export const enum Env {
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

/**
 * Returns the valid OIDC Client ID (used during authorization)
 *
 * @param env - environment field
 * @returns the OIDC client id for the environment
 */
export function getOidcClientId(env: Env): string {
  switch (env) {
    case Env.DEV:
      return 'f1a963d7-50dc-4cb5-8d81-f1f3654f0df3';
    /* istanbul ignore next */
    case Env.UAT:
      return 'a9de167c-c9a6-43d8-af39-d301fd44c485';
    /* istanbul ignore next */
    case Env.PRD:
      return '1132f10a-b4e5-4390-a5f2-d9c6022db564';
    /* istanbul ignore next */
    default:
      throw new Error('invalid env: cannot determine oidc client id');
  }
}
