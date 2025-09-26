import type { Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { getTokenBalance, getTokenDecimals, getTokenFiatRate } from './token';
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

  const tokenFiatRate = getTokenFiatRate(messenger, tokenAddress, chainId);

  if (tokenFiatRate === undefined) {
    return undefined;
  }

  const balance = getTokenBalance(messenger, from, chainId, tokenAddress);
  const balanceRawValue = new BigNumber(balance);
  const balanceHumanValue = new BigNumber(balance).shiftedBy(-decimals);
  const balanceRaw = balanceRawValue.toFixed(0);
  const balanceHuman = balanceHumanValue.toString(10);

  const balanceFiat = balanceHumanValue
    .multipliedBy(tokenFiatRate.fiatRate)
    .toString(10);

  const balanceUsd = balanceHumanValue
    .multipliedBy(tokenFiatRate.usdRate)
    .toString(10);

  return {
    address: tokenAddress,
    balanceFiat,
    balanceHuman,
    balanceRaw,
    balanceUsd,
    chainId,
    decimals,
  };
}
