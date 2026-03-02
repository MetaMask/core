import {
  createNativeTokenStreamingTerms,
  createTimestampTerms,
} from '@metamask/delegation-core';
import type { Hex } from '@metamask/delegation-core';
import {
  CHAIN_ID,
  DELEGATOR_CONTRACTS,
} from '@metamask/delegation-deployments';

import { createPermissionRulesForContracts } from '.';

describe('native-token-stream rule', () => {
  const chainId = CHAIN_ID.sepolia;
  const contracts = DELEGATOR_CONTRACTS['1.3.0'][chainId];
  const {
    TimestampEnforcer,
    NativeTokenStreamingEnforcer,
    ExactCalldataEnforcer,
  } = contracts;
  const permissionRules = createPermissionRulesForContracts(contracts);
  const rule = permissionRules.find(
    (candidate) => candidate.permissionType === 'native-token-stream',
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

  const exactCalldataCaveat = {
    enforcer: ExactCalldataEnforcer,
    terms: '0x' as Hex,
    args: '0x' as const,
  };

  it('rejects duplicate caveats for same enforcer (e.g. two TimestampEnforcer)', () => {
    const caveats = [
      expiryCaveat,
      exactCalldataCaveat,
      {
        enforcer: TimestampEnforcer,
        terms: createTimestampTerms({
          timestampAfterThreshold: 0,
          timestampBeforeThreshold: 9999,
        }),
        args: '0x' as const,
      },
      {
        enforcer: NativeTokenStreamingEnforcer,
        terms: createNativeTokenStreamingTerms(
          {
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

    expect(result.error.message).toContain('Invalid caveats');
  });

  it('rejects TimestampEnforcer terms with non-hex characters', () => {
    const invalidTerms =
      '0x00000000000000000000000000000000zz000000000000000000000000001a3b80' as Hex;
    const caveats = [
      exactCalldataCaveat,
      { enforcer: TimestampEnforcer, terms: invalidTerms, args: '0x' as const },
      {
        enforcer: NativeTokenStreamingEnforcer,
        terms: createNativeTokenStreamingTerms(
          {
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

    expect(result.error).toBeDefined();
  });

  it('rejects native-token-stream terms shorter than expected', () => {
    const truncatedTerms: Hex = `0x${'00'.repeat(50)}`;
    const caveats = [
      expiryCaveat,
      exactCalldataCaveat,
      {
        enforcer: NativeTokenStreamingEnforcer,
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
      'Invalid native-token-stream terms: expected 128 bytes',
    );
  });

  it('rejects when terms have trailing bytes', () => {
    const validTerms = createNativeTokenStreamingTerms(
      {
        initialAmount: 1n,
        maxAmount: 2n,
        amountPerSecond: 1n,
        startTime: 1715664,
      },
      { out: 'hex' },
    );
    const termsWithTrailing = `${validTerms}deadbeef` as Hex;
    const caveats = [
      expiryCaveat,
      exactCalldataCaveat,
      {
        enforcer: NativeTokenStreamingEnforcer,
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
      'Invalid native-token-stream terms: expected 128 bytes',
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
        enforcer: NativeTokenStreamingEnforcer,
        terms: createNativeTokenStreamingTerms(
          {
            initialAmount: 10n,
            maxAmount: 100n,
            amountPerSecond: 5n,
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

    expect(result.error.message).toContain(
      'Invalid exact-calldata terms: must be 0x',
    );
  });

  it('successfully decodes valid native-token-stream caveats', () => {
    const caveats = [
      expiryCaveat,
      exactCalldataCaveat,
      {
        enforcer: NativeTokenStreamingEnforcer,
        terms: createNativeTokenStreamingTerms(
          {
            initialAmount: 10n,
            maxAmount: 100n,
            amountPerSecond: 5n,
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
    expect(result.data.initialAmount).toBeDefined();
    expect(result.data.maxAmount).toBeDefined();
    expect(result.data.amountPerSecond).toBeDefined();
    expect(result.data.startTime).toBe(1715664);
  });

  it('rejects TimestampEnforcer terms with wrong length (66 required)', () => {
    const badLengthTerms: Hex = `0x${'0'.repeat(65)}`;
    const caveats = [
      exactCalldataCaveat,
      {
        enforcer: TimestampEnforcer,
        terms: badLengthTerms,
        args: '0x' as const,
      },
      {
        enforcer: NativeTokenStreamingEnforcer,
        terms: createNativeTokenStreamingTerms(
          {
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

    expect(result.error.message).toContain(
      'Invalid TimestampEnforcer terms length',
    );
  });

  it('rejects expiry timestampBeforeThreshold zero', () => {
    const caveats = [
      exactCalldataCaveat,
      {
        enforcer: TimestampEnforcer,
        terms: createTimestampTerms({
          timestampAfterThreshold: 0,
          timestampBeforeThreshold: 0,
        }),
        args: '0x' as const,
      },
      {
        enforcer: NativeTokenStreamingEnforcer,
        terms: createNativeTokenStreamingTerms(
          {
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

    expect(result.error.message).toContain(
      'Invalid expiry: timestampBeforeThreshold must be greater than 0',
    );
  });

  it('rejects expiry timestampAfterThreshold non-zero', () => {
    const caveats = [
      exactCalldataCaveat,
      {
        enforcer: TimestampEnforcer,
        terms: createTimestampTerms({
          timestampAfterThreshold: 1,
          timestampBeforeThreshold: 1720000,
        }),
        args: '0x' as const,
      },
      {
        enforcer: NativeTokenStreamingEnforcer,
        terms: createNativeTokenStreamingTerms(
          {
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

    expect(result.error.message).toContain(
      'Invalid expiry: timestampAfterThreshold must be 0',
    );
  });

  it('rejects native-token-stream with all-zero amounts (validates amounts are positive)', () => {
    const ZERO_32 = '0'.repeat(64);
    const startTimeHex = '1a2b50'.padStart(64, '0');
    const terms = `0x${ZERO_32}${ZERO_32}${ZERO_32}${startTimeHex}` as Hex;

    const caveats = [
      expiryCaveat,
      exactCalldataCaveat,
      { enforcer: NativeTokenStreamingEnforcer, terms, args: '0x' as const },
    ];

    const result = rule.validateAndDecodePermission(caveats);
    expect(result.isValid).toBe(false);

    // this is here as a type guard
    if (result.isValid) {
      throw new Error('Expected invalid result');
    }

    expect(result.error.message).toContain(
      'Invalid native-token-stream terms: initialAmount must be a positive number',
    );
  });

  it('rejects native-token-stream when maxAmount is zero', () => {
    const initialAmountHex = 1n.toString(16).padStart(64, '0');
    const maxAmountZero = '0'.repeat(64);
    const amountPerSecondHex = 1n.toString(16).padStart(64, '0');
    const startTimeHex = (1715664).toString(16).padStart(64, '0');
    const terms =
      `0x${initialAmountHex}${maxAmountZero}${amountPerSecondHex}${startTimeHex}` as Hex;
    const caveats = [
      expiryCaveat,
      exactCalldataCaveat,
      { enforcer: NativeTokenStreamingEnforcer, terms, args: '0x' as const },
    ];
    const result = rule.validateAndDecodePermission(caveats);
    expect(result.isValid).toBe(false);

    // this is here as a type guard
    if (result.isValid) {
      throw new Error('Expected invalid result');
    }

    expect(result.error.message).toContain(
      'Invalid native-token-stream terms: maxAmount must be a positive number',
    );
  });

  it('rejects native-token-stream when amountPerSecond is zero', () => {
    const initialAmountHex = 1n.toString(16).padStart(64, '0');
    const maxAmountHex = 2n.toString(16).padStart(64, '0');
    const amountPerSecondZero = '0'.repeat(64);
    const startTimeHex = (1715664).toString(16).padStart(64, '0');
    const terms =
      `0x${initialAmountHex}${maxAmountHex}${amountPerSecondZero}${startTimeHex}` as Hex;
    const caveats = [
      expiryCaveat,
      exactCalldataCaveat,
      { enforcer: NativeTokenStreamingEnforcer, terms, args: '0x' as const },
    ];
    const result = rule.validateAndDecodePermission(caveats);
    expect(result.isValid).toBe(false);

    // this is here as a type guard
    if (result.isValid) {
      throw new Error('Expected invalid result');
    }

    expect(result.error.message).toContain(
      'Invalid native-token-stream terms: amountPerSecond must be a positive number',
    );
  });

  it('rejects native-token-stream with startTime 0 (validates startTime is positive)', () => {
    const oneHex = 1n.toString(16).padStart(64, '0');
    const twoHex = 2n.toString(16).padStart(64, '0');
    const startTimeZero = '0'.repeat(64);
    const terms = `0x${oneHex}${twoHex}${oneHex}${startTimeZero}` as Hex;

    const caveats = [
      expiryCaveat,
      exactCalldataCaveat,
      { enforcer: NativeTokenStreamingEnforcer, terms, args: '0x' as const },
    ];

    const result = rule.validateAndDecodePermission(caveats);
    expect(result.isValid).toBe(false);

    // this is here as a type guard
    if (result.isValid) {
      throw new Error('Expected invalid result');
    }

    expect(result.error.message).toContain(
      'Invalid native-token-stream terms: startTime must be a positive number',
    );
  });
});
