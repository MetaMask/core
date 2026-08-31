export const Env = {
  DEV: 'dev',
  UAT: 'uat',
  PRD: 'prd',
} as const;

export type Env = (typeof Env)[keyof typeof Env];

export const MoneyAccountFeature = {
  SwapFeeWaiver: 'swapFeeWaiver',
  PerpsFeeWaiver: 'perpsFeeWaiver',
  PredictFreeTx: 'predictFreeTx',
  PremiumApy: 'premiumApy',
} as const;

export type MoneyAccountFeature =
  (typeof MoneyAccountFeature)[keyof typeof MoneyAccountFeature];

export type MoneyAccountEntitlements = {
  swapFeeWaiver: boolean;
  perpsFeeWaiver: boolean;
  predictFreeTx: boolean;
  premiumApy: boolean;
};

export type MoneyAccountPlusJwtClaim = {
  plan: string;
  entitlements: MoneyAccountEntitlements;
};

export type MoneyAccountProductEntitlementsJwtClaim = {
  moneyAccountPlus: MoneyAccountPlusJwtClaim;
};

export type MoneyAccountSubscriptionControllerState = {
  plan: string | null;
  entitlements: MoneyAccountEntitlements | null;
  isSubscriber: boolean;
  lastHydratedAt: number | null;
};

const SUBSCRIPTION_API_URLS: Record<Env, string> = {
  dev: 'https://subscription.dev-api.cx.metamask.io',
  uat: 'https://subscription.uat-api.cx.metamask.io',
  prd: 'https://subscription.api.cx.metamask.io',
};

export function getProductEntitlementsClaimKey(env: Env): string {
  const subscriptionApiUrl = SUBSCRIPTION_API_URLS[env]?.replace(/\/v1$/u, '');

  if (!subscriptionApiUrl) {
    throw new Error('invalid environment configuration');
  }

  return `${subscriptionApiUrl}/productEntitlements`;
}
