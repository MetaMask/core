export const WALLET_PREFIX = 'wallet_';

export const CAVEAT_TYPES = Object.freeze({
  restrictReturnedAccounts: 'restrictReturnedAccounts' as const,
});

export const LOG_IGNORE_METHODS = [
  'wallet_registerOnboarding',
  'wallet_watchAsset',
];

export enum LOG_METHOD_TYPES {
  restricted = 'restricted',
  internal = 'internal',
}

/**
 * The permission activity log size limit.
 */
export const LOG_LIMIT = 100;
