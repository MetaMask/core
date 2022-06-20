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
const GasFeeController_1 = require("./GasFeeController");
/**
 * Obtains a set of max base and priority fee estimates along with time estimates so that we
 * can present them to users when they are sending transactions or making swaps.
 *
 * @param args - The arguments.
 * @param args.isEIP1559Compatible - Governs whether or not we can use an EIP-1559-only method to
 * produce estimates.
 * @param args.isLegacyGasAPICompatible - Governs whether or not we can use a non-EIP-1559 method to
 * produce estimates (for instance, testnets do not support estimates altogether).
 * @param args.fetchGasEstimates - A function that fetches gas estimates using an EIP-1559-specific
 * API.
 * @param args.fetchGasEstimatesUrl - The URL for the API we can use to obtain EIP-1559-specific
 * estimates.
 * @param args.fetchGasEstimatesViaEthFeeHistory - A function that fetches gas estimates using
 * `eth_feeHistory` (an EIP-1559 feature).
 * @param args.fetchLegacyGasPriceEstimates - A function that fetches gas estimates using an
 * non-EIP-1559-specific API.
 * @param args.fetchLegacyGasPriceEstimatesUrl - The URL for the API we can use to obtain
 * non-EIP-1559-specific estimates.
 * @param args.fetchEthGasPriceEstimate - A function that fetches gas estimates using
 * `eth_gasPrice`.
 * @param args.calculateTimeEstimate - A function that determine time estimate bounds.
 * @param args.clientId - An identifier that an API can use to know who is asking for estimates.
 * @param args.ethQuery - An EthQuery instance we can use to talk to Ethereum directly.
 * @returns The gas fee calculations.
 */
function determineGasFeeCalculations({ isEIP1559Compatible, isLegacyGasAPICompatible, fetchGasEstimates, fetchGasEstimatesUrl, fetchGasEstimatesViaEthFeeHistory, fetchLegacyGasPriceEstimates, fetchLegacyGasPriceEstimatesUrl, fetchEthGasPriceEstimate, calculateTimeEstimate, clientId, ethQuery, }) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if (isEIP1559Compatible) {
                let estimates;
                try {
                    estimates = yield fetchGasEstimates(fetchGasEstimatesUrl, clientId);
                }
                catch (_a) {
                    estimates = yield fetchGasEstimatesViaEthFeeHistory(ethQuery);
                }
                const { suggestedMaxPriorityFeePerGas, suggestedMaxFeePerGas } = estimates.medium;
                const estimatedGasFeeTimeBounds = calculateTimeEstimate(suggestedMaxPriorityFeePerGas, suggestedMaxFeePerGas, estimates);
                return {
                    gasFeeEstimates: estimates,
                    estimatedGasFeeTimeBounds,
                    gasEstimateType: GasFeeController_1.GAS_ESTIMATE_TYPES.FEE_MARKET,
                };
            }
            else if (isLegacyGasAPICompatible) {
                const estimates = yield fetchLegacyGasPriceEstimates(fetchLegacyGasPriceEstimatesUrl, clientId);
                return {
                    gasFeeEstimates: estimates,
                    estimatedGasFeeTimeBounds: {},
                    gasEstimateType: GasFeeController_1.GAS_ESTIMATE_TYPES.LEGACY,
                };
            }
            throw new Error('Main gas fee/price estimation failed. Use fallback');
        }
        catch (_b) {
            try {
                const estimates = yield fetchEthGasPriceEstimate(ethQuery);
                return {
                    gasFeeEstimates: estimates,
                    estimatedGasFeeTimeBounds: {},
                    gasEstimateType: GasFeeController_1.GAS_ESTIMATE_TYPES.ETH_GASPRICE,
                };
            }
            catch (error) {
                if (error instanceof Error) {
                    throw new Error(`Gas fee/price estimation failed. Message: ${error.message}`);
                }
                throw error;
            }
        }
    });
}
exports.default = determineGasFeeCalculations;
//# sourceMappingURL=determineGasFeeCalculations.js.map