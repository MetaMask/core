import type { PaymentMethod } from './RampsService.js';

/**
 * Compares two delay intervals and returns whether `candidate` is strictly
 * more conservative (worse / longer) than `current`.
 *
 * Conservativeness prefers a higher upper bound, then a higher lower bound.
 * Missing or empty delay is treated as the least conservative (instant).
 *
 * @param candidate - Delay to compare.
 * @param current - Delay already chosen.
 * @returns Whether `candidate` should replace `current`.
 */
export function isMoreConservativeDelay(
  candidate: number[] | undefined,
  current: number[] | undefined,
): boolean {
  const [candidateMax, candidateMin] = delayBounds(candidate);
  const [currentMax, currentMin] = delayBounds(current);
  if (candidateMax !== currentMax) {
    return candidateMax > currentMax;
  }
  return candidateMin > currentMin;
}

/**
 * Merges payment-method lists from multiple providers into one list keyed by
 * canonical payment method `id`.
 *
 * Collision rules (deterministic):
 * - **delay:** keep the more conservative (longer) delay.
 * - **score:** keep the best (highest) score.
 * - **name / icon:** prefer the first non-empty name; when both names are
 *   present and differ, prefer the lexicographically smaller name and the
 *   icon from that same winning entry; when names are equal, keep first-seen
 *   name and fill a missing icon from the later entry.
 * - Other optional fields: keep first-seen non-empty / defined values.
 *
 * Encounter order of first-seen ids is preserved (provider fan-out order).
 *
 * @param lists - Payment method arrays in provider contribution order.
 * @returns Deduped payment methods.
 */
export function mergePaymentMethodsById(
  lists: PaymentMethod[][],
): PaymentMethod[] {
  const byId = new Map<string, PaymentMethod>();
  const order: string[] = [];

  for (const list of lists) {
    for (const method of list) {
      const existing = byId.get(method.id);
      if (!existing) {
        byId.set(method.id, { ...method });
        order.push(method.id);
        continue;
      }
      byId.set(method.id, mergePaymentMethodCollision(existing, method));
    }
  }

  return order.map((id) => byId.get(id) as PaymentMethod);
}

/**
 * Merges two payment methods that share the same canonical id.
 *
 * @param current - First-seen method (or prior merge result).
 * @param incoming - Later colliding method.
 * @returns Merged payment method.
 */
function mergePaymentMethodCollision(
  current: PaymentMethod,
  incoming: PaymentMethod,
): PaymentMethod {
  const delay = isMoreConservativeDelay(incoming.delay, current.delay)
    ? incoming.delay
    : current.delay;
  const score = Math.max(current.score, incoming.score);

  let { name, icon } = current;
  if (!name && incoming.name) {
    name = incoming.name;
    icon = incoming.icon || icon;
  } else if (name && incoming.name && incoming.name !== name) {
    if (incoming.name < name) {
      name = incoming.name;
      icon = incoming.icon;
    }
  } else if (!icon && incoming.icon) {
    icon = incoming.icon;
  }

  return {
    ...current,
    name,
    icon,
    score,
    ...(delay !== undefined ? { delay } : {}),
    disclaimer: current.disclaimer ?? incoming.disclaimer,
    pendingOrderDescription:
      current.pendingOrderDescription ?? incoming.pendingOrderDescription,
    isManualBankTransfer:
      current.isManualBankTransfer ?? incoming.isManualBankTransfer,
  };
}

/**
 * Normalizes a delay array into `[max, min]` bounds for comparison.
 *
 * @param delay - Optional delay interval in minutes.
 * @returns Upper then lower bound; `[0, 0]` when absent.
 */
function delayBounds(delay: number[] | undefined): [number, number] {
  if (!delay || delay.length === 0) {
    return [0, 0];
  }
  const min = delay[0] ?? 0;
  const max = delay[1] ?? min;
  return [max, min];
}
