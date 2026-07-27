import type {
  PermissionDecoderConfig,
  Rule,
} from '@metamask/7715-permission-types';
import type { Caveat } from '@metamask/delegation-core';
import { getChecksumAddress, isStrictHexString } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import { EXECUTION_PERMISSION_EXPIRY_RULE_TYPE } from '../../constants.js';
import type { PermissionDecoder, ValidateAndDecodeResult } from '../types.js';
import { buildEnforcerCountsAndSet, enforcersMatchRule } from '../utils.js';

/**
 * Address checksumming in the permission decode flow.
 *
 * Enforcer addresses come from three sources, each of which may use a
 * different hex encoding (EIP-55 checksummed vs lowercase). Comparisons rely
 * on strict equality, so we normalize at function boundaries instead of
 * requiring callers to pass a specific encoding. `getChecksumAddress` is
 * idempotent, so repeated normalization is intentional and cheap.
 *
 * 1. **Canonical contract addresses** (`EnforcerAddressesByName`): normalized
 *    in {@link toEnforcerAddressesByName}, again in
 *    `makePermissionDecoderConfigs` (`checksumEnforcerAddresses` in
 *    `@metamask/7715-permission-types`), and once more below when building
 *    each decoder's required/optional enforcer sets.
 *
 * 2. **Delegation caveat enforcers**: read from the encoded permission
 *    context with unpredictable casing. Normalized in
 *    {@link buildEnforcerCountsAndSet} during address matching and again in
 *    `validateAndDecodePermission` before term decoding (rule decoders and
 *    `getTermsByEnforcer` compare enforcer addresses with `===`).
 *
 * 3. **Decoder required/optional enforcers**: populated from contract
 *    addresses by `makePermissionDecoderConfigs`; normalized at decoder
 *    construction so `caveatAddressesMatch` compares like-for-like with
 *    caveat addresses from source (2).
 */

/**
 * Creates a single {@link PermissionDecoder} with the given type, enforcer
 * sets, rule decoders, and decode/validate callback.
 *
 * @param config - The configuration describing the permission type's
 * enforcers, rule decoders, and data decoder. See
 * {@link PermissionDecoderConfig} for field documentation.
 * @param config.permissionType - The type of permission to decode.
 * @param config.contractAddresses - Checksummed enforcer addresses for the chain.
 * @param config.optionalEnforcers - Optional enforcers for the permission.
 * @param config.requiredEnforcers - Required enforcers for the permission.
 * @param config.rules - Rule decoders for the permission.
 * @param config.validateAndDecodeData - Data decoder for the permission.
 * @returns A {@link PermissionDecoder} with `caveatAddressesMatch` and
 * `validateAndDecodePermission`.
 */
export function makePermissionDecoder({
  permissionType,
  contractAddresses,
  optionalEnforcers,
  requiredEnforcers,
  rules,
  validateAndDecodeData,
}: PermissionDecoderConfig): PermissionDecoder {
  const optionalEnforcersSet = new Set(
    optionalEnforcers.map(getChecksumAddress),
  );
  const requiredEnforcersMap = new Map(
    Object.entries(requiredEnforcers).map(([enforcer, count]) => [
      getChecksumAddress(enforcer as Hex),
      count,
    ]),
  );

  const caveatAddressesMatch = (caveatAddresses: Hex[]): boolean => {
    const { counts, enforcersSet } = buildEnforcerCountsAndSet(caveatAddresses);

    return enforcersMatchRule(
      counts,
      enforcersSet,
      requiredEnforcersMap,
      optionalEnforcersSet,
    );
  };

  const validateAndDecodePermission = (
    caveats: Caveat<Hex>[],
  ): ValidateAndDecodeResult => {
    const checksumCaveats: Caveat<Hex>[] = caveats.map((caveat) => ({
      ...caveat,
      enforcer: getChecksumAddress(caveat.enforcer),
    }));
    try {
      const invalidTerms = checksumCaveats.filter(
        // isStrictHexString rejects '0x' which is a valid terms value
        ({ terms }) => terms !== '0x' && !isStrictHexString(terms),
      );

      if (invalidTerms.length > 0) {
        throw new Error('Invalid terms: must be a hex string');
      }

      let expiry: number | null = null;
      const decodedRules: Rule[] = [];

      for (const decode of rules) {
        const rule = decode({
          contractAddresses,
          caveats: checksumCaveats,
          requiredEnforcers: requiredEnforcersMap,
        });

        if (rule === null) {
          continue;
        }

        decodedRules.push(rule);

        if (rule.type === EXECUTION_PERMISSION_EXPIRY_RULE_TYPE) {
          expiry = rule.data.timestamp as number;
        }
      }

      const data = validateAndDecodeData(checksumCaveats, contractAddresses);

      return {
        isValid: true,
        expiry,
        data,
        rules: decodedRules.length > 0 ? decodedRules : undefined,
      };
    } catch (caughtError) {
      return { isValid: false, error: caughtError as Error };
    }
  };

  return {
    permissionType,
    caveatAddressesMatch,
    validateAndDecodePermission,
    optionalEnforcers: optionalEnforcersSet,
    requiredEnforcers: requiredEnforcersMap,
  };
}
