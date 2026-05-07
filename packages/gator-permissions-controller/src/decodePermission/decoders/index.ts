import type { DeployedContractsByName, PermissionDecoder } from '../types';
import { getChecksumEnforcersByChainId } from '../utils';
import { makeErc20TokenAllowanceDecoder } from './erc20TokenAllowance';
import { makeErc20TokenPeriodicDecoder } from './erc20TokenPeriodic';
import { makeErc20TokenRevocationDecoder } from './erc20TokenRevocation';
import { makeErc20TokenStreamDecoder } from './erc20TokenStream';
import { makeNativeTokenAllowanceDecoder } from './nativeTokenAllowance';
import { makeNativeTokenPeriodicDecoder } from './nativeTokenPeriodic';
import { makeNativeTokenStreamDecoder } from './nativeTokenStream';

/**
 * Builds the canonical set of permission decoders for a chain.
 *
 * Each decoder specifies the `permissionType`, required/optional enforcers,
 * and provides `caveatAddressesMatch` and `validateAndDecodePermission` so the
 * entire decode flow can be driven by the decoders.
 *
 * @param contracts - The deployed contracts for the chain.
 * @returns A list of permission decoders used to identify and decode permission types.
 * @throws Propagates any errors from resolving enforcer addresses.
 */
export const createPermissionDecodersForContracts = (
  contracts: DeployedContractsByName,
): PermissionDecoder[] => {
  const contractAddresses = getChecksumEnforcersByChainId(contracts);
  return [
    makeNativeTokenStreamDecoder(contractAddresses),
    makeNativeTokenPeriodicDecoder(contractAddresses),
    makeNativeTokenAllowanceDecoder(contractAddresses),
    makeErc20TokenStreamDecoder(contractAddresses),
    makeErc20TokenPeriodicDecoder(contractAddresses),
    makeErc20TokenAllowanceDecoder(contractAddresses),
    makeErc20TokenRevocationDecoder(contractAddresses),
  ];
};
