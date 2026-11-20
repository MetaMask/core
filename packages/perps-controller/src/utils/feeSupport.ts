import type { PerpsProvider } from '../types/index.js';

/**
 * Whether a provider can consume a fee resolution or legacy discount.
 *
 * @param provider - The execution venue, if registered.
 * @returns Whether a fee setter is available.
 */
export function hasFeeSetter(
  provider:
    | Pick<PerpsProvider, 'setUserFeeResolution' | 'setUserFeeDiscount'>
    | undefined,
): boolean {
  return (
    typeof provider?.setUserFeeResolution === 'function' ||
    typeof provider?.setUserFeeDiscount === 'function'
  );
}
