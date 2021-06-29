import type { Patch } from 'immer';
import { BaseController } from '../BaseControllerV2';
import type { RestrictedControllerMessenger } from '../ControllerMessenger';
import type { NetworkController, NetworkState } from '../network/NetworkController';
import { fetchGasEstimates as defaultFetchGasEstimates, fetchEthGasPriceEstimate as defaultFetchEthGasPriceEstimate, fetchLegacyGasPriceEstimates as defaultFetchLegacyGasPriceEstimates } from './gas-util';
export declare const LEGACY_GAS_PRICES_API_URL = "https://api.metaswap.codefi.network/gasPrices";
export declare type unknownString = 'unknown';
export declare type FeeMarketEstimateType = 'fee-market';
export declare type LegacyEstimateType = 'legacy';
export declare type EthGasPriceEstimateType = 'eth_gasPrice';
export declare type NoEstimateType = 'none';
/**
 * Indicates which type of gasEstimate the controller is currently returning.
 * This is useful as a way of asserting that the shape of gasEstimates matches
 * expectations. NONE is a special case indicating that no previous gasEstimate
 * has been fetched.
 */
export declare const GAS_ESTIMATE_TYPES: {
    FEE_MARKET: "fee-market";
    LEGACY: "legacy";
    ETH_GASPRICE: "eth_gasPrice";
    NONE: "none";
};
export declare type GasEstimateType = FeeMarketEstimateType | EthGasPriceEstimateType | LegacyEstimateType | NoEstimateType;
export interface EstimatedGasFeeTimeBounds {
    lowerTimeBound: number | null;
    upperTimeBound: number | unknownString;
}
/**
 * @type EthGasPriceEstimate
 *
 * A single gas price estimate for networks and accounts that don't support EIP-1559
 * This estimate comes from eth_gasPrice but is converted to dec gwei to match other
 * return values
 *
 * @property gasPrice - A GWEI dec string
 */
export interface EthGasPriceEstimate {
    gasPrice: string;
}
/**
 * @type LegacyGasPriceEstimate
 *
 * A set of gas price estimates for networks and accounts that don't support EIP-1559
 * These estimates include low, medium and high all as strings representing gwei in
 * decimal format.
 *
 * @property high - gasPrice, in decimal gwei string format, suggested for fast inclusion
 * @property medium - gasPrice, in decimal gwei string format, suggested for avg inclusion
 * @property low - gasPrice, in decimal gwei string format, suggested for slow inclusion
 */
export interface LegacyGasPriceEstimate {
    high: string;
    medium: string;
    low: string;
}
/**
 * @type Eip1559GasFee
 *
 * Data necessary to provide an estimate of a gas fee with a specific tip
 *
 * @property minWaitTimeEstimate - The fastest the transaction will take, in milliseconds
 * @property maxWaitTimeEstimate - The slowest the transaction will take, in milliseconds
 * @property suggestedMaxPriorityFeePerGas - A suggested "tip", a GWEI hex number
 * @property suggestedMaxFeePerGas - A suggested max fee, the most a user will pay. a GWEI hex number
 */
export interface Eip1559GasFee {
    minWaitTimeEstimate: number;
    maxWaitTimeEstimate: number;
    suggestedMaxPriorityFeePerGas: string;
    suggestedMaxFeePerGas: string;
}
/**
 * @type GasFeeEstimates
 *
 * Data necessary to provide multiple GasFee estimates, and supporting information, to the user
 *
 * @property low - A GasFee for a minimum necessary combination of tip and maxFee
 * @property medium - A GasFee for a recommended combination of tip and maxFee
 * @property high - A GasFee for a high combination of tip and maxFee
 * @property estimatedBaseFee - An estimate of what the base fee will be for the pending/next block. A GWEI dec number
 */
export interface GasFeeEstimates {
    low: Eip1559GasFee;
    medium: Eip1559GasFee;
    high: Eip1559GasFee;
    estimatedBaseFee: string;
}
export declare type GasFeeStateEthGasPrice = {
    gasFeeEstimates: EthGasPriceEstimate;
    estimatedGasFeeTimeBounds: Record<string, never>;
    gasEstimateType: EthGasPriceEstimateType;
};
export declare type GasFeeStateFeeMarket = {
    gasFeeEstimates: GasFeeEstimates;
    estimatedGasFeeTimeBounds: EstimatedGasFeeTimeBounds | Record<string, never>;
    gasEstimateType: FeeMarketEstimateType;
};
export declare type GasFeeStateLegacy = {
    gasFeeEstimates: LegacyGasPriceEstimate;
    estimatedGasFeeTimeBounds: Record<string, never>;
    gasEstimateType: LegacyEstimateType;
};
export declare type GasFeeStateNoEstimates = {
    gasFeeEstimates: Record<string, never>;
    estimatedGasFeeTimeBounds: Record<string, never>;
    gasEstimateType: NoEstimateType;
};
/**
 * @type GasFeeState
 *
 * Gas Fee controller state
 *
 * @property gasFeeEstimates - Gas fee estimate data based on new EIP-1559 properties
 * @property estimatedGasFeeTimeBounds - Estimates representing the minimum and maximum
 */
export declare type GasFeeState = GasFeeStateEthGasPrice | GasFeeStateFeeMarket | GasFeeStateLegacy | GasFeeStateNoEstimates;
declare const name = "GasFeeController";
export declare type GasFeeStateChange = {
    type: `${typeof name}:stateChange`;
    payload: [GasFeeState, Patch[]];
};
export declare type GetGasFeeState = {
    type: `${typeof name}:getState`;
    handler: () => GasFeeState;
};
/**
 * Controller that retrieves gas fee estimate data and polls for updated data on a set interval
 */
export declare class GasFeeController extends BaseController<typeof name, GasFeeState> {
    private intervalId?;
    private intervalDelay;
    private pollTokens;
    private legacyAPIEndpoint;
    private EIP1559APIEndpoint;
    private fetchGasEstimates;
    private fetchEthGasPriceEstimate;
    private fetchLegacyGasPriceEstimates;
    private getCurrentNetworkEIP1559Compatibility;
    private getCurrentNetworkLegacyGasAPICompatibility;
    private getCurrentAccountEIP1559Compatibility;
    private getChainId;
    private ethQuery;
    /**
     * Creates a GasFeeController instance
     *
     */
    constructor({ interval, messenger, state, fetchGasEstimates, fetchEthGasPriceEstimate, fetchLegacyGasPriceEstimates, getCurrentNetworkEIP1559Compatibility, getCurrentAccountEIP1559Compatibility, getChainId, getCurrentNetworkLegacyGasAPICompatibility, getProvider, onNetworkStateChange, legacyAPIEndpoint, EIP1559APIEndpoint, }: {
        interval?: number;
        messenger: RestrictedControllerMessenger<typeof name, GetGasFeeState, GasFeeStateChange, never, never>;
        state?: GasFeeState;
        fetchGasEstimates?: typeof defaultFetchGasEstimates;
        fetchEthGasPriceEstimate?: typeof defaultFetchEthGasPriceEstimate;
        fetchLegacyGasPriceEstimates?: typeof defaultFetchLegacyGasPriceEstimates;
        getCurrentNetworkEIP1559Compatibility: () => Promise<boolean>;
        getCurrentNetworkLegacyGasAPICompatibility: () => boolean;
        getCurrentAccountEIP1559Compatibility?: () => boolean;
        getChainId: () => `0x${string}` | `${number}` | number;
        getProvider: () => NetworkController['provider'];
        onNetworkStateChange: (listener: (state: NetworkState) => void) => void;
        legacyAPIEndpoint?: string;
        EIP1559APIEndpoint?: string;
    });
    fetchGasFeeEstimates(): Promise<GasFeeState | undefined>;
    getGasFeeEstimatesAndStartPolling(pollToken: string | undefined): Promise<string>;
    /**
     * Gets and sets gasFeeEstimates in state
     *
     * @returns GasFeeEstimates
     */
    _fetchGasFeeEstimateData(): Promise<GasFeeState | undefined>;
    /**
     * Remove the poll token, and stop polling if the set of poll tokens is empty
     */
    disconnectPoller(pollToken: string): void;
    stopPolling(): void;
    /**
     * Prepare to discard this controller.
     *
     * This stops any active polling.
     */
    destroy(): void;
    private _startPolling;
    private _poll;
    private resetState;
    private getEIP1559Compatibility;
    getTimeEstimate(maxPriorityFeePerGas: string, maxFeePerGas: string): EstimatedGasFeeTimeBounds | Record<string, never>;
}
export default GasFeeController;
