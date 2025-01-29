import type { Hex } from '@metamask/utils';
import { remove0x } from '@metamask/utils';
import { BN } from 'bn.js';
import { isEqual } from 'lodash';

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
export const RESIMULATE_INTERVAL_MS = 3000;

export type ResimulateResponse = {
  blockTime?: number;
  resimulate: boolean;
};

export type ResimulateHelperOptions = {
  getTransactions: () => TransactionMeta[];
  onStateChange: (listener: () => void) => void;
  updateSimulationData: (transactionMeta: TransactionMeta) => void;
};

export class ResimulateHelper {
  // Map of transactionId <=> isActive
  readonly #activeResimulations: Map<string, boolean> = new Map();

  // Map of transactionId <=> intervalId
  readonly #intervalIds: Map<string, NodeJS.Timeout> = new Map();

  readonly #getTransactions: () => TransactionMeta[];

  readonly #updateSimulationData: (transactionMeta: TransactionMeta) => void;

  constructor({
    getTransactions,
    updateSimulationData,
    onStateChange,
  }: ResimulateHelperOptions) {
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
          this.#start(transactionMeta);
        } else {
          this.#stop(transactionMeta);
        }
      });

      // Force stop any running active resimulation that are no longer unapproved transactions list
      this.#activeResimulations.forEach((isActive, transactionId) => {
        if (isActive && !unapprovedTransactionIds.has(transactionId)) {
          this.#stop({
            id: transactionId,
            // Forcing this to false to ensure the resimulation is stopped
            isFocused: false,
          } as unknown as TransactionMeta);
        }
      });
    });
  }

  #start(transactionMeta: TransactionMeta) {
    const { id: transactionId } = transactionMeta;
    const isActive = this.#activeResimulations.get(transactionId);
    if (!transactionMeta.isFocused || isActive) {
      return;
    }

    const listener = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        this.#updateSimulationData(transactionMeta);
      } catch (error) {
        /* istanbul ignore next */
        log('Error during transaction resimulation', error);
      }
    };

    const intervalId = setInterval(listener, RESIMULATE_INTERVAL_MS);

    this.#intervalIds.set(transactionId, intervalId);
    this.#activeResimulations.set(transactionId, true);
    log(`Started resimulating transaction ${transactionId} every 3 seconds`);
  }

  #stop(transactionMeta: TransactionMeta) {
    const { id: transactionId } = transactionMeta;
    const isActive = this.#activeResimulations.get(transactionId);
    if (transactionMeta.isFocused || !isActive) {
      return;
    }

    this.#removeListener(transactionId);
    log(`Stopped resimulating transaction ${transactionId} every 3 seconds`);
  }

  #removeListener(id: string) {
    const intervalId = this.#intervalIds.get(id);
    if (intervalId) {
      clearInterval(intervalId);
      this.#intervalIds.delete(id);
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
 *
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
 *
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
 *
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
 *
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
 *
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
 *
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
 *
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
