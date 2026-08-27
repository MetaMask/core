import { mergePaymentMethodsById } from './paymentMethodMerge.js';
import type { PaymentMethod } from './RampsService.js';

const card = (overrides: Partial<PaymentMethod> = {}): PaymentMethod => ({
  id: '/payments/debit-credit-card',
  paymentType: 'debit-credit-card',
  name: 'Card',
  score: 80,
  icon: 'card',
  ...overrides,
});

const venmo = (overrides: Partial<PaymentMethod> = {}): PaymentMethod => ({
  id: '/payments/venmo',
  paymentType: 'bank-transfer',
  name: 'Venmo',
  score: 70,
  icon: 'venmo',
  ...overrides,
});

describe('mergePaymentMethodsById', () => {
  it('returns the same array and row references for a single list', () => {
    const method = card();
    const list = [method];

    const merged = mergePaymentMethodsById([list]);

    expect(merged).toBe(list);
    expect(merged[0]).toBe(method);
  });

  it('preserves order, length, and duplicate ids in a single list', () => {
    const list = [
      card({ name: 'First Card', score: 80 }),
      card({ name: 'Second Card', score: 95 }),
      venmo(),
    ];

    const merged = mergePaymentMethodsById([list]);

    expect(merged).toHaveLength(3);
    expect(merged.map((method) => method.id)).toStrictEqual([
      '/payments/debit-credit-card',
      '/payments/debit-credit-card',
      '/payments/venmo',
    ]);
    expect(merged.map((method) => method.score)).toStrictEqual([80, 95, 70]);
  });

  it('does not reorder a single list of unique ids', () => {
    const list = [venmo(), card()];

    const merged = mergePaymentMethodsById([list]);

    expect(merged.map((method) => method.id)).toStrictEqual([
      '/payments/venmo',
      '/payments/debit-credit-card',
    ]);
  });

  it('dedupes across two or more lists and keeps the first-seen entry', () => {
    const firstCard = card({
      delay: [5, 10],
      name: 'Zeta Card',
      icon: 'zeta',
      score: 80,
    });

    const merged = mergePaymentMethodsById([
      [firstCard],
      [
        card({
          delay: [5, 60],
          name: 'Alpha Card',
          icon: 'alpha',
          score: 95,
        }),
      ],
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).not.toBe(firstCard);
    expect(merged[0]).toStrictEqual(firstCard);
  });

  it('returns a new empty array for zero lists', () => {
    const merged = mergePaymentMethodsById([]);

    expect(merged).toStrictEqual([]);
  });

  it('dedupes by id and preserves first-seen order', () => {
    const merged = mergePaymentMethodsById([
      [card(), venmo()],
      [card({ score: 99, name: 'Debit Card' })],
    ]);

    expect(merged.map((method) => method.id)).toStrictEqual([
      '/payments/debit-credit-card',
      '/payments/venmo',
    ]);
  });

  it('keeps first-seen optional fields when present', () => {
    const merged = mergePaymentMethodsById([
      [
        card({
          disclaimer: 'first',
          pendingOrderDescription: 'pending-a',
          isManualBankTransfer: false,
        }),
      ],
      [
        card({
          disclaimer: 'second',
          pendingOrderDescription: 'pending-b',
          isManualBankTransfer: true,
        }),
      ],
    ]);

    expect(merged[0]?.disclaimer).toBe('first');
    expect(merged[0]?.pendingOrderDescription).toBe('pending-a');
    expect(merged[0]?.isManualBankTransfer).toBe(false);
  });
});
