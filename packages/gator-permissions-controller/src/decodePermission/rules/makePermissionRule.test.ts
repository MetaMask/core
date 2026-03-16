import { createTimestampTerms } from '@metamask/delegation-core';
import {
  CHAIN_ID,
  DELEGATOR_CONTRACTS,
} from '@metamask/delegation-deployments';
import type { Hex } from '@metamask/utils';

import { makePermissionRule } from './makePermissionRule';

describe('makePermissionRule', () => {
  const contracts = DELEGATOR_CONTRACTS['1.3.0'][CHAIN_ID.sepolia];
  const timestampEnforcer = contracts.TimestampEnforcer;
  const requiredEnforcer = contracts.NonceEnforcer;

  it('calls optional validate callback when provided and decoding succeeds', () => {
    const validateAndDecodeData = jest.fn().mockReturnValue({});

    const rule = makePermissionRule({
      permissionType: 'native-token-stream',
      timestampEnforcer,
      optionalEnforcers: [],
      requiredEnforcers: { [requiredEnforcer]: 1 },
      validateAndDecodeData,
    });

    const caveats = [
      {
        enforcer: timestampEnforcer,
        terms: createTimestampTerms({
          timestampAfterThreshold: 0,
          timestampBeforeThreshold: 1720000,
        }),
        args: '0x' as Hex,
      },
      {
        enforcer: requiredEnforcer,
        terms: '0x' as Hex,
        args: '0x' as Hex,
      },
    ];

    const result = rule.validateAndDecodePermission(caveats);

    expect(result.isValid).toBe(true);
    if (!result.isValid) {
      throw new Error('Expected valid result');
    }
    expect(result.expiry).toBe(1720000);
    expect(result.data).toStrictEqual({});
    expect(validateAndDecodeData).toHaveBeenCalled();
  });

  it('rejects when any caveat terms are not valid hex (invalid characters)', () => {
    const validateAndDecodeData = jest.fn().mockReturnValue({});

    const rule = makePermissionRule({
      permissionType: 'native-token-stream',
      timestampEnforcer,
      optionalEnforcers: [],
      requiredEnforcers: { [requiredEnforcer]: 1 },
      validateAndDecodeData,
    });

    const caveats = [
      {
        enforcer: timestampEnforcer,
        terms: '0xgg' as Hex,
        args: '0x' as Hex,
      },
      {
        enforcer: requiredEnforcer,
        terms: '0x' as Hex,
        args: '0x' as Hex,
      },
    ];

    const result = rule.validateAndDecodePermission(caveats);

    expect(result.isValid).toBe(false);
    if (result.isValid) {
      throw new Error('Expected invalid result');
    }
    expect(result.error.message).toBe('Invalid terms: must be a hex string');
    expect(validateAndDecodeData).not.toHaveBeenCalled();
  });

  it('rejects when any caveat terms contain non-hex characters after 0x prefix', () => {
    const validateAndDecodeData = jest.fn().mockReturnValue({});

    const rule = makePermissionRule({
      permissionType: 'native-token-stream',
      timestampEnforcer,
      optionalEnforcers: [],
      requiredEnforcers: { [requiredEnforcer]: 1 },
      validateAndDecodeData,
    });

    const caveats = [
      {
        enforcer: timestampEnforcer,
        terms:
          '0x000000000000000000000000000000000000000000000000000000000000000z' as Hex,
        args: '0x' as Hex,
      },
      {
        enforcer: requiredEnforcer,
        terms: '0x' as Hex,
        args: '0x' as Hex,
      },
    ];

    const result = rule.validateAndDecodePermission(caveats);

    expect(result.isValid).toBe(false);
    if (result.isValid) {
      throw new Error('Expected invalid result');
    }
    expect(result.error.message).toBe('Invalid terms: must be a hex string');
    expect(validateAndDecodeData).not.toHaveBeenCalled();
  });

  it('rejects when required enforcer terms are not valid hex', () => {
    const validateAndDecodeData = jest.fn().mockReturnValue({});

    const rule = makePermissionRule({
      permissionType: 'native-token-stream',
      timestampEnforcer,
      optionalEnforcers: [],
      requiredEnforcers: { [requiredEnforcer]: 1 },
      validateAndDecodeData,
    });

    const caveats = [
      {
        enforcer: timestampEnforcer,
        terms: createTimestampTerms({
          timestampAfterThreshold: 0,
          timestampBeforeThreshold: 1720000,
        }),
        args: '0x' as Hex,
      },
      {
        enforcer: requiredEnforcer,
        terms: '0xNOTHEX' as Hex,
        args: '0x' as Hex,
      },
    ];

    const result = rule.validateAndDecodePermission(caveats);

    expect(result.isValid).toBe(false);
    if (result.isValid) {
      throw new Error('Expected invalid result');
    }
    expect(result.error.message).toBe('Invalid terms: must be a hex string');
    expect(validateAndDecodeData).not.toHaveBeenCalled();
  });

  it('accepts caveat terms with mixed-case hex', () => {
    const validateAndDecodeData = jest.fn().mockReturnValue({});

    const rule = makePermissionRule({
      permissionType: 'native-token-stream',
      timestampEnforcer,
      optionalEnforcers: [],
      requiredEnforcers: { [requiredEnforcer]: 1 },
      validateAndDecodeData,
    });

    const caveats = [
      {
        enforcer: timestampEnforcer,
        terms: createTimestampTerms({
          timestampAfterThreshold: 0,
          timestampBeforeThreshold: 1720000,
        }),
        args: '0x' as Hex,
      },
      {
        enforcer: requiredEnforcer,
        terms:
          '0x000000000000000000000000000000000000000000000000000000000000abAB' as Hex,
        args: '0x' as Hex,
      },
    ];

    const result = rule.validateAndDecodePermission(caveats);

    expect(result.isValid).toBe(true);
    if (!result.isValid) {
      throw new Error('Expected valid result');
    }
    expect(result.expiry).toBe(1720000);
    expect(validateAndDecodeData).toHaveBeenCalled();
  });

  it('accepts caveat terms with empty hex', () => {
    const validateAndDecodeData = jest.fn().mockReturnValue({});

    const rule = makePermissionRule({
      permissionType: 'native-token-stream',
      timestampEnforcer,
      optionalEnforcers: [],
      requiredEnforcers: { [requiredEnforcer]: 1 },
      validateAndDecodeData,
    });

    const caveats = [
      {
        enforcer: requiredEnforcer,
        terms: '0x' as Hex,
        args: '0x' as Hex,
      },
    ];

    const result = rule.validateAndDecodePermission(caveats);

    expect(result.isValid).toBe(true);
    if (!result.isValid) {
      throw new Error('Expected valid result');
    }
    expect(validateAndDecodeData).toHaveBeenCalled();
  });
});
