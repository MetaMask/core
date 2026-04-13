import { Contract } from '@ethersproject/contracts';
import { Web3Provider } from '@ethersproject/providers';
import { TokensControllerState } from '@metamask/assets-controllers';
import { toChecksumHexAddress } from '@metamask/controller-utils';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import type { Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import {
  CHAIN_ID_POLYGON,
  NATIVE_TOKEN_ADDRESS,
  STABLECOINS,
} from '../constants';
import type { FiatRates, TransactionPayControllerMessenger } from '../types';
import { getAssetsUnifyStateFeature } from './feature-flags';

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
  const assetsUnifyStateFeatureEnabled = getAssetsUnifyStateFeature(messenger);

  let tokenBalances;
  let accountsByChainId;
  if (assetsUnifyStateFeatureEnabled) {
    const assetsControllerState = messenger.call(
      'AssetsController:getStateForTransactionPay',
    );

    tokenBalances = assetsControllerState?.tokenBalances;
    accountsByChainId = assetsControllerState?.accountsByChainId;
  } else {
    tokenBalances = messenger.call(
      'TokenBalancesController:getState',
    )?.tokenBalances;
    accountsByChainId = messenger.call(
      'AccountTrackerController:getState',
    )?.accountsByChainId;
  }

  const normalizedAccount = account.toLowerCase() as Hex;
  const normalizedTokenAddress = toChecksumHexAddress(tokenAddress) as Hex;
  const isNative = normalizedTokenAddress === getNativeToken(chainId);

  const balanceHex =
    tokenBalances?.[normalizedAccount]?.[chainId]?.[normalizedTokenAddress];

  if (!isNative && balanceHex === undefined) {
    return '0';
  }

  if (!isNative && balanceHex) {
    return new BigNumber(balanceHex, 16).toString(10);
  }

  const chainAccounts = accountsByChainId?.[chainId];

  const checksumAccount = toChecksumHexAddress(normalizedAccount) as Hex;
  const nativeBalanceHex = chainAccounts?.[checksumAccount]?.balance as Hex;

  return new BigNumber(nativeBalanceHex ?? '0x0', 16).toString(10);
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
  const assetsUnifyStateFeatureEnabled = getAssetsUnifyStateFeature(messenger);

  let allTokens: TokensControllerState['allTokens'];
  if (assetsUnifyStateFeatureEnabled) {
    allTokens = messenger.call(
      'AssetsController:getStateForTransactionPay',
    )?.allTokens;
  } else {
    allTokens = messenger.call('TokensController:getState')?.allTokens;
  }

  const normalizedTokenAddress = tokenAddress.toLowerCase() as Hex;

  const isNative =
    normalizedTokenAddress === getNativeToken(chainId).toLowerCase();

  const token = Object.values(allTokens?.[chainId] ?? {})
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
  const assetsUnifyStateFeatureEnabled = getAssetsUnifyStateFeature(messenger);

  let marketData;
  let currencyRates;
  if (assetsUnifyStateFeatureEnabled) {
    const assetsControllerState = messenger.call(
      'AssetsController:getStateForTransactionPay',
    );

    marketData = assetsControllerState?.marketData;
    currencyRates = assetsControllerState?.currencyRates;
  } else {
    marketData = messenger.call('TokenRatesController:getState')?.marketData;
    currencyRates = messenger.call(
      'CurrencyRateController:getState',
    )?.currencyRates;
  }

  const ticker = getTicker(chainId, messenger);

  if (!ticker) {
    return undefined;
  }

  const normalizedTokenAddress = toChecksumHexAddress(tokenAddress) as Hex;
  const isNative = normalizedTokenAddress === getNativeToken(chainId);

  const tokenToNativeRate =
    marketData?.[chainId]?.[normalizedTokenAddress]?.price;

  if (tokenToNativeRate === undefined && !isNative) {
    return undefined;
  }

  const {
    conversionRate: nativeToFiatRate,
    usdConversionRate: nativeToUsdRate,
  } = currencyRates?.[ticker] ?? {
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
 * Compute a raw token amount from a fiat (USD) amount.
 * This is the inverse of `computeTokenAmounts` — it goes from USD to raw.
 *
 * @param fiatAmount - Amount in fiat/USD.
 * @param decimals - Token decimals.
 * @param usdRate - USD rate for the token (price per one unit of the token).
 * @returns Raw token amount string, or undefined if the conversion produces an invalid result.
 */
export function computeRawFromFiatAmount(
  fiatAmount: BigNumber.Value,
  decimals: number,
  usdRate: BigNumber.Value,
): string | undefined {
  const rate = new BigNumber(usdRate);
  if (!rate.isFinite() || !rate.gt(0)) {
    return undefined;
  }

  const humanAmount = new BigNumber(fiatAmount).dividedBy(rate);
  if (!humanAmount.isFinite() || !humanAmount.gt(0)) {
    return undefined;
  }

  const raw = humanAmount
    .shiftedBy(decimals)
    .decimalPlaces(0, BigNumber.ROUND_DOWN)
    .toFixed(0);

  return new BigNumber(raw).gt(0) ? raw : undefined;
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

export enum TokenAddressTarget {
  Relay = 'relay',
  MetaMask = 'metamask',
}

/**
 * Normalize token address formats between MetaMask and Relay for Polygon native
 * token handling.
 *
 * MetaMask uses Polygon's native token contract-like address (`0x...1010`),
 * while Relay expects the zero address for native tokens.
 *
 * @param tokenAddress - Token address to normalize.
 * @param chainId - Chain ID for the token.
 * @param target - Optional target system format.
 * @returns Normalized token address for the target system, or the original
 * address if no target is provided.
 */
export function normalizeTokenAddress(
  tokenAddress: Hex,
  chainId: Hex,
  target?: TokenAddressTarget,
): Hex {
  if (chainId !== CHAIN_ID_POLYGON) {
    return tokenAddress;
  }

  const nativeTokenAddress = getNativeToken(chainId).toLowerCase() as Hex;
  const normalizedTokenAddress = tokenAddress.toLowerCase();

  if (
    target === TokenAddressTarget.Relay &&
    normalizedTokenAddress === nativeTokenAddress
  ) {
    return NATIVE_TOKEN_ADDRESS;
  }

  if (
    target === TokenAddressTarget.MetaMask &&
    normalizedTokenAddress === NATIVE_TOKEN_ADDRESS.toLowerCase()
  ) {
    return nativeTokenAddress;
  }

  return tokenAddress;
}
