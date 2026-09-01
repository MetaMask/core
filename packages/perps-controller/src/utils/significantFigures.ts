import { DECIMAL_PRECISION_CONFIG } from '../constants/perpsConfig.js';

/**
 * Count significant figures in a price string.
 * Pure math function extracted from formatUtils for portability.
 *
 * @param priceString - The price string to count significant figures for.
 * @returns The number of significant figures in the price string.
 */
export const countSignificantFigures = (priceString: string): number => {
  if (!priceString) {
    return 0;
  }

  const cleaned = priceString.replace(/[$,]/gu, '').trim();
  const number = parseFloat(cleaned);
  if (isNaN(number) || number === 0) {
    return 0;
  }

  const normalized = number.toString();
  // Strip the sign and decimal point so leading zeros are counted across the
  // *whole* number, not just the integer part — "0.001234" has to lose its
  // "0" integer part and its two leading fractional zeros to land on the
  // correct 4 significant figures ("1234"), not 6.
  const digitsOnly = normalized.replace(/^-/u, '').replace('.', '');
  const withoutLeadingZeros = digitsOnly.replace(/^0+/u, '') || '0';

  // Trailing zeros are only ambiguous (not significant) for an integer with
  // no decimal point (e.g. "1000" could be 1-4 sig figs); once there's a
  // decimal point, every digit already present is significant.
  if (!normalized.includes('.')) {
    return withoutLeadingZeros.replace(/0+$/u, '').length || 1;
  }

  return withoutLeadingZeros.length;
};

/**
 * Check if a price string exceeds the maximum significant figures.
 *
 * @param priceString - The price string to check.
 * @param maxSigFigs - The maximum allowed significant figures.
 * @returns True if the price string exceeds the maximum significant figures.
 */
export const hasExceededSignificantFigures = (
  priceString: string,
  maxSigFigs: number = DECIMAL_PRECISION_CONFIG.MaxSignificantFigures,
): boolean => {
  if (!priceString || priceString.trim() === '') {
    return false;
  }

  const cleaned = priceString.replace(/[$,]/gu, '').trim();
  const number = parseFloat(cleaned);
  if (isNaN(number)) {
    return false;
  }

  const normalized = number.toString();
  if (!normalized.includes('.')) {
    return false;
  }

  return countSignificantFigures(priceString) > maxSigFigs;
};

/**
 * Round a price string to the maximum significant figures.
 *
 * @param priceString - The price string to round.
 * @param maxSigFigs - The maximum allowed significant figures.
 * @returns The price string rounded to the specified significant figures.
 */
export const roundToSignificantFigures = (
  priceString: string,
  maxSigFigs: number = DECIMAL_PRECISION_CONFIG.MaxSignificantFigures,
): string => {
  if (!priceString || priceString.trim() === '') {
    return priceString;
  }

  const cleaned = priceString.replace(/[$,]/gu, '').trim();
  const number = Number.parseFloat(cleaned);
  if (Number.isNaN(number) || number === 0) {
    return priceString;
  }

  if (countSignificantFigures(cleaned) <= maxSigFigs) {
    return number.toString();
  }

  // Same order-of-magnitude approach as getPriceTick (orderCalculations.ts) —
  // keep the two significant-figures rules in sync instead of maintaining
  // two independent implementations of the same HyperLiquid precision rule.
  const magnitude = Math.floor(Math.log10(Math.abs(number)));
  const decimalPlaces = maxSigFigs - 1 - magnitude;

  if (decimalPlaces <= 0) {
    return Math.round(number).toString();
  }

  const rounded = number.toFixed(decimalPlaces);
  return Number.parseFloat(rounded).toString();
};
