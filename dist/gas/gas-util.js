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
exports.calculateTimeEstimate = exports.fetchEthGasPriceEstimate = exports.fetchLegacyGasPriceEstimates = exports.fetchGasEstimates = void 0;
const ethereumjs_util_1 = require("ethereumjs-util");
const util_1 = require("../util");
function fetchGasEstimates(url) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield util_1.handleFetch(url);
    });
}
exports.fetchGasEstimates = fetchGasEstimates;
/**
 * Hit the legacy MetaSwaps gasPrices estimate api and return the low, medium
 * high values from that API.
 */
function fetchLegacyGasPriceEstimates(url) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield util_1.handleFetch(url, {
            referrer: url,
            referrerPolicy: 'no-referrer-when-downgrade',
            method: 'GET',
            mode: 'cors',
            headers: {
                'Content-Type': 'application/json',
            },
        });
        return {
            low: result.SafeGasPrice,
            medium: result.ProposeGasPrice,
            high: result.FastGasPrice,
        };
    });
}
exports.fetchLegacyGasPriceEstimates = fetchLegacyGasPriceEstimates;
function fetchEthGasPriceEstimate(ethQuery) {
    return __awaiter(this, void 0, void 0, function* () {
        const gasPrice = yield util_1.query(ethQuery, 'gasPrice');
        return {
            gasPrice: util_1.weiHexToGweiDec(gasPrice).toString(),
        };
    });
}
exports.fetchEthGasPriceEstimate = fetchEthGasPriceEstimate;
function calculateTimeEstimate(maxPriorityFeePerGas, maxFeePerGas, gasFeeEstimates) {
    const { low, medium, high, estimatedBaseFee } = gasFeeEstimates;
    const maxPriorityFeePerGasInWEI = util_1.gweiDecToWEIBN(maxPriorityFeePerGas);
    const maxFeePerGasInWEI = util_1.gweiDecToWEIBN(maxFeePerGas);
    const estimatedBaseFeeInWEI = util_1.gweiDecToWEIBN(estimatedBaseFee);
    const effectiveMaxPriorityFee = ethereumjs_util_1.BN.min(maxPriorityFeePerGasInWEI, maxFeePerGasInWEI.sub(estimatedBaseFeeInWEI));
    const lowMaxPriorityFeeInWEI = util_1.gweiDecToWEIBN(low.suggestedMaxPriorityFeePerGas);
    const mediumMaxPriorityFeeInWEI = util_1.gweiDecToWEIBN(medium.suggestedMaxPriorityFeePerGas);
    const highMaxPriorityFeeInWEI = util_1.gweiDecToWEIBN(high.suggestedMaxPriorityFeePerGas);
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