import { createTimestampTerms } from '@metamask/delegation-core';
import {
  CHAIN_ID,
  DELEGATOR_CONTRACTS,
} from '@metamask/delegation-deployments';

import { getChecksumEnforcersByChainId } from '../utils.js';
import { createPermissionDecodersForContracts } from './index.js';

describe('token-approval-revocation decoder', () => {
  const chainId = CHAIN_ID.sepolia;
  const contracts = DELEGATOR_CONTRACTS['1.3.0'][chainId];
  const { timestampEnforcer, approvalRevocationEnforcer, nonceEnforcer } =
    getChecksumEnforcersByChainId(contracts);
  const permissionDecoders = createPermissionDecodersForContracts(contracts);
  const decoder = permissionDecoders.find(
    (candidate) => candidate.permissionType === 'token-approval-revocation',
  );

  if (!decoder) {
    throw new Error('Decoder not found');
  }

  const expiryCaveat = {
    enforcer: timestampEnforcer,
    terms: createTimestampTerms({
      afterThreshold: 0,
      beforeThreshold: 1720000,
    }),
    args: '0x' as const,
  };

  it('rejects empty terms', () => {
    const caveats = [
      expiryCaveat,
      {
        enforcer: approvalRevocationEnforcer,
        terms: '0x' as const,
        args: '0x' as const,
      },
      {
        enforcer: nonceEnforcer,
        terms: '0x' as const,
        args: '0x' as const,
      },
    ];

    const result = decoder.validateAndDecodePermission(caveats);
    expect(result.isValid).toBe(false);

    if (result.isValid) {
      throw new Error('Expected invalid result');
    }

    expect(result.error.message).toContain(
      'Invalid ApprovalRevocation terms: must be greater than 0',
    );
  });

  it('rejects 0x00 terms', () => {
    const caveats = [
      expiryCaveat,
      {
        enforcer: approvalRevocationEnforcer,
        terms: '0x00' as const,
        args: '0x' as const,
      },
      {
        enforcer: nonceEnforcer,
        terms: '0x' as const,
        args: '0x' as const,
      },
    ];

    const result = decoder.validateAndDecodePermission(caveats);
    expect(result.isValid).toBe(false);

    if (result.isValid) {
      throw new Error('Expected invalid result');
    }

    expect(result.error.message).toContain(
      'Invalid ApprovalRevocation terms: must be greater than 0',
    );
  });

  it('rejects terms whose mask exceeds the supported max', () => {
    const caveats = [
      expiryCaveat,
      {
        enforcer: approvalRevocationEnforcer,
        terms: '0x40' as const,
        args: '0x' as const,
      },
      {
        enforcer: nonceEnforcer,
        terms: '0x' as const,
        args: '0x' as const,
      },
    ];

    const result = decoder.validateAndDecodePermission(caveats);
    expect(result.isValid).toBe(false);

    if (result.isValid) {
      throw new Error('Expected invalid result');
    }

    expect(result.error.message).toContain(
      'Invalid ApprovalRevocation terms: must be less than or equal to 63',
    );
  });

  it('successfully decodes valid token-approval-revocation caveats', () => {
    const caveats = [
      expiryCaveat,
      {
        enforcer: approvalRevocationEnforcer,
        terms: '0x01' as const,
        args: '0x' as const,
      },
      {
        enforcer: nonceEnforcer,
        terms: '0x' as const,
        args: '0x' as const,
      },
    ];

    const result = decoder.validateAndDecodePermission(caveats);
    expect(result.isValid).toBe(true);

    if (!result.isValid) {
      throw new Error('Expected valid result');
    }

    expect(result.expiry).toBe(1720000);
    expect(result.data).toStrictEqual({
      erc20Approve: true,
      erc721Approve: false,
      erc721SetApprovalForAll: false,
      permit2Approve: false,
      permit2Lockdown: false,
      permit2InvalidateNonces: false,
    });
    expect(result.rules).toStrictEqual([
      {
        type: 'expiry',
        data: { timestamp: 1720000 },
      },
    ]);
  });

  it('decodes all supported flags from the terms bitmask', () => {
    const caveats = [
      expiryCaveat,
      {
        enforcer: approvalRevocationEnforcer,
        terms: '0x3f' as const,
        args: '0x' as const,
      },
      {
        enforcer: nonceEnforcer,
        terms: '0x' as const,
        args: '0x' as const,
      },
    ];

    const result = decoder.validateAndDecodePermission(caveats);
    expect(result.isValid).toBe(true);

    if (!result.isValid) {
      throw new Error('Expected valid result');
    }

    expect(result.data).toStrictEqual({
      erc20Approve: true,
      erc721Approve: true,
      erc721SetApprovalForAll: true,
      permit2Approve: true,
      permit2Lockdown: true,
      permit2InvalidateNonces: true,
    });
  });
});
