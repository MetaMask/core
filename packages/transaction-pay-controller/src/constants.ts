import { TransactionType } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

export const CONTROLLER_NAME = 'TransactionPayController';
export const CHAIN_ID_ARBITRUM = '0xa4b1' as Hex;
export const CHAIN_ID_POLYGON = '0x89' as Hex;
export const CHAIN_ID_HYPERCORE = '0x539' as Hex;

export const NATIVE_TOKEN_ADDRESS =
  '0x0000000000000000000000000000000000000000' as Hex;

export const ARBITRUM_USDC_ADDRESS =
  '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as Hex;

export const POLYGON_USDCE_ADDRESS =
  '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' as Hex;

export type TransactionPayFiatAsset = {
  address: Hex;
  caipAssetId: string;
  chainId: Hex;
  decimals: number;
};

const POLYGON_POL_FIAT_ASSET: TransactionPayFiatAsset = {
  address: '0x0000000000000000000000000000000000001010',
  caipAssetId: 'eip155:137/slip44:966',
  chainId: CHAIN_ID_POLYGON,
  decimals: 18,
};

const ARBITRUM_ETH_FIAT_ASSET: TransactionPayFiatAsset = {
  address: NATIVE_TOKEN_ADDRESS,
  caipAssetId: 'eip155:42161/slip44:60',
  chainId: CHAIN_ID_ARBITRUM,
  decimals: 18,
};

// We might use feature flags to determine these later
export const MMPAY_FIAT_ASSET_ID_BY_TX_TYPE: Partial<
  Record<TransactionType, TransactionPayFiatAsset>
> = {
  [TransactionType.predictDeposit]: POLYGON_POL_FIAT_ASSET,
  [TransactionType.perpsDeposit]: ARBITRUM_ETH_FIAT_ASSET,
  [TransactionType.perpsDepositAndOrder]: ARBITRUM_ETH_FIAT_ASSET,
};

export const STABLECOINS: Record<Hex, Hex[]> = {
  // Mainnet
  '0x1': [
    '0xaca92e438df0b2401ff60da7e4337b687a2435da', // MUSD
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
    '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT
  ],
  [CHAIN_ID_ARBITRUM]: [ARBITRUM_USDC_ADDRESS.toLowerCase() as Hex],
  // Linea
  '0xe708': [
    '0xaca92e438df0b2401ff60da7e4337b687a2435da', // MUSD
    '0x176211869ca2b568f2a7d4ee941e073a821ee1ff', // USDC
    '0xa219439258ca9da29e9cc4ce5596924745e12b93', // USDT
  ],
  [CHAIN_ID_POLYGON]: [POLYGON_USDCE_ADDRESS.toLowerCase() as Hex],
  [CHAIN_ID_HYPERCORE]: ['0x00000000000000000000000000000000'], // USDC
};

export enum TransactionPayStrategy {
  Bridge = 'bridge',
  Relay = 'relay',
  Fiat = 'fiat',
  Test = 'test',
}

const VALID_STRATEGIES = new Set(Object.values(TransactionPayStrategy));

/**
 * Checks if a value is a valid transaction pay strategy.
 *
 * @param strategy - Candidate strategy value.
 * @returns True if the value is a valid strategy.
 */
export function isTransactionPayStrategy(
  strategy: unknown,
): strategy is TransactionPayStrategy {
  return VALID_STRATEGIES.has(strategy as TransactionPayStrategy);
}
