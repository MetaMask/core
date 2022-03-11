"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Given a collection of blocks, returns an indicator of whether the base fee is moving up, down, or
 * holding steady, based on comparing the last base fee in the collection to the first.
 *
 * @param blocks - A set of blocks obtained via {@link BlockFeeHistoryDatasetFetcher}.
 * @returns The indicator ("up", "down", or "level").
 */
function calculateBaseFeeTrend(blocks) {
    const baseFeesPerGas = blocks.map((block) => block.baseFeePerGas);
    const first = baseFeesPerGas[0];
    const last = baseFeesPerGas[baseFeesPerGas.length - 1];
    if (last.gt(first)) {
        return 'up';
    }
    else if (first.gt(last)) {
        return 'down';
    }
    return 'level';
}
exports.default = calculateBaseFeeTrend;
//# sourceMappingURL=calculateBaseFeeTrend.js.map