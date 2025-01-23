import type {
  BlockTracker,
  NetworkClientId,
} from '@metamask/network-controller';

import { type TransactionMeta, TransactionStatus } from '../types';
import { createModuleLogger, projectLogger } from '../logger';

const log = createModuleLogger(projectLogger, 'transaction-resimulator');

type ResimulateHelperOptions = {
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
  #getBlockTracker: (networkClientId: NetworkClientId) => BlockTracker;
  #listeners: Map<string, (latestBlockNumber: string) => Promise<void>> =
    new Map();
  #activeResimulations: Map<string, ResimulationState> = new Map();
  #updateSimulationData: (
    transactionMeta: TransactionMeta,
    { blockTime }: { blockTime: number },
  ) => void;
  #getTransactions: () => TransactionMeta[];

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

      // Force stop any running transactions that are no longer unapproved/contained in the state
      this.#activeResimulations.forEach(({ isActive }, id) => {
        if (isActive && !unapprovedTransactionIds.has(id)) {
          this.#forceStop(id);
        }
      });
    });
  }

  start(transactionMeta: TransactionMeta) {
    const { id, networkClientId } = transactionMeta;
    const currentState = this.#activeResimulations.get(id);
    if (!transactionMeta.isFocused || (currentState && currentState.isActive)) {
      return;
    }

    const listener = async () => {
      try {
        const nowSeconds = Math.floor(Date.now() / 1000);
        const blockTime = nowSeconds + 60;
        this.#updateSimulationData(transactionMeta, { blockTime });
      } catch (error) {
        console.log('Error during transaction resimulation', error);
      }
    };

    this.#listeners.set(id, listener);
    const blockTracker = this.#getBlockTracker(networkClientId);
    blockTracker.on('latest', listener);
    this.#activeResimulations.set(id, { isActive: true, networkClientId });

    console.log(`Started resimulating transaction ${id} on new blocks`);
  }

  stop(transactionMeta: TransactionMeta) {
    const { id } = transactionMeta;
    const currentState = this.#activeResimulations.get(id);
    if (transactionMeta.isFocused || !currentState || !currentState.isActive) {
      return;
    }

    this.#removeListenerAndDeactivate(id, currentState.networkClientId);
    console.log(`Stopped resimulating transaction ${id} on new blocks`);
  }

  #forceStop(id: string) {
    const activeResimulationToStop = this.#activeResimulations.get(id);
    if (!activeResimulationToStop) {
      return;
    }

    this.#removeListenerAndDeactivate(
      id,
      activeResimulationToStop.networkClientId,
    );
    console.log(`Force stopped resimulating transaction ${id} on new blocks`);
  }

  #removeListenerAndDeactivate(id: string, networkClientId: NetworkClientId) {
    const listener = this.#listeners.get(id);
    if (listener) {
      const blockTracker = this.#getBlockTracker(networkClientId);
      blockTracker.removeListener('latest', listener);
      this.#listeners.delete(id);
    }
    this.#activeResimulations.set(id, {
      isActive: false,
      networkClientId: networkClientId,
    });
  }

  #getUnapprovedTransactions() {
    return this.#getTransactions().filter(
      (tx) => tx.status === TransactionStatus.unapproved,
    );
  }
}
