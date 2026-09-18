import type { SubscriptionBenefitsResponse } from '@metamask/subscription-controller';

import {
  BASIS_POINTS_DIVISOR,
  BUILDER_FEE_CONFIG,
} from '../constants/hyperLiquidConfig.js';
import {
  PERPS_CONSTANTS,
  SUBSCRIPTION_BENEFITS_CACHE,
  SUBSCRIPTION_FEE_WAIVER_FLAG,
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
import { resolveSubscriptionWaiverRate } from '../utils/subscriptionFeeWaiver.js';

/**
 * Default MetaMask builder fee, in basis points.
 * This is the fee every user pays when no cheaper source applies.
 */
const DEFAULT_FEE_BIPS =
  BUILDER_FEE_CONFIG.MaxFeeDecimal * BASIS_POINTS_DIVISOR;

/** `SubscriptionController` reports allowances in micro-USD. */
const MICRO_USD_PER_USD = 1_000_000;

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
 * The benefits cache is stale-while-revalidate: fee resolution is a pure read
 * of the cached snapshot, while preview and lifecycle callers refresh it
 * explicitly. Nothing is reserved or committed client-side, so backend
 * exhaustion needs no release logic — the next refresh simply stops passing
 * the gate.
 *
 * Instance-based service with constructor injection of platform dependencies.
 */
export class RewardsIntegrationService {
  readonly #deps: PerpsPlatformDependencies;

  readonly #messenger: PerpsControllerMessengerBase;

  /** Last successful benefits read, or undefined before the first one. */
  #benefitsSnapshot: BenefitsSnapshot | undefined;

  /**
   * When the last benefits read finished, successful or not.
   *
   * Separate from `#benefitsSnapshot.fetchedAt`, which only advances on
   * success: a failing read must still throttle the next preview refresh,
   * otherwise an outage turns every fee preview into a new request.
   */
  #lastAttemptAt: number | undefined;

  /** In-flight refresh, deduped so only one runs at a time. */
  #benefitsRefresh: Promise<void> | undefined;

  /**
   * Identity generation for the cached benefits.
   *
   * Bumped by {@link invalidateSubscriptionBenefits}; a read that resolves
   * against a superseded epoch is discarded rather than written back, so a
   * refresh issued for the previous profile cannot repopulate the cache after
   * a sign-out or profile switch.
   */
  #benefitsEpoch = 0;

  /**
   * CAIP-10 addresses already registered with the subscription profile this
   * session, so preview does not re-send the same registration on every
   * keystroke. Cleared on account switch and on cache invalidation.
   */
  readonly #registeredTradingAddresses = new Set<string>();

  /**
   * Whether `SubscriptionController:getBenefits` has ever answered on this
   * messenger. Action registration can be delegated, in which case it does not
   * appear in `getRegisteredActionTypes`, so an answered call is the only
   * reliable proof that the messenger route is available.
   */
  #messengerBenefitsAnswered = false;

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
   * @param orderNotionalUsd - Order notional (USD), when the caller knows it.
   * @returns The fee discount in basis points, or undefined if no source resolved.
   */
  async calculateUserFeeDiscount(
    orderNotionalUsd?: number,
  ): Promise<number | undefined> {
    const resolution = await this.resolveFee(orderNotionalUsd);
    return resolution.discountBips;
  }

  /**
   * Resolve the MetaMask builder fee across every source and return the lowest.
   *
   * Never throws and never starts a subscription benefits read: a failing or
   * unresolved cached source simply drops out of the comparison, so the worst
   * case is the default fee rather than an error or an over-granted waiver.
   *
   * The subscription source contributes an effective rate rather than a flat
   * zero (ADR 0064): the allowance may cover only part of the order, and the
   * blend that results has to be able to lose to a deeper VIP or season
   * discount. Passing the order notional is what makes that blend possible.
   *
   * Without a notional the outcome depends on whether the backend bounded the
   * allowance. An unbounded allowance still resolves to the full waiver — there
   * is no cap to over-consume. A *bounded* one is withheld entirely rather than
   * quoted as a full waiver, because charging nothing on an order of unknown
   * size would silently spend the cap; such a caller gets the next-lowest
   * source instead.
   *
   * @param orderNotionalUsd - Order notional (USD), when the caller knows it.
   * @returns The winning fee, its source, and the subscription gate outcome.
   */
  async resolveFee(orderNotionalUsd?: number): Promise<PerpsFeeResolution> {
    const rewardsDiscountBips = await this.#calculateRewardsDiscount();
    // Pure cache read: subscription benefits must never start a network request
    // while an order is being prepared for signing.
    const subscription = this.getSubscriptionFeeWaiverStatus();

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

    const waiver = resolveSubscriptionWaiverRate({
      status: subscription,
      maxFeeBips: DEFAULT_FEE_BIPS,
      orderNotionalUsd,
    });

    let subscriptionWaiverKind: PerpsFeeResolution['subscriptionWaiverKind'];
    let subscriptionCoveredNotionalUsd: number | undefined;

    // The waiver competes like any other source. A full waiver still wins on
    // `<=`, but a partial blend only wins when it is genuinely cheaper than the
    // rewards discount — the ADR's requirement that subscription be able to
    // lose.
    if (waiver.applies && waiver.feeBips <= feeBips) {
      feeBips = waiver.feeBips;
      source = 'subscription';
      subscriptionWaiverKind = waiver.kind === 'partial' ? 'partial' : 'full';
      subscriptionCoveredNotionalUsd = waiver.coveredNotionalUsd;
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
      orderNotionalUsd,
      subscriptionEligible: subscription.eligible,
      subscriptionReason: subscription.reason,
      subscriptionWaiverKind,
      subscriptionCoveredNotionalUsd,
    });

    return {
      feeBips,
      discountBips,
      source,
      subscription,
      subscriptionWaiverKind,
      subscriptionCoveredNotionalUsd,
    };
  }

  /**
   * Read the subscription fee-waiver gate from the cached benefits snapshot.
   *
   * Synchronous and side-effect free. The returned value always comes from
   * what is already cached; preview and lifecycle callers own hydration.
   *
   * @returns Whether the waiver applies, why, and the remaining notional.
   */
  getSubscriptionFeeWaiverStatus(): PerpsSubscriptionFeeWaiverStatus {
    if (!this.#hasSubscriptionSource()) {
      return { eligible: false, reason: 'no-source' };
    }

    // ADR 0064 Milestone 8: the subscription source has to be killable on its
    // own. Reported as `no-source` so a disabled flag is indistinguishable from
    // an unwired client downstream — both mean "subscription contributes
    // nothing", and neither touches rewards or the default fee.
    if (!this.#isSubscriptionFeeWaiverEnabled()) {
      return { eligible: false, reason: 'no-source' };
    }

    const now = Date.now();
    const snapshot = this.#benefitsSnapshot;
    const age = snapshot ? now - snapshot.fetchedAt : Infinity;
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
   * Whether this client has any way to read subscription benefits.
   *
   * Either wiring counts: a registered `SubscriptionController:getBenefits`
   * action (the ADR 0064 target) or the legacy injected `subscription` callback.
   * Requiring the injected one would make the messenger path unreachable on
   * exactly the configuration it was added for, so the messenger is probed by
   * asking whether an action handler exists rather than by calling it — this
   * runs on the synchronous status read and must not start work.
   *
   * @returns True when benefits can be read by some route.
   */
  #hasSubscriptionSource(): boolean {
    if (this.#deps.subscription || this.#messengerBenefitsAnswered) {
      return true;
    }

    try {
      // `getRegisteredActionTypes` reports this messenger's own registrations.
      // A delegated action does not appear there, which is why it is only a
      // positive signal — `refreshSubscriptionBenefits` still attempts the call
      // regardless, and an answer sets `#messengerBenefitsAnswered` above.
      return this.#messenger
        .getRegisteredActionTypes()
        .includes('SubscriptionController:getBenefits');
    } catch {
      return false;
    }
  }

  /**
   * Whether the subscription fee-waiver source is enabled remotely.
   *
   * Fails open: an absent flag, a malformed value, or an unreachable flag
   * controller all read as enabled, because silently dropping a benefit the
   * user pays for is worse than serving it one release too long. The kill
   * switch is an explicit `false`.
   *
   * @returns True unless the remote flag explicitly disables the source.
   */
  #isSubscriptionFeeWaiverEnabled(): boolean {
    try {
      const { remoteFeatureFlags } = this.#messenger.call(
        'RemoteFeatureFlagController:getState',
      );
      const flag = remoteFeatureFlags?.[SUBSCRIPTION_FEE_WAIVER_FLAG];
      return flag !== false;
    } catch {
      // No flag controller registered, or the read threw: keep the source.
      return true;
    }
  }

  /**
   * Refresh the cached subscription benefits snapshot.
   *
   * Deduped: concurrent callers share the in-flight request. Rejections are
   * logged and swallowed, leaving the previous snapshot in place. Preview and
   * lifecycle callers invoke this outside order submission.
   *
   * @returns A promise that settles when the refresh completes.
   */
  async refreshSubscriptionBenefits(): Promise<void> {
    // Deliberately not gated on `#hasSubscriptionSource`: a delegated action is
    // invisible to `getRegisteredActionTypes`, so the first call is what proves
    // it is reachable. A client with no source at all reads `null` here, which
    // costs one no-op call per freshness window and leaves the gate closed.

    if (this.#benefitsRefresh) {
      await this.#benefitsRefresh;
      return;
    }

    const now = Date.now();
    const snapshotAge = this.#benefitsSnapshot
      ? now - this.#benefitsSnapshot.fetchedAt
      : Infinity;
    const sinceAttempt =
      this.#lastAttemptAt === undefined ? Infinity : now - this.#lastAttemptAt;
    if (
      snapshotAge < SUBSCRIPTION_BENEFITS_CACHE.FreshMs ||
      sinceAttempt < SUBSCRIPTION_BENEFITS_CACHE.FreshMs
    ) {
      return;
    }

    const refresh = this.#readSubscriptionBenefits();
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
   * Drop the cached benefits snapshot.
   *
   * Call this when the identity behind the benefits changes — sign-out, or a
   * profile switch — since the snapshot carries no profile identity of its own
   * and would otherwise keep answering for the previous profile until the next
   * successful refresh. The next status read reports `not-hydrated`, so the
   * waiver is withheld until a preview or lifecycle caller hydrates it.
   */
  invalidateSubscriptionBenefits(): void {
    this.#benefitsSnapshot = undefined;
    this.#lastAttemptAt = undefined;
    // Fence any in-flight read: it was issued for the previous identity, so its
    // result must not repopulate the cache after this point.
    this.#benefitsEpoch += 1;
    // Drop the dedupe handle too. The fenced read can only be discarded, so
    // leaving it in place would make the next refresh await it instead of
    // fetching for the new identity. Its `finally` guard compares against the
    // current handle, so it will not clear whatever replaces it here.
    this.#benefitsRefresh = undefined;
    // The identity behind the registration changed too, so the new one has to
    // announce itself rather than inherit the previous profile's registration.
    this.#registeredTradingAddresses.clear();

    this.#deps.debugLogger.log(
      'RewardsIntegrationService: Subscription benefits cache invalidated',
    );
  }

  /**
   * Perform one benefits read and store it, keeping the previous snapshot on
   * error. Never rejects, so callers cannot produce an unhandled rejection.
   */
  async #readSubscriptionBenefits(): Promise<void> {
    const epoch = this.#benefitsEpoch;

    try {
      const benefits = await this.#getPerpsBenefits();

      if (epoch !== this.#benefitsEpoch) {
        // Invalidated while this read was in flight: it belongs to a previous
        // identity, so discarding it is the only safe outcome.
        this.#deps.debugLogger.log(
          'RewardsIntegrationService: Discarding benefits read from a previous identity',
        );
        return;
      }

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
    } finally {
      // Recorded on failure too — this is what throttles the retry loop. Not
      // recorded for a fenced read: that attempt belongs to a previous
      // identity, and letting it throttle would delay the new identity's first
      // fetch by a whole freshness window.
      if (epoch === this.#benefitsEpoch) {
        this.#lastAttemptAt = Date.now();
      }
    }
  }

  /**
   * Read subscription benefits, preferring the messenger over the DI callback.
   *
   * ADR 0064 moves hydration onto `SubscriptionController`. The messenger is
   * tried first and the injected `subscription` dependency is only a fallback,
   * so a client that ships `SubscriptionController` without the legacy callback
   * hydrates normally — that configuration is the ADR's target, not an edge
   * case. A client with neither gets `null`, which reads as "no subscription".
   *
   * @returns The benefits payload, or null when there is none to report.
   */
  async #getPerpsBenefits(): Promise<PerpsSubscriptionBenefits | null> {
    let pending: Promise<PerpsSubscriptionBenefits | null> | undefined;
    try {
      // Called without awaiting so the fallback stays synchronous when no
      // handler is registered: the DI read must start in the same tick, or a
      // caller that inspects the in-flight state sees an idle service.
      const result = this.#messenger.call('SubscriptionController:getBenefits');
      // `undefined` means nothing handled the action, which is the fallback
      // case rather than an answer.
      if (result !== undefined) {
        this.#messengerBenefitsAnswered = true;
        pending = Promise.resolve(result).then(adaptSubscriptionBenefits);
      }
    } catch (error) {
      // A handler that has answered before exists, so a synchronous throw is a
      // real failure rather than an unregistered action. Treating it as the
      // latter would fall through to `null` and erase a valid cached snapshot,
      // exactly as an asynchronous rejection would.
      if (isNotSubscribedRejection(error)) {
        // Definitive "not entitled", even thrown synchronously.
        return null;
      }
      // An unregistered action throws a recognisable "no handler" error; any
      // other synchronous throw came from a handler that exists and failed, so
      // it must not be mistaken for an absent action and cached as `null` —
      // including on the very first call, before one has ever answered.
      if (!isUnregisteredActionError(error) && !this.#deps.subscription) {
        throw error;
      }
      // Otherwise: unregistered action, or a throw with a DI source to fall
      // back to.
    }

    const fallback = this.#deps.subscription;

    if (pending) {
      try {
        return await pending;
      } catch (error) {
        if (isNotSubscribedRejection(error)) {
          // A definitive answer, not a failed read: the profile is not
          // entitled. Returning `null` replaces the cached snapshot, which is
          // the point — preserving it would keep granting the waiver for the
          // rest of the staleness window after entitlement ended.
          return null;
        }
        if (!fallback) {
          // Nothing else can answer, so this rejection is the whole result.
          // Returning `null` here would be stored as a successful "no
          // subscription" snapshot and silently erase a valid cached one; let
          // it reach the refresh handler, which keeps the previous snapshot.
          throw error;
        }
        // A registered handler that rejects still falls back to the injected
        // source rather than erasing the cached snapshot.
      }
    }

    if (!fallback) {
      // No handler answered and no injected source: genuinely nothing to
      // report, which is a real `null` rather than a swallowed failure.
      return null;
    }

    return await fallback.getPerpsBenefits();
  }

  /**
   * Register the current HyperLiquid trading address with the subscription
   * profile, so a later fill decoded off the HL fan-out can be attributed.
   *
   * ADR 0064 calls for this at preview time and again whenever the selected
   * account changes. Registration is idempotent backend-side and deliberately
   * never throws: it is observability plumbing, and a failure here must not
   * block a fee preview.
   *
   * `SubscriptionController` exposes no address-registration action today, so
   * this runs entirely through the injected `subscription` dependency when a
   * client supplies one. Wiring it to a messenger action is left until that
   * action exists rather than calling a name nothing answers.
   *
   * **A messenger-only client therefore registers nothing.** Benefits hydration
   * works over `SubscriptionController:getBenefits`, but a client that adopts
   * only the messenger and injects no `registerTradingAddress` hook gets no
   * address registration at all, and its fills cannot be attributed to a
   * profile. That is a wiring gap rather than a failure, so it is logged rather
   * than raised; supplying the hook — or a registration action, once one exists
   * — is what closes it.
   *
   * @param address - The EVM trading address to register.
   * @returns A promise that resolves once the attempt settles.
   */
  async registerTradingAddress(address: string): Promise<void> {
    const source = this.#deps.subscription;
    if (!source?.registerTradingAddress) {
      // Visible rather than silent: a client wired only to the messenger has no
      // way to register, and a missing registration is otherwise indetectable
      // until fills arrive unattributed.
      this.#deps.debugLogger.log(
        'RewardsIntegrationService: No trading-address registration hook wired; fills will be unattributed',
        { address },
      );
      return;
    }

    try {
      const networkState = this.#messenger.call('NetworkController:getState');
      const chainId = this.#getChainIdForNetwork(
        networkState.selectedNetworkClientId,
      );

      if (!chainId) {
        return;
      }

      const caipAccountId = formatAccountToCaipAccountId(
        address,
        chainId,
        this.#deps.logger,
      );

      if (!caipAccountId) {
        return;
      }

      // Skip the round trip when this address was already registered for this
      // session: preview runs on every keystroke in the order form.
      if (this.#registeredTradingAddresses.has(caipAccountId)) {
        return;
      }

      await source.registerTradingAddress(caipAccountId);
      this.#registeredTradingAddresses.add(caipAccountId);

      this.#deps.debugLogger.log(
        'RewardsIntegrationService: Trading address registered',
        { caipAccountId },
      );
    } catch (error) {
      // An offline client or a backend refusal both land here. Neither is a
      // reason to fail a fee preview.
      this.#deps.debugLogger.log(
        'RewardsIntegrationService: Trading address registration skipped',
        {
          address,
          error: ensureError(
            error,
            'RewardsIntegrationService.registerTradingAddress',
          ).message,
        },
      );
    }
  }

  /**
   * Forget which trading addresses were registered this session.
   *
   * Called when the selected account changes, so the next preview re-sends the
   * registration for the new address rather than assuming the previous one
   * still stands.
   */
  resetRegisteredTradingAddresses(): void {
    this.#registeredTradingAddresses.clear();
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
 * Whether a messenger call failed because no handler is registered.
 *
 * `Messenger.call` reports an unregistered action with a distinctive message.
 * Anything else thrown synchronously came from a handler that does exist, and
 * conflating the two would cache a real failure as "no subscription".
 *
 * @param error - The error thrown by the messenger call.
 * @returns True when the action has no registered handler.
 */
function isUnregisteredActionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /handler.*not.*registered|no.*handler.*registered|A handler for .* has not been registered/iu.test(
      error.message,
    )
  );
}

/**
 * Whether a benefits rejection definitively means "this profile is not
 * entitled", as opposed to "the read failed".
 *
 * `SubscriptionController.getBenefits` throws `UserNotSubscribed` when the
 * subscription is inactive or the response reports ineligibility, and clears
 * its own benefits state on that path. Treating it as a transport failure would
 * keep serving a cached waiver for the rest of the staleness window — up to ten
 * minutes of free trading after entitlement ended — so it is converted to a
 * real `null` answer instead.
 *
 * Matched on the message because the controller throws a plain `Error`; any
 * other failure stays a failure and preserves the cached snapshot.
 *
 * @param error - The rejection from the benefits read.
 * @returns True when the rejection means the profile is not entitled.
 */
function isNotSubscribedRejection(error: unknown): boolean {
  return (
    error instanceof Error && error.message.includes('User is not subscribed')
  );
}

/**
 * Convert `SubscriptionController`'s benefits response into the shape the
 * waiver gate reads.
 *
 * The controller reports allowances in **micro-USD** (`remainingMicroUsd`) and
 * carries no `status`/`entitled` fields: eligibility is the response's own
 * `eligible` flag, and the perps product block holds the cap. Converting once,
 * here at the boundary, keeps the gate and the blended-rate formula working in
 * whole USD.
 *
 * A `remainingMicroUsd` of `null` means the backend reported no bound, which
 * stays an unbounded allowance rather than a spent one.
 *
 * @param response - The controller's benefits response.
 * @returns The internal benefits shape, or null when nothing is entitled.
 */
function adaptSubscriptionBenefits(
  response: SubscriptionBenefitsResponse | null | undefined,
): PerpsSubscriptionBenefits | null {
  if (!response) {
    return null;
  }

  const perps = response.products?.perps;
  // `products.perps` is always present on the response, so its existence proves
  // nothing. Entitlement is the response-level `eligible` flag plus positive
  // evidence from the perps block itself: a builder fee rate to apply, or a
  // reported allowance to spend. A block carrying neither describes a profile
  // with no perps benefit, whatever the other products say.
  const hasPerpsBenefit = Boolean(
    perps &&
    (perps.builderFeeBips !== null ||
      perps.remainingMicroUsd !== null ||
      perps.capMicroUsd !== undefined),
  );

  return {
    status: response.eligible ? 'active' : 'inactive',
    perpsFeeWaiver: {
      entitled: response.eligible && hasPerpsBenefit,
      usage: perps?.exhausted ? 'exhausted' : 'available',
      exhausted: perps?.exhausted,
      remainingNotionalUsd:
        perps?.remainingMicroUsd === null ||
        perps?.remainingMicroUsd === undefined
          ? undefined
          : perps.remainingMicroUsd / MICRO_USD_PER_USD,
    },
  };
}

/**
 * Evaluate the perps fee-waiver eligibility gate against a benefits snapshot.
 *
 * The gate is `status=active` AND `perpsFeeWaiver` entitled AND
 * `usage=available`. A backend `exhausted` flag (or an `exhausted` usage) fails
 * the gate on its own; anything short of an affirmative `available` is treated
 * as not entitled, because the waiver is only granted on positive evidence.
 * A `null` payload means there is no subscription at all, which is reported
 * separately from a subscription that exists but is not active.
 *
 * @param benefits - The cached benefits payload, or null when there is none.
 * @returns The gate outcome plus the remaining notional when reported.
 */
function evaluateFeeWaiverGate(
  benefits: PerpsSubscriptionBenefits | null,
): PerpsSubscriptionFeeWaiverStatus {
  const waiver = benefits?.perpsFeeWaiver;
  const { remainingNotionalUsd } = waiver ?? {};

  // `null` is the DI contract's "nothing to report" (signed out, no profile),
  // which is distinct from a subscription that exists but is not active.
  if (benefits === null) {
    return { eligible: false, reason: 'no-subscription' };
  }

  if (benefits.status !== 'active') {
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
