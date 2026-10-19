/**
 * Launchpad token WebSocket streaming types.
 *
 * The `launchpad-tokens.v1` gateway delivers batched arrays of discriminated
 * `created | stats | migrated` events using abbreviated keys. This module models
 * both the raw wire shape and a normalized, readable discriminated union. These
 * types are intentionally dependency-free so a later Explore phase can reuse
 * them directly.
 */

/** Discriminator for the kind of launchpad token event. */
export type LaunchpadEventType = 'created' | 'stats' | 'migrated';

/**
 * A value that the gateway may deliver either as a number or a numeric string.
 * Consumers should coerce as needed; prices in particular may arrive as strings.
 */
export type NumericLike = number | string;

/**
 * Raw launchpad token event as delivered on the wire, using the gateway's
 * abbreviated keys. All fields other than the discriminator, timestamp and asset
 * id are optional because presence varies by event type and partial events are
 * expected (e.g. a `stats` event carries no name/symbol).
 */
export type RawLaunchpadTokenEvent = {
  /** Event type discriminator. */
  evt: LaunchpadEventType;
  /** Timestamp (ms). */
  ts: number;
  /** CAIP-19 asset id. */
  a: string;
  /** Chain / CAIP-2 id. */
  c?: string;
  /** Token name. */
  n?: string;
  /** Token symbol. */
  s?: string;
  /** Launchpad id. */
  lp?: string;
  /** Launchpad protocol. */
  lpp?: string;
  /** Deployer. */
  d?: NumericLike;
  /** Dev address. */
  da?: string;
  /** Pair address. */
  pa?: string;
  /** Graduation percent. */
  gp?: NumericLike;
  /** Market cap. */
  mc?: NumericLike;
  /** Price. */
  p?: NumericLike;
  /** Liquidity. */
  l?: NumericLike;
  /** High. */
  h?: NumericLike;
  /** 1h volume. */
  v?: NumericLike;
  /** Tx count. */
  txs?: number;
  /** Buy count. */
  bc?: number;
  /** Sell count. */
  sc?: number;
  /** Sniper count. */
  snc?: number;
  /** Sniper holding percent. */
  snhp?: NumericLike;
  /** Deployer holding percent. */
  dhp?: NumericLike;
};

/** Fields common to every normalized launchpad token event. */
type LaunchpadTokenEventBase = {
  eventType: LaunchpadEventType;
  timestamp: number;
  assetId: string;
};

/**
 * Normalized `created` event: identity + launchpad metadata.
 */
export type LaunchpadTokenCreatedEvent = LaunchpadTokenEventBase & {
  eventType: 'created';
  chainId?: string;
  name?: string;
  symbol?: string;
  launchpadId?: string;
  launchpadProtocol?: string;
  deployer?: NumericLike;
  devAddress?: string;
  pairAddress?: string;
  graduationPercent?: NumericLike;
};

/**
 * Normalized `stats` event: market + activity metrics. Carries no name/symbol.
 */
export type LaunchpadTokenStatsEvent = LaunchpadTokenEventBase & {
  eventType: 'stats';
  graduationPercent?: NumericLike;
  marketCap?: NumericLike;
  price?: NumericLike;
  liquidity?: NumericLike;
  high?: NumericLike;
  volume1h?: NumericLike;
  txCount?: number;
  buyCount?: number;
  sellCount?: number;
  sniperCount?: number;
  sniperHoldingPercent?: NumericLike;
  deployerHoldingPercent?: NumericLike;
};

/**
 * Normalized `migrated` event: DEX migration details.
 */
export type LaunchpadTokenMigratedEvent = LaunchpadTokenEventBase & {
  eventType: 'migrated';
  chainId?: string;
  deployer?: NumericLike;
  devAddress?: string;
  pairAddress?: string;
};

/**
 * Normalized, readable discriminated union of launchpad token events.
 */
export type LaunchpadTokenEvent =
  | LaunchpadTokenCreatedEvent
  | LaunchpadTokenStatsEvent
  | LaunchpadTokenMigratedEvent;

/**
 * Options for subscribing to a launchpad token's detail channel.
 */
export type LaunchpadTokenDetailsSubscriptionOptions = {
  /** CAIP-19 asset identifier of the token to track. */
  assetId: string;
};
