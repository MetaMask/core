import type { Hex } from '@metamask/utils';

import type { UpgradeStep } from './types';

// The root authority constant for top-level delegations.
export const ROOT_AUTHORITY =
  '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' as Hex;

// Maximum uint256 — used as the allowance for the ERC20TransferAmountEnforcer.
// 115792089237316195423570985008687907853269984665640564039457584007913129639935 as a number
export const MAX_UINT256 =
  '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' as Hex;

// The ordered list of upgrade steps, used to determine whether a step
// has already been completed during a previous (possibly interrupted) run.
export const STEP_ORDER: UpgradeStep[] = [
  'associate-address',
  'submit-authorization',
  'verify-delegation',
  'save-delegation',
  'register-intents',
];
