import { EXECUTION_PERMISSION_EXPIRY_RULE_TYPE } from '../../constants';
import type { RuleDecoder } from '../types';
import { extractExpiryFromCaveatTerms, getTermsByEnforcer } from '../utils';

/**
 * Rule decoder that extracts the expiry timestamp from a TimestampEnforcer
 * caveat, when present. Returns a standard {@link Rule} so that
 * `makePermissionDecoder` can append it to the decoded permission's `rules`
 * array. The decoder body additionally hoists the timestamp onto the
 * top-level `expiry` field of the response.
 *
 * @param args - The arguments to this function.
 * @param args.contractAddresses - Checksummed enforcer addresses for the chain.
 * @param args.caveats - Checksummed caveats from the delegation.
 * @returns A `{ type: 'expiry', data: { timestamp } }` rule when a
 * TimestampEnforcer caveat exists, otherwise `null`.
 */
export const expiryRule: RuleDecoder = ({ contractAddresses, caveats }) => {
  const { timestampEnforcer } = contractAddresses;

  const expiryTerms = getTermsByEnforcer({
    caveats,
    enforcer: timestampEnforcer,
    throwIfNotFound: false,
  });

  if (!expiryTerms) {
    return null;
  }

  return {
    type: EXECUTION_PERMISSION_EXPIRY_RULE_TYPE,
    data: { timestamp: extractExpiryFromCaveatTerms(expiryTerms) },
  };
};
