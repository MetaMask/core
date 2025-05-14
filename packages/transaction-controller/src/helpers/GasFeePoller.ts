import EthQuery from '@metamask/eth-query';
import type {
  FetchGasFeeEstimateOptions,
  GasFeeState,
} from '@metamask/gas-fee-controller';
import type { NetworkClientId, Provider } from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
// This package purposefully relies on Node's EventEmitter module.
// eslint-disable-next-line import-x/no-nodejs-modules
import EventEmitter from 'events';

import { projectLogger } from '../logger';
import type { TransactionControllerMessenger } from '../TransactionController';
import type {
  GasFeeEstimates,
  GasFeeFlow,
  GasFeeFlowRequest,
  GasPriceGasFeeEstimates,
  FeeMarketGasFeeEstimates,
  Layer1GasFeeFlow,
  LegacyGasFeeEstimates,
  TransactionMeta,
  TransactionParams,
} from '../types';
import {
  GasFeeEstimateLevel,
  GasFeeEstimateType,
  TransactionStatus,
  TransactionEnvelopeType,
} from '../types';
import { getGasFeeFlow } from '../utils/gas-flow';
import { getTransactionLayer1GasFee } from '../utils/layer1-gas-fee-flow';

const log = createModuleLogger(projectLogger, 'gas-fee-poller');

const INTERVAL_MILLISECONDS = 10000;

/**
 * Automatically polls and updates suggested gas fees on unapproved transactions.
 */
export class GasFeePoller {
  hub: EventEmitter = new EventEmitter();

  readonly #findNetworkClientIdByChainId: (
    chainId: Hex,
  ) => NetworkClientId | undefined;

  readonly #gasFeeFlows: GasFeeFlow[];

  readonly #getGasFeeControllerEstimates: (
    options: FetchGasFeeEstimateOptions,
  ) => Promise<GasFeeState>;

  readonly #getProvider: (networkClientId: NetworkClientId) => Provider;

  readonly #getTransactions: () => TransactionMeta[];

  readonly #layer1GasFeeFlows: Layer1GasFeeFlow[];

  readonly #messenger: TransactionControllerMessenger;

  #timeout: ReturnType<typeof setTimeout> | undefined;

  #running = false;

  /**
   * Constructs a new instance of the GasFeePoller.
   *
   * @param options - The options for this instance.
   * @param options.findNetworkClientIdByChainId - Callback to find the network client ID by chain ID.
   * @param options.gasFeeFlows - The gas fee flows to use to obtain suitable gas fees.
   * @param options.getGasFeeControllerEstimates - Callback to obtain the default fee estimates.
   * @param options.getProvider - Callback to obtain a provider instance.
   * @param options.getTransactions - Callback to obtain the transaction data.
   * @param options.layer1GasFeeFlows - The layer 1 gas fee flows to use to obtain suitable layer 1 gas fees.
   * @param options.messenger - The TransactionControllerMessenger instance.
   * @param options.onStateChange - Callback to register a listener for controller state changes.
   */
  constructor({
    findNetworkClientIdByChainId,
    gasFeeFlows,
    getGasFeeControllerEstimates,
    getProvider,
    getTransactions,
    layer1GasFeeFlows,
    messenger,
    onStateChange,
  }: {
    findNetworkClientIdByChainId: (chainId: Hex) => NetworkClientId | undefined;
    gasFeeFlows: GasFeeFlow[];
    getGasFeeControllerEstimates: (
      options: FetchGasFeeEstimateOptions,
    ) => Promise<GasFeeState>;
    getProvider: (networkClientId: NetworkClientId) => Provider;
    getTransactions: () => TransactionMeta[];
    layer1GasFeeFlows: Layer1GasFeeFlow[];
    messenger: TransactionControllerMessenger;
    onStateChange: (listener: () => void) => void;
  }) {
    this.#findNetworkClientIdByChainId = findNetworkClientIdByChainId;
    this.#gasFeeFlows = gasFeeFlows;
    this.#layer1GasFeeFlows = layer1GasFeeFlows;
    this.#getGasFeeControllerEstimates = getGasFeeControllerEstimates;
    this.#getProvider = getProvider;
    this.#getTransactions = getTransactions;
    this.#messenger = messenger;

    onStateChange(() => {
      const unapprovedTransactions = this.#getUnapprovedTransactions();

      if (unapprovedTransactions.length) {
        this.#start();
      } else {
        this.#stop();
      }
    });
  }

  #start() {
    if (this.#running) {
      return;
    }

    // Intentionally not awaiting since this starts the timeout chain.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.#onTimeout();

    this.#running = true;

    log('Started polling');
  }

  #stop() {
    if (!this.#running) {
      return;
    }

    clearTimeout(this.#timeout);

    this.#timeout = undefined;
    this.#running = false;

    log('Stopped polling');
  }

  async #onTimeout() {
    await this.#updateUnapprovedTransactions();

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    this.#timeout = setTimeout(() => this.#onTimeout(), INTERVAL_MILLISECONDS);
  }

  async #updateUnapprovedTransactions() {
    const unapprovedTransactions = this.#getUnapprovedTransactions();

    if (!unapprovedTransactions.length) {
      return;
    }

    log('Found unapproved transactions', unapprovedTransactions.length);

    const gasFeeControllerDataByChainId = await this.#getGasFeeControllerData(
      unapprovedTransactions,
    );

    log('Retrieved gas fee controller data', gasFeeControllerDataByChainId);

    await Promise.all(
      unapprovedTransactions.flatMap((tx) => {
        const { chainId } = tx;

        const gasFeeControllerData = gasFeeControllerDataByChainId.get(
          chainId,
        ) as GasFeeState;

        return this.#updateUnapprovedTransaction(tx, gasFeeControllerData);
      }),
    );
  }

  async #updateUnapprovedTransaction(
    transactionMeta: TransactionMeta,
    gasFeeControllerData: GasFeeState,
  ) {
    const { id } = transactionMeta;

    const [gasFeeEstimatesResponse, layer1GasFee] = await Promise.all([
      this.#updateTransactionGasFeeEstimates(
        transactionMeta,
        gasFeeControllerData,
      ),
      this.#updateTransactionLayer1GasFee(transactionMeta),
    ]);

    if (!gasFeeEstimatesResponse && !layer1GasFee) {
      return;
    }

    this.hub.emit('transaction-updated', {
      transactionId: id,
      gasFeeEstimates: gasFeeEstimatesResponse?.gasFeeEstimates,
      gasFeeEstimatesLoaded: gasFeeEstimatesResponse?.gasFeeEstimatesLoaded,
      layer1GasFee,
    });
  }

  async #updateTransactionGasFeeEstimates(
    transactionMeta: TransactionMeta,
    gasFeeControllerData: GasFeeState,
  ): Promise<
    | { gasFeeEstimates?: GasFeeEstimates; gasFeeEstimatesLoaded: boolean }
    | undefined
  > {
    const { networkClientId } = transactionMeta;

    const ethQuery = new EthQuery(this.#getProvider(networkClientId));
    const gasFeeFlow = getGasFeeFlow(
      transactionMeta,
      this.#gasFeeFlows,
      this.#messenger,
    );

    if (gasFeeFlow) {
      log(
        'Found gas fee flow',
        gasFeeFlow.constructor.name,
        transactionMeta.id,
      );
    }

    const request: GasFeeFlowRequest = {
      ethQuery,
      gasFeeControllerData,
      messenger: this.#messenger,
      transactionMeta,
    };

    let gasFeeEstimates: GasFeeEstimates | undefined;

    if (gasFeeFlow) {
      try {
        const response = await gasFeeFlow.getGasFees(request);
        gasFeeEstimates = response.estimates;
      } catch (error) {
        log('Failed to get suggested gas fees', transactionMeta.id, error);
      }
    }

    if (!gasFeeEstimates && transactionMeta.gasFeeEstimatesLoaded) {
      return undefined;
    }

    log('Updated gas fee estimates', {
      gasFeeEstimates,
      transaction: transactionMeta.id,
    });

    return { gasFeeEstimates, gasFeeEstimatesLoaded: true };
  }

  async #updateTransactionLayer1GasFee(
    transactionMeta: TransactionMeta,
  ): Promise<Hex | undefined> {
    const { networkClientId } = transactionMeta;
    const provider = this.#getProvider(networkClientId);

    const layer1GasFee = await getTransactionLayer1GasFee({
      layer1GasFeeFlows: this.#layer1GasFeeFlows,
      messenger: this.#messenger,
      provider,
      transactionMeta,
    });

    if (layer1GasFee) {
      log('Updated layer 1 gas fee', layer1GasFee, transactionMeta.id);
    }

    return layer1GasFee;
  }

  #getUnapprovedTransactions() {
    return this.#getTransactions().filter(
      (tx) => tx.status === TransactionStatus.unapproved,
    );
  }

  async #getGasFeeControllerData(
    transactions: TransactionMeta[],
  ): Promise<Map<string, GasFeeState>> {
    const networkClientIdsByChainId = new Map<Hex, NetworkClientId>();

    for (const transaction of transactions) {
      const { chainId, networkClientId: transactionNetworkClientId } =
        transaction;

      if (networkClientIdsByChainId.has(chainId)) {
        continue;
      }

      const networkClientId =
        transactionNetworkClientId ??
        (this.#findNetworkClientIdByChainId(chainId) as string);

      networkClientIdsByChainId.set(chainId, networkClientId);
    }

    log('Extracted network client IDs by chain ID', networkClientIdsByChainId);

    const entryPromises = Array.from(networkClientIdsByChainId.entries()).map(
      async ([chainId, networkClientId]) => {
        return [
          chainId,
          await this.#getGasFeeControllerEstimates({ networkClientId }),
        ] as const;
      },
    );

    return new Map(await Promise.all(entryPromises));
  }
}

/**
 * Updates gas properties for transaction.
 *
 * @param args - Argument bag.
 * @param args.txMeta - The transaction meta.
 * @param args.gasFeeEstimates - The gas fee estimates.
 * @param args.gasFeeEstimatesLoaded - Whether the gas fee estimates are loaded.
 * @param args.isTxParamsGasFeeUpdatesEnabled - Whether to update the gas fee properties in `txParams`.
 * @param args.layer1GasFee - The layer 1 gas fee.
 */
export function updateTransactionGasProperties({
  gasFeeEstimates,
  gasFeeEstimatesLoaded,
  isTxParamsGasFeeUpdatesEnabled,
  layer1GasFee,
  txMeta,
}: {
  gasFeeEstimates?: GasFeeEstimates;
  gasFeeEstimatesLoaded?: boolean;
  isTxParamsGasFeeUpdatesEnabled: (transactionMeta: TransactionMeta) => boolean;
  layer1GasFee?: Hex;
  txMeta: TransactionMeta;
}): void {
  const userFeeLevel = txMeta.userFeeLevel as GasFeeEstimateLevel;
  const isUsingGasFeeEstimateLevel =
    Object.values(GasFeeEstimateLevel).includes(userFeeLevel);
  const shouldUpdateTxParamsGasFees = isTxParamsGasFeeUpdatesEnabled(txMeta);

  if (
    shouldUpdateTxParamsGasFees &&
    isUsingGasFeeEstimateLevel &&
    gasFeeEstimates
  ) {
    const isEIP1559Compatible =
      txMeta.txParams.type !== TransactionEnvelopeType.legacy;

    updateGasFeeParameters(
      txMeta.txParams,
      gasFeeEstimates,
      userFeeLevel,
      isEIP1559Compatible,
    );
  }

  if (gasFeeEstimates) {
    txMeta.gasFeeEstimates = gasFeeEstimates;
  }

  if (gasFeeEstimatesLoaded !== undefined) {
    txMeta.gasFeeEstimatesLoaded = gasFeeEstimatesLoaded;
  }

  if (layer1GasFee) {
    txMeta.layer1GasFee = layer1GasFee;
  }
}

/**
 * Updates `txParams` gas values accordingly with given `userFeeLevel` from `txMeta.gasFeeEstimates`.
 *
 * @param args - Argument bag.
 * @param args.txMeta - The transaction meta.
 * @param args.userFeeLevel - The user fee level.
 */
export function updateTransactionGasEstimates({
  txMeta,
  userFeeLevel,
}: {
  txMeta: TransactionMeta;
  userFeeLevel: GasFeeEstimateLevel;
}): void {
  const { txParams, gasFeeEstimates } = txMeta;

  if (!gasFeeEstimates) {
    return;
  }

  const isEIP1559Compatible =
    txMeta.txParams.type !== TransactionEnvelopeType.legacy;

  updateGasFeeParameters(
    txParams,
    gasFeeEstimates,
    userFeeLevel,
    isEIP1559Compatible,
  );
}

/**
 * Updates gas fee parameters based on transaction type and gas estimate type
 *
 * @param txParams - The transaction parameters to update
 * @param gasFeeEstimates - The gas fee estimates
 * @param userFeeLevel - The user fee level
 * @param isEIP1559Compatible - Whether the transaction is EIP-1559 compatible
 */
function updateGasFeeParameters(
  txParams: TransactionParams,
  gasFeeEstimates: GasFeeEstimates,
  userFeeLevel: GasFeeEstimateLevel,
  isEIP1559Compatible: boolean,
): void {
  const { type: gasEstimateType } = gasFeeEstimates;

  if (isEIP1559Compatible) {
    // Handle EIP-1559 compatible transactions
    if (gasEstimateType === GasFeeEstimateType.FeeMarket) {
      const feeMarketGasFeeEstimates =
        gasFeeEstimates as FeeMarketGasFeeEstimates;
      txParams.maxFeePerGas =
        feeMarketGasFeeEstimates[userFeeLevel]?.maxFeePerGas;
      txParams.maxPriorityFeePerGas =
        feeMarketGasFeeEstimates[userFeeLevel]?.maxPriorityFeePerGas;
    }

    if (gasEstimateType === GasFeeEstimateType.GasPrice) {
      const gasPriceGasFeeEstimates =
        gasFeeEstimates as GasPriceGasFeeEstimates;
      txParams.maxFeePerGas = gasPriceGasFeeEstimates.gasPrice;
      txParams.maxPriorityFeePerGas = gasPriceGasFeeEstimates.gasPrice;
    }

    if (gasEstimateType === GasFeeEstimateType.Legacy) {
      const legacyGasFeeEstimates = gasFeeEstimates as LegacyGasFeeEstimates;
      const gasPrice = legacyGasFeeEstimates[userFeeLevel];
      txParams.maxFeePerGas = gasPrice;
      txParams.maxPriorityFeePerGas = gasPrice;
    }

    // Remove gasPrice for EIP-1559 transactions
    delete txParams.gasPrice;
  } else {
    // Handle non-EIP-1559 transactions
    if (gasEstimateType === GasFeeEstimateType.FeeMarket) {
      const feeMarketGasFeeEstimates =
        gasFeeEstimates as FeeMarketGasFeeEstimates;
      txParams.gasPrice = feeMarketGasFeeEstimates[userFeeLevel]?.maxFeePerGas;
    }

    if (gasEstimateType === GasFeeEstimateType.GasPrice) {
      const gasPriceGasFeeEstimates =
        gasFeeEstimates as GasPriceGasFeeEstimates;
      txParams.gasPrice = gasPriceGasFeeEstimates.gasPrice;
    }

    if (gasEstimateType === GasFeeEstimateType.Legacy) {
      const legacyGasFeeEstimates = gasFeeEstimates as LegacyGasFeeEstimates;
      txParams.gasPrice = legacyGasFeeEstimates[userFeeLevel];
    }

    // Remove EIP-1559 specific parameters for legacy transactions
    delete txParams.maxFeePerGas;
    delete txParams.maxPriorityFeePerGas;
  }
}