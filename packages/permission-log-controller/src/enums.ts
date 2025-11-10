export const WALLET_PREFIX = 'wallet_';

export const CAVEAT_TYPES = Object.freeze({
  restrictReturnedAccounts: 'restrictReturnedAccounts' as const,
});

export const LOG_IGNORE_METHODS = [
  'wallet_registerOnboarding',
  'wallet_watchAsset',
];

// TODO: Either fix this lint violation or explain why it's necessary to ignore.

export enum LOG_METHOD_TYPES {
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.

  restricted = 'restricted',
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.

  internal = 'internal',
}

/**
 * The permission activity log size limit.
 */
export const LOG_LIMIT = 100;
