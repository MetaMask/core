import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import {
  convertHexToDecimal,
  safelyExecute,
  toHex,
} from '@metamask/controller-utils';
import EthQuery from '@metamask/eth-query';
import type {
  NetworkClientId,
  NetworkControllerGetEIP1559CompatibilityAction,
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerGetStateAction,
  NetworkControllerNetworkDidChangeEvent,
  NetworkState,
  ProviderProxy,
} from '@metamask/network-controller';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import type { Hex } from '@metamask/utils';
import { v1 as random } from 'uuid';

import determineGasFeeCalculations from './determineGasFeeCalculations';
import {
  fetchGasEstimates,
  fetchLegacyGasPriceEstimates,
  fetchEthGasPriceEstimate,
  calculateTimeEstimate,
} from './gas-util';

export const LEGACY_GAS_PRICES_API_URL = `https://api.metaswap.codefi.network/gasPrices`;

// TODO: Either fix this lint violation or explain why it's necessary to ignore.
// eslint-disable-next-line @typescript-eslint/naming-convention
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
 * @property networkCongestion - A normalized number that can be used to gauge the congestion
 * level of the network, with 0 meaning not congested and 1 meaning extremely congested
 */
export type GasFeeEstimates = SourcedGasFeeEstimates | FallbackGasFeeEstimates;

type SourcedGasFeeEstimates = {
  low: Eip1559GasFee;
  medium: Eip1559GasFee;
  high: Eip1559GasFee;
  estimatedBaseFee: string;
  historicalBaseFeeRange: [string, string];
  baseFeeTrend: 'up' | 'down' | 'level';
  latestPriorityFeeRange: [string, string];
  historicalPriorityFeeRange: [string, string];
  priorityFeeTrend: 'up' | 'down' | 'level';
  networkCongestion: number;
};

type FallbackGasFeeEstimates = {
  low: Eip1559GasFee;
  medium: Eip1559GasFee;
  high: Eip1559GasFee;
  estimatedBaseFee: string;
  historicalBaseFeeRange: null;
  baseFeeTrend: null;
  latestPriorityFeeRange: null;
  historicalPriorityFeeRange: null;
  priorityFeeTrend: null;
  networkCongestion: null;
};

const metadata = {
  gasFeeEstimatesByChainId: {
    persist: true,
    anonymous: false,
  },
  gasFeeEstimates: { persist: true, anonymous: false },
  estimatedGasFeeTimeBounds: { persist: true, anonymous: false },
  gasEstimateType: { persist: true, anonymous: false },
  nonRPCGasFeeApisDisabled: { persist: true, anonymous: false },
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
  networkClientId?: NetworkClientId;
};

/**
 * @type GasFeeState
 *
 * Gas Fee controller state
 * @property gasFeeEstimates - Gas fee estimate data based on new EIP-1559 properties
 * @property estimatedGasFeeTimeBounds - Estimates representing the minimum and maximum
 */
export type SingleChainGasFeeState =
  | GasFeeStateEthGasPrice
  | GasFeeStateFeeMarket
  | GasFeeStateLegacy
  | GasFeeStateNoEstimates;

export type GasFeeEstimatesByChainId = {
  gasFeeEstimatesByChainId?: Record<string, SingleChainGasFeeState>;
};

export type GasFeeState = GasFeeEstimatesByChainId &
  SingleChainGasFeeState & {
    nonRPCGasFeeApisDisabled?: boolean;
  };

const name = 'GasFeeController';

export type GasFeeStateChange = ControllerStateChangeEvent<
  typeof name,
  GasFeeState
>;

export type GetGasFeeState = ControllerGetStateAction<typeof name, GasFeeState>;

export type GasFeeControllerActions = GetGasFeeState;

export type GasFeeControllerEvents = GasFeeStateChange;

type AllowedActions =
  | NetworkControllerGetStateAction
  | NetworkControllerGetNetworkClientByIdAction
  | NetworkControllerGetEIP1559CompatibilityAction;

type GasFeeMessenger = RestrictedControllerMessenger<
  typeof name,
  GasFeeControllerActions | AllowedActions,
  GasFeeControllerEvents | NetworkControllerNetworkDidChangeEvent,
  AllowedActions['type'],
  NetworkControllerNetworkDidChangeEvent['type']
>;

const defaultState: GasFeeState = {
  gasFeeEstimatesByChainId: {},
  gasFeeEstimates: {},
  estimatedGasFeeTimeBounds: {},
  gasEstimateType: GAS_ESTIMATE_TYPES.NONE,
  nonRPCGasFeeApisDisabled: false,
};

/** The input to start polling for the {@link GasFeeController} */
type GasFeePollingInput = {
  networkClientId: NetworkClientId;
};

/**
 * Controller that retrieves gas fee estimate data and polls for updated data on a set interval
 */
export class GasFeeController extends StaticIntervalPollingController<GasFeePollingInput>()<
  typeof name,
  GasFeeState,
  GasFeeMessenger
> {
  private intervalId?: ReturnType<typeof setTimeout>;

  private readonly intervalDelay;

  private readonly pollTokens: Set<string>;

  private readonly legacyAPIEndpoint: string;

  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  private readonly EIP1559APIEndpoint: string;

  private readonly getCurrentNetworkEIP1559Compatibility;

  private readonly getCurrentNetworkLegacyGasAPICompatibility;

  private readonly getCurrentAccountEIP1559Compatibility;

  private currentChainId;

  private ethQuery?: EthQuery;

  private readonly clientId?: string;

  #getProvider: () => ProviderProxy;

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
   * @param options.onNetworkDidChange - A function for registering an event handler for the
   * network state change event.
   * @param options.legacyAPIEndpoint - The legacy gas price API URL. This option is primarily for
   * testing purposes.
   * @param options.EIP1559APIEndpoint - The EIP-1559 gas price API URL.
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
    onNetworkDidChange,
    legacyAPIEndpoint = LEGACY_GAS_PRICES_API_URL,
    EIP1559APIEndpoint,
    clientId,
  }: {
    interval?: number;
    messenger: GasFeeMessenger;
    state?: GasFeeState;
    getCurrentNetworkEIP1559Compatibility: () => Promise<boolean>;
    getCurrentNetworkLegacyGasAPICompatibility: () => boolean;
    getCurrentAccountEIP1559Compatibility?: () => boolean;
    getChainId?: () => Hex;
    getProvider: () => ProviderProxy;
    onNetworkDidChange?: (listener: (state: NetworkState) => void) => void;
    legacyAPIEndpoint?: string;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    EIP1559APIEndpoint: string;
    clientId?: string;
  }) {
    super({
      name,
      metadata,
      messenger,
      state: { ...defaultState, ...state },
    });
    this.intervalDelay = interval;
    this.setIntervalLength(interval);
    this.pollTokens = new Set();
    this.getCurrentNetworkEIP1559Compatibility =
      getCurrentNetworkEIP1559Compatibility;
    this.getCurrentNetworkLegacyGasAPICompatibility =
      getCurrentNetworkLegacyGasAPICompatibility;
    this.getCurrentAccountEIP1559Compatibility =
      getCurrentAccountEIP1559Compatibility;
    this.#getProvider = getProvider;
    this.EIP1559APIEndpoint = EIP1559APIEndpoint;
    this.legacyAPIEndpoint = legacyAPIEndpoint;
    this.clientId = clientId;

    this.ethQuery = new EthQuery(this.#getProvider());

    if (onNetworkDidChange && getChainId) {
      this.currentChainId = getChainId();
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      onNetworkDidChange(async (networkControllerState) => {
        await this.#onNetworkControllerDidChange(networkControllerState);
      });
    } else {
      const { selectedNetworkClientId } = this.messagingSystem.call(
        'NetworkController:getState',
      );
      this.currentChainId = this.messagingSystem.call(
        'NetworkController:getNetworkClientById',
        selectedNetworkClientId,
      ).configuration.chainId;
      this.messagingSystem.subscribe(
        'NetworkController:networkDidChange',
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        async (networkControllerState) => {
          await this.#onNetworkControllerDidChange(networkControllerState);
        },
      );
    }
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
    const _pollToken = pollToken || random();

    this.pollTokens.add(_pollToken);

    if (this.pollTokens.size === 1) {
      await this._fetchGasFeeEstimateData();
      this._poll();
    }

    return _pollToken;
  }

  /**
   * Gets and sets gasFeeEstimates in state.
   *
   * @param options - The gas fee estimate options.
   * @param options.shouldUpdateState - Determines whether the state should be updated with the
   * updated gas estimates.
   * @returns The gas fee estimates.
   */
  async _fetchGasFeeEstimateData(
    options: FetchGasFeeEstimateOptions = {},
  ): Promise<GasFeeState> {
    const { shouldUpdateState = true, networkClientId } = options;

    let ethQuery,
      isEIP1559Compatible,
      isLegacyGasAPICompatible,
      decimalChainId: number;

    if (networkClientId !== undefined) {
      const networkClient = this.messagingSystem.call(
        'NetworkController:getNetworkClientById',
        networkClientId,
      );
      isLegacyGasAPICompatible = networkClient.configuration.chainId === '0x38';

      decimalChainId = convertHexToDecimal(networkClient.configuration.chainId);

      try {
        const result = await this.messagingSystem.call(
          'NetworkController:getEIP1559Compatibility',
          networkClientId,
        );
        isEIP1559Compatible = result || false;
      } catch {
        isEIP1559Compatible = false;
      }
      ethQuery = new EthQuery(networkClient.provider);
    }

    ethQuery ??= this.ethQuery;

    isLegacyGasAPICompatible ??=
      this.getCurrentNetworkLegacyGasAPICompatibility();

    decimalChainId ??= convertHexToDecimal(this.currentChainId);

    try {
      isEIP1559Compatible ??= await this.getEIP1559Compatibility();
    } catch (e) {
      console.error(e);
      isEIP1559Compatible ??= false;
    }

    const gasFeeCalculations = await determineGasFeeCalculations({
      isEIP1559Compatible,
      isLegacyGasAPICompatible,
      fetchGasEstimates,
      fetchGasEstimatesUrl: this.EIP1559APIEndpoint.replace(
        '<chain_id>',
        `${decimalChainId}`,
      ),
      fetchLegacyGasPriceEstimates,
      fetchLegacyGasPriceEstimatesUrl: this.legacyAPIEndpoint.replace(
        '<chain_id>',
        `${decimalChainId}`,
      ),
      fetchEthGasPriceEstimate,
      calculateTimeEstimate,
      clientId: this.clientId,
      ethQuery,
      nonRPCGasFeeApisDisabled: this.state.nonRPCGasFeeApisDisabled,
    });

    if (shouldUpdateState) {
      const chainId = toHex(decimalChainId);
      this.update((state) => {
        if (this.currentChainId === chainId) {
          state.gasFeeEstimates = gasFeeCalculations.gasFeeEstimates;
          state.estimatedGasFeeTimeBounds =
            gasFeeCalculations.estimatedGasFeeTimeBounds;
          state.gasEstimateType = gasFeeCalculations.gasEstimateType;
        }
        state.gasFeeEstimatesByChainId ??= {};
        state.gasFeeEstimatesByChainId[chainId] = {
          gasFeeEstimates: gasFeeCalculations.gasFeeEstimates,
          estimatedGasFeeTimeBounds:
            gasFeeCalculations.estimatedGasFeeTimeBounds,
          gasEstimateType: gasFeeCalculations.gasEstimateType,
        } as SingleChainGasFeeState;
      });
    }

    return gasFeeCalculations;
  }

  /**
   * Remove the poll token, and stop polling if the set of poll tokens is empty.
   *
   * @param pollToken - The poll token to disconnect.
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
  override destroy() {
    super.destroy();
    this.stopPolling();
  }

  private _poll() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    this.intervalId = setInterval(async () => {
      await safelyExecute(() => this._fetchGasFeeEstimateData());
    }, this.intervalDelay);
  }

  /**
   * Fetching token list from the Token Service API.
   *
   * @private
   * @param input - The input for the poll.
   * @param input.networkClientId - The ID of the network client triggering the fetch.
   * @returns A promise that resolves when this operation completes.
   */
  async _executePoll({ networkClientId }: GasFeePollingInput): Promise<void> {
    await this._fetchGasFeeEstimateData({ networkClientId });
  }

  private resetState() {
    this.update(() => {
      return defaultState;
    });
  }

  private async getEIP1559Compatibility() {
    const currentNetworkIsEIP1559Compatible =
      await this.getCurrentNetworkEIP1559Compatibility();
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

  async #onNetworkControllerDidChange({
    selectedNetworkClientId,
  }: NetworkState) {
    const newChainId = this.messagingSystem.call(
      'NetworkController:getNetworkClientById',
      selectedNetworkClientId,
    ).configuration.chainId;

    if (newChainId !== this.currentChainId) {
      this.ethQuery = new EthQuery(this.#getProvider());
      await this.resetPolling();

      this.currentChainId = newChainId;
    }
  }

  enableNonRPCGasFeeApis() {
    this.update((state) => {
      state.nonRPCGasFeeApisDisabled = false;
    });
  }

  disableNonRPCGasFeeApis() {
    this.update((state) => {
      state.nonRPCGasFeeApisDisabled = true;
    });
  }
}

export default GasFeeController;
