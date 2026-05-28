/* eslint-disable no-bitwise */
import { hexToNumber } from '@metamask/utils';

import type {
  ChecksumCaveat,
  ChecksumEnforcersByChainId,
  DecodedPermission,
} from '../types';
import { getTermsByEnforcer } from '../utils';
import { expiryRule } from './expiryRule';
import type { MakePermissionDecoderConfig } from './makePermissionDecoder';

enum ApprovalRevocationFlag {
  Erc20Approve = 0x01,
  Erc721Approve = 0x02,
  Erc721SetApprovalForAll = 0x04,
  Permit2Approve = 0x08,
  Permit2Lockdown = 0x10,
  Permit2InvalidateNonces = 0x20,
}

const MAX_APPROVAL_REVOCATION_MASK =
  ApprovalRevocationFlag.Permit2InvalidateNonces |
  ApprovalRevocationFlag.Permit2Lockdown |
  ApprovalRevocationFlag.Permit2Approve |
  ApprovalRevocationFlag.Erc721SetApprovalForAll |
  ApprovalRevocationFlag.Erc721Approve |
  ApprovalRevocationFlag.Erc20Approve;

/**
 * Builds the configuration for the token-approval-revocation permission decoder.
 *
 * @param contractAddresses - Checksummed enforcer addresses for the chain.
 * @returns The token-approval-revocation permission decoder configuration.
 */
export function makeTokenApprovalRevocationDecoderConfig(
  contractAddresses: ChecksumEnforcersByChainId,
): MakePermissionDecoderConfig {
  const { timestampEnforcer, approvalRevocationEnforcer, nonceEnforcer } =
    contractAddresses;

  return {
    permissionType: 'token-approval-revocation',
    contractAddresses,
    optionalEnforcers: [
      timestampEnforcer, // expiry rule
    ],
    requiredEnforcers: {
      [approvalRevocationEnforcer]: 1,
      [nonceEnforcer]: 1,
    },
    rules: [expiryRule],
    validateAndDecodeData,
  };
}

/**
 * Decodes token-approval-revocation permission data from caveats; throws on invalid.
 *
 * @param caveats - Caveats from the permission context (checksummed).
 * @param contractAddresses - Checksummed enforcer addresses for the chain.
 * @returns Decoded approval-revocation capability flags.
 */
function validateAndDecodeData(
  caveats: ChecksumCaveat[],
  contractAddresses: ChecksumEnforcersByChainId,
): DecodedPermission['permission']['data'] {
  const { approvalRevocationEnforcer } = contractAddresses;

  const terms = getTermsByEnforcer({
    caveats,
    enforcer: approvalRevocationEnforcer,
  });

  if (terms === '0x') {
    throw new Error('Invalid ApprovalRevocation terms: must be greater than 0');
  }

  const mask = hexToNumber(terms);

  if (mask > MAX_APPROVAL_REVOCATION_MASK) {
    throw new Error(
      `Invalid ApprovalRevocation terms: must be less than or equal to ${MAX_APPROVAL_REVOCATION_MASK}`,
    );
  }

  if (mask === 0) {
    throw new Error('Invalid ApprovalRevocation terms: must be greater than 0');
  }

  return {
    erc20Approve: isFlagEnabled(mask, ApprovalRevocationFlag.Erc20Approve),
    erc721Approve: isFlagEnabled(mask, ApprovalRevocationFlag.Erc721Approve),
    erc721SetApprovalForAll: isFlagEnabled(
      mask,
      ApprovalRevocationFlag.Erc721SetApprovalForAll,
    ),
    permit2Approve: isFlagEnabled(mask, ApprovalRevocationFlag.Permit2Approve),
    permit2Lockdown: isFlagEnabled(
      mask,
      ApprovalRevocationFlag.Permit2Lockdown,
    ),
    permit2InvalidateNonces: isFlagEnabled(
      mask,
      ApprovalRevocationFlag.Permit2InvalidateNonces,
    ),
  };
}

function isFlagEnabled(mask: number, flag: number): boolean {
  return (mask & flag) === flag;
}
