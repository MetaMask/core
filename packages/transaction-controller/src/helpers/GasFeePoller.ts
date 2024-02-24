import EventEmitter from 'events';
import type { GasFeeState } from '@metamask/gas-fee-controller';
import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../logger';
import type { GasFeeFlow, GasFeeFlowRequest } from '../types';
import { TransactionStatus, type TransactionMeta } from '../types';
import { getGasFeeFlow } from '../utils/gas-flow';

const log = createModuleLogger(projectLogger, 'gas-fee-poller');

const INTERVAL_MILLISECONDS = 10000;

/**
 * Automatically polls and updates suggested gas fees on unapproved transactions.
 */
export class GasFeePoller {
  hub: EventEmitter = new EventEmitter();

  #gasFeeFlows: GasFeeFlow[];

  #getChainIds: () => string[];

  #getEthQuery: () => any;

  #getGasFeeControllerEstimates: () => Promise<GasFeeState>;

  #getTransactions: () => TransactionMeta[];

  #timeout: any;

  #running = false;

  /**
   * Constructs a new instance of the GasFeePoller.
   *
   * @param options - The options for this instance.
   * @param options.gasFeeFlows - The gas fee flows to use to obtain suitable gas fees.
   * @param options.getChainIds - Callback to specify the chain IDs to monitor.
   * @param options.getEthQuery - Callback to obtain an EthQuery instance.
   * @param options.getGasFeeControllerEstimates - Callback to obtain the default fee estimates.
   * @param options.getTransactions - Callback to obtain the transaction data.
   * @param options.onStateChange - Callback to register a listener for controller state changes.
   */
  constructor({
    gasFeeFlows,
    getChainIds,
    getEthQuery,
    getGasFeeControllerEstimates,
    getTransactions,
    onStateChange,
  }: {
    gasFeeFlows: GasFeeFlow[];
    getChainIds: () => string[];
    getEthQuery: () => any;
    getGasFeeControllerEstimates: () => Promise<GasFeeState>;
    getTransactions: () => TransactionMeta[];
    onStateChange: (listener: () => void) => void;
  }) {
    this.#gasFeeFlows = gasFeeFlows;
    this.#getChainIds = getChainIds;
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
    await this.#updateUnapprovedTransactions();

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    this.#timeout = setTimeout(() => this.#onTimeout(), INTERVAL_MILLISECONDS);
  }

  async #updateUnapprovedTransactions() {
    const unapprovedTransactions = this.#getUnapprovedTransactions();

    log('Found unapproved transactions', {
      count: unapprovedTransactions.length,
    });

    const ethQuery = this.#getEthQuery();

    await Promise.all(
      unapprovedTransactions.map((tx) =>
        this.#updateTransactionSuggestedFees(tx, ethQuery),
      ),
    );
  }

  async #updateTransactionSuggestedFees(
    transactionMeta: TransactionMeta,
    ethQuery: any,
  ) {
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

    if (gasFeeFlow) {
      try {
        const response = await gasFeeFlow.getGasFees(request);

        transactionMeta.gasFeeEstimates = response.estimates;
      } catch (error) {
        log('Failed to get suggested gas fees', transactionMeta.id, error);
      }
    }

    if (!gasFeeFlow && transactionMeta.gasFeeEstimatesLoaded) {
      return;
    }

    transactionMeta.gasFeeEstimatesLoaded = true;

    this.hub.emit(
      'transaction-updated',
      transactionMeta,
      'GasFeePoller - Suggested gas fees updated',
    );

    log('Updated suggested gas fees', {
      gasFeeEstimates: transactionMeta.gasFeeEstimates,
      transaction: transactionMeta.id,
    });
  }

  #getUnapprovedTransactions() {
    const chainIds = this.#getChainIds();

    return this.#getTransactions().filter(
      (tx) =>
        chainIds.includes(tx.chainId as string) &&
        tx.status === TransactionStatus.unapproved,
    );
  }
}
