import { BN } from 'ethereumjs-util';
import fetchBlockFeeHistory, {
  ExistingFeeHistoryBlock,
  ExtractPercentileFrom,
  FeeHistoryBlock,
} from '../fetchBlockFeeHistory';
import { EthQuery } from './types';

export default class BlockFeeHistoryDatasetFetcher {
  private ethQuery: EthQuery;

  private endBlockNumber: BN;

  constructor({
    ethQuery,
    endBlockNumber,
  }: {
    ethQuery: EthQuery;
    endBlockNumber: BN;
  }) {
    this.ethQuery = ethQuery;
    this.endBlockNumber = endBlockNumber;
  }

  async forAll() {
    const [mediumRange, smallRange, tinyRange] = await Promise.all([
      this.forMediumRange(),
      this.forSmallRange(),
      this.forTinyRange(),
    ]);

    const latest = mediumRange.slice(-2, -1) as ExistingFeeHistoryBlock<
      ExtractPercentileFrom<typeof mediumRange>
    >[];

    return {
      mediumRange,
      smallRange,
      tinyRange,
      latest,
    };
  }

  forMediumRange() {
    return this.fetchIncludingNextBlock({
      numberOfBlocks: 200,
      percentiles: [10, 95],
    });
  }

  forSmallRange() {
    return this.fetchExcludingNextBlock({
      numberOfBlocks: 5,
      percentiles: [10, 20, 30],
    });
  }

  forTinyRange() {
    return this.fetchExcludingNextBlock({
      numberOfBlocks: 2,
      percentiles: [50],
    });
  }

  private fetchExcludingNextBlock<T extends number = number>(args: {
    numberOfBlocks: number;
    endBlock?: BN;
    percentiles?: T[];
  }): Promise<ExistingFeeHistoryBlock<T>[]> {
    return fetchBlockFeeHistory({
      ethQuery: this.ethQuery,
      endBlock: this.endBlockNumber,
      ...args,
    }) as Promise<ExistingFeeHistoryBlock<T>[]>;
  }

  private fetchIncludingNextBlock<T extends number = number>(args: {
    numberOfBlocks: number;
    endBlock?: BN;
    percentiles?: T[];
  }): Promise<FeeHistoryBlock<T>[]> {
    return fetchBlockFeeHistory({
      ethQuery: this.ethQuery,
      endBlock: this.endBlockNumber,
      includeNextBlock: true,
      ...args,
    });
  }
}
