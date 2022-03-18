/// <reference types="bn.js" />
import { BN } from 'ethereumjs-util';
declare type EthQuery = any;
/**
 * @type EthFeeHistoryResponse
 *
 * Response data for `eth_feeHistory`.
 * @property oldestBlock - The id of the oldest block (in hex format) in the range of blocks
 * requested.
 * @property baseFeePerGas - Base fee per gas for each block in the range of blocks requested.
 * For go-ethereum based chains baseFeePerGas will not returned in case of empty results
 * <github.com/ethereum/go-ethereum/blob/v1.10.16/internal/ethapi/api.go#L87>
 * @property gasUsedRatio - A number between 0 and 1 that represents the gas used vs. gas limit for
 * each block in the range of blocks requested.
 * @property reward - The priority fee at the percentiles requested for each block in the range of
 * blocks requested.
 */
export declare type EthFeeHistoryResponse = {
    oldestBlock: string;
    baseFeePerGas?: string[];
    gasUsedRatio: number[];
    reward?: string[][];
};
/**
 * @type ExistingFeeHistoryBlock
 *
 * Historical data for a particular block that exists on the blockchain.
 * @property number - The number of the block, as a BN.
 * @property baseFeePerGas - The base fee per gas for the block in WEI, as a BN.
 * @property gasUsedRatio - A number between 0 and 1 that represents the ratio between the gas paid
 * for the block and its set gas limit.
 * @property priorityFeesByPercentile - The priority fees paid for the transactions in the block
 * that occurred at particular levels at which those transactions contributed to the overall gas
 * used for the block, indexed by those percentiles. (See docs for {@link fetchBlockFeeHistory} for more
 * on how this works.)
 */
declare type ExistingFeeHistoryBlock<Percentile extends number> = {
    number: BN;
    baseFeePerGas: BN;
    gasUsedRatio: number;
    priorityFeesByPercentile: Record<Percentile, BN>;
};
/**
 * @type NextFeeHistoryBlock
 *
 * Historical data for a theoretical block that could exist in the future.
 * @property number - The number of the block, as a BN.
 * @property baseFeePerGas - The estimated base fee per gas for the block in WEI, as a BN.
 */
declare type NextFeeHistoryBlock = {
    number: BN;
    baseFeePerGas: BN;
};
/**
 * @type FeeHistoryBlock
 *
 * Historical data for a particular block.
 * @property number - The number of the block, as a BN.
 * @property baseFeePerGas - The base fee per gas for the block in WEI, as a BN.
 * @property gasUsedRatio - A number between 0 and 1 that represents the ratio between the gas paid
 * for the block and its set gas limit.
 * @property priorityFeesByPercentile - The priority fees paid for the transactions in the block
 * that occurred at particular levels at which those transactions contributed to the overall gas
 * used for the block, indexed by those percentiles. (See docs for {@link fetchBlockFeeHistory} for more
 * on how this works.)
 */
export declare type FeeHistoryBlock<Percentile extends number> = ExistingFeeHistoryBlock<Percentile> | NextFeeHistoryBlock;
/**
 * @type ExtractPercentileFrom
 *
 * Extracts the percentiles that the type assigned to an array of FeeHistoryBlock has been created
 * with. This makes use of the `infer` keyword to read the type argument.
 */
export declare type ExtractPercentileFrom<T> = T extends FeeHistoryBlock<infer P>[] ? P : never;
/**
 * Uses `eth_feeHistory` (an EIP-1559 feature) to obtain information about gas fees from a range of
 * blocks that have occurred recently on a network.
 *
 * To learn more, see these resources:
 *
 * - <https://infura.io/docs/ethereum#operation/eth_feeHistory>
 * - <https://github.com/zsfelfoldi/feehistory/blob/main/docs/feeHistory.md>
 * - <https://github.com/ethereum/go-ethereum/blob/57a3fab8a75eeb9c2f4fab770b73b51b9fe672c5/eth/gasprice/feehistory.go#L180>
 * - <https://github.com/ethereum/EIPs/blob/master/EIPS/eip-1559.md>
 * - <https://gas-api.metaswap.codefi.network/testFeeHistory>
 *
 * @param args - The arguments to this function.
 * @param args.ethQuery - An EthQuery instance that wraps a provider for the network in question.
 * @param args.endBlock - The desired end of the requested block range. Can be "latest" if you want
 * to start from the latest successful block or the number of a known past block.
 * @param args.numberOfBlocks - How many total blocks to fetch. Note that if this is more than 1024,
 * multiple calls to `eth_feeHistory` will be made.
 * @param args.percentiles - A set of numbers between 1 and 100 which will dictate how
 * `priorityFeesByPercentile` in each returned block will be formed. When Ethereum runs the
 * `eth_feeHistory` method, for each block it is considering, it will first sort all transactions by
 * the priority fee. It will then go through each transaction and add the total amount of gas paid
 * for that transaction to a bucket which maxes out at the total gas used for the whole block. As
 * the bucket fills, it will cross percentages which correspond to the percentiles specified here,
 * and the priority fees of the first transactions which cause it to reach those percentages will be
 * recorded. Hence, `priorityFeesByPercentile` represents the priority fees of transactions at key
 * gas used contribution levels, where earlier levels have smaller contributions and later levels
 * have higher contributions.
 * @param args.includeNextBlock - Whether to include an extra block that represents the next
 * block after the latest one. Only the `baseFeePerGas` will be filled in for this block (which is
 * estimated).
 * @returns The list of blocks and their fee data, sorted from oldest to newest.
 */
export default function fetchBlockFeeHistory<Percentile extends number>({ ethQuery, numberOfBlocks: totalNumberOfBlocks, endBlock: givenEndBlock, percentiles: givenPercentiles, includeNextBlock, }: {
    ethQuery: EthQuery;
    numberOfBlocks: number;
    endBlock?: 'latest' | BN;
    percentiles?: readonly Percentile[];
    includeNextBlock?: boolean;
}): Promise<FeeHistoryBlock<Percentile>[]>;
export {};
