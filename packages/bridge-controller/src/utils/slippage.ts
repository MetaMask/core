import { isCrossChain, isSolanaChainId } from './bridge';
import type { GenericQuoteRequest } from '../types';

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
 * @param options.srcTokenAddress - the source token address
 * @param options.destTokenAddress - the destination token address
 * @param options.srcChainId - the source chain id
 * @param options.destChainId - the destination chain id
 * @param srcStablecoins - the list of stablecoins on the source chain
 * @param destStablecoins - the list of stablecoins on the destination chain
 
 * @returns the default slippage percentage for the chain and token pair
 */
export const getDefaultSlippagePercentage = (
  {
    srcTokenAddress,
    destTokenAddress,
    srcChainId,
    destChainId,
  }: Partial<
    Pick<
      GenericQuoteRequest,
      'srcTokenAddress' | 'destTokenAddress' | 'srcChainId' | 'destChainId'
    >
  >,
  srcStablecoins?: string[],
  destStablecoins?: string[],
) => {
  if (!srcChainId || isCrossChain(srcChainId, destChainId)) {
    return BRIDGE_DEFAULT_SLIPPAGE;
  }

  if (isSolanaChainId(srcChainId)) {
    return SWAP_SOLANA_SLIPPAGE;
  }

  if (
    srcTokenAddress &&
    destTokenAddress &&
    srcStablecoins
      ?.map((stablecoin) => stablecoin.toLowerCase())
      .includes(srcTokenAddress.toLowerCase()) &&
    // If destChainId is undefined, treat req as a swap and fallback to srcStablecoins
    (destStablecoins ?? srcStablecoins)
      ?.map((stablecoin) => stablecoin.toLowerCase())
      .includes(destTokenAddress.toLowerCase())
  ) {
    return SWAP_EVM_STABLECOIN_SLIPPAGE;
  }

  return SWAP_EVM_DEFAULT_SLIPPAGE;
};
