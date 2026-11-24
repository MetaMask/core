import { describe, expect, it, vi } from 'vitest';

import type { OrderParams } from '../../../src/types/index.js';
import {
  BTC_MARKET,
  buildProvider,
  finishPendingTimersAfterEach,
} from '../../helpers/lighterProvider.js';

vi.mock(
  import('../../../src/services/LighterClientService'),
  async (importOriginal) => ({
    ...(await importOriginal()),
    // Only the service class is doubled; convertKeysToCamelCase stays real so
    // the WebSocket message router operates on faithfully camelized payloads.
    LighterClientService: vi.fn(),
  }),
);
vi.mock('../../../src/services/LighterWalletService');

describe('integrated advanced perpetual market boundary', () => {
  finishPendingTimersAfterEach();

  it.each(['validate', 'place'] as const)(
    'refuses post-only active spot before account or signer setup during %s',
    async (operation) => {
      const built = buildProvider();
      built.clientInstance.getOrderBooks.mockResolvedValue([
        { ...BTC_MARKET, marketType: 'spot' },
      ]);
      const intent: OrderParams = {
        symbol: 'BTC',
        isBuy: true,
        orderType: 'limit',
        timeInForce: 'ALO',
        size: '0.001',
        price: '100000',
      };
      const result =
        operation === 'validate'
          ? await built.provider.validateOrder(intent)
          : await built.provider.placeOrder(intent);
      expect(result.error).toContain('active perpetual market');
      expect(built.clientInstance.getAccountByIndex).not.toHaveBeenCalled();
      expect(built.calls).toHaveLength(0);
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
    },
  );
  it.each(['twap', 'chase'] as const)(
    'refuses %s probe on active spot before account or signer setup',
    async (orderType) => {
      const built = buildProvider({
        nativeTwapTestnetProbe: true,
        chaseTestnetProbe: true,
      });
      built.clientInstance.getOrderBooks.mockResolvedValue([
        { ...BTC_MARKET, marketType: 'spot' },
      ]);
      const result = await built.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        orderType,
        size: '0.0002',
        leverage: 1,
        ...(orderType === 'twap'
          ? { twapDuration: 1 }
          : {
              chaseIntervalMs: 1000,
              chaseMaxDurationMs: 60000,
              chaseMaxRepricings: 1,
              chaseMaxDistanceBps: 100,
            }),
      });
      expect(result.error).toContain('active perpetual market');
      expect(built.clientInstance.getAccountByIndex).not.toHaveBeenCalled();
      expect(built.calls).toHaveLength(0);
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
    },
  );
});
