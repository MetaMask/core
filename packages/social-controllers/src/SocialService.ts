import type {
  DataServiceCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
} from '@metamask/base-data-service';
import { BaseDataService } from '@metamask/base-data-service';
import type { CreateServicePolicyOptions } from '@metamask/controller-utils';
import { HttpError } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import {
  array,
  boolean,
  is,
  number,
  optional,
  record,
  string,
  type as structType,
} from '@metamask/superstruct';

import { serviceName, SocialServiceErrorMessage } from './social-constants';
import type {
  FetchFollowersOptions,
  FetchFollowingOptions,
  FetchLeaderboardOptions,
  FetchPositionsOptions,
  FetchTraderProfileOptions,
  FollowersResponse,
  FollowingResponse,
  FollowOptions,
  FollowResponse,
  LeaderboardResponse,
  PositionsResponse,
  TraderProfileResponse,
  UnfollowOptions,
  UnfollowResponse,
} from './social-types';
import type { SocialServiceMethodActions } from './SocialService-method-action-types';

// ---------------------------------------------------------------------------
// Superstruct validation schemas
// ---------------------------------------------------------------------------

const SocialHandlesStruct = structType({
  twitter: optional(string()),
  farcaster: optional(string()),
  ens: optional(string()),
  lens: optional(string()),
});

const ProfileSummaryStruct = structType({
  profileId: string(),
  address: string(),
  name: string(),
  imageUrl: optional(string()),
});

const TradeStruct = structType({
  direction: string(),
  tokenAmount: number(),
  usdCost: number(),
  timestamp: number(),
  transactionHash: string(),
});

const PositionStruct = structType({
  tokenSymbol: string(),
  tokenName: string(),
  tokenAddress: string(),
  chain: string(),
  positionAmount: number(),
  boughtUsd: number(),
  soldUsd: number(),
  realizedPnl: number(),
  costBasis: number(),
  trades: array(TradeStruct),
  lastTradeAt: number(),
});

const PaginationStruct = structType({
  hasMore: boolean(),
  nextPage: optional(number()),
});

const LeaderboardEntryStruct = structType({
  rank: number(),
  addresses: array(string()),
  profileId: string(),
  name: string(),
  imageUrl: optional(string()),
  pnl30d: number(),
  winRate30d: optional(number()),
  roi30d: optional(number()),
  tradeCount: optional(number()),
  pnlPerChain: record(string(), number()),
  followerCount: number(),
  socialHandles: SocialHandlesStruct,
});

const LeaderboardResponseStruct = structType({
  traders: array(LeaderboardEntryStruct),
});

const TraderProfileStruct = structType({
  profileId: string(),
  address: string(),
  allAddresses: array(string()),
  name: string(),
  imageUrl: optional(string()),
});

const TraderStatsStruct = structType({
  pnl30d: optional(number()),
  winRate30d: optional(number()),
  roi30d: optional(number()),
  tradeCount: optional(number()),
});

const PerChainBreakdownStruct = structType({
  perChainPnl: record(string(), number()),
  perChainRoi: record(string(), number()),
  perChainVolume: record(string(), number()),
});

const TraderProfileResponseStruct = structType({
  profile: TraderProfileStruct,
  stats: TraderStatsStruct,
  perChainBreakdown: PerChainBreakdownStruct,
  socialHandles: SocialHandlesStruct,
  followerCount: number(),
  followingCount: number(),
});

const PositionsResponseStruct = structType({
  positions: array(PositionStruct),
  pagination: PaginationStruct,
});

const FollowersResponseStruct = structType({
  followers: array(ProfileSummaryStruct),
  count: number(),
});

const FollowingResponseStruct = structType({
  following: array(ProfileSummaryStruct),
  count: number(),
});

const FollowResponseStruct = structType({
  followed: array(ProfileSummaryStruct),
});

const UnfollowResponseStruct = structType({
  unfollowed: array(ProfileSummaryStruct),
});

// ---------------------------------------------------------------------------
// Messenger types
// ---------------------------------------------------------------------------

const MESSENGER_EXPOSED_METHODS = [
  'fetchLeaderboard',
  'fetchTraderProfile',
  'fetchOpenPositions',
  'fetchClosedPositions',
  'fetchFollowers',
  'fetchFollowing',
  'follow',
  'unfollow',
] as const;

export type SocialServiceActions =
  | SocialServiceMethodActions
  | DataServiceInvalidateQueriesAction<typeof serviceName>;

export type SocialServiceEvents =
  | DataServiceCacheUpdatedEvent<typeof serviceName>
  | DataServiceGranularCacheUpdatedEvent<typeof serviceName>;

export type SocialServiceMessenger = Messenger<
  typeof serviceName,
  SocialServiceActions,
  SocialServiceEvents
>;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Data service wrapping social-api endpoints.
 */
export class SocialService extends BaseDataService<
  typeof serviceName,
  SocialServiceMessenger
> {
  readonly #baseUrl: string;

  constructor({
    messenger,
    baseUrl,
    policyOptions,
  }: {
    messenger: SocialServiceMessenger;
    baseUrl: string;
    policyOptions?: CreateServicePolicyOptions;
  }) {
    super({ name: serviceName, messenger, policyOptions });
    this.#baseUrl = baseUrl;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Throws an HttpError if the response is not ok.
   *
   * @param response - The fetch response to check.
   * @param message - The error message prefix from SocialServiceErrorMessage.
   */
  static #throwIfNotOk(response: Response, message: string): void {
    if (!response.ok) {
      throw new HttpError(response.status, `${message}: ${response.status}`);
    }
  }

  /**
   * Fetches the leaderboard of top traders.
   *
   * Calls `GET ${baseUrl}/leaderboard`.
   *
   * @param options - Optional query parameters for sorting, chain filtering, and limit.
   * @returns The leaderboard response with ranked traders.
   */
  async fetchLeaderboard(
    options?: FetchLeaderboardOptions,
  ): Promise<LeaderboardResponse> {
    const leaderboardResponse = await this.fetchQuery({
      queryKey: [`${this.name}:fetchLeaderboard`, options ?? null],
      queryFn: async () => {
        const { sort, chains, limit } = options ?? {};
        const url = new URL(`${this.#baseUrl}/leaderboard`);
        if (sort) {
          url.searchParams.append('sort', sort);
        }
        if (chains) {
          for (const chain of chains) {
            url.searchParams.append('chains', chain);
          }
        }
        if (limit !== undefined) {
          url.searchParams.append('limit', String(limit));
        }

        const response = await fetch(url.toString());
        SocialService.#throwIfNotOk(
          response,
          SocialServiceErrorMessage.FETCH_LEADERBOARD_FAILED,
        );
        return response.json();
      },
    });

    if (!is(leaderboardResponse, LeaderboardResponseStruct)) {
      throw new Error(
        SocialServiceErrorMessage.FETCH_LEADERBOARD_INVALID_RESPONSE,
      );
    }
    return leaderboardResponse as LeaderboardResponse;
  }

  /**
   * Fetches a trader's profile by address or profile ID.
   *
   * Calls `GET ${baseUrl}/traders/${addressOrId}/profile`.
   *
   * @param options - Options bag.
   * @param options.addressOrId - Wallet address or Clicker profile ID.
   * @returns The trader profile response.
   */
  async fetchTraderProfile(
    options: FetchTraderProfileOptions,
  ): Promise<TraderProfileResponse> {
    const { addressOrId } = options;

    const traderProfileResponse = await this.fetchQuery({
      queryKey: [`${this.name}:fetchTraderProfile`, addressOrId],
      queryFn: async () => {
        const url = `${this.#baseUrl}/traders/${encodeURIComponent(addressOrId)}/profile`;
        const response = await fetch(url);
        SocialService.#throwIfNotOk(
          response,
          SocialServiceErrorMessage.FETCH_TRADER_PROFILE_FAILED,
        );
        return response.json();
      },
    });

    if (!is(traderProfileResponse, TraderProfileResponseStruct)) {
      throw new Error(
        SocialServiceErrorMessage.FETCH_TRADER_PROFILE_INVALID_RESPONSE,
      );
    }
    return traderProfileResponse as TraderProfileResponse;
  }

  /**
   * Fetches a trader's open positions.
   *
   * Calls `GET ${baseUrl}/traders/${addressOrId}/positions/open`.
   *
   * @param options - Options bag.
   * @param options.addressOrId - Wallet address or Clicker profile ID.
   * @param options.chain - Filter by chain.
   * @param options.sort - Sort by 'value' or 'latest'.
   * @param options.limit - Number of results per page.
   * @param options.page - Page number (1-based).
   * @returns The positions response.
   */
  async fetchOpenPositions(
    options: FetchPositionsOptions,
  ): Promise<PositionsResponse> {
    return this.#fetchPositions('open', options);
  }

  /**
   * Fetches a trader's closed positions.
   *
   * Calls `GET ${baseUrl}/traders/${addressOrId}/positions/closed`.
   *
   * @param options - Options bag.
   * @param options.addressOrId - Wallet address or Clicker profile ID.
   * @param options.chain - Filter by chain.
   * @param options.sort - Sort by 'value' or 'latest'.
   * @param options.limit - Number of results per page.
   * @param options.page - Page number (1-based).
   * @returns The positions response.
   */
  async fetchClosedPositions(
    options: FetchPositionsOptions,
  ): Promise<PositionsResponse> {
    return this.#fetchPositions('closed', options);
  }

  /**
   * Fetches a trader's MetaMask followers.
   *
   * Calls `GET ${baseUrl}/traders/${addressOrId}/followers`.
   *
   * @param options - Options bag.
   * @param options.addressOrId - Wallet address or Clicker profile ID.
   * @returns The followers response.
   */
  async fetchFollowers(
    options: FetchFollowersOptions,
  ): Promise<FollowersResponse> {
    const { addressOrId } = options;

    const followersResponse = await this.fetchQuery({
      queryKey: [`${this.name}:fetchFollowers`, addressOrId],
      queryFn: async () => {
        const url = `${this.#baseUrl}/traders/${encodeURIComponent(addressOrId)}/followers`;
        const response = await fetch(url);
        SocialService.#throwIfNotOk(
          response,
          SocialServiceErrorMessage.FETCH_FOLLOWERS_FAILED,
        );
        return response.json();
      },
    });

    if (!is(followersResponse, FollowersResponseStruct)) {
      throw new Error(
        SocialServiceErrorMessage.FETCH_FOLLOWERS_INVALID_RESPONSE,
      );
    }
    return followersResponse as FollowersResponse;
  }

  /**
   * Fetches the list of traders a user is following.
   *
   * Calls `GET ${baseUrl}/users/${addressOrUid}/following`.
   *
   * @param options - Options bag.
   * @param options.addressOrUid - Wallet address or Clicker profile ID.
   * @returns The following response.
   */
  async fetchFollowing(
    options: FetchFollowingOptions,
  ): Promise<FollowingResponse> {
    const { addressOrUid } = options;

    const followingResponse = await this.fetchQuery({
      queryKey: [`${this.name}:fetchFollowing`, addressOrUid],
      queryFn: async () => {
        const url = `${this.#baseUrl}/users/${encodeURIComponent(addressOrUid)}/following`;
        const response = await fetch(url);
        SocialService.#throwIfNotOk(
          response,
          SocialServiceErrorMessage.FETCH_FOLLOWING_FAILED,
        );
        return response.json();
      },
    });

    if (!is(followingResponse, FollowingResponseStruct)) {
      throw new Error(
        SocialServiceErrorMessage.FETCH_FOLLOWING_INVALID_RESPONSE,
      );
    }
    return followingResponse as FollowingResponse;
  }

  /**
   * Follows one or more traders.
   *
   * Calls `PUT ${baseUrl}/users/${addressOrUid}/follows`.
   *
   * @param options - Options bag.
   * @param options.addressOrUid - Wallet address or Clicker profile ID of the user.
   * @param options.targets - Array of wallet addresses or profile IDs to follow.
   * @returns The follow response with confirmed follows.
   */
  async follow(options: FollowOptions): Promise<FollowResponse> {
    const { addressOrUid, targets } = options;

    const followResponse = await this.fetchQuery({
      queryKey: [`${this.name}:follow`, addressOrUid, targets],
      staleTime: 0,
      queryFn: async () => {
        const url = `${this.#baseUrl}/users/${encodeURIComponent(addressOrUid)}/follows`;
        const response = await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targets }),
        });
        SocialService.#throwIfNotOk(
          response,
          SocialServiceErrorMessage.FOLLOW_FAILED,
        );
        return response.json();
      },
    });

    if (!is(followResponse, FollowResponseStruct)) {
      throw new Error(SocialServiceErrorMessage.FOLLOW_INVALID_RESPONSE);
    }
    return followResponse as FollowResponse;
  }

  /**
   * Unfollows one or more traders.
   *
   * Calls `DELETE ${baseUrl}/users/${addressOrUid}/follows?targets=...`.
   * Targets are sent as query params because Fastify does not parse
   * request bodies on DELETE requests per RFC 9110.
   *
   * @param options - Options bag.
   * @param options.addressOrUid - Wallet address or Clicker profile ID of the user.
   * @param options.targets - Array of wallet addresses or profile IDs to unfollow.
   * @returns The unfollow response with confirmed unfollows.
   */
  async unfollow(options: UnfollowOptions): Promise<UnfollowResponse> {
    const { addressOrUid, targets } = options;

    const unfollowResponse = await this.fetchQuery({
      queryKey: [`${this.name}:unfollow`, addressOrUid, targets],
      staleTime: 0,
      queryFn: async () => {
        const url = new URL(
          `${this.#baseUrl}/users/${encodeURIComponent(addressOrUid)}/follows`,
        );
        for (const target of targets) {
          url.searchParams.append('targets', target);
        }
        const response = await fetch(url.toString(), { method: 'DELETE' });
        SocialService.#throwIfNotOk(
          response,
          SocialServiceErrorMessage.UNFOLLOW_FAILED,
        );
        return response.json();
      },
    });

    if (!is(unfollowResponse, UnfollowResponseStruct)) {
      throw new Error(SocialServiceErrorMessage.UNFOLLOW_INVALID_RESPONSE);
    }
    return unfollowResponse as UnfollowResponse;
  }

  /**
   * Shared helper for fetching open/closed positions.
   *
   * @param status - "open" or "closed".
   * @param options - Options bag including addressOrId and query parameters.
   * @returns The positions response.
   */
  async #fetchPositions(
    status: 'open' | 'closed',
    options: FetchPositionsOptions,
  ): Promise<PositionsResponse> {
    const { addressOrId, chain, sort, limit, page } = options;

    const failedMessage =
      status === 'open'
        ? SocialServiceErrorMessage.FETCH_OPEN_POSITIONS_FAILED
        : SocialServiceErrorMessage.FETCH_CLOSED_POSITIONS_FAILED;
    const invalidMessage =
      status === 'open'
        ? SocialServiceErrorMessage.FETCH_OPEN_POSITIONS_INVALID_RESPONSE
        : SocialServiceErrorMessage.FETCH_CLOSED_POSITIONS_INVALID_RESPONSE;

    const positionsResponse = await this.fetchQuery({
      queryKey: [
        `${this.name}:fetch${status === 'open' ? 'Open' : 'Closed'}Positions`,
        addressOrId,
        chain ?? null,
        sort ?? null,
        limit ?? null,
        page ?? null,
      ],
      queryFn: async () => {
        const url = new URL(
          `${this.#baseUrl}/traders/${encodeURIComponent(addressOrId)}/positions/${status}`,
        );
        if (chain) {
          url.searchParams.append('chain', chain);
        }
        if (sort) {
          url.searchParams.append('sort', sort);
        }
        if (limit !== undefined) {
          url.searchParams.append('limit', String(limit));
        }
        if (page !== undefined) {
          url.searchParams.append('page', String(page));
        }

        const response = await fetch(url.toString());
        SocialService.#throwIfNotOk(response, failedMessage);
        return response.json();
      },
    });

    if (!is(positionsResponse, PositionsResponseStruct)) {
      throw new Error(invalidMessage);
    }
    return positionsResponse as PositionsResponse;
  }
}
