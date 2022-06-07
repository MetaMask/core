"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const ethereumjs_util_1 = require("ethereumjs-util");
const util_1 = require("../util");
const MAX_NUMBER_OF_BLOCKS_PER_ETH_FEE_HISTORY_CALL = 1024;
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
function fetchBlockFeeHistory({ ethQuery, numberOfBlocks: totalNumberOfBlocks, endBlock: givenEndBlock = 'latest', percentiles: givenPercentiles = [], includeNextBlock = false, }) {
    return __awaiter(this, void 0, void 0, function* () {
        const percentiles = givenPercentiles.length > 0
            ? Array.from(new Set(givenPercentiles)).sort((a, b) => a - b)
            : [];
        const finalEndBlockNumber = givenEndBlock === 'latest'
            ? (0, util_1.fromHex)(yield (0, util_1.query)(ethQuery, 'blockNumber'))
            : givenEndBlock;
        const requestChunkSpecifiers = determineRequestChunkSpecifiers(finalEndBlockNumber, totalNumberOfBlocks);
        const blockChunks = yield Promise.all(requestChunkSpecifiers.map(({ numberOfBlocks, endBlockNumber }, i) => {
            return i === requestChunkSpecifiers.length - 1
                ? makeRequestForChunk({
                    ethQuery,
                    numberOfBlocks,
                    endBlockNumber,
                    percentiles,
                    includeNextBlock,
                })
                : makeRequestForChunk({
                    ethQuery,
                    numberOfBlocks,
                    endBlockNumber,
                    percentiles,
                    includeNextBlock: false,
                });
        }));
        return blockChunks.reduce((array, blocks) => [...array, ...blocks], []);
    });
}
exports.default = fetchBlockFeeHistory;
/**
 * Builds an ExistingFeeHistoryBlock.
 *
 * @param args - The args to this function.
 * @param args.number - The number of the block.
 * @param args.baseFeePerGas - The base fee per gas of the block.
 * @param args.blockIndex - The index of the block in the source chunk.
 * @param args.gasUsedRatios - The gas used ratios for the block.
 * @param args.priorityFeePercentileGroups - The priority fee percentile groups for the block.
 * @param args.percentiles - The percentiles used to fetch the source chunk.
 * @returns The ExistingFeeHistoryBlock.
 */
function buildExistingFeeHistoryBlock({ baseFeePerGas, number, blockIndex, gasUsedRatios, priorityFeePercentileGroups, percentiles, }) {
    const gasUsedRatio = gasUsedRatios[blockIndex];
    const priorityFeesForEachPercentile = priorityFeePercentileGroups[blockIndex];
    const priorityFeesByPercentile = percentiles.reduce((obj, percentile, percentileIndex) => {
        const priorityFee = priorityFeesForEachPercentile[percentileIndex];
        return Object.assign(Object.assign({}, obj), { [percentile]: (0, util_1.fromHex)(priorityFee) });
    }, {});
    return {
        number,
        baseFeePerGas,
        gasUsedRatio,
        priorityFeesByPercentile,
    };
}
/**
 * Builds a NextFeeHistoryBlock.
 *
 * @param args - The args to this function.
 * @param args.baseFeePerGas - The base fee per gas of the block.
 * @param args.number - The number of the block.
 * @returns The NextFeeHistoryBlock.
 */
function buildNextFeeHistoryBlock({ baseFeePerGas, number, }) {
    return {
        number,
        baseFeePerGas,
        gasUsedRatio: null,
        priorityFeesByPercentile: null,
    };
}
/**
 * Uses eth_feeHistory to request historical data about a group of blocks (max size 1024).
 *
 * @param args - The arguments
 * @param args.ethQuery - An EthQuery instance.
 * @param args.numberOfBlocks - The number of blocks in the chunk. Must be at most 1024, as this is
 * the maximum that `eth_feeHistory` can return in one call.
 * @param args.endBlockNumber - The end of the requested block range.
 * @param args.percentiles - A set of numbers between 1 and 100 that will be used to pull priority
 * fees for each block.
 * @param args.includeNextBlock - Whether to include an extra block that represents the next
 * block after the latest one. Only the `baseFeePerGas` will be filled in for this block (which is
 * estimated).
 * @returns A list of block data.
 */
function makeRequestForChunk({ ethQuery, numberOfBlocks, endBlockNumber, percentiles, includeNextBlock, }) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const response = yield (0, util_1.query)(ethQuery, 'eth_feeHistory', [(0, util_1.toHex)(numberOfBlocks), (0, util_1.toHex)(endBlockNumber), percentiles]);
        const startBlockNumber = (0, util_1.fromHex)(response.oldestBlock);
        if (response.baseFeePerGas !== undefined &&
            response.baseFeePerGas.length > 0 &&
            response.gasUsedRatio.length > 0 &&
            (response.reward === undefined || response.reward.length > 0)) {
            // Per
            // <https://github.com/ethereum/go-ethereum/blob/57a3fab8a75eeb9c2f4fab770b73b51b9fe672c5/eth/gasprice/feehistory.go#L191-L192>,
            // baseFeePerGas will always include an extra item which is the calculated base fee for the
            // next (future) block. We may or may not care about this; if we don't, chop it off.
            const baseFeesPerGasAsHex = includeNextBlock
                ? response.baseFeePerGas
                : response.baseFeePerGas.slice(0, numberOfBlocks);
            const gasUsedRatios = response.gasUsedRatio;
            const priorityFeePercentileGroups = (_a = response.reward) !== null && _a !== void 0 ? _a : [];
            // Chain is allowed to return fewer number of block results
            const numberOfExistingResults = gasUsedRatios.length;
            return baseFeesPerGasAsHex.map((baseFeePerGasAsHex, blockIndex) => {
                const baseFeePerGas = (0, util_1.fromHex)(baseFeePerGasAsHex);
                const number = startBlockNumber.addn(blockIndex);
                return blockIndex >= numberOfExistingResults
                    ? buildNextFeeHistoryBlock({ baseFeePerGas, number })
                    : buildExistingFeeHistoryBlock({
                        baseFeePerGas,
                        number,
                        blockIndex,
                        gasUsedRatios,
                        priorityFeePercentileGroups,
                        percentiles,
                    });
            });
        }
        return [];
    });
}
/**
 * Divides a block range (specified by a range size and the end of the range) into chunks based on
 * the maximum number of blocks that `eth_feeHistory` can return in a single call.
 *
 * If the requested totalNumberOfBlocks exceed endBlockNumber, totalNumberOfBlocks is
 * truncated to avoid requesting chunks with negative endBlockNumber.
 *
 * @param endBlockNumber - The final block in the complete desired block range after all
 * `eth_feeHistory` requests have been made.
 * @param totalNumberOfBlocks - The total number of desired blocks after all `eth_feeHistory`
 * requests have been made.
 * @returns A set of arguments that can be used to make requests to `eth_feeHistory` in order to
 * retrieve all of the requested blocks, sorted from oldest block to newest block.
 */
function determineRequestChunkSpecifiers(endBlockNumber, totalNumberOfBlocks) {
    if (endBlockNumber.lt(new ethereumjs_util_1.BN(totalNumberOfBlocks))) {
        totalNumberOfBlocks = endBlockNumber.toNumber();
    }
    const specifiers = [];
    for (let chunkStartBlockNumber = endBlockNumber.subn(totalNumberOfBlocks); chunkStartBlockNumber.lt(endBlockNumber); chunkStartBlockNumber = chunkStartBlockNumber.addn(MAX_NUMBER_OF_BLOCKS_PER_ETH_FEE_HISTORY_CALL)) {
        const distanceToEnd = endBlockNumber.sub(chunkStartBlockNumber).toNumber();
        const numberOfBlocks = distanceToEnd < MAX_NUMBER_OF_BLOCKS_PER_ETH_FEE_HISTORY_CALL
            ? distanceToEnd
            : MAX_NUMBER_OF_BLOCKS_PER_ETH_FEE_HISTORY_CALL;
        const chunkEndBlockNumber = chunkStartBlockNumber.addn(numberOfBlocks);
        specifiers.push({ numberOfBlocks, endBlockNumber: chunkEndBlockNumber });
    }
    return specifiers;
}
//# sourceMappingURL=fetchBlockFeeHistory.js.map