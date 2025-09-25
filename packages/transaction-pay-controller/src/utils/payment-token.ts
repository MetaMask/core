import type { Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { getTokenBalance, getTokenDecimals } from './token';
import type {
  TransactionPayControllerMessenger,
  TransactionPaymentToken,
} from '../types';

/**
 * Generate the full payment token data from a token address and chain ID.
 *
 * @param request - The payment token request parameters.
 * @param request.chainId - The chain ID.
 * @param request.from - The address to get the token balance for.
 * @param request.messenger - The transaction pay controller messenger.
 * @param request.tokenAddress - The token address.
 * @returns The payment token or undefined if the token data could not be retrieved.
 */
export function getPaymentToken({
  chainId,
  from,
  messenger,
  tokenAddress,
}: {
  chainId: Hex;
  from: Hex;
  messenger: TransactionPayControllerMessenger;
  tokenAddress: Hex;
}): TransactionPaymentToken | undefined {
  const decimals = getTokenDecimals(messenger, tokenAddress, chainId);

  if (decimals === undefined) {
    return undefined;
  }

  const balance = getTokenBalance(messenger, from, chainId, tokenAddress);

  const balanceRawValue = new BigNumber(balance);
  const balanceRaw = balanceRawValue.toFixed(0);
  const balanceHuman = balanceRawValue.shiftedBy(-decimals).toString(10);

  return {
    address: tokenAddress,
    balanceHuman,
    balanceRaw,
    chainId,
    decimals,
  };
}
