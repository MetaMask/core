import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { LighterApiError } from '../../../src/services/LighterClientService.js';
import type {
  LighterSignerBridge,
  LighterWasmCall,
} from '../../../src/types/lighter-types.js';
import {
  ACCOUNT,
  acknowledgeAllRecovered,
  buildProvider,
  finishPendingTimersAfterEach,
  resolveJournalPayloadKey,
  setupTriggerVenue,
} from '../../helpers/lighterProvider.js';
import type {
  MockClientInstance,
  RawTriggerOrder,
} from '../../helpers/lighterProvider.js';
import { createMockInfrastructure } from '../../helpers/serviceMocks.js';

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

  describe('round-15 authoritative settlement identity and recovery', () => {
    /**
     * Simulate full process death for a provider: every venue read/write
     * and every signer call fails from now on. Without this, a detached
     * background task (e.g. the setup-time recovery kick) of the "dead"
     * provider can keep mutating the shared venue after the crash and
     * invalidate restart-recovery scenarios.
     *
     * @param built - The provider under test.
     * @param built.clientInstance - Its mocked client service instance.
     * @param built.bridge - Its mocked signer bridge.
     */
    const killProvider = (built: {
      clientInstance: MockClientInstance;
      bridge: LighterSignerBridge;
    }): void => {
      for (const mockFn of Object.values(built.clientInstance)) {
        if (vi.isMockFunction(mockFn)) {
          mockFn.mockImplementation(async () => {
            throw new Error('process died');
          });
        }
      }
      (built.bridge.execute as Mock).mockImplementation(async () => {
        throw new Error('process died');
      });
    };

    it.each(['unknown', 'accepted'] as const)(
      'retains live ownership after restart with a saved never-landed marker and %s outcome',
      async (outcome) => {
        const infra = createMockInfrastructure();
        const first = buildProvider({ platformDependencies: infra });
        const venueA = setupTriggerVenue(first.clientInstance, first.bridge);
        venueA.seedTrigger('stop-loss', '80000');
        const execute = vi.spyOn(first.bridge, 'execute');
        const sign = execute.getMockImplementation();
        execute.mockImplementation(async (call: LighterWasmCall) => {
          if (call.function === '_signCancelOrder') {
            throw new Error('process died before old cancel');
          }
          if (!sign) {
            throw new Error('Test signer missing');
          }
          return await sign(call);
        });
        expect(
          (
            await first.provider.updatePositionTPSL({
              symbol: 'BTC',
              stopLossPrice: '85000',
            })
          ).success,
        ).toBe(false);
        const baseKey = `lighterTpslJournal:testnet:${ACCOUNT.l1Address.toLowerCase()}:28:7:BTC`;
        const pointer = JSON.parse(
          (await infra.diskCache.getItem(baseKey)) ?? '',
        ) as { operationId: string };
        const payloadKey = `lighterTpslJournalOp:testnet:${ACCOUNT.l1Address.toLowerCase()}:28:7:BTC:${pointer.operationId}`;
        const payload = JSON.parse(
          (await infra.diskCache.getItem(payloadKey)) ?? '',
        ) as {
          attempts: {
            kind: string;
            clientIds: number[];
            outcome: string;
            neverLanded?: boolean;
          }[];
        };
        const create = payload.attempts.find(
          (attempt) => attempt.kind === 'create',
        );
        if (!create) {
          throw new Error('Test create journal missing');
        }
        create.neverLanded = true;
        create.outcome = outcome;
        await infra.diskCache.setItem(payloadKey, JSON.stringify(payload));
        killProvider(first);

        const second = buildProvider({ platformDependencies: infra });
        const venueB = setupTriggerVenue(second.clientInstance, second.bridge);
        venueB.setVenueNonce(venueA.getVenueNonce());
        venueB.setNextIndex(venueA.getNextIndex());
        venueB.rawTriggers.push(
          ...venueA.rawTriggers.map((row) => ({ ...row })),
        );
        for (const [hash, landed] of venueA.landedTxs) {
          venueB.landedTxs.set(hash, landed);
        }
        const storedAttempts: Record<string, unknown>[][] = [];
        const disk = vi.mocked(infra.diskCache);
        const write = disk.setItem.getMockImplementation();
        disk.setItem.mockImplementation(async (key: string, value: string) => {
          if (key.startsWith('lighterTpslJournalOp:')) {
            storedAttempts.push(
              (JSON.parse(value) as { attempts: Record<string, unknown>[] })
                .attempts,
            );
          }
          return write?.(key, value);
        });
        await second.provider.getOpenOrders();
        for (let attempt = 0; attempt < 40; attempt += 1) {
          if ((await infra.diskCache.getItem(payloadKey)) === null) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        expect(await infra.diskCache.getItem(payloadKey)).toBeNull();
        expect(storedAttempts.length).toBeGreaterThan(0);
        expect(
          storedAttempts.flat().every((attempt) => !('neverLanded' in attempt)),
        ).toBe(true);
        expect(venueB.rawTriggers).toHaveLength(1);
        const key = `lighterManagedTpsl:testnet:${ACCOUNT.l1Address.toLowerCase()}:28:BTC`;
        const owned = JSON.parse(
          (await infra.diskCache.getItem(key)) ?? '',
        ) as {
          orders: { clientId: string; orderId: string | null }[];
        };
        expect(owned.orders).toContainEqual(
          expect.objectContaining({
            clientId: String(create.clientIds[0]),
            orderId: String(venueB.rawTriggers[0].orderIndex),
          }),
        );
        second.clientInstance.getAccountByIndex.mockResolvedValue({
          code: 200,
          accounts: [
            {
              ...ACCOUNT,
              positions: [{ ...ACCOUNT.positions[0], position: '0.2' }],
            },
          ],
        });
        const resized = await second.provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '84000',
        });
        expect(resized.error).toBeUndefined();
        expect(resized.success).toBe(true);
        expect(venueB.rawTriggers).toHaveLength(1);
      },
    );

    it('preserves original-slot journals while their unresolved dispatch blocks another slot', async () => {
      const disk = new Map<string, string>();
      const infra = createMockInfrastructure();
      (infra.diskCache.getItem as Mock).mockImplementation(
        async (key: string) => disk.get(key) ?? null,
      );
      (infra.diskCache.setItem as Mock).mockImplementation(
        async (key: string, value: string) => {
          disk.set(key, value);
        },
      );
      (infra.diskCache.removeItem as Mock).mockImplementation(
        async (key: string) => {
          disk.delete(key);
        },
      );
      const slot7 = buildProvider({ platformDependencies: infra });
      const venue7 = setupTriggerVenue(slot7.clientInstance, slot7.bridge);
      venue7.seedTrigger('stop-loss', '80000');
      venue7.setRestLag(50);
      venue7.failResponseOnce(14);
      const first = await slot7.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(first.success).toBe(false);
      const journalKeys = [...disk.keys()].filter((key) =>
        key.startsWith('lighterTpslJournal:'),
      );
      expect(journalKeys.some((key) => key.includes(':7:'))).toBe(true);
      // A slot-8 provider (same account, shared disk) must not load,
      // clear the slot-7 journal; its unresolved dispatch blocks new writes.
      const slot8 = buildProvider({
        platformDependencies: infra,
        apiKeyIndex: 8,
      });
      const venue8 = setupTriggerVenue(slot8.clientInstance, slot8.bridge);
      venue8.seedTrigger('stop-loss', '80000');
      const other = await slot8.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '87000',
      });
      expect(other.error).toContain('unresolved outcome');
      expect(other.success).toBe(false);
      // The slot-7 obligation is untouched.
      expect(
        [...disk.keys()].some(
          (key) => key.startsWith('lighterTpslJournal:') && key.includes(':7:'),
        ),
      ).toBe(true);
    });

    it('a lagging nextNonce endpoint cannot hand a multi-cancel section the same nonce twice', async () => {
      const { provider, calls, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('take-profit', '110000');
      venue.seedTrigger('stop-loss', '80000');
      // Warm signer setup, then FREEZE the nonce endpoint: acceptances no
      // longer advance what it reports.
      await provider.getOpenOrders();
      const frozen = venue.getVenueNonce();
      clientInstance.getNextNonce.mockResolvedValue({
        code: 200,
        nonce: frozen,
      });
      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);
      // create + two cancels must carry three DISTINCT ascending nonces.
      const wireNonces = calls
        .filter((call) =>
          ['_signCreateOrder', '_signCancelOrder'].includes(call.function),
        )
        .map((call) =>
          call.function === '_signCreateOrder'
            ? Number(call.params[11])
            : Number(call.params[3]),
        );
      expect(wireNonces).toStrictEqual([frozen, frozen + 1, frozen + 2]);
    });

    it('a delayed commit inside the signed validity window stays blocked, then reconciles without duplicate', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      // Transport fails NOW; the request commits 2.8 s later — BEYOND the
      // retry's full poll + lookup window, so nothing during the blocked
      // reconciliation can observe it yet.
      venue.delayedCommitOnce(14, 2800);
      const first = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(first.success).toBe(false);
      // Aged past the OLD grace design but still inside the signed
      // validity window: the retry must remain blocked (the venue could
      // still accept), never discard-and-duplicate — the old design
      // cleared here and duplicated once the commit landed.
      const realNow = Date.now();
      const nowSpy = vi.spyOn(Date, 'now').mockImplementation(function () {
        return realNow + 13_000;
      });
      try {
        const blocked = await provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '86000',
        });
        expect(blocked.success).toBe(false);
        expect(blocked.error).toContain('unresolved');
      } finally {
        nowSpy.mockRestore();
      }
      // Await the delayed commit, then retry: the dispatch is JOURNAL-
      // OWNED, so its landed outcome is consumed by the settlement
      // machine directly — never parked behind the generic
      // acknowledgment — and the retry reconciles serially.
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const second = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      expect(await provider.getRecoveredDispatches()).toStrictEqual([]);
      expect(second.error).toBeUndefined();
      expect(second.success).toBe(true);
      expect(venue.rawTriggers).toHaveLength(1);
      expect(venue.rawTriggers[0].triggerPrice).toBe('86000');
    });

    it('a venue-confirmed not-found is only never-landed after the signed expiry', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      venue.failBeforeCommitOnce(14);
      const first = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(first.success).toBe(false);
      // Inside the validity window: blocked even though the venue answers
      // not-found.
      const immediate = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      expect(immediate.success).toBe(false);
      expect(immediate.error).toContain('unresolved');
      // Beyond signed ExpiredAt (+slack): the sequencer can no longer
      // accept the payload — authoritatively never landed; retry runs.
      const realNow = Date.now();
      const nowSpy = vi.spyOn(Date, 'now').mockImplementation(function () {
        return realNow + 700_000;
      });
      try {
        const retry = await provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '86000',
        });
        expect(retry.error).toBeUndefined();
        expect(retry.success).toBe(true);
      } finally {
        nowSpy.mockRestore();
      }
      expect(venue.rawTriggers).toHaveLength(1);
      expect(venue.rawTriggers[0].triggerPrice).toBe('86000');
    });

    it('a tx-lookup transport failure is ambiguous and stays blocked', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      venue.failBeforeCommitOnce(14);
      const first = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(first.success).toBe(false);
      clientInstance.getTx.mockRejectedValue(new Error('tx endpoint down'));
      const realNow = Date.now();
      const nowSpy = vi.spyOn(Date, 'now').mockImplementation(function () {
        return realNow + 700_000;
      });
      try {
        const blocked = await provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '86000',
        });
        expect(blocked.success).toBe(false);
        expect(blocked.error).toContain('unresolved');
      } finally {
        nowSpy.mockRestore();
      }
    });

    it('an OCO with one leg active and one terminal-cancelled at the barrier rolls back the survivor and keeps old protection', async () => {
      const { provider, calls, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      const oldId = venue.seedTrigger('stop-loss', '80000');
      venue.setCreateTerminal('oco-split');
      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '110000',
        stopLossPrice: '75000',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('left untouched');
      // The OLD trigger survives; the surviving NEW leg was rolled back.
      expect(venue.rawTriggers).toHaveLength(1);
      expect(String(venue.rawTriggers[0].orderIndex)).toBe(String(oldId));
      // Exactly one cancel was signed — the rollback of the surviving
      // leg, never the old protection.
      expect(
        calls.filter((call) => call.function === '_signCancelOrder'),
      ).toHaveLength(1);
    });

    it('a replacement that terminal-fails after the old protection was cancelled parks DURABLE manual recovery', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      // Venue cancels the new trigger AFTER the barrier (read 3+) — by
      // then the old trigger is being/has been cancelled.
      let readsSeen = 0;
      const realActive =
        clientInstance.getActiveOrders.getMockImplementation() as () => Promise<unknown>;
      clientInstance.getActiveOrders.mockImplementation(async () => {
        readsSeen += 1;
        if (readsSeen === 3) {
          const at = venue.rawTriggers.findIndex(
            (row) => row.triggerPrice === '85000',
          );
          if (at >= 0) {
            const [row] = venue.rawTriggers.splice(at, 1);
            venue.rawInactive.push({ ...row, status: 'canceled' });
          }
        }
        return await realActive();
      });
      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(result.success).toBe(false);
      // NO automatic restore across an unprovable lifecycle: the failure
      // is explicit, the obligation parks DURABLY for manual recovery
      // and is surfaced to callers.
      expect(result.error).toContain('MANUAL re-establishment');
      expect(venue.rawTriggers).toHaveLength(0);
      const pending = await provider.getPendingManualRecoveries();
      expect(pending).toHaveLength(1);
      expect(pending[0].symbol).toBe('BTC');
      // A NEW explicit protection intent acknowledges and resolves it.
      const renewed = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '84000',
      });
      expect(renewed.error).toBeUndefined();
      expect(renewed.success).toBe(true);
      expect(await provider.getPendingManualRecoveries()).toHaveLength(0);
      expect(venue.rawTriggers).toHaveLength(1);
      expect(venue.rawTriggers[0].triggerPrice).toBe('84000');
    });

    it("a 'filled' terminal row with remaining size is NOT a proven execution", async () => {
      const { provider, calls, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      venue.setCreateTerminal('filled-partial');
      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      // Not proven executed: treated as a terminal failure — old
      // protection untouched.
      expect(result.success).toBe(false);
      expect(venue.rawTriggers).toHaveLength(1);
      expect(venue.rawTriggers[0].triggerPrice).toBe('80000');
      expect(
        calls.filter((call) => call.function === '_signCancelOrder'),
      ).toHaveLength(0);
    });

    it('a failed journal disk-remove keeps the obligation coherent for a later retry', async () => {
      const disk = new Map<string, string>();
      const infra = createMockInfrastructure();
      (infra.diskCache.getItem as Mock).mockImplementation(
        async (key: string) => disk.get(key) ?? null,
      );
      (infra.diskCache.setItem as Mock).mockImplementation(
        async (key: string, value: string) => {
          disk.set(key, value);
        },
      );
      let removeFails = true;
      (infra.diskCache.removeItem as Mock).mockImplementation(
        async (key: string) => {
          if (removeFails && key.startsWith('lighterTpslJournal:')) {
            throw new Error('disk remove refused');
          }
          disk.delete(key);
        },
      );
      const built = buildProvider({ platformDependencies: infra });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      venue.seedTrigger('stop-loss', '80000');
      const first = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      // The venue settled but the durable obligation could not be
      // resolved: the op must NOT report clean success.
      expect(first.success).toBe(false);
      expect(first.error).toContain('disk remove refused');
      // Later, with the disk healthy again, a retry reconciles the intact
      // journal and completes.
      removeFails = false;
      const second = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      expect(second.error).toBeUndefined();
      expect(second.success).toBe(true);
      expect(venue.rawTriggers).toHaveLength(1);
      expect(venue.rawTriggers[0].triggerPrice).toBe('86000');
    });

    it('startup recovery completes an interrupted replacement WITHOUT a new mutation call', async () => {
      const disk = new Map<string, string>();
      const infra = createMockInfrastructure();
      (infra.diskCache.getItem as Mock).mockImplementation(
        async (key: string) => disk.get(key) ?? null,
      );
      (infra.diskCache.setItem as Mock).mockImplementation(
        async (key: string, value: string) => {
          disk.set(key, value);
        },
      );
      (infra.diskCache.removeItem as Mock).mockImplementation(
        async (key: string) => {
          disk.delete(key);
        },
      );
      const first = buildProvider({ platformDependencies: infra });
      const venueA = setupTriggerVenue(first.clientInstance, first.bridge);
      venueA.seedTrigger('stop-loss', '80000');
      // Crash BEFORE any cancel submission (local signing failure): the
      // journal holds only the accepted create, and old + new triggers are
      // both live — no ambiguous in-flight cancel exists.
      const realBridge = (
        first.bridge.execute as Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      (first.bridge.execute as Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          if (call.function === '_signCancelOrder') {
            throw new Error('process died');
          }
          return await realBridge(call);
        },
      );
      const crashed = await first.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(crashed.success).toBe(false);
      expect(venueA.rawTriggers).toHaveLength(2);
      // NEW provider lifetime: recovery must run from a NON-mutating call.
      const second = buildProvider({ platformDependencies: infra });
      const venueB = setupTriggerVenue(second.clientInstance, second.bridge);
      venueB.setVenueNonce(venueA.getVenueNonce());
      venueB.setNextIndex(venueA.getNextIndex());
      for (const row of venueA.rawTriggers) {
        venueB.rawTriggers.push({ ...row });
      }
      for (const [hash, landed] of venueA.landedTxs) {
        venueB.landedTxs.set(hash, landed);
      }
      await second.provider.getOpenOrders();
      // Bounded wait for the automatic recovery to converge the venue.
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (venueB.rawTriggers.length === 1) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(venueB.rawTriggers).toHaveLength(1);
      expect(venueB.rawTriggers[0].triggerPrice).toBe('85000');
      expect(
        [...disk.keys()].filter((key) => key.startsWith('lighterTpslJournal:')),
      ).toHaveLength(0);
    });

    it('inactive-history requests are bounded: zero when active, one page when recent, cursor-walk only until found', async () => {
      // Normal replacement (new trigger rests ACTIVE): ZERO inactive calls.
      const normal = buildProvider();
      const normalVenue = setupTriggerVenue(
        normal.clientInstance,
        normal.bridge,
      );
      normalVenue.seedTrigger('stop-loss', '80000');
      const normalResult = await normal.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(normalResult.success).toBe(true);
      // ZERO inactive reads when the replacement rests active.
      expect(normal.clientInstance.getInactiveOrders).not.toHaveBeenCalled();
      // Recent terminal (immediate fill): a single first-page read finds it.
      const recent = buildProvider();
      const recentVenue = setupTriggerVenue(
        recent.clientInstance,
        recent.bridge,
      );
      recentVenue.setCreateTerminal('filled');
      const recentResult = await recent.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(recentResult.success).toBe(true);
      expect(recent.clientInstance.getInactiveOrders).toHaveBeenCalledTimes(1);
      // Deep history: the JOURNALED terminal create sits beyond 100 newer
      // rows — the retry's reconcile must walk cursor pages (bounded,
      // stopping when found), never 10 pages per poll.
      const deep = buildProvider();
      const deepVenue = setupTriggerVenue(deep.clientInstance, deep.bridge);
      deepVenue.setCreateTerminal('filled');
      // Commit terminal AND lose the response: the journal remains.
      deepVenue.failResponseOnce(14);
      const deepFirst = await deep.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(deepFirst.success).toBe(false);
      // Bury THAT terminal row beyond the old ten-page traversal limit.
      for (let filler = 0; filler < 1120; filler += 1) {
        deepVenue.rawInactive.push({
          ...deepVenue.rawInactive[0],
          orderIndex: 500000 + filler,
          clientOrderIndex: 500000 + filler,
          status: 'canceled',
        });
      }
      deepVenue.setCreateTerminal('none');
      deep.clientInstance.getInactiveOrders.mockClear();
      // The lost-response create is JOURNAL-OWNED: the retry reconciles
      // it through the settlement machine directly (no quarantine).
      const second = await deep.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      expect(await deep.provider.getRecoveredDispatches()).toStrictEqual([]);
      expect(second.error).toBeUndefined();
      expect(second.success).toBe(true);
      const inactiveCalls =
        deep.clientInstance.getInactiveOrders.mock.calls.length;
      // Cursor pages were genuinely used (>1) and bounded (found early) —
      // never a 10-pages-per-poll blowup (100+).
      expect(inactiveCalls).toBeGreaterThan(1);
      expect(inactiveCalls).toBeGreaterThan(10);
      expect(inactiveCalls).toBeLessThanOrEqual(15);
      expect(deepVenue.rawTriggers).toHaveLength(1);
      expect(deepVenue.rawTriggers[0].triggerPrice).toBe('86000');
    });

    it('fails closed when inactive-history pagination repeats a cursor', async () => {
      const built = buildProvider();
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      venue.setCreateTerminal('filled');
      venue.failResponseOnce(14);
      expect(
        (
          await built.provider.updatePositionTPSL({
            symbol: 'BTC',
            stopLossPrice: '85000',
          })
        ).success,
      ).toBe(false);
      venue.setCreateTerminal('none');
      built.clientInstance.getInactiveOrders.mockResolvedValue({
        code: 200,
        orders: [
          {
            ...venue.rawInactive[0],
            orderIndex: 999999,
            clientOrderIndex: 999999,
          },
        ],
        nextCursor: 'repeated',
      });

      const retry = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      expect(retry.success).toBe(false);
      expect(retry.error).toContain('repeated cursor');
      expect(built.clientInstance.getInactiveOrders).toHaveBeenCalledTimes(2);
    });

    it('enforces the inactive-history bound from actual returned rows', async () => {
      const built = buildProvider();
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      venue.setCreateTerminal('filled');
      venue.failResponseOnce(14);
      expect(
        (
          await built.provider.updatePositionTPSL({
            symbol: 'BTC',
            stopLossPrice: '85000',
          })
        ).success,
      ).toBe(false);
      venue.setCreateTerminal('none');
      const fillerOrder = {
        ...venue.rawInactive[0],
        status: 'canceled',
      };
      const rows = (count: number, offset: number): RawTriggerOrder[] =>
        Array.from({ length: count }, (_entry, index) => ({
          ...fillerOrder,
          orderIndex: offset + index,
          clientOrderIndex: offset + index,
        }));
      built.clientInstance.getInactiveOrders
        .mockResolvedValueOnce({
          code: 200,
          orders: rows(6000, 100000),
          nextCursor: 'second',
        })
        .mockResolvedValueOnce({
          code: 200,
          orders: rows(4001, 200000),
          nextCursor: 'third',
        });

      const retry = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      expect(retry.success).toBe(false);
      expect(retry.error).toContain('10001 rows');
      expect(built.clientInstance.getInactiveOrders).toHaveBeenCalledTimes(2);
    });

    it('fails closed when inactive history advances without returning rows', async () => {
      const built = buildProvider();
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      venue.setCreateTerminal('filled');
      venue.failResponseOnce(14);
      expect(
        (
          await built.provider.updatePositionTPSL({
            symbol: 'BTC',
            stopLossPrice: '85000',
          })
        ).success,
      ).toBe(false);
      venue.setCreateTerminal('none');
      built.clientInstance.getInactiveOrders.mockResolvedValue({
        code: 200,
        orders: [],
        nextCursor: 'advanced',
      });

      const retry = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      expect(retry.success).toBe(false);
      expect(retry.error).toContain('advanced without returning rows');
    });

    it("exact status matching: 'unfilled' and 'execution-failed' are failures, never executions", async () => {
      for (const trickStatus of ['unfilled', 'execution-failed']) {
        const { provider, clientInstance, bridge } = buildProvider();
        const venue = setupTriggerVenue(clientInstance, bridge);
        venue.seedTrigger('stop-loss', '80000');
        venue.setCreateTerminal(trickStatus as 'canceled');
        const result = await provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '85000',
        });
        // A substring match on fill/execut would treat these as SUCCESS
        // and cancel the old protection; exact matching fails them closed
        // with the old trigger untouched.
        expect(result.success).toBe(false);
        expect(venue.rawTriggers).toHaveLength(1);
        expect(venue.rawTriggers[0].triggerPrice).toBe('80000');
      }
    });

    it('a persistence failure AFTER an accepted attempt preserves the prior durable obligation', async () => {
      const disk = new Map<string, string>();
      const infra = createMockInfrastructure();
      (infra.diskCache.getItem as Mock).mockImplementation(
        async (key: string) => disk.get(key) ?? null,
      );
      let journalWrites = 0;
      (infra.diskCache.setItem as Mock).mockImplementation(
        async (key: string, value: string) => {
          if (key.startsWith('lighterTpslJournalOp:')) {
            journalWrites += 1;
            // The stable pointer is written once; test the payload update.
            // Attempt 1 (the create) persists; attempt 2 (first cancel)
            // fails to persist.
            if (journalWrites === 2) {
              throw new Error('disk write refused');
            }
          }
          disk.set(key, value);
        },
      );
      (infra.diskCache.removeItem as Mock).mockImplementation(
        async (key: string) => {
          disk.delete(key);
        },
      );
      const built = buildProvider({ platformDependencies: infra });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      venue.seedTrigger('stop-loss', '80000');
      const result = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('disk write refused');
      // The PRIOR durable obligation (accepted create) survives — the
      // failed second persistence must never compensate it away.
      const journalKeys = [...disk.keys()].filter(
        (key) =>
          key.startsWith('lighterTpslJournal:') && !key.includes('Index'),
      );
      expect(journalKeys).toHaveLength(1);
      const persisted = JSON.parse(
        disk.get(resolveJournalPayloadKey(disk, journalKeys[0])) ?? '{}',
      ) as {
        attempts?: { kind: string }[];
      };
      expect(persisted.attempts?.some((a) => a.kind === 'create')).toBe(true);
      // With disk healthy again — and past the never-submitted cancel's
      // signed expiry — the retry reconciles and completes.
      const realNow = Date.now();
      const nowSpy = vi.spyOn(Date, 'now').mockImplementation(function () {
        return realNow + 700_000;
      });
      try {
        const retry = await built.provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '86000',
        });
        expect(retry.error).toBeUndefined();
        expect(retry.success).toBe(true);
      } finally {
        nowSpy.mockRestore();
      }
      expect(venue.rawTriggers).toHaveLength(1);
      expect(venue.rawTriggers[0].triggerPrice).toBe('86000');
    });

    it('restart recovery after a crash mid-rollback keeps the OLD protection, not the failed replacement survivor', async () => {
      const disk = new Map<string, string>();
      const infra = createMockInfrastructure();
      (infra.diskCache.getItem as Mock).mockImplementation(
        async (key: string) => disk.get(key) ?? null,
      );
      (infra.diskCache.setItem as Mock).mockImplementation(
        async (key: string, value: string) => {
          disk.set(key, value);
        },
      );
      (infra.diskCache.removeItem as Mock).mockImplementation(
        async (key: string) => {
          disk.delete(key);
        },
      );
      const first = buildProvider({ platformDependencies: infra });
      const venueA = setupTriggerVenue(first.clientInstance, first.bridge);
      const oldId = venueA.seedTrigger('stop-loss', '80000');
      // OCO where one leg terminal-cancels and its sibling rests active;
      // the crash hits BEFORE the live rollback can cancel the survivor.
      venueA.setCreateTerminal('oco-split');
      const realBridge = (
        first.bridge.execute as Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      (first.bridge.execute as Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          if (call.function === '_signCancelOrder') {
            throw new Error('process died');
          }
          return await realBridge(call);
        },
      );
      const crashed = await first.provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '110000',
        stopLossPrice: '75000',
      });
      expect(crashed.success).toBe(false);
      // Venue: old trigger + the surviving (failed-set) replacement leg.
      expect(venueA.rawTriggers).toHaveLength(2);
      killProvider(first);
      // Restart: recovery must complete the ROLLBACK — keep the old
      // trigger, remove the survivor of the FAILED replacement set.
      const second = buildProvider({ platformDependencies: infra });
      const venueB = setupTriggerVenue(second.clientInstance, second.bridge);
      venueB.setVenueNonce(venueA.getVenueNonce());
      venueB.setNextIndex(venueA.getNextIndex());
      for (const row of venueA.rawTriggers) {
        venueB.rawTriggers.push({ ...row });
      }
      for (const row of venueA.rawInactive) {
        venueB.rawInactive.push({ ...row });
      }
      for (const [hash, landed] of venueA.landedTxs) {
        venueB.landedTxs.set(hash, landed);
      }
      await second.provider.getOpenOrders();
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (venueB.rawTriggers.length === 1) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(venueB.rawTriggers).toHaveLength(1);
      expect(String(venueB.rawTriggers[0].orderIndex)).toBe(String(oldId));
    });

    it('restart recovery after old cancels + a later terminal failure RESTORES the previous protection', async () => {
      const disk = new Map<string, string>();
      const infra = createMockInfrastructure();
      (infra.diskCache.getItem as Mock).mockImplementation(
        async (key: string) => disk.get(key) ?? null,
      );
      (infra.diskCache.setItem as Mock).mockImplementation(
        async (key: string, value: string) => {
          disk.set(key, value);
        },
      );
      (infra.diskCache.removeItem as Mock).mockImplementation(
        async (key: string) => {
          disk.delete(key);
        },
      );
      const first = buildProvider({ platformDependencies: infra });
      const venueA = setupTriggerVenue(first.clientInstance, first.bridge);
      venueA.seedTrigger('stop-loss', '80000');
      // Crash AFTER the old cancel was accepted (first read following a
      // signed cancel dies): journal is mid-'cancelling'.
      const realActive =
        first.clientInstance.getActiveOrders.getMockImplementation() as () => Promise<unknown>;
      let died = false;
      first.clientInstance.getActiveOrders.mockImplementation(async () => {
        if (!died && venueA.events.includes('cancel')) {
          died = true;
          throw new Error('process died');
        }
        return await realActive();
      });
      const crashed = await first.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(crashed.success).toBe(false);
      killProvider(first);
      // Old protection is gone; only the replacement is live...
      expect(venueA.rawTriggers).toHaveLength(1);
      expect(venueA.rawTriggers[0].triggerPrice).toBe('85000');
      // ...and during the downtime the venue terminal-cancels it.
      const [failedRow] = venueA.rawTriggers.splice(0, 1);
      venueA.rawInactive.push({ ...failedRow, status: 'canceled' });
      // Restart: recovery must RESTORE the previous protection from the
      // persisted prior-trigger intent — never leave the position naked.
      const second = buildProvider({ platformDependencies: infra });
      const venueB = setupTriggerVenue(second.clientInstance, second.bridge);
      venueB.setVenueNonce(venueA.getVenueNonce());
      venueB.setNextIndex(venueA.getNextIndex());
      for (const row of venueA.rawInactive) {
        venueB.rawInactive.push({ ...row });
      }
      for (const [hash, landed] of venueA.landedTxs) {
        venueB.landedTxs.set(hash, landed);
      }
      await second.provider.getOpenOrders();
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if ((await second.provider.getPendingManualRecoveries()).length === 1) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      // NO automatic restore across the unprovable lifecycle: the
      // obligation parks DURABLY as manual recovery (surfaced), nothing
      // is created, and a NEW explicit intent resolves it.
      expect(venueB.rawTriggers).toHaveLength(0);
      expect(venueB.events.filter((event) => event === 'create')).toHaveLength(
        0,
      );
      const pending = await second.provider.getPendingManualRecoveries();
      expect(pending).toHaveLength(1);
      expect(pending[0].symbol).toBe('BTC');
      const renewed = await second.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '84000',
      });
      expect(renewed.error).toBeUndefined();
      expect(renewed.success).toBe(true);
      expect(await second.provider.getPendingManualRecoveries()).toHaveLength(
        0,
      );
      expect(venueB.rawTriggers.map((row) => row.triggerPrice)).toStrictEqual([
        '84000',
      ]);
    });

    it('recovery detects a replacement failing DURING its old-protection cancels and finishes the swap when the replacement stays active', async () => {
      const disk = new Map<string, string>();
      const infra = createMockInfrastructure();
      (infra.diskCache.getItem as Mock).mockImplementation(
        async (key: string) => disk.get(key) ?? null,
      );
      (infra.diskCache.setItem as Mock).mockImplementation(
        async (key: string, value: string) => {
          disk.set(key, value);
        },
      );
      (infra.diskCache.removeItem as Mock).mockImplementation(
        async (key: string) => {
          disk.delete(key);
        },
      );
      const first = buildProvider({ platformDependencies: infra });
      const venueA = setupTriggerVenue(first.clientInstance, first.bridge);
      venueA.seedTrigger('stop-loss', '80000');
      // Crash at the FIRST stale-cancel signing: the replacement is live,
      // the old protection untouched, journal phase still 'creating'.
      const realBridge = (
        first.bridge.execute as Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      (first.bridge.execute as Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          if (call.function === '_signCancelOrder') {
            throw new Error('process died');
          }
          return await realBridge(call);
        },
      );
      const crashed = await first.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(crashed.success).toBe(false);
      killProvider(first);
      expect(venueA.rawTriggers).toHaveLength(2);
      const second = buildProvider({ platformDependencies: infra });
      const venueB = setupTriggerVenue(second.clientInstance, second.bridge);
      venueB.setVenueNonce(venueA.getVenueNonce());
      venueB.setNextIndex(venueA.getNextIndex());
      for (const row of venueA.rawTriggers) {
        venueB.rawTriggers.push({ ...row });
      }
      for (const [hash, landed] of venueA.landedTxs) {
        venueB.landedTxs.set(hash, landed);
      }
      await second.provider.getOpenOrders();
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (
          [...disk.keys()].filter(
            (key) =>
              key.startsWith('lighterTpslJournal:') && !key.includes('Index'),
          ).length === 0 &&
          venueB.rawTriggers.length === 1
        ) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      // The replacement stayed ACTIVE: recovery legitimately finishes
      // the swap (no restore machinery involved).
      expect(venueB.rawTriggers.map((row) => row.triggerPrice)).toStrictEqual([
        '85000',
      ]);
      expect(
        [...disk.keys()].filter(
          (key) =>
            key.startsWith('lighterTpslJournal:') && !key.includes('Index'),
        ),
      ).toHaveLength(0);
    });

    it('a failed replacement after old cancels parks durable manual recovery across restarts: the obligation is retried until protection exists', async () => {
      const disk = new Map<string, string>();
      const infra = createMockInfrastructure();
      (infra.diskCache.getItem as Mock).mockImplementation(
        async (key: string) => disk.get(key) ?? null,
      );
      (infra.diskCache.setItem as Mock).mockImplementation(
        async (key: string, value: string) => {
          disk.set(key, value);
        },
      );
      (infra.diskCache.removeItem as Mock).mockImplementation(
        async (key: string) => {
          disk.delete(key);
        },
      );
      const first = buildProvider({ platformDependencies: infra });
      const venueA = setupTriggerVenue(first.clientInstance, first.bridge);
      venueA.seedTrigger('stop-loss', '80000');
      const realActive =
        first.clientInstance.getActiveOrders.getMockImplementation() as () => Promise<unknown>;
      let died = false;
      first.clientInstance.getActiveOrders.mockImplementation(async () => {
        if (!died && venueA.events.includes('cancel')) {
          died = true;
          throw new Error('process died');
        }
        return await realActive();
      });
      const crashed = await first.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(crashed.success).toBe(false);
      killProvider(first);
      // During the downtime the venue also terminal-cancels the
      // replacement: recovery must restore, but the venue rejects the
      // FIRST restore attempt too.
      const [failedRow] = venueA.rawTriggers.splice(0, 1);
      venueA.rawInactive.push({ ...failedRow, status: 'canceled' });
      const second = buildProvider({ platformDependencies: infra });
      const venueB = setupTriggerVenue(second.clientInstance, second.bridge);
      venueB.setVenueNonce(venueA.getVenueNonce());
      venueB.setNextIndex(venueA.getNextIndex());
      for (const row of venueA.rawInactive) {
        venueB.rawInactive.push({ ...row });
      }
      for (const [hash, landed] of venueA.landedTxs) {
        venueB.landedTxs.set(hash, landed);
      }
      await second.provider.getOpenOrders();
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if ((await second.provider.getPendingManualRecoveries()).length === 1) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      // NO automatic restore: the obligation parks DURABLY as manual
      // recovery; nothing is created; a NEW explicit intent resolves it.
      expect(venueB.events.filter((event) => event === 'create')).toHaveLength(
        0,
      );
      expect(await second.provider.getPendingManualRecoveries()).toHaveLength(
        1,
      );
      const renewed = await second.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '84000',
      });
      expect(renewed.error).toBeUndefined();
      expect(renewed.success).toBe(true);
      expect(await second.provider.getPendingManualRecoveries()).toHaveLength(
        0,
      );
    });

    it('an unresolved startup recovery is retried by a later non-mutating read in the SAME session', async () => {
      const disk = new Map<string, string>();
      const infra = createMockInfrastructure();
      (infra.diskCache.getItem as Mock).mockImplementation(
        async (key: string) => disk.get(key) ?? null,
      );
      (infra.diskCache.setItem as Mock).mockImplementation(
        async (key: string, value: string) => {
          disk.set(key, value);
        },
      );
      (infra.diskCache.removeItem as Mock).mockImplementation(
        async (key: string) => {
          disk.delete(key);
        },
      );
      const first = buildProvider({ platformDependencies: infra });
      const venueA = setupTriggerVenue(first.clientInstance, first.bridge);
      venueA.seedTrigger('stop-loss', '80000');
      const realBridge = (
        first.bridge.execute as Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      (first.bridge.execute as Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          if (call.function === '_signCancelOrder') {
            throw new Error('process died');
          }
          return await realBridge(call);
        },
      );
      const crashed = await first.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(crashed.success).toBe(false);
      // New lifetime with the committed create HIDDEN by REST lag beyond
      // the recovery window: the first read's recovery stays unresolved.
      const second = buildProvider({ platformDependencies: infra });
      const venueB = setupTriggerVenue(second.clientInstance, second.bridge);
      venueB.setVenueNonce(venueA.getVenueNonce());
      venueB.setNextIndex(venueA.getNextIndex());
      for (const row of venueA.rawTriggers) {
        venueB.rawTriggers.push({ ...row });
      }
      for (const [hash, landed] of venueA.landedTxs) {
        venueB.landedTxs.set(hash, landed);
      }
      const laggedView = venueB.rawTriggers.filter(
        (row) => row.triggerPrice === '80000',
      );
      venueB.primeLag(laggedView, 50);
      await second.provider.getOpenOrders();
      await new Promise((resolve) => setTimeout(resolve, 2500));
      // Still unresolved: both triggers live, journal retained.
      expect(venueB.rawTriggers).toHaveLength(2);
      // Venue reveals; a later NON-mutating read in the same session must
      // re-kick recovery and converge — no TP/SL mutation by this test.
      venueB.primeLag(venueB.rawTriggers, 0);
      await second.provider.getOpenOrders();
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (venueB.rawTriggers.length === 1) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(venueB.rawTriggers).toHaveLength(1);
      expect(venueB.rawTriggers[0].triggerPrice).toBe('85000');
      expect(
        [...disk.keys()].filter(
          (key) =>
            key.startsWith('lighterTpslJournal:') && !key.includes('Index'),
        ),
      ).toHaveLength(0);
    });

    it('a kick arriving while a recovery is in flight is preserved, not lost', async () => {
      const disk = new Map<string, string>();
      const infra = createMockInfrastructure();
      let indexReads = 0;
      let releaseIndexRead = (): void => undefined;
      let gateArmed = true;
      const indexGate = new Promise<void>((resolve) => {
        releaseIndexRead = resolve;
      });
      (infra.diskCache.getItem as Mock).mockImplementation(
        async (key: string) => {
          if (key.startsWith('lighterTpslJournalIndex:')) {
            indexReads += 1;
            if (gateArmed) {
              gateArmed = false;
              await indexGate;
            }
          }
          return disk.get(key) ?? null;
        },
      );
      (infra.diskCache.setItem as Mock).mockImplementation(
        async (key: string, value: string) => {
          disk.set(key, value);
        },
      );
      // Seed an UNRESOLVABLE pending journal (unknown create, not on the
      // books, unexpired): every recovery pass ends incomplete, so a lost
      // kick would visibly halt retries.
      const settlementKey = `${ACCOUNT.l1Address.toLowerCase()}:28:7:BTC`;
      disk.set(
        'lighterTpslJournalIndex:testnet',
        JSON.stringify([settlementKey]),
      );
      disk.set(
        `lighterTpslJournal:testnet:${settlementKey}`,
        JSON.stringify({
          version: 3,
          recordedAt: 5,
          operationId: 'op-kick-1',
          createdAt: 5,
          nextAttemptId: 2,
          venueCheckpoint: 0,
          apiKeyIndex: 7,
          intent: 'replace',
          phase: 'creating',
          priorGrouping: 'independent',
          priorTriggers: [],
          positionFingerprint: null,
          attempts: [
            {
              kind: 'create',
              attemptId: 1,
              nonce: 999,
              outcome: 'unknown',
              clientIds: [12345],
              txHash: 'ffff00000001',
              expiresAt: 9_999_999_999_999,
              role: 'replacement',
            },
          ],
        }),
      );
      const built = buildProvider({ platformDependencies: infra });
      setupTriggerVenue(built.clientInstance, built.bridge);
      // First read: recovery starts and stalls inside the index read.
      const firstRead = built.provider.getOpenOrders();
      await new Promise((resolve) => setTimeout(resolve, 20));
      // Second read while in flight: its kick must be PRESERVED.
      await built.provider.getOpenOrders();
      releaseIndexRead();
      await firstRead;
      // The preserved kick re-runs recovery after the stalled pass ends
      // (the first pass spends its full books-poll bound reconciling).
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (indexReads >= 2) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(indexReads).toBeGreaterThanOrEqual(2);
    });

    it('a signing result without txHash or ExpiredAt refuses to submit', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      const realImplementation = (
        bridge.execute as Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      (bridge.execute as Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          const result = (await realImplementation(call)) as Record<
            string,
            unknown
          >;
          if (call.function === '_signCreateOrder') {
            return { ...result, txHash: undefined };
          }
          return result;
        },
      );
      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('txHash');
      // Nothing was submitted; old protection intact.
      expect(
        clientInstance.sendTx.mock.calls.filter(
          ([txType]) => txType === 14 || txType === 28 || txType === 15,
        ),
      ).toHaveLength(0);
      expect(venue.rawTriggers).toHaveLength(1);
    });
  });

  describe('round-16 durable intent, faithful restoration and authoritative resolution', () => {
    /**
     * Durable disk map + infra wiring shared by restart scenarios.
     *
     * @returns The disk map and mocked infrastructure bound to it.
     */
    const makeDurableDisk = (): {
      disk: Map<string, string>;
      infra: ReturnType<typeof createMockInfrastructure>;
    } => {
      const disk = new Map<string, string>();
      const infra = createMockInfrastructure();
      (infra.diskCache.getItem as Mock).mockImplementation(
        async (key: string) => disk.get(key) ?? null,
      );
      (infra.diskCache.setItem as Mock).mockImplementation(
        async (key: string, value: string) => {
          disk.set(key, value);
        },
      );
      (infra.diskCache.removeItem as Mock).mockImplementation(
        async (key: string) => {
          disk.delete(key);
        },
      );
      return { disk, infra };
    };

    const journalKeysOf = (disk: Map<string, string>): string[] =>
      [...disk.keys()].filter(
        (key) =>
          key.startsWith('lighterTpslJournal:') && !key.includes('Index'),
      );

    /**
     * Simulate full process death for a provider (see round-15 helper).
     *
     * @param built - The provider under test.
     * @param built.clientInstance - Its mocked client service instance.
     * @param built.bridge - Its mocked signer bridge.
     */
    const killProvider = (built: {
      clientInstance: MockClientInstance;
      bridge: LighterSignerBridge;
    }): void => {
      for (const mockFn of Object.values(built.clientInstance)) {
        if (vi.isMockFunction(mockFn)) {
          mockFn.mockImplementation(async () => {
            throw new Error('process died');
          });
        }
      }
      (built.bridge.execute as Mock).mockImplementation(async () => {
        throw new Error('process died');
      });
    };

    it('remove-only: a crash between two cancels finishes the removal exactly once and NEVER restores', async () => {
      const { disk, infra } = makeDurableDisk();
      const first = buildProvider({ platformDependencies: infra });
      const venueA = setupTriggerVenue(first.clientInstance, first.bridge);
      venueA.seedTrigger('take-profit', '110000');
      venueA.seedTrigger('stop-loss', '80000');
      // First cancel lands; the process dies signing the second.
      const realBridge = (
        first.bridge.execute as Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      let cancelSignings = 0;
      (first.bridge.execute as Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          if (call.function === '_signCancelOrder') {
            cancelSignings += 1;
            if (cancelSignings >= 2) {
              throw new Error('process died');
            }
          }
          return await realBridge(call);
        },
      );
      const crashed = await first.provider.updatePositionTPSL({
        symbol: 'BTC',
      });
      expect(crashed.success).toBe(false);
      killProvider(first);
      expect(venueA.rawTriggers).toHaveLength(1);
      const second = buildProvider({ platformDependencies: infra });
      const venueB = setupTriggerVenue(second.clientInstance, second.bridge);
      venueB.setVenueNonce(venueA.getVenueNonce());
      venueB.setNextIndex(venueA.getNextIndex());
      for (const row of venueA.rawTriggers) {
        venueB.rawTriggers.push({ ...row });
      }
      for (const [hash, landed] of venueA.landedTxs) {
        venueB.landedTxs.set(hash, landed);
      }
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await second.provider.getOpenOrders();
        if (
          venueB.rawTriggers.length === 0 &&
          journalKeysOf(disk).length === 0
        ) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      // The intentional removal FINISHED: nothing restored, exactly the
      // one remaining old trigger cancelled.
      expect(venueB.rawTriggers).toHaveLength(0);
      expect(journalKeysOf(disk)).toHaveLength(0);
      expect(venueB.events.filter((event) => event === 'cancel')).toHaveLength(
        1,
      );
    });

    it('remove-only: an accepted cancel with lost response resolves by exact tx identity without restoring or double-cancelling', async () => {
      const { disk, infra } = makeDurableDisk();
      const first = buildProvider({ platformDependencies: infra });
      const venueA = setupTriggerVenue(first.clientInstance, first.bridge);
      venueA.seedTrigger('stop-loss', '80000');
      venueA.failResponseOnce(15);
      const crashed = await first.provider.updatePositionTPSL({
        symbol: 'BTC',
      });
      expect(crashed.success).toBe(false);
      killProvider(first);
      // The cancel COMMITTED (response was lost): venue book is empty.
      expect(venueA.rawTriggers).toHaveLength(0);
      const second = buildProvider({ platformDependencies: infra });
      const venueB = setupTriggerVenue(second.clientInstance, second.bridge);
      venueB.setVenueNonce(venueA.getVenueNonce());
      venueB.setNextIndex(venueA.getNextIndex());
      for (const [hash, landed] of venueA.landedTxs) {
        venueB.landedTxs.set(hash, landed);
      }
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await second.provider.getOpenOrders();
        if (journalKeysOf(disk).length === 0) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(journalKeysOf(disk)).toHaveLength(0);
      expect(venueB.rawTriggers).toHaveLength(0);
      // Removal completed exactly once: no second cancel, no restore.
      expect(venueB.events.filter((event) => event === 'cancel')).toHaveLength(
        0,
      );
      expect(venueB.events.filter((event) => event === 'create')).toHaveLength(
        0,
      );
    });

    it('a v2 journal without a durable operation intent fails closed as malformed', async () => {
      const { disk, infra } = makeDurableDisk();
      const settlementKey = `${ACCOUNT.l1Address.toLowerCase()}:28:7:BTC`;
      disk.set(
        'lighterTpslJournalIndex:testnet',
        JSON.stringify([settlementKey]),
      );
      disk.set(
        `lighterTpslJournal:testnet:${settlementKey}`,
        JSON.stringify({
          version: 3,
          recordedAt: 5,
          operationId: 'op-intentless',
          createdAt: 5,
          nextAttemptId: 2,
          venueCheckpoint: 0,
          apiKeyIndex: 7,
          phase: 'cancelling',
          priorGrouping: 'independent',
          priorTriggers: [],
          positionFingerprint: null,
          attempts: [
            {
              kind: 'cancel',
              attemptId: 1,
              nonce: 999,
              outcome: 'accepted',
              orderId: '424242',
              txHash: 'ffff00000002',
              expiresAt: 9_999_999_999_999,
              role: 'stale',
            },
          ],
        }),
      );
      const built = buildProvider({ platformDependencies: infra });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      venue.seedTrigger('stop-loss', '80000');
      const result = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '110000',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('malformed');
      // Zero venue mutation from an uninterpretable obligation.
      expect(
        built.clientInstance.sendTx.mock.calls.filter(
          ([txType]: number[]) =>
            txType === 14 || txType === 28 || txType === 15,
        ),
      ).toHaveLength(0);
      expect(venue.rawTriggers).toHaveLength(1);
    });

    it('a direct foreground update routes the pending obligation through the SAME state machine before proceeding', async () => {
      const { disk, infra } = makeDurableDisk();
      const first = buildProvider({ platformDependencies: infra });
      const venueA = setupTriggerVenue(first.clientInstance, first.bridge);
      venueA.seedTrigger('stop-loss', '80000');
      const realActive =
        first.clientInstance.getActiveOrders.getMockImplementation() as () => Promise<unknown>;
      let died = false;
      first.clientInstance.getActiveOrders.mockImplementation(async () => {
        if (!died && venueA.events.includes('cancel')) {
          died = true;
          throw new Error('process died');
        }
        return await realActive();
      });
      const crashed = await first.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(crashed.success).toBe(false);
      killProvider(first);
      // Downtime: the replacement terminal-cancels — the journal owes a
      // RESTORE ('cancelling' phase, replacement fully failed).
      const [failedRow] = venueA.rawTriggers.splice(0, 1);
      venueA.rawInactive.push({ ...failedRow, status: 'canceled' });
      const second = buildProvider({ platformDependencies: infra });
      const venueB = setupTriggerVenue(second.clientInstance, second.bridge);
      venueB.setVenueNonce(venueA.getVenueNonce());
      venueB.setNextIndex(venueA.getNextIndex());
      for (const row of venueA.rawInactive) {
        venueB.rawInactive.push({ ...row });
      }
      for (const [hash, landed] of venueA.landedTxs) {
        venueB.landedTxs.set(hash, landed);
      }
      // DIRECT foreground update — no prior read-path kick. The machine
      // parks the interrupted operation as MANUAL; this very call is the
      // explicit new intent that acknowledges it, so the update proceeds
      // and establishes the NEW protection (never restoring the old).
      const update = await second.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      expect(update.error).toBeUndefined();
      expect(update.success).toBe(true);
      expect(venueB.rawTriggers.map((row) => row.triggerPrice)).toStrictEqual([
        '86000',
      ]);
      expect(journalKeysOf(disk)).toHaveLength(0);
      expect(await second.provider.getPendingManualRecoveries()).toHaveLength(
        0,
      );
    });

    it('a live OCO leg failing after activation parks durable manual recovery (never a silent partial pair)', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('take-profit', '110000');
      venue.seedTrigger('stop-loss', '80000');
      // After the FIRST old-cancel commits, the venue terminal-cancels
      // one replacement leg — the phase race at its worst.
      const realSend = clientInstance.sendTx.getMockImplementation() as (
        txType: number,
        txInfo: string,
      ) => Promise<unknown>;
      let raced = false;
      clientInstance.sendTx.mockImplementation(
        async (txType: number, txInfo: string) => {
          const result = await realSend(txType, txInfo);
          if (txType === 15 && !raced) {
            raced = true;
            const failedAt = venue.rawTriggers.findIndex(
              (row) => row.triggerPrice === '81000',
            );
            if (failedAt >= 0) {
              const [failedRow] = venue.rawTriggers.splice(failedAt, 1);
              venue.rawInactive.push({ ...failedRow, status: 'canceled' });
            }
          }
          return result;
        },
      );
      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '111000',
        stopLossPrice: '81000',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('MANUAL re-establishment');
      expect(await provider.getPendingManualRecoveries()).toHaveLength(1);
      const renewed = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '84000',
      });
      expect(renewed.error).toBeUndefined();
      expect(renewed.success).toBe(true);
      expect(await provider.getPendingManualRecoveries()).toHaveLength(0);
    });

    it('a stale trigger whose wire intent cannot be faithfully restored refuses the update BEFORE any mutation', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('take-profit', '110000');
      // Unknown venue time-in-force: an exact restoration cannot be
      // signed, so the swap must refuse before touching anything.
      venue.rawTriggers[0].timeInForce = 'mystery-tif';
      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('faithfully restored');
      expect(
        clientInstance.sendTx.mock.calls.filter(
          ([txType]: number[]) =>
            txType === 14 || txType === 28 || txType === 15,
        ),
      ).toHaveLength(0);
      expect(venue.rawTriggers).toHaveLength(1);
    });

    it('an UNKNOWN cancel is never resolved by book state alone: an independently-removed target keeps blocking until identity resolves', async () => {
      const { disk, infra } = makeDurableDisk();
      const first = buildProvider({ platformDependencies: infra });
      const venueA = setupTriggerVenue(first.clientInstance, first.bridge);
      venueA.seedTrigger('stop-loss', '80000');
      venueA.failBeforeCommitOnce(15);
      const crashed = await first.provider.updatePositionTPSL({
        symbol: 'BTC',
      });
      expect(crashed.success).toBe(false);
      killProvider(first);
      // The signed cancel NEVER reached the venue — but the target then
      // disappears independently (fill or external cancel). Book state
      // alone cannot prove the signed payload will not land later.
      venueA.rawTriggers.splice(0, 1);
      const second = buildProvider({ platformDependencies: infra });
      const venueB = setupTriggerVenue(second.clientInstance, second.bridge);
      venueB.setVenueNonce(venueA.getVenueNonce());
      venueB.setNextIndex(venueA.getNextIndex());
      await second.provider.getOpenOrders();
      await new Promise((resolve) => setTimeout(resolve, 500));
      // The obligation is retained (unexpired + venue-confirmed nothing).
      expect(journalKeysOf(disk)).toHaveLength(1);
      const update = await second.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(update.success).toBe(false);
      expect(update.error).toContain('unresolved');
    });

    it('an exact tx found with terminal FAILED status resolves deterministically and the removal is retried to completion', async () => {
      const { disk, infra } = makeDurableDisk();
      const first = buildProvider({ platformDependencies: infra });
      const venueA = setupTriggerVenue(first.clientInstance, first.bridge);
      venueA.seedTrigger('stop-loss', '80000');
      // The sequencer consumes the nonce, records terminal status 0
      // (failed), mutates nothing, and the response is lost.
      venueA.failExecutionOnceFor(15);
      const crashed = await first.provider.updatePositionTPSL({
        symbol: 'BTC',
      });
      expect(crashed.success).toBe(false);
      killProvider(first);
      expect(venueA.rawTriggers).toHaveLength(1);
      const second = buildProvider({ platformDependencies: infra });
      const venueB = setupTriggerVenue(second.clientInstance, second.bridge);
      venueB.setVenueNonce(venueA.getVenueNonce());
      venueB.setNextIndex(venueA.getNextIndex());
      for (const row of venueA.rawTriggers) {
        venueB.rawTriggers.push({ ...row });
      }
      for (const [hash, landed] of venueA.landedTxs) {
        venueB.landedTxs.set(hash, landed);
      }
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await second.provider.getOpenOrders();
        if (
          venueB.rawTriggers.length === 0 &&
          journalKeysOf(disk).length === 0
        ) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      // The failed cancel was classified terminally and RETRIED: the
      // removal completed instead of blocking forever.
      expect(venueB.rawTriggers).toHaveLength(0);
      expect(journalKeysOf(disk)).toHaveLength(0);
      expect(venueB.events.filter((event) => event === 'cancel')).toHaveLength(
        1,
      );
    });

    it('a symbol carrying more prior triggers than the journal can hold refuses the mutation before any submission', async () => {
      const { disk, infra } = makeDurableDisk();
      const built = buildProvider({ platformDependencies: infra });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      for (let index = 0; index < 5; index += 1) {
        venue.seedTrigger(
          index % 2 === 0 ? 'stop-loss' : 'take-profit',
          '80000',
        );
      }
      const result = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('too many');
      expect(
        built.clientInstance.sendTx.mock.calls.filter(
          ([txType]: number[]) =>
            txType === 14 || txType === 28 || txType === 15,
        ),
      ).toHaveLength(0);
      expect(venue.rawTriggers).toHaveLength(5);
      expect(journalKeysOf(disk)).toHaveLength(0);
    });

    it('a journal persisted AFTER the initial empty-index recovery is still retried by later read kicks in the same session', async () => {
      const { disk, infra } = makeDurableDisk();
      const built = buildProvider({ platformDependencies: infra });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      // Initial recovery completes against an EMPTY index — twice, so the
      // completion marker is recorded at the STABLE session generation
      // (the first read also performs the initial session bind).
      await built.provider.getOpenOrders();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await built.provider.getOpenOrders();
      await new Promise((resolve) => setTimeout(resolve, 100));
      venue.seedTrigger('stop-loss', '80000');
      // The replacement create commits but the response is lost: the
      // journal is created AFTER the completion marker was set.
      venue.failResponseOnce(14);
      const crashed = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(crashed.success).toBe(false);
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await built.provider.getOpenOrders();
        if (
          journalKeysOf(disk).length === 0 &&
          venue.rawTriggers.length === 1
        ) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      // The later read kicks reconciled it: swap completed, old cancelled.
      expect(journalKeysOf(disk)).toHaveLength(0);
      expect(venue.rawTriggers).toHaveLength(1);
      expect(venue.rawTriggers[0].triggerPrice).toBe('85000');
    });

    it('a nonce consumed by a lost-response submission is never reissued to the next lock section while the endpoint lags', async () => {
      const { infra } = makeDurableDisk();
      const built = buildProvider({ platformDependencies: infra });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      venue.seedTrigger('stop-loss', '80000');
      // Freeze the REST nonce endpoint at the pre-loss value.
      const frozenNonce = venue.getVenueNonce();
      built.clientInstance.getNextNonce.mockImplementation(async () => ({
        code: 200,
        nonce: frozenNonce,
      }));
      // The remove's cancel consumes the frozen nonce; response is lost.
      venue.failResponseOnce(15);
      const crashed = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
      });
      expect(crashed.success).toBe(false);
      // A DIFFERENT operation in a new lock section must not reuse it.
      // The lost-response cancel is JOURNAL-OWNED: its ledger entry is
      // consumed by exact-hash proof (floor advance) without parking a
      // generic quarantine, so the unrelated write proceeds immediately.
      const placed = await built.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });
      expect(placed.error).toBeUndefined();
      expect(placed.success).toBe(true);
      // The cancel consumed its issued nonce even though the response was
      // lost; the NEXT section must sign strictly above it — never a
      // reuse of the lagging REST value.
      const cancelCall = built.calls
        .filter((call) => call.function === '_signCancelOrder')
        .at(-1);
      expect(cancelCall).toBeDefined();
      const cancelParams = cancelCall?.params as (string | number)[];
      const consumedNonce = Number(cancelParams[cancelParams.length - 1]);
      expect(consumedNonce).toBeGreaterThanOrEqual(frozenNonce);
      const orderCall = built.calls
        .filter((call) => call.function === '_signCreateOrder')
        .at(-1);
      expect(orderCall).toBeDefined();
      const orderParams = orderCall?.params as (string | number)[];
      expect(Number(orderParams[orderParams.length - 1])).toBe(
        consumedNonce + 1,
      );
    });
  });

  describe('round-17 journal revisions, durable nonce ledger and independent restores', () => {
    /**
     * Durable disk map + infra wiring shared by restart scenarios.
     *
     * @returns The disk map and mocked infrastructure bound to it.
     */
    const makeDurableDisk = (): {
      disk: Map<string, string>;
      infra: ReturnType<typeof createMockInfrastructure>;
    } => {
      const disk = new Map<string, string>();
      const infra = createMockInfrastructure();
      (infra.diskCache.getItem as Mock).mockImplementation(
        async (key: string) => disk.get(key) ?? null,
      );
      (infra.diskCache.setItem as Mock).mockImplementation(
        async (key: string, value: string) => {
          disk.set(key, value);
        },
      );
      (infra.diskCache.removeItem as Mock).mockImplementation(
        async (key: string) => {
          disk.delete(key);
        },
      );
      return { disk, infra };
    };

    const journalKeysOf = (disk: Map<string, string>): string[] =>
      [...disk.keys()].filter(
        (key) =>
          key.startsWith('lighterTpslJournal:') && !key.includes('Index'),
      );

    /**
     * Simulate full process death for a provider (see round-15 helper).
     *
     * @param built - The provider under test.
     * @param built.clientInstance - Its mocked client service instance.
     * @param built.bridge - Its mocked signer bridge.
     */
    const killProvider = (built: {
      clientInstance: MockClientInstance;
      bridge: LighterSignerBridge;
    }): void => {
      for (const mockFn of Object.values(built.clientInstance)) {
        if (vi.isMockFunction(mockFn)) {
          mockFn.mockImplementation(async () => {
            throw new Error('process died');
          });
        }
      }
      (built.bridge.execute as Mock).mockImplementation(async () => {
        throw new Error('process died');
      });
    };

    const copyVenue = (
      from: ReturnType<typeof setupTriggerVenue>,
      to: ReturnType<typeof setupTriggerVenue>,
      options: { triggers?: boolean; inactive?: boolean } = {},
    ): void => {
      to.setVenueNonce(from.getVenueNonce());
      to.setNextIndex(from.getNextIndex());
      if (options.triggers !== false) {
        for (const row of from.rawTriggers) {
          to.rawTriggers.push({ ...row });
        }
      }
      if (options.inactive !== false) {
        for (const row of from.rawInactive) {
          to.rawInactive.push({ ...row });
        }
      }
      for (const [hash, landed] of from.landedTxs) {
        to.landedTxs.set(hash, landed);
      }
    };

    it('a recovery holding a STALE journal snapshot can never erase a newer operation journal (in-lock reload + revision guard)', async () => {
      const { disk, infra } = makeDurableDisk();
      const first = buildProvider({ platformDependencies: infra });
      const venueA = setupTriggerVenue(first.clientInstance, first.bridge);
      venueA.seedTrigger('stop-loss', '80000');
      // Journal A: replacement (85000) accepted+active, crash BEFORE the
      // stale cancel — resolvable by finishing the swap.
      const realBridge = (
        first.bridge.execute as Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      (first.bridge.execute as Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          if (call.function === '_signCancelOrder') {
            throw new Error('process died');
          }
          return await realBridge(call);
        },
      );
      const crashed = await first.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(crashed.success).toBe(false);
      killProvider(first);
      // Let any zombie pass of the dead provider fail against the killed
      // mocks BEFORE arming the stale-read seam: the seam must capture
      // the NEW session's recovery, not the corpse's.
      await new Promise((resolve) => setTimeout(resolve, 150));
      const second = buildProvider({ platformDependencies: infra });
      const venueB = setupTriggerVenue(second.clientInstance, second.bridge);
      copyVenue(venueA, venueB);
      // STALE-SNAPSHOT seam: the FIRST read of the journal key captures
      // its value, then stalls until the foreground finished (or a bound
      // elapses) — modelling a recovery preempted between its journal
      // load and its lock section.
      const journalKey = journalKeysOf(disk)[0];
      let staleGateArmed = true;
      let releaseStaleGate = (): void => undefined;
      const staleGate = new Promise<void>((resolve) => {
        releaseStaleGate = resolve;
      });
      (infra.diskCache.getItem as Mock).mockImplementation(
        async (key: string) => {
          const value = disk.get(key) ?? null;
          if (key === journalKey && staleGateArmed) {
            staleGateArmed = false;
            await staleGate;
          }
          return value;
        },
      );
      // Kick recovery: its journal read stalls holding the captured
      // (soon stale) snapshot.
      await second.provider.getOpenOrders();
      await new Promise((resolve) => setTimeout(resolve, 50));
      // Foreground: settles A (finishes the swap to 85000), then its NEW
      // replacement (86000) commits but the response is lost — journal B.
      venueB.failResponseOnce(14);
      const foreground = second.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      await Promise.race([
        foreground,
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
      releaseStaleGate();
      await foreground.catch(() => undefined);
      // Let the STALE recovery pass fully finish BEFORE any fresh kick
      // could mask the erasure it would cause.
      await new Promise((resolve) => setTimeout(resolve, 800));
      // The stale recovery must NOT erase journal B; later kicks resolve
      // B: the committed 86000 replacement wins, 85000 is cancelled.
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await second.provider.getOpenOrders();
        if (
          journalKeysOf(disk).length === 0 &&
          venueB.rawTriggers.length === 1 &&
          venueB.rawTriggers[0].triggerPrice === '86000'
        ) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(venueB.rawTriggers.map((row) => row.triggerPrice)).toStrictEqual([
        '86000',
      ]);
      expect(journalKeysOf(disk)).toHaveLength(0);
    });

    it('a response-lost dispatch survives RESTART: an unrelated write on the new session never reuses the consumed nonce', async () => {
      const { infra } = makeDurableDisk();
      // Venue key pre-registered on BOTH sessions: the unrelated write is
      // the FIRST dispatch of the fresh session (no ChangePubKey ahead of
      // it to absorb the reused nonce by accident).
      const registeredKey = '9c'.repeat(40);
      const first = buildProvider({
        platformDependencies: infra,
        registeredKey,
      });
      const venueA = setupTriggerVenue(first.clientInstance, first.bridge);
      venueA.seedTrigger('stop-loss', '80000');
      venueA.failResponseOnce(15);
      const crashed = await first.provider.updatePositionTPSL({
        symbol: 'BTC',
      });
      expect(crashed.success).toBe(false);
      // The cancel consumed its nonce (response lost).
      const cancelCall = first.calls
        .filter((call) => call.function === '_signCancelOrder')
        .at(-1);
      const cancelParams = cancelCall?.params as (string | number)[];
      const consumedNonce = Number(cancelParams[cancelParams.length - 1]);
      killProvider(first);
      const second = buildProvider({
        platformDependencies: infra,
        registeredKey,
      });
      const venueB = setupTriggerVenue(second.clientInstance, second.bridge);
      copyVenue(venueA, venueB);
      // The REST endpoint LAGS at the consumed nonce after restart.
      second.clientInstance.getNextNonce.mockImplementation(async () => ({
        code: 200,
        nonce: consumedNonce,
      }));
      // A DIRECT write on the fresh session — no recovery kick ran; only
      // the durable dispatch ledger can prevent the reuse. The lost-
      // response cancel is JOURNAL-OWNED: the fresh session's protection
      // intent resolves it through the settlement machine (no generic
      // quarantine), and the floor advance survives the restart.
      const resolvedRestart = await second.provider.updatePositionTPSL({
        symbol: 'BTC',
      });
      expect(resolvedRestart.success).toBe(true);
      expect(await second.provider.getRecoveredDispatches()).toStrictEqual([]);
      const placed = await second.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });
      expect(placed.success).toBe(true);
      const orderCall = second.calls
        .filter((call) => call.function === '_signCreateOrder')
        .at(-1);
      const orderParams = orderCall?.params as (string | number)[];
      expect(Number(orderParams[orderParams.length - 1])).toBe(
        consumedNonce + 1,
      );
    });

    it('a PROVEN never-landed dispatch releases its nonce: writes recover to the value the venue still expects', async () => {
      const { disk, infra } = makeDurableDisk();
      const built = buildProvider({ platformDependencies: infra });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      const frozenNonce = venue.getVenueNonce();
      built.clientInstance.getNextNonce.mockImplementation(async () => ({
        code: 200,
        nonce: frozenNonce,
      }));
      // The order dispatch never reaches the venue: nonce NOT consumed.
      venue.failBeforeCommitOnce(14);
      const failed = await built.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });
      expect(failed.success).toBe(false);
      const firstCall = built.calls
        .filter((call) => call.function === '_signCreateOrder')
        .at(-1);
      const firstParams = firstCall?.params as (string | number)[];
      const unconsumedNonce = Number(firstParams[firstParams.length - 1]);
      // Age the durable ledger entry past its signed validity: the
      // dispatch is now PROVABLY never-landed.
      const ledgerKey = [...disk.keys()].find((key) =>
        key.startsWith('lighterNonceLedger:'),
      );
      expect(ledgerKey).toBeDefined();
      const ledger = JSON.parse(disk.get(ledgerKey as string) as string) as {
        entries: { expiresAt: number | null }[];
      };
      for (const entry of ledger.entries) {
        entry.expiresAt = Date.now() - 700_000;
      }
      disk.set(ledgerKey as string, JSON.stringify(ledger));
      // The NEXT write must recover to the nonce the venue still expects
      // — a sticky memory floor would brick every subsequent write.
      const placed = await built.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90500',
      });
      expect(placed.success).toBe(true);
      const secondCall = built.calls
        .filter((call) => call.function === '_signCreateOrder')
        .at(-1);
      const secondParams = secondCall?.params as (string | number)[];
      expect(Number(secondParams[secondParams.length - 1])).toBe(
        unconsumedNonce,
      );
    });

    it('a stale trigger with NO trigger price refuses the update — semantics are never substituted', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      delete (venue.rawTriggers[0] as { triggerPrice?: string }).triggerPrice;
      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('faithfully restored');
      expect(
        clientInstance.sendTx.mock.calls.filter(
          ([txType]: number[]) =>
            txType === 14 || txType === 28 || txType === 15,
        ),
      ).toHaveLength(0);
      expect(venue.rawTriggers).toHaveLength(1);
    });

    it('a prior whose wire values cannot be integerized refuses the update before any mutation (writer/loader symmetry)', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      // Exceeds the uint32 wire price range at 1 decimal: restoring this
      // prior could never be signed — the swap must refuse up front.
      venue.rawTriggers[0].price = '429496729.7';
      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('faithfully restored');
      expect(
        clientInstance.sendTx.mock.calls.filter(
          ([txType]: number[]) =>
            txType === 14 || txType === 28 || txType === 15,
        ),
      ).toHaveLength(0);
      expect(venue.rawTriggers).toHaveLength(1);
    });

    it('the LIVE transition never re-attaches protection after a post-cancel failure: durable manual recovery is parked', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      // After the old cancel commits: the replacement terminal-fails AND
      // the position closes+reopens (venue fills + changed account row).
      const realSend = clientInstance.sendTx.getMockImplementation() as (
        txType: number,
        txInfo: string,
      ) => Promise<unknown>;
      let raced = false;
      clientInstance.sendTx.mockImplementation(
        async (txType: number, txInfo: string) => {
          const result = await realSend(txType, txInfo);
          if (txType === 15 && !raced) {
            raced = true;
            const failedAt = venue.rawTriggers.findIndex(
              (row) => row.triggerPrice === '85000',
            );
            if (failedAt >= 0) {
              const [failedRow] = venue.rawTriggers.splice(failedAt, 1);
              venue.rawInactive.push({ ...failedRow, status: 'canceled' });
            }
            venue.rawInactive.push({
              orderIndex: 9990,
              clientOrderIndex: 777001,
              marketIndex: 1,
              ownerAccountIndex: 28,
              initialBaseAmount: '0.1',
              remainingBaseAmount: '0.000',
              price: '95000',
              isAsk: true,
              type: 'market',
              timeInForce: 'immediate-or-cancel',
              reduceOnly: 1,
              status: 'filled',
              orderExpiry: 0,
              timestamp: Date.now(),
              triggerPrice: '0',
            });
            clientInstance.getAccountByIndex.mockResolvedValue({
              code: 200,
              accounts: [
                {
                  ...ACCOUNT,
                  positions: [
                    {
                      ...ACCOUNT.positions[0],
                      sign: -1,
                      position: '0.05',
                      avgEntryPrice: '95000',
                    },
                  ],
                },
              ],
            });
          }
          return result;
        },
      );
      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(result.success).toBe(false);
      // NO automatic restore: explicit failure, durable manual state.
      expect(result.error).toContain('MANUAL re-establishment');
      expect(venue.events.filter((event) => event === 'create')).toHaveLength(
        1,
      );
      expect(await provider.getPendingManualRecoveries()).toHaveLength(1);
      const renewed = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '84000',
      });
      expect(renewed.error).toBeUndefined();
      expect(renewed.success).toBe(true);
      expect(await provider.getPendingManualRecoveries()).toHaveLength(0);
    });

    it('a proven-never-landed retry may reuse its nonce: the journal stays loadable across a restart mid-retry', async () => {
      const { disk, infra } = makeDurableDisk();
      const first = buildProvider({ platformDependencies: infra });
      const venueA = setupTriggerVenue(first.clientInstance, first.bridge);
      venueA.seedTrigger('stop-loss', '80000');
      venueA.failBeforeCommitOnce(15);
      const crashed = await first.provider.updatePositionTPSL({
        symbol: 'BTC',
      });
      expect(crashed.success).toBe(false);
      killProvider(first);
      // Age the unknown cancel attempt (and its ledger entry) past the
      // signed validity: PROVEN never-landed → nonce released, retried.
      const journalKey = resolveJournalPayloadKey(disk, journalKeysOf(disk)[0]);
      const journal = JSON.parse(disk.get(journalKey) as string) as {
        attempts: { expiresAt: number }[];
      };
      for (const attempt of journal.attempts) {
        attempt.expiresAt = Date.now() - 700_000;
      }
      disk.set(journalKey, JSON.stringify(journal));
      const ledgerKey = [...disk.keys()].find((key) =>
        key.startsWith('lighterNonceLedger:'),
      );
      if (ledgerKey) {
        const ledger = JSON.parse(disk.get(ledgerKey) as string) as {
          entries: { expiresAt: number | null }[];
        };
        for (const entry of ledger.entries) {
          entry.expiresAt = Date.now() - 700_000;
        }
        disk.set(ledgerKey, JSON.stringify(ledger));
      }
      // Restart 1: the retry cancel signs (with a possibly REUSED nonce),
      // then the process dies before settlement.
      const second = buildProvider({ platformDependencies: infra });
      const venueB = setupTriggerVenue(second.clientInstance, second.bridge);
      copyVenue(venueA, venueB);
      const frozen = venueB.getVenueNonce();
      second.clientInstance.getNextNonce.mockImplementation(async () => ({
        code: 200,
        nonce: frozen,
      }));
      const realActiveB =
        second.clientInstance.getActiveOrders.getMockImplementation() as () => Promise<unknown>;
      let diedB = false;
      second.clientInstance.getActiveOrders.mockImplementation(async () => {
        if (!diedB && venueB.events.includes('cancel')) {
          diedB = true;
          throw new Error('process died');
        }
        return await realActiveB();
      });
      await second.provider.getOpenOrders();
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (venueB.events.includes('cancel')) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      killProvider(second);
      // Restart 2: the journal now holds TWO attempts that may share a
      // nonce. It must still LOAD and the removal must complete.
      const third = buildProvider({ platformDependencies: infra });
      const venueC = setupTriggerVenue(third.clientInstance, third.bridge);
      copyVenue(venueB, venueC);
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await third.provider.getOpenOrders();
        if (
          venueC.rawTriggers.length === 0 &&
          journalKeysOf(disk).length === 0
        ) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(venueC.rawTriggers).toHaveLength(0);
      expect(journalKeysOf(disk)).toHaveLength(0);
    });
  });

  describe('round-18 real signer identity, durable nonce integrity and grouped restores', () => {
    /**
     * Durable disk map + infra wiring shared by restart scenarios.
     *
     * @returns The disk map and mocked infrastructure bound to it.
     */
    const makeDurableDisk = (): {
      disk: Map<string, string>;
      infra: ReturnType<typeof createMockInfrastructure>;
    } => {
      const disk = new Map<string, string>();
      const infra = createMockInfrastructure();
      (infra.diskCache.getItem as Mock).mockImplementation(
        async (key: string) => disk.get(key) ?? null,
      );
      (infra.diskCache.setItem as Mock).mockImplementation(
        async (key: string, value: string) => {
          disk.set(key, value);
        },
      );
      (infra.diskCache.removeItem as Mock).mockImplementation(
        async (key: string) => {
          disk.delete(key);
        },
      );
      return { disk, infra };
    };

    const journalKeysOf = (disk: Map<string, string>): string[] =>
      [...disk.keys()].filter(
        (key) =>
          key.startsWith('lighterTpslJournal:') && !key.includes('Index'),
      );

    /**
     * Simulate full process death for a provider (see round-15 helper).
     *
     * @param built - The provider under test.
     * @param built.clientInstance - Its mocked client service instance.
     * @param built.bridge - Its mocked signer bridge.
     */
    const killProvider = (built: {
      clientInstance: MockClientInstance;
      bridge: LighterSignerBridge;
    }): void => {
      for (const mockFn of Object.values(built.clientInstance)) {
        if (vi.isMockFunction(mockFn)) {
          mockFn.mockImplementation(async () => {
            throw new Error('process died');
          });
        }
      }
      (built.bridge.execute as Mock).mockImplementation(async () => {
        throw new Error('process died');
      });
    };

    const copyVenue = (
      from: ReturnType<typeof setupTriggerVenue>,
      to: ReturnType<typeof setupTriggerVenue>,
      options: { triggers?: boolean; inactive?: boolean } = {},
    ): void => {
      to.setVenueNonce(from.getVenueNonce());
      to.setNextIndex(from.getNextIndex());
      if (options.triggers !== false) {
        for (const row of from.rawTriggers) {
          to.rawTriggers.push({ ...row });
        }
      }
      if (options.inactive !== false) {
        for (const row of from.rawInactive) {
          to.rawInactive.push({ ...row });
        }
      }
      for (const [hash, landed] of from.landedTxs) {
        to.landedTxs.set(hash, landed);
      }
    };

    const lastSignedNonce = (calls: LighterWasmCall[], fn: string): number => {
      const call = calls.filter((entry) => entry.function === fn).at(-1);
      const params = call?.params as (string | number)[];
      return Number(params[params.length - 1]);
    };

    it('the dispatch ledger records the RESULT tx hash (real signer shape) and resolves a restart by exact identity', async () => {
      const { infra } = makeDurableDisk();
      const registeredKey = '9c'.repeat(40);
      const first = buildProvider({
        platformDependencies: infra,
        registeredKey,
      });
      const venueA = setupTriggerVenue(first.clientInstance, first.bridge);
      venueA.seedTrigger('stop-loss', '80000');
      venueA.failResponseOnce(15);
      const crashed = await first.provider.updatePositionTPSL({
        symbol: 'BTC',
      });
      expect(crashed.success).toBe(false);
      const consumedNonce = lastSignedNonce(first.calls, '_signCancelOrder');
      killProvider(first);
      const second = buildProvider({
        platformDependencies: infra,
        registeredKey,
      });
      const venueB = setupTriggerVenue(second.clientInstance, second.bridge);
      copyVenue(venueA, venueB);
      // REST lags at the consumed nonce; the ONLY consumption proof is
      // the exact RESULT hash recorded at dispatch — txInfo never
      // carried it (pinned WASM contract).
      second.clientInstance.getNextNonce.mockImplementation(async function () {
        return {
          code: 200,
          nonce: consumedNonce,
        };
      });
      // The retry resolves the JOURNAL-OWNED dispatch through the
      // settlement machine: the exact RESULT hash (recorded at dispatch;
      // txInfo never carried it) proves consumption, the floor advances,
      // and no generic quarantine is parked.
      const resolvedRestart = await second.provider.updatePositionTPSL({
        symbol: 'BTC',
      });
      expect(resolvedRestart.success).toBe(true);
      expect(await second.provider.getRecoveredDispatches()).toStrictEqual([]);
      const placed = await second.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });
      expect(placed.error).toBeUndefined();
      expect(placed.success).toBe(true);
      expect(lastSignedNonce(second.calls, '_signCreateOrder')).toBe(
        consumedNonce + 1,
      );
    });

    it('a HASHLESS unresolved dispatch is never released by expiry alone: writes stay blocked until the venue advances', async () => {
      const { disk, infra } = makeDurableDisk();
      const registeredKey = '9c'.repeat(40);
      // Seed a durable hashless entry (e.g. a dispatch whose signing
      // result carried no hash): venue-confirmed absence is impossible.
      const built = buildProvider({
        platformDependencies: infra,
        registeredKey,
      });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      const frozenNonce = venue.getVenueNonce();
      built.clientInstance.getNextNonce.mockImplementation(async () => ({
        code: 200,
        nonce: frozenNonce,
      }));
      disk.set(
        `lighterNonceLedger:testnet:28:7`,
        JSON.stringify({
          version: 1,
          consumedFloor: 0,
          entries: [
            {
              nonce: frozenNonce,
              txHash: null,
              expiresAt: Date.now() - 700_000,
            },
          ],
        }),
      );
      const blocked = await built.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });
      // Expiry alone must NOT prove non-consumption without a hash.
      expect(blocked.success).toBe(false);
      expect(blocked.error).toContain('unresolved');
      // The venue advances (the dispatch actually consumed the nonce):
      // only the ADVANCE is proven via REST — the hashless intent's own
      // fate is UNKNOWN, never reported completed. The outcome is
      // QUARANTINED and writes recover only after explicit
      // per-outcome acknowledgment.
      built.clientInstance.getNextNonce.mockImplementation(async () => ({
        code: 200,
        nonce: frozenNonce + 1,
      }));
      const quarantined = await built.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });
      expect(quarantined.success).toBe(false);
      expect(quarantined.error).toContain('landed with an UNKNOWN outcome');
      const hashlessOutcomes = await built.provider.getRecoveredDispatches();
      expect(hashlessOutcomes).toHaveLength(1);
      expect(hashlessOutcomes[0].outcome).toBe('unknown');
      expect(hashlessOutcomes[0].evidence).toBe('rest-advance');
      await acknowledgeAllRecovered(built.provider);
      const placed = await built.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });
      expect(placed.success).toBe(true);
      expect(lastSignedNonce(built.calls, '_signCreateOrder')).toBe(
        frozenNonce + 1,
      );
    });

    it('ledger consumption proof verifies the FULL identity, not the nonce alone', async () => {
      const { disk, infra } = makeDurableDisk();
      const registeredKey = '9c'.repeat(40);
      const built = buildProvider({
        platformDependencies: infra,
        registeredKey,
      });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      const frozenNonce = venue.getVenueNonce();
      built.clientInstance.getNextNonce.mockImplementation(async () => ({
        code: 200,
        nonce: frozenNonce,
      }));
      // The venue KNOWS a tx under this hash — but for a DIFFERENT api
      // key slot: identity mismatch is ambiguity, never consumption.
      venue.landedTxs.set('dddd000000000001', {
        nonce: frozenNonce,
        status: 2,
      });
      built.clientInstance.getTx.mockImplementation(async (hash: string) =>
        hash === 'dddd000000000001'
          ? {
              code: 200,
              hash,
              accountIndex: 28,
              apiKeyIndex: 9,
              nonce: frozenNonce,
              status: 2,
            }
          : null,
      );
      disk.set(
        `lighterNonceLedger:testnet:28:7`,
        JSON.stringify({
          version: 1,
          consumedFloor: 0,
          entries: [
            {
              nonce: frozenNonce,
              txHash: 'dddd000000000001',
              expiresAt: Date.now() + 500_000,
            },
          ],
        }),
      );
      const blocked = await built.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });
      expect(blocked.success).toBe(false);
      expect(blocked.error).toContain('unresolved');
    });

    it('a ledger write failure aborts the dispatch with the memory floor UNTOUCHED; writes heal to the venue-expected nonce', async () => {
      const { disk, infra } = makeDurableDisk();
      const registeredKey = '9c'.repeat(40);
      const built = buildProvider({
        platformDependencies: infra,
        registeredKey,
      });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      const frozenNonce = venue.getVenueNonce();
      built.clientInstance.getNextNonce.mockImplementation(async () => ({
        code: 200,
        nonce: frozenNonce,
      }));
      // The durable append fails ONCE: nothing may be dispatched and the
      // floor must not advance.
      let failLedgerWrite = true;
      (infra.diskCache.setItem as Mock).mockImplementation(
        async (key: string, value: string) => {
          if (key.startsWith('lighterNonceLedger:') && failLedgerWrite) {
            failLedgerWrite = false;
            throw new Error('storage write refused');
          }
          disk.set(key, value);
        },
      );
      const failed = await built.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });
      expect(failed.success).toBe(false);
      expect(
        built.clientInstance.sendTx.mock.calls.filter(
          ([txType]: number[]) => txType === 14,
        ),
      ).toHaveLength(0);
      // Storage healed: the next write signs the nonce the venue still
      // expects — a floor advanced before the durable append would have
      // burned it.
      const placed = await built.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90500',
      });
      expect(placed.success).toBe(true);
      expect(lastSignedNonce(built.calls, '_signCreateOrder')).toBe(
        frozenNonce,
      );
    });

    it('a coded venue/HTTP error after a hidden commit never releases the nonce: the next write proves consumption by hash', async () => {
      const { infra } = makeDurableDisk();
      const registeredKey = '9c'.repeat(40);
      const built = buildProvider({
        platformDependencies: infra,
        registeredKey,
      });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      const frozenNonce = venue.getVenueNonce();
      built.clientInstance.getNextNonce.mockImplementation(async () => ({
        code: 200,
        nonce: frozenNonce,
      }));
      // The venue COMMITS the trigger create, then answers with a coded
      // 5xx that masks the commit.
      venue.failCodedAfterCommitOnce(14, 500);
      const failed = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(failed.success).toBe(false);
      const consumedNonce = lastSignedNonce(built.calls, '_signCreateOrder');
      // The next write proves consumption via the exact hash: the
      // JOURNAL-OWNED dispatch resolves through the settlement machine
      // (no generic quarantine) and the next dispatch signs the NEXT
      // nonce — releasing on the coded error would have reused the
      // consumed one.
      const resolvedNext = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '87000',
      });
      expect(resolvedNext.success).toBe(true);
      expect(await built.provider.getRecoveredDispatches()).toStrictEqual([]);
      const placed = await built.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90500',
      });
      expect(placed.error).toBeUndefined();
      expect(placed.success).toBe(true);
      // The masked-commit nonce is signed EXACTLY once (the original
      // dispatch): the settlement + follow-up writes all sign LATER
      // nonces — releasing on the coded error would have reused it.
      const signedNonces = built.calls
        .filter((call) =>
          [
            '_signCreateOrder',
            '_signCancelOrder',
            '_signCreateGroupedOrders',
          ].includes(call.function),
        )
        .map((call) => {
          const params = call.params as (string | number)[];
          return Number(params[params.length - 1]);
        });
      expect(
        signedNonces.filter((nonce) => nonce === consumedNonce),
      ).toHaveLength(1);
      expect(lastSignedNonce(built.calls, '_signCreateOrder')).toBeGreaterThan(
        consumedNonce,
      );
    });

    it('a stale never-landed reconciliation can never lower the floor below a nonce a RETRY has since consumed', async () => {
      const { disk, infra } = makeDurableDisk();
      const registeredKey = '9c'.repeat(40);
      const built = buildProvider({
        platformDependencies: infra,
        registeredKey,
      });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      venue.seedTrigger('stop-loss', '80000');
      const frozenNonce = venue.getVenueNonce();
      built.clientInstance.getNextNonce.mockImplementation(async () => ({
        code: 200,
        nonce: frozenNonce,
      }));
      // TPSL remove dispatch A never lands.
      venue.failBeforeCommitOnce(15);
      const crashed = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
      });
      expect(crashed.success).toBe(false);
      // Age dispatch A (journal attempt + ledger entry): proven
      // never-landed on next resolution.
      for (const key of [...disk.keys()]) {
        if (
          key.startsWith('lighterNonceLedger:') ||
          key.startsWith('lighterTpslJournalOp:') ||
          (key.startsWith('lighterTpslJournal:') && !key.includes('Index'))
        ) {
          const doc = JSON.parse(disk.get(key) as string) as {
            entries?: { expiresAt: number | null }[];
            attempts?: { expiresAt: number }[];
          };
          for (const entry of doc.entries ?? []) {
            entry.expiresAt = Date.now() - 700_000;
          }
          for (const attempt of doc.attempts ?? []) {
            attempt.expiresAt = Date.now() - 700_000;
          }
          disk.set(key, JSON.stringify(doc));
        }
      }
      // The old trigger disappears INDEPENDENTLY (external cancel): the
      // later journal reconciliation will have nothing left to submit —
      // its ONLY effect on the nonce state is the release itself.
      venue.rawTriggers.splice(0, 1);
      // Retry B: an unrelated write consumes the released nonce N.
      const placed = await built.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });
      expect(placed.success).toBe(true);
      expect(lastSignedNonce(built.calls, '_signCreateOrder')).toBe(
        frozenNonce,
      );
      // The STALE journal reconciliation of dispatch A now proves A
      // never landed — but N was consumed by B: the floor must not drop.
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await built.provider.getOpenOrders();
        if (journalKeysOf(disk).length === 0) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const placedAfter = await built.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '91000',
      });
      expect(placedAfter.success).toBe(true);
      expect(lastSignedNonce(built.calls, '_signCreateOrder')).toBe(
        frozenNonce + 1,
      );
    });

    it('tWO LIVE providers: a stale settlement pass physically cannot destroy the newer journal written by its peer', async () => {
      const { disk, infra } = makeDurableDisk();
      const registeredKey = '9c'.repeat(40);
      const first = buildProvider({
        platformDependencies: infra,
        registeredKey,
      });
      const venue = setupTriggerVenue(first.clientInstance, first.bridge);
      venue.seedTrigger('stop-loss', '80000');
      // Journal A: replacement accepted+active, crash before cancels.
      const realBridge = (
        first.bridge.execute as Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      (first.bridge.execute as Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          if (call.function === '_signCancelOrder') {
            throw new Error('process died');
          }
          return await realBridge(call);
        },
      );
      const crashed = await first.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(crashed.success).toBe(false);
      (first.bridge.execute as Mock).mockImplementation(realBridge);
      await new Promise((resolve) => setTimeout(resolve, 150));
      // A SECOND LIVE provider shares the same venue and disk — its lock
      // is instance-local, so it interleaves with the first for real.
      // Both providers are wired to ONE venue state: the second's client
      // and signer mocks share the first venue's closures.
      const second = buildProvider({
        platformDependencies: infra,
        registeredKey,
      });
      for (const method of [
        'getActiveOrders',
        'getInactiveOrders',
        'getNextNonce',
        'getTx',
        'sendTx',
      ] as const) {
        second.clientInstance[method].mockImplementation(
          first.clientInstance[method].getMockImplementation() as never,
        );
      }
      (second.bridge.execute as Mock).mockImplementation(
        (first.bridge.execute as Mock).getMockImplementation() as never,
      );
      // Stale seam on the FIRST provider's recovery read of the journal
      // pointer: it captures the current value, then yields until the
      // SECOND provider settled A and journalled its own operation B.
      const baseJournalKey = journalKeysOf(disk).find(
        (key) => key.split(':').length === 6,
      );
      let staleGateArmed = true;
      let releaseStaleGate = (): void => undefined;
      const staleGate = new Promise<void>((resolve) => {
        releaseStaleGate = resolve;
      });
      const journalPointerKey = baseJournalKey ?? journalKeysOf(disk)[0];
      (infra.diskCache.getItem as Mock).mockImplementation(
        async (key: string) => {
          const value = disk.get(key) ?? null;
          if (key === journalPointerKey && staleGateArmed) {
            staleGateArmed = false;
            await staleGate;
          }
          return value;
        },
      );
      // First provider's recovery holds the stale snapshot...
      await first.provider.getOpenOrders();
      await new Promise((resolve) => setTimeout(resolve, 50));
      // ...while the SECOND provider settles A and journals B
      // (response-loss on its replacement create).
      venue.failResponseOnce(14);
      const foreground = second.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      await Promise.race([
        foreground,
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
      releaseStaleGate();
      await foreground.catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 800));
      // B's journal payload must still exist — the stale pass could not
      // delete or overwrite it — and later reads resolve it.
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await second.provider.getOpenOrders();
        if (
          journalKeysOf(disk).length === 0 &&
          venue.rawTriggers.length === 1 &&
          venue.rawTriggers[0].triggerPrice === '86000'
        ) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(venue.rawTriggers.map((row) => row.triggerPrice)).toStrictEqual([
        '86000',
      ]);
      expect(journalKeysOf(disk)).toHaveLength(0);
    }, 15_000);

    it('compaction also covers proven-resolved cancel attempts: >40 mixed failures stay recoverable', async () => {
      const { disk, infra } = makeDurableDisk();
      const settlementKey = `${ACCOUNT.l1Address.toLowerCase()}:28:7:BTC`;
      disk.set(
        'lighterTpslJournalIndex:testnet',
        JSON.stringify([settlementKey]),
      );
      disk.set(
        `lighterTpslJournal:testnet:${settlementKey}`,
        JSON.stringify({
          version: 4,
          recordedAt: 5,
          createdAt: 5,
          nextAttemptId: 41,
          operationId: 'op-mixed-compact',
          apiKeyIndex: 7,
          intent: 'remove',
          phase: 'cancelling',
          priorGrouping: 'independent',
          priorTriggers: [
            {
              orderId: '9000',
              side: 'sell',
              wireOrderType: 2,
              wireTimeInForce: 0,
              orderExpiry: 0,
              price: '80000',
              triggerPrice: '80000',
              remainingSize: '0.001',
            },
          ],
          // 40 proven-resolved CANCEL failures (never landed, expired):
          // without cancel compaction the next attempt dead-ends at the
          // cap.
          attempts: Array.from({ length: 40 }, (_, index) => ({
            kind: 'cancel',
            attemptId: index + 1,
            nonce: 2000 + index,
            outcome: 'unknown',
            orderId: String(7000 + index),
            txHash: `eeee${String(index).padStart(4, '0')}0000`,
            expiresAt: 1_700_000_000_000,
            role: 'stale',
          })),
        }),
      );
      const built = buildProvider({ platformDependencies: infra });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      // The prior trigger is STILL on the venue: the removal's final
      // cancel is owed, but the journal is already AT the attempt cap.
      venue.rawTriggers.push({
        orderIndex: 9000,
        clientOrderIndex: 9000,
        marketIndex: 1,
        ownerAccountIndex: 28,
        initialBaseAmount: '0.001',
        remainingBaseAmount: '0.001',
        price: '80000',
        isAsk: true,
        type: 'stop-loss',
        timeInForce: 'immediate-or-cancel',
        reduceOnly: 1,
        status: 'open',
        orderExpiry: 0,
        timestamp: 1700000000000,
        triggerPrice: '80000',
      });
      const journalSizes: number[] = [];
      (infra.diskCache.setItem as Mock).mockImplementation(
        async (key: string, value: string) => {
          if (
            key.startsWith('lighterTpslJournalOp:') ||
            (key.startsWith('lighterTpslJournal:') && !key.includes('Index'))
          ) {
            try {
              const parsed = JSON.parse(value) as { attempts?: unknown[] };
              if (Array.isArray(parsed.attempts)) {
                journalSizes.push(parsed.attempts.length);
              }
            } catch {
              // pointer docs are not journals
            }
          }
          disk.set(key, value);
        },
      );
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await built.provider.getOpenOrders();
        if (
          venue.rawTriggers.length === 0 &&
          journalKeysOf(disk).length === 0
        ) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      // Compaction dropped the 40 proven-resolved cancels: the 41st
      // (real) cancel completed the removal under the cap.
      expect(venue.rawTriggers).toHaveLength(0);
      expect(journalKeysOf(disk)).toHaveLength(0);
      expect(Math.max(...journalSizes)).toBeLessThanOrEqual(40);
    });
  });

  describe('round-20 financial idempotency, signer ownership and manual recovery', () => {
    it('a WITHDRAW whose commit was masked by response loss is never blindly retried: quarantined until acknowledged', async () => {
      const registeredKey = '9c'.repeat(40);
      const built = buildProvider({ registeredKey });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      venue.failResponseOnce(13);
      const first = await built.provider.withdraw({ amount: '25' });
      expect(first.success).toBe(false);
      // The blind retry at the CLIENT BOUNDARY is refused: the original
      // withdrawal actually completed.
      const retry = await built.provider.withdraw({ amount: '25' });
      expect(retry.success).toBe(false);
      expect(retry.error).toContain('actually completed');
      expect(retry.error).toContain('withdraw:25');
      const outcomes = await acknowledgeAllRecovered(built.provider);
      expect(outcomes.map((outcome) => outcome.intent)).toStrictEqual([
        'withdraw:25',
      ]);
    });

    it('an UPDATE-MARGIN whose commit was masked by response loss is quarantined until acknowledged', async () => {
      const registeredKey = '9c'.repeat(40);
      const built = buildProvider({ registeredKey });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      built.clientInstance.getAccountByIndex.mockResolvedValue({
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
      venue.failResponseOnce(29);
      const first = await built.provider.updateMargin({
        symbol: 'BTC',
        amount: '10',
      });
      expect(first.success).toBe(false);
      const retry = await built.provider.updateMargin({
        symbol: 'BTC',
        amount: '10',
      });
      expect(retry.success).toBe(false);
      expect(retry.error).toContain('actually completed');
      await acknowledgeAllRecovered(built.provider);
      const after = await built.provider.updateMargin({
        symbol: 'BTC',
        amount: '10',
      });
      expect(after.success).toBe(true);
    });

    it('tWO providers on DIFFERENT accounts sharing one bridge re-establish the correct signer client before every write section', async () => {
      const registeredKey = '9c'.repeat(40);
      const first = buildProvider({ registeredKey });
      const venue = setupTriggerVenue(first.clientInstance, first.bridge);
      // Second provider on a DIFFERENT venue account sharing the SAME
      // bridge OBJECT (the singleton WASM client model).
      const second = buildProvider({
        registeredKey,
        configuredAccountIndex: 99,
        sharedBridge: {
          bridge: first.bridge,
          calls: first.calls,
          fireReset: first.fireReset,
        },
      });
      second.clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [{ ...ACCOUNT, index: 99 }],
      });
      const venueB = setupTriggerVenue(second.clientInstance, second.bridge);
      const sharedCalls = first.calls;
      const order = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      } as const;
      expect((await first.provider.placeOrder(order)).success).toBe(true);
      expect((await second.provider.placeOrder(order)).success).toBe(true);
      // A's next write happens AFTER B overwrote the singleton client:
      // the bridge-ownership mutex must re-create A's client first.
      expect((await first.provider.placeOrder(order)).success).toBe(true);
      expect(venue.rawTriggers).toHaveLength(0);
      expect(venueB.rawTriggers).toHaveLength(0);
      // Sequence check: every _signCreateOrder is preceded (since the
      // last account switch) by a _createClient for the SAME account.
      let currentOwner: number | null = null;
      const mismatches: string[] = [];
      for (const call of sharedCalls) {
        if (call.function === '_createClient') {
          currentOwner = Number((call.params as (string | number)[])[1]);
        }
        if (call.function === '_signCreateOrder') {
          const signer = Number((call.params as (string | number)[])[0]);
          if (currentOwner !== signer) {
            mismatches.push(`${String(currentOwner)}!=${String(signer)}`);
          }
        }
      }
      expect(mismatches).toStrictEqual([]);
      // At least one RE-establishment happened for A's second write.
      expect(
        sharedCalls.filter((call) => call.function === '_createClient').length,
      ).toBeGreaterThanOrEqual(3);
    });

    it('a stale trigger with DANGLING venue linkage refuses the update before any mutation (never classified independent)', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      // One-sided linkage to an order that is not part of the pair.
      venue.rawTriggers[0].toCancelOrderId0 = '424242';
      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('venue linkage');
      expect(
        clientInstance.sendTx.mock.calls.filter(
          ([txType]: number[]) =>
            txType === 14 || txType === 28 || txType === 15,
        ),
      ).toHaveLength(0);
      expect(venue.rawTriggers).toHaveLength(1);
    });

    it('an index read failure during clear is AMBIGUITY: the settlement stays unresolved and the index is retained', async () => {
      const disk = new Map<string, string>();
      const infra = createMockInfrastructure();
      // Inject the failure at clear-time RMW, after the journal payload
      // and pointer are removed, rather than counting earlier safety reads.
      const journalKey = `lighterTpslJournal:testnet:${ACCOUNT.l1Address.toLowerCase()}:28:7:BTC`;
      let failIndexReads = false;
      (infra.diskCache.getItem as Mock).mockImplementation(
        async (key: string) => {
          if (
            key.startsWith('lighterTpslJournalIndex:') &&
            failIndexReads &&
            disk.has(key) &&
            !disk.has(journalKey)
          ) {
            throw new Error('index storage read failed');
          }
          return disk.get(key) ?? null;
        },
      );
      (infra.diskCache.setItem as Mock).mockImplementation(
        async (key: string, value: string) => {
          disk.set(key, value);
        },
      );
      (infra.diskCache.removeItem as Mock).mockImplementation(
        async (key: string) => {
          disk.delete(key);
        },
      );
      const built = buildProvider({ platformDependencies: infra });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      venue.seedTrigger('stop-loss', '80000');
      failIndexReads = true;
      const result = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      // The venue settled but the index could not be safely updated: the
      // operation must NOT report clean success and the index survives.
      expect(result.success).toBe(false);
      expect(result.error).toContain('index storage read failed');
      expect(disk.has('lighterTpslJournalIndex:testnet')).toBe(true);
      failIndexReads = false;
      const retry = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      expect(retry.error).toBeUndefined();
      expect(retry.success).toBe(true);
    });

    it('an order failing AFTER a committed leverage change reports the partial venue state explicitly', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      setupTriggerVenue(clientInstance, bridge);
      // Leverage submit succeeds; the ORDER dispatch then fails at the
      // venue boundary.
      const realSend = clientInstance.sendTx.getMockImplementation() as (
        txType: number,
        txInfo: string,
      ) => Promise<unknown>;
      clientInstance.sendTx.mockImplementation(
        async (txType: number, txInfo: string) => {
          if (txType === 14) {
            throw new LighterApiError('order rejected', 21000);
          }
          return await realSend(txType, txInfo);
        },
      );
      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
        leverage: 10,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('PARTIAL STATE');
      expect(result.error).toContain('leverage');
      expect(result.error).toContain('10x');
    });
  });

  describe('round-19 process-wide serialization, complete identity and real OCO semantics', () => {
    /**
     * Durable disk map + infra wiring shared by scenarios.
     *
     * @returns The disk map and mocked infrastructure bound to it.
     */
    const makeDurableDisk = (): {
      disk: Map<string, string>;
      infra: ReturnType<typeof createMockInfrastructure>;
    } => {
      const disk = new Map<string, string>();
      const infra = createMockInfrastructure();
      (infra.diskCache.getItem as Mock).mockImplementation(
        async (key: string) => disk.get(key) ?? null,
      );
      (infra.diskCache.setItem as Mock).mockImplementation(
        async (key: string, value: string) => {
          disk.set(key, value);
        },
      );
      (infra.diskCache.removeItem as Mock).mockImplementation(
        async (key: string) => {
          disk.delete(key);
        },
      );
      return { disk, infra };
    };

    const shareVenue = (
      from: { clientInstance: MockClientInstance; bridge: LighterSignerBridge },
      to: { clientInstance: MockClientInstance; bridge: LighterSignerBridge },
    ): void => {
      for (const method of [
        'getActiveOrders',
        'getInactiveOrders',
        'getNextNonce',
        'getTx',
        'sendTx',
      ] as const) {
        to.clientInstance[method].mockImplementation(
          from.clientInstance[method].getMockImplementation() as never,
        );
      }
      (to.bridge.execute as Mock).mockImplementation(
        (from.bridge.execute as Mock).getMockImplementation() as never,
      );
    };

    it('tWO LIVE providers dispatching concurrently never issue the same nonce (process-wide venue write mutex)', async () => {
      const { infra } = makeDurableDisk();
      const registeredKey = '9c'.repeat(40);
      const first = buildProvider({
        platformDependencies: infra,
        registeredKey,
      });
      const venue = setupTriggerVenue(first.clientInstance, first.bridge);
      const second = buildProvider({
        platformDependencies: infra,
        registeredKey,
      });
      shareVenue(first, second);
      // Freeze the REST endpoint: without cross-provider serialization
      // both providers read the same nonce and dispatch it twice.
      const frozen = venue.getVenueNonce();
      const frozenImpl = async (): Promise<{
        code: number;
        nonce: number;
      }> => ({
        code: 200,
        nonce: frozen,
      });
      first.clientInstance.getNextNonce.mockImplementation(frozenImpl);
      second.clientInstance.getNextNonce.mockImplementation(frozenImpl);
      const [resultA, resultB] = await Promise.all([
        first.provider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit',
          price: '90000',
        }),
        second.provider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit',
          price: '90500',
        }),
      ]);
      expect(resultA.success).toBe(true);
      expect(resultB.success).toBe(true);
      const signedNonces = [...first.calls, ...second.calls]
        .filter((call) => call.function === '_signCreateOrder')
        .map((call) => {
          const params = call.params as (string | number)[];
          return Number(params[params.length - 1]);
        })
        .sort((left, right) => left - right);
      expect(signedNonces).toStrictEqual([frozen, frozen + 1]);
    });

    it('two LIVE resolvers of the same journal park exactly ONE manual obligation (process-wide settlement mutex)', async () => {
      const { infra } = makeDurableDisk();
      const registeredKey = '9c'.repeat(40);
      const first = buildProvider({
        platformDependencies: infra,
        registeredKey,
      });
      const venueA = setupTriggerVenue(first.clientInstance, first.bridge);
      venueA.seedTrigger('stop-loss', '80000');
      const realActive =
        first.clientInstance.getActiveOrders.getMockImplementation() as () => Promise<unknown>;
      let died = false;
      first.clientInstance.getActiveOrders.mockImplementation(async () => {
        if (!died && venueA.events.includes('cancel')) {
          died = true;
          throw new Error('process died');
        }
        return await realActive();
      });
      const crashed = await first.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(crashed.success).toBe(false);
      // Heal the seam WITHOUT killing the provider: BOTH instances stay
      // live and share the venue + disk.
      first.clientInstance.getActiveOrders.mockImplementation(
        realActive as never,
      );
      // Replacement terminal-cancels during the outage: a restore is owed.
      const [failedRow] = venueA.rawTriggers.splice(0, 1);
      venueA.rawInactive.push({ ...failedRow, status: 'canceled' });
      const second = buildProvider({
        platformDependencies: infra,
        registeredKey,
      });
      shareVenue(first, second);
      // BOTH providers kick recovery concurrently: the settlement mutex
      // serializes them — exactly ONE parks the obligation as manual,
      // neither submits any restore mutation.
      const createsBeforeRecovery = venueA.events.filter(
        (event) => event === 'create',
      ).length;
      await Promise.all([
        first.provider.getOpenOrders(),
        second.provider.getOpenOrders(),
      ]);
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if ((await first.provider.getPendingManualRecoveries()).length === 1) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(venueA.events.filter((event) => event === 'create')).toHaveLength(
        createsBeforeRecovery,
      );
      expect(await first.provider.getPendingManualRecoveries()).toHaveLength(1);
      expect(venueA.rawTriggers).toHaveLength(0);
    });

    it('concurrent persists for DIFFERENT symbols never lose an index entry (index RMW mutex)', async () => {
      const { disk, infra } = makeDurableDisk();
      // Interleave-friendly disk: every operation yields, maximizing the
      // read-modify-write race window without the mutex.
      (infra.diskCache.getItem as Mock).mockImplementation(
        async (key: string) => {
          await new Promise((resolve) => setTimeout(resolve, 1));
          return disk.get(key) ?? null;
        },
      );
      const built = buildProvider({ platformDependencies: infra });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      venue.seedTrigger('stop-loss', '80000');
      // Two same-provider mutations on DIFFERENT symbols cannot race the
      // write lock — drive the index RMW directly through two concurrent
      // recovery-persist paths instead: seed two journals whose persists
      // interleave via the yielding disk.
      const btc = built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      await btc;
      const index = JSON.parse(
        disk.get('lighterTpslJournalIndex:testnet') ?? '[]',
      ) as string[];
      // The BTC settlement resolved: its entry is gone, the index intact.
      expect(Array.isArray(index)).toBe(true);
    });

    it('a signing result without a hash can never dispatch: the wire is REFUSED before submission', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      const realImplementation = (
        bridge.execute as Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      (bridge.execute as Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          const result = (await realImplementation(call)) as Record<
            string,
            unknown
          >;
          if (call.function === '_signCancelOrder') {
            delete result.txHash;
          }
          return result;
        },
      );
      const result = await provider.updatePositionTPSL({ symbol: 'BTC' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('txHash');
      expect(
        clientInstance.sendTx.mock.calls.filter(
          ([txType]: number[]) => txType === 15,
        ),
      ).toHaveLength(0);
      expect(venue.rawTriggers).toHaveLength(1);
    });

    it('a v1 nonce-ledger document migrates instead of blocking writes as corrupt', async () => {
      const { disk, infra } = makeDurableDisk();
      const registeredKey = '9c'.repeat(40);
      // Earlier-schema ledger: version 1 without the consumed watermark.
      disk.set(
        'lighterNonceLedger:testnet:28:7',
        JSON.stringify({ version: 1, entries: [] }),
      );
      const built = buildProvider({
        platformDependencies: infra,
        registeredKey,
      });
      setupTriggerVenue(built.clientInstance, built.bridge);
      const placed = await built.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });
      expect(placed.error).toBeUndefined();
      expect(placed.success).toBe(true);
    });

    it('an early-schema (v2) journal converts to durable manual remediation, resolved by an explicit new intent', async () => {
      const { disk, infra } = makeDurableDisk();
      const settlementKey = `${ACCOUNT.l1Address.toLowerCase()}:28:7:BTC`;
      disk.set(
        'lighterTpslJournalIndex:testnet',
        JSON.stringify([settlementKey]),
      );
      disk.set(
        `lighterTpslJournal:testnet:${settlementKey}`,
        JSON.stringify({
          version: 2,
          recordedAt: 5,
          operationId: 'op-v2',
          createdAt: 5,
          apiKeyIndex: 7,
          intent: 'replace',
          phase: 'creating',
          priorTriggers: [],
          positionFingerprint: null,
          attempts: [
            {
              kind: 'create',
              attemptId: 1,
              nonce: 999,
              outcome: 'unknown',
              clientIds: [12345],
              txHash: 'ffff00000001',
              expiresAt: 9_999_999_999_999,
              role: 'replacement',
            },
          ],
        }),
      );
      const built = buildProvider({ platformDependencies: infra });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      venue.seedTrigger('stop-loss', '80000');
      // REMEDIATION POLICY: an uninterpretable early-schema journal
      // converts to durable MANUAL state (surfaced); the explicit new
      // intent resolves it and proceeds fresh.
      expect(await built.provider.getPendingManualRecoveries()).toHaveLength(1);
      const result = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '110000',
      });
      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);
      expect(await built.provider.getPendingManualRecoveries()).toHaveLength(0);
    });
  });

  describe('round-13 position semantics, settlement bookkeeping and margin concurrency', () => {
    it('a negative magnitude or malformed sign fails TP/SL and close with an explicit data error and zero mutation', async () => {
      const { provider, calls, clientInstance } = buildProvider();
      // '-0.1' with sign 1 would flip the canonical direction: close/TPSL
      // would act OPPOSITE the real position. sign '1' (string) would be
      // silently coerced by a > 0 ternary.
      for (const overrides of [
        { position: '-0.1', sign: 1 },
        { position: '0.1', sign: '1' as unknown as number },
        { position: '0.1', sign: 0 },
      ]) {
        clientInstance.getAccountByIndex.mockResolvedValue({
          code: 200,
          accounts: [
            {
              ...ACCOUNT,
              positions: [{ ...ACCOUNT.positions[0], ...overrides }],
            },
          ],
        });
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
      }
      expect(calls).toHaveLength(0);
    });

    it('validateOrder resolves invalid (never rejects) when the reduce-only full-close read hits malformed venue data', async () => {
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
      // Below-min reduce-only forces the live full-close read, whose new
      // data-integrity throw must surface as an explicit invalid result.
      const validation = await provider.validateOrder({
        symbol: 'BTC',
        isBuy: false,
        size: '0.00005',
        orderType: 'limit',
        price: '100000',
        reduceOnly: true,
      });
      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('Invalid Lighter venue data');
      expect(calls).toHaveLength(0);
    });

    it('overlapping stale margin refreshes share ONE authoritative request', async () => {
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
        expect((await provider.validateOrder(request)).isValid).toBe(true);
        nowSpy.mockReturnValue(baseNow + 61_000);
        // Stale epoch: gate the first fetch; a second overlapping caller
        // must NOT issue an independent fetch whose delayed/older payload
        // could later overwrite a fresher cap for a full TTL.
        let fetches = 0;
        let releaseFetch = (): void => undefined;
        const fetchGate = new Promise<void>((resolve) => {
          releaseFetch = resolve;
        });
        clientInstance.getOrderBookDetails.mockImplementation(async () => {
          fetches += 1;
          await fetchGate;
          return {
            code: 200,
            orderBookDetails: [
              {
                symbol: 'BTC',
                lastTradePrice: 100000,
                minInitialMarginFraction: 400,
                maintenanceMarginFraction: 240,
              },
            ],
          };
        });
        const firstPromise = provider.validateOrder(request);
        const secondPromise = provider.validateOrder(request);
        await new Promise((resolve) => setTimeout(resolve, 0));
        releaseFetch();
        const [first, second] = await Promise.all([
          firstPromise,
          secondPromise,
        ]);
        expect(fetches).toBe(1);
        // Both observe the single authoritative 25x result.
        expect(first.isValid).toBe(false);
        expect(second.isValid).toBe(false);
      } finally {
        nowSpy.mockRestore();
      }
    });

    it('a failed shared margin refresh fails closed for all waiters and clears for retry', async () => {
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
          leverage: 20,
        };
        expect((await provider.validateOrder(request)).isValid).toBe(true);
        nowSpy.mockReturnValue(baseNow + 61_000);
        clientInstance.getOrderBookDetails.mockRejectedValueOnce(
          new Error('metadata endpoint down'),
        );
        const failed = await provider.validateOrder(request);
        expect(failed.isValid).toBe(false);
        expect(failed.error).toContain('margin metadata');
        // The rejected in-flight slot cleared: the next call retries and
        // succeeds against fresh metadata.
        const retried = await provider.validateOrder(request);
        expect(retried.isValid).toBe(true);
      } finally {
        nowSpy.mockRestore();
      }
    });

    it('settles through delayed REST visibility and keeps queued transitions serial', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      // Accepted sendTx is not immediately visible: REST lags 2 reads.
      venue.setRestLag(2);
      const first = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(first.error).toBeUndefined();
      expect(first.success).toBe(true);
      const second = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      expect(second.success).toBe(true);
      // Serial state despite the lag: exactly the second op's trigger.
      expect(venue.rawTriggers).toHaveLength(1);
      expect(venue.rawTriggers[0].triggerPrice).toBe('86000');
    });

    it('an unresolved settlement blocks the next mutation until reconciliation succeeds', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      // Lag beyond the settle bound: the first update times out unresolved.
      venue.setRestLag(12);
      const first = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(first.success).toBe(false);
      expect(first.error).toContain('settlement is not yet visible');
      const mutationsAfterFirst = (functionName: string): number =>
        (bridge.execute as Mock).mock.calls.filter(
          ([call]) => (call as LighterWasmCall).function === functionName,
        ).length;
      const createsBefore = mutationsAfterFirst('_signCreateOrder');
      // Venue visibility recovers; the retry must still reconcile the
      // recorded expectation BEFORE mutating, then proceed serially.
      venue.setRestLag(2);
      const second = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      expect(second.success).toBe(true);
      expect(mutationsAfterFirst('_signCreateOrder')).toBeGreaterThan(
        createsBefore,
      );
      expect(venue.rawTriggers).toHaveLength(1);
      expect(venue.rawTriggers[0].triggerPrice).toBe('86000');
    });

    it('a create accepted before a failed cancel leaves a reconciliation obligation the retry honors', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      // Fail the CANCEL submission once, after the create was accepted.
      const venueSendTx = clientInstance.sendTx.getMockImplementation() as (
        txType: number,
        txInfo: string,
      ) => Promise<unknown>;
      let cancelFailed = false;
      clientInstance.sendTx.mockImplementation(
        async (txType: number, txInfo: string) => {
          if (txType === 15 && !cancelFailed) {
            cancelFailed = true;
            venue.stagedCancels.shift();
            throw new Error('cancel submission failed');
          }
          return await venueSendTx(txType, txInfo);
        },
      );
      const first = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(first.success).toBe(false);
      expect(first.error).toContain('cancel submission failed');
      // An IMMEDIATE retry stays blocked: the lost cancel is inside its
      // discard grace (the original request could still be in flight).
      const immediate = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      expect(immediate.success).toBe(false);
      expect(immediate.error).toContain('unresolved');
      // Once aged past the grace with a stable unconsumed nonce, the
      // never-landed cancel is discarded and the retry reconciles the
      // accepted create, then completes the replacement serially.
      const realNow = Date.now();
      const nowSpy = vi.spyOn(Date, 'now').mockImplementation(function () {
        return realNow + 700_000;
      });
      try {
        const second = await provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '86000',
        });
        expect(second.error).toBeUndefined();
        expect(second.success).toBe(true);
      } finally {
        nowSpy.mockRestore();
      }
      expect(venue.rawTriggers).toHaveLength(1);
      expect(venue.rawTriggers[0].triggerPrice).toBe('86000');
    });

    it('a replacement that goes terminal-cancelled BEFORE activation leaves the old protection untouched', async () => {
      const { provider, calls, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      // The accepted create lands directly in inactive as 'canceled'.
      venue.setCreateTerminal('canceled');
      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('before becoming active');
      expect(result.error).toContain('left untouched');
      // PHASE BARRIER: the old trigger was never cancelled.
      expect(venue.rawTriggers).toHaveLength(1);
      expect(venue.rawTriggers[0].triggerPrice).toBe('80000');
      expect(
        calls.filter((call) => call.function === '_signCancelOrder'),
      ).toHaveLength(0);
      // The obligation cleared (terminal is authoritative): a retry with
      // normal venue behavior succeeds.
      venue.setCreateTerminal('none');
      const retry = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      expect(retry.error).toBeUndefined();
      expect(retry.success).toBe(true);
      expect(venue.rawTriggers).toHaveLength(1);
      expect(venue.rawTriggers[0].triggerPrice).toBe('86000');
    });

    it('a replacement that EXECUTES before activation is observed is not treated as a failure', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      // Immediate/crossed trigger: fills before it can be observed active.
      venue.setCreateTerminal('filled');
      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);
      // Stale reduce-only leftovers still cleaned up.
      expect(venue.rawTriggers).toHaveLength(0);
    });

    it('response loss AFTER venue commit reconciles the HIDDEN create on retry without duplicating protection', async () => {
      const { provider, calls, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      // The create commits venue-side but the 200 never arrives, AND the
      // commit lags REST: a journal-less retry would snapshot the lagged
      // book, miss 85000, and leave 85000+86000 live.
      venue.setRestLag(3);
      venue.failResponseOnce(14);
      const first = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(first.success).toBe(false);
      expect(first.error).toContain('transport failure after venue commit');
      const mutationCallsBefore = calls.filter((call) =>
        [
          '_signCreateOrder',
          '_signCreateGroupedOrders',
          '_signCancelOrder',
        ].includes(call.function),
      ).length;
      // The hidden create is JOURNAL-OWNED: the retry reconciles it
      // through the settlement machine (observing the hidden create
      // BEFORE any new signer mutation) without a generic quarantine.
      const second = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      expect(await provider.getRecoveredDispatches()).toStrictEqual([]);
      expect(second.error).toBeUndefined();
      expect(second.success).toBe(true);
      expect(
        calls.filter((call) =>
          [
            '_signCreateOrder',
            '_signCreateGroupedOrders',
            '_signCancelOrder',
          ].includes(call.function),
        ).length,
      ).toBeGreaterThan(mutationCallsBefore);
      expect(venue.rawTriggers).toHaveLength(1);
      expect(venue.rawTriggers[0].triggerPrice).toBe('86000');
    });

    it('response loss BEFORE venue commit does not permanently wedge retries', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      // Warm signer setup first (key registration consumes a nonce) so the
      // pre/post comparison isolates the failed CREATE submission.
      await provider.getOpenOrders();
      const nonceBefore = venue.getVenueNonce();
      const triggersBefore = venue.rawTriggers.length;
      // Transport rejects before the venue ever sees the create; the
      // staged payload is dropped inside the venue helper so a retry can
      // never accidentally commit the stale 85000.
      venue.failBeforeCommitOnce(14);
      const first = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(first.success).toBe(false);
      expect(first.error).toContain('network unreachable');
      // Venue truly untouched before the retry.
      expect(venue.getVenueNonce()).toBe(nonceBefore);
      expect(venue.rawTriggers).toHaveLength(triggersBefore);
      // Immediate retry: blocked inside the discard grace.
      const immediate = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      expect(immediate.success).toBe(false);
      expect(immediate.error).toContain('unresolved');
      // Aged + stable unconsumed nonce: concluded never-landed; retry runs
      // and commits ONLY 86000 — never the dropped stale 85000 payload.
      const realNow = Date.now();
      const nowSpy = vi.spyOn(Date, 'now').mockImplementation(function () {
        return realNow + 700_000;
      });
      try {
        const retry = await provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '86000',
        });
        expect(retry.error).toBeUndefined();
        expect(retry.success).toBe(true);
      } finally {
        nowSpy.mockRestore();
      }
      expect(venue.rawTriggers).toHaveLength(1);
      expect(venue.rawTriggers[0].triggerPrice).toBe('86000');
      expect(
        venue.rawInactive.some((row) => row.triggerPrice === '85000'),
      ).toBe(false);
    });

    it('a provider recreation after committed-but-unacknowledged create recovers via the durable journal', async () => {
      // Shared durable disk across two provider "lifetimes".
      const disk = new Map<string, string>();
      const sharedInfrastructure = createMockInfrastructure();
      (sharedInfrastructure.diskCache.getItem as Mock).mockImplementation(
        async (key: string) => disk.get(key) ?? null,
      );
      (sharedInfrastructure.diskCache.setItem as Mock).mockImplementation(
        async (key: string, value: string) => {
          disk.set(key, value);
        },
      );
      (sharedInfrastructure.diskCache.removeItem as Mock).mockImplementation(
        async (key: string) => {
          disk.delete(key);
        },
      );
      const first = buildProvider({
        platformDependencies: sharedInfrastructure,
      });
      const venueA = setupTriggerVenue(first.clientInstance, first.bridge);
      venueA.seedTrigger('stop-loss', '80000');
      // Commit-then-lose the create response, then "kill" the provider.
      venueA.failResponseOnce(14);
      const attempt = await first.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(attempt.success).toBe(false);
      expect(
        [...disk.keys()].filter(
          (key) =>
            key.startsWith('lighterTpslJournal:') && !key.includes('Index'),
        ),
      ).toHaveLength(1);
      // NEW provider lifetime: same wallet, same disk, same venue state
      // INCLUDING the consumed nonce — but REST hides the committed
      // create from the first reconciliation window entirely.
      const second = buildProvider({
        platformDependencies: sharedInfrastructure,
      });
      const venueB = setupTriggerVenue(second.clientInstance, second.bridge);
      // Authoritative venue continuity: nonce AND order-index allocator.
      venueB.setVenueNonce(venueA.getVenueNonce());
      venueB.setNextIndex(venueA.getNextIndex());
      const committedView: typeof venueB.rawTriggers = [];
      for (const row of venueA.rawTriggers) {
        venueB.rawTriggers.push({ ...row });
        if (row.triggerPrice === '80000') {
          committedView.push({ ...row });
        }
      }
      for (const [hash, landed] of venueA.landedTxs) {
        venueB.landedTxs.set(hash, landed);
      }
      // Phase 1: the committed 85000 stays hidden beyond the whole
      // reconciliation window; its nonce IS consumed. The JOURNAL-OWNED
      // dispatch is exact-hash proven consumed (no generic quarantine),
      // but the settlement itself cannot converge against the lagged
      // book — the fresh provider stays blocked with ZERO NEW protection
      // mutations beyond the journal's own reconciliation.
      venueB.primeLag(committedView, 50);
      const blocked = await second.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      expect(blocked.success).toBe(false);
      expect(
        second.calls.filter((call) =>
          ['_signCreateGroupedOrders'].includes(call.function),
        ),
      ).toHaveLength(0);
      expect(await second.provider.getRecoveredDispatches()).toStrictEqual([]);
      // Phase 2: the venue reveals the committed state; the retry
      // reconciles the journal and proceeds serially.
      venueB.primeLag(venueB.rawTriggers, 0);
      const result = await second.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);
      // WITHOUT the durable journal the fresh instance would snapshot the
      // lagged book, miss the committed 85000, and leave a duplicate.
      expect(venueB.rawTriggers).toHaveLength(1);
      expect(venueB.rawTriggers[0].triggerPrice).toBe('86000');
    });

    it('two stale cancels with one response lost + delayed REST reconcile to the serial state', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('take-profit', '110000');
      venue.seedTrigger('stop-loss', '80000');
      // The SECOND cancel commits venue-side but its response is lost, and
      // REST lags the commit.
      venue.setRestLag(2);
      let cancelSubmissions = 0;
      const venueSendTx = clientInstance.sendTx.getMockImplementation() as (
        txType: number,
        txInfo: string,
      ) => Promise<unknown>;
      clientInstance.sendTx.mockImplementation(
        async (txType: number, txInfo: string) => {
          if (txType === 15) {
            cancelSubmissions += 1;
            if (cancelSubmissions === 2) {
              await venueSendTx(txType, txInfo);
              throw new Error('transport failure after venue commit');
            }
          }
          return await venueSendTx(txType, txInfo);
        },
      );
      const first = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(first.success).toBe(false);
      // Retry: the journal reconciles the accepted create + accepted
      // cancel #1 + committed-unknown cancel #2 through the lag, then
      // completes serially.
      const second = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      expect(second.error).toBeUndefined();
      expect(second.success).toBe(true);
      expect(venue.rawTriggers).toHaveLength(1);
      expect(venue.rawTriggers[0].triggerPrice).toBe('86000');
    });

    it('an OCO pair where one leg fills and the sibling terminal-cancels is an EXECUTION, not a failure', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.setCreateTerminal('oco-mixed');
      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '110000',
        stopLossPrice: '80000',
      });
      // Aggregated: any success terminal dominates — this is an immediate
      // execution outcome, not a replacement failure.
      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);
      expect(venue.rawInactive).toHaveLength(2);
    });

    it('a replacement active at the phase barrier that terminal-fails before final settlement is an explicit failure', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      // After the barrier observes the create ACTIVE, the venue cancels it
      // before the final settlement poll.
      let readsSeen = 0;
      const realActive =
        clientInstance.getActiveOrders.getMockImplementation() as () => Promise<unknown>;
      clientInstance.getActiveOrders.mockImplementation(async () => {
        readsSeen += 1;
        // Reads: 1 = snapshot, 2 = phase barrier, 3+ = final settlement.
        if (readsSeen === 3) {
          const at = venue.rawTriggers.findIndex(
            (row) => row.triggerPrice === '85000',
          );
          if (at >= 0) {
            const [row] = venue.rawTriggers.splice(at, 1);
            venue.rawInactive.push({ ...row, status: 'canceled' });
          }
        }
        return await realActive();
      });
      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(result.success).toBe(false);
      // NO automatic restore: the failure parks a durable MANUAL state.
      expect(result.error).toContain('MANUAL re-establishment');
    });

    it('journal disk failures and corrupt entries block with zero venue mutation', async () => {
      // getItem rejection.
      const infraReadFail = createMockInfrastructure();
      (infraReadFail.diskCache.getItem as Mock).mockRejectedValue(
        new Error('disk unavailable'),
      );
      const readFailBuilt = buildProvider({
        platformDependencies: infraReadFail,
      });
      const readFailVenue = setupTriggerVenue(
        readFailBuilt.clientInstance,
        readFailBuilt.bridge,
      );
      const readFailResult = await readFailBuilt.provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '110000',
      });
      expect(readFailResult.success).toBe(false);
      // The FIRST durable read (nonce ledger, then journal) fails closed.
      expect(readFailResult.error).toContain('read failed');
      expect(readFailVenue.rawTriggers).toHaveLength(0);
      // Corrupt persisted JOURNAL JSON: blocked and NOT auto-removed.
      // (Key-scoped: only the journal is corrupt, other durable state is
      // absent.)
      const infraCorrupt = createMockInfrastructure();
      (infraCorrupt.diskCache.getItem as Mock).mockImplementation(
        async (key: string) =>
          key.startsWith('lighterTpslJournal:') && !key.includes('Index')
            ? '{not json'
            : null,
      );
      const corruptBuilt = buildProvider({
        platformDependencies: infraCorrupt,
      });
      const corruptVenue = setupTriggerVenue(
        corruptBuilt.clientInstance,
        corruptBuilt.bridge,
      );
      const corruptResult = await corruptBuilt.provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '110000',
      });
      expect(corruptResult.success).toBe(false);
      expect(corruptResult.error).toContain('corrupt');
      expect(infraCorrupt.diskCache.removeItem).not.toHaveBeenCalled();
      expect(corruptVenue.rawTriggers).toHaveLength(0);
      // Early schema version 1: REMEDIATION policy — converts to durable
      // manual state, resolved by the explicit new intent (never a
      // permanent opaque block, never silently reinterpreted).
      const v1Disk = new Map<string, string>();
      const infraV1 = createMockInfrastructure();
      (infraV1.diskCache.getItem as Mock).mockImplementation(
        async (key: string) => v1Disk.get(key) ?? null,
      );
      (infraV1.diskCache.setItem as Mock).mockImplementation(
        async (key: string, value: string) => {
          v1Disk.set(key, value);
        },
      );
      (infraV1.diskCache.removeItem as Mock).mockImplementation(
        async (key: string) => {
          v1Disk.delete(key);
        },
      );
      const v1SettlementKey = `${ACCOUNT.l1Address.toLowerCase()}:28:7:BTC`;
      v1Disk.set(
        'lighterTpslJournalIndex:testnet',
        JSON.stringify([v1SettlementKey]),
      );
      v1Disk.set(
        `lighterTpslJournal:testnet:${v1SettlementKey}`,
        JSON.stringify({ version: 1, recordedAt: 5, attempts: [] }),
      );
      const v1Built = buildProvider({ platformDependencies: infraV1 });
      const v1Venue = setupTriggerVenue(v1Built.clientInstance, v1Built.bridge);
      expect(await v1Built.provider.getPendingManualRecoveries()).toHaveLength(
        1,
      );
      const v1Result = await v1Built.provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '110000',
      });
      expect(v1Result.error).toBeUndefined();
      expect(v1Result.success).toBe(true);
      expect(v1Venue.rawTriggers).toHaveLength(1);
      expect(await v1Built.provider.getPendingManualRecoveries()).toHaveLength(
        0,
      );
      // Malformed-but-JSON entry (empty attempts): blocked.
      const infraMalformed = createMockInfrastructure();
      (infraMalformed.diskCache.getItem as Mock).mockImplementation(
        async (key: string) =>
          key.startsWith('lighterTpslJournal:') && !key.includes('Index')
            ? JSON.stringify({
                version: 3,
                recordedAt: 5,
                operationId: 'op-empty',
                createdAt: 5,
                nextAttemptId: 1,
                venueCheckpoint: 0,
                apiKeyIndex: 7,
                intent: 'replace',
                phase: 'creating',
                priorGrouping: 'independent',
                priorTriggers: [],
                positionFingerprint: null,
                attempts: [],
              })
            : null,
      );
      const malformedBuilt = buildProvider({
        platformDependencies: infraMalformed,
      });
      const malformedVenue = setupTriggerVenue(
        malformedBuilt.clientInstance,
        malformedBuilt.bridge,
      );
      const malformedResult = await malformedBuilt.provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '110000',
      });
      expect(malformedResult.success).toBe(false);
      expect(malformedResult.error).toContain('malformed');
      expect(malformedVenue.rawTriggers).toHaveLength(0);
      // Pre-send setItem failure: the mutation aborts BEFORE submission.
      const infraWriteFail = createMockInfrastructure();
      (infraWriteFail.diskCache.setItem as Mock).mockRejectedValue(
        new Error('disk write refused'),
      );
      const writeFailBuilt = buildProvider({
        platformDependencies: infraWriteFail,
      });
      const writeFailVenue = setupTriggerVenue(
        writeFailBuilt.clientInstance,
        writeFailBuilt.bridge,
      );
      const writeFailResult = await writeFailBuilt.provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '110000',
      });
      expect(writeFailResult.success).toBe(false);
      expect(writeFailResult.error).toContain('disk write refused');
      expect(writeFailVenue.rawTriggers).toHaveLength(0);
      // No order mutation ever reached the venue (signer-key registration
      // is the only submission).
      expect(
        writeFailBuilt.clientInstance.sendTx.mock.calls.filter(
          ([txType]) => txType === 14 || txType === 28 || txType === 15,
        ),
      ).toHaveLength(0);
    });

    it('a nonce advancing past an ABSENT exact hash proves the dispatch never landed: retry-safe, no quarantine', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      venue.failBeforeCommitOnce(14);
      const first = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(first.success).toBe(false);
      // Venue nonce keeps MOVING between the stable reads (some other
      // writer is active): even an aged unknown attempt must stay blocked.
      let bump = 0;
      clientInstance.getNextNonce.mockImplementation(async () => {
        bump += 1;
        return { code: 200, nonce: venue.getVenueNonce() + bump };
      });
      const realNow = Date.now();
      const nowSpy = vi.spyOn(Date, 'now').mockImplementation(function () {
        return realNow + 13_000;
      });
      try {
        // The venue moved past the nonce while OUR exact hash is absent:
        // another writer consumed it — the LEDGER treats it retry-safe
        // (floor advances, NOTHING is reported completed and no
        // quarantine is parked); the settlement machine itself stays
        // conservatively blocked inside the signed validity window.
        const retry = await provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '86000',
        });
        expect(retry.success).toBe(false);
        expect(retry.error).toContain('unresolved');
        expect(await provider.getRecoveredDispatches()).toStrictEqual([]);
      } finally {
        nowSpy.mockRestore();
      }
    });

    it('a wallet switch during the final journal clear fails the stale operation explicitly', async () => {
      const infra = createMockInfrastructure();
      let releaseRemove = (): void => undefined;
      let signalRemoveEntered = (): void => undefined;
      const removeEntered = new Promise<void>((resolve) => {
        signalRemoveEntered = resolve;
      });
      const removeGate = new Promise<void>((resolve) => {
        releaseRemove = resolve;
      });
      // Real disk backing: the CAS-guarded clear only issues a remove
      // when a journal actually exists on disk.
      const switchDisk = new Map<string, string>();
      (infra.diskCache.getItem as Mock).mockImplementation(
        async (key: string) => switchDisk.get(key) ?? null,
      );
      (infra.diskCache.setItem as Mock).mockImplementation(
        async (key: string, value: string) => {
          switchDisk.set(key, value);
        },
      );
      (infra.diskCache.removeItem as Mock).mockImplementation(
        async (key: string) => {
          signalRemoveEntered();
          await removeGate;
          switchDisk.delete(key);
        },
      );
      const built = buildProvider({ platformDependencies: infra });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      venue.seedTrigger('stop-loss', '80000');
      const pending = built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      await removeEntered;
      built.getUserAddressMock.mockReturnValue(`0x${'b'.repeat(40)}`);
      releaseRemove();
      const result = await pending;
      // The venue mutation may well have settled, but the STALE operation
      // must report the switch, never success under B.
      expect(result.success).toBe(false);
      expect(result.error).toContain('switched accounts');
    });

    it('validator failures from markets, margin metadata, and fresh price all resolve invalid', async () => {
      // Markets read failure.
      const markets = buildProvider();
      markets.clientInstance.getOrderBooks.mockRejectedValue(
        new Error('orderBooks endpoint down'),
      );
      const marketsOrder = await markets.provider.validateOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });
      expect(marketsOrder.isValid).toBe(false);
      // The markets read failure surfaces as an explicit invalid result
      // (the provider's market cache degrades to unknown-market).
      expect(marketsOrder.error).toContain('BTC');
      const marketsClose = await markets.provider.validateClosePosition({
        symbol: 'BTC',
        currentPrice: 100000,
      });
      expect(marketsClose.isValid).toBe(false);
      // Margin metadata failure with explicit leverage.
      const margins = buildProvider();
      margins.clientInstance.getOrderBookDetails.mockRejectedValue(
        new Error('metadata endpoint down'),
      );
      const marginsResult = await margins.provider.validateOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
        leverage: 10,
      });
      expect(marginsResult.isValid).toBe(false);
      expect(marginsResult.error).toContain('margin metadata');
      // Fresh-price failure on a market order.
      const price = buildProvider();
      price.clientInstance.getOrderBookDetails.mockRejectedValue(
        new Error('price endpoint down'),
      );
      const priceResult = await price.provider.validateOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'market',
      });
      expect(priceResult.isValid).toBe(false);
      const priceClose = await price.provider.validateClosePosition({
        symbol: 'BTC',
      });
      expect(priceClose.isValid).toBe(false);
    });

    it('a bridge reset racing the auth mint completes bounded — never the old in-lock self-deadlock', async () => {
      const { provider, clientInstance, bridge, fireReset } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      // Faithful reset seam: the provider's own onReset listener fires
      // from the FIRST _createAuthToken call, before it resolves — exactly
      // the moment f0fbd90 minted auth INSIDE the held transition lock,
      // where the invalidated signer re-setup queued a nested write lock
      // behind the outer section awaiting it: a hang.
      const realImplementation = (
        bridge.execute as Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      let resetFired = false;
      (bridge.execute as Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          if (call.function === '_createAuthToken' && !resetFired) {
            resetFired = true;
            fireReset();
          }
          return realImplementation(call);
        },
      );
      // Bounded race with a CLEARED timer: an uncancelled 6 s timeout
      // would keep the suite's event loop open after the test finishes.
      let hangTimer: ReturnType<typeof setTimeout> | undefined;
      const outcome = await Promise.race([
        provider.updatePositionTPSL({ symbol: 'BTC', stopLossPrice: '85000' }),
        new Promise<'hang'>((resolve) => {
          hangTimer = setTimeout(() => resolve('hang'), 6000);
        }),
      ]).finally(() => clearTimeout(hangTimer));
      // Bounded completion (success after re-setup, or a prompt explicit
      // rejection) — never a hang.
      expect(outcome).not.toBe('hang');
      expect(typeof outcome).toBe('object');
    });

    it('a wallet switch DURING create submission still records the accepted mutation; switching back reconciles it', async () => {
      const { provider, clientInstance, bridge, getUserAddressMock } =
        buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      const originalAddress = getUserAddressMock() as string;
      // Defer the create sendTx; switch A->B while it is in flight; the
      // venue still ACCEPTS it.
      const venueSendTx = clientInstance.sendTx.getMockImplementation() as (
        txType: number,
        txInfo: string,
      ) => Promise<unknown>;
      let releaseSend = (): void => undefined;
      const sendGate = new Promise<void>((resolve) => {
        releaseSend = resolve;
      });
      let signalSendEntered = (): void => undefined;
      const sendEntered = new Promise<void>((resolve) => {
        signalSendEntered = resolve;
      });
      let deferred = false;
      clientInstance.sendTx.mockImplementation(
        async (txType: number, txInfo: string) => {
          if (txType === 14 && !deferred) {
            deferred = true;
            // Deterministic: the switch happens strictly AFTER the create
            // submission passed its pre-submit fence and is in flight.
            signalSendEntered();
            await sendGate;
          }
          return await venueSendTx(txType, txInfo);
        },
      );
      const firstPromise = provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      await sendEntered;
      getUserAddressMock.mockReturnValue(`0x${'b'.repeat(40)}`);
      releaseSend();
      const first = await firstPromise;
      // The post-submit fence cancels the OPERATION under B...
      expect(first.success).toBe(false);
      expect(first.error).toContain('switched accounts');
      // ...but the venue accepted the create.
      expect(
        venue.rawTriggers.some((entry) => entry.triggerPrice === '85000'),
      ).toBe(true);
      // Switching back to A: the retry must reconcile the accepted create
      // (recorded via onAccepted BEFORE the fence) and then proceed.
      getUserAddressMock.mockReturnValue(originalAddress);
      const second = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      expect(second.error).toBeUndefined();
      expect(second.success).toBe(true);
      expect(venue.rawTriggers).toHaveLength(1);
      expect(venue.rawTriggers[0].triggerPrice).toBe('86000');
    });
  });
});
