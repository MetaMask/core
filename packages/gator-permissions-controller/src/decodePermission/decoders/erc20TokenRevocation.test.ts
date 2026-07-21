import { createTimestampTerms } from '@metamask/delegation-core';
import {
  CHAIN_ID,
  DELEGATOR_CONTRACTS,
} from '@metamask/delegation-deployments';
import { getChecksumAddress } from '@metamask/utils';

import { createPermissionDecodersForContracts } from '.';

describe('erc20-token-revocation decoder', () => {
  const chainId = CHAIN_ID.sepolia;
  const contracts = DELEGATOR_CONTRACTS['1.3.0'][chainId];
  const {
    TimestampEnforcer,
    AllowedCalldataEnforcer,
    ValueLteEnforcer,
    RedeemerEnforcer,
  } = contracts;
  const permissionDecoders = createPermissionDecodersForContracts(contracts);
  const decoder = permissionDecoders.find(
    (candidate) => candidate.permissionType === 'erc20-token-revocation',
  );
  if (!decoder) {
    throw new Error('Decoder not found');
  }

  const expiryCaveat = {
    enforcer: TimestampEnforcer,
    terms: createTimestampTerms({
      afterThreshold: 0,
      beforeThreshold: 1720000,
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

    const result = decoder.validateAndDecodePermission(caveats);
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

    const result = decoder.validateAndDecodePermission(caveats);
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

    const result = decoder.validateAndDecodePermission(caveats);
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
    const result = decoder.validateAndDecodePermission(caveats);
    expect(result.isValid).toBe(false);

    // this is here as a type guard
    if (result.isValid) {
      throw new Error('Expected invalid result');
    }

    expect(result.error.message).toContain('Invalid caveats');
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
    const result = decoder.validateAndDecodePermission(caveats);
    expect(result.isValid).toBe(true);

    // this is here as a type guard
    if (!result.isValid) {
      throw new Error('Expected valid result');
    }

    expect(result.expiry).toBe(1720000);
    expect(result.data).toStrictEqual({});
    expect(result.rules).toStrictEqual([
      {
        type: 'expiry',
        data: { timestamp: 1720000 },
      },
    ]);
  });

  it('includes redeemer rule but not payee when RedeemerEnforcer caveat is present', () => {
    const packedAddr = '1111111111111111111111111111111111111111' as const;
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
        enforcer: RedeemerEnforcer,
        terms: `0x${packedAddr}` as const,
        args: '0x' as const,
      },
    ];
    const result = decoder.validateAndDecodePermission(caveats);
    expect(result.isValid).toBe(true);
    if (!result.isValid) {
      throw new Error('Expected valid result');
    }
    expect(result.rules).toStrictEqual([
      {
        type: 'expiry',
        data: { timestamp: 1720000 },
      },
      {
        type: 'redeemer',
        data: {
          addresses: [
            getChecksumAddress(
              '0x1111111111111111111111111111111111111111' as const,
            ),
          ],
        },
      },
    ]);
  });
});
