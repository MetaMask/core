import { describe, expect, it } from 'vitest';

import { HIP3_MARGIN_CONFIG } from '../../../src/constants/hyperLiquidConfig.js';
import { calculateHip3RebalanceAmount } from '../../../src/internal/hyperLiquidHip3Rebalance.js';

describe('calculateHip3RebalanceAmount', () => {
  const { RebalanceDesiredBuffer, RebalanceMinThreshold } = HIP3_MARGIN_CONFIG;

  it('returns everything above the buffer when it exceeds the threshold', () => {
    expect(
      calculateHip3RebalanceAmount({
        postOrderBalance: RebalanceDesiredBuffer + RebalanceMinThreshold + 5,
      }),
    ).toBeCloseTo(RebalanceMinThreshold + 5, 9);
  });

  it('keeps an excess equal to the threshold', () => {
    expect(
      calculateHip3RebalanceAmount({
        postOrderBalance: RebalanceDesiredBuffer + RebalanceMinThreshold,
      }),
    ).toBe(0);
  });

  it('keeps a balance at or below the buffer', () => {
    expect(
      calculateHip3RebalanceAmount({
        postOrderBalance: RebalanceDesiredBuffer,
      }),
    ).toBe(0);
    expect(calculateHip3RebalanceAmount({ postOrderBalance: -1 })).toBe(0);
  });
});
