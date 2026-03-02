import {
  createNativeTokenPeriodTransferTerms,
  createTimestampTerms,
} from '@metamask/delegation-core';
import type { Hex } from '@metamask/delegation-core';
import {
  CHAIN_ID,
  DELEGATOR_CONTRACTS,
} from '@metamask/delegation-deployments';

import { createPermissionRulesForContracts } from '.';

describe('native-token-periodic rule', () => {
  const chainId = CHAIN_ID.sepolia;
  const contracts = DELEGATOR_CONTRACTS['1.3.0'][chainId];
  const { TimestampEnforcer, NativeTokenPeriodTransferEnforcer } = contracts;
  const permissionRules = createPermissionRulesForContracts(contracts);
  const rule = permissionRules.find(
    (candidate) => candidate.permissionType === 'native-token-periodic',
  );
  if (!rule) {
    throw new Error('Rule not found');
  }

  const expiryCaveat = {
    enforcer: TimestampEnforcer,
    terms: createTimestampTerms({
      timestampAfterThreshold: 0,
      timestampBeforeThreshold: 1720000,
    }),
    args: '0x' as const,
  };

  it('rejects duplicate NativeTokenPeriodTransferEnforcer caveats', () => {
    const terms = createNativeTokenPeriodTransferTerms(
      {
        periodAmount: 100n,
        periodDuration: 86400,
        startDate: 1715664,
      },
      { out: 'hex' },
    );
    const caveats = [
      expiryCaveat,
      {
        enforcer: NativeTokenPeriodTransferEnforcer,
        terms,
        args: '0x' as const,
      },
      {
        enforcer: NativeTokenPeriodTransferEnforcer,
        terms,
        args: '0x' as const,
      },
    ];
    const result = rule.validateAndDecodePermission(caveats);
    expect(result.isValid).toBe(false);

    // this is here as a type guard
    if (result.isValid) {
      throw new Error('Expected invalid result');
    }

    expect(result.error.message).toContain('Invalid caveats');
  });

  it('rejects truncated terms', () => {
    const truncatedTerms = `0x${'00'.repeat(40)}`; // 40 bytes, need 96
    const caveats = [
      expiryCaveat,
      {
        enforcer: NativeTokenPeriodTransferEnforcer,
        terms: truncatedTerms,
        args: '0x' as const,
      },
    ];
    const result = rule.validateAndDecodePermission(caveats);
    expect(result.isValid).toBe(false);

    // this is here as a type guard
    if (result.isValid) {
      throw new Error('Expected invalid result');
    }

    expect(result.error.message).toContain(
      'Invalid native-token-periodic terms: expected 96 bytes',
    );
  });

  it('rejects when terms have trailing bytes', () => {
    const validTerms = createNativeTokenPeriodTransferTerms(
      {
        periodAmount: 100n,
        periodDuration: 86400,
        startDate: 1715664,
      },
      { out: 'hex' },
    );
    const termsWithTrailing = `${validTerms}deadbeef` as Hex;
    const caveats = [
      expiryCaveat,
      {
        enforcer: NativeTokenPeriodTransferEnforcer,
        terms: termsWithTrailing,
        args: '0x' as const,
      },
    ];
    const result = rule.validateAndDecodePermission(caveats);
    expect(result.isValid).toBe(false);

    // this is here as a type guard
    if (result.isValid) {
      throw new Error('Expected invalid result');
    }

    expect(result.error.message).toContain(
      'Invalid native-token-periodic terms: expected 96 bytes',
    );
  });

  it('successfully decodes valid native-token-periodic caveats', () => {
    const caveats = [
      expiryCaveat,
      {
        enforcer: NativeTokenPeriodTransferEnforcer,
        terms: createNativeTokenPeriodTransferTerms(
          {
            periodAmount: 100n,
            periodDuration: 86400,
            startDate: 1715664,
          },
          { out: 'hex' },
        ),
        args: '0x' as const,
      },
    ];

    const result = rule.validateAndDecodePermission(caveats);
    expect(result.isValid).toBe(true);

    // this is here as a type guard
    if (!result.isValid) {
      throw new Error('Expected valid result');
    }

    expect(result.expiry).toBe(1720000);
    expect(result.data.periodAmount).toBeDefined();
    expect(result.data.periodDuration).toBe(86400);
    expect(result.data.startTime).toBe(1715664);
  });

  it('rejects when periodDuration is 0', () => {
    const periodAmountHex = 100n.toString(16).padStart(64, '0');
    const periodDurationZero = '0'.repeat(64);
    const startDateHex = (1715664).toString(16).padStart(64, '0');
    const terms =
      `0x${periodAmountHex}${periodDurationZero}${startDateHex}` as Hex;
    const caveats = [
      expiryCaveat,
      {
        enforcer: NativeTokenPeriodTransferEnforcer,
        terms,
        args: '0x' as const,
      },
    ];
    const result = rule.validateAndDecodePermission(caveats);
    expect(result.isValid).toBe(false);

    // this is here as a type guard
    if (result.isValid) {
      throw new Error('Expected invalid result');
    }

    expect(result.error.message).toContain(
      'Invalid native-token-periodic terms: periodDuration must be a positive number',
    );
  });

  it('rejects when startTime is 0', () => {
    const periodAmountHex = 100n.toString(16).padStart(64, '0');
    const periodDurationHex = (86400).toString(16).padStart(64, '0');
    const startTimeZero = '0'.repeat(64);
    const terms =
      `0x${periodAmountHex}${periodDurationHex}${startTimeZero}` as Hex;
    const caveats = [
      expiryCaveat,
      {
        enforcer: NativeTokenPeriodTransferEnforcer,
        terms,
        args: '0x' as const,
      },
    ];
    const result = rule.validateAndDecodePermission(caveats);
    expect(result.isValid).toBe(false);

    // this is here as a type guard
    if (result.isValid) {
      throw new Error('Expected invalid result');
    }

    expect(result.error.message).toContain(
      'Invalid native-token-periodic terms: startTime must be a positive number',
    );
  });
});
