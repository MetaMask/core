import { describe, expect, it } from 'vitest';

import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import type { OrderType } from '../../../src/types/perps-types.js';
import {
  getPerpsErrorCopy,
  PERPS_ERROR_COPY,
  PERPS_ORDER_TYPE_LABELS,
} from '../../../src/utils/perpsClientCopy.js';

const ORDER_TYPES: OrderType[] = [
  'market',
  'limit',
  'stop_market',
  'stop_limit',
  'take_profit_market',
  'take_profit_limit',
  'twap',
  'scale',
  'chase',
];

describe('PERPS_ERROR_COPY', () => {
  it('covers every error code and nothing else', () => {
    expect(Object.keys(PERPS_ERROR_COPY).sort()).toStrictEqual(
      Object.values(PERPS_ERROR_CODES).sort(),
    );
  });

  it.each(Object.values(PERPS_ERROR_CODES))(
    'gives %s a perps key and a non-empty English default',
    (code) => {
      expect(PERPS_ERROR_COPY[code].key).toMatch(/^perps\./u);
      expect(PERPS_ERROR_COPY[code].defaultMessage.trim()).not.toBe('');
    },
  );

  it.each([
    {
      code: PERPS_ERROR_CODES.ORDER_CHASE_ABANDONED,
      key: 'perps.errors.orderValidation.chaseStoppedCheckOpenOrders',
      defaultMessage:
        'The chase stopped. Check open orders for any remaining orders.',
    },
    {
      code: PERPS_ERROR_CODES.TPSL_PROTECTION_LOST,
      key: 'perps.errors.tpslProtectionLost',
      defaultMessage:
        "We could not confirm the previous protection was restored. Check the position's take profit and stop loss.",
    },
    {
      code: PERPS_ERROR_CODES.ORDER_POST_ONLY_WOULD_CROSS,
      key: 'perps.errors.postOnlyWouldCross',
      defaultMessage:
        'This post-only order would execute immediately. Check the order status before trying a different price.',
    },
    {
      code: PERPS_ERROR_CODES.ORDER_POST_ONLY_WINDOW,
      key: 'perps.errors.postOnlyWindow',
      defaultMessage: 'Only post-only orders are available right now.',
    },
  ])(
    'preserves the user-facing copy contract for $code',
    ({ code, key, defaultMessage }) => {
      expect(getPerpsErrorCopy(code)).toStrictEqual({ key, defaultMessage });
    },
  );

  it('cannot be changed by a consumer', () => {
    expect(Object.isFrozen(PERPS_ERROR_COPY)).toBe(true);
    expect(Object.values(PERPS_ERROR_COPY).every(Object.isFrozen)).toBe(true);
    expect(
      Reflect.set(
        getPerpsErrorCopy(PERPS_ERROR_CODES.ORDER_SIZE_MIN),
        'defaultMessage',
        'Changed',
      ),
    ).toBe(false);
  });
});

describe('getPerpsErrorCopy', () => {
  it('returns the copy for a known code', () => {
    expect(getPerpsErrorCopy(PERPS_ERROR_CODES.ORDER_SIZE_MIN)).toStrictEqual({
      key: 'perps.order.validation.minimum_amount',
      // eslint-disable-next-line no-template-curly-in-string
      defaultMessage: 'Minimum order size is ${{amount}}',
    });
  });

  it.each(['NOT_A_CODE', 'Order rejected by venue', undefined, 42])(
    'falls back to the unknown-error copy for %j',
    (input) => {
      expect(getPerpsErrorCopy(input)).toBe(
        PERPS_ERROR_COPY[PERPS_ERROR_CODES.UNKNOWN_ERROR],
      );
    },
  );
});

describe('PERPS_ORDER_TYPE_LABELS', () => {
  it('keeps each label immutable at runtime', () => {
    expect(Object.isFrozen(PERPS_ORDER_TYPE_LABELS)).toBe(true);
    expect(Object.values(PERPS_ORDER_TYPE_LABELS).every(Object.isFrozen)).toBe(
      true,
    );
  });

  it('labels every order type and nothing else', () => {
    expect(Object.keys(PERPS_ORDER_TYPE_LABELS).sort()).toStrictEqual(
      [...ORDER_TYPES].sort(),
    );
  });

  it.each(ORDER_TYPES)('uses the order-type title key for %s', (type) => {
    expect(PERPS_ORDER_TYPE_LABELS[type].key).toBe(
      `perps.order.type.${type}.title`,
    );
    expect(PERPS_ORDER_TYPE_LABELS[type].defaultLabel.trim()).not.toBe('');
  });
});
