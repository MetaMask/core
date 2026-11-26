import {
  LIGHTER_METAMASK_TAG_PREFIX,
  LIGHTER_ORDER_TYPE_STOP_LOSS,
  LIGHTER_ORDER_TYPE_STOP_LOSS_LIMIT,
  LIGHTER_ORDER_TYPE_TAKE_PROFIT,
  LIGHTER_ORDER_TYPE_TAKE_PROFIT_LIMIT,
} from '../constants/lighterConfig.js';

export type LighterClientOrderKind = 'stopLoss' | 'takeProfit' | 'other';

/**
 * Classify a Lighter wire order type for client order index tagging.
 *
 * @param wireOrderType - Lighter wire order type.
 * @returns The tag kind for the order.
 */
export const getLighterClientOrderKind = (
  wireOrderType: number,
): LighterClientOrderKind => {
  switch (wireOrderType) {
    case LIGHTER_ORDER_TYPE_STOP_LOSS:
    case LIGHTER_ORDER_TYPE_STOP_LOSS_LIMIT:
      return 'stopLoss';
    case LIGHTER_ORDER_TYPE_TAKE_PROFIT:
    case LIGHTER_ORDER_TYPE_TAKE_PROFIT_LIMIT:
      return 'takeProfit';
    default:
      return 'other';
  }
};

/**
 * Map a uniform uint48 draw to a client order index.
 *
 * Stop loss and take profit indexes carry the MetaMask tag: bits 47..32 are
 * {@link LIGHTER_METAMASK_TAG_PREFIX}, bit 31 is 0 for stop loss and 1 for
 * take profit, and bits 30..0 come from the draw. Every other index is the draw
 * itself, unless it carries the prefix, so MetaMask never creates a false tag.
 * Arithmetic, not bitwise operators: JavaScript bitwise operators are 32-bit.
 *
 * @param kind - Tag kind of the order.
 * @param draw - Uniform random integer in [0, 2^48).
 * @returns The client order index, or null when the draw must be redrawn.
 */
export const toLighterClientOrderIndex = (
  kind: LighterClientOrderKind,
  draw: number,
): number | null => {
  if (kind === 'other') {
    return Math.floor(draw / 2 ** 32) === LIGHTER_METAMASK_TAG_PREFIX
      ? null
      : draw;
  }
  return (
    LIGHTER_METAMASK_TAG_PREFIX * 2 ** 32 +
    (kind === 'takeProfit' ? 2 ** 31 : 0) +
    (draw % 2 ** 31)
  );
};
