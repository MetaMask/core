import {
  LighterChaseService,
  toLighterChaseOrder,
} from '../../../src/services/LighterChaseService.js';
import type {
  LighterChaseIntent,
  LighterChaseIo,
  LighterChaseRecord,
} from '../../../src/services/LighterChaseService.js';
import type { LighterChaseChildObservation } from '../../../src/utils/lighterChase.js';

// Vary policy in this isolated module to prove conversion units are independent.
jest.mock('../../../src/constants/lighterConfig', () => ({
  ...jest.requireActual<
    typeof import('../../../src/constants/lighterConfig.js')
  >('../../../src/constants/lighterConfig'),
  LIGHTER_CHASE_MAX_DISTANCE_BPS: 5000,
}));

type UnitFixture = {
  intent: LighterChaseIntent;
  io: LighterChaseIo;
  service: LighterChaseService;
  setQuote: (value: string) => void;
  advance: () => void;
};
function fixture(isBuy: boolean): UnitFixture {
  const intent: LighterChaseIntent = {
    owner: {
      wallet: '0xabc',
      network: 'testnet',
      accountIndex: 28,
      apiKeyIndex: 7,
    },
    handle: 'lighter-chase:123',
    symbol: 'BTC',
    marketId: 1,
    isBuy,
    reduceOnly: false,
    originalSize: '0.019',
    arrivalPrice: '1000',
    sizeDecimals: 3,
    priceDecimals: 1,
    startedAt: 100000,
    intervalMs: 1000,
    maxDurationMs: 10000,
    maxRepricings: 3,
    maxDistanceBps: 10,
    maxNotional: '20',
    minBaseAmount: '0.001',
    minQuoteAmount: '1',
  };
  const disk = new Map<string, string>();
  const observed = new Map<string, LighterChaseChildObservation>();
  let now = intent.startedAt;
  let quote = intent.arrivalPrice;
  let id = 123;
  const readObservation = (clientId: string): LighterChaseChildObservation => {
    const row = observed.get(clientId);
    if (!row) {
      throw new Error('Missing owned child observation');
    }
    return { ...row };
  };
  const io: LighterChaseIo = {
    assertCurrent: () => undefined,
    now: () => now,
    allocateClientId: () => {
      id += 1;
      return String(id);
    },
    quote: async () => quote,
    place: jest.fn(async (child, hooks) => {
      await hooks.signed({
        nonce: id,
        txHash: 'aabbccdd',
        expiresAt: now + 10000,
      });
      await hooks.beforeDispatch();
      observed.set(child.clientOrderId, {
        orderId: `9${child.clientOrderId}`,
        terminal: false,
        filledSize: '0',
        filledNotional: '0',
        remainingSize: child.size,
      });
    }),
    cancel: jest.fn(async (child, hooks) => {
      id += 1;
      await hooks.signed({
        nonce: id,
        txHash: 'eeffccdd',
        expiresAt: now + 10000,
      });
      await hooks.beforeDispatch();
      observed.set(child.clientOrderId, {
        ...readObservation(child.clientOrderId),
        terminal: true,
      });
    }),
    observe: async (child) => readObservation(child.clientOrderId),
  };
  const service = new LighterChaseService({
    storage: {
      getItem: async (key): Promise<string | null> => disk.get(key) ?? null,
      setItem: async (key, value): Promise<void> => {
        disk.set(key, value);
      },
    },
  });
  return {
    intent,
    io,
    service,
    setQuote: (value: string): void => {
      quote = value;
    },
    advance: (): void => {
      now += 1000;
    },
  };
}

describe('Lighter Chase basis-point units with a different policy ceiling', () => {
  it.each([true, false])(
    'projects an adverse 0.2 percent move as 20 bps for buy=%s',
    (isBuy) => {
      const env = fixture(isBuy);
      const record: LighterChaseRecord = {
        intent: env.intent,
        status: 'active',
        repricings: 0,
        lastTickAt: env.intent.startedAt,
        executedSize: '0',
        executedNotional: '0',
        children: [
          {
            clientOrderId: '123',
            size: env.intent.originalSize,
            price: isBuy ? '1002' : '998',
            quotedAt: env.intent.startedAt,
            placement: { phase: 'prepared' },
            cancellations: [],
          },
        ],
      };

      const result = toLighterChaseOrder(record);

      expect(result.distanceChasedBps).toBe(20);
    },
  );
  it.each([true, false])(
    'rejects a 20 bps initial quote beyond a 10 bps distance for buy=%s',
    async (isBuy) => {
      const env = fixture(isBuy);
      env.setQuote(isBuy ? '1002' : '998');

      const record = await env.service.start(env.intent, env.io);

      expect(record.status).toBe('failed');
      expect(record.error).toContain('maximum distance');
      expect(env.io.place).not.toHaveBeenCalled();
    },
  );
  it.each([true, false])(
    'terminates before replacement at 20 bps with a 10 bps distance for buy=%s',
    async (isBuy) => {
      const env = fixture(isBuy);
      await env.service.start(env.intent, env.io);
      env.setQuote(isBuy ? '1002' : '998');
      env.advance();

      const record = await env.service.tick(
        env.intent.owner,
        env.intent.handle,
        env.io,
      );

      expect(record).toMatchObject({
        status: 'canceled',
        stopReason: 'max_distance_reached',
      });
      expect(env.io.place).toHaveBeenCalledTimes(1);
      expect(env.io.cancel).toHaveBeenCalledTimes(1);
    },
  );
});
