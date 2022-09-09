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
exports.calculateTimeEstimate = exports.fetchEthGasPriceEstimate = exports.fetchLegacyGasPriceEstimates = exports.fetchGasEstimates = exports.normalizeGWEIDecimalNumbers = void 0;
const ethereumjs_util_1 = require("ethereumjs-util");
const util_1 = require("../util");
const makeClientIdHeader = (clientId) => ({ 'X-Client-Id': clientId });
/**
 * Convert a decimal GWEI value to a decimal string rounded to the nearest WEI.
 *
 * @param n - The input GWEI amount, as a decimal string or a number.
 * @returns The decimal string GWEI amount.
 */
function normalizeGWEIDecimalNumbers(n) {
    const numberAsWEIHex = (0, util_1.gweiDecToWEIBN)(n).toString(16);
    const numberAsGWEI = (0, util_1.weiHexToGweiDec)(numberAsWEIHex).toString(10);
    return numberAsGWEI;
}
exports.normalizeGWEIDecimalNumbers = normalizeGWEIDecimalNumbers;
/**
 * Fetch gas estimates from the given URL.
 *
 * @param url - The gas estimate URL.
 * @param clientId - The client ID used to identify to the API who is asking for estimates.
 * @returns The gas estimates.
 */
function fetchGasEstimates(url, clientId) {
    return __awaiter(this, void 0, void 0, function* () {
        const estimates = yield (0, util_1.handleFetch)(url, clientId ? { headers: makeClientIdHeader(clientId) } : undefined);
        return {
            low: Object.assign(Object.assign({}, estimates.low), { suggestedMaxPriorityFeePerGas: normalizeGWEIDecimalNumbers(estimates.low.suggestedMaxPriorityFeePerGas), suggestedMaxFeePerGas: normalizeGWEIDecimalNumbers(estimates.low.suggestedMaxFeePerGas) }),
            medium: Object.assign(Object.assign({}, estimates.medium), { suggestedMaxPriorityFeePerGas: normalizeGWEIDecimalNumbers(estimates.medium.suggestedMaxPriorityFeePerGas), suggestedMaxFeePerGas: normalizeGWEIDecimalNumbers(estimates.medium.suggestedMaxFeePerGas) }),
            high: Object.assign(Object.assign({}, estimates.high), { suggestedMaxPriorityFeePerGas: normalizeGWEIDecimalNumbers(estimates.high.suggestedMaxPriorityFeePerGas), suggestedMaxFeePerGas: normalizeGWEIDecimalNumbers(estimates.high.suggestedMaxFeePerGas) }),
            estimatedBaseFee: normalizeGWEIDecimalNumbers(estimates.estimatedBaseFee),
            historicalBaseFeeRange: estimates.historicalBaseFeeRange,
            baseFeeTrend: estimates.baseFeeTrend,
            latestPriorityFeeRange: estimates.latestPriorityFeeRange,
            historicalPriorityFeeRange: estimates.historicalPriorityFeeRange,
            priorityFeeTrend: estimates.priorityFeeTrend,
            networkCongestion: estimates.networkCongestion,
        };
    });
}
exports.fetchGasEstimates = fetchGasEstimates;
/**
 * Hit the legacy MetaSwaps gasPrices estimate api and return the low, medium
 * high values from that API.
 *
 * @param url - The URL to fetch gas price estimates from.
 * @param clientId - The client ID used to identify to the API who is asking for estimates.
 * @returns The gas price estimates.
 */
function fetchLegacyGasPriceEstimates(url, clientId) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield (0, util_1.handleFetch)(url, {
            referrer: url,
            referrerPolicy: 'no-referrer-when-downgrade',
            method: 'GET',
            mode: 'cors',
            headers: Object.assign({ 'Content-Type': 'application/json' }, (clientId && makeClientIdHeader(clientId))),
        });
        return {
            low: result.SafeGasPrice,
            medium: result.ProposeGasPrice,
            high: result.FastGasPrice,
        };
    });
}
exports.fetchLegacyGasPriceEstimates = fetchLegacyGasPriceEstimates;
/**
 * Get a gas price estimate from the network using the `eth_gasPrice` method.
 *
 * @param ethQuery - The EthQuery instance to call the network with.
 * @returns A gas price estimate.
 */
function fetchEthGasPriceEstimate(ethQuery) {
    return __awaiter(this, void 0, void 0, function* () {
        const gasPrice = yield (0, util_1.query)(ethQuery, 'gasPrice');
        return {
            gasPrice: (0, util_1.weiHexToGweiDec)(gasPrice).toString(),
        };
    });
}
exports.fetchEthGasPriceEstimate = fetchEthGasPriceEstimate;
/**
 * Estimate the time it will take for a transaction to be confirmed.
 *
 * @param maxPriorityFeePerGas - The max priority fee per gas.
 * @param maxFeePerGas - The max fee per gas.
 * @param gasFeeEstimates - The gas fee estimates.
 * @returns The estimated lower and upper bounds for when this transaction will be confirmed.
 */
function calculateTimeEstimate(maxPriorityFeePerGas, maxFeePerGas, gasFeeEstimates) {
    const { low, medium, high, estimatedBaseFee } = gasFeeEstimates;
    const maxPriorityFeePerGasInWEI = (0, util_1.gweiDecToWEIBN)(maxPriorityFeePerGas);
    const maxFeePerGasInWEI = (0, util_1.gweiDecToWEIBN)(maxFeePerGas);
    const estimatedBaseFeeInWEI = (0, util_1.gweiDecToWEIBN)(estimatedBaseFee);
    const effectiveMaxPriorityFee = ethereumjs_util_1.BN.min(maxPriorityFeePerGasInWEI, maxFeePerGasInWEI.sub(estimatedBaseFeeInWEI));
    const lowMaxPriorityFeeInWEI = (0, util_1.gweiDecToWEIBN)(low.suggestedMaxPriorityFeePerGas);
    const mediumMaxPriorityFeeInWEI = (0, util_1.gweiDecToWEIBN)(medium.suggestedMaxPriorityFeePerGas);
    const highMaxPriorityFeeInWEI = (0, util_1.gweiDecToWEIBN)(high.suggestedMaxPriorityFeePerGas);
    let lowerTimeBound;
    let upperTimeBound;
    if (effectiveMaxPriorityFee.lt(lowMaxPriorityFeeInWEI)) {
        lowerTimeBound = null;
        upperTimeBound = 'unknown';
    }
    else if (effectiveMaxPriorityFee.gte(lowMaxPriorityFeeInWEI) &&
        effectiveMaxPriorityFee.lt(mediumMaxPriorityFeeInWEI)) {
        lowerTimeBound = low.minWaitTimeEstimate;
        upperTimeBound = low.maxWaitTimeEstimate;
    }
    else if (effectiveMaxPriorityFee.gte(mediumMaxPriorityFeeInWEI) &&
        effectiveMaxPriorityFee.lt(highMaxPriorityFeeInWEI)) {
        lowerTimeBound = medium.minWaitTimeEstimate;
        upperTimeBound = medium.maxWaitTimeEstimate;
    }
    else if (effectiveMaxPriorityFee.eq(highMaxPriorityFeeInWEI)) {
        lowerTimeBound = high.minWaitTimeEstimate;
        upperTimeBound = high.maxWaitTimeEstimate;
    }
    else {
        lowerTimeBound = 0;
        upperTimeBound = high.maxWaitTimeEstimate;
    }
    return {
        lowerTimeBound,
        upperTimeBound,
    };
}
exports.calculateTimeEstimate = calculateTimeEstimate;
//# sourceMappingURL=gas-util.js.map