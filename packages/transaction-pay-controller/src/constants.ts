import type { Hex } from '@metamask/utils';

export const CONTROLLER_NAME = 'TransactionPayController';

export const NATIVE_TOKEN_ADDRESS =
  '0x0000000000000000000000000000000000000000' as Hex;

export enum TransactionPayStrategy {
  Bridge = 'bridge',
  Relay = 'relay',
  Test = 'test',
}
