export const controllerName = 'SubscriptionController';

export enum Env {
  DEV = 'dev',
  UAT = 'uat',
  PRD = 'prd',
}

type EnvUrlsEntry = {
  subscriptionApiUrl: string;
};

const ENV_URLS: Record<Env, EnvUrlsEntry> = {
  dev: {
    subscriptionApiUrl: 'https://subscription-service.dev-api.cx.metamask.io',
  },
  uat: {
    subscriptionApiUrl: 'https://subscription-service.uat-api.cx.metamask.io',
  },
  prd: {
    subscriptionApiUrl: 'https://subscription-service.api.cx.metamask.io',
  },
};

export const SUBSCRIPTION_PRODUCTS = {
  SHIELD: 'shield',
} as const;

export type SubscriptionProduct =
  (typeof SUBSCRIPTION_PRODUCTS)[keyof typeof SUBSCRIPTION_PRODUCTS];

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

export enum SubscriptionControllerErrorMessage {
  UserAlreadySubscribed = `${controllerName} - User is already subscribed`,
  UserNotSubscribed = `${controllerName} - User is not subscribed`,
  SubscriptionProductsEmpty = `${controllerName} - Subscription products array cannot be empty`,
}
