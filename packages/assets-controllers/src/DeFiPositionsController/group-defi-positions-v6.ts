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
  /** Token icon URL, when one can be built for the asset. */
  avatarValue?: string;
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
  decimals: number;
  /** Raw balance string as returned by the API. */
  balance: string;
  /** Fiat market value in the requested currency, when a price is available. */
  marketValue?: number;
  /** Position type from protocol metadata (e.g. supply, borrow, stake, reward). */
  positionType: string;
  /** Address of the pool this position belongs to. */
  poolAddress: string;
  /** Token icon URL, when one can be built for the asset. */
  tokenImage?: string;
};

/**
 * A section of the details page, grouping positions that share the same
 * API `protocolName`. A single `protocolId` can have multiple names
 * (different pools/products under one protocol), so a group may contain
 * several sections.
 */
export type DeFiPositionDetailsSection = {
  /** Section label from the API (`metadata.protocolName`). */
  protocolName: string;
  positions: DeFiUnderlyingPosition[];
};

/**
 * One row in the DeFi tab list (a protocol on a given chain), with the details
 * needed to render the details page embedded directly inside it.
 */
export type DeFiProtocolPositionGroup = {
  protocolId: string;
  /** Display name from the first position seen for this protocol. */
  protocolName: string;
  protocolIconUrl: string;
  chainId: CaipChainId;
  /** Aggregated fiat market value across all positions in the group. */
  marketValue: number;
  /** Icon-group entries for the list row. */
  iconGroup: DeFiPositionIconGroupItem[];
  /**
   * Detail sections consumed by the details page, one per distinct API
   * `protocolName` under this `protocolId`.
   */
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

// Prefer ETH/WETH first in the list-row icon stack when a protocol has multiple
// underlyings. Display-only.
const SYMBOL_PRIORITY = ['ETH', 'WETH'];

type DefiBalanceWithMetadata = V6BalanceItem & { metadata: V6BalanceMetadata };

/**
 * Builds a static token icon URL for a CAIP asset ID.
 *
 * @param assetId - The CAIP-19 asset ID.
 * @returns The token icon URL, or `undefined` when it cannot be built.
 */
function getDefiTokenImageUrl(assetId: CaipAssetType): string | undefined {
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
    return undefined;
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
 * Returns the fiat market value for a v6 DeFi balance row.
 *
 * @param balance - A balance row from the v6 API.
 * @returns The fiat value, or `undefined` when price is missing or the
 * balance/price is invalid.
 */
function getMarketValue(balance: V6BalanceItem): number | undefined {
  if (balance.price === undefined) {
    return undefined;
  }

  const normalizedBalance = Number.parseFloat(balance.balance);
  const price = Number.parseFloat(balance.price);

  if (!Number.isFinite(normalizedBalance) || !Number.isFinite(price)) {
    return undefined;
  }

  return normalizedBalance * price;
}

/**
 * Moves a priority symbol (ETH/WETH) to the front of the icon group, in place.
 *
 * @param iconGroup - The icon-group entries to reorder.
 */
function orderIconGroup(iconGroup: DeFiPositionIconGroupItem[]): void {
  const priorityIndex = iconGroup.findIndex((item) =>
    SYMBOL_PRIORITY.includes(item.symbol),
  );

  if (priorityIndex > 0) {
    const [priorityIcon] = iconGroup.splice(priorityIndex, 1);
    iconGroup.unshift(priorityIcon);
  }
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
  const { positionType, poolAddress } = balance.metadata;

  return {
    assetId,
    chainId,
    symbol: balance.symbol,
    name: balance.name,
    balance: balance.balance,
    decimals: balance.decimals,
    marketValue: getMarketValue(balance),
    positionType,
    poolAddress,
    tokenImage: getDefiTokenImageUrl(assetId),
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
  resolveAccountId: (responseAccountId: string) => string | undefined = (id) =>
    id,
): DeFiPositionsByAccount {
  // Accumulate groups per resolved internal account ID. The v6 response returns
  // a separate entry per chain (e.g. `eip155:1:<addr>`, `eip155:137:<addr>`),
  // and several of them can resolve to the same internal account ID, so we must
  // merge across all of them rather than overwrite per response account.
  const groupsByAccountKey = new Map<
    string,
    Map<string, DeFiProtocolPositionGroup>
  >();

  for (const account of response.accounts) {
    const accountId = resolveAccountId(account.accountId);
    if (accountId === undefined) {
      continue;
    }

    // Seed every queried account so accounts that no longer hold positions
    // overwrite (clear) any previously stored data.
    let groupsByKey = groupsByAccountKey.get(accountId);
    if (!groupsByKey) {
      groupsByKey = new Map<string, DeFiProtocolPositionGroup>();
      groupsByAccountKey.set(accountId, groupsByKey);
    }

    for (const balance of account.balances) {
      if (!isDefiBalanceWithMetadata(balance)) {
        continue;
      }

      const position = toUnderlyingPosition(balance);
      const { protocolId, protocolName, protocolIconUrl } = balance.metadata;
      const groupKey = `${position.chainId}#${protocolId}`;

      let group = groupsByKey.get(groupKey);
      if (!group) {
        group = {
          protocolId,
          protocolName,
          protocolIconUrl,
          chainId: position.chainId,
          marketValue: 0,
          iconGroup: [],
          sections: [],
        };
        groupsByKey.set(groupKey, group);
      }

      if (position.marketValue !== undefined) {
        group.marketValue += position.marketValue;
      }

      if (!group.iconGroup.some((item) => item.symbol === position.symbol)) {
        group.iconGroup.push({
          symbol: position.symbol,
          avatarValue: position.tokenImage,
        });
      }

      let section = group.sections.find(
        (item) => item.protocolName === protocolName,
      );
      if (!section) {
        section = { protocolName, positions: [] };
        group.sections.push(section);
      }
      section.positions.push(position);
    }
  }

  const result: DeFiPositionsByAccount = {};
  for (const [accountId, groupsByKey] of groupsByAccountKey) {
    const groups = [...groupsByKey.values()];
    for (const group of groups) {
      orderIconGroup(group.iconGroup);
    }
    result[accountId] = groups;
  }

  return result;
}
