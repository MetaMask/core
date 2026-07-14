import type {
  V6BalanceItem,
  V6BalanceMetadata,
  V6BalancesResponse,
} from '@metamask/core-backend';
import type { CaipAssetType, CaipChainId } from '@metamask/utils';
import {
  KnownCaipNamespace,
  parseCaipAssetType,
  parseCaipChainId,
} from '@metamask/utils';

// TODO: The extension prototype derived token icons via
// `getCaipAssetImageUrl`/`getAssetImageUrl` (shared/lib/asset-utils). Core has
// no shared equivalent yet, so the minimal builder below is inlined. Replace it
// with a shared helper if/when one lands in core.
const STATIC_METAMASK_BASE_URL = 'https://static.cx.metamask.io';

/**
 * An icon-group entry shown next to a protocol in the DeFi tab list.
 */
export type DeFiPositionIconGroupItem = {
  avatarValue: string;
  symbol: string;
};

/**
 * A single underlying position row shown on the DeFi details page.
 */
export type DeFiUnderlyingPosition = {
  assetId: CaipAssetType;
  chainId: CaipChainId;
  symbol: string;
  name: string;
  /** Raw balance string as returned by the API. */
  balance: string;
  /** Parsed balance amount, or 0 when invalid. */
  normalizedBalance: number;
  decimals: number;
  /** Fiat market value in the requested currency. */
  marketValue: number;
  /** Position type from protocol metadata (e.g. supply, borrow, stake, reward). */
  positionType: string;
  poolAddress: string;
  tokenImage: string;
};

/**
 * A group of underlying positions that share a pool address.
 */
export type DeFiPositionPoolGroup = {
  poolAddress: string;
  positions: DeFiUnderlyingPosition[];
};

/**
 * A section of the details page, grouping pools by protocol name.
 */
export type DeFiPositionDetailsSection = {
  protocolName: string;
  poolGroups: DeFiPositionPoolGroup[];
};

/**
 * One row in the DeFi tab list (a protocol on a given chain), with the details
 * needed to render the details page embedded directly inside it.
 */
export type DeFiProtocolPositionGroup = {
  protocolId: string;
  protocolName: string;
  protocolIconUrl: string;
  chainId: CaipChainId;
  /** Aggregated fiat market value across all positions in the group. */
  marketValue: number;
  /** Symbols of the underlying tokens, ordered for display. */
  underlyingSymbols: string[];
  /** Icon-group entries for the list row. */
  iconGroup: DeFiPositionIconGroupItem[];
  /** Detail sections consumed by the details page. */
  sections: DeFiPositionDetailsSection[];
};

/**
 * DeFi positions for every queried account, keyed by the internal MetaMask
 * account ID (`InternalAccount.id` UUID), the same key AssetsController uses.
 * Each account maps to a flat list of protocol groups; filter by each group's
 * `chainId` rather than digging through a nested chain map.
 */
export type DeFiPositionsByAccount = {
  [accountId: string]: DeFiProtocolPositionGroup[];
};

const SYMBOL_PRIORITY = ['ETH', 'WETH'];

type DefiBalanceWithMetadata = V6BalanceItem & { metadata: V6BalanceMetadata };

/**
 * Builds a static token icon URL for a CAIP asset ID.
 *
 * @param assetId - The CAIP-19 asset ID.
 * @returns The token icon URL, or an empty string when it cannot be built.
 */
function getDefiTokenImageUrl(assetId: CaipAssetType): string {
  try {
    const { chainId } = parseCaipAssetType(assetId);
    const { namespace } = parseCaipChainId(chainId);
    const isEvm = namespace === KnownCaipNamespace.Eip155;
    const normalizedAssetId = (isEvm ? assetId.toLowerCase() : assetId).replace(
      /:/gu,
      '/',
    );

    return `${STATIC_METAMASK_BASE_URL}/api/v2/tokenIcons/assets/${normalizedAssetId}.png`;
  } catch {
    return '';
  }
}

/**
 * Returns whether a balance row is a DeFi position carrying protocol metadata.
 *
 * @param balance - A balance row from the v6 API.
 * @returns True when the row is a `category: defi` row with protocol metadata.
 */
function isDefiBalanceWithMetadata(
  balance: V6BalanceItem,
): balance is DefiBalanceWithMetadata {
  return (
    balance.category === 'defi' &&
    balance.metadata !== undefined &&
    (balance.metadata as Partial<V6BalanceMetadata>).protocolId !== undefined
  );
}

/**
 * Returns the parsed balance amount for a v6 balance row.
 *
 * @param balance - A balance row from the v6 API.
 * @returns The parsed balance, or 0 when invalid.
 */
function getNormalizedBalance(balance: V6BalanceItem): number {
  const normalizedBalance = Number.parseFloat(balance.balance);

  return Number.isFinite(normalizedBalance) ? normalizedBalance : 0;
}

/**
 * Returns the fiat market value for a v6 DeFi balance row.
 *
 * @param balance - A balance row from the v6 API.
 * @returns The fiat value, or 0 when unavailable.
 */
function getMarketValue(balance: V6BalanceItem): number {
  const normalizedBalance = getNormalizedBalance(balance);
  const price = Number.parseFloat(balance.price ?? '0');

  if (!Number.isFinite(price)) {
    return 0;
  }

  return normalizedBalance * price;
}

/**
 * Moves a priority symbol (ETH/WETH) to the front of the icon group.
 *
 * @param iconGroup - The icon-group entries to order.
 * @returns The ordered icon-group entries.
 */
function orderIconGroup(
  iconGroup: DeFiPositionIconGroupItem[],
): DeFiPositionIconGroupItem[] {
  const orderedIcons = [...iconGroup];
  const priorityIndex = orderedIcons.findIndex((item) =>
    SYMBOL_PRIORITY.includes(item.symbol),
  );

  if (priorityIndex > 0) {
    const [priorityIcon] = orderedIcons.splice(priorityIndex, 1);
    orderedIcons.unshift(priorityIcon);
  }

  return orderedIcons;
}

/**
 * Maps a DeFi balance row to a details-page underlying position.
 *
 * @param balance - A DeFi balance row with protocol metadata.
 * @returns The underlying position for the details page.
 */
function toUnderlyingPosition(
  balance: DefiBalanceWithMetadata,
): DeFiUnderlyingPosition {
  const assetId = balance.assetId as CaipAssetType;
  const { chainId } = parseCaipAssetType(assetId);
  const { positionType, poolAddress, protocolIconUrl } = balance.metadata;

  return {
    assetId,
    chainId,
    symbol: balance.symbol,
    name: balance.name,
    balance: balance.balance,
    normalizedBalance: getNormalizedBalance(balance),
    decimals: balance.decimals,
    marketValue: getMarketValue(balance),
    positionType,
    poolAddress,
    tokenImage: getDefiTokenImageUrl(assetId) || protocolIconUrl,
  };
}

/**
 * Mutable accumulator used while grouping a single protocol's positions.
 */
type MutableProtocolGroup = {
  protocolId: string;
  protocolName: string;
  protocolIconUrl: string;
  chainId: CaipChainId;
  marketValue: number;
  /** Underlying token symbol -> icon-group entry, deduped by symbol. */
  iconBySymbol: Map<string, DeFiPositionIconGroupItem>;
  /** protocolName -> (poolAddress -> positions), for details-page sections. */
  sectionByName: Map<string, Map<string, DeFiUnderlyingPosition[]>>;
};

/**
 * Finalizes a mutable protocol group into its stored, client-ready shape.
 *
 * @param group - The accumulated protocol group.
 * @returns The finalized protocol position group.
 */
function finalizeGroup(group: MutableProtocolGroup): DeFiProtocolPositionGroup {
  const iconGroup = orderIconGroup([...group.iconBySymbol.values()]);

  const sections: DeFiPositionDetailsSection[] = [
    ...group.sectionByName.entries(),
  ].map(([protocolName, poolGroups]) => ({
    protocolName,
    poolGroups: [...poolGroups.entries()].map(([poolAddress, positions]) => ({
      poolAddress,
      positions,
    })),
  }));

  return {
    protocolId: group.protocolId,
    protocolName: group.protocolName,
    protocolIconUrl: group.protocolIconUrl,
    chainId: group.chainId,
    marketValue: group.marketValue,
    underlyingSymbols: iconGroup.map(({ symbol }) => symbol),
    iconGroup,
    sections,
  };
}

/**
 * Transforms a v6 multiaccount balances response into the stored DeFi state:
 * positions keyed by internal account ID, each mapping to a flat list of
 * protocol groups. Every group carries its own `chainId` (so the client can
 * filter without a nested chain map) plus both the DeFi-tab summary and the
 * details-page sections. Accounts present in the response but with no DeFi
 * positions are included with an empty list so stale data is cleared.
 *
 * The v6 response keys accounts by the CAIP-10 ID sent to the API, so
 * `resolveAccountId` maps that back to the internal MetaMask account ID used to
 * key state. Accounts that do not resolve are skipped. It defaults to the
 * identity function (leaving the response ID) for callers that don't need the
 * mapping (e.g. tests).
 *
 * @param response - The v6 multiaccount balances response.
 * @param resolveAccountId - Maps a response (CAIP-10) account ID to the internal
 * account ID, or `undefined` to skip the account.
 * @returns DeFi positions keyed by internal account ID and chain.
 */
export function groupDeFiPositionsV6(
  response: V6BalancesResponse,
  resolveAccountId: (
    responseAccountId: string,
  ) => string | undefined = (id) => id,
): DeFiPositionsByAccount {
  const result: DeFiPositionsByAccount = {};

  for (const account of response.accounts) {
    const accountId = resolveAccountId(account.accountId);
    if (accountId === undefined) {
      continue;
    }

    // Seed every queried account so accounts that no longer hold positions
    // overwrite (clear) any previously stored data.
    const groupsByKey = new Map<string, MutableProtocolGroup>();

    for (const balance of account.balances) {
      if (!isDefiBalanceWithMetadata(balance)) {
        continue;
      }

      const assetId = balance.assetId as CaipAssetType;
      const { chainId } = parseCaipAssetType(assetId);
      const { protocolId, protocolName, protocolIconUrl, poolAddress } =
        balance.metadata;
      const groupKey = `${chainId}#${protocolId}`;
      const marketValue = getMarketValue(balance);
      const iconEntry: DeFiPositionIconGroupItem = {
        symbol: balance.symbol,
        avatarValue: getDefiTokenImageUrl(assetId),
      };
      const position = toUnderlyingPosition(balance);

      let group = groupsByKey.get(groupKey);
      if (!group) {
        group = {
          protocolId,
          protocolName,
          protocolIconUrl,
          chainId,
          marketValue: 0,
          iconBySymbol: new Map(),
          sectionByName: new Map(),
        };
        groupsByKey.set(groupKey, group);
      }

      group.marketValue += marketValue;
      group.iconBySymbol.set(balance.symbol, iconEntry);

      let poolGroups = group.sectionByName.get(protocolName);
      if (!poolGroups) {
        poolGroups = new Map();
        group.sectionByName.set(protocolName, poolGroups);
      }
      const poolPositions = poolGroups.get(poolAddress) ?? [];
      poolPositions.push(position);
      poolGroups.set(poolAddress, poolPositions);
    }

    result[accountId] = [...groupsByKey.values()].map(finalizeGroup);
  }

  return result;
}
