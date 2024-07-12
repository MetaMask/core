export enum Env {
  DEV = 'dev',
  UAT = 'uat',
  PRD = 'prd',
}

export enum Platform {
  MOBILE = 'mobile',
  EXTENSION = 'extension',
  PORTFOLIO = 'portfolio',
  INFURA = 'infura',
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
 * @param platform - platform field
 * @returns the OIDC client id for the environment
 */
export function getOidcClientId(env: Env, platform: Platform): string {
  const clientIds = {
    [Env.DEV]: {
      [Platform.PORTFOLIO]: 'c7ca94a0-5d52-4635-9502-1a50a9c410cc',
      [Platform.MOBILE]: 'e83c7cc9-267d-4fb4-8fec-f0e3bbe5ae8e',
      [Platform.EXTENSION]: 'f1a963d7-50dc-4cb5-8d81-f1f3654f0df3',
      [Platform.INFURA]: 'bd887006-0d55-481a-a395-5ff9a0dc52c9',
    },
    [Env.UAT]: {
      [Platform.PORTFOLIO]: '8f2dd4ac-db07-4819-9ba5-1ee0ec1b56d1',
      [Platform.MOBILE]: 'c3cfdcd2-51d6-4fae-ad2c-ff238c8fef53',
      [Platform.EXTENSION]: 'a9de167c-c9a6-43d8-af39-d301fd44c485',
      [Platform.INFURA]: '01929890-7002-4c97-9913-8f6c09a6d674',
    },
    [Env.PRD]: {
      [Platform.PORTFOLIO]: '35e1cd62-49c5-4be8-8b6e-a5212f2d2cfb',
      [Platform.MOBILE]: '75fa62a3-9ca0-4b91-9fe5-76bec86b0257',
      [Platform.EXTENSION]: '1132f10a-b4e5-4390-a5f2-d9c6022db564',
      [Platform.INFURA]: '', // unset
    },
  };

  if (!clientIds[env]) {
    throw new Error(`invalid env ${env}: cannot determine oidc client id`);
  }

  if (!clientIds[env][platform]) {
    throw new Error(
      `invalid env ${env} and platform ${platform} combination: cannot determine oidc client id`,
    );
  }

  return clientIds[env][platform];
}
