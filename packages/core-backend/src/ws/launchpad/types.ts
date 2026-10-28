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
  /** Token decimals. */
  d?: number;
  /** Deployer address (CAIP-10 format). */
  da?: string;
  /** Pool address; on `migrated` events this is the DEX pool address. */
  pa?: string;
  /** Graduation percent. */
  gp?: string;
  /** Market cap. */
  mc?: string;
  /** Price. */
  p?: string;
  /** Liquidity. */
  l?: string;
  /** Holder count. */
  h?: number;
  /** 1h volume. */
  v?: string;
  /** Tx count. */
  txs?: number;
  /** Buy count. */
  bc?: number;
  /** Sell count. */
  sc?: number;
  /** Sniper count. */
  snc?: string;
  /** Sniper holding percent. */
  snhp?: string;
  /** Deployer holding percent. */
  dhp?: string;
  /** Insider holding percent. */
  ihp?: string;
  /** Top 10 holder percent. */
  t10hp?: string;
  /** Circulating supply. */
  cs?: string;
  /** Graduation stage identifier (platform-specific label). */
  gs?: string;
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
  decimals?: number;
  devAddress?: string;
  pairAddress?: string;
  graduationPercent?: string;
  graduationStage?: string;
};

/**
 * Normalized `stats` event: market + activity metrics. Carries no name/symbol.
 */
export type LaunchpadTokenStatsEvent = LaunchpadTokenEventBase & {
  eventType: 'stats';
  graduationPercent?: string;
  graduationStage?: string;
  marketCap?: string;
  price?: string;
  liquidity?: string;
  holderCount?: number;
  volume1h?: string;
  txCount?: number;
  buyCount?: number;
  sellCount?: number;
  sniperCount?: string;
  sniperHoldingPercent?: string;
  deployerHoldingPercent?: string;
  insiderHoldingPercent?: string;
  top10HoldingPercent?: string;
  circulatingSupply?: string;
};

/**
 * Normalized `migrated` event: DEX migration details.
 */
export type LaunchpadTokenMigratedEvent = LaunchpadTokenEventBase & {
  eventType: 'migrated';
  chainId?: string;
  decimals?: number;
  devAddress?: string;
  pairAddress?: string;
  graduationStage?: string;
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
