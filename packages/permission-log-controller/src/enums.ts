export const WALLET_PREFIX = 'wallet_';

export const CAVEAT_TYPES = Object.freeze({
  restrictReturnedAccounts: 'restrictReturnedAccounts' as const,
});

export const LOG_IGNORE_METHODS = [
  'wallet_registerOnboarding',
  'wallet_watchAsset',
];

// This enum should be called `LogMethodTypes`, with PascalCase members, but
// to maintain backwards compatibility, the rule is disabled for now.
/* eslint-disable @typescript-eslint/naming-convention */
export enum LOG_METHOD_TYPES {
  restricted = 'restricted',
  internal = 'internal',
}
/* eslint-enable @typescript-eslint/naming-convention */

/**
 * The permission activity log size limit.
 */
export const LOG_LIMIT = 100;
