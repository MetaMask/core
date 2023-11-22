import type { BN } from 'ethereumjs-util';

export type EthBlock = {
  number: BN;
  baseFeePerGas: BN;
};

export type FeeRange = [string, string];
