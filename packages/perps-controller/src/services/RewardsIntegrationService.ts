import {
  BASIS_POINTS_DIVISOR,
  BUILDER_FEE_CONFIG,
} from '../constants/hyperLiquidConfig.js';
import {
  PERPS_CONSTANTS,
  SUBSCRIPTION_BENEFITS_CACHE,
} from '../constants/perpsConfig.js';
import type {
  PerpsFeeResolution,
  PerpsFeeSource,
  PerpsPlatformDependencies,
  PerpsSubscriptionBenefits,
  PerpsSubscriptionFeeWaiverStatus,
} from '../types/index.js';
import type { PerpsControllerMessengerBase } from '../types/messenger.js';
import { getSelectedEvmAccountFromMessenger } from '../utils/accountUtils.js';
import { ensureError } from '../utils/errorUtils.js';
import { formatAccountToCaipAccountId } from '../utils/rewardsUtils.js';

/**
 * Default MetaMask builder fee, in basis points.
 * This is the fee every user pays when no cheaper source applies.
 */
const DEFAULT_FEE_BIPS =
  BUILDER_FEE_CONFIG.MaxFeeDecimal * BASIS_POINTS_DIVISOR;

/**
 * Cached subscription benefits plus the time they were read.
 */
type BenefitsSnapshot = {
  benefits: PerpsSubscriptionBenefits | null;
  fetchedAt: number;
};

/**
 * RewardsIntegrationService
 *
 * Owns the unified perps fee resolver: it considers every fee source and
 * returns the lowest fee, expressed as the discount bips providers consume.
 *
 * Sources, all in fee basis points (lowest wins):
 * - `default` — {@link BUILDER_FEE_CONFIG}, the fee with no reductions.
 * - `rewards` — VIP and season, collapsed into one discount by
 *   `RewardsController` (`rewards.getPerpsDiscountForAccount`), so this service
 *   does not re-derive the VIP/season split.
 * - `subscription` — `0` bips, but only when the eligibility gate passes on a
 *   cached read of the profile's benefits.
 *
 * On a tie the cheaper-to-explain source wins, in the order
 * `subscription` > `rewards` > `default`.
 *
 * The benefits cache is stale-while-revalidate: reads are synchronous against
 * the cached snapshot and a refresh is kicked off opportunistically, so the
 * order-signing path never awaits a benefits request. Nothing is reserved or
 * committed client-side, so backend exhaustion needs no release logic — the
 * next refresh simply stops passing the gate.
 *
 * Instance-based service with constructor injection of platform dependencies.
 */
export class RewardsIntegrationService {
  readonly #deps: PerpsPlatformDependencies;

  readonly #messenger: PerpsControllerMessengerBase;

  /** Last successful benefits read, or undefined before the first one. */
  #benefitsSnapshot: BenefitsSnapshot | undefined;

  /** In-flight background refresh, deduped so only one runs at a time. */
  #benefitsRefresh: Promise<void> | undefined;

  /**
   * Create a new RewardsIntegrationService instance
   *
   * @param deps - Platform dependencies for logging, metrics, etc.
   * @param messenger - Controller messenger for cross-controller communication.
   */
  constructor(
    deps: PerpsPlatformDependencies,
    messenger: PerpsControllerMessengerBase,
  ) {
    this.#deps = deps;
    this.#messenger = messenger;
  }

  /**
   * Get chain ID for a network client via DI network controller
   *
   * @param networkClientId - The network client identifier to look up.
   * @returns The chain ID string, or undefined if the network client is not found.
   */
  #getChainIdForNetwork(networkClientId: string): string | undefined {
    try {
      const networkClient = this.#messenger.call(
        'NetworkController:getNetworkClientById',
        networkClientId,
      );
      return networkClient.configuration.chainId;
    } catch {
      // Network client may not exist
      return undefined;
    }
  }

  /**
   * Calculate user fee discount from the unified fee resolver.
   * Returns discount in basis points (e.g., 6500 = 65% discount)
   *
   * @returns The fee discount in basis points, or undefined if no source resolved.
   */
  async calculateUserFeeDiscount(): Promise<number | undefined> {
    const resolution = await this.resolveFee();
    return resolution.discountBips;
  }

  /**
   * Resolve the MetaMask builder fee across every source and return the lowest.
   *
   * Never throws and never awaits the subscription benefits read: a failing or
   * unresolved source simply drops out of the comparison, so the worst case is
   * the default fee rather than an error or an over-granted waiver.
   *
   * @returns The winning fee, its source, and the subscription gate outcome.
   */
  async resolveFee(): Promise<PerpsFeeResolution> {
    // Cached, synchronous, non-blocking — safe on the order-signing path.
    const subscription = this.getSubscriptionFeeWaiverStatus();
    const rewardsDiscountBips = await this.#calculateRewardsDiscount();

    let feeBips = DEFAULT_FEE_BIPS;
    let source: PerpsFeeSource = 'default';

    if (rewardsDiscountBips !== undefined) {
      const rewardsFeeBips =
        DEFAULT_FEE_BIPS * (1 - rewardsDiscountBips / BASIS_POINTS_DIVISOR);
      // `<=` so an equal rewards fee still reports the rewards source, keeping
      // a resolved 0% discount distinguishable from an unresolved one.
      if (rewardsFeeBips <= feeBips) {
        feeBips = rewardsFeeBips;
        source = 'rewards';
      }
    }

    // Nothing can undercut a waived fee, so the gate passing always wins.
    if (subscription.eligible) {
      feeBips = 0;
      source = 'subscription';
    }

    const discountBips =
      source === 'default'
        ? undefined
        : Math.round((1 - feeBips / DEFAULT_FEE_BIPS) * BASIS_POINTS_DIVISOR);

    this.#deps.debugLogger.log('RewardsIntegrationService: Fee resolved', {
      source,
      feeBips,
      discountBips,
      defaultFeeBips: DEFAULT_FEE_BIPS,
      rewardsDiscountBips,
      subscriptionEligible: subscription.eligible,
      subscriptionReason: subscription.reason,
    });

    return { feeBips, discountBips, source, subscription };
  }

  /**
   * Read the subscription fee-waiver gate from the cached benefits snapshot.
   *
   * Synchronous and side-effect free apart from kicking off an opportunistic
   * background refresh when the snapshot is missing or past its freshness
   * window; the returned value always comes from what is already cached.
   *
   * @returns Whether the waiver applies, why, and the remaining notional.
   */
  getSubscriptionFeeWaiverStatus(): PerpsSubscriptionFeeWaiverStatus {
    if (!this.#deps.subscription) {
      return { eligible: false, reason: 'no-source' };
    }

    const snapshot = this.#benefitsSnapshot;
    const age = snapshot ? Date.now() - snapshot.fetchedAt : Infinity;

    // Stale-while-revalidate: serve what we have, refresh in the background.
    if (age >= SUBSCRIPTION_BENEFITS_CACHE.FreshMs) {
      this.refreshSubscriptionBenefits().catch(() => undefined);
    }

    if (!snapshot) {
      return { eligible: false, reason: 'not-hydrated' };
    }

    if (age > SUBSCRIPTION_BENEFITS_CACHE.MaxStaleMs) {
      // Past the ceiling we cannot tell whether the cap is still available, so
      // fall back to the next-lowest source rather than over-granting.
      return { eligible: false, reason: 'stale' };
    }

    return evaluateFeeWaiverGate(snapshot.benefits);
  }

  /**
   * Refresh the cached subscription benefits snapshot.
   *
   * Deduped: concurrent callers share the in-flight request. Rejections are
   * logged and swallowed, leaving the previous snapshot in place. Callers on
   * the order-signing path must not await this.
   *
   * @returns A promise that settles when the refresh completes.
   */
  async refreshSubscriptionBenefits(): Promise<void> {
    const source = this.#deps.subscription;
    if (!source) {
      return;
    }

    if (this.#benefitsRefresh) {
      await this.#benefitsRefresh;
      return;
    }

    const refresh = this.#readSubscriptionBenefits(source);
    this.#benefitsRefresh = refresh;
    // `finally` always defers, so this never clears the handle we just set.
    refresh
      .finally(() => {
        if (this.#benefitsRefresh === refresh) {
          this.#benefitsRefresh = undefined;
        }
      })
      .catch(() => undefined);

    await refresh;
  }

  /**
   * Perform one benefits read and store it, keeping the previous snapshot on
   * error. Never rejects, so background callers cannot produce an unhandled
   * rejection.
   *
   * @param source - The injected subscription benefits source.
   */
  async #readSubscriptionBenefits(
    source: NonNullable<PerpsPlatformDependencies['subscription']>,
  ): Promise<void> {
    try {
      const benefits = await source.getPerpsBenefits();
      this.#benefitsSnapshot = { benefits, fetchedAt: Date.now() };

      this.#deps.debugLogger.log(
        'RewardsIntegrationService: Subscription benefits refreshed',
        {
          status: benefits?.status,
          entitled: benefits?.perpsFeeWaiver?.entitled,
          usage: benefits?.perpsFeeWaiver?.usage,
          exhausted: benefits?.perpsFeeWaiver?.exhausted,
        },
      );
    } catch (error) {
      // Keep the previous snapshot: an unreachable benefits endpoint must not
      // erase a valid cache, and it must never grant the waiver either.
      this.#deps.logger.error(
        ensureError(
          error,
          'RewardsIntegrationService.refreshSubscriptionBenefits',
        ),
        {
          tags: { feature: PERPS_CONSTANTS.FeatureName },
          context: {
            name: 'RewardsIntegrationService.refreshSubscriptionBenefits',
            data: {},
          },
        },
      );
    }
  }

  /**
   * Resolve the rewards (VIP + season) discount for the selected account.
   *
   * @returns The discount in basis points, or undefined when unavailable.
   */
  async #calculateRewardsDiscount(): Promise<number | undefined> {
    try {
      const evmAccount = getSelectedEvmAccountFromMessenger(this.#messenger);

      if (!evmAccount) {
        this.#deps.debugLogger.log(
          'RewardsIntegrationService: No EVM account found for fee discount',
        );
        return undefined;
      }

      // Get the chain ID via DI network controller
      const networkState = this.#messenger.call('NetworkController:getState');
      const { selectedNetworkClientId } = networkState;
      const chainId = this.#getChainIdForNetwork(selectedNetworkClientId);

      if (!chainId) {
        this.#deps.logger.error(
          new Error('Chain ID not found for fee discount calculation'),
          {
            tags: { feature: PERPS_CONSTANTS.FeatureName },
            context: {
              name: 'RewardsIntegrationService.calculateUserFeeDiscount',
              data: {
                selectedNetworkClientId,
              },
            },
          },
        );
        return undefined;
      }

      // Use pure utility function for CAIP formatting (pass logger for error reporting)
      const caipAccountId = formatAccountToCaipAccountId(
        evmAccount.address,
        chainId,
        this.#deps.logger,
      );

      if (!caipAccountId) {
        this.#deps.logger.error(
          new Error('Failed to format CAIP account ID for fee discount'),
          {
            tags: { feature: PERPS_CONSTANTS.FeatureName },
            context: {
              name: 'RewardsIntegrationService.calculateUserFeeDiscount',
              data: {
                address: evmAccount.address,
                chainId,
                selectedNetworkClientId,
              },
            },
          },
        );
        return undefined;
      }

      // Use rewards via DI (no RewardsController in Core yet).
      // The rewards controller needs the perps MetaMask builder base fee in
      // bips to convert an absolute VIP fee into a discount fraction.
      const discountBips = await this.#deps.rewards.getPerpsDiscountForAccount(
        caipAccountId,
        DEFAULT_FEE_BIPS,
      );

      // null = subscription state not hydrated yet; surface as undefined so
      // callers don't treat it as a definitive "no discount" answer.
      if (discountBips === null) {
        this.#deps.debugLogger.log(
          'RewardsIntegrationService: Fee discount unavailable (subscription state not hydrated)',
          { address: evmAccount.address, caipAccountId },
        );
        return undefined;
      }

      this.#deps.debugLogger.log(
        'RewardsIntegrationService: Fee discount calculated',
        {
          address: evmAccount.address,
          caipAccountId,
          discountBips,
          discountPercentage: discountBips / 100,
        },
      );

      return discountBips;
    } catch (error) {
      this.#deps.logger.error(
        ensureError(
          error,
          'RewardsIntegrationService.calculateUserFeeDiscount',
        ),
        {
          tags: { feature: PERPS_CONSTANTS.FeatureName },
          context: {
            name: 'RewardsIntegrationService.calculateUserFeeDiscount',
            data: {},
          },
        },
      );
      return undefined;
    }
  }
}

/**
 * Evaluate the perps fee-waiver eligibility gate against a benefits snapshot.
 *
 * The gate is `status=active` AND `perpsFeeWaiver` entitled AND
 * `usage=available`. A backend `exhausted` flag (or an `exhausted` usage) fails
 * the gate on its own; anything short of an affirmative `available` is treated
 * as not entitled, because the waiver is only granted on positive evidence.
 *
 * @param benefits - The cached benefits payload, or null when there is none.
 * @returns The gate outcome plus the remaining notional when reported.
 */
function evaluateFeeWaiverGate(
  benefits: PerpsSubscriptionBenefits | null,
): PerpsSubscriptionFeeWaiverStatus {
  const waiver = benefits?.perpsFeeWaiver;
  const { remainingNotionalUsd } = waiver ?? {};

  if (benefits?.status !== 'active') {
    return { eligible: false, reason: 'inactive', remainingNotionalUsd };
  }

  if (waiver?.entitled !== true) {
    return { eligible: false, reason: 'not-entitled', remainingNotionalUsd };
  }

  if (waiver.exhausted === true || waiver.usage === 'exhausted') {
    return { eligible: false, reason: 'exhausted', remainingNotionalUsd };
  }

  if (waiver.usage !== 'available') {
    return { eligible: false, reason: 'not-entitled', remainingNotionalUsd };
  }

  return { eligible: true, reason: 'eligible', remainingNotionalUsd };
}
