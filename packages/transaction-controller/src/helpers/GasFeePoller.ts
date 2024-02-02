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

const INTERVAL_MILLISECONDS = 10000;
const LEVELS = ['low', 'medium', 'high'] as const;

export class GasFeePoller {
  hub: EventEmitter = new EventEmitter();

  #gasFeeFlows: GasFeeFlow[];

  #getEthQuery: () => EthQuery;

  #getGasFeeControllerEstimates: () => Promise<GasFeeState>;

  #getProviderConfig: () => ProviderConfig;

  #getTransactions: () => TransactionMeta[];

  #timeout: ReturnType<typeof setTimeout> | undefined;

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

    for (const transactionMeta of unapprovedTransactions) {
      await this.#updateTransactionSuggestedFees(transactionMeta, ethQuery);
    }
  }

  async #updateTransactionSuggestedFees(
    transactionMeta: TransactionMeta,
    ethQuery: EthQuery,
  ) {
    const gasFeeFlow = getGasFeeFlow(transactionMeta, this.#gasFeeFlows);

    if (!gasFeeFlow) {
      log('Skipping update as no gas fee flow found', transactionMeta.id);

      return;
    }

    log('Found gas fee flow', gasFeeFlow.constructor.name, transactionMeta.id);

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

    const debugSummary = LEVELS.map((level) => {
      const value = transactionMeta.suggestedGasFees?.[level]
        ?.maxFeePerGas as string;

      if (!value) {
        return 'Missing';
      }

      return `${value} (${parseInt(value, 16)})`;
    }).join(' | ');

    log('Updated suggested gas fees', debugSummary, {
      suggestedGasFees: transactionMeta.suggestedGasFees,
      transaction: transactionMeta.id,
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
