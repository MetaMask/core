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

import type { AssetsControllerState } from '../AssetsController';
import type {
  AccountId,
  AssetBalance,
  AssetMetadata,
  AssetPreferences,
  Caip19AssetId,
} from '../types';

/**
 * Map of enabled networks keyed by namespace then chain id.
 * When undefined, all networks are considered enabled.
 */
export type EnabledNetworkMap =
  | Record<string, Record<string, boolean>>
  | undefined;

/**
 * A single balance entry with optional metadata for display.
 */
export type AggregatedBalanceEntry = {
  /** CAIP-19 asset ID */
  assetId: Caip19AssetId;
  /** Raw balance amount as string (human-readable, e.g. "17.889118575425093511") */
  amount: string;
  /** Token decimals (from metadata when available) */
  decimals?: number;
  /** Display symbol (e.g. "ETH", "USDC") */
  symbol?: string;
  /** Full name (e.g. "Ethereum", "USD Coin") */
  name?: string;
};

/**
 * Result of aggregating balances for a single account.
 * Mirrors the pattern from assets-controllers balances (e.g. AccountGroupBalance).
 */
export type AggregatedBalanceForAccount = {
  /** Balance entries with metadata for the selected account */
  entries: AggregatedBalanceEntry[];
  /** Total portfolio value in fiat when assetsPrice state is available; otherwise undefined */
  totalBalanceInFiat?: number;
  /** Portfolio-weighted 1-day price percent change when assetsPrice is available; otherwise undefined */
  pricePercentChange1d?: number;
};

const getAmountFromBalance = (balance: AssetBalance): string =>
  typeof balance === 'object' && balance !== null && 'amount' in balance
    ? (balance as { amount: string }).amount
    : '0';

/**
 * Check if a chain is enabled. Uses the same key derivation as NetworkEnablementController:
 * - eip155: storage key is toHex(reference), e.g. "0x1", "0x89", "0xa4b1"
 * - solana, tron, bip122: storage key is full CAIP-2 chain id
 *
 * @param map - Enabled network map (namespace -> storageKey -> boolean)
 * @param id - Chain id as Hex or CAIP-2 (e.g. "eip155:1", "eip155:137")
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
  if (namespaceMap[id]) {
    return true;
  }
  if (namespaceMap[reference]) {
    return true;
  }
  if (namespace === KnownCaipNamespace.Eip155) {
    try {
      const storageKey = toHex(reference);
      if (namespaceMap[storageKey]) {
        return true;
      }
    } catch {
      const hexRef = `0x${Number.parseInt(reference, 10).toString(16)}`;
      if (namespaceMap[hexRef]) {
        return true;
      }
    }
  }
  return false;
};

const isAssetChainEnabled = (
  enabledNetworkMap: EnabledNetworkMap,
  assetId: Caip19AssetId,
): boolean => {
  const { chainId } = parseCaipAssetType(assetId);
  return isChainEnabledByMap(enabledNetworkMap, chainId);
};

const isEvmAssetId = (assetId: Caip19AssetId): boolean => {
  const { chainId } = parseCaipAssetType(assetId);
  const { namespace } = parseCaipChainId(chainId);
  return namespace === KnownCaipNamespace.Eip155;
};

/**
 * Merge balance entries by assetId (sum amounts for same asset, keep metadata from first).
 *
 * @param entriesArrays - Arrays of balance entries (e.g. one per account)
 * @returns Single array of entries with amounts summed per assetId
 */
function mergeBalanceEntries(
  entriesArrays: AggregatedBalanceEntry[][],
): AggregatedBalanceEntry[] {
  const byAssetId = new Map<
    Caip19AssetId,
    { amount: number; meta: Omit<AggregatedBalanceEntry, 'assetId' | 'amount'> }
  >();
  for (const entries of entriesArrays) {
    for (const entry of entries) {
      const amountNum = Number.parseFloat(entry.amount) || 0;
      const existing = byAssetId.get(entry.assetId);
      if (existing) {
        existing.amount += amountNum;
      } else {
        byAssetId.set(entry.assetId, {
          amount: amountNum,
          meta: {
            ...(entry.decimals !== undefined && { decimals: entry.decimals }),
            ...(entry.symbol !== undefined && { symbol: entry.symbol }),
            ...(entry.name !== undefined && { name: entry.name }),
          },
        });
      }
    }
  }
  return Array.from(byAssetId.entries()).map(([assetId, { amount, meta }]) => ({
    assetId,
    amount: amount.toString(),
    ...meta,
  }));
}

/**
 * Build balance entries with metadata for an account.
 * Internal helper used by getAggregatedBalanceForAccount.
 *
 * @param accountBalances - Balances for the account (assetId -> balance)
 * @param metadata - Assets metadata (assetId -> metadata)
 * @param assetPreferences - Optional preferences; when provided, hidden assets are excluded
 * @param enabledNetworkMap - Optional map of enabled networks; when provided, only assets on enabled chains are included
 * @param _accountTreeState - Optional account tree state (reserved for future use)
 * @param _selectedInternalAccount - Optional selected account (reserved for future use)
 * @returns Array of balance entries with optional metadata
 */
function getBalanceEntriesForAccount(
  accountBalances: Record<Caip19AssetId, AssetBalance>,
  metadata: Record<Caip19AssetId, AssetMetadata>,
  assetPreferences?: Record<Caip19AssetId, AssetPreferences>,
  enabledNetworkMap?: EnabledNetworkMap,
  _accountTreeState?: AccountTreeControllerState,
  _selectedInternalAccount?: InternalAccount,
): AggregatedBalanceEntry[] {
  const entries = (
    Object.entries(accountBalances) as [Caip19AssetId, AssetBalance][]
  )
    .filter(
      ([assetId]) =>
        !assetPreferences?.[assetId]?.hidden &&
        isAssetChainEnabled(enabledNetworkMap, assetId),
    )
    .map(([assetId, balance]) => {
      const meta = metadata[assetId];
      const amount = getAmountFromBalance(balance);
      return {
        assetId,
        amount,
        ...(meta && {
          decimals: meta.decimals,
          symbol: meta.symbol,
          name: meta.name,
        }),
      };
    });

  return entries;
}

/**
 * Calculate aggregated balance for EVM assets only (eip155:*).
 * Sample calculation: sum(amount * price) for each entry.
 *
 * @param evmEntries - Balance entries for EVM assets (eip155:*)
 * @param assetsPrice - Assets price state for fiat conversion
 * @returns EVM entries and total balance in fiat
 */
function calculateEvmAggregatedBalance(
  evmEntries: AggregatedBalanceEntry[],
  assetsPrice: AssetsControllerState['assetsPrice'],
): { entries: AggregatedBalanceEntry[]; totalBalanceInFiat: number } {
  const totalBalanceInFiat = evmEntries.reduce((sum, entry) => {
    const amountNum = Number.parseFloat(entry.amount);
    if (Number.isNaN(amountNum)) {
      return sum;
    }
    const priceData = assetsPrice?.[entry.assetId];
    const price =
      priceData &&
      typeof priceData === 'object' &&
      'price' in priceData &&
      typeof (priceData as { price: number }).price === 'number'
        ? (priceData as { price: number }).price
        : 0;
    return sum + amountNum * price;
  }, 0);

  return { entries: evmEntries, totalBalanceInFiat };
}

/**
 * Calculate aggregated balance for non-EVM assets (solana, tron, bip122, etc.).
 * Sample calculation: sum(amount * price) for each entry.
 *
 * @param nonEvmEntries - Balance entries for non-EVM assets (solana, tron, bip122, etc.)
 * @param assetsPrice - Assets price state for fiat conversion
 * @returns Non-EVM entries and total balance in fiat
 */
function calculateNonEvmAggregatedBalance(
  nonEvmEntries: AggregatedBalanceEntry[],
  assetsPrice: AssetsControllerState['assetsPrice'],
): { entries: AggregatedBalanceEntry[]; totalBalanceInFiat: number } {
  const totalBalanceInFiat = nonEvmEntries.reduce((sum, entry) => {
    const amountNum = Number.parseFloat(entry.amount);
    if (Number.isNaN(amountNum)) {
      return sum;
    }
    const priceData = assetsPrice?.[entry.assetId];
    const price =
      priceData &&
      typeof priceData === 'object' &&
      'price' in priceData &&
      typeof (priceData as { price: number }).price === 'number'
        ? (priceData as { price: number }).price
        : 0;
    return sum + amountNum * price;
  }, 0);

  return { entries: nonEvmEntries, totalBalanceInFiat };
}

/**
 * Minimal account shape for aggregation (id only).
 */
type AccountLike = { id: AccountId };

/**
 * Map of account ID to internal account (e.g. from AccountsController internalAccounts.accounts).
 */
export type AccountsById = Record<AccountId, InternalAccount>;

/**
 * Get the group ID that contains the given account, using the account tree.
 *
 * @param accountTreeState - Account tree controller state (wallets -> groups -> accounts)
 * @param accountId - Account ID to find (e.g. the selected EVM account)
 * @returns The group ID containing this account, or undefined if not found
 */
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

/**
 * Get all internal accounts in the given account group.
 * Same as in assets-controllers balances: resolves group by groupId and maps
 * group.accounts to full InternalAccount via the accounts-by-id map (e.g. from
 * AccountsController state internalAccounts.accounts).
 * A group can contain one account per chain type (EVM, Solana, Tron, BTC).
 *
 * @param accountTreeState - Account tree controller state (wallets -> groups -> accounts)
 * @param accountsById - Map of account ID to InternalAccount (e.g. accountsState.internalAccounts.accounts)
 * @param groupId - Account group ID (e.g. "entropy:01K1TJY9QPSCKNBSVGZNG510GJ/0")
 * @returns Internal accounts in that group (EVM, Solana, Tron, BTC, etc.); empty if group not found or accounts missing
 */
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
  const groupsByGroupId = (
    wallet: (typeof wallets)[keyof typeof wallets],
  ): Record<string, GroupWithAccounts> =>
    (wallet?.groups ?? {}) as Record<string, GroupWithAccounts>;

  for (const wallet of Object.values(wallets)) {
    const group = groupsByGroupId(wallet)[groupId];
    if (!group) {
      continue;
    }
    const { accounts } = group;
    if (!Array.isArray(accounts)) {
      return [];
    }
    return accounts
      .map((accountId: AccountId) => accountsById[accountId])
      .filter(Boolean);
  }
  return [];
}

/**
 * Get all account IDs in the same account group as the given account, using the account tree.
 * A group can contain one account per chain type (EVM, Solana, Tron, BTC), so this returns
 * the EVM accountId, Solana accountId, Tron accountId, BTC accountId, etc. for that group.
 *
 * @param accountTreeState - Account tree controller state (wallets -> groups -> accounts)
 * @param selectedAccountId - Account ID of the selected account (e.g. the EVM one)
 * @returns Account IDs in the same group, or undefined if not found in the tree
 */
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
  const groupsByGroupId = (
    wallet: (typeof wallets)[keyof typeof wallets],
  ): Record<string, GroupWithAccounts> =>
    (wallet?.groups ?? {}) as Record<string, GroupWithAccounts>;

  for (const wallet of Object.values(wallets)) {
    const group = groupsByGroupId(wallet)[groupId];
    if (group?.accounts) {
      return [...group.accounts];
    }
  }
  return undefined;
}

/**
 * Calculate aggregated balance for the selected internal account(s).
 * When accountTreeState is provided and no explicit list is given, aggregates over all accounts
 * in the same group as the selected account (EVM + Solana + Tron + BTC in that group).
 * When accountsById is also provided, uses getInternalAccountsForGroup for full InternalAccount[].
 * When internalAccountsOrAccountIds is provided, aggregates across those accounts instead.
 * Otherwise uses only selectedInternalAccount.
 *
 * @param state - Assets controller state (assetsBalance, assetsMetadata, optional assetsPrice and assetPreferences)
 * @param selectedInternalAccount - Selected internal account (used when no list is provided)
 * @param enabledNetworkMap - Map of enabled networks keyed by namespace; when omitted or undefined, all networks are considered enabled
 * @param accountTreeState - Optional account tree state; when provided and no 5th arg, used to find all accounts in the same group (EVM, Solana, Tron, BTC) so their balances are aggregated together
 * @param internalAccountsOrAccountIds - Optional: either InternalAccount[] or AccountId[]. When provided, balances from all are merged. Omit and pass accountTreeState to aggregate by group from the tree.
 * @param accountsById - Optional: map of account ID to InternalAccount (e.g. accountsState.internalAccounts.accounts). When provided with accountTreeState, uses getInternalAccountsForGroup so full InternalAccount[] is used for the group.
 * @returns Aggregated balance: entries with metadata, totalBalanceInFiat, and pricePercentChange1d when prices are available
 */
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
  const metadata =
    assetsMetadata ?? ({} as Record<Caip19AssetId, AssetMetadata>);

  const accountsToAggregate: AccountLike[] = ((): AccountLike[] => {
    if (
      internalAccountsOrAccountIds !== undefined &&
      internalAccountsOrAccountIds.length > 0
    ) {
      const first = internalAccountsOrAccountIds[0];
      if (typeof first === 'string') {
        return (internalAccountsOrAccountIds as AccountId[]).map((id) => ({
          id,
        }));
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
    const groupAccountIds = accountTreeState
      ? getAccountIdsInSameGroup(accountTreeState, selectedInternalAccount.id)
      : undefined;
    if (groupAccountIds && groupAccountIds.length > 0) {
      return groupAccountIds.map((id) => ({ id }));
    }
    return [selectedInternalAccount];
  })();

  const entriesArrays: AggregatedBalanceEntry[][] = [];
  for (const account of accountsToAggregate) {
    const accountBalances =
      assetsBalance?.[account.id] ??
      ({} as Record<Caip19AssetId, AssetBalance>);
    const accountEntries = getBalanceEntriesForAccount(
      accountBalances,
      metadata,
      assetPreferences,
      enabledNetworkMap,
      accountTreeState,
      'address' in account && account.address !== undefined
        ? (account as InternalAccount)
        : undefined,
    );
    entriesArrays.push(accountEntries);
  }

  const entries = mergeBalanceEntries(entriesArrays);

  const evmEntries = entries.filter((entry) => isEvmAssetId(entry.assetId));
  const nonEvmEntries = entries.filter((entry) => !isEvmAssetId(entry.assetId));

  let totalBalanceInFiat: number | undefined;
  let pricePercentChange1d: number | undefined;

  const hasPrices = assetsPrice && Object.keys(assetsPrice).length > 0;

  if (hasPrices) {
    const evmResult = calculateEvmAggregatedBalance(evmEntries, assetsPrice);
    const nonEvmResult = calculateNonEvmAggregatedBalance(
      nonEvmEntries,
      assetsPrice,
    );
    totalBalanceInFiat =
      evmResult.totalBalanceInFiat + nonEvmResult.totalBalanceInFiat;

    if (
      totalBalanceInFiat !== undefined &&
      totalBalanceInFiat > 0 &&
      assetsPrice
    ) {
      const totalFiat = totalBalanceInFiat;
      const weightedSum = entries.reduce((sum, entry) => {
        const amountNum = Number.parseFloat(entry.amount);
        if (Number.isNaN(amountNum)) {
          return sum;
        }
        const priceData = assetsPrice[entry.assetId];
        const price =
          priceData &&
          typeof priceData === 'object' &&
          'price' in priceData &&
          typeof (priceData as { price: number }).price === 'number'
            ? (priceData as { price: number }).price
            : 0;
        const contribution = amountNum * price;
        const percent1d =
          priceData &&
          typeof priceData === 'object' &&
          'pricePercentChange1d' in priceData &&
          typeof (priceData as { pricePercentChange1d?: number })
            .pricePercentChange1d === 'number'
            ? (priceData as { pricePercentChange1d: number })
                .pricePercentChange1d
            : 0;
        return sum + (contribution / totalFiat) * percent1d;
      }, 0);
      pricePercentChange1d = weightedSum;
    }
  }

  return {
    entries,
    ...(totalBalanceInFiat !== undefined && { totalBalanceInFiat }),
    ...(pricePercentChange1d !== undefined && { pricePercentChange1d }),
  };
}
