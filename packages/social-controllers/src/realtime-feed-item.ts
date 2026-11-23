import type {
  AuthorComment,
  CommentEngagement,
  FeedActorSummary,
  FeedItem,
  ProfileIdentity,
  Trade,
} from './social-types.js';

type RawTradeComment = {
  uid: string;
  commentText: string;
  timestamp: number;
  sourceLanguage?: string | null;
  translations?: Record<string, string>;
  metrics: CommentEngagement;
  replies?: unknown[];
};

type RawTrade = {
  tokenAmount: number;
  usdCost: number;
  marketCap: number | null;
  timestamp: number;
  transactionHash: string;
  direction: 'buy' | 'sell';
  classification: 'spot' | 'perp' | 'send' | 'receive' | null;
  intent: 'enter' | 'exit';
  perpPositionType: 'long' | 'short' | null;
  perpLeverage: number | null;
  comments: RawTradeComment[];
};

type RawFeedActor = {
  type: 'user';
  address: string;
  name: string;
  images: {
    raw: string | null;
    xs: string | null;
    sm: string | null;
  };
  profile: ProfileIdentity & {
    id: string;
    metadata: Record<string, unknown>;
  };
  followerCount?: number | null;
};

type RawHydratedPosition = {
  itemId: string;
  timestamp: number;
  cardLatestTradeAt: number;
  actor: RawFeedActor;
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
    reactions: unknown[];
    userReaction: string | null;
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

const addNullableNumbers = (
  left: number | null,
  right: number | null,
): number | null => (left === null || right === null ? null : left + right);

const PROFILE_IDENTITY_KEYS = [
  'displayName',
  'bio',
  'createdAt',
  'updatedAt',
  'connectedToX',
  'tradingPrivacy',
] as const satisfies readonly (keyof ProfileIdentity)[];

// Copies only the identity fields the socket payload sent, as the REST
// payload omits the ones a profile has no value for.
const toIdentity = (profile: ProfileIdentity): ProfileIdentity =>
  Object.fromEntries(
    PROFILE_IDENTITY_KEYS.flatMap((key) =>
      profile[key] === undefined ? [] : [[key, profile[key]]],
    ),
  );

const toActor = (actor: RawFeedActor): FeedActorSummary => ({
  profileId: actor.profile.id,
  address: actor.address,
  name: actor.name,
  imageUrl: actor.images.sm ?? actor.images.raw,
  ...toIdentity(actor.profile),
  winRate30d:
    (actor.profile.metadata.winRate30d as number | null | undefined) ?? null,
  pnl30d: (actor.profile.metadata.pnl30d as number | null | undefined) ?? null,
  volumeUsd30d:
    (actor.profile.metadata.volumeUsd30d as number | null | undefined) ?? null,
  volumeUsd7d:
    (actor.profile.metadata.volumeUsd7d as number | null | undefined) ?? null,
  tradeCount30d:
    (actor.profile.metadata.tradeCount30d as number | null | undefined) ?? null,
  ...(actor.followerCount === undefined
    ? {}
    : { followerCount: actor.followerCount }),
});

// Same mapping as social-api's `mapAuthorComment`, so a socket fill carries
// the comments the REST payload would.
const toTradeComments = (comments: RawTradeComment[]): AuthorComment[] =>
  comments.map((comment) => ({
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
  }));

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

const isRawHydratedPosition = (value: unknown): value is RawHydratedPosition =>
  typeof value === 'object' &&
  value !== null &&
  'metadata' in value &&
  typeof value.metadata === 'object' &&
  value.metadata !== null;

export const normalizeRealtimeFeedItem = (value: unknown): FeedItem => {
  const raw = value as RawHydratedPosition;
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
    positionAmountWithLeverage: raw.metadata.positionAmountWithLeverage ?? null,
    actor: toActor(raw.actor),
    timestamp: raw.timestamp,
    // The socket payload carries the server's selected author comment. It is
    // passed through as sent: an absent field stays absent and an explicit
    // null stays null.
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

export const parseRealtimeFeedItem = (value: unknown): RealtimeFeedEventData =>
  isRawHydratedPosition(value)
    ? normalizeRealtimeFeedItem(value)
    : (value as FeedItem);
