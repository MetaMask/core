import type {
  BlockTracker,
  NetworkClientId,
} from '@metamask/network-controller';
import { BN } from 'bn.js';
import { isEqual } from 'lodash';
import type { Hex } from '@metamask/utils';
import { remove0x } from '@metamask/utils';

import { createModuleLogger, projectLogger } from '../logger';
import { TransactionStatus } from '../types';
import type {
  SimulationBalanceChange,
  SimulationData,
  TransactionMeta,
  TransactionParams,
} from '../types';
import { getPercentageChange } from '../utils/utils';

const log = createModuleLogger(projectLogger, 'resimulate-helper');

export const RESIMULATE_PARAMS = ['to', 'value', 'data'] as const;
export const BLOCKAID_RESULT_TYPE_MALICIOUS = 'Malicious';
export const VALUE_COMPARISON_PERCENT_THRESHOLD = 5;
export const BLOCK_TIME_ADDITIONAL_SECONDS = 60;

export type ResimulateResponse = {
  blockTime?: number;
  resimulate: boolean;
};

type ResimulationState = {
  isActive: boolean;
  networkClientId: NetworkClientId;
};

export type ResimulateHelperOptions = {
  getBlockTracker: (networkClientId: NetworkClientId) => BlockTracker;
  getTransactions: () => TransactionMeta[];
  onStateChange: (listener: () => void) => void;
  updateSimulationData: (transactionMeta: TransactionMeta) => void;
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
      this.#activeResimulations.forEach((_, id) => {
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

/**
 * Determine if a transaction should be resimulated.
 * @param originalTransactionMeta - The original transaction metadata.
 * @param newTransactionMeta - The new transaction metadata.
 * @returns Whether the transaction should be resimulated.
 */
export function shouldResimulate(
  originalTransactionMeta: TransactionMeta,
  newTransactionMeta: TransactionMeta,
) {
  const { id: transactionId } = newTransactionMeta;

  const parametersUpdated = isParametersUpdated(
    originalTransactionMeta,
    newTransactionMeta,
  );

  const securityAlert = hasNewSecurityAlert(
    originalTransactionMeta,
    newTransactionMeta,
  );

  const valueAndNativeBalanceMismatch = hasValueAndNativeBalanceMismatch(
    originalTransactionMeta,
    newTransactionMeta,
  );

  const resimulate =
    parametersUpdated || securityAlert || valueAndNativeBalanceMismatch;

  let blockTime: number | undefined;

  if (securityAlert || valueAndNativeBalanceMismatch) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    blockTime = nowSeconds + BLOCK_TIME_ADDITIONAL_SECONDS;
  }

  if (resimulate) {
    log('Transaction should be resimulated', {
      transactionId,
      blockTime,
      parametersUpdated,
      securityAlert,
      valueAndNativeBalanceMismatch,
    });
  }

  return {
    blockTime,
    resimulate,
  };
}

/**
 * Determine if the simulation data has changed.
 * @param originalSimulationData - The original simulation data.
 * @param newSimulationData - The new simulation data.
 * @returns Whether the simulation data has changed.
 */
export function hasSimulationDataChanged(
  originalSimulationData: SimulationData,
  newSimulationData: SimulationData,
): boolean {
  if (isEqual(originalSimulationData, newSimulationData)) {
    return false;
  }

  if (
    isBalanceChangeUpdated(
      originalSimulationData?.nativeBalanceChange,
      newSimulationData?.nativeBalanceChange,
    )
  ) {
    log('Simulation data native balance changed');
    return true;
  }

  if (
    originalSimulationData.tokenBalanceChanges.length !==
    newSimulationData.tokenBalanceChanges.length
  ) {
    return true;
  }

  for (const originalTokenBalanceChange of originalSimulationData.tokenBalanceChanges) {
    const newTokenBalanceChange = newSimulationData.tokenBalanceChanges.find(
      ({ address, id }) =>
        address === originalTokenBalanceChange.address &&
        id === originalTokenBalanceChange.id,
    );

    if (!newTokenBalanceChange) {
      log('Missing new token balance', {
        address: originalTokenBalanceChange.address,
        id: originalTokenBalanceChange.id,
      });

      return true;
    }

    if (
      isBalanceChangeUpdated(originalTokenBalanceChange, newTokenBalanceChange)
    ) {
      log('Simulation data token balance changed', {
        originalTokenBalanceChange,
        newTokenBalanceChange,
      });

      return true;
    }
  }

  return false;
}

/**
 * Determine if the transaction parameters have been updated.
 * @param originalTransactionMeta - The original transaction metadata.
 * @param newTransactionMeta - The new transaction metadata.
 * @returns Whether the transaction parameters have been updated.
 */
function isParametersUpdated(
  originalTransactionMeta: TransactionMeta,
  newTransactionMeta: TransactionMeta,
): boolean {
  const { id: transactionId, txParams: newParams } = newTransactionMeta;
  const { txParams: originalParams } = originalTransactionMeta;

  if (!originalParams || isEqual(originalParams, newParams)) {
    return false;
  }

  const params = Object.keys(newParams) as (keyof TransactionParams)[];

  const updatedProperties = params.filter(
    (param) => newParams[param] !== originalParams[param],
  );

  log('Transaction parameters updated', {
    transactionId,
    updatedProperties,
    originalParams,
    newParams,
  });

  return RESIMULATE_PARAMS.some((param) => updatedProperties.includes(param));
}

/**
 * Determine if a transaction has a new security alert.
 * @param originalTransactionMeta - The original transaction metadata.
 * @param newTransactionMeta - The new transaction metadata.
 * @returns Whether the transaction has a new security alert.
 */
function hasNewSecurityAlert(
  originalTransactionMeta: TransactionMeta,
  newTransactionMeta: TransactionMeta,
): boolean {
  const { securityAlertResponse: originalSecurityAlertResponse } =
    originalTransactionMeta;

  const { id: transactionId, securityAlertResponse: newSecurityAlertResponse } =
    newTransactionMeta;

  if (isEqual(originalSecurityAlertResponse, newSecurityAlertResponse)) {
    return false;
  }

  log('Security alert updated', {
    transactionId,
    originalSecurityAlertResponse,
    newSecurityAlertResponse,
  });

  return (
    newSecurityAlertResponse?.result_type === BLOCKAID_RESULT_TYPE_MALICIOUS
  );
}

/**
 * Determine if a transaction has a value and simulation native balance mismatch.
 * @param originalTransactionMeta - The original transaction metadata.
 * @param newTransactionMeta - The new transaction metadata.
 * @returns Whether the transaction has a value and simulation native balance mismatch.
 */
function hasValueAndNativeBalanceMismatch(
  originalTransactionMeta: TransactionMeta,
  newTransactionMeta: TransactionMeta,
): boolean {
  const { simulationData: originalSimulationData } = originalTransactionMeta;

  const { simulationData: newSimulationData, txParams: newTxParams } =
    newTransactionMeta;

  if (
    !newSimulationData ||
    isEqual(originalSimulationData, newSimulationData)
  ) {
    return false;
  }

  const newValue = newTxParams?.value ?? '0x0';

  const newNativeBalanceDifference =
    newSimulationData?.nativeBalanceChange?.difference ?? '0x0';

  return !percentageChangeWithinThreshold(
    newValue as Hex,
    newNativeBalanceDifference,
    false,
    newSimulationData?.nativeBalanceChange?.isDecrease === false,
  );
}

/**
 * Determine if a balance change has been updated.
 * @param originalBalanceChange - The original balance change.
 * @param newBalanceChange - The new balance change.
 * @returns Whether the balance change has been updated.
 */
function isBalanceChangeUpdated(
  originalBalanceChange?: SimulationBalanceChange,
  newBalanceChange?: SimulationBalanceChange,
): boolean {
  return !percentageChangeWithinThreshold(
    originalBalanceChange?.difference ?? '0x0',
    newBalanceChange?.difference ?? '0x0',
    originalBalanceChange?.isDecrease === false,
    newBalanceChange?.isDecrease === false,
  );
}

/**
 * Determine if the percentage change between two values is within a threshold.
 * @param originalValue - The original value.
 * @param newValue - The new value.
 * @param originalNegative - Whether the original value is negative.
 * @param newNegative - Whether the new value is negative.
 * @returns Whether the percentage change between the two values is within a threshold.
 */
function percentageChangeWithinThreshold(
  originalValue: Hex,
  newValue: Hex,
  originalNegative?: boolean,
  newNegative?: boolean,
): boolean {
  let originalValueBN = new BN(remove0x(originalValue), 'hex');
  let newValueBN = new BN(remove0x(newValue), 'hex');

  if (originalNegative) {
    originalValueBN = originalValueBN.neg();
  }

  if (newNegative) {
    newValueBN = newValueBN.neg();
  }

  return (
    getPercentageChange(originalValueBN, newValueBN) <=
    VALUE_COMPARISON_PERCENT_THRESHOLD
  );
}
