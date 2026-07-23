import type { Hex } from '@metamask/utils';
import { add0x } from '@metamask/utils';

import type { TransactionReceipt } from '../types';
import { padHexToEvenLength } from './utils';

/**
 * Parses an optional hex quantity to a bigint.
 *
 * @param value - Hex string (with or without `0x`), or undefined.
 * @returns Parsed bigint, or undefined when missing / invalid / empty.
 */
function parseHexQuantity(value: string | undefined): bigint | undefined {
  if (value === undefined || value === '' || value === '0x' || value === '0X') {
    return undefined;
  }

  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}

/**
 * Formats a bigint as a `0x`-prefixed hex string with even length.
 *
 * @param value - Fee amount in wei.
 * @returns Hex wei string.
 */
function toHexWei(value: bigint): Hex {
  return add0x(padHexToEvenLength(value.toString(16))) as Hex;
}

/**
 * Computes the OP Stack / Mantle Arsia operator fee from receipt fields.
 *
 * Formula: `gasUsed * operatorFeeScalar * 100 + operatorFeeConstant`
 *
 * @param receipt - Transaction receipt that may include operator fee params.
 * @returns Operator fee in hex wei, or undefined when it cannot be computed.
 */
export function getOperatorFeeFromReceipt(
  receipt: TransactionReceipt,
): Hex | undefined {
  const gasUsed = parseHexQuantity(receipt.gasUsed);
  const operatorFeeScalar = parseHexQuantity(receipt.operatorFeeScalar);
  const operatorFeeConstant = parseHexQuantity(receipt.operatorFeeConstant);

  if (
    gasUsed === undefined ||
    operatorFeeScalar === undefined ||
    operatorFeeConstant === undefined
  ) {
    return undefined;
  }

  const operatorFee =
    gasUsed * operatorFeeScalar * 100n + operatorFeeConstant;

  return toHexWei(operatorFee);
}

/**
 * Derives the combined layer-1 fee (L1 data fee + operator fee) from a receipt.
 *
 * Does not multiply `l1Fee` by `tokenRatio` — on Mantle, receipt `l1Fee` is
 * already denominated in the native token (MNT).
 *
 * @param receipt - Transaction receipt.
 * @returns Combined L1 + operator fee in hex wei, or undefined when neither
 * component is available.
 */
export function getLayer1FeeFromReceipt(
  receipt: TransactionReceipt,
): Hex | undefined {
  const l1Fee = parseHexQuantity(receipt.l1Fee) ?? 0n;
  const operatorFeeHex = getOperatorFeeFromReceipt(receipt);
  const operatorFee =
    operatorFeeHex === undefined ? 0n : (parseHexQuantity(operatorFeeHex) ?? 0n);

  if (l1Fee === 0n && operatorFee === 0n) {
    // Distinguish "both zero" (valid) from "neither present".
    const hasL1Fee = parseHexQuantity(receipt.l1Fee) !== undefined;
    const hasOperatorFee = operatorFeeHex !== undefined;

    if (!hasL1Fee && !hasOperatorFee) {
      return undefined;
    }
  }

  return toHexWei(l1Fee + operatorFee);
}
