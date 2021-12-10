import { BN } from 'ethereumjs-util';
import fetchBlockFeeHistory, { FeeHistoryBlock } from '../fetchBlockFeeHistory';
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

  forLongRange() {
    return this.fetch({ numberOfBlocks: 20_000 });
  }

  forMediumRange() {
    return this.fetch({ numberOfBlocks: 200, percentiles: [10, 95] });
  }

  forSmallRange() {
    return this.fetch({ numberOfBlocks: 5, percentiles: [10, 20, 30] });
  }

  forTinyRange() {
    return this.fetch({
      numberOfBlocks: 2,
      percentiles: [50],
    });
  }

  forTinyRangeWithPending() {
    return this.fetch({
      numberOfBlocks: 2,
      endBlock: 'pending',
      percentiles: [50],
    });
  }

  forLatest() {
    return this.fetch({
      numberOfBlocks: 1,
      percentiles: [10, 95],
    });
  }

  private fetch<T extends number = never>(args: {
    numberOfBlocks: number;
    endBlock?: BN | 'pending';
    percentiles?: T[];
  }): Promise<FeeHistoryBlock<T>[]> {
    return fetchBlockFeeHistory({
      ethQuery: this.ethQuery,
      endBlock: this.endBlockNumber,
      ...args,
    });
  }
}
