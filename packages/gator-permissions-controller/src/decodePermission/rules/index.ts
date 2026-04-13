import type { DeployedContractsByName, PermissionRule } from '../types';
import { getChecksumEnforcersByChainId } from '../utils';
import { makeErc20TokenPeriodicRule } from './erc20TokenPeriodic';
import { makeErc20TokenRevocationRule } from './erc20TokenRevocation';
import { makeErc20TokenStreamRule } from './erc20TokenStream';
import { makeNativeTokenPeriodicRule } from './nativeTokenPeriodic';
import { makeNativeTokenStreamRule } from './nativeTokenStream';

/**
 * Builds the canonical set of permission matching rules for a chain.
 *
 * Each rule specifies the `permissionType`, required/optional enforcers,
 * and provides `caveatAddressesMatch` and `validateAndDecodePermission` so the
 * entire decode flow can be driven by the rules.
 *
 * @param contracts - The deployed contracts for the chain.
 * @returns A list of permission rules used to identify and decode permission types.
 * @throws Propagates any errors from resolving enforcer addresses.
 */
export const createPermissionRulesForContracts = (
  contracts: DeployedContractsByName,
): PermissionRule[] => {
  const enforcers = getChecksumEnforcersByChainId(contracts);
  return [
    makeNativeTokenStreamRule(enforcers),
    makeNativeTokenPeriodicRule(enforcers),
    makeErc20TokenStreamRule(enforcers),
    makeErc20TokenPeriodicRule(enforcers),
    makeErc20TokenRevocationRule(enforcers),
  ];
};
