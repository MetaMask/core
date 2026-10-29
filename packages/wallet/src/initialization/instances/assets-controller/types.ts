import type { AssetsControllerOptions } from '@metamask/assets-controller';

/**
 * Per-instance options for the wallet's `AssetsController`. `queryApiClient`
 * is required because each client constructs its own API Platform client
 * (product name, bearer token, cache); every other field is optional and
 * falls back to the controller's own default.
 */
export type AssetsControllerInstanceOptions = Omit<
  AssetsControllerOptions,
  'messenger' | 'state'
>;
