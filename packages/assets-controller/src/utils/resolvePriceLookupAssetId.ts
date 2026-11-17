import { STAKING_CONTRACT_ADDRESS_BY_CHAINID } from '../data-sources/evm-rpc-services/utils/staking-contracts.js';
import type { Caip19AssetId } from '../types.js';
import { NATIVE_ASSETS } from './native-assets.js';
import { normalizeAssetId } from './normalizeAssetId.js';

const MAINNET_STAKING_ASSET_ID = normalizeAssetId(
  `eip155:1/erc20:${STAKING_CONTRACT_ADDRESS_BY_CHAINID['eip155:1']}`,
);
const MAINNET_STAKING_ASSET_ID_LOWERCASE =
  MAINNET_STAKING_ASSET_ID.toLowerCase();

/**
 * Resolve price dependencies for staking balances already converted to ETH.
 * Mainnet has a stable native identifier; Hoodi's runtime registry is not
 * available to every price reader, so its identifier remains unchanged.
 *
 * @param assetId - Original balance or requested asset identifier.
 * @returns The native mainnet price identifier for its staking position.
 */
export function resolvePriceLookupAssetId(
  assetId: Caip19AssetId,
): Caip19AssetId {
  if (
    assetId === MAINNET_STAKING_ASSET_ID ||
    (assetId.length === MAINNET_STAKING_ASSET_ID.length &&
      assetId.startsWith('eip155:1/erc20:') &&
      assetId.toLowerCase() === MAINNET_STAKING_ASSET_ID_LOWERCASE)
  ) {
    return NATIVE_ASSETS['eip155:1'];
  }
  return assetId;
}
