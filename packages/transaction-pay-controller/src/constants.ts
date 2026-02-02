import type { Hex } from '@metamask/utils';

export const CONTROLLER_NAME = 'TransactionPayController';
export const CHAIN_ID_ARBITRUM = '0xa4b1' as Hex;
export const CHAIN_ID_POLYGON = '0x89' as Hex;

export const NATIVE_TOKEN_ADDRESS =
  '0x0000000000000000000000000000000000000000' as Hex;

export const ARBITRUM_USDC_ADDRESS =
  '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as Hex;

export const POLYGON_USDCE_ADDRESS =
  '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' as Hex;

export enum TransactionPayStrategy {
  Bridge = 'bridge',
  Relay = 'relay',
  Test = 'test',
}
