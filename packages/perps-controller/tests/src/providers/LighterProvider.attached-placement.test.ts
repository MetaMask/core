import { describe, expect, it, vi } from 'vitest';

import { LighterApiError } from '../../../src/services/LighterClientService.js';
import type { OrderParams } from '../../../src/types/index.js';
import type { LighterApiOrder } from '../../../src/types/lighter-types.js';
import type { LighterAttachedGroup } from '../../../src/utils/lighterAttachedOrders.js';
import {
  ACCOUNT,
  buildProvider,
  finishPendingTimersAfterEach,
} from '../../helpers/lighterProvider.js';
import type { BuiltProvider } from '../../helpers/lighterProvider.js';
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

  describe('native attached placement', () => {
    const attachedIntent: OrderParams = {
      symbol: 'BTC',
      isBuy: true,
      size: '0.001',
      orderType: 'limit',
      price: '90000',
      takeProfitPrice: '110000',
      stopLossPrice: '80000',
    };
    const durableInfrastructure = (): {
      disk: Map<string, string>;
      infrastructure: ReturnType<typeof createMockInfrastructure>;
    } => {
      const disk = new Map<string, string>();
      const infrastructure = createMockInfrastructure();
      vi.mocked(infrastructure.diskCache).getItem.mockImplementation(
        async (key) => disk.get(key) ?? null,
      );
      vi.mocked(infrastructure.diskCache).setItem.mockImplementation(
        async (key, value) => {
          disk.set(key, value);
        },
      );
      vi.mocked(infrastructure.diskCache).removeItem.mockImplementation(
        async (key) => {
          disk.delete(key);
        },
      );
      return { disk, infrastructure };
    };
    const attachedVenue = (
      bundle: BuiltProvider,
    ): { active: LighterApiOrder[]; inactive: LighterApiOrder[] } => {
      const active: LighterApiOrder[] = [];
      const inactive: LighterApiOrder[] = [];
      bundle.clientInstance.getActiveOrders.mockImplementation(async () => ({
        code: 200,
        orders: [...active],
      }));
      bundle.clientInstance.getInactiveOrders.mockImplementation(async () => ({
        code: 200,
        orders: [...inactive],
      }));
      bundle.clientInstance.sendTx.mockImplementation(async (kind: number) => {
        if (kind === 28) {
          const call = bundle.calls
            .filter((entry) => entry.function === '_signCreateGroupedOrders')
            .at(-1);
          if (call?.function !== '_signCreateGroupedOrders') {
            throw new Error('Missing grouped signature');
          }
          for (let index = 0; index < call.params[2]; index += 1) {
            const offset = 3 + index * 10;
            active.push({
              orderIndex: 500 + index,
              clientOrderIndex: Number(call.params[offset + 1]),
              marketIndex: 1,
              ownerAccountIndex: 28,
              initialBaseAmount: String(
                Number(call.params[offset + 2]) / 100000,
              ),
              remainingBaseAmount: String(
                Number(call.params[offset + 2]) / 100000,
              ),
              price: String(Number(call.params[offset + 3]) / 10),
              isAsk: call.params[offset + 4] === 1,
              type: [
                'limit',
                'market',
                'stop-loss',
                'stop-loss-limit',
                'take-profit',
                'take-profit-limit',
              ][Number(call.params[offset + 5])],
              timeInForce:
                call.params[offset + 6] === 1
                  ? 'good-till-time'
                  : 'immediate-or-cancel',
              reduceOnly: Number(call.params[offset + 7]),
              triggerPrice: String(Number(call.params[offset + 8]) / 10),
              status: index === 0 ? 'open' : 'pending',
              orderExpiry: Date.now() + 1000000,
              timestamp: Math.floor(Date.now() / 1000),
              ...(index === 0
                ? { toTriggerOrderId0: '501', toTriggerOrderId1: '502' }
                : { parentOrderIndex: 500 }),
            });
          }
        } else if (kind === 15) {
          const call = bundle.calls
            .filter((entry) => entry.function === '_signCancelOrder')
            .at(-1);
          const index = active.findIndex(
            (row) => String(row.orderIndex) === call?.params[2],
          );
          if (index >= 0) {
            const [row] = active.splice(index, 1);
            inactive.push({
              ...row,
              status: 'canceled',
              remainingBaseAmount: '0',
            });
          }
        }
        return { code: 200, txHash: 'aabbcc', predictedExecutionTimeMs: 100 };
      });
      return { active, inactive };
    };

    const storedAttached = (
      disk: Map<string, string>,
    ): { key: string; groups: LighterAttachedGroup[] } => {
      const entry = [...disk.entries()].find(([key]) =>
        key.startsWith('lighterAttachedOrders:'),
      );
      if (!entry) {
        throw new Error('Missing attached storage');
      }
      return {
        key: entry[0],
        groups: JSON.parse(entry[1]) as LighterAttachedGroup[],
      };
    };

    it.each([false, true])(
      'preserves exact failure reviewed before ledger reconciliation with retirement failure=%s',
      async (failRetirement) => {
        const { disk, infrastructure } = durableInfrastructure();
        const built = buildProvider({
          platformDependencies: infrastructure,
          registeredKey: '9c'.repeat(40),
        });
        built.clientInstance.sendTx.mockRejectedValueOnce(
          new Error('lost response'),
        );
        await built.provider.placeOrder(attachedIntent);
        const {
          groups: [group],
        } = storedAttached(disk);
        const failure = {
          code: 200,
          hash: group.txHash,
          accountIndex: 28,
          apiKeyIndex: 7,
          nonce: group.nonce,
          status: 0,
        };
        built.clientInstance.getTx.mockResolvedValue(failure);
        expect(
          (await built.provider.reviewAttachedOrderGroups())[0].submission,
        ).toBe('canceled');
        let failed = false;
        vi.mocked(infrastructure.diskCache).setItem.mockImplementation(
          async (key, value) => {
            if (
              failRetirement &&
              !failed &&
              key === 'lighterNonceLedger:testnet:28:7' &&
              value.includes('"entries":[]')
            ) {
              failed = true;
              throw new Error('ledger write failed');
            }
            disk.set(key, value);
          },
        );
        const restarted = buildProvider({
          platformDependencies: infrastructure,
          registeredKey: '9c'.repeat(40),
          apiKeyIndex: 8,
        });
        restarted.clientInstance.getApiKeys.mockResolvedValue({
          code: 200,
          apiKeys: [7, 8].map((apiKeyIndex) => ({
            accountIndex: 28,
            apiKeyIndex,
            nonce: 1,
            publicKey: '9c'.repeat(40),
          })),
        });
        restarted.clientInstance.getTx.mockResolvedValue(failure);
        let retirementError: unknown;
        if (failRetirement) {
          retirementError = await restarted.provider
            .reconcileRecoveredDispatches()
            .then(
              () => undefined,
              (error: unknown) => error,
            );
          await restarted.provider.reviewAttachedOrderGroups();
        }
        expect(retirementError).toStrictEqual(
          failRetirement ? new Error('ledger write failed') : undefined,
        );
        expect(storedAttached(disk).groups[0].nonAcceptance).toBe('failed');
        const recovered =
          await restarted.provider.reconcileRecoveredDispatches();
        expect(recovered).toStrictEqual([
          expect.objectContaining({ outcome: 'failed' }),
        ]);
        expect(recovered[0].acknowledgeable).not.toBe(false);
        await restarted.provider.acknowledgeRecoveredDispatch(
          recovered[0].recoveryId,
        );
        expect(
          (
            await restarted.provider.placeOrder({
              symbol: 'BTC',
              isBuy: true,
              size: '0.001',
              orderType: 'limit',
              price: '90000',
            })
          ).success,
        ).toBe(true);
        expect(
          restarted.calls.filter(
            (call) =>
              call.function === '_signCreateGroupedOrders' ||
              call.function === '_signCancelOrder',
          ),
        ).toHaveLength(0);
      },
    );

    it.each([
      ['live', false],
      ['older-terminal', false],
      ['older-terminal', true],
    ] as const)(
      'settles fresh exact %s legs across restart and migration with ledger failure=%s',
      async (state, failRetirement) => {
        const { disk, infrastructure } = durableInfrastructure();
        const built = buildProvider({
          platformDependencies: infrastructure,
          registeredKey: '9c'.repeat(40),
        });
        const venue = attachedVenue(built);
        const send = built.clientInstance.sendTx.getMockImplementation();
        built.clientInstance.sendTx.mockImplementation(
          async (...args: unknown[]) => {
            await send?.(...args);
            throw new Error('lost response');
          },
        );
        await built.provider.placeOrder(attachedIntent);
        const {
          groups: [group],
        } = storedAttached(disk);
        expect(
          (await built.provider.reviewAttachedOrderGroups())[0].submission,
        ).toBe('accepted');
        const restarted = buildProvider({
          platformDependencies: infrastructure,
          registeredKey: '9c'.repeat(40),
          apiKeyIndex: 8,
        });
        restarted.clientInstance.getApiKeys.mockResolvedValue({
          code: 200,
          apiKeys: [7, 8].map((apiKeyIndex) => ({
            accountIndex: 28,
            apiKeyIndex,
            nonce: 1,
            publicKey: '9c'.repeat(40),
          })),
        });
        const replayVenue = attachedVenue(restarted);
        if (state === 'live') {
          replayVenue.active.push(...venue.active);
        } else {
          const terminal = venue.active.map((row) => ({
            ...row,
            status: 'canceled',
            remainingBaseAmount: '0',
          }));
          restarted.clientInstance.getInactiveOrders.mockImplementation(
            async (_account, _token, _limit, cursor) =>
              cursor === 'older'
                ? { code: 200, orders: terminal }
                : {
                    code: 200,
                    orders: [
                      {
                        ...terminal[0],
                        orderIndex: 999,
                        clientOrderIndex: 999,
                      },
                    ],
                    nextCursor: 'older',
                  },
          );
        }
        restarted.clientInstance.getNextNonce.mockResolvedValue({
          code: 200,
          nonce: Number(group.nonce) + 1,
        });
        const clock = vi
          .spyOn(Date, 'now')
          .mockReturnValue(Number(group.expiresAt) + 31_000);
        try {
          let retirementError: unknown;
          if (failRetirement) {
            let failed = false;
            vi.mocked(infrastructure.diskCache).setItem.mockImplementation(
              async (key, value) => {
                if (
                  !failed &&
                  key === 'lighterNonceLedger:testnet:28:7' &&
                  value.includes('fresh-exact-attached-legs')
                ) {
                  failed = true;
                  throw new Error('acceptance ledger write failed');
                }
                disk.set(key, value);
              },
            );
            retirementError = await restarted.provider
              .reviewAttachedOrderGroups()
              .then(
                () => undefined,
                (error: unknown) => error,
              );
          }
          expect(retirementError).toStrictEqual(
            failRetirement
              ? new Error('acceptance ledger write failed')
              : undefined,
          );
          expect(storedAttached(disk).groups[0].submission).toBe(
            failRetirement ? 'completed' : 'accepted',
          );
          expect(
            storedAttached(disk).groups[0].acceptanceReviewedAt,
          ).toBeDefined();
          await restarted.provider.reviewAttachedOrderGroups();
          const recovered =
            await restarted.provider.reconcileRecoveredDispatches();
          expect(recovered).toStrictEqual([
            expect.objectContaining({ outcome: 'succeeded' }),
          ]);
          expect(recovered[0].acknowledgeable).not.toBe(false);
          await restarted.provider.acknowledgeRecoveredDispatch(
            recovered[0].recoveryId,
          );
          expect(
            (
              await restarted.provider.cancelOrder({
                symbol: 'BTC',
                orderId: group.groupId,
              })
            ).success,
          ).toBe(true);
          expect(
            restarted.calls.filter(
              (call) => call.function === '_signCreateGroupedOrders',
            ),
          ).toHaveLength(0);
          expect(
            (
              await restarted.provider.placeOrder({
                symbol: 'BTC',
                isBuy: true,
                size: '0.001',
                orderType: 'limit',
                price: '90000',
              })
            ).success,
          ).toBe(true);
        } finally {
          clock.mockRestore();
        }
      },
    );

    it.each(['nonce', 'hash', 'expiry', 'kind', 'owner'] as const)(
      'refuses fresh complete acceptance against a same-intent ledger with different %s',
      async (mismatch) => {
        const { disk, infrastructure } = durableInfrastructure();
        const built = buildProvider({
          platformDependencies: infrastructure,
          registeredKey: '9c'.repeat(40),
        });
        const venue = attachedVenue(built);
        const send = built.clientInstance.sendTx.getMockImplementation();
        built.clientInstance.sendTx.mockImplementation(
          async (...args: unknown[]) => {
            await send?.(...args);
            throw new Error('lost response');
          },
        );
        await built.provider.placeOrder(attachedIntent);
        const {
          groups: [group],
        } = storedAttached(disk);
        const clock = vi
          .spyOn(Date, 'now')
          .mockReturnValue(Number(group.preparedAt) + 1000);
        try {
          // Persist the complete observation without consuming the pending entry.
          built.clientInstance.getNextNonce.mockResolvedValue({
            code: 200,
            nonce: group.nonce,
          });
          await built.provider.reviewAttachedOrderGroups();
          const ledgerKey = 'lighterNonceLedger:testnet:28:7';
          const ledger = JSON.parse(String(disk.get(ledgerKey))) as {
            entries: {
              nonce: number;
              txHash: string;
              expiresAt: number;
              kind: number;
              owner: string | null;
            }[];
          };
          if (mismatch === 'nonce') {
            ledger.entries[0].nonce += 1;
          }
          if (mismatch === 'hash') {
            ledger.entries[0].txHash = 'abcd';
          }
          if (mismatch === 'expiry') {
            ledger.entries[0].expiresAt += 1;
          }
          if (mismatch === 'kind') {
            ledger.entries[0].kind = 14;
          }
          if (mismatch === 'owner') {
            ledger.entries[0].owner = 'different-owner';
          }
          disk.set(ledgerKey, JSON.stringify(ledger));
          const { key } = storedAttached(disk);
          const journalBefore = disk.get(key);
          const ledgerBefore = disk.get(ledgerKey);
          built.clientInstance.getNextNonce.mockResolvedValue({
            code: 200,
            nonce: Number(group.nonce) + 10,
          });
          built.clientInstance.getTx.mockClear();
          built.clientInstance.getActiveOrders.mockClear();
          const reviewed = await built.provider.reviewAttachedOrderGroups();
          expect(reviewed[0].submission).toBe('accepted');
          expect(venue.active).toHaveLength(3);
          expect(built.clientInstance.getActiveOrders).toHaveBeenCalledTimes(1);
          expect(built.clientInstance.getTx).toHaveBeenCalledWith(group.txHash);
          expect(built.clientInstance.getNextNonce).toHaveBeenCalledWith(28, 7);
          expect(disk.get(ledgerKey)).toBe(ledgerBefore);
          expect(disk.get(key)).toBe(journalBefore);
          const pending = await built.provider.getRecoveredDispatches();
          expect(pending).toStrictEqual([
            expect.objectContaining({
              outcome: 'unknown',
              acknowledgeable: false,
            }),
          ]);
          await expect(
            built.provider.acknowledgeRecoveredDispatch(pending[0].recoveryId),
          ).rejects.toThrow('cannot be acknowledged');
        } finally {
          clock.mockRestore();
        }
      },
    );

    it.each(['bounded-history', 'recorded-id', 'partial-leg'] as const)(
      'refuses exact failed retirement with %s',
      async (evidence) => {
        const { disk, infrastructure } = durableInfrastructure();
        const built = buildProvider({
          platformDependencies: infrastructure,
          registeredKey: '9c'.repeat(40),
        });
        const venue = attachedVenue(built);
        const send = built.clientInstance.sendTx.getMockImplementation();
        built.clientInstance.sendTx.mockImplementation(
          async (...args: unknown[]) => {
            await send?.(...args);
            throw new Error('lost response');
          },
        );
        await built.provider.placeOrder(attachedIntent);
        const { key, groups } = storedAttached(disk);
        const group = groups[0];
        const [template] = venue.active.splice(0);
        if (evidence === 'recorded-id') {
          group.venueIds[0] = '500';
        }
        if (evidence === 'partial-leg') {
          venue.active.push(template);
          group.venueIds[0] = '500';
        }
        disk.set(key, JSON.stringify(groups));
        if (evidence === 'bounded-history') {
          built.clientInstance.getInactiveOrders.mockImplementation(
            async (_account, _token, _limit, cursor) => {
              const page = Number(cursor ?? 0);
              return {
                code: 200,
                orders: Array.from({ length: 100 }, (_value, index) => ({
                  ...template,
                  orderIndex: 10000 + page * 100 + index,
                  clientOrderIndex: 10000 + page * 100 + index,
                })),
                nextCursor: String(page + 1),
              };
            },
          );
        }
        built.clientInstance.getTx.mockResolvedValue({
          code: 200,
          hash: group.txHash,
          accountIndex: 28,
          apiKeyIndex: 7,
          nonce: group.nonce,
          status: 0,
        });
        const ledgerKey = 'lighterNonceLedger:testnet:28:7';
        const before = { ledger: disk.get(ledgerKey), journal: disk.get(key) };
        const reviewed = await built.provider.reviewAttachedOrderGroups();
        expect(reviewed[0].submission).toBe('unknown');
        expect(reviewed[0].historyStatus).toBe(
          evidence === 'bounded-history' ? 'bounded' : 'complete',
        );
        expect(built.clientInstance.getTx).toHaveBeenCalledWith(group.txHash);
        expect(disk.get(key)).toBe(before.journal);
        expect(disk.get(ledgerKey)).toBe(before.ledger);
        const pending = await built.provider.getRecoveredDispatches();
        expect(pending).toStrictEqual([
          expect.objectContaining({
            outcome: 'unknown',
            acknowledgeable: false,
          }),
        ]);
        await expect(
          built.provider.acknowledgeRecoveredDispatch(pending[0].recoveryId),
        ).rejects.toThrow('cannot be acknowledged');
      },
    );

    it('keeps a local terminal group unchanged while reviewing another group', async () => {
      const { disk, infrastructure } = durableInfrastructure();
      const built = buildProvider({
        platformDependencies: infrastructure,
        registeredKey: '9c'.repeat(40),
      });
      const venue = attachedVenue(built);
      const first = await built.provider.placeOrder(attachedIntent);
      const firstId = first.attachedOrderGroup?.groupId;
      if (!firstId) {
        throw new Error('Missing first group');
      }
      expect(
        (await built.provider.cancelOrder({ symbol: 'BTC', orderId: firstId }))
          .success,
      ).toBe(true);
      const terminal = storedAttached(disk).groups[0];
      venue.inactive.length = 0;
      const second = await built.provider.placeOrder(attachedIntent);
      expect(second.success).toBe(true);
      built.clientInstance.getActiveOrders.mockClear();
      const groups = await built.provider.reviewAttachedOrderGroups();
      expect(groups.map((group) => group.submission)).toStrictEqual([
        'canceled',
        'accepted',
      ]);
      expect(storedAttached(disk).groups[0]).toStrictEqual(terminal);
      expect(built.clientInstance.getActiveOrders).toHaveBeenCalledTimes(1);
      expect(built.clientInstance.getActiveOrders).toHaveBeenCalledWith(
        28,
        expect.any(String),
        1,
      );
    });

    it('clears retained nonacceptance when only one exact leg appears', async () => {
      const { disk, infrastructure } = durableInfrastructure();
      const built = buildProvider({
        platformDependencies: infrastructure,
        registeredKey: '9c'.repeat(40),
      });
      const venue = attachedVenue(built);
      const send = built.clientInstance.sendTx.getMockImplementation();
      built.clientInstance.sendTx.mockImplementation(
        async (...args: unknown[]) => {
          await send?.(...args);
          throw new Error('lost response');
        },
      );
      await built.provider.placeOrder(attachedIntent);
      const {
        groups: [group],
      } = storedAttached(disk);
      const [parent] = venue.active.splice(0);
      const clock = vi
        .spyOn(Date, 'now')
        .mockReturnValue(Number(group.expiresAt) + 31_000);
      try {
        built.clientInstance.getNextNonce.mockResolvedValue({
          code: 200,
          nonce: group.nonce,
        });
        await built.provider.reconcileRecoveredDispatches();
        expect(storedAttached(disk).groups[0].nonAcceptance).toBe('expired');
        venue.active.push(parent);
        const [reviewed] = await built.provider.reviewAttachedOrderGroups();
        expect(reviewed.submission).toBe('accepted');
        expect(
          reviewed.orders?.slice(1).map((row) => row.status),
        ).toStrictEqual(['unknown', 'unknown']);
        expect(storedAttached(disk).groups[0].nonAcceptance).toBeUndefined();
        expect(storedAttached(disk).groups[0].venueIds).toStrictEqual([
          '500',
          null,
          null,
        ]);
      } finally {
        clock.mockRestore();
      }
    });

    it.each([
      'partial',
      'missing',
      'mismatched-side',
      'mismatched-hash',
      'nonce-not-advanced',
    ] as const)(
      'does not settle acceptance from %s evidence',
      async (control) => {
        const { disk, infrastructure } = durableInfrastructure();
        const built = buildProvider({
          platformDependencies: infrastructure,
          registeredKey: '9c'.repeat(40),
        });
        const venue = attachedVenue(built);
        const send = built.clientInstance.sendTx.getMockImplementation();
        built.clientInstance.sendTx.mockImplementation(
          async (...args: unknown[]) => {
            await send?.(...args);
            throw new Error('lost response');
          },
        );
        await built.provider.placeOrder(attachedIntent);
        await built.provider.reviewAttachedOrderGroups();
        const {
          groups: [group],
        } = storedAttached(disk);
        if (control === 'partial') {
          venue.active.pop();
        }
        if (control === 'missing') {
          venue.active.splice(0);
        }
        if (control === 'mismatched-side') {
          venue.active[0].isAsk = !venue.active[0].isAsk;
        }
        if (control === 'mismatched-hash') {
          built.clientInstance.getTx.mockResolvedValue({
            code: 200,
            hash: 'beef',
            accountIndex: 28,
            apiKeyIndex: 7,
            nonce: group.nonce,
            status: 2,
          });
        }
        built.clientInstance.getNextNonce.mockResolvedValue({
          code: 200,
          nonce:
            Number(group.nonce) + (control === 'nonce-not-advanced' ? 0 : 1),
        });
        const clock = vi
          .spyOn(Date, 'now')
          .mockReturnValue(Number(group.expiresAt) + 31_000);
        try {
          const review = await built.provider.reviewAttachedOrderGroups().then(
            (groups) => groups,
            (error: unknown) => error,
          );
          expect(Array.isArray(review)).toBe(control !== 'mismatched-side');
          expect(review instanceof Error ? review.message : undefined).toBe(
            control === 'mismatched-side'
              ? 'Lighter attached-order identity does not match signed intent'
              : undefined,
          );
          const pending = await built.provider.reconcileRecoveredDispatches();
          expect(pending).toStrictEqual([
            expect.objectContaining({
              outcome: 'unknown',
              acknowledgeable: false,
            }),
          ]);
          await expect(
            built.provider.acknowledgeRecoveredDispatch(pending[0].recoveryId),
          ).rejects.toThrow('cannot be acknowledged');
          expect(
            built.calls.filter(
              (call) => call.function === '_signCreateGroupedOrders',
            ),
          ).toHaveLength(1);
        } finally {
          clock.mockRestore();
        }
      },
    );

    it('stops attached history at preparation time before requesting an older page', async () => {
      const { disk, infrastructure } = durableInfrastructure();
      const built = buildProvider({
        platformDependencies: infrastructure,
        registeredKey: '9c'.repeat(40),
      });
      const venue = attachedVenue(built);
      await built.provider.placeOrder(attachedIntent);
      const [template] = venue.active.splice(0);
      const old = {
        ...template,
        clientOrderIndex: 999,
        orderIndex: 999,
        timestamp: Math.floor(Date.now() / 1000) - 3600,
      };
      built.clientInstance.getInactiveOrders.mockImplementation(
        async (_account, _token, _limit, cursor) => {
          if (cursor) {
            throw new Error('read beyond preparation cutoff');
          }
          return { code: 200, orders: [old], nextCursor: 'older' };
        },
      );
      const groups = await built.provider.reviewAttachedOrderGroups();
      expect(groups).toHaveLength(1);
      expect(
        groups[0].orders?.every((order) => order.status === 'unknown'),
      ).toBe(true);
      expect(built.clientInstance.getInactiveOrders).toHaveBeenCalledTimes(1);
      expect(storedAttached(disk).groups[0].submission).toBe('accepted');
    });

    it('returns bounded unknown for a missing group when the attached history budget is exhausted', async () => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      const venue = attachedVenue(built);
      await built.provider.placeOrder(attachedIntent);
      const [template] = venue.active.splice(0);
      built.clientInstance.getInactiveOrders.mockImplementation(
        async (_account, _token, _limit, cursor) => {
          const page = Number(cursor ?? 0);
          return {
            code: 200,
            orders: Array.from({ length: 100 }, (_value, index) => ({
              ...template,
              orderIndex: 10000 + page * 100 + index,
              clientOrderIndex: 10000 + page * 100 + index,
            })),
            nextCursor: String(page + 1),
          };
        },
      );
      const groups = await built.provider.reviewAttachedOrderGroups();
      expect(groups).toHaveLength(1);
      expect(
        groups[0].orders?.every((order) => order.status === 'unknown'),
      ).toBe(true);
      expect(
        built.clientInstance.getInactiveOrders.mock.calls.length,
      ).toBeLessThanOrEqual(100);
    });

    it('abandons an expired never-landed group without walking older unrelated history', async () => {
      const { disk, infrastructure } = durableInfrastructure();
      const built = buildProvider({
        platformDependencies: infrastructure,
        registeredKey: '9c'.repeat(40),
      });
      const venue = attachedVenue(built);
      const send = built.clientInstance.sendTx.getMockImplementation();
      built.clientInstance.sendTx.mockImplementation(
        async (...args: unknown[]) => {
          await send?.(...args);
          throw new Error('lost response');
        },
      );
      await built.provider.placeOrder(attachedIntent);
      const {
        groups: [group],
      } = storedAttached(disk);
      const [template] = venue.active.splice(0);
      built.clientInstance.getInactiveOrders.mockImplementation(
        async (_account, _token, _limit, cursor) => {
          if (cursor) {
            throw new Error('older than preparation requested');
          }
          return {
            code: 200,
            orders: Array.from({ length: 100 }, (_value, index) => ({
              ...template,
              orderIndex: 10000 + index,
              clientOrderIndex: 10000 + index,
              timestamp: Math.floor(Number(group.preparedAt) / 1000) - 3600,
            })),
            nextCursor: 'remaining-10000-rows',
          };
        },
      );
      const clock = vi
        .spyOn(Date, 'now')
        .mockReturnValue(Number(group.expiresAt) + 31_000);
      try {
        await built.provider.reconcileRecoveredDispatches();
        expect(
          (
            await built.provider.cancelOrder({
              symbol: 'BTC',
              orderId: group.groupId,
            })
          ).success,
        ).toBe(true);
        expect(built.clientInstance.getInactiveOrders).toHaveBeenCalledTimes(1);
        expect(
          built.calls.filter((call) => call.function === '_signCancelOrder'),
        ).toHaveLength(0);
      } finally {
        clock.mockRestore();
      }
    });

    it('keeps another exact group reviewable when one group reaches the history budget', async () => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      const venue = attachedVenue(built);
      await built.provider.placeOrder(attachedIntent);
      const firstRows = venue.active.splice(0);
      const second = await built.provider.placeOrder(attachedIntent);
      expect(second.success).toBe(true);
      built.clientInstance.getInactiveOrders.mockImplementation(
        async (_account, _token, _limit, cursor) => {
          const page = Number(cursor ?? 0);
          return {
            code: 200,
            orders: Array.from({ length: 100 }, (_value, index) => ({
              ...firstRows[0],
              orderIndex: 10000 + page * 100 + index,
              clientOrderIndex: 10000 + page * 100 + index,
            })),
            nextCursor: String(page + 1),
          };
        },
      );
      const groups = await built.provider.reviewAttachedOrderGroups();
      expect(groups).toHaveLength(2);
      expect(groups[0].historyStatus).toBe('bounded');
      expect(
        groups[0].orders?.every((order) => order.status === 'unknown'),
      ).toBe(true);
      expect(groups[1].historyStatus).toBe('complete');
      expect(
        groups[1].orders?.every((order) => order.orderId !== undefined),
      ).toBe(true);
    });

    it('clears retained non-acceptance on executed cancellation evidence without inventing missing legs', async () => {
      const { disk, infrastructure } = durableInfrastructure();
      const built = buildProvider({
        platformDependencies: infrastructure,
        registeredKey: '9c'.repeat(40),
      });
      built.clientInstance.sendTx.mockRejectedValueOnce(
        new Error('lost response'),
      );
      await built.provider.placeOrder(attachedIntent);
      const {
        groups: [group],
      } = storedAttached(disk);
      const clock = vi
        .spyOn(Date, 'now')
        .mockReturnValue(Number(group.expiresAt) + 31_000);
      try {
        await built.provider.reconcileRecoveredDispatches();
        expect(storedAttached(disk).groups[0].nonAcceptance).toBe('expired');
        built.clientInstance.getTx.mockResolvedValue({
          code: 200,
          hash: group.txHash,
          accountIndex: 28,
          apiKeyIndex: 7,
          nonce: group.nonce,
          status: 2,
        });
        expect(
          (
            await built.provider.cancelOrder({
              symbol: 'BTC',
              orderId: group.groupId,
            })
          ).success,
        ).toBe(false);
        const saved = storedAttached(disk).groups[0];
        expect(saved.submission).toBe('accepted');
        expect(saved.nonAcceptance).toBeUndefined();
        expect(saved.venueIds).toStrictEqual([null, null, null]);
        expect(
          built.calls.filter((call) => call.function === '_signCancelOrder'),
        ).toHaveLength(0);
      } finally {
        clock.mockRestore();
      }
    });

    it('quarantines pre-expiry nonce advance until later exact execution is reviewable', async () => {
      const { disk, infrastructure } = durableInfrastructure();
      const built = buildProvider({
        platformDependencies: infrastructure,
        registeredKey: '9c'.repeat(40),
      });
      built.clientInstance.sendTx.mockRejectedValue(new Error('lost response'));
      await built.provider.placeOrder(attachedIntent);
      const {
        groups: [group],
      } = storedAttached(disk);
      if (group.nonce === null || group.expiresAt === null) {
        throw new Error('Missing identity');
      }
      const clock = vi.spyOn(Date, 'now').mockReturnValue(group.expiresAt - 1);
      try {
        built.clientInstance.getTx.mockResolvedValue(null);
        built.clientInstance.getNextNonce.mockResolvedValue({
          code: 200,
          nonce: group.nonce + 1,
        });
        const pending = await built.provider.reconcileRecoveredDispatches();
        expect(pending).toHaveLength(1);
        expect(storedAttached(disk).groups[0].nonAcceptance).toBeUndefined();
        expect(
          (
            await built.provider.cancelOrder({
              symbol: 'BTC',
              orderId: group.groupId,
            })
          ).success,
        ).toBe(false);
        expect((await built.provider.placeOrder(attachedIntent)).success).toBe(
          false,
        );
        built.clientInstance.getTx.mockResolvedValue({
          code: 200,
          hash: group.txHash,
          accountIndex: 28,
          apiKeyIndex: 7,
          nonce: group.nonce,
          status: 2,
        });
        expect(
          (await built.provider.reviewAttachedOrderGroups())[0].submission,
        ).toBe('accepted');
        expect(storedAttached(disk).groups[0].nonAcceptance).toBeUndefined();
        expect(
          built.calls.filter((call) => call.function === '_signCancelOrder'),
        ).toStrictEqual([]);
      } finally {
        clock.mockRestore();
      }
    });

    it.each(['executed', 'live-legs'] as const)(
      'keeps review usable when %s contradicts a retained non-acceptance proof',
      async (evidence) => {
        const { disk, infrastructure } = durableInfrastructure();
        const built = buildProvider({
          platformDependencies: infrastructure,
          registeredKey: '9c'.repeat(40),
        });
        const venue = attachedVenue(built);
        const send = built.clientInstance.sendTx.getMockImplementation();
        if (!send) {
          throw new Error('Missing venue');
        }
        built.clientInstance.sendTx.mockImplementation(
          async (kind: number, txInfo: string) => {
            await send(kind, txInfo);
            throw new Error('lost response');
          },
        );
        await built.provider.placeOrder(attachedIntent);
        const {
          groups: [group],
        } = storedAttached(disk);
        if (group.nonce === null || group.expiresAt === null) {
          throw new Error('Missing identity');
        }
        const clock = vi
          .spyOn(Date, 'now')
          .mockReturnValue(group.expiresAt + 700000);
        try {
          built.clientInstance.getTx.mockResolvedValue(null);
          built.clientInstance.getNextNonce.mockResolvedValue({
            code: 200,
            nonce: group.nonce,
          });
          await built.provider.reconcileRecoveredDispatches();
          expect(storedAttached(disk).groups[0].nonAcceptance).toBe('expired');
          if (evidence === 'executed') {
            venue.active.splice(0);
            built.clientInstance.getTx.mockResolvedValue({
              code: 200,
              hash: group.txHash,
              accountIndex: 28,
              apiKeyIndex: 7,
              nonce: group.nonce,
              status: 2,
            });
          }
          expect(
            (await built.provider.reviewAttachedOrderGroups())[0].submission,
          ).toBe('accepted');
          expect(storedAttached(disk).groups[0].nonAcceptance).toBeUndefined();
        } finally {
          clock.mockRestore();
        }
      },
    );

    it.each(['review', 'cancel'] as const)(
      'finds exact terminal attached legs on an older page during %s',
      async (operation) => {
        const { disk, infrastructure } = durableInfrastructure();
        const built = buildProvider({
          platformDependencies: infrastructure,
          registeredKey: '9c'.repeat(40),
        });
        const venue = attachedVenue(built);
        const placed = await built.provider.placeOrder(attachedIntent);
        const terminal = venue.active
          .splice(0)
          .map((row) => ({ ...row, status: 'canceled' }));
        built.clientInstance.getInactiveOrders.mockImplementation(
          async (_account, _token, _limit, cursor) => ({
            code: 200,
            orders:
              cursor === 'older'
                ? terminal
                : [{ ...terminal[0], orderIndex: 999, clientOrderIndex: 999 }],
            ...(cursor === undefined ? { nextCursor: 'older' } : {}),
          }),
        );
        if (operation === 'review') {
          await built.provider.reviewAttachedOrderGroups();
        } else {
          await built.provider.cancelOrder({
            symbol: 'BTC',
            orderId: placed.attachedOrderGroup?.groupId ?? '',
          });
        }
        expect(['completed', 'canceled']).toContain(
          storedAttached(disk).groups[0].submission,
        );
        expect(built.clientInstance.getInactiveOrders).toHaveBeenCalledWith(
          28,
          expect.any(String),
          100,
          'older',
          1,
        );
        expect(
          built.calls.filter((call) => call.function === '_signCancelOrder'),
        ).toStrictEqual([]);
      },
    );

    it('abandons retained exact failure after expiry when transaction history ages out', async () => {
      const { disk, infrastructure } = durableInfrastructure();
      const built = buildProvider({
        platformDependencies: infrastructure,
        registeredKey: '9c'.repeat(40),
      });
      built.clientInstance.sendTx.mockRejectedValue(new Error('lost response'));
      await built.provider.placeOrder(attachedIntent);
      const {
        groups: [group],
      } = storedAttached(disk);
      if (group.expiresAt === null) {
        throw new Error('Missing expiry');
      }
      built.clientInstance.getTx.mockResolvedValue({
        code: 200,
        hash: group.txHash,
        accountIndex: 28,
        apiKeyIndex: 7,
        nonce: group.nonce,
        status: 0,
      });
      await built.provider.reconcileRecoveredDispatches();
      expect(storedAttached(disk).groups[0].nonAcceptance).toBe('failed');
      built.clientInstance.getTx.mockResolvedValue(null);
      const clock = vi
        .spyOn(Date, 'now')
        .mockReturnValue(group.expiresAt + 700000);
      try {
        expect(
          (
            await built.provider.cancelOrder({
              symbol: 'BTC',
              orderId: group.groupId,
            })
          ).success,
        ).toBe(true);
        expect(storedAttached(disk).groups[0].submission).toBe('canceled');
        expect(
          built.calls.filter((call) => call.function === '_signCancelOrder'),
        ).toStrictEqual([]);
      } finally {
        clock.mockRestore();
      }
    });

    it('retains ledger ownership after a live leg was recorded even when later history is absent', async () => {
      const { disk, infrastructure } = durableInfrastructure();
      const built = buildProvider({
        platformDependencies: infrastructure,
        registeredKey: '9c'.repeat(40),
      });
      const venue = attachedVenue(built);
      const send = built.clientInstance.sendTx.getMockImplementation();
      if (!send) {
        throw new Error('Missing venue');
      }
      built.clientInstance.sendTx.mockImplementationOnce(
        async (kind: number, txInfo: string) => {
          await send(kind, txInfo);
          throw new Error('lost response');
        },
      );
      await built.provider.placeOrder(attachedIntent);
      built.clientInstance.getTx.mockResolvedValue(null);
      await built.provider.reviewAttachedOrderGroups();
      const {
        groups: [group],
      } = storedAttached(disk);
      expect(group.venueIds).toStrictEqual(['500', '501', '502']);
      if (group.nonce === null || group.expiresAt === null) {
        throw new Error('Missing identity');
      }
      venue.active.splice(0);
      const clock = vi
        .spyOn(Date, 'now')
        .mockReturnValue(group.expiresAt + 700000);
      try {
        built.clientInstance.getNextNonce.mockResolvedValue({
          code: 200,
          nonce: group.nonce + 1,
        });
        await built.provider.reviewAttachedOrderGroups();
        const pending = await built.provider.reconcileRecoveredDispatches();
        expect(pending).toHaveLength(1);
        expect(pending[0].acknowledgeable).toBe(false);
        expect(
          (
            await built.provider.cancelOrder({
              symbol: 'BTC',
              orderId: group.groupId,
            })
          ).success,
        ).toBe(false);
        expect(storedAttached(disk).groups[0].nonAcceptance).toBeUndefined();
        expect(storedAttached(disk).groups[0].submission).toBe('accepted');
        expect(
          built.calls.filter((call) => call.function === '_signCancelOrder'),
        ).toStrictEqual([]);
      } finally {
        clock.mockRestore();
      }
    });

    it('cancels fresh live legs instead of blindly abandoning an expired non-acceptance proof', async () => {
      const { disk, infrastructure } = durableInfrastructure();
      const built = buildProvider({
        platformDependencies: infrastructure,
        registeredKey: '9c'.repeat(40),
      });
      const venue = attachedVenue(built);
      const send = built.clientInstance.sendTx.getMockImplementation();
      if (!send) {
        throw new Error('Missing venue');
      }
      built.clientInstance.sendTx.mockImplementationOnce(
        async (kind: number, txInfo: string) => {
          await send(kind, txInfo);
          throw new Error('lost response');
        },
      );
      await built.provider.placeOrder(attachedIntent);
      const {
        groups: [group],
      } = storedAttached(disk);
      if (group.nonce === null || group.expiresAt === null) {
        throw new Error('Missing identity');
      }
      const clock = vi
        .spyOn(Date, 'now')
        .mockReturnValue(group.expiresAt + 700000);
      try {
        built.clientInstance.getTx.mockResolvedValue(null);
        built.clientInstance.getNextNonce.mockResolvedValue({
          code: 200,
          nonce: group.nonce + 1,
        });
        await built.provider.reconcileRecoveredDispatches();
        expect(storedAttached(disk).groups[0].nonAcceptance).toBe(
          'nonce-consumed',
        );
        expect(
          (
            await built.provider.cancelOrder({
              symbol: 'BTC',
              orderId: group.groupId,
            })
          ).success,
        ).toBe(true);
        expect(
          built.calls.filter((call) => call.function === '_signCancelOrder'),
        ).toHaveLength(3);
        expect(venue.active).toStrictEqual([]);
        expect(storedAttached(disk).groups[0].nonAcceptance).toBeUndefined();
      } finally {
        clock.mockRestore();
      }
    });

    it.each(['account', 'slot', 'nonce', 'hash', 'absent'] as const)(
      'retains accepted no-leg groups with %s failed-lookup mismatch or absence',
      async (identity) => {
        const { disk, infrastructure } = durableInfrastructure();
        const built = buildProvider({
          platformDependencies: infrastructure,
          registeredKey: '9c'.repeat(40),
        });
        await built.provider.placeOrder(attachedIntent);
        const {
          groups: [group],
        } = storedAttached(disk);
        built.clientInstance.getTx.mockResolvedValue(
          identity === 'absent'
            ? null
            : {
                code: 200,
                hash: identity === 'hash' ? 'deadbeef' : group.txHash,
                accountIndex: identity === 'account' ? 29 : 28,
                apiKeyIndex: identity === 'slot' ? 19 : 7,
                nonce: identity === 'nonce' ? 999 : group.nonce,
                status: 0,
              },
        );
        expect(
          (await built.provider.reviewAttachedOrderGroups())[0].submission,
        ).toBe('accepted');
        expect(storedAttached(disk).groups[0].submission).toBe('accepted');
      },
    );

    it.each([
      'repeated-cursor',
      'empty-advance',
      'missing',
      'wrong-account',
    ] as const)(
      'keeps attached ownership protected on older history %s',
      async (failure) => {
        const { disk, infrastructure } = durableInfrastructure();
        const built = buildProvider({
          platformDependencies: infrastructure,
          registeredKey: '9c'.repeat(40),
        });
        const venue = attachedVenue(built);
        await built.provider.placeOrder(attachedIntent);
        const terminal = venue.active
          .splice(0)
          .map((row) => ({ ...row, status: 'canceled' }));
        const unrelated = {
          ...terminal[0],
          orderIndex: 999,
          clientOrderIndex: 999,
        };
        built.clientInstance.getInactiveOrders.mockImplementation(
          async (_account, _token, _limit, cursor) => {
            let orders: LighterApiOrder[] = [unrelated];
            if (cursor !== undefined && failure === 'empty-advance') {
              orders = [];
            }
            if (cursor !== undefined && failure === 'wrong-account') {
              orders = terminal.map((row) => ({
                ...row,
                ownerAccountIndex: 29,
              }));
            }
            return {
              code: 200,
              orders,
              ...(cursor === undefined ||
              failure === 'repeated-cursor' ||
              failure === 'empty-advance'
                ? { nextCursor: 'older' }
                : {}),
            };
          },
        );
        let error: unknown;
        try {
          await built.provider.reviewAttachedOrderGroups();
        } catch (caught) {
          error = caught;
        }
        expect(error instanceof Error).toBe(
          failure === 'repeated-cursor' || failure === 'empty-advance',
        );
        expect(storedAttached(disk).groups[0].submission).toBe('accepted');
        expect(
          built.calls.filter((call) => call.function === '_signCancelOrder'),
        ).toStrictEqual([]);
      },
    );

    it('reclaims an accepted attached group whose exact transaction later failed without creating legs', async () => {
      const { disk, infrastructure } = durableInfrastructure();
      const built = buildProvider({
        platformDependencies: infrastructure,
        registeredKey: '9c'.repeat(40),
      });
      await built.provider.placeOrder(attachedIntent);
      const {
        groups: [group],
      } = storedAttached(disk);
      built.clientInstance.getTx.mockResolvedValue({
        code: 200,
        hash: group.txHash,
        accountIndex: 28,
        apiKeyIndex: 7,
        nonce: group.nonce,
        status: 0,
      });
      expect(
        (await built.provider.reviewAttachedOrderGroups())[0].submission,
      ).toBe('canceled');
      expect(storedAttached(disk).groups[0].submission).toBe('canceled');
    });

    it.each(['expired', 'nonce-consumed', 'venue-refusal'] as const)(
      'transfers exact %s attached non-acceptance before ledger retirement and permits explicit abandonment',
      async (proof) => {
        const { disk, infrastructure } = durableInfrastructure();
        const first = buildProvider({
          platformDependencies: infrastructure,
          registeredKey: '9c'.repeat(40),
        });
        first.clientInstance.sendTx.mockRejectedValue(
          proof === 'venue-refusal'
            ? new LighterApiError('order refused', 21000)
            : new Error('transport before acceptance'),
        );
        expect((await first.provider.placeOrder(attachedIntent)).success).toBe(
          false,
        );
        const {
          groups: [group],
        } = storedAttached(disk);
        if (group.expiresAt === null || group.nonce === null) {
          throw new Error('Missing dispatch identity');
        }
        const clock = vi
          .spyOn(Date, 'now')
          .mockReturnValue(group.expiresAt + 700000);
        try {
          first.clientInstance.getTx.mockResolvedValue(null);
          first.clientInstance.getNextNonce.mockResolvedValue({
            code: 200,
            nonce: group.nonce + (proof === 'nonce-consumed' ? 1 : 0),
          });
          expect(
            await first.provider.reconcileRecoveredDispatches(),
          ).toStrictEqual([]);
          const restarted = buildProvider({
            apiKeyIndex: 19,
            platformDependencies: infrastructure,
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
          expect(
            (await restarted.provider.getAttachedOrderGroups())[0].groupId,
          ).toBe(group.groupId);
          const canceled = await restarted.provider.cancelOrder({
            symbol: 'BTC',
            orderId: group.groupId,
          });
          expect(canceled.error).toBeUndefined();
          expect(canceled.success).toBe(true);
          expect(
            restarted.calls.filter(
              (call) =>
                call.function === '_signCancelOrder' ||
                call.function === '_signCreateGroupedOrders',
            ),
          ).toStrictEqual([]);
          expect(
            (await restarted.provider.placeOrder(attachedIntent)).success,
          ).toBe(true);
          expect(
            restarted.calls.filter(
              (call) => call.function === '_signCreateGroupedOrders',
            ),
          ).toHaveLength(1);
        } finally {
          clock.mockRestore();
        }
      },
    );

    it.each(
      (['accepted', 'failed'] as const).flatMap((outcome) =>
        (['matching', 'account', 'slot', 'nonce', 'hash'] as const).map(
          (identity) => ({ outcome, identity }),
        ),
      ),
    )(
      'settles attached $outcome only for exact $identity identity',
      async ({ outcome, identity }) => {
        const { disk, infrastructure } = durableInfrastructure();
        const built = buildProvider({
          platformDependencies: infrastructure,
          registeredKey: '9c'.repeat(40),
        });
        built.clientInstance.sendTx.mockRejectedValue(
          new Error('lost response'),
        );
        await built.provider.placeOrder(attachedIntent);
        const {
          groups: [group],
        } = storedAttached(disk);
        built.clientInstance.getTx.mockResolvedValue({
          code: 200,
          hash: identity === 'hash' ? 'deadbeef' : group.txHash,
          accountIndex: identity === 'account' ? 29 : 28,
          apiKeyIndex: identity === 'slot' ? 19 : 7,
          nonce: identity === 'nonce' ? 999 : group.nonce,
          status: outcome === 'accepted' ? 2 : 0,
        });
        let cancellationSuccess: boolean | undefined;
        if (outcome === 'accepted') {
          await built.provider.reviewAttachedOrderGroups();
        } else {
          const result = await built.provider.cancelOrder({
            symbol: 'BTC',
            orderId: group.groupId,
          });
          cancellationSuccess = result.success;
        }
        expect(cancellationSuccess).toBe(
          outcome === 'accepted' ? undefined : identity === 'matching',
        );
        const terminal = outcome === 'accepted' ? 'accepted' : 'canceled';
        expect(
          (await built.provider.getAttachedOrderGroups())[0].submission,
        ).toBe(identity === 'matching' ? terminal : 'unknown');
        expect(
          built.calls.filter((call) => call.function === '_signCancelOrder'),
        ).toStrictEqual([]);
      },
    );

    it('persists exact terminal attached completion and skips subsequent venue reads and unchanged writes', async () => {
      const { disk, infrastructure } = durableInfrastructure();
      const built = buildProvider({
        platformDependencies: infrastructure,
        registeredKey: '9c'.repeat(40),
      });
      const venue = attachedVenue(built);
      await built.provider.placeOrder(attachedIntent);
      venue.inactive.push(
        ...venue.active
          .splice(0)
          .map((row) => ({ ...row, status: 'canceled' })),
      );
      expect(
        (await built.provider.reviewAttachedOrderGroups())[0].submission,
      ).toBe('completed');
      expect(storedAttached(disk).groups[0].submission).toBe('completed');
      built.clientInstance.getActiveOrders.mockClear();
      built.clientInstance.getInactiveOrders.mockClear();
      vi.mocked(infrastructure.diskCache).setItem.mockClear();
      expect(
        (await built.provider.reviewAttachedOrderGroups())[0].submission,
      ).toBe('completed');
      expect(built.clientInstance.getActiveOrders).not.toHaveBeenCalled();
      expect(built.clientInstance.getInactiveOrders).not.toHaveBeenCalled();
      expect(
        vi.mocked(infrastructure.diskCache).setItem.mock.calls,
      ).toStrictEqual([]);
    });

    it('rejects oversized inactive containers before attached cancellation signs', async () => {
      const { infrastructure } = durableInfrastructure();
      const built = buildProvider({
        platformDependencies: infrastructure,
        registeredKey: '9c'.repeat(40),
      });
      const venue = attachedVenue(built);
      const placed = await built.provider.placeOrder(attachedIntent);
      const unrelated = {
        ...venue.active[0],
        clientOrderIndex: 7,
        orderIndex: 7,
      };
      built.clientInstance.getInactiveOrders.mockResolvedValue({
        code: 200,
        orders: Array.from({ length: 101 }, () => unrelated),
      });
      const result = await built.provider.cancelOrder({
        symbol: 'BTC',
        orderId: placed.attachedOrderGroup?.groupId ?? '',
      });
      expect(result.success).toBe(false);
      expect(
        built.calls.filter((call) => call.function === '_signCancelOrder'),
      ).toStrictEqual([]);
    });

    it.each(['terminal', 'unproven', 'one-unknown'] as const)(
      'reclaims full attached capacity only with exact terminal proof: %s',
      async (scenario) => {
        const { disk, infrastructure } = durableInfrastructure();
        const built = buildProvider({
          platformDependencies: infrastructure,
          registeredKey: '9c'.repeat(40),
        });
        const venue = attachedVenue(built);
        await built.provider.placeOrder(attachedIntent);
        const {
          key,
          groups: [original],
        } = storedAttached(disk);
        const groups = Array.from({ length: 64 }, (_, index) => {
          const copy = JSON.parse(
            JSON.stringify(original),
          ) as LighterAttachedGroup;
          const marketIndex = index < 32 ? 1 : 2;
          for (const [leg, wire] of copy.orders.entries()) {
            wire[0] = marketIndex;
            wire[1] = 10000 + index * 10 + leg;
          }
          copy.groupId = original.groupId.replace(
            /:\d+:\d+$/u,
            `:${marketIndex}:${copy.orders[0][1]}`,
          );
          copy.venueIds = [null, null, null];
          return copy;
        });
        if (scenario === 'one-unknown') {
          groups[63].submission = 'unknown';
        }
        disk.set(key, JSON.stringify(groups));
        const terminalRows = groups.flatMap((group, index) =>
          venue.active.map((row, leg) => ({
            ...row,
            clientOrderIndex: group.orders[leg][1],
            marketIndex: group.orders[leg][0],
            orderIndex: 1000 + index * 10 + leg,
            status: 'canceled',
            remainingBaseAmount: '0',
            parentOrderIndex: undefined,
            toTriggerOrderId0: undefined,
            toTriggerOrderId1: undefined,
          })),
        );
        built.clientInstance.getActiveOrders.mockResolvedValue({
          code: 200,
          orders: [],
        });
        built.clientInstance.getInactiveOrders.mockImplementation(
          async (_account, _token, _limit, _cursor, market) => ({
            code: 200,
            orders:
              scenario === 'unproven'
                ? []
                : terminalRows.filter(
                    (row) =>
                      row.marketIndex === market &&
                      (scenario !== 'one-unknown' ||
                        row.clientOrderIndex < 10630),
                  ),
          }),
        );
        built.clientInstance.getTx.mockResolvedValue(null);
        await built.provider.reviewAttachedOrderGroups();
        expect(built.clientInstance.getActiveOrders).toHaveBeenCalledTimes(2);
        expect(built.clientInstance.getInactiveOrders).toHaveBeenCalledTimes(2);
        const result = await built.provider.placeOrder(attachedIntent);
        expect(result.success).toBe(scenario === 'terminal');
        const retained = storedAttached(disk).groups;
        expect(retained).toHaveLength(64);
        expect(
          retained.some((group) => group.groupId === groups[63].groupId),
        ).toBe(true);
        expect(
          retained.some((group) => group.groupId === groups[0].groupId),
        ).toBe(scenario !== 'terminal');
      },
    );

    it.each(['active', 'inactive'] as const)(
      'rejects attached review session drift during the shared %s read',
      async (boundary) => {
        const { disk, infrastructure } = durableInfrastructure();
        const built = buildProvider({
          platformDependencies: infrastructure,
          registeredKey: '9c'.repeat(40),
        });
        const venue = attachedVenue(built);
        await built.provider.placeOrder(attachedIntent);
        const before = storedAttached(disk);
        const drift = async (): Promise<{
          code: number;
          orders: LighterApiOrder[];
        }> => {
          await built.provider.disconnect();
          return { code: 200, orders: [...venue.active] };
        };
        if (boundary === 'active') {
          built.clientInstance.getActiveOrders.mockImplementationOnce(drift);
        } else {
          built.clientInstance.getInactiveOrders.mockImplementationOnce(drift);
        }
        await expect(
          built.provider.reviewAttachedOrderGroups(),
        ).rejects.toThrow('cancelled');
        expect(storedAttached(disk)).toStrictEqual(before);
      },
    );

    it.each(['oversized', 'contradictory'] as const)(
      'rejects shared attached review containers with %s evidence',
      async (evidence) => {
        const { disk, infrastructure } = durableInfrastructure();
        const built = buildProvider({
          platformDependencies: infrastructure,
          registeredKey: '9c'.repeat(40),
        });
        const venue = attachedVenue(built);
        await built.provider.placeOrder(attachedIntent);
        const before = storedAttached(disk);
        if (evidence === 'oversized') {
          built.clientInstance.getInactiveOrders.mockResolvedValue({
            code: 200,
            orders: Array.from({ length: 101 }, () => venue.active[0]),
          });
        } else {
          venue.active[1].isAsk = !venue.active[1].isAsk;
        }
        await expect(
          built.provider.reviewAttachedOrderGroups(),
        ).rejects.toThrow(
          evidence === 'oversized'
            ? 'bounded authoritative'
            : 'does not match signed intent',
        );
        expect(storedAttached(disk)).toStrictEqual(before);
      },
    );

    it('does not rewrite unchanged accepted observations', async () => {
      const { infrastructure } = durableInfrastructure();
      const built = buildProvider({
        platformDependencies: infrastructure,
        registeredKey: '9c'.repeat(40),
      });
      attachedVenue(built);
      await built.provider.placeOrder(attachedIntent);
      await built.provider.reviewAttachedOrderGroups();
      vi.mocked(infrastructure.diskCache).setItem.mockClear();
      await built.provider.reviewAttachedOrderGroups();
      expect(
        vi
          .mocked(infrastructure.diskCache)
          .setItem.mock.calls.filter(([key]) =>
            key.startsWith('lighterAttachedOrders:'),
          ),
      ).toStrictEqual([]);
    });

    it.each(['absent-unexpired', 'pending', 'lookup-failure'] as const)(
      'quarantines attached non-acceptance ambiguity: %s',
      async (ambiguity) => {
        const { disk, infrastructure } = durableInfrastructure();
        const built = buildProvider({
          platformDependencies: infrastructure,
          registeredKey: '9c'.repeat(40),
        });
        built.clientInstance.sendTx.mockRejectedValue(
          new Error('lost response'),
        );
        await built.provider.placeOrder(attachedIntent);
        const {
          groups: [group],
        } = storedAttached(disk);
        if (group.nonce === null) {
          throw new Error('Missing nonce');
        }
        built.clientInstance.getNextNonce.mockResolvedValue({
          code: 200,
          nonce: group.nonce,
        });
        built.clientInstance.getTx.mockResolvedValue(
          ambiguity === 'pending'
            ? {
                code: 200,
                hash: group.txHash,
                accountIndex: 28,
                apiKeyIndex: 7,
                nonce: group.nonce,
                status: 1,
              }
            : null,
        );
        if (ambiguity === 'lookup-failure') {
          built.clientInstance.getTx.mockRejectedValue(
            new Error('lookup unavailable'),
          );
        }
        await built.provider.reconcileRecoveredDispatches();
        expect(
          (
            await built.provider.cancelOrder({
              symbol: 'BTC',
              orderId: group.groupId,
            })
          ).success,
        ).toBe(false);
        expect(storedAttached(disk).groups[0].nonAcceptance).toBeUndefined();
        expect(storedAttached(disk).groups[0].submission).toBe('unknown');
        expect(
          built.calls.filter((call) => call.function === '_signCancelOrder'),
        ).toStrictEqual([]);
      },
    );

    it('preserves nonce evidence when attached settlement persistence fails', async () => {
      const { disk, infrastructure } = durableInfrastructure();
      const built = buildProvider({
        platformDependencies: infrastructure,
        registeredKey: '9c'.repeat(40),
      });
      built.clientInstance.sendTx.mockRejectedValue(new Error('lost response'));
      await built.provider.placeOrder(attachedIntent);
      const before = new Map(disk);
      const {
        key,
        groups: [group],
      } = storedAttached(disk);
      if (group.nonce === null) {
        throw new Error('Missing nonce');
      }
      built.clientInstance.getTx.mockResolvedValue(null);
      built.clientInstance.getNextNonce.mockResolvedValue({
        code: 200,
        nonce: group.nonce + 1,
      });
      vi.mocked(infrastructure.diskCache).setItem.mockImplementation(
        async (storageKey, value) => {
          if (storageKey === key) {
            throw new Error('disk full');
          }
          disk.set(storageKey, value);
        },
      );
      if (group.expiresAt === null) {
        throw new Error('Missing expiry');
      }
      const clock = vi
        .spyOn(Date, 'now')
        .mockReturnValue(group.expiresAt + 700000);
      try {
        await expect(
          built.provider.reconcileRecoveredDispatches(),
        ).rejects.toThrow('disk full');
        expect(disk).toStrictEqual(before);
        expect(storedAttached(disk).groups[0].nonAcceptance).toBeUndefined();
      } finally {
        clock.mockRestore();
      }
    });

    it.each(
      (['failed', 'expired', 'nonce-consumed'] as const).flatMap((proof) =>
        (['slot', 'nonce', 'hash', 'group', 'expiry'] as const).map(
          (identity) => ({ proof, identity }),
        ),
      ),
    )(
      'retains attached nonce evidence for $proof when durable $identity mismatches',
      async ({ proof, identity }) => {
        const { disk, infrastructure } = durableInfrastructure();
        const built = buildProvider({
          platformDependencies: infrastructure,
          registeredKey: '9c'.repeat(40),
        });
        built.clientInstance.sendTx.mockRejectedValue(
          new Error('lost response'),
        );
        await built.provider.placeOrder(attachedIntent);
        const {
          key,
          groups: [group],
        } = storedAttached(disk);
        if (group.nonce === null) {
          throw new Error('Missing nonce');
        }
        const { nonce, txHash, expiresAt } = group;
        if (expiresAt === null) {
          throw new Error('Missing expiry');
        }
        if (identity === 'expiry') {
          group.expiresAt = expiresAt + 1;
        }
        if (identity === 'slot') {
          group.apiKeyIndex = 19;
        }
        if (identity === 'nonce') {
          group.nonce += 1;
        }
        if (identity === 'hash') {
          group.txHash = 'deadbeef';
        }
        if (identity === 'group') {
          group.orders.forEach((wire) => {
            wire[1] += 10;
          });
          group.groupId = group.groupId.replace(
            /:\d+$/u,
            `:${group.orders[0][1]}`,
          );
        }
        disk.set(key, JSON.stringify([group]));
        const before = new Map(disk);
        built.clientInstance.getTx.mockResolvedValue(
          proof === 'failed'
            ? {
                code: 200,
                hash: txHash,
                accountIndex: 28,
                apiKeyIndex: 7,
                nonce,
                status: 0,
              }
            : null,
        );
        built.clientInstance.getNextNonce.mockResolvedValue({
          code: 200,
          nonce: nonce + (proof === 'nonce-consumed' ? 1 : 0),
        });
        const clock = vi.spyOn(Date, 'now').mockReturnValue(expiresAt + 700000);
        try {
          const result = await built.provider.reconcileRecoveredDispatches();
          expect(result).toHaveLength(1);
          expect(result[0].acknowledgeable).toBe(false);
          expect(disk).toStrictEqual(before);
          expect(storedAttached(disk).groups[0].nonAcceptance).toBeUndefined();
        } finally {
          clock.mockRestore();
        }
      },
    );

    it('persists unsigned parent and child identities before signing, then lists them after restart in another slot', async () => {
      const { infrastructure, disk } = durableInfrastructure();
      const first = buildProvider({
        platformDependencies: infrastructure,
        registeredKey: '9c'.repeat(40),
      });
      const execute = vi.mocked(first.bridge).execute.getMockImplementation();
      if (!execute) {
        throw new Error('Missing mock signer');
      }
      let storedBeforeSigning: {
        submission: string;
        txHash: null;
        orders: unknown[][];
      }[] = [];
      vi.mocked(first.bridge).execute.mockImplementation(async (call) => {
        if (call.function === '_signCreateGroupedOrders') {
          const stored = [...disk.entries()].find(([key]) =>
            key.startsWith('lighterAttachedOrders:'),
          );
          storedBeforeSigning = JSON.parse(
            stored?.[1] ?? '[]',
          ) as typeof storedBeforeSigning;
        }
        return execute(call);
      });
      const result = await first.provider.placeOrder(attachedIntent);
      expect(result.error).toBeUndefined();
      expect(result.attachedOrderGroup?.submission).toBe('accepted');
      expect(storedBeforeSigning).toHaveLength(1);
      expect(storedBeforeSigning[0].submission).toBe('prepared');
      expect(storedBeforeSigning[0].txHash).toBeNull();
      expect(
        storedBeforeSigning[0].orders.map((order) => order[8]),
      ).toStrictEqual(['0', '1100000', '800000']);
      const second = buildProvider({
        platformDependencies: infrastructure,
        apiKeyIndex: 8,
      });
      expect(await second.provider.getAttachedOrderGroups()).toStrictEqual([
        result.attachedOrderGroup,
      ]);
      expect(second.calls).toHaveLength(0);
      expect(second.clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it('retains unknown acceptance and blocks replay across restart and trading-key migration', async () => {
      const { infrastructure } = durableInfrastructure();
      const first = buildProvider({
        platformDependencies: infrastructure,
        registeredKey: '9c'.repeat(40),
      });
      first.clientInstance.sendTx.mockRejectedValueOnce(
        new Error('response lost'),
      );
      const result = await first.provider.placeOrder(attachedIntent);
      expect(result.success).toBe(false);
      expect(result.attachedOrderGroup?.submission).toBe('unknown');
      const second = buildProvider({
        platformDependencies: infrastructure,
        apiKeyIndex: 8,
        registeredKey: '9c'.repeat(40),
      });
      expect((await second.provider.getAttachedOrderGroups())[0].groupId).toBe(
        result.attachedOrderGroup?.groupId,
      );
      const retry = await second.provider.placeOrder(attachedIntent);
      expect(retry.success).toBe(false);
      expect(
        second.calls.filter(
          (call) => call.function === '_signCreateGroupedOrders',
        ),
      ).toHaveLength(0);
      expect(second.clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it.each(['signing', 'prepared-storage', 'unknown-storage'] as const)(
      'refuses dispatch after account A-to-B-to-A during %s',
      async (boundary) => {
        const { infrastructure } = durableInfrastructure();
        const bundle = buildProvider({
          platformDependencies: infrastructure,
          registeredKey: '9c'.repeat(40),
        });
        const held = createDeferred<void>();
        const entered = createDeferred<void>();
        const execute = vi
          .mocked(bundle.bridge)
          .execute.getMockImplementation();
        if (!execute) {
          throw new Error('Missing mock signer');
        }
        const write = vi
          .mocked(infrastructure.diskCache)
          .setItem.getMockImplementation();
        if (!write) {
          throw new Error('Missing mock storage');
        }
        vi.mocked(bundle.bridge).execute.mockImplementation(async (call) => {
          const result = await execute(call);
          if (
            boundary === 'signing' &&
            call.function === '_signCreateGroupedOrders'
          ) {
            entered.resolve();
            await held.promise;
          }
          return result;
        });
        vi.mocked(infrastructure.diskCache).setItem.mockImplementation(
          async (key, value) => {
            await write(key, value);
            if (
              key.startsWith('lighterAttachedOrders:') &&
              value.includes(
                `"submission":"${boundary === 'prepared-storage' ? 'prepared' : 'unknown'}"`,
              ) &&
              boundary !== 'signing'
            ) {
              entered.resolve();
              await held.promise;
            }
          },
        );
        const pending = bundle.provider.placeOrder(attachedIntent);
        await entered.promise;
        bundle.getUserAddressMock.mockReturnValue(
          '0x1111111111111111111111111111111111111111',
        );
        await expect(bundle.provider.getAttachedOrderGroups()).rejects.toThrow(
          'not owned',
        );
        bundle.getUserAddressMock.mockReturnValue(ACCOUNT.l1Address);
        await bundle.provider.getAttachedOrderGroups();
        held.resolve();
        const result = await pending;
        expect(result.success).toBe(false);
        expect(result.error).toContain('cancelled');
        expect(bundle.clientInstance.sendTx).not.toHaveBeenCalled();
      },
    );

    it('fails closed when durable intent storage fails before grouped signing', async () => {
      const { infrastructure } = durableInfrastructure();
      const bundle = buildProvider({
        platformDependencies: infrastructure,
        registeredKey: '9c'.repeat(40),
      });
      const write = vi
        .mocked(infrastructure.diskCache)
        .setItem.getMockImplementation();
      if (!write) {
        throw new Error('Missing mock storage');
      }
      vi.mocked(infrastructure.diskCache).setItem.mockImplementation(
        async (key, value) => {
          if (key.startsWith('lighterAttachedOrders:')) {
            throw new Error('disk full');
          }
          await write(key, value);
        },
      );
      const result = await bundle.provider.placeOrder(attachedIntent);
      expect(result.error).toContain('disk full');
      expect(
        bundle.calls.filter(
          (call) => call.function === '_signCreateGroupedOrders',
        ),
      ).toHaveLength(0);
      expect(bundle.clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it('reviews waiting children and a partially filled parent using exact identities and linkage', async () => {
      const { infrastructure } = durableInfrastructure();
      const bundle = buildProvider({
        platformDependencies: infrastructure,
        registeredKey: '9c'.repeat(40),
      });
      const venue = attachedVenue(bundle);
      await bundle.provider.placeOrder(attachedIntent);
      venue.active[0].filledBaseAmount = '0.0004';
      venue.active[0].remainingBaseAmount = '0.0006';
      const writes = bundle.clientInstance.sendTx.mock.calls.length;
      const result = await bundle.provider.reviewAttachedOrderGroups();
      expect(result[0]).toMatchObject({
        linkage: 'confirmed',
        parentOrderId: '500',
        childOrderIds: ['501', '502'],
      });
      expect(result[0].orders?.map((order) => order.status)).toStrictEqual([
        'partially-filled',
        'waiting',
        'waiting',
      ]);
      expect(result[0].orders?.[0].filledSize).toBe('0.0004');
      expect(bundle.clientInstance.sendTx).toHaveBeenCalledTimes(writes);
    });

    it('does not confirm contradictory parent linkage even when the parent lists the child', async () => {
      const { infrastructure } = durableInfrastructure();
      const bundle = buildProvider({
        platformDependencies: infrastructure,
        registeredKey: '9c'.repeat(40),
      });
      const venue = attachedVenue(bundle);
      await bundle.provider.placeOrder(attachedIntent);
      venue.active[1].parentOrderIndex = 999;
      const review = await bundle.provider.reviewAttachedOrderGroups();
      expect(review[0].linkage).toBe('unknown');
    });

    it('keeps missing children unknown instead of using an unrelated new trigger', async () => {
      const { infrastructure } = durableInfrastructure();
      const bundle = buildProvider({
        platformDependencies: infrastructure,
        registeredKey: '9c'.repeat(40),
      });
      const venue = attachedVenue(bundle);
      await bundle.provider.placeOrder(attachedIntent);
      venue.active[1].clientOrderIndex += 1;
      venue.active[1].orderIndex = 999;
      const result = await bundle.provider.reviewAttachedOrderGroups();
      expect(result[0].orders?.[1]).toMatchObject({ status: 'unknown' });
      expect(result[0].childOrderIds).toBeUndefined();
      expect(result[0].linkage).toBe('unknown');
    });

    it('cancels only the exact owned parent and children, preserving an unrelated trigger', async () => {
      const { infrastructure } = durableInfrastructure();
      const bundle = buildProvider({
        platformDependencies: infrastructure,
        registeredKey: '9c'.repeat(40),
      });
      const venue = attachedVenue(bundle);
      const placed = await bundle.provider.placeOrder(attachedIntent);
      venue.active.push({
        ...venue.active[1],
        orderIndex: 999,
        clientOrderIndex: 12345,
        parentOrderIndex: undefined,
      });
      venue.active[0].filledBaseAmount = '0.0004';
      venue.active[0].remainingBaseAmount = '0.0006';
      const result = await bundle.provider.cancelOrder({
        symbol: 'BTC',
        orderId: placed.attachedOrderGroup?.groupId ?? '',
      });
      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);
      expect(
        bundle.calls
          .filter((call) => call.function === '_signCancelOrder')
          .map((call) => call.params[2]),
      ).toStrictEqual(['500', '501', '502']);
      expect(venue.active.map((row) => row.orderIndex)).toStrictEqual([999]);
      expect(
        (await bundle.provider.getAttachedOrderGroups())[0].submission,
      ).toBe('canceled');
    });

    it('refuses a group cancellation with missing owned identities before cancel signing', async () => {
      const { infrastructure } = durableInfrastructure();
      const bundle = buildProvider({
        platformDependencies: infrastructure,
        registeredKey: '9c'.repeat(40),
      });
      const venue = attachedVenue(bundle);
      const placed = await bundle.provider.placeOrder(attachedIntent);
      venue.active.pop();
      const result = await bundle.provider.cancelOrder({
        symbol: 'BTC',
        orderId: placed.attachedOrderGroup?.groupId ?? '',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('unresolved');
      expect(
        bundle.calls.filter((call) => call.function === '_signCancelOrder'),
      ).toHaveLength(0);
      expect(venue.active).toHaveLength(2);
    });

    it('retains prepared intent after signer failure and requires explicit abandonment before a fresh placement', async () => {
      const { infrastructure } = durableInfrastructure();
      const first = buildProvider({
        platformDependencies: infrastructure,
        registeredKey: '9c'.repeat(40),
      });
      const execute = vi.mocked(first.bridge).execute.getMockImplementation();
      if (!execute) {
        throw new Error('Missing signer');
      }
      vi.mocked(first.bridge).execute.mockImplementation(async (call) => {
        if (call.function === '_signCreateGroupedOrders') {
          throw new Error('signer interrupted');
        }
        return execute(call);
      });
      const failed = await first.provider.placeOrder(attachedIntent);
      expect(failed.attachedOrderGroup?.submission).toBe('prepared');
      expect(first.clientInstance.sendTx).not.toHaveBeenCalled();
      const second = buildProvider({
        platformDependencies: infrastructure,
        registeredKey: '9c'.repeat(40),
      });
      expect((await second.provider.placeOrder(attachedIntent)).success).toBe(
        false,
      );
      expect(
        second.calls.filter(
          (call) => call.function === '_signCreateGroupedOrders',
        ),
      ).toHaveLength(0);
      const canceled = await second.provider.cancelOrder({
        symbol: 'BTC',
        orderId: failed.attachedOrderGroup?.groupId ?? '',
      });
      expect(canceled.success).toBe(true);
      expect(
        second.calls.filter((call) => call.function === '_signCancelOrder'),
      ).toHaveLength(0);
      expect((await second.provider.placeOrder(attachedIntent)).success).toBe(
        true,
      );
      expect(
        second.calls.filter(
          (call) => call.function === '_signCreateGroupedOrders',
        ),
      ).toHaveLength(1);
    });

    it('does not cancel again when parent cancellation already canceled its children', async () => {
      const { infrastructure } = durableInfrastructure();
      const bundle = buildProvider({
        platformDependencies: infrastructure,
        registeredKey: '9c'.repeat(40),
      });
      const venue = attachedVenue(bundle);
      const placed = await bundle.provider.placeOrder(attachedIntent);
      const send = bundle.clientInstance.sendTx.getMockImplementation();
      if (!send) {
        throw new Error('Missing venue');
      }
      bundle.clientInstance.sendTx.mockImplementation(async (kind: number) => {
        const result: unknown = await send(kind);
        if (kind === 15) {
          venue.inactive.push(
            ...venue.active.splice(0).map((row) => ({
              ...row,
              status: 'canceled-child',
              remainingBaseAmount: '0',
            })),
          );
        }
        return result;
      });
      const result = await bundle.provider.cancelOrder({
        symbol: 'BTC',
        orderId: placed.attachedOrderGroup?.groupId ?? '',
      });
      expect(result.success).toBe(true);
      expect(
        bundle.calls
          .filter((call) => call.function === '_signCancelOrder')
          .map((call) => call.params[2]),
      ).toStrictEqual(['500']);
    });

    it('refuses unknown group handles before signer setup', async () => {
      const bundle = buildProvider();
      expect(
        (
          await bundle.provider.cancelOrder({
            symbol: 'BTC',
            orderId: 'lighter-attached:other-account',
          })
        ).success,
      ).toBe(false);
      expect(bundle.calls).toHaveLength(0);
    });

    it.each([
      'matching',
      'account',
      'slot',
      'nonce',
      'hash',
      'absent',
    ] as const)(
      'retires failed attached dispatch after the acceptance write failed only for %s evidence',
      async (identity) => {
        const { disk, infrastructure } = durableInfrastructure();
        const built = buildProvider({
          platformDependencies: infrastructure,
          registeredKey: '9c'.repeat(40),
        });
        const write = vi
          .mocked(infrastructure.diskCache)
          .setItem.getMockImplementation();
        if (!write) {
          throw new Error('Missing storage');
        }
        vi.mocked(infrastructure.diskCache).setItem.mockImplementation(
          async (key, value) => {
            if (
              key.startsWith('lighterAttachedOrders:') &&
              value.includes('"submission":"accepted"')
            ) {
              throw new Error('accepted write failed');
            }
            await write(key, value);
          },
        );
        await built.provider.placeOrder(attachedIntent);
        const {
          groups: [group],
        } = storedAttached(disk);
        expect(await built.provider.getRecoveredDispatches()).toStrictEqual([]);
        built.clientInstance.getTx.mockResolvedValue(
          identity === 'absent'
            ? null
            : {
                code: 200,
                hash: identity === 'hash' ? 'deadbeef' : group.txHash,
                accountIndex: identity === 'account' ? 29 : 28,
                apiKeyIndex: identity === 'slot' ? 19 : 7,
                nonce: identity === 'nonce' ? 999 : group.nonce,
                status: 0,
              },
        );
        expect(
          (
            await built.provider.cancelOrder({
              symbol: 'BTC',
              orderId: group.groupId,
            })
          ).success,
        ).toBe(identity === 'matching');
        expect(storedAttached(disk).groups[0].submission).toBe(
          identity === 'matching' ? 'canceled' : 'unknown',
        );
        expect(
          built.calls.filter((call) => call.function === '_signCancelOrder'),
        ).toStrictEqual([]);
      },
    );

    it('retains accepted ownership when post-dispatch persistence fails', async () => {
      const { infrastructure } = durableInfrastructure();
      const bundle = buildProvider({
        platformDependencies: infrastructure,
        registeredKey: '9c'.repeat(40),
      });
      const write = vi
        .mocked(infrastructure.diskCache)
        .setItem.getMockImplementation();
      if (!write) {
        throw new Error('Missing storage');
      }
      vi.mocked(infrastructure.diskCache).setItem.mockImplementation(
        async (key, value) => {
          if (
            key.startsWith('lighterAttachedOrders:') &&
            value.includes('"submission":"accepted"')
          ) {
            throw new Error('post-send disk failure');
          }
          await write(key, value);
        },
      );
      const placed = await bundle.provider.placeOrder(attachedIntent);
      expect(placed.success).toBe(false);
      expect(placed.attachedOrderGroup?.submission).toBe('accepted');
      const second = buildProvider({
        platformDependencies: infrastructure,
        registeredKey: '9c'.repeat(40),
      });
      expect(
        (await second.provider.getAttachedOrderGroups())[0].submission,
      ).toBe('unknown');
      expect((await second.provider.placeOrder(attachedIntent)).success).toBe(
        false,
      );
      expect(
        second.calls.filter(
          (call) => call.function === '_signCreateGroupedOrders',
        ),
      ).toHaveLength(0);
    });

    it('does not erase accepted live children when acceptance persistence failed and transaction history later omits the hash', async () => {
      const { infrastructure } = durableInfrastructure();
      const bundle = buildProvider({
        platformDependencies: infrastructure,
        registeredKey: '9c'.repeat(40),
      });
      const venue = attachedVenue(bundle);
      const write = vi
        .mocked(infrastructure.diskCache)
        .setItem.getMockImplementation();
      if (!write) {
        throw new Error('Missing storage');
      }
      vi.mocked(infrastructure.diskCache).setItem.mockImplementation(
        async (key, value) => {
          if (
            key.startsWith('lighterAttachedOrders:') &&
            value.includes('"submission":"accepted"')
          ) {
            throw new Error('post-send disk failure');
          }
          await write(key, value);
        },
      );
      const placed = await bundle.provider.placeOrder(attachedIntent);
      const now = Date.now();
      const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 700000);
      try {
        const result = await bundle.provider.cancelOrder({
          symbol: 'BTC',
          orderId: placed.attachedOrderGroup?.groupId ?? '',
        });
        expect(result.success).toBe(true);
        expect(venue.active).toHaveLength(0);
        expect(
          bundle.calls
            .filter((call) => call.function === '_signCancelOrder')
            .map((call) => call.params[2]),
        ).toStrictEqual(['500', '501', '502']);
      } finally {
        clock.mockRestore();
      }
    });

    it.each(
      (['prepared', 'unknown', 'accepted'] as const).flatMap((submission) =>
        (['absent', 'not-found', 'premium'] as const).map((account) => ({
          submission,
          account,
        })),
      ),
    )(
      'lists $submission attached ownership after restart with $account account state',
      async ({ submission, account }) => {
        const { disk, infrastructure } = durableInfrastructure();
        const first = buildProvider({
          platformDependencies: infrastructure,
          registeredKey: '9c'.repeat(40),
        });
        if (submission === 'prepared') {
          const execute = vi
            .mocked(first.bridge)
            .execute.getMockImplementation();
          if (!execute) {
            throw new Error('Missing mock signer');
          }
          vi.mocked(first.bridge).execute.mockImplementation(async (call) => {
            if (call.function === '_signCreateGroupedOrders') {
              throw new Error('signer interrupted');
            }
            return execute(call);
          });
        } else if (submission === 'unknown') {
          first.clientInstance.sendTx.mockRejectedValue(
            new Error('response lost'),
          );
        }
        const placed = await first.provider.placeOrder(attachedIntent);
        expect(placed.attachedOrderGroup?.submission).toBe(submission);
        const before = await first.provider.getAttachedOrderGroups();
        expect(before).toHaveLength(1);
        const bytes = [...disk.entries()];
        const restarted = buildProvider({
          platformDependencies: infrastructure,
          configuredAccountIndex: null,
        });
        restarted.clientInstance.getAccountsByL1Address.mockResolvedValue({
          code: 200,
          subAccounts:
            account === 'premium' ? [{ ...ACCOUNT, accountType: 1 }] : [],
        });
        if (account === 'not-found') {
          restarted.clientInstance.getAccountsByL1Address.mockRejectedValue(
            new LighterApiError('account not found', 21100),
          );
        }
        expect(await restarted.provider.getAttachedOrderGroups()).toStrictEqual(
          before,
        );
        expect(restarted.calls).toStrictEqual([]);
        expect(restarted.clientInstance.sendTx).not.toHaveBeenCalled();
        expect(restarted.clientInstance.getNextNonce).not.toHaveBeenCalled();
        expect([...disk.entries()]).toStrictEqual(bytes);
      },
    );

    it.each(['transport', 'wrong-wallet', 'unknown-type', 'storage'] as const)(
      'refuses attached inventory on %s failure without hiding it as empty',
      async (failure) => {
        const { infrastructure } = durableInfrastructure();
        const built = buildProvider({
          platformDependencies: infrastructure,
          configuredAccountIndex: null,
        });
        let message: string;
        if (failure === 'transport') {
          message = 'inventory transport failed';
          built.clientInstance.getAccountsByL1Address.mockRejectedValue(
            new Error(message),
          );
        } else if (failure === 'storage') {
          message = 'attached storage failed';
          vi.mocked(infrastructure.diskCache).getItem.mockRejectedValue(
            new Error(message),
          );
        } else {
          message =
            failure === 'wrong-wallet'
              ? 'not owned'
              : 'type could not be verified';
          built.clientInstance.getAccountsByL1Address.mockResolvedValue({
            code: 200,
            subAccounts: [
              {
                ...ACCOUNT,
                ...(failure === 'wrong-wallet'
                  ? { l1Address: '0x0000000000000000000000000000000000000002' }
                  : { accountType: 99 }),
              },
            ],
          });
        }
        await expect(built.provider.getAttachedOrderGroups()).rejects.toThrow(
          message,
        );
        expect(built.calls).toStrictEqual([]);
        expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
      },
    );

    it('preserves activated attached children during position protection removal', async () => {
      const { infrastructure } = durableInfrastructure();
      const bundle = buildProvider({
        platformDependencies: infrastructure,
        registeredKey: '9c'.repeat(40),
      });
      const venue = attachedVenue(bundle);
      await bundle.provider.placeOrder(attachedIntent);
      for (const child of venue.active.slice(1)) {
        child.initialBaseAmount = '0.1';
        child.remainingBaseAmount = '0.1';
        child.status = 'open';
      }
      const removed = await bundle.provider.updatePositionTPSL({
        symbol: 'BTC',
      });
      expect(removed.error).toBeUndefined();
      expect(removed.success).toBe(true);
      expect(
        bundle.calls.filter((call) => call.function === '_signCancelOrder'),
      ).toHaveLength(0);
      expect(venue.active.map((row) => row.orderIndex)).toStrictEqual([
        500, 501, 502,
      ]);
    });

    it('keeps lifecycle guarantees pending in capabilities', async () => {
      const { provider } = buildProvider();
      const result = await provider.getOrderCapabilities({ symbol: 'BTC' });
      expect(result.status).toBe('ready');
      expect(result).toMatchObject({
        attachedTpsl: {
          lifecycleVerification: 'pending',
          partialSizes: false,
          childCoverage: 'venue-native-zero-size',
        },
      });
    });

    it.each([
      ['market', undefined, { stopLossPrice: '80000' }, 1, 2],
      ['market', undefined, { takeProfitPrice: '110000' }, 1, 2],
      ['limit', undefined, { stopLossPrice: '80000' }, 1, 2],
      ['limit', 'IOC', { takeProfitPrice: '110000' }, 1, 2],
      [
        'market',
        undefined,
        { takeProfitPrice: '110000', stopLossPrice: '80000' },
        3,
        3,
      ],
      [
        'limit',
        undefined,
        { takeProfitPrice: '110000', stopLossPrice: '80000' },
        3,
        3,
      ],
    ] as const)(
      'signs one native %s group with %s and %j',
      async (orderType, timeInForce, triggers, grouping, count) => {
        const { provider, calls, clientInstance } = buildProvider();
        const result = await provider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType,
          price: '90000',
          timeInForce,
          ...triggers,
        });
        expect(result.error).toBeUndefined();
        expect(result.success).toBe(true);
        const groups = calls.filter(
          (call) => call.function === '_signCreateGroupedOrders',
        );
        expect(groups).toHaveLength(1);
        expect(groups[0].params).toHaveLength(4 + count * 10);
        expect(groups[0].params.slice(1, 3)).toStrictEqual([grouping, count]);
        expect(groups[0].params[5]).toBe('100');
        for (let child = 1; child < count; child += 1) {
          expect(groups[0].params[5 + child * 10]).toBe('0');
          expect(groups[0].params[7 + child * 10]).toBe(1);
          expect(groups[0].params[10 + child * 10]).toBe(1);
        }
        expect(
          calls.filter((call) => call.function === '_signCreateOrder'),
        ).toHaveLength(0);
        expect(
          clientInstance.sendTx.mock.calls.filter(([kind]) => kind === 28),
        ).toHaveLength(1);
      },
    );

    it.each([
      { takeProfitSize: '0.0005' },
      { stopLossSize: '0' },
      { tpslLinkage: 'position' },
      { tpslLinkage: 'none' },
      { grouping: 'positionTpsl' },
      { takeProfitPrice: '' },
      { takeProfitPrice: '110000.01' },
      { reduceOnly: true },
      { clientOrderId: 'explicit-caller-id' },
    ] as const)(
      'rejects unsupported attached intent before signer setup: %j',
      async (invalid) => {
        const { provider, calls, clientInstance } = buildProvider();
        const params: OrderParams = {
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit',
          price: '90000',
          takeProfitPrice: '110000',
          ...invalid,
        };
        expect((await provider.validateOrder(params)).isValid).toBe(false);
        expect((await provider.placeOrder(params)).success).toBe(false);
        expect(calls).toHaveLength(0);
        expect(clientInstance.sendTx).not.toHaveBeenCalled();
      },
    );
  });
});
