import { toChecksumHexAddress } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import type { TransactionPayControllerMessenger } from '../types';

/**
 * Get the token balance for a specific account and token.
 *
 * @param messenger - Controller messenger.
 * @param account - Address of the account.
 * @param chainId - Id of the chain.
 * @param tokenAddress - Address of the token contract.
 * @returns The token balance as a BigNumber.
 */
export function getTokenBalance(
  messenger: TransactionPayControllerMessenger,
  account: Hex,
  chainId: Hex,
  tokenAddress: Hex,
): string {
  const controllerState = messenger.call('TokenBalancesController:getState');
  const normalizedAccount = account.toLowerCase() as Hex;
  const normalizedTokenAddress = toChecksumHexAddress(tokenAddress) as Hex;

  const balanceHex =
    controllerState.tokenBalances?.[normalizedAccount]?.[chainId]?.[
      normalizedTokenAddress
    ];

  return new BigNumber(balanceHex ?? '0x0', 16).toString(10);
}

/**
 * Get the token decimals for a specific token.
 *
 * @param messenger - Controller messenger.
 * @param tokenAddress - Address of the token contract.
 * @param chainId - Id of the chain.
 * @returns The token decimals or undefined if the token is not found.
 */
export function getTokenDecimals(
  messenger: TransactionPayControllerMessenger,
  tokenAddress: Hex,
  chainId: Hex,
): number | undefined {
  const controllerState = messenger.call('TokensController:getState');
  const normalizedTokenAddress = tokenAddress.toLowerCase() as Hex;

  const token = Object.values(controllerState.allTokens?.[chainId] ?? {})
    .flat()
    .find((t) => t.address.toLowerCase() === normalizedTokenAddress);

  return token?.decimals;
}

/**
 * Calculate fiat rates for a specific token.
 *
 * @param messenger - Controller messenger.
 * @param tokenAddress - Address of the token contract.
 * @param chainId - Id of the chain.
 * @returns An object containing the USD and fiat rates, or undefined if rates are not available.
 */
export function getTokenFiatRate(
  messenger: TransactionPayControllerMessenger,
  tokenAddress: Hex,
  chainId: Hex,
): { usdRate: string; fiatRate: string } | undefined {
  let ticker;

  try {
    const networkClientId = messenger.call(
      'NetworkController:findNetworkClientIdByChainId',
      chainId,
    );

    const networkConfiguration = messenger.call(
      'NetworkController:getNetworkClientById',
      networkClientId,
    );

    ticker = networkConfiguration.configuration.ticker;
  } catch {
    // Intentionally empty
  }

  if (!ticker) {
    return undefined;
  }

  const rateControllerState = messenger.call('TokenRatesController:getState');

  const currencyRateControllerState = messenger.call(
    'CurrencyRateController:getState',
  );

  const normalizedTokenAddress = toChecksumHexAddress(tokenAddress) as Hex;

  const tokenToNativeRate =
    rateControllerState.marketData?.[chainId]?.[normalizedTokenAddress]?.price;

  if (tokenToNativeRate === undefined) {
    return undefined;
  }

  const {
    conversionRate: nativeToFiatRate,
    usdConversionRate: nativeToUsdRate,
  } = currencyRateControllerState.currencyRates?.[ticker] ?? {
    conversionRate: null,
    usdConversionRate: null,
  };

  if (nativeToFiatRate === null || nativeToUsdRate === null) {
    return undefined;
  }

  const usdRate = new BigNumber(tokenToNativeRate)
    .multipliedBy(nativeToUsdRate)
    .toString(10);

  const fiatRate = new BigNumber(tokenToNativeRate)
    .multipliedBy(nativeToFiatRate)
    .toString(10);

  return { usdRate, fiatRate };
}
