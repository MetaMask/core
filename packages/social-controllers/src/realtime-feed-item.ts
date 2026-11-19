import {
  array,
  is,
  nullable,
  number,
  optional,
  record,
  string,
  type as structType,
  unknown as unknownStruct,
} from '@metamask/superstruct';

import { ProfileIdentityStruct } from './social-types.js';
import type {
  AuthorComment,
  FeedItem,
  FeedActorSummary,
  ProfileIdentity,
  Trade,
} from './social-types.js';
import { AuthorCommentStruct, CommentEngagementStruct } from './structs.js';

/**
 * Trade-comment shape only. Kept as a small Superstruct so malformed comments
 * on a fill are dropped without validating the rest of the card again.
 */
const RawTradeCommentStruct = structType({
  uid: string(),
  commentText: string(),
  timestamp: number(),
  sourceLanguage: optional(nullable(string())),
  translations: optional(record(string(), string())),
  metrics: CommentEngagementStruct,
  replies: optional(array(unknownStruct())),
});

const PRICED_KEYS = [
  'currentValueUSD',
  'positionValueUSD',
  'pnlValueUsd',
  'pnlPercent',
] as const;

type PricedFields = Pick<FeedItem, (typeof PRICED_KEYS)[number]>;

// The server prices the card when it publishes it. A field it did not send
// stays absent, so the client keeps using its own live price for it.
const toPricedFields = (value: PricedFields): PricedFields =>
  Object.fromEntries(
    PRICED_KEYS.flatMap((key) =>
      value[key] === undefined ? [] : [[key, value[key]]],
    ),
  );

export type RealtimeFeedEventData = FeedItem;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isNullableNumber = (value: unknown): value is number | null =>
  value === null || isFiniteNumber(value);

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');

const readNumber = (value: unknown): number | undefined =>
  isFiniteNumber(value) ? value : undefined;

const readNullableNumber = (value: unknown): number | null =>
  readNumber(value) ?? null;

const addNullableNumbers = (
  left: number | null,
  right: number | null,
): number | null => (left === null || right === null ? null : left + right);

const PROFILE_IDENTITY_KEYS = Object.keys(
  ProfileIdentityStruct.schema,
) as (keyof ProfileIdentity)[];

// Copies only the identity fields the socket payload sent, as the REST
// payload omits the ones a profile has no value for.
const toIdentity = (profile: ProfileIdentity): ProfileIdentity =>
  Object.fromEntries(
    PROFILE_IDENTITY_KEYS.flatMap((key) =>
      profile[key] === undefined ? [] : [[key, profile[key]]],
    ),
  );

type RawTrade = {
  direction: 'buy' | 'sell';
  intent: 'enter' | 'exit';
  classification: 'spot' | 'perp' | 'send' | 'receive' | null;
  perpPositionType: 'long' | 'short' | null;
  perpLeverage: number | null;
  tokenAmount: number;
  usdCost: number;
  marketCap: number | null;
  timestamp: number;
  transactionHash: string;
  comments: unknown[];
};

type RawHydratedPosition = {
  itemId: string;
  timestamp: number;
  cardLatestTradeAt: number;
  actor: {
    address: string;
    name: string;
    images: { raw: string | null; sm: string | null };
    profile: ProfileIdentity & { id: string; metadata: Record<string, unknown> };
    followerCount?: number | null;
  };
  metadata: {
    tokenChain: string;
    tokenSymbol: string;
    tokenName: string;
    tokenAddress: string;
    positionAmount: number;
    positionStats: {
      boughtUSD: number | null;
      soldUSD: number | null;
      realizedGainsUSD: number | null;
      holdingsCostBasisUSD: number | null;
      receivedCostBasisUSD: number | null;
      holdingReceivedCostBasisUSD: number | null;
      isOpen: boolean;
    };
    trades: RawTrade[];
    perpPositionType?: 'long' | 'short' | null;
    perpLeverage?: number | null;
    positionAmountWithLeverage?: number | null;
  };
  metrics: {
    commentCount: number;
    replyCount: number;
    copyCount?: number | null;
  };
  imageUrl?: string | null;
  firstTradeAt?: number | null;
  holdTimeMs?: number | null;
  entryPriceUsd?: number | null;
  authorComment?: AuthorComment | null;
  flags?: string[] | null;
  currentValueUSD?: number | null;
  positionValueUSD?: number | null;
  pnlValueUsd?: number | null;
  pnlPercent?: number | null;
};

const DIRECTIONS = new Set(['buy', 'sell']);
const INTENTS = new Set(['enter', 'exit']);
const CLASSIFICATIONS = new Set(['spot', 'perp', 'send', 'receive']);
const PERP_SIDES = new Set(['long', 'short']);

/**
 * Narrow trade check: required scalars only. Comments stay opaque and are
 * filtered later, so a bad reply does not invalidate the whole card.
 */
const readRawTrade = (value: unknown): RawTrade | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const {
    direction,
    intent,
    classification,
    perpPositionType,
    perpLeverage,
    tokenAmount,
    usdCost,
    marketCap,
    timestamp,
    transactionHash,
    comments,
  } = value;
  if (
    typeof direction !== 'string' ||
    !DIRECTIONS.has(direction) ||
    typeof intent !== 'string' ||
    !INTENTS.has(intent) ||
    !isFiniteNumber(tokenAmount) ||
    !isFiniteNumber(usdCost) ||
    !isNullableNumber(marketCap) ||
    !isFiniteNumber(timestamp) ||
    typeof transactionHash !== 'string' ||
    !Array.isArray(comments) ||
    (classification !== null &&
      (typeof classification !== 'string' ||
        !CLASSIFICATIONS.has(classification))) ||
    (perpPositionType !== null &&
      (typeof perpPositionType !== 'string' ||
        !PERP_SIDES.has(perpPositionType))) ||
    !isNullableNumber(perpLeverage)
  ) {
    return undefined;
  }
  return {
    direction: direction as 'buy' | 'sell',
    intent: intent as 'enter' | 'exit',
    classification: classification as RawTrade['classification'],
    perpPositionType: perpPositionType as RawTrade['perpPositionType'],
    perpLeverage,
    tokenAmount,
    usdCost,
    marketCap,
    timestamp,
    transactionHash,
    comments,
  };
};

const readProfileIdentity = (
  profile: Record<string, unknown>,
): ProfileIdentity | undefined => {
  const identityCandidate = Object.fromEntries(
    PROFILE_IDENTITY_KEYS.flatMap((key) =>
      profile[key] === undefined ? [] : [[key, profile[key]]],
    ),
  );
  return is(identityCandidate, ProfileIdentityStruct)
    ? identityCandidate
    : undefined;
};

/**
 * Cheap shape check for the socket's hydrated card. Avoids walking the full
 * Superstruct tree on every Live tick — that was most of normalize cost.
 * `authorComment` still uses {@link AuthorCommentStruct} so a malformed Call
 * drops the event, matching the previous schema.
 */
const readRawHydratedPosition = (
  value: unknown,
): RawHydratedPosition | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const {
    itemId,
    timestamp,
    cardLatestTradeAt,
    actor,
    metadata,
    metrics,
    imageUrl,
    firstTradeAt,
    holdTimeMs,
    entryPriceUsd,
    authorComment,
    flags,
    currentValueUSD,
    positionValueUSD,
    pnlValueUsd,
    pnlPercent,
  } = value;

  if (
    typeof itemId !== 'string' ||
    !isFiniteNumber(timestamp) ||
    !isFiniteNumber(cardLatestTradeAt) ||
    !isRecord(actor) ||
    !isRecord(metadata) ||
    !isRecord(metrics)
  ) {
    return undefined;
  }

  const { type, address, name, images, profile, followerCount } = actor;
  if (
    type !== 'user' ||
    typeof address !== 'string' ||
    typeof name !== 'string' ||
    !isRecord(images) ||
    !isNullableString(images.raw) ||
    !isNullableString(images.xs) ||
    !isNullableString(images.sm) ||
    !isRecord(profile) ||
    typeof profile.id !== 'string' ||
    !isRecord(profile.metadata) ||
    (followerCount !== undefined && !isNullableNumber(followerCount))
  ) {
    return undefined;
  }

  const identity = readProfileIdentity(profile);
  if (!identity) {
    return undefined;
  }

  const {
    tokenChain,
    tokenSymbol,
    tokenName,
    tokenAddress,
    positionAmount,
    positionStats,
    trades,
    perpPositionType,
    perpLeverage,
    positionAmountWithLeverage,
  } = metadata;

  if (
    typeof tokenChain !== 'string' ||
    typeof tokenSymbol !== 'string' ||
    typeof tokenName !== 'string' ||
    typeof tokenAddress !== 'string' ||
    !isFiniteNumber(positionAmount) ||
    !isRecord(positionStats) ||
    !Array.isArray(trades)
  ) {
    return undefined;
  }

  const {
    boughtUSD,
    soldUSD,
    realizedGainsUSD,
    holdingsCostBasisUSD,
    receivedCostBasisUSD,
    holdingReceivedCostBasisUSD,
    isOpen,
  } = positionStats;

  if (
    !isNullableNumber(boughtUSD) ||
    !isNullableNumber(soldUSD) ||
    !isNullableNumber(realizedGainsUSD) ||
    !isNullableNumber(holdingsCostBasisUSD) ||
    !isNullableNumber(receivedCostBasisUSD) ||
    !isNullableNumber(holdingReceivedCostBasisUSD) ||
    typeof isOpen !== 'boolean'
  ) {
    return undefined;
  }

  if (
    (perpPositionType !== undefined &&
      perpPositionType !== null &&
      (typeof perpPositionType !== 'string' ||
        !PERP_SIDES.has(perpPositionType))) ||
    (perpLeverage !== undefined && !isNullableNumber(perpLeverage)) ||
    (positionAmountWithLeverage !== undefined &&
      !isNullableNumber(positionAmountWithLeverage))
  ) {
    return undefined;
  }

  const parsedTrades: RawTrade[] = [];
  for (const trade of trades) {
    const parsed = readRawTrade(trade);
    if (!parsed) {
      return undefined;
    }
    parsedTrades.push(parsed);
  }

  const { commentCount, replyCount, copyCount } = metrics;
  if (
    !isFiniteNumber(commentCount) ||
    !isFiniteNumber(replyCount) ||
    (copyCount !== undefined && !isNullableNumber(copyCount))
  ) {
    return undefined;
  }

  if (
    (imageUrl !== undefined && !isNullableString(imageUrl)) ||
    (firstTradeAt !== undefined && !isNullableNumber(firstTradeAt)) ||
    (holdTimeMs !== undefined && !isNullableNumber(holdTimeMs)) ||
    (entryPriceUsd !== undefined && !isNullableNumber(entryPriceUsd)) ||
    (flags !== undefined && flags !== null && !isStringArray(flags)) ||
    (currentValueUSD !== undefined && !isNullableNumber(currentValueUSD)) ||
    (positionValueUSD !== undefined && !isNullableNumber(positionValueUSD)) ||
    (pnlValueUsd !== undefined && !isNullableNumber(pnlValueUsd)) ||
    (pnlPercent !== undefined && !isNullableNumber(pnlPercent))
  ) {
    return undefined;
  }

  // Preserve prior behavior: a present but malformed Call rejects the event.
  if (authorComment !== undefined && authorComment !== null) {
    if (!is(authorComment, AuthorCommentStruct)) {
      return undefined;
    }
  }

  return {
    itemId,
    timestamp,
    cardLatestTradeAt,
    actor: {
      address,
      name,
      images: { raw: images.raw, sm: images.sm },
      profile: {
        id: profile.id,
        metadata: profile.metadata,
        ...identity,
      },
      ...(followerCount === undefined ? {} : { followerCount }),
    },
    metadata: {
      tokenChain,
      tokenSymbol,
      tokenName,
      tokenAddress,
      positionAmount,
      positionStats: {
        boughtUSD,
        soldUSD,
        realizedGainsUSD,
        holdingsCostBasisUSD,
        receivedCostBasisUSD,
        holdingReceivedCostBasisUSD,
        isOpen,
      },
      trades: parsedTrades,
      ...(perpPositionType === undefined
        ? {}
        : {
            perpPositionType: perpPositionType as 'long' | 'short' | null,
          }),
      ...(perpLeverage === undefined ? {} : { perpLeverage }),
      ...(positionAmountWithLeverage === undefined
        ? {}
        : { positionAmountWithLeverage }),
    },
    metrics: {
      commentCount,
      replyCount,
      ...(copyCount === undefined ? {} : { copyCount }),
    },
    ...(imageUrl === undefined ? {} : { imageUrl }),
    ...(firstTradeAt === undefined ? {} : { firstTradeAt }),
    ...(holdTimeMs === undefined ? {} : { holdTimeMs }),
    ...(entryPriceUsd === undefined ? {} : { entryPriceUsd }),
    ...(authorComment === undefined
      ? {}
      : { authorComment: authorComment as AuthorComment | null }),
    ...(flags === undefined ? {} : { flags }),
    ...(currentValueUSD === undefined ? {} : { currentValueUSD }),
    ...(positionValueUSD === undefined ? {} : { positionValueUSD }),
    ...(pnlValueUsd === undefined ? {} : { pnlValueUsd }),
    ...(pnlPercent === undefined ? {} : { pnlPercent }),
  };
};

const toActor = (actor: RawHydratedPosition['actor']): FeedActorSummary => ({
  profileId: actor.profile.id,
  address: actor.address,
  name: actor.name,
  imageUrl: actor.images.sm ?? actor.images.raw,
  ...toIdentity(actor.profile),
  winRate30d: readNullableNumber(actor.profile.metadata.winRate30d),
  pnl30d: readNullableNumber(actor.profile.metadata.pnl30d),
  volumeUsd30d: readNullableNumber(actor.profile.metadata.volumeUsd30d),
  volumeUsd7d: readNullableNumber(actor.profile.metadata.volumeUsd7d),
  tradeCount30d: readNullableNumber(actor.profile.metadata.tradeCount30d),
  ...(actor.followerCount === undefined
    ? {}
    : { followerCount: actor.followerCount }),
});

// Same mapping as social-api's `mapAuthorComment`, so a socket fill carries
// the comments the REST payload would. Malformed entries are dropped.
const toTradeComments = (comments: unknown[]): AuthorComment[] =>
  comments.flatMap((comment) => {
    if (!is(comment, RawTradeCommentStruct)) {
      return [];
    }
    return [
      {
        uid: comment.uid,
        text: comment.commentText,
        timestamp: comment.timestamp,
        sourceLanguage: comment.sourceLanguage ?? null,
        translations: comment.translations ?? {},
        engagement: {
          reactions: comment.metrics.reactions,
          userReaction: comment.metrics.userReaction,
          replyCount: comment.replies?.length ?? 0,
        },
      },
    ];
  });

const toTrade = (trade: RawTrade): Trade => ({
  direction: trade.direction,
  intent: trade.intent,
  ...(trade.classification === null ? {} : { category: trade.classification }),
  classification: trade.classification,
  perpPositionType: trade.perpPositionType,
  perpLeverage: trade.perpLeverage,
  tokenAmount: trade.tokenAmount,
  usdCost: trade.usdCost,
  marketCap: trade.marketCap,
  timestamp: trade.timestamp,
  transactionHash: trade.transactionHash,
  comments: toTradeComments(trade.comments),
});

/**
 * Cheap check for an already-normalized {@link FeedItem}. Required scalars
 * only; optional Call still uses {@link AuthorCommentStruct}.
 */
const isNormalizedRealtimeFeedItem = (value: unknown): value is FeedItem => {
  if (!isRecord(value)) {
    return false;
  }
  const {
    positionId,
    tokenSymbol,
    tokenName,
    tokenAddress,
    chain,
    positionAmount,
    boughtUsd,
    soldUsd,
    realizedPnl,
    costBasis,
    trades,
    lastTradeAt,
    actor,
    timestamp,
    authorComment,
    flags,
    currentValueUSD,
    positionValueUSD,
    pnlValueUsd,
    pnlPercent,
  } = value;

  if (
    typeof positionId !== 'string' ||
    typeof tokenSymbol !== 'string' ||
    typeof tokenName !== 'string' ||
    typeof tokenAddress !== 'string' ||
    typeof chain !== 'string' ||
    !isFiniteNumber(positionAmount) ||
    !isNullableNumber(boughtUsd) ||
    !isNullableNumber(soldUsd) ||
    !isNullableNumber(realizedPnl) ||
    !isNullableNumber(costBasis) ||
    !Array.isArray(trades) ||
    !isFiniteNumber(lastTradeAt) ||
    !isRecord(actor) ||
    typeof actor.profileId !== 'string' ||
    typeof actor.address !== 'string' ||
    typeof actor.name !== 'string' ||
    !isFiniteNumber(timestamp) ||
    (flags !== undefined && flags !== null && !isStringArray(flags)) ||
    (currentValueUSD !== undefined && !isNullableNumber(currentValueUSD)) ||
    (positionValueUSD !== undefined && !isNullableNumber(positionValueUSD)) ||
    (pnlValueUsd !== undefined && !isNullableNumber(pnlValueUsd)) ||
    (pnlPercent !== undefined && !isNullableNumber(pnlPercent))
  ) {
    return false;
  }

  if (authorComment !== undefined && authorComment !== null) {
    return is(authorComment, AuthorCommentStruct);
  }

  return true;
};

export const normalizeRealtimeFeedItem = (
  value: unknown,
): FeedItem | undefined => {
  const raw = readRawHydratedPosition(value);
  if (!raw) {
    return undefined;
  }

  const stats = raw.metadata.positionStats;
  const receivedCostBasis = stats.receivedCostBasisUSD;
  const holdingReceivedCostBasis = stats.holdingReceivedCostBasisUSD;

  return {
    positionId: raw.itemId,
    tokenSymbol: raw.metadata.tokenSymbol,
    tokenName: raw.metadata.tokenName,
    tokenAddress: raw.metadata.tokenAddress,
    chain: raw.metadata.tokenChain,
    positionAmount: raw.metadata.positionAmount,
    isOpen: stats.isOpen,
    boughtUsd: addNullableNumbers(stats.boughtUSD, receivedCostBasis),
    soldUsd: stats.soldUSD,
    realizedPnl: stats.realizedGainsUSD,
    costBasis: addNullableNumbers(
      stats.holdingsCostBasisUSD,
      holdingReceivedCostBasis,
    ),
    trades: raw.metadata.trades.map(toTrade),
    lastTradeAt: raw.cardLatestTradeAt,
    tokenImageUrl: raw.imageUrl,
    perpPositionType: raw.metadata.perpPositionType,
    perpLeverage: raw.metadata.perpLeverage,
    positionAmountWithLeverage:
      raw.metadata.positionAmountWithLeverage ?? null,
    actor: toActor(raw.actor),
    timestamp: raw.timestamp,
    // The socket payload carries the server's selected author comment. It is
    // passed through as sent: an absent field stays absent, an explicit null
    // stays null, and a malformed value already dropped the item above.
    ...(raw.authorComment === undefined
      ? {}
      : { authorComment: raw.authorComment }),
    commentCount: raw.metrics.commentCount,
    replyCount: raw.metrics.replyCount,
    copyCount: raw.metrics.copyCount ?? 0,
    firstTradeAt: raw.firstTradeAt ?? null,
    holdTimeMs: raw.holdTimeMs ?? null,
    entryPriceUsd: raw.entryPriceUsd ?? null,
    // `flags` lives on the hydrated card, beside `metadata`. The server does
    // not set `metadata.flags`.
    ...(raw.flags === undefined ? {} : { flags: raw.flags }),
    ...toPricedFields(raw),
  };
};

export const parseRealtimeFeedItem = (
  value: unknown,
): RealtimeFeedEventData | undefined => {
  const normalized = normalizeRealtimeFeedItem(value);
  if (normalized) {
    return normalized;
  }

  return isNormalizedRealtimeFeedItem(value) ? value : undefined;
};
