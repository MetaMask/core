import type { AssetsControllerOptions } from '@metamask/assets-controller';

/**
 * Per-instance options for the wallet's `AssetsController`.
 *
 * `queryApiClient` is required: each client creates its own API Platform
 * client (with its product name, version and bearer token), so there is no
 * platform-agnostic default. Every other option is optional.
 *
 * The wallet sets the poll intervals that the extension and mobile clients
 * share (prices every 3 minutes, staked balances every 30 seconds). Data
 * source configs passed here are merged over those defaults.
 */
export type AssetsControllerInstanceOptions = Omit<
  AssetsControllerOptions,
  'messenger' | 'state'
>;
