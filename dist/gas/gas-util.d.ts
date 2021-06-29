import { GasFeeEstimates, EthGasPriceEstimate, EstimatedGasFeeTimeBounds, LegacyGasPriceEstimate } from './GasFeeController';
export declare function fetchGasEstimates(url: string): Promise<GasFeeEstimates>;
/**
 * Hit the legacy MetaSwaps gasPrices estimate api and return the low, medium
 * high values from that API.
 */
export declare function fetchLegacyGasPriceEstimates(url: string): Promise<LegacyGasPriceEstimate>;
export declare function fetchEthGasPriceEstimate(ethQuery: any): Promise<EthGasPriceEstimate>;
export declare function calculateTimeEstimate(maxPriorityFeePerGas: string, maxFeePerGas: string, gasFeeEstimates: GasFeeEstimates): EstimatedGasFeeTimeBounds;
