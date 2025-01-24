import type {
  BlockTracker,
  NetworkClientId,
} from '@metamask/network-controller';

import { createModuleLogger, projectLogger } from '../logger';
import { type TransactionMeta, TransactionStatus } from '../types';

const log = createModuleLogger(projectLogger, 'resimulate-helper');

export type ResimulateHelperOptions = {
  getBlockTracker: (networkClientId: NetworkClientId) => BlockTracker;
  getTransactions: () => TransactionMeta[];
  onStateChange: (listener: () => void) => void;
  updateSimulationData: (transactionMeta: TransactionMeta) => void;
};

type ResimulationState = {
  isActive: boolean;
  networkClientId: NetworkClientId;
};

export class ResimulateHelper {
  readonly #activeResimulations: Map<string, ResimulationState> = new Map();

  readonly #getBlockTracker: (networkClientId: NetworkClientId) => BlockTracker;

  readonly #getTransactions: () => TransactionMeta[];

  readonly #listeners: Map<
    string,
    (latestBlockNumber: string) => Promise<void>
  > = new Map();

  readonly #updateSimulationData: (transactionMeta: TransactionMeta) => void;

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

      // Force stop any running active resimulation that are no longer unapproved transactions list
      this.#activeResimulations.forEach(({ isActive }, id) => {
        const resimulation = this.#activeResimulations.get(id);
        if (
          resimulation &&
          resimulation.isActive &&
          !unapprovedTransactionIds.has(id)
        ) {
          this.stop({
            id,
            // Forcing this to false to ensure the resimulation is stopped
            isFocused: false,
            networkClientId: resimulation.networkClientId,
          } as unknown as TransactionMeta);
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
