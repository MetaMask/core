import type { Hex } from '@metamask/utils';

import type { RelayQuote, RelayTransactionStep } from './types.js';

/**
 * Whether a Relay quote routes through a deposit step, i.e. the user funds the
 * request by transferring to Relay rather than calling a swap contract.
 *
 * @param steps - Relay quote steps.
 * @returns True when the quote has a deposit step.
 */
export function hasRelayDepositStep(steps: RelayQuote['steps']): boolean {
  return steps.some((step) => step.id === 'deposit');
}

/**
 * Get the calldata of the Relay deposit transaction step.
 *
 * @param quote - Relay quote.
 * @returns The deposit calldata, or `undefined` when there is none.
 */
export function getRelayDepositData(quote: RelayQuote): Hex | undefined {
  const depositStep = quote.steps.find(
    (step): step is RelayTransactionStep =>
      step.id === 'deposit' && step.kind === 'transaction',
  );

  return depositStep?.items[0]?.data?.data;
}
