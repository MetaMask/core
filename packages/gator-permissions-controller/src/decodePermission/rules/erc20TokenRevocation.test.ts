import { createTimestampTerms } from '@metamask/delegation-core';
import { CHAIN_ID, DELEGATOR_CONTRACTS } from '@metamask/delegation-deployments';

import { createPermissionRulesForContracts } from './index';

describe('erc20-token-revocation rule', () => {
  const chainId = CHAIN_ID.sepolia;
  const contracts = DELEGATOR_CONTRACTS['1.3.0'][chainId];
  const { TimestampEnforcer, AllowedCalldataEnforcer, ValueLteEnforcer } =
    contracts;
  const permissionRules = createPermissionRulesForContracts(contracts);
  const rule = permissionRules.find(
    (r) => r.permissionType === 'erc20-token-revocation',
  )!;

  const expiryCaveat = {
    enforcer: TimestampEnforcer,
    terms: createTimestampTerms({
      timestampAfterThreshold: 0,
      timestampBeforeThreshold: 1720000,
    }),
    args: '0x' as const,
  };

  it('rejects with only approve selector (missing zero-amount constraint)', () => {
    const approveSelectorTerms =
      '0x0000000000000000000000000000000000000000000000000000000000000000095ea7b3' as const;
    const zeroValueLteTerms =
      '0x0000000000000000000000000000000000000000000000000000000000000000' as const;
    const caveats = [
      expiryCaveat,
      {
        enforcer: AllowedCalldataEnforcer,
        terms: approveSelectorTerms,
        args: '0x' as const,
      },
      {
        enforcer: AllowedCalldataEnforcer,
        terms: approveSelectorTerms,
        args: '0x' as const,
      },
      {
        enforcer: ValueLteEnforcer,
        terms: zeroValueLteTerms,
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
      'Invalid erc20-token-revocation terms: expected approve selector and zero amount constraints',
    );
  });

  it('rejects with only zero-amount constraint (missing approve selector)', () => {
    const zeroAmountTerms =
      '0x00000000000000000000000000000000000000000000000000000000000000240000000000000000000000000000000000000000000000000000000000000000' as const;
    const zeroValueLteTerms =
      '0x0000000000000000000000000000000000000000000000000000000000000000' as const;
    const caveats = [
      expiryCaveat,
      {
        enforcer: AllowedCalldataEnforcer,
        terms: zeroAmountTerms,
        args: '0x' as const,
      },
      {
        enforcer: AllowedCalldataEnforcer,
        terms: zeroAmountTerms,
        args: '0x' as const,
      },
      {
        enforcer: ValueLteEnforcer,
        terms: zeroValueLteTerms,
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
      'Invalid erc20-token-revocation terms: expected approve selector and zero amount constraints',
    );
  });

  it('rejects when ValueLteEnforcer terms are non-zero', () => {
    const approveSelectorTerms =
      '0x0000000000000000000000000000000000000000000000000000000000000000095ea7b3' as const;
    const zeroAmountTerms =
      '0x00000000000000000000000000000000000000000000000000000000000000240000000000000000000000000000000000000000000000000000000000000000' as const;
    const nonZeroValueLteTerms =
      '0x0000000000000000000000000000000000000000000000000000000000000001' as const;
    const caveats = [
      expiryCaveat,
      {
        enforcer: AllowedCalldataEnforcer,
        terms: approveSelectorTerms,
        args: '0x' as const,
      },
      {
        enforcer: AllowedCalldataEnforcer,
        terms: zeroAmountTerms,
        args: '0x' as const,
      },
      {
        enforcer: ValueLteEnforcer,
        terms: nonZeroValueLteTerms,
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
      'Invalid ValueLteEnforcer terms: maxValue must be 0',
    );
  });

  it('rejects duplicate ValueLteEnforcer caveats', () => {
    const approveSelectorTerms =
      '0x0000000000000000000000000000000000000000000000000000000000000000095ea7b3' as const;
    const zeroAmountTerms =
      '0x00000000000000000000000000000000000000000000000000000000000000240000000000000000000000000000000000000000000000000000000000000000' as const;
    const zeroValueLteTerms =
      '0x0000000000000000000000000000000000000000000000000000000000000000' as const;
    const caveats = [
      expiryCaveat,
      {
        enforcer: AllowedCalldataEnforcer,
        terms: approveSelectorTerms,
        args: '0x' as const,
      },
      {
        enforcer: AllowedCalldataEnforcer,
        terms: zeroAmountTerms,
        args: '0x' as const,
      },
      {
        enforcer: ValueLteEnforcer,
        terms: zeroValueLteTerms,
        args: '0x' as const,
      },
      {
        enforcer: ValueLteEnforcer,
        terms: zeroValueLteTerms,
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

  it('rejects when ValueLteEnforcer terms have wrong length', () => {
    const approveSelectorTerms =
      '0x0000000000000000000000000000000000000000000000000000000000000000095ea7b3' as const;
    const zeroAmountTerms =
      '0x00000000000000000000000000000000000000000000000000000000000000240000000000000000000000000000000000000000000000000000000000000000' as const;
    const shortValueLteTerms = '0x0000' as const; // 2 bytes, need 32
    const caveats = [
      expiryCaveat,
      {
        enforcer: AllowedCalldataEnforcer,
        terms: approveSelectorTerms,
        args: '0x' as const,
      },
      {
        enforcer: AllowedCalldataEnforcer,
        terms: zeroAmountTerms,
        args: '0x' as const,
      },
      {
        enforcer: ValueLteEnforcer,
        terms: shortValueLteTerms,
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
      'Invalid erc20-token-revocation terms: ValueLteEnforcer terms must be 32 bytes',
    );
  });

  it('successfully decodes valid erc20-token-revocation caveats', () => {
    const approveSelectorTerms =
      '0x0000000000000000000000000000000000000000000000000000000000000000095ea7b3' as const;
    const zeroAmountTerms =
      '0x00000000000000000000000000000000000000000000000000000000000000240000000000000000000000000000000000000000000000000000000000000000' as const;
    const zeroValueLteTerms =
      '0x0000000000000000000000000000000000000000000000000000000000000000' as const;
    const caveats = [
      expiryCaveat,
      {
        enforcer: AllowedCalldataEnforcer,
        terms: approveSelectorTerms,
        args: '0x' as const,
      },
      {
        enforcer: AllowedCalldataEnforcer,
        terms: zeroAmountTerms,
        args: '0x' as const,
      },
      {
        enforcer: ValueLteEnforcer,
        terms: zeroValueLteTerms,
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
    expect(result.data).toEqual({});
  });
});
