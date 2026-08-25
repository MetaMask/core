import {
  isMoreConservativeDelay,
  mergePaymentMethodsById,
} from './paymentMethodMerge.js';
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

describe('isMoreConservativeDelay', () => {
  it('treats a higher max as more conservative', () => {
    expect(isMoreConservativeDelay([5, 60], [5, 10])).toBe(true);
    expect(isMoreConservativeDelay([5, 10], [5, 60])).toBe(false);
  });

  it('uses min as a tie-breaker when max matches', () => {
    expect(isMoreConservativeDelay([10, 30], [5, 30])).toBe(true);
    expect(isMoreConservativeDelay([5, 30], [10, 30])).toBe(false);
  });

  it('treats missing delay as least conservative', () => {
    expect(isMoreConservativeDelay([1, 2], undefined)).toBe(true);
    expect(isMoreConservativeDelay(undefined, [1, 2])).toBe(false);
  });
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

  it('still merges and dedupes when given two or more lists', () => {
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
    expect(merged[0]).toStrictEqual(
      expect.objectContaining({
        delay: [5, 60],
        name: 'Alpha Card',
        icon: 'alpha',
        score: 95,
      }),
    );
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

  it('keeps the more conservative delay on collision', () => {
    const merged = mergePaymentMethodsById([
      [card({ delay: [5, 10] })],
      [card({ delay: [5, 60] })],
    ]);

    expect(merged[0]?.delay).toStrictEqual([5, 60]);
  });

  it('keeps the best score on collision', () => {
    const merged = mergePaymentMethodsById([
      [card({ score: 80 })],
      [card({ score: 95 })],
    ]);

    expect(merged[0]?.score).toBe(95);
  });

  it('prefers the lexicographically smaller name and its icon when names differ', () => {
    const merged = mergePaymentMethodsById([
      [card({ name: 'Zeta Card', icon: 'zeta' })],
      [card({ name: 'Alpha Card', icon: 'alpha' })],
    ]);

    expect(merged[0]?.name).toBe('Alpha Card');
    expect(merged[0]?.icon).toBe('alpha');
  });

  it('keeps first-seen name when names are equal and fills a missing icon', () => {
    const merged = mergePaymentMethodsById([
      [card({ name: 'Card', icon: '' })],
      [card({ name: 'Card', icon: 'card-filled' })],
    ]);

    expect(merged[0]?.name).toBe('Card');
    expect(merged[0]?.icon).toBe('card-filled');
  });

  it('fills a missing name from the colliding entry', () => {
    const merged = mergePaymentMethodsById([
      [card({ name: '', icon: 'kept' })],
      [card({ name: 'Filled Card', icon: '' })],
    ]);

    expect(merged[0]?.name).toBe('Filled Card');
    expect(merged[0]?.icon).toBe('kept');
  });

  it('treats a single-element delay as both min and max', () => {
    expect(isMoreConservativeDelay([30], [10])).toBe(true);
    expect(isMoreConservativeDelay([], [1, 2])).toBe(false);
  });

  it('handles a sparse delay interval defensively', () => {
    const sparseDelay = new Array<number>(1);

    expect(isMoreConservativeDelay([1], sparseDelay)).toBe(true);
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
