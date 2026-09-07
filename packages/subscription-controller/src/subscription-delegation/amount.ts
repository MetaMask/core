import { SubscriptionDelegationServiceErrorMessage } from '../constants.js';
import { RECURRING_INTERVALS } from '../types.js';
import type { RecurringInterval } from '../types.js';

const SECONDS_PER_DAY = 86_400;

/**
 * Rescales a plan fee from pricing `unitDecimals` into token base units.
 *
 * Uses a 1:1 numeric mapping (ADR 0057): the period amount is one billing
 * interval's fee, not `fee × minimumFundingCycles`.
 *
 * @param params - Amount and decimal inputs.
 * @param params.unitAmount - Fee in pricing minor units (non-negative integer).
 * @param params.unitDecimals - Decimals of `unitAmount`.
 * @param params.tokenDecimals - Decimals of the payment token.
 * @returns The period amount in token base units.
 * @throws If inputs are not non-negative integers, or downscaling would lose precision.
 */
export function calculatePeriodAmount({
  unitAmount,
  unitDecimals,
  tokenDecimals,
}: {
  unitAmount: number;
  unitDecimals: number;
  tokenDecimals: number;
}): bigint {
  assertNonNegativeInteger(
    unitAmount,
    SubscriptionDelegationServiceErrorMessage.InvalidAmount,
  );
  assertNonNegativeInteger(
    unitDecimals,
    SubscriptionDelegationServiceErrorMessage.InvalidDecimals,
  );
  assertNonNegativeInteger(
    tokenDecimals,
    SubscriptionDelegationServiceErrorMessage.InvalidDecimals,
  );

  const amount = BigInt(unitAmount);

  if (tokenDecimals === unitDecimals) {
    return amount;
  }

  if (tokenDecimals > unitDecimals) {
    return amount * 10n ** BigInt(tokenDecimals - unitDecimals);
  }

  const divisor = 10n ** BigInt(unitDecimals - tokenDecimals);
  if (amount % divisor !== 0n) {
    throw new Error(SubscriptionDelegationServiceErrorMessage.LossyAmountScale);
  }
  return amount / divisor;
}

/**
 * Plan-scoped ERC-20 period duration in seconds (ADR 0057).
 *
 * - Monthly: 28 days (minimum Stripe monthly invoice gap).
 * - Yearly: 365 days.
 *
 * @param recurringInterval - Subscription billing interval.
 * @returns Period duration in seconds.
 */
export function getPeriodDuration(
  recurringInterval: RecurringInterval,
): number {
  if (recurringInterval === RECURRING_INTERVALS.month) {
    return 28 * SECONDS_PER_DAY;
  }
  if (recurringInterval === RECURRING_INTERVALS.year) {
    return 365 * SECONDS_PER_DAY;
  }
  throw new Error(
    SubscriptionDelegationServiceErrorMessage.UnsupportedRecurringInterval,
  );
}

/**
 * @param value - Candidate number.
 * @param message - Error message when invalid.
 */
function assertNonNegativeInteger(value: number, message: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(message);
  }
}
