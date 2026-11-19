import {
  createExactExecutionBatchTerms,
  decodeExactExecutionBatchTerms,
  decodeExactExecutionTerms,
} from '@metamask/delegation-core';
import { bytesToHex } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import {
  ERC20_APPROVE_SELECTOR,
  ERC7579_BATCH_DEFAULT_MODE,
  ERC7821_EXECUTE_SELECTOR,
  TELLER_DEPOSIT_SELECTOR,
  ZERO_ADDRESS,
} from './constants.js';
import type { MfaWhitelistConfig } from './types.js';
import { decodeCall, decodeCanonical, isSameHex } from './utils.js';

export type Execution = {
  target: Hex;
  value: bigint;
  callData: Hex;
};

export type Caveat = {
  enforcer: Hex;
  terms: Hex;
};

/**
 * Unwraps an execution of the account's own ERC-7821 `execute()`, which
 * `Delegation7702PublishHook` signs instead of the individual calls. Any
 * other execution is returned as is.
 *
 * @param execution - The execution.
 * @param delegator - The Money Account.
 * @returns The calls the execution makes, or `undefined` if it calls the
 * account with anything other than an atomic batch `execute()`.
 */
function unwrapExecute(
  execution: Execution,
  delegator: Hex,
): Execution[] | undefined {
  if (!isSameHex(execution.target, delegator)) {
    return [execution];
  }
  if (execution.value !== 0n) {
    return undefined;
  }

  const args = decodeCall(execution.callData, ERC7821_EXECUTE_SELECTOR, [
    'bytes32',
    'bytes',
  ]);
  if (!args) {
    return undefined;
  }

  const [mode, executionData] = args as [Uint8Array, Uint8Array];
  if (!isSameHex(bytesToHex(mode), ERC7579_BATCH_DEFAULT_MODE)) {
    return undefined;
  }

  const calls = decodeCanonical(
    ['(address,uint256,bytes)[]'],
    bytesToHex(executionData),
  );
  if (!calls) {
    return undefined;
  }

  return (calls[0] as [Hex, bigint, Uint8Array][]).map(
    ([target, value, callData]) => ({
      target,
      value,
      callData: bytesToHex(callData),
    }),
  );
}

/**
 * Resolves the calls an exact-execution caveat pins. The same calls arrive
 * as an `ExactExecutionBatch` of the individual calls, or as one
 * `ExactExecution` of the account's own `execute()`.
 *
 * @param caveat - The exact-execution caveat.
 * @param delegator - The Money Account.
 * @param config - The whitelist config.
 * @returns The pinned calls, or `undefined` if the caveat is not an
 * exact-execution caveat or its terms are not canonical.
 */
export function getExactExecutions(
  caveat: Caveat,
  delegator: Hex,
  config: MfaWhitelistConfig,
): Execution[] | undefined {
  const { ExactExecutionBatchEnforcer, ExactExecutionEnforcer } =
    config.contracts;

  if (isSameHex(caveat.enforcer, ExactExecutionBatchEnforcer)) {
    const { executions } = decodeExactExecutionBatchTerms(caveat.terms);
    const reencoded = createExactExecutionBatchTerms({ executions });
    return isSameHex(reencoded, caveat.terms) ? executions : undefined;
  }

  if (isSameHex(caveat.enforcer, ExactExecutionEnforcer)) {
    // Packed terms: everything after the target and value is the calldata.
    const { execution } = decodeExactExecutionTerms(caveat.terms);
    return unwrapExecute(execution, delegator);
  }

  return undefined;
}

/**
 * Checks whether calls are a Money Account vault deposit:
 * `mUSD.approve(boringVault, amount)` followed by
 * `teller.deposit(mUSD, amount, minimumMint, 0x0)` of the same vault, with
 * no native value. Funds never leave the user: mUSD in the Money Account
 * becomes vault shares owned by the Money Account.
 *
 * @param executions - The calls.
 * @param config - The whitelist config.
 * @returns Whether the calls are a vault deposit.
 */
export function isVaultDeposit(
  executions: Execution[],
  config: MfaWhitelistConfig,
): boolean {
  if (executions.length !== 2) {
    return false;
  }

  const [approve, deposit] = executions;
  if (approve.value !== 0n || deposit.value !== 0n) {
    return false;
  }
  if (!isSameHex(approve.target, config.musdTokenAddress)) {
    return false;
  }

  const approveArgs = decodeCall(approve.callData, ERC20_APPROVE_SELECTOR, [
    'address',
    'uint256',
  ]);
  if (!approveArgs) {
    return false;
  }
  const [spender, approveAmount] = approveArgs as [Hex, bigint];

  const vault = config.vaults.find(({ boringVault }) =>
    isSameHex(boringVault, spender),
  );
  if (!vault || !isSameHex(deposit.target, vault.tellerAddress)) {
    return false;
  }

  const depositArgs = decodeCall(deposit.callData, TELLER_DEPOSIT_SELECTOR, [
    'address',
    'uint256',
    'uint256',
    'address',
  ]);
  if (!depositArgs) {
    return false;
  }
  const [asset, depositAmount, , referral] = depositArgs as [
    Hex,
    bigint,
    bigint,
    Hex,
  ];

  return (
    isSameHex(asset, config.musdTokenAddress) &&
    depositAmount === approveAmount &&
    depositAmount > 0n &&
    isSameHex(referral, ZERO_ADDRESS)
  );
}
