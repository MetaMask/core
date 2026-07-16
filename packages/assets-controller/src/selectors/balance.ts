import type { AccountTreeControllerState } from '@metamask/account-tree-controller';
import { toHex } from '@metamask/controller-utils';
import type { TraceCallback } from '@metamask/controller-utils';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { CaipChainId, Hex } from '@metamask/utils';
import {
  KnownCaipNamespace,
  isStrictHexString,
  parseCaipAssetType,
  parseCaipChainId,
} from '@metamask/utils';
import { BigNumber as BigNumberJS } from 'bignumber.js';

import type { AssetsControllerState } from '../AssetsController.js';
import type {
  AccountId,
  AssetBalance,
  AssetMetadata,
  AssetPreferences,
  Caip19AssetId,
} from '../types.js';

// ============================================================================
// TRACE NAMES — used in Sentry spans (search these strings in Discover)
// ============================================================================
const TRACE_AGGREGATED_BALANCE_SELECTOR = 'AggregatedBalanceSelector';

export type EnabledNetworkMap =
  | Record<string, Record<string, boolean>>
  | undefined;

export type AggregatedBalanceEntry = {
  assetId: Caip19AssetId;
  amount: string;
  decimals?: number;
  symbol?: string;
  name?: string;
};

export type AggregatedBalanceForAccount = {
  entries: AggregatedBalanceEntry[];
  totalBalanceInFiat?: number;
  pricePercentChange1d?: number;
  previousTotalInFiat?: number;
};

type AccountLike = { id: AccountId };
export type AccountsById = Record<AccountId, InternalAccount>;

type PriceDatum = { price: number; pricePercentChange1d: number };

const ZERO_PRICE: PriceDatum = { price: 0, pricePercentChange1d: 0 };

const getAmountFromBalance = (balance: AssetBalance): string => {
  if (typeof balance === 'object' && balance !== null && 'amount' in balance) {
    const { amount } = balance as { amount?: unknown };
    return typeof amount === 'string' ? amount : '0';
  }
  return '0';
};

const toBigNumberOrZero = (value: string): BigNumberJS => {
  const parsed = new BigNumberJS(value);
  return parsed.isNaN() || !parsed.isFinite() ? new BigNumberJS(0) : parsed;
};

/**
 * When state contains raw base units (e.g. SPORE "16201541034.639288184" with 9 decimals),
 * scale to human (16.2) before pricing. Only scale when amount >= 10^decimals so we don't
 * double-scale amounts that are already human (e.g. "1", "0.227285").
 *
 * @param amountRaw - Amount from state (may be raw or human).
 * @param decimals - Token decimals from metadata.
 * @returns Human amount for display and fiat (amountRaw or amountRaw / 10^decimals).
 */
const scaleToHumanIfRaw = (
  amountRaw: BigNumberJS,
  decimals: number,
): BigNumberJS => {
  if (decimals <= 0) {
    return amountRaw;
  }
  const scale = new BigNumberJS(10).pow(decimals);
  if (amountRaw.lt(scale)) {
    return amountRaw;
  }
  return amountRaw.dividedBy(scale);
};

const getPriceDatumFast = (
  assetsPrice: AssetsControllerState['assetsPrice'] | undefined,
  assetId: Caip19AssetId,
): PriceDatum => {
  const raw = assetsPrice?.[assetId];
  if (!raw || typeof raw !== 'object') {
    return ZERO_PRICE;
  }
  const { price, pricePercentChange1d } = raw as {
    price?: unknown;
    pricePercentChange1d?: unknown;
  };
  return {
    price: typeof price === 'number' && Number.isFinite(price) ? price : 0,
    pricePercentChange1d:
      typeof pricePercentChange1d === 'number' &&
      Number.isFinite(pricePercentChange1d)
        ? pricePercentChange1d
        : 0,
  };
};

/**
 * Enablement lookup optimized:
 * - no array allocations
 * - early returns
 *
 * @param map - Enabled network map (namespace -> storageKey -> boolean)
 * @param id - Chain id as Hex or CAIP-2
 * @returns True if the chain is enabled or map is undefined
 */
const isChainEnabledByMap = (
  map: EnabledNetworkMap,
  id: Hex | CaipChainId,
): boolean => {
  if (!map) {
    return true;
  }

  if (isStrictHexString(id)) {
    return Boolean(map[KnownCaipNamespace.Eip155]?.[id]);
  }

  const { namespace, reference } = parseCaipChainId(id);
  const namespaceMap = map[namespace];
  if (!namespaceMap) {
    return false;
  }

  // exact CAIP-2 id / reference
  if (namespaceMap[id] || namespaceMap[reference]) {
    return true;
  }

  // EVM: hex storage key
  if (namespace === KnownCaipNamespace.Eip155) {
    try {
      const storageKey = toHex(reference);
      return Boolean(namespaceMap[storageKey]);
    } catch {
      const parsedRef = Number.parseInt(reference, 10);
      if (Number.isFinite(parsedRef)) {
        return Boolean(namespaceMap[`0x${parsedRef.toString(16)}`]);
      }
    }
  }

  return false;
};

/**
 * Cache parsing results per assetId to avoid parseCaipAssetType/parseCaipChainId
 * being called multiple times across filtering + grouping + pricing.
 */
type AssetParseInfo = {
  chainId: CaipChainId;
  isEvm: boolean;
};

const makeAssetInfoCache = (): Map<Caip19AssetId, AssetParseInfo> =>
  new Map<Caip19AssetId, AssetParseInfo>();

const getAssetInfo = (
  cache: Map<Caip19AssetId, AssetParseInfo>,
  assetId: Caip19AssetId,
): AssetParseInfo => {
  const cached = cache.get(assetId);
  if (cached) {
    return cached;
  }
  const { chainId } = parseCaipAssetType(assetId);
  const { namespace } = parseCaipChainId(chainId);
  const info = { chainId, isEvm: namespace === KnownCaipNamespace.Eip155 };
  cache.set(assetId, info);
  return info;
};

/**
 * Merge across accounts without building per-account entries arrays.
 * Uses BigNumber for amount accumulation to avoid float precision loss.
 */
type AggRow = {
  amount: BigNumberJS;
  decimals?: number;
  symbol?: string;
  name?: string;
};

function mergeBalancesIntoMap(args: {
  out: Map<Caip19AssetId, AggRow>;
  accountBalances: Record<Caip19AssetId, AssetBalance>;
  metadata: Record<Caip19AssetId, AssetMetadata>;
  assetPreferences?: Record<Caip19AssetId, AssetPreferences>;
  enabledNetworkMap?: EnabledNetworkMap;
  assetInfoCache: Map<Caip19AssetId, AssetParseInfo>;
}): void {
  const {
    out,
    accountBalances,
    metadata,
    assetPreferences,
    enabledNetworkMap,
    assetInfoCache,
  } = args;

  for (const assetId in accountBalances) {
    if (!Object.prototype.hasOwnProperty.call(accountBalances, assetId)) {
      continue;
    }
    const typedAssetId = assetId as Caip19AssetId;

    if (assetPreferences?.[typedAssetId]?.hidden) {
      continue;
    }

    const info = getAssetInfo(assetInfoCache, typedAssetId);
    if (!isChainEnabledByMap(enabledNetworkMap, info.chainId)) {
      continue;
    }

    const amountStr = getAmountFromBalance(accountBalances[typedAssetId]);
    let amountBn = toBigNumberOrZero(amountStr);
    const meta = metadata[typedAssetId];
    if (meta?.decimals !== undefined) {
      amountBn = scaleToHumanIfRaw(amountBn, meta.decimals);
    }
    if (amountBn.isZero()) {
      continue; // skip zeros early to reduce map pressure
    }

    const existing = out.get(typedAssetId);
    if (existing) {
      existing.amount = existing.amount.plus(amountBn);
      continue;
    }

    out.set(typedAssetId, {
      amount: amountBn,
      decimals: meta?.decimals,
      symbol: meta?.symbol,
      name: meta?.name,
    });
  }
}

export function getGroupIdForAccount(
  accountTreeState: AccountTreeControllerState,
  accountId: AccountId,
): string | undefined {
  const wallets = accountTreeState.accountTree?.wallets;
  if (!wallets) {
    return undefined;
  }
  for (const wallet of Object.values(wallets)) {
    for (const [groupId, group] of Object.entries(wallet?.groups ?? {})) {
      const accounts = group?.accounts;
      if (Array.isArray(accounts) && accounts.includes(accountId)) {
        return groupId;
      }
    }
  }
  return undefined;
}

export function getInternalAccountsForGroup(
  accountTreeState: AccountTreeControllerState,
  accountsById: AccountsById,
  groupId: string,
): InternalAccount[] {
  const wallets = accountTreeState.accountTree?.wallets;
  if (!wallets) {
    return [];
  }
  type GroupWithAccounts = { accounts?: AccountId[] };
  const getGroups = (
    walletItem: (typeof wallets)[keyof typeof wallets],
  ): Record<string, GroupWithAccounts> =>
    (walletItem?.groups ?? {}) as Record<string, GroupWithAccounts>;

  for (const wallet of Object.values(wallets)) {
    const group = getGroups(wallet)[groupId];
    if (!group?.accounts) {
      continue;
    }
    const result: InternalAccount[] = [];
    for (const id of group.accounts) {
      const acct = accountsById[id];
      if (acct) {
        result.push(acct);
      }
    }
    return result;
  }
  return [];
}

function getAccountIdsInSameGroup(
  accountTreeState: AccountTreeControllerState,
  selectedAccountId: AccountId,
): AccountId[] | undefined {
  const groupId = getGroupIdForAccount(accountTreeState, selectedAccountId);
  if (!groupId) {
    return undefined;
  }
  const wallets = accountTreeState.accountTree?.wallets;
  if (!wallets) {
    return undefined;
  }
  type GroupWithAccounts = { accounts?: AccountId[] };
  const getGroups = (
    walletItem: (typeof wallets)[keyof typeof wallets],
  ): Record<string, GroupWithAccounts> =>
    (walletItem?.groups ?? {}) as Record<string, GroupWithAccounts>;

  for (const wallet of Object.values(wallets)) {
    const group = getGroups(wallet)[groupId];
    if (group?.accounts) {
      return [...group.accounts];
    }
  }
  return undefined;
}

function resolveAccountsToAggregate(args: {
  selectedInternalAccount: InternalAccount;
  accountTreeState?: AccountTreeControllerState;
  internalAccountsOrAccountIds?: InternalAccount[] | AccountId[];
  accountsById?: AccountsById;
}): AccountLike[] {
  const {
    selectedInternalAccount,
    accountTreeState,
    internalAccountsOrAccountIds,
    accountsById,
  } = args;

  if (internalAccountsOrAccountIds && internalAccountsOrAccountIds.length > 0) {
    const first = internalAccountsOrAccountIds[0];
    if (typeof first === 'string') {
      const ids = internalAccountsOrAccountIds as AccountId[];
      const out: AccountLike[] = new Array(ids.length);
      for (let i = 0; i < ids.length; i++) {
        out[i] = { id: ids[i] };
      }
      return out;
    }
    return internalAccountsOrAccountIds as InternalAccount[];
  }

  if (
    accountTreeState &&
    accountsById &&
    Object.keys(accountsById).length > 0
  ) {
    const groupId = getGroupIdForAccount(
      accountTreeState,
      selectedInternalAccount.id,
    );
    if (groupId) {
      const groupAccounts = getInternalAccountsForGroup(
        accountTreeState,
        accountsById,
        groupId,
      );
      if (groupAccounts.length > 0) {
        return groupAccounts;
      }
    }
  }

  if (accountTreeState) {
    const ids = getAccountIdsInSameGroup(
      accountTreeState,
      selectedInternalAccount.id,
    );
    if (ids && ids.length > 0) {
      const out: AccountLike[] = new Array(ids.length);
      for (let i = 0; i < ids.length; i++) {
        out[i] = { id: ids[i] };
      }
      return out;
    }
  }

  return [selectedInternalAccount];
}

/**
 * Get account ids that belong to a group, reading directly from the account
 * tree. Unlike {@link getInternalAccountsForGroup}, this does not require an
 * `accountsById` lookup map, which makes it convenient for balance aggregation
 * where only the ids are needed.
 *
 * @param accountTreeState - AccountTreeController state.
 * @param groupId - The account group id to look up.
 * @returns The list of account ids in the group, or an empty array.
 */
export function getAccountIdsForGroup(
  accountTreeState: AccountTreeControllerState,
  groupId: string,
): AccountId[] {
  const wallets = accountTreeState.accountTree?.wallets ?? {};
  type GroupWithAccounts = { accounts?: AccountId[] };
  for (const wallet of Object.values(wallets)) {
    const groups = (wallet?.groups ?? {}) as Record<string, GroupWithAccounts>;
    const group = groups[groupId];
    if (group?.accounts) {
      return [...group.accounts];
    }
  }
  return [];
}

/**
 * Aggregate balances across an explicit list of accounts.
 *
 * This is the core aggregation engine shared by the account- and group-level
 * selectors. It intentionally takes a fully-resolved list of accounts so that
 * callers control account resolution and no "selected account" placeholder is
 * required.
 *
 * @param state - AssetsController state slice.
 * @param accounts - Accounts whose balances should be aggregated.
 * @param enabledNetworkMap - Optional map of enabled networks keyed by namespace.
 * @param trace - Optional trace callback for telemetry spans.
 * @returns Aggregated balance entries plus fiat totals when prices are present.
 */
function aggregateBalances(
  state: AssetsControllerState,
  accounts: AccountLike[],
  enabledNetworkMap?: EnabledNetworkMap,
  trace?: TraceCallback,
): AggregatedBalanceForAccount {
  const startTime = trace ? performance.now() : 0;
  const { assetsBalance, assetsInfo, assetPreferences, assetsPrice } = state;

  const metadata = (assetsInfo ?? {}) as Record<Caip19AssetId, AssetMetadata>;

  const hasPrices =
    Boolean(assetsPrice) &&
    ((): boolean => {
      for (const key in assetsPrice) {
        if (Object.prototype.hasOwnProperty.call(assetsPrice, key)) {
          return true;
        }
      }
      return false;
    })();

  const accountsToAggregate = accounts;

  const assetInfoCache = makeAssetInfoCache();
  const merged = new Map<Caip19AssetId, AggRow>();

  for (const account of accountsToAggregate) {
    const accountId = account.id;
    const accountBalances =
      assetsBalance?.[accountId] ?? ({} as Record<Caip19AssetId, AssetBalance>);

    mergeBalancesIntoMap({
      out: merged,
      accountBalances,
      metadata,
      assetPreferences,
      enabledNetworkMap,
      assetInfoCache,
    });
  }

  // Materialize entries once
  const entries: AggregatedBalanceEntry[] = new Array(merged.size);
  let idx = 0;

  // If prices exist, compute totals in a single pass over merged.
  let totalBalanceInFiat = 0;
  let previousTotalInFiat = 0;
  let weightedNumerator = 0;

  for (const [assetId, row] of merged.entries()) {
    const { amount } = row;
    const entry: AggregatedBalanceEntry = {
      assetId,
      amount: amount.toFixed(),
      ...(row.decimals === undefined ? {} : { decimals: row.decimals }),
      ...(row.symbol === undefined ? {} : { symbol: row.symbol }),
      ...(row.name === undefined ? {} : { name: row.name }),
    };
    entries[idx] = entry;
    idx += 1;

    if (hasPrices) {
      const { price, pricePercentChange1d } = getPriceDatumFast(
        assetsPrice,
        assetId,
      );
      const contribution = amount.multipliedBy(price).toNumber();
      if (contribution > 0) {
        totalBalanceInFiat += contribution;
        weightedNumerator += contribution * pricePercentChange1d;

        // A -100% move makes the denominator zero; treat it as flat so the
        // previous total never goes to infinity.
        const denom = Number((1 + pricePercentChange1d / 100).toFixed(8));
        previousTotalInFiat +=
          denom === 0 ? contribution : contribution / denom;
      }
    }
  }

  if (trace) {
    const durationMs = performance.now() - startTime;
    const uniqueNetworks = new Set<CaipChainId>();
    for (const assetId of merged.keys()) {
      const info = getAssetInfo(assetInfoCache, assetId);
      uniqueNetworks.add(info.chainId);
    }
    trace(
      {
        name: TRACE_AGGREGATED_BALANCE_SELECTOR,
        data: {
          duration_ms: durationMs,
          asset_count: merged.size,
          network_count: uniqueNetworks.size,
          account_count: accountsToAggregate.length,
        },
        tags: { controller: 'AssetsController' },
      },
      () => undefined,
    ).catch(() => {
      // Telemetry failure must not break.
    });
  }

  if (hasPrices) {
    const pricePercentChange1d =
      totalBalanceInFiat > 0 ? weightedNumerator / totalBalanceInFiat : 0;
    return {
      entries,
      totalBalanceInFiat,
      pricePercentChange1d,
      previousTotalInFiat,
    };
  }

  return { entries };
}

/**
 * Aggregate balances for an explicit list of account ids.
 *
 * Prefer this over {@link getAggregatedBalanceForAccount} when the set of
 * accounts to aggregate is already known (e.g. all accounts in a group), since
 * it does not require a "selected account" and therefore avoids the brittle
 * account-resolution heuristics.
 *
 * @param state - AssetsController state slice.
 * @param accountIds - Account ids whose balances should be aggregated.
 * @param enabledNetworkMap - Optional map of enabled networks keyed by namespace.
 * @param trace - Optional trace callback for telemetry spans.
 * @returns Aggregated balance entries plus fiat totals when prices are present.
 */
export function getAggregatedBalanceForAccountIds(
  state: AssetsControllerState,
  accountIds: AccountId[],
  enabledNetworkMap?: EnabledNetworkMap,
  trace?: TraceCallback,
): AggregatedBalanceForAccount {
  const accounts: AccountLike[] = accountIds.map((id) => ({ id }));
  return aggregateBalances(state, accounts, enabledNetworkMap, trace);
}

export function getAggregatedBalanceForAccount(
  state: AssetsControllerState,
  selectedInternalAccount: InternalAccount,
  enabledNetworkMap?: EnabledNetworkMap,
  accountTreeState?: AccountTreeControllerState,
  internalAccountsOrAccountIds?: InternalAccount[] | AccountId[],
  accountsById?: AccountsById,
  trace?: TraceCallback,
): AggregatedBalanceForAccount {
  const accountsToAggregate = resolveAccountsToAggregate({
    selectedInternalAccount,
    accountTreeState,
    internalAccountsOrAccountIds,
    accountsById,
  });
  return aggregateBalances(
    state,
    accountsToAggregate,
    enabledNetworkMap,
    trace,
  );
}

// ============================================================================
// WALLET- AND GROUP-LEVEL BALANCE CALCULATIONS
// ============================================================================

/**
 * Default user currency used when {@link AssetsControllerState.selectedCurrency}
 * is not set.
 */
const DEFAULT_USER_CURRENCY = 'usd';

export type AccountGroupBalance = {
  walletId: string;
  groupId: string;
  totalBalanceInUserCurrency: number;
  userCurrency: string;
};

export type WalletBalance = {
  walletId: string;
  groups: Record<string, AccountGroupBalance>;
  totalBalanceInUserCurrency: number;
  userCurrency: string;
};

export type AllWalletsBalance = {
  wallets: Record<string, WalletBalance>;
  totalBalanceInUserCurrency: number;
  userCurrency: string;
};

export type BalanceChangePeriod = '1d' | '7d' | '30d';

export type BalanceChangeResult = {
  period: BalanceChangePeriod;
  currentTotalInUserCurrency: number;
  previousTotalInUserCurrency: number;
  amountChangeInUserCurrency: number;
  percentChange: number;
  userCurrency: string;
};

/**
 * Resolve the user currency for a balance calculation, falling back to a
 * sensible default when the controller has no selected currency.
 *
 * @param assetsControllerState - AssetsController state slice.
 * @returns The user currency code.
 */
function getUserCurrency(assetsControllerState: AssetsControllerState): string {
  return assetsControllerState.selectedCurrency ?? DEFAULT_USER_CURRENCY;
}

/**
 * Resolve the current and previous totals for a change calculation.
 *
 * The AssetsController state only exposes a 1d price change, so non-`1d`
 * periods produce a zeroed change (previous equals current).
 *
 * @param totalBalanceInFiat - Aggregated current balance in user currency.
 * @param previousTotalInFiat - Aggregated prior balance summed per asset.
 * @param period - Period to compute the change for.
 * @returns The current and previous totals in user currency.
 */
function getCurrentAndPrevious(
  totalBalanceInFiat: number,
  previousTotalInFiat: number,
  period: BalanceChangePeriod,
): { current: number; previous: number } {
  const current = totalBalanceInFiat;
  const previous = period === '1d' ? previousTotalInFiat : current;
  return { current, previous };
}

/**
 * Build a {@link BalanceChangeResult} from current/previous totals.
 *
 * @param current - Current total in user currency.
 * @param previous - Previous total in user currency.
 * @param period - Period the change was computed for.
 * @param userCurrency - User currency code.
 * @returns The change result with delta and percent change.
 */
function buildBalanceChangeResult(
  current: number,
  previous: number,
  period: BalanceChangePeriod,
  userCurrency: string,
): BalanceChangeResult {
  const amountChange = current - previous;
  const percentChange = previous === 0 ? 0 : (amountChange / previous) * 100;
  return {
    period,
    currentTotalInUserCurrency: Number(current.toFixed(8)),
    previousTotalInUserCurrency: Number(previous.toFixed(8)),
    amountChangeInUserCurrency: Number(amountChange.toFixed(8)),
    percentChange: Number(percentChange.toFixed(8)),
    userCurrency,
  };
}

/**
 * Calculate aggregated balances for all wallets and groups.
 *
 * Mirrors the legacy `@metamask/assets-controllers` `calculateBalanceForAllWallets`
 * output shape, but sources every group total from the unified AssetsController
 * state via {@link getAggregatedBalanceForAccountIds}. The account tree is walked
 * to aggregate each group individually.
 *
 * @param assetsControllerState - AssetsController state slice.
 * @param accountTreeState - AccountTreeController state.
 * @param enabledNetworkMap - Map of enabled networks keyed by namespace.
 * @param trace - Optional trace callback forwarded to the aggregation selector.
 * @returns Aggregated balances for all wallets and groups.
 */
export function calculateBalanceForAllWallets(
  assetsControllerState: AssetsControllerState,
  accountTreeState: AccountTreeControllerState,
  enabledNetworkMap?: EnabledNetworkMap,
  trace?: TraceCallback,
): AllWalletsBalance {
  const userCurrency = getUserCurrency(assetsControllerState);
  const wallets: AllWalletsBalance['wallets'] = {};
  let totalBalanceInUserCurrency = 0;

  type WalletWithGroups = { groups?: Record<string, unknown> };
  for (const [walletId, wallet] of Object.entries(
    accountTreeState.accountTree?.wallets ?? {},
  )) {
    const walletBalance: WalletBalance = {
      walletId,
      groups: {},
      totalBalanceInUserCurrency: 0,
      userCurrency,
    };

    const groups = (wallet as WalletWithGroups)?.groups ?? {};
    for (const groupId of Object.keys(groups)) {
      const accountIds = getAccountIdsForGroup(accountTreeState, groupId);
      const { totalBalanceInFiat = 0 } = getAggregatedBalanceForAccountIds(
        assetsControllerState,
        accountIds,
        enabledNetworkMap,
        trace,
      );

      walletBalance.groups[groupId] = {
        walletId,
        groupId,
        totalBalanceInUserCurrency: totalBalanceInFiat,
        userCurrency,
      };
      walletBalance.totalBalanceInUserCurrency += totalBalanceInFiat;
    }

    wallets[walletId] = walletBalance;
    totalBalanceInUserCurrency += walletBalance.totalBalanceInUserCurrency;
  }

  return { wallets, totalBalanceInUserCurrency, userCurrency };
}

/**
 * Calculate the portfolio value change for a single account group and period.
 *
 * @param assetsControllerState - AssetsController state slice.
 * @param accountTreeState - AccountTreeController state.
 * @param groupId - Account group id to compute the change for.
 * @param period - Change period (`1d` | `7d` | `30d`).
 * @param enabledNetworkMap - Map of enabled networks keyed by namespace.
 * @param trace - Optional trace callback forwarded to the aggregation selector.
 * @returns The change result for the requested period.
 */
export function calculateBalanceChangeForAccountGroup(
  assetsControllerState: AssetsControllerState,
  accountTreeState: AccountTreeControllerState,
  groupId: string,
  period: BalanceChangePeriod,
  enabledNetworkMap?: EnabledNetworkMap,
  trace?: TraceCallback,
): BalanceChangeResult {
  const userCurrency = getUserCurrency(assetsControllerState);
  const accountIds = getAccountIdsForGroup(accountTreeState, groupId);
  const { totalBalanceInFiat = 0, previousTotalInFiat = totalBalanceInFiat } =
    getAggregatedBalanceForAccountIds(
      assetsControllerState,
      accountIds,
      enabledNetworkMap,
      trace,
    );

  const { current, previous } = getCurrentAndPrevious(
    totalBalanceInFiat,
    previousTotalInFiat,
    period,
  );

  return buildBalanceChangeResult(current, previous, period, userCurrency);
}
