/**
 * Account utilities for Perps components
 * Handles account selection and EVM account filtering
 */
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { BigNumber } from 'bignumber.js';

import { USDC_DECIMALS } from '../constants/hyperLiquidConfig.js';
import { PERPS_CONSTANTS } from '../constants/perpsConfig.js';
import type { SpotClearinghouseStateResponse } from '../types/hyperliquid-types.js';
import type {
  AccountState,
  CrossMarginSummary,
  PerpsInternalAccount,
} from '../types/index.js';

const EVM_ACCOUNT_TYPES = new Set(['eip155:eoa', 'eip155:erc4337']);

function isEvmAccountType(type: string): boolean {
  return EVM_ACCOUNT_TYPES.has(type);
}

export function findEvmAccount(
  accounts: (InternalAccount | PerpsInternalAccount)[],
): InternalAccount | PerpsInternalAccount | null {
  const evmAccount = accounts.find(
    (account) =>
      account && isEvmAccountType(account.type as InternalAccount['type']),
  );
  return evmAccount ?? null;
}

export function getEvmAccountFromAccountGroup(
  accounts: (InternalAccount | PerpsInternalAccount)[],
): { address: string } | undefined {
  const evmAccount = findEvmAccount(accounts);
  return evmAccount ? { address: evmAccount.address } : undefined;
}

export function getSelectedEvmAccount(
  accounts: (InternalAccount | PerpsInternalAccount)[],
): { address: string } | undefined {
  return getEvmAccountFromAccountGroup(accounts);
}

type SelectedEvmAccountMessenger = {
  call(
    actionType:
      | 'AccountsController:getSelectedAccount'
      | 'AccountTreeController:getAccountsFromSelectedAccountGroup',
  ): unknown;
};

function isAccountLike(
  value: unknown,
): value is InternalAccount | PerpsInternalAccount {
  const account = value as { address?: unknown; type?: unknown } | null;

  return (
    typeof value === 'object' &&
    value !== null &&
    typeof account?.address === 'string' &&
    typeof account.type === 'string'
  );
}

export function getSelectedEvmAccountDetailsFromMessenger(
  messenger: SelectedEvmAccountMessenger,
): InternalAccount | PerpsInternalAccount | undefined {
  try {
    const selectedAccount = messenger.call(
      'AccountsController:getSelectedAccount',
    );
    if (isAccountLike(selectedAccount)) {
      const evmAccount = findEvmAccount([selectedAccount]);
      if (evmAccount) {
        return evmAccount;
      }
    }
  } catch {
    // Fall back to the selected account group if the direct lookup is unavailable.
  }

  try {
    const selectedAccountGroup = messenger.call(
      'AccountTreeController:getAccountsFromSelectedAccountGroup',
    );
    return Array.isArray(selectedAccountGroup)
      ? (findEvmAccount(selectedAccountGroup.filter(isAccountLike)) ??
          undefined)
      : undefined;
  } catch {
    return undefined;
  }
}

export function getSelectedEvmAccountFromMessenger(
  messenger: SelectedEvmAccountMessenger,
): { address: string } | undefined {
  const evmAccount = getSelectedEvmAccountDetailsFromMessenger(messenger);

  return evmAccount ? { address: evmAccount.address } : undefined;
}

export type ReturnOnEquityInput = {
  unrealizedPnl: string | number;
  returnOnEquity: string | number;
};

export function calculateWeightedReturnOnEquity(
  accounts: ReturnOnEquityInput[],
): string {
  if (accounts.length === 0) {
    return '0';
  }

  let totalWeightedROE = 0;
  let totalMarginUsed = 0;

  for (const account of accounts) {
    const unrealizedPnl =
      typeof account.unrealizedPnl === 'string'
        ? Number.parseFloat(account.unrealizedPnl)
        : account.unrealizedPnl;
    const returnOnEquity =
      typeof account.returnOnEquity === 'string'
        ? Number.parseFloat(account.returnOnEquity)
        : account.returnOnEquity;

    if (Number.isNaN(unrealizedPnl) || Number.isNaN(returnOnEquity)) {
      continue;
    }

    if (returnOnEquity === 0) {
      continue;
    }

    const marginUsed = (unrealizedPnl / returnOnEquity) * 100;

    if (Number.isNaN(marginUsed) || marginUsed <= 0) {
      continue;
    }

    const roeDecimal = returnOnEquity / 100;

    totalWeightedROE += roeDecimal * marginUsed;
    totalMarginUsed += marginUsed;
  }

  if (totalMarginUsed <= 0) {
    return '0';
  }

  const weightedROE = (totalWeightedROE / totalMarginUsed) * 100;
  return weightedROE.toString();
}

// The release-branch balance bridge is USDC-only. Non-USDC spot assets must
// not inflate the balances shown or validated by withdraw/payment flows.
const SPOT_COLLATERAL_COINS = new Set<string>(['USDC']);

function getSpotCollateralAmount(
  spotState: SpotClearinghouseStateResponse | null | undefined,
  field: 'hold' | 'total',
): BigNumber {
  if (!spotState?.balances || !Array.isArray(spotState.balances)) {
    return new BigNumber(0);
  }

  return spotState.balances.reduce((sum, balance) => {
    if (!balance.coin || !SPOT_COLLATERAL_COINS.has(balance.coin)) {
      return sum;
    }
    const value = new BigNumber(balance[field] ?? '0');
    return value.isFinite() ? sum.plus(value) : sum;
  }, new BigNumber(0));
}

export function getSpotBalance(
  spotState?: SpotClearinghouseStateResponse | null,
): number {
  return getSpotCollateralAmount(spotState, 'total').toNumber();
}

export function getSpotHold(
  spotState?: SpotClearinghouseStateResponse | null,
): number {
  return getSpotCollateralAmount(spotState, 'hold').toNumber();
}

/**
 * Options controlling how `addSpotBalanceToAccountState` folds spot balance
 * into the three-field AccountState contract.
 */
export type AddSpotBalanceOptions = {
  /**
   * When `true`, free spot USDC contributes to both `spendableBalance` and
   * `withdrawableBalance` in addition to `totalBalance` — appropriate for
   * venues where spot is automatically used as perps collateral (e.g.
   * HyperLiquid Unified/Portfolio mode, where `withdraw3` draws from the
   * unified ledger).
   *
   * When `false`, free spot contributes to `totalBalance` only; spendable
   * and withdrawable stay perps-only — appropriate for venues where spot
   * is a separate ledger the backend cannot auto-draw from (e.g. HL
   * Standard mode). The caller is responsible for translating
   * provider-specific state into this flag.
   *
   * Defaults to `true` for backward compatibility with call sites that
   * haven't yet been wired with provider-specific context.
   */
  foldIntoCollateral?: boolean;
};

/**
 * Add spot USDC to the AccountState contract. Caller decides whether the
 * spot balance counts as perps collateral via `options.foldIntoCollateral`
 * — the util stays provider-agnostic.
 *
 * @param accountState - Base AccountState produced by a provider adapter.
 * @param spotState - Raw spot clearinghouse response (HL-shaped); null or missing means no spot balance and the state is returned unchanged.
 * @param options - See {@link AddSpotBalanceOptions}.
 * @returns AccountState with spot folded into `totalBalance` always, and into spendable/withdrawable when `foldIntoCollateral` is true.
 */
export function addSpotBalanceToAccountState(
  accountState: AccountState,
  spotState?: SpotClearinghouseStateResponse | null,
  options?: AddSpotBalanceOptions,
): AccountState {
  // Fail-closed default: align with `hyperLiquidModeFoldsSpot(null) → false`.
  // A caller that omits `options` should NOT silently fold spot — that would
  // over-report withdrawable funds for Standard / default users.
  const foldIntoCollateral = options?.foldIntoCollateral ?? false;

  const spotBalance = getSpotCollateralAmount(spotState, 'total');
  const spotHold = getSpotCollateralAmount(spotState, 'hold');
  const freeSpot = BigNumber.max(0, spotBalance.minus(spotHold));

  const currentTotal = new BigNumber(accountState.totalBalance);
  const currentSpendable = new BigNumber(accountState.spendableBalance);
  const currentWithdrawable = new BigNumber(accountState.withdrawableBalance);

  // Preserve sentinel totals (e.g. PERPS_CONSTANTS.FallbackDataDisplay '--')
  // rather than coercing them to NaN.
  if (!currentTotal.isFinite()) {
    return accountState;
  }

  // Folding is gated strictly on the resolved abstraction mode (see callers'
  // `foldIntoCollateral` argument). Standard / DEX-abstraction users keep
  // perps and spot independent, so spot must NOT surface as a perps-
  // withdrawable balance for them — withdraw3 only draws from the perps
  // ledger in those modes. Unified / portfolio-margin users get the fold;
  // live callers fail-CLOSED via `hyperLiquidModeFoldsSpot` when mode is
  // unresolved.
  const nextSpendable = resolveFoldedBalance(
    currentSpendable,
    accountState.spendableBalance,
    freeSpot,
    foldIntoCollateral,
  );
  const nextWithdrawable = resolveFoldedBalance(
    currentWithdrawable,
    accountState.withdrawableBalance,
    freeSpot,
    foldIntoCollateral,
  );

  // Total always reflects combined wealth: subtract spotHold to avoid
  // double-counting on Unified/PM accounts where marginSummary.accountValue
  // already includes the margin that HL surfaces via spot.hold. Standard
  // mode has spotHold = 0 by construction, so the subtraction is a no-op.
  const nextTotal = canonicalizeUsdc(
    currentTotal.plus(spotBalance).minus(spotHold),
  );

  if (
    nextTotal === accountState.totalBalance &&
    nextSpendable === accountState.spendableBalance &&
    nextWithdrawable === accountState.withdrawableBalance
  ) {
    return accountState;
  }

  return {
    ...accountState,
    totalBalance: nextTotal,
    spendableBalance: nextSpendable,
    withdrawableBalance: nextWithdrawable,
  };
}

function resolveFoldedBalance(
  currentNumeric: BigNumber,
  currentRaw: string,
  freeSpot: BigNumber,
  foldIntoCollateral: boolean,
): string {
  if (!currentNumeric.isFinite()) {
    // Non-finite currentNumeric means the adapter passed a sentinel like
    // `PERPS_CONSTANTS.FallbackDataDisplay` ("--") during loading. Preserve
    // the sentinel rather than synthesising a numeric fold; the caller's
    // UI treats "--" as "loading" and would otherwise show a misleading
    // spot-only figure while the per-DEX perps fetch is still in flight.
    return currentRaw;
  }

  const spotAmount = foldIntoCollateral ? freeSpot : new BigNumber(0);
  return canonicalizeUsdc(currentNumeric.plus(spotAmount));
}

function canonicalizeUsdc(value: BigNumber): string {
  return value.decimalPlaces(USDC_DECIMALS, BigNumber.ROUND_DOWN).toFixed();
}

/**
 * Sum per-DEX cross-margin summaries. Undefined unless every state carries
 * one, so a partial sum never reads as the whole account.
 *
 * @param states - The per-DEX account states.
 * @returns The summed summary, or undefined.
 */
export function sumCrossMarginSummaries(
  states: AccountState[],
): CrossMarginSummary | undefined {
  const summaries = states
    .map((state) => state.crossMarginSummary)
    .filter((summary): summary is CrossMarginSummary => summary !== undefined);
  if (summaries.length === 0 || summaries.length !== states.length) {
    return undefined;
  }
  const sum = (field: keyof CrossMarginSummary): string =>
    summaries
      .reduce((total, summary) => total.plus(summary[field]), new BigNumber(0))
      .toFixed();
  return {
    accountValue: sum('accountValue'),
    maintenanceMargin: sum('maintenanceMargin'),
    marginUsed: sum('marginUsed'),
    notional: sum('notional'),
  };
}

/**
 * A {@link CrossMarginSummary} whose figures may already be numbers.
 */
export type CrossMarginSummaryInput = Record<
  keyof CrossMarginSummary,
  number | string
>;

/**
 * Account figures derived from the venue's cross margin. Each is undefined
 * while its inputs are unknown.
 */
export type PerpsAccountSummary = {
  /** Maintenance margin the cross positions require, in USD. */
  maintenanceMargin: number | undefined;
  /**
   * Cross maintenance margin over cross collateral (0.5 = 50%). Cross
   * positions are liquidated when it reaches 1.
   */
  accountRatio: number | undefined;
  /** Cross notional as a multiple of total account equity. */
  accountLeverage: number | undefined;
  /** Cross margin used over cross collateral (0.25 = 25%). */
  crossMarginUsage: number | undefined;
};

/**
 * Inputs to {@link calculateAccountSummary}.
 */
export type CalculateAccountSummaryParams = {
  /**
   * Total account equity in USD, isolated margin included
   * (`AccountState.totalBalance`).
   */
  totalEquity: number | string;
  /** The venue's cross margin figures; undefined until read. */
  crossMarginSummary: CrossMarginSummaryInput | undefined;
  /**
   * Spot USDC the venue counts as cross collateral (0 when it counts none);
   * undefined until read.
   */
  spotCollateral: number | string | undefined;
};

function toFiniteNumber(
  value: number | string | undefined,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function share(
  part: number | undefined,
  whole: number | undefined,
): number | undefined {
  return part === undefined || whole === undefined || whole <= 0
    ? undefined
    : part / whole;
}

/**
 * The collateral the cross positions draw on: the cross account value plus
 * the spot USDC the venue counts as collateral.
 *
 * @param crossMarginSummary - The venue's cross margin figures.
 * @param spotCollateral - Spot USDC counted as cross collateral.
 * @returns The cross collateral in USD, or undefined until both are known.
 */
export function getCrossCollateral(
  crossMarginSummary: CrossMarginSummaryInput | undefined,
  spotCollateral: number | string | undefined,
): number | undefined {
  const accountValue = toFiniteNumber(crossMarginSummary?.accountValue);
  const spot = toFiniteNumber(spotCollateral);
  return accountValue === undefined || spot === undefined
    ? undefined
    : accountValue + spot;
}

/**
 * Derive the account summary from the venue's cross margin figures, matching
 * Hyperliquid: account leverage divides cross notional by total account
 * equity, isolated margin included; account ratio and cross margin usage
 * divide the cross maintenance margin and margin used by cross collateral.
 *
 * @param params - The account inputs.
 * @param params.totalEquity - Total account equity in USD.
 * @param params.crossMarginSummary - The venue's cross margin figures.
 * @param params.spotCollateral - Spot USDC counted as cross collateral.
 * @returns The summary; a ratio is undefined while its inputs are unknown or
 * its denominator is not positive.
 */
export function calculateAccountSummary({
  totalEquity,
  crossMarginSummary,
  spotCollateral,
}: CalculateAccountSummaryParams): PerpsAccountSummary {
  const collateral = getCrossCollateral(crossMarginSummary, spotCollateral);
  const maintenanceMargin = toFiniteNumber(
    crossMarginSummary?.maintenanceMargin,
  );
  return {
    maintenanceMargin,
    accountRatio: share(maintenanceMargin, collateral),
    accountLeverage: share(
      toFiniteNumber(crossMarginSummary?.notional),
      toFiniteNumber(totalEquity),
    ),
    crossMarginUsage: share(
      toFiniteNumber(crossMarginSummary?.marginUsed),
      collateral,
    ),
  };
}

/**
 * Aggregate multiple per-DEX AccountState objects into one by summing numeric
 * fields exactly. Collateral subtotals retain their full precision so spot
 * collateral can be added before the final USDC canonicalization.
 * ROE is recalculated as (totalUnrealizedPnl / totalMarginUsed) * 100.
 *
 * @param states - The array of per-DEX account states to aggregate.
 * @returns The combined account state with summed balances and recalculated ROE.
 */
export function aggregateAccountStates(states: AccountState[]): AccountState {
  const fallback: AccountState = {
    spendableBalance: PERPS_CONSTANTS.FallbackDataDisplay,
    withdrawableBalance: PERPS_CONSTANTS.FallbackDataDisplay,
    totalBalance: PERPS_CONSTANTS.FallbackDataDisplay,
    marginUsed: PERPS_CONSTANTS.FallbackDataDisplay,
    unrealizedPnl: PERPS_CONSTANTS.FallbackDataDisplay,
    returnOnEquity: PERPS_CONSTANTS.FallbackDataDisplay,
  };

  if (states.length === 0) {
    return fallback;
  }

  const aggregated = states.reduce<AccountState>((acc, state, index) => {
    if (index === 0) {
      return { ...state };
    }

    return {
      spendableBalance: addDecimalValues(
        acc.spendableBalance,
        state.spendableBalance,
      ),
      withdrawableBalance: addDecimalValues(
        acc.withdrawableBalance,
        state.withdrawableBalance,
      ),
      totalBalance: addDecimalValues(acc.totalBalance, state.totalBalance),
      marginUsed: (
        parseFloat(acc.marginUsed) + parseFloat(state.marginUsed)
      ).toString(),
      unrealizedPnl: (
        parseFloat(acc.unrealizedPnl) + parseFloat(state.unrealizedPnl)
      ).toString(),
      returnOnEquity: '0',
    };
  }, fallback);

  aggregated.spendableBalance = normalizeDecimalString(
    aggregated.spendableBalance,
  );
  aggregated.withdrawableBalance = normalizeDecimalString(
    aggregated.withdrawableBalance,
  );
  aggregated.totalBalance = normalizeDecimalString(aggregated.totalBalance);

  // Recalculate ROE across all DEXs
  const totalMarginUsed = parseFloat(aggregated.marginUsed);
  const totalUnrealizedPnl = parseFloat(aggregated.unrealizedPnl);
  if (totalMarginUsed > 0) {
    aggregated.returnOnEquity = (
      (totalUnrealizedPnl / totalMarginUsed) *
      100
    ).toString();
  } else {
    aggregated.returnOnEquity = '0';
  }

  const crossMarginSummary = sumCrossMarginSummaries(states);
  if (crossMarginSummary) {
    aggregated.crossMarginSummary = crossMarginSummary;
  }

  return aggregated;
}

function addDecimalValues(left: string, right: string): string {
  return new BigNumber(left).plus(right).toFixed();
}

function normalizeDecimalString(value: string): string {
  const amount = new BigNumber(value);
  return amount.isFinite() ? amount.toFixed() : value;
}
