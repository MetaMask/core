import { pickPaymentMethod } from './paymentMethodMerge.js';
import type { PaymentMethod } from './RampsService.js';

const buildMethod = (id: string): PaymentMethod => ({
  id,
  paymentType: 'debit-credit-card',
  name: id,
  score: 80,
  icon: 'card',
});

const card = buildMethod('/payments/debit-credit-card');
const applePay = buildMethod('/payments/apple-pay');
const GONE = '/payments/gone';

describe('pickPaymentMethod', () => {
  it.each([
    { ids: [GONE, applePay.id], expected: applePay, name: 'a present id' },
    { ids: [GONE], expected: card, name: 'no matching id' },
    { ids: [undefined], expected: card, name: 'only undefined ids' },
  ])('picks for $name', ({ ids, expected }) => {
    expect(pickPaymentMethod([card, applePay], ids)).toStrictEqual(expected);
  });

  it('returns null when there are no methods', () => {
    expect(pickPaymentMethod([], [card.id])).toBeNull();
  });
});
