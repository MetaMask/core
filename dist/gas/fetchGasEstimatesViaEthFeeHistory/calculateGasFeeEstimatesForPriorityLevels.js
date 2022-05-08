"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ethereumjs_util_1 = require("ethereumjs-util");
const ethjs_unit_1 = require("ethjs-unit");
const constants_1 = require("../../constants");
const medianOf_1 = __importDefault(require("./medianOf"));
const PRIORITY_LEVELS = ['low', 'medium', 'high'];
const PRIORITY_LEVEL_PERCENTILES = [10, 20, 30];
const SETTINGS_BY_PRIORITY_LEVEL = {
    low: {
        percentile: 10,
        baseFeePercentageMultiplier: new ethereumjs_util_1.BN(110),
        priorityFeePercentageMultiplier: new ethereumjs_util_1.BN(94),
        minSuggestedMaxPriorityFeePerGas: new ethereumjs_util_1.BN(1000000000),
        estimatedWaitTimes: {
            minWaitTimeEstimate: 15000,
            maxWaitTimeEstimate: 30000,
        },
    },
    medium: {
        percentile: 20,
        baseFeePercentageMultiplier: new ethereumjs_util_1.BN(120),
        priorityFeePercentageMultiplier: new ethereumjs_util_1.BN(97),
        minSuggestedMaxPriorityFeePerGas: new ethereumjs_util_1.BN(1500000000),
        estimatedWaitTimes: {
            minWaitTimeEstimate: 15000,
            maxWaitTimeEstimate: 45000,
        },
    },
    high: {
        percentile: 30,
        baseFeePercentageMultiplier: new ethereumjs_util_1.BN(125),
        priorityFeePercentageMultiplier: new ethereumjs_util_1.BN(98),
        minSuggestedMaxPriorityFeePerGas: new ethereumjs_util_1.BN(2000000000),
        estimatedWaitTimes: {
            minWaitTimeEstimate: 15000,
            maxWaitTimeEstimate: 60000,
        },
    },
};
/**
 * Calculates a set of estimates assigned to a particular priority level based on the data returned
 * by `eth_feeHistory`.
 *
 * @param priorityLevel - The level of fees that dictates how soon a transaction may go through
 * ("low", "medium", or "high").
 * @param blocks - A set of blocks as obtained from {@link fetchBlockFeeHistory}.
 * @returns The estimates.
 */
function calculateEstimatesForPriorityLevel(priorityLevel, blocks) {
    const settings = SETTINGS_BY_PRIORITY_LEVEL[priorityLevel];
    const latestBaseFeePerGas = blocks[blocks.length - 1].baseFeePerGas;
    const adjustedBaseFee = latestBaseFeePerGas
        .mul(settings.baseFeePercentageMultiplier)
        .divn(100);
    const priorityFees = blocks
        .map((block) => {
        return 'priorityFeesByPercentile' in block
            ? block.priorityFeesByPercentile[settings.percentile]
            : null;
    })
        .filter(ethereumjs_util_1.BN.isBN);
    const medianPriorityFee = (0, medianOf_1.default)(priorityFees);
    const adjustedPriorityFee = medianPriorityFee
        .mul(settings.priorityFeePercentageMultiplier)
        .divn(100);
    const suggestedMaxPriorityFeePerGas = ethereumjs_util_1.BN.max(adjustedPriorityFee, settings.minSuggestedMaxPriorityFeePerGas);
    const suggestedMaxFeePerGas = adjustedBaseFee.add(suggestedMaxPriorityFeePerGas);
    return Object.assign(Object.assign({}, settings.estimatedWaitTimes), { suggestedMaxPriorityFeePerGas: (0, ethjs_unit_1.fromWei)(suggestedMaxPriorityFeePerGas, constants_1.GWEI), suggestedMaxFeePerGas: (0, ethjs_unit_1.fromWei)(suggestedMaxFeePerGas, constants_1.GWEI) });
}
/**
 * Calculates a set of estimates suitable for different priority levels based on the data returned
 * by `eth_feeHistory`.
 *
 * @param blocks - A set of blocks populated with data for priority fee percentiles 10, 20, and 30,
 * obtained via {@link BlockFeeHistoryDatasetFetcher}.
 * @returns The estimates.
 */
function calculateGasFeeEstimatesForPriorityLevels(blocks) {
    return PRIORITY_LEVELS.reduce((obj, priorityLevel) => {
        const gasEstimatesForPriorityLevel = calculateEstimatesForPriorityLevel(priorityLevel, blocks);
        return Object.assign(Object.assign({}, obj), { [priorityLevel]: gasEstimatesForPriorityLevel });
    }, {});
}
exports.default = calculateGasFeeEstimatesForPriorityLevels;
//# sourceMappingURL=calculateGasFeeEstimatesForPriorityLevels.js.map