import type { Patch } from 'immer';

import EthQuery from 'eth-query';
import { v1 as random } from 'uuid';
import { isHexString } from 'ethereumjs-util';
import { BaseController } from '../BaseControllerV2';
import { safelyExecute } from '../util';
import type { RestrictedControllerMessenger } from '../ControllerMessenger';
import type {
  NetworkController,
  NetworkState,
} from '../network/NetworkController';
import {
  fetchGasEstimates as defaultFetchGasEstimates,
  fetchEthGasPriceEstimate as defaultFetchEthGasPriceEstimate,
  fetchLegacyGasPriceEstimates as defaultFetchLegacyGasPriceEstimates,
  calculateTimeEstimate,
} from './gas-util';

const GAS_FEE_API = 'https://mock-gas-server.herokuapp.com/';
export const LEGACY_GAS_PRICES_API_URL = `https://api.metaswap.codefi.network/gasPrices`;

export type unknownString = 'unknown';

// Fee Market describes the way gas is set after the london hardfork, and was
// defined by EIP-1559.
export type FeeMarketEstimateType = 'fee-market';
// Legacy describes gasPrice estimates from before london hardfork, when the
// user is connected to mainnet and are presented with fast/average/slow
// estimate levels to choose from.
export type LegacyEstimateType = 'legacy';
// EthGasPrice describes a gasPrice estimate received from eth_gasPrice. Post
// london this value should only be used for legacy type transactions when on
// networks that support EIP-1559. This type of estimate is the most accurate
// to display on custom networks that don't support EIP-1559.
export type EthGasPriceEstimateType = 'eth_gasPrice';
// NoEstimate describes the state of the controller before receiving its first
// estimate.
export type NoEstimateType = 'none';

/**
 * Indicates which type of gasEstimate the controller is currently returning.
 * This is useful as a way of asserting that the shape of gasEstimates matches
 * expectations. NONE is a special case indicating that no previous gasEstimate
 * has been fetched.
 */
export const GAS_ESTIMATE_TYPES = {
  FEE_MARKET: 'fee-market' as FeeMarketEstimateType,
  LEGACY: 'legacy' as LegacyEstimateType,
  ETH_GASPRICE: 'eth_gasPrice' as EthGasPriceEstimateType,
  NONE: 'none' as NoEstimateType,
};

export type GasEstimateType =
  | FeeMarketEstimateType
  | EthGasPriceEstimateType
  | LegacyEstimateType
  | NoEstimateType;

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
  minWaitTimeEstimate: number; // a time duration in milliseconds
  maxWaitTimeEstimate: number; // a time duration in milliseconds
  suggestedMaxPriorityFeePerGas: string; // a GWEI decimal number
  suggestedMaxFeePerGas: string; // a GWEI decimal number
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

const metadata = {
  gasFeeEstimates: { persist: true, anonymous: false },
  estimatedGasFeeTimeBounds: { persist: true, anonymous: false },
  gasEstimateType: { persist: true, anonymous: false },
};

export type GasFeeStateEthGasPrice = {
  gasFeeEstimates: EthGasPriceEstimate;
  estimatedGasFeeTimeBounds: Record<string, never>;
  gasEstimateType: EthGasPriceEstimateType;
};

export type GasFeeStateFeeMarket = {
  gasFeeEstimates: GasFeeEstimates;
  estimatedGasFeeTimeBounds: EstimatedGasFeeTimeBounds | Record<string, never>;
  gasEstimateType: FeeMarketEstimateType;
};

export type GasFeeStateLegacy = {
  gasFeeEstimates: LegacyGasPriceEstimate;
  estimatedGasFeeTimeBounds: Record<string, never>;
  gasEstimateType: LegacyEstimateType;
};

export type GasFeeStateNoEstimates = {
  gasFeeEstimates: Record<string, never>;
  estimatedGasFeeTimeBounds: Record<string, never>;
  gasEstimateType: NoEstimateType;
};

export interface FetchGasFeeEstimateOptions {
  shouldUpdateState?: boolean;
}

/**
 * @type GasFeeState
 *
 * Gas Fee controller state
 *
 * @property gasFeeEstimates - Gas fee estimate data based on new EIP-1559 properties
 * @property estimatedGasFeeTimeBounds - Estimates representing the minimum and maximum
 */
export type GasFeeState =
  | GasFeeStateEthGasPrice
  | GasFeeStateFeeMarket
  | GasFeeStateLegacy
  | GasFeeStateNoEstimates;

const name = 'GasFeeController';

export type GasFeeStateChange = {
  type: `${typeof name}:stateChange`;
  payload: [GasFeeState, Patch[]];
};

export type GetGasFeeState = {
  type: `${typeof name}:getState`;
  handler: () => GasFeeState;
};

const defaultState: GasFeeState = {
  gasFeeEstimates: {},
  estimatedGasFeeTimeBounds: {},
  gasEstimateType: GAS_ESTIMATE_TYPES.NONE,
};

/**
 * Controller that retrieves gas fee estimate data and polls for updated data on a set interval
 */
export class GasFeeController extends BaseController<typeof name, GasFeeState> {
  private intervalId?: NodeJS.Timeout;

  private intervalDelay;

  private pollTokens: Set<string>;

  private legacyAPIEndpoint: string;

  private EIP1559APIEndpoint: string;

  private fetchGasEstimates;

  private fetchEthGasPriceEstimate;

  private fetchLegacyGasPriceEstimates;

  private getCurrentNetworkEIP1559Compatibility;

  private getCurrentNetworkLegacyGasAPICompatibility;

  private getCurrentAccountEIP1559Compatibility;

  private getChainId;

  private currentChainId;

  private ethQuery: any;

  /**
   * Creates a GasFeeController instance
   *
   */
  constructor({
    interval = 15000,
    messenger,
    state,
    fetchGasEstimates = defaultFetchGasEstimates,
    fetchEthGasPriceEstimate = defaultFetchEthGasPriceEstimate,
    fetchLegacyGasPriceEstimates = defaultFetchLegacyGasPriceEstimates,
    getCurrentNetworkEIP1559Compatibility,
    getCurrentAccountEIP1559Compatibility,
    getChainId,
    getCurrentNetworkLegacyGasAPICompatibility,
    getProvider,
    onNetworkStateChange,
    legacyAPIEndpoint = LEGACY_GAS_PRICES_API_URL,
    EIP1559APIEndpoint = GAS_FEE_API,
  }: {
    interval?: number;
    messenger: RestrictedControllerMessenger<
      typeof name,
      GetGasFeeState,
      GasFeeStateChange,
      GasFeeStateChange,
      never,
      never
    >;
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
  }) {
    super({
      name,
      metadata,
      messenger,
      state: { ...defaultState, ...state },
    });
    this.intervalDelay = interval;
    this.fetchGasEstimates = fetchGasEstimates;
    this.fetchEthGasPriceEstimate = fetchEthGasPriceEstimate;
    this.fetchLegacyGasPriceEstimates = fetchLegacyGasPriceEstimates;
    this.pollTokens = new Set();
    this.getCurrentNetworkEIP1559Compatibility = getCurrentNetworkEIP1559Compatibility;
    this.getCurrentNetworkLegacyGasAPICompatibility = getCurrentNetworkLegacyGasAPICompatibility;
    this.getCurrentAccountEIP1559Compatibility = getCurrentAccountEIP1559Compatibility;
    this.EIP1559APIEndpoint = EIP1559APIEndpoint;
    this.legacyAPIEndpoint = legacyAPIEndpoint;
    this.getChainId = getChainId;
    this.currentChainId = this.getChainId();
    const provider = getProvider();
    this.ethQuery = new EthQuery(provider);
    onNetworkStateChange(async () => {
      const newProvider = getProvider();
      const newChainId = this.getChainId();
      this.ethQuery = new EthQuery(newProvider);
      if (this.currentChainId !== newChainId) {
        this.currentChainId = newChainId;
        await this.resetPolling();
      }
    });
  }

  async resetPolling() {
    if (this.pollTokens.size !== 0) {
      const tokens = Array.from(this.pollTokens);
      this.stopPolling();
      await this.getGasFeeEstimatesAndStartPolling(tokens[0]);
      tokens.slice(1).forEach((token) => {
        this.pollTokens.add(token);
      });
    }
  }

  async fetchGasFeeEstimates(options?: FetchGasFeeEstimateOptions) {
    return await this._fetchGasFeeEstimateData(options);
  }

  async getGasFeeEstimatesAndStartPolling(
    pollToken: string | undefined,
  ): Promise<string> {
    if (this.pollTokens.size === 0) {
      await this._fetchGasFeeEstimateData();
    }

    const _pollToken = pollToken || random();

    this._startPolling(_pollToken);

    return _pollToken;
  }

  /**
   * Gets and sets gasFeeEstimates in state
   *
   * @returns GasFeeEstimates
   */
  async _fetchGasFeeEstimateData(
    options: FetchGasFeeEstimateOptions = {},
  ): Promise<GasFeeState | undefined> {
    const { shouldUpdateState = true } = options;
    let isEIP1559Compatible;
    const isLegacyGasAPICompatible = this.getCurrentNetworkLegacyGasAPICompatibility();

    let chainId = this.getChainId();
    if (typeof chainId === 'string' && isHexString(chainId)) {
      chainId = parseInt(chainId, 16);
    }
    try {
      isEIP1559Compatible = await this.getEIP1559Compatibility();
    } catch (e) {
      console.error(e);
      isEIP1559Compatible = false;
    }

    let newState: GasFeeState = {
      gasFeeEstimates: {},
      estimatedGasFeeTimeBounds: {},
      gasEstimateType: GAS_ESTIMATE_TYPES.NONE,
    };

    try {
      if (isEIP1559Compatible) {
        const estimates = await this.fetchGasEstimates(
          this.EIP1559APIEndpoint.replace('<chain_id>', `${chainId}`),
        );
        const {
          suggestedMaxPriorityFeePerGas,
          suggestedMaxFeePerGas,
        } = estimates.medium;
        const estimatedGasFeeTimeBounds = this.getTimeEstimate(
          suggestedMaxPriorityFeePerGas,
          suggestedMaxFeePerGas,
        );
        newState = {
          gasFeeEstimates: estimates,
          estimatedGasFeeTimeBounds,
          gasEstimateType: GAS_ESTIMATE_TYPES.FEE_MARKET,
        };
      } else if (isLegacyGasAPICompatible) {
        const estimates = await this.fetchLegacyGasPriceEstimates(
          this.legacyAPIEndpoint.replace('<chain_id>', `${chainId}`),
        );
        newState = {
          gasFeeEstimates: estimates,
          estimatedGasFeeTimeBounds: {},
          gasEstimateType: GAS_ESTIMATE_TYPES.LEGACY,
        };
      } else {
        throw new Error('Main gas fee/price estimation failed. Use fallback');
      }
    } catch {
      try {
        const estimates = await this.fetchEthGasPriceEstimate(this.ethQuery);
        newState = {
          gasFeeEstimates: estimates,
          estimatedGasFeeTimeBounds: {},
          gasEstimateType: GAS_ESTIMATE_TYPES.ETH_GASPRICE,
        };
      } catch (error) {
        throw new Error(
          `Gas fee/price estimation failed. Message: ${error.message}`,
        );
      }
    }
    if (shouldUpdateState) {
      this.update(() => {
        return newState;
      });
    }

    return newState;
  }

  /**
   * Remove the poll token, and stop polling if the set of poll tokens is empty
   */
  disconnectPoller(pollToken: string) {
    this.pollTokens.delete(pollToken);
    if (this.pollTokens.size === 0) {
      this.stopPolling();
    }
  }

  stopPolling() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    this.pollTokens.clear();
    this.resetState();
  }

  /**
   * Prepare to discard this controller.
   *
   * This stops any active polling.
   */
  destroy() {
    super.destroy();
    this.stopPolling();
  }

  // should take a token, so we know that we are only counting once for each open transaction
  private async _startPolling(pollToken: string) {
    if (this.pollTokens.size === 0) {
      this._poll();
    }
    this.pollTokens.add(pollToken);
  }

  private async _poll() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    this.intervalId = setInterval(async () => {
      await safelyExecute(() => this._fetchGasFeeEstimateData());
    }, this.intervalDelay);
  }

  private resetState() {
    this.update(() => {
      return defaultState;
    });
  }

  private async getEIP1559Compatibility() {
    const currentNetworkIsEIP1559Compatible = await this.getCurrentNetworkEIP1559Compatibility();
    const currentAccountIsEIP1559Compatible =
      this.getCurrentAccountEIP1559Compatibility?.() ?? true;

    return (
      currentNetworkIsEIP1559Compatible && currentAccountIsEIP1559Compatible
    );
  }

  getTimeEstimate(
    maxPriorityFeePerGas: string,
    maxFeePerGas: string,
  ): EstimatedGasFeeTimeBounds | Record<string, never> {
    if (
      !this.state.gasFeeEstimates ||
      this.state.gasEstimateType !== GAS_ESTIMATE_TYPES.FEE_MARKET
    ) {
      return {};
    }
    return calculateTimeEstimate(
      maxPriorityFeePerGas,
      maxFeePerGas,
      this.state.gasFeeEstimates,
    );
  }
}

export default GasFeeController;
