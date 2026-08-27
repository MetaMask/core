import type { PaymentMethod } from './RampsService.js';

/**
 * Merges payment-method lists from multiple providers into one list keyed by
 * canonical payment method `id`.
 *
 * First seen wins on collision. Payment metadata is provider-invariant: the
 * API serves it from a per-region catalog and the `provider` query narrows
 * that catalog by id-set membership without rewriting fields, so colliding
 * entries carry identical values.
 *
 * Encounter order of first-seen ids is preserved (provider fan-out order).
 *
 * @param lists - Payment method arrays in provider contribution order.
 * @returns Deduped payment methods.
 */
/**
 * Picks the payment method to select: the first `preferredIds` entry still
 * present in `methods`, otherwise the first method.
 *
 * @param methods - Candidate payment methods, in display order.
 * @param preferredIds - Preferred ids in priority order; falsy ids are skipped.
 * @returns The selection, or null when `methods` is empty.
 */
export function pickPaymentMethod(
  methods: PaymentMethod[],
  preferredIds: (string | undefined)[],
): PaymentMethod | null {
  for (const id of preferredIds) {
    const match = id ? methods.find((method) => method.id === id) : undefined;
    if (match) {
      return match;
    }
  }
  return methods[0] ?? null;
}

export function mergePaymentMethodsById(
  lists: PaymentMethod[][],
): PaymentMethod[] {
  if (lists.length === 1) {
    return lists[0];
  }

  const byId = new Map<string, PaymentMethod>();

  for (const list of lists) {
    for (const method of list) {
      if (!byId.has(method.id)) {
        byId.set(method.id, { ...method });
      }
    }
  }

  return [...byId.values()];
}
