import { convertHexToDecimal } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';
import { add0x } from '@metamask/utils';

import type { FeeMarketEIP1559Values, GasPriceValue } from '../types';
import { type TransactionParams } from '../types';

/**
 * Returns new transaction parameters with increased gas fees.
 * @param originalTransactionParams - The original transaction parameters.
 * @param rate - The rate by which to increase the existing gas fee properties.
 * @param newGasValues - Optional new gas values to use instead of increased the existing values.
 * @returns The new transaction parameters with the increased gas fee properties.
 */
export function getTransactionParamsWithIncreasedGasFee(
  originalTransactionParams: TransactionParams,
  rate: number,
  newGasValues?: GasPriceValue | FeeMarketEIP1559Values,
): TransactionParams {
  const newGasPrice = getIncreasedGasPrice(
    originalTransactionParams,
    rate,
    newGasValues,
  );

  const new1559Values = getIncreased1559Values(
    originalTransactionParams,
    rate,
    newGasValues,
  );

  if (new1559Values) {
    const newTxParams: TransactionParams = {
      ...originalTransactionParams,
      ...new1559Values,
    };

    delete newTxParams.gasPrice;

    return newTxParams;
  }

  if (newGasPrice) {
    const newTxParams: TransactionParams = {
      ...originalTransactionParams,
      gasPrice: newGasPrice,
    };

    delete newTxParams.maxFeePerGas;
    delete newTxParams.maxPriorityFeePerGas;

    return newTxParams;
  }

  throw new Error(
    'Cannot increase gas fee as no current values and no new values were provided',
  );
}

/**
 * Generate the increased EIP-1559 gas properties.
 * @param originalTransactionParams - The original transaction parameters.
 * @param rate - The rate by which to increase the existing gas fee properties.
 * @param newGasValues - Optional new gas values to use instead of increased the existing values.
 * @returns The new EIP-1559 gas properties.
 */
function getIncreased1559Values(
  originalTransactionParams: TransactionParams,
  rate: number,
  newGasValues?: GasPriceValue | FeeMarketEIP1559Values,
): FeeMarketEIP1559Values | undefined {
  if (
    newGasValues &&
    'maxFeePerGas' in newGasValues &&
    'maxPriorityFeePerGas' in newGasValues
  ) {
    return newGasValues;
  }

  const currentMaxFeePerGas = originalTransactionParams.maxFeePerGas as
    | Hex
    | undefined;

  const currentMaxPriorityFeePerGas =
    originalTransactionParams.maxPriorityFeePerGas as Hex | undefined;

  if (
    !currentMaxFeePerGas ||
    !currentMaxPriorityFeePerGas ||
    currentMaxFeePerGas === '0x0' ||
    currentMaxPriorityFeePerGas === '0x0'
  ) {
    return undefined;
  }

  const maxFeePerGas = multiplyHex(currentMaxFeePerGas, rate);
  const maxPriorityFeePerGas = multiplyHex(currentMaxPriorityFeePerGas, rate);

  return { maxFeePerGas, maxPriorityFeePerGas };
}

/**
 * Generate the increased gas price.
 * @param originalTransactionParams - The original transaction parameters.
 * @param rate - The rate by which to increase the existing gas fee properties.
 * @param newGasValues - Optional new gas values to use instead of increased the existing values.
 * @returns The new gas price.
 */
function getIncreasedGasPrice(
  originalTransactionParams: TransactionParams,
  rate: number,
  newGasValues?: GasPriceValue | FeeMarketEIP1559Values,
): Hex | undefined {
  if (newGasValues && 'gasPrice' in newGasValues) {
    return newGasValues.gasPrice as Hex;
  }

  const currentGasPrice = originalTransactionParams.gasPrice as Hex | undefined;

  if (!currentGasPrice || currentGasPrice === '0x0') {
    return undefined;
  }

  return multiplyHex(currentGasPrice, rate);
}

/**
 * Multiply a hex value by a multiplier.
 * @param value - The hex value to multiply.
 * @param multiplier - The multiplier.
 * @returns The multiplied hex value.
 */
function multiplyHex(value: Hex | undefined, multiplier: number): Hex {
  const decimalValue = convertHexToDecimal(value);
  const decimalResult = parseInt(`${decimalValue * multiplier}`, 10);

  return add0x(decimalResult.toString(16));
}
