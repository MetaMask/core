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
