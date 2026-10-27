import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  LIGHTER_TRANSACTION_STATUS,
  LIGHTER_TX_EXPIRY_SLACK_MS,
  LIGHTER_TX_TYPE_CANCEL_ORDER,
} from '../../../src/constants/lighterConfig.js';
import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import { LighterChaseService } from '../../../src/services/LighterChaseService.js';
import { LighterClientService } from '../../../src/services/LighterClientService.js';
import { TradingService } from '../../../src/services/TradingService.js';
import { PerpsAnalyticsEvent } from '../../../src/types/index.js';
import type { OrderParams } from '../../../src/types/index.js';
import type {
  LighterApiOrder,
  LighterEditableOrder,
  LighterSignerOperation,
  LighterSignerResult,
  LighterWasmCall,
} from '../../../src/types/lighter-types.js';
import { parseLighterScaleGroups } from '../../../src/utils/lighterScaleOrders.js';
import {
  ACCOUNT,
  BTC_MARKET,
  buildProvider,
  finishPendingTimersAfterEach,
  getLoggerErrorMock,
} from '../../helpers/lighterProvider.js';
import type { BuiltProvider } from '../../helpers/lighterProvider.js';
import {
  createDeferred,
  createMockInfrastructure,
  createMockServiceContext,
} from '../../helpers/serviceMocks.js';

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

describe('LighterProvider', () => {
  finishPendingTimersAfterEach();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('native ordinary resting-limit edit', () => {
    const target = (): LighterEditableOrder => ({
      orderIndex: '288230376151711745',
      orderId: '288230376151711745',
      clientOrderIndex: 1,
      marketIndex: 1,
      ownerAccountIndex: 28,
      initialBaseAmount: '0.001',
      remainingBaseAmount: '0.001',
      filledBaseAmount: '0',
      price: '90000',
      isAsk: false,
      type: 'limit',
      timeInForce: 'good-till-time',
      reduceOnly: 0,
      status: 'open',
      orderExpiry: 0,
      timestamp: 1700000000,
    });
    const edit = {
      orderId: '288230376151711745',
      newOrder: {
        symbol: 'BTC',
        orderType: 'limit' as const,
        isBuy: true,
        size: '0.001',
        price: '91000',
      },
    };
    const executed = {
      code: 200,
      hash: 'dddd000000000001',
      accountIndex: 28,
      apiKeyIndex: 7,
      nonce: 42,
      status: 2,
    };
    const journalKey = `lighterNativeEdit:${JSON.stringify(['testnet', ACCOUNT.l1Address.toLowerCase(), 28, edit.orderId])}`;

    describe('bounded native edit settlement polling', () => {
      beforeEach(() => vi.useFakeTimers());
      afterEach(() => vi.useRealTimers());

      function setup(): BuiltProvider & {
        deps: ReturnType<typeof createMockInfrastructure>;
        setRow: (next: LighterEditableOrder) => void;
      } {
        const deps = createMockInfrastructure();
        const built = buildProvider({
          registeredKey: '9c'.repeat(40),
          platformDependencies: deps,
        });
        let row = target();
        built.clientInstance.getEditableOrders.mockImplementation(async () => ({
          code: 200,
          orders: [row],
        }));
        built.clientInstance.sendTx.mockImplementation(async () => {
          row = { ...row, price: '91000' };
          return { code: 200 };
        });
        return {
          ...built,
          deps,
          setRow: (next: LighterEditableOrder): void => {
            row = next;
          },
        };
      }

      it('waits for pending then executed and returns settled after one signed send', async () => {
        const built = setup();
        built.clientInstance.getTx
          .mockResolvedValueOnce({ ...executed, status: 1 })
          .mockResolvedValue(executed);

        const pending = built.provider.editOrder(edit);
        await vi.advanceTimersByTimeAsync(3000);
        const result = await pending;

        expect(result).toMatchObject({
          success: true,
          orderId: edit.orderId,
          orderEdit: { status: 'settled', observation: { price: '91000' } },
        });
        expect(built.clientInstance.getTx).toHaveBeenCalledTimes(2);
        expect(built.clientInstance.getTx).toHaveBeenNthCalledWith(
          1,
          executed.hash,
        );
        expect(built.clientInstance.getTx).toHaveBeenNthCalledWith(
          2,
          executed.hash,
        );
        expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(1);
        expect(
          built.calls.filter((call) => call.function === '_signModifyOrder'),
        ).toHaveLength(1);
      });

      it('waits for exact order visibility after the transaction executes', async () => {
        const built = setup();
        built.clientInstance.getTx
          .mockImplementationOnce(async () => {
            built.setRow(target());
            return executed;
          })
          .mockImplementation(async () => {
            built.setRow({ ...target(), price: '91000' });
            return executed;
          });

        const pending = built.provider.editOrder(edit);
        await vi.advanceTimersByTimeAsync(3000);

        expect(await pending).toMatchObject({
          success: true,
          orderEdit: { status: 'settled' },
        });
        expect(built.clientInstance.getTx).toHaveBeenCalledTimes(2);
        expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(1);
      });

      it.each(['pending', 'missing', 'lookup-error'] as const)(
        'bounds %s settlement and keeps later reconciliation read-only',
        async (mode) => {
          const built = setup();
          built.clientInstance.getTx.mockImplementation(async () => {
            if (mode === 'lookup-error') {
              throw new Error('lookup unavailable');
            }
            return mode === 'missing' ? null : { ...executed, status: 1 };
          });

          const pending = built.provider.editOrder(edit);
          await vi.advanceTimersByTimeAsync(3000);

          expect(await pending).toMatchObject({
            success: false,
            orderEdit: { status: 'pending' },
          });
          expect(built.clientInstance.getTx).toHaveBeenCalledTimes(10);
          expect(
            JSON.parse((await built.deps.diskCache.getItem(journalKey)) ?? ''),
          ).toMatchObject({
            phase: 'accepted',
            status: 'pending',
            txHash: executed.hash,
            nonce: 42,
          });
          expect(await built.provider.editOrder(edit)).toMatchObject({
            success: false,
            orderEdit: { status: 'pending' },
          });
          expect(built.clientInstance.getTx).toHaveBeenCalledTimes(11);
          expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(1);
          expect(
            built.calls.filter((call) => call.function === '_signModifyOrder'),
          ).toHaveLength(1);
        },
      );

      it('stops at an exact failed transaction instead of polling through a later success', async () => {
        const built = setup();
        built.clientInstance.getTx
          .mockResolvedValueOnce({ ...executed, status: 1 })
          .mockResolvedValueOnce({ ...executed, status: 0 })
          .mockResolvedValue(executed);

        const pending = built.provider.editOrder(edit);
        await vi.advanceTimersByTimeAsync(3000);

        expect(await pending).toMatchObject({
          success: false,
          orderEdit: { status: 'failed' },
        });
        expect(built.clientInstance.getTx).toHaveBeenCalledTimes(2);
        expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(1);
      });

      it.each([
        { hash: 'foreign' },
        { accountIndex: 29 },
        { apiKeyIndex: 8 },
        { nonce: 43 },
      ])(
        'refuses foreign transaction identity after waiting: %j',
        async (changed) => {
          const built = setup();
          built.clientInstance.getTx
            .mockResolvedValueOnce({ ...executed, status: 1 })
            .mockResolvedValue({ ...executed, ...changed });

          const pending = built.provider.editOrder(edit);
          await vi.advanceTimersByTimeAsync(3000);

          expect(await pending).toMatchObject({
            success: false,
            orderEdit: { status: 'pending' },
          });
          expect(built.clientInstance.getTx).toHaveBeenCalledTimes(2);
          expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(1);
        },
      );

      it('refuses a foreign order observation after exact transaction execution', async () => {
        const built = setup();
        built.clientInstance.getTx
          .mockResolvedValueOnce({ ...executed, status: 1 })
          .mockImplementation(async () => {
            built.setRow({
              ...target(),
              ownerAccountIndex: 99,
              price: '91000',
            });
            return executed;
          });

        const pending = built.provider.editOrder(edit);
        await vi.advanceTimersByTimeAsync(3000);

        expect(await pending).toMatchObject({
          success: false,
          orderEdit: { status: 'pending' },
        });
        expect(built.clientInstance.getTx).toHaveBeenCalledTimes(2);
        expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(1);
      });

      it.each(['account', 'network-disconnect'] as const)(
        'retires %s changes during the wait before another read or journal mutation',
        async (change) => {
          const built = setup();
          built.clientInstance.getTx.mockResolvedValue({
            ...executed,
            status: 1,
          });
          let completed = false;
          const pending = built.provider.editOrder(edit).then((result) => {
            completed = true;
            return result;
          });
          await vi.advanceTimersByTimeAsync(0);
          expect(completed).toBe(false);
          expect(built.clientInstance.getTx).toHaveBeenCalledTimes(1);
          const retained = await built.deps.diskCache.getItem(journalKey);

          if (change === 'account') {
            built.getUserAddressMock.mockReturnValue(`0x${'11'.repeat(20)}`);
          } else {
            await built.provider.disconnect();
          }
          await vi.advanceTimersByTimeAsync(3000);

          expect(await pending).toMatchObject({
            success: false,
            orderEdit: { status: 'pending' },
          });
          expect(built.clientInstance.getTx).toHaveBeenCalledTimes(1);
          expect(await built.deps.diskCache.getItem(journalKey)).toBe(retained);
          expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('keeps an uncertain native edit fenced from margin writes after key migration', async () => {
      const deps = createMockInfrastructure();
      const first = buildProvider({
        registeredKey: '9c'.repeat(40),
        platformDependencies: deps,
      });
      first.clientInstance.getEditableOrders.mockResolvedValue({
        code: 200,
        orders: [target()],
      });
      first.clientInstance.getTx.mockResolvedValue({
        ...executed,
        apiKeyIndex: 7,
        status: 1,
      });
      first.clientInstance.sendTx.mockRejectedValue(
        new Error('edit response lost'),
      );
      expect(await first.provider.editOrder(edit)).toMatchObject({
        success: false,
        orderEdit: { status: 'pending' },
      });
      expect(first.clientInstance.sendTx).toHaveBeenCalledTimes(1);
      const originalJournal = await deps.diskCache.getItem(journalKey);
      await first.provider.disconnect();

      const migrated = buildProvider({
        apiKeyIndex: 19,
        registeredKey: '9c'.repeat(40),
        platformDependencies: deps,
      });
      Object.assign(migrated.bridge, {
        getRecoverableKeyIndices: async (): Promise<number[]> => [19, 7],
      });
      migrated.clientInstance.getApiKeys.mockResolvedValue({
        code: 200,
        apiKeys: [
          { apiKeyIndex: 7, publicKey: 'ab'.repeat(40) },
          { apiKeyIndex: 19, publicKey: '9c'.repeat(40) },
        ],
      });
      migrated.clientInstance.getTx.mockResolvedValue({
        ...executed,
        apiKeyIndex: 7,
        status: 1,
      });
      migrated.clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [
          {
            ...ACCOUNT,
            positions: [
              {
                ...ACCOUNT.positions[0],
                marginMode: 1,
                allocatedMargin: '2000',
              },
            ],
          },
        ],
      });

      const result = await migrated.provider.updateMargin({
        symbol: 'BTC',
        amount: '10',
      });

      expect(result.success).toBe(false);
      expect(migrated.clientInstance.sendTx).not.toHaveBeenCalled();
      expect(
        migrated.calls.some((call) => call.function === '_signUpdateMargin'),
      ).toBe(false);
      expect(await deps.diskCache.getItem(journalKey)).toBe(originalJournal);
      expect(originalJournal).not.toBeNull();
      await migrated.provider.disconnect();
    });

    it('retains exact execution proof across later lookup loss and settles fresh same-order fields', async () => {
      const deps = createMockInfrastructure();
      const first = buildProvider({
        registeredKey: '9c'.repeat(40),
        platformDependencies: deps,
      });
      first.clientInstance.getEditableOrders.mockResolvedValue({
        code: 200,
        orders: [target()],
      });
      first.clientInstance.getTx.mockResolvedValue(executed);
      expect(await first.provider.editOrder(edit)).toMatchObject({
        success: false,
        orderEdit: { status: 'pending' },
      });
      const restarted = buildProvider({
        registeredKey: '9c'.repeat(40),
        platformDependencies: deps,
      });
      restarted.clientInstance.getEditableOrders.mockResolvedValue({
        code: 200,
        orders: [{ ...target(), price: '91000' }],
      });
      restarted.clientInstance.getTx.mockRejectedValue(
        new Error('lookup temporarily offline'),
      );
      expect(await restarted.provider.editOrder(edit)).toMatchObject({
        success: true,
        orderEdit: { status: 'settled' },
      });
      expect(restarted.clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it('releases an expired exact absent timeout only after rereading its target', async () => {
      const deps = createMockInfrastructure();
      const built = buildProvider({
        registeredKey: '9c'.repeat(40),
        platformDependencies: deps,
      });
      built.clientInstance.getEditableOrders.mockResolvedValue({
        code: 200,
        orders: [target()],
      });
      built.clientInstance.sendTx.mockRejectedValue(new Error('timeout'));
      await built.provider.editOrder(edit);
      const stored = JSON.parse(
        (await deps.diskCache.getItem(journalKey)) ?? '',
      ) as { expiresAt: number };
      const clock = vi
        .spyOn(Date, 'now')
        .mockReturnValue(stored.expiresAt + 31_000);
      try {
        built.clientInstance.getEditableOrders.mockResolvedValue({
          code: 200,
          orders: [],
        });
        expect(await built.provider.editOrder(edit)).toMatchObject({
          success: false,
          orderEdit: { status: 'pending' },
        });
        built.clientInstance.getEditableOrders.mockResolvedValue({
          code: 200,
          orders: [target()],
        });
        expect(await built.provider.editOrder(edit)).toMatchObject({
          success: false,
          orderEdit: { status: 'failed' },
        });
        expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(1);
        await built.provider.editOrder(edit);
        expect(
          built.calls
            .filter((call) => call.function === '_signModifyOrder')
            .map((call) => call.params[6]),
        ).toStrictEqual([42, 42]);
      } finally {
        clock.mockRestore();
      }
    });

    it('never treats acceptance as absent after its signed expiry', async () => {
      const deps = createMockInfrastructure();
      const built = buildProvider({
        registeredKey: '9c'.repeat(40),
        platformDependencies: deps,
      });
      built.clientInstance.getEditableOrders.mockResolvedValue({
        code: 200,
        orders: [target()],
      });
      await built.provider.editOrder(edit);
      const stored = JSON.parse(
        (await deps.diskCache.getItem(journalKey)) ?? '',
      ) as { expiresAt: number };
      const clock = vi
        .spyOn(Date, 'now')
        .mockReturnValue(stored.expiresAt + 31_000);
      try {
        expect(await built.provider.editOrder(edit)).toMatchObject({
          success: false,
          orderEdit: { status: 'pending' },
        });
        expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(1);
      } finally {
        clock.mockRestore();
      }
    });

    it.each(['prepared', 'signed', 'attempted'] as const)(
      'refuses dispatch when durable %s persistence fails',
      async (phase) => {
        const deps = createMockInfrastructure();
        const persist = vi
          .mocked(deps.diskCache)
          .setItem.getMockImplementation();
        vi.mocked(deps.diskCache).setItem.mockImplementation(
          async (key: string, raw: string) => {
            if (
              key === journalKey &&
              (JSON.parse(raw) as { phase: string }).phase === phase
            ) {
              throw new Error('private disk path');
            }
            await persist?.(key, raw);
          },
        );
        const built = buildProvider({
          registeredKey: '9c'.repeat(40),
          platformDependencies: deps,
        });
        built.clientInstance.getEditableOrders.mockResolvedValue({
          code: 200,
          orders: [target()],
        });
        expect(await built.provider.editOrder(edit)).toMatchObject({
          success: false,
        });
        expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
      },
    );

    it('preserves durable attempted state when saving acceptance fails', async () => {
      const deps = createMockInfrastructure();
      const persist = vi.mocked(deps.diskCache).setItem.getMockImplementation();
      vi.mocked(deps.diskCache).setItem.mockImplementation(
        async (key: string, raw: string) => {
          if (
            key === journalKey &&
            (JSON.parse(raw) as { phase: string }).phase === 'accepted'
          ) {
            throw new Error('private disk error');
          }
          await persist?.(key, raw);
        },
      );
      const first = buildProvider({
        registeredKey: '9c'.repeat(40),
        platformDependencies: deps,
      });
      first.clientInstance.getEditableOrders.mockResolvedValue({
        code: 200,
        orders: [target()],
      });
      expect(await first.provider.editOrder(edit)).toMatchObject({
        success: false,
        orderEdit: { status: 'pending' },
      });
      const stored = JSON.parse(
        (await deps.diskCache.getItem(journalKey)) ?? '',
      ) as { expiresAt: number; phase: string };
      expect(stored.phase).toBe('attempted');
      const clock = vi
        .spyOn(Date, 'now')
        .mockReturnValue(stored.expiresAt + 31_000);
      try {
        const restarted = buildProvider({
          registeredKey: '9c'.repeat(40),
          platformDependencies: deps,
        });
        restarted.clientInstance.getEditableOrders.mockResolvedValue({
          code: 200,
          orders: [target()],
        });
        expect(await restarted.provider.editOrder(edit)).toMatchObject({
          success: false,
          orderEdit: { status: 'pending' },
        });
        expect(restarted.clientInstance.sendTx).not.toHaveBeenCalled();
      } finally {
        clock.mockRestore();
      }
    });

    it('rejects corrupt durable storage before read authority or signer initialization', async () => {
      const deps = createMockInfrastructure();
      await deps.diskCache.setItem(journalKey, '{"version":1}');
      const built = buildProvider({
        registeredKey: '9c'.repeat(40),
        platformDependencies: deps,
      });
      expect(await built.provider.editOrder(edit)).toMatchObject({
        success: false,
      });
      expect(vi.mocked(built.bridge).createClient.mock.calls).toHaveLength(0);
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
      expect(await deps.diskCache.getItem(journalKey)).toBe('{"version":1}');
    });

    it('refuses retry when the original signing slot is unavailable', async () => {
      const deps = createMockInfrastructure();
      const first = buildProvider({
        registeredKey: '9c'.repeat(40),
        platformDependencies: deps,
      });
      first.clientInstance.getEditableOrders.mockResolvedValue({
        code: 200,
        orders: [target()],
      });
      await first.provider.editOrder(edit);
      const restarted = buildProvider({
        registeredKey: '9c'.repeat(40),
        platformDependencies: deps,
        apiKeyIndex: 8,
      });
      expect(await restarted.provider.editOrder(edit)).toMatchObject({
        success: false,
      });
      expect(restarted.clientInstance.sendTx).not.toHaveBeenCalled();
      expect(
        restarted.calls.some(
          (call) =>
            call.function === '_signModifyOrder' ||
            call.function === '_signChangePubKey',
        ),
      ).toBe(false);
    });

    it.each(['signing', 'submission'] as const)(
      'fences a session change during %s and retains original intent',
      async (during) => {
        const deps = createMockInfrastructure();
        const built = buildProvider({
          registeredKey: '9c'.repeat(40),
          platformDependencies: deps,
        });
        built.clientInstance.getEditableOrders.mockResolvedValue({
          code: 200,
          orders: [target()],
        });
        const execute = vi.mocked(built.bridge).execute.getMockImplementation();
        if (during === 'signing') {
          vi.mocked(built.bridge).execute.mockImplementation(async (call) => {
            const result = await execute?.(call);
            if (call.function === '_signModifyOrder') {
              built.getUserAddressMock.mockReturnValue(`0x${'11'.repeat(20)}`);
            }
            return result as never;
          });
        } else {
          built.clientInstance.sendTx.mockImplementation(async () => {
            built.getUserAddressMock.mockReturnValue(`0x${'11'.repeat(20)}`);
            return { code: 200 };
          });
        }
        expect(await built.provider.editOrder(edit)).toMatchObject({
          success: false,
        });
        expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(
          during === 'signing' ? 0 : 1,
        );
        expect(await deps.diskCache.getItem(journalKey)).not.toBeNull();
      },
    );

    it('refuses a target that fills while the signer is running and retires only its unsent nonce', async () => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      let row = target();
      built.clientInstance.getEditableOrders.mockImplementation(async () => ({
        code: 200,
        orders: [row],
      }));
      const execute = vi.mocked(built.bridge).execute.getMockImplementation();
      vi.mocked(built.bridge).execute.mockImplementation(async (call) => {
        const result = await execute?.(call);
        if (call.function === '_signModifyOrder') {
          row = {
            ...row,
            filledBaseAmount: '0.0005',
            remainingBaseAmount: '0.0005',
          };
        }
        return result as never;
      });
      expect(await built.provider.editOrder(edit)).toMatchObject({
        success: false,
        orderEdit: { status: 'failed' },
      });
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
      row = target();
      vi.mocked(built.bridge).execute.mockImplementation(
        execute ??
          (async (): Promise<never> => {
            throw new Error('missing bridge');
          }),
      );
      await built.provider.editOrder(edit);
      expect(
        built.calls
          .filter((call) => call.function === '_signModifyOrder')
          .map((call) => call.params[6]),
      ).toStrictEqual([42, 42]);
    });

    it.each(['missing', 'foreign', 'pending'] as const)(
      'suppresses retry for %s settlement evidence',
      async (caseName) => {
        const built = buildProvider({ registeredKey: '9c'.repeat(40) });
        built.clientInstance.getEditableOrders.mockResolvedValue({
          code: 200,
          orders: [target()],
        });
        await built.provider.editOrder(edit);
        if (caseName === 'missing') {
          built.clientInstance.getEditableOrders.mockResolvedValue({
            code: 200,
            orders: [],
          });
          built.clientInstance.getTx.mockResolvedValue(executed);
        }
        if (caseName === 'foreign') {
          built.clientInstance.getTx.mockResolvedValue({
            ...executed,
            accountIndex: 99,
          });
        }
        if (caseName === 'pending') {
          built.clientInstance.getTx.mockResolvedValue({
            ...executed,
            status: 3,
          });
          built.clientInstance.getEditableOrders.mockResolvedValue({
            code: 200,
            orders: [{ ...target(), price: '91000' }],
          });
        }
        expect(await built.provider.editOrder(edit)).toMatchObject({
          success: false,
        });
        expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(1);
      },
    );

    it('reports exact transaction failure and permits only a subsequent explicit refreshed retry', async () => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      built.clientInstance.getEditableOrders.mockResolvedValue({
        code: 200,
        orders: [target()],
      });
      built.clientInstance.getTx.mockResolvedValue({ ...executed, status: 0 });
      expect(await built.provider.editOrder(edit)).toMatchObject({
        success: false,
        orderEdit: { status: 'failed' },
      });
      await built.provider.editOrder(edit);
      expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(2);
      expect(
        built.calls
          .filter((call) => call.function === '_signModifyOrder')
          .map((call) => call.params[6]),
      ).toStrictEqual([42, 43]);
    });

    it.each(['managed', 'chase'] as const)(
      'refuses an explicitly recorded %s child that looks like an ordinary limit',
      async (strategy) => {
        const deps = createMockInfrastructure();
        const wallet = ACCOUNT.l1Address.toLowerCase();
        if (strategy === 'managed') {
          await deps.diskCache.setItem(
            `lighterManagedTpsl:testnet:${wallet}:28:BTC`,
            JSON.stringify({
              version: 1,
              orders: [{ clientId: '1', orderId: edit.orderId }],
            }),
          );
        } else {
          await deps.diskCache.setItem(
            `lighterChase:${JSON.stringify(['testnet', wallet, 28])}`,
            JSON.stringify({
              version: 1,
              records: [
                {
                  intent: {
                    owner: {
                      wallet,
                      network: 'testnet',
                      accountIndex: 28,
                      apiKeyIndex: 7,
                    },
                    handle: 'test-chase',
                    symbol: 'BTC',
                    marketId: 1,
                    isBuy: true,
                    reduceOnly: false,
                    originalSize: '0.0002',
                    arrivalPrice: '90000',
                    sizeDecimals: 5,
                    priceDecimals: 1,
                    startedAt: Date.now(),
                    intervalMs: 1000,
                    maxDurationMs: 10000,
                    maxRepricings: 1,
                    maxDistanceBps: 100,
                    maxNotional: '20',
                    minBaseAmount: '0.0002',
                    minQuoteAmount: '10',
                  },
                  children: [
                    {
                      clientOrderId: '1',
                      size: '0.0002',
                      price: '90000',
                      quotedAt: Date.now(),
                      placement: {
                        phase: 'attempted',
                        nonce: 1,
                        txHash: 'dddd000000000002',
                        expiresAt: Date.now() + 599000,
                      },
                      cancellations: [],
                    },
                  ],
                  status: 'active',
                  repricings: 0,
                  lastTickAt: Date.now(),
                  executedSize: '0',
                  executedNotional: '0',
                },
              ],
            }),
          );
        }
        const chase = new LighterChaseService({ storage: deps.diskCache });
        expect(
          await chase.hasRecordedChild(
            { wallet, network: 'testnet', accountIndex: 28, apiKeyIndex: 7 },
            '1',
            { assertCurrent: () => undefined },
          ),
        ).toBe(strategy === 'chase');
        const before = vi.mocked(deps.diskCache).setItem.mock.calls.length;
        const built = buildProvider({
          registeredKey: '9c'.repeat(40),
          platformDependencies: deps,
        });
        built.clientInstance.getEditableOrders.mockResolvedValue({
          code: 200,
          orders: [target()],
        });
        expect(await built.provider.editOrder(edit)).toMatchObject({
          success: false,
        });
        expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
        expect(vi.mocked(deps.diskCache).setItem.mock.calls).toHaveLength(
          before,
        );
      },
    );

    it('keeps accepted but unchanged intent pending and suppresses duplicate dispatch', async () => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      built.clientInstance.getEditableOrders.mockResolvedValue({
        code: 200,
        orders: [target()],
      });
      built.clientInstance.getTx.mockResolvedValue(executed);
      const first = await built.provider.editOrder(edit);
      expect(first).toMatchObject({
        success: false,
        orderEdit: {
          status: 'pending',
          requestedPrice: '91000',
          requestedSize: '0.001',
        },
      });
      expect(await built.provider.editOrder(edit)).toMatchObject({
        success: false,
        orderEdit: { status: 'pending' },
      });
      expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(1);
      expect(
        built.calls.filter((call) => call.function === '_signModifyOrder'),
      ).toHaveLength(1);
    });

    it('retains a timed-out dispatch across restart and settles the same order without retrying', async () => {
      const deps = createMockInfrastructure();
      const first = buildProvider({
        registeredKey: '9c'.repeat(40),
        platformDependencies: deps,
      });
      first.clientInstance.getEditableOrders.mockResolvedValue({
        code: 200,
        orders: [target()],
      });
      first.clientInstance.sendTx.mockRejectedValue(
        new Error('private transport detail'),
      );
      expect(await first.provider.editOrder(edit)).toMatchObject({
        success: false,
        orderEdit: { status: 'pending' },
      });
      const restarted = buildProvider({
        registeredKey: '9c'.repeat(40),
        platformDependencies: deps,
      });
      restarted.clientInstance.getEditableOrders.mockResolvedValue({
        code: 200,
        orders: [{ ...target(), price: '91000' }],
      });
      restarted.clientInstance.getTx.mockResolvedValue(executed);
      expect(await restarted.provider.editOrder(edit)).toMatchObject({
        success: true,
        orderEdit: { status: 'settled' },
      });
      expect(restarted.clientInstance.sendTx).not.toHaveBeenCalled();
      expect(
        restarted.calls.some((call) => call.function === '_signModifyOrder'),
      ).toBe(false);
      expect(restarted.clientInstance.getEditableOrders).toHaveBeenCalledWith(
        28,
        expect.any(String),
        ['1'],
      );
    });

    it.each([
      { ownerAccountIndex: 99 },
      { marketIndex: 2 },
      { orderIndex: '288230376151711746' },
      { type: 'stop-loss-limit', triggerPrice: '80000' },
      { parentOrderIndex: '9' },
      { remainingBaseAmount: '0.0005', filledBaseAmount: '0.0005' },
      { status: 'canceled' },
      { timeInForce: 'immediate-or-cancel' },
    ])(
      'refuses unsupported or foreign target %j before financial signing',
      async (changes) => {
        const built = buildProvider({ registeredKey: '9c'.repeat(40) });
        built.clientInstance.getEditableOrders.mockResolvedValue({
          code: 200,
          orders: [{ ...target(), ...changes }],
        });
        expect(await built.provider.editOrder(edit)).toMatchObject({
          success: false,
        });
        expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
        expect(
          built.calls.some((call) => call.function === '_signModifyOrder'),
        ).toBe(false);
      },
    );

    it.each([
      { price: '91000.01' },
      { price: '429496729.6' },
      { size: '0.001001' },
      { size: '2814749767.10656' },
      { isBuy: false },
      { triggerPrice: '80000' },
    ])('refuses unsafe mutation %j', async (changes) => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      built.clientInstance.getEditableOrders.mockResolvedValue({
        code: 200,
        orders: [target()],
      });
      expect(
        await built.provider.editOrder({
          ...edit,
          newOrder: { ...edit.newOrder, ...changes },
        }),
      ).toMatchObject({ success: false });
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it.each(['fill', 'cancel'] as const)(
      'reports the exact %s race without fabricated success',
      async (race) => {
        const built = buildProvider({ registeredKey: '9c'.repeat(40) });
        let row = target();
        built.clientInstance.getEditableOrders.mockImplementation(async () => ({
          code: 200,
          orders: [row],
        }));
        built.clientInstance.getTx.mockResolvedValue(executed);
        built.clientInstance.sendTx.mockImplementation(async () => {
          row =
            race === 'fill'
              ? {
                  ...row,
                  price: '91000',
                  remainingBaseAmount: '0.0005',
                  filledBaseAmount: '0.0005',
                }
              : { ...row, status: 'canceled', remainingBaseAmount: '0' };
          return { code: 200 };
        });
        const result = await built.provider.editOrder(edit);
        expect(result).toMatchObject({
          success: false,
          orderEdit: {
            status: race === 'fill' ? 'pending' : 'terminal',
            observation: { status: race === 'fill' ? 'open' : 'canceled' },
          },
        });
        expect(result).not.toHaveProperty('filledSize');
        expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(1);
      },
    );

    it('refuses ambiguous duplicate exact identities', async () => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      built.clientInstance.getEditableOrders.mockResolvedValue({
        code: 200,
        orders: [target(), target()],
      });
      expect(await built.provider.editOrder(edit)).toMatchObject({
        success: false,
      });
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it('never signs a rounded caller order identity', async () => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      expect(
        await built.provider.editOrder({
          ...edit,
          orderId: Number(edit.orderId),
        }),
      ).toMatchObject({ success: false });
      expect(built.clientInstance.getEditableOrders).not.toHaveBeenCalled();
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it('refuses an actual bridge response signed for a different exact order', async () => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      built.clientInstance.getEditableOrders.mockResolvedValue({
        code: 200,
        orders: [target()],
      });
      const execute = vi.mocked(built.bridge).execute.getMockImplementation();
      vi.mocked(built.bridge).execute.mockImplementation(async (call) => {
        const result = await execute?.(call);
        if (
          call.function === '_signModifyOrder' &&
          result &&
          'txInfo' in result &&
          typeof result.txInfo === 'string'
        ) {
          return {
            ...result,
            txInfo: result.txInfo.replace(edit.orderId, '288230376151711746'),
          };
        }
        return result as never;
      });
      expect(await built.provider.editOrder(edit)).toMatchObject({
        success: false,
      });
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it('keeps a previous settled intent separate from a different retry request', async () => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      let row = target();
      built.clientInstance.getEditableOrders.mockImplementation(async () => ({
        code: 200,
        orders: [row],
      }));
      built.clientInstance.getTx.mockResolvedValue(executed);
      await built.provider.editOrder(edit);
      row = { ...row, price: '91000' };
      const next = await built.provider.editOrder({
        ...edit,
        newOrder: { ...edit.newOrder, price: '92000' },
      });
      expect(next).toMatchObject({
        success: false,
        orderEdit: { status: 'settled', requestedPrice: '91000' },
      });
      expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(1);
    });

    it.each(['price', 'size'] as const)(
      'settles a native %s edit on the same exact int64 order',
      async (field) => {
        const built = buildProvider({ registeredKey: '9c'.repeat(40) });
        let row = {
          orderIndex: '288230376151711745',
          orderId: '288230376151711745',
          clientOrderIndex: 1,
          marketIndex: 1,
          ownerAccountIndex: 28,
          initialBaseAmount: '0.001',
          remainingBaseAmount: '0.001',
          filledBaseAmount: '0',
          price: '90000',
          isAsk: false,
          type: 'limit',
          timeInForce: 'good-till-time',
          reduceOnly: 0,
          status: 'open',
          orderExpiry: 0,
          timestamp: 1700000000,
        };
        Object.assign(built.clientInstance, {
          getEditableOrders: vi
            .fn()
            .mockImplementation(async () => ({ code: 200, orders: [row] })),
        });
        built.clientInstance.sendTx.mockImplementation(
          async (kind: number, txInfo: string) => {
            if (kind !== 17) {
              throw new Error('Unexpected edit transaction type');
            }
            const tx = JSON.parse(txInfo) as {
              Price: number;
              BaseAmount: number;
              Nonce: number;
            };
            row = {
              ...row,
              price: String(tx.Price / 10),
              initialBaseAmount: String(tx.BaseAmount / 100000),
              remainingBaseAmount: String(tx.BaseAmount / 100000),
            };
            built.clientInstance.getTx.mockImplementation(
              async (hash: string) => ({
                code: 200,
                hash,
                accountIndex: 28,
                apiKeyIndex: 7,
                nonce: tx.Nonce,
                status: 2,
              }),
            );
            return { code: 200, txHash: 'accepted' };
          },
        );
        const result = await built.provider.editOrder({
          orderId: row.orderId,
          newOrder: {
            symbol: 'BTC',
            orderType: 'limit',
            isBuy: true,
            size: field === 'size' ? '0.002' : '0.001',
            price: field === 'price' ? '91000' : undefined,
          },
        });
        expect(result).toMatchObject({
          success: true,
          orderId: '288230376151711745',
        });
        expect(
          built.calls.filter((call) => call.function === '_signModifyOrder'),
        ).toStrictEqual([
          {
            function: '_signModifyOrder',
            params: [
              28,
              1,
              '288230376151711745',
              field === 'size' ? 200 : 100,
              field === 'price' ? 910000 : 900000,
              0,
              42,
            ],
          },
        ]);
        expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(1);
      },
    );
  });

  describe('provider-owned Scale sizing preview', () => {
    it('refuses a native-overflow Scale child before preview readiness, setup or leverage transport', async () => {
      const built = buildProvider();
      built.clientInstance.getOrderBooks.mockResolvedValue([
        { ...BTC_MARKET, supportedSizeDecimals: 12 },
      ]);
      await expect(
        built.provider.getScalePriceLadder({
          symbol: 'BTC',
          minPrice: 99000,
          maxPrice: 100000,
          count: 2,
          sizing: { size: '600' },
        }),
      ).rejects.toThrow('Lighter Scale child exceeds native base amount');
      const request: OrderParams = {
        symbol: 'BTC',
        isBuy: true,
        orderType: 'scale',
        size: '600',
        scaleMinPrice: '99000',
        scaleMaxPrice: '100000',
        scaleNumOrders: 2,
        scaleSkew: 1,
        leverage: 2,
      };
      expect((await built.provider.validateOrder(request)).isValid).toBe(false);
      expect((await built.provider.placeOrder(request)).success).toBe(false);
      expect(built.calls).toStrictEqual([]);
      expect(built.clientInstance.getAccountByIndex).not.toHaveBeenCalled();
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
    });

    const previewIntent = {
      symbol: 'BTC',
      minPrice: 99000,
      maxPrice: 100000,
      count: 3,
    };

    it('previews exact sizes below the quote budget without account or signer setup', async () => {
      const built = buildProvider();
      const result = await built.provider.getScalePriceLadder({
        ...previewIntent,
        sizing: { usdAmount: '60' },
      });

      expect(result).toStrictEqual({
        status: 'ready',
        providerId: 'lighter',
        prices: ['99000', '99500', '100000'],
        sizingPreview: {
          sizes: ['0.0002', '0.0002', '0.0002'],
          totalSize: '0.0006',
          totalNotional: '59.7',
          minimumBaseSize: '0.00020',
          minimumQuoteAmount: '10.000000',
          sizeDecimals: 5,
        },
      });
      expect(built.calls).toStrictEqual([]);
      expect(built.clientInstance.getAccountByIndex).not.toHaveBeenCalled();
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it('rounds an explicit base intent down without increasing exposure', async () => {
      const built = buildProvider();
      const result = await built.provider.getScalePriceLadder({
        ...previewIntent,
        sizing: { size: '0.000609' },
      });

      expect(result).toMatchObject({
        sizingPreview: {
          totalSize: '0.0006',
          sizes: ['0.0002', '0.0002', '0.0002'],
          totalNotional: '59.7',
        },
      });
      expect(built.calls).toStrictEqual([]);
    });

    it('uses exact skewed sizes from the placement builder', async () => {
      const built = buildProvider();
      const result = await built.provider.getScalePriceLadder({
        symbol: 'BTC',
        minPrice: 99000,
        maxPrice: 100000,
        count: 2,
        sizing: { size: '0.0012', skew: 2 },
      });

      expect(result).toMatchObject({
        sizingPreview: {
          sizes: ['0.0004', '0.0008'],
          totalSize: '0.0012',
          totalNotional: '119.6',
        },
      });
    });

    it.each([
      ['1', PERPS_ERROR_CODES.ORDER_SCALE_SIZE_TOO_SMALL],
      ['0', PERPS_ERROR_CODES.ORDER_SIZE_POSITIVE],
      ['NaN', PERPS_ERROR_CODES.ORDER_SIZE_POSITIVE],
      ['60usd', PERPS_ERROR_CODES.ORDER_SIZE_POSITIVE],
    ])(
      'rejects a quote intent %s that cannot produce valid maker rungs',
      async (usdAmount, message) => {
        const built = buildProvider();
        await expect(
          built.provider.getScalePriceLadder({
            ...previewIntent,
            sizing: { usdAmount },
          }),
        ).rejects.toThrow(message);
        expect(built.calls).toStrictEqual([]);
        expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
      },
    );

    it.each(['0', 'NaN', '60usd'])(
      'reports a positive-size error for base intent %s',
      async (size) => {
        const built = buildProvider();

        await expect(
          built.provider.getScalePriceLadder({
            ...previewIntent,
            sizing: { size },
          }),
        ).rejects.toThrow(PERPS_ERROR_CODES.ORDER_SIZE_POSITIVE);

        expect(built.calls).toStrictEqual([]);
        expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
      },
    );

    it.each([
      { usdAmount: '60', skew: 0 },
      { size: '0.0006', skew: Number.NaN },
    ])(
      'preserves the range error for nonpositive or nonfinite skew %j',
      async (sizing) => {
        const built = buildProvider();

        await expect(
          built.provider.getScalePriceLadder({ ...previewIntent, sizing }),
        ).rejects.toThrow(PERPS_ERROR_CODES.ORDER_SCALE_RANGE_INVALID);

        expect(built.calls).toStrictEqual([]);
        expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
      },
    );

    it('reports the quote minimum when every rung satisfies the base minimum', async () => {
      const built = buildProvider();
      built.clientInstance.getOrderBooks.mockResolvedValueOnce([
        { ...BTC_MARKET, minQuoteAmount: '100' },
      ]);

      await expect(
        built.provider.getScalePriceLadder({
          ...previewIntent,
          sizing: { size: '0.0006' },
        }),
      ).rejects.toThrow(PERPS_ERROR_CODES.ORDER_SCALE_NOTIONAL_TOO_SMALL);

      expect(built.calls).toStrictEqual([]);
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it('captures the sizing intent before deferred market metadata arrives', async () => {
      const built = buildProvider();
      const metadata = createDeferred<(typeof BTC_MARKET)[]>();
      built.clientInstance.getOrderBooks.mockReturnValueOnce(metadata.promise);
      const params = { ...previewIntent, sizing: { usdAmount: '60' } };
      const result = built.provider.getScalePriceLadder(params);
      params.sizing.usdAmount = '600';
      params.symbol = 'SOL';
      params.minPrice = 1;
      params.maxPrice = 2;
      params.count = 2;
      metadata.resolve([BTC_MARKET]);

      expect(await result).toMatchObject({
        sizingPreview: { totalSize: '0.0006', totalNotional: '59.7' },
      });
    });

    it.each([{}, { size: '0.0006', usdAmount: '60' }])(
      'rejects sizing without exactly one exposure intent: %j',
      async (sizing) => {
        const built = buildProvider();
        const params = { ...previewIntent };
        Object.assign(params, { sizing });

        await expect(
          built.provider.getScalePriceLadder(params),
        ).rejects.toThrow(
          'Lighter Scale sizing requires exactly one exposure intent',
        );
        expect(built.calls).toStrictEqual([]);
        expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
      },
    );

    it('refuses a conflicting explicit provider route before loading metadata', async () => {
      const built = buildProvider();
      const result = await built.provider.getScalePriceLadder({
        ...previewIntent,
        providerId: 'hyperliquid',
        sizing: { usdAmount: '60' },
      });
      expect(result).toStrictEqual({
        status: 'unavailable',
        providerId: 'lighter',
        reason: 'provider_not_routable',
      });
      expect(built.clientInstance.getOrderBooks).not.toHaveBeenCalled();
      expect(built.calls).toStrictEqual([]);
    });

    it('retains the existing price-only contract when sizing is omitted', async () => {
      const built = buildProvider();
      expect(
        await built.provider.getScalePriceLadder(previewIntent),
      ).toStrictEqual({
        status: 'ready',
        providerId: 'lighter',
        prices: ['99000', '99500', '100000'],
      });
    });
  });

  describe('durable Scale ladder', () => {
    const intent: OrderParams = {
      symbol: 'BTC',
      isBuy: true,
      size: '0.001',
      orderType: 'scale',
      scaleMinPrice: '90000',
      scaleMaxPrice: '100000',
      scaleNumOrders: 2,
    };

    /** Install a venue that records writes and returns only real accepted rows.
     * @param built - Provider and mock boundaries.
     * @returns Mutable authoritative order rows for race tests.
     */
    function scaleVenue(built: BuiltProvider): {
      active: LighterApiOrder[];
      history: LighterApiOrder[];
    } {
      const venue: { active: LighterApiOrder[]; history: LighterApiOrder[] } = {
        active: [],
        history: [],
      };
      built.clientInstance.getActiveOrders.mockImplementation(async () => ({
        code: 200,
        orders: [...venue.active],
      }));
      built.clientInstance.getInactiveOrders.mockImplementation(async () => ({
        code: 200,
        orders: [...venue.history],
      }));
      built.clientInstance.sendTx.mockImplementation(
        async (_kind: number, txInfo: string) => {
          const wire = JSON.parse(txInfo) as {
            createOrder?: boolean;
            cancelOrder?: boolean;
            ClientOrderIndex?: number;
          };
          if (wire.createOrder) {
            const call = [...built.calls]
              .reverse()
              .find(
                (item) =>
                  item.function === '_signCreateOrder' &&
                  Number(item.params[2]) === wire.ClientOrderIndex,
              );
            if (!call) {
              throw new Error('Missing signed fixture intent');
            }
            venue.active.push({
              orderIndex: 800 + venue.active.length + venue.history.length,
              clientOrderIndex: Number(call.params[2]),
              marketIndex: 1,
              ownerAccountIndex: 28,
              initialBaseAmount: String(Number(call.params[3]) / 100000),
              remainingBaseAmount: String(Number(call.params[3]) / 100000),
              filledBaseAmount: '0',
              price: String(Number(call.params[4]) / 10),
              isAsk: Number(call.params[5]) === 1,
              type: 'limit',
              timeInForce: 'good-till-time',
              reduceOnly: Number(call.params[8]),
              status: 'open',
              orderExpiry: 0,
              timestamp: Date.now(),
            });
          }
          if (wire.cancelOrder) {
            const call = [...built.calls]
              .reverse()
              .find((item) => item.function === '_signCancelOrder');
            const index = venue.active.findIndex(
              (row) => String(row.orderIndex) === String(call?.params[2]),
            );
            if (index >= 0) {
              const [row] = venue.active.splice(index, 1);
              venue.history.push({ ...row, status: 'canceled' });
            }
          }
          return { code: 200, txHash: '0xsent' };
        },
      );
      return venue;
    }

    describe('bounded Scale settlement', () => {
      beforeEach(() => vi.useFakeTimers());
      afterEach(() => vi.useRealTimers());

      it('waits beyond the TP/SL window for exact delayed children without replay', async () => {
        const built = buildProvider({ registeredKey: '9c'.repeat(40) });
        const venue = scaleVenue(built);
        built.clientInstance.getTx.mockResolvedValue(null);
        built.clientInstance.getActiveOrders.mockImplementation(async () => ({
          code: 200,
          orders: venue.active.filter(
            (row) => Date.now() - Number(row.timestamp) >= 2000,
          ),
        }));
        const placing = built.provider.placeOrder(intent);
        await vi.advanceTimersByTimeAsync(5000);
        const result = await placing;
        expect(result).toMatchObject({
          success: true,
          childOrderIds: ['800', '801'],
          acceptedSize: '0.001',
        });
        expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(2);
        const creates = built.calls.filter(
          (call) => call.function === '_signCreateOrder',
        );
        expect(creates).toHaveLength(2);
        expect(new Set(creates.map((call) => call.params.at(-1))).size).toBe(2);
        expect(
          (await built.provider.getScaleOrderGroups())[0].acceptedChildren,
        ).toStrictEqual(
          expect.arrayContaining([
            expect.objectContaining({ orderId: '800', state: 'resting' }),
            expect.objectContaining({ orderId: '801', state: 'resting' }),
          ]),
        );
      });

      it('waits for exact delayed cancellations without duplicate signs or sends', async () => {
        const built = buildProvider({ registeredKey: '9c'.repeat(40) });
        const venue = scaleVenue(built);
        const placed = await built.provider.placeOrder(intent);
        const send = built.clientInstance.sendTx.getMockImplementation();
        let canceledAt = 0;
        let stale: LighterApiOrder | undefined;
        built.clientInstance.sendTx.mockImplementation(
          async (...args: unknown[]) => {
            stale = venue.active[0];
            canceledAt = Date.now();
            await send?.(...args);
            return { code: 200, txHash: '0xsent' };
          },
        );
        built.clientInstance.getActiveOrders.mockImplementation(async () => ({
          code: 200,
          orders:
            stale && Date.now() - canceledAt < 2000
              ? [stale, ...venue.active]
              : [...venue.active],
        }));
        built.clientInstance.getInactiveOrders.mockImplementation(async () => ({
          code: 200,
          orders: Date.now() - canceledAt < 2000 ? [] : [...venue.history],
        }));
        const canceling = built.provider.cancelOrder({
          symbol: 'BTC',
          orderId: String(placed.orderId),
          orderType: 'scale',
        });
        await vi.advanceTimersByTimeAsync(5000);
        expect(await canceling).toMatchObject({ success: true });
        expect(
          built.calls.filter((call) => call.function === '_signCancelOrder'),
        ).toHaveLength(2);
        expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(4);
        expect((await built.provider.getScaleOrderGroups())[0].state).toBe(
          'terminal',
        );
      });

      it('bounds missing placement visibility and later reconciles without replay', async () => {
        const built = buildProvider({ registeredKey: '9c'.repeat(40) });
        const venue = scaleVenue(built);
        built.clientInstance.getTx.mockResolvedValue(null);
        built.clientInstance.getActiveOrders.mockResolvedValue({
          code: 200,
          orders: [],
        });
        let finished = false;
        const placing = built.provider.placeOrder(intent).then((result) => {
          finished = true;
          return result;
        });
        await vi.advanceTimersByTimeAsync(9999);
        expect(finished).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(await placing).toMatchObject({ success: false });
        expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(1);
        built.clientInstance.getActiveOrders.mockResolvedValue({
          code: 200,
          orders: venue.active,
        });
        await built.provider.reviewScaleOrderGroups();
        expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(1);
        expect(
          built.calls.filter((call) => call.function === '_signCreateOrder'),
        ).toHaveLength(1);
      });

      it.each(['placement', 'cancellation'] as const)(
        'stops delayed %s settlement when the issuing session changes',
        async (phase) => {
          const built = buildProvider({ registeredKey: '9c'.repeat(40) });
          scaleVenue(built);
          const placed =
            phase === 'cancellation'
              ? await built.provider.placeOrder(intent)
              : undefined;
          if (placed) {
            built.clientInstance.sendTx.mockResolvedValue({
              code: 200,
              txHash: '0xsent',
            });
          } else {
            built.clientInstance.getActiveOrders.mockResolvedValue({
              code: 200,
              orders: [],
            });
            built.clientInstance.getTx.mockResolvedValue(null);
          }
          const pending = placed
            ? built.provider.cancelOrder({
                symbol: 'BTC',
                orderId: String(placed.orderId),
                orderType: 'scale',
              })
            : built.provider.placeOrder(intent);
          await vi.advanceTimersByTimeAsync(2000);
          built.fireReset();
          const reads = built.clientInstance.getActiveOrders.mock.calls.length;
          await vi.advanceTimersByTimeAsync(250);
          expect(await pending).toMatchObject({
            success: false,
            error: expect.stringMatching(/session|reset/u) as string,
          });
          expect(built.clientInstance.getActiveOrders).toHaveBeenCalledTimes(
            reads,
          );
          expect(
            built.calls.filter((call) => call.function === '_signCancelOrder'),
          ).toHaveLength(placed ? 2 : 0);
          expect(
            built.calls.filter((call) => call.function === '_signCreateOrder'),
          ).toHaveLength(placed ? 2 : 1);
        },
      );

      it.each([false, true])(
        'does not replay unresolved Scale cancellations after restart=%s',
        async (restart) => {
          const infra = createMockInfrastructure();
          const built = buildProvider({
            registeredKey: '9c'.repeat(40),
            platformDependencies: infra,
          });
          const venue = scaleVenue(built);
          const placed = await built.provider.placeOrder(intent);
          const stale = [...venue.active];
          built.clientInstance.getTx.mockResolvedValue(null);
          built.clientInstance.getActiveOrders.mockResolvedValue({
            code: 200,
            orders: stale,
          });
          built.clientInstance.getInactiveOrders.mockResolvedValue({
            code: 200,
            orders: [],
          });
          const params = {
            symbol: 'BTC',
            orderId: String(placed.orderId),
            orderType: 'scale' as const,
          };
          const first = built.provider.cancelOrder(params);
          await vi.advanceTimersByTimeAsync(10000);
          expect(await first).toMatchObject({
            success: false,
            error: 'Lighter Scale cancellation remains unresolved',
          });
          const current = restart
            ? buildProvider({
                registeredKey: '9c'.repeat(40),
                platformDependencies: infra,
              })
            : built;
          if (restart) {
            scaleVenue(current);
            current.clientInstance.getTx.mockResolvedValue(null);
            current.clientInstance.getActiveOrders.mockResolvedValue({
              code: 200,
              orders: stale,
            });
            current.clientInstance.getInactiveOrders.mockResolvedValue({
              code: 200,
              orders: [],
            });
          }
          const repeated = current.provider.cancelOrder(params);
          await vi.advanceTimersByTimeAsync(10000);
          expect(await repeated).toMatchObject({
            success: false,
            error: 'Lighter Scale cancellation remains unresolved',
          });
          const workers = restart ? [built, current] : [built];
          expect(
            workers
              .flatMap((worker) => worker.calls)
              .filter((call) => call.function === '_signCancelOrder')
              .map((call) => [call.params[2], call.params[3]]),
          ).toStrictEqual([
            ['800', 44],
            ['801', 45],
          ]);
          expect(
            workers.reduce(
              (count, worker) =>
                count + worker.clientInstance.sendTx.mock.calls.length,
              0,
            ),
          ).toBe(4);
          current.clientInstance.getActiveOrders.mockResolvedValue({
            code: 200,
            orders: venue.active,
          });
          current.clientInstance.getInactiveOrders.mockResolvedValue({
            code: 200,
            orders: venue.history,
          });
          expect(
            (await current.provider.reviewScaleOrderGroups())[0].state,
          ).toBe('terminal');
          expect(await current.provider.cancelOrder(params)).toMatchObject({
            success: true,
          });
          expect(
            workers.reduce(
              (count, worker) =>
                count + worker.clientInstance.sendTx.mock.calls.length,
              0,
            ),
          ).toBe(4);
        },
      );

      it('retains an uncertain Scale cancellation across response loss and restart', async () => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          registeredKey: '9c'.repeat(40),
          platformDependencies: infra,
        });
        const venue = scaleVenue(built);
        const placed = await built.provider.placeOrder(intent);
        const stale = [...venue.active];
        const send = built.clientInstance.sendTx.getMockImplementation();
        built.clientInstance.sendTx.mockImplementation(
          async (...args: unknown[]) => {
            await send?.(...args);
            throw new Error('lost cancellation response');
          },
        );
        const params = {
          symbol: 'BTC',
          orderId: String(placed.orderId),
          orderType: 'scale' as const,
        };
        expect(await built.provider.cancelOrder(params)).toMatchObject({
          success: false,
        });
        const key = `lighterScaleOrders:testnet:${ACCOUNT.l1Address.toLowerCase()}:28`;
        const [group] = parseLighterScaleGroups(
          await infra.diskCache.getItem(key),
        );
        expect(group.rungs[0].cancelAttempt).toMatchObject({ nonce: 44 });
        const restarted = buildProvider({
          registeredKey: '9c'.repeat(40),
          platformDependencies: infra,
        });
        scaleVenue(restarted);
        restarted.clientInstance.getActiveOrders.mockResolvedValue({
          code: 200,
          orders: stale,
        });
        restarted.clientInstance.getInactiveOrders.mockResolvedValue({
          code: 200,
          orders: [],
        });
        restarted.clientInstance.getTx.mockResolvedValue(null);
        const repeated = restarted.provider.cancelOrder(params);
        await vi.advanceTimersByTimeAsync(10000);
        expect(await repeated).toMatchObject({ success: false });
        expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(3);
        expect(restarted.clientInstance.sendTx).not.toHaveBeenCalled();
        expect(
          restarted.calls.filter((call) => call.function.startsWith('_sign')),
        ).toStrictEqual([]);
        expect(
          parseLighterScaleGroups(await infra.diskCache.getItem(key))[0]
            .rungs[0].cancelAttempt,
        ).toStrictEqual(group.rungs[0].cancelAttempt);
      });

      it('does not dispatch when Scale cancellation ownership cannot be persisted', async () => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          registeredKey: '9c'.repeat(40),
          platformDependencies: infra,
        });
        scaleVenue(built);
        const placed = await built.provider.placeOrder(intent);
        const key = `lighterScaleOrders:testnet:${ACCOUNT.l1Address.toLowerCase()}:28`;
        const writeSpy = vi.spyOn(infra.diskCache, 'setItem');
        const write = writeSpy.getMockImplementation();
        writeSpy.mockImplementation(async (cacheKey: string, value: string) => {
          if (
            cacheKey === key &&
            parseLighterScaleGroups(value).some((group) =>
              group.rungs.some((rung) => rung.cancelAttempt !== undefined),
            )
          ) {
            throw new Error('cancellation storage unavailable');
          }
          await write?.(cacheKey, value);
        });
        expect(
          await built.provider.cancelOrder({
            symbol: 'BTC',
            orderId: String(placed.orderId),
            orderType: 'scale',
          }),
        ).toMatchObject({
          success: false,
          error: 'cancellation storage unavailable',
        });
        expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(2);
        expect(
          parseLighterScaleGroups(
            await infra.diskCache.getItem(key),
          )[0].rungs.every((rung) => rung.cancelAttempt === undefined),
        ).toBe(true);
      });

      it.each([false, true])(
        'releases a never-landed expired Scale cancellation after restart=%s',
        async (restart) => {
          const infra = createMockInfrastructure();
          const built = buildProvider({
            registeredKey: '9c'.repeat(40),
            platformDependencies: infra,
          });
          const venue = scaleVenue(built);
          const placed = await built.provider.placeOrder(intent);
          const second = venue.active.pop();
          if (!second) {
            throw new Error('Missing second Scale child');
          }
          venue.history.push({ ...second, status: 'canceled' });
          const unrelated = {
            ...second,
            orderIndex: 9999,
            clientOrderIndex: second.clientOrderIndex + 1,
          };
          venue.active.push(unrelated);
          built.clientInstance.sendTx.mockRejectedValue(
            new Error('never reached venue'),
          );
          const params = {
            symbol: 'BTC',
            orderId: String(placed.orderId),
            orderType: 'scale' as const,
          };
          expect(await built.provider.cancelOrder(params)).toMatchObject({
            success: false,
          });
          const key = `lighterScaleOrders:testnet:${ACCOUNT.l1Address.toLowerCase()}:28`;
          const [pending] = parseLighterScaleGroups(
            await infra.diskCache.getItem(key),
          );
          const attempt = pending.rungs[0].cancelAttempt;
          if (!attempt) {
            throw new Error('Missing cancellation identity');
          }
          expect(attempt.acknowledged).toBe(false);
          await vi.advanceTimersByTimeAsync(
            attempt.expiresAt + LIGHTER_TX_EXPIRY_SLACK_MS - Date.now() + 1,
          );
          const current = restart
            ? buildProvider({
                registeredKey: '9c'.repeat(40),
                platformDependencies: infra,
              })
            : built;
          const currentVenue = scaleVenue(current);
          currentVenue.active.push(...venue.active);
          currentVenue.history.push(...venue.history);
          current.clientInstance.getTx.mockResolvedValue(null);
          current.clientInstance.getNextNonce.mockResolvedValue({
            code: 200,
            nonce: attempt.nonce,
          });
          await current.provider.reviewScaleOrderGroups();
          const [reviewed] = parseLighterScaleGroups(
            await infra.diskCache.getItem(key),
          );
          expect(reviewed.rungs[0].cancelAttempt).toBeUndefined();
          const signsBefore = current.calls.filter(
            (call) => call.function === '_signCancelOrder',
          ).length;
          const sendsBefore = current.clientInstance.sendTx.mock.calls.length;
          expect(await current.provider.cancelOrder(params)).toMatchObject({
            success: true,
          });
          expect(
            current.calls
              .filter((call) => call.function === '_signCancelOrder')
              .slice(signsBefore)
              .map((call) => call.params[2]),
          ).toStrictEqual(['800']);
          expect(current.clientInstance.sendTx).toHaveBeenCalledTimes(
            sendsBefore + 1,
          );
          expect(currentVenue.active).toStrictEqual([unrelated]);
          expect(
            (await current.provider.reviewScaleOrderGroups())[0].state,
          ).toBe('terminal');
          expect(current.clientInstance.sendTx).toHaveBeenCalledTimes(
            sendsBefore + 1,
          );
          const [terminal] = parseLighterScaleGroups(
            await infra.diskCache.getItem(key),
          );
          expect(terminal.rungs[0].cancelAttempt?.txHash).not.toBe(
            attempt.txHash,
          );
        },
      );

      it.each([
        'acknowledged',
        'legacy',
        'unexpired',
        'nonce-consumed',
        'malformed-nonce',
        'lookup-failure',
        'missing-order',
      ] as const)(
        'retains a Scale cancellation with %s evidence after expiry/restart',
        async (condition) => {
          const infra = createMockInfrastructure();
          const built = buildProvider({
            registeredKey: '9c'.repeat(40),
            platformDependencies: infra,
          });
          const venue = scaleVenue(built);
          const placed = await built.provider.placeOrder(intent);
          const params = {
            symbol: 'BTC',
            orderId: String(placed.orderId),
            orderType: 'scale' as const,
          };
          built.clientInstance.sendTx.mockResolvedValue({
            code: 200,
            txHash: 'accepted',
          });
          const canceling = built.provider.cancelOrder(params);
          await vi.advanceTimersByTimeAsync(10000);
          expect(await canceling).toMatchObject({ success: false });
          const key = `lighterScaleOrders:testnet:${ACCOUNT.l1Address.toLowerCase()}:28`;
          const [group] = parseLighterScaleGroups(
            await infra.diskCache.getItem(key),
          );
          const attempt = group.rungs[0].cancelAttempt;
          if (!attempt) {
            throw new Error('Missing cancellation attempt');
          }
          const raw = JSON.parse(JSON.stringify(group)) as {
            rungs: { cancelAttempt?: { acknowledged?: boolean } }[];
          };
          for (const rung of raw.rungs) {
            if (rung.cancelAttempt) {
              if (condition === 'legacy') {
                delete rung.cancelAttempt.acknowledged;
              } else {
                rung.cancelAttempt.acknowledged = condition === 'acknowledged';
              }
            }
          }
          await infra.diskCache.setItem(key, JSON.stringify([raw]));
          if (condition !== 'unexpired') {
            await vi.advanceTimersByTimeAsync(
              attempt.expiresAt + LIGHTER_TX_EXPIRY_SLACK_MS - Date.now() + 1,
            );
          }
          const restarted = buildProvider({
            registeredKey: '9c'.repeat(40),
            platformDependencies: infra,
          });
          scaleVenue(restarted);
          restarted.clientInstance.getActiveOrders.mockResolvedValue({
            code: 200,
            orders: venue.active,
          });
          restarted.clientInstance.getInactiveOrders.mockResolvedValue({
            code: 200,
            orders: [],
          });
          restarted.clientInstance.getTx.mockResolvedValue(null);
          let venueNonce = attempt.nonce;
          if (condition === 'nonce-consumed') {
            venueNonce += 2;
          }
          if (condition === 'malformed-nonce') {
            venueNonce = Number.NaN;
          }
          restarted.clientInstance.getNextNonce.mockResolvedValue({
            code: 200,
            nonce: venueNonce,
          });
          if (condition === 'lookup-failure') {
            restarted.clientInstance.getTx.mockRejectedValue(
              new Error('lookup unavailable'),
            );
          }
          if (condition === 'missing-order') {
            restarted.clientInstance.getActiveOrders.mockResolvedValue({
              code: 200,
              orders: [],
            });
          }
          const repeated = restarted.provider.cancelOrder(params);
          await vi.advanceTimersByTimeAsync(10000);
          expect(await repeated).toMatchObject({ success: false });
          expect(restarted.clientInstance.sendTx).not.toHaveBeenCalled();
          expect(
            restarted.calls.filter(
              (call) => call.function === '_signCancelOrder',
            ),
          ).toStrictEqual([]);
          expect(
            parseLighterScaleGroups(await infra.diskCache.getItem(key))[0]
              .rungs[0].cancelAttempt,
          ).toBeDefined();
        },
      );

      it.each([
        ['before-send', false, 2],
        ['accepted', true, 3],
        ['acknowledgement-storage', true, 3],
      ] as const)(
        'preserves cancellation completion evidence through %s interruption',
        async (phase, retained, sends) => {
          const infra = createMockInfrastructure();
          const built = buildProvider({
            registeredKey: '9c'.repeat(40),
            platformDependencies: infra,
          });
          const venue = scaleVenue(built);
          const placed = await built.provider.placeOrder(intent);
          const second = venue.active.pop();
          if (!second) {
            throw new Error('Missing Scale sibling');
          }
          venue.history.push({ ...second, status: 'canceled' });
          const key = `lighterScaleOrders:testnet:${ACCOUNT.l1Address.toLowerCase()}:28`;
          const spy = vi.spyOn(infra.diskCache, 'setItem');
          const write = spy.getMockImplementation();
          let switched = false;
          spy.mockImplementation(async (cacheKey: string, value: string) => {
            if (cacheKey === key) {
              const [group] = parseLighterScaleGroups(value);
              const saved = group.rungs[0].cancelAttempt;
              if (
                phase === 'acknowledgement-storage' &&
                saved?.acknowledged === true
              ) {
                throw new Error('ack storage unavailable');
              }
              await write?.(cacheKey, value);
              if (phase === 'before-send' && saved && !switched) {
                switched = true;
                built.fireReset();
              }
              return;
            }
            await write?.(cacheKey, value);
          });
          built.clientInstance.sendTx.mockImplementation(async () => {
            if (phase === 'accepted') {
              built.fireReset();
            }
            return { code: 200, txHash: 'accepted' };
          });
          expect(
            await built.provider.cancelOrder({
              symbol: 'BTC',
              orderId: String(placed.orderId),
              orderType: 'scale',
            }),
          ).toMatchObject({ success: false });
          expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(sends);
          const [group] = parseLighterScaleGroups(
            await infra.diskCache.getItem(key),
          );
          const attempt = group.rungs[0].cancelAttempt;
          if (!attempt) {
            throw new Error('Missing interrupted attempt');
          }
          await vi.advanceTimersByTimeAsync(
            attempt.expiresAt + LIGHTER_TX_EXPIRY_SLACK_MS - Date.now() + 1,
          );
          const restarted = buildProvider({
            registeredKey: '9c'.repeat(40),
            platformDependencies: infra,
          });
          const restored = scaleVenue(restarted);
          restored.active.push(...venue.active);
          restored.history.push(...venue.history);
          restarted.clientInstance.getTx.mockResolvedValue(null);
          restarted.clientInstance.getNextNonce.mockResolvedValue({
            code: 200,
            nonce: attempt.nonce,
          });
          await restarted.provider.reviewScaleOrderGroups();
          expect(
            Boolean(
              parseLighterScaleGroups(await infra.diskCache.getItem(key))[0]
                .rungs[0].cancelAttempt,
            ),
          ).toBe(retained);
          expect(restarted.clientInstance.sendTx).not.toHaveBeenCalled();
          expect(
            restarted.calls.filter(
              (call) => call.function === '_signCancelOrder',
            ),
          ).toStrictEqual([]);
        },
      );

      it.each([
        'hash',
        'accountIndex',
        'apiKeyIndex',
        'nonce',
        'executed',
        'pending',
        'pending-final',
        'unknown',
      ] as const)(
        'retains cancellation identity for mismatched/nonfailed %s',
        async (field) => {
          const infra = createMockInfrastructure();
          const built = buildProvider({
            registeredKey: '9c'.repeat(40),
            platformDependencies: infra,
          });
          scaleVenue(built);
          const placed = await built.provider.placeOrder(intent);
          built.clientInstance.sendTx.mockResolvedValue({
            code: 200,
            txHash: 'accepted',
          });
          const canceling = built.provider.cancelOrder({
            symbol: 'BTC',
            orderId: String(placed.orderId),
            orderType: 'scale',
          });
          await vi.advanceTimersByTimeAsync(10000);
          expect(await canceling).toMatchObject({ success: false });
          const key = `lighterScaleOrders:testnet:${ACCOUNT.l1Address.toLowerCase()}:28`;
          const [group] = parseLighterScaleGroups(
            await infra.diskCache.getItem(key),
          );
          const attempt = group.rungs[0].cancelAttempt;
          if (!attempt) {
            throw new Error('Missing cancellation');
          }
          const tx = {
            code: 200,
            hash: attempt.txHash,
            accountIndex: 28,
            apiKeyIndex: attempt.apiKeyIndex,
            nonce: attempt.nonce,
            status: Number(LIGHTER_TRANSACTION_STATUS.Failed),
          };
          if (field === 'hash') {
            tx.hash = 'deadbeef';
          }
          if (field === 'accountIndex') {
            tx.accountIndex += 1;
          }
          if (field === 'apiKeyIndex') {
            tx.apiKeyIndex += 1;
          }
          if (field === 'nonce') {
            tx.nonce += 1;
          }
          const statuses = {
            executed: LIGHTER_TRANSACTION_STATUS.Executed,
            pending: LIGHTER_TRANSACTION_STATUS.Pending,
            'pending-final': LIGHTER_TRANSACTION_STATUS.PendingFinal,
            unknown: 99,
          };
          if (field in statuses) {
            tx.status = statuses[field as keyof typeof statuses];
          }
          built.clientInstance.getTx.mockResolvedValue(tx);
          await built.provider.reviewScaleOrderGroups();
          expect(
            parseLighterScaleGroups(await infra.diskCache.getItem(key))[0]
              .rungs[0].cancelAttempt,
          ).toBeDefined();
          expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(4);
          expect(
            built.calls.filter((call) => call.function === '_signCancelOrder'),
          ).toHaveLength(2);
        },
      );

      it('retains an unacknowledged Scale cancellation after mismatched evidence and expired absence', async () => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          registeredKey: '9c'.repeat(40),
          platformDependencies: infra,
        });
        const venue = scaleVenue(built);
        const placed = await built.provider.placeOrder(intent);
        const second = venue.active.pop();
        if (!second) {
          throw new Error('Missing Scale sibling');
        }
        venue.history.push({ ...second, status: 'canceled' });
        const unrelated = {
          ...second,
          orderIndex: 9999,
          clientOrderIndex: second.clientOrderIndex + 1,
        };
        venue.active.push(unrelated);
        built.clientInstance.sendTx.mockRejectedValue(
          new Error('cancel response lost'),
        );
        const params = {
          symbol: 'BTC',
          orderId: String(placed.orderId),
          orderType: 'scale' as const,
        };
        expect(await built.provider.cancelOrder(params)).toMatchObject({
          success: false,
        });
        const key = `lighterScaleOrders:testnet:${ACCOUNT.l1Address.toLowerCase()}:28`;
        const [group] = parseLighterScaleGroups(
          await infra.diskCache.getItem(key),
        );
        const attempt = group.rungs[0].cancelAttempt;
        if (!attempt) {
          throw new Error('Missing unacknowledged Scale cancellation');
        }
        expect(attempt.acknowledged).toBe(false);
        built.clientInstance.getTx.mockResolvedValue({
          code: 200,
          hash: 'deadbeef',
          accountIndex: group.accountIndex,
          apiKeyIndex: attempt.apiKeyIndex,
          nonce: attempt.nonce,
          status: Number(LIGHTER_TRANSACTION_STATUS.Failed),
        });
        await built.provider.reviewScaleOrderGroups();
        const unknown = parseLighterScaleGroups(
          await infra.diskCache.getItem(key),
        )[0].rungs[0].cancelAttempt;
        await vi.advanceTimersByTimeAsync(
          attempt.expiresAt + LIGHTER_TX_EXPIRY_SLACK_MS - Date.now() + 1,
        );
        built.clientInstance.getTx.mockResolvedValue(null);
        built.clientInstance.getNextNonce.mockResolvedValue({
          code: 200,
          nonce: attempt.nonce,
        });
        await built.provider.reviewScaleOrderGroups();
        const repeated = built.provider.cancelOrder(params);
        await vi.advanceTimersByTimeAsync(10000);
        expect(await repeated).toMatchObject({ success: false });

        const expected = { ...attempt };
        delete expected.acknowledged;
        expect(unknown).toStrictEqual(expected);
        expect(
          parseLighterScaleGroups(await infra.diskCache.getItem(key))[0]
            .rungs[0].cancelAttempt,
        ).toStrictEqual(expected);
        expect(
          built.calls.filter((call) => call.function === '_signCancelOrder'),
        ).toHaveLength(1);
        expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(3);
        expect(venue.active).toStrictEqual([
          expect.objectContaining({ orderIndex: 800 }),
          unrelated,
        ]);
      });

      it.each(['hash', 'expiry', 'nonce'] as const)(
        'refuses a malformed signed Scale cancellation %s before ledger append or send',
        async (field) => {
          const infra = createMockInfrastructure();
          const built = buildProvider({
            registeredKey: '9c'.repeat(40),
            platformDependencies: infra,
          });
          const venue = scaleVenue(built);
          const placed = await built.provider.placeOrder(intent);
          const activeBefore = [...venue.active];
          const execute = vi
            .mocked(built.bridge)
            .execute.getMockImplementation();
          if (!execute) {
            throw new Error('Missing signer implementation');
          }
          vi.mocked(built.bridge).execute.mockImplementation(
            async <Operation extends LighterSignerOperation>(
              call: LighterWasmCall<Operation>,
            ): Promise<LighterSignerResult<Operation>> => {
              const result = await execute(call);
              if (
                call.function !== '_signCancelOrder' ||
                !('txInfo' in result) ||
                typeof result.txInfo !== 'string'
              ) {
                return result;
              }
              const wire = JSON.parse(result.txInfo) as Record<string, unknown>;
              if (field === 'expiry') {
                wire.ExpiredAt = 0;
              }
              if (field === 'nonce') {
                delete wire.Nonce;
              }
              return {
                ...result,
                ...(field === 'hash' ? { txHash: 'invalid' } : {}),
                txInfo: JSON.stringify(wire),
              } as LighterSignerResult<Operation>;
            },
          );
          const writes = vi.spyOn(infra.diskCache, 'setItem');
          expect(
            await built.provider.cancelOrder({
              symbol: 'BTC',
              orderId: String(placed.orderId),
              orderType: 'scale',
            }),
          ).toMatchObject({
            success: false,
            error: 'Invalid Lighter Scale cancellation identity',
          });
          const cancelEntries = writes.mock.calls
            .filter(([key]) => key === 'lighterNonceLedger:testnet:28:7')
            .flatMap(([, value]) => {
              const ledger = JSON.parse(value) as {
                entries: { kind: number }[];
              };
              return ledger.entries.filter(
                (entry) => entry.kind === LIGHTER_TX_TYPE_CANCEL_ORDER,
              );
            });
          expect(cancelEntries).toStrictEqual([]);
          expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(2);
          expect(venue.active).toStrictEqual(activeBefore);
          const key = `lighterScaleOrders:testnet:${ACCOUNT.l1Address.toLowerCase()}:28`;
          expect(
            parseLighterScaleGroups(
              await infra.diskCache.getItem(key),
            )[0].rungs.every((rung) => rung.cancelAttempt === undefined),
          ).toBe(true);
        },
      );

      it.each(['owner', 'attempt'] as const)(
        'rejects Scale acknowledgement after its persisted %s is rewritten',
        async (field) => {
          const infra = createMockInfrastructure();
          const built = buildProvider({
            registeredKey: '9c'.repeat(40),
            platformDependencies: infra,
          });
          const venue = scaleVenue(built);
          const placed = await built.provider.placeOrder(intent);
          const key = `lighterScaleOrders:testnet:${ACCOUNT.l1Address.toLowerCase()}:28`;
          let rewritten:
            | ReturnType<typeof parseLighterScaleGroups>[number]
            | undefined;
          built.clientInstance.sendTx.mockImplementation(async () => {
            const groups = parseLighterScaleGroups(
              await infra.diskCache.getItem(key),
            );
            const [group] = groups;
            const attempt = group.rungs[0].cancelAttempt;
            if (!attempt) {
              throw new Error('Missing persisted Scale cancellation');
            }
            if (field === 'owner') {
              group.accountIndex += 1;
            } else {
              attempt.nonce += 1;
            }
            rewritten = group;
            await infra.diskCache.setItem(key, JSON.stringify(groups));
            return { code: 200, txHash: 'accepted' };
          });
          const cancellation = built.provider.cancelOrder({
            symbol: 'BTC',
            orderId: String(placed.orderId),
            orderType: 'scale',
          });
          await vi.advanceTimersByTimeAsync(10000);
          expect(await cancellation).toMatchObject({
            success: false,
            error: `Lighter Scale acknowledgement ${field === 'owner' ? 'ownership' : 'attempt'} mismatch`,
          });
          expect(rewritten?.rungs[0].cancelAttempt).toBeDefined();
          expect(
            parseLighterScaleGroups(await infra.diskCache.getItem(key))[0],
          ).toStrictEqual(rewritten);
          expect(
            rewritten?.rungs[0].cancelAttempt?.acknowledged,
          ).toBeUndefined();
          expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(3);
          expect(
            built.calls.filter((call) => call.function === '_signCancelOrder'),
          ).toHaveLength(1);
          expect(venue.active).toHaveLength(2);
        },
      );

      it('retains Scale cancellation identity before transport and retries only exact failure', async () => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          registeredKey: '9c'.repeat(40),
          platformDependencies: infra,
        });
        const venue = scaleVenue(built);
        const placed = await built.provider.placeOrder(intent);
        const key = `lighterScaleOrders:testnet:${ACCOUNT.l1Address.toLowerCase()}:28`;
        const send = built.clientInstance.sendTx.getMockImplementation();
        built.clientInstance.getTx.mockResolvedValue(null);
        built.clientInstance.sendTx.mockImplementation(
          async (_kind: number, txInfo: string) => {
            const wire = JSON.parse(txInfo) as { Nonce: number };
            const [group] = parseLighterScaleGroups(
              await infra.diskCache.getItem(key),
            );
            expect(
              group.rungs.some(
                (rung) => rung.cancelAttempt?.nonce === wire.Nonce,
              ),
            ).toBe(true);
            return { code: 200, txHash: '0xsent' };
          },
        );
        const params = {
          symbol: 'BTC',
          orderId: String(placed.orderId),
          orderType: 'scale' as const,
        };
        const first = built.provider.cancelOrder(params);
        await vi.advanceTimersByTimeAsync(10000);
        expect(await first).toMatchObject({ success: false });
        const [group] = parseLighterScaleGroups(
          await infra.diskCache.getItem(key),
        );
        const attempt = group.rungs[0].cancelAttempt;
        if (!attempt) {
          throw new Error('Missing durable Scale cancellation');
        }
        built.clientInstance.getTx.mockResolvedValue({
          code: 200,
          hash: attempt.txHash,
          accountIndex: 28,
          apiKeyIndex: 7,
          nonce: attempt.nonce + 1,
          status: LIGHTER_TRANSACTION_STATUS.Failed,
        });
        await built.provider.reviewScaleOrderGroups();
        expect(
          parseLighterScaleGroups(await infra.diskCache.getItem(key))[0]
            .rungs[0].cancelAttempt,
        ).toStrictEqual(attempt);
        built.clientInstance.getTx.mockImplementation(async (hash: string) =>
          hash === attempt.txHash
            ? {
                code: 200,
                hash,
                accountIndex: 28,
                apiKeyIndex: 7,
                nonce: attempt.nonce,
                status: LIGHTER_TRANSACTION_STATUS.Failed,
              }
            : null,
        );
        await built.provider.reviewScaleOrderGroups();
        const [failed] = parseLighterScaleGroups(
          await infra.diskCache.getItem(key),
        );
        expect(failed.rungs[0].cancelAttempt).toBeUndefined();
        expect(failed.rungs[1].cancelAttempt).toStrictEqual(
          group.rungs[1].cancelAttempt,
        );
        built.clientInstance.sendTx.mockImplementation(
          async (...args: unknown[]) => {
            await send?.(...args);
            return { code: 200, txHash: '0xsent' };
          },
        );
        const retrying = built.provider.cancelOrder(params);
        await vi.advanceTimersByTimeAsync(10000);
        expect(await retrying).toMatchObject({ success: false });
        expect(
          built.calls
            .filter((call) => call.function === '_signCancelOrder')
            .map((call) => [call.params[2], call.params[3]]),
        ).toStrictEqual([
          ['800', 44],
          ['801', 45],
          ['800', 46],
        ]);
        expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(5);
        expect(venue.active.map((row) => row.orderIndex)).toStrictEqual([801]);
      });

      it('bounds two-rung cancellation to one shared window and later settles without replay', async () => {
        const built = buildProvider({ registeredKey: '9c'.repeat(40) });
        const venue = scaleVenue(built);
        const placed = await built.provider.placeOrder(intent);
        const stale = [...venue.active];
        const unrelated = {
          ...stale[0],
          orderIndex: 9999,
          clientOrderIndex:
            Math.max(...stale.map((row) => Number(row.clientOrderIndex))) + 1,
        };
        venue.active.push(unrelated);
        const readsBefore =
          built.clientInstance.getActiveOrders.mock.calls.length;
        built.clientInstance.getActiveOrders.mockResolvedValue({
          code: 200,
          orders: [...stale, unrelated],
        });
        built.clientInstance.getInactiveOrders.mockResolvedValue({
          code: 200,
          orders: [],
        });
        let finished = false;
        const canceling = built.provider
          .cancelOrder({
            symbol: 'BTC',
            orderId: String(placed.orderId),
            orderType: 'scale',
          })
          .then((result) => {
            finished = true;
            return result;
          });
        await vi.advanceTimersByTimeAsync(9999);
        expect(finished).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(finished).toBe(true);
        expect(await canceling).toMatchObject({
          success: false,
          error: 'Lighter Scale cancellation remains unresolved',
        });
        expect(
          built.calls
            .filter((call) => call.function === '_signCancelOrder')
            .map((call) => call.params[2]),
        ).toStrictEqual(['800', '801']);
        expect(
          built.calls
            .filter((call) => call.function === '_signCancelOrder')
            .map((call) => call.params[3]),
        ).toStrictEqual([44, 45]);
        expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(4);
        expect(
          built.clientInstance.getActiveOrders.mock.calls.length - readsBefore,
        ).toBeLessThanOrEqual(45);
        expect(venue.active).toStrictEqual([unrelated]);
        expect((await built.provider.getScaleOrderGroups())[0].state).toBe(
          'stopped',
        );
        built.clientInstance.getActiveOrders.mockResolvedValue({
          code: 200,
          orders: venue.active,
        });
        built.clientInstance.getInactiveOrders.mockResolvedValue({
          code: 200,
          orders: venue.history,
        });
        expect((await built.provider.reviewScaleOrderGroups())[0].state).toBe(
          'terminal',
        );
        expect(
          await built.provider.cancelOrder({
            symbol: 'BTC',
            orderId: String(placed.orderId),
            orderType: 'scale',
          }),
        ).toMatchObject({ success: true });
        expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(4);
      });
    });

    it.each([
      'nonce',
      'signer',
      'accepted-child',
      'leverage-nonce',
      'leverage-signer',
      'account',
      'accepted-reduce-only',
    ] as const)(
      'refuses Scale metadata drift during %s and preserves exact accepted receipts',
      async (boundary) => {
        const built = buildProvider({ registeredKey: '9c'.repeat(40) });
        const venue = scaleVenue(built);
        const drift = (): void => {
          built.clientInstance.getOrderBooks.mockResolvedValue([
            { ...BTC_MARKET, supportedPriceDecimals: 2 },
          ]);
        };
        if (boundary === 'nonce' || boundary === 'leverage-nonce') {
          const loadNonce =
            built.clientInstance.getNextNonce.getMockImplementation() as
              | LighterClientService['getNextNonce']
              | undefined;
          if (!loadNonce) {
            throw new Error('Missing nonce fixture');
          }
          built.clientInstance.getNextNonce.mockImplementation(
            async (
              ...args: Parameters<LighterClientService['getNextNonce']>
            ) => {
              const result = await loadNonce(...args);
              drift();
              return result;
            },
          );
        } else if (boundary === 'signer' || boundary === 'leverage-signer') {
          const execute = vi.spyOn(built.bridge, 'execute');
          const sign = execute.getMockImplementation();
          if (!sign) {
            throw new Error('Missing signer fixture');
          }
          execute.mockImplementation(async (call: LighterWasmCall) => {
            const result = await sign(call);
            if (
              call.function === '_signCreateOrder' ||
              call.function === '_signUpdateLeverage'
            ) {
              drift();
            }
            return result;
          });
        } else if (boundary === 'account') {
          const read =
            built.clientInstance.getAccountByIndex.getMockImplementation() as
              | LighterClientService['getAccountByIndex']
              | undefined;
          if (!read) {
            throw new Error('Missing account fixture');
          }
          let reads = 0;
          built.clientInstance.getAccountByIndex.mockImplementation(
            async (
              ...args: Parameters<LighterClientService['getAccountByIndex']>
            ) => {
              const result = await read(...args);
              reads += 1;
              if (reads >= 2) {
                drift();
              }
              return result;
            },
          );
        } else {
          const send = built.clientInstance.sendTx.getMockImplementation() as
            | LighterClientService['sendTx']
            | undefined;
          if (!send) {
            throw new Error('Missing venue fixture');
          }
          built.clientInstance.sendTx.mockImplementation(
            async (...args: Parameters<LighterClientService['sendTx']>) => {
              const result = await send(...args);
              drift();
              return result;
            },
          );
        }
        const result = await built.provider.placeOrder({
          ...intent,
          ...(boundary.startsWith('leverage') ? { leverage: 4 } : {}),
          ...(boundary === 'accepted-reduce-only'
            ? { isBuy: false, reduceOnly: true }
            : {}),
          expectedScaleLadder: {
            prices: ['90000', '100000'],
            sizes: ['0.0005', '0.0005'],
            totalSize: '0.001',
            totalNotional: '95',
            minimumBaseSize: BTC_MARKET.minBaseAmount,
            minimumQuoteAmount: BTC_MARKET.minQuoteAmount,
            sizeDecimals: 5,
          },
        });
        expect(result).toMatchObject({
          success: false,
          error: 'ORDER_SCALE_PREVIEW_STALE',
        });
        expect(venue.active).toHaveLength(
          boundary.startsWith('accepted') ? 1 : 0,
        );
        expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(
          boundary.startsWith('accepted') ? 1 : 0,
        );
        expect(result.childOrderIds ?? []).toStrictEqual(
          boundary.startsWith('accepted') ? ['800'] : [],
        );
        const groups = await built.provider.getScaleOrderGroups();
        expect(
          groups.flatMap((group) => group.childOrderIds ?? []),
        ).toStrictEqual(boundary.startsWith('accepted') ? ['800'] : []);
      },
    );

    it('keeps the displayed constraint when deleted during service fees and refuses real metadata drift', async () => {
      const infra = createMockInfrastructure();
      const built = buildProvider({
        registeredKey: '9c'.repeat(40),
        platformDependencies: infra,
      });
      scaleVenue(built);
      const service = new TradingService(infra);
      const release = createDeferred<void>();
      service.setControllerDependencies({
        rewardsIntegrationService: {
          resolveFee: async () => {
            await release.promise;
            return {
              feeBips: 10,
              source: 'default',
              subscription: { eligible: false, reason: 'no-source' },
            };
          },
        } as never,
      });
      const params: OrderParams = {
        ...intent,
        expectedScaleLadder: {
          prices: ['90000', '100000'],
          sizes: ['0.0005', '0.0005'],
          totalSize: '0.001',
          totalNotional: '95',
          minimumBaseSize: BTC_MARKET.minBaseAmount,
          minimumQuoteAmount: BTC_MARKET.minQuoteAmount,
          sizeDecimals: 5,
        },
      };
      const pending = service.placeOrder({
        provider: built.provider,
        params,
        context: createMockServiceContext(),
        reportOrderToDataLake: vi.fn().mockResolvedValue({ success: true }),
      });
      delete params.expectedScaleLadder;
      built.clientInstance.getOrderBooks.mockResolvedValue([
        { ...BTC_MARKET, minBaseAmount: '0.0003' },
      ]);
      release.resolve();
      expect(await pending).toMatchObject({
        success: false,
        error: 'ORDER_SCALE_PREVIEW_STALE',
      });
      expect(built.calls).toStrictEqual([]);
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it.each([
      ['size-grid', { supportedSizeDecimals: 4 }],
      ['base-minimum', { minBaseAmount: '0.0003' }],
      ['quote-minimum', { minQuoteAmount: '20' }],
    ])(
      'refuses displayed Scale preview drift in %s before signer or financial writes',
      async (_name, changes) => {
        const deps = createMockInfrastructure();
        const built = buildProvider({
          registeredKey: '9c'.repeat(40),
          platformDependencies: deps,
        });
        const logError = getLoggerErrorMock(deps);
        scaleVenue(built);
        const preview = await built.provider.getScalePriceLadder({
          symbol: 'BTC',
          minPrice: 90000,
          maxPrice: 100000,
          count: 2,
          sizing: { size: '0.00123' },
        });
        if (preview.status !== 'ready' || !preview.sizingPreview) {
          throw new Error('Expected a sized fixture preview');
        }
        const params = { ...intent, size: '0.00123', leverage: 4 };
        Object.assign(params, {
          expectedScaleLadder: {
            prices: preview.prices,
            ...preview.sizingPreview,
          },
        });
        built.clientInstance.getOrderBooks.mockResolvedValue([
          { ...BTC_MARKET, ...changes },
        ]);

        const result = await built.provider.placeOrder(params);

        expect(result).toMatchObject({
          success: false,
          error: 'ORDER_SCALE_PREVIEW_STALE',
        });
        expect(built.calls).toStrictEqual([]);
        expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
        expect(logError).not.toHaveBeenCalled();
      },
    );

    it('places the exact displayed Scale preview when fresh metadata agrees', async () => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      const venue = scaleVenue(built);
      const preview = await built.provider.getScalePriceLadder({
        symbol: 'BTC',
        minPrice: 90000,
        maxPrice: 100000,
        count: 2,
        sizing: { size: '0.00123' },
      });
      if (preview.status !== 'ready' || !preview.sizingPreview) {
        throw new Error('Expected a sized fixture preview');
      }
      const params = { ...intent, size: '0.00123' };
      Object.assign(params, {
        expectedScaleLadder: {
          prices: preview.prices,
          ...preview.sizingPreview,
        },
      });

      const result = await built.provider.placeOrder(params);

      expect(result.success).toBe(true);
      expect(venue.active.map((row) => row.price)).toStrictEqual(
        preview.prices,
      );
      expect(venue.active.map((row) => row.initialBaseAmount)).toStrictEqual(
        preview.sizingPreview.sizes,
      );
      expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(2);
    });

    it.each([
      { prices: ['90000', '99999'] },
      { sizes: ['0.0006', '0.0004'] },
      { prices: ['90000'] },
      { sizes: new Array<string>(2) },
      { totalSize: '0.002' },
      { totalNotional: '96' },
      { sizeDecimals: 4 },
      { minimumBaseSize: '0.0001' },
      { minimumQuoteAmount: '1' },
      { integratorFee: '0' },
    ])(
      'refuses altered expected Scale constraints %j before writes',
      async (change) => {
        const built = buildProvider({ registeredKey: '9c'.repeat(40) });
        scaleVenue(built);
        const params = { ...intent };
        Object.assign(params, {
          expectedScaleLadder: {
            prices: ['90000', '100000'],
            sizes: ['0.0005', '0.0005'],
            totalSize: '0.001',
            totalNotional: '95',
            minimumBaseSize: BTC_MARKET.minBaseAmount,
            minimumQuoteAmount: BTC_MARKET.minQuoteAmount,
            sizeDecimals: 5,
            ...change,
          },
        });
        expect(await built.provider.placeOrder(params)).toMatchObject({
          success: false,
          error: 'ORDER_SCALE_PREVIEW_STALE',
        });
        expect(built.calls).toStrictEqual([]);
        expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
      },
    );

    it('captures the approved Scale ladder before asynchronous placement reads', async () => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      const venue = scaleVenue(built);
      const metadata = createDeferred<(typeof BTC_MARKET)[]>();
      built.clientInstance.getOrderBooks.mockReturnValueOnce(metadata.promise);
      const params = {
        ...intent,
        expectedScaleLadder: {
          prices: ['90000', '100000'],
          sizes: ['0.0005', '0.0005'],
          totalSize: '0.001',
          totalNotional: '95',
          minimumBaseSize: BTC_MARKET.minBaseAmount,
          minimumQuoteAmount: BTC_MARKET.minQuoteAmount,
          sizeDecimals: 5,
        },
      };
      const pending = built.provider.placeOrder(params);
      params.expectedScaleLadder.prices[0] = '1';
      params.expectedScaleLadder.sizes[0] = '1';
      params.size = '1';
      metadata.resolve([BTC_MARKET]);
      expect((await pending).success).toBe(true);
      expect(venue.active.map((row) => row.price)).toStrictEqual([
        '90000',
        '100000',
      ]);
      expect(venue.active.map((row) => row.initialBaseAmount)).toStrictEqual([
        '0.0005',
        '0.0005',
      ]);
    });

    it('rechecks the expected Scale ladder inside the write lock before leverage or order signing', async () => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      scaleVenue(built);
      built.clientInstance.getOrderBooks.mockResolvedValueOnce([BTC_MARKET]);
      built.clientInstance.getOrderBooks.mockResolvedValue([
        { ...BTC_MARKET, minBaseAmount: '0.0003' },
      ]);
      const result = await built.provider.placeOrder({
        ...intent,
        leverage: 4,
        expectedScaleLadder: {
          prices: ['90000', '100000'],
          sizes: ['0.0005', '0.0005'],
          totalSize: '0.001',
          totalNotional: '95',
          minimumBaseSize: BTC_MARKET.minBaseAmount,
          minimumQuoteAmount: BTC_MARKET.minQuoteAmount,
          sizeDecimals: 5,
        },
      });
      expect(result).toMatchObject({
        success: false,
        error: 'ORDER_SCALE_PREVIEW_STALE',
      });
      expect(
        built.calls.filter((call) => call.function.startsWith('_sign')),
      ).toStrictEqual([]);
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it('does not allow a Scale preview constraint on a basic order', async () => {
      const built = buildProvider();
      const params = { ...intent, orderType: 'market' as const };
      Object.assign(params, { expectedScaleLadder: {} });
      expect(await built.provider.placeOrder(params)).toMatchObject({
        success: false,
        error: 'ORDER_SCALE_PREVIEW_STALE',
      });
      expect(await built.provider.validateOrder(params)).toStrictEqual({
        isValid: false,
        error: 'ORDER_SCALE_PREVIEW_STALE',
      });
      expect(built.calls).toStrictEqual([]);
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it('preserves executed Scale acceptance when later lookups disappear after expiry', async () => {
      const infra = createMockInfrastructure();
      const built = buildProvider({
        registeredKey: '9c'.repeat(40),
        platformDependencies: infra,
      });
      scaleVenue(built);
      built.clientInstance.sendTx.mockRejectedValue(new Error('lost response'));
      await built.provider.placeOrder(intent);
      const key = `lighterScaleOrders:testnet:${ACCOUNT.l1Address.toLowerCase()}:28`;
      const [group] = parseLighterScaleGroups(
        await infra.diskCache.getItem(key),
      );
      const rung = group.rungs[0];
      built.clientInstance.getTx.mockResolvedValue({
        code: 200,
        hash: rung.txHash,
        nonce: rung.nonce,
        apiKeyIndex: group.apiKeyIndex,
        accountIndex: group.accountIndex,
        status: 2,
      });
      await built.provider.reviewScaleOrderGroups();
      const [accepted] = parseLighterScaleGroups(
        await infra.diskCache.getItem(key),
      );
      expect(accepted.rungs[0].state).toBe('accepted');
      expect(accepted.rungs[0].orderId).toBeUndefined();
      built.clientInstance.getTx.mockResolvedValue(null);
      const clock = vi
        .spyOn(Date, 'now')
        .mockReturnValue(Number(rung.expiresAt) + 31_000);
      try {
        const [receipt] = await built.provider.reviewScaleOrderGroups();
        expect(receipt.state).toBe('stopped');
        expect(receipt.acceptedSize).toBe(rung.size);
        const [retained] = parseLighterScaleGroups(
          await infra.diskCache.getItem(key),
        );
        expect(retained.rungs[0].state).toBe('accepted');
        expect(retained.rungs[0].nonAcceptance).toBeUndefined();
      } finally {
        clock.mockRestore();
      }
    });

    it.each(['filled', 'canceled'] as const)(
      'preserves a %s Scale child and its fills across stale active rows',
      async (terminalState) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          registeredKey: '9c'.repeat(40),
          platformDependencies: infra,
        });
        const venue = scaleVenue(built);
        const placed = await built.provider.placeOrder(intent);
        expect(placed.success).toBe(true);
        const stale = venue.active.shift();
        if (!stale) {
          throw new Error('Missing first Scale child');
        }
        const filledSize =
          terminalState === 'filled' ? stale.initialBaseAmount : '0.0001';
        venue.history.push({
          ...stale,
          status: terminalState,
          filledBaseAmount: filledSize,
          remainingBaseAmount: terminalState === 'filled' ? '0' : '0.0004',
        });
        await built.provider.reviewScaleOrderGroups();
        // Both endpoints now return the earlier snapshot, after durable terminal proof.
        venue.history.length = 0;
        venue.active.unshift(stale);
        const [receipt] = await built.provider.reviewScaleOrderGroups();
        expect(receipt.filledSize).toBe(filledSize);
        expect(receipt.childOrderIds).toStrictEqual(['801']);
        const key = `lighterScaleOrders:testnet:${ACCOUNT.l1Address.toLowerCase()}:28`;
        const [group] = parseLighterScaleGroups(
          await infra.diskCache.getItem(key),
        );
        expect(group.rungs[0]).toMatchObject({
          state: terminalState,
          filledSize,
        });
        expect(
          await built.provider.cancelOrder({
            symbol: 'BTC',
            orderId: String(placed.orderId),
            orderType: 'scale',
          }),
        ).toMatchObject({ success: true });
        expect(
          built.calls
            .filter((call) => call.function === '_signCancelOrder')
            .map((call) => call.params[2]),
        ).toStrictEqual(['801']);
      },
    );

    it.each(['review', 'cancel'] as const)(
      'refuses Scale %s when a live row contradicts expired rejection',
      async (operation) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          registeredKey: '9c'.repeat(40),
          platformDependencies: infra,
        });
        const venue = scaleVenue(built);
        const send = built.clientInstance.sendTx.getMockImplementation();
        let submitted = 0;
        built.clientInstance.sendTx.mockImplementation(
          async (kind: number, txInfo: string) => {
            const wire = JSON.parse(txInfo) as { createOrder?: boolean };
            if (wire.createOrder) {
              submitted += 1;
              if (submitted === 2) {
                throw new Error('lost second response');
              }
            }
            await send?.(kind, txInfo);
            return { code: 200, txHash: '0xsent' };
          },
        );
        const placed = await built.provider.placeOrder(intent);
        expect(placed.success).toBe(false);
        const key = `lighterScaleOrders:testnet:${ACCOUNT.l1Address.toLowerCase()}:28`;
        const [pending] = parseLighterScaleGroups(
          await infra.diskCache.getItem(key),
        );
        expect(pending.rungs[0].state).toBe('resting');
        expect(pending.rungs[1].state).toBe('unknown');
        const clock = vi
          .spyOn(Date, 'now')
          .mockReturnValue(Number(pending.rungs[1].expiresAt) + 31_000);
        try {
          await built.provider.reviewScaleOrderGroups();
          const [rejected] = parseLighterScaleGroups(
            await infra.diskCache.getItem(key),
          );
          expect(rejected.rungs[1]).toMatchObject({
            state: 'rejected',
            nonAcceptance: 'expired',
          });
          const signed = built.calls
            .filter((call) => call.function === '_signCreateOrder')
            .at(-1);
          if (!signed) {
            throw new Error('Missing second signed child');
          }
          venue.active.push({
            ...venue.active[0],
            orderIndex: 801,
            clientOrderIndex: Number(signed.params[2]),
            initialBaseAmount: pending.rungs[1].size,
            remainingBaseAmount: pending.rungs[1].size,
            filledBaseAmount: '0',
            price: pending.rungs[1].price,
          });
          const sendsBefore = built.clientInstance.sendTx.mock.calls.length;

          const outcome =
            operation === 'review'
              ? await built.provider.reviewScaleOrderGroups().then(
                  () => ({ success: true }),
                  (error: unknown) => ({
                    success: false,
                    error:
                      error instanceof Error ? error.message : String(error),
                  }),
                )
              : await built.provider.cancelOrder({
                  symbol: 'BTC',
                  orderId: String(placed.orderId),
                  orderType: 'scale',
                });
          expect(outcome).toMatchObject({
            success: false,
            error: 'Lighter Scale rejection conflicts with venue order',
          });

          expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(
            sendsBefore,
          );
          expect(venue.active.map((row) => row.orderIndex)).toStrictEqual([
            800, 801,
          ]);
          const [retained] = parseLighterScaleGroups(
            await infra.diskCache.getItem(key),
          );
          expect(retained.rungs[0].state).toBe('resting');
          expect(retained.rungs[1]).toMatchObject({
            state: 'rejected',
            nonAcceptance: 'expired',
          });
          const openOrders = await built.provider.getOpenOrders();
          expect(openOrders.map((order) => order.orderId)).toStrictEqual([
            '800',
            '801',
          ]);
          expect(openOrders[0].strategyGroupId).toBe(retained.groupId);
          expect(openOrders[1].strategyGroupId).toBeUndefined();
          const [listed] = await built.provider.getScaleOrderGroups();
          expect(listed.childOrderIds).toStrictEqual(['800']);
          expect(listed.acceptedSize).toBe('0.0005');
        } finally {
          clock.mockRestore();
        }
      },
    );

    it('preserves cumulative Scale fills when a live child row goes backwards', async () => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      const venue = scaleVenue(built);
      expect((await built.provider.placeOrder(intent)).success).toBe(true);
      const stale = { ...venue.active[0] };
      venue.active[0] = {
        ...stale,
        filledBaseAmount: '0.0002',
        remainingBaseAmount: '0.0003',
      };
      expect(
        (await built.provider.reviewScaleOrderGroups())[0].filledSize,
      ).toBe('0.0002');
      venue.active[0] = stale;
      expect(
        (await built.provider.reviewScaleOrderGroups())[0].filledSize,
      ).toBe('0.0002');
    });

    it.each(['missing', 'replaced'] as const)(
      'cancels an owned live Scale group after its local read authority is %s',
      async (authority) => {
        const infra = createMockInfrastructure();
        const first = buildProvider({
          registeredKey: '9c'.repeat(40),
          platformDependencies: infra,
        });
        const originalVenue = scaleVenue(first);
        const placed = await first.provider.placeOrder(intent);
        expect(placed.success).toBe(true);
        const registeredKey =
          authority === 'missing' ? '9c'.repeat(40) : 'ab'.repeat(40);
        const restarted = buildProvider({
          registeredKey,
          platformDependencies: infra,
        });
        const recoveredKey =
          authority === 'missing' ? 'de'.repeat(40) : '9c'.repeat(40);
        Object.assign(restarted.bridge, {
          getStoredKeyIndices: async () => (authority === 'missing' ? [] : [7]),
          getRecoverableKeyIndices: async () => [7],
        });
        const createClient = vi.spyOn(restarted.bridge, 'createClient');
        const createClientImplementation = createClient.getMockImplementation();
        createClient.mockImplementation(async (params) => {
          const result = await createClientImplementation?.(params);
          if (!result) {
            throw new Error('Missing fixture client');
          }
          return { ...result, pk: recoveredKey };
        });
        const venue = scaleVenue(restarted);
        venue.active.push(...originalVenue.active);
        const send = restarted.clientInstance.sendTx.getMockImplementation();
        restarted.clientInstance.sendTx.mockImplementation(
          async (kind: number, txInfo: string) => {
            const wire = JSON.parse(txInfo) as { changePubKey?: boolean };
            if (wire.changePubKey) {
              restarted.clientInstance.getApiKeys.mockResolvedValue({
                code: 200,
                apiKeys: [
                  {
                    accountIndex: 28,
                    apiKeyIndex: 7,
                    nonce: 1,
                    publicKey: registeredKey,
                  },
                  {
                    accountIndex: 28,
                    apiKeyIndex: Number(
                      restarted.calls
                        .filter((call) => call.function === '_createClient')
                        .at(-1)?.params[3],
                    ),
                    nonce: 1,
                    publicKey: recoveredKey,
                  },
                ],
              });
            }
            await send?.(kind, txInfo);
            return { code: 200, txHash: '0xsent' };
          },
        );
        const canceled = await restarted.provider.cancelOrder({
          symbol: 'BTC',
          orderId: String(placed.orderId),
          orderType: 'scale',
        });
        expect(canceled).toMatchObject({ success: true });
        expect(
          restarted.calls
            .filter((call) => call.function === '_signCancelOrder')
            .map((call) => call.params[2]),
        ).toStrictEqual(['800', '801']);
        expect(
          restarted.calls.filter(
            (call) => call.function === '_signChangePubKey',
          ),
        ).toHaveLength(1);
        expect(venue.active).toStrictEqual([]);
      },
    );

    it('does not treat a Scale registration lookup failure as missing local authority', async () => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      scaleVenue(built);
      const placed = await built.provider.placeOrder(intent);
      const signedBefore = built.calls.filter((call) =>
        call.function.startsWith('_sign'),
      ).length;
      built.clientInstance.getApiKeys.mockRejectedValue(
        new Error('registration unavailable'),
      );
      const canceled = await built.provider.cancelOrder({
        symbol: 'BTC',
        orderId: String(placed.orderId),
        orderType: 'scale',
      });
      expect(canceled).toMatchObject({
        success: false,
        error: 'registration unavailable',
      });
      expect(
        built.calls.filter((call) => call.function.startsWith('_sign')),
      ).toHaveLength(signedBefore);
    });

    it.each(['failed', 'expired'] as const)(
      'reviews %s proof before reconciliation without trapping the ledger',
      async (proof) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          registeredKey: '9c'.repeat(40),
          platformDependencies: infra,
        });
        scaleVenue(built);
        built.clientInstance.sendTx.mockRejectedValue(
          new Error('lost response'),
        );
        const result = await built.provider.placeOrder(intent);
        const key = `lighterScaleOrders:testnet:${ACCOUNT.l1Address.toLowerCase()}:28`;
        const [group] = parseLighterScaleGroups(
          await infra.diskCache.getItem(key),
        );
        const rung = group.rungs[0];
        const clock = vi
          .spyOn(Date, 'now')
          .mockReturnValue(Number(rung.expiresAt) + 31_000);
        if (proof === 'failed') {
          built.clientInstance.getTx.mockResolvedValue({
            code: 200,
            hash: rung.txHash,
            nonce: rung.nonce,
            apiKeyIndex: 7,
            accountIndex: 28,
            status: 0,
          });
        }
        try {
          const reviewed = await built.provider.reviewScaleOrderGroups();
          expect(reviewed[0].state).toBe('terminal');
          await built.provider.reconcileRecoveredDispatches();
          const canceled = await built.provider.cancelOrder({
            symbol: 'BTC',
            orderId: String(result.orderId),
            orderType: 'scale',
          });
          expect(canceled.success).toBe(true);
          scaleVenue(built);
          expect((await built.provider.placeOrder(intent)).success).toBe(true);
        } finally {
          clock.mockRestore();
        }
      },
    );

    it('retires an acknowledged invisible child after restart and expiry without financial setup', async () => {
      vi.useFakeTimers();
      try {
        const infra = createMockInfrastructure();
        const first = buildProvider({
          registeredKey: '9c'.repeat(40),
          platformDependencies: infra,
        });
        first.clientInstance.getActiveOrders.mockResolvedValue({
          code: 200,
          orders: [],
        });
        first.clientInstance.getInactiveOrders.mockResolvedValue({
          code: 200,
          orders: [],
        });
        const placing = first.provider.placeOrder(intent);
        await vi.advanceTimersByTimeAsync(10000);
        const result = await placing;
        expect(result).toMatchObject({
          success: false,
          submittedSize: '0.0005',
        });
        expect(first.clientInstance.sendTx).toHaveBeenCalledTimes(1);
        const key = `lighterScaleOrders:testnet:${ACCOUNT.l1Address.toLowerCase()}:28`;
        const [group] = parseLighterScaleGroups(
          await infra.diskCache.getItem(key),
        );
        const restarted = buildProvider({
          registeredKey: '9c'.repeat(40),
          platformDependencies: infra,
        });
        scaleVenue(restarted);
        const clock = vi
          .spyOn(Date, 'now')
          .mockReturnValue(Number(group.rungs[0].expiresAt) + 31_000);
        try {
          expect(
            (
              await restarted.provider.cancelOrder({
                symbol: 'BTC',
                orderId: String(result.orderId),
                orderType: 'scale',
              })
            ).success,
          ).toBe(true);
          expect(restarted.clientInstance.sendTx).not.toHaveBeenCalled();
          expect(
            restarted.calls.filter((call) => call.function.startsWith('_sign')),
          ).toStrictEqual([]);
        } finally {
          clock.mockRestore();
        }
      } finally {
        vi.useRealTimers();
      }
    });

    it('observes delayed placement and cancellation rows within the settle window', async () => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      const venue = scaleVenue(built);
      let reads = 0;
      built.clientInstance.getActiveOrders.mockImplementation(async () => {
        reads += 1;
        return { code: 200, orders: reads % 3 === 0 ? [...venue.active] : [] };
      });
      const result = await built.provider.placeOrder(intent);
      expect(result.success).toBe(true);
      expect(
        built.calls.filter((call) => call.function === '_signCreateOrder'),
      ).toHaveLength(2);
    });

    it('persists a rejected later row while preserving the resting first child', async () => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      const venue = scaleVenue(built);
      const send = built.clientInstance.sendTx.getMockImplementation();
      built.clientInstance.sendTx.mockImplementation(
        async (...args: unknown[]) => {
          await send?.(...args);
          if (venue.active.length === 2) {
            const row = venue.active.pop();
            if (row) {
              venue.history.push({ ...row, status: 'rejected' });
            }
          }
          return { code: 200, txHash: '0xsent' };
        },
      );
      const result = await built.provider.placeOrder(intent);
      expect(result.success).toBe(false);
      const groups = await built.provider.reviewScaleOrderGroups();
      expect(groups[0].acceptedSize).toBe('0.0005');
      expect(groups[0].state).toBe('stopped');
      expect(
        (
          await built.provider.cancelOrder({
            symbol: 'BTC',
            orderId: String(result.orderId),
            orderType: 'scale',
          })
        ).success,
      ).toBe(true);
    });

    it('returns real ordinary rows when optional attribution is corrupt', async () => {
      const infra = createMockInfrastructure();
      const built = buildProvider({
        registeredKey: '9c'.repeat(40),
        platformDependencies: infra,
      });
      scaleVenue(built);
      const result = await built.provider.placeOrder(intent);
      expect(result.success).toBe(true);
      const key = `lighterScaleOrders:testnet:${ACCOUNT.l1Address.toLowerCase()}:28`;
      await infra.diskCache.setItem(key, '{broken');
      const orders = await built.provider.getOpenOrders();
      expect(orders).toHaveLength(2);
      expect(orders[0].strategyGroupId).toBeUndefined();
      await expect(built.provider.getScaleOrderGroups()).rejects.toThrow(
        'journal',
      );
    });

    it('rejects excessive reduce-only leverage before financial setup', async () => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      const params = {
        ...intent,
        isBuy: false,
        reduceOnly: true,
        leverage: 100,
      };
      expect((await built.provider.validateOrder(params)).isValid).toBe(false);
      expect((await built.provider.placeOrder(params)).success).toBe(false);
      expect(built.calls).toStrictEqual([]);
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it('cancels an already terminal group after restart without signer setup', async () => {
      const infra = createMockInfrastructure();
      const first = buildProvider({
        registeredKey: '9c'.repeat(40),
        platformDependencies: infra,
      });
      scaleVenue(first);
      const result = await first.provider.placeOrder(intent);
      const cancel = {
        symbol: 'BTC',
        orderId: String(result.orderId),
        orderType: 'scale' as const,
      };
      expect((await first.provider.cancelOrder(cancel)).success).toBe(true);
      const restarted = buildProvider({ platformDependencies: infra });
      expect((await restarted.provider.cancelOrder(cancel)).success).toBe(true);
      expect(restarted.calls).toStrictEqual([]);
      expect(restarted.clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it.each(['0', '0.0001', undefined])(
      'tracks actual accepted exposure with fill %s through TradingService',
      async (fill) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          registeredKey: '9c'.repeat(40),
          platformDependencies: infra,
        });
        const venue = scaleVenue(built);
        const send = built.clientInstance.sendTx.getMockImplementation();
        built.clientInstance.sendTx.mockImplementation(
          async (...args: unknown[]) => {
            await send?.(...args);
            for (const row of venue.active) {
              if (fill === undefined) {
                delete row.filledBaseAmount;
              } else {
                row.filledBaseAmount = fill;
              }
            }
            return { code: 200, txHash: '0xsent' };
          },
        );
        const track = vi.spyOn(infra.metrics, 'trackPerpsEvent');
        const service = new TradingService(infra);
        const result = await service.placeOrder({
          provider: built.provider,
          params: intent,
          context: createMockServiceContext(),
          reportOrderToDataLake: vi.fn().mockResolvedValue({ success: true }),
        });
        expect(result.success).toBe(true);
        expect(result.filledSize).toBe(fill === '0.0001' ? '0.0002' : fill);
        const size = fill === '0.0001' ? 0.0002 : 0.001;
        expect(track).toHaveBeenCalledWith(
          PerpsAnalyticsEvent.TradeTransaction,
          expect.objectContaining({
            status: 'executed',
            order_size: size,
            order_value: size * 95000,
          }),
        );
        const partial = track.mock.calls.filter(
          (call) => call[1]?.status === 'partially_filled',
        );
        expect(partial).toHaveLength(fill === '0.0001' ? 1 : 0);
      },
    );

    it('validates existing reduce-only reservations before any financial setup', async () => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      const venue = scaleVenue(built);
      venue.active.push({
        orderIndex: 700,
        clientOrderIndex: 1000,
        marketIndex: 1,
        ownerAccountIndex: 28,
        initialBaseAmount: '0.0995',
        remainingBaseAmount: '0.0995',
        price: '100000',
        isAsk: true,
        type: 'limit',
        timeInForce: 'good-till-time',
        reduceOnly: 1,
        status: 'open',
        orderExpiry: 0,
        timestamp: Date.now(),
      });
      const params = { ...intent, isBuy: false, reduceOnly: true };
      expect((await built.provider.validateOrder(params)).isValid).toBe(false);
      expect((await built.provider.placeOrder(params)).success).toBe(false);
      expect(
        built.calls.filter((call) => call.function.startsWith('_sign')),
      ).toStrictEqual([]);
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it('fails closed without registered reservation read authority', async () => {
      const built = buildProvider();
      const params = { ...intent, isBuy: false, reduceOnly: true };
      expect((await built.provider.validateOrder(params)).isValid).toBe(false);
      expect((await built.provider.placeOrder(params)).success).toBe(false);
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
      expect(
        built.calls.filter((call) => call.function.startsWith('_sign')),
      ).toStrictEqual([]);
    });

    it('uses fresh terminal history when a prior reduce-only child filled', async () => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      const venue = scaleVenue(built);
      const spy = vi.spyOn(built.bridge, 'execute');
      const execute = spy.getMockImplementation();
      spy.mockImplementation(async (call) => {
        if (call.function === '_signCreateOrder' && venue.active.length === 1) {
          const row = venue.active.shift();
          if (row) {
            venue.history.push({
              ...row,
              status: 'filled',
              filledBaseAmount: row.initialBaseAmount,
              remainingBaseAmount: '0',
            });
            built.clientInstance.getAccountByIndex.mockResolvedValue({
              code: 200,
              accounts: [
                {
                  ...ACCOUNT,
                  positions: [{ ...ACCOUNT.positions[0], position: '0.0995' }],
                },
              ],
            });
          }
        }
        const result = await execute?.(call);
        if (!result) {
          throw new Error('Missing fixture signer');
        }
        return result;
      });
      expect(
        (
          await built.provider.placeOrder({
            ...intent,
            isBuy: false,
            reduceOnly: true,
          })
        ).success,
      ).toBe(true);
      expect(venue.history[0].status).toBe('filled');
      expect(venue.active).toHaveLength(1);
    });

    it('cancels known resting siblings even when an earlier accepted row is absent', async () => {
      const infra = createMockInfrastructure();
      const built = buildProvider({
        registeredKey: '9c'.repeat(40),
        platformDependencies: infra,
      });
      const venue = scaleVenue(built);
      const result = await built.provider.placeOrder(intent);
      const key = `lighterScaleOrders:testnet:${ACCOUNT.l1Address.toLowerCase()}:28`;
      const [group] = parseLighterScaleGroups(
        await infra.diskCache.getItem(key),
      );
      group.rungs[0].state = 'accepted';
      delete group.rungs[0].orderId;
      delete group.rungs[0].filledSize;
      venue.active.shift();
      await infra.diskCache.setItem(key, JSON.stringify([group]));
      expect(
        (
          await built.provider.cancelOrder({
            symbol: 'BTC',
            orderId: String(result.orderId),
            orderType: 'scale',
          })
        ).success,
      ).toBe(false);
      expect(
        built.calls
          .filter((call) => call.function === '_signCancelOrder')
          .map((call) => call.params[2]),
      ).toStrictEqual(['801']);
    });

    it('waits for lagged cancellation without signing duplicate cancels', async () => {
      vi.useFakeTimers();
      try {
        const built = buildProvider({ registeredKey: '9c'.repeat(40) });
        const venue = scaleVenue(built);
        const result = await built.provider.placeOrder(intent);
        const send = built.clientInstance.sendTx.getMockImplementation();
        let lagged: LighterApiOrder | undefined;
        let reads = 0;
        const snapshots: number[][] = [];
        built.clientInstance.sendTx.mockImplementation(
          async (...args: unknown[]) => {
            lagged = venue.active[0];
            reads = 0;
            await send?.(...args);
            return { code: 200, txHash: '0xsent' };
          },
        );
        built.clientInstance.getActiveOrders.mockImplementation(async () => {
          reads += 1;
          const orders =
            lagged && reads < 3 ? [lagged, ...venue.active] : [...venue.active];
          snapshots.push(orders.map((row) => row.orderIndex));
          return { code: 200, orders };
        });
        const canceling = built.provider.cancelOrder({
          symbol: 'BTC',
          orderId: String(result.orderId),
          orderType: 'scale',
        });
        await vi.advanceTimersByTimeAsync(750);
        expect(await canceling).toMatchObject({ success: true });
        expect(snapshots).toContainEqual([801]);
        expect(venue.history.map((row) => row.orderIndex)).toStrictEqual([
          800, 801,
        ]);
        expect(built.clientInstance.getInactiveOrders).toHaveBeenCalled();
        expect(
          built.calls
            .filter((call) => call.function === '_signCancelOrder')
            .map((call) => [call.params[2], call.params[3]]),
        ).toStrictEqual([
          ['800', 44],
          ['801', 45],
        ]);
        expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(4);
        expect((await built.provider.reviewScaleOrderGroups())[0].state).toBe(
          'terminal',
        );
        expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(4);
      } finally {
        vi.useRealTimers();
      }
    });

    it.each([
      'different-order',
      'active-duplicate',
      'history-duplicate',
      'signed-intent',
      'invalid-fill',
    ] as const)(
      'refuses conflicting Scale overlap for %s without financial dispatch',
      async (conflict) => {
        const built = buildProvider({ registeredKey: '9c'.repeat(40) });
        const venue = scaleVenue(built);
        expect((await built.provider.placeOrder(intent)).success).toBe(true);
        const [first, second] = venue.active.splice(0);
        venue.history.push(
          { ...first, status: 'canceled' },
          { ...second, status: 'canceled' },
        );
        venue.active.push(second);
        if (conflict === 'different-order') {
          venue.history[1].orderIndex = 9999;
        }
        if (conflict === 'active-duplicate') {
          venue.active.push({ ...second });
        }
        if (conflict === 'history-duplicate') {
          venue.history.push({ ...venue.history[1] });
        }
        if (conflict === 'signed-intent') {
          venue.history[1].price = '1';
        }
        if (conflict === 'invalid-fill') {
          venue.active[0].filledBaseAmount = '-1';
        }
        const errors = {
          'different-order': 'Ambiguous Lighter Scale order identity',
          'active-duplicate': 'Ambiguous Lighter Scale order identity',
          'history-duplicate': 'Ambiguous Lighter Scale order identity',
          'signed-intent': 'Lighter Scale order does not match signed intent',
          'invalid-fill': 'Invalid Lighter Scale fill quantity',
        };
        await expect(built.provider.reviewScaleOrderGroups()).rejects.toThrow(
          errors[conflict],
        );
        expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(2);
        expect(
          built.calls.filter((call) => call.function === '_signCancelOrder'),
        ).toStrictEqual([]);
      },
    );

    it('preserves cumulative Scale fills through overlapping snapshots', async () => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      const venue = scaleVenue(built);
      expect((await built.provider.placeOrder(intent)).success).toBe(true);
      const [first, second] = venue.active;
      venue.active[1] = {
        ...second,
        filledBaseAmount: '0.0002',
        remainingBaseAmount: '0.0003',
      };
      expect(
        (await built.provider.reviewScaleOrderGroups())[0].filledSize,
      ).toBe('0.0002');
      venue.active.splice(0, 2, { ...second, filledBaseAmount: '0.0001' });
      venue.history.push(
        { ...first, status: 'canceled' },
        { ...second, status: 'canceled', filledBaseAmount: '0' },
      );
      expect(
        (await built.provider.reviewScaleOrderGroups())[0].filledSize,
      ).toBe('0.0002');
      venue.active.length = 0;
      venue.history[1].filledBaseAmount = '0.0002';
      expect(
        (await built.provider.reviewScaleOrderGroups())[0].filledSize,
      ).toBe('0.0002');
      expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(2);
    });

    it.each([7, 8])(
      'recovers fresh exact accepted rows into acknowledgment after restart in slot %s',
      async (slot) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          registeredKey: '9c'.repeat(40),
          platformDependencies: infra,
        });
        const venue = scaleVenue(built);
        const send = built.clientInstance.sendTx.getMockImplementation();
        built.clientInstance.sendTx.mockImplementation(
          async (...args: unknown[]) => {
            await send?.(...args);
            throw new Error('lost response');
          },
        );
        const result = await built.provider.placeOrder(intent);
        expect(result.success).toBe(false);
        const restarted = buildProvider({
          registeredKey: '9c'.repeat(40),
          platformDependencies: infra,
          apiKeyIndex: slot,
        });
        restarted.clientInstance.getApiKeys.mockResolvedValue({
          code: 200,
          apiKeys: [
            { accountIndex: 28, apiKeyIndex: slot, publicKey: '9c'.repeat(40) },
          ],
        });
        const nextVenue = scaleVenue(restarted);
        nextVenue.active.push(...venue.active);
        restarted.clientInstance.getNextNonce.mockResolvedValue({
          code: 200,
          nonce: 1000,
        });
        const groups = await restarted.provider.reviewScaleOrderGroups();
        expect(groups[0].acceptedSize).toBe('0.0005');
        expect(restarted.clientInstance.getNextNonce).toHaveBeenCalledWith(
          28,
          7,
        );
        const recovered = await restarted.provider.getRecoveredDispatches();
        expect(recovered).toStrictEqual([
          expect.objectContaining({
            outcome: 'succeeded',
            evidence: 'fresh-exact-scale-child',
          }),
        ]);
        expect((await restarted.provider.placeOrder(intent)).success).toBe(
          false,
        );
        await restarted.provider.acknowledgeRecoveredDispatch(
          recovered[0].recoveryId,
        );
        expect((await restarted.provider.placeOrder(intent)).success).toBe(
          true,
        );
      },
    );

    it.each([
      'unadvanced',
      'mismatched-hash',
      'pending-hash',
      'missing-row',
      'wrong-side',
      'wrong-kind',
      'wrong-nonce',
      'wrong-expiry',
      'wrong-intent',
      'wrong-owner',
      'wrong-ledger-hash',
      'wrong-slot',
    ] as const)('keeps recovery pending with %s evidence', async (control) => {
      const infra = createMockInfrastructure();
      const built = buildProvider({
        registeredKey: '9c'.repeat(40),
        platformDependencies: infra,
      });
      const venue = scaleVenue(built);
      const send = built.clientInstance.sendTx.getMockImplementation();
      built.clientInstance.sendTx.mockImplementation(
        async (...args: unknown[]) => {
          await send?.(...args);
          throw new Error('lost');
        },
      );
      await built.provider.placeOrder(intent);
      const key = `lighterScaleOrders:testnet:${ACCOUNT.l1Address.toLowerCase()}:28`;
      const [group] = parseLighterScaleGroups(
        await infra.diskCache.getItem(key),
      );
      const rung = group.rungs[0];
      const ledgerKey = 'lighterNonceLedger:testnet:28:7';
      const ledger = JSON.parse(
        String(await infra.diskCache.getItem(ledgerKey)),
      ) as {
        entries: {
          kind: number;
          nonce: number;
          expiresAt: number;
          intent: string;
          owner: string | null;
          txHash: string | null;
        }[];
      };
      if (control === 'wrong-owner') {
        ledger.entries[0].owner = 'another-operation';
      }
      if (control === 'wrong-ledger-hash') {
        ledger.entries[0].txHash = 'aa';
      }
      if (control === 'wrong-slot') {
        group.apiKeyIndex = 8;
        await infra.diskCache.setItem(key, JSON.stringify([group]));
      }
      if (control === 'wrong-kind') {
        ledger.entries[0].kind = 15;
      }
      if (control === 'wrong-nonce') {
        ledger.entries[0].nonce += 1;
      }
      if (control === 'wrong-expiry') {
        ledger.entries[0].expiresAt += 1;
      }
      if (control === 'wrong-intent') {
        ledger.entries[0].intent += ':other';
      }
      await infra.diskCache.setItem(ledgerKey, JSON.stringify(ledger));
      built.clientInstance.getNextNonce.mockResolvedValue({
        code: 200,
        nonce: control === 'unadvanced' ? rung.nonce : 1000,
      });
      if (control === 'mismatched-hash' || control === 'pending-hash') {
        built.clientInstance.getTx.mockResolvedValue({
          code: 200,
          hash: control === 'mismatched-hash' ? 'ff' : rung.txHash,
          nonce: rung.nonce,
          apiKeyIndex: 7,
          accountIndex: 28,
          status: control === 'pending-hash' ? 1 : 2,
        });
      }
      if (control === 'missing-row') {
        venue.active.length = 0;
      }
      if (control === 'wrong-side') {
        venue.active[0].isAsk = true;
      }
      const reviewError = await built.provider.reviewScaleOrderGroups().then(
        () => undefined,
        (error: unknown) =>
          error instanceof Error ? error.message : String(error),
      );
      expect(reviewError).toBe(
        control === 'wrong-side'
          ? 'Lighter Scale order does not match signed intent'
          : undefined,
      );
      const recovered = await built.provider.getRecoveredDispatches();
      expect(recovered).not.toContainEqual(
        expect.objectContaining({ evidence: 'fresh-exact-scale-child' }),
      );
      expect((await built.provider.placeOrder(intent)).success).toBe(false);
    });

    it.each([
      'unexpired',
      'incomplete-history',
      'mismatched-hash',
      'unscoped-active',
      'unscoped-history',
    ] as const)(
      'does not abandon acknowledged absence with %s',
      async (control) => {
        vi.useFakeTimers();
        try {
          const infra = createMockInfrastructure();
          const built = buildProvider({
            registeredKey: '9c'.repeat(40),
            platformDependencies: infra,
          });
          built.clientInstance.getActiveOrders.mockResolvedValue({
            code: 200,
            orders: [],
          });
          built.clientInstance.getInactiveOrders.mockResolvedValue({
            code: 200,
            orders: [],
          });
          const placing = built.provider.placeOrder(intent);
          await vi.advanceTimersByTimeAsync(9999);
          expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(1);
          await vi.advanceTimersByTimeAsync(1);
          const placed = await placing;
          expect(placed).toMatchObject({
            success: false,
            submittedSize: '0.0005',
          });
          const key = `lighterScaleOrders:testnet:${ACCOUNT.l1Address.toLowerCase()}:28`;
          const [group] = parseLighterScaleGroups(
            await infra.diskCache.getItem(key),
          );
          const clock = vi
            .spyOn(Date, 'now')
            .mockReturnValue(
              control === 'unexpired'
                ? Number(group.rungs[0].expiresAt) - 1
                : Number(group.rungs[0].expiresAt) + 31_000,
            );
          if (control === 'incomplete-history') {
            built.clientInstance.getInactiveOrders.mockResolvedValue({
              code: 200,
              orders: [],
              nextCursor: 'more',
            });
          }
          if (control === 'mismatched-hash') {
            built.clientInstance.getTx.mockResolvedValue({
              code: 200,
              hash: 'ff',
              accountIndex: 28,
              apiKeyIndex: 7,
              nonce: group.rungs[0].nonce,
              status: 2,
            });
          }
          if (control === 'unscoped-active' || control === 'unscoped-history') {
            const row: LighterApiOrder = {
              orderIndex: 700,
              clientOrderIndex: 1000,
              marketIndex: 1,
              ownerAccountIndex: 29,
              initialBaseAmount: '0.001',
              remainingBaseAmount: '0.001',
              price: '100000',
              isAsk: false,
              type: 'limit',
              timeInForce: 'good-till-time',
              reduceOnly: 0,
              status: 'open',
              orderExpiry: 0,
              timestamp: Date.now(),
            };
            const endpoint =
              control === 'unscoped-active'
                ? built.clientInstance.getActiveOrders
                : built.clientInstance.getInactiveOrders;
            endpoint.mockResolvedValue({ code: 200, orders: [row] });
          }
          try {
            expect(
              (
                await built.provider.cancelOrder({
                  symbol: 'BTC',
                  orderId: String(placed.orderId),
                  orderType: 'scale',
                })
              ).success,
            ).toBe(false);
            expect((await built.provider.getScaleOrderGroups())[0].state).toBe(
              'unknown',
            );
            expect(
              built.calls.filter(
                (call) => call.function === '_signCancelOrder',
              ),
            ).toHaveLength(0);
          } finally {
            clock.mockRestore();
          }
        } finally {
          vi.useRealTimers();
        }
      },
    );

    it('retries terminal fresh-row acceptance after a ledger persistence failure', async () => {
      const infra = createMockInfrastructure();
      const built = buildProvider({
        registeredKey: '9c'.repeat(40),
        platformDependencies: infra,
      });
      const venue = scaleVenue(built);
      const send = built.clientInstance.sendTx.getMockImplementation();
      built.clientInstance.sendTx.mockImplementation(
        async (...args: unknown[]) => {
          await send?.(...args);
          throw new Error('lost');
        },
      );
      await built.provider.placeOrder(intent);
      const row = venue.active.shift();
      if (!row) {
        throw new Error('Missing accepted fixture row');
      }
      venue.history.push({
        ...row,
        status: 'filled',
        filledBaseAmount: row.initialBaseAmount,
        remainingBaseAmount: '0',
      });
      built.clientInstance.getNextNonce.mockResolvedValue({
        code: 200,
        nonce: 1000,
      });
      const setter = vi.spyOn(infra.diskCache, 'setItem');
      const write = setter.getMockImplementation();
      let failed = false;
      setter.mockImplementation(async (key, value) => {
        if (
          !failed &&
          key.startsWith('lighterNonceLedger:') &&
          value.includes('fresh-exact-scale-child')
        ) {
          failed = true;
          throw new Error('ledger unavailable');
        }
        await write?.(key, value);
      });
      await expect(built.provider.reviewScaleOrderGroups()).rejects.toThrow(
        'ledger unavailable',
      );
      expect((await built.provider.getScaleOrderGroups())[0].state).toBe(
        'terminal',
      );
      await built.provider.reviewScaleOrderGroups();
      expect(await built.provider.getRecoveredDispatches()).toStrictEqual([
        expect.objectContaining({
          outcome: 'succeeded',
          evidence: 'fresh-exact-scale-child',
        }),
      ]);
    });

    it('rejects unavailable leverage metadata for reduce-only before setup', async () => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      built.clientInstance.getOrderBookDetails.mockResolvedValue({
        code: 200,
        orderBookDetails: [],
      });
      const params = { ...intent, isBuy: false, reduceOnly: true, leverage: 5 };
      expect((await built.provider.validateOrder(params)).isValid).toBe(false);
      expect((await built.provider.placeOrder(params)).success).toBe(false);
      expect(built.calls).toStrictEqual([]);
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it('rechecks reservations that change during child signing', async () => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      const venue = scaleVenue(built);
      const params = { ...intent, isBuy: false, reduceOnly: true };
      expect((await built.provider.validateOrder(params)).isValid).toBe(true);
      const spy = vi.spyOn(built.bridge, 'execute');
      const execute = spy.getMockImplementation();
      spy.mockImplementation(async (call) => {
        const signed = await execute?.(call);
        if (!signed) {
          throw new Error('Missing signer');
        }
        if (call.function === '_signCreateOrder') {
          venue.active.push({
            orderIndex: 700,
            clientOrderIndex: 1000,
            marketIndex: 1,
            ownerAccountIndex: 28,
            initialBaseAmount: '0.0995',
            remainingBaseAmount: '0.0995',
            price: '100000',
            isAsk: true,
            type: 'limit',
            timeInForce: 'good-till-time',
            reduceOnly: 1,
            status: 'open',
            orderExpiry: 0,
            timestamp: Date.now(),
          });
        }
        return signed;
      });
      expect((await built.provider.placeOrder(params)).success).toBe(false);
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
      expect(
        (await built.provider.getScaleOrderGroups())[0].submittedSize,
      ).toBe('0');
    });

    it('retains failed proof when ledger retirement fails after group review', async () => {
      const infra = createMockInfrastructure();
      const built = buildProvider({
        registeredKey: '9c'.repeat(40),
        platformDependencies: infra,
      });
      scaleVenue(built);
      built.clientInstance.sendTx.mockRejectedValue(new Error('lost'));
      await built.provider.placeOrder(intent);
      const key = `lighterScaleOrders:testnet:${ACCOUNT.l1Address.toLowerCase()}:28`;
      const [group] = parseLighterScaleGroups(
        await infra.diskCache.getItem(key),
      );
      built.clientInstance.getTx.mockResolvedValue({
        code: 200,
        hash: group.rungs[0].txHash,
        nonce: group.rungs[0].nonce,
        accountIndex: 28,
        apiKeyIndex: 7,
        status: 0,
      });
      const setter = vi.spyOn(infra.diskCache, 'setItem');
      const write = setter.getMockImplementation();
      let failed = false;
      setter.mockImplementation(async (keyName, value) => {
        if (!failed && keyName.startsWith('lighterNonceLedger:')) {
          failed = true;
          throw new Error('ledger unavailable');
        }
        await write?.(keyName, value);
      });
      await expect(built.provider.reviewScaleOrderGroups()).rejects.toThrow(
        'ledger unavailable',
      );
      expect(
        parseLighterScaleGroups(await infra.diskCache.getItem(key))[0].rungs[0]
          .nonAcceptance,
      ).toBe('failed');
      await built.provider.reviewScaleOrderGroups();
      expect(await built.provider.getRecoveredDispatches()).toStrictEqual([
        expect.objectContaining({ outcome: 'failed' }),
      ]);
      scaleVenue(built);
      expect((await built.provider.placeOrder(intent)).success).toBe(true);
    });

    it('validates a complete scale before signer setup', async () => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      expect(await built.provider.validateOrder(intent)).toStrictEqual({
        isValid: true,
      });
      expect(built.calls).toStrictEqual([]);
    });

    it('submits each exact scale rung with a distinct nonce', async () => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      built.clientInstance.getActiveOrders.mockImplementation(async () => ({
        code: 200,
        orders: built.calls
          .filter((call) => call.function === '_signCreateOrder')
          .map((call, index) => ({
            orderIndex: 800 + index,
            clientOrderIndex: Number(call.params[2]),
            marketIndex: 1,
            ownerAccountIndex: 28,
            initialBaseAmount: String(Number(call.params[3]) / 100000),
            remainingBaseAmount: String(Number(call.params[3]) / 100000),
            filledBaseAmount: '0',
            price: String(Number(call.params[4]) / 10),
            isAsk: false,
            type: 'limit',
            timeInForce: 'good-till-time',
            reduceOnly: 0,
            status: 'open',
            orderExpiry: 0,
            timestamp: Date.now(),
          })),
      }));
      const result = await built.provider.placeOrder(intent);
      expect(result.success).toBe(true);
      expect(result.submittedSize).toBe('0.001');
      expect(result.orderId).toMatch(/^lighter-scale:/u);
      const signed = built.calls.filter(
        (call) => call.function === '_signCreateOrder',
      );
      expect(signed).toHaveLength(2);
      expect(signed.map((call) => call.params.slice(3, 5))).toStrictEqual([
        ['50', '900000'],
        ['50', '1000000'],
      ]);
      expect(new Set(signed.map((call) => call.params.at(-1))).size).toBe(2);
    });

    it('retains real rows and exact group cancellation across provider restart', async () => {
      const infra = createMockInfrastructure();
      const first = buildProvider({
        registeredKey: '9c'.repeat(40),
        platformDependencies: infra,
      });
      const venue = scaleVenue(first);
      const result = await first.provider.placeOrder(intent);
      expect(result.success).toBe(true);
      expect(await first.provider.getOpenOrders()).toStrictEqual(
        expect.arrayContaining([
          expect.objectContaining({ strategyGroupId: result.orderId }),
        ]),
      );
      const restarted = buildProvider({
        registeredKey: '9c'.repeat(40),
        platformDependencies: infra,
        apiKeyIndex: 8,
      });
      restarted.clientInstance.getApiKeys.mockResolvedValue({
        code: 200,
        apiKeys: [
          { accountIndex: 28, apiKeyIndex: 8, publicKey: '9c'.repeat(40) },
        ],
      });
      const restartedVenue = scaleVenue(restarted);
      restartedVenue.active.push(...venue.active);
      expect(await restarted.provider.getScaleOrderGroups()).toStrictEqual([
        expect.objectContaining({ groupId: result.orderId, apiKeyIndex: 7 }),
      ]);
      const canceled = await restarted.provider.cancelOrder({
        symbol: 'BTC',
        orderId: String(result.orderId),
        orderType: 'scale',
      });
      expect(canceled.success).toBe(true);
      expect(
        restarted.calls.filter((call) => call.function === '_signCreateOrder'),
      ).toHaveLength(0);
      expect(
        restarted.calls
          .filter((call) => call.function === '_signCancelOrder')
          .map((call) => call.params[2]),
      ).toStrictEqual(['800', '801']);
      expect(await restarted.provider.getScaleOrderGroups()).toStrictEqual([
        expect.objectContaining({
          state: 'terminal',
          childOrderIds: [],
          acceptedSize: '0.001',
        }),
      ]);
    });

    it.each(['unknown', 'submitted'] as const)(
      'preserves crash ownership when persisting %s fails',
      async (failedState) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          registeredKey: '9c'.repeat(40),
          platformDependencies: infra,
        });
        const venue = scaleVenue(built);
        const setter = vi.spyOn(infra.diskCache, 'setItem');
        const write = setter.getMockImplementation();
        let failed = false;
        setter.mockImplementation(async (key, value) => {
          if (
            !failed &&
            key.startsWith('lighterScaleOrders:') &&
            value.includes(`"state":"${failedState}"`)
          ) {
            failed = true;
            throw new Error('disk failed');
          }
          await write?.(key, value);
        });
        const result = await built.provider.placeOrder(intent);
        expect(result.success).toBe(false);
        expect(failed).toBe(true);
        expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(
          failedState === 'unknown' ? 0 : 1,
        );
        expect(result.submittedSize).toBe(
          failedState === 'unknown' ? '0' : '0.0005',
        );
        const restarted = buildProvider({
          registeredKey: '9c'.repeat(40),
          platformDependencies: infra,
        });
        const recoveredVenue = scaleVenue(restarted);
        recoveredVenue.active.push(...venue.active);
        const groups = await restarted.provider.reviewScaleOrderGroups();
        expect(groups).toStrictEqual([
          expect.objectContaining({
            state: failedState === 'unknown' ? 'terminal' : 'stopped',
            acceptedSize: failedState === 'unknown' ? '0' : '0.0005',
          }),
        ]);
        expect(
          restarted.calls.filter(
            (call) => call.function === '_signCreateOrder',
          ),
        ).toHaveLength(0);
      },
    );

    it('reconciles a crash after nonce append but before the durable dispatch transition', async () => {
      const infra = createMockInfrastructure();
      const built = buildProvider({
        registeredKey: '9c'.repeat(40),
        platformDependencies: infra,
      });
      scaleVenue(built);
      const setter = vi.spyOn(infra.diskCache, 'setItem');
      const write = setter.getMockImplementation();
      let unavailable = false;
      setter.mockImplementation(async (key, value) => {
        if (
          key.startsWith('lighterScaleOrders:') &&
          value.includes('"state":"unknown"')
        ) {
          unavailable = true;
        }
        if (key.startsWith('lighterScaleOrders:') && unavailable) {
          throw new Error('persistent disk outage');
        }
        await write?.(key, value);
      });
      const result = await built.provider.placeOrder(intent);
      expect(result.success).toBe(false);
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
      setter.mockImplementation(async (key, value) => {
        await write?.(key, value);
      });
      const restarted = buildProvider({
        registeredKey: '9c'.repeat(40),
        platformDependencies: infra,
      });
      scaleVenue(restarted);
      restarted.clientInstance.getNextNonce.mockResolvedValue({
        code: 200,
        nonce: 1000,
      });
      const canceled = await restarted.provider.cancelOrder({
        symbol: 'BTC',
        orderId: String(result.orderId),
        orderType: 'scale',
      });
      expect(canceled.success).toBe(true);
      expect(restarted.clientInstance.sendTx).not.toHaveBeenCalled();
      expect(await restarted.provider.getScaleOrderGroups()).toStrictEqual([
        expect.objectContaining({ state: 'terminal', submittedSize: '0' }),
      ]);
    });

    it('refuses full unresolved inventory before setup and reclaims only a terminal group', async () => {
      const infra = createMockInfrastructure();
      const built = buildProvider({
        registeredKey: '9c'.repeat(40),
        platformDependencies: infra,
      });
      scaleVenue(built);
      expect((await built.provider.placeOrder(intent)).success).toBe(true);
      const key = `lighterScaleOrders:testnet:${ACCOUNT.l1Address.toLowerCase()}:28`;
      const [original] = parseLighterScaleGroups(
        await infra.diskCache.getItem(key),
      );
      const groups = Array.from({ length: 64 }, (_value, index) => ({
        ...original,
        groupId: `lighter-scale:testnet:${ACCOUNT.l1Address.toLowerCase()}:28:${1000 + index * 2}`,
        rungs: original.rungs.map((rung, rungIndex) => ({
          ...rung,
          clientOrderId: 1000 + index * 2 + rungIndex,
          orderId: String(10000 + index * 2 + rungIndex),
        })),
      }));
      await infra.diskCache.setItem(key, JSON.stringify(groups));
      const restarted = buildProvider({
        registeredKey: '9c'.repeat(40),
        platformDependencies: infra,
      });
      scaleVenue(restarted);
      const refused = await restarted.provider.placeOrder(intent);
      expect(refused.success).toBe(false);
      expect(refused.error).toContain('ownership is full');
      expect(restarted.calls).toStrictEqual([]);
      for (const rung of groups[0].rungs) {
        rung.state = 'canceled';
      }
      await infra.diskCache.setItem(key, JSON.stringify(groups));
      expect((await restarted.provider.placeOrder(intent)).success).toBe(true);
      const retained = await restarted.provider.getScaleOrderGroups();
      expect(retained).toHaveLength(64);
      expect(
        retained.some((group) => group.groupId === groups[0].groupId),
      ).toBe(false);
      expect(
        retained.some((group) => group.groupId === groups[1].groupId),
      ).toBe(true);
    });

    it('finds an older filled child without inventing its execution price', async () => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      const venue = scaleVenue(built);
      const result = await built.provider.placeOrder(intent);
      const [first] = venue.active.splice(0, 1);
      const filled = {
        ...first,
        status: 'filled',
        filledBaseAmount: first.initialBaseAmount,
        remainingBaseAmount: '0',
      };
      built.clientInstance.getInactiveOrders.mockImplementation(
        async (_account, _token, _limit, cursor) =>
          cursor === 'older'
            ? { code: 200, orders: [filled] }
            : {
                code: 200,
                orders: [{ ...filled, orderIndex: 999, clientOrderIndex: 999 }],
                nextCursor: 'older',
              },
      );
      const groups = await built.provider.reviewScaleOrderGroups();
      expect(result.success).toBe(true);
      expect(groups).toStrictEqual([
        expect.objectContaining({
          childOrderIds: ['801'],
          filledSize: '0.0005',
        }),
      ]);
      expect(groups[0]).not.toHaveProperty('averagePrice');
      expect(built.clientInstance.getInactiveOrders).toHaveBeenCalledWith(
        28,
        expect.any(String),
        100,
        'older',
        1,
      );
    });

    it('retains authoritative fills observed during exact group cancellation', async () => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      const venue = scaleVenue(built);
      const result = await built.provider.placeOrder(intent);
      const send = built.clientInstance.sendTx.getMockImplementation();
      built.clientInstance.sendTx.mockImplementation(
        async (...args: unknown[]) => {
          await send?.(...args);
          const row = venue.history.at(-1);
          if (row) {
            row.status = 'filled';
            row.filledBaseAmount = row.initialBaseAmount;
            row.remainingBaseAmount = '0';
          }
          return { code: 200, txHash: '0xsent' };
        },
      );
      expect(
        (
          await built.provider.cancelOrder({
            symbol: 'BTC',
            orderId: String(result.orderId),
            orderType: 'scale',
          })
        ).success,
      ).toBe(true);
      expect(await built.provider.getScaleOrderGroups()).toStrictEqual([
        expect.objectContaining({
          state: 'terminal',
          childOrderIds: [],
          filledSize: '0.001',
          acceptedSize: '0.001',
        }),
      ]);
    });

    it('preserves the accepted first child and unknown second after response loss without replay', async () => {
      const infra = createMockInfrastructure();
      const first = buildProvider({
        registeredKey: '9c'.repeat(40),
        platformDependencies: infra,
      });
      scaleVenue(first);
      const send = first.clientInstance.sendTx.getMockImplementation();
      let creates = 0;
      first.clientInstance.sendTx.mockImplementation(
        async (...args: unknown[]) => {
          creates += 1;
          if (creates === 2) {
            throw new Error('connection lost');
          }
          await send?.(...args);
          return { code: 200, txHash: '0xsent' };
        },
      );
      const result = await first.provider.placeOrder(intent);
      expect(result.success).toBe(false);
      expect(result.submittedSize).toBe('0.001');
      expect(result.acceptedSize).toBeUndefined();
      expect(result.childOrderIds).toStrictEqual(['800']);
      const restarted = buildProvider({
        registeredKey: '9c'.repeat(40),
        platformDependencies: infra,
      });
      expect(await restarted.provider.getScaleOrderGroups()).toStrictEqual([
        expect.objectContaining({
          state: 'unknown',
          submittedSize: '0.001',
          childOrderIds: ['800'],
        }),
      ]);
      expect(restarted.calls).toStrictEqual([]);
      expect((await restarted.provider.placeOrder(intent)).success).toBe(false);
      expect(restarted.calls).toStrictEqual([]);
    });

    it.each(['failed', 'expired'] as const)(
      'retires an unknown child only after fresh exact %s proof',
      async (outcome) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          registeredKey: '9c'.repeat(40),
          platformDependencies: infra,
        });
        built.clientInstance.getActiveOrders.mockResolvedValue({
          code: 200,
          orders: [],
        });
        built.clientInstance.getInactiveOrders.mockResolvedValue({
          code: 200,
          orders: [],
        });
        built.clientInstance.sendTx.mockRejectedValue(
          new Error('lost response'),
        );
        const result = await built.provider.placeOrder(intent);
        expect(result.success).toBe(false);
        const key = `lighterScaleOrders:testnet:${ACCOUNT.l1Address.toLowerCase()}:28`;
        const raw = await infra.diskCache.getItem(key);
        const [group] = parseLighterScaleGroups(raw);
        const rung = group.rungs[0];
        const clock =
          outcome === 'expired'
            ? vi
                .spyOn(Date, 'now')
                .mockReturnValue(Number(rung.expiresAt) + 31_000)
            : undefined;
        if (outcome === 'failed') {
          built.clientInstance.getTx.mockResolvedValue({
            code: 200,
            hash: rung.txHash,
            nonce: rung.nonce,
            apiKeyIndex: 7,
            accountIndex: 28,
            status: 0,
          });
        }
        try {
          const canceled = await built.provider.cancelOrder({
            symbol: 'BTC',
            orderId: String(result.orderId),
            orderType: 'scale',
          });
          expect(canceled.success).toBe(true);
          expect(
            built.calls.filter((call) => call.function === '_signCancelOrder'),
          ).toHaveLength(0);
          expect(await built.provider.getScaleOrderGroups()).toStrictEqual([
            expect.objectContaining({
              state: 'terminal',
              acceptedSize: '0',
              childOrderIds: [],
            }),
          ]);
        } finally {
          clock?.mockRestore();
        }
      },
    );

    it('keeps absent unexpired placement protected despite a consumed nonce', async () => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      built.clientInstance.getActiveOrders.mockResolvedValue({
        code: 200,
        orders: [],
      });
      built.clientInstance.getInactiveOrders.mockResolvedValue({
        code: 200,
        orders: [],
      });
      built.clientInstance.sendTx.mockRejectedValue(new Error('lost response'));
      const result = await built.provider.placeOrder(intent);
      built.clientInstance.getNextNonce.mockResolvedValue({
        code: 200,
        nonce: 1000,
      });
      expect(
        (
          await built.provider.cancelOrder({
            symbol: 'BTC',
            orderId: String(result.orderId),
            orderType: 'scale',
          })
        ).success,
      ).toBe(false);
      expect(await built.provider.getScaleOrderGroups()).toStrictEqual([
        expect.objectContaining({ state: 'unknown' }),
      ]);
      expect(
        built.calls.filter((call) => call.function === '_signCancelOrder'),
      ).toHaveLength(0);
    });

    it('fails closed when the source account changes while signing a child', async () => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      const spy = vi.spyOn(built.bridge, 'execute');
      const execute = spy.getMockImplementation();
      spy.mockImplementation(async (call) => {
        const signed = await execute?.(call);
        if (call.function === '_signCreateOrder') {
          built.getUserAddressMock.mockReturnValue(
            '0x1111111111111111111111111111111111111111',
          );
        }
        if (!signed) {
          throw new Error('Missing signer fixture');
        }
        return signed;
      });
      expect((await built.provider.placeOrder(intent)).success).toBe(false);
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it('retains old-account ownership when the source switches during send', async () => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      scaleVenue(built);
      const send = built.clientInstance.sendTx.getMockImplementation();
      built.clientInstance.sendTx.mockImplementation(
        async (...args: unknown[]) => {
          await send?.(...args);
          built.getUserAddressMock.mockReturnValue(
            '0x1111111111111111111111111111111111111111',
          );
          return { code: 200, txHash: '0xsent' };
        },
      );
      const result = await built.provider.placeOrder(intent);
      expect(result.success).toBe(false);
      expect(
        built.calls.filter((call) => call.function === '_signCreateOrder'),
      ).toHaveLength(1);
      built.getUserAddressMock.mockReturnValue(ACCOUNT.l1Address);
      expect(await built.provider.getScaleOrderGroups()).toStrictEqual([
        expect.objectContaining({
          state: 'unknown',
          walletAddress: ACCOUNT.l1Address.toLowerCase(),
        }),
      ]);
    });

    it('refuses cancellation signed after the source account changes', async () => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      scaleVenue(built);
      const result = await built.provider.placeOrder(intent);
      const spy = vi.spyOn(built.bridge, 'execute');
      const execute = spy.getMockImplementation();
      spy.mockImplementation(async (call) => {
        const signed = await execute?.(call);
        if (call.function === '_signCancelOrder') {
          built.getUserAddressMock.mockReturnValue(
            '0x1111111111111111111111111111111111111111',
          );
        }
        if (!signed) {
          throw new Error('Missing signer fixture');
        }
        return signed;
      });
      expect(
        (
          await built.provider.cancelOrder({
            symbol: 'BTC',
            orderId: String(result.orderId),
            orderType: 'scale',
          })
        ).success,
      ).toBe(false);
      expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(2);
      built.getUserAddressMock.mockReturnValue(ACCOUNT.l1Address);
      expect(await built.provider.getScaleOrderGroups()).toStrictEqual([
        expect.objectContaining({ childOrderIds: ['800', '801'] }),
      ]);
    });

    it('reserves unrelated reduce-only orders against the entire remaining ladder', async () => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      const venue = scaleVenue(built);
      venue.active.push({
        orderIndex: 700,
        clientOrderIndex: 1000,
        marketIndex: 1,
        ownerAccountIndex: 28,
        initialBaseAmount: '0.0995',
        remainingBaseAmount: '0.0995',
        price: '100000',
        isAsk: true,
        type: 'limit',
        timeInForce: 'good-till-time',
        reduceOnly: 1,
        status: 'open',
        orderExpiry: 0,
        timestamp: Date.now(),
      });
      const result = await built.provider.placeOrder({
        ...intent,
        isBuy: false,
        reduceOnly: true,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('aggregate reduce-only');
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it('stops after an acknowledged child without authoritative acceptance', async () => {
      vi.useFakeTimers();
      try {
        const built = buildProvider({ registeredKey: '9c'.repeat(40) });
        built.clientInstance.getActiveOrders.mockResolvedValue({
          code: 200,
          orders: [],
        });
        built.clientInstance.getInactiveOrders.mockResolvedValue({
          code: 200,
          orders: [],
        });
        let finished = false;
        const placing = built.provider.placeOrder(intent).then((result) => {
          finished = true;
          return result;
        });
        await vi.advanceTimersByTimeAsync(9999);
        expect(finished).toBe(false);
        expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        const result = await placing;
        expect(result.success).toBe(false);
        expect(result.acceptedSize).toBeUndefined();
        expect(result.submittedSize).toBe('0.0005');
        expect(
          built.calls.filter((call) => call.function === '_signCreateOrder'),
        ).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('rechecks margin after signing and refuses dispatch if funds disappeared', async () => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      built.clientInstance.getAccountByIndex.mockImplementation(async () => ({
        code: 200,
        accounts: [
          {
            ...ACCOUNT,
            availableBalance: built.calls.some(
              (call) => call.function === '_signCreateOrder',
            )
              ? '0'
              : ACCOUNT.availableBalance,
          },
        ],
      }));
      const result = await built.provider.placeOrder(intent);
      expect(result.success).toBe(false);
      expect(result.error).toContain('remaining margin');
      expect(result.submittedSize).toBe('0');
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it.each([
      { scaleMinPrice: '90000junk' },
      { scaleMaxPrice: '90000.01', scaleNumOrders: 3 },
      { size: '0.00001' },
      { scaleSkew: 0 },
      { price: '90000' },
      { takeProfitPrice: '120000' },
      { timeInForce: 'IOC' as const },
      { twapDuration: 5 },
      { chaseIntervalMs: 1000 },
    ])(
      'refuses invalid or unsupported scale intent before any bridge call: %j',
      async (override) => {
        const built = buildProvider({ registeredKey: '9c'.repeat(40) });
        const params = { ...intent, ...override };
        expect((await built.provider.validateOrder(params)).isValid).toBe(
          false,
        );
        expect((await built.provider.placeOrder(params)).success).toBe(false);
        expect(built.calls).toStrictEqual([]);
      },
    );
  });
});
