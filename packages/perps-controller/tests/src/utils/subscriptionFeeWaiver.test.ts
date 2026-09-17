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
    'quotes the full waiver rate when the order notional is %p',
    (orderNotionalUsd) => {
      expect(
        resolveSubscriptionWaiverRate({
          status: createStatus({ remainingNotionalUsd: 250 }),
          maxFeeBips: MAX_FEE_BIPS,
          orderNotionalUsd,
        }),
      ).toMatchObject({ applies: true, feeBips: 0, kind: 'full' });
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
      entropy: 'ffffffffffffffffffffffffffffffff',
    });

    expect(marked).toHaveLength(34);
    // The Scale group marker still prefixes the id, so group recovery and
    // cancel-by-cloid keep working.
    expect(marked.startsWith(`0x${HYPERLIQUID_SCALE_CLOID_MARKER}`)).toBe(true);
    // The rung index survives, so rungs cannot collide on one cloid.
    expect(marked.slice(-2)).toBe('07');
    // And the attribution is carried in the flag byte instead.
    expect(hasFeeReductionAppliedFlag(marked)).toBe(true);
    expect(isSubscriptionProgramCloid(marked)).toBe(false);
  });

  it('keeps every marked rung of one ladder distinct', () => {
    const marked = [0, 1, 2].map((index) =>
      markSubscriptionCloid({
        clientOrderId:
          `0x${HYPERLIQUID_SCALE_CLOID_MARKER}00${'ab'.repeat(10)}${index
            .toString(16)
            .padStart(2, '0')}` as const,
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
