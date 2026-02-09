import type { AccountTreeControllerState } from '@metamask/account-tree-controller';
import { toHex } from '@metamask/controller-utils';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { CaipChainId, Hex } from '@metamask/utils';
import {
  KnownCaipNamespace,
  isStrictHexString,
  parseCaipAssetType,
  parseCaipChainId,
} from '@metamask/utils';
import BigNumberJS from 'bignumber.js';

import type { AssetsControllerState } from '../AssetsController';
import type {
  AccountId,
  AssetBalance,
  AssetMetadata,
  AssetPreferences,
  Caip19AssetId,
} from '../types';

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
    const amountBn = toBigNumberOrZero(amountStr);
    if (amountBn.isZero()) {
      continue; // skip zeros early to reduce map pressure
    }

    const existing = out.get(typedAssetId);
    if (existing) {
      existing.amount = existing.amount.plus(amountBn);
      continue;
    }

    const meta = metadata[typedAssetId];
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

export function getAggregatedBalanceForAccount(
  state: AssetsControllerState,
  selectedInternalAccount: InternalAccount,
  enabledNetworkMap?: EnabledNetworkMap,
  accountTreeState?: AccountTreeControllerState,
  internalAccountsOrAccountIds?: InternalAccount[] | AccountId[],
  accountsById?: AccountsById,
): AggregatedBalanceForAccount {
  const { assetsBalance, assetsMetadata, assetPreferences, assetsPrice } =
    state;

  const metadata = (assetsMetadata ?? {}) as Record<
    Caip19AssetId,
    AssetMetadata
  >;

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

  const accountsToAggregate = resolveAccountsToAggregate({
    selectedInternalAccount,
    accountTreeState,
    internalAccountsOrAccountIds,
    accountsById,
  });

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
  let weightedNumerator = 0;

  for (const [assetId, row] of merged.entries()) {
    const { amount } = row;
    const entry: AggregatedBalanceEntry = {
      assetId,
      amount: amount.toString(),
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
      }
    }
  }

  if (hasPrices) {
    const pricePercentChange1d =
      totalBalanceInFiat > 0 ? weightedNumerator / totalBalanceInFiat : 0;
    return {
      entries,
      totalBalanceInFiat,
      pricePercentChange1d,
    };
  }

  return { entries };
}
