/**
 * Identity of the reported BNB Chain spam-token wallet.
 *
 * Kept separate from `./bscSpamWallet.ts` so `./captureApiResponses.ts` can
 * read these constants without importing the capture files it is responsible
 * for writing.
 */
import type { Caip19AssetId, ChainId } from '../../types.js';

/** BNB Smart Chain. Absent from `/v1/suggestedOccurrenceFloors`, so its floor is the default 3. */
export const BSC_CHAIN_ID: ChainId = 'eip155:56';

/** The reporter's wallet, as it appears in the Accounts API request. */
export const BSC_SPAM_WALLET_ADDRESS =
  '0x9decDe522Cc1285efe18AfdE31C79e89dee2e91E';

/** `InternalAccount.id` (a UUID), not the address — see `AccountId`. */
export const BSC_SPAM_ACCOUNT_ID = 'b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

/**
 * The spam token from the report: `$$$DOGECHAIN` / `CDOGE`, one aggregator
 * occurrence against a floor of three.
 *
 * Both casings matter. The Accounts API answers lower-case and
 * `AccountsApiDataSource` checksums what it stores, while the Tokens API echoes
 * `assetId` lower-case — the mismatch this fixture exists to exercise.
 */
export const CDOGE_ADDRESS_LOWERCASE =
  '0xa7255c85232a42b5c602ed66c319da9af8433bb3';

export const CDOGE_ADDRESS_CHECKSUM =
  '0xA7255C85232A42B5c602ed66c319dA9af8433bb3';

export const CDOGE_ASSET_ID_LOWERCASE =
  `${BSC_CHAIN_ID}/erc20:${CDOGE_ADDRESS_LOWERCASE}` as Caip19AssetId;

export const CDOGE_ASSET_ID_CHECKSUM =
  `${BSC_CHAIN_ID}/erc20:${CDOGE_ADDRESS_CHECKSUM}` as Caip19AssetId;

/** Native BNB, which is never occurrence-filtered. */
export const BNB_ASSET_ID = `${BSC_CHAIN_ID}/slip44:714` as Caip19AssetId;
