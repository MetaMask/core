export enum Env {
  DEV = 'dev',
  UAT = 'uat',
  PRD = 'prd',
}

type EnvUrlsEntry = {
  userStorageApiUrl: string;
};

const ENV_URLS: Record<Env, EnvUrlsEntry> = {
  dev: {
    userStorageApiUrl: 'https://user-storage.dev-api.cx.metamask.io',
  },
  uat: {
    userStorageApiUrl: 'https://user-storage.uat-api.cx.metamask.io',
  },
  prd: {
    userStorageApiUrl: 'https://user-storage.api.cx.metamask.io',
  },
};

/**
 * Validates and returns the correct environment endpoint.
 *
 * @param env - environment field
 * @returns the correct environment url entry
 * @throws on invalid environment passed
 */
export function getEnvUrls(env: Env): EnvUrlsEntry {
  if (!ENV_URLS[env]) {
    throw new Error('invalid environment configuration');
  }
  return ENV_URLS[env];
}
