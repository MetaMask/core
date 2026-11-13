import { BigNumber } from 'bignumber.js';

import type {
  AccountAggregateMetadata,
  AccountState,
  PerpsProviderAccountStateEntry,
  PerpsProviderType,
} from '../types/index.js';

/**
 * Venue-neutral combined account data.
 *
 * Venue-local detail (`crossMarginSummary`, `subAccountBreakdown`) is
 * intentionally absent: cross-venue collateral is not mutually usable, so an
 * aggregate of it would imply a combined margin position that no venue
 * actually settles.
 */
export type AggregatedAccountTotals = {
  totalBalance: string;
  spendableBalance: string;
  withdrawableBalance: string;
  marginUsed: string;
  unrealizedPnl: string;
  returnOnEquity: string;
};

/** USD balance fields that add up across venues. */
const ADDITIVE_FIELDS = [
  'totalBalance',
  'spendableBalance',
  'withdrawableBalance',
  'marginUsed',
  'unrealizedPnl',
] as const;

/**
 * Sum one decimal string field across states.
 *
 * Uses `bignumber.js`, never binary floating point. A venue value that is
 * not a finite decimal contributes nothing; a state with an unparseable
 * required field is rejected by its provider adapter before reaching here.
 *
 * @param states - The available venue states to sum over.
 * @param field - The USD field to sum.
 * @returns The decimal sum as a canonical string.
 */
function sumField(
  states: AccountState[],
  field: (typeof ADDITIVE_FIELDS)[number],
): string {
  const total = states.reduce(
    (acc, state) => acc.plus(new BigNumber(state[field] ?? '0')),
    new BigNumber(0),
  );
  return total.toFixed();
}

/**
 * Build the combined totals for a set of available venue states.
 *
 * Additive USD fields are decimal-summed. `returnOnEquity` is a rate, not a
 * balance: both venues report account-level RoE in percentage points
 * (unrealized PnL relative to margin used), so the combined rate is
 * `100 x sum(unrealizedPnl) / sum(marginUsed)` — PnL-weighted, never summed
 * or averaged. When no margin is used anywhere the combined RoE is '0': with
 * no collateral at work there is no meaningful rate.
 *
 * @param states - Available, valid per-venue account states.
 * @returns The venue-neutral combined totals.
 */
export function aggregateAccountTotals(
  states: AccountState[],
): AggregatedAccountTotals {
  const totals: Record<(typeof ADDITIVE_FIELDS)[number], string> = {
    totalBalance: sumField(states, 'totalBalance'),
    spendableBalance: sumField(states, 'spendableBalance'),
    withdrawableBalance: sumField(states, 'withdrawableBalance'),
    marginUsed: sumField(states, 'marginUsed'),
    unrealizedPnl: sumField(states, 'unrealizedPnl'),
  };

  const totalPnl = new BigNumber(totals.unrealizedPnl);
  const totalMarginUsed = new BigNumber(totals.marginUsed);
  const returnOnEquity = totalMarginUsed.isGreaterThan(0)
    ? totalPnl.dividedBy(totalMarginUsed).multipliedBy(100).toFixed()
    : '0';

  return { ...totals, returnOnEquity };
}

/**
 * Combine per-venue account entries into one {@link AccountState}.
 *
 * The top-level numeric fields are combined totals over available venues
 * only; each entry reports its own venue identity and state, and
 * `aggregate` says whether the totals cover every enabled venue. The
 * combined result carries no venue identity and no venue-local margin or
 * sub-account detail.
 *
 * @param params - Combined result inputs.
 * @param params.entries - One entry per enabled venue, available or not.
 * @returns The combined state, or null when no venue has usable data: a
 * failed or not-yet-reported venue must never be presented as an all-zero
 * successful total.
 */
export function buildAggregatedAccountState(params: {
  entries: PerpsProviderAccountStateEntry[];
}): AccountState | null {
  const { entries } = params;

  const availableStates: AccountState[] = [];
  const availableProviders: PerpsProviderType[] = [];
  const unavailableProviders: PerpsProviderType[] = [];

  for (const entry of entries) {
    if (entry.status === 'available') {
      availableStates.push(entry.state);
      availableProviders.push(entry.providerId);
    } else {
      unavailableProviders.push(entry.providerId);
    }
  }

  const metadata: AccountAggregateMetadata = {
    status: unavailableProviders.length > 0 ? 'partial' : 'complete',
    availableProviders,
    unavailableProviders,
  };

  if (availableStates.length === 0) {
    return null;
  }

  return {
    ...aggregateAccountTotals(availableStates),
    providerStates: Object.fromEntries(
      entries.map((entry) => [entry.providerId, entry]),
    ),
    aggregate: metadata,
  };
}
