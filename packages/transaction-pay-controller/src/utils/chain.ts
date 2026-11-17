import type { CaipChainId, Hex } from '@metamask/utils';
import { isStrictHexString } from '@metamask/utils';

import type { QuoteRequest } from '../types.js';

/** Quote request whose target is on an EVM chain. */
export type EvmQuoteRequest = QuoteRequest & {
  recipient?: Hex;
  targetChainId: Hex;
  targetTokenAddress: Hex;
};

/**
 * Check if a chain ID belongs to an EVM chain.
 *
 * EVM chains use hexadecimal chain IDs, whereas non-EVM chains use CAIP-2 IDs.
 *
 * @param chainId - Hexadecimal or CAIP-2 chain ID.
 * @returns True if the chain is an EVM chain.
 */
export function isEvmChainId(chainId: Hex | CaipChainId): chainId is Hex {
  return isStrictHexString(chainId);
}

/**
 * Check if a quote request targets an EVM chain.
 *
 * @param request - Quote request.
 * @returns True if the target chain is an EVM chain.
 */
export function isEvmQuoteRequest(
  request: QuoteRequest,
): request is EvmQuoteRequest {
  return isEvmChainId(request.targetChainId);
}

/**
 * Assert that a quote request targets an EVM chain.
 *
 * Used by flows that execute calls on the target chain, which are only
 * supported on EVM chains.
 *
 * @param request - Quote request.
 */
export function assertEvmQuoteRequest(
  request: QuoteRequest,
): asserts request is EvmQuoteRequest {
  if (!isEvmQuoteRequest(request)) {
    throw new Error(
      `Unsupported non-EVM target chain: ${request.targetChainId}`,
    );
  }
}
