/**
 * The reported BNB Chain wallet, described in the terms the assets pipeline
 * works in: an `InternalAccount`, an empty starting state, and the asset ID
 * sets the occurrence filter is supposed to sort the wallet's 38 holdings into.
 *
 * Everything is derived from the captured API responses in `./api-responses/`
 * rather than hand-listed, so a re-capture cannot leave the expectations
 * describing occurrence counts the fixtures no longer contain.
 */
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { parseCaipAssetType } from '@metamask/utils';

import type {
  AssetsControllerStateInternal,
  Caip19AssetId,
} from '../../types.js';
import { normalizeAssetId } from '../../utils/index.js';
import suggestedOccurrenceFloors from './api-responses/token-api/suggestedOccurrenceFloors.js';
import v5MultiAccountBalances from './api-responses/accounts-api/v5-multiaccount-balances.js';
import v3Assets from './api-responses/tokens-api/v3-assets.js';
import {
  BSC_CHAIN_ID,
  BSC_SPAM_ACCOUNT_ID,
  BSC_SPAM_WALLET_ADDRESS,
} from './wallet.js';

export {
  BNB_ASSET_ID,
  BSC_CHAIN_ID,
  BSC_SPAM_ACCOUNT_ID,
  BSC_SPAM_WALLET_ADDRESS,
  CDOGE_ASSET_ID_CHECKSUM,
  CDOGE_ASSET_ID_LOWERCASE,
} from './wallet.js';

/**
 * The floor `TokenDataSource` falls back to when a chain has no entry in
 * `/v1/suggestedOccurrenceFloors`. Mirrors its private constant.
 */
const DEFAULT_OCCURRENCE_FLOOR = 3;

const FLOORS = suggestedOccurrenceFloors as Record<string, number>;

/** BNB Chain's effective floor: no entry in the captured floors, so the default. */
export const BSC_OCCURRENCE_FLOOR =
  FLOORS[BSC_CHAIN_ID.split(':')[1]] ?? DEFAULT_OCCURRENCE_FLOOR;

/** Every asset the wallet holds, keyed as the Accounts API returns it (lower-case). */
export const BSC_SPAM_WALLET_ASSET_IDS: Caip19AssetId[] =
  v5MultiAccountBalances.balances.map((item) => item.assetId as Caip19AssetId);

/**
 * The same holdings keyed the way `AccountsApiDataSource` stores them: ERC-20
 * addresses checksummed. This is the casing the pipeline response and the
 * controller state use, and therefore the casing the exported asset ID sets use.
 */
const ASSET_IDS_NORMALIZED: Caip19AssetId[] =
  BSC_SPAM_WALLET_ASSET_IDS.map(normalizeAssetId);

const OCCURRENCES_BY_LOWER_ID = new Map<string, number | undefined>(
  Object.entries(v3Assets as Record<string, { occurrences?: number }>).map(
    ([assetId, asset]) => [assetId.toLowerCase(), asset.occurrences],
  ),
);

/**
 * Occurrence count the Tokens API reports for an asset, or `undefined` when it
 * does not carry the token at all.
 *
 * @param assetId - CAIP-19 asset ID, in any casing.
 * @returns The captured occurrence count, if any.
 */
export function occurrencesFor(assetId: string): number | undefined {
  return OCCURRENCES_BY_LOWER_ID.get(assetId.toLowerCase());
}

/**
 * Split the wallet's ERC-20 holdings by the occurrence floor. Native BNB is
 * excluded: `TokenDataSource` never occurrence-filters native assets.
 *
 * @returns The sub-floor (spam) and at-or-above-floor (genuine) asset IDs,
 * checksummed as the pipeline response keys them.
 */
function partitionByOccurrenceFloor(): {
  subFloor: Caip19AssetId[];
  aboveFloor: Caip19AssetId[];
} {
  const subFloor: Caip19AssetId[] = [];
  const aboveFloor: Caip19AssetId[] = [];

  for (const assetId of ASSET_IDS_NORMALIZED) {
    if (parseCaipAssetType(assetId).assetNamespace !== 'erc20') {
      continue;
    }
    // `undefined` counts as zero, matching `TokenDataSource`'s `?? 0`.
    const occurrences = occurrencesFor(assetId) ?? 0;
    if (occurrences < BSC_OCCURRENCE_FLOOR) {
      subFloor.push(assetId);
    } else {
      aboveFloor.push(assetId);
    }
  }

  return { subFloor, aboveFloor };
}

const { subFloor, aboveFloor } = partitionByOccurrenceFloor();

/**
 * ERC-20s below BNB Chain's occurrence floor — the airdropped spam the
 * pipeline is supposed to drop. Includes the reported `CDOGE`.
 */
export const SUB_FLOOR_ASSET_IDS: Caip19AssetId[] = subFloor;

/** ERC-20s at or above the floor — genuine holdings that must survive. */
export const ABOVE_FLOOR_ASSET_IDS: Caip19AssetId[] = aboveFloor;

/**
 * Build the wallet's `InternalAccount`.
 *
 * Scoped to BNB Chain only, so `accountsWithSupportedChains` resolves to the
 * one chain under test.
 *
 * @param overrides - Fields to override on the account.
 * @returns The internal account.
 */
export function buildBscSpamAccount(
  overrides?: Partial<InternalAccount>,
): InternalAccount {
  return {
    id: BSC_SPAM_ACCOUNT_ID,
    address: BSC_SPAM_WALLET_ADDRESS,
    options: {},
    methods: [],
    type: 'eip155:eoa',
    scopes: [BSC_CHAIN_ID],
    metadata: {
      name: 'BSC Spam Wallet',
      keyring: { type: 'HD Key Tree' },
      importTime: 1_756_100_000_000,
      lastSelected: 1_756_200_000_000,
    },
    ...overrides,
  } as InternalAccount;
}

/**
 * A fresh wallet: no balances, metadata, prices or custom assets yet, so the
 * first pipeline pass sees every holding as newly detected.
 *
 * @param overrides - State slices to override.
 * @returns The starting state.
 */
export function buildEmptyAssetsState(
  overrides?: Partial<AssetsControllerStateInternal>,
): AssetsControllerStateInternal {
  return {
    assetsInfo: {},
    assetsBalance: {},
    assetsPrice: {},
    customAssets: {},
    assetPreferences: {},
    selectedCurrency: 'usd',
    ...overrides,
  };
}
