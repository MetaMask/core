import EventEmitter from 'events';
import type { GasFeeState } from '@metamask/gas-fee-controller';
import type { ProviderConfig } from '@metamask/network-controller';

import { weiHexToGweiDec } from '@metamask/controller-utils';
import type {
  EIP1559SuggestedGasFees,
  GasFeeFlow,
  GasFeeFlowRequest,
  GasFeeFlowResponse,
  LegacySuggestedGasFees,
  SuggestedGasFees,
} from '../types';
import { TransactionStatus, type TransactionMeta } from '../types';
import { getGasFeeFlow } from '../utils/gas-flow';

const log = (...args: any[]) =>
  console.log(`gas-fee-poller - ${args[0]}`, ...args.slice(1));

const INTERVAL_MILLISECONDS = 10000;
const LEVELS = ['low', 'medium', 'high'] as const;

export class GasFeePoller {
  hub: EventEmitter = new EventEmitter();

  #gasFeeFlows: GasFeeFlow[];

  #getEthQuery: () => any;

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
    getEthQuery: () => any;
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

    clearTimeout(this.#timeout as any);

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
    ethQuery: any,
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

      transactionMeta.suggestedGasFees =
        this.#gasFeeFlowResponseToSuggestedGasFees(response);
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

  #gasFeeFlowResponseToSuggestedGasFees(
    response: GasFeeFlowResponse,
  ): SuggestedGasFees {
    return {
      eip1559: this.#responseToEIP1559SuggestedGasFees(response),
      legacy: this.#responseToLegacySuggestedGasFees(response),
    };
  }

  #responseToEIP1559SuggestedGasFees(
    response: GasFeeFlowResponse,
  ): EIP1559SuggestedGasFees {
    return LEVELS.reduce(
      (result, level) => ({
        ...result,
        [level]: {
          suggestedMaxFeePerGas: weiHexToGweiDec(
            response[level].maxFeePerGas as string,
          ),
          suggestedMaxPriorityFeePerGas: weiHexToGweiDec(
            response[level].maxPriorityFeePerGas as string,
          ),
        },
      }),
      {},
    ) as EIP1559SuggestedGasFees;
  }

  #responseToLegacySuggestedGasFees(
    response: GasFeeFlowResponse,
  ): LegacySuggestedGasFees {
    return LEVELS.reduce(
      (result, level) => ({
        ...result,
        [level]: weiHexToGweiDec(response[level].gasPrice as string),
      }),
      {},
    ) as LegacySuggestedGasFees;
  }
}
