import type { Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import type { ServerQuote, ServerTransactionStep } from './types.js';

const TOKEN_TRANSFER_FOUR_BYTE = '0xa9059cbb';

// `0x` + 4-byte selector + two 32-byte arguments (recipient, amount).
const TOKEN_TRANSFER_DATA_LENGTH = 2 + 8 + 64 * 2;

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

/**
 * Whether a step is a plain ERC-20 `transfer` with no extra calldata and no
 * native value, which is how a provider deposit address is funded.
 *
 * @param step - Server quote step.
 * @returns True when the step is a plain token transfer.
 */
function isDepositStep(
  step: ServerQuote['steps'][number],
): step is ServerTransactionStep {
  return (
    step.type === 'transaction' &&
    step.data.length === TOKEN_TRANSFER_DATA_LENGTH &&
    step.data.toLowerCase().startsWith(TOKEN_TRANSFER_FOUR_BYTE) &&
    new BigNumber(step.value || '0').isZero()
  );
}
