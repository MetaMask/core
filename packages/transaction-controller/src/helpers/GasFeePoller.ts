import type EthQuery from '@metamask/eth-query';
import type { GasFeeState } from '@metamask/gas-fee-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import EventEmitter from 'events';

import type { NetworkClientId } from '../../../network-controller/src';
import { projectLogger } from '../logger';
import type {
  GasFeeFlow,
  GasFeeFlowRequest,
  Layer1GasFeeFlow,
  Layer1GasFeeFlowRequest,
} from '../types';
import { TransactionStatus, type TransactionMeta } from '../types';
import { getGasFeeFlow } from '../utils/gas-flow';
import { getLayer1GasFeeFlow } from '../utils/layer1-gas-fee-flow';

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
   * @param options.getTransactions - Callback to obtain the transaction data.
   * @param options.layer1GasFeeFlows - The layer 1 gas fee flows to use to obtain suitable layer 1 gas fees.
   * @param options.onStateChange - Callback to register a listener for controller state changes.
   */
  constructor({
    gasFeeFlows,
    getEthQuery,
    getGasFeeControllerEstimates,
    getTransactions,
    layer1GasFeeFlows,
    onStateChange,
  }: {
    gasFeeFlows: GasFeeFlow[];
    getEthQuery: (chainId: Hex, networkClientId?: NetworkClientId) => EthQuery;
    getGasFeeControllerEstimates: () => Promise<GasFeeState>;
    getTransactions: () => TransactionMeta[];
    layer1GasFeeFlows: Layer1GasFeeFlow[];
    onStateChange: (listener: () => void) => void;
  }) {
    this.#gasFeeFlows = gasFeeFlows;
    this.#layer1GasFeeFlows = layer1GasFeeFlows;
    this.#getEthQuery = getEthQuery;
    this.#getGasFeeControllerEstimates = getGasFeeControllerEstimates;
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
      log('Skipping update as no gas fee flow found', transactionMeta.id);

      return;
    }

    log('Found gas fee flow', gasFeeFlow.constructor.name, transactionMeta.id);

    const request: GasFeeFlowRequest = {
      ethQuery,
      getGasFeeControllerEstimates: this.#getGasFeeControllerEstimates,
      transactionMeta,
    };

    try {
      const response = await gasFeeFlow.getGasFees(request);

      transactionMeta.gasFeeEstimates = response.estimates;
    } catch (error) {
      log('Failed to get suggested gas fees', transactionMeta.id, error);
      return;
    }

    this.hub.emit('transaction-updated', transactionMeta);

    log('Updated suggested gas fees', {
      gasFeeEstimates: transactionMeta.gasFeeEstimates,
      transaction: transactionMeta.id,
    });
  }

  async #updateTransactionLayer1GasFee(transactionMeta: TransactionMeta) {
    const layer1GasFeeFlow = getLayer1GasFeeFlow(
      transactionMeta,
      this.#layer1GasFeeFlows,
    );
    const { chainId, networkClientId } = transactionMeta;

    if (!layer1GasFeeFlow) {
      log(
        'Skipping update as no layer 1 gas fee flow found',
        transactionMeta.id,
      );
      return;
    }

    log(
      'Found layer 1 gas fee flow',
      layer1GasFeeFlow.constructor.name,
      transactionMeta.id,
    );

    const ethQuery = this.#getEthQuery(chainId, networkClientId);

    const request: Layer1GasFeeFlowRequest = {
      ethQuery,
      transactionMeta,
    };

    try {
      const { layer1Fee } = await layer1GasFeeFlow.getLayer1Fee(request);
      transactionMeta.layer1GasFee = layer1Fee;
    } catch (error) {
      log('Failed to get layer 1 gas fee', transactionMeta.id, error);
      return;
    }

    this.hub.emit('transaction-updated', transactionMeta);

    log('Updated layer 1 gas fee', {
      layer1GasFee: transactionMeta.layer1GasFee,
      transaction: transactionMeta.id,
    });
  }

  #getUnapprovedTransactions() {
    return this.#getTransactions().filter(
      (tx) => tx.status === TransactionStatus.unapproved,
    );
  }
}
