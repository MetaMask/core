import { makePermissionDecoderConfigs } from '@metamask/7715-permission-types';
import type { EnforcerAddressesByName } from '@metamask/7715-permission-types';

import type { PermissionDecoder } from '../types';
import { makePermissionDecoder } from './makePermissionDecoder';

/**
 * Builds the canonical set of permission decoders for a chain.
 *
 * Each decoder specifies the `permissionType`, required/optional enforcers,
 * and provides `caveatAddressesMatch` and `validateAndDecodePermission` so the
 * entire decode flow can be driven by the decoders.
 *
 * @param contracts - The deployed enforcer addresses for the chain.
 * @returns A list of permission decoders used to identify and decode permission types.
 * @throws Propagates any errors from resolving enforcer addresses.
 */
export const createPermissionDecodersForContracts = (
  contracts: EnforcerAddressesByName,
): PermissionDecoder[] => {
  return makePermissionDecoderConfigs(contracts).map(makePermissionDecoder);
};
