/* eslint-disable jsdoc/tag-lines */
import type { ControllerGetStateAction } from '@metamask/base-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { CaipAccountId, CaipAssetType } from '@metamask/utils';

export type LoginResponseDto = {
  sessionId: string;
  subscription: SubscriptionDto;
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type SubscriptionDto = {
  id: string;
  referralCode: string;
  accounts: {
    address: string;
    chainId: number;
  }[];
};

export type GenerateChallengeDto = {
  address: string;
};

export type ChallengeResponseDto = {
  id: string;
  message: string;
  domain?: string;
  address?: string;
  issuedAt?: string;
  expirationTime?: string;
  nonce?: string;
};

export type LoginDto = {
  challengeId: string;
  signature: string;
  referralCode?: string;
};

export type EstimateAssetDto = {
  /**
   * Asset identifier in CAIP-19 format
   * @example 'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
   */
  id: CaipAssetType;
  /**
   * Amount of the asset as a string
   * @example '25739959426'
   */
  amount: string;
  /**
   * Asset price in USD PER TOKEN. Using ETH as an example, 1 ETH = 4493.23 USD at the time of writing. If provided, this will be used instead of doing a network call to get the current price.
   * @example '4512.34'
   */
  usdPrice?: string;
};

export type EstimateSwapContextDto = {
  /**
   * Source asset information, in caip19 format
   * @example {
   *   id: 'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
   *   amount: '25739959426'
   * }
   */
  srcAsset: EstimateAssetDto;

  /**
   * Destination asset information, in caip19 format.
   * @example {
   *   id: 'eip155:1/slip44:60',
   *   amount: '9912500000000000000'
   * }
   */
  destAsset: EstimateAssetDto;

  /**
   * Fee asset information, in caip19 format
   * @example {
   *   id: 'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
   *   amount: '100'
   * }
   */
  feeAsset: EstimateAssetDto;
};

export type EstimatePerpsContextDto = {
  /**
   * Type of the PERPS action (open position, close position, stop/loss, take profit, ...)
   * @example 'OPEN_POSITION'
   */
  type: 'OPEN_POSITION' | 'CLOSE_POSITION' | 'STOP_LOSS' | 'TAKE_PROFIT';

  /**
   * USD fee value
   * @example '12.34'
   */
  usdFeeValue: string;

  /**
   * Asset symbol (e.g., "ETH", "BTC")
   * @example 'ETH'
   */
  coin: string;
};

export type EstimatePointsContextDto = {
  /**
   * Swap context data, must be present for SWAP activity
   */
  swapContext?: EstimateSwapContextDto;

  /**
   * PERPS context data, must be present for PERPS activity
   */
  perpsContext?: EstimatePerpsContextDto;
};

/**
 * Type of point earning activity. Swap is for swaps and bridges. PERPS is for perps activities.
 * @example 'SWAP'
 */
export type PointsEventEarnType = 'SWAP' | 'PERPS';

export type EstimatePointsDto = {
  /**
   * Type of point earning activity
   * @example 'SWAP'
   */
  activityType: PointsEventEarnType;

  /**
   * Account address performing the activity in CAIP-10 format
   * @example 'eip155:1:0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6'
   */
  account: CaipAccountId;

  /**
   * Context data specific to the activity type
   */
  activityContext: EstimatePointsContextDto;
};

export type EstimatedPointsDto = {
  /**
   * Earnable for the activity
   * @example 100
   */
  pointsEstimate: number;

  /**
   * Bonus applied to the points estimate, in basis points. 100 = 1%
   * @example 200
   */
  bonusBips: number;
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type SeasonTierDto = {
  id: string;
  name: string;
  pointsNeeded: number;
  // Add other tier properties as needed
};

export type SeasonDto = {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  tiers: SeasonTierDto[];
};

export type SeasonStatusBalanceDto = {
  total: number;
  refereePortion: number;
  updatedAt?: Date;
};

export type SeasonStatusDto = {
  season: SeasonDto;
  balance: SeasonStatusBalanceDto;
  currentTierId: string;
};

export type SubscriptionReferralDetailsDto = {
  referralCode: string;
  totalReferees: number;
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type SubscriptionReferralDetailsState = {
  referralCode: string;
  totalReferees: number;
  lastFetched?: number;
};

// Serializable versions for state storage (Date objects converted to timestamps)
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type SeasonDtoState = {
  id: string;
  name: string;
  startDate: number; // timestamp
  endDate: number; // timestamp
  tiers: SeasonTierDto[];
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type SeasonStatusBalanceDtoState = {
  total: number;
  refereePortion: number;
  updatedAt?: number; // timestamp
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type SeasonTierState = {
  currentTier: SeasonTierDto;
  nextTier: SeasonTierDto | null;
  nextTierPointsNeeded: number | null;
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type SeasonStatusState = {
  season: SeasonDtoState;
  balance: SeasonStatusBalanceDtoState;
  tier: SeasonTierState;
  lastFetched?: number;
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type RewardsAccountState = {
  account: CaipAccountId;
  hasOptedIn?: boolean;
  subscriptionId: string | null;
  lastCheckedAuth: number;
  lastCheckedAuthError: boolean;
  perpsFeeDiscount: number | null;
  lastPerpsDiscountRateFetched: number | null;
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type RewardsControllerState = {
  activeAccount: RewardsAccountState | null;
  accounts: { [account: CaipAccountId]: RewardsAccountState };
  subscriptions: { [subscriptionId: string]: SubscriptionDto };
  seasons: { [seasonId: string]: SeasonDtoState };
  subscriptionReferralDetails: {
    [subscriptionId: string]: SubscriptionReferralDetailsState;
  };
  seasonStatuses: { [compositeId: string]: SeasonStatusState };
};

/**
 * Events that can be emitted by the RewardsController
 */
export type RewardsControllerEvents = {
  type: 'RewardsController:stateChange';
  payload: [RewardsControllerState, Patch[]];
};

/**
 * Patch type for state changes
 */
export type Patch = {
  op: 'replace' | 'add' | 'remove';
  path: string[];
  value?: unknown;
};

/**
 * Request for getting Perps discount
 */
export type GetPerpsDiscountDto = {
  /**
   * Account address in CAIP-10 format
   * @example 'eip155:1:0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6'
   */
  account: CaipAccountId;
};

/**
 * Parsed response for Perps discount data
 */
export type PerpsDiscountData = {
  /**
   * Whether the account has opted in (0 = not opted in, 1 = opted in)
   */
  hasOptedIn: boolean;
  /**
   * The discount percentage as a number
   * @example 5.5
   */
  discount: number;
};

/**
 * Geo rewards metadata containing location and support info
 */
export type GeoRewardsMetadata = {
  /**
   * The geographic location string (e.g., 'US', 'CA-ON', 'FR')
   */
  geoLocation: string;
  /**
   * Whether the location is allowed for opt-in
   */
  optinAllowedForGeo: boolean;
};

/**
 * Actions that can be performed by the RewardsController
 */
export type RewardsControllerActions =
  | ControllerGetStateAction<'RewardsController', RewardsControllerState>
  | RewardsControllerGetHasAccountOptedInAction
  | RewardsControllerEstimatePointsAction
  | RewardsControllerGetPerpsDiscountAction
  | RewardsControllerIsRewardsFeatureEnabledAction
  | RewardsControllerGetSeasonStatusAction
  | RewardsControllerGetReferralDetailsAction
  | RewardsControllerOptInAction
  | RewardsControllerLogoutAction
  | RewardsControllerGetGeoRewardsMetadataAction
  | RewardsControllerValidateReferralCodeAction;

/**
 * Type to be stored in a subscription token
 */
export type SubscriptionTokenPayload = {
  subscriptionId: string;
  loginSessionId: string;
};

/**
 * Response type for token operations
 */
export type TokenResponse = {
  success: boolean;
  token?: string;
  error?: string;
};

/**
 * Different environment types for the application
 */
export enum EnvironmentType {
  Production = 'PROD',
  Development = 'DEV',
}

/**
 * Action for getting whether the account (caip-10 format) has opted in
 */
export type RewardsControllerGetHasAccountOptedInAction = {
  type: 'RewardsController:getHasAccountOptedIn';
  handler: (account: CaipAccountId) => Promise<boolean>;
};

/**
 * Action for estimating points for a given activity
 */
export type RewardsControllerEstimatePointsAction = {
  type: 'RewardsController:estimatePoints';
  handler: (request: EstimatePointsDto) => Promise<EstimatedPointsDto>;
};

/**
 * Action for getting perps fee discount for an account
 */
export type RewardsControllerGetPerpsDiscountAction = {
  type: 'RewardsController:getPerpsDiscountForAccount';
  handler: (account: CaipAccountId) => Promise<number>;
};

/**
 * Action for checking if rewards feature is enabled via feature flag
 */
export type RewardsControllerIsRewardsFeatureEnabledAction = {
  type: 'RewardsController:isRewardsFeatureEnabled';
  handler: () => boolean;
};

/**
 * Action for getting season status with caching
 */
export type RewardsControllerGetSeasonStatusAction = {
  type: 'RewardsController:getSeasonStatus';
  handler: (
    seasonId: string,
    subscriptionId: string,
  ) => Promise<SeasonStatusState | null>;
};

/**
 * Action for getting referral details with caching
 */
export type RewardsControllerGetReferralDetailsAction = {
  type: 'RewardsController:getReferralDetails';
  handler: (
    subscriptionId: string,
  ) => Promise<SubscriptionReferralDetailsState | null>;
};

/**
 * Action for logging out a user
 */
export type RewardsControllerLogoutAction = {
  type: 'RewardsController:logout';
  handler: () => Promise<void>;
};

/**
 * Action for getting geo rewards metadata
 */
export type RewardsControllerGetGeoRewardsMetadataAction = {
  type: 'RewardsController:getGeoRewardsMetadata';
  handler: () => Promise<GeoRewardsMetadata>;
};

/**
 * Action for validating referral codes
 */
export type RewardsControllerValidateReferralCodeAction = {
  type: 'RewardsController:validateReferralCode';
  handler: (code: string) => Promise<boolean>;
};

/**
 * Action for updating state with opt-in response
 */
export type RewardsControllerOptInAction = {
  type: 'RewardsController:optIn';
  handler: (account: InternalAccount, referralCode?: string) => Promise<void>;
};
