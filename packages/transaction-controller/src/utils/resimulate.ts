import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { isEqual } from 'lodash';

import { projectLogger } from '../logger';
import type { TransactionMeta, TransactionParams } from '../types';
import { isPercentageDifferenceWithinThreshold } from './utils';

const log = createModuleLogger(projectLogger, 'resimulate');

const RESIMULATE_PARAMS = ['to', 'value', 'data'] as const;
const BLOCKAID_RESULT_TYPE_MALICIOUS = 'Malicious';
const VALUE_NATIVE_BALANCE_PERCENT_THRESHOLD = 5;
const BLOCK_TIME_ADDITIONAL_SECONDS = 60;

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

  if (resimulate) {
    log('Transaction should be resimulated', {
      transactionId,
      parametersUpdated,
      securityAlert,
      valueAndNativeBalanceMismatch,
    });
  }

  let blockTime: number | undefined;

  if (securityAlert || valueAndNativeBalanceMismatch) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    blockTime = nowSeconds + BLOCK_TIME_ADDITIONAL_SECONDS;
  }

  return {
    blockTime,
    resimulate,
  };
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

  return isPercentageDifferenceWithinThreshold(
    newNativeBalanceDifference,
    newValue as Hex,
    VALUE_NATIVE_BALANCE_PERCENT_THRESHOLD,
  );
}
