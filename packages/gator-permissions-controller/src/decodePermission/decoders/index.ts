import type { DeployedContractsByName, PermissionDecoder } from '../types';
import { getChecksumEnforcersByChainId } from '../utils';
import { makeErc20TokenAllowanceDecoderConfig } from './erc20TokenAllowance';
import { makeErc20TokenPeriodicDecoderConfig } from './erc20TokenPeriodic';
import { makeErc20TokenRevocationDecoderConfig } from './erc20TokenRevocation';
import { makeErc20TokenStreamDecoderConfig } from './erc20TokenStream';
import { makePermissionDecoder } from './makePermissionDecoder';
import { makeNativeTokenAllowanceDecoderConfig } from './nativeTokenAllowance';
import { makeNativeTokenPeriodicDecoderConfig } from './nativeTokenPeriodic';
import { makeNativeTokenStreamDecoderConfig } from './nativeTokenStream';
import { makeTokenApprovalRevocationDecoderConfig } from './tokenApprovalRevocation';

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
    makeNativeTokenStreamDecoderConfig(contractAddresses),
    makeNativeTokenPeriodicDecoderConfig(contractAddresses),
    makeNativeTokenAllowanceDecoderConfig(contractAddresses),
    makeErc20TokenStreamDecoderConfig(contractAddresses),
    makeErc20TokenPeriodicDecoderConfig(contractAddresses),
    makeErc20TokenAllowanceDecoderConfig(contractAddresses),
    makeErc20TokenRevocationDecoderConfig(contractAddresses),
    makeTokenApprovalRevocationDecoderConfig(contractAddresses),
  ].map(makePermissionDecoder);
};
