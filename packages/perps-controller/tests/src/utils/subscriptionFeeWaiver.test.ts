import {
  SUBSCRIPTION_CLOID_CONFIG,
  SUBSCRIPTION_CLOID_FLAGS,
} from '../../../src/constants/perpsConfig.js';
import type { PerpsSubscriptionFeeWaiverStatus } from '../../../src/types/index.js';
import { HYPERLIQUID_SCALE_CLOID_MARKER } from '../../../src/utils/hyperLiquidAdapter.js';
import {
  applyFeeResolution,
  hasFeeReductionAppliedFlag,
  isSubscriptionProgramCloid,
  markSubscriptionCloid,
  readSubscriptionCloidFlags,
  resolveSubscriptionWaiverRate,
} from '../../../src/utils/subscriptionFeeWaiver.js';

/** 10 bips = BUILDER_FEE_CONFIG.MaxFeeDecimal (0.001) * BASIS_POINTS_DIVISOR. */
const MAX_FEE_BIPS = 10;

/**
 * Build an eligibility-gate outcome that passes by default.
 *
 * @param overrides - Fields to override on the status.
 * @returns A subscription fee-waiver status.
 */
const createStatus = (
  overrides: Partial<PerpsSubscriptionFeeWaiverStatus> = {},
): PerpsSubscriptionFeeWaiverStatus => ({
  eligible: true,
  reason: 'eligible',
  ...overrides,
});

describe('resolveSubscriptionWaiverRate', () => {
  it('waives the whole fee when the remaining allowance covers the order notional', () => {
    expect(
      resolveSubscriptionWaiverRate({
        status: createStatus({ remainingNotionalUsd: 5000 }),
        maxFeeBips: MAX_FEE_BIPS,
        orderNotionalUsd: 1000,
      }),
    ).toStrictEqual({
      applies: true,
      feeBips: 0,
      kind: 'full',
      coveredNotionalUsd: 1000,
    });
  });

  it('waives the whole fee at the exact boundary where remaining equals the notional', () => {
    expect(
      resolveSubscriptionWaiverRate({
        status: createStatus({ remainingNotionalUsd: 1000 }),
        maxFeeBips: MAX_FEE_BIPS,
        orderNotionalUsd: 1000,
      }),
    ).toMatchObject({ applies: true, feeBips: 0, kind: 'full' });
  });

  it('blends the fee by the uncovered share when the allowance is smaller than the order notional', () => {
    const rate = resolveSubscriptionWaiverRate({
      status: createStatus({ remainingNotionalUsd: 250 }),
      maxFeeBips: MAX_FEE_BIPS,
      orderNotionalUsd: 1000,
    });

    // 10 * (1 - 250/1000) = 7.5 bips — the fee on the uncovered 750 USD.
    expect(rate.applies).toBe(true);
    expect(rate.feeBips).toBeCloseTo(7.5, 10);
    expect(rate.kind).toBe('partial');
    expect(rate.coveredNotionalUsd).toBe(250);
  });

  it('charges almost the full fee when the allowance barely covers the order', () => {
    const rate = resolveSubscriptionWaiverRate({
      status: createStatus({ remainingNotionalUsd: 1 }),
      maxFeeBips: MAX_FEE_BIPS,
      orderNotionalUsd: 1000,
    });

    expect(rate.feeBips).toBeCloseTo(9.99, 10);
    expect(rate.kind).toBe('partial');
  });

  it('does not apply when the gate did not pass', () => {
    expect(
      resolveSubscriptionWaiverRate({
        status: createStatus({ eligible: false, reason: 'exhausted' }),
        maxFeeBips: MAX_FEE_BIPS,
        orderNotionalUsd: 1000,
      }),
    ).toStrictEqual({ applies: false, feeBips: MAX_FEE_BIPS, kind: 'none' });
  });

  it('does not apply when an eligible gate reports a spent allowance', () => {
    expect(
      resolveSubscriptionWaiverRate({
        status: createStatus({ remainingNotionalUsd: 0 }),
        maxFeeBips: MAX_FEE_BIPS,
        orderNotionalUsd: 1000,
      }),
    ).toStrictEqual({ applies: false, feeBips: MAX_FEE_BIPS, kind: 'none' });
  });

  it('treats an unbounded allowance as a full waiver', () => {
    expect(
      resolveSubscriptionWaiverRate({
        status: createStatus(),
        maxFeeBips: MAX_FEE_BIPS,
        orderNotionalUsd: 1000,
      }),
    ).toStrictEqual({ applies: true, feeBips: 0, kind: 'full' });
  });

  it.each([undefined, 0, -100, Number.NaN])(
    'withholds a bounded allowance when the order notional is %p',
    (orderNotionalUsd) => {
      // Granting the full waiver here would charge nothing on an order of
      // unknown size and silently over-consume the cap, so the source drops out
      // rather than failing open.
      expect(
        resolveSubscriptionWaiverRate({
          status: createStatus({ remainingNotionalUsd: 250 }),
          maxFeeBips: MAX_FEE_BIPS,
          orderNotionalUsd,
        }),
      ).toStrictEqual({ applies: false, feeBips: MAX_FEE_BIPS, kind: 'none' });
    },
  );

  it.each([undefined, 0])(
    'still waives an unbounded allowance when the order notional is %p',
    (orderNotionalUsd) => {
      // No reported cap means nothing to over-consume, so a rate-only preview
      // keeps quoting the full waiver.
      expect(
        resolveSubscriptionWaiverRate({
          status: createStatus(),
          maxFeeBips: MAX_FEE_BIPS,
          orderNotionalUsd,
        }),
      ).toStrictEqual({ applies: true, feeBips: 0, kind: 'full' });
    },
  );
});

describe('markSubscriptionCloid', () => {
  it('marks a fresh cloid with the subscription program id and the fee-reduction flag', () => {
    const cloid = markSubscriptionCloid({
      entropy: 'abcdef0123456789abcdef0123456789',
    });

    expect(cloid).toHaveLength(34);
    expect(isSubscriptionProgramCloid(cloid)).toBe(true);
    expect(hasFeeReductionAppliedFlag(cloid)).toBe(true);
    expect(readSubscriptionCloidFlags(cloid)).toBe(
      SUBSCRIPTION_CLOID_FLAGS.FeeReductionApplied,
    );
    expect(cloid.startsWith(`0x${SUBSCRIPTION_CLOID_CONFIG.ProgramId}`)).toBe(
      true,
    );
  });

  it('pads short entropy rather than producing a malformed cloid', () => {
    const cloid = markSubscriptionCloid({ entropy: 'abc' });

    expect(cloid).toHaveLength(34);
    expect(hasFeeReductionAppliedFlag(cloid)).toBe(true);
  });

  it('produces distinct cloids for distinct entropy', () => {
    const first = markSubscriptionCloid({ entropy: '1'.repeat(32) });
    const second = markSubscriptionCloid({ entropy: '2'.repeat(32) });

    expect(first).not.toStrictEqual(second);
  });

  it('preserves an existing Scale cloid marker and its rung index', () => {
    // A Scale rung: 4-byte scale marker, group entropy, rung index last byte.
    const rung =
      `0x${HYPERLIQUID_SCALE_CLOID_MARKER}00${'ab'.repeat(10)}07` as const;
    expect(rung).toHaveLength(34);

    const marked = markSubscriptionCloid({
      clientOrderId: rung,
      isGenerated: true,
      entropy: 'ffffffffffffffffffffffffffffffff',
    });

    expect(marked).toHaveLength(34);
    // The Scale group marker still prefixes the id, so group recovery and
    // cancel-by-cloid keep working.
    expect(marked.startsWith(`0x${HYPERLIQUID_SCALE_CLOID_MARKER}`)).toBe(true);
    // The rung index survives, so rungs cannot collide on one cloid.
    expect(marked.slice(-2)).toBe('07');
    // The attribution is carried in the flag byte instead...
    expect(readSubscriptionCloidFlags(marked)).toBe(
      SUBSCRIPTION_CLOID_FLAGS.FeeReductionApplied,
    );
    expect(isSubscriptionProgramCloid(marked)).toBe(false);
    // ...but the decoder will not trust a flag byte behind the Scale marker,
    // because legacy ladders carry random entropy in that position. A marked
    // rung is therefore indistinguishable from a legacy one to a decoder.
    expect(hasFeeReductionAppliedFlag(marked)).toBe(false);
  });

  it('returns a caller-supplied client order ID untouched', () => {
    // OrderParams.clientOrderId is public API and the caller's own
    // reconciliation key. Rewriting a byte of it would submit an id they never
    // chose and cannot match a fill against, so attribution is forgone instead.
    const caller = '0xdeadbeefcafebabe0011223344556677' as const;

    const result = markSubscriptionCloid({
      clientOrderId: caller,
      entropy: 'b'.repeat(32),
    });

    expect(result).toBe(caller);
    expect(hasFeeReductionAppliedFlag(result)).toBe(false);
  });

  it('returns a short caller client order ID untouched rather than replacing it', () => {
    // A cloid the venue may still accept but this package did not generate.
    // Discarding it outright would be the worst outcome of all.
    const caller = '0x1234' as const;

    expect(
      markSubscriptionCloid({ clientOrderId: caller, entropy: 'b'.repeat(32) }),
    ).toBe(caller);
  });

  it('preserves a caller client order ID that begins with a reserved marker', () => {
    // Provenance is declared, not inferred. A caller is free to supply a
    // well-formed cloid whose leading bytes happen to match a reserved marker,
    // and guessing from the prefix would rewrite exactly the id the contract
    // promises to preserve.
    const scalePrefixed =
      `0x${HYPERLIQUID_SCALE_CLOID_MARKER}ffbbccddeeff001122334455` as const;
    const programPrefixed =
      `0x${SUBSCRIPTION_CLOID_CONFIG.ProgramId}ffbbccddeeff001122334455` as const;

    expect(scalePrefixed).toHaveLength(34);
    expect(programPrefixed).toHaveLength(34);

    // Without an explicit `isGenerated`, both are the caller's and untouched.
    expect(
      markSubscriptionCloid({
        clientOrderId: scalePrefixed,
        entropy: 'b'.repeat(32),
      }),
    ).toBe(scalePrefixed);
    expect(
      markSubscriptionCloid({
        clientOrderId: programPrefixed,
        entropy: 'b'.repeat(32),
      }),
    ).toBe(programPrefixed);
  });

  it('re-stamps an id only when it is declared as package-generated', () => {
    const rung =
      `0x${HYPERLIQUID_SCALE_CLOID_MARKER}00${'ab'.repeat(10)}07` as const;

    const marked = markSubscriptionCloid({
      clientOrderId: rung,
      isGenerated: true,
      entropy: 'b'.repeat(32),
    });

    expect(marked).not.toBe(rung);
    expect(readSubscriptionCloidFlags(marked)).toBe(
      SUBSCRIPTION_CLOID_FLAGS.FeeReductionApplied,
    );
  });

  it('rejects a caller client order ID that is not hex', () => {
    expect(() =>
      markSubscriptionCloid({
        clientOrderId: 'not-a-cloid',
        entropy: 'b'.repeat(32),
      }),
    ).toThrow('Client order ID is not a hex string');
  });

  it('keeps every marked rung of one ladder distinct', () => {
    const marked = [0, 1, 2].map((index) =>
      markSubscriptionCloid({
        clientOrderId:
          `0x${HYPERLIQUID_SCALE_CLOID_MARKER}00${'ab'.repeat(10)}${index
            .toString(16)
            .padStart(2, '0')}` as const,
        isGenerated: true,
        entropy: 'ffffffffffffffffffffffffffffffff',
      }),
    );

    expect(new Set(marked).size).toBe(3);
  });
});

describe('hasFeeReductionAppliedFlag', () => {
  it.each([undefined, null, '', '0xdeadbeef'])(
    'reports no flag for %p',
    (clientOrderId) => {
      expect(hasFeeReductionAppliedFlag(clientOrderId)).toBe(false);
    },
  );

  it('does not trust the flag byte outside the subscription program marker', () => {
    // Scale ladders placed before this release carry random entropy where the
    // flag byte now lives, so roughly half of them would decode as waived if the
    // byte were read on the Scale marker alone. An arbitrary caller cloid has no
    // reserved flag byte at all.
    const legacyLadderWithFlagBitSet = `0x${HYPERLIQUID_SCALE_CLOID_MARKER}ab${'cd'.repeat(10)}07`;
    const callerCloidWithFlagBitSet = '0xdeadbeef01febabe0011223344556677';

    // The flag byte itself reads as set in both...
    expect(readSubscriptionCloidFlags(legacyLadderWithFlagBitSet)).toBe(0xab);
    expect(readSubscriptionCloidFlags(callerCloidWithFlagBitSet)).toBe(0x01);

    // ...but neither carries the program marker, so neither is trusted.
    expect(hasFeeReductionAppliedFlag(legacyLadderWithFlagBitSet)).toBe(false);
    expect(hasFeeReductionAppliedFlag(callerCloidWithFlagBitSet)).toBe(false);
  });

  it('reports no false positives across a legacy Scale ladder population', () => {
    // The defect this guards: before this change the byte the flag occupies held
    // random group entropy, so ~50% of historical rungs set bit 0.
    // Pre-change layout: marker (4 bytes) + 11 bytes of random group entropy +
    // the rung index byte. The first entropy byte is where the flag now lives.
    const legacyRungs = Array.from({ length: 256 }, (_, index) => {
      const group = index.toString(16).padStart(2, '0').repeat(11);
      return `0x${HYPERLIQUID_SCALE_CLOID_MARKER}${group}07`;
    });

    // Every fixture is a well-formed cloid, and many do set the flag bit...
    expect(legacyRungs.every((rung) => rung.length === 34)).toBe(true);
    expect(
      legacyRungs.filter(
        (rung) => (readSubscriptionCloidFlags(rung) ?? 0) % 2 === 1,
      ).length,
    ).toBeGreaterThan(0);

    // ...yet none decodes as a subscription waiver.
    expect(legacyRungs.filter(hasFeeReductionAppliedFlag)).toStrictEqual([]);
  });

  it('reports no flag for an unmarked Scale cloid, whose flag byte is reserved', () => {
    // The Scale generator zeroes the byte the subscription flag lives in, so
    // an unmarked ladder can never decode downstream as a waived one.
    const unmarked = `0x${HYPERLIQUID_SCALE_CLOID_MARKER}00${'ab'.repeat(10)}07`;

    expect(unmarked).toHaveLength(34);
    expect(hasFeeReductionAppliedFlag(unmarked)).toBe(false);
    expect(readSubscriptionCloidFlags(unmarked)).toBe(0);
  });
});

describe('applyFeeResolution', () => {
  const fees = {
    feeRate: 0.00145,
    feeAmount: 1.45,
    protocolFeeRate: 0.00045,
    protocolFeeAmount: 0.45,
    metamaskFeeRate: 0.001,
    metamaskFeeAmount: 1,
  };

  it('re-prices the MetaMask component and the total from a blended resolution', () => {
    const priced = applyFeeResolution({
      fees,
      resolution: {
        // 7.5 bips of a 10 bips default = a 25% discount.
        feeBips: 7.5,
        discountBips: 2500,
        source: 'subscription',
        subscription: createStatus({ remainingNotionalUsd: 250 }),
        subscriptionWaiverKind: 'partial',
      },
      amount: '1000',
    });

    expect(priced.metamaskFeeRate).toBeCloseTo(0.00075, 10);
    expect(priced.feeRate).toBeCloseTo(0.0012, 10);
    expect(priced.metamaskFeeAmount).toBeCloseTo(0.75, 10);
    expect(priced.feeAmount).toBeCloseTo(1.2, 10);
  });

  it('zeroes the MetaMask component on a full waiver', () => {
    const priced = applyFeeResolution({
      fees,
      resolution: {
        feeBips: 0,
        discountBips: 10000,
        source: 'subscription',
        subscription: createStatus(),
        subscriptionWaiverKind: 'full',
      },
      amount: '1000',
    });

    expect(priced.metamaskFeeRate).toBe(0);
    expect(priced.feeRate).toBeCloseTo(0.00045, 10);
    expect(priced.metamaskFeeAmount).toBe(0);
  });

  it('leaves the quote untouched when no source resolved', () => {
    expect(
      applyFeeResolution({
        fees,
        resolution: {
          feeBips: 10,
          discountBips: undefined,
          source: 'default',
          subscription: createStatus({ eligible: false, reason: 'no-source' }),
        },
        amount: '1000',
      }),
    ).toStrictEqual(fees);
  });

  it('leaves a placement that carries no builder fee untouched', () => {
    const twapFees = { ...fees, metamaskFeeRate: 0, metamaskFeeAmount: 0 };

    expect(
      applyFeeResolution({
        fees: twapFees,
        resolution: {
          feeBips: 0,
          discountBips: 10000,
          source: 'subscription',
          subscription: createStatus(),
          subscriptionWaiverKind: 'full',
        },
        amount: '1000',
      }),
    ).toStrictEqual(twapFees);
  });

  it('re-prices rates without amounts when no notional was supplied', () => {
    const priced = applyFeeResolution({
      fees,
      resolution: {
        feeBips: 0,
        discountBips: 10000,
        source: 'subscription',
        subscription: createStatus(),
        subscriptionWaiverKind: 'full',
      },
    });

    expect(priced.metamaskFeeRate).toBe(0);
    // The previously quoted amounts are left as the provider reported them.
    expect(priced.metamaskFeeAmount).toBe(fees.metamaskFeeAmount);
  });
});
