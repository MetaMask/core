import type { Hex } from '@metamask/utils';

import type { MoneyAccountUpgradeControllerMessenger } from '../MoneyAccountUpgradeController';
import type { AccountUpgradeEntry, UpgradeConfig } from '../types';

/**
 * Context passed to each upgrade step.
 */
export type StepContext = {
  messenger: MoneyAccountUpgradeControllerMessenger;
  config: UpgradeConfig;
  address: Hex;
  chainId: Hex;
  entry: AccountUpgradeEntry | undefined;
};

/**
 * Patch returned by a step, merged into the account's upgrade entry by
 * the controller. The `step` field is mandatory so the controller can
 * record progress.
 */
export type StepResult = Partial<AccountUpgradeEntry> &
  Pick<AccountUpgradeEntry, 'step'>;

export type Step = (ctx: StepContext) => Promise<StepResult>;
