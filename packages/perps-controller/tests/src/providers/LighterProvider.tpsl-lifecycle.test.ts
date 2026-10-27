import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import type { LighterWasmCall } from '../../../src/types/lighter-types.js';
import {
  ACCOUNT,
  buildProvider,
  finishPendingTimersAfterEach,
  getLoggerErrorMock,
  setupTriggerVenue,
} from '../../helpers/lighterProvider.js';
import type { RawTriggerOrder } from '../../helpers/lighterProvider.js';
import {
  createDeferred,
  createMockInfrastructure,
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

  describe('round-12 venue integrity and serialized TP/SL lifecycle', () => {
    it.each([false, true])(
      'retains exact signed order expiry before dispatch and after settlement, grouped=%s',
      async (grouped) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({ platformDependencies: infra });
        setupTriggerVenue(built.clientInstance, built.bridge);
        const key = `lighterManagedTpsl:testnet:${ACCOUNT.l1Address.toLowerCase()}:28:BTC`;
        const send = built.clientInstance.sendTx.getMockImplementation() as
          | ((type: number, info: string) => Promise<unknown>)
          | undefined;
        if (!send) {
          throw new Error('Missing test transport');
        }
        const expected: { clientId: string; orderExpiry: number }[] = [];
        const beforeDispatch: unknown[][] = [];
        built.clientInstance.sendTx.mockImplementation(
          async (type: number, info: string) => {
            if (type === 14 || type === 28) {
              const signed = JSON.parse(info) as {
                ClientOrderIndex: number;
                OrderExpiry: number;
                Orders?: { ClientOrderIndex: number; OrderExpiry: number }[];
              };
              const rows = signed.Orders ?? [signed];
              expected.push(
                ...rows.map((row) => ({
                  clientId: String(row.ClientOrderIndex),
                  orderExpiry: row.OrderExpiry,
                })),
              );
              const stored = JSON.parse(
                (await infra.diskCache.getItem(key)) ?? '',
              ) as { orders: unknown[] };
              beforeDispatch.push(stored.orders);
            }
            return send(type, info);
          },
        );
        const result = await built.provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '90000',
          ...(grouped ? { takeProfitPrice: '110000' } : {}),
        });
        expect(result.error).toBeUndefined();
        expect(result.success).toBe(true);
        expect(expected).toHaveLength(grouped ? 2 : 1);
        expect(beforeDispatch).toHaveLength(1);
        for (const entry of expected) {
          expect(beforeDispatch[0]).toContainEqual(
            expect.objectContaining(entry),
          );
        }
        const stored = JSON.parse(
          (await infra.diskCache.getItem(key)) ?? '',
        ) as { orders: unknown[] };
        for (const entry of expected) {
          expect(stored.orders).toContainEqual(expect.objectContaining(entry));
        }
      },
    );

    it.each(['buried', 'unavailable'])(
      'reclaims expired ownership at capacity with %s history across restart',
      async (history) => {
        const infra = createMockInfrastructure();
        const first = buildProvider({ platformDependencies: infra });
        const venue = setupTriggerVenue(first.clientInstance, first.bridge);
        expect(
          (
            await first.provider.updatePositionTPSL({
              symbol: 'BTC',
              stopLossPrice: '90000',
            })
          ).success,
        ).toBe(true);
        const key = `lighterManagedTpsl:testnet:${ACCOUNT.l1Address.toLowerCase()}:28:BTC`;
        const stored = JSON.parse(
          (await infra.diskCache.getItem(key)) ?? '',
        ) as {
          orders: { clientId: string; orderId: string; orderExpiry: number }[];
        };
        const original = stored.orders[0];
        const signedCall = (
          first.clientInstance.sendTx.mock.calls as [number, string][]
        ).find(([type]) => type === 14);
        if (!original || !signedCall) {
          throw new Error('Missing initial protection');
        }
        const signed = JSON.parse(signedCall[1]) as { OrderExpiry: number };
        const clock = vi
          .spyOn(Date, 'now')
          .mockReturnValue(signed.OrderExpiry + 30_001);
        try {
          await first.provider.disconnect();
          const next = buildProvider({ platformDependencies: infra });
          const restartedVenue = setupTriggerVenue(
            next.clientInstance,
            next.bridge,
          );
          const terminal = venue.rawTriggers[0];
          if (!terminal) {
            throw new Error('Missing history template');
          }
          restartedVenue.rawInactive.push({
            ...terminal,
            status: 'canceled-oco',
          });
          for (let index = 0; index < 100; index += 1) {
            restartedVenue.rawInactive.push({
              ...terminal,
              clientOrderIndex: 100_000 + index,
              orderIndex: 100_000 + index,
              status: 'canceled',
            });
          }
          await infra.diskCache.setItem(
            key,
            JSON.stringify({
              version: 1,
              orders: [
                original,
                ...Array.from({ length: 255 }, (_, index) => ({
                  clientId: String(index + 1),
                  orderId: null,
                  orderExpiry: signed.OrderExpiry,
                })),
              ],
            }),
          );
          if (history === 'unavailable') {
            next.clientInstance.getInactiveOrders.mockRejectedValue(
              new Error('history unavailable'),
            );
          }
          const result = await next.provider.updatePositionTPSL({
            symbol: 'BTC',
            stopLossPrice: '85000',
            takeProfitPrice: '110000',
          });
          expect(result.error).toBeUndefined();
          expect(result.success).toBe(true);
          expect(restartedVenue.rawTriggers).toHaveLength(2);
          expect(
            next.clientInstance.getInactiveOrders.mock.calls.length,
          ).toBeLessThanOrEqual(1);
          expect(
            (
              JSON.parse((await infra.diskCache.getItem(key)) ?? '') as {
                orders: unknown[];
              }
            ).orders,
          ).toHaveLength(2);
        } finally {
          clock.mockRestore();
        }
      },
    );

    it.each(['future', 'slack', 'legacy', 'active'] as const)(
      'retains %s ownership at capacity and refuses new protection',
      async (condition) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({ platformDependencies: infra });
        const venue = setupTriggerVenue(built.clientInstance, built.bridge);
        const now = Date.now();
        const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
        const key = `lighterManagedTpsl:testnet:${ACCOUNT.l1Address.toLowerCase()}:28:BTC`;
        const expiryOffset = {
          future: 600_000,
          slack: -30_000,
          legacy: -30_001,
          active: -30_001,
        }[condition];
        const orders = Array.from({ length: 256 }, (_, index) => ({
          clientId: String(index + 1),
          orderId: null,
          ...(condition === 'legacy'
            ? {}
            : {
                orderExpiry: now + expiryOffset,
              }),
        }));
        try {
          if (condition === 'active') {
            for (const entry of orders) {
              venue.seedTrigger('stop-loss', '90000');
              const row = venue.rawTriggers.at(-1);
              if (!row) {
                throw new Error('Missing active protection');
              }
              row.clientOrderIndex = Number(entry.clientId);
              row.type = 'stop-loss-limit';
            }
          }
          await infra.diskCache.setItem(
            key,
            JSON.stringify({ version: 1, orders }),
          );
          const result = await built.provider.updatePositionTPSL({
            symbol: 'BTC',
            stopLossPrice: '85000',
          });
          expect(result.success).toBe(false);
          expect(result.error).toContain('ownership is full');
          expect(
            built.clientInstance.sendTx.mock.calls.filter(([type]: number[]) =>
              [14, 15, 28].includes(type),
            ),
          ).toHaveLength(0);
          expect(
            (
              JSON.parse((await infra.diskCache.getItem(key)) ?? '') as {
                orders: unknown[];
              }
            ).orders,
          ).toStrictEqual(orders);
        } finally {
          clock.mockRestore();
        }
      },
    );

    it.each([null, -1, 0, 1.5, '123456', Number.MAX_SAFE_INTEGER + 1])(
      'rejects corrupt persisted order expiry %s before mutation',
      async (orderExpiry) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({ platformDependencies: infra });
        setupTriggerVenue(built.clientInstance, built.bridge);
        const key = `lighterManagedTpsl:testnet:${ACCOUNT.l1Address.toLowerCase()}:28:BTC`;
        await infra.diskCache.setItem(
          key,
          JSON.stringify({
            version: 1,
            orders: [{ clientId: '4242', orderId: null, orderExpiry }],
          }),
        );
        const result = await built.provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '85000',
        });
        expect(result.success).toBe(false);
        expect(result.error).toContain(
          'Invalid Lighter managed TP/SL ownership',
        );
        expect(
          built.clientInstance.sendTx.mock.calls.filter(([type]: number[]) =>
            [14, 15, 28].includes(type),
          ),
        ).toHaveLength(0);
      },
    );

    it.each([
      [false, 'expiry'],
      [true, 'expiry'],
      [false, 'identity'],
      [true, 'identity'],
      [true, 'duplicate'],
      [true, 'count'],
    ] as const)(
      'refuses invalid signed order %s/%s proof before dispatch',
      async (grouped, failure) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({ platformDependencies: infra });
        const venue = setupTriggerVenue(built.clientInstance, built.bridge);
        venue.seedTrigger('stop-loss', '90000');
        const execute = vi.spyOn(built.bridge, 'execute');
        const sign = execute.getMockImplementation() as
          | ((
              call: LighterWasmCall,
            ) => Promise<{ txInfo: string; txHash: string }>)
          | undefined;
        if (!sign) {
          throw new Error('Missing test signer');
        }
        execute.mockImplementation(async (call: LighterWasmCall) => {
          const result = await sign(call);
          if (
            call.function === '_signCreateOrder' ||
            call.function === '_signCreateGroupedOrders'
          ) {
            const wire = JSON.parse(result.txInfo) as {
              ClientOrderIndex: number;
              OrderExpiry: number;
              Orders?: { ClientOrderIndex: number; OrderExpiry: number }[];
            };
            const rows = wire.Orders ?? [wire];
            if (failure === 'expiry') {
              rows[0].OrderExpiry = -1;
            } else if (failure === 'identity') {
              rows[0].ClientOrderIndex = 1234;
            } else if (failure === 'duplicate') {
              rows[1].ClientOrderIndex = rows[0].ClientOrderIndex;
            } else {
              wire.Orders?.pop();
            }
            return { ...result, txInfo: JSON.stringify(wire) };
          }
          return result;
        });
        const result = await built.provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '85000',
          ...(grouped ? { takeProfitPrice: '110000' } : {}),
        });
        expect(result.success).toBe(false);
        expect(result.error).toContain('no usable order expiry identity');
        expect(venue.rawTriggers).toHaveLength(1);
        expect(
          built.clientInstance.sendTx.mock.calls.filter(([type]: number[]) =>
            [14, 15, 28].includes(type),
          ),
        ).toHaveLength(0);
        expect(
          await infra.diskCache.getItem(
            `lighterManagedTpsl:testnet:${ACCOUNT.l1Address.toLowerCase()}:28:BTC`,
          ),
        ).toBeNull();
      },
    );

    it('bounds orphan ownership pruning without blocking protection on deep history', async () => {
      const infra = createMockInfrastructure();
      const built = buildProvider({ platformDependencies: infra });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      venue.seedTrigger('stop-loss', '90000');
      const template = venue.rawTriggers.pop();
      if (!template) {
        throw new Error('Test history template missing');
      }
      for (let index = 0; index < 12_000; index += 1) {
        venue.rawInactive.push({
          ...template,
          orderIndex: 100_000 + index,
          clientOrderIndex: 100_000 + index,
          status: 'canceled',
        });
      }
      const key = `lighterManagedTpsl:testnet:${ACCOUNT.l1Address.toLowerCase()}:28:BTC`;
      await infra.diskCache.setItem(
        key,
        JSON.stringify({
          version: 1,
          orders: [{ clientId: '4242', orderId: null }],
        }),
      );

      for (const price of ['90000', '85000']) {
        built.clientInstance.getInactiveOrders.mockClear();
        const result = await built.provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: price,
        });
        expect(result.error).toBeUndefined();
        expect(result.success).toBe(true);
        expect(built.clientInstance.getInactiveOrders).toHaveBeenCalledTimes(1);
        expect(built.clientInstance.getInactiveOrders).toHaveBeenCalledWith(
          28,
          expect.any(String),
          100,
          undefined,
          1,
        );
        expect(venue.rawTriggers).toHaveLength(1);
        expect(
          (
            JSON.parse((await infra.diskCache.getItem(key)) ?? '') as {
              orders: unknown[];
            }
          ).orders,
        ).toContainEqual({
          clientId: '4242',
          orderId: null,
        });
      }
    });

    it('retains uncertain ownership and permits protection when bookkeeping history is unavailable', async () => {
      const infra = createMockInfrastructure();
      const built = buildProvider({ platformDependencies: infra });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      const key = `lighterManagedTpsl:testnet:${ACCOUNT.l1Address.toLowerCase()}:28:BTC`;
      await infra.diskCache.setItem(
        key,
        JSON.stringify({
          version: 1,
          orders: [{ clientId: '4242', orderId: null }],
        }),
      );
      built.clientInstance.getInactiveOrders.mockRejectedValue(
        new Error('history unavailable'),
      );

      const result = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '90000',
      });
      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);
      expect(venue.rawTriggers).toHaveLength(1);
      expect(built.clientInstance.getInactiveOrders).toHaveBeenCalledTimes(1);
      expect(
        (
          JSON.parse((await infra.diskCache.getItem(key)) ?? '') as {
            orders: unknown[];
          }
        ).orders,
      ).toContainEqual({
        clientId: '4242',
        orderId: null,
      });
    });

    it('permits retry after journal persistence and pre-dispatch ownership rollback both fail', async () => {
      const infra = createMockInfrastructure();
      const disk = vi.mocked(infra.diskCache);
      const write = disk.setItem.getMockImplementation();
      let payloadFailed = false;
      let ownershipWrites = 0;
      disk.setItem.mockImplementation(async (key: string, value: string) => {
        if (!payloadFailed && key.startsWith('lighterTpslJournalOp:')) {
          payloadFailed = true;
          throw new Error('journal persistence failed');
        }
        if (key.startsWith('lighterManagedTpsl:')) {
          ownershipWrites += 1;
          if (ownershipWrites === 2) {
            throw new Error('ownership rollback failed');
          }
        }
        return write?.(key, value);
      });
      const built = buildProvider({ platformDependencies: infra });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      const first = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '90000',
      });
      expect(first.success).toBe(false);
      expect(venue.rawTriggers).toHaveLength(0);
      const key = `lighterManagedTpsl:testnet:${ACCOUNT.l1Address.toLowerCase()}:28:BTC`;
      const orphan = (
        JSON.parse((await infra.diskCache.getItem(key)) ?? '') as {
          orders: unknown[];
        }
      ).orders[0];
      expect(orphan).toBeDefined();
      built.clientInstance.getInactiveOrders.mockRejectedValue(
        new Error('history unavailable'),
      );

      const retry = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(retry.error).toBeUndefined();
      expect(retry.success).toBe(true);
      expect(venue.rawTriggers).toHaveLength(1);
      expect(
        (
          JSON.parse((await infra.diskCache.getItem(key)) ?? '') as {
            orders: unknown[];
          }
        ).orders,
      ).toContainEqual(orphan);
    });

    it('does not classify an observed accepted create as never landed after expiry', async () => {
      const infra = createMockInfrastructure();
      const built = buildProvider({ platformDependencies: infra });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      const settlementKey = `${ACCOUNT.l1Address.toLowerCase()}:28:7:BTC`;
      const key = `lighterManagedTpsl:testnet:${ACCOUNT.l1Address.toLowerCase()}:28:BTC`;
      await infra.diskCache.setItem(
        key,
        JSON.stringify({
          version: 1,
          orders: [{ clientId: '4242', orderId: null }],
        }),
      );
      await infra.diskCache.setItem(
        `lighterTpslJournal:testnet:${settlementKey}`,
        JSON.stringify({
          version: 4,
          recordedAt: Date.now() - 800_000,
          operationId: 'accepted-unobserved-book',
          createdAt: Date.now() - 800_000,
          nextAttemptId: 2,
          apiKeyIndex: 7,
          intent: 'replace',
          phase: 'creating',
          priorGrouping: 'independent',
          priorTriggers: [],
          attempts: [
            {
              kind: 'create',
              attemptId: 1,
              nonce: 42,
              outcome: 'accepted',
              clientIds: [4242],
              txHash: 'abab000000000042',
              expiresAt: Date.now() - 700_000,
              role: 'replacement',
            },
          ],
        }),
      );

      const result = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('unresolved');
      expect(venue.rawTriggers).toHaveLength(0);
      expect(
        (
          JSON.parse((await infra.diskCache.getItem(key)) ?? '') as {
            orders: unknown[];
          }
        ).orders,
      ).toContainEqual({ clientId: '4242', orderId: null });
    });

    it('retains live creation ownership when the extra post-settlement read lags empty', async () => {
      const infra = createMockInfrastructure();
      const { provider, clientInstance, bridge } = buildProvider({
        platformDependencies: infra,
      });
      const venue = setupTriggerVenue(clientInstance, bridge);
      const read = clientInstance.getActiveOrders.getMockImplementation() as (
        ...args: unknown[]
      ) => Promise<unknown>;
      let reads = 0;
      clientInstance.getActiveOrders.mockImplementation(
        async (...args: unknown[]) => {
          reads += 1;
          if (reads === 4) {
            return { code: 200, orders: [] };
          }
          return read(...args);
        },
      );
      expect(
        (
          await provider.updatePositionTPSL({
            symbol: 'BTC',
            stopLossPrice: '90000',
          })
        ).success,
      ).toBe(true);
      const key = `lighterManagedTpsl:testnet:${ACCOUNT.l1Address.toLowerCase()}:28:BTC`;
      expect(
        (
          JSON.parse((await infra.diskCache.getItem(key)) ?? '') as {
            orders: unknown[];
          }
        ).orders,
      ).toHaveLength(1);
      clientInstance.getActiveOrders.mockImplementation(read);
      clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [
          {
            ...ACCOUNT,
            positions: [{ ...ACCOUNT.positions[0], position: '0.2' }],
          },
        ],
      });
      expect(
        (
          await provider.updatePositionTPSL({
            symbol: 'BTC',
            stopLossPrice: '85000',
          })
        ).success,
      ).toBe(true);
      expect(venue.rawTriggers).toHaveLength(1);
    });

    it.each([
      'canceled-post-only',
      'canceled-reduce-only',
      'canceled-position-not-allowed',
      'canceled-margin-not-allowed',
      'canceled-too-much-slippage',
      'canceled-not-enough-liquidity',
      'canceled-self-trade',
      'canceled-expired',
      'canceled-oco',
      'canceled-child',
      'canceled-liquidation',
      'canceled-invalid-balance',
    ])(
      'prunes exact %s terminal ownership and permits protection at capacity',
      async (status) => {
        const infra = createMockInfrastructure();
        const { provider, clientInstance, bridge } = buildProvider({
          platformDependencies: infra,
        });
        const venue = setupTriggerVenue(clientInstance, bridge);
        venue.seedTrigger('stop-loss', '90000');
        const terminal = venue.rawTriggers.pop();
        expect(terminal).toBeDefined();
        if (!terminal) {
          throw new Error('Test terminal missing');
        }
        venue.rawInactive.push({ ...terminal, status });
        const orders = Array.from({ length: 255 }, (_, index) => ({
          clientId: String(index + 1),
          orderId: null,
        }));
        await infra.diskCache.setItem(
          `lighterManagedTpsl:testnet:${ACCOUNT.l1Address.toLowerCase()}:28:BTC`,
          JSON.stringify({
            version: 1,
            orders: [
              ...orders,
              {
                clientId: String(terminal.clientOrderIndex),
                orderId: String(terminal.orderIndex),
              },
            ],
          }),
        );
        const result = await provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '85000',
        });
        expect(result.error).toBeUndefined();
        expect(result.success).toBe(true);
        expect(venue.rawTriggers).toHaveLength(1);
      },
    );

    it('retries immediately after an ownership write fails once, without a never-sent journal', async () => {
      const infra = createMockInfrastructure();
      const disk = vi.mocked(infra.diskCache);
      const write = disk.setItem.getMockImplementation();
      let failed = false;
      disk.setItem.mockImplementation(async (key: string, value: string) => {
        if (!failed && key.startsWith('lighterManagedTpsl:')) {
          failed = true;
          throw new Error('one ownership write failure');
        }
        return write?.(key, value);
      });
      const { provider, clientInstance, bridge } = buildProvider({
        platformDependencies: infra,
      });
      const venue = setupTriggerVenue(clientInstance, bridge);
      expect(
        (
          await provider.updatePositionTPSL({
            symbol: 'BTC',
            stopLossPrice: '90000',
          })
        ).success,
      ).toBe(false);
      const retry = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(retry.error).toBeUndefined();
      expect(retry.success).toBe(true);
      expect(venue.rawTriggers).toHaveLength(1);
    });

    it.each(['lighterTpslJournalOp:', 'lighterTpslJournal:'])(
      'rolls back pre-dispatch ownership on a %s write failure and permits retry',
      async (prefix) => {
        const infra = createMockInfrastructure();
        const disk = vi.mocked(infra.diskCache);
        const write = disk.setItem.getMockImplementation();
        let failed = false;
        disk.setItem.mockImplementation(async (key: string, value: string) => {
          if (!failed && key.startsWith(prefix)) {
            failed = true;
            throw new Error('one journal write failure');
          }
          return write?.(key, value);
        });
        const { provider, clientInstance, bridge } = buildProvider({
          platformDependencies: infra,
        });
        const venue = setupTriggerVenue(clientInstance, bridge);
        expect(
          (
            await provider.updatePositionTPSL({
              symbol: 'BTC',
              stopLossPrice: '90000',
            })
          ).success,
        ).toBe(false);
        const key = `lighterManagedTpsl:testnet:${ACCOUNT.l1Address.toLowerCase()}:28:BTC`;
        expect(
          (
            JSON.parse((await infra.diskCache.getItem(key)) ?? '') as {
              orders: unknown[];
            }
          ).orders,
        ).toHaveLength(0);
        const retry = await provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '85000',
        });
        expect(retry.error).toBeUndefined();
        expect(retry.success).toBe(true);
        expect(venue.rawTriggers).toHaveLength(1);
      },
    );

    it('prunes an exact expired never-landed create without erasing an uncertain live identity', async () => {
      const infra = createMockInfrastructure();
      const { provider, clientInstance, bridge } = buildProvider({
        platformDependencies: infra,
      });
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.failBeforeCommitOnce(14);
      expect(
        (
          await provider.updatePositionTPSL({
            symbol: 'BTC',
            stopLossPrice: '90000',
          })
        ).success,
      ).toBe(false);
      const later = Date.now() + 700_000;
      const clock = vi.spyOn(Date, 'now').mockReturnValue(later);
      try {
        const retry = await provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '85000',
        });
        expect(retry.error).toBeUndefined();
        expect(retry.success).toBe(true);
        expect(venue.rawTriggers).toHaveLength(1);
        const key = `lighterManagedTpsl:testnet:${ACCOUNT.l1Address.toLowerCase()}:28:BTC`;
        expect(
          (
            JSON.parse((await infra.diskCache.getItem(key)) ?? '') as {
              orders: unknown[];
            }
          ).orders,
        ).toHaveLength(1);
      } finally {
        clock.mockRestore();
      }
    });

    it.each(['read', 'write', 'corrupt'] as const)(
      'fails closed on managed ownership %s failure before protection mutation',
      async (failure) => {
        const infra = createMockInfrastructure();
        const diskMocks = vi.mocked(infra.diskCache);
        const originalGet = diskMocks.getItem.getMockImplementation();
        if (!originalGet) {
          throw new Error('Missing test disk reader');
        }
        diskMocks.getItem.mockImplementation(async (key: string) => {
          if (key.startsWith('lighterManagedTpsl:')) {
            if (failure === 'read') {
              throw new Error('ownership read failed');
            }
            if (failure === 'corrupt') {
              return '{"version":1,"orders":[{"clientId":"bad"}]}';
            }
          }
          return originalGet(key);
        });
        const originalSet = diskMocks.setItem.getMockImplementation();
        diskMocks.setItem.mockImplementation(
          async (key: string, value: string) => {
            if (failure === 'write' && key.startsWith('lighterManagedTpsl:')) {
              throw new Error('ownership write failed');
            }
            return originalSet?.(key, value);
          },
        );
        const { provider, clientInstance, bridge } = buildProvider({
          platformDependencies: infra,
        });
        const venue = setupTriggerVenue(clientInstance, bridge);
        venue.seedTrigger('stop-loss', '90000');
        const result = await provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '85000',
        });
        expect(result.success).toBe(false);
        expect(
          clientInstance.sendTx.mock.calls.filter(([type]: number[]) =>
            [14, 15, 28].includes(type),
          ),
        ).toHaveLength(0);
        expect(venue.rawTriggers).toHaveLength(1);
      },
    );

    it('records creation ownership before dispatch and retains it through lost response and resize', async () => {
      const infra = createMockInfrastructure();
      const { provider, clientInstance, bridge } = buildProvider({
        platformDependencies: infra,
      });
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.failResponseOnce(14);
      const send = clientInstance.sendTx.getMockImplementation() as (
        type: number,
        info: string,
      ) => Promise<unknown>;
      const observedOwnership: unknown[] = [];
      clientInstance.sendTx.mockImplementation(
        async (type: number, info: string) => {
          if (type === 14) {
            const stored = await infra.diskCache.getItem(
              `lighterManagedTpsl:testnet:${ACCOUNT.l1Address.toLowerCase()}:28:BTC`,
            );
            observedOwnership.push(
              (JSON.parse(stored ?? '') as { orders: unknown[] }).orders,
            );
          }
          return send?.(type, info);
        },
      );
      expect(
        (
          await provider.updatePositionTPSL({
            symbol: 'BTC',
            stopLossPrice: '90000',
          })
        ).success,
      ).toBe(false);
      expect(observedOwnership).toHaveLength(1);
      expect(observedOwnership[0]).toHaveLength(1);
      const originalId = venue.rawTriggers[0].orderIndex;
      clientInstance.sendTx.mockImplementation(send);
      clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [
          {
            ...ACCOUNT,
            positions: [{ ...ACCOUNT.positions[0], position: '0.2' }],
          },
        ],
      });
      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);
      expect(venue.rawTriggers).toHaveLength(1);
      expect(venue.rawTriggers[0].orderIndex).not.toBe(originalId);
      const stored = await infra.diskCache.getItem(
        `lighterManagedTpsl:testnet:${ACCOUNT.l1Address.toLowerCase()}:28:BTC`,
      );
      expect(
        (JSON.parse(stored ?? '') as { orders: unknown[] }).orders,
      ).toHaveLength(1);
    });

    it('keeps managed ownership across trading key slots and prunes exact terminal history', async () => {
      const infra = createMockInfrastructure();
      const first = buildProvider({ platformDependencies: infra });
      const venue = setupTriggerVenue(first.clientInstance, first.bridge);
      expect(
        (
          await first.provider.updatePositionTPSL({
            symbol: 'BTC',
            stopLossPrice: '90000',
          })
        ).success,
      ).toBe(true);
      await first.provider.disconnect();
      const next = buildProvider({
        platformDependencies: infra,
        apiKeyIndex: 8,
      });
      const nextVenue = setupTriggerVenue(next.clientInstance, next.bridge, {
        apiKeyIndex: 8,
      });
      nextVenue.rawTriggers.push(...venue.rawTriggers);
      nextVenue.setNextIndex(venue.getNextIndex());
      next.clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [
          {
            ...ACCOUNT,
            positions: [{ ...ACCOUNT.positions[0], position: '0.2' }],
          },
        ],
      });
      expect(
        (
          await next.provider.updatePositionTPSL({
            symbol: 'BTC',
            stopLossPrice: '85000',
          })
        ).success,
      ).toBe(true);
      expect(nextVenue.rawTriggers).toHaveLength(1);
      nextVenue.rawInactive.push({
        ...nextVenue.rawTriggers[0],
        status: 'filled',
        remainingBaseAmount: '0',
      });
      nextVenue.rawTriggers.splice(0);
      expect(
        (
          await next.provider.updatePositionTPSL({
            symbol: 'BTC',
            stopLossPrice: '84000',
          })
        ).success,
      ).toBe(true);
      const stored = await infra.diskCache.getItem(
        `lighterManagedTpsl:testnet:${ACCOUNT.l1Address.toLowerCase()}:28:BTC`,
      );
      expect(
        (JSON.parse(stored ?? '') as { orders: unknown[] }).orders,
      ).toHaveLength(1);
    });

    it.each(['0.2', '0.05'])(
      'retains managed TP/SL ownership after resizing to %s and restarting',
      async (size) => {
        const infra = createMockInfrastructure();
        const first = buildProvider({ platformDependencies: infra });
        const venue = setupTriggerVenue(first.clientInstance, first.bridge);
        expect(
          (
            await first.provider.updatePositionTPSL({
              symbol: 'BTC',
              stopLossPrice: '90000',
            })
          ).success,
        ).toBe(true);
        const originalId = venue.rawTriggers[0].orderIndex;
        await first.provider.disconnect();
        const next = buildProvider({ platformDependencies: infra });
        const nextVenue = setupTriggerVenue(next.clientInstance, next.bridge);
        nextVenue.rawTriggers.push(...venue.rawTriggers);
        nextVenue.setNextIndex(venue.getNextIndex());
        next.clientInstance.getAccountByIndex.mockResolvedValue({
          code: 200,
          accounts: [
            {
              ...ACCOUNT,
              positions: [{ ...ACCOUNT.positions[0], position: size }],
            },
          ],
        });
        expect(
          (
            await next.provider.updatePositionTPSL({
              symbol: 'BTC',
              stopLossPrice: '85000',
            })
          ).success,
        ).toBe(true);
        expect(nextVenue.rawTriggers).toHaveLength(1);
        expect(nextVenue.rawTriggers[0].orderIndex).not.toBe(originalId);
        expect(nextVenue.rawTriggers[0].remainingBaseAmount).toBe(size);
        // Resize again before removal. Quantity is never the managed identity.
        next.clientInstance.getAccountByIndex.mockResolvedValue({
          code: 200,
          accounts: [ACCOUNT],
        });
        expect(
          (await next.provider.updatePositionTPSL({ symbol: 'BTC' })).success,
        ).toBe(true);
        expect(nextVenue.rawTriggers).toHaveLength(0);
      },
    );

    it.each([
      { position: '0.2', sign: 1 },
      { position: '0.1', sign: -1 },
    ])(
      'uses the in-lock position for legacy removal after %j',
      async (live) => {
        const { provider, clientInstance, bridge, calls } = buildProvider();
        const venue = setupTriggerVenue(clientInstance, bridge);
        venue.seedTrigger('stop-loss', '90000');
        const read = clientInstance.getActiveOrders.getMockImplementation() as (
          ...args: unknown[]
        ) => Promise<unknown>;
        clientInstance.getActiveOrders.mockImplementation(
          async (...args: unknown[]) => {
            // Public preflight already saw .1 long. The book read is inside the lock.
            clientInstance.getAccountByIndex.mockResolvedValue({
              code: 200,
              accounts: [
                {
                  ...ACCOUNT,
                  positions: [{ ...ACCOUNT.positions[0], ...live }],
                },
              ],
            });
            return read?.(...args);
          },
        );
        expect(
          (await provider.updatePositionTPSL({ symbol: 'BTC' })).success,
        ).toBe(true);
        expect(venue.rawTriggers).toHaveLength(1);
        expect(
          calls.filter((call) => call.function === '_signCancelOrder'),
        ).toHaveLength(0);
      },
    );

    it.each(['absent', 'zero', 'subtick', 'invalid-sign'] as const)(
      'removes only durable managed protection after live position becomes %s',
      async (state) => {
        const infra = createMockInfrastructure();
        const { provider, clientInstance, bridge, calls } = buildProvider({
          platformDependencies: infra,
        });
        const venue = setupTriggerVenue(clientInstance, bridge);
        expect(
          (
            await provider.updatePositionTPSL({
              symbol: 'BTC',
              stopLossPrice: '90000',
            })
          ).success,
        ).toBe(true);
        const managed = { ...venue.rawTriggers[0] };
        const managedKey = `lighterManagedTpsl:testnet:${ACCOUNT.l1Address.toLowerCase()}:28:BTC`;
        expect(await infra.diskCache.getItem(managedKey)).toContain(
          String(managed.clientOrderIndex),
        );
        for (const type of ['stop-loss', 'stop-loss-limit', 'limit']) {
          venue.seedTrigger(type, '85000');
        }
        const buySide = venue.seedTrigger('stop-loss', '85000');
        const buySideRow = venue.rawTriggers.find(
          (row) => row.orderIndex === buySide,
        );
        if (!buySideRow) {
          throw new Error('Missing unrecorded buy-side trigger');
        }
        buySideRow.isAsk = false;
        const partial = venue.seedTrigger('take-profit', '110000');
        const partialRow = venue.rawTriggers.find(
          (row) => row.orderIndex === partial,
        );
        if (!partialRow) {
          throw new Error('Missing independent order');
        }
        partialRow.initialBaseAmount = '0.001';
        partialRow.remainingBaseAmount = '0.001';
        const foreign = venue.seedTrigger('stop-loss', '85000');
        const foreignRow = venue.rawTriggers.find(
          (row) => row.orderIndex === foreign,
        );
        if (!foreignRow) {
          throw new Error('Missing foreign order');
        }
        foreignRow.ownerAccountIndex = 29;
        const preserved = venue.rawTriggers
          .filter((row) => row.orderIndex !== managed.orderIndex)
          .map((row) => ({ ...row }));
        const sizes = {
          zero: '0',
          subtick: '0.000000001',
          'invalid-sign': '0.1',
        };
        clientInstance.getAccountByIndex
          .mockResolvedValueOnce({ code: 200, accounts: [ACCOUNT] })
          .mockResolvedValue({
            code: 200,
            accounts: [
              {
                ...ACCOUNT,
                positions:
                  state === 'absent'
                    ? []
                    : [
                        {
                          ...ACCOUNT.positions[0],
                          position: sizes[state],
                          sign: state === 'invalid-sign' ? 0 : 1,
                        },
                      ],
              },
            ],
          });
        calls.length = 0;
        const result = await provider.updatePositionTPSL({ symbol: 'BTC' });
        expect(result.error).toBeUndefined();
        expect(result.success).toBe(true);
        expect(
          calls
            .filter((call) => call.function === '_signCancelOrder')
            .map((call) => String(call.params[2])),
        ).toStrictEqual([String(managed.orderIndex)]);
        expect(
          calls.filter(
            (call) =>
              call.function === '_signCreateOrder' ||
              call.function === '_signCreateGroupedOrders',
          ),
        ).toStrictEqual([]);
        expect(venue.rawTriggers).toStrictEqual(preserved);
        expect(await infra.diskCache.getItem(managedKey)).toBe(
          JSON.stringify({ version: 1, orders: [] }),
        );
      },
    );

    it.each([
      'read-failure',
      'missing-positions',
      'malformed-positions',
      'wrong-account',
      'missing-account',
    ] as const)(
      'refuses managed removal with %s live account evidence',
      async (state) => {
        const { provider, clientInstance, bridge, calls } = buildProvider();
        const venue = setupTriggerVenue(clientInstance, bridge);
        expect(
          (
            await provider.updatePositionTPSL({
              symbol: 'BTC',
              stopLossPrice: '90000',
            })
          ).success,
        ).toBe(true);
        const before = venue.rawTriggers.map((row) => ({ ...row }));
        clientInstance.getAccountByIndex.mockResolvedValueOnce({
          code: 200,
          accounts: [ACCOUNT],
        });
        if (state === 'read-failure') {
          clientInstance.getAccountByIndex.mockRejectedValue(
            new Error('unavailable'),
          );
        } else {
          const invalidPositions =
            state === 'missing-positions' ? undefined : {};
          clientInstance.getAccountByIndex.mockResolvedValue({
            code: 200,
            accounts:
              state === 'missing-account'
                ? []
                : [
                    {
                      ...ACCOUNT,
                      index: state === 'wrong-account' ? 29 : 28,
                      positions:
                        state === 'missing-positions' ||
                        state === 'malformed-positions'
                          ? invalidPositions
                          : [],
                    },
                  ],
          });
        }
        calls.length = 0;
        const result = await provider.updatePositionTPSL({ symbol: 'BTC' });
        expect(result.success).toBe(false);
        expect(
          calls.filter((call) => call.function.startsWith('_sign')),
        ).toStrictEqual([]);
        expect(venue.rawTriggers).toStrictEqual(before);
      },
    );

    it.each(['absent', 'zero', 'subtick', 'side-drift'] as const)(
      'still refuses replacement after live position becomes %s',
      async (state) => {
        const { provider, clientInstance, bridge, calls } = buildProvider();
        const venue = setupTriggerVenue(clientInstance, bridge);
        expect(
          (
            await provider.updatePositionTPSL({
              symbol: 'BTC',
              stopLossPrice: '90000',
            })
          ).success,
        ).toBe(true);
        const before = venue.rawTriggers.map((row) => ({ ...row }));
        clientInstance.getAccountByIndex
          .mockResolvedValueOnce({ code: 200, accounts: [ACCOUNT] })
          .mockResolvedValue({
            code: 200,
            accounts: [
              {
                ...ACCOUNT,
                positions:
                  state === 'absent'
                    ? []
                    : [
                        {
                          ...ACCOUNT.positions[0],
                          position: {
                            zero: '0',
                            subtick: '0.000000001',
                            absent: '0.1',
                            'side-drift': '0.1',
                          }[state],
                          sign: state === 'side-drift' ? -1 : 1,
                        },
                      ],
              },
            ],
          });
        calls.length = 0;
        const result = await provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '85000',
        });
        expect(result.success).toBe(false);
        expect(
          calls.filter((call) => call.function.startsWith('_sign')),
        ).toStrictEqual([]);
        expect(venue.rawTriggers).toStrictEqual(before);
      },
    );

    it.each([
      { name: 'growth', position: '0.2', sign: 1, changed: true },
      { name: 'shrink', position: '0.05', sign: 1, changed: true },
      { name: 'side flip', position: '0.1', sign: -1, changed: true },
      { name: 'unchanged', position: '0.1', sign: 1, changed: false },
    ])(
      'rechecks the position after held ownership storage: $name',
      async ({ position, sign, changed }) => {
        const infra = createMockInfrastructure();
        const { provider, clientInstance, bridge, calls } = buildProvider({
          platformDependencies: infra,
        });
        const venue = setupTriggerVenue(clientInstance, bridge);
        expect(
          (
            await provider.updatePositionTPSL({
              symbol: 'BTC',
              stopLossPrice: '90000',
            })
          ).success,
        ).toBe(true);
        const before = venue.rawTriggers.map((row) => ({ ...row }));
        const managedKey = `lighterManagedTpsl:testnet:${ACCOUNT.l1Address.toLowerCase()}:28:BTC`;
        const originalRead = infra.diskCache.getItem.bind(infra.diskCache);
        const entered = createDeferred<void>();
        const release = createDeferred<void>();
        let managedReads = 0;
        infra.diskCache.getItem = async (
          key: string,
        ): Promise<string | null> => {
          // Pruning reads ownership first. Hold the second read, after the
          // original implementation's authoritative position check.
          if (key === managedKey) {
            managedReads += 1;
          }
          if (key === managedKey && managedReads === 2) {
            entered.resolve();
            await release.promise;
          }
          return originalRead(key);
        };
        calls.length = 0;
        const pending = provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '85000',
        });
        await entered.promise;
        clientInstance.getAccountByIndex.mockResolvedValue({
          code: 200,
          accounts: [
            {
              ...ACCOUNT,
              positions: [{ ...ACCOUNT.positions[0], position, sign }],
            },
          ],
        });
        release.resolve();
        const result = await pending;
        expect(result.success).toBe(!changed);
        expect(
          result.error?.includes('position changed before TP/SL signing') ??
            false,
        ).toBe(changed);
        expect(
          calls.filter(
            (call) =>
              call.function === '_signCreateOrder' ||
              call.function === '_signCreateGroupedOrders' ||
              call.function === '_signCancelOrder',
          ),
        ).toHaveLength(changed ? 0 : 2);
        expect(venue.rawTriggers).toStrictEqual(
          changed
            ? before
            : [{ ...venue.rawTriggers[0], triggerPrice: '85000' }],
        );
        expect(venue.rawTriggers).toHaveLength(1);
        expect(venue.rawTriggers[0].triggerPrice).toBe(
          changed ? '90000' : '85000',
        );
      },
    );

    it('accepts legacy GTT trigger-market protection with a restorable wire intent', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '90000');
      venue.rawTriggers[0].timeInForce = 'good-till-time';
      expect(
        (await provider.updatePositionTPSL({ symbol: 'BTC' })).success,
      ).toBe(true);
      expect(venue.rawTriggers).toHaveLength(0);
    });

    it.each([
      ['stop_market', '0.001'],
      ['take_profit_market', '0.001'],
      ['stop_limit', '0.001'],
      ['take_profit_limit', '0.001'],
      ['stop_limit', '0.1'],
      ['take_profit_limit', '0.1'],
    ] as const)(
      'preserves a standalone reduce-only %s of size %s through position TP/SL replacement and removal',
      async (orderType, size) => {
        const { provider, clientInstance, bridge, calls } = buildProvider();
        const venue = setupTriggerVenue(clientInstance, bridge);
        const placed = await provider.placeOrder({
          symbol: 'BTC',
          isBuy: false,
          size,
          orderType,
          triggerPrice: '95000',
          ...(orderType.endsWith('_limit') && { price: '95100' }),
          reduceOnly: true,
        });
        const standalone = venue.rawTriggers.find(
          (row) => String(row.clientOrderIndex) === placed.orderId,
        );
        expect(placed.success).toBe(true);
        expect(standalone).toBeDefined();

        const updated = await provider.updatePositionTPSL({
          symbol: 'BTC',
          takeProfitPrice: '110000',
        });
        const removed = await provider.updatePositionTPSL({ symbol: 'BTC' });

        expect(updated.success).toBe(true);
        expect(removed.success).toBe(true);
        expect(venue.rawTriggers).toContainEqual(standalone);
        expect(
          calls
            .filter((call) => call.function === '_signCancelOrder')
            .some(
              (call) =>
                String(call.params[2]) === String(standalone?.orderIndex),
            ),
        ).toBe(false);
      },
    );
    it.each(['stop_market', 'take_profit_market'] as const)(
      'replaces a standalone full-position %s under the documented position-protection contract',
      async (orderType) => {
        const { provider, clientInstance, bridge } = buildProvider();
        const venue = setupTriggerVenue(clientInstance, bridge);
        const placed = await provider.placeOrder({
          symbol: 'BTC',
          isBuy: false,
          size: '0.1',
          orderType,
          triggerPrice: '95000',
          reduceOnly: true,
        });

        const updated = await provider.updatePositionTPSL({
          symbol: 'BTC',
          takeProfitPrice: '110000',
        });

        expect(updated.success).toBe(true);
        expect(
          venue.rawTriggers.some(
            (row) => String(row.clientOrderIndex) === placed.orderId,
          ),
        ).toBe(false);
        expect(venue.rawTriggers).toHaveLength(1);
        expect(venue.rawTriggers[0].triggerPrice).toBe('110000');
      },
    );
    it("a malformed venue position size ('0.1oops') fails closed with an explicit error and zero signer mutation", async () => {
      const { provider, calls, clientInstance } = buildProvider();
      clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [
          {
            ...ACCOUNT,
            positions: [{ ...ACCOUNT.positions[0], position: '0.1oops' }],
          },
        ],
      });
      // Reads surface an explicit data error — never a silently-coerced
      // '0.1' or a silent empty list that can preserve stale views.
      await expect(provider.getPositions()).rejects.toThrow(
        'Invalid Lighter venue data',
      );
      const tpsl = await provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '110000',
      });
      expect(tpsl.success).toBe(false);
      expect(tpsl.error).toContain('Invalid Lighter venue data');
      const close = await provider.closePosition({
        symbol: 'BTC',
        currentPrice: 100000,
      });
      expect(close.success).toBe(false);
      expect(close.error).toContain('Invalid Lighter venue data');
      const closeValidation = await provider.validateClosePosition({
        symbol: 'BTC',
        currentPrice: 100000,
      });
      expect(closeValidation.isValid).toBe(false);
      expect(closeValidation.error).toContain('Invalid Lighter venue data');
      expect(calls).toHaveLength(0);
    });

    it('two concurrent replacements serialize: the second cannot snapshot while the first transition is mid-flight', async () => {
      const { provider, calls, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      // Stall the FIRST replacement inside its transition: snapshot done,
      // creation signing held.
      // Deterministic pre-lock signal: the second call's preflight ends
      // with its getPositions account read — wait for that, then flush a
      // macrotask, instead of asserting against a sleep.
      let accountReads = 0;
      let signalSecondPreflight = (): void => undefined;
      const secondPreflightDone = new Promise<void>((resolve) => {
        signalSecondPreflight = resolve;
      });
      const realGetAccount =
        clientInstance.getAccountByIndex.getMockImplementation() as () => Promise<unknown>;
      clientInstance.getAccountByIndex.mockImplementation(async () => {
        const result = await realGetAccount();
        accountReads += 1;
        if (accountReads >= 2) {
          signalSecondPreflight();
        }
        return result;
      });
      const gateEntered = venue.armCreateGate();
      const firstPromise = provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      await gateEntered;
      const secondPromise = provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      await secondPreflightDone;
      await new Promise((resolve) => setTimeout(resolve, 0));
      // FULL-TRANSITION EXCLUSION: the second call has provably finished
      // its pre-lock preflight, yet while the first is stalled mid-create
      // it must NOT have reached getActiveOrders — unserialized code reads
      // here and double-snapshots the seed trigger.
      expect(venue.events.filter((event) => event === 'read')).toHaveLength(1);
      venue.releaseCreateGate();
      const [first, second] = await Promise.all([firstPromise, secondPromise]);
      expect(first.success).toBe(true);
      expect(second.success).toBe(true);
      // Serial outcome: the second snapshots the first's fresh trigger and
      // cancels it — exactly ONE protection set remains, with the second
      // read strictly after the first transition's cancel.
      expect(venue.rawTriggers).toHaveLength(1);
      expect(venue.rawTriggers[0].triggerPrice).toBe('86000');
      expect(
        calls.filter((call) => call.function === '_signCancelOrder'),
      ).toHaveLength(2);
      // The second op's create happened strictly after the first op's
      // cancel (full-transition exclusion; both ops' own barrier reads
      // sit between).
      const cancelEvents = venue.events.filter(
        (event) => event === 'cancel' || event === 'create',
      );
      expect(cancelEvents).toStrictEqual([
        'create',
        'cancel',
        'create',
        'cancel',
      ]);
    });

    it('replacement vs concurrent remove serializes: the remove sees and clears the fresh protection', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      let accountReads = 0;
      let signalSecondPreflight = (): void => undefined;
      const secondPreflightDone = new Promise<void>((resolve) => {
        signalSecondPreflight = resolve;
      });
      const realGetAccount =
        clientInstance.getAccountByIndex.getMockImplementation() as () => Promise<unknown>;
      clientInstance.getAccountByIndex.mockImplementation(async () => {
        const result = await realGetAccount();
        accountReads += 1;
        if (accountReads >= 2) {
          signalSecondPreflight();
        }
        return result;
      });
      const gateEntered = venue.armCreateGate();
      const replacePromise = provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      await gateEntered;
      const removePromise = provider.updatePositionTPSL({ symbol: 'BTC' });
      await secondPreflightDone;
      await new Promise((resolve) => setTimeout(resolve, 0));
      // The remove has provably passed its pre-lock preflight, yet must
      // NOT snapshot while the replacement is mid-flight — a stale
      // snapshot would cancel only the seed and "successfully" remove
      // nothing of the fresh protection.
      expect(venue.events.filter((event) => event === 'read')).toHaveLength(1);
      venue.releaseCreateGate();
      const [replaced, removed] = await Promise.all([
        replacePromise,
        removePromise,
      ]);
      expect(replaced.success).toBe(true);
      expect(removed.success).toBe(true);
      // Serial outcome: replace lands 85000 (seed cancelled), then remove
      // snapshots the fresh trigger and clears it.
      expect(venue.rawTriggers).toHaveLength(0);
    });

    it('an active-orders REST failure rejects remove AND replace with zero mutation calls', async () => {
      const deps = createMockInfrastructure();
      const { provider, calls, clientInstance } = buildProvider({
        platformDependencies: deps,
      });
      const logError = getLoggerErrorMock(deps);
      clientInstance.getActiveOrders.mockRejectedValue(
        new Error('active orders REST down'),
      );
      const removed = await provider.updatePositionTPSL({ symbol: 'BTC' });
      expect(removed.success).toBe(false);
      expect(removed.error).toContain('active orders REST down');
      const replaced = await provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '110000',
      });
      expect(replaced.success).toBe(false);
      expect(replaced.error).toContain('active orders REST down');
      // A swallowed [] would have let remove "succeed" cancelling nothing
      // and replace "succeed" with the old triggers still live.
      expect(
        calls.filter((call) =>
          [
            '_signCreateOrder',
            '_signCreateGroupedOrders',
            '_signCancelOrder',
          ].includes(call.function),
        ),
      ).toHaveLength(0);
      expect(logError).toHaveBeenCalledTimes(2);
      const [reportedError, reportedOptions] = logError.mock.calls[0];
      if (!reportedOptions) {
        throw new Error('Expected Lighter TP/SL error context');
      }
      expect(reportedError.message).toBe('active orders REST down');
      expect(reportedOptions.tags).toMatchObject({
        operation: 'position_management',
        action: 'position_tpsl_update',
      });
    });

    it.each(['single', 'pair', 'filled', 'oco-mixed'] as const)(
      'returns exact position protection receipts for %s',
      async (mode) => {
        const { provider, clientInstance, bridge } = buildProvider();
        const venue = setupTriggerVenue(clientInstance, bridge);
        const oldId = venue.seedTrigger('stop-loss', '80000');
        if (mode === 'filled' || mode === 'oco-mixed') {
          venue.setCreateTerminal(mode);
        }
        const pair = mode === 'pair' || mode === 'oco-mixed';
        const result = await provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '85000',
          ...(pair ? { takeProfitPrice: '110000' } : {}),
        });
        expect(result.success).toBe(true);
        const created = [...venue.rawTriggers, ...venue.rawInactive].filter(
          (row) => row.orderIndex !== oldId,
        );
        expect(result.childOrderIds).toStrictEqual(
          created.map((row) => String(row.orderIndex)),
        );
        expect(result.childOrderIds).toHaveLength(pair ? 2 : 1);
      },
    );

    it('ignores conflicting inactive identities outside the requested clients', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.setCreateTerminal('filled');
      clientInstance.getInactiveOrders.mockImplementation(async () => ({
        code: 200,
        orders: [
          ...venue.rawInactive,
          ...venue.rawInactive.flatMap((row) => [
            { ...row, clientOrderIndex: 0, orderIndex: 501 },
            { ...row, clientOrderIndex: 0, orderIndex: 502 },
          ]),
        ],
      }));
      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(result.success).toBe(true);
      expect(result.childOrderIds).toStrictEqual(
        venue.rawInactive.map((row) => String(row.orderIndex)),
      );
    });

    it.each([
      { size: '0.2', entryPrice: '100000' },
      { size: '-0.001', entryPrice: '100000' },
      { size: '0.001', entryPrice: '99999' },
    ])(
      'rejects a different expected protection position %j',
      async (expectedPosition) => {
        const { provider, calls } = buildProvider();
        const result = await provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '85000',
          expectedPosition,
        });
        expect(result.success).toBe(false);
        expect(result.error).toBe(PERPS_ERROR_CODES.TPSL_UPDATE_FAILED);
        expect(
          calls.filter((call) => call.function.startsWith('_sign')),
        ).toHaveLength(0);
      },
    );

    it.each(['resize', 'flip', 'vanished'])(
      'returns the structured error for intermediate position %s before signing',
      async (change) => {
        const { provider, clientInstance, bridge, calls } = buildProvider();
        const venue = setupTriggerVenue(clientInstance, bridge);
        const oldId = venue.seedTrigger('stop-loss', '80000');
        clientInstance.getActiveOrders.mockImplementation(async () => {
          clientInstance.getAccountByIndex.mockResolvedValue({
            code: 200,
            accounts: [
              {
                ...ACCOUNT,
                positions:
                  change === 'vanished'
                    ? []
                    : [
                        {
                          ...ACCOUNT.positions[0],
                          position:
                            change === 'resize'
                              ? '0.002'
                              : ACCOUNT.positions[0].position,
                          sign: change === 'flip' ? -1 : 1,
                        },
                      ],
              },
            ],
          });
          return {
            code: 200,
            orders: venue.rawTriggers.map((row) => ({ ...row })),
          };
        });
        const result = await provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '85000',
          expectedPosition: {
            size: ACCOUNT.positions[0].position,
            entryPrice: ACCOUNT.positions[0].avgEntryPrice,
          },
        });
        expect(result.error).toBe(PERPS_ERROR_CODES.TPSL_UPDATE_FAILED);
        expect(result.success).toBe(false);
        expect(
          calls.filter((call) =>
            ['_signCreateOrder', '_signCancelOrder'].includes(call.function),
          ),
        ).toHaveLength(0);
        expect(
          clientInstance.sendTx.mock.calls.filter(
            ([kind]) => kind === 14 || kind === 15,
          ),
        ).toHaveLength(0);
        expect(venue.rawTriggers.map((row) => row.orderIndex)).toStrictEqual([
          oldId,
        ]);
      },
    );

    it.each(['absent', 'zero', 'subtick', 'invalid-sign'] as const)(
      'retains explicit removal preconditions when live position becomes %s',
      async (state) => {
        const { provider, clientInstance, bridge, calls } = buildProvider();
        const venue = setupTriggerVenue(clientInstance, bridge);
        expect(
          (
            await provider.updatePositionTPSL({
              symbol: 'BTC',
              stopLossPrice: '90000',
            })
          ).success,
        ).toBe(true);
        const before = venue.rawTriggers.map((row) => ({ ...row }));
        const positions = {
          zero: '0',
          subtick: '0.000000001',
          'invalid-sign': ACCOUNT.positions[0].position,
        };
        let driftInjected = false;
        clientInstance.getActiveOrders.mockImplementation(async () => {
          if (!driftInjected) {
            driftInjected = true;
            // Only the post-prune read sees drift. Later final readers see
            // valid evidence, so this specifically protects that boundary.
            clientInstance.getAccountByIndex.mockResolvedValueOnce({
              code: 200,
              accounts: [
                {
                  ...ACCOUNT,
                  positions:
                    state === 'absent'
                      ? []
                      : [
                          {
                            ...ACCOUNT.positions[0],
                            position: positions[state],
                            sign: state === 'invalid-sign' ? 0 : 1,
                          },
                        ],
                },
              ],
            });
          }
          return {
            code: 200,
            orders: venue.rawTriggers.map((row) => ({ ...row })),
          };
        });
        calls.length = 0;
        const result = await provider.updatePositionTPSL({
          symbol: 'BTC',
          expectedPosition: {
            size: ACCOUNT.positions[0].position,
            entryPrice: ACCOUNT.positions[0].avgEntryPrice,
          },
        });
        expect(driftInjected).toBe(true);
        expect(result.success).toBe(false);
        expect(result.error).toBe(PERPS_ERROR_CODES.TPSL_UPDATE_FAILED);
        expect(
          calls.filter((call) => call.function.startsWith('_sign')),
        ).toStrictEqual([]);
        expect(venue.rawTriggers).toStrictEqual(before);
      },
    );

    describe('final expected-position authority after signing', () => {
      for (const operation of ['create', 'remove'] as const) {
        it.each([
          'wrong-account',
          'duplicate-account',
          'missing-positions',
          'malformed-positions',
          'sign-zero',
          'sign-two',
        ] as const)(
          `refuses ${operation} with %s evidence and permits a refreshed retry`,
          async (evidence) => {
            const infra = createMockInfrastructure();
            const { provider, clientInstance, bridge } = buildProvider({
              platformDependencies: infra,
            });
            const venue = setupTriggerVenue(clientInstance, bridge);
            expect(
              (
                await provider.updatePositionTPSL({
                  symbol: 'BTC',
                  stopLossPrice: '80000',
                })
              ).success,
            ).toBe(true);
            const oldOrders = venue.rawTriggers.map((row) => ({ ...row }));
            const managedKey = `lighterManagedTpsl:testnet:${ACCOUNT.l1Address.toLowerCase()}:28:BTC`;
            const journalKey = `lighterTpslJournal:testnet:${ACCOUNT.l1Address.toLowerCase()}:28:7:BTC`;
            const ledgerKey = 'lighterNonceLedger:testnet:28:7';
            const ownership = await infra.diskCache.getItem(managedKey);
            const ledgerBefore = await infra.diskCache.getItem(ledgerKey);
            expect(ownership).not.toBeNull();
            expect(ledgerBefore).not.toBeNull();
            const expectedPosition = {
              size: ACCOUNT.positions[0].position,
              entryPrice: ACCOUNT.positions[0].avgEntryPrice,
            };
            const started = createDeferred<void>();
            const release = createDeferred<void>();
            const execute = vi.spyOn(bridge, 'execute');
            const original = execute.getMockImplementation();
            if (!original) {
              throw new Error('Expected configured Lighter bridge');
            }
            execute.mockImplementation(async (call: LighterWasmCall) => {
              const signed = await original(call);
              if (
                call.function ===
                (operation === 'create'
                  ? '_signCreateOrder'
                  : '_signCancelOrder')
              ) {
                started.resolve();
                await release.promise;
              }
              return signed;
            });
            const pending = provider.updatePositionTPSL({
              symbol: 'BTC',
              ...(operation === 'create' ? { stopLossPrice: '85000' } : {}),
              expectedPosition,
            });
            await started.promise;
            clientInstance.sendTx.mockClear();
            const invalidAccount = {
              ...ACCOUNT,
              ...(evidence === 'wrong-account' ? { index: 29 } : {}),
              ...(evidence === 'missing-positions'
                ? { positions: undefined }
                : {}),
              ...(evidence === 'malformed-positions' ? { positions: {} } : {}),
              ...(evidence === 'sign-zero' || evidence === 'sign-two'
                ? {
                    positions: [
                      {
                        ...ACCOUNT.positions[0],
                        sign: evidence === 'sign-zero' ? 0 : 2,
                      },
                    ],
                  }
                : {}),
            };
            clientInstance.getAccountByIndex.mockResolvedValue({
              code: 200,
              accounts:
                evidence === 'duplicate-account'
                  ? [invalidAccount, invalidAccount]
                  : [invalidAccount],
            });
            release.resolve();
            const result = await pending;
            expect(result.success).toBe(false);
            expect(result.error).toBe(PERPS_ERROR_CODES.TPSL_UPDATE_FAILED);
            expect(clientInstance.sendTx).not.toHaveBeenCalled();
            expect(venue.rawTriggers).toStrictEqual(oldOrders);
            expect(await infra.diskCache.getItem(managedKey)).toBe(ownership);
            expect(await infra.diskCache.getItem(journalKey)).toBeNull();
            expect(await infra.diskCache.getItem(ledgerKey)).toBe(ledgerBefore);
            clientInstance.getAccountByIndex.mockResolvedValue({
              code: 200,
              accounts: [ACCOUNT],
            });
            execute.mockImplementation(original);
            const retry = await provider.updatePositionTPSL({
              symbol: 'BTC',
              ...(operation === 'create' ? { stopLossPrice: '85000' } : {}),
              expectedPosition,
            });
            expect(retry.success).toBe(true);
            expect(venue.rawTriggers).toHaveLength(
              operation === 'create' ? 1 : 0,
            );
            expect(await infra.diskCache.getItem(journalKey)).toBeNull();
            await provider.disconnect();
          },
        );
      }
    });

    it.each(['read', 'restart'] as const)(
      'clears fully dispatched guarded removal after foreground book timeout and %s recovery',
      async (recoveryMode) => {
        const infra = createMockInfrastructure();
        const original = buildProvider({
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
        });
        const venue = setupTriggerVenue(
          original.clientInstance,
          original.bridge,
        );
        venue.seedTrigger('take-profit', '110000');
        venue.seedTrigger('stop-loss', '80000');
        const initialOrders = venue.rawTriggers.map((row) => ({ ...row }));
        venue.setRestLag(100);
        const result = await original.provider.updatePositionTPSL({
          symbol: 'BTC',
          expectedPosition: {
            size: ACCOUNT.positions[0].position,
            entryPrice: ACCOUNT.positions[0].avgEntryPrice,
          },
        });
        expect(result.success).toBe(false);
        expect(result.error).toContain('settlement is not yet visible');
        expect(original.clientInstance.sendTx).toHaveBeenCalledTimes(2);
        expect(venue.rawTriggers).toStrictEqual([]);
        const settlementKey = `${ACCOUNT.l1Address.toLowerCase()}:28:7:BTC`;
        const journalKey = `lighterTpslJournal:testnet:${settlementKey}`;
        expect(await infra.diskCache.getItem(journalKey)).not.toBeNull();
        let recovering = original;
        let recoveryVenue = venue;
        if (recoveryMode === 'restart') {
          await original.provider.disconnect();
          recovering = buildProvider({
            platformDependencies: infra,
            registeredKey: '9c'.repeat(40),
          });
          recoveryVenue = setupTriggerVenue(
            recovering.clientInstance,
            recovering.bridge,
          );
          recoveryVenue.setVenueNonce(venue.getVenueNonce());
          for (const [hash, transaction] of venue.landedTxs) {
            recoveryVenue.landedTxs.set(hash, transaction);
          }
        }
        recoveryVenue.primeLag(initialOrders, 100);
        const submissions = recovering.clientInstance.sendTx.mock.calls.length;
        await recovering.provider.getOpenOrders();
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(await infra.diskCache.getItem(journalKey)).not.toBeNull();
        expect(recovering.clientInstance.sendTx).toHaveBeenCalledTimes(
          submissions,
        );
        // All attempts have landed, but recovery must retain ownership while
        // their target orders are still visible in the lagging venue read.
        recoveryVenue.setRestLag(0);
        recoveryVenue.primeLag([], 0);
        for (let attempt = 0; attempt < 40; attempt += 1) {
          await recovering.provider.getOpenOrders();
          if ((await infra.diskCache.getItem(journalKey)) === null) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        expect(await infra.diskCache.getItem(journalKey)).toBeNull();
        expect(
          await recovering.provider.getPendingManualRecoveries(),
        ).toStrictEqual([]);
        expect(recovering.clientInstance.sendTx).toHaveBeenCalledTimes(
          submissions,
        );
        expect(recoveryVenue.rawTriggers).toStrictEqual([]);
        await recovering.provider.disconnect();
      },
    );

    it.each([
      ['read', 'resize'],
      ['restart', 'resize'],
      ['read', 'entry-drift'],
      ['restart', 'entry-drift'],
    ] as const)(
      'parks a partially dispatched removal with %s recovery after %s during the second signature',
      async (recoveryMode, change) => {
        const infra = createMockInfrastructure();
        const original = buildProvider({
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
        });
        const venue = setupTriggerVenue(
          original.clientInstance,
          original.bridge,
        );
        const firstId = venue.seedTrigger('take-profit', '110000');
        const survivingId = venue.seedTrigger('stop-loss', '80000');
        const initialOrders = venue.rawTriggers.map((row) => ({ ...row }));
        const managedKey = `lighterManagedTpsl:testnet:${ACCOUNT.l1Address.toLowerCase()}:28:BTC`;
        await infra.diskCache.setItem(
          managedKey,
          JSON.stringify({
            version: 1,
            orders: initialOrders.map((row) => ({
              clientId: String(row.clientOrderIndex),
              orderId: String(row.orderIndex),
            })),
          }),
        );
        const livePosition = {
          ...ACCOUNT.positions[0],
          ...(change === 'resize'
            ? { position: '0.2' }
            : { avgEntryPrice: '100001' }),
        };
        const execute = vi.spyOn(original.bridge, 'execute');
        const implementation = execute.getMockImplementation();
        if (!implementation) {
          throw new Error('Expected configured Lighter signer bridge');
        }
        let cancellationSignatures = 0;
        execute.mockImplementation(async (call: LighterWasmCall) => {
          const signed = await implementation(call);
          if (call.function === '_signCancelOrder') {
            cancellationSignatures += 1;
            if (cancellationSignatures === 2) {
              original.clientInstance.getAccountByIndex.mockResolvedValue({
                code: 200,
                accounts: [{ ...ACCOUNT, positions: [livePosition] }],
              });
            }
          }
          return signed;
        });
        venue.setRestLag(100);
        const result = await original.provider.updatePositionTPSL({
          symbol: 'BTC',
          expectedPosition: {
            size: ACCOUNT.positions[0].position,
            entryPrice: ACCOUNT.positions[0].avgEntryPrice,
          },
        });
        expect(result).toMatchObject({
          success: false,
          error: PERPS_ERROR_CODES.TPSL_UPDATE_FAILED,
        });
        expect(cancellationSignatures).toBe(2);
        expect(original.clientInstance.sendTx).toHaveBeenCalledTimes(1);
        expect(venue.rawTriggers.map((row) => row.orderIndex)).toStrictEqual([
          survivingId,
        ]);
        const settlementKey = `${ACCOUNT.l1Address.toLowerCase()}:28:7:BTC`;
        const journalKey = `lighterTpslJournal:testnet:${settlementKey}`;
        const pointer = JSON.parse(
          (await infra.diskCache.getItem(journalKey)) ?? '',
        ) as { operationId: string };
        const payloadKey = `lighterTpslJournalOp:testnet:${settlementKey}:${pointer.operationId}`;
        const payload = JSON.parse(
          (await infra.diskCache.getItem(payloadKey)) ?? '',
        ) as { attempts: { kind: string; orderId: string; outcome: string }[] };
        expect(payload.attempts).toStrictEqual([
          expect.objectContaining({
            kind: 'cancel',
            orderId: String(firstId),
            outcome: 'accepted',
          }),
        ]);

        let recovering = original;
        let recoveryVenue = venue;
        if (recoveryMode === 'restart') {
          await original.provider.disconnect();
          recovering = buildProvider({
            platformDependencies: infra,
            registeredKey: '9c'.repeat(40),
          });
          recoveryVenue = setupTriggerVenue(
            recovering.clientInstance,
            recovering.bridge,
          );
          recoveryVenue.rawTriggers.push(...venue.rawTriggers);
          recoveryVenue.setVenueNonce(venue.getVenueNonce());
          for (const [hash, transaction] of venue.landedTxs) {
            recoveryVenue.landedTxs.set(hash, transaction);
          }
          recoveryVenue.primeLag(initialOrders, 100);
          recovering.clientInstance.getAccountByIndex.mockResolvedValue({
            code: 200,
            accounts: [{ ...ACCOUNT, positions: [livePosition] }],
          });
        }
        const submissionsBefore =
          recovering.clientInstance.sendTx.mock.calls.length;
        const lookupFinished = createDeferred<void>();
        const lookup =
          recovering.clientInstance.getTx.getMockImplementation() as
            | ((hash: string) => Promise<unknown>)
            | undefined;
        if (!lookup) {
          throw new Error('Expected configured transaction lookup');
        }
        recovering.clientInstance.getTx.mockImplementation(
          async (hash: string) => {
            const transaction = await lookup(hash);
            lookupFinished.resolve();
            return transaction;
          },
        );
        await recovering.provider.getOpenOrders();
        await lookupFinished.promise;
        await new Promise((resolve) => setImmediate(resolve));
        // Accepted first cancellation is still hidden by the book snapshot.
        // Its obligation must remain durable while later cancellation stays
        // refused, including across a fresh provider lifetime.
        expect(await infra.diskCache.getItem(journalKey)).not.toBeNull();
        expect(recovering.clientInstance.sendTx).toHaveBeenCalledTimes(
          submissionsBefore,
        );
        expect(
          recoveryVenue.rawTriggers.map((row) => row.orderIndex),
        ).toStrictEqual([survivingId]);

        expect(
          await recovering.provider.getPendingManualRecoveries(),
        ).toStrictEqual([
          expect.objectContaining({
            priorIntent: 'remove',
            reason: expect.stringContaining(
              'position precondition failed',
            ) as string,
          }),
        ]);
        recoveryVenue.setRestLag(0);
        recoveryVenue.primeLag([], 0);
        for (let attempt = 0; attempt < 40; attempt += 1) {
          await recovering.provider.getOpenOrders();
          if ((await infra.diskCache.getItem(journalKey)) === null) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        expect(recovering.clientInstance.sendTx).toHaveBeenCalledTimes(
          submissionsBefore,
        );
        expect(
          recoveryVenue.rawTriggers.map((row) => row.orderIndex),
        ).toStrictEqual([survivingId]);
        expect(await infra.diskCache.getItem(journalKey)).toBeNull();
        expect(
          await recovering.provider.getPendingManualRecoveries(),
        ).toStrictEqual([
          expect.objectContaining({
            symbol: 'BTC',
            settlementKey,
            priorIntent: 'remove',
            reason: expect.stringContaining(
              'position precondition failed',
            ) as string,
            survivingOrderIds: [String(survivingId)],
            actionNeeded: expect.stringContaining(
              'new explicit TP/SL removal',
            ) as string,
          }),
        ]);
        const refreshed = await recovering.provider.updatePositionTPSL({
          symbol: 'BTC',
          expectedPosition: {
            size: livePosition.position,
            entryPrice: livePosition.avgEntryPrice,
          },
        });
        expect(refreshed.success).toBe(true);
        expect(recoveryVenue.rawTriggers).toStrictEqual([]);
        expect(recovering.clientInstance.sendTx).toHaveBeenCalledTimes(
          submissionsBefore + 1,
        );
        expect(
          await recovering.provider.getPendingManualRecoveries(),
        ).toStrictEqual([]);
        await recovering.provider.disconnect();
      },
    );

    it.each(['read', 'restart'] as const)(
      'never resumes guarded removal after refused-phase storage failure, signed expiry and %s recovery',
      async (recoveryMode) => {
        const infra = createMockInfrastructure();
        const write = vi.spyOn(infra.diskCache, 'setItem');
        const originalWrite = write.getMockImplementation();
        if (!originalWrite) {
          throw new Error('Expected disk fixture');
        }
        let failManualWrite = false;
        let rejectedWrites = 0;
        write.mockImplementation(async (key: string, value: string) => {
          if (failManualWrite && key.startsWith('lighterTpslJournalOp:')) {
            const payload = JSON.parse(value) as {
              phase: string;
              attempts: { outcome: string }[];
            };
            if (
              payload.phase === 'manual' &&
              payload.attempts.length === 1 &&
              payload.attempts[0].outcome === 'accepted'
            ) {
              rejectedWrites += 1;
              throw new Error('manual refusal payload write failed');
            }
          }
          return await originalWrite(key, value);
        });
        const original = buildProvider({
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
        });
        const venue = setupTriggerVenue(
          original.clientInstance,
          original.bridge,
        );
        const firstId = venue.seedTrigger('take-profit', '110000');
        const survivingId = venue.seedTrigger('stop-loss', '80000');
        const initialOrders = venue.rawTriggers.map((row) => ({ ...row }));
        const managedKey = `lighterManagedTpsl:testnet:${ACCOUNT.l1Address.toLowerCase()}:28:BTC`;
        await infra.diskCache.setItem(
          managedKey,
          JSON.stringify({
            version: 1,
            orders: initialOrders.map((row) => ({
              clientId: String(row.clientOrderIndex),
              orderId: String(row.orderIndex),
            })),
          }),
        );
        const livePosition = { ...ACCOUNT.positions[0], position: '0.2' };
        const execute = vi.spyOn(original.bridge, 'execute');
        const implementation = execute.getMockImplementation();
        if (!implementation) {
          throw new Error('Expected configured Lighter signer bridge');
        }
        let cancellationSignatures = 0;
        execute.mockImplementation(async (call: LighterWasmCall) => {
          const signed = await implementation(call);
          if (call.function === '_signCancelOrder') {
            cancellationSignatures += 1;
            if (cancellationSignatures === 2) {
              failManualWrite = true;
              original.clientInstance.getAccountByIndex.mockResolvedValue({
                code: 200,
                accounts: [{ ...ACCOUNT, positions: [livePosition] }],
              });
            }
          }
          return signed;
        });
        venue.setRestLag(100);
        const result = await original.provider.updatePositionTPSL({
          symbol: 'BTC',
          expectedPosition: {
            size: ACCOUNT.positions[0].position,
            entryPrice: ACCOUNT.positions[0].avgEntryPrice,
          },
        });
        expect(result).toMatchObject({
          success: false,
          error: PERPS_ERROR_CODES.TPSL_UPDATE_FAILED,
        });
        expect(cancellationSignatures).toBe(2);
        expect(rejectedWrites).toBeGreaterThan(0);
        failManualWrite = false;
        expect(original.clientInstance.sendTx).toHaveBeenCalledTimes(1);
        expect(venue.rawTriggers.map((row) => row.orderIndex)).toStrictEqual([
          survivingId,
        ]);
        const settlementKey = `${ACCOUNT.l1Address.toLowerCase()}:28:7:BTC`;
        const journalKey = `lighterTpslJournal:testnet:${settlementKey}`;
        const pointer = JSON.parse(
          (await infra.diskCache.getItem(journalKey)) ?? '',
        ) as { operationId: string };
        const payloadKey = `lighterTpslJournalOp:testnet:${settlementKey}:${pointer.operationId}`;
        const payload = JSON.parse(
          (await infra.diskCache.getItem(payloadKey)) ?? '',
        ) as { attempts: { kind: string; orderId: string; outcome: string }[] };
        expect(payload.attempts).toStrictEqual([
          expect.objectContaining({
            kind: 'cancel',
            orderId: String(firstId),
            outcome: 'accepted',
          }),
          expect.objectContaining({
            kind: 'cancel',
            orderId: String(survivingId),
            outcome: 'unknown',
          }),
        ]);

        const originalNow = Date.now.bind(Date);
        const clock = vi.spyOn(Date, 'now').mockImplementation(function () {
          return originalNow() + 700_000;
        });
        try {
          let recovering = original;
          let recoveryVenue = venue;
          if (recoveryMode === 'restart') {
            await original.provider.disconnect();
            recovering = buildProvider({
              platformDependencies: infra,
              registeredKey: '9c'.repeat(40),
            });
            recoveryVenue = setupTriggerVenue(
              recovering.clientInstance,
              recovering.bridge,
            );
            recoveryVenue.rawTriggers.push(...venue.rawTriggers);
            recoveryVenue.setVenueNonce(venue.getVenueNonce());
            for (const [hash, transaction] of venue.landedTxs) {
              recoveryVenue.landedTxs.set(hash, transaction);
            }
            recoveryVenue.primeLag(initialOrders, 100);
            recovering.clientInstance.getAccountByIndex.mockResolvedValue({
              code: 200,
              accounts: [{ ...ACCOUNT, positions: [livePosition] }],
            });
          }
          const submissionsBefore =
            recovering.clientInstance.sendTx.mock.calls.length;
          const lookupFinished = createDeferred<void>();
          const lookup =
            recovering.clientInstance.getTx.getMockImplementation() as
              | ((hash: string) => Promise<unknown>)
              | undefined;
          if (!lookup) {
            throw new Error('Expected configured transaction lookup');
          }
          recovering.clientInstance.getTx.mockImplementation(
            async (hash: string) => {
              const transaction = await lookup(hash);
              lookupFinished.resolve();
              return transaction;
            },
          );
          await recovering.provider.getOpenOrders();
          await lookupFinished.promise;
          await new Promise((resolve) => setImmediate(resolve));
          // Accepted first cancellation is still hidden by the book snapshot.
          // Its obligation must remain durable while later cancellation stays
          // refused, including across a fresh provider lifetime.
          expect(await infra.diskCache.getItem(journalKey)).not.toBeNull();
          expect(recovering.clientInstance.sendTx).toHaveBeenCalledTimes(
            submissionsBefore,
          );
          expect(
            recoveryVenue.rawTriggers.map((row) => row.orderIndex),
          ).toStrictEqual([survivingId]);

          expect(
            await recovering.provider.getPendingManualRecoveries(),
          ).toStrictEqual([
            expect.objectContaining({
              priorIntent: 'remove',
              reason: expect.stringContaining(
                'position precondition failed',
              ) as string,
            }),
          ]);
          recoveryVenue.setRestLag(0);
          recoveryVenue.primeLag([], 0);
          for (let attempt = 0; attempt < 80; attempt += 1) {
            await recovering.provider.getOpenOrders();
            if ((await infra.diskCache.getItem(journalKey)) === null) {
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          expect(recovering.clientInstance.sendTx).toHaveBeenCalledTimes(
            submissionsBefore,
          );
          expect(
            recoveryVenue.rawTriggers.map((row) => row.orderIndex),
          ).toStrictEqual([survivingId]);
          expect(await infra.diskCache.getItem(journalKey)).toBeNull();
          expect(
            await recovering.provider.getPendingManualRecoveries(),
          ).toStrictEqual([
            expect.objectContaining({
              symbol: 'BTC',
              settlementKey,
              priorIntent: 'remove',
              reason: expect.stringContaining(
                'position precondition failed',
              ) as string,
              survivingOrderIds: [String(survivingId)],
            }),
          ]);
          const refreshed = await recovering.provider.updatePositionTPSL({
            symbol: 'BTC',
            expectedPosition: {
              size: livePosition.position,
              entryPrice: livePosition.avgEntryPrice,
            },
          });
          expect(refreshed.success).toBe(true);
          expect(recoveryVenue.rawTriggers).toStrictEqual([]);
          expect(recovering.clientInstance.sendTx).toHaveBeenCalledTimes(
            submissionsBefore + 1,
          );
          expect(
            await recovering.provider.getPendingManualRecoveries(),
          ).toStrictEqual([]);
          await recovering.provider.disconnect();
        } finally {
          clock.mockRestore();
        }
      },
    );

    it.each(['resize', 'entry-drift'])(
      'releases an unsent removal after position %s during cancel signing',
      async (change) => {
        const infra = createMockInfrastructure();
        const { provider, clientInstance, bridge } = buildProvider({
          platformDependencies: infra,
        });
        const venue = setupTriggerVenue(clientInstance, bridge);
        expect(
          (
            await provider.updatePositionTPSL({
              symbol: 'BTC',
              stopLossPrice: '80000',
            })
          ).success,
        ).toBe(true);
        const oldIds = venue.rawTriggers.map((row) => row.orderIndex);
        const managedKey = `lighterManagedTpsl:testnet:${ACCOUNT.l1Address.toLowerCase()}:28:BTC`;
        const ownership = await infra.diskCache.getItem(managedKey);
        const started = createDeferred<void>();
        const release = createDeferred<void>();
        const execute = vi.spyOn(bridge, 'execute');
        const original = execute.getMockImplementation();
        if (!original) {
          throw new Error('Expected configured Lighter bridge implementation');
        }
        execute.mockImplementation(async (call: LighterWasmCall) => {
          const signed = await original(call);
          if (call.function === '_signCancelOrder') {
            started.resolve();
            await release.promise;
          }
          return signed;
        });
        const pending = provider.updatePositionTPSL({
          symbol: 'BTC',
          expectedPosition: {
            size: ACCOUNT.positions[0].position,
            entryPrice: ACCOUNT.positions[0].avgEntryPrice,
          },
        });
        await started.promise;
        clientInstance.sendTx.mockClear();
        const live = {
          ...ACCOUNT.positions[0],
          ...(change === 'resize'
            ? { position: '0.002' }
            : { avgEntryPrice: '100001' }),
        };
        clientInstance.getAccountByIndex.mockResolvedValue({
          code: 200,
          accounts: [{ ...ACCOUNT, positions: [live] }],
        });
        release.resolve();
        const result = await pending;
        expect(result.error).toBe(PERPS_ERROR_CODES.TPSL_UPDATE_FAILED);
        expect(result.success).toBe(false);
        expect(clientInstance.sendTx).not.toHaveBeenCalled();
        expect(venue.rawTriggers.map((row) => row.orderIndex)).toStrictEqual(
          oldIds,
        );
        expect(await infra.diskCache.getItem(managedKey)).toBe(ownership);
        expect(
          await infra.diskCache.getItem(
            `lighterTpslJournal:testnet:${ACCOUNT.l1Address.toLowerCase()}:28:7:BTC`,
          ),
        ).toBeNull();
        const retry = await provider.updatePositionTPSL({
          symbol: 'BTC',
          expectedPosition: {
            size: live.position,
            entryPrice: live.avgEntryPrice,
          },
        });
        expect(retry.success).toBe(true);
        expect(venue.rawTriggers).toHaveLength(0);
        expect((await provider.closePosition({ symbol: 'BTC' })).success).toBe(
          true,
        );
      },
    );

    it.each(['resize', 'entry-drift'])(
      'rejects position %s while create signing is pending before dispatch',
      async (change) => {
        const { provider, clientInstance, bridge } = buildProvider();
        const venue = setupTriggerVenue(clientInstance, bridge);
        const oldId = venue.seedTrigger('stop-loss', '80000');
        let releaseSigning: () => void = () => undefined;
        let markSigningStarted: () => void = () => undefined;
        const signingStarted = new Promise<void>((resolve) => {
          markSigningStarted = resolve;
        });
        const signingPending = new Promise<void>((resolve) => {
          releaseSigning = resolve;
        });
        const originalExecute = (
          bridge.execute as Mock
        ).getMockImplementation() as (
          call: LighterWasmCall,
        ) => Promise<unknown>;
        (bridge.execute as Mock).mockImplementation(
          async (call: LighterWasmCall) => {
            const signed = await originalExecute(call);
            if (call.function === '_signCreateOrder') {
              markSigningStarted();
              await signingPending;
            }
            return signed;
          },
        );
        const pending = provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '85000',
          expectedPosition: {
            size: ACCOUNT.positions[0].position,
            entryPrice: ACCOUNT.positions[0].avgEntryPrice,
          },
        });
        await signingStarted;
        clientInstance.sendTx.mockClear();
        clientInstance.getAccountByIndex.mockResolvedValue({
          code: 200,
          accounts: [
            {
              ...ACCOUNT,
              positions: [
                {
                  ...ACCOUNT.positions[0],
                  ...(change === 'resize'
                    ? { position: '0.002' }
                    : { avgEntryPrice: '100001' }),
                },
              ],
            },
          ],
        });
        releaseSigning();
        const result = await pending;
        expect(result.success).toBe(false);
        expect(result.error).toBe(PERPS_ERROR_CODES.TPSL_UPDATE_FAILED);
        expect(clientInstance.sendTx).not.toHaveBeenCalled();
        expect(venue.rawTriggers.map((row) => row.orderIndex)).toStrictEqual([
          oldId,
        ]);
        const retry = await provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '85000',
          expectedPosition: {
            size: change === 'resize' ? '0.002' : ACCOUNT.positions[0].position,
            entryPrice:
              change === 'entry-drift'
                ? '100001'
                : ACCOUNT.positions[0].avgEntryPrice,
          },
        });
        expect(retry.success).toBe(true);
        const close = await provider.closePosition({ symbol: 'BTC' });
        expect(close.success).toBe(true);
      },
    );

    it.each(['unchanged', 'entry-drift'])(
      'checks expected position through signer setup: %s',
      async (mode) => {
        const { provider, clientInstance, bridge, calls } = buildProvider();
        const venue = setupTriggerVenue(clientInstance, bridge);
        const oldId = venue.seedTrigger('stop-loss', '80000');
        let reads = 0;
        clientInstance.getAccountByIndex.mockImplementation(async () => {
          reads += 1;
          return {
            code: 200,
            accounts: [
              {
                ...ACCOUNT,
                positions: [
                  {
                    ...ACCOUNT.positions[0],
                    avgEntryPrice:
                      mode === 'entry-drift' && reads >= 3
                        ? '100001'
                        : ACCOUNT.positions[0].avgEntryPrice,
                  },
                ],
              },
            ],
          };
        });
        const result = await provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '85000',
          expectedPosition: {
            size: ACCOUNT.positions[0].position,
            entryPrice: ACCOUNT.positions[0].avgEntryPrice,
          },
        });
        expect(result.success).toBe(mode === 'unchanged');
        expect(venue.rawTriggers.some((row) => row.orderIndex === oldId)).toBe(
          mode !== 'unchanged',
        );
        expect(
          calls.filter((call) =>
            ['_signCreateOrder', '_signCancelOrder'].includes(call.function),
          ),
        ).toHaveLength(mode === 'unchanged' ? 2 : 0);
      },
    );

    it('retains protection and journal when inactive receipt identities conflict', async () => {
      const infra = createMockInfrastructure();
      const removeItem = vi.spyOn(infra.diskCache, 'removeItem');
      const { provider, clientInstance, bridge } = buildProvider({
        platformDependencies: infra,
      });
      const venue = setupTriggerVenue(clientInstance, bridge);
      const oldId = venue.seedTrigger('stop-loss', '80000');
      venue.setCreateTerminal('filled');
      clientInstance.getInactiveOrders.mockImplementation(async () => ({
        code: 200,
        orders: venue.rawInactive.flatMap((row) => [
          row,
          { ...row, orderIndex: row.orderIndex + 100 },
        ]),
      }));
      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('conflicting inactive-order identity');
      expect(result.childOrderIds).toBeUndefined();
      expect(venue.rawTriggers.map((row) => row.orderIndex)).toContain(oldId);
      expect(removeItem).not.toHaveBeenCalledWith(
        expect.stringContaining('lighterTpslJournal:'),
      );
    });

    it.each(['take-profit', 'stop-loss'])(
      'preserves TP/SL receipt order when %s executes after the barrier',
      async (executedType) => {
        const { provider, clientInstance, bridge } = buildProvider();
        const venue = setupTriggerVenue(clientInstance, bridge);
        const oldId = venue.seedTrigger('stop-loss', '80000');
        const read = clientInstance.getActiveOrders.getMockImplementation();
        if (!read) {
          throw new Error('missing venue reader');
        }
        let creationReads = 0;
        const expected = new Map<string, string>();
        clientInstance.getActiveOrders.mockImplementation(
          async (...args: unknown[]) => {
            const response = (await read(...args)) as {
              orders: RawTriggerOrder[];
            };
            const created = venue.rawTriggers.filter(
              (row) => row.orderIndex !== oldId,
            );
            if (created.length === 2) {
              creationReads += 1;
              for (const row of created) {
                expected.set(row.type, String(row.orderIndex));
              }
              if (creationReads === 2) {
                venue.rawTriggers.splice(0, venue.rawTriggers.length);
                venue.rawInactive.push(
                  ...created.reverse().map((row) => ({
                    ...row,
                    status: row.type === executedType ? 'filled' : 'canceled',
                    remainingBaseAmount:
                      row.type === executedType ? '0' : row.remainingBaseAmount,
                  })),
                );
                return { ...response, orders: [] };
              }
            }
            return response;
          },
        );
        const result = await provider.updatePositionTPSL({
          symbol: 'BTC',
          takeProfitPrice: '110000',
          stopLossPrice: '85000',
        });
        expect(result.success).toBe(true);
        expect(result.childOrderIds).toStrictEqual([
          expected.get('take-profit'),
          expected.get('stop-loss'),
        ]);
        expect(venue.rawTriggers).toHaveLength(0);
      },
    );

    it.each([
      'account',
      'market',
      'duplicate-client',
      'duplicate-id',
      'unsafe-id',
      'changed-id',
    ])(
      'retains the journal for an invalid position protection receipt: %s',
      async (invalid) => {
        const infra = createMockInfrastructure();
        const { provider, clientInstance, bridge } = buildProvider({
          platformDependencies: infra,
        });
        const venue = setupTriggerVenue(clientInstance, bridge);
        const oldId = venue.seedTrigger('stop-loss', '80000');
        const read = clientInstance.getActiveOrders.getMockImplementation();
        if (!read) {
          throw new Error('missing venue reader');
        }
        const removeItem = vi.spyOn(infra.diskCache, 'removeItem');
        let receiptReads = 0;
        clientInstance.getActiveOrders.mockImplementation(
          async (...args: unknown[]) => {
            const response = (await read(...args)) as {
              orders: RawTriggerOrder[];
            };
            const rows = response.orders.map((row: RawTriggerOrder) => ({
              ...row,
            }));
            const created = rows.filter(
              (row: RawTriggerOrder) => row.orderIndex !== oldId,
            );
            if (created.length > 0) {
              receiptReads += 1;
              if (invalid === 'account') {
                created[0].ownerAccountIndex = 99;
              }
              if (invalid === 'market') {
                created[0].marketIndex = 99;
              }
              if (invalid === 'unsafe-id') {
                created[0].orderIndex = Number.MAX_SAFE_INTEGER + 1;
              }
              if (invalid === 'duplicate-client') {
                rows.push({ ...created[0] });
              }
              if (invalid === 'duplicate-id') {
                created[1].orderIndex = created[0].orderIndex;
              }
              if (invalid === 'changed-id' && receiptReads > 1) {
                created[0].orderIndex += 50;
              }
            }
            return { ...response, orders: rows };
          },
        );
        const result = await provider.updatePositionTPSL({
          symbol: 'BTC',
          takeProfitPrice: '110000',
          stopLossPrice: '85000',
        });
        expect(result.success).toBe(false);
        expect(result.error).toContain('receipt identity');
        expect(result.childOrderIds).toBeUndefined();
        expect(removeItem).not.toHaveBeenCalledWith(
          expect.stringContaining('lighterTpslJournal:'),
        );
      },
    );

    it('returns an empty position protection receipt after removal', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      expect(
        await provider.updatePositionTPSL({ symbol: 'BTC' }),
      ).toMatchObject({
        success: true,
        childOrderIds: [],
      });
      expect(venue.rawTriggers).toHaveLength(0);
    });

    it.each(['single', 'pair'] as const)(
      'normalizes explicit partial %s quantities downward without widening',
      async (kind) => {
        const built = buildProvider();
        const venue = setupTriggerVenue(built.clientInstance, built.bridge);
        const result = await built.provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '85000',
          stopLossSize: '0.030009',
          ...(kind === 'pair'
            ? { takeProfitPrice: '110000', takeProfitSize: '0.030009' }
            : {}),
        });
        expect(result.success).toBe(true);
        expect(
          venue.rawTriggers.map((row) => row.initialBaseAmount),
        ).toStrictEqual(kind === 'pair' ? ['0.03', '0.03'] : ['0.03']);
      },
    );

    it.each([
      ['below tick', '0.000009', undefined, 'outside the size grid'],
      [
        'exact over-position',
        '0.10000000000000000001',
        undefined,
        'no greater than the position',
      ],
      [
        'unequal normalized pair',
        '0.030009',
        '0.030010',
        'equal normalized quantities',
      ],
    ])(
      'rejects partial %s before setup or mutation',
      async (_label, size, tpSize, diagnostic) => {
        const built = buildProvider();
        const venue = setupTriggerVenue(built.clientInstance, built.bridge);
        const prior = venue.seedTrigger('stop-loss', '90000');
        const result = await built.provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '85000',
          stopLossSize: size,
          ...(tpSize
            ? { takeProfitPrice: '110000', takeProfitSize: tpSize }
            : {}),
        });
        expect(result.success).toBe(false);
        expect(result.error).toContain(diagnostic);
        expect(built.calls).toHaveLength(0);
        expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
        expect(venue.rawTriggers.map((row) => row.orderIndex)).toStrictEqual([
          prior,
        ]);
      },
    );

    it('releases proven-unsent partial signing failure and permits fresh protection intent', async () => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      const execute = (
        built.bridge.execute as Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      let fail = true;
      (built.bridge.execute as Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          if (fail && call.function === '_signCreateOrder') {
            throw new Error('signing interrupted before send');
          }
          const result = await execute?.(call);
          if (!result) {
            throw new Error('Missing fixture signer');
          }
          return result;
        },
      );
      const result = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
        stopLossSize: '0.03',
      });
      expect(result).toMatchObject({
        success: false,
        error: 'signing interrupted before send',
      });
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
      expect(await built.provider.getPendingManualRecoveries()).toStrictEqual(
        [],
      );
      fail = false;
      expect(
        (
          await built.provider.updatePositionTPSL({
            symbol: 'BTC',
            stopLossPrice: '86000',
            stopLossSize: '0.04',
          })
        ).success,
      ).toBe(true);
      expect(
        venue.rawTriggers.map((row) => row.initialBaseAmount),
      ).toStrictEqual(['0.04']);
    });

    it.each(['signing failure', 'position drift'] as const)(
      'releases a proven-unsent partial cancel after %s',
      async (failure) => {
        const built = buildProvider({ registeredKey: '9c'.repeat(40) });
        const venue = setupTriggerVenue(built.clientInstance, built.bridge);
        expect(
          (
            await built.provider.updatePositionTPSL({
              symbol: 'BTC',
              stopLossPrice: '90000',
            })
          ).success,
        ).toBe(true);
        const before = venue.rawTriggers.map((row) => ({ ...row }));
        const execute = (
          built.bridge.execute as Mock
        ).getMockImplementation() as (
          call: LighterWasmCall,
        ) => Promise<unknown>;
        (built.bridge.execute as Mock).mockImplementation(
          async (call: LighterWasmCall) => {
            if (
              call.function === '_signCancelOrder' &&
              failure === 'signing failure'
            ) {
              throw new Error('cancel signing failed before send');
            }
            const signed = await execute(call);
            if (call.function === '_signCancelOrder') {
              built.clientInstance.getAccountByIndex.mockResolvedValue({
                code: 200,
                accounts: [
                  {
                    ...ACCOUNT,
                    positions: [
                      { ...ACCOUNT.positions[0], avgEntryPrice: '100001' },
                    ],
                  },
                ],
              });
            }
            return signed;
          },
        );
        built.clientInstance.sendTx.mockClear();
        const result = await built.provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '85000',
          stopLossSize: '0.03',
        });
        expect(result).toMatchObject({
          success: false,
          error:
            failure === 'signing failure'
              ? 'cancel signing failed before send'
              : PERPS_ERROR_CODES.TPSL_UPDATE_FAILED,
        });
        expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
        expect(venue.rawTriggers).toStrictEqual(before);
        expect(await built.provider.getPendingManualRecoveries()).toStrictEqual(
          [],
        );
        (built.bridge.execute as Mock).mockImplementation(execute);
        expect(
          (
            await built.provider.updatePositionTPSL({
              symbol: 'BTC',
              stopLossPrice: '86000',
              stopLossSize: '0.04',
            })
          ).success,
        ).toBe(true);
        expect(
          venue.rawTriggers.map((row) => row.initialBaseAmount),
        ).toStrictEqual(['0.04']);
      },
    );

    it.each(['takeProfitSize', 'stopLossSize'] as const)(
      'rejects a price-less partial %s without setup',
      async (field) => {
        const deps = createMockInfrastructure();
        const built = buildProvider({ platformDependencies: deps });
        const logError = getLoggerErrorMock(deps);
        const result = await built.provider.updatePositionTPSL({
          symbol: 'BTC',
          [field]: '0.03',
        });
        expect(result.success).toBe(false);
        expect(result.error).toBe(
          'A partial protection size requires its trigger price',
        );
        expect(built.calls).toHaveLength(0);
        expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
        expect(logError).not.toHaveBeenCalled();
      },
    );

    it('does not report an invalid partial pair linkage as a provider failure', async () => {
      const deps = createMockInfrastructure();
      const built = buildProvider({ platformDependencies: deps });
      const logError = getLoggerErrorMock(deps);

      const result = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '110000',
        stopLossPrice: '85000',
        partialPairLinkage: 'independent',
      });

      expect(result).toMatchObject({
        success: false,
        error:
          'Partial pair linkage requires a supported explicitly sized TP/SL pair',
      });
      expect(built.calls).toHaveLength(0);
      expect(logError).not.toHaveBeenCalled();
    });

    it('rejects a changed persisted partial intent before dispatch', async () => {
      const infra = createMockInfrastructure();
      const built = buildProvider({
        platformDependencies: infra,
        registeredKey: '9c'.repeat(40),
      });
      setupTriggerVenue(built.clientInstance, built.bridge);
      const read = infra.diskCache.getItem.bind(infra.diskCache);
      infra.diskCache.getItem = async (key: string): Promise<string | null> => {
        const raw = await read(key);
        if (raw && key.startsWith('lighterTpslJournalOp:')) {
          const record = JSON.parse(raw) as {
            partialIntent: { orders: (string | number)[][] };
          };
          record.partialIntent.orders[0][2] = '4000';
          return JSON.stringify(record);
        }
        return raw;
      };
      const result = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
        stopLossSize: '0.03',
      });
      expect(result).toMatchObject({
        success: false,
        error: 'Cannot change the persisted partial protection intent',
      });
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it('replaces a prior linked OCO pair with exact partial coverage', async () => {
      const built = buildProvider();
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      expect(
        (
          await built.provider.updatePositionTPSL({
            symbol: 'BTC',
            stopLossPrice: '90000',
            takeProfitPrice: '120000',
          })
        ).success,
      ).toBe(true);
      const priorIds = venue.rawTriggers.map((row) => row.orderIndex);
      built.calls.length = 0;
      const result = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
        takeProfitPrice: '110000',
        stopLossSize: '0.03',
        takeProfitSize: '0.03',
      });
      expect(result.success).toBe(true);
      expect(
        built.calls.findIndex((call) => call.function === '_signCancelOrder'),
      ).toBeLessThan(
        built.calls.findIndex(
          (call) => call.function === '_signCreateGroupedOrders',
        ),
      );
      expect(
        venue.rawTriggers.map((row) => row.initialBaseAmount),
      ).toStrictEqual(['0.03', '0.03']);
      expect(
        venue.rawTriggers.every((row) => !priorIds.includes(row.orderIndex)),
      ).toBe(true);
    });

    it.each(
      (['storage', 'signing'] as const).flatMap((boundary) =>
        (['single', 'pair'] as const).flatMap((kind) =>
          (
            [
              'entry drift',
              'account switch',
              'network replacement',
              'unchanged',
            ] as const
          ).map((change) => ({ boundary, kind, change })),
        ),
      ),
    )(
      'fences partial $kind at held $boundary after $change',
      async ({ boundary, kind, change }) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
        });
        const venue = setupTriggerVenue(built.clientInstance, built.bridge);
        expect(
          (
            await built.provider.updatePositionTPSL({
              symbol: 'BTC',
              stopLossPrice: '90000',
            })
          ).success,
        ).toBe(true);
        const before = venue.rawTriggers.map((row) => ({ ...row }));
        const entered = createDeferred<void>();
        const release = createDeferred<void>();
        if (boundary === 'storage') {
          const read = infra.diskCache.getItem.bind(infra.diskCache);
          let reads = 0;
          infra.diskCache.getItem = async (
            key: string,
          ): Promise<string | null> => {
            if (key.startsWith('lighterManagedTpsl:')) {
              reads += 1;
            }
            if (key.startsWith('lighterManagedTpsl:') && reads === 2) {
              entered.resolve();
              await release.promise;
            }
            return read(key);
          };
        } else {
          const execute = (
            built.bridge.execute as Mock
          ).getMockImplementation() as (
            call: LighterWasmCall,
          ) => Promise<unknown>;
          (built.bridge.execute as Mock).mockImplementation(
            async (call: LighterWasmCall) => {
              const result = await execute(call);
              if (call.function === '_signCancelOrder') {
                entered.resolve();
                await release.promise;
              }
              return result;
            },
          );
        }
        built.clientInstance.sendTx.mockClear();
        const pending = built.provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '85000',
          stopLossSize: '0.030009',
          ...(kind === 'pair'
            ? { takeProfitPrice: '110000', takeProfitSize: '0.030009' }
            : {}),
        });
        await entered.promise;
        if (change === 'entry drift') {
          built.clientInstance.getAccountByIndex.mockResolvedValue({
            code: 200,
            accounts: [
              {
                ...ACCOUNT,
                positions: [
                  { ...ACCOUNT.positions[0], avgEntryPrice: '100001' },
                ],
              },
            ],
          });
        } else if (change === 'account switch') {
          built.getUserAddressMock.mockReturnValue(
            '0x0000000000000000000000000000000000000002',
          );
        } else if (change === 'network replacement') {
          await built.provider.disconnect();
        }
        release.resolve();
        const result = await pending;
        const mainnet = buildProvider({
          platformDependencies: infra,
          isTestnet: false,
          registeredKey: '9c'.repeat(40),
        });
        expect(
          await mainnet.provider.getPendingManualRecoveries(),
        ).toStrictEqual([]);
        expect(mainnet.clientInstance.sendTx).not.toHaveBeenCalled();
        expect(result.success).toBe(change === 'unchanged');
        expect(result.error === undefined).toBe(change === 'unchanged');
        expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(
          change === 'unchanged' ? 2 : 0,
        );
        expect(
          venue.rawTriggers.filter((row) =>
            before.some((prior) => prior.orderIndex === row.orderIndex),
          ),
        ).toStrictEqual(change === 'unchanged' ? [] : before);
        expect(
          venue.rawTriggers.map((row) => row.initialBaseAmount),
        ).toStrictEqual(
          change === 'unchanged'
            ? Array.from({ length: kind === 'pair' ? 2 : 1 }, () => '0.03')
            : before.map((row) => row.initialBaseAmount),
        );
      },
    );

    it.each(
      ([1, -1] as const).flatMap((sign) =>
        (['0.1', '0.03'] as const).map((quantity) => ({ sign, quantity })),
      ),
    )(
      'uses the raw venue decimal for explicit partial request $quantity with sign $sign before setup',
      async ({ sign, quantity }) => {
        const built = buildProvider();
        const venue = setupTriggerVenue(built.clientInstance, built.bridge);
        const prior = venue.seedTrigger('stop-loss', '90000');
        const before = venue.rawTriggers.map((row) => ({ ...row }));
        built.clientInstance.getAccountByIndex.mockResolvedValue({
          code: 200,
          accounts: [
            {
              ...ACCOUNT,
              positions: [
                {
                  ...ACCOUNT.positions[0],
                  position: '0.09999999999999999999',
                  sign,
                },
              ],
            },
          ],
        });
        const result = await built.provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: sign === 1 ? '85000' : '115000',
          stopLossSize: quantity,
        });
        expect(result.success).toBe(quantity === '0.03');
        expect(result.error).toBe(
          quantity === '0.1'
            ? 'Partial protection quantity must be positive and no greater than the position'
            : undefined,
        );
        expect(built.calls.length === 0).toBe(quantity === '0.1');
        expect(
          venue.rawTriggers.filter((row) => row.orderIndex === prior),
        ).toStrictEqual(before);
        expect(
          venue.rawTriggers
            .filter((row) => row.orderIndex !== prior)
            .map((row) => row.initialBaseAmount),
        ).toStrictEqual(quantity === '0.03' ? ['0.03'] : []);
      },
    );

    it('releases ordinary unsent partial intent without a cleanup venue read masking signing failure', async () => {
      const infra = createMockInfrastructure();
      const built = buildProvider({
        platformDependencies: infra,
        registeredKey: '9c'.repeat(40),
      });
      setupTriggerVenue(built.clientInstance, built.bridge);
      const execute = (
        built.bridge.execute as Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      (built.bridge.execute as Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          if (call.function === '_signCreateOrder') {
            built.clientInstance.getActiveOrders.mockRejectedValue(
              new Error('venue read unavailable during cleanup'),
            );
            throw new Error('original partial signing failure');
          }
          const result = await execute?.(call);
          if (!result) {
            throw new Error('Missing fixture signer');
          }
          return result;
        },
      );
      const result = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
        stopLossSize: '0.03',
      });
      expect(result.error).toBe('original partial signing failure');
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
      expect(await built.provider.getPendingManualRecoveries()).toStrictEqual(
        [],
      );
      const index = JSON.parse(
        (await infra.diskCache.getItem('lighterTpslJournalIndex:testnet')) ??
          '[]',
      ) as string[];
      expect(index).toStrictEqual([]);
    });

    it.each(['single', 'pair'] as const)(
      'retains dispatched cancellation when held partial %s creation observes drift',
      async (kind) => {
        const built = buildProvider({ registeredKey: '9c'.repeat(40) });
        const venue = setupTriggerVenue(built.clientInstance, built.bridge);
        expect(
          (
            await built.provider.updatePositionTPSL({
              symbol: 'BTC',
              stopLossPrice: '90000',
            })
          ).success,
        ).toBe(true);
        const entered = createDeferred<void>();
        const release = createDeferred<void>();
        const execute = (
          built.bridge.execute as Mock
        ).getMockImplementation() as (
          call: LighterWasmCall,
        ) => Promise<unknown>;
        (built.bridge.execute as Mock).mockImplementation(
          async (call: LighterWasmCall) => {
            const signed = await execute(call);
            if (
              call.function === '_signCreateOrder' ||
              call.function === '_signCreateGroupedOrders'
            ) {
              entered.resolve();
              await release.promise;
            }
            return signed;
          },
        );
        built.clientInstance.sendTx.mockClear();
        const pending = built.provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '85000',
          stopLossSize: '0.03',
          ...(kind === 'pair'
            ? { takeProfitPrice: '110000', takeProfitSize: '0.03' }
            : {}),
        });
        await entered.promise;
        expect(venue.rawTriggers).toStrictEqual([]);
        built.clientInstance.getAccountByIndex.mockResolvedValue({
          code: 200,
          accounts: [
            {
              ...ACCOUNT,
              positions: [{ ...ACCOUNT.positions[0], avgEntryPrice: '100001' }],
            },
          ],
        });
        release.resolve();
        expect((await pending).error).toBe(
          PERPS_ERROR_CODES.TPSL_UPDATE_FAILED,
        );
        expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(1);
        const rows = await built.provider.getPendingManualRecoveries();
        expect(rows).toHaveLength(1);
        expect(
          rows[0].partialIntent?.legs.map((leg) => leg.size),
        ).toStrictEqual(
          Array.from({ length: kind === 'pair' ? 2 : 1 }, () => '0.03'),
        );
        expect(venue.rawTriggers).toStrictEqual([]);
      },
    );

    it.each([false, true])(
      'preserves the final position guard when unsent cleanup fails: %s',
      async (cleanupFails) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
        });
        const venue = setupTriggerVenue(built.clientInstance, built.bridge);
        expect(
          (
            await built.provider.updatePositionTPSL({
              symbol: 'BTC',
              stopLossPrice: '90000',
            })
          ).success,
        ).toBe(true);
        const priorProtection = JSON.stringify(venue.rawTriggers);
        const execute = (
          built.bridge.execute as Mock
        ).getMockImplementation() as (
          call: LighterWasmCall,
        ) => Promise<unknown>;
        (built.bridge.execute as Mock).mockImplementation(
          async (call: LighterWasmCall) => {
            const signed = await execute(call);
            if (call.function === '_signCancelOrder') {
              built.clientInstance.getAccountByIndex.mockResolvedValue({
                code: 200,
                accounts: [
                  {
                    ...ACCOUNT,
                    positions: [
                      { ...ACCOUNT.positions[0], avgEntryPrice: '100001' },
                    ],
                  },
                ],
              });
            }
            return signed;
          },
        );
        const remove = infra.diskCache.removeItem.bind(infra.diskCache);
        infra.diskCache.removeItem = async (key: string): Promise<void> => {
          if (cleanupFails && key.startsWith('lighterTpslJournal')) {
            throw new Error('cleanup storage unavailable');
          }
          return remove(key);
        };
        built.clientInstance.sendTx.mockClear();
        const result = await built.provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '85000',
          stopLossSize: '0.03',
        });
        expect(result.error).toBe(PERPS_ERROR_CODES.TPSL_UPDATE_FAILED);
        expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
        expect(JSON.stringify(venue.rawTriggers)).toBe(priorProtection);
        const rows = await built.provider.getPendingManualRecoveries();
        expect(rows).toHaveLength(cleanupFails ? 1 : 0);
        const writes = (infra.diskCache.setItem as Mock).mock.calls as [
          string,
          string,
        ][];
        const journalWrites = writes.filter(([name]) =>
          name.startsWith('lighterTpslJournalOp:'),
        );
        const journal = JSON.parse(
          journalWrites[journalWrites.length - 1][1],
        ) as { operationId: string };
        const expectedId = `lighter-protection:${JSON.stringify(['testnet', ACCOUNT.l1Address.toLowerCase(), 28, 7, 'BTC', journal.operationId])}`;
        expect(rows.map((row) => row.recoveryId)).toStrictEqual(
          cleanupFails ? [expectedId] : [],
        );
        const ledger = JSON.parse(
          (await infra.diskCache.getItem('lighterNonceLedger:testnet:28:7')) ??
            '{}',
        ) as { entries: { owner: string | null }[] };
        expect(
          ledger.entries.filter((entry) => entry.owner === journal.operationId),
        ).toHaveLength(cleanupFails ? 1 : 0);
        const lastJournalWrite = journalWrites[journalWrites.length - 1];
        expect(await infra.diskCache.getItem(lastJournalWrite[0])).toBe(
          cleanupFails ? lastJournalWrite[1] : null,
        );
        expect(
          (await built.provider.getPendingManualRecoveries()).map(
            (row) => row.recoveryId,
          ),
        ).toStrictEqual(rows.map((row) => row.recoveryId));
      },
    );

    it('keeps an unretirable unsent partial operation selectable and preserves its original failure', async () => {
      const infra = createMockInfrastructure();
      const built = buildProvider({
        platformDependencies: infra,
        registeredKey: '9c'.repeat(40),
      });
      setupTriggerVenue(built.clientInstance, built.bridge);
      const execute = (
        built.bridge.execute as Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      (built.bridge.execute as Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          if (call.function === '_signCreateOrder') {
            throw new Error('original signing failure');
          }
          const result = await execute?.(call);
          if (!result) {
            throw new Error('Missing fixture signer');
          }
          return result;
        },
      );
      const remove = infra.diskCache.removeItem.bind(infra.diskCache);
      infra.diskCache.removeItem = async (key: string): Promise<void> => {
        if (key.startsWith('lighterTpslJournal')) {
          throw new Error('cleanup storage unavailable');
        }
        return remove(key);
      };
      const result = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
        stopLossSize: '0.03',
      });
      expect(result.error).toBe('original signing failure');
      const rows = await built.provider.getPendingManualRecoveries();
      expect(rows).toHaveLength(1);
      expect(rows[0].recoveryId).toBeDefined();
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it.each(['take-profit', 'stop-loss', 'pair'] as const)(
      'places fixed partial %s protection without expanding to the full position',
      async (kind) => {
        const { provider, clientInstance, bridge } = buildProvider();
        const venue = setupTriggerVenue(clientInstance, bridge);
        const result = await provider.updatePositionTPSL({
          symbol: 'BTC',
          ...(kind === 'stop-loss'
            ? {}
            : { takeProfitPrice: '110000', takeProfitSize: '0.03' }),
          ...(kind === 'take-profit'
            ? {}
            : { stopLossPrice: '85000', stopLossSize: '0.03' }),
        });
        expect(result.success).toBe(true);
        expect(result.childOrderIds).toHaveLength(kind === 'pair' ? 2 : 1);
        expect(venue.rawTriggers).toHaveLength(kind === 'pair' ? 2 : 1);
        expect(
          venue.rawTriggers.map((row) => row.initialBaseAmount),
        ).toStrictEqual(kind === 'pair' ? ['0.03', '0.03'] : ['0.03']);
      },
    );

    it('cancels managed protection before creating partial coverage and preserves unrelated orders', async () => {
      const built = buildProvider();
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      expect(
        (
          await built.provider.updatePositionTPSL({
            symbol: 'BTC',
            stopLossPrice: '90000',
          })
        ).success,
      ).toBe(true);
      const unrelated = venue.seedTrigger('stop-loss', '82000');
      const unrelatedOrder = venue.rawTriggers.find(
        (row) => row.orderIndex === unrelated,
      );
      if (unrelatedOrder) {
        unrelatedOrder.initialBaseAmount = '0.02';
        unrelatedOrder.remainingBaseAmount = '0.02';
      }
      venue.events.length = 0;
      const result = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
        stopLossSize: '0.03',
      });
      expect(result.success).toBe(true);
      expect(venue.events.indexOf('cancel')).toBeLessThan(
        venue.events.indexOf('create'),
      );
      expect(
        venue.rawTriggers.map((row) => row.initialBaseAmount),
      ).toStrictEqual(['0.02', '0.03']);
      expect(
        (await built.provider.updatePositionTPSL({ symbol: 'BTC' })).success,
      ).toBe(true);
      expect(venue.rawTriggers.map((row) => row.orderIndex)).toStrictEqual([
        unrelated,
      ]);
    });

    it.each([1, -1])(
      'normalizes independent coverage down for position sign %s and removes exact owned legs',
      async (sign) => {
        const built = buildProvider();
        built.clientInstance.getAccountByIndex.mockResolvedValue({
          code: 200,
          accounts: [
            { ...ACCOUNT, positions: [{ ...ACCOUNT.positions[0], sign }] },
          ],
        });
        const venue = setupTriggerVenue(built.clientInstance, built.bridge);
        const unrelated = venue.seedTrigger('stop-loss', '82000');
        const row = venue.rawTriggers[0];
        row.initialBaseAmount = '0.02';
        row.remainingBaseAmount = '0.02';
        const result = await built.provider.updatePositionTPSL({
          symbol: 'BTC',
          takeProfitPrice: '110000',
          stopLossPrice: '85000',
          takeProfitSize: '0.030009',
          stopLossSize: '0.040009',
          partialPairLinkage: 'independent',
        });
        expect(result.success).toBe(true);
        expect(
          result.positionProtection?.legs.map((leg) => [
            leg.requestedSize,
            leg.normalizedSize,
            leg.status,
          ]),
        ).toStrictEqual([
          ['0.030009', '0.03', 'resting'],
          ['0.040009', '0.04', 'resting'],
        ]);
        expect(
          built.calls
            .filter((call) => call.function === '_signCreateOrder')
            .map((call) => call.params[5]),
        ).toStrictEqual([sign === 1 ? 1 : 0, sign === 1 ? 1 : 0]);
        expect(
          (await built.provider.updatePositionTPSL({ symbol: 'BTC' })).success,
        ).toBe(true);
        expect(
          venue.rawTriggers.map((order) => order.orderIndex),
        ).toStrictEqual([unrelated]);
      },
    );

    it.each(['0', '-0.01', '0.00000001', '0.100001', 'NaN', '0.03BTC'])(
      'rejects independent quantity %s before setup or cancellation',
      async (size) => {
        const built = buildProvider();
        const venue = setupTriggerVenue(built.clientInstance, built.bridge);
        const prior = venue.seedTrigger('stop-loss', '90000');
        const result = await built.provider.updatePositionTPSL({
          symbol: 'BTC',
          takeProfitPrice: '110000',
          stopLossPrice: '85000',
          takeProfitSize: size,
          stopLossSize: '0.04',
          partialPairLinkage: 'independent',
        });
        expect(result.success).toBe(false);
        expect(built.calls).toHaveLength(0);
        expect(venue.rawTriggers.map((row) => row.orderIndex)).toStrictEqual([
          prior,
        ]);
      },
    );

    it.each(['quantity', 'linkage', 'client-id'] as const)(
      'rejects tampered independent %s before a create dispatch',
      async (field) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
        });
        setupTriggerVenue(built.clientInstance, built.bridge);
        const read = infra.diskCache.getItem.bind(infra.diskCache);
        infra.diskCache.getItem = async (
          key: string,
        ): Promise<string | null> => {
          const raw = await read(key);
          if (!raw || !key.startsWith('lighterTpslJournalOp:')) {
            return raw;
          }
          const record = JSON.parse(raw) as {
            partialIntent: { linkage: string; orders: (string | number)[][] };
          };
          if (field === 'quantity') {
            record.partialIntent.orders[0][2] = '6000';
          } else if (field === 'linkage') {
            record.partialIntent.linkage = 'oco';
          } else {
            record.partialIntent.orders[0][1] =
              record.partialIntent.orders[1][1];
          }
          return JSON.stringify(record);
        };
        const result = await built.provider.updatePositionTPSL({
          symbol: 'BTC',
          takeProfitPrice: '110000',
          stopLossPrice: '85000',
          takeProfitSize: '0.03',
          stopLossSize: '0.04',
          partialPairLinkage: 'independent',
        });
        expect(result.success).toBe(false);
        expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
      },
    );

    it('preserves the accepted independent first leg if persisting the sibling fails', async () => {
      const infra = createMockInfrastructure();
      const built = buildProvider({
        platformDependencies: infra,
        registeredKey: '9c'.repeat(40),
      });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      const write = infra.diskCache.setItem.bind(infra.diskCache);
      infra.diskCache.setItem = async (
        key: string,
        raw: string,
      ): Promise<void> => {
        if (key.startsWith('lighterTpslJournalOp:')) {
          const record = JSON.parse(raw) as { attempts: { kind: string }[] };
          if (
            record.attempts.filter((attempt) => attempt.kind === 'create')
              .length === 2
          ) {
            throw new Error('second-leg disk failure');
          }
        }
        return await write(key, raw);
      };
      const result = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '110000',
        stopLossPrice: '85000',
        takeProfitSize: '0.03',
        stopLossSize: '0.04',
        partialPairLinkage: 'independent',
      });
      expect(result).toMatchObject({
        success: false,
        error: 'second-leg disk failure',
      });
      expect(result.positionProtection?.legs[0].status).toBe('resting');
      expect(result.positionProtection?.legs[1].clientOrderId).toBeUndefined();
      expect(venue.rawTriggers).toHaveLength(1);
      expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(1);
      infra.diskCache.setItem = write;
      expect(await built.provider.getPendingManualRecoveries()).toHaveLength(1);
    });

    it.each([1, 2])(
      'preserves exact independent outcomes when leg %s is rejected or unknown',
      async (failedLeg) => {
        const built = buildProvider();
        const venue = setupTriggerVenue(built.clientInstance, built.bridge);
        const execute = (
          built.bridge.execute as Mock
        ).getMockImplementation() as (
          call: LighterWasmCall,
        ) => Promise<unknown>;
        let creates = 0;
        (built.bridge.execute as Mock).mockImplementation(
          async (call: LighterWasmCall) => {
            if (call.function === '_signCreateOrder') {
              creates += 1;
              if (creates === failedLeg) {
                venue.setCreateTerminal('canceled');
              }
            }
            return await execute(call);
          },
        );
        const result = await built.provider.updatePositionTPSL({
          symbol: 'BTC',
          takeProfitPrice: '110000',
          stopLossPrice: '85000',
          takeProfitSize: '0.03',
          stopLossSize: '0.04',
          partialPairLinkage: 'independent',
        });
        expect(result.success).toBe(false);
        expect(creates).toBe(failedLeg);
        expect(result.positionProtection?.legs[failedLeg - 1]).toMatchObject({
          status: 'canceled',
          clientOrderId: expect.any(String) as string,
          orderId: expect.any(String) as string,
        });
        expect(result.positionProtection?.legs[0].status).toBe(
          failedLeg === 2 ? 'resting' : 'canceled',
        );
        expect(
          result.positionProtection?.legs[1].clientOrderId === undefined,
        ).toBe(failedLeg === 1);
        const obligations = await built.provider.getPendingManualRecoveries();
        expect(obligations).toHaveLength(1);
        expect(obligations[0].partialIntent).toMatchObject({
          version: 2,
          linkage: 'independent',
        });
        expect(creates).toBe(failedLeg);
        expect(venue.rawTriggers).toHaveLength(failedLeg - 1);
      },
    );

    it.each([1, 2])(
      'retains independent accepted identities after a lost response for leg %s',
      async (failedLeg) => {
        const built = buildProvider();
        const venue = setupTriggerVenue(built.clientInstance, built.bridge);
        const execute = (
          built.bridge.execute as Mock
        ).getMockImplementation() as (
          call: LighterWasmCall,
        ) => Promise<unknown>;
        let creates = 0;
        (built.bridge.execute as Mock).mockImplementation(
          async (call: LighterWasmCall) => {
            if (call.function === '_signCreateOrder') {
              creates += 1;
              if (creates === failedLeg) {
                venue.failResponseOnce(14);
              }
            }
            return await execute(call);
          },
        );
        const result = await built.provider.updatePositionTPSL({
          symbol: 'BTC',
          takeProfitPrice: '110000',
          stopLossPrice: '85000',
          takeProfitSize: '0.03',
          stopLossSize: '0.04',
          partialPairLinkage: 'independent',
        });
        expect(result.success).toBe(false);
        expect(creates).toBe(failedLeg);
        expect(result.positionProtection?.legs[failedLeg - 1]).toMatchObject({
          status: 'resting',
          clientOrderId: expect.any(String) as string,
          orderId: expect.any(String) as string,
        });
        await built.provider.getPendingManualRecoveries();
        expect(creates).toBe(failedLeg);
        expect(venue.rawTriggers).toHaveLength(failedLeg);
      },
    );

    it.each([7, 19])(
      'keeps an accepted independent first leg across restart on key %s until explicit cleanup',
      async (apiKeyIndex) => {
        const infra = createMockInfrastructure();
        const first = buildProvider({
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
        });
        const venue = setupTriggerVenue(first.clientInstance, first.bridge);
        venue.failResponseOnce(14);
        const request = {
          symbol: 'BTC',
          takeProfitPrice: '110000',
          stopLossPrice: '85000',
          takeProfitSize: '0.03',
          stopLossSize: '0.04',
          partialPairLinkage: 'independent' as const,
        };
        expect((await first.provider.updatePositionTPSL(request)).success).toBe(
          false,
        );
        const restarted = buildProvider({
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
          apiKeyIndex,
        });
        const recovered = setupTriggerVenue(
          restarted.clientInstance,
          restarted.bridge,
          { apiKeyIndex },
        );
        recovered.rawTriggers.push(...venue.rawTriggers);
        recovered.rawInactive.push(...venue.rawInactive);
        for (const [hash, tx] of venue.landedTxs) {
          recovered.landedTxs.set(hash, tx);
        }
        recovered.setVenueNonce(venue.getVenueNonce());
        recovered.setNextIndex(venue.getNextIndex());
        restarted.clientInstance.getApiKeys.mockResolvedValue({
          code: 200,
          apiKeys: [
            {
              accountIndex: 28,
              apiKeyIndex,
              nonce: 1,
              publicKey: '9c'.repeat(40),
            },
          ],
        });
        restarted.clientInstance.getTx.mockImplementation(
          async (hash: string) => {
            const tx = recovered.landedTxs.get(hash);
            return tx
              ? {
                  code: 200,
                  hash,
                  accountIndex: 28,
                  apiKeyIndex: venue.landedTxs.has(hash) ? 7 : apiKeyIndex,
                  nonce: tx.nonce,
                  status: tx.status,
                }
              : null;
          },
        );
        expect(
          (await restarted.provider.updatePositionTPSL(request)).success,
        ).toBe(false);
        expect(
          restarted.calls.filter(
            (call) => call.function === '_signCreateOrder',
          ),
        ).toHaveLength(0);
        expect(recovered.rawTriggers).toHaveLength(1);
        const pending = await restarted.provider.getPendingManualRecoveries();
        expect(pending).toHaveLength(1);
        const { recoveryId } = pending[0];
        if (!recoveryId) {
          throw new Error('Expected original independent recovery');
        }
        const cleanup = await restarted.provider.resolveRecoveryProtection({
          symbol: 'BTC',
          recoveryId,
        });
        expect(cleanup.success).toBe(true);
        expect(
          'childOrderIds' in cleanup ? cleanup.childOrderIds : undefined,
        ).toStrictEqual([]);
        expect(recovered.rawTriggers).toHaveLength(0);
        expect(
          restarted.calls.filter(
            (call) => call.function === '_signCreateOrder',
          ),
        ).toHaveLength(0);
      },
    );

    it('fences a signed independent sibling when the first leg fills before its dispatch', async () => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      const execute = (
        built.bridge.execute as Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      let creates = 0;
      (built.bridge.execute as Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          const result = await execute(call);
          if (call.function === '_signCreateOrder' && (creates += 1) === 2) {
            const [first] = venue.rawTriggers.splice(0, 1);
            venue.rawInactive.push({
              ...first,
              status: 'filled',
              remainingBaseAmount: '0',
            });
          }
          return result;
        },
      );
      const result = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '110000',
        stopLossPrice: '85000',
        takeProfitSize: '0.03',
        stopLossSize: '0.04',
        partialPairLinkage: 'independent',
      });
      expect(result.success).toBe(false);
      expect(creates).toBe(2);
      expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(1);
      expect(result.positionProtection?.legs[0].status).toBe('filled');
      expect(result.positionProtection?.legs[1].clientOrderId).toBeUndefined();
      expect(await built.provider.getPendingManualRecoveries()).toHaveLength(1);
    });

    it('never submits the independent sibling after the first trigger fills', async () => {
      const built = buildProvider();
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      venue.setCreateTerminal('filled');
      const result = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '110000',
        stopLossPrice: '85000',
        takeProfitSize: '0.03',
        stopLossSize: '0.04',
        partialPairLinkage: 'independent',
      });
      expect(result).toMatchObject({
        success: false,
        error:
          'Independent protection first leg executed; the stale sibling was not sent',
      });
      expect(result.positionProtection?.legs[0]).toMatchObject({
        status: 'filled',
        orderId: expect.any(String) as string,
      });
      expect(result.positionProtection?.legs[1].clientOrderId).toBeUndefined();
      await built.provider.getPendingManualRecoveries();
      expect(
        built.calls.filter((call) => call.function === '_signCreateOrder'),
      ).toHaveLength(1);
    });

    it.each(['resize', 'side', 'account', 'network'] as const)(
      'stops the independent sibling after %s changes',
      async (change) => {
        const built = buildProvider();
        const venue = setupTriggerVenue(built.clientInstance, built.bridge);
        const send = built.clientInstance.sendTx.getMockImplementation() as (
          txType: number,
          txInfo: string,
        ) => Promise<unknown>;
        built.clientInstance.sendTx.mockImplementation(
          async (txType: number, txInfo: string) => {
            const result = await send(txType, txInfo);
            if (txType === 14) {
              if (change === 'account') {
                built.getUserAddressMock.mockReturnValue(
                  '0x0000000000000000000000000000000000000002',
                );
              } else if (change === 'network') {
                await built.provider.disconnect();
              } else {
                built.clientInstance.getAccountByIndex.mockResolvedValue({
                  code: 200,
                  accounts: [
                    {
                      ...ACCOUNT,
                      positions: [
                        {
                          ...ACCOUNT.positions[0],
                          ...(change === 'resize'
                            ? { position: '0.08' }
                            : { sign: -1 }),
                        },
                      ],
                    },
                  ],
                });
              }
            }
            return result;
          },
        );
        const result = await built.provider.updatePositionTPSL({
          symbol: 'BTC',
          takeProfitPrice: '110000',
          stopLossPrice: '85000',
          takeProfitSize: '0.03',
          stopLossSize: '0.04',
          partialPairLinkage: 'independent',
        });
        expect(result.success).toBe(false);
        expect(
          built.calls.filter((call) => call.function === '_signCreateOrder'),
        ).toHaveLength(1);
        expect(venue.rawTriggers).toHaveLength(1);
        expect(
          result.positionProtection?.legs[1].clientOrderId,
        ).toBeUndefined();
      },
    );

    it.each([
      { takeProfitSize: '0.03', stopLossSize: '0.04' },
      { takeProfitSize: '0.03', stopLossSize: '0.03' },
      { takeProfitSize: '0.03' },
      { stopLossSize: '0.04' },
    ])(
      'creates explicitly independent protection with captured sizes %j',
      async (sizes) => {
        const built = buildProvider();
        const venue = setupTriggerVenue(built.clientInstance, built.bridge);
        const request = {
          symbol: 'BTC',
          takeProfitPrice: '110000',
          stopLossPrice: '85000',
          partialPairLinkage: 'independent' as const,
          ...sizes,
        };
        const result = await built.provider.updatePositionTPSL(request);
        expect(result.success).toBe(true);
        expect(result.childOrderIds).toHaveLength(2);
        expect(
          venue.rawTriggers.map((row) => row.initialBaseAmount),
        ).toStrictEqual([
          sizes.takeProfitSize ?? '0.1',
          sizes.stopLossSize ?? '0.1',
        ]);
        expect(
          built.calls.filter((call) => call.function === '_signCreateOrder'),
        ).toHaveLength(2);
        expect(
          built.calls.filter(
            (call) => call.function === '_signCreateGroupedOrders',
          ),
        ).toHaveLength(0);
      },
    );

    it.each([
      { takeProfitSize: '0.03', stopLossSize: '0.04' },
      { takeProfitSize: '0.1' },
      { stopLossSize: '0.1' },
    ])(
      'rejects unequal or mixed partial OCO quantities %j before mutation',
      async (sizes) => {
        const built = buildProvider();
        setupTriggerVenue(built.clientInstance, built.bridge);
        const result = await built.provider.updatePositionTPSL({
          symbol: 'BTC',
          takeProfitPrice: '110000',
          stopLossPrice: '85000',
          ...sizes,
        });
        expect(result).toMatchObject({
          success: false,
          error: 'Partial OCO protection requires equal normalized quantities',
        });
        expect(built.calls).toHaveLength(0);
        expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
      },
    );

    it.each([
      [false, 7, false],
      [false, 7, true],
      [true, 7, false],
      [true, 7, true],
      [true, 19, false],
      [true, 19, true],
    ] as const)(
      'never recreates interrupted partial intent after restart, including identical reopened position=%s slot=%s independent=%s',
      async (reopened, apiKeyIndex, independent) => {
        const infra = createMockInfrastructure();
        const first = buildProvider({
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
        });
        const venue = setupTriggerVenue(first.clientInstance, first.bridge);
        expect(
          (
            await first.provider.updatePositionTPSL({
              symbol: 'BTC',
              stopLossPrice: '90000',
            })
          ).success,
        ).toBe(true);
        const execute = (
          first.bridge.execute as Mock
        ).getMockImplementation() as (
          call: LighterWasmCall,
        ) => Promise<unknown>;
        (first.bridge.execute as Mock).mockImplementation(
          async (call: LighterWasmCall) => {
            if (call.function === '_signCreateOrder') {
              throw new Error('process interrupted before partial signing');
            }
            const result = await execute?.(call);
            if (!result) {
              throw new Error('Missing fixture signer');
            }
            return result;
          },
        );
        expect(
          (
            await first.provider.updatePositionTPSL({
              symbol: 'BTC',
              stopLossPrice: '85000',
              stopLossSize: '0.03',
              ...(independent
                ? {
                    takeProfitPrice: '110000',
                    takeProfitSize: '0.03',
                    partialPairLinkage: 'independent' as const,
                  }
                : {}),
            })
          ).success,
        ).toBe(false);
        expect(venue.rawTriggers).toHaveLength(0);
        const recorded = await first.provider.getPendingManualRecoveries();
        expect(recorded).toHaveLength(1);
        expect(recorded[0].partialIntent?.legs[0].size).toBe('0.03');
        const second = buildProvider({
          apiKeyIndex,
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
        });
        const recoveredVenue = setupTriggerVenue(
          second.clientInstance,
          second.bridge,
          { apiKeyIndex },
        );
        second.clientInstance.getApiKeys.mockResolvedValue({
          code: 200,
          apiKeys: [
            {
              accountIndex: 28,
              apiKeyIndex,
              nonce: 1,
              publicKey: '9c'.repeat(40),
            },
          ],
        });
        second.clientInstance.getTx.mockImplementation(async (hash: string) => {
          const tx = recoveredVenue.landedTxs.get(hash);
          return tx
            ? {
                code: 200,
                hash,
                accountIndex: 28,
                apiKeyIndex: venue.landedTxs.has(hash) ? 7 : apiKeyIndex,
                nonce: tx.nonce,
                status: tx.status,
              }
            : null;
        });
        recoveredVenue.rawInactive.push(...venue.rawInactive);
        for (const [hash, tx] of venue.landedTxs) {
          recoveredVenue.landedTxs.set(hash, tx);
        }
        recoveredVenue.setVenueNonce(venue.getVenueNonce());
        recoveredVenue.setNextIndex(venue.getNextIndex());
        let observedFlat: number | undefined;
        if (reopened) {
          second.clientInstance.getAccountByIndex.mockResolvedValue({
            code: 200,
            accounts: [{ ...ACCOUNT, positions: [] }],
          });
          observedFlat = (await second.provider.getPositions()).length;
          // Even after observing closure, identical reopened values cannot authorize replay.
          second.clientInstance.getAccountByIndex.mockResolvedValue({
            code: 200,
            accounts: [
              {
                ...ACCOUNT,
                positions: ACCOUNT.positions.map((position) => ({
                  ...position,
                })),
              },
            ],
          });
        }
        expect(observedFlat).toBe(reopened ? 0 : undefined);
        const retry = await second.provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '84000',
          stopLossSize: '0.04',
        });
        expect(retry.success).toBe(false);
        expect(
          second.calls.filter((call) => call.function === '_signCreateOrder'),
        ).toHaveLength(0);
        const recoveries = await second.provider.getPendingManualRecoveries();
        expect(recoveries).toHaveLength(1);
        const { recoveryId } = recoveries[0];
        if (!recoveryId) {
          throw new Error('Expected a selectable recovery ID');
        }
        const resolved = await second.provider.resolveRecoveryProtection({
          recoveryId,
          symbol: 'BTC',
          stopLossPrice: '84000',
          stopLossSize: '0.04',
        });
        expect(resolved.error).toBeUndefined();
        expect(resolved.success).toBe(true);
        expect(
          recoveredVenue.rawTriggers.map((row) => row.initialBaseAmount),
        ).toStrictEqual(['0.04']);
      },
    );

    it.each([
      'source-link',
      'prepared',
      'pending',
      'remove-failure',
      'cas-conflict',
    ] as const)(
      'retains an older-slot zero-attempt partial journal with %s',
      async (condition) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
        });
        setupTriggerVenue(built.clientInstance, built.bridge);
        const execute = (
          built.bridge.execute as Mock
        ).getMockImplementation() as (
          call: LighterWasmCall,
        ) => Promise<unknown>;
        (built.bridge.execute as Mock).mockImplementation(
          async (call: LighterWasmCall) => {
            if (call.function === '_signCreateOrder') {
              throw new Error('interrupted');
            }
            const result = await execute?.(call);
            if (!result) {
              throw new Error('Missing fixture signer');
            }
            return result;
          },
        );
        expect(
          (
            await built.provider.updatePositionTPSL({
              symbol: 'BTC',
              stopLossPrice: '85000',
              stopLossSize: '0.03',
            })
          ).success,
        ).toBe(false);
        const key = `${ACCOUNT.l1Address.toLowerCase()}:28:7:BTC`;
        // Restore the exact durable pre-signing snapshot to model process death,
        // including a restart before the live error cleanup could run.
        const writes = (infra.diskCache.setItem as Mock).mock.calls as [
          string,
          string,
        ][];
        const pointerWrite = writes.find(
          ([name]) => name === `lighterTpslJournal:testnet:${key}`,
        );
        const payloadWrite = writes.find(([name]) =>
          name.startsWith(`lighterTpslJournalOp:testnet:${key}:`),
        );
        if (!pointerWrite || !payloadWrite) {
          throw new Error('Expected durable pre-dispatch snapshot');
        }
        await infra.diskCache.setItem(...pointerWrite);
        await infra.diskCache.setItem(...payloadWrite);
        await infra.diskCache.setItem(
          'lighterTpslJournalIndex:testnet',
          JSON.stringify([key]),
        );
        const payload = JSON.parse(payloadWrite[1]) as {
          operationId: string;
          attempts: unknown[];
          sourceRecoveryOperationId?: string;
          sourceRecoverySettlementKey?: string;
        };
        expect(payload.attempts).toStrictEqual([]);
        const sourceKey = `${ACCOUNT.l1Address.toLowerCase()}:28:3:BTC`;
        const successorKey = `${ACCOUNT.l1Address.toLowerCase()}:28:19:BTC`;
        if (condition === 'source-link') {
          payload.sourceRecoveryOperationId = 'original-source';
          payload.sourceRecoverySettlementKey = sourceKey;
          await infra.diskCache.setItem(
            payloadWrite[0],
            JSON.stringify(payload),
          );
        }
        const transferKey = `lighterTpslSuccessor:testnet:${key}:${payload.operationId}`;
        if (condition === 'prepared' || condition === 'pending') {
          await infra.diskCache.setItem(
            transferKey,
            JSON.stringify({
              version: 1,
              sourceSettlementKey: key,
              sourceOperationId: payload.operationId,
              successorSettlementKey: successorKey,
              successorOperationId: 'retained-successor',
              state: condition,
              ownedOrderIds: [],
            }),
          );
        }
        const retainedPayload = await infra.diskCache.getItem(payloadWrite[0]);
        const retainedTransfer = await infra.diskCache.getItem(transferKey);
        if (condition === 'remove-failure') {
          const remove = infra.diskCache.removeItem.bind(infra.diskCache);
          infra.diskCache.removeItem = async (name: string): Promise<void> => {
            if (name === payloadWrite[0]) {
              throw new Error('older-slot cleanup unavailable');
            }
            return remove(name);
          };
        }
        const restarted = buildProvider({
          apiKeyIndex: 19,
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
        });
        restarted.clientInstance.getApiKeys.mockResolvedValue({
          code: 200,
          apiKeys: [
            {
              accountIndex: 28,
              apiKeyIndex: 19,
              nonce: 1,
              publicKey: '9c'.repeat(40),
            },
          ],
        });
        const venue = setupTriggerVenue(
          restarted.clientInstance,
          restarted.bridge,
        );
        const before = await restarted.provider.getPendingManualRecoveries();
        expect(before).toHaveLength(1);
        const expectedId = `lighter-protection:${JSON.stringify(['testnet', ACCOUNT.l1Address.toLowerCase(), 28, 7, 'BTC', payload.operationId])}`;
        expect(before[0].recoveryId).toBe(expectedId);
        const replacementPayload = JSON.stringify({
          ...payload,
          operationId: 'newer-operation',
        });
        const replacementKey = `lighterTpslJournalOp:testnet:${key}:newer-operation`;
        if (condition === 'cas-conflict') {
          const get = infra.diskCache.getItem.bind(infra.diskCache);
          let replaced = false;
          infra.diskCache.getItem = async (
            name: string,
          ): Promise<string | null> => {
            if (name === transferKey && !replaced) {
              replaced = true;
              // Another owner wins the pointer after the retirement candidate was read.
              await infra.diskCache.setItem(replacementKey, replacementPayload);
              await infra.diskCache.setItem(
                pointerWrite[0],
                JSON.stringify({
                  pointerVersion: 1,
                  operationId: 'newer-operation',
                }),
              );
            }
            return get(name);
          };
        }
        const result = await restarted.provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '84000',
          stopLossSize: '0.04',
        });
        expect(result.error).toBe(
          'Partial protection requires explicit recovery resolution by recovery ID',
        );
        expect(restarted.clientInstance.sendTx).not.toHaveBeenCalled();
        expect(venue.rawTriggers).toStrictEqual([]);
        expect(
          (await restarted.provider.getPendingManualRecoveries()).map(
            (row) => row.recoveryId,
          ),
        ).toStrictEqual([
          condition === 'cas-conflict'
            ? `lighter-protection:${JSON.stringify(['testnet', ACCOUNT.l1Address.toLowerCase(), 28, 7, 'BTC', 'newer-operation'])}`
            : expectedId,
        ]);
        expect(await infra.diskCache.getItem(payloadWrite[0])).toBe(
          condition === 'cas-conflict' ? null : retainedPayload,
        );
        expect(await infra.diskCache.getItem(replacementKey)).toBe(
          condition === 'cas-conflict' ? replacementPayload : null,
        );
        expect(await infra.diskCache.getItem(transferKey)).toBe(
          retainedTransfer,
        );
        expect(
          await infra.diskCache.getItem(
            `lighterTpslJournal:testnet:${successorKey}`,
          ),
        ).toBeNull();
      },
    );

    it.each(
      ([7, 19] as const).flatMap((apiKeyIndex) =>
        (['valid', 'zero', 'wrong-side'] as const).map((condition) => ({
          apiKeyIndex,
          condition,
        })),
      ),
    )(
      'loads a pre-dispatch partial journal with $condition intent safely on slot $apiKeyIndex',
      async ({ condition, apiKeyIndex }) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
        });
        setupTriggerVenue(built.clientInstance, built.bridge);
        const execute = (
          built.bridge.execute as Mock
        ).getMockImplementation() as (
          call: LighterWasmCall,
        ) => Promise<unknown>;
        (built.bridge.execute as Mock).mockImplementation(
          async (call: LighterWasmCall) => {
            if (call.function === '_signCreateOrder') {
              throw new Error('interrupted');
            }
            const result = await execute?.(call);
            if (!result) {
              throw new Error('Missing fixture signer');
            }
            return result;
          },
        );
        expect(
          (
            await built.provider.updatePositionTPSL({
              symbol: 'BTC',
              stopLossPrice: '85000',
              stopLossSize: '0.03',
            })
          ).success,
        ).toBe(false);
        const key = `${ACCOUNT.l1Address.toLowerCase()}:28:7:BTC`;
        // Restore the exact durable pre-signing snapshot to model process death,
        // including a restart before the live error cleanup could run.
        const writes = (infra.diskCache.setItem as Mock).mock.calls as [
          string,
          string,
        ][];
        const pointerWrite = writes.find(
          ([name]) => name === `lighterTpslJournal:testnet:${key}`,
        );
        const payloadWrite = writes.find(([name]) =>
          name.startsWith(`lighterTpslJournalOp:testnet:${key}:`),
        );
        if (!pointerWrite || !payloadWrite) {
          throw new Error('Expected durable pre-dispatch snapshot');
        }
        await infra.diskCache.setItem(...pointerWrite);
        await infra.diskCache.setItem(...payloadWrite);
        await infra.diskCache.setItem(
          'lighterTpslJournalIndex:testnet',
          JSON.stringify([key]),
        );
        const payloadKey = payloadWrite[0];
        const payload = JSON.parse(payloadWrite[1]) as {
          version: number;
          attempts: unknown[];
          partialIntent: { orders: (string | number)[][] };
        };
        expect(payload.version).toBe(5);
        expect(payload.attempts).toHaveLength(0);
        if (condition !== 'valid') {
          payload.partialIntent.orders[0][condition === 'zero' ? 2 : 4] =
            condition === 'zero' ? '0' : 0;
          await infra.diskCache.setItem(payloadKey, JSON.stringify(payload));
        }
        const restarted = buildProvider({
          apiKeyIndex,
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
        });
        const pending = restarted.provider.getPendingManualRecoveries();
        const outcome = await pending.then(
          (rows) => ({ count: rows.length, error: undefined }),
          (error: unknown) => ({ count: undefined, error: String(error) }),
        );
        expect(outcome.count).toBe(condition === 'valid' ? 1 : undefined);
        expect(outcome.error?.includes('journal') ?? false).toBe(
          condition !== 'valid',
        );
        expect(restarted.clientInstance.sendTx).not.toHaveBeenCalled();
        const venue = setupTriggerVenue(
          restarted.clientInstance,
          restarted.bridge,
        );
        const renewed = await restarted.provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '84000',
          stopLossSize: '0.04',
        });
        expect(renewed.success).toBe(condition === 'valid');
        const index = JSON.parse(
          (await infra.diskCache.getItem('lighterTpslJournalIndex:testnet')) ??
            '[]',
        ) as string[];
        expect(index.includes(key)).toBe(condition !== 'valid');
        expect(
          venue.rawTriggers.map((row) => row.initialBaseAmount),
        ).toStrictEqual(condition === 'valid' ? ['0.04'] : []);
      },
    );

    it('refuses partial creation when position changes during cancellation without a caller precondition', async () => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      expect(
        (
          await built.provider.updatePositionTPSL({
            symbol: 'BTC',
            stopLossPrice: '90000',
          })
        ).success,
      ).toBe(true);
      const send = built.clientInstance.sendTx.getMockImplementation() as (
        type: number,
        info: string,
      ) => Promise<unknown>;
      built.clientInstance.sendTx.mockImplementation(
        async (type: number, info: string) => {
          const response = await send(type, info);
          if (type === 15) {
            built.clientInstance.getAccountByIndex.mockResolvedValue({
              code: 200,
              accounts: [
                {
                  ...ACCOUNT,
                  positions: [{ ...ACCOUNT.positions[0], sign: -1 }],
                },
              ],
            });
          }
          return response;
        },
      );
      built.calls.length = 0;
      expect(
        (
          await built.provider.updatePositionTPSL({
            symbol: 'BTC',
            stopLossPrice: '85000',
            stopLossSize: '0.03',
          })
        ).success,
      ).toBe(false);
      expect(
        built.calls.filter((call) => call.function === '_signCreateOrder'),
      ).toHaveLength(0);
      expect(venue.rawTriggers).toHaveLength(0);
      expect(await built.provider.getPendingManualRecoveries()).toHaveLength(1);
    });

    it('directs late partial terminal failure to its exact pending recovery obligation', async () => {
      const built = buildProvider();
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      expect(
        (
          await built.provider.updatePositionTPSL({
            symbol: 'BTC',
            stopLossPrice: '90000',
          })
        ).success,
      ).toBe(true);
      const read =
        built.clientInstance.getActiveOrders.getMockImplementation() as () => Promise<unknown>;
      let replacementReads = 0;
      built.clientInstance.getActiveOrders.mockImplementation(async () => {
        const index = venue.rawTriggers.findIndex(
          (row) => row.triggerPrice === '85000',
        );
        if (index >= 0) {
          replacementReads += 1;
        }
        if (index >= 0 && replacementReads === 2) {
          const [row] = venue.rawTriggers.splice(index, 1);
          venue.rawInactive.push({ ...row, status: 'canceled' });
        }
        return read();
      });
      const result = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
        stopLossSize: '0.03',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain(
        'call resolveRecoveryProtection with its exact recovery ID',
      );
      const rows = await built.provider.getPendingManualRecoveries();
      expect(rows).toHaveLength(1);
      expect(rows[0].recoveryId).toBeDefined();
      expect(rows[0].partialIntent?.legs[0].size).toBe('0.03');
      const retry = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '84000',
        stopLossSize: '0.04',
      });
      expect(retry.success).toBe(false);
      expect(venue.rawTriggers).toStrictEqual([]);
    });

    it('retains explicit partial recovery after a terminal replacement rejection', async () => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      expect(
        (
          await built.provider.updatePositionTPSL({
            symbol: 'BTC',
            stopLossPrice: '90000',
          })
        ).success,
      ).toBe(true);
      venue.setCreateTerminal('canceled');
      const failed = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
        stopLossSize: '0.03',
      });
      expect(failed.success).toBe(false);
      expect(venue.rawTriggers).toHaveLength(0);
      const recoveries = await built.provider.getPendingManualRecoveries();
      expect(recoveries).toHaveLength(1);
      expect(recoveries[0].reason).toContain('current trading key');
      expect(recoveries[0].partialIntent?.legs[0].size).toBe('0.03');
      const before = built.calls.length;
      const retry = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '84000',
        stopLossSize: '0.04',
      });
      expect(retry.error).toBe(
        'Prior partial protection requires resolveRecoveryProtection with its exact pending recovery ID and fresh current-position intent',
      );
      expect(
        built.calls
          .slice(before)
          .filter((call) => call.function === '_signCreateOrder'),
      ).toHaveLength(0);
    });

    it.each([false, true])(
      'does not create partial protection while an exact cancellation is ambiguous independent=%s',
      async (independent) => {
        const built = buildProvider({ registeredKey: '9c'.repeat(40) });
        const venue = setupTriggerVenue(built.clientInstance, built.bridge);
        expect(
          (
            await built.provider.updatePositionTPSL({
              symbol: 'BTC',
              stopLossPrice: '90000',
            })
          ).success,
        ).toBe(true);
        built.calls.length = 0;
        venue.failResponseOnce(15);
        built.clientInstance.getTx.mockResolvedValue(null);
        const result = await built.provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '85000',
          stopLossSize: '0.03',
          ...(independent
            ? {
                takeProfitPrice: '110000',
                takeProfitSize: '0.04',
                partialPairLinkage: 'independent' as const,
              }
            : {}),
        });
        expect(result.success).toBe(false);
        expect(
          built.calls.filter((call) => call.function === '_signCreateOrder'),
        ).toHaveLength(0);
      },
    );

    it('reconciles an ambiguous partial create without replay or caller quantity substitution', async () => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      venue.failResponseOnce(14);
      const first = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
        stopLossSize: '0.03',
      });
      expect(first.success).toBe(false);
      expect(
        venue.rawTriggers.map((row) => row.initialBaseAmount),
      ).toStrictEqual(['0.03']);
      const retry = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '84000',
        stopLossSize: '0.04',
      });
      expect(retry).toMatchObject({
        success: false,
        error:
          'Prior partial protection settled; re-read orders before submitting a new intent',
      });
      expect(await built.provider.getPendingManualRecoveries()).toStrictEqual(
        [],
      );
      expect(
        built.calls.filter((call) => call.function === '_signCreateOrder'),
      ).toHaveLength(1);
      expect(
        venue.rawTriggers.map((row) => row.initialBaseAmount),
      ).toStrictEqual(['0.03']);
    });

    it.each(['0', '-0.01', '0.00000001', '0.11', 'NaN', '0.03BTC'])(
      'rejects invalid partial quantity %s before mutation',
      async (size) => {
        const { provider, clientInstance, bridge, calls } = buildProvider();
        const venue = setupTriggerVenue(clientInstance, bridge);
        const prior = venue.seedTrigger('stop-loss', '90000');
        const result = await provider.updatePositionTPSL({
          symbol: 'BTC',
          takeProfitPrice: '110000',
          takeProfitSize: size,
        });
        expect(result.success).toBe(false);
        expect(result.error).toContain(
          size === '0.00000001'
            ? 'outside the size grid'
            : 'positive and no greater than the position',
        );
        expect(calls).toHaveLength(0);
        expect(clientInstance.sendTx).not.toHaveBeenCalled();
        expect(venue.rawTriggers.map((row) => row.orderIndex)).toStrictEqual([
          prior,
        ]);
      },
    );

    it('rejects prices that overflow the signer uint32 wire cast, in validators, placement and TP/SL', async () => {
      const { provider, calls } = buildProvider();
      // 429496729.7 at 1 price decimal scales to 4,294,967,297 — a safe JS
      // integer that the pinned lighter-go signer wraps to 1 via uint32().
      const request = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit' as const,
        price: '429496729.7',
      };
      const validation = await provider.validateOrder(request);
      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('uint32');
      const placement = await provider.placeOrder(request);
      expect(placement.success).toBe(false);
      expect(placement.error).toContain('uint32');
      const tpsl = await provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '429496729.7',
      });
      expect(tpsl.success).toBe(false);
      expect(tpsl.error).toContain('uint32');
      expect(calls).toHaveLength(0);
    });

    it('refreshes the authoritative margin cache after TTL and fails closed on removed/failed metadata', async () => {
      const { provider, clientInstance } = buildProvider();
      const baseNow = Date.now();
      const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(baseNow);
      try {
        const request = {
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit' as const,
          price: '90000',
          leverage: 40,
        };
        // Default metadata: minInitial 200 -> 50x. 40x validates.
        expect((await provider.validateOrder(request)).isValid).toBe(true);
        // Venue tightens to 400 -> 25x; within TTL the cache still says 50x.
        clientInstance.getOrderBookDetails.mockResolvedValue({
          code: 200,
          orderBookDetails: [
            {
              symbol: 'BTC',
              lastTradePrice: 100000,
              minInitialMarginFraction: 400,
              maintenanceMarginFraction: 240,
            },
          ],
        });
        expect((await provider.validateOrder(request)).isValid).toBe(true);
        // TTL expiry forces an authoritative refresh: 40x now overlimit.
        nowSpy.mockReturnValue(baseNow + 61_000);
        const refreshed = await provider.validateOrder(request);
        expect(refreshed.isValid).toBe(false);
        expect(refreshed.error).toContain('25');
        // Row removed from fresh metadata: stale cap must not survive the
        // atomic cache replacement.
        clientInstance.getOrderBookDetails.mockResolvedValue({
          code: 200,
          orderBookDetails: [{ symbol: 'ETH', lastTradePrice: 3000 }],
        });
        nowSpy.mockReturnValue(baseNow + 122_000);
        const removedRow = await provider.validateOrder(request);
        expect(removedRow.isValid).toBe(false);
        expect(removedRow.error).toContain('margin metadata');
        // Fetch failure after expiry: fail closed, never the stale cap.
        clientInstance.getOrderBookDetails.mockRejectedValue(
          new Error('metadata endpoint down'),
        );
        nowSpy.mockReturnValue(baseNow + 183_000);
        const failedFetch = await provider.validateOrder(request);
        expect(failedFetch.isValid).toBe(false);
        expect(failedFetch.error).toContain('margin metadata');
      } finally {
        nowSpy.mockRestore();
      }
    });
  });
});
