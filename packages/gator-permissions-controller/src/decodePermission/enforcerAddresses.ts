import type { EnforcerAddressesByName } from '@metamask/7715-permission-types';
import { DELEGATOR_CONTRACTS } from '@metamask/delegation-deployments';
import { getChecksumAddress } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import { DELEGATION_FRAMEWORK_VERSION } from '../constants';
import type { DelegationDeploymentsEnforcerAddressesByName } from '../types';

// @metamask/delegation-deployments exports a very loosely typed object. We assert a more narrow typing here.
export const delegationContractsByChainId = DELEGATOR_CONTRACTS[
  DELEGATION_FRAMEWORK_VERSION
] as Record<number, DelegationDeploymentsEnforcerAddressesByName>;

const getChecksumContractAddress = (
  contracts: DelegationDeploymentsEnforcerAddressesByName,
  contractName: keyof DelegationDeploymentsEnforcerAddressesByName,
): Hex => {
  const address = contracts[contractName];

  if (!address) {
    throw new Error(`Contract not found: ${contractName}`);
  }

  return getChecksumAddress(address);
};

/**
 * Converts delegation-deployments enforcer addresses to the canonical shape
 * expected by `@metamask/7715-permission-types`, checksumming each address.
 *
 * @param contracts - Enforcer addresses keyed by delegation-deployments names.
 * @returns Checksummed enforcer addresses keyed by permission-types names.
 * @throws If an expected enforcer contract is not found.
 */
export const toEnforcerAddressesByName = (
  contracts: DelegationDeploymentsEnforcerAddressesByName,
): EnforcerAddressesByName => ({
  allowedCalldataEnforcer: getChecksumContractAddress(
    contracts,
    'AllowedCalldataEnforcer',
  ),
  allowedTargetsEnforcer: getChecksumContractAddress(
    contracts,
    'AllowedTargetsEnforcer',
  ),
  redeemerEnforcer: getChecksumContractAddress(contracts, 'RedeemerEnforcer'),
  erc20StreamingEnforcer: getChecksumContractAddress(
    contracts,
    'ERC20StreamingEnforcer',
  ),
  erc20PeriodTransferEnforcer: getChecksumContractAddress(
    contracts,
    'ERC20PeriodTransferEnforcer',
  ),
  nativeTokenStreamingEnforcer: getChecksumContractAddress(
    contracts,
    'NativeTokenStreamingEnforcer',
  ),
  nativeTokenPeriodTransferEnforcer: getChecksumContractAddress(
    contracts,
    'NativeTokenPeriodTransferEnforcer',
  ),
  approvalRevocationEnforcer: getChecksumContractAddress(
    contracts,
    'ApprovalRevocationEnforcer',
  ),
  exactCalldataEnforcer: getChecksumContractAddress(
    contracts,
    'ExactCalldataEnforcer',
  ),
  valueLteEnforcer: getChecksumContractAddress(contracts, 'ValueLteEnforcer'),
  timestampEnforcer: getChecksumContractAddress(contracts, 'TimestampEnforcer'),
  nonceEnforcer: getChecksumContractAddress(contracts, 'NonceEnforcer'),
});
