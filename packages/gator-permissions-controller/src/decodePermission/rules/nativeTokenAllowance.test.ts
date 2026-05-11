import { createTimestampTerms } from '@metamask/delegation-core';
import type { Hex } from '@metamask/delegation-core';
import {
  CHAIN_ID,
  DELEGATOR_CONTRACTS,
} from '@metamask/delegation-deployments';

import { createPermissionRulesForContracts } from '.';

describe('native-token-allowance rule', () => {
  const chainId = CHAIN_ID.sepolia;
  const contracts = DELEGATOR_CONTRACTS['1.3.0'][chainId];
  const {
    TimestampEnforcer,
    NativeTokenPeriodTransferEnforcer,
    ExactCalldataEnforcer,
  } = contracts;
  const permissionRules = createPermissionRulesForContracts(contracts);
  const rule = permissionRules.find(
    (candidate) => candidate.permissionType === 'native-token-allowance',
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

  const exactCalldataCaveat = {
    enforcer: ExactCalldataEnforcer,
    terms: '0x' as Hex,
    args: '0x' as const,
  };

  const PERIOD_AMOUNT_HEX = 100n.toString(16).padStart(64, '0');
  const PERIOD_DURATION_MAX_HEX = 'f'.repeat(64);
  const START_DATE_HEX = (1715664).toString(16).padStart(64, '0');
  const ALLOWANCE_TERMS =
    `0x${PERIOD_AMOUNT_HEX}${PERIOD_DURATION_MAX_HEX}${START_DATE_HEX}` as Hex;

  it('rejects duplicate NativeTokenPeriodTransferEnforcer caveats', () => {
    const caveats = [
      expiryCaveat,
      exactCalldataCaveat,
      {
        enforcer: NativeTokenPeriodTransferEnforcer,
        terms: ALLOWANCE_TERMS,
        args: '0x' as const,
      },
      {
        enforcer: NativeTokenPeriodTransferEnforcer,
        terms: ALLOWANCE_TERMS,
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
    const truncatedTerms: Hex = `0x${'00'.repeat(40)}`; // 40 bytes, need 96

    const caveats = [
      expiryCaveat,
      exactCalldataCaveat,
      {
        enforcer: NativeTokenPeriodTransferEnforcer,
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
      'Invalid native-token-allowance terms: expected 96 bytes',
    );
  });

  it('rejects when terms have trailing bytes', () => {
    const termsWithTrailing = `${ALLOWANCE_TERMS}deadbeef` as Hex;
    const caveats = [
      expiryCaveat,
      exactCalldataCaveat,
      {
        enforcer: NativeTokenPeriodTransferEnforcer,
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
      'Invalid native-token-allowance terms: expected 96 bytes',
    );
  });

  it('rejects when ExactCalldataEnforcer terms are not 0x', () => {
    const caveats = [
      expiryCaveat,
      {
        enforcer: ExactCalldataEnforcer,
        terms: '0x00' as Hex,
        args: '0x' as const,
      },
      {
        enforcer: NativeTokenPeriodTransferEnforcer,
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
      'Invalid exact-calldata terms: must be 0x',
    );
  });

  it('successfully decodes valid native-token-allowance caveats', () => {
    const caveats = [
      expiryCaveat,
      exactCalldataCaveat,
      {
        enforcer: NativeTokenPeriodTransferEnforcer,
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
      allowanceAmount: `0x${PERIOD_AMOUNT_HEX}`,
      startTime: 1715664,
    });
  });

  it('successfully decodes when periodDuration uses uppercase UINT256_MAX', () => {
    const uppercaseMax = 'F'.repeat(64);
    const terms =
      `0x${PERIOD_AMOUNT_HEX}${uppercaseMax}${START_DATE_HEX}` as Hex;

    const caveats = [
      expiryCaveat,
      exactCalldataCaveat,
      {
        enforcer: NativeTokenPeriodTransferEnforcer,
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
      `0x${PERIOD_AMOUNT_HEX}${nonMaxDuration}${START_DATE_HEX}` as Hex;

    const caveats = [
      expiryCaveat,
      exactCalldataCaveat,
      {
        enforcer: NativeTokenPeriodTransferEnforcer,
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
      'Invalid native-token-allowance terms: periodDuration must be UINT256_MAX',
    );
  });

  it('rejects when startTime is 0', () => {
    const startTimeZero = '0'.repeat(64);
    const terms =
      `0x${PERIOD_AMOUNT_HEX}${PERIOD_DURATION_MAX_HEX}${startTimeZero}` as Hex;
    const caveats = [
      expiryCaveat,
      exactCalldataCaveat,
      {
        enforcer: NativeTokenPeriodTransferEnforcer,
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
      'Invalid native-token-allowance terms: startTime must be a positive number',
    );
  });

  it('rejects when allowanceAmount is 0', () => {
    const allowanceZero = '0'.repeat(64);
    const terms =
      `0x${allowanceZero}${PERIOD_DURATION_MAX_HEX}${START_DATE_HEX}` as Hex;

    const caveats = [
      expiryCaveat,
      exactCalldataCaveat,
      {
        enforcer: NativeTokenPeriodTransferEnforcer,
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
      'Invalid native-token-allowance terms: allowanceAmount must be a positive number',
    );
  });
});
