"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ethjs_unit_1 = require("ethjs-unit");
/**
 * Calculates reasonable minimum and maximum values for base fees over the last 200 blocks.
 *
 * @param blocks - A set of blocks obtained via {@link BlockFeeHistoryDatasetFetcher}.
 * @returns The ranges.
 */
function calculateBaseFeeRange(blocks) {
    const sortedBaseFeesPerGas = blocks
        .map((block) => block.baseFeePerGas)
        .sort((a, b) => a.cmp(b));
    return [
        ethjs_unit_1.fromWei(sortedBaseFeesPerGas[0], 'gwei'),
        ethjs_unit_1.fromWei(sortedBaseFeesPerGas[sortedBaseFeesPerGas.length - 1], 'gwei'),
    ];
}
exports.default = calculateBaseFeeRange;
//# sourceMappingURL=calculateBaseFeeRange.js.map