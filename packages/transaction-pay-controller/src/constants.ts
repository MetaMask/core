import type { Hex } from '@metamask/utils';

export const CONTROLLER_NAME = 'TransactionPayController';
export const CHAIN_ID_MAINNET = '0x1' as Hex;
export const CHAIN_ID_ARBITRUM = '0xa4b1' as Hex;
export const CHAIN_ID_LINEA = '0xe708' as Hex;
export const CHAIN_ID_POLYGON = '0x89' as Hex;
export const CHAIN_ID_HYPERCORE = '0x539' as Hex;

export const NATIVE_TOKEN_ADDRESS =
  '0x0000000000000000000000000000000000000000' as Hex;

export const ARBITRUM_USDC_ADDRESS =
  '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as Hex;

export const POLYGON_USDCE_ADDRESS =
  '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' as Hex;

export const HYPERCORE_USDC_ADDRESS =
  '0x00000000000000000000000000000000' as Hex;

export const MUSD_TOKEN_ADDRESS =
  '0xaca92e438df0b2401ff60da7e4337b687a2435da' as Hex;

export const STABLECOINS: Record<Hex, Hex[]> = {
  [CHAIN_ID_MAINNET]: [MUSD_TOKEN_ADDRESS],
  [CHAIN_ID_ARBITRUM]: [ARBITRUM_USDC_ADDRESS.toLowerCase() as Hex],
  [CHAIN_ID_LINEA]: [MUSD_TOKEN_ADDRESS],
  [CHAIN_ID_POLYGON]: [POLYGON_USDCE_ADDRESS.toLowerCase() as Hex],
  [CHAIN_ID_HYPERCORE]: [HYPERCORE_USDC_ADDRESS],
};

export enum TransactionPayStrategy {
  Bridge = 'bridge',
  Relay = 'relay',
  Test = 'test',
}
