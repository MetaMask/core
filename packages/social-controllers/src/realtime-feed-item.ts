import { ProfileIdentityStruct } from './social-types.js';
import type {
  AuthorComment,
  FeedItem,
  FeedActorSummary,
  ProfileIdentity,
  Trade,
} from './social-types.js';

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

const readNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

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

/**
 * Trusts the socket payload (same approach as OHLCV on this gateway). Schema
 * correctness belongs on social-api; the client only needs enough shape to map
 * the hydrated card onto {@link FeedItem}.
 */
const asRawHydratedPosition = (
  value: unknown,
): RawHydratedPosition | undefined => {
  if (!isRecord(value) || typeof value.itemId !== 'string') {
    return undefined;
  }
  if (
    !isRecord(value.actor) ||
    !isRecord(value.metadata) ||
    !isRecord(value.metrics)
  ) {
    return undefined;
  }
  return value as unknown as RawHydratedPosition;
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

// Same mapping as social-api's `mapAuthorComment`. Malformed entries are
// skipped; the rest of the card is kept.
const toTradeComments = (comments: unknown[]): AuthorComment[] =>
  comments.flatMap((comment) => {
    if (!isRecord(comment) || typeof comment.uid !== 'string') {
      return [];
    }
    if (typeof comment.commentText !== 'string') {
      return [];
    }
    if (typeof comment.timestamp !== 'number') {
      return [];
    }
    const metrics = isRecord(comment.metrics) ? comment.metrics : null;
    if (!metrics) {
      return [];
    }
    return [
      {
        uid: comment.uid,
        text: comment.commentText,
        timestamp: comment.timestamp,
        sourceLanguage:
          typeof comment.sourceLanguage === 'string' ||
          comment.sourceLanguage === null
            ? comment.sourceLanguage
            : null,
        translations: isRecord(comment.translations)
          ? (comment.translations as Record<string, string>)
          : {},
        engagement: {
          reactions: Array.isArray(metrics.reactions) ? metrics.reactions : [],
          userReaction:
            typeof metrics.userReaction === 'string' ||
            metrics.userReaction === null
              ? metrics.userReaction
              : null,
          replyCount: Array.isArray(comment.replies) ? comment.replies.length : 0,
        },
      } as AuthorComment,
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
  comments: toTradeComments(trade.comments ?? []),
});

export const normalizeRealtimeFeedItem = (
  value: unknown,
): FeedItem | undefined => {
  const raw = asRawHydratedPosition(value);
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
    trades: (raw.metadata.trades ?? []).map(toTrade),
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
    // stays null.
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

  // Already-normalized FeedItem from the socket: trust like OHLCV.
  if (isRecord(value) && typeof value.positionId === 'string') {
    return value as FeedItem;
  }

  return undefined;
};
