import { SUBSCRIPTION_STATUSES } from './types';

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
    subscriptionApiUrl: 'https://subscription.dev-api.cx.metamask.io',
  },
  uat: {
    subscriptionApiUrl: 'https://subscription.uat-api.cx.metamask.io',
  },
  prd: {
    subscriptionApiUrl: 'https://subscription.api.cx.metamask.io',
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

export enum SubscriptionControllerErrorMessage {
  UserAlreadySubscribed = `${controllerName} - User is already subscribed`,
  UserNotSubscribed = `${controllerName} - User is not subscribed`,
  SubscriptionProductsEmpty = `${controllerName} - Subscription products array cannot be empty`,
  PaymentTokenAddressAndSymbolRequiredForCrypto = `${controllerName} - Payment token address and symbol are required for crypto payment`,
  PaymentMethodNotCrypto = `${controllerName} - Payment method is not crypto`,
  ProductPriceNotFound = `${controllerName} - Product price not found`,
}

export const DEFAULT_POLLING_INTERVAL = 5 * 60 * 1_000; // 5 minutes

export const ACTIVE_SUBSCRIPTION_STATUSES = [
  SUBSCRIPTION_STATUSES.active,
  SUBSCRIPTION_STATUSES.trialing,
  SUBSCRIPTION_STATUSES.provisional,
] as string[];
