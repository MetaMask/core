/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable jsdoc/require-returns */
/* eslint-disable jsdoc/tag-lines */
import { BaseController } from '@metamask/base-controller';
import { isHardwareWallet } from '@metamask/bridge-controller';
import { toHex } from '@metamask/controller-utils';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import {
  type CaipAccountId,
  parseCaipChainId,
  toCaipAccountId,
} from '@metamask/utils';
import { isAddress as isSolanaAddress } from '@solana/addresses';

import {
  AUTH_GRACE_PERIOD_MS,
  controllerName,
  DEFAULT_BLOCKED_REGIONS,
  PERPS_DISCOUNT_CACHE_THRESHOLD_MS,
  REFERRAL_DETAILS_CACHE_THRESHOLD_MS,
  SEASON_STATUS_CACHE_THRESHOLD_MS,
} from './constants';
import { getRewardsFeatureFlag } from './feature-flags';
import { projectLogger, createModuleLogger } from './logger';
import type { RewardsControllerMessenger } from './messenger/RewardsControllerMessenger';
import type {
  RewardsControllerState,
  RewardsAccountState,
  LoginResponseDto,
  PerpsDiscountData,
  EstimatePointsDto,
  EstimatedPointsDto,
  SeasonStatusDto,
  SeasonDtoState,
  SeasonStatusState,
  SeasonTierState,
  SeasonTierDto,
  SubscriptionReferralDetailsState,
  SubscriptionTokenPayload,
  GeoRewardsMetadata,
  TokenResponse,
  SubscriptionDto,
  GetPointsEventsDto,
  PaginatedPointsEventsDto,
} from './types';

const log = createModuleLogger(projectLogger, controllerName);

// Re-export the messenger type for convenience
export type { RewardsControllerMessenger };

// Function to store subscription token
export type StoreSubscriptionToken = (
  subscriptionTokenPayload: SubscriptionTokenPayload,
) => Promise<TokenResponse>;

// Function to remove subscription token
export type RemoveSubscriptionToken = (
  subscriptionId: string,
) => Promise<TokenResponse>;

/**
 * State metadata for the RewardsController
 */
const metadata = {
  activeAccount: { persist: true, anonymous: false },
  accounts: { persist: true, anonymous: false },
  subscriptions: { persist: true, anonymous: false },
  seasons: { persist: true, anonymous: false },
  subscriptionReferralDetails: { persist: true, anonymous: false },
  seasonStatuses: { persist: true, anonymous: false },
};
/**
 * Get the default state for the RewardsController
 */
export const getRewardsControllerDefaultState = (): RewardsControllerState => ({
  activeAccount: null,
  accounts: {},
  subscriptions: {},
  seasons: {},
  subscriptionReferralDetails: {},
  seasonStatuses: {},
});

export const defaultRewardsControllerState = getRewardsControllerDefaultState();

/**
 * Controller for managing user rewards and campaigns
 * Handles reward claiming, campaign fetching, and reward history
 */
export class RewardsController extends BaseController<
  typeof controllerName,
  RewardsControllerState,
  RewardsControllerMessenger
> {
  #geoLocation: GeoRewardsMetadata | null = null;

  readonly #storeSubscriptionToken?: StoreSubscriptionToken;

  readonly #removeSubscriptionToken?: RemoveSubscriptionToken;

  // Constructor
  constructor({
    messenger,
    state,
    storeSubscriptionToken,
    removeSubscriptionToken,
  }: {
    messenger: RewardsControllerMessenger;
    state?: Partial<RewardsControllerState>;
    storeSubscriptionToken?: StoreSubscriptionToken;
    removeSubscriptionToken?: RemoveSubscriptionToken;
  }) {
    super({
      name: controllerName,
      metadata,
      messenger,
      state: {
        ...defaultRewardsControllerState,
        ...state,
      },
    });

    this.#storeSubscriptionToken = storeSubscriptionToken;
    this.#removeSubscriptionToken = removeSubscriptionToken;
    this.#registerActionHandlers();
    this.#initializeEventSubscriptions();
  }

  /**
   * Calculate tier status and next tier information
   * @param seasonTiers - Array of season tiers
   * @param currentTierId - The ID of the current tier
   * @param currentPoints - The user's current points
   * @returns SeasonTierState - The current and next tier information
   */
  calculateTierStatus(
    seasonTiers: SeasonTierDto[],
    currentTierId: string,
    currentPoints: number,
  ): SeasonTierState {
    // Sort tiers by points needed (ascending)
    const sortedTiers = [...seasonTiers].sort(
      (a, b) => a.pointsNeeded - b.pointsNeeded,
    );

    // Find current tier
    const currentTier = sortedTiers.find((tier) => tier.id === currentTierId);
    if (!currentTier) {
      throw new Error(
        `Current tier ${currentTierId} not found in season tiers`,
      );
    }

    // Find next tier (first tier with more points needed than current tier)
    const currentTierIndex = sortedTiers.findIndex(
      (tier) => tier.id === currentTierId,
    );
    const nextTier =
      currentTierIndex < sortedTiers.length - 1
        ? sortedTiers[currentTierIndex + 1]
        : null;

    // Calculate points needed for next tier
    const nextTierPointsNeeded = nextTier
      ? Math.max(0, nextTier.pointsNeeded - currentPoints)
      : null;

    return {
      currentTier,
      nextTier,
      nextTierPointsNeeded,
    };
  }

  /**
   * Convert SeasonDto to SeasonDtoState for storage
   * @param season - The season DTO from the API
   * @returns SeasonDtoState - The converted season state
   */
  #convertSeasonToState(season: SeasonStatusDto['season']): SeasonDtoState {
    return {
      id: season.id,
      name: season.name,
      startDate: season.startDate.getTime(),
      endDate: season.endDate.getTime(),
      tiers: season.tiers,
    };
  }

  /**
   * Convert SeasonStatusDto to SeasonStatusState and update seasons map
   * @param seasonStatus - The season status DTO from the API
   * @returns SeasonStatusState - The converted season status state
   */
  #convertSeasonStatusToSubscriptionState(
    seasonStatus: SeasonStatusDto,
  ): SeasonStatusState {
    const tierState = this.calculateTierStatus(
      seasonStatus.season.tiers,
      seasonStatus.currentTierId,
      seasonStatus.balance.total,
    );

    return {
      season: this.#convertSeasonToState(seasonStatus.season),
      balance: {
        total: seasonStatus.balance.total,
        refereePortion: seasonStatus.balance.refereePortion,
        updatedAt: seasonStatus.balance.updatedAt?.getTime(),
      },
      tier: tierState,
      lastFetched: Date.now(),
    };
  }

  /**
   * Register action handlers for this controller
   */
  #registerActionHandlers(): void {
    this.messagingSystem.registerActionHandler(
      'RewardsController:getHasAccountOptedIn',
      this.getHasAccountOptedIn.bind(this),
    );
    this.messagingSystem.registerActionHandler(
      'RewardsController:getPointsEvents',
      this.getPointsEvents.bind(this),
    );
    this.messagingSystem.registerActionHandler(
      'RewardsController:estimatePoints',
      this.estimatePoints.bind(this),
    );
    this.messagingSystem.registerActionHandler(
      'RewardsController:getPerpsDiscountForAccount',
      this.getPerpsDiscountForAccount.bind(this),
    );
    this.messagingSystem.registerActionHandler(
      'RewardsController:isRewardsFeatureEnabled',
      this.isRewardsFeatureEnabled.bind(this),
    );
    this.messagingSystem.registerActionHandler(
      'RewardsController:getSeasonStatus',
      this.getSeasonStatus.bind(this),
    );
    this.messagingSystem.registerActionHandler(
      'RewardsController:getReferralDetails',
      this.getReferralDetails.bind(this),
    );
    this.messagingSystem.registerActionHandler(
      'RewardsController:optIn',
      this.optIn.bind(this),
    );
    this.messagingSystem.registerActionHandler(
      'RewardsController:logout',
      this.logout.bind(this),
    );
    this.messagingSystem.registerActionHandler(
      'RewardsController:getGeoRewardsMetadata',
      this.getGeoRewardsMetadata.bind(this),
    );
    this.messagingSystem.registerActionHandler(
      'RewardsController:validateReferralCode',
      this.validateReferralCode.bind(this),
    );
  }

  /**
   * Initialize event subscriptions based on feature flag state
   */
  #initializeEventSubscriptions(): void {
    // Subscribe to account changes for silent authentication
    this.messagingSystem.subscribe(
      'AccountsController:selectedAccountChange',
      () => this.#handleAuthenticationTrigger('Account changed'),
    );

    // Subscribe to KeyringController unlock events to retry silent auth
    this.messagingSystem.subscribe('KeyringController:unlock', () =>
      this.#handleAuthenticationTrigger('KeyringController unlocked'),
    );

    // Initialize silent authentication on startup
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.#handleAuthenticationTrigger('Controller initialized');
  }

  /**
   * Reset controller state to default
   */
  resetState(): void {
    this.update(() => getRewardsControllerDefaultState());
  }

  /**
   * Get account state for a given CAIP-10 address
   * @param account - The CAIP-10 account ID
   * @returns RewardsAccountState or null if not found
   */
  #getAccountState(account: CaipAccountId): RewardsAccountState | null {
    return this.state.accounts[account] || null;
  }

  /**
   * Create composite key for season status storage
   * @param seasonId - The season ID or 'current'
   * @param subscriptionId - The subscription ID
   * @returns Composite key string
   */
  #createSeasonStatusCompositeKey(
    seasonId: string,
    subscriptionId: string,
  ): string {
    return `${seasonId}:${subscriptionId}`;
  }

  /**
   * Get stored season status for a given composite key
   * @param subscriptionId - The subscription ID
   * @param seasonId - The season ID or 'current'
   * @returns SeasonStatusState or null if not found
   */
  #getSeasonStatus(
    subscriptionId: string,
    seasonId: string | 'current',
  ): SeasonStatusState | null {
    const compositeKey = this.#createSeasonStatusCompositeKey(
      seasonId,
      subscriptionId,
    );
    return this.state.seasonStatuses[compositeKey] || null;
  }

  /**
   * Sign a message for rewards authentication
   * @param account - The account to sign with
   * @param timestamp - The current timestamp
   * @returns Promise<string> - The signed message
   */
  async #signRewardsMessage(
    account: InternalAccount,
    timestamp: number,
  ): Promise<string> {
    const message = `rewards,${account.address},${timestamp}`;

    return await this.#signEvmMessage(account, message);
  }

  async #signEvmMessage(
    account: InternalAccount,
    message: string,
  ): Promise<string> {
    // Convert message to hex format for signing
    const hexMessage = `0x${Buffer.from(message, 'utf8').toString('hex')}`;

    // Use KeyringController to sign the message
    const signature = await this.messagingSystem.call(
      'KeyringController:signPersonalMessage',
      {
        data: hexMessage,
        from: account.address,
      },
    );
    log('RewardsController: EVM message signed for account', account.address);
    return signature;
  }

  /**
   * Handle authentication triggers (account changes, keyring unlock)
   * @param reason - Optional reason for the trigger
   */
  async #handleAuthenticationTrigger(reason?: string): Promise<void> {
    const rewardsEnabled = getRewardsFeatureFlag(this.messagingSystem);

    if (!rewardsEnabled) {
      log('RewardsController: Feature flag disabled, skipping silent auth');
      return;
    }
    log('RewardsController: handleAuthenticationTrigger', reason);

    try {
      const selectedAccount = this.messagingSystem.call(
        'AccountsController:getSelectedMultichainAccount',
      );
      await this.#performSilentAuth(selectedAccount);
    } catch (error) {
      // Silent failure - don't throw errors for background authentication
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (errorMessage && !errorMessage?.includes('Engine does not exist')) {
        log(
          'RewardsController: Silent authentication failed:',
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

  /**
   * Check if silent authentication should be skipped
   * @param account - The CAIP-10 account ID
   * @param address - The raw account address
   * @param isHardwareAccount - Whether the account is a hardware wallet
   * @returns boolean - True if silent auth should be skipped, false otherwise
   */
  #shouldSkipSilentAuth(
    account: CaipAccountId,
    address: string,
    isHardwareAccount: boolean,
  ): boolean {
    // Skip for hardware and Solana accounts
    if (isHardwareAccount || isSolanaAddress(address)) {
      return true;
    }

    const now = Date.now();
    const accountState = this.#getAccountState(account);
    if (
      accountState?.hasOptedIn &&
      now - accountState.lastCheckedAuth < AUTH_GRACE_PERIOD_MS
    ) {
      return true;
    }

    return false;
  }

  convertInternalAccountToCaipAccountId(
    account: InternalAccount,
  ): CaipAccountId | null {
    try {
      const [scope] = account.scopes;
      const { namespace, reference } = parseCaipChainId(scope);
      return toCaipAccountId(namespace, reference, account.address);
    } catch (error) {
      log(
        'RewardsController: Failed to convert address to CAIP-10 format:',
        error,
      );
      return null;
    }
  }

  /**
   * Perform silent authentication for the given address
   * @param internalAccount - The account address to authenticate
   */
  async #performSilentAuth(internalAccount?: InternalAccount): Promise<void> {
    if (!internalAccount) {
      this.update((state: RewardsControllerState) => {
        state.activeAccount = null;
      });
      return;
    }

    const account: CaipAccountId | null =
      this.convertInternalAccountToCaipAccountId(internalAccount);

    const shouldSkip = account
      ? this.#shouldSkipSilentAuth(
          account,
          internalAccount.address,
          isHardwareWallet(internalAccount),
        )
      : false;

    if (shouldSkip) {
      // This means that we'll have a record for this account
      let accountState = this.#getAccountState(account as CaipAccountId);
      if (accountState) {
        // Update last authenticated account
        this.update((state: RewardsControllerState) => {
          state.activeAccount = accountState;
        });
      } else {
        // Update accounts map && last authenticated account
        accountState = {
          account: account as CaipAccountId,
          hasOptedIn: false,
          subscriptionId: null,
          lastCheckedAuth: Date.now(),
          lastCheckedAuthError: false,
          perpsFeeDiscount: null, // Default value, will be updated when fetched
          lastPerpsDiscountRateFetched: null,
        };
        this.update((state: RewardsControllerState) => {
          state.accounts[account as CaipAccountId] =
            accountState as RewardsAccountState;
          state.activeAccount = accountState;
        });
      }
      return;
    }

    let subscription: SubscriptionDto | null = null;
    let authUnexpectedError = false;

    try {
      // Generate timestamp and sign the message
      const timestamp = Math.floor(Date.now() / 1000);

      let signature;
      try {
        signature = await this.#signRewardsMessage(internalAccount, timestamp);
      } catch (signError) {
        log('RewardsController: Failed to generate signature:', signError);

        // Check if the error is due to locked keyring
        if (
          signError &&
          typeof signError === 'object' &&
          'message' in signError
        ) {
          const errorMessage = (signError as Error).message;
          if (errorMessage.includes('controller is locked')) {
            log('RewardsController: Keyring is locked, skipping silent auth');
            return; // Exit silently when keyring is locked
          }
        }

        throw signError;
      }

      // Use data service through messenger
      log(
        'RewardsController: Performing silent auth for',
        internalAccount.address,
      );

      const loginResponse: LoginResponseDto = await this.messagingSystem.call(
        'RewardsDataService:login',
        {
          account: internalAccount.address,
          timestamp,
          signature,
        },
      );

      // Update state with successful authentication
      subscription = loginResponse.subscription;

      // Store the session token for this subscription
      if (this.#storeSubscriptionToken) {
        const { success: tokenStoreSuccess } =
          await this.#storeSubscriptionToken({
            subscriptionId: subscription.id,
            loginSessionId: loginResponse.sessionId,
          });
        if (!tokenStoreSuccess) {
          log('RewardsController: Failed to store session token', account);
          throw new Error('Failed to store session token');
        }
      }

      log('RewardsController: Silent auth successful');
    } catch (error: unknown) {
      // Handle 401 (not opted in) or other errors silently
      if (!(error instanceof Error && error.message.includes('401'))) {
        // Unknown error
        subscription = null;
        authUnexpectedError = true;
      }
    } finally {
      // Update state so that we remember this account is not opted in
      this.update((state: RewardsControllerState) => {
        if (!account) {
          return;
        }

        // Create or update account state with no subscription
        const accountState: RewardsAccountState = {
          account,
          hasOptedIn: authUnexpectedError ? undefined : Boolean(subscription),
          subscriptionId: subscription?.id ?? null,
          lastCheckedAuth: Date.now(),
          lastCheckedAuthError: authUnexpectedError,
          perpsFeeDiscount: null, // Default value, will be updated when fetched
          lastPerpsDiscountRateFetched: null,
        };

        state.accounts[account] = accountState;
        state.activeAccount = accountState;

        if (subscription) {
          state.subscriptions[subscription.id] = subscription;
        }
      });
    }
  }

  /**
   * Update perps fee discount for a given account
   * @param account - The account address in CAIP-10 format
   * @returns Promise<PerpsDiscountData | null> - The perps discount data or null on failure
   */
  async #getPerpsFeeDiscountData(
    account: CaipAccountId,
  ): Promise<PerpsDiscountData | null> {
    const accountState = this.#getAccountState(account);

    // Check if we have a cached discount and if threshold hasn't been reached
    if (
      accountState &&
      accountState.perpsFeeDiscount !== null &&
      accountState.lastPerpsDiscountRateFetched !== null &&
      Date.now() - accountState.lastPerpsDiscountRateFetched <
        PERPS_DISCOUNT_CACHE_THRESHOLD_MS
    ) {
      log(
        'RewardsController: Using cached perps discount data for',
        account,
        accountState.perpsFeeDiscount,
      );
      return {
        hasOptedIn: Boolean(accountState.hasOptedIn),
        discount: accountState.perpsFeeDiscount,
      };
    }

    try {
      log(
        'RewardsController: Fetching fresh perps discount data via API call for',
        account,
      );
      const perpsDiscountData = await this.messagingSystem.call(
        'RewardsDataService:getPerpsDiscount',
        { account },
      );

      this.update((state: RewardsControllerState) => {
        const { hasOptedIn, discount } = {
          hasOptedIn: perpsDiscountData.hasOptedIn,
          discount: perpsDiscountData.discount ?? 0,
        };
        // Create account state if it doesn't exist
        if (!state.accounts[account]) {
          state.accounts[account] = {
            account,
            hasOptedIn,
            subscriptionId: null,
            lastCheckedAuth: Date.now(),
            lastCheckedAuthError: false,
            perpsFeeDiscount: discount,
            lastPerpsDiscountRateFetched: Date.now(),
          };
        } else {
          // Update account state
          state.accounts[account].hasOptedIn = hasOptedIn;
          if (!hasOptedIn) {
            state.accounts[account].subscriptionId = null;
          }
          state.accounts[account].perpsFeeDiscount = discount;
          state.accounts[account].lastPerpsDiscountRateFetched = Date.now();
        }
      });
      return perpsDiscountData;
    } catch (error) {
      log(
        'RewardsController: Failed to update perps fee discount:',
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  }

  /**
   * Check if the given account (caip-10 format) has opted in to rewards
   * @param account - The account address in CAIP-10 format
   * @returns Promise<boolean> - True if the account has opted in, false otherwise
   */
  async getHasAccountOptedIn(account: CaipAccountId): Promise<boolean> {
    const rewardsEnabled = getRewardsFeatureFlag(this.messagingSystem);
    if (!rewardsEnabled) {
      return false;
    }
    const accountState = this.#getAccountState(account);
    if (accountState?.hasOptedIn) {
      return accountState.hasOptedIn;
    }

    // Right now we'll derive this from either cached map state or perps fee discount api call.
    const perpsDiscountData = await this.#getPerpsFeeDiscountData(account);
    return Boolean(perpsDiscountData?.hasOptedIn);
  }

  /**
   * Get perps fee discount for an account with caching and threshold logic
   * @param account - The account address in CAIP-10 format
   * @returns Promise<number> - The discount number value
   */
  async getPerpsDiscountForAccount(account: CaipAccountId): Promise<number> {
    const rewardsEnabled = getRewardsFeatureFlag(this.messagingSystem);
    if (!rewardsEnabled) {
      return 0;
    }
    const perpsDiscountData = await this.#getPerpsFeeDiscountData(account);
    return perpsDiscountData?.discount || 0;
  }

  /**
   * Get points events for a given season
   * @param params - The request parameters
   * @returns Promise<PaginatedPointsEventsDto> - The points events data
   */
  async getPointsEvents(
    params: GetPointsEventsDto,
  ): Promise<PaginatedPointsEventsDto> {
    const rewardsEnabled = getRewardsFeatureFlag(this.messagingSystem);
    if (!rewardsEnabled) {
      return { has_more: false, cursor: null, total_results: 0, results: [] };
    }

    try {
      const pointsEvents = await this.messagingSystem.call(
        'RewardsDataService:getPointsEvents',
        params,
      );
      return pointsEvents;
    } catch (error) {
      log(
        'RewardsController: Failed to get points events:',
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  /**
   * Estimate points for a given activity
   * @param request - The estimate points request containing activity type and context
   * @returns Promise<EstimatedPointsDto> - The estimated points and bonus information
   */
  async estimatePoints(
    request: EstimatePointsDto,
  ): Promise<EstimatedPointsDto> {
    const rewardsEnabled = getRewardsFeatureFlag(this.messagingSystem);
    if (!rewardsEnabled) {
      return { pointsEstimate: 0, bonusBips: 0 };
    }
    try {
      const estimatedPoints = await this.messagingSystem.call(
        'RewardsDataService:estimatePoints',
        request,
      );

      return estimatedPoints;
    } catch (error) {
      log(
        'RewardsController: Failed to estimate points:',
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  /**
   * Check if the rewards feature is enabled via feature flag
   * @returns boolean - True if rewards feature is enabled, false otherwise
   */
  isRewardsFeatureEnabled(): boolean {
    return getRewardsFeatureFlag(this.messagingSystem);
  }

  /**
   * Get season status with caching
   * @param subscriptionId - The subscription ID for authentication
   * @param seasonId - The ID of the season to get status for
   * @returns Promise<SeasonStatusState> - The season status data
   */
  async getSeasonStatus(
    subscriptionId: string,
    seasonId: string | 'current' = 'current',
  ): Promise<SeasonStatusState | null> {
    const rewardsEnabled = getRewardsFeatureFlag(this.messagingSystem);
    if (!rewardsEnabled) {
      return null;
    }

    // Check if we have cached season status and if threshold hasn't been reached
    const cachedSeasonStatus = this.#getSeasonStatus(subscriptionId, seasonId);
    if (
      cachedSeasonStatus?.lastFetched &&
      Date.now() - cachedSeasonStatus.lastFetched <
        SEASON_STATUS_CACHE_THRESHOLD_MS
    ) {
      log(
        'RewardsController: Using cached season status data for',
        subscriptionId,
        seasonId,
      );

      return cachedSeasonStatus;
    }

    try {
      log(
        'RewardsController: Fetching fresh season status data via API call for subscriptionId & seasonId',
        subscriptionId,
        seasonId,
      );
      const seasonStatus = await this.messagingSystem.call(
        'RewardsDataService:getSeasonStatus',
        seasonId,
        subscriptionId,
      );

      const seasonState = this.#convertSeasonToState(seasonStatus.season);
      const subscriptionSeasonStatus =
        this.#convertSeasonStatusToSubscriptionState(seasonStatus);

      const compositeKey = this.#createSeasonStatusCompositeKey(
        seasonId,
        subscriptionId,
      );

      this.update((state: RewardsControllerState) => {
        // Update seasons map with season data
        state.seasons[seasonId] = seasonState;

        // Update season status with composite key
        state.seasonStatuses[compositeKey] = subscriptionSeasonStatus;
      });

      return subscriptionSeasonStatus;
    } catch (error) {
      log(
        'RewardsController: Failed to get season status:',
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  /**
   * Get referral details with caching
   * @param subscriptionId - The subscription ID for authentication
   * @returns Promise<SubscriptionReferralDetailsDto> - The referral details data
   */
  async getReferralDetails(
    subscriptionId: string,
  ): Promise<SubscriptionReferralDetailsState | null> {
    const rewardsEnabled = getRewardsFeatureFlag(this.messagingSystem);
    if (!rewardsEnabled) {
      return null;
    }

    const cachedReferralDetails =
      this.state.subscriptionReferralDetails[subscriptionId];

    // Check if we have cached referral details and if threshold hasn't been reached
    if (
      cachedReferralDetails?.lastFetched &&
      Date.now() - cachedReferralDetails.lastFetched <
        REFERRAL_DETAILS_CACHE_THRESHOLD_MS
    ) {
      log(
        'RewardsController: Using cached referral details data for',
        subscriptionId,
      );
      return cachedReferralDetails;
    }

    try {
      log(
        'RewardsController: Fetching fresh referral details data via API call for',
        subscriptionId,
      );
      const referralDetails = await this.messagingSystem.call(
        'RewardsDataService:getReferralDetails',
        subscriptionId,
      );

      const subscriptionReferralDetailsState: SubscriptionReferralDetailsState =
        {
          referralCode: referralDetails.referralCode,
          totalReferees: referralDetails.totalReferees,
          lastFetched: Date.now(),
        };

      this.update((state: RewardsControllerState) => {
        // Update subscription referral details at root level
        state.subscriptionReferralDetails[subscriptionId] =
          subscriptionReferralDetailsState;
      });

      return subscriptionReferralDetailsState;
    } catch (error) {
      log(
        'RewardsController: Failed to get referral details:',
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  /**
   * Perform the complete opt-in process for rewards
   * @param account - The account to opt in
   * @param referralCode - Optional referral code
   */
  async optIn(account: InternalAccount, referralCode?: string): Promise<void> {
    const rewardsEnabled = getRewardsFeatureFlag(this.messagingSystem);
    if (!rewardsEnabled) {
      log('RewardsController: Rewards feature is disabled, skipping optin', {
        account: account.address,
      });
      return;
    }

    log('RewardsController: Starting optin process', {
      account: account.address,
    });

    const challengeResponse = await this.messagingSystem.call(
      'RewardsDataService:generateChallenge',
      {
        address: account.address,
      },
    );

    // Try different encoding approaches to handle potential character issues
    let hexMessage;
    try {
      // First try: direct toHex conversion
      hexMessage = toHex(challengeResponse.message);
    } catch (error) {
      // Fallback: use Buffer to convert to hex if toHex fails
      hexMessage = `0x${Buffer.from(challengeResponse.message, 'utf8').toString('hex')}`;
    }

    // Use KeyringController for silent signature
    const signature = await this.messagingSystem.call(
      'KeyringController:signPersonalMessage',
      {
        data: hexMessage,
        from: account.address,
      },
    );

    log('RewardsController: Submitting optin with signature...');
    const optinResponse = await this.messagingSystem.call(
      'RewardsDataService:optin',
      {
        challengeId: challengeResponse.id,
        signature,
        referralCode,
      },
    );

    log('RewardsController: Optin successful, updating controller state...');

    // Store the subscription token for authenticated requests
    if (
      optinResponse.subscription?.id &&
      optinResponse.sessionId &&
      this.#storeSubscriptionToken
    ) {
      const tokenResponse = await this.#storeSubscriptionToken({
        subscriptionId: optinResponse.subscription.id,
        loginSessionId: optinResponse.sessionId,
      });
      if (!tokenResponse.success) {
        log(
          'RewardsController: Failed to store subscription token:',
          tokenResponse?.error || 'Unknown error',
        );
      }
    }

    // Update state with opt-in response data
    // Update state with opt-in response data
    this.update((state) => {
      const caipAccount: CaipAccountId | null =
        this.convertInternalAccountToCaipAccountId(account);
      if (!caipAccount) {
        return;
      }
      state.activeAccount = {
        account: caipAccount,
        hasOptedIn: true,
        subscriptionId: optinResponse.subscription.id,
        lastCheckedAuth: Date.now(),
        lastCheckedAuthError: false,
        perpsFeeDiscount: null,
        lastPerpsDiscountRateFetched: null,
      };
      state.accounts[caipAccount] = state.activeAccount;
      state.subscriptions[optinResponse.subscription.id] =
        optinResponse.subscription;
    });
  }

  /**
   * Logout user from rewards and clear associated data
   */
  async logout(): Promise<void> {
    const rewardsEnabled = getRewardsFeatureFlag(this.messagingSystem);
    if (!rewardsEnabled) {
      log('RewardsController: Rewards feature is disabled, skipping logout');
      return;
    }

    if (!this.state.activeAccount?.subscriptionId) {
      log('RewardsController: No authenticated account found');
      return;
    }

    const { subscriptionId } = this.state.activeAccount;
    try {
      // Call the data service logout if subscriptionId is provided
      await this.messagingSystem.call(
        'RewardsDataService:logout',
        subscriptionId,
      );
      log('RewardsController: Successfully logged out from data service');

      // Remove the session token from storage
      if (this.#removeSubscriptionToken) {
        const tokenRemovalResult =
          await this.#removeSubscriptionToken(subscriptionId);
        if (!tokenRemovalResult.success) {
          log(
            'RewardsController: Warning - failed to remove session token:',
            tokenRemovalResult?.error || 'Unknown error',
          );
        } else {
          log('RewardsController: Successfully removed session token');
        }
      } else {
        log('RewardsController: No removeSubscriptionToken function defined');
      }

      // Update controller state to reflect logout
      this.update((state) => {
        // Clear last authenticated account if it matches this subscription
        if (state.activeAccount?.subscriptionId === subscriptionId) {
          delete state.accounts[state.activeAccount.account];
          state.activeAccount = null;
          log('RewardsController: Cleared last authenticated account');
        }
      });

      log('RewardsController: Logout completed successfully');
    } catch (error) {
      log(
        'RewardsController: Logout failed to complete',
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  /**
   * Get geo rewards metadata including location and support status
   * @returns Promise<GeoRewardsMetadata> - The geo rewards metadata
   */
  async getGeoRewardsMetadata(): Promise<GeoRewardsMetadata> {
    const rewardsEnabled = getRewardsFeatureFlag(this.messagingSystem);
    if (!rewardsEnabled) {
      return {
        geoLocation: 'UNKNOWN',
        optinAllowedForGeo: false,
      };
    }

    if (this.#geoLocation) {
      log('RewardsController: Using cached geo location', {
        location: this.#geoLocation,
      });

      return this.#geoLocation;
    }

    try {
      log('RewardsController: Fetching geo location for rewards metadata');

      // Get geo location from data service
      const geoLocation = await this.messagingSystem.call(
        'RewardsDataService:fetchGeoLocation',
      );

      // Check if the location is supported (not in blocked regions)
      const optinAllowedForGeo = !DEFAULT_BLOCKED_REGIONS.some(
        (blockedRegion) => geoLocation.startsWith(blockedRegion),
      );

      const result: GeoRewardsMetadata = {
        geoLocation,
        optinAllowedForGeo,
      };

      log('RewardsController: Geo rewards metadata retrieved', result);
      this.#geoLocation = result;
      return result;
    } catch (error) {
      log(
        'RewardsController: Failed to get geo rewards metadata:',
        error instanceof Error ? error.message : String(error),
      );

      // Return fallback metadata on error
      return {
        geoLocation: 'UNKNOWN',
        optinAllowedForGeo: true,
      };
    }
  }

  /**
   * Validate a referral code
   * @param code - The referral code to validate
   * @returns Promise<boolean> - True if the code is valid, false otherwise
   */
  async validateReferralCode(code: string): Promise<boolean> {
    const rewardsEnabled = getRewardsFeatureFlag(this.messagingSystem);
    if (!rewardsEnabled || !code.trim() || code.length !== 6) {
      return false;
    }

    try {
      const response = await this.messagingSystem.call(
        'RewardsDataService:validateReferralCode',
        code,
      );
      return response.valid;
    } catch (error) {
      log(
        'RewardsController: Failed to validate referral code:',
        error instanceof Error ? error.message : String(error),
      );
      return false;
    }
  }
}
