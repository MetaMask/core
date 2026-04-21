import type { Hex } from '@metamask/utils';

import type { MoneyAccountUpgradeControllerMessenger } from './MoneyAccountUpgradeController';

/**
 * Context supplied to each step when it is run.
 */
export type StepContext = {
  messenger: MoneyAccountUpgradeControllerMessenger;
  address: Hex;
};

/**
 * The outcome of running a single step in the Money Account upgrade sequence.
 *
 * - `'already-done'` — the step's remote check determined that no work was
 *   required; no action was taken.
 * - `'completed'` — the step performed its action and is now done.
 */
export type StepResult = 'already-done' | 'completed';

/**
 * A single step in the Money Account upgrade sequence.
 *
 * Each step is responsible for checking whether its action has already been
 * applied (returning `'already-done'` if so) and otherwise performing the
 * action and returning `'completed'`.
 */
export type Step = {
  name: string;
  run: (context: StepContext) => Promise<StepResult>;
};
