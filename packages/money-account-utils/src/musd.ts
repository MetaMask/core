import { CHAIN_IDS } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

/**
 * The mUSD (MetaMask USD) token, minus any client-specific presentation
 * (icon assets stay in each client).
 */
export const MUSD_TOKEN = {
  symbol: 'mUSD',
  name: 'MetaMask USD',
  decimals: 6,
  /**
   * Remote image URL used when the token is not yet in the user's wallet
   * token list and a URI-based image source is needed (e.g. for token avatars
   * in confirmation screens). The address casing in the path matches the
   * token address on all supported chains.
   */
  image:
    'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/1/erc20/0xaca92e438df0b2401ff60da7e4337b687a2435da.png',
} as const;

/**
 * mUSD token decimals (derived from {@link MUSD_TOKEN} for a single source of
 * truth).
 */
export const MUSD_DECIMALS = MUSD_TOKEN.decimals;

/**
 * mUSD token address (same on all supported chains).
 */
export const MUSD_TOKEN_ADDRESS: Hex =
  '0xaca92e438df0b2401ff60da7e4337b687a2435da';

/**
 * The mUSD token address on each chain where it is deployed.
 */
export const MUSD_TOKEN_ADDRESS_BY_CHAIN: Record<Hex, Hex> = {
  [CHAIN_IDS.MAINNET]: MUSD_TOKEN_ADDRESS,
  [CHAIN_IDS.LINEA_MAINNET]: MUSD_TOKEN_ADDRESS,
  [CHAIN_IDS.BSC]: MUSD_TOKEN_ADDRESS,
  [CHAIN_IDS.MONAD]: MUSD_TOKEN_ADDRESS,
};

/**
 * The CAIP-19 asset id of the mUSD token on each chain where it is deployed.
 */
export const MUSD_TOKEN_ASSET_ID_BY_CHAIN: Record<Hex, string> = {
  [CHAIN_IDS.MAINNET]:
    'eip155:1/erc20:0xacA92E438df0B2401fF60dA7E4337B687a2435DA',
  [CHAIN_IDS.LINEA_MAINNET]:
    'eip155:59144/erc20:0xacA92E438df0B2401fF60dA7E4337B687a2435DA',
  [CHAIN_IDS.BSC]: 'eip155:56/erc20:0xacA92E438df0B2401fF60dA7E4337B687a2435DA',
  [CHAIN_IDS.MONAD]:
    'eip155:143/erc20:0xacA92E438df0B2401fF60dA7E4337B687a2435DA',
};

/**
 * The ticker used for mUSD when treated as a currency.
 */
export const MUSD_CURRENCY = 'MUSD';

/**
 * Chains where the Money Account surfaces mUSD activity. mUSD exists on
 * several chains for buy/convert flows, but the Money Account currently only
 * tracks Monad — inbound mUSD on Mainnet/Linea/BSC is unrelated to it and
 * must not appear in Money activity.
 */
export const MUSD_MONEY_ACCOUNT_CHAIN_IDS: Hex[] = [CHAIN_IDS.MONAD];

/**
 * Check whether the given token address is mUSD. mUSD has the same address on
 * all supported chains.
 *
 * @param address - The token address to check.
 * @returns Whether the address is the mUSD token address.
 */
export function isMusdToken(address?: string): boolean {
  if (!address) {
    return false;
  }
  return address.toLowerCase() === MUSD_TOKEN_ADDRESS.toLowerCase();
}

/**
 * Like {@link isMusdToken} but also requires `chainId` to be a chain where
 * mUSD is actually deployed. Prevents a same-address token on an unsupported
 * chain from being misclassified as mUSD.
 *
 * @param address - The token address to check.
 * @param chainId - The chain the token lives on.
 * @returns Whether the address is mUSD on a chain where mUSD is deployed.
 */
export function isMusdTokenOnChain(address?: string, chainId?: Hex): boolean {
  if (!address || !chainId) {
    return false;
  }
  const expected = MUSD_TOKEN_ADDRESS_BY_CHAIN[chainId];
  if (!expected) {
    return false;
  }
  return address.toLowerCase() === expected.toLowerCase();
}

/**
 * Like {@link isMusdTokenOnChain} but restricted to chains where the Money
 * Account is active (currently Monad only).
 *
 * @param address - The token address to check.
 * @param chainId - The chain the token lives on.
 * @returns Whether the address is mUSD on a Money Account chain.
 */
export function isMusdOnMoneyAccountChain(
  address?: string,
  chainId?: Hex,
): boolean {
  if (!chainId || !MUSD_MONEY_ACCOUNT_CHAIN_IDS.includes(chainId)) {
    return false;
  }
  return isMusdTokenOnChain(address, chainId);
}
