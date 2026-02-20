import { Contract } from '@ethersproject/contracts';
import { Web3Provider } from '@ethersproject/providers';
import { toChecksumHexAddress } from '@metamask/controller-utils';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import type { Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';
import { uniq } from 'lodash';

import { NATIVE_TOKEN_ADDRESS, STABLECOINS } from '../constants';
import type { FiatRates, TransactionPayControllerMessenger } from '../types';

/**
 * Check if two tokens are the same (same address and chain).
 *
 * @param token1 - First token identifier.
 * @param token1.address - Token address.
 * @param token1.chainId - Token chain ID.
 * @param token2 - Second token identifier.
 * @param token2.address - Token address.
 * @param token2.chainId - Token chain ID.
 * @returns True if tokens are the same, false otherwise.
 */
export function isSameToken(
  token1: { address: Hex; chainId: Hex },
  token2: { address: Hex; chainId: Hex },
): boolean {
  return (
    token1.address.toLowerCase() === token2.address.toLowerCase() &&
    token1.chainId === token2.chainId
  );
}

/**
 * Get the token balance for a specific account and token.
 *
 * @param messenger - Controller messenger.
 * @param account - Address of the account.
 * @param chainId - Id of the chain.
 * @param tokenAddress - Address of the token contract.
 * @returns Raw token balance as a decimal string.
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
): {
  balance: string;
  chainId: Hex;
  tokenAddress: Hex;
}[] {
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
    .find(
      (singleToken) =>
        singleToken.address.toLowerCase() === normalizedTokenAddress,
    );

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
  const isStablecoin = STABLECOINS[chainId]?.includes(
    tokenAddress.toLowerCase() as Hex,
  );

  const usdRate = isStablecoin
    ? '1'
    : new BigNumber(tokenToNativeRate ?? 1)
        .multipliedBy(nativeToUsdRate)
        .toString(10);

  const fiatRate = new BigNumber(tokenToNativeRate ?? 1)
    .multipliedBy(nativeToFiatRate)
    .toString(10);

  return { usdRate, fiatRate };
}

/**
 * Calculate the human-readable, raw, USD, and fiat representations of a token amount.
 *
 * @param rawInput - Raw token amount (decimal string, hex, or BigNumber).
 * @param decimals - Number of decimals for the token.
 * @param fiatRates - Fiat rates for the token.
 * @returns Object containing the amount in raw, human-readable, USD, and fiat formats.
 */
export function computeTokenAmounts(
  rawInput: BigNumber.Value,
  decimals: number,
  fiatRates: FiatRates,
): {
  raw: string;
  human: string;
  usd: string;
  fiat: string;
} {
  const rawValue = new BigNumber(rawInput);
  const humanValue = rawValue.shiftedBy(-decimals);

  return {
    raw: rawValue.toFixed(0),
    human: humanValue.toString(10),
    usd: humanValue.multipliedBy(fiatRates.usdRate).toString(10),
    fiat: humanValue.multipliedBy(fiatRates.fiatRate).toString(10),
  };
}

/**
 * Get the native token address for a given chain ID.
 *
 * @param chainId - Chain ID.
 * @returns - Native token address for the given chain ID.
 */
export function getNativeToken(chainId: Hex): Hex {
  switch (chainId) {
    case '0x89':
      return '0x0000000000000000000000000000000000001010';
    default:
      return NATIVE_TOKEN_ADDRESS;
  }
}

/**
 * Get the live on-chain token balance via an RPC `eth_call` to the ERC-20
 * `balanceOf` function, or `eth_getBalance` for native tokens.
 *
 * Unlike {@link getTokenBalance}, this bypasses the cached state in
 * `TokenBalancesController` and reads directly from the chain.
 *
 * @param messenger - Controller messenger.
 * @param account - Address of the account.
 * @param chainId - Chain ID.
 * @param tokenAddress - Address of the token contract.
 * @returns Raw token balance as a decimal string.
 */
export async function getLiveTokenBalance(
  messenger: TransactionPayControllerMessenger,
  account: Hex,
  chainId: Hex,
  tokenAddress: Hex,
): Promise<string> {
  const networkClientId = messenger.call(
    'NetworkController:findNetworkClientIdByChainId',
    chainId,
  );

  const { provider } = messenger.call(
    'NetworkController:getNetworkClientById',
    networkClientId,
  );

  const ethersProvider = new Web3Provider(provider);
  const isNative =
    tokenAddress.toLowerCase() === getNativeToken(chainId).toLowerCase();

  if (isNative) {
    const balance = await ethersProvider.getBalance(account);
    return balance.toString();
  }

  const contract = new Contract(tokenAddress, abiERC20, ethersProvider);
  const balance = await contract.balanceOf(account);
  return balance.toString();
}

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
