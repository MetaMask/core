import { toChecksumHexAddress } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';
import { uniq } from 'lodash';

import { NATIVE_TOKEN_ADDRESS } from '../constants';
import type { FiatRates, TransactionPayControllerMessenger } from '../types';

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
  const tokenBalanceControllerState = messenger.call(
    'TokenBalancesController:getState',
  );

  const normalizedAccount = account.toLowerCase() as Hex;
  const normalizedTokenAddress = toChecksumHexAddress(tokenAddress) as Hex;
  const isNative = normalizedTokenAddress === getNativeToken(chainId);

  const balanceHex =
    tokenBalanceControllerState.tokenBalances?.[normalizedAccount]?.[chainId]?.[
      normalizedTokenAddress
    ];

  if (!isNative && balanceHex === undefined) {
    return '0';
  }

  if (!isNative && balanceHex) {
    return new BigNumber(balanceHex, 16).toString(10);
  }

  const accountTrackerControllerState = messenger.call(
    'AccountTrackerController:getState',
  );

  const chainAccounts =
    accountTrackerControllerState.accountsByChainId?.[chainId];

  const checksumAccount = toChecksumHexAddress(normalizedAccount) as Hex;
  const nativeBalanceHex = chainAccounts?.[checksumAccount]?.balance as Hex;

  return new BigNumber(nativeBalanceHex ?? '0x0', 16).toString(10);
}

/**
 * Get the token balance for a specific account and token.
 *
 * @param messenger - Controller messenger.
 * @param account - Address of the account.
 * @returns The token balance as a BigNumber.
 */
export function getAllTokenBalances(
  messenger: TransactionPayControllerMessenger,
  account: Hex,
) {
  const tokenBalanceControllerState = messenger.call(
    'TokenBalancesController:getState',
  );

  const accountTrackerControllerState = messenger.call(
    'AccountTrackerController:getState',
  );

  const nativeChainIds = Object.keys(
    accountTrackerControllerState.accountsByChainId,
  ) as Hex[];

  const normalizedAccount = account.toLowerCase() as Hex;

  const balancesByTokenByChain =
    tokenBalanceControllerState.tokenBalances?.[normalizedAccount];

  const tokenChainIds = Object.keys(balancesByTokenByChain) as Hex[];
  const chainIds = uniq([...tokenChainIds, ...nativeChainIds]);

  return chainIds.flatMap((chainId) => {
    const tokenAddresses = [
      ...(Object.keys(balancesByTokenByChain[chainId] ?? {}) as Hex[]),
      getNativeToken(chainId),
    ];

    return tokenAddresses.map((tokenAddress) => ({
      chainId,
      tokenAddress,
      balance: getTokenBalance(messenger, account, chainId, tokenAddress),
    }));
  });
}

/**
 * Get the token decimals for a specific token.
 *
 * @param messenger - Controller messenger.
 * @param tokenAddress - Address of the token contract.
 * @param chainId - Id of the chain.
 * @returns The token decimals or undefined if the token is not found.
 */
export function getTokenInfo(
  messenger: TransactionPayControllerMessenger,
  tokenAddress: Hex,
  chainId: Hex,
): { decimals: number; symbol: string } | undefined {
  const controllerState = messenger.call('TokensController:getState');
  const normalizedTokenAddress = tokenAddress.toLowerCase() as Hex;

  const isNative =
    normalizedTokenAddress === getNativeToken(chainId).toLowerCase();

  const token = Object.values(controllerState.allTokens?.[chainId] ?? {})
    .flat()
    .find((t) => t.address.toLowerCase() === normalizedTokenAddress);

  if (!token && !isNative) {
    return undefined;
  }

  if (token && !isNative) {
    return { decimals: Number(token.decimals), symbol: token.symbol };
  }

  const ticker = getTicker(chainId, messenger);

  if (!ticker) {
    return undefined;
  }

  return { decimals: 18, symbol: ticker };
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
): FiatRates | undefined {
  const ticker = getTicker(chainId, messenger);

  if (!ticker) {
    return undefined;
  }

  const rateControllerState = messenger.call('TokenRatesController:getState');

  const currencyRateControllerState = messenger.call(
    'CurrencyRateController:getState',
  );

  const normalizedTokenAddress = toChecksumHexAddress(tokenAddress) as Hex;
  const isNative = normalizedTokenAddress === getNativeToken(chainId);

  const tokenToNativeRate =
    rateControllerState.marketData?.[chainId]?.[normalizedTokenAddress]?.price;

  if (tokenToNativeRate === undefined && !isNative) {
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

  const usdRate = new BigNumber(tokenToNativeRate ?? 1)
    .multipliedBy(nativeToUsdRate)
    .toString(10);

  const fiatRate = new BigNumber(tokenToNativeRate ?? 1)
    .multipliedBy(nativeToFiatRate)
    .toString(10);

  return { usdRate, fiatRate };
}

/**
 * Get the native token address for a given chain ID.
 *
 * @param chainId - Chain ID.
 * @returns - Native token address for the given chain ID.
 */
export function getNativeToken(chainId: Hex) {
  switch (chainId) {
    case '0x89':
      return '0x0000000000000000000000000000000000001010';
    default:
      return NATIVE_TOKEN_ADDRESS;
  }
}

/**
 * Get the ticker for a given chain ID.
 *
 * @param chainId - Chain ID.
 * @param messenger - Messenger instance.
 * @returns Ticker symbol for the given chain ID or undefined if not found.
 */
function getTicker(
  chainId: Hex,
  messenger: TransactionPayControllerMessenger,
): string | undefined {
  try {
    const networkClientId = messenger.call(
      'NetworkController:findNetworkClientIdByChainId',
      chainId,
    );

    const networkConfiguration = messenger.call(
      'NetworkController:getNetworkClientById',
      networkClientId,
    );

    return networkConfiguration.configuration.ticker;
  } catch {
    return undefined;
  }
}
