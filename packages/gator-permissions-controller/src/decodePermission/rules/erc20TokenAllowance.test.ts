import { createTimestampTerms } from '@metamask/delegation-core';
import type { Hex } from '@metamask/delegation-core';
import {
  CHAIN_ID,
  DELEGATOR_CONTRACTS,
} from '@metamask/delegation-deployments';

import { createPermissionRulesForContracts } from '.';
import { ZERO_32_BYTES } from '../utils';

describe('erc20-token-allowance rule', () => {
  const chainId = CHAIN_ID.sepolia;
  const contracts = DELEGATOR_CONTRACTS['1.3.0'][chainId];
  const { TimestampEnforcer, ERC20PeriodTransferEnforcer, ValueLteEnforcer } =
    contracts;
  const permissionRules = createPermissionRulesForContracts(contracts);
  const rule = permissionRules.find(
    (candidate) => candidate.permissionType === 'erc20-token-allowance',
  );
  if (!rule) {
    throw new Error('Rule not found');
  }

  const expiryCaveat = {
    enforcer: TimestampEnforcer,
    terms: createTimestampTerms({
      afterThreshold: 0,
      beforeThreshold: 1720000,
    }),
    args: '0x' as const,
  };

  const valueLteCaveat = {
    enforcer: ValueLteEnforcer,
    terms: ZERO_32_BYTES,
    args: '0x' as const,
  };

  const TOKEN_ADDRESS_HEX = 'aa'.repeat(20);
  const TOKEN_ADDRESS: Hex = `0x${TOKEN_ADDRESS_HEX}`;
  const ALLOWANCE_AMOUNT_HEX = 100n.toString(16).padStart(64, '0');
  const PERIOD_DURATION_MAX_HEX = 'f'.repeat(64);
  const START_DATE_HEX = (1715664).toString(16).padStart(64, '0');
  const ALLOWANCE_TERMS =
    `0x${TOKEN_ADDRESS_HEX}${ALLOWANCE_AMOUNT_HEX}${PERIOD_DURATION_MAX_HEX}${START_DATE_HEX}` as Hex;

  it('rejects duplicate ERC20PeriodTransferEnforcer caveats', () => {
    const caveats = [
      expiryCaveat,
      valueLteCaveat,
      {
        enforcer: ERC20PeriodTransferEnforcer,
        terms: ALLOWANCE_TERMS,
        args: '0x' as const,
      },
      {
        enforcer: ERC20PeriodTransferEnforcer,
        terms: ALLOWANCE_TERMS,
        args: '0x' as const,
      },
    ];
    const result = rule.validateAndDecodePermission(caveats);
    expect(result.isValid).toBe(false);

    if (result.isValid) {
      throw new Error('Expected invalid result');
    }

    expect(result.error.message).toContain('Invalid caveats');
  });

  it('rejects truncated terms', () => {
    const truncatedTerms: Hex = `0x${'00'.repeat(40)}`; // 40 bytes, need 116

    const caveats = [
      expiryCaveat,
      valueLteCaveat,
      {
        enforcer: ERC20PeriodTransferEnforcer,
        terms: truncatedTerms,
        args: '0x' as const,
      },
    ];

    const result = rule.validateAndDecodePermission(caveats);
    expect(result.isValid).toBe(false);

    if (result.isValid) {
      throw new Error('Expected invalid result');
    }

    expect(result.error.message).toContain(
      'Invalid erc20-token-allowance terms: expected 116 bytes',
    );
  });

  it('rejects when terms have trailing bytes', () => {
    const termsWithTrailing = `${ALLOWANCE_TERMS}deadbeef` as Hex;
    const caveats = [
      expiryCaveat,
      valueLteCaveat,
      {
        enforcer: ERC20PeriodTransferEnforcer,
        terms: termsWithTrailing,
        args: '0x' as const,
      },
    ];
    const result = rule.validateAndDecodePermission(caveats);
    expect(result.isValid).toBe(false);

    if (result.isValid) {
      throw new Error('Expected invalid result');
    }

    expect(result.error.message).toContain(
      'Invalid erc20-token-allowance terms: expected 116 bytes',
    );
  });

  it('rejects when ValueLteEnforcer terms are not zero', () => {
    const nonZeroValueLte: Hex = `0x${'0'.repeat(62)}01` as Hex;
    const caveats = [
      expiryCaveat,
      {
        enforcer: ValueLteEnforcer,
        terms: nonZeroValueLte,
        args: '0x' as const,
      },
      {
        enforcer: ERC20PeriodTransferEnforcer,
        terms: ALLOWANCE_TERMS,
        args: '0x' as const,
      },
    ];
    const result = rule.validateAndDecodePermission(caveats);
    expect(result.isValid).toBe(false);

    if (result.isValid) {
      throw new Error('Expected invalid result');
    }

    expect(result.error.message).toContain(
      `Invalid value-lte terms: must be ${ZERO_32_BYTES}`,
    );
  });

  it('successfully decodes valid erc20-token-allowance caveats', () => {
    const caveats = [
      expiryCaveat,
      valueLteCaveat,
      {
        enforcer: ERC20PeriodTransferEnforcer,
        terms: ALLOWANCE_TERMS,
        args: '0x' as const,
      },
    ];

    const result = rule.validateAndDecodePermission(caveats);
    expect(result.isValid).toBe(true);

    if (!result.isValid) {
      throw new Error('Expected valid result');
    }

    expect(result.expiry).toBe(1720000);
    expect(result.data).toStrictEqual({
      tokenAddress: TOKEN_ADDRESS,
      allowanceAmount: `0x${ALLOWANCE_AMOUNT_HEX}`,
      startTime: 1715664,
    });
  });

  it('successfully decodes when periodDuration uses uppercase UINT256_MAX', () => {
    const uppercaseMax = 'F'.repeat(64);
    const terms =
      `0x${TOKEN_ADDRESS_HEX}${ALLOWANCE_AMOUNT_HEX}${uppercaseMax}${START_DATE_HEX}` as Hex;

    const caveats = [
      expiryCaveat,
      valueLteCaveat,
      {
        enforcer: ERC20PeriodTransferEnforcer,
        terms,
        args: '0x' as const,
      },
    ];

    const result = rule.validateAndDecodePermission(caveats);
    expect(result.isValid).toBe(true);
  });

  it('rejects when periodDuration is not UINT256_MAX', () => {
    const nonMaxDuration = (86400).toString(16).padStart(64, '0');
    const terms =
      `0x${TOKEN_ADDRESS_HEX}${ALLOWANCE_AMOUNT_HEX}${nonMaxDuration}${START_DATE_HEX}` as Hex;

    const caveats = [
      expiryCaveat,
      valueLteCaveat,
      {
        enforcer: ERC20PeriodTransferEnforcer,
        terms,
        args: '0x' as const,
      },
    ];
    const result = rule.validateAndDecodePermission(caveats);
    expect(result.isValid).toBe(false);

    if (result.isValid) {
      throw new Error('Expected invalid result');
    }

    expect(result.error.message).toContain(
      'Invalid erc20-token-allowance terms: periodDuration must be UINT256_MAX',
    );
  });

  it('rejects when startTime is 0', () => {
    const startTimeZero = '0'.repeat(64);
    const terms =
      `0x${TOKEN_ADDRESS_HEX}${ALLOWANCE_AMOUNT_HEX}${PERIOD_DURATION_MAX_HEX}${startTimeZero}` as Hex;
    const caveats = [
      expiryCaveat,
      valueLteCaveat,
      {
        enforcer: ERC20PeriodTransferEnforcer,
        terms,
        args: '0x' as const,
      },
    ];
    const result = rule.validateAndDecodePermission(caveats);
    expect(result.isValid).toBe(false);

    if (result.isValid) {
      throw new Error('Expected invalid result');
    }

    expect(result.error.message).toContain(
      'Invalid erc20-token-allowance terms: startTime must be a positive number',
    );
  });

  it('rejects when allowanceAmount is 0', () => {
    const allowanceZero = '0'.repeat(64);
    const terms =
      `0x${TOKEN_ADDRESS_HEX}${allowanceZero}${PERIOD_DURATION_MAX_HEX}${START_DATE_HEX}` as Hex;

    const caveats = [
      expiryCaveat,
      valueLteCaveat,
      {
        enforcer: ERC20PeriodTransferEnforcer,
        terms,
        args: '0x' as const,
      },
    ];

    const result = rule.validateAndDecodePermission(caveats);
    expect(result.isValid).toBe(false);

    if (result.isValid) {
      throw new Error('Expected invalid result');
    }

    expect(result.error.message).toContain(
      'Invalid erc20-token-allowance terms: allowanceAmount must be a positive number',
    );
  });
});
