import type { Hex } from '@metamask/utils';
import { createModuleLogger, remove0x } from '@metamask/utils';
import { BN } from 'bn.js';
import { isEqual } from 'lodash';

import { projectLogger } from '../logger';
import type {
  SimulationBalanceChange,
  SimulationData,
  TransactionMeta,
  TransactionParams,
} from '../types';
import { getPercentageChange } from './utils';

const log = createModuleLogger(projectLogger, 'resimulate');

export const RESIMULATE_PARAMS = ['to', 'value', 'data'] as const;
export const BLOCKAID_RESULT_TYPE_MALICIOUS = 'Malicious';
export const VALUE_COMPARISON_PERCENT_THRESHOLD = 5;
export const BLOCK_TIME_ADDITIONAL_SECONDS = 60;

export type ResimulateResponse = {
  blockTime?: number;
  resimulate: boolean;
};

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
