import type { Hex } from '@metamask/utils';

import type { ServerQuote, ServerTransactionStep } from './types.js';

const DEPOSIT_STEP_ID = 'deposit';

/**
 * Whether a server quote routes through a deposit step, i.e. the user funds the
 * request by transferring to the provider rather than calling a swap contract.
 *
 * @param steps - Server quote steps.
 * @returns True when the quote has a deposit step.
 */
export function hasServerDepositStep(steps: ServerQuote['steps']): boolean {
  return steps.some(isDepositStep);
}

/**
 * Get the calldata of the server deposit transaction step.
 *
 * @param quote - Server quote.
 * @returns The deposit calldata, or `undefined` when there is none.
 */
export function getServerDepositData(quote: ServerQuote): Hex | undefined {
  return quote.steps.find(isDepositStep)?.data;
}

function isDepositStep(
  step: ServerQuote['steps'][number],
): step is ServerTransactionStep {
  return step.type === 'transaction' && step.id === DEPOSIT_STEP_ID;
}
