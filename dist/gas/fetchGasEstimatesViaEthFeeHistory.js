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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ethjs_unit_1 = require("ethjs-unit");
const constants_1 = require("../constants");
const fetchBlockFeeHistory_1 = __importDefault(require("./fetchBlockFeeHistory"));
const fetchLatestBlock_1 = __importDefault(require("./fetchGasEstimatesViaEthFeeHistory/fetchLatestBlock"));
const calculateGasFeeEstimatesForPriorityLevels_1 = __importDefault(require("./fetchGasEstimatesViaEthFeeHistory/calculateGasFeeEstimatesForPriorityLevels"));
/**
 * Generates gas fee estimates based on gas fees that have been used in the recent past so that
 * those estimates can be displayed to users.
 *
 * To produce the estimates, the last 5 blocks are read from the network, and for each block, the
 * priority fees for transactions at the 10th, 20th, and 30th percentiles are also read (here
 * "percentile" signifies the level at which those transactions contribute to the overall gas used
 * for the block, where higher percentiles correspond to higher fees). This information is used to
 * calculate reasonable max priority and max fees for three different priority levels (higher
 * priority = higher fee).
 *
 * Note that properties are returned for other data that are normally obtained via the API; however,
 * to prevent extra requests to Infura, these properties are empty.
 *
 * @param ethQuery - An EthQuery instance.
 * @returns Base and priority fee estimates, categorized by priority level, as well as an estimate
 * for the next block's base fee.
 */
function fetchGasEstimatesViaEthFeeHistory(ethQuery) {
    return __awaiter(this, void 0, void 0, function* () {
        const latestBlock = yield (0, fetchLatestBlock_1.default)(ethQuery);
        const blocks = yield (0, fetchBlockFeeHistory_1.default)({
            ethQuery,
            endBlock: latestBlock.number,
            numberOfBlocks: 5,
            percentiles: [10, 20, 30],
        });
        const estimatedBaseFee = (0, ethjs_unit_1.fromWei)(latestBlock.baseFeePerGas, constants_1.GWEI);
        const levelSpecificEstimates = (0, calculateGasFeeEstimatesForPriorityLevels_1.default)(blocks);
        return Object.assign(Object.assign({}, levelSpecificEstimates), { estimatedBaseFee, historicalBaseFeeRange: null, baseFeeTrend: null, latestPriorityFeeRange: null, historicalPriorityFeeRange: null, priorityFeeTrend: null, networkCongestion: null });
    });
}
exports.default = fetchGasEstimatesViaEthFeeHistory;
//# sourceMappingURL=fetchGasEstimatesViaEthFeeHistory.js.map