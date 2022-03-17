import { BN } from 'ethereumjs-util';

export type RawEthBlock = {
  number: string;
  baseFeePerGas: string;
};

export type EthBlock = {
  number: BN;
  baseFeePerGas: BN;
};

export type EthQuery = {
  getBlockByNumber: (
    blockNumber: BN | 'latest' | 'earliest' | 'pending',
  ) => Promise<EthBlock>;
};

export type FeeRange = [string, string];
