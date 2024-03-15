import type EthQuery from '@metamask/eth-query';
import type { GasFeeState } from '@metamask/gas-fee-controller';
import type { NetworkClientId, Provider } from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import EventEmitter from 'events';

import { projectLogger } from '../logger';
import type {
  GasFeeEstimates,
  GasFeeFlow,
  GasFeeFlowRequest,
  Layer1GasFeeFlow,
} from '../types';
import { TransactionStatus, type TransactionMeta } from '../types';
import { getGasFeeFlow } from '../utils/gas-flow';
import { updateTransactionLayer1GasFee } from '../utils/layer1-gas-fee-flow';

const log = createModuleLogger(projectLogger, 'gas-fee-poller');

const INTERVAL_MILLISECONDS = 10000;

/**
 * Automatically polls and updates suggested gas fees on unapproved transactions.
 */
export class GasFeePoller {
  hub: EventEmitter = new EventEmitter();

  #gasFeeFlows: GasFeeFlow[];

  #getEthQuery: (chainId: Hex, networkClientId?: NetworkClientId) => EthQuery;

  #getGasFeeControllerEstimates: () => Promise<GasFeeState>;

  #getProvider: (chainId: Hex, networkClientId?: NetworkClientId) => Provider;

  #getTransactions: () => TransactionMeta[];

  #layer1GasFeeFlows: Layer1GasFeeFlow[];

  #timeout: ReturnType<typeof setTimeout> | undefined;

  #running = false;

  /**
   * Constructs a new instance of the GasFeePoller.
   * @param options - The options for this instance.
   * @param options.gasFeeFlows - The gas fee flows to use to obtain suitable gas fees.
   * @param options.getEthQuery - Callback to obtain an EthQuery instance.
   * @param options.getGasFeeControllerEstimates - Callback to obtain the default fee estimates.
   * @param options.getProvider - Callback to obtain a provider instance.
   * @param options.getTransactions - Callback to obtain the transaction data.
   * @param options.layer1GasFeeFlows - The layer 1 gas fee flows to use to obtain suitable layer 1 gas fees.
   * @param options.onStateChange - Callback to register a listener for controller state changes.
   */
  constructor({
    gasFeeFlows,
    getEthQuery,
    getGasFeeControllerEstimates,
    getProvider,
    getTransactions,
    layer1GasFeeFlows,
    onStateChange,
  }: {
    gasFeeFlows: GasFeeFlow[];
    getEthQuery: (chainId: Hex, networkClientId?: NetworkClientId) => EthQuery;
    getGasFeeControllerEstimates: () => Promise<GasFeeState>;
    getProvider: (chainId: Hex, networkClientId?: NetworkClientId) => Provider;
    getTransactions: () => TransactionMeta[];
    layer1GasFeeFlows: Layer1GasFeeFlow[];
    onStateChange: (listener: () => void) => void;
  }) {
    this.#gasFeeFlows = gasFeeFlows;
    this.#layer1GasFeeFlows = layer1GasFeeFlows;
    this.#getEthQuery = getEthQuery;
    this.#getGasFeeControllerEstimates = getGasFeeControllerEstimates;
    this.#getProvider = getProvider;
    this.#getTransactions = getTransactions;

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
    await this.#updateTransactionGasFeeEstimates();

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    this.#timeout = setTimeout(() => this.#onTimeout(), INTERVAL_MILLISECONDS);
  }

  async #updateTransactionGasFeeEstimates() {
    const unapprovedTransactions = this.#getUnapprovedTransactions();

    log('Found unapproved transactions', {
      count: unapprovedTransactions.length,
    });

    await Promise.all(
      unapprovedTransactions.flatMap((tx) => [
        this.#updateTransactionSuggestedFees(tx),
        this.#updateTransactionLayer1GasFee(tx),
      ]),
    );
  }

  async #updateTransactionSuggestedFees(transactionMeta: TransactionMeta) {
    const { chainId, networkClientId } = transactionMeta;

    const ethQuery = this.#getEthQuery(chainId, networkClientId);
    const gasFeeFlow = getGasFeeFlow(transactionMeta, this.#gasFeeFlows);

    if (!gasFeeFlow) {
      log('No gas fee flow found', transactionMeta.id);
    } else {
      log(
        'Found gas fee flow',
        gasFeeFlow.constructor.name,
        transactionMeta.id,
      );
    }

    const request: GasFeeFlowRequest = {
      ethQuery,
      getGasFeeControllerEstimates: this.#getGasFeeControllerEstimates,
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
      return;
    }

    const updatedTransactionMeta: TransactionMeta = {
      ...transactionMeta,
      gasFeeEstimates,
      gasFeeEstimatesLoaded: true,
    };

    this.hub.emit('transaction-updated', updatedTransactionMeta);

    log('Updated suggested gas fees', {
      gasFeeEstimates: updatedTransactionMeta.gasFeeEstimates,
      transaction: updatedTransactionMeta.id,
    });
  }

  async #updateTransactionLayer1GasFee(transactionMeta: TransactionMeta) {
    const { chainId, networkClientId } = transactionMeta;
    const provider = this.#getProvider(chainId, networkClientId);

    await updateTransactionLayer1GasFee({
      provider,
      layer1GasFeeFlows: this.#layer1GasFeeFlows,
      transactionMeta,
    });

    if (transactionMeta.layer1GasFee === undefined) {
      return;
    }

    this.hub.emit('transaction-updated', transactionMeta);
  }

  #getUnapprovedTransactions() {
    return this.#getTransactions().filter(
      (tx) => tx.status === TransactionStatus.unapproved,
    );
  }
}
