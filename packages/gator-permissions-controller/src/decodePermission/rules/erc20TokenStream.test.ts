import {
  createERC20StreamingTerms,
  createTimestampTerms,
} from '@metamask/delegation-core';
import type { Hex } from '@metamask/delegation-core';
import {
  CHAIN_ID,
  DELEGATOR_CONTRACTS,
} from '@metamask/delegation-deployments';

import { createPermissionRulesForContracts } from '.';
import { ZERO_32_BYTES } from '../utils';

describe('erc20-token-stream rule', () => {
  const chainId = CHAIN_ID.sepolia;
  const contracts = DELEGATOR_CONTRACTS['1.3.0'][chainId];
  const { TimestampEnforcer, ERC20StreamingEnforcer, ValueLteEnforcer } =
    contracts;
  const permissionRules = createPermissionRulesForContracts(contracts);
  const rule = permissionRules.find(
    (candidate) => candidate.permissionType === 'erc20-token-stream',
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

  const valueLteCaveat = {
    enforcer: ValueLteEnforcer,
    terms: ZERO_32_BYTES,
    args: '0x' as const,
  };

  it('rejects duplicate ERC20StreamingEnforcer caveats', () => {
    const tokenAddress = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex;
    const terms = createERC20StreamingTerms(
      {
        tokenAddress,
        initialAmount: 1n,
        maxAmount: 2n,
        amountPerSecond: 1n,
        startTime: 1715664,
      },
      { out: 'hex' },
    );
    const caveats = [
      expiryCaveat,
      valueLteCaveat,
      { enforcer: ERC20StreamingEnforcer, terms, args: '0x' as const },
      { enforcer: ERC20StreamingEnforcer, terms, args: '0x' as const },
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
    const truncatedTerms: Hex = `0x${'a'.repeat(100)}`;
    const caveats = [
      expiryCaveat,
      valueLteCaveat,
      {
        enforcer: ERC20StreamingEnforcer,
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
      'Invalid erc20-token-stream terms: expected 148 bytes',
    );
  });

  it('rejects when ValueLteEnforcer terms are not zero (native token value must be zero)', () => {
    const nonZeroValueLteTerms =
      '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex;
    const tokenAddress = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex;
    const caveats = [
      expiryCaveat,
      {
        enforcer: ValueLteEnforcer,
        terms: nonZeroValueLteTerms,
        args: '0x' as const,
      },
      {
        enforcer: ERC20StreamingEnforcer,
        terms: createERC20StreamingTerms(
          {
            tokenAddress,
            initialAmount: 1n,
            maxAmount: 2n,
            amountPerSecond: 1n,
            startTime: 1715664,
          },
          { out: 'hex' },
        ),
        args: '0x' as const,
      },
    ];
    const result = rule.validateAndDecodePermission(caveats);
    expect(result.isValid).toBe(false);

    // this is here as a type guard
    if (result.isValid) {
      throw new Error('Expected invalid result');
    }

    expect(result.error.message).toContain('Invalid value-lte terms');
    expect(result.error.message).toContain('must be');
  });

  it('decodes mixed-case token address', () => {
    const mixedCaseAddress = contracts.ERC20StreamingEnforcer as Hex;
    const caveats = [
      expiryCaveat,
      valueLteCaveat,
      {
        enforcer: ERC20StreamingEnforcer,
        terms: createERC20StreamingTerms(
          {
            tokenAddress: mixedCaseAddress,
            initialAmount: 1n,
            maxAmount: 2n,
            amountPerSecond: 1n,
            startTime: 1715664,
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
    expect(result.data?.tokenAddress.toLowerCase()).toBe(
      mixedCaseAddress.toLowerCase(),
    );
  });

  it('decodes zero token address', () => {
    const zeroAddress = '0x0000000000000000000000000000000000000000' as Hex;
    const caveats = [
      expiryCaveat,
      valueLteCaveat,
      {
        enforcer: ERC20StreamingEnforcer,
        terms: createERC20StreamingTerms(
          {
            tokenAddress: zeroAddress,
            initialAmount: 1n,
            maxAmount: 2n,
            amountPerSecond: 1n,
            startTime: 1715664,
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
      throw new Error('Expected invalid result');
    }

    expect(result.expiry).toBe(1720000);
    expect(result.data?.tokenAddress).toBe(zeroAddress);
  });

  it('rejects when initialAmount exceeds maxAmount', () => {
    const tokenAddress = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hex;
    const initialAmountHex = 1000n.toString(16).padStart(64, '0');
    const maxAmountHex = 100n.toString(16).padStart(64, '0');
    const amountPerSecondHex = 1n.toString(16).padStart(64, '0');
    const startTimeHex = (1715664).toString(16).padStart(64, '0');
    const terms =
      `0x${tokenAddress.slice(2)}${initialAmountHex}${maxAmountHex}${amountPerSecondHex}${startTimeHex}` as Hex;
    const caveats = [
      expiryCaveat,
      valueLteCaveat,
      { enforcer: ERC20StreamingEnforcer, terms, args: '0x' as const },
    ];
    const result = rule.validateAndDecodePermission(caveats);
    expect(result.isValid).toBe(false);

    // this is here as a type guard
    if (result.isValid) {
      throw new Error('Expected invalid result');
    }

    expect(result.error.message).toContain(
      'maxAmount must be greater than initialAmount',
    );
  });

  it('rejects when maxAmount equals initialAmount', () => {
    const tokenAddress = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hex;
    const initialAmountAndMaxAmount = 100n.toString(16).padStart(64, '0');
    const amountPerSecondHex = 1n.toString(16).padStart(64, '0');
    const startTimeHex = (1715664).toString(16).padStart(64, '0');
    const terms =
      `0x${tokenAddress.slice(2)}${initialAmountAndMaxAmount}${initialAmountAndMaxAmount}${amountPerSecondHex}${startTimeHex}` as Hex;
    const caveats = [
      expiryCaveat,
      valueLteCaveat,
      { enforcer: ERC20StreamingEnforcer, terms, args: '0x' as const },
    ];
    const result = rule.validateAndDecodePermission(caveats);
    expect(result.isValid).toBe(false);

    // this is here as a type guard
    if (result.isValid) {
      throw new Error('Expected invalid result');
    }

    expect(result.error.message).toContain(
      'maxAmount must be greater than initialAmount',
    );
  });

  it('rejects when terms have trailing bytes', () => {
    const tokenAddress = '0xcccccccccccccccccccccccccccccccccccccccc' as Hex;
    const validTerms = createERC20StreamingTerms(
      {
        tokenAddress,
        initialAmount: 42n,
        maxAmount: 100n,
        amountPerSecond: 1n,
        startTime: 1715664,
      },
      { out: 'hex' },
    );
    const termsWithTrailing = `${validTerms}deadbeef` as Hex;
    const caveats = [
      expiryCaveat,
      valueLteCaveat,
      {
        enforcer: ERC20StreamingEnforcer,
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
      'Invalid erc20-token-stream terms: expected 148 bytes',
    );
  });

  it('rejects when amountPerSecond is 0', () => {
    const tokenAddress = '0xdddddddddddddddddddddddddddddddddddddddd' as Hex;
    const initialAmountHex = 1n.toString(16).padStart(64, '0');
    const maxAmountHex = 2n.toString(16).padStart(64, '0');
    const amountPerSecondZero = '0'.repeat(64);
    const startTimeHex = (1715664).toString(16).padStart(64, '0');
    const terms =
      `0x${tokenAddress.slice(2)}${initialAmountHex}${maxAmountHex}${amountPerSecondZero}${startTimeHex}` as Hex;
    const caveats = [
      expiryCaveat,
      valueLteCaveat,
      { enforcer: ERC20StreamingEnforcer, terms, args: '0x' as const },
    ];
    const result = rule.validateAndDecodePermission(caveats);
    expect(result.isValid).toBe(false);

    // this is here as a type guard
    if (result.isValid) {
      throw new Error('Expected invalid result');
    }

    expect(result.error.message).toContain(
      'Invalid erc20-token-stream terms: amountPerSecond must be a positive number',
    );
  });

  it('rejects when startTime is 0', () => {
    const tokenAddress = '0xdddddddddddddddddddddddddddddddddddddddd' as Hex;
    const initialAmountHex = 1n.toString(16).padStart(64, '0');
    const maxAmountHex = 2n.toString(16).padStart(64, '0');
    const amountPerSecondHex = 1n.toString(16).padStart(64, '0');
    const startTimeZero = '0'.repeat(64);
    const terms =
      `0x${tokenAddress.slice(2)}${initialAmountHex}${maxAmountHex}${amountPerSecondHex}${startTimeZero}` as Hex;
    const caveats = [
      expiryCaveat,
      valueLteCaveat,
      { enforcer: ERC20StreamingEnforcer, terms, args: '0x' as const },
    ];
    const result = rule.validateAndDecodePermission(caveats);
    expect(result.isValid).toBe(false);

    // this is here as a type guard
    if (result.isValid) {
      throw new Error('Expected invalid result');
    }

    expect(result.error.message).toContain(
      'Invalid erc20-token-stream terms: startTime must be a positive number',
    );
  });

  it('rejects when tokenAddress is not valid hex (invalid characters)', () => {
    const invalidTokenAddress = 'gg';
    const initialAmountHex = 1n.toString(16).padStart(64, '0');
    const maxAmountHex = 2n.toString(16).padStart(64, '0');
    const amountPerSecondHex = 1n.toString(16).padStart(64, '0');
    const startTimeHex = (1715664).toString(16).padStart(64, '0');
    const terms =
      `0x${invalidTokenAddress}${'0'.repeat(38)}${initialAmountHex}${maxAmountHex}${amountPerSecondHex}${startTimeHex}` as Hex;

    const caveats = [
      expiryCaveat,
      valueLteCaveat,
      { enforcer: ERC20StreamingEnforcer, terms, args: '0x' as const },
    ];

    const result = rule.validateAndDecodePermission(caveats);
    expect(result.isValid).toBe(false);

    // this is here as a type guard
    if (result.isValid) {
      throw new Error('Expected invalid result');
    }

    expect(result.error.message).toContain(
      'Invalid erc20-token-stream terms: tokenAddress must be a valid hex string',
    );
  });
});
