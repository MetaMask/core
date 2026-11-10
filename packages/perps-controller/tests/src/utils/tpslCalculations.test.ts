import { describe, expect, it } from 'vitest';

import type { TpslCalculationParams } from '../../../src/utils/tpslCalculations.js';
import {
  calculatePercentageForPrice,
  calculatePriceForPercentage,
  calculatePriceForRoE,
  calculateRoEForPrice,
  calculateSignedRoEForPrice,
  formatRoePercent,
  getMaxStopLossPercentage,
  isPositiveTriggerPrice,
  isStopLossSafeFromLiquidation,
  isValidStopLossPercentage,
  isValidStopLossPrice,
  isValidTakeProfitPrice,
  validateTPSLPrices,
} from '../../../src/utils/tpslCalculations.js';

// Shared fixtures (TAT-4463): a 2x position entered at 2,500, so a 10% RoE is
// a 5% price move. Clients assert the same rows against these exports.
const long2x: TpslCalculationParams = {
  currentPrice: 2500,
  entryPrice: 2500,
  direction: 'long',
  leverage: 2,
};
const short2x: TpslCalculationParams = { ...long2x, direction: 'short' };
const long10x: TpslCalculationParams = { ...long2x, leverage: 10 };
const short10x: TpslCalculationParams = { ...short2x, leverage: 10 };
// The same long before its leverage is known.
const longUnknownLeverage: TpslCalculationParams = {
  currentPrice: 2500,
  entryPrice: 2500,
  direction: 'long',
};

const SIGNED_ROE_ROWS: {
  side: string;
  params: TpslCalculationParams;
  price: string;
  roe: string;
}[] = [
  { side: 'long at a gain', params: long2x, price: '2625', roe: '10.00' },
  { side: 'long at a loss', params: long2x, price: '2375', roe: '-10.00' },
  { side: 'short at a gain', params: short2x, price: '2375', roe: '10.00' },
  { side: 'short at a loss', params: short2x, price: '2625', roe: '-10.00' },
  { side: '10x long at a gain', params: long10x, price: '2525', roe: '10.00' },
  {
    side: '10x short at a loss',
    params: short10x,
    price: '2525',
    roe: '-10.00',
  },
];

const PRICE_FOR_ROE_ROWS: {
  trigger: string;
  isProfit: boolean;
  params: TpslCalculationParams;
  roe: number;
  price: string;
}[] = [
  {
    trigger: 'long TP at a gain',
    isProfit: true,
    params: long2x,
    roe: 10,
    price: '2625',
  },
  {
    trigger: 'long TP at a loss',
    isProfit: true,
    params: long2x,
    roe: -10,
    price: '2375',
  },
  {
    trigger: 'short TP at a gain',
    isProfit: true,
    params: short2x,
    roe: 10,
    price: '2375',
  },
  {
    trigger: 'short TP at a loss',
    isProfit: true,
    params: short2x,
    roe: -10,
    price: '2625',
  },
  {
    trigger: 'long SL at a loss',
    isProfit: false,
    params: long2x,
    roe: -10,
    price: '2375',
  },
  {
    trigger: 'long SL at a gain',
    isProfit: false,
    params: long2x,
    roe: 50,
    price: '3125',
  },
  {
    trigger: 'short SL at a loss',
    isProfit: false,
    params: short2x,
    roe: -10,
    price: '2625',
  },
  {
    trigger: 'short SL at a gain',
    isProfit: false,
    params: short2x,
    roe: 50,
    price: '1875',
  },
  {
    trigger: '10x long TP at a gain',
    isProfit: true,
    params: long10x,
    roe: 10,
    price: '2525',
  },
  {
    trigger: '10x short SL at a loss',
    isProfit: false,
    params: short10x,
    roe: -10,
    price: '2525',
  },
];

describe('calculateSignedRoEForPrice', () => {
  it.each(SIGNED_ROE_ROWS)(
    'reads $price as $roe RoE for a $side',
    ({ params, price, roe }) => {
      expect(calculateSignedRoEForPrice(price, params)).toBe(roe);
    },
  );

  it('measures RoE from the entry price rather than the current price', () => {
    expect(
      calculateSignedRoEForPrice('2200', {
        ...long2x,
        currentPrice: 3000,
        entryPrice: 2000,
      }),
    ).toBe('20.00');
  });

  it('measures RoE from the current price without an entry price', () => {
    expect(
      calculateSignedRoEForPrice('2750', {
        currentPrice: 2500,
        direction: 'long',
        leverage: 1,
      }),
    ).toBe('10.00');
  });

  it('reads 2625 as 5.00 RoE for a long at an explicit 1x leverage', () => {
    const long1x = { ...longUnknownLeverage, leverage: 1 };
    expect(calculateSignedRoEForPrice('2625', long1x)).toBe('5.00');
    expect(calculateRoEForPrice('2625', true, long1x)).toBe('5.00');
  });

  it('has no RoE while the leverage is unknown', () => {
    expect(calculateSignedRoEForPrice('2625', longUnknownLeverage)).toBe('');
    expect(calculateRoEForPrice('2625', true, longUnknownLeverage)).toBe('');
    expect(calculateRoEForPrice('2375', false, longUnknownLeverage)).toBe('');
  });

  it('measures RoE and prices from the current price for an order form without an entry price', () => {
    const orderForm: TpslCalculationParams = {
      currentPrice: 2500,
      direction: 'long',
      leverage: 2,
    };
    expect(calculateSignedRoEForPrice('2750', orderForm)).toBe('20.00');
    expect(calculateRoEForPrice('2750', true, orderForm)).toBe('20.00');
    expect(calculatePriceForRoE(20, true, orderForm)).toBe('2750');
  });

  it.each([0, Number.NaN])(
    'has no RoE or price with an entry price of %s, rather than measuring from the current price',
    (entryPrice) => {
      const params = { ...long2x, entryPrice };
      expect(calculateSignedRoEForPrice('2750', params)).toBe('');
      expect(calculateRoEForPrice('2750', true, params)).toBe('');
      expect(calculateRoEForPrice('2250', false, params)).toBe('');
      expect(calculatePriceForRoE(20, true, params)).toBe('');
      expect(calculatePriceForRoE(-10, false, params)).toBe('');
    },
  );

  it.each([0, -2, Number.NaN, Number.POSITIVE_INFINITY])(
    'has no RoE with a leverage of %s',
    (leverage) => {
      expect(calculateSignedRoEForPrice('2625', { ...long2x, leverage })).toBe(
        '',
      );
      expect(calculateRoEForPrice('2625', true, { ...long2x, leverage })).toBe(
        '',
      );
      expect(calculateRoEForPrice('2375', false, { ...long2x, leverage })).toBe(
        '',
      );
      // At the base price the move is zero, and zero times Infinity is NaN.
      expect(calculateSignedRoEForPrice('2500', { ...long2x, leverage })).toBe(
        '',
      );
    },
  );

  it('reads `$` and `,` formatting', () => {
    expect(calculateSignedRoEForPrice('$2,625', long2x)).toBe('10.00');
  });

  it.each([
    { reason: 'an empty price', price: '', params: long2x },
    { reason: 'a non-numeric price', price: 'abc', params: long2x },
    { reason: 'a zero price', price: '0', params: long2x },
    { reason: 'a negative price', price: '-5', params: long2x },
    {
      reason: 'no side',
      price: '2625',
      params: { currentPrice: 2500, entryPrice: 2500 },
    },
    {
      reason: 'no reference price',
      price: '2625',
      params: { currentPrice: 0, direction: 'long' as const },
    },
    {
      reason: 'a negative reference price',
      price: '2625',
      params: {
        currentPrice: 2500,
        entryPrice: -1,
        direction: 'long' as const,
      },
    },
    { reason: 'an infinite price', price: 'Infinity', params: long2x },
    {
      reason: 'an infinite current price',
      price: '2625',
      params: {
        currentPrice: Number.POSITIVE_INFINITY,
        direction: 'long' as const,
        leverage: 2,
      },
    },
    {
      reason: 'an infinite entry price',
      price: '2625',
      params: { ...long2x, entryPrice: Number.POSITIVE_INFINITY },
    },
  ])('has no RoE with $reason', ({ price, params }) => {
    expect(calculateSignedRoEForPrice(price, params)).toBe('');
    expect(calculateRoEForPrice(price, true, params)).toBe('');
    expect(calculateRoEForPrice(price, false, params)).toBe('');
  });
});

describe('calculateRoEForPrice', () => {
  it.each([
    {
      trigger: 'long TP at a gain',
      isProfit: true,
      price: '2625',
      roe: '10.00',
    },
    {
      trigger: 'long TP at a loss',
      isProfit: true,
      price: '2375',
      roe: '0.00',
    },
    {
      trigger: 'long SL at a loss',
      isProfit: false,
      price: '2375',
      roe: '-10.00',
    },
    {
      trigger: 'long SL at a gain',
      isProfit: false,
      price: '2625',
      roe: '0.00',
    },
  ])('reads a $trigger on its own side as $roe', ({ isProfit, price, roe }) => {
    expect(calculateRoEForPrice(price, isProfit, long2x)).toBe(roe);
  });

  it('reads a short TP at a gain and a short SL at a gain as zero', () => {
    expect(calculateRoEForPrice('2375', true, short2x)).toBe('10.00');
    expect(calculateRoEForPrice('2375', false, short2x)).toBe('0.00');
  });

  it('reads a wrong-side RoE that rounds to zero as unsigned zero', () => {
    expect(calculateRoEForPrice('2499.99', true, long2x)).toBe('0.00');
  });

  it('has no RoE without a usable price', () => {
    expect(calculateRoEForPrice('', true, long2x)).toBe('');
  });
});

describe('calculatePriceForRoE', () => {
  it.each(PRICE_FOR_ROE_ROWS)(
    'prices a $trigger at $roe RoE as $price',
    ({ isProfit, params, roe, price }) => {
      expect(calculatePriceForRoE(roe, isProfit, params)).toBe(price);
    },
  );

  it.each(SIGNED_ROE_ROWS)(
    'round-trips the RoE of $price for a $side',
    ({ params, price, roe }) => {
      expect(calculatePriceForRoE(Number(roe), false, params)).toBe(price);
    },
  );

  it('caps a stop loss loss at 99% per 1x of leverage', () => {
    expect(calculatePriceForRoE(-500, false, long2x)).toBe('25');
    expect(calculatePriceForRoE(-500, false, short2x)).toBe('4975');
  });

  it('does not cap a take profit', () => {
    expect(calculatePriceForRoE(-150, true, long2x)).toBe('625');
  });

  it('prices a long TP at 10 RoE at an explicit 1x leverage as 2750', () => {
    expect(
      calculatePriceForRoE(10, true, { ...longUnknownLeverage, leverage: 1 }),
    ).toBe('2750');
  });

  it('has no price while the leverage is unknown', () => {
    expect(calculatePriceForRoE(10, true, longUnknownLeverage)).toBe('');
    expect(calculatePriceForRoE(-10, false, longUnknownLeverage)).toBe('');
  });

  it.each([
    { range: 'below $0.01', currentPrice: 0.001, price: '0.0011' },
    { range: 'below $1', currentPrice: 0.1234567, price: '0.135802' },
    { range: 'below $100', currentPrice: 12.34567, price: '13.5802' },
    { range: 'from $100', currentPrice: 123.4567, price: '135.8' },
  ])(
    'keeps the price decimals for prices $range',
    ({ currentPrice, price }) => {
      expect(
        calculatePriceForRoE(10, true, {
          currentPrice,
          direction: 'long',
          leverage: 1,
        }),
      ).toBe(price);
    },
  );

  it.each([
    {
      reason: 'no reference price',
      params: { currentPrice: 0, direction: 'long' as const },
    },
    {
      reason: 'a negative reference price',
      params: {
        currentPrice: 2500,
        entryPrice: -1,
        direction: 'long' as const,
      },
    },
    { reason: 'no side', params: { currentPrice: 2500 } },
    { reason: 'zero leverage', params: { ...long2x, leverage: 0 } },
    { reason: 'NaN leverage', params: { ...long2x, leverage: Number.NaN } },
    {
      reason: 'infinite leverage',
      params: { ...long2x, leverage: Number.POSITIVE_INFINITY },
    },
    {
      reason: 'an infinite current price',
      params: {
        currentPrice: Number.POSITIVE_INFINITY,
        direction: 'long' as const,
        leverage: 2,
      },
    },
    {
      reason: 'an infinite entry price',
      params: { ...long2x, entryPrice: Number.POSITIVE_INFINITY },
    },
  ])('has no price with $reason', ({ params }) => {
    expect(calculatePriceForRoE(10, true, params)).toBe('');
    expect(calculatePriceForRoE(-10, false, params)).toBe('');
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'has no price with a RoE of %s',
    (roe) => {
      expect(calculatePriceForRoE(roe, true, long2x)).toBe('');
      // The stop loss cap must not turn -Infinity into the capped price.
      expect(calculatePriceForRoE(roe, false, long2x)).toBe('');
      expect(calculatePriceForRoE(roe, false, short2x)).toBe('');
    },
  );
});

describe('calculatePriceForPercentage', () => {
  it.each([
    { trigger: 'long TP', isProfit: true, params: long2x, price: '2750' },
    { trigger: 'long SL', isProfit: false, params: long2x, price: '2250' },
    { trigger: 'short TP', isProfit: true, params: short2x, price: '2250' },
    { trigger: 'short SL', isProfit: false, params: short2x, price: '2750' },
  ])('moves the price 10% for a $trigger', ({ isProfit, params, price }) => {
    expect(calculatePriceForPercentage(10, isProfit, params)).toBe(price);
  });

  it.each([
    { range: 'below $0.01', currentPrice: 0.001, price: '0.0011' },
    { range: 'below $1', currentPrice: 0.123456, price: '0.135802' },
    { range: 'below $100', currentPrice: 12.345, price: '13.5795' },
  ])(
    'keeps the price decimals for prices $range',
    ({ currentPrice, price }) => {
      expect(
        calculatePriceForPercentage(10, true, { ...long2x, currentPrice }),
      ).toBe(price);
    },
  );

  it.each([
    { boundary: '$0.01', currentPrice: 0.01001234, price: '0.010012' },
    { boundary: '$1', currentPrice: 1.00001234, price: '1' },
    { boundary: '$100', currentPrice: 100.001234, price: '100' },
  ])('starts the next price band at $boundary', ({ currentPrice, price }) => {
    expect(
      calculatePriceForPercentage(0, true, { ...long2x, currentPrice }),
    ).toBe(price);
  });

  it('has no price without a current price', () => {
    expect(
      calculatePriceForPercentage(10, true, { ...long2x, currentPrice: 0 }),
    ).toBe('');
  });

  it('has no price without a side', () => {
    expect(calculatePriceForPercentage(10, true, { currentPrice: 2500 })).toBe(
      '',
    );
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'has no price with a percentage of %s',
    (percentage) => {
      expect(calculatePriceForPercentage(percentage, true, long2x)).toBe('');
    },
  );
});

describe('calculatePercentageForPrice', () => {
  it.each([
    {
      trigger: 'long TP above',
      isProfit: true,
      params: long2x,
      price: '2750',
      percentage: '10.00',
    },
    {
      trigger: 'long TP below',
      isProfit: true,
      params: long2x,
      price: '2250',
      percentage: '-10.00',
    },
    {
      trigger: 'long SL below',
      isProfit: false,
      params: long2x,
      price: '2250',
      percentage: '10.00',
    },
    {
      trigger: 'long SL above',
      isProfit: false,
      params: long2x,
      price: '2750',
      percentage: '-10.00',
    },
    {
      trigger: 'short TP below',
      isProfit: true,
      params: short2x,
      price: '2250',
      percentage: '10.00',
    },
    {
      trigger: 'short TP above',
      isProfit: true,
      params: short2x,
      price: '2750',
      percentage: '-10.00',
    },
    {
      trigger: 'short SL above',
      isProfit: false,
      params: short2x,
      price: '$2,750',
      percentage: '10.00',
    },
    {
      trigger: 'short SL below',
      isProfit: false,
      params: short2x,
      price: '2250',
      percentage: '-10.00',
    },
  ])(
    'reads a $trigger the current price as $percentage',
    ({ isProfit, params, price, percentage }) => {
      expect(calculatePercentageForPrice(price, isProfit, params)).toBe(
        percentage,
      );
    },
  );

  it.each([
    {
      reason: 'a current price',
      price: '2750',
      params: { ...long2x, currentPrice: 0 },
    },
    { reason: 'a price', price: '', params: long2x },
    { reason: 'a numeric price', price: 'abc', params: long2x },
    { reason: 'a side', price: '2750', params: { currentPrice: 2500 } },
    { reason: 'a finite price', price: 'Infinity', params: long2x },
    {
      reason: 'a finite current price',
      price: '2750',
      params: { ...long2x, currentPrice: Number.POSITIVE_INFINITY },
    },
  ])('has no percentage without $reason', ({ price, params }) => {
    expect(calculatePercentageForPrice(price, true, params)).toBe('');
    expect(calculatePercentageForPrice(price, false, params)).toBe('');
  });
});

describe('getMaxStopLossPercentage', () => {
  it('allows 99% per 1x of leverage', () => {
    expect(getMaxStopLossPercentage(1)).toBe(99);
    expect(getMaxStopLossPercentage(2)).toBe(198);
  });

  it('caps the percentage at 999%', () => {
    expect(getMaxStopLossPercentage(20)).toBe(999);
  });
});

describe('isValidStopLossPercentage', () => {
  it('accepts a percentage above zero within the maximum', () => {
    expect(isValidStopLossPercentage(150, 2)).toBe(true);
    expect(isValidStopLossPercentage(198, 2)).toBe(true);
  });

  it('rejects zero, a negative percentage and one beyond the maximum', () => {
    expect(isValidStopLossPercentage(0, 2)).toBe(false);
    expect(isValidStopLossPercentage(-10, 2)).toBe(false);
    expect(isValidStopLossPercentage(199, 2)).toBe(false);
  });
});

describe('isPositiveTriggerPrice', () => {
  it('accepts a positive, missing or non-numeric price', () => {
    expect(isPositiveTriggerPrice('2500')).toBe(true);
    expect(isPositiveTriggerPrice(undefined)).toBe(true);
    expect(isPositiveTriggerPrice('')).toBe(true);
    expect(isPositiveTriggerPrice('abc')).toBe(true);
  });

  it('rejects a price at or below zero', () => {
    expect(isPositiveTriggerPrice('0')).toBe(false);
    expect(isPositiveTriggerPrice('-5')).toBe(false);
    expect(isPositiveTriggerPrice('$-1,000')).toBe(false);
  });
});

describe('isValidTakeProfitPrice', () => {
  it('requires a long take profit above the reference price', () => {
    expect(isValidTakeProfitPrice('2625', long2x)).toBe(true);
    expect(isValidTakeProfitPrice('2375', long2x)).toBe(false);
    expect(isValidTakeProfitPrice('2500', long2x)).toBe(false);
  });

  it('requires a short take profit below the reference price', () => {
    expect(isValidTakeProfitPrice('2375', short2x)).toBe(true);
    expect(isValidTakeProfitPrice('2625', short2x)).toBe(false);
  });

  it('rejects a non-positive price even below a short reference price', () => {
    expect(isValidTakeProfitPrice('-5', short2x)).toBe(false);
  });

  it('accepts the price while the reference price, side or price is missing', () => {
    expect(isValidTakeProfitPrice('2375', { ...long2x, currentPrice: 0 })).toBe(
      true,
    );
    expect(isValidTakeProfitPrice('2375', { currentPrice: 2500 })).toBe(true);
    expect(isValidTakeProfitPrice('', long2x)).toBe(true);
    expect(isValidTakeProfitPrice('abc', long2x)).toBe(true);
  });
});

describe('isValidStopLossPrice', () => {
  it('requires a long stop loss below the reference price', () => {
    expect(isValidStopLossPrice('2375', long2x)).toBe(true);
    expect(isValidStopLossPrice('2625', long2x)).toBe(false);
  });

  it('requires a short stop loss above the reference price', () => {
    expect(isValidStopLossPrice('2625', short2x)).toBe(true);
    expect(isValidStopLossPrice('2375', short2x)).toBe(false);
  });

  it('rejects a non-positive price even below a long reference price', () => {
    expect(isValidStopLossPrice('-5', long2x)).toBe(false);
  });
});

describe('isStopLossSafeFromLiquidation', () => {
  it('requires a long stop loss above the liquidation price', () => {
    expect(isStopLossSafeFromLiquidation('2100', '2000', 'long')).toBe(true);
    expect(isStopLossSafeFromLiquidation('1900', '2000', 'long')).toBe(false);
    expect(isStopLossSafeFromLiquidation('2000', '2000', 'long')).toBe(false);
  });

  it('requires a short stop loss below the liquidation price', () => {
    expect(isStopLossSafeFromLiquidation('2900', '$3,000', 'short')).toBe(true);
    expect(isStopLossSafeFromLiquidation('3100', '3000', 'short')).toBe(false);
  });

  it('passes while an input is missing or not a number', () => {
    expect(isStopLossSafeFromLiquidation(undefined, '2000', 'long')).toBe(true);
    expect(isStopLossSafeFromLiquidation('1900', undefined, 'long')).toBe(true);
    expect(isStopLossSafeFromLiquidation('1900', '2000', undefined)).toBe(true);
    expect(isStopLossSafeFromLiquidation('abc', '2000', 'long')).toBe(true);
    expect(isStopLossSafeFromLiquidation('1900', 'abc', 'long')).toBe(true);
  });
});

describe('validateTPSLPrices', () => {
  const withLiquidation = { ...long2x, liquidationPrice: '2000' };

  it('accepts a pair on its sides and clear of liquidation', () => {
    expect(validateTPSLPrices('2625', '2375', withLiquidation)).toBe('valid');
  });

  it('accepts a single trigger', () => {
    expect(validateTPSLPrices('2625', undefined, withLiquidation)).toBe(
      'valid',
    );
    expect(validateTPSLPrices(undefined, '2375', withLiquidation)).toBe(
      'valid',
    );
  });

  it('accepts no trigger without needing a reference price', () => {
    expect(validateTPSLPrices(undefined, '', { currentPrice: 0 })).toBe(
      'valid',
    );
  });

  it('accepts a take profit without a liquidation price', () => {
    expect(
      validateTPSLPrices('2625', undefined, {
        ...long2x,
        liquidationPrice: 'abc',
      }),
    ).toBe('valid');
  });

  it('rejects a take profit or stop loss on the wrong side', () => {
    expect(validateTPSLPrices('2375', '2375', withLiquidation)).toBe('invalid');
    expect(validateTPSLPrices('2625', '2625', withLiquidation)).toBe('invalid');
  });

  it('rejects a stop loss beyond liquidation', () => {
    expect(validateTPSLPrices('2625', '1900', withLiquidation)).toBe('invalid');
  });

  it('rejects a stop loss beyond liquidation without a reference price', () => {
    expect(
      validateTPSLPrices(undefined, '1900', {
        currentPrice: 0,
        direction: 'long',
        liquidationPrice: '2000',
      }),
    ).toBe('invalid');
  });

  it('rejects a non-positive price before needing a reference price', () => {
    expect(validateTPSLPrices('-5', undefined, { currentPrice: 0 })).toBe(
      'invalid',
    );
    expect(validateTPSLPrices(undefined, '0', { currentPrice: 0 })).toBe(
      'invalid',
    );
  });

  it.each(['abc', 'Infinity', '$'])(
    'rejects a trigger price of %s',
    (price) => {
      expect(validateTPSLPrices(price, undefined, withLiquidation)).toBe(
        'invalid',
      );
      expect(validateTPSLPrices(undefined, price, withLiquidation)).toBe(
        'invalid',
      );
      expect(validateTPSLPrices(price, undefined, { currentPrice: 0 })).toBe(
        'invalid',
      );
    },
  );

  it.each([
    { reason: 'no reference price', params: { ...long2x, currentPrice: 0 } },
    {
      reason: 'a NaN reference price',
      params: { ...long2x, currentPrice: Number.NaN },
    },
    { reason: 'no side', params: { currentPrice: 2500 } },
  ])('cannot check a trigger with $reason', ({ params }) => {
    expect(validateTPSLPrices('2375', '2625', params)).toBe('unresolved');
    expect(validateTPSLPrices('2625', undefined, params)).toBe('unresolved');
  });

  it('cannot check a stop loss with an unreadable liquidation price', () => {
    expect(
      validateTPSLPrices('2625', '2375', {
        ...long2x,
        liquidationPrice: 'abc',
      }),
    ).toBe('unresolved');
  });
});

describe('formatRoePercent', () => {
  it('shows a whole RoE without decimals and others with two', () => {
    expect(formatRoePercent(10)).toBe('10');
    expect(formatRoePercent(12.5)).toBe('12.50');
    expect(formatRoePercent(12.346)).toBe('12.35');
  });

  it('prefixes a loss with `-`', () => {
    expect(formatRoePercent(-25.5)).toBe('-25.50');
  });

  it('prefixes a gain with `+` only when signed', () => {
    expect(formatRoePercent(12.5, { signed: true })).toBe('+12.50');
    expect(formatRoePercent(-12.5, { signed: true })).toBe('-12.50');
  });

  it('shows a RoE that rounds to zero without a sign', () => {
    expect(formatRoePercent(-0.001)).toBe('0');
    expect(formatRoePercent(0.001, { signed: true })).toBe('0');
  });

  it('reads a numeric string', () => {
    expect(formatRoePercent('-10.00')).toBe('-10');
  });

  it('has nothing to show for a value that is not a number', () => {
    expect(formatRoePercent('')).toBe('');
    expect(formatRoePercent('abc')).toBe('');
    expect(formatRoePercent(Number.NaN)).toBe('');
    expect(formatRoePercent(Infinity)).toBe('');
  });
});
