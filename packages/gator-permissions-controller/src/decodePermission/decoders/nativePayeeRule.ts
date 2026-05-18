import { decodeAllowedTargetsTerms } from '@metamask/delegation-core';
import { getChecksumAddress } from '@metamask/utils';

import { EXECUTION_PERMISSION_PAYEE_RULE_TYPE } from '../../constants';
import type { RuleDecoder } from '../types';

/**
 * Rule decoder for native-token style payees, where the payee address(es) are
 * encoded as the targets in an AllowedTargetsEnforcer caveat.
 *
 * Use this decoder for native-token permissions. For ERC-20 token permissions,
 * use {@link erc20PayeeRule} instead.
 *
 * @param args - The arguments to this function.
 * @param args.contractAddresses - Checksummed enforcer addresses for the chain.
 * @param args.caveats - Checksummed caveats from the delegation.
 * @param args.requiredEnforcers - Required enforcer counts for the permission.
 * @returns A `Rule` result containing the payee addresses when an
 * AllowedTargetsEnforcer caveat exists, otherwise `null`.
 * @throws If the AllowedTargetsEnforcer is also a required enforcer (the
 * payee enforcer must not be configured as required), or if multiple matching
 * caveats are present.
 */
export const nativePayeeRule: RuleDecoder = ({
  contractAddresses,
  caveats,
  requiredEnforcers,
}) => {
  const { allowedTargetsEnforcer } = contractAddresses;

  if (requiredEnforcers.has(allowedTargetsEnforcer)) {
    throw new Error(
      'Invalid payee caveats: payee enforcer may not be a required caveat',
    );
  }

  const matchingCaveats = caveats.filter(
    (caveat) => caveat.enforcer === allowedTargetsEnforcer,
  );

  if (matchingCaveats.length === 0) {
    return null;
  }

  if (matchingCaveats.length > 1) {
    throw new Error(
      'Invalid payee caveats: multiple AllowedTargetsEnforcer caveats',
    );
  }

  const [caveat] = matchingCaveats;
  const decoded = decodeAllowedTargetsTerms(caveat.terms);

  return {
    type: EXECUTION_PERMISSION_PAYEE_RULE_TYPE,
    data: { addresses: decoded.targets.map(getChecksumAddress) },
  };
};
