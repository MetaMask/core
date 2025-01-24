import type {
  BlockTracker,
  NetworkClientId,
} from '@metamask/network-controller';

import { createModuleLogger, projectLogger } from '../logger';
import { type TransactionMeta, TransactionStatus } from '../types';

const log = createModuleLogger(projectLogger, 'transaction-resimulator');

export type ResimulateHelperOptions = {
  getBlockTracker: (networkClientId: NetworkClientId) => BlockTracker;
  getTransactions: () => TransactionMeta[];
  updateSimulationData: (transactionMeta: TransactionMeta) => void;
  onStateChange: (listener: () => void) => void;
};

type ResimulationState = {
  isActive: boolean;
  networkClientId: NetworkClientId;
};

export class ResimulateHelper {
  readonly #getBlockTracker: (networkClientId: NetworkClientId) => BlockTracker;

  readonly #listeners: Map<
    string,
    (latestBlockNumber: string) => Promise<void>
  > = new Map();

  readonly #activeResimulations: Map<string, ResimulationState> = new Map();

  readonly #updateSimulationData: (transactionMeta: TransactionMeta) => void;

  readonly #getTransactions: () => TransactionMeta[];

  constructor({
    getBlockTracker,
    getTransactions,
    updateSimulationData,
    onStateChange,
  }: ResimulateHelperOptions) {
    this.#getBlockTracker = getBlockTracker;
    this.#getTransactions = getTransactions;
    this.#updateSimulationData = updateSimulationData;

    onStateChange(() => {
      const unapprovedTransactions = this.#getUnapprovedTransactions();
      const unapprovedTransactionIds = new Set(
        unapprovedTransactions.map((tx) => tx.id),
      );

      // Start or stop resimulation based on the current isFocused state
      unapprovedTransactions.forEach((transactionMeta) => {
        if (transactionMeta.isFocused) {
          this.start(transactionMeta);
        } else {
          this.stop(transactionMeta);
        }
      });

      // Force stop any running active resimulations that are no longer unapproved transactions list
      this.#activeResimulations.forEach(({ isActive }, id) => {
        if (isActive && !unapprovedTransactionIds.has(id)) {
          this.#forceStop(id);
        }
      });
    });
  }

  start(transactionMeta: TransactionMeta) {
    const { id, networkClientId } = transactionMeta;
    const resimulation = this.#activeResimulations.get(id);
    if (!transactionMeta.isFocused || (resimulation && resimulation.isActive)) {
      return;
    }

    const listener = async () => {
      try {
        this.#updateSimulationData(transactionMeta);
      } catch (error) {
        /* istanbul ignore next */
        log('Error during transaction resimulation', error);
      }
    };

    this.#listeners.set(id, listener);
    const blockTracker = this.#getBlockTracker(networkClientId);
    blockTracker.on('latest', listener);
    this.#activeResimulations.set(id, { isActive: true, networkClientId });
    log(`Started resimulating transaction ${id} on new blocks`);
  }

  stop(transactionMeta: TransactionMeta) {
    const { id } = transactionMeta;
    const resimulation = this.#activeResimulations.get(id);
    if (transactionMeta.isFocused || !resimulation || !resimulation.isActive) {
      return;
    }

    this.#removeListener(id, resimulation.networkClientId);
    log(`Stopped resimulating transaction ${id} on new blocks`);
  }

  #forceStop(id: string) {
    const resimulation = this.#activeResimulations.get(id);
    if (!resimulation) {
      /* istanbul ignore next */
      return;
    }

    this.#removeListener(id, resimulation.networkClientId);
    log(`Forced to stop resimulating transaction ${id} on new blocks`);
  }

  #removeListener(id: string, networkClientId: NetworkClientId) {
    const listener = this.#listeners.get(id);
    if (listener) {
      const blockTracker = this.#getBlockTracker(networkClientId);
      blockTracker.removeListener('latest', listener);
      this.#listeners.delete(id);
    }
    this.#activeResimulations.delete(id);
  }

  #getUnapprovedTransactions() {
    return this.#getTransactions().filter(
      (tx) => tx.status === TransactionStatus.unapproved,
    );
  }
}
