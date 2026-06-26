export type ENV = 'prd' | 'uat' | 'dev';

const PUSH_API_ENV = {
  dev: 'https://push.dev-api.cx.metamask.io',
  uat: 'https://push.uat-api.cx.metamask.io',
  prd: 'https://push.api.cx.metamask.io',
} satisfies Record<ENV, string>;

export const PUSH_API = (env: ENV = 'prd'): string =>
  PUSH_API_ENV[env] ?? PUSH_API_ENV.prd;

export const REGISTRATION_TOKENS_ENDPOINT = (env: ENV = 'prd'): string =>
  `${PUSH_API(env)}/api/v2/token`;
