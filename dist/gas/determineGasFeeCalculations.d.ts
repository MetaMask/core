import { EstimatedGasFeeTimeBounds, EthGasPriceEstimate, GasFeeEstimates, GasFeeState as GasFeeCalculations, LegacyGasPriceEstimate } from './GasFeeController';
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
export default function determineGasFeeCalculations({ isEIP1559Compatible, isLegacyGasAPICompatible, fetchGasEstimates, fetchGasEstimatesUrl, fetchGasEstimatesViaEthFeeHistory, fetchLegacyGasPriceEstimates, fetchLegacyGasPriceEstimatesUrl, fetchEthGasPriceEstimate, calculateTimeEstimate, clientId, ethQuery, }: {
    isEIP1559Compatible: boolean;
    isLegacyGasAPICompatible: boolean;
    fetchGasEstimates: (url: string, clientId?: string) => Promise<GasFeeEstimates>;
    fetchGasEstimatesUrl: string;
    fetchGasEstimatesViaEthFeeHistory: (ethQuery: any) => Promise<GasFeeEstimates>;
    fetchLegacyGasPriceEstimates: (url: string, clientId?: string) => Promise<LegacyGasPriceEstimate>;
    fetchLegacyGasPriceEstimatesUrl: string;
    fetchEthGasPriceEstimate: (ethQuery: any) => Promise<EthGasPriceEstimate>;
    calculateTimeEstimate: (maxPriorityFeePerGas: string, maxFeePerGas: string, gasFeeEstimates: GasFeeEstimates) => EstimatedGasFeeTimeBounds;
    clientId: string | undefined;
    ethQuery: any;
}): Promise<GasFeeCalculations>;
