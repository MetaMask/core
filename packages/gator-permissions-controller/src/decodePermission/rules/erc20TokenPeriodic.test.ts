import {
  createERC20TokenPeriodTransferTerms,
  createTimestampTerms,
} from '@metamask/delegation-core';
import type { Hex } from '@metamask/delegation-core';
import { CHAIN_ID, DELEGATOR_CONTRACTS } from '@metamask/delegation-deployments';

import { createPermissionRulesForContracts } from './index';

describe('erc20-token-periodic rule', () => {
  const chainId = CHAIN_ID.sepolia;
  const contracts = DELEGATOR_CONTRACTS['1.3.0'][chainId];
  const { TimestampEnforcer, ERC20PeriodTransferEnforcer } = contracts;
  const permissionRules = createPermissionRulesForContracts(contracts);
  const rule = permissionRules.find(
    (r) => r.permissionType === 'erc20-token-periodic',
  )!;

  const expiryCaveat = {
    enforcer: TimestampEnforcer,
    terms: createTimestampTerms({
      timestampAfterThreshold: 0,
      timestampBeforeThreshold: 1720000,
    }),
    args: '0x' as const,
  };

  it('rejects duplicate ERC20PeriodTransferEnforcer caveats', () => {
    const tokenAddress =
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex;
    const terms = createERC20TokenPeriodTransferTerms(
      {
        tokenAddress,
        periodAmount: 100n,
        periodDuration: 86400,
        startDate: 1715664,
      },
      { out: 'hex' },
    );
    const caveats = [
      expiryCaveat,
      {
        enforcer: ERC20PeriodTransferEnforcer,
        terms,
        args: '0x' as const,
      },
      {
        enforcer: ERC20PeriodTransferEnforcer,
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
    const truncatedTerms = `0x${'a'.repeat(100)}` as Hex; // 50 bytes, need 116
    const caveats = [
      expiryCaveat,
      {
        enforcer: ERC20PeriodTransferEnforcer,
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
      'Invalid erc20-token-periodic terms: expected 116 bytes',
    );
  });

  it('successfully decodes valid erc20-token-periodic caveats', () => {
    const tokenAddress =
      '0xcccccccccccccccccccccccccccccccccccccccc' as Hex;
    const caveats = [
      expiryCaveat,
      {
        enforcer: ERC20PeriodTransferEnforcer,
        terms: createERC20TokenPeriodTransferTerms(
          {
            tokenAddress,
            periodAmount: 200n,
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
    expect(result.data.tokenAddress).toBe(tokenAddress);
    expect(result.data.periodAmount).toBeDefined();
    expect(result.data.periodDuration).toBe(86400);
    expect(result.data.startTime).toBe(1715664);
  });

  it('rejects when periodDuration is 0', () => {
    const tokenAddress =
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex;
    const periodAmountHex = (100n).toString(16).padStart(64, '0');
    const periodDurationZero = '0'.repeat(64);
    const startDateHex = (1715664).toString(16).padStart(64, '0');
    const terms = `0x${tokenAddress.slice(2)}${periodAmountHex}${periodDurationZero}${startDateHex}` as Hex;

    const caveats = [
      expiryCaveat,
      {
        enforcer: ERC20PeriodTransferEnforcer,
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
      'Invalid erc20-token-periodic terms: periodDuration must be a positive number',
    );
  });

  it('rejects when terms have trailing bytes', () => {
    const tokenAddress =
      '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hex;
    const validTerms = createERC20TokenPeriodTransferTerms(
      {
        tokenAddress,
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
        enforcer: ERC20PeriodTransferEnforcer,
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
      'Invalid erc20-token-periodic terms: expected 116 bytes',
    );
  });

  it('rejects when startTime is 0', () => {
    const tokenAddress =
      '0xdddddddddddddddddddddddddddddddddddddddd' as Hex;
    const periodAmountHex = (100n).toString(16).padStart(64, '0');
    const periodDurationHex = (86400).toString(16).padStart(64, '0');
    const startTimeZero = '0'.repeat(64);
    const terms = `0x${tokenAddress.slice(2)}${periodAmountHex}${periodDurationHex}${startTimeZero}` as Hex;
    const caveats = [
      expiryCaveat,
      {
        enforcer: ERC20PeriodTransferEnforcer,
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
      'Invalid erc20-token-periodic terms: startTime must be a positive number',
    );
  });
});
