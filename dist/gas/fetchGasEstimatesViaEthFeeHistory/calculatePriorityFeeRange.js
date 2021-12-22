"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ethereumjs_util_1 = require("ethereumjs-util");
const ethjs_unit_1 = require("ethjs-unit");
const constants_1 = require("../../constants");
/**
 * Calculates reasonable minimum and maximum values for priority fees over the last 200 blocks.
 * Although some priority fees may be 0, these are discarded as they are not useful for suggestion
 * purposes.
 *
 * @param blocks - A set of blocks populated with data for priority fee percentiles 10 and 95,
 * obtained via {@link BlockFeeHistoryDatasetFetcher}.
 * @returns The range.
 */
function calculatePriorityFeeRange(blocks) {
    const sortedLowPriorityFees = blocks
        .map((block) => block.priorityFeesByPercentile[10])
        .filter((priorityFee) => !priorityFee.eq(new ethereumjs_util_1.BN(0)))
        .sort((a, b) => a.cmp(b));
    const sortedHighPriorityFees = blocks
        .map((block) => block.priorityFeesByPercentile[95])
        .sort((a, b) => a.cmp(b));
    return [
        ethjs_unit_1.fromWei(sortedLowPriorityFees[0], constants_1.GWEI),
        ethjs_unit_1.fromWei(sortedHighPriorityFees[sortedHighPriorityFees.length - 1], constants_1.GWEI),
    ];
}
exports.default = calculatePriorityFeeRange;
//# sourceMappingURL=calculatePriorityFeeRange.js.map