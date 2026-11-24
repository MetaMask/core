import { describe, expect, it } from 'vitest';

import type { BridgeHistoryItem } from '../types.js';
import { calcActualGasUsed } from './gas.js';

describe('calcActualGasUsed', () => {
  it('uses usd 0 when the quote has no gas exchange rate', () => {
    expect(
      calcActualGasUsed(
        { pricingData: { quotedGasAmount: '1' } } as BridgeHistoryItem,
        { gasUsed: '0x10', effectiveGasPrice: '0x10' },
      ),
    ).toStrictEqual({
      amount: '256',
      usd: '0',
    });
  });
});
