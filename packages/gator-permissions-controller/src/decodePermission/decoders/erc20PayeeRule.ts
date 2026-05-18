import { decodeAllowedCalldataTerms } from '@metamask/delegation-core';
import { getChecksumAddress } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import { EXECUTION_PERMISSION_PAYEE_RULE_TYPE } from '../../constants';
import type { RuleDecoder } from '../types';
import { getByteLength } from '../utils';

const ERC20_TRANSFER_PAYEE_START_INDEX = 4;
const ERC20_PAYEE_VALUE_BYTE_LENGTH = 32;

/**
 * Rule decoder for ERC-20 style payees, where a single payee address is
 * encoded inside an AllowedCalldataEnforcer caveat constraining the recipient
 * argument of an ERC-20 `transfer` call.
 *
 * Use this decoder for ERC-20 token permissions. For native-token permissions,
 * use {@link nativePayeeRule} instead.
 *
 * @param args - The arguments to this function.
 * @param args.contractAddresses - Checksummed enforcer addresses for the chain.
 * @param args.caveats - Checksummed caveats from the delegation.
 * @param args.requiredEnforcers - Required enforcer counts for the permission.
 * @returns A `Rule` result containing the payee address when an
 * AllowedCalldataEnforcer caveat exists, otherwise `null`.
 * @throws If the AllowedCalldataEnforcer is also a required enforcer (the
 * payee enforcer must not be configured as required), if multiple matching
 * caveats are present, or if the encoded calldata constraint does not match
 * the expected ERC-20 transfer payee shape.
 */
export const erc20PayeeRule: RuleDecoder = ({
  contractAddresses,
  caveats,
  requiredEnforcers,
}) => {
  const { allowedCalldataEnforcer } = contractAddresses;

  if (requiredEnforcers.has(allowedCalldataEnforcer)) {
    throw new Error(
      'Invalid payee caveats: payee enforcer may not be a required caveat',
    );
  }

  const matchingCaveats = caveats.filter(
    (caveat) => caveat.enforcer === allowedCalldataEnforcer,
  );

  if (matchingCaveats.length === 0) {
    return null;
  }

  if (matchingCaveats.length > 1) {
    throw new Error(
      'Invalid payee caveats: multiple AllowedCalldataEnforcer caveats',
    );
  }

  const [caveat] = matchingCaveats;
  const decoded = decodeAllowedCalldataTerms(caveat.terms);

  if (decoded.startIndex !== ERC20_TRANSFER_PAYEE_START_INDEX) {
    throw new Error(
      `Invalid payee caveat: AllowedCalldataEnforcer startIndex must be ${ERC20_TRANSFER_PAYEE_START_INDEX}`,
    );
  }

  if (getByteLength(decoded.value) !== ERC20_PAYEE_VALUE_BYTE_LENGTH) {
    throw new Error(
      `Invalid payee caveat: AllowedCalldataEnforcer value must be ${ERC20_PAYEE_VALUE_BYTE_LENGTH} bytes long`,
    );
  }

  const address: Hex = `0x${decoded.value.slice(-40)}`;

  return {
    type: EXECUTION_PERMISSION_PAYEE_RULE_TYPE,
    data: { addresses: [getChecksumAddress(address)] },
  };
};
