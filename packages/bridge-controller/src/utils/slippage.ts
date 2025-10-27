import type { CaipAssetType } from '@metamask/utils';
import { parseCaipAssetType } from '@metamask/utils';

import { isCrossChain, isSolanaChainId } from './bridge';

export const BRIDGE_DEFAULT_SLIPPAGE = 0.5;
const SWAP_SOLANA_SLIPPAGE = undefined;
const SWAP_EVM_STABLECOIN_SLIPPAGE = 0.5;
const SWAP_EVM_DEFAULT_SLIPPAGE = 2;

/**
 * Calculates the appropriate slippage based on the transaction context
 *
 * Rules:
 * - Bridge (cross-chain): Always 0.5%
 * - Swap on Solana: Always undefined (AUTO mode)
 * - Swap on EVM stablecoin pairs (same chain only): 0.5%
 * - Swap on EVM other pairs: 2%
 *
 * @param options - the options for the destination chain
 * @param options.stablecoins - the list of stablecoins
 * @param options.srcAssetId - the source token asset id
 * @param options.destAssetId - the destination token asset id
 * @returns the default slippage percentage for the chain and token pair
 */
export const getDefaultSlippagePercentage = ({
  srcAssetId,
  destAssetId,
  stablecoins,
}: {
  srcAssetId?: CaipAssetType;
  destAssetId?: CaipAssetType;
  stablecoins: CaipAssetType[];
}) => {
  if (!srcAssetId || !destAssetId) {
    return BRIDGE_DEFAULT_SLIPPAGE;
  }

  // Parse the chainId from the token assetIds
  const { chainId: srcChainId } = parseCaipAssetType(srcAssetId);
  const { chainId: destChainId } = parseCaipAssetType(destAssetId);

  if (isCrossChain(srcChainId, destChainId)) {
    return BRIDGE_DEFAULT_SLIPPAGE;
  }

  // Solana swap AUTO slippage
  if (isSolanaChainId(srcChainId)) {
    return SWAP_SOLANA_SLIPPAGE;
  }

  // Swap between 2 EVM stablecoins
  if (
    stablecoins.includes(srcAssetId.toLowerCase() as CaipAssetType) &&
    stablecoins.includes(destAssetId.toLowerCase() as CaipAssetType)
  ) {
    return SWAP_EVM_STABLECOIN_SLIPPAGE;
  }

  return SWAP_EVM_DEFAULT_SLIPPAGE;
};
