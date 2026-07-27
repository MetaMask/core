import { decodeRedeemerTerms } from '@metamask/delegation-core';
import { getChecksumAddress } from '@metamask/utils';

import { EXECUTION_PERMISSION_REDEEMER_RULE_TYPE } from '../../constants.js';
import type { RuleDecoder } from '../types.js';
import { getTermsByEnforcer } from '../utils.js';

/**
 * Rule decoder that extracts a redeemer allowlist from a RedeemerEnforcer
 * caveat, when present.
 *
 * @param args - The arguments to this function.
 * @param args.contractAddresses - Checksummed enforcer addresses for the chain.
 * @param args.caveats - Checksummed caveats from the delegation.
 * @returns A `Rule` containing the redeemer addresses when a
 * RedeemerEnforcer caveat exists, otherwise `null`.
 */
export const redeemerRule: RuleDecoder = ({ contractAddresses, caveats }) => {
  const { redeemerEnforcer } = contractAddresses;

  const redeemerTerms = getTermsByEnforcer({
    caveats,
    enforcer: redeemerEnforcer,
    throwIfNotFound: false,
  });

  if (!redeemerTerms) {
    return null;
  }

  return {
    type: EXECUTION_PERMISSION_REDEEMER_RULE_TYPE,
    data: {
      addresses:
        decodeRedeemerTerms(redeemerTerms).redeemers.map(getChecksumAddress),
    },
  };
};
