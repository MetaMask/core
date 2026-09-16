import { Interface } from '@ethersproject/abi';
import { normalizeAssetId } from '@metamask/assets-controller';
import type { AssetsControllerState } from '@metamask/assets-controller';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import { createModuleLogger } from '@metamask/utils';
import type { CaipAssetType, Hex } from '@metamask/utils';
import { hexToBigInt, toCaipAssetType } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import {
  CHAIN_ID_POLYGON,
  NATIVE_TOKEN_ADDRESS,
  NATIVE_TOKEN_DECIMALS,
  SLIP44_COIN_TYPE_BY_CHAIN,
} from '../constants.js';
import { projectLogger } from '../logger.js';
import type { FiatRates, TransactionPayControllerMessenger } from '../types.js';
import { getStablecoins, isChainExcludedFromInfura } from './feature-flags.js';
import { getNetworkClientId, rpcRequest } from './provider.js';

const log = createModuleLogger(projectLogger, 'token');
const nativeAssetIdsByMetadata = new WeakMap<
  AssetsControllerState['assetsInfo'],
  Map<Hex, CaipAssetType | undefined>
>();

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
  const { accountIdByAddress } = messenger.call('AccountsController:getState');

  // Fall back to the lower-cased address, as a miss is usually attributable to
  // a checksummed address being passed. Mirrors AccountsController#getAccountByAddress.
  const accountId =
    accountIdByAddress[account] ??
    accountIdByAddress[account.toLowerCase() as Hex];

  if (!accountId) {
    return '0';
  }

  const { assetsBalance, assetsInfo } = messenger.call(
    'AssetsController:getState',
  );
  const assetId = getControllerAssetId(assetsInfo, chainId, tokenAddress);

  const amount = assetId
    ? assetsBalance[accountId]?.[assetId]?.amount
    : undefined;

  if (amount === undefined) {
    return '0';
  }

  // AssetsController stores human-readable decimal amounts, whereas callers of
  // this function expect raw base units. Shift by the token decimals to convert.
  const decimals = getTokenInfo(messenger, tokenAddress, chainId)?.decimals;

  if (decimals === undefined) {
    return '0';
  }

  return new BigNumber(amount)
    .shiftedBy(decimals)
    .toFixed(0, BigNumber.ROUND_DOWN);
}

/**
 * Get the token decimals for a specific token.
 *
 * Native tokens are not always present in `AssetsController` state, as it only
 * tracks assets the wallet has discovered. For those, fall back to the EVM
 * native default of 18 decimals and take the symbol from the network
 * configuration, so that chains the wallet has not yet indexed still resolve.
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
  const { assetsInfo } = messenger.call('AssetsController:getState');
  const assetId = getControllerAssetId(assetsInfo, chainId, tokenAddress);
  const token = assetId ? assetsInfo[assetId] : undefined;

  if (token) {
    return { decimals: Number(token.decimals), symbol: token.symbol };
  }

  const isNative =
    tokenAddress.toLowerCase() === getNativeToken(chainId).toLowerCase();

  if (!isNative) {
    return undefined;
  }

  const ticker = getTicker(messenger, chainId);

  if (!ticker) {
    return undefined;
  }

  return { decimals: NATIVE_TOKEN_DECIMALS, symbol: ticker };
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
  const { assetsInfo, assetsPrice } = messenger.call(
    'AssetsController:getState',
  );
  const assetId = getControllerAssetId(assetsInfo, chainId, tokenAddress);
  const price = assetId ? assetsPrice[assetId] : undefined;

  if (price?.assetPriceType !== 'fungible') {
    return undefined;
  }

  const isStablecoin = getStablecoins(messenger)[chainId]?.includes(
    tokenAddress.toLowerCase() as Hex,
  );

  return {
    fiatRate: String(price.price),
    usdRate: isStablecoin ? '1' : String(price.usdPrice),
  };
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
 * Unlike {@link getTokenBalance}, this bypasses cached AssetsController state
 * and reads directly from the chain.
 *
 * Uses the Infura RPC endpoint for the chain when one is configured, falling
 * back to the chain's default endpoint. This avoids errors on custom mainnet
 * RPC endpoints that may not support pending block queries.
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
  const options = {
    preferInfura: !isChainExcludedFromInfura(messenger, chainId),
  };
  const isNative =
    tokenAddress.toLowerCase() === getNativeToken(chainId).toLowerCase();

  if (isNative) {
    const result = await requestBalanceWithFallback((blockTag) =>
      rpcRequest<string>({
        messenger,
        chainId,
        method: 'eth_getBalance',
        params: [account, blockTag],
        options,
      }),
    );

    return new BigNumber(result, 16).toString(10);
  }

  const calldata = new Interface(abiERC20).encodeFunctionData('balanceOf', [
    account,
  ]) as Hex;

  const result = await requestBalanceWithFallback((blockTag) =>
    rpcRequest<string>({
      messenger,
      chainId,
      method: 'eth_call',
      params: [{ to: tokenAddress, data: calldata }, blockTag],
      options,
    }),
  );

  return new BigNumber(result, 16).toString(10);
}

/**
 * Request a balance using the `pending` block tag, falling back to `latest`
 * if the `pending` query throws.
 *
 * Some custom RPC endpoints do not support `pending` block queries. When the
 * `pending` request fails, retry with `latest` so a live balance can still be
 * resolved.
 *
 * @param request - Function that performs the balance request for a given
 * block tag.
 * @returns Raw balance result as a hex string.
 */
async function requestBalanceWithFallback(
  request: (blockTag: 'pending' | 'latest') => Promise<string>,
): Promise<string> {
  try {
    return await request('pending');
  } catch (error) {
    log('Pending balance query failed, falling back to latest', error);
    return request('latest');
  }
}

/**
 * Build a CAIP-19 asset type identifier for an EVM token.
 *
 * For native tokens the SLIP-44 coin type is resolved automatically from
 * a built-in chain→coin-type map, falling back to 60 (ETH).  Callers can
 * override via the optional third parameter.
 *
 * @param chainId - Hex chain ID (e.g. `0x1`).
 * @param tokenAddress - Token contract address, or the native token address.
 * @param slip44CoinType - Optional SLIP-44 coin type override for native tokens.
 * @returns CAIP-19 asset type string.
 */
export function buildCaipAssetType(
  chainId: Hex,
  tokenAddress: Hex,
  slip44CoinType?: number,
): CaipAssetType {
  const chainReference = String(hexToBigInt(chainId));
  const isNative =
    tokenAddress.toLowerCase() === getNativeToken(chainId).toLowerCase();

  if (isNative) {
    const coinType = slip44CoinType ?? SLIP44_COIN_TYPE_BY_CHAIN[chainId] ?? 60;

    return toCaipAssetType(
      'eip155',
      chainReference,
      'slip44',
      String(coinType),
    );
  }

  return toCaipAssetType('eip155', chainReference, 'erc20', tokenAddress);
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

function getTicker(
  messenger: TransactionPayControllerMessenger,
  chainId: Hex,
): string | undefined {
  try {
    const networkClientId = getNetworkClientId(messenger, chainId);

    return messenger.call(
      'NetworkController:getNetworkClientById',
      networkClientId,
    ).configuration.ticker;
  } catch {
    return undefined;
  }
}

/**
 * Resolve the canonical key used by AssetsController.
 * Transaction calldata and configured assets can contain lowercase addresses,
 * even though tokens selected by the client are already checksummed.
 * Native IDs come from metadata and are cached per chain and metadata snapshot;
 * balance and price updates reuse the cached ID.
 *
 * @param assetsInfo - Asset metadata keyed by CAIP-19 ID.
 * @param chainId - Hex chain ID.
 * @param tokenAddress - Token address.
 * @returns Checksummed CAIP-19 asset ID, or undefined for an unknown native asset.
 */
function getControllerAssetId(
  assetsInfo: AssetsControllerState['assetsInfo'],
  chainId: Hex,
  tokenAddress: Hex,
): CaipAssetType | undefined {
  const isNative = tokenAddress.toLowerCase() === getNativeToken(chainId);

  if (!isNative) {
    return normalizeAssetId(buildCaipAssetType(chainId, tokenAddress));
  }

  let nativeAssetIds = nativeAssetIdsByMetadata.get(assetsInfo);

  if (!nativeAssetIds) {
    nativeAssetIds = new Map();
    nativeAssetIdsByMetadata.set(assetsInfo, nativeAssetIds);
  }

  if (nativeAssetIds.has(chainId)) {
    return nativeAssetIds.get(chainId);
  }

  const chainPrefix = `eip155:${hexToBigInt(chainId)}/`;
  let nativeAssetId: CaipAssetType | undefined;

  for (const assetId in assetsInfo) {
    if (
      assetId.startsWith(chainPrefix) &&
      assetsInfo[assetId].type === 'native'
    ) {
      nativeAssetId = assetId as CaipAssetType;
      break;
    }
  }

  nativeAssetIds.set(chainId, nativeAssetId);
  return nativeAssetId;
}
