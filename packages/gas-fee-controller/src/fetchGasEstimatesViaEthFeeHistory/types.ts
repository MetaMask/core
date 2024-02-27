import type * as BN from 'bn.js';

export type EthBlock = {
  number: BN;
  baseFeePerGas: BN;
};

export type FeeRange = [string, string];
