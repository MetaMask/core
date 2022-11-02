/// <reference types="bn.js" />
import { BN } from 'ethereumjs-util';
export declare type EthBlock = {
    number: BN;
    baseFeePerGas: BN;
};
export declare type EthQuery = {
    getBlockByNumber: (blockNumber: BN | 'latest' | 'earliest' | 'pending') => Promise<EthBlock>;
};
export declare type FeeRange = [string, string];
