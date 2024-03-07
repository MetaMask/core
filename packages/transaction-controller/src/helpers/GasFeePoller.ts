import type EthQuery from '@metamask/eth-query';
import type { GasFeeState } from '@metamask/gas-fee-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import EventEmitter from 'events';

import type { NetworkClientId } from '../../../network-controller/src';
import { projectLogger } from '../logger';
import { TransactionStatus } from '../types';
import type {
  GasFeeEstimates,
  GasFeeFlow,
  GasFeeFlowRequest,
  TransactionMeta,
  TransactionParams,
  GetSmartTransactionFeeEstimatesResponse,
} from '../types';
import { getGasFeeFlow } from '../utils/gas-flow';

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

  #getSmartTransactionGasFeeEstimates: (
    tradeTransactionParams: TransactionParams,
  ) => Promise<GetSmartTransactionFeeEstimatesResponse>;

  #getTransactions: () => TransactionMeta[];

  #timeout: ReturnType<typeof setTimeout> | undefined;

  #running = false;

  /**
   * Constructs a new instance of the GasFeePoller.
   * @param options - The options for this instance.
   * @param options.gasFeeFlows - The gas fee flows to use to obtain suitable gas fees.
   * @param options.getEthQuery - Callback to obtain an EthQuery instance.
   * @param options.getGasFeeControllerEstimates - Callback to obtain the default fee estimates.
   * @param options.getSmartTransactionGasFeeEstimates - Callback to obtain the smart transaction fee estimates.
   * @param options.getTransactions - Callback to obtain the transaction data.
   * @param options.onStateChange - Callback to register a listener for controller state changes.
   */
  constructor({
    gasFeeFlows,
    getEthQuery,
    getGasFeeControllerEstimates,
    getSmartTransactionGasFeeEstimates,
    getTransactions,
    onStateChange,
  }: {
    gasFeeFlows: GasFeeFlow[];
    getEthQuery: (chainId: Hex, networkClientId?: NetworkClientId) => EthQuery;
    getGasFeeControllerEstimates: () => Promise<GasFeeState>;
    getTransactions: () => TransactionMeta[];
    getSmartTransactionGasFeeEstimates: (
      tradeTransactionParams: TransactionParams,
    ) => Promise<GetSmartTransactionFeeEstimatesResponse>;
    onStateChange: (listener: () => void) => void;
  }) {
    this.#gasFeeFlows = gasFeeFlows;
    this.#getEthQuery = getEthQuery;
    this.#getGasFeeControllerEstimates = getGasFeeControllerEstimates;
    this.#getSmartTransactionGasFeeEstimates =
      getSmartTransactionGasFeeEstimates;
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

    await Promise.all(
      unapprovedTransactions.map((tx) =>
        this.#updateTransactionSuggestedFees(tx),
      ),
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
      getSmartTransactionGasFeeEstimates:
        this.#getSmartTransactionGasFeeEstimates,
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

    transactionMeta.gasFeeEstimates = gasFeeEstimates;
    transactionMeta.gasFeeEstimatesLoaded = true;

    this.hub.emit('transaction-updated', transactionMeta);

    log('Updated suggested gas fees', {
      gasFeeEstimates: transactionMeta.gasFeeEstimates,
      transaction: transactionMeta.id,
    });
  }

  #getUnapprovedTransactions() {
    return this.#getTransactions().filter(
      (tx) => tx.status === TransactionStatus.unapproved,
    );
  }
}
