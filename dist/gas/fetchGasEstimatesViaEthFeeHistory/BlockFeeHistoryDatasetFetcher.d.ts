import { BN } from 'ethereumjs-util';
import { ExistingFeeHistoryBlock, FeeHistoryBlock } from '../fetchBlockFeeHistory';
import { EthQuery } from './types';
export default class BlockFeeHistoryDatasetFetcher {
    private ethQuery;
    private endBlockNumber;
    constructor({ ethQuery, endBlockNumber, }: {
        ethQuery: EthQuery;
        endBlockNumber: BN;
    });
    forAll(): Promise<{
        longRange: ExistingFeeHistoryBlock<number>[];
        mediumRange: ExistingFeeHistoryBlock<10 | 95>[];
        smallRange: ExistingFeeHistoryBlock<10 | 20 | 30>[];
        tinyRange: ExistingFeeHistoryBlock<50>[];
        latest: ExistingFeeHistoryBlock<10 | 95>[];
        latestWithNextBlock: FeeHistoryBlock<10 | 95>[];
    }>;
    forLongRange(): Promise<ExistingFeeHistoryBlock<number>[]>;
    forMediumRange(): Promise<ExistingFeeHistoryBlock<10 | 95>[]>;
    forSmallRange(): Promise<ExistingFeeHistoryBlock<10 | 20 | 30>[]>;
    forTinyRange(): Promise<ExistingFeeHistoryBlock<50>[]>;
    forLatestWithNextBlock(): Promise<FeeHistoryBlock<10 | 95>[]>;
    private fetchExcludingNextBlock;
    private fetchIncludingNextBlock;
}
