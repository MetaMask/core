export type ENV = 'prd' | 'uat' | 'dev';

export const PUSH_API = (env: ENV = 'prd') => {
  const domain = 'api.cx.metamask.io';
  switch (env) {
    case 'dev':
      return `https://push.dev-${domain}`;
    case 'uat':
      return `https://push.uat-${domain}`;
    default:
      return `https://push.${domain}`;
  }
};

export const REGISTRATION_TOKENS_ENDPOINT = (env: ENV = 'prd') =>
  `${PUSH_API(env)}/api/v2/token`;
