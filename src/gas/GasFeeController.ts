import type { Patch } from 'immer';

import { BN, isHexString } from 'ethereumjs-util';
import EthQuery from 'eth-query';
import { v1 as random } from 'uuid';

import { BaseController } from '../BaseControllerV2';
import { safelyExecute } from '../util';
import type { RestrictedControllerMessenger } from '../ControllerMessenger';
import type {
  NetworkController,
  NetworkState,
} from '../network/NetworkController';
import {
  fetchGasEstimates,
  fetchLegacyGasPriceEstimates,
  fetchEthGasPriceEstimate,
  calculateTimeEstimate,
} from './gas-util';
import determineGasFeeSuggestions from './determineGasFeeSuggestions';
import determineNetworkStatusInfo, {
  NetworkStatusInfo,
} from './determineNetworkStatusInfo';
import fetchGasEstimatesViaEthFeeHistory from './fetchGasEstimatesViaEthFeeHistory';

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

export type EstimatedGasFeeTimeBounds = {
  lowerTimeBound: number | null;
  upperTimeBound: number | unknownString;
};

/**
 * @type EthGasPriceEstimate
 *
 * A single gas price estimate for networks and accounts that don't support EIP-1559
 * This estimate comes from eth_gasPrice but is converted to dec gwei to match other
 * return values
 * @property gasPrice - A GWEI dec string
 */

export type EthGasPriceEstimate = {
  gasPrice: string;
};

/**
 * @type LegacyGasPriceEstimate
 *
 * A set of gas price estimates for networks and accounts that don't support EIP-1559
 * These estimates include low, medium and high all as strings representing gwei in
 * decimal format.
 * @property high - gasPrice, in decimal gwei string format, suggested for fast inclusion
 * @property medium - gasPrice, in decimal gwei string format, suggested for avg inclusion
 * @property low - gasPrice, in decimal gwei string format, suggested for slow inclusion
 */
export type LegacyGasPriceEstimate = {
  high: string;
  medium: string;
  low: string;
};

/**
 * @type Eip1559GasFee
 *
 * Data necessary to provide an estimate of a gas fee with a specific tip
 * @property minWaitTimeEstimate - The fastest the transaction will take, in milliseconds
 * @property maxWaitTimeEstimate - The slowest the transaction will take, in milliseconds
 * @property suggestedMaxPriorityFeePerGas - A suggested "tip", a GWEI hex number
 * @property suggestedMaxFeePerGas - A suggested max fee, the most a user will pay. a GWEI hex number
 */

export type Eip1559GasFee = {
  minWaitTimeEstimate: number; // a time duration in milliseconds
  maxWaitTimeEstimate: number; // a time duration in milliseconds
  suggestedMaxPriorityFeePerGas: string; // a GWEI decimal number
  suggestedMaxFeePerGas: string; // a GWEI decimal number
};

/**
 * @type GasFeeEstimates
 *
 * Data necessary to provide multiple GasFee estimates, and supporting information, to the user
 * @property low - A GasFee for a minimum necessary combination of tip and maxFee
 * @property medium - A GasFee for a recommended combination of tip and maxFee
 * @property high - A GasFee for a high combination of tip and maxFee
 * @property estimatedBaseFee - An estimate of what the base fee will be for the pending/next block. A GWEI dec number
 */

export type GasFeeEstimates = {
  low: Eip1559GasFee;
  medium: Eip1559GasFee;
  high: Eip1559GasFee;
  estimatedBaseFee: string;
};

const metadata = {
  gasFeeEstimates: { persist: true, anonymous: false },
  estimatedGasFeeTimeBounds: { persist: true, anonymous: false },
  gasEstimateType: { persist: true, anonymous: false },
  isNetworkBusy: { persist: true, anonymous: false },
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

export type FetchGasFeeEstimateOptions = {
  shouldUpdateState?: boolean;
};

/**
 * @type GasFeeState
 *
 * Gas Fee controller state
 * @property gasFeeEstimates - Gas fee estimate data based on new EIP-1559 properties
 * @property estimatedGasFeeTimeBounds - Estimates representing the minimum and maximum
 * @property gasEstimateType - Source of estimate data, if any
 * @property isNetworkBusy - Whether or not there are a lot of transactions taking place within the
 * network, causing high gas fees
 */
export type GasFeeState = GasFeeSuggestions & NetworkStatusInfo;

export type GasFeeSuggestions =
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

type GasFeeMessenger = RestrictedControllerMessenger<
  typeof name,
  GetGasFeeState,
  GasFeeStateChange,
  never,
  never
>;

const defaultState: GasFeeState = {
  gasFeeEstimates: {},
  estimatedGasFeeTimeBounds: {},
  gasEstimateType: GAS_ESTIMATE_TYPES.NONE,
  isNetworkBusy: false,
};

export type ChainId = `0x${string}` | `${number}` | number;

/**
 * Wraps the given function that is used to get the current chain id such that we guarantee that the
 * chain id is a decimal number.
 *
 * @param getChainId - A function that returns the chain id of the currently selected network as
 * a number expressed as a hex string, a decimal string, or a numeric value.
 * @returns A function that returns the chain id as a numeric value.
 */
function withNormalizedChainId(getChainId: () => ChainId): () => number {
  return () => {
    const chainId = getChainId();
    if (typeof chainId === 'string') {
      if (isHexString(chainId)) {
        return parseInt(chainId, 16);
      }
      return parseInt(chainId, 10);
    } else if (typeof chainId === 'number') {
      return chainId;
    }
    throw new Error(`Could not normalize chain id ${chainId}`);
  };
}

/**
 * Controller that retrieves gas fee estimate data and polls for updated data on a set interval
 */
export class GasFeeController extends BaseController<
  typeof name,
  GasFeeState,
  GasFeeMessenger
> {
  private intervalId?: NodeJS.Timeout;

  private intervalDelay;

  private pollTokens: Set<string>;

  private legacyAPIEndpoint: string;

  private EIP1559APIEndpoint: string;

  private determineNetworkStatusInfoUrlTemplate: ({
    chainId,
  }: {
    chainId: ChainId;
  }) => string;

  private getCurrentNetworkEIP1559Compatibility;

  private getCurrentNetworkLegacyGasAPICompatibility;

  private getCurrentAccountEIP1559Compatibility;

  private getChainId;

  private currentChainId: ChainId;

  private ethQuery: any;

  private clientId?: string;

  /**
   * Creates a GasFeeController instance.
   *
   * @param options - The controller options.
   * @param options.interval - The time in milliseconds to wait between polls.
   * @param options.messenger - The controller messenger.
   * @param options.state - The initial state.
   * @param options.getCurrentNetworkEIP1559Compatibility - Determines whether or not the current
   * network is EIP-1559 compatible.
   * @param options.getCurrentNetworkLegacyGasAPICompatibility - Determines whether or not the
   * current network is compatible with the legacy gas price API.
   * @param options.getCurrentAccountEIP1559Compatibility - Determines whether or not the current
   * account is EIP-1559 compatible.
   * @param options.getChainId - Returns the current chain ID.
   * @param options.getProvider - Returns a network provider for the current network.
   * @param options.onNetworkStateChange - A function for registering an event handler for the
   * network state change event.
   * @param options.legacyAPIEndpoint - The legacy gas price API URL. This option is primarily for
   * testing purposes.
   * @param options.EIP1559APIEndpoint - The EIP-1559 gas price API URL. This option is primarily
   * for testing purposes.
   * @param options.determineNetworkStatusInfoUrlTemplate - A function that returns a URL that will
   * be used to retrieve information about the status of the network.
   * @param options.clientId - The client ID used to identify to the gas estimation API who is
   * asking for estimates.
   */
  constructor({
    interval = 15000,
    messenger,
    state,
    getCurrentNetworkEIP1559Compatibility,
    getCurrentAccountEIP1559Compatibility,
    getChainId,
    getCurrentNetworkLegacyGasAPICompatibility,
    getProvider,
    onNetworkStateChange,
    legacyAPIEndpoint = LEGACY_GAS_PRICES_API_URL,
    EIP1559APIEndpoint = GAS_FEE_API,
    determineNetworkStatusInfoUrlTemplate,
    clientId,
  }: {
    interval?: number;
    messenger: GasFeeMessenger;
    state?: GasFeeState;
    getCurrentNetworkEIP1559Compatibility: () => Promise<boolean>;
    getCurrentNetworkLegacyGasAPICompatibility: () => boolean;
    getCurrentAccountEIP1559Compatibility?: () => boolean;
    getChainId: () => ChainId;
    getProvider: () => NetworkController['provider'];
    onNetworkStateChange: (listener: (state: NetworkState) => void) => void;
    legacyAPIEndpoint?: string;
    EIP1559APIEndpoint?: string;
    determineNetworkStatusInfoUrlTemplate: ({
      chainId,
    }: {
      chainId: ChainId;
    }) => string;
    clientId?: string;
  }) {
    super({
      name,
      metadata,
      messenger,
      state: { ...defaultState, ...state },
    });
    this.intervalDelay = interval;
    this.pollTokens = new Set();
    this.getCurrentNetworkEIP1559Compatibility = getCurrentNetworkEIP1559Compatibility;
    this.getCurrentNetworkLegacyGasAPICompatibility = getCurrentNetworkLegacyGasAPICompatibility;
    this.getCurrentAccountEIP1559Compatibility = getCurrentAccountEIP1559Compatibility;
    this.EIP1559APIEndpoint = EIP1559APIEndpoint;
    this.legacyAPIEndpoint = legacyAPIEndpoint;
    this.determineNetworkStatusInfoUrlTemplate = determineNetworkStatusInfoUrlTemplate;
    this.getChainId = withNormalizedChainId(getChainId);
    this.currentChainId = this.getChainId();
    const provider = getProvider();
    this.ethQuery = new EthQuery(provider);
    this.clientId = clientId;
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

  /**
   * Ensures that state is being continuously updated with gas fee estimate and network status data.
   * More specifically, if this method has not been called before, it makes a request and uses the
   * resulting data to update state appropriately, then creates a token that will represent that
   * request and adds it to a "hat". As long as the hat is not empty, then the request will be
   * re-run and state will be updated on a cadence.
   *
   * @param givenPollToken - Either a token that was obtained from a previous call to
   * ensurePollingFor, or undefined (to represent no token).
   * @returns A token to represent this particular request that can be used to decrease the size of
   * the polling "hat" later.
   */
  async getGasFeeEstimatesAndStartPolling(
    givenPollToken: string | undefined,
  ): Promise<string> {
    const pollToken = givenPollToken || random();

    this.pollTokens.add(pollToken);

    if (this.pollTokens.size === 1) {
      await this.poll();
      this.restartPolling();
    }

    return pollToken;
  }

  /**
   * Fetches gas fee estimates using a variety of strategies and (optionally) updates state with the
   * resulting data.
   *
   * @param options - Options for this method.
   * @param options.shouldUpdateState - Determines whether the state should be updated with the
   * fetched estimate data.
   * @returns The gas fee estimates.
   */
  async _fetchGasFeeEstimateData(
    options: FetchGasFeeEstimateOptions = {},
  ): Promise<GasFeeSuggestions> {
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

    const gasFeeSuggestions = await determineGasFeeSuggestions({
      isEIP1559Compatible,
      isLegacyGasAPICompatible,
      fetchGasEstimates,
      fetchGasEstimatesUrl: this.EIP1559APIEndpoint.replace(
        '<chain_id>',
        `${chainId}`,
      ),
      fetchGasEstimatesViaEthFeeHistory,
      fetchLegacyGasPriceEstimates,
      fetchLegacyGasPriceEstimatesUrl: this.legacyAPIEndpoint.replace(
        '<chain_id>',
        `${chainId}`,
      ),
      fetchEthGasPriceEstimate,
      calculateTimeEstimate,
      clientId: this.clientId,
      ethQuery: this.ethQuery,
    });

    if (shouldUpdateState) {
      this.update((state) => {
        state.gasFeeEstimates = gasFeeSuggestions.gasFeeEstimates;
        state.estimatedGasFeeTimeBounds =
          gasFeeSuggestions.estimatedGasFeeTimeBounds;
        state.gasEstimateType = gasFeeSuggestions.gasEstimateType;
      });
    }

    return gasFeeSuggestions;
  }

  /**
   * Removes the given token from a "hat" representing polling requests. If, before calling this
   * method, there is only one token in the hat, then this effectively stops polling.
   *
   * @param pollToken - A token returned from a previous call to getGasFeeEstimatesAndStartPolling.
   */
  disconnectPoller(pollToken: string): void {
    this.pollTokens.delete(pollToken);
    if (this.pollTokens.size === 0) {
      this.stopPolling();
    }
  }

  /**
   * Removes all tokens representing polling requests such that state updates will no occur on a
   * cadence.
   */
  stopPolling(): void {
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

  private restartPolling() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.intervalId = setInterval(() => {
      safelyExecute(() => this.poll());
    }, this.intervalDelay);
  }

  private async poll() {
    const isEIP1559Compatible = await this.getEIP1559Compatibility();

    const gasFeeSuggestions = await this._fetchGasFeeEstimateData();

    if (isEIP1559Compatible) {
      // TODO: Any way we can avoid doing this?
      const gasFeeEstimates = gasFeeSuggestions.gasFeeEstimates as GasFeeEstimates;
      await this.fetchAndUpdateWithNetworkStatus(
        new BN(gasFeeEstimates.estimatedBaseFee, 10),
      );
    }
  }

  private resetState() {
    this.update(() => {
      return defaultState;
    });
  }

  private async getEIP1559Compatibility(): Promise<boolean> {
    try {
      const currentNetworkIsEIP1559Compatible = await this.getCurrentNetworkEIP1559Compatibility();
      const currentAccountIsEIP1559Compatible =
        this.getCurrentAccountEIP1559Compatibility?.() ?? true;

      return (
        currentNetworkIsEIP1559Compatible && currentAccountIsEIP1559Compatible
      );
    } catch (e) {
      return false;
    }
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

  private async fetchAndUpdateWithNetworkStatus(
    latestBaseFee: BN,
  ): Promise<NetworkStatusInfo> {
    const chainId = this.getChainId();
    const url = this.determineNetworkStatusInfoUrlTemplate({ chainId });
    const networkStatusInfo = await determineNetworkStatusInfo({
      latestBaseFee,
      url,
      ethQuery: this.ethQuery,
      clientId: this.clientId,
    });

    this.update((state) => {
      state.isNetworkBusy = networkStatusInfo.isNetworkBusy;
    });

    return networkStatusInfo;
  }
}

export default GasFeeController;
