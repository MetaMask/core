import type EthQuery from '@metamask/eth-query';
import type { GasFeeState } from '@metamask/gas-fee-controller';
import type { ProviderConfig } from '@metamask/network-controller';
import { createModuleLogger } from '@metamask/utils';
import EventEmitter from 'events';

import { projectLogger } from '../logger';
import type { GasFeeFlow, GasFeeFlowRequest } from '../types';
import { TransactionStatus, type TransactionMeta } from '../types';
import { getGasFeeFlow } from '../utils/gas-flow';

const log = createModuleLogger(projectLogger, 'gas-fee-poller');

const POLLING_INTERVAL_MILLISECONDS = 10000;

export class GasFeePoller {
  hub: EventEmitter = new EventEmitter();

  #gasFeeFlows: GasFeeFlow[];

  #getEthQuery: () => EthQuery;

  #getGasFeeControllerEstimates: () => Promise<GasFeeState>;

  #getProviderConfig: () => ProviderConfig;

  #getTransactions: () => TransactionMeta[];

  #interval: ReturnType<typeof setInterval> | undefined;

  #running = false;

  constructor({
    gasFeeFlows,
    getEthQuery,
    getGasFeeControllerEstimates,
    getProviderConfig,
    getTransactions,
    onStateChange,
  }: {
    gasFeeFlows: GasFeeFlow[];
    getEthQuery: () => EthQuery;
    getGasFeeControllerEstimates: () => Promise<GasFeeState>;
    getProviderConfig: () => ProviderConfig;
    getTransactions: () => TransactionMeta[];
    onStateChange: (listener: () => void) => void;
  }) {
    this.#gasFeeFlows = gasFeeFlows;
    this.#getEthQuery = getEthQuery;
    this.#getGasFeeControllerEstimates = getGasFeeControllerEstimates;
    this.#getProviderConfig = getProviderConfig;
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

    this.#interval = setInterval(
      () => this.#updateTransactionSuggestedFees(),
      POLLING_INTERVAL_MILLISECONDS,
    );

    this.#running = true;

    log('Started polling');
  }

  #stop() {
    if (!this.#running) {
      return;
    }

    clearInterval(this.#interval);

    this.#interval = undefined;
    this.#running = false;

    log('Stopped polling');
  }

  async #updateTransactionSuggestedFees() {
    const unapprovedTransactions = this.#getUnapprovedTransactions();

    log('Updating suggested gas fees', {
      count: unapprovedTransactions.length,
    });

    const ethQuery = this.#getEthQuery();

    for (const transactionMeta of unapprovedTransactions) {
      await this.#updateTransactionSugesstedFees(transactionMeta, ethQuery);
    }
  }

  async #updateTransactionSugesstedFees(
    transactionMeta: TransactionMeta,
    ethQuery: EthQuery,
  ) {
    const gasFeeFlow = getGasFeeFlow(
      transactionMeta,
      this.#gasFeeFlows,
    ) as GasFeeFlow;

    const request: GasFeeFlowRequest = {
      ethQuery,
      getGasFeeControllerEstimates: this.#getGasFeeControllerEstimates,
      isEIP1559: false,
      transactionMeta,
    };

    try {
      const response = await gasFeeFlow.getGasFees(request);

      transactionMeta.suggestedGasFees = response;
    } catch (error) {
      log('Failed to get suggested gas fees', transactionMeta.id, error);
      return;
    }

    this.hub.emit(
      'transaction-updated',
      transactionMeta,
      'GasFeePoller - Suggested gas fees updated',
    );

    log('Updated suggested gas fees', {
      transaction: transactionMeta.id,
      suggestedGasFees: transactionMeta.suggestedGasFees,
    });
  }

  #getUnapprovedTransactions() {
    const currentChainId = this.#getProviderConfig().chainId;

    return this.#getTransactions().filter(
      (tx) =>
        tx.chainId === currentChainId &&
        tx.status === TransactionStatus.unapproved,
    );
  }
}
