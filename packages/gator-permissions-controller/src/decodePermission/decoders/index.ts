import type { DeployedContractsByName, PermissionDecoder } from '../types.js';
import { getChecksumEnforcersByChainId } from '../utils.js';
import { makeErc20TokenAllowanceDecoderConfig } from './erc20TokenAllowance.js';
import { makeErc20TokenPeriodicDecoderConfig } from './erc20TokenPeriodic.js';
import { makeErc20TokenRevocationDecoderConfig } from './erc20TokenRevocation.js';
import { makeErc20TokenStreamDecoderConfig } from './erc20TokenStream.js';
import { makePermissionDecoder } from './makePermissionDecoder.js';
import { makeNativeTokenAllowanceDecoderConfig } from './nativeTokenAllowance.js';
import { makeNativeTokenPeriodicDecoderConfig } from './nativeTokenPeriodic.js';
import { makeNativeTokenStreamDecoderConfig } from './nativeTokenStream.js';
import { makeTokenApprovalRevocationDecoderConfig } from './tokenApprovalRevocation.js';

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
