import {
  ANY_BENEFICIARY,
  ROOT_AUTHORITY,
  createLimitedCallsTerms,
  createValueLteTerms,
  decodeERC20TransferAmountTerms,
  decodeRedeemerTerms,
} from '@metamask/delegation-core';
import { isObject } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import { DELEGATION_TYPES } from './constants.js';
import { getExactExecutions, isVaultDeposit } from './executions.js';
import type { Caveat } from './executions.js';
import type { MfaRequirement, MfaWhitelistConfig } from './types.js';
import { isAddress, isSameHex, requireMfa, whitelisted } from './utils.js';

const BYTES_PATTERN = /^0x(?:[0-9a-fA-F]{2})*$/u;
const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/u;
const UINT_PATTERN = /^(?:0x[0-9a-fA-F]+|\d+)$/u;
const MAX_UINT256 = 2n ** 256n - 1n;

/**
 * The fields of a delegation that are signed. The domain is not included,
 * because it must equal the pinned one.
 */
export type DelegationMessage = {
  delegate: Hex;
  delegator: Hex;
  authority: Hex;
  caveats: Caveat[];
  salt: bigint;
};

type DelegationContext = {
  address: Hex;
  config: MfaWhitelistConfig;
};

/**
 * Checks that an object has exactly the given keys.
 *
 * @param value - The object.
 * @param keys - The expected keys.
 * @returns Whether the object has exactly these keys.
 */
function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === keys.length && keys.every((key) => actual.includes(key))
  );
}

/**
 * Checks that an EIP-712 type definition matches the expected one exactly,
 * including field order.
 *
 * @param value - The type definition.
 * @param expected - The expected fields.
 * @returns Whether the definitions match.
 */
function isFieldList(
  value: unknown,
  expected: readonly { name: string; type: string }[],
): boolean {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every(
      (field: unknown, index) =>
        isObject(field) &&
        hasExactKeys(field, ['name', 'type']) &&
        field.name === expected[index].name &&
        field.type === expected[index].type,
    )
  );
}

/**
 * Parses an unsigned integer the way EIP-712 encoders accept it: a number,
 * a bigint, or a decimal or hex string.
 *
 * @param value - The value.
 * @returns The integer, or `undefined` if the value isn't a uint256.
 */
function parseUint256(value: unknown): bigint | undefined {
  let parsed: bigint | undefined;
  if (typeof value === 'bigint') {
    parsed = value;
  } else if (typeof value === 'number' && Number.isSafeInteger(value)) {
    parsed = BigInt(value);
  } else if (typeof value === 'string' && UINT_PATTERN.test(value)) {
    parsed = BigInt(value);
  }
  return parsed !== undefined && parsed >= 0n && parsed <= MAX_UINT256
    ? parsed
    : undefined;
}

/**
 * Parses the caveats of a delegation message.
 *
 * @param value - The caveats.
 * @returns The caveats, or `undefined` if any is malformed.
 */
function parseCaveats(value: unknown): Caveat[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const caveats: Caveat[] = [];
  for (const caveat of value as unknown[]) {
    if (
      !isObject(caveat) ||
      !isAddress(caveat.enforcer) ||
      typeof caveat.terms !== 'string' ||
      !BYTES_PATTERN.test(caveat.terms)
    ) {
      return undefined;
    }
    caveats.push({ enforcer: caveat.enforcer, terms: caveat.terms as Hex });
  }
  return caveats;
}

/**
 * Parses and validates EIP-712 typed data as a delegation for the pinned
 * `DelegationManager` on the Money Account chain. Fields the EIP-712 types
 * don't declare (e.g. caveat `args` or an empty `signature`) don't affect
 * the signed digest and are ignored.
 *
 * @param data - The typed data, as an object or a JSON string.
 * @param config - The whitelist config.
 * @returns The delegation message, or the reason it isn't a valid delegation.
 */
export function parseDelegationTypedData(
  data: unknown,
  config: MfaWhitelistConfig,
): DelegationMessage | string {
  const typedData: unknown = typeof data === 'string' ? JSON.parse(data) : data;

  if (!isObject(typedData) || typedData.primaryType !== 'Delegation') {
    return 'Typed data is not a delegation';
  }

  const { types, domain, message } = typedData;
  if (
    !isObject(types) ||
    !hasExactKeys(types, Object.keys(DELEGATION_TYPES)) ||
    !isFieldList(types.EIP712Domain, DELEGATION_TYPES.EIP712Domain) ||
    !isFieldList(types.Delegation, DELEGATION_TYPES.Delegation) ||
    !isFieldList(types.Caveat, DELEGATION_TYPES.Caveat)
  ) {
    return 'Typed data types are not the delegation types';
  }

  if (
    !isObject(domain) ||
    !hasExactKeys(domain, ['name', 'version', 'chainId', 'verifyingContract'])
  ) {
    return 'Typed data domain is malformed';
  }
  if (
    domain.name !== 'DelegationManager' ||
    domain.version !== '1' ||
    parseUint256(domain.chainId) !== BigInt(config.chainId) ||
    !isAddress(domain.verifyingContract) ||
    !isSameHex(domain.verifyingContract, config.contracts.DelegationManager)
  ) {
    return 'Delegation is not for the pinned DelegationManager and chain';
  }

  if (!isObject(message)) {
    return 'Delegation message is malformed';
  }
  const caveats = parseCaveats(message.caveats);
  const salt = parseUint256(message.salt);
  if (
    !isAddress(message.delegate) ||
    !isAddress(message.delegator) ||
    typeof message.authority !== 'string' ||
    !BYTES32_PATTERN.test(message.authority) ||
    salt === undefined ||
    !caveats
  ) {
    return 'Delegation message is malformed';
  }

  return {
    delegate: message.delegate,
    delegator: message.delegator,
    authority: message.authority as Hex,
    caveats,
    salt,
  };
}

/**
 * Finds the only caveat with the given enforcer.
 *
 * @param caveats - The caveats.
 * @param enforcer - The enforcer.
 * @returns The caveat, or `undefined` if there is none or more than one.
 */
function findOnlyCaveat(caveats: Caveat[], enforcer: Hex): Caveat | undefined {
  const matches = caveats.filter((caveat) =>
    isSameHex(caveat.enforcer, enforcer),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

/**
 * Checks a standing vault delegation, signed during the upgrade for CHOMP's
 * auto-deposit: exactly `ValueLte(0)`, `ERC20TransferAmount(token, amount)`
 * and `Redeemer([adapter])`, in any order, where the adapter belongs to a
 * pinned vault and the token is mUSD or that vault's share token.
 *
 * These are standing allowances, so their safety rests entirely on the
 * pinned delegate and adapter.
 *
 * @param caveats - The delegation's caveats.
 * @param config - The whitelist config.
 * @returns Whether MFA is required.
 */
function getStandingDelegationRequirement(
  caveats: Caveat[],
  config: MfaWhitelistConfig,
): MfaRequirement {
  const { ERC20TransferAmountEnforcer, RedeemerEnforcer, ValueLteEnforcer } =
    config.contracts;

  const valueLte = findOnlyCaveat(caveats, ValueLteEnforcer);
  const transferAmount = findOnlyCaveat(caveats, ERC20TransferAmountEnforcer);
  const redeemer = findOnlyCaveat(caveats, RedeemerEnforcer);
  if (caveats.length !== 3 || !valueLte || !transferAmount || !redeemer) {
    return requireMfa('Standing delegation caveats are not whitelisted');
  }

  if (!isSameHex(valueLte.terms, createValueLteTerms({ maxValue: 0n }))) {
    return requireMfa('Standing delegation allows native value');
  }

  // The packed-terms decoders throw unless the terms have the exact length.
  const { tokenAddress } = decodeERC20TransferAmountTerms(transferAmount.terms);
  const { redeemers } = decodeRedeemerTerms(redeemer.terms);
  if (redeemers.length !== 1) {
    return requireMfa('Standing delegation has more than one redeemer');
  }

  const vault = config.vaults.find(({ vedaVaultAdapterAddress }) =>
    isSameHex(vedaVaultAdapterAddress, redeemers[0]),
  );
  if (!vault) {
    return requireMfa('Standing delegation redeemer is not a vault adapter');
  }
  if (
    !isSameHex(tokenAddress, config.musdTokenAddress) &&
    !isSameHex(tokenAddress, vault.boringVault)
  ) {
    return requireMfa('Standing delegation token is not mUSD or vault shares');
  }

  return whitelisted('vault-standing-delegation');
}

/**
 * Checks a single-use transaction delegation: exactly `LimitedCalls(1)` and
 * one exact-execution caveat, in any order, pinning a vault deposit.
 *
 * Withdrawals, payments and Card approvals use the same shape with other
 * calls, so they require MFA.
 *
 * @param caveats - The delegation's caveats.
 * @param delegator - The Money Account.
 * @param config - The whitelist config.
 * @returns Whether MFA is required.
 */
function getSingleUseDelegationRequirement(
  caveats: Caveat[],
  delegator: Hex,
  config: MfaWhitelistConfig,
): MfaRequirement {
  const limitedCalls = findOnlyCaveat(
    caveats,
    config.contracts.LimitedCallsEnforcer,
  );
  const exactExecution = caveats.find((caveat) => caveat !== limitedCalls);
  if (caveats.length !== 2 || !limitedCalls || !exactExecution) {
    return requireMfa('Single-use delegation caveats are not whitelisted');
  }

  if (!isSameHex(limitedCalls.terms, createLimitedCallsTerms({ limit: 1 }))) {
    return requireMfa('Delegation is not limited to a single call');
  }

  const executions = getExactExecutions(exactExecution, delegator, config);
  if (!executions) {
    return requireMfa('Delegation does not pin its executions');
  }

  return isVaultDeposit(executions, config)
    ? whitelisted('vault-deposit-delegation')
    : requireMfa('Delegation executions are not a vault deposit');
}

/**
 * Determines whether a delegation requires MFA.
 *
 * The delegation must be a root delegation from the Money Account, parsed
 * with {@link parseDelegationTypedData}. Whitelisted are the standing vault
 * delegations to CHOMP's delegate, and single-use vault deposit delegations
 * redeemable by anyone.
 *
 * @param delegation - The delegation message.
 * @param context - The request context.
 * @param context.address - The Money Account address.
 * @param context.config - The whitelist config.
 * @returns Whether MFA is required.
 */
export function getDelegationMfaRequirement(
  delegation: DelegationMessage,
  { address, config }: DelegationContext,
): MfaRequirement {
  if (!isSameHex(delegation.delegator, address)) {
    return requireMfa('Delegator is not the Money Account');
  }
  if (!isSameHex(delegation.authority, ROOT_AUTHORITY)) {
    return requireMfa('Delegation is not a root delegation');
  }

  if (isSameHex(delegation.delegate, config.chompDelegateAddress)) {
    return getStandingDelegationRequirement(delegation.caveats, config);
  }
  if (isSameHex(delegation.delegate, ANY_BENEFICIARY)) {
    return getSingleUseDelegationRequirement(
      delegation.caveats,
      delegation.delegator,
      config,
    );
  }

  return requireMfa('Delegation delegate is not whitelisted');
}
