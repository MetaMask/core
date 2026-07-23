/* eslint-disable no-restricted-syntax */
import type { GenericQuoteRequest } from '../types.js';
import { isNonEvmChainId } from '../utils/bridge.js';

export const isValidQuoteRequest = (
  partialRequest: Partial<GenericQuoteRequest>,
  requireAmount = true,
): partialRequest is GenericQuoteRequest => {
  const stringFields = [
    'srcTokenAddress',
    'destTokenAddress',
    'srcChainId',
    'destChainId',
    'walletAddress',
  ];
  if (requireAmount) {
    stringFields.push('srcTokenAmount');
  }
  // If bridging between different chain types or different non-EVM chains, require dest wallet address
  // Cases that need destWalletAddress:
  // 1. EVM -> non-EVM
  // 2. non-EVM -> EVM
  // 3. non-EVM -> different non-EVM (e.g., SOL -> BTC)
  // Only same-chain swaps don't need destWalletAddress
  if (
    partialRequest.destChainId &&
    partialRequest.srcChainId &&
    partialRequest.destChainId !== partialRequest.srcChainId && // Different chains
    (isNonEvmChainId(partialRequest.destChainId) ||
      isNonEvmChainId(partialRequest.srcChainId)) // At least one is non-EVM
  ) {
    stringFields.push('destWalletAddress');
    if (!partialRequest.destWalletAddress) {
      return false;
    }
  }
  const numberFields = [];
  // if slippage is defined, require it to be a number
  if (partialRequest.slippage !== undefined) {
    numberFields.push('slippage');
  }

  return (
    stringFields.every(
      (field) =>
        field in partialRequest &&
        typeof partialRequest[field as keyof typeof partialRequest] ===
          'string' &&
        partialRequest[field as keyof typeof partialRequest] !== undefined &&
        partialRequest[field as keyof typeof partialRequest] !== '' &&
        partialRequest[field as keyof typeof partialRequest] !== null,
    ) &&
    numberFields.every(
      (field) =>
        field in partialRequest &&
        typeof partialRequest[field as keyof typeof partialRequest] ===
          'number' &&
        partialRequest[field as keyof typeof partialRequest] !== undefined &&
        !isNaN(Number(partialRequest[field as keyof typeof partialRequest])) &&
        partialRequest[field as keyof typeof partialRequest] !== null,
    ) &&
    (requireAmount
      ? Boolean((partialRequest.srcTokenAmount ?? '').match(/^[1-9]\d*$/u))
      : true)
  );
};

export const isValidBatchSellQuoteRequest = (
  quoteRequests: Partial<GenericQuoteRequest>[],
  requireAmount = true,
): quoteRequests is GenericQuoteRequest[] =>
  quoteRequests.every((req) => isValidQuoteRequest(req, requireAmount));
