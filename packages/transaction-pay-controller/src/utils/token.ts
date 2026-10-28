import { Interface } from '@ethersproject/abi';
import type { AssetsControllerState } from '@metamask/assets-controller';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import { createModuleLogger } from '@metamask/utils';
import type { CaipAssetType, Hex } from '@metamask/utils';
import { hexToBigInt, isCaipChainId, toCaipAssetType } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import {
  CHAIN_ID_POLYGON,
  NATIVE_TOKEN_ADDRESS,
  SLIP44_COIN_TYPE_BY_CHAIN,
} from '../constants.js';
import { projectLogger } from '../logger.js';
import type {
  FiatRates,
  NonEvmPaymentToken,
  TransactionPayControllerMessenger,
  TransactionPaymentToken,
} from '../types.js';
import { getStablecoins, isChainExcludedFromInfura } from './feature-flags.js';
import { rpcRequest } from './provider.js';

const log = createModuleLogger(projectLogger, 'token');

/**
 * Resolved CAIP-19 asset IDs, keyed by chain ID and lower-cased address.
 *
 * An asset ID is a static property of its chain and address, so one resolved
 * from any state snapshot stays correct for the lifetime of the process.
 */
const assetIds = new Map<string, CaipAssetType>();

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
 * Check if a payment token is on a non-EVM chain.
 *
 * Non-EVM payment tokens are identified by a CAIP-2 chain ID, whereas EVM
 * payment tokens use a Hex chain ID.
 *
 * @param paymentToken - Payment token to check.
 * @returns True if the payment token is a non-EVM payment token.
 */
export function isNonEvmPaymentToken(
  paymentToken: TransactionPaymentToken,
): paymentToken is NonEvmPaymentToken {
  return isCaipChainId(paymentToken.chainId);
}

/**
 * Check if two payment tokens identify the same token.
 *
 * EVM payment tokens match by chain ID and case-insensitive address. Non-EVM
 * payment tokens match by account and CAIP-19 asset type.
 *
 * @param token1 - First payment token.
 * @param token2 - Second payment token.
 * @returns True if both payment tokens are the same, or both are undefined.
 */
export function isSamePaymentToken(
  token1: TransactionPaymentToken | undefined,
  token2: TransactionPaymentToken | undefined,
): boolean {
  return getPaymentTokenKey(token1) === getPaymentTokenKey(token2);
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

  if (!assetId) {
    return '0';
  }

  return getRawBalance(assetsBalance, assetsInfo, accountId, assetId);
}

/**
 * Get the balance of a CAIP-19 asset held by an `InternalAccount`.
 *
 * @param messenger - Controller messenger.
 * @param walletAccountId - ID of the `InternalAccount` holding the asset.
 * @param assetId - CAIP-19 asset type as keyed in `AssetsController` state.
 * @returns Raw asset balance as a decimal string.
 */
export function getAssetBalance(
  messenger: TransactionPayControllerMessenger,
  walletAccountId: string,
  assetId: CaipAssetType,
): string {
  const { assetsBalance, assetsInfo } = messenger.call(
    'AssetsController:getState',
  );

  return getRawBalance(assetsBalance, assetsInfo, walletAccountId, assetId);
}

/**
 * Get the decimals and symbol for a CAIP-19 asset.
 *
 * @param messenger - Controller messenger.
 * @param assetId - CAIP-19 asset type as keyed in `AssetsController` state.
 * @returns The asset decimals and symbol, or undefined if the asset is not found.
 */
export function getAssetInfo(
  messenger: TransactionPayControllerMessenger,
  assetId: CaipAssetType,
): { decimals: number; symbol: string } | undefined {
  const { assetsInfo } = messenger.call('AssetsController:getState');
  const asset = assetsInfo[assetId];

  if (!asset) {
    return undefined;
  }

  return { decimals: Number(asset.decimals), symbol: asset.symbol };
}

/**
 * Get the fiat rates for a CAIP-19 asset.
 *
 * @param messenger - Controller messenger.
 * @param assetId - CAIP-19 asset type as keyed in `AssetsController` state.
 * @returns An object containing the USD and fiat rates, or undefined if rates are not available.
 */
export function getAssetFiatRate(
  messenger: TransactionPayControllerMessenger,
  assetId: CaipAssetType,
): FiatRates | undefined {
  const { assetsPrice } = messenger.call('AssetsController:getState');
  const price = assetsPrice[assetId];

  if (price?.assetPriceType !== 'fungible') {
    return undefined;
  }

  return {
    fiatRate: String(price.price),
    usdRate: String(price.usdPrice),
  };
}

/**
 * Get the decimals and symbol for a specific token.
 *
 * `AssetsController` is the sole source of truth: a token absent from unified
 * state is treated as non-existent rather than being reconstructed from network
 * configuration. Consumers must therefore ensure unified asset state covers
 * every chain Pay is used on.
 *
 * @param messenger - Controller messenger.
 * @param tokenAddress - Address of the token contract.
 * @param chainId - Id of the chain.
 * @returns The token decimals and symbol, or undefined if the token is not found.
 */
export function getTokenInfo(
  messenger: TransactionPayControllerMessenger,
  tokenAddress: Hex,
  chainId: Hex,
): { decimals: number; symbol: string } | undefined {
  const { assetsInfo } = messenger.call('AssetsController:getState');
  const assetId = getControllerAssetId(assetsInfo, chainId, tokenAddress);
  const token = assetId ? assetsInfo[assetId] : undefined;

  if (!token) {
    return undefined;
  }

  return { decimals: Number(token.decimals), symbol: token.symbol };
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
 * The identifier is derived purely from its arguments, so it describes the
 * token as the wider ecosystem names it rather than as this wallet happens to
 * have indexed it. Use it for identifiers sent to third parties, such as Ramps
 * order assets; use `AssetsController` state for anything read back from the
 * wallet's own asset metadata, balances, or prices.
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

/**
 * Build a comparable identity for a payment token.
 *
 * @param paymentToken - Payment token, if any.
 * @returns Identity string, or undefined if no payment token is provided.
 */
function getPaymentTokenKey(
  paymentToken: TransactionPaymentToken | undefined,
): string | undefined {
  if (!paymentToken) {
    return undefined;
  }

  if (isNonEvmPaymentToken(paymentToken)) {
    return `${paymentToken.walletAccountId}:${paymentToken.assetId}`;
  }

  return `${paymentToken.chainId}:${paymentToken.address.toLowerCase()}`;
}

/**
 * Read a raw balance from `AssetsController` state.
 *
 * `AssetsController` stores human-readable decimal amounts, whereas callers
 * expect raw base units, so the amount is shifted by the asset decimals.
 *
 * @param assetsBalance - Asset balances keyed by account ID and CAIP-19 ID.
 * @param assetsInfo - Asset metadata keyed by CAIP-19 ID.
 * @param accountId - ID of the `InternalAccount` holding the asset.
 * @param assetId - CAIP-19 asset type as keyed in state.
 * @returns Raw balance as a decimal string, or `'0'` if no balance is stored.
 */
function getRawBalance(
  assetsBalance: AssetsControllerState['assetsBalance'],
  assetsInfo: AssetsControllerState['assetsInfo'],
  accountId: string,
  assetId: CaipAssetType,
): string {
  const amount = assetsBalance[accountId]?.[assetId]?.amount;

  if (amount === undefined) {
    return '0';
  }

  const { decimals } = assetsInfo[assetId];

  return new BigNumber(amount)
    .shiftedBy(Number(decimals))
    .toFixed(0, BigNumber.ROUND_DOWN);
}

/**
 * Locate an asset's key in `AssetsController` state, reusing a previously
 * resolved identifier.
 *
 * A cached identifier is still confirmed against the given state, since an
 * asset `AssetsController` has not indexed yet is unresolvable no matter how
 * its identifier would be spelled. That check is a keyed read, so the cache
 * saves the scan below without letting a stale identifier through.
 *
 * Only resolved checksummed identifiers are cached, so an asset missing at
 * first lookup, or resolved only to a lowercase duplicate, is retried and
 * picked up once `AssetsController` indexes its checksummed entry.
 *
 * @param assetsInfo - Asset metadata keyed by CAIP-19 ID.
 * @param chainId - Hex chain ID.
 * @param tokenAddress - Token address, or the native token address.
 * @returns The CAIP-19 asset ID as keyed in state, or undefined when the asset
 * is absent.
 */
function getControllerAssetId(
  assetsInfo: AssetsControllerState['assetsInfo'],
  chainId: Hex,
  tokenAddress: Hex,
): CaipAssetType | undefined {
  const cacheKey = `${chainId}:${tokenAddress.toLowerCase()}`;
  const cached = assetIds.get(cacheKey);

  if (cached && assetsInfo[cached]) {
    return cached;
  }

  const assetId = resolveControllerAssetId(assetsInfo, chainId, tokenAddress);

  // Only cache checksummed (mixed-case) keys, so a lowercase duplicate seen
  // before the canonical entry is indexed cannot stick for the session.
  if (assetId && assetId !== assetId.toLowerCase()) {
    assetIds.set(cacheKey, assetId);
  }

  return assetId;
}

/**
 * Locate an asset's key in `AssetsController` state.
 *
 * An ERC-20 identifier is fully derivable from the chain and address, so for a
 * checksummed address the derived form is tried against state first —
 * client-selected tokens are already checksummed and hit immediately. Other
 * addresses, such as lowercase ones recovered from transaction calldata, fall
 * through to a case-insensitive search, which avoids paying for a checksum on
 * the hot path. That search prefers the checksummed key, since state may also
 * hold a stale lowercase duplicate without price or balance data.
 *
 * A native identifier cannot be derived, because MetaMask keys natives
 * inconsistently across chains — `slip44:`, `erc20:` with the zero address, or
 * a chain-specific sentinel address — so the chain's sole entry of type
 * `native` is searched for instead.
 *
 * An asset absent from state is unresolvable rather than assumed, so a derived
 * identifier state cannot confirm is never returned.
 *
 * @param assetsInfo - Asset metadata keyed by CAIP-19 ID.
 * @param chainId - Hex chain ID.
 * @param tokenAddress - Token address, or the native token address.
 * @returns The CAIP-19 asset ID as keyed in state, or undefined when the asset
 * is absent.
 */
function resolveControllerAssetId(
  assetsInfo: AssetsControllerState['assetsInfo'],
  chainId: Hex,
  tokenAddress: Hex,
): CaipAssetType | undefined {
  const chainPrefix = `eip155:${hexToBigInt(chainId)}/`;
  const isNative =
    tokenAddress.toLowerCase() === getNativeToken(chainId).toLowerCase();

  if (isNative) {
    for (const [key, metadata] of Object.entries(assetsInfo)) {
      if (key.startsWith(chainPrefix) && metadata.type === 'native') {
        return key as CaipAssetType;
      }
    }

    return undefined;
  }

  const derivedAssetId = `${chainPrefix}erc20:${tokenAddress}` as CaipAssetType;
  const target = derivedAssetId.toLowerCase();

  // Mixed-case input is already checksummed, so an exact hit is canonical.
  if (derivedAssetId !== target && assetsInfo[derivedAssetId]) {
    return derivedAssetId;
  }

  // Prefer the checksummed (mixed-case) key over a lowercase duplicate.
  let lowercaseMatch: CaipAssetType | undefined;

  for (const key of Object.keys(assetsInfo)) {
    if (key.toLowerCase() !== target) {
      continue;
    }

    if (key !== target) {
      return key as CaipAssetType;
    }

    lowercaseMatch = key as CaipAssetType;
  }

  return lowercaseMatch;
}
