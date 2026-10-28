import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import {
  LIGHTER_ORDER_EXPIRY_NONE,
  LIGHTER_ORDER_TYPE_STOP_LOSS,
  LIGHTER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,
} from '../../../src/constants/lighterConfig.js';
import {
  LighterApiError,
  LighterClientService,
} from '../../../src/services/LighterClientService.js';
import {
  ACCOUNT,
  acknowledgeAllRecovered,
  buildProvider,
  finishPendingTimersAfterEach,
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

  describe('round-21 quarantine persistence, selective acknowledgment and durable manual state', () => {
    it('an unacknowledged recovered outcome blocks the SECOND and THIRD retries too (no empty-entries bypass)', async () => {
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
      venue.failResponseOnce(13);
      expect((await built.provider.withdraw({ amount: '25' })).success).toBe(
        false,
      );
      // Retry 1 resolves the entry, quarantines the outcome, blocks.
      const retry1 = await built.provider.withdraw({ amount: '25' });
      expect(retry1.success).toBe(false);
      expect(retry1.error).toContain('actually completed');
      // Retries 2 and 3 arrive with ZERO unresolved entries — the
      // quarantine check runs BEFORE the empty-entries return, so they
      // stay blocked until the outcome is acknowledged.
      const retry2 = await built.provider.withdraw({ amount: '25' });
      expect(retry2.success).toBe(false);
      expect(retry2.error).toContain('actually completed');
      const retry3 = await built.provider.updateMargin({
        symbol: 'BTC',
        amount: '10',
      });
      expect(retry3.success).toBe(false);
      expect(retry3.error).toContain('actually completed');
      await acknowledgeAllRecovered(built.provider);
      const after = await built.provider.withdraw({ amount: '25' });
      expect(after.success).toBe(true);
    });

    it('rejects malformed version-4 recovered-dispatch rows instead of dropping them', async () => {
      const infra = createMockInfrastructure();
      await infra.diskCache.setItem(
        'lighterNonceLedger:testnet:28:7',
        JSON.stringify({
          version: 4,
          consumedFloor: 0,
          entries: [],
          recovered: [
            {
              recoveryId: '42:beef',
              kind: 13,
              intent: 'withdraw:25',
              txHash: 'beef',
              outcome: 'succeeded',
              // Missing evidence makes the v4 safety document malformed.
            },
          ],
        }),
      );
      const built = buildProvider({ platformDependencies: infra });

      await expect(built.provider.getRecoveredDispatches()).rejects.toThrow(
        'corrupt',
      );
    });

    it.each([
      ['succeeded', 'abab000000000042'],
      ['unknown', null],
    ] as const)(
      'preserves a blocking %s outcome when 32 non-blocking failures already fill the ledger',
      async (expectedOutcome, txHash) => {
        const infra = createMockInfrastructure();
        const failedOutcomes = Array.from({ length: 32 }, (_, index) => ({
          recoveryId: `${String(index)}:failed`,
          kind: 13,
          intent: `withdraw:${String(index)}`,
          txHash: `dead${String(index).padStart(8, '0')}`,
          outcome: 'failed',
          evidence: 'tx-status:0',
        }));
        await infra.diskCache.setItem(
          'lighterNonceLedger:testnet:28:7',
          JSON.stringify({
            version: 4,
            consumedFloor: 0,
            entries: [
              {
                nonce: 42,
                txHash,
                expiresAt: 9_999_999_999_999,
                kind: 13,
                intent: 'withdraw:25',
                owner: null,
              },
            ],
            recovered: failedOutcomes,
          }),
        );
        const built = buildProvider({
          registeredKey: '9c'.repeat(40),
          platformDependencies: infra,
        });
        setupTriggerVenue(built.clientInstance, built.bridge);
        if (expectedOutcome === 'succeeded') {
          built.clientInstance.getTx.mockResolvedValue({
            code: 200,
            hash: txHash,
            accountIndex: 28,
            apiKeyIndex: 7,
            nonce: 42,
            status: 2,
          });
        } else {
          built.clientInstance.getNextNonce.mockResolvedValue({
            code: 200,
            nonce: 43,
          });
        }

        const firstRetry = await built.provider.withdraw({ amount: '25' });
        expect(firstRetry.success).toBe(false);
        const recovered = await built.provider.getRecoveredDispatches();
        expect(recovered).toHaveLength(32);
        expect(recovered.some((row) => row.outcome === expectedOutcome)).toBe(
          true,
        );
        // The blocking row must survive the disk round-trip, not merely the
        // in-memory resolve pass.
        const secondRetry = await built.provider.withdraw({ amount: '25' });
        expect(secondRetry.success).toBe(false);
        expect(secondRetry.error).toContain(
          expectedOutcome === 'succeeded'
            ? 'actually completed'
            : 'UNKNOWN outcome',
        );
      },
    );

    it('keeps an exact-hash pending transaction unresolved until it reaches a terminal status', async () => {
      const registeredKey = '9c'.repeat(40);
      const infra = createMockInfrastructure();
      await infra.diskCache.setItem(
        'lighterNonceLedger:testnet:28:7',
        JSON.stringify({
          version: 4,
          consumedFloor: 0,
          entries: [
            {
              nonce: 42,
              txHash: 'abab000000000042',
              expiresAt: 9_999_999_999_999,
              kind: 13,
              intent: 'withdraw:25',
              owner: null,
            },
          ],
          recovered: [],
        }),
      );
      const built = buildProvider({
        registeredKey,
        platformDependencies: infra,
      });
      setupTriggerVenue(built.clientInstance, built.bridge);
      let txStatus = 1;
      built.clientInstance.getTx.mockImplementation(async () => ({
        code: 200,
        hash: 'abab000000000042',
        accountIndex: 28,
        apiKeyIndex: 7,
        nonce: 42,
        status: txStatus,
      }));

      const pendingRetry = await built.provider.withdraw({ amount: '25' });
      expect(pendingRetry.success).toBe(false);
      expect(pendingRetry.error).toContain('unresolved outcome');
      const pendingOutcomes = await built.provider.getRecoveredDispatches();
      expect(pendingOutcomes).toHaveLength(1);
      expect(pendingOutcomes[0]).toMatchObject({
        outcome: 'unknown',
        acknowledgeable: false,
      });
      await expect(
        built.provider.acknowledgeRecoveredDispatch(
          pendingOutcomes[0].recoveryId,
        ),
      ).rejects.toThrow('cannot be acknowledged');
      const pendingDoc = JSON.parse(
        (await infra.diskCache.getItem(
          'lighterNonceLedger:testnet:28:7',
        )) as string,
      ) as {
        consumedFloor: number;
        entries: unknown[];
        recovered: unknown[];
      };
      expect(pendingDoc.consumedFloor).toBe(0);
      expect(pendingDoc.entries).toHaveLength(1);
      expect(pendingDoc.recovered).toHaveLength(0);

      txStatus = 2;
      const settledRetry = await built.provider.withdraw({ amount: '25' });
      expect(settledRetry.success).toBe(false);
      expect(settledRetry.error).toContain('actually completed');
      const outcomes = await built.provider.getRecoveredDispatches();
      expect(outcomes).toHaveLength(1);
      await built.provider.acknowledgeRecoveredDispatch(outcomes[0].recoveryId);
      expect((await built.provider.withdraw({ amount: '25' })).success).toBe(
        true,
      );
    });

    it('getRecoveredDispatches is READ-ONLY and acknowledgment is selective per stable id', async () => {
      const registeredKey = '9c'.repeat(40);
      const infra = createMockInfrastructure();
      // TWO ambiguous dispatches recorded by an earlier session (writes
      // block after the first, so two entries model a restart/two-device
      // ledger), both later proven consumed by exact hash.
      await infra.diskCache.setItem(
        'lighterNonceLedger:testnet:28:7',
        JSON.stringify({
          version: 4,
          consumedFloor: 0,
          entries: [
            {
              nonce: 42,
              txHash: 'abab000000000042',
              expiresAt: 9_999_999_999_999,
              kind: 13,
              intent: 'withdraw:25',
              owner: null,
            },
            {
              nonce: 43,
              txHash: 'ffff000000000043',
              expiresAt: 9_999_999_999_999,
              kind: 29,
              intent: 'updateMargin:BTC:10',
              owner: null,
            },
          ],
          recovered: [],
        }),
      );
      const built = buildProvider({
        registeredKey,
        platformDependencies: infra,
      });
      setupTriggerVenue(built.clientInstance, built.bridge);
      built.clientInstance.getTx.mockImplementation(async (hash: string) =>
        hash === 'abab000000000042' || hash === 'ffff000000000043'
          ? {
              code: 200,
              hash,
              accountIndex: 28,
              apiKeyIndex: 7,
              nonce: hash === 'abab000000000042' ? 42 : 43,
              status: 2,
            }
          : null,
      );
      // A blocked write resolves both entries into recovered outcomes.
      expect((await built.provider.withdraw({ amount: '5' })).success).toBe(
        false,
      );
      const outcomes = await built.provider.getRecoveredDispatches();
      expect(outcomes).toHaveLength(2);
      expect(outcomes.map((outcome) => outcome.outcome)).toStrictEqual([
        'succeeded',
        'succeeded',
      ]);
      // READ-ONLY: a second read returns the SAME outcomes — nothing was
      // destructively cleared by reading.
      const reread = await built.provider.getRecoveredDispatches();
      expect(reread).toStrictEqual(outcomes);
      // Unknown id: refused explicitly.
      await expect(
        built.provider.acknowledgeRecoveredDispatch('999:deadbeef'),
      ).rejects.toThrow('No pending recovered');
      // Acknowledge ONE: the other outcome still blocks writes.
      await built.provider.acknowledgeRecoveredDispatch(outcomes[0].recoveryId);
      const stillBlocked = await built.provider.withdraw({ amount: '5' });
      expect(stillBlocked.success).toBe(false);
      expect(stillBlocked.error).toContain('actually completed');
      expect(await built.provider.getRecoveredDispatches()).toHaveLength(1);
      // Acknowledge the second: writes recover.
      await built.provider.acknowledgeRecoveredDispatch(outcomes[1].recoveryId);
      const after = await built.provider.withdraw({ amount: '5' });
      expect(after.success).toBe(true);
    });

    it("an account switch cannot acknowledge (or lose) another account's recovered outcome", async () => {
      const registeredKey = '9c'.repeat(40);
      const built = buildProvider({
        registeredKey,
        configuredAccountIndex: null,
      });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      venue.failResponseOnce(13);
      expect((await built.provider.withdraw({ amount: '25' })).success).toBe(
        false,
      );
      expect((await built.provider.withdraw({ amount: '25' })).success).toBe(
        false,
      );
      const outcomes = await built.provider.getRecoveredDispatches();
      expect(outcomes).toHaveLength(1);
      // WALLET SWITCH: a different address owning a different account.
      const otherAddress = '0x9999999999999999999999999999999999999999';
      built.getUserAddressMock.mockReturnValue(otherAddress);
      built.clientInstance.getAccountsByL1Address.mockResolvedValue({
        code: 200,
        l1Address: otherAddress,
        subAccounts: [{ ...ACCOUNT, index: 77, l1Address: otherAddress }],
      });
      // The stale id targets the OLD account's ledger: the new session
      // must not clear it (its own ledger has no such outcome).
      await expect(
        built.provider.acknowledgeRecoveredDispatch(outcomes[0].recoveryId),
      ).rejects.toThrow('No pending recovered');
      // Switch BACK: the outcome survived untouched and is still owed.
      built.getUserAddressMock.mockReturnValue(ACCOUNT.l1Address);
      built.clientInstance.getAccountsByL1Address.mockResolvedValue({
        code: 200,
        l1Address: ACCOUNT.l1Address,
        subAccounts: [ACCOUNT],
      });
      const survived = await built.provider.getRecoveredDispatches();
      expect(survived).toStrictEqual(outcomes);
    });

    it('a parked manual recovery carries reason, prior intent, survivors and required action — and survives a FAILED successor', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('take-profit', '110000');
      venue.seedTrigger('stop-loss', '80000');
      // After the FIRST old-cancel commits, the venue terminal-cancels
      // one replacement leg (phase race) — parks durable manual state.
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
      const parked = await provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '111000',
        stopLossPrice: '81000',
      });
      expect(parked.success).toBe(false);
      const pending = await provider.getPendingManualRecoveries();
      expect(pending).toHaveLength(1);
      expect(pending[0].symbol).toBe('BTC');
      expect(pending[0].reason.length).toBeGreaterThan(10);
      expect(pending[0].priorIntent).toBe('replace');
      expect(Array.isArray(pending[0].survivingOrderIds)).toBe(true);
      expect(pending[0].actionNeeded).toContain('TP/SL');
      // A FAILED successor intent must RETAIN the warning: the venue
      // terminal-cancels the successor's create before activation.
      venue.setCreateTerminal('canceled');
      const failedSuccessor = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '84000',
      });
      expect(failedSuccessor.success).toBe(false);
      expect(await provider.getPendingManualRecoveries()).toHaveLength(1);
      // Only an authoritatively SUCCESSFUL successor clears it.
      venue.setCreateTerminal('none');
      const renewed = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '84000',
      });
      expect(renewed.error).toBeUndefined();
      expect(renewed.success).toBe(true);
      expect(await provider.getPendingManualRecoveries()).toHaveLength(0);
    });

    it('manual-recovery discovery PROPAGATES storage errors and filters to the bound identity', async () => {
      const infra = createMockInfrastructure();
      const built = buildProvider({ platformDependencies: infra });
      setupTriggerVenue(built.clientInstance, built.bridge);
      await built.provider.getOpenOrders();
      // A FOREIGN identity's parked warning is never surfaced here.
      await infra.diskCache.setItem(
        'lighterTpslManualIndex:testnet',
        JSON.stringify(['0xother:99:7:ETH']),
      );
      await infra.diskCache.setItem(
        'lighterTpslManual:testnet:0xother:99:7:ETH',
        JSON.stringify({
          version: 1,
          settlementKey: '0xother:99:7:ETH',
          symbol: 'ETH',
          reason: 'foreign',
          priorIntent: 'replace',
          priorTriggers: [],
          survivingOrderIds: [],
          operationId: 'op-x',
          recordedAt: 1,
        }),
      );
      expect(await built.provider.getPendingManualRecoveries()).toHaveLength(0);
      // Corruption REJECTS — it must never degrade to \"nothing pending\".
      await infra.diskCache.setItem('lighterTpslManualIndex:testnet', '{oops');
      await expect(built.provider.getPendingManualRecoveries()).rejects.toThrow(
        'corrupt',
      );
    });

    it('a leverage change committed before an order failure is reported as STRUCTURED partial state', async () => {
      const built = buildProvider();
      setupTriggerVenue(built.clientInstance, built.bridge);
      // Leverage submit succeeds; the ORDER dispatch then fails at the
      // venue boundary.
      const realSend = built.clientInstance.sendTx.getMockImplementation() as (
        txType: number,
        txInfo: string,
      ) => Promise<unknown>;
      built.clientInstance.sendTx.mockImplementation(
        async (txType: number, txInfo: string) => {
          if (txType === 14) {
            throw new LighterApiError('order rejected', 21000);
          }
          return await realSend(txType, txInfo);
        },
      );
      const result = await built.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
        leverage: 10,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('PARTIAL STATE');
      expect(result.partialState).toStrictEqual({ leverageUpdated: 10 });
    });

    it("the auth-token mint runs under the bridge lease: a second account's takeover re-establishes OUR client first", async () => {
      const registeredKey = '9c'.repeat(40);
      const first = buildProvider({ registeredKey });
      setupTriggerVenue(first.clientInstance, first.bridge);
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
      setupTriggerVenue(second.clientInstance, second.bridge);
      const order = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      } as const;
      // A establishes and holds a cached token; B takes the singleton.
      expect((await first.provider.placeOrder(order)).success).toBe(true);
      expect((await second.provider.placeOrder(order)).success).toBe(true);
      // EXPIRE A's cached token, then force a fresh mint via a read that
      // needs auth: the mint must re-create A's client under the lease.
      const realNow = Date.now();
      const nowSpy = vi.spyOn(Date, 'now').mockImplementation(function () {
        return realNow + 700_000;
      });
      try {
        await first.provider.getOpenOrders();
      } finally {
        nowSpy.mockRestore();
      }
      // Sequence: every _createAuthToken is owned by the LAST-created
      // client account.
      const mismatches: string[] = [];
      let currentOwner: number | null = null;
      for (const call of first.calls) {
        if (call.function === '_createClient') {
          currentOwner = Number((call.params as (string | number)[])[1]);
        }
        if (call.function === '_createAuthToken') {
          const minter = Number((call.params as (string | number)[])[0]);
          if (currentOwner !== null && currentOwner !== minter) {
            mismatches.push(`${String(currentOwner)}!=${String(minter)}`);
          }
        }
      }
      expect(mismatches).toStrictEqual([]);
    });
  });
  describe('round-22 ledger serialization and post-dispatch fences', () => {
    it('a selective acknowledgment can never overwrite a concurrent dispatch append with a stale ledger doc', async () => {
      const registeredKey = '9c'.repeat(40);
      const infra = createMockInfrastructure();
      // Durable NON-BLOCKING failed outcome F awaiting acknowledgment.
      await infra.diskCache.setItem(
        'lighterNonceLedger:testnet:28:7',
        JSON.stringify({
          version: 4,
          consumedFloor: 0,
          entries: [],
          recovered: [
            {
              recoveryId: '41:beef',
              kind: 13,
              intent: 'withdraw:9',
              txHash: 'beef',
              outcome: 'failed',
              evidence: 'tx-status:0',
            },
          ],
        }),
      );
      const built = buildProvider({
        registeredKey,
        platformDependencies: infra,
      });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      // Warm signer setup so the gated window contains ONLY the ack read
      // and the order's ledger RMW.
      await built.provider.getOpenOrders();
      // Gate the ACK's ledger WRITE: it has already read the doc, and a
      // concurrent placeOrder appends an unresolved entry in the window
      // before the ack's (now stale) write lands. All ledger RMW must
      // serialize on ONE mutex so this window cannot exist.
      const realSet = (
        infra.diskCache.setItem as Mock
      ).getMockImplementation() as (
        key: string,
        value: string,
      ) => Promise<void>;
      let releaseGate: () => void = () => undefined;
      const gate = { armed: true };
      (infra.diskCache.setItem as Mock).mockImplementation(
        async (key: string, value: string) => {
          if (gate.armed && key.startsWith('lighterNonceLedger:')) {
            gate.armed = false;
            await new Promise<void>((resolve) => {
              releaseGate = resolve;
            });
          }
          return await realSet(key, value);
        },
      );
      const ackPromise = built.provider.acknowledgeRecoveredDispatch('41:beef');
      // Let the ack reach its (gated) ledger read.
      await new Promise((resolve) => setTimeout(resolve, 100));
      // Concurrent dispatch whose venue commit is masked by response
      // loss: its unresolved ledger entry is the only retry protection.
      venue.failResponseOnce(14);
      const orderPromise = built.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });
      await new Promise((resolve) => setTimeout(resolve, 600));
      releaseGate();
      await ackPromise;
      const orderResult = await orderPromise;
      expect(orderResult.success).toBe(false);
      const doc = JSON.parse(
        (await infra.diskCache.getItem(
          'lighterNonceLedger:testnet:28:7',
        )) as string,
      ) as { entries: unknown[]; recovered: unknown[] };
      // F acknowledged AND the concurrent unresolved dispatch SURVIVED —
      // a stale ack write would have silently erased it, leaving the
      // committed order retryable.
      expect(doc.recovered).toHaveLength(0);
      expect(doc.entries).toHaveLength(1);
    });

    it('an account switch DURING network submission quarantines the accepted dispatch: the switch-back retry is refused until acknowledged', async () => {
      const registeredKey = '9c'.repeat(40);
      const built = buildProvider({ registeredKey });
      setupTriggerVenue(built.clientInstance, built.bridge);
      const otherAddress = '0x9999999999999999999999999999999999999999';
      // The venue ACCEPTS the withdraw; the wallet switches accounts
      // while the response is in flight, so the post-send fence cancels
      // the operation AFTER the financial intent committed.
      const realSend = built.clientInstance.sendTx.getMockImplementation() as (
        txType: number,
        txInfo: string,
      ) => Promise<unknown>;
      let switched = false;
      built.clientInstance.sendTx.mockImplementation(
        async (txType: number, txInfo: string) => {
          const response = await realSend(txType, txInfo);
          if (txType === 13 && !switched) {
            switched = true;
            built.getUserAddressMock.mockReturnValue(otherAddress);
            built.clientInstance.getAccountsByL1Address.mockResolvedValue({
              code: 200,
              l1Address: otherAddress,
              subAccounts: [{ ...ACCOUNT, index: 77, l1Address: otherAddress }],
            });
          }
          return response;
        },
      );
      const cancelled = await built.provider.withdraw({ amount: '25' });
      expect(cancelled.success).toBe(false);
      // Switch BACK and retry the same intent: the committed withdraw
      // was durably quarantined SUCCEEDED for the ORIGINAL account —
      // the blind retry is refused until explicitly acknowledged.
      built.getUserAddressMock.mockReturnValue(ACCOUNT.l1Address);
      built.clientInstance.getAccountsByL1Address.mockResolvedValue({
        code: 200,
        l1Address: ACCOUNT.l1Address,
        subAccounts: [ACCOUNT],
      });
      const retry = await built.provider.withdraw({ amount: '25' });
      expect(retry.success).toBe(false);
      expect(retry.error).toContain('actually completed');
      const outcomes = await built.provider.getRecoveredDispatches();
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0].outcome).toBe('succeeded');
      expect(outcomes[0].evidence).toBe('post-dispatch-session-cancelled');
      expect(outcomes[0].intent).toBe('withdraw:25');
      await built.provider.acknowledgeRecoveredDispatch(outcomes[0].recoveryId);
      expect((await built.provider.withdraw({ amount: '25' })).success).toBe(
        true,
      );
    });
  });
  describe('per-market minimums (dynamic, venue-derived)', () => {
    it('getMarkets reports the universal one-tick USD minimum rather than the maker-only floor', async () => {
      const { provider } = buildProvider();
      const markets = await provider.getMarkets();
      const btc = markets.find((market) => market.name === 'BTC');
      // Lighter's base/quote floors are maker-only. Market and IOC orders
      // may use one base-size tick: 0.00001 BTC x $100000 = $1.
      expect(btc?.minimumOrderSize).toBe(1);
      expect(btc?.maxLeverage).toBe(50); // 10000 / minInitialMarginFraction(200)
    });
  });

  describe('close-size contract (mobile sheet parity)', () => {
    it('a FULL close sent as an EMPTY size string closes the position (mobile sends size: "" for 100% closes)', async () => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      setupTriggerVenue(built.clientInstance, built.bridge);
      const validation = await built.provider.validateClosePosition({
        symbol: 'BTC',
        size: '',
        currentPrice: 100000,
      });
      expect(validation.isValid).toBe(true);
      const result = await built.provider.closePosition({
        symbol: 'BTC',
        size: '',
        orderType: 'market',
        currentPrice: 100000,
      });
      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);
    });
  });

  describe('signer readiness lock return gap', () => {
    it.each(['reset', 'wallet-rebind'] as const)(
      'refuses stale readiness and keeps unfinished journals visible after %s',
      async (retirement) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
          configuredAccountIndex: null,
        });
        const nextAddress =
          retirement === 'reset'
            ? ACCOUNT.l1Address.toLowerCase()
            : '0x1111111111111111111111111111111111111111';
        const nextIndex = retirement === 'reset' ? 28 : 29;
        const keys = ['BTC', 'ETH'].map(
          (symbol) => `${nextAddress}:${nextIndex}:7:${symbol}`,
        );
        await infra.diskCache.setItem(
          'lighterTpslJournalIndex:testnet',
          JSON.stringify(keys),
        );
        for (const [index, settlementKey] of keys.entries()) {
          await infra.diskCache.setItem(
            `lighterTpslJournal:testnet:${settlementKey}`,
            JSON.stringify({
              version: 4,
              recordedAt: 5,
              operationId: `return-gap-${index}`,
              createdAt: 5,
              nextAttemptId: 2,
              apiKeyIndex: 7,
              intent: 'replace',
              phase: index === 0 ? 'creating' : 'cancelling',
              priorGrouping: 'independent',
              priorTriggers: [],
              attempts: [
                {
                  kind: 'create',
                  attemptId: 1,
                  nonce: 42,
                  outcome: 'unknown',
                  clientIds: [12345],
                  txHash: 'ffff00000001',
                  expiresAt: 9_999_999_999_999,
                  role: 'replacement',
                },
              ],
            }),
          );
        }
        const getItem = vi.spyOn(infra.diskCache, 'getItem');
        // Vitest's spy has no implementation to read back, so keep the real one.
        const originalDelete = Map.prototype.delete;
        const eviction = vi.spyOn(Map.prototype, 'delete');
        let retired = false;
        let rebound: Promise<unknown> | undefined;
        // The real venue mutex evicts its tail after its critical section
        // settles, before the awaiting setupSigner continuation resumes.
        // Retire here rather than changing private fields or mocking setup.
        eviction.mockImplementation(function (
          this: Map<unknown, unknown>,
          key: unknown,
        ) {
          const deleted = originalDelete.call(this, key);
          if (key === 'lighterVenueWrite:testnet:28' && !retired) {
            retired = true;
            if (retirement === 'reset') {
              built.fireReset();
            } else {
              built.getUserAddressMock.mockReturnValue(nextAddress);
              built.clientInstance.getAccountsByL1Address.mockResolvedValue({
                code: 200,
                l1Address: nextAddress,
                subAccounts: [
                  { ...ACCOUNT, index: nextIndex, l1Address: nextAddress },
                ],
              });
              rebound = built.provider.getPendingManualRecoveries();
            }
          }
          return deleted;
        });
        try {
          const ready = await built.provider.isReadyToTrade();
          await rebound;
          expect(retired).toBe(true);
          expect(ready.ready).toBe(false);
          expect(ready.error).toContain('while this operation was in flight');
          // Only the explicit read used to rebind may read the journal index.
          expect(
            getItem.mock.calls.filter(
              ([key]) => key === 'lighterTpslJournalIndex:testnet',
            ),
          ).toHaveLength(retirement === 'reset' ? 0 : 1);
          const pending = await built.provider.getPendingManualRecoveries();
          expect(pending.map((entry) => entry.settlementKey)).toStrictEqual(
            keys,
          );
          for (const entry of pending) {
            expect(entry.reason).toContain('unfinished');
            expect(entry.actionNeeded).toContain(
              'Initialize the wallet trading key',
            );
          }
          expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
          expect(built.calls.map((call) => call.function)).toStrictEqual([
            '_createClient',
          ]);
        } finally {
          eviction.mockRestore();
          await built.provider.disconnect();
        }
      },
    );
  });

  // Focused public-provider regression: the venue double controls acceptance
  // and book visibility independently; the real provider owns slot discovery,
  // durable nonce completion, journal recovery and protection serialization.
  describe('protection journals across migrated key slots', () => {
    it.each([false, true])(
      'blocks replacement=%s after an accepted old-slot create leaves the nonce ledger',
      async (replacement) => {
        const infra = createMockInfrastructure();
        const original = buildProvider({
          platformDependencies: infra,
          apiKeyIndex: 19,
        });
        Object.assign(original.bridge, {
          getRecoverableKeyIndices: async (): Promise<number[]> => [19],
        });
        original.clientInstance.getApiKeys.mockResolvedValue({
          code: 200,
          apiKeys: [{ apiKeyIndex: 19, publicKey: '9c'.repeat(40) }],
        });
        const originalVenue = setupTriggerVenue(
          original.clientInstance,
          original.bridge,
          { apiKeyIndex: 19 },
        );
        originalVenue.setRestLag(100);
        const created = await original.provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '80000',
        });
        expect(created.success).toBe(false);
        expect(created.error).toContain('settlement is not yet visible');
        expect(originalVenue.rawTriggers).toHaveLength(1);
        expect(original.clientInstance.sendTx).toHaveBeenCalledTimes(1);
        const sourceKey = `${ACCOUNT.l1Address.toLowerCase()}:28:19:BTC`;
        const journalKey = `lighterTpslJournal:testnet:${sourceKey}`;
        const journalBefore = await infra.diskCache.getItem(journalKey);
        expect(journalBefore).not.toBeNull();
        const pointer = JSON.parse(journalBefore ?? '') as {
          operationId: string;
        };
        const payloadKey = `lighterTpslJournalOp:testnet:${sourceKey}:${pointer.operationId}`;
        const payloadBefore = await infra.diskCache.getItem(payloadKey);
        expect(JSON.parse(payloadBefore ?? '')).toMatchObject({
          apiKeyIndex: 19,
          intent: 'replace',
          phase: 'creating',
          attempts: [expect.objectContaining({ kind: 'create' })],
        });
        const ledgerBefore = await infra.diskCache.getItem(
          'lighterNonceLedger:testnet:28:19',
        );
        expect(JSON.parse(ledgerBefore ?? '')).toMatchObject({
          entries: [],
          recovered: [],
        });
        await original.provider.disconnect();

        const migrated = buildProvider({ platformDependencies: infra });
        Object.assign(migrated.bridge, {
          getRecoverableKeyIndices: async (): Promise<number[]> => [19, 7],
        });
        migrated.clientInstance.getApiKeys.mockResolvedValue({
          code: 200,
          apiKeys: [
            { apiKeyIndex: 19, publicKey: 'ab'.repeat(40) },
            { apiKeyIndex: 7, publicKey: '9c'.repeat(40) },
          ],
        });
        const migratedVenue = setupTriggerVenue(
          migrated.clientInstance,
          migrated.bridge,
        );
        migratedVenue.rawTriggers.push(...originalVenue.rawTriggers);
        migratedVenue.setVenueNonce(originalVenue.getVenueNonce());
        migratedVenue.setNextIndex(originalVenue.getNextIndex());
        migratedVenue.primeLag([], 100);
        expect((await migrated.provider.isReadyToTrade()).ready).toBe(true);
        expect(
          vi.mocked(migrated.bridge).createClient.mock.lastCall,
        ).toStrictEqual([expect.objectContaining({ apiKeyIndex: 7 })]);
        expect(await migrated.provider.getRecoveredDispatches()).toStrictEqual(
          [],
        );
        const result = await migrated.provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: replacement ? '85000' : undefined,
        });
        expect(result.success).toBe(false);
        expect(result.error).toContain('original API key slot 19');
        expect(migrated.clientInstance.sendTx).not.toHaveBeenCalled();
        expect(
          migrated.calls.filter((call) => call.function.startsWith('_sign')),
        ).toStrictEqual([]);
        expect(await infra.diskCache.getItem(journalKey)).toBe(journalBefore);
        expect(await infra.diskCache.getItem(payloadKey)).toBe(payloadBefore);
        expect(
          await infra.diskCache.getItem('lighterNonceLedger:testnet:28:19'),
        ).toBe(ledgerBefore);
        expect(migratedVenue.rawTriggers).toStrictEqual(
          originalVenue.rawTriggers,
        );
        await migrated.provider.disconnect();

        // The original key can still reconcile the same journal and remove
        // the now-visible trigger. No slot-7 signature may consume slot-19
        // transaction identity or clear its settlement obligation.
        const restored = buildProvider({
          platformDependencies: infra,
          apiKeyIndex: 19,
        });
        Object.assign(restored.bridge, {
          getRecoverableKeyIndices: async (): Promise<number[]> => [19],
        });
        restored.clientInstance.getApiKeys.mockResolvedValue({
          code: 200,
          apiKeys: [{ apiKeyIndex: 19, publicKey: '9c'.repeat(40) }],
        });
        const restoredVenue = setupTriggerVenue(
          restored.clientInstance,
          restored.bridge,
          { apiKeyIndex: 19 },
        );
        restoredVenue.rawTriggers.push(...originalVenue.rawTriggers);
        restoredVenue.setVenueNonce(originalVenue.getVenueNonce());
        for (const [hash, transaction] of originalVenue.landedTxs) {
          restoredVenue.landedTxs.set(hash, transaction);
        }
        const removed = await restored.provider.updatePositionTPSL({
          symbol: 'BTC',
        });
        expect(removed).toMatchObject({ success: true });
        expect(
          vi.mocked(restored.bridge).createClient.mock.lastCall,
        ).toStrictEqual([expect.objectContaining({ apiKeyIndex: 19 })]);
        expect(restoredVenue.rawTriggers).toStrictEqual([]);
        expect(restored.clientInstance.sendTx).toHaveBeenCalledTimes(1);
        expect(restored.clientInstance.sendTx).toHaveBeenCalledWith(
          15,
          expect.any(String),
        );
        expect(await infra.diskCache.getItem(journalKey)).toBeNull();
        await restored.provider.disconnect();

        const afterRecovery = buildProvider({
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
        });
        const afterVenue = setupTriggerVenue(
          afterRecovery.clientInstance,
          afterRecovery.bridge,
        );
        const changed = await afterRecovery.provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: replacement ? '85000' : undefined,
        });
        expect(changed).toMatchObject({ success: true });
        expect(afterVenue.rawTriggers).toHaveLength(replacement ? 1 : 0);
        expect(afterRecovery.clientInstance.sendTx).toHaveBeenCalledTimes(
          replacement ? 1 : 0,
        );
        await afterRecovery.provider.disconnect();
      },
    );

    it.each([
      [false, 'foreground', false],
      [true, 'foreground', false],
      [false, 'read', false],
      [true, 'read', false],
      [false, 'read', true],
      [true, 'read', true],
      [false, 'foreground', true],
      [true, 'foreground', true],
    ] as const)(
      'settles a visible old-slot create read-only while its signing key stays foreign, replacement=%s via %s prior-survivor=%s',
      async (replacement, recoveryMode, hasPrior) => {
        const infra = createMockInfrastructure();
        const original = buildProvider({
          platformDependencies: infra,
          apiKeyIndex: 19,
        });
        Object.assign(original.bridge, {
          getRecoverableKeyIndices: async (): Promise<number[]> => [19],
        });
        original.clientInstance.getApiKeys.mockResolvedValue({
          code: 200,
          apiKeys: [{ apiKeyIndex: 19, publicKey: '9c'.repeat(40) }],
        });
        const originalVenue = setupTriggerVenue(
          original.clientInstance,
          original.bridge,
          { apiKeyIndex: 19 },
        );
        if (hasPrior) {
          originalVenue.seedTrigger('take-profit', '110000');
        }
        originalVenue.setRestLag(100);
        const created = await original.provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '80000',
        });
        expect(created.success).toBe(false);
        expect(created.error).toContain('settlement is not yet visible');
        expect(originalVenue.rawTriggers).toHaveLength(hasPrior ? 2 : 1);
        expect(original.clientInstance.sendTx).toHaveBeenCalledTimes(1);
        const sourceKey = `${ACCOUNT.l1Address.toLowerCase()}:28:19:BTC`;
        const journalKey = `lighterTpslJournal:testnet:${sourceKey}`;
        const journalBefore = await infra.diskCache.getItem(journalKey);
        expect(journalBefore).not.toBeNull();
        const pointer = JSON.parse(journalBefore ?? '') as {
          operationId: string;
        };
        const payloadKey = `lighterTpslJournalOp:testnet:${sourceKey}:${pointer.operationId}`;
        const payloadBefore = await infra.diskCache.getItem(payloadKey);
        expect(JSON.parse(payloadBefore ?? '')).toMatchObject({
          apiKeyIndex: 19,
          intent: 'replace',
          phase: 'creating',
          attempts: [expect.objectContaining({ kind: 'create' })],
        });
        const ledgerBefore = await infra.diskCache.getItem(
          'lighterNonceLedger:testnet:28:19',
        );
        expect(JSON.parse(ledgerBefore ?? '')).toMatchObject({
          entries: [],
          recovered: [],
        });
        await original.provider.disconnect();

        const migrated = buildProvider({ platformDependencies: infra });
        Object.assign(migrated.bridge, {
          getRecoverableKeyIndices: async (): Promise<number[]> => [19, 7],
        });
        migrated.clientInstance.getApiKeys.mockResolvedValue({
          code: 200,
          apiKeys: [
            { apiKeyIndex: 19, publicKey: 'ab'.repeat(40) },
            { apiKeyIndex: 7, publicKey: '9c'.repeat(40) },
          ],
        });
        const migratedVenue = setupTriggerVenue(
          migrated.clientInstance,
          migrated.bridge,
        );
        migratedVenue.rawTriggers.push(...originalVenue.rawTriggers);
        migratedVenue.setVenueNonce(originalVenue.getVenueNonce());
        migratedVenue.setNextIndex(originalVenue.getNextIndex());
        migratedVenue.primeLag([], 100);
        expect((await migrated.provider.isReadyToTrade()).ready).toBe(true);
        expect(
          vi.mocked(migrated.bridge).createClient.mock.lastCall,
        ).toStrictEqual([expect.objectContaining({ apiKeyIndex: 7 })]);
        expect(await migrated.provider.getRecoveredDispatches()).toStrictEqual(
          [],
        );
        const result = await migrated.provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: replacement ? '85000' : undefined,
        });
        expect(result.success).toBe(false);
        expect(result.error).toContain('original API key slot 19');
        expect(migrated.clientInstance.sendTx).not.toHaveBeenCalled();
        expect(
          migrated.calls.filter((call) => call.function.startsWith('_sign')),
        ).toStrictEqual([]);
        expect(await infra.diskCache.getItem(journalKey)).toBe(journalBefore);
        expect(await infra.diskCache.getItem(payloadKey)).toBe(payloadBefore);
        expect(
          await infra.diskCache.getItem('lighterNonceLedger:testnet:28:19'),
        ).toBe(ledgerBefore);
        expect(migratedVenue.rawTriggers).toStrictEqual(
          originalVenue.rawTriggers,
        );
        const clientCreationsAtReady = vi.mocked(migrated.bridge).createClient
          .mock.calls.length;
        // Slot 19 stays foreign permanently. Only its own exact hash/nonce
        // identity may discharge the old obligation; the selected key signs
        // only the fresh user intent after read-only settlement.
        migratedVenue.setRestLag(0);
        migratedVenue.primeLag([], 0);
        migrated.clientInstance.getTx.mockImplementation(
          async (hash: string) => {
            const old = originalVenue.landedTxs.get(hash);
            return old
              ? { code: 200, hash, accountIndex: 28, apiKeyIndex: 19, ...old }
              : null;
          },
        );
        let readProof:
          | {
              journal: string | null;
              submissions: number;
              signatures: string[];
              manual: {
                settlementKey: string;
                priorIntent: string;
                survivingOrderIds: string[];
              }[];
            }
          | undefined;
        if (recoveryMode === 'read') {
          for (let attempt = 0; attempt < 80; attempt += 1) {
            await migrated.provider.getOpenOrders();
            if ((await infra.diskCache.getItem(journalKey)) === null) {
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          readProof = {
            journal: await infra.diskCache.getItem(journalKey),
            submissions: migrated.clientInstance.sendTx.mock.calls.length,
            signatures: migrated.calls
              .filter((call) => call.function.startsWith('_sign'))
              .map((call) => call.function),
            manual: (await migrated.provider.getPendingManualRecoveries()).map(
              ({ settlementKey, priorIntent, survivingOrderIds }) => ({
                settlementKey,
                priorIntent,
                survivingOrderIds,
              }),
            ),
          };
        }
        expect(readProof).toStrictEqual(
          recoveryMode === 'read'
            ? {
                journal: null,
                submissions: 0,
                signatures: [],
                manual: hasPrior
                  ? [
                      {
                        settlementKey: sourceKey,
                        priorIntent: 'replace',
                        survivingOrderIds: originalVenue.rawTriggers.map(
                          (row) => String(row.orderIndex),
                        ),
                      },
                    ]
                  : [],
              }
            : undefined,
        );
        expect(migratedVenue.rawTriggers).toStrictEqual(
          originalVenue.rawTriggers,
        );
        const manualKey = `lighterTpslManual:testnet:${sourceKey}`;
        const manualIndexKey = 'lighterTpslManualIndex:testnet';
        let failureProof:
          | {
              hadWarning: boolean;
              hadIndexEntry: boolean;
              success: boolean | undefined;
              warningUnchanged: boolean;
              indexUnchanged: boolean;
            }
          | undefined;
        if (recoveryMode === 'read' && hasPrior) {
          const warningBefore = await infra.diskCache.getItem(manualKey);
          const indexBefore = await infra.diskCache.getItem(manualIndexKey);
          const failed = await migrated.provider.updatePositionTPSL({
            symbol: 'BTC',
            stopLossPrice: '-1',
          });
          failureProof = {
            hadWarning: warningBefore !== null,
            hadIndexEntry: (
              JSON.parse(indexBefore ?? '[]') as string[]
            ).includes(sourceKey),
            success: failed.success,
            warningUnchanged:
              (await infra.diskCache.getItem(manualKey)) === warningBefore,
            indexUnchanged:
              (await infra.diskCache.getItem(manualIndexKey)) === indexBefore,
          };
        }
        expect(failureProof).toStrictEqual(
          recoveryMode === 'read' && hasPrior
            ? {
                hadWarning: true,
                hadIndexEntry: true,
                success: false,
                warningUnchanged: true,
                indexUnchanged: true,
              }
            : undefined,
        );
        const cleared = await migrated.provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: replacement ? '85000' : undefined,
        });
        expect(cleared).toMatchObject({ success: true });
        expect(
          await migrated.provider.getPendingManualRecoveries(),
        ).toStrictEqual([]);
        expect(await infra.diskCache.getItem(journalKey)).toBeNull();
        expect(migratedVenue.rawTriggers).toHaveLength(replacement ? 1 : 0);
        expect(migrated.clientInstance.sendTx).toHaveBeenCalledTimes(
          (replacement ? 2 : 1) + (hasPrior ? 1 : 0),
        );
        expect(
          vi
            .mocked(migrated.bridge)
            .createClient.mock.calls.slice(clientCreationsAtReady)
            .every(([call]) => call.apiKeyIndex === 7),
        ).toBe(true);
        expect(
          await infra.diskCache.getItem('lighterNonceLedger:testnet:28:19'),
        ).toBe(ledgerBefore);
        await migrated.provider.disconnect();
        expect(await infra.diskCache.getItem(manualKey)).toBeNull();
        expect(
          JSON.parse((await infra.diskCache.getItem(manualIndexKey)) ?? '[]'),
        ).not.toContain(sourceKey);
        const restarted = buildProvider({ platformDependencies: infra });
        Object.assign(restarted.bridge, {
          getRecoverableKeyIndices: async (): Promise<number[]> => [19, 7],
        });
        restarted.clientInstance.getApiKeys.mockResolvedValue({
          code: 200,
          apiKeys: [
            { apiKeyIndex: 19, publicKey: 'ab'.repeat(40) },
            { apiKeyIndex: 7, publicKey: '9c'.repeat(40) },
          ],
        });
        const restartedVenue = setupTriggerVenue(
          restarted.clientInstance,
          restarted.bridge,
        );
        restartedVenue.rawTriggers.push(...migratedVenue.rawTriggers);
        restartedVenue.setVenueNonce(migratedVenue.getVenueNonce());
        expect((await restarted.provider.isReadyToTrade()).ready).toBe(true);
        expect(
          vi.mocked(restarted.bridge).createClient.mock.lastCall,
        ).toStrictEqual([expect.objectContaining({ apiKeyIndex: 7 })]);
        expect(
          await restarted.provider.getPendingManualRecoveries(),
        ).toStrictEqual([]);
        expect(restarted.clientInstance.sendTx).not.toHaveBeenCalled();
        await restarted.provider.disconnect();
      },
    );

    it('preserves a late partial recovery obligation during ordinary migrated-slot cleanup', async () => {
      const infra = createMockInfrastructure();
      const built = buildProvider({
        platformDependencies: infra,
        registeredKey: '9c'.repeat(40),
      });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      const key = `${ACCOUNT.l1Address.toLowerCase()}:28:19:BTC`;
      const docKey = `lighterTpslManual:testnet:${key}`;
      const indexKey = 'lighterTpslManualIndex:testnet';
      const bytes = JSON.stringify({
        version: 1,
        settlementKey: key,
        symbol: 'BTC',
        reason: 'Partial protection needs an explicit successor',
        priorIntent: 'replace',
        priorTriggers: [],
        survivingOrderIds: [],
        operationId: 'old-partial-operation',
        recordedAt: 5,
        partialIntent: {
          version: 1,
          positionSign: 1,
          positionWireSize: 10000,
          sizeDecimals: 5,
          linkage: 'single',
          orders: [
            [
              1,
              987,
              '3000',
              '8000000',
              1,
              LIGHTER_ORDER_TYPE_STOP_LOSS,
              LIGHTER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,
              1,
              '8000000',
              LIGHTER_ORDER_EXPIRY_NONE,
            ],
          ],
        },
      });
      const send = built.clientInstance.sendTx.getMockImplementation() as
        | LighterClientService['sendTx']
        | undefined;
      if (!send) {
        throw new Error('Missing venue sender');
      }
      built.clientInstance.sendTx.mockImplementation(
        async (...args: Parameters<LighterClientService['sendTx']>) => {
          const receipt = await send(...args);
          // Earlier-key reconciliation publishes its durable manual obligation
          // after this operation has already passed its explicit-intent preflight.
          await infra.diskCache.setItem(indexKey, JSON.stringify([key]));
          await infra.diskCache.setItem(docKey, bytes);
          return receipt;
        },
      );

      const result = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });

      expect(result.success).toBe(true);
      expect(venue.rawTriggers).toHaveLength(1);
      expect(await infra.diskCache.getItem(docKey)).toBe(bytes);
      expect(await infra.diskCache.getItem(indexKey)).toBe(
        JSON.stringify([key]),
      );
      const rows = await built.provider.getPendingManualRecoveries();
      expect(rows).toHaveLength(1);
      expect(rows[0].partialIntent?.legs[0].size).toBe('0.03');
      expect(rows[0].actionNeeded).toContain('exact recovery ID');
      await built.provider.disconnect();
    });

    it.each(['wallet', 'account', 'network', 'symbol'] as const)(
      'preserves unrelated previous-slot manual warning bytes for another %s after an explicit update',
      async (context) => {
        const infra = createMockInfrastructure();
        const address =
          context === 'wallet'
            ? '0x9999999999999999999999999999999999999999'
            : ACCOUNT.l1Address.toLowerCase();
        const key = `${address}:${context === 'account' ? 29 : 28}:19:${context === 'symbol' ? 'ETH' : 'BTC'}`;
        const network = context === 'network' ? 'mainnet' : 'testnet';
        const indexKey = `lighterTpslManualIndex:${network}`;
        const docKey = `lighterTpslManual:${network}:${key}`;
        await infra.diskCache.setItem(indexKey, JSON.stringify([key]));
        await infra.diskCache.setItem(
          docKey,
          'unrelated bytes must not be interpreted',
        );
        const built = buildProvider({
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
        });
        const venue = setupTriggerVenue(built.clientInstance, built.bridge);
        expect(
          await built.provider.updatePositionTPSL({
            symbol: 'BTC',
            stopLossPrice: '85000',
          }),
        ).toMatchObject({ success: true });
        expect(venue.rawTriggers).toHaveLength(1);
        expect(await infra.diskCache.getItem(docKey)).toBe(
          'unrelated bytes must not be interpreted',
        );
        expect(await infra.diskCache.getItem(indexKey)).toBe(
          JSON.stringify([key]),
        );
        await built.provider.disconnect();
      },
    );

    it.each(
      ([false, true] as const).flatMap((replacement) =>
        (
          ['transport', 'foreign', 'incomplete', 'storage', 'corrupt'] as const
        ).map((failure) => ({ replacement, failure })),
      ),
    )(
      'preserves settled update after obsolete cleanup failure $failure replacement=$replacement',
      async ({ replacement, failure }) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
        });
        const venue = setupTriggerVenue(built.clientInstance, built.bridge);
        venue.seedTrigger('stop-loss', '80000');
        const key = `${ACCOUNT.l1Address.toLowerCase()}:28:19:BTC`;
        const docKey = `lighterTpslManual:testnet:${key}`;
        const indexKey = 'lighterTpslManualIndex:testnet';
        const validBytes = JSON.stringify({
          version: 1,
          settlementKey: key,
          symbol: 'BTC',
          reason: 'Prior review',
          priorIntent: 'remove',
          priorTriggers: [],
          survivingOrderIds: ['777'],
          operationId: 'prior-operation',
          recordedAt: 5,
        });
        const bytes = failure === 'corrupt' ? 'corrupt warning' : validBytes;
        await infra.diskCache.setItem(indexKey, JSON.stringify([key]));
        await infra.diskCache.setItem(docKey, validBytes);
        let cleanup = false;
        const getItem = vi
          .spyOn(infra.diskCache, 'getItem')
          .getMockImplementation();
        if (!getItem) {
          throw new Error('Missing storage reader');
        }
        const read =
          built.clientInstance.getActiveOrders.getMockImplementation() as
            | (() => Promise<{ code: number; orders: RawTriggerOrder[] }>)
            | undefined;
        if (!read) {
          throw new Error('Missing venue reader');
        }
        built.clientInstance.getActiveOrders.mockImplementation(async () => {
          if (cleanup && failure === 'transport') {
            throw new Error('Cleanup unavailable');
          }
          if (cleanup && failure === 'incomplete') {
            return { code: 200 };
          }
          if (cleanup && failure === 'foreign') {
            return {
              code: 200,
              orders: [
                { ownerAccountIndex: 29, orderIndex: 888, marketIndex: 1 },
              ],
            };
          }
          return read();
        });
        const removeItem = vi
          .spyOn(infra.diskCache, 'removeItem')
          .getMockImplementation();
        if (!removeItem) {
          throw new Error('Missing storage remover');
        }
        vi.spyOn(infra.diskCache, 'removeItem').mockImplementation(
          async (storageKey) => {
            if (failure === 'storage' && storageKey === docKey) {
              throw new Error('Cleanup storage unavailable');
            }
            await removeItem(storageKey);
            if (
              storageKey ===
              `lighterTpslJournal:testnet:${ACCOUNT.l1Address.toLowerCase()}:28:7:BTC`
            ) {
              cleanup = true;
              if (failure === 'corrupt') {
                await infra.diskCache.setItem(docKey, bytes);
              }
            }
          },
        );
        const result = await built.provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: replacement ? '85000' : undefined,
        });
        expect(cleanup).toBe(true);
        expect(result).toStrictEqual({
          success: true,
          childOrderIds: replacement
            ? venue.rawTriggers.map((order) => String(order.orderIndex))
            : [],
        });
        expect(venue.rawTriggers).toHaveLength(replacement ? 1 : 0);
        expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(
          replacement ? 2 : 1,
        );
        expect(await getItem(docKey)).toBe(bytes);
        expect(await getItem(indexKey)).toBe(JSON.stringify([key]));
        const pending =
          failure === 'corrupt'
            ? undefined
            : await built.provider.getPendingManualRecoveries();
        expect(
          pending?.map(({ settlementKey, survivingOrderIds }) => ({
            settlementKey,
            survivingOrderIds,
          })),
        ).toStrictEqual(
          failure === 'corrupt'
            ? undefined
            : [{ settlementKey: key, survivingOrderIds: ['777'] }],
        );
        await built.provider.disconnect();
      },
    );

    it.each(['09000', '9000.0', '9e3', '9007199254740992'])(
      'retains malformed persisted previous-slot identity %s',
      async (orderId) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
        });
        const venue = setupTriggerVenue(built.clientInstance, built.bridge);
        venue.seedTrigger('stop-loss', '80000');
        venue.rawTriggers[0].type = 'limit';
        venue.rawTriggers[0].orderIndex = 9000;
        const key = `${ACCOUNT.l1Address.toLowerCase()}:28:19:BTC`;
        const docKey = `lighterTpslManual:testnet:${key}`;
        const bytes = JSON.stringify({
          version: 1,
          settlementKey: key,
          symbol: 'BTC',
          reason: 'Review',
          priorIntent: 'remove',
          priorTriggers: [{ orderId }],
          survivingOrderIds: [orderId],
          operationId: 'prior-operation',
          recordedAt: 5,
        });
        await infra.diskCache.setItem(
          'lighterTpslManualIndex:testnet',
          JSON.stringify([key]),
        );
        await infra.diskCache.setItem(docKey, bytes);
        expect(
          await built.provider.updatePositionTPSL({ symbol: 'BTC' }),
        ).toMatchObject({ success: true });
        expect(await infra.diskCache.getItem(docKey)).toBe(bytes);
        expect(venue.rawTriggers[0].orderIndex).toBe(9000);
        expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
        await built.provider.disconnect();
      },
    );

    it('reclaims interrupted previous-slot index pruning after provider restart', async () => {
      const infra = createMockInfrastructure();
      const key = `${ACCOUNT.l1Address.toLowerCase()}:28:19:BTC`;
      const unrelated = `${ACCOUNT.l1Address.toLowerCase()}:28:19:ETH`;
      const docKey = `lighterTpslManual:testnet:${key}`;
      const indexKey = 'lighterTpslManualIndex:testnet';
      await infra.diskCache.setItem(indexKey, JSON.stringify([key, unrelated]));
      await infra.diskCache.setItem(
        docKey,
        JSON.stringify({
          version: 1,
          settlementKey: key,
          symbol: 'BTC',
          reason: 'Prior review',
          priorIntent: 'remove',
          priorTriggers: [],
          survivingOrderIds: ['777'],
          operationId: 'prior-operation',
          recordedAt: 5,
        }),
      );
      const setItem = vi
        .spyOn(infra.diskCache, 'setItem')
        .getMockImplementation();
      if (!setItem) {
        throw new Error('Missing storage writer');
      }
      let interrupted = false;
      vi.spyOn(infra.diskCache, 'setItem').mockImplementation(
        async (storageKey, value) => {
          if (
            !interrupted &&
            storageKey === indexKey &&
            !(JSON.parse(value) as string[]).includes(key)
          ) {
            interrupted = true;
            throw new Error('Interrupted index pruning');
          }
          return setItem(storageKey, value);
        },
      );
      const first = buildProvider({
        platformDependencies: infra,
        registeredKey: '9c'.repeat(40),
      });
      setupTriggerVenue(first.clientInstance, first.bridge);
      const initial = await first.provider.updatePositionTPSL({
        symbol: 'BTC',
      });
      expect(interrupted).toBe(true);
      expect(await infra.diskCache.getItem(docKey)).toBeNull();
      expect(await infra.diskCache.getItem(indexKey)).toBe(
        JSON.stringify([key, unrelated]),
      );
      await first.provider.disconnect();
      const restarted = buildProvider({ platformDependencies: infra });
      Object.assign(restarted.bridge, {
        getRecoverableKeyIndices: async (): Promise<number[]> => [19, 7],
      });
      restarted.clientInstance.getApiKeys.mockResolvedValue({
        code: 200,
        apiKeys: [
          { apiKeyIndex: 19, publicKey: 'ab'.repeat(40) },
          { apiKeyIndex: 7, publicKey: '9c'.repeat(40) },
        ],
      });
      setupTriggerVenue(restarted.clientInstance, restarted.bridge);
      expect(
        await restarted.provider.updatePositionTPSL({ symbol: 'BTC' }),
      ).toMatchObject({ success: true });
      expect(await infra.diskCache.getItem(indexKey)).toBe(
        JSON.stringify([unrelated]),
      );
      expect(initial).toMatchObject({ success: true });
      expect(restarted.clientInstance.sendTx).not.toHaveBeenCalled();
      expect(
        restarted.calls.filter((call) => call.function.startsWith('_sign')),
      ).toStrictEqual([]);
      expect(
        vi.mocked(restarted.bridge).createClient.mock.lastCall,
      ).toStrictEqual([expect.objectContaining({ apiKeyIndex: 7 })]);
      await restarted.provider.disconnect();
    });

    it.each(['warning', 'journal', 'session'] as const)(
      'preserves new %s during dangling previous-slot index pruning',
      async (change) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
        });
        setupTriggerVenue(built.clientInstance, built.bridge);
        const key = `${ACCOUNT.l1Address.toLowerCase()}:28:19:BTC`;
        const docKey = `lighterTpslManual:testnet:${key}`;
        const indexKey = 'lighterTpslManualIndex:testnet';
        await infra.diskCache.setItem(indexKey, JSON.stringify([key]));
        const bytes = JSON.stringify({
          version: 1,
          settlementKey: key,
          symbol: 'BTC',
          reason: 'New warning',
          priorIntent: 'remove',
          priorTriggers: [],
          survivingOrderIds: ['777'],
          operationId: 'new-operation',
          recordedAt: 5,
        });
        const journalKey = `lighterTpslJournal:testnet:${key}`;
        const pointer = JSON.stringify({
          pointerVersion: 1,
          operationId: 'incoming-operation',
        });
        const payloadKey = `lighterTpslJournalOp:testnet:${key}:incoming-operation`;
        const payload = JSON.stringify({
          version: 4,
          recordedAt: 5,
          operationId: 'incoming-operation',
          createdAt: 5,
          nextAttemptId: 2,
          apiKeyIndex: 19,
          intent: 'remove',
          phase: 'cancelling',
          priorGrouping: 'independent',
          priorTriggers: [],
          attempts: [
            {
              kind: 'cancel',
              attemptId: 1,
              nonce: 42,
              outcome: 'unknown',
              orderId: '777',
              txHash: 'ffff00000001',
              expiresAt: 9_999_999_999_999,
              role: 'stale',
            },
          ],
        });
        const getItem = vi
          .spyOn(infra.diskCache, 'getItem')
          .getMockImplementation();
        if (!getItem) {
          throw new Error('Missing storage reader');
        }
        let settled = false;
        const removeItem = vi
          .spyOn(infra.diskCache, 'removeItem')
          .getMockImplementation();
        if (!removeItem) {
          throw new Error('Missing storage remover');
        }
        vi.spyOn(infra.diskCache, 'removeItem').mockImplementation(
          async (storageKey) => {
            await removeItem(storageKey);
            if (
              storageKey ===
              `lighterTpslManual:testnet:${ACCOUNT.l1Address.toLowerCase()}:28:7:BTC`
            ) {
              settled = true;
            }
          },
        );
        let reads = 0;
        vi.spyOn(infra.diskCache, 'getItem').mockImplementation(
          async (storageKey) => {
            if (settled && storageKey === docKey) {
              reads += 1;
              if (reads === 2) {
                if (change === 'warning') {
                  await infra.diskCache.setItem(docKey, bytes);
                }
                if (change === 'journal') {
                  await infra.diskCache.setItem(payloadKey, payload);
                  await infra.diskCache.setItem(journalKey, pointer);
                }
                if (change === 'session') {
                  await built.provider.disconnect();
                }
              }
            }
            return getItem(storageKey);
          },
        );
        const result = await built.provider.updatePositionTPSL({
          symbol: 'BTC',
        });
        expect(settled).toBe(true);
        expect(result.success).toBe(change !== 'session');
        expect(await getItem(indexKey)).toBe(JSON.stringify([key]));
        expect(await getItem(docKey)).toBe(change === 'warning' ? bytes : null);
        expect(await getItem(journalKey)).toBe(
          change === 'journal' ? pointer : null,
        );
        expect(await getItem(payloadKey)).toBe(
          change === 'journal' ? payload : null,
        );
        expect(vi.spyOn(infra.debugLogger, 'log')).not.toHaveBeenCalledWith(
          '[LighterProvider] Previous-slot warning cleanup remains pending',
          expect.anything(),
        );
        expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
        await built.provider.disconnect();
      },
    );

    it.each(['survivor', 'prior'] as const)(
      'retains a previous-slot warning while a recorded %s order stays active',
      async (recordedAs) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
        });
        const venue = setupTriggerVenue(built.clientInstance, built.bridge);
        const orderId = venue.seedTrigger('stop-loss', '80000');
        // This plain resting limit is deliberately outside protection selection.
        venue.rawTriggers[0].type = 'limit';
        const key = `${ACCOUNT.l1Address.toLowerCase()}:28:19:BTC`;
        const docKey = `lighterTpslManual:testnet:${key}`;
        const bytes = JSON.stringify({
          version: 1,
          settlementKey: key,
          symbol: 'BTC',
          reason: 'Review prior protection',
          priorIntent: 'remove',
          priorTriggers:
            recordedAs === 'prior' ? [{ orderId: String(orderId) }] : [],
          survivingOrderIds: recordedAs === 'survivor' ? [String(orderId)] : [],
          operationId: 'prior-operation',
          recordedAt: 5,
        });
        await infra.diskCache.setItem(
          'lighterTpslManualIndex:testnet',
          JSON.stringify([key]),
        );
        await infra.diskCache.setItem(docKey, bytes);
        expect(
          await built.provider.updatePositionTPSL({
            symbol: 'BTC',
            stopLossPrice: '85000',
          }),
        ).toMatchObject({ success: true });
        expect(await infra.diskCache.getItem(docKey)).toBe(bytes);
        expect(await built.provider.getPendingManualRecoveries()).toStrictEqual(
          [expect.objectContaining({ settlementKey: key })],
        );
        expect(
          venue.rawTriggers.some((row) => row.orderIndex === orderId),
        ).toBe(true);
        await built.provider.disconnect();
      },
    );

    it.each(['new-warning', 'new-journal'] as const)(
      'preserves a %s arriving during previous-slot warning reconciliation',
      async (change) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
        });
        setupTriggerVenue(built.clientInstance, built.bridge);
        const key = `${ACCOUNT.l1Address.toLowerCase()}:28:19:BTC`;
        const docKey = `lighterTpslManual:testnet:${key}`;
        const journalKey = `lighterTpslJournal:testnet:${key}`;
        const doc = {
          version: 1,
          settlementKey: key,
          symbol: 'BTC',
          reason: 'Review prior protection',
          priorIntent: 'remove',
          priorTriggers: [],
          survivingOrderIds: ['777'],
          operationId: 'prior-operation',
          recordedAt: 5,
        };
        await infra.diskCache.setItem(
          'lighterTpslManualIndex:testnet',
          JSON.stringify([key]),
        );
        await infra.diskCache.setItem(docKey, JSON.stringify(doc));
        const payloadKey = `lighterTpslJournalOp:testnet:${key}:incoming-operation`;
        const pointer = JSON.stringify({
          pointerVersion: 1,
          operationId: 'incoming-operation',
        });
        const payload = JSON.stringify({
          version: 4,
          recordedAt: 5,
          operationId: 'incoming-operation',
          createdAt: 5,
          nextAttemptId: 2,
          apiKeyIndex: 19,
          intent: 'remove',
          phase: 'cancelling',
          priorGrouping: 'independent',
          priorTriggers: [],
          attempts: [
            {
              kind: 'cancel',
              attemptId: 1,
              nonce: 42,
              outcome: 'unknown',
              orderId: '777',
              txHash: 'ffff00000001',
              expiresAt: 9_999_999_999_999,
              role: 'stale',
            },
          ],
        });
        let reads = 0;
        built.clientInstance.getActiveOrders.mockImplementation(async () => {
          reads += 1;
          if (reads === 3) {
            if (change === 'new-warning') {
              await infra.diskCache.setItem(
                docKey,
                JSON.stringify({ ...doc, operationId: 'new-operation' }),
              );
            } else {
              await infra.diskCache.setItem(payloadKey, payload);
              await infra.diskCache.setItem(journalKey, pointer);
            }
          }
          return { code: 200, orders: [] };
        });
        expect(
          (await built.provider.updatePositionTPSL({ symbol: 'BTC' })).success,
        ).toBe(true);
        expect(await infra.diskCache.getItem(docKey)).toBe(
          JSON.stringify(
            change === 'new-warning'
              ? { ...doc, operationId: 'new-operation' }
              : doc,
          ),
        );
        expect(await infra.diskCache.getItem(journalKey)).toBe(
          change === 'new-journal' ? pointer : null,
        );
        expect(vi.spyOn(infra.debugLogger, 'log')).not.toHaveBeenCalledWith(
          '[LighterProvider] Previous-slot warning cleanup remains pending',
          expect.anything(),
        );
        expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
        await built.provider.disconnect();
      },
    );

    it.each(['failed', 'incomplete', 'foreign', 'incomplete-row'] as const)(
      'preserves previous-slot warning when its final order read is %s',
      async (readMode) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
        });
        setupTriggerVenue(built.clientInstance, built.bridge);
        const key = `${ACCOUNT.l1Address.toLowerCase()}:28:19:BTC`;
        const docKey = `lighterTpslManual:testnet:${key}`;
        const bytes = JSON.stringify({
          version: 1,
          settlementKey: key,
          symbol: 'BTC',
          reason: 'Review prior protection',
          priorIntent: 'remove',
          priorTriggers: [],
          survivingOrderIds: ['777'],
          operationId: 'prior-operation',
          recordedAt: 5,
        });
        await infra.diskCache.setItem(
          'lighterTpslManualIndex:testnet',
          JSON.stringify([key]),
        );
        await infra.diskCache.setItem(docKey, bytes);
        const read =
          built.clientInstance.getActiveOrders.getMockImplementation() as
            | (() => Promise<{ code: number; orders: RawTriggerOrder[] }>)
            | undefined;
        if (!read) {
          throw new Error('Expected venue book reader');
        }
        let reads = 0;
        built.clientInstance.getActiveOrders.mockImplementation(async () => {
          reads += 1;
          if (reads === 1) {
            return read();
          }
          if (readMode === 'failed') {
            throw new Error('Order transport unavailable');
          }
          return readMode === 'incomplete'
            ? { code: 200 }
            : {
                code: 200,
                orders: [
                  {
                    ownerAccountIndex: readMode === 'foreign' ? 29 : 28,
                    orderIndex: readMode === 'foreign' ? 888 : undefined,
                    marketIndex: 1,
                  },
                ],
              };
        });
        expect(
          (await built.provider.updatePositionTPSL({ symbol: 'BTC' })).success,
        ).toBe(true);
        expect(await infra.diskCache.getItem(docKey)).toBe(bytes);
        expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
        await built.provider.disconnect();
      },
    );

    it.each([
      {
        context: 'wallet',
        title: 'the old-slot journal belongs to another wallet',
      },
      {
        context: 'account',
        title: 'the old-slot journal belongs to another account',
      },
      {
        context: 'network',
        title: 'the old-slot journal belongs to another network',
      },
      {
        context: 'symbol',
        title: 'the old-slot journal belongs to another symbol',
      },
      {
        context: 'absent',
        title: 'a matching old-slot index entry has no journal',
      },
    ] as const)(
      'allows protection changes when $title',
      async ({ context }) => {
        const infra = createMockInfrastructure();
        const address =
          context === 'wallet'
            ? '0x9999999999999999999999999999999999999999'
            : ACCOUNT.l1Address.toLowerCase();
        const sourceKey = `${address}:${context === 'account' ? 29 : 28}:19:${context === 'symbol' ? 'ETH' : 'BTC'}`;
        const network = context === 'network' ? 'mainnet' : 'testnet';
        const journalKey = `lighterTpslJournal:${network}:${sourceKey}`;
        await infra.diskCache.setItem(
          `lighterTpslJournalIndex:${network}`,
          JSON.stringify([sourceKey]),
        );
        if (context !== 'absent') {
          // Unrelated bytes must never be loaded, interpreted or discarded.
          await infra.diskCache.setItem(journalKey, 'unrelated journal');
        }
        const built = buildProvider({
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
        });
        const venue = setupTriggerVenue(built.clientInstance, built.bridge);
        const result = await built.provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '85000',
        });
        expect(result).toMatchObject({ success: true });
        expect(venue.rawTriggers).toHaveLength(1);
        expect(await infra.diskCache.getItem(journalKey)).toBe(
          context === 'absent' ? null : 'unrelated journal',
        );
        expect(
          await infra.diskCache.getItem(`lighterTpslJournalIndex:${network}`),
        ).toContain(sourceKey);
        await built.provider.disconnect();
      },
    );

    it.each(['corrupt', 'wrong-slot'] as const)(
      'preserves and blocks an old-slot %s journal before any protection signature',
      async (invalid) => {
        const infra = createMockInfrastructure();
        const sourceKey = `${ACCOUNT.l1Address.toLowerCase()}:28:19:BTC`;
        const bytes =
          invalid === 'corrupt'
            ? '{'
            : JSON.stringify({
                version: 4,
                recordedAt: 5,
                operationId: 'wrong-slot-create',
                createdAt: 5,
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
                    clientIds: [12345],
                    txHash: 'ffff00000001',
                    expiresAt: 9_999_999_999_999,
                    role: 'replacement',
                  },
                ],
              });
        await infra.diskCache.setItem(
          'lighterTpslJournalIndex:testnet',
          JSON.stringify([sourceKey]),
        );
        await infra.diskCache.setItem(
          `lighterTpslJournal:testnet:${sourceKey}`,
          bytes,
        );
        const built = buildProvider({
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
        });
        setupTriggerVenue(built.clientInstance, built.bridge);
        const result = await built.provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '85000',
        });
        expect(result.success).toBe(false);
        expect(result.error).toContain(
          invalid === 'corrupt' ? 'corrupt' : 'malformed',
        );
        expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
        expect(
          built.calls.filter((call) => call.function.startsWith('_sign')),
        ).toStrictEqual([]);
        expect(
          await infra.diskCache.getItem(
            `lighterTpslJournal:testnet:${sourceKey}`,
          ),
        ).toBe(bytes);
        await built.provider.disconnect();
      },
    );
  });

  describe('startup journal slot classification', () => {
    it('reports an unverified restored slot as unfinished, without claiming another trading key', async () => {
      const infra = createMockInfrastructure();
      const built = buildProvider({ platformDependencies: infra });
      const settlementKey = `${ACCOUNT.l1Address.toLowerCase()}:28:19:BTC`;
      await infra.diskCache.setItem(
        'lighterTpslJournalIndex:testnet',
        JSON.stringify([settlementKey]),
      );
      await infra.diskCache.setItem(
        `lighterTpslJournal:testnet:${settlementKey}`,
        JSON.stringify({
          version: 4,
          recordedAt: 5,
          operationId: 'startup-slot-19',
          createdAt: 5,
          nextAttemptId: 2,
          apiKeyIndex: 19,
          intent: 'replace',
          phase: 'creating',
          priorGrouping: 'independent',
          priorTriggers: [],
          attempts: [
            {
              kind: 'create',
              attemptId: 1,
              nonce: 42,
              outcome: 'unknown',
              clientIds: [12345],
              txHash: 'ffff00000001',
              expiresAt: 9_999_999_999_999,
              role: 'replacement',
            },
          ],
        }),
      );
      const pending = await built.provider.getPendingManualRecoveries();
      expect(pending).toHaveLength(1);
      expect(pending[0].reason).toContain('unfinished');
      expect(pending[0].reason).not.toContain('previous trading key');
    });
  });

  it.each(['creating', 'cancelling'] as const)(
    'keeps same-slot %s journals visible after failed signer setup',
    async (phase) => {
      const infra = createMockInfrastructure();
      const built = buildProvider({
        platformDependencies: infra,
        registeredKey: '9c'.repeat(40),
      });
      const settlementKey = `${ACCOUNT.l1Address.toLowerCase()}:28:7:BTC`;
      await infra.diskCache.setItem(
        'lighterTpslJournalIndex:testnet',
        JSON.stringify([settlementKey]),
      );
      await infra.diskCache.setItem(
        `lighterTpslJournal:testnet:${settlementKey}`,
        JSON.stringify({
          version: 4,
          recordedAt: 5,
          operationId: 'startup-slot-19',
          createdAt: 5,
          nextAttemptId: 2,
          apiKeyIndex: 7,
          intent: 'replace',
          phase,
          priorGrouping: 'independent',
          priorTriggers: [],
          attempts: [
            {
              kind: 'create',
              attemptId: 1,
              nonce: 42,
              outcome: 'unknown',
              clientIds: [12345],
              txHash: 'ffff00000001',
              expiresAt: 9_999_999_999_999,
              role: 'replacement',
            },
          ],
        }),
      );
      await infra.diskCache.setItem(
        'lighterNonceLedger:testnet:28:7',
        JSON.stringify({
          version: 4,
          consumedFloor: 0,
          entries: [],
          recovered: [
            {
              recoveryId: '42:beef',
              kind: 13,
              intent: 'withdraw:1',
              txHash: 'beef',
              outcome: 'unknown',
              evidence: 'rest-advance',
            },
          ],
        }),
      );
      const ready = await built.provider.isReadyToTrade();
      expect(ready.ready).toBe(false);
      const pending = await built.provider.getPendingManualRecoveries();
      expect(pending).toHaveLength(1);
      expect(pending[0].reason).toContain('unfinished');
      expect(pending[0].reason).not.toContain('previous trading key');
    },
  );
  describe('recovery inventory for absent and unsupported accounts', () => {
    it.each(
      (['empty', 'not-found', 'premium'] as const).flatMap((account) =>
        (
          [
            'getRecoveredDispatches',
            'getPendingManualRecoveries',
            'reconcileRecoveredDispatches',
          ] as const
        ).map((method) => ({ account, method })),
      ),
    )(
      'returns empty $method for expected $account account state without signer work',
      async ({ account, method }) => {
        const built = buildProvider({ configuredAccountIndex: null });
        built.clientInstance.getAccountsByL1Address.mockResolvedValue({
          code: 200,
          subAccounts:
            account === 'premium' ? [{ ...ACCOUNT, accountType: 1 }] : [],
        });
        if (account === 'not-found') {
          built.clientInstance.getAccountsByL1Address.mockRejectedValue(
            new LighterApiError('account not found', 21100),
          );
        }
        expect(await built.provider[method]()).toStrictEqual([]);
        expect(built.calls).toStrictEqual([]);
        expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
        expect(built.clientInstance.getNextNonce).not.toHaveBeenCalled();
      },
    );

    it.each(['empty', 'premium'] as const)(
      'keeps durable owned obligations visible for %s accounts',
      async (account) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          configuredAccountIndex: null,
          platformDependencies: infra,
        });
        const key = `${ACCOUNT.l1Address.toLowerCase()}:28:7:BTC`;
        await infra.diskCache.setItem(
          'lighterTpslManualIndex:testnet',
          JSON.stringify([key]),
        );
        await infra.diskCache.setItem(
          `lighterTpslManual:testnet:${key}`,
          JSON.stringify({
            version: 1,
            settlementKey: key,
            symbol: 'BTC',
            reason: 'prior protection failed',
            priorIntent: 'replace',
            priorTriggers: [],
            survivingOrderIds: ['7'],
            operationId: 'original',
            recordedAt: 1,
          }),
        );
        const ledger = JSON.stringify({
          version: 4,
          consumedFloor: 0,
          entries: [
            {
              nonce: 42,
              txHash: 'beef',
              expiresAt: 9999999999999,
              kind: 13,
              intent: 'withdraw:1',
              owner: null,
            },
          ],
          recovered: [],
        });
        await infra.diskCache.setItem(
          'lighterNonceLedger:testnet:28:7',
          ledger,
        );
        built.clientInstance.getAccountsByL1Address.mockResolvedValue({
          code: 200,
          subAccounts:
            account === 'premium' ? [{ ...ACCOUNT, accountType: 1 }] : [],
        });
        const manuals = await built.provider.getPendingManualRecoveries();
        expect(manuals).toHaveLength(1);
        expect(manuals[0].survivingOrderIds).toStrictEqual(['7']);
        const dispatches = await built.provider.getRecoveredDispatches();
        expect(dispatches).toHaveLength(1);
        expect(dispatches[0].acknowledgeable).toBe(false);
        expect(
          await built.provider.reconcileRecoveredDispatches(),
        ).toStrictEqual(dispatches);
        expect(
          await infra.diskCache.getItem('lighterNonceLedger:testnet:28:7'),
        ).toBe(ledger);
        expect(built.clientInstance.getTx).not.toHaveBeenCalled();
        expect(built.clientInstance.getNextNonce).not.toHaveBeenCalled();
        expect(built.calls).toStrictEqual([]);
      },
    );

    it.each([
      'getRecoveredDispatches',
      'getPendingManualRecoveries',
      'reconcileRecoveredDispatches',
    ] as const)('preserves transport failures from %s', async (method) => {
      const built = buildProvider({ configuredAccountIndex: null });
      built.clientInstance.getAccountsByL1Address.mockRejectedValue(
        new Error('venue transport unavailable'),
      );
      await expect(built.provider[method]()).rejects.toThrow(
        'venue transport unavailable',
      );
      expect(built.calls).toStrictEqual([]);
    });
  });

  describe('recovery inventory authority and persistence', () => {
    it.each([
      'getRecoveredDispatches',
      'getPendingManualRecoveries',
      'reconcileRecoveredDispatches',
    ] as const)(
      'surfaces local storage failures from absent-account %s',
      async (method) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          configuredAccountIndex: null,
          platformDependencies: infra,
        });
        built.clientInstance.getAccountsByL1Address.mockResolvedValue({
          code: 200,
          subAccounts: [],
        });
        vi.spyOn(infra.diskCache, 'getItem').mockRejectedValue(
          new Error('recovery storage unavailable'),
        );
        await expect(built.provider[method]()).rejects.toThrow(
          'recovery storage unavailable',
        );
        expect(built.calls).toStrictEqual([]);
      },
    );

    it.each(['unknown type', 'wrong wallet'] as const)(
      'rejects %s recovery metadata without signing',
      async (issue) => {
        const built = buildProvider({ configuredAccountIndex: null });
        built.clientInstance.getAccountsByL1Address.mockResolvedValue({
          code: 200,
          subAccounts: [
            {
              ...ACCOUNT,
              ...(issue === 'unknown type'
                ? { accountType: 99 }
                : { l1Address: '0x0000000000000000000000000000000000000002' }),
            },
          ],
        });
        await expect(built.provider.getRecoveredDispatches()).rejects.toThrow(
          issue === 'unknown type' ? 'type could not be verified' : 'not owned',
        );
        expect(built.calls).toStrictEqual([]);
      },
    );

    it('keeps Premium trading unsupported after a successful local inventory read', async () => {
      const built = buildProvider({ configuredAccountIndex: null });
      built.clientInstance.getAccountsByL1Address.mockResolvedValue({
        code: 200,
        subAccounts: [{ ...ACCOUNT, accountType: 1 }],
      });
      expect(await built.provider.getRecoveredDispatches()).toStrictEqual([]);
      const result = await built.provider.withdraw({ amount: '1' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Premium accounts are not supported');
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
      expect(built.calls).toStrictEqual([]);
    });

    it.each([
      'malformed JSON',
      'invalid identity',
      'duplicate identity',
    ] as const)(
      'rejects a %s remembered recovery account index',
      async (kind) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          configuredAccountIndex: null,
          platformDependencies: infra,
        });
        const entries = kind === 'invalid identity' ? [1.5] : [28, 28];
        await infra.diskCache.setItem(
          `lighterRecoveryAccounts:testnet:${ACCOUNT.l1Address.toLowerCase()}`,
          kind === 'malformed JSON' ? '{' : JSON.stringify(entries),
        );
        built.clientInstance.getAccountsByL1Address.mockResolvedValue({
          code: 200,
          subAccounts: [],
        });
        await expect(built.provider.getRecoveredDispatches()).rejects.toThrow(
          kind === 'malformed JSON'
            ? /JSON|property|position/u
            : 'recovery account index is corrupt',
        );
        expect(built.calls).toStrictEqual([]);
        expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
      },
    );

    it('refuses venue mutation if remembering its recovery account fails', async () => {
      const infra = createMockInfrastructure();
      const built = buildProvider({
        platformDependencies: infra,
        registeredKey: '9c'.repeat(40),
      });
      setupTriggerVenue(built.clientInstance, built.bridge);
      const write = infra.diskCache.setItem.bind(infra.diskCache);
      infra.diskCache.setItem = async (
        key: string,
        value: string,
      ): Promise<void> => {
        if (key.startsWith('lighterRecoveryAccounts:')) {
          throw new Error('recovery account persistence unavailable');
        }
        return write(key, value);
      };
      const result = await built.provider.withdraw({ amount: '1' });
      expect(result.success).toBe(false);
      expect(result.error).toContain(
        'recovery account persistence unavailable',
      );
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it('preserves nonce-only ambiguous dispatch inventory after restart and venue absence', async () => {
      const infra = createMockInfrastructure();
      const first = buildProvider({
        configuredAccountIndex: null,
        platformDependencies: infra,
        registeredKey: '9c'.repeat(40),
      });
      const venue = setupTriggerVenue(first.clientInstance, first.bridge);
      venue.failResponseOnce(13);
      expect((await first.provider.withdraw({ amount: '1' })).success).toBe(
        false,
      );
      const before = await infra.diskCache.getItem(
        'lighterNonceLedger:testnet:28:7',
      );
      expect(before).not.toBeNull();
      const restarted = buildProvider({
        configuredAccountIndex: null,
        platformDependencies: infra,
        registeredKey: '9c'.repeat(40),
      });
      restarted.clientInstance.getAccountsByL1Address.mockResolvedValue({
        code: 200,
        subAccounts: [],
      });
      const rows = await restarted.provider.getRecoveredDispatches();
      expect(rows).toHaveLength(1);
      expect(rows[0].acknowledgeable).toBe(false);
      expect(
        await restarted.provider.reconcileRecoveredDispatches(),
      ).toStrictEqual(rows);
      expect(
        await infra.diskCache.getItem('lighterNonceLedger:testnet:28:7'),
      ).toBe(before);
      expect(restarted.calls).toStrictEqual([]);
      expect(restarted.clientInstance.getTx).not.toHaveBeenCalled();
      expect(restarted.clientInstance.sendTx).not.toHaveBeenCalled();
      restarted.clientInstance.getAccountsByL1Address.mockResolvedValue({
        code: 200,
        subAccounts: [ACCOUNT],
      });
      expect(await restarted.provider.getRecoveredDispatches()).toStrictEqual(
        rows,
      );
      const original = (
        JSON.parse(before ?? '{}') as {
          entries: { nonce: number; txHash: string }[];
        }
      ).entries[0];
      restarted.clientInstance.getNextNonce.mockResolvedValue({
        code: 200,
        nonce: original.nonce + 1,
      });
      restarted.clientInstance.getTx.mockResolvedValue({
        code: 200,
        hash: original.txHash,
        accountIndex: 28,
        apiKeyIndex: 7,
        nonce: original.nonce,
        status: 1,
      });
      const retry = await restarted.provider.withdraw({ amount: '1' });
      expect(retry.success).toBe(false);
      expect(restarted.clientInstance.sendTx).not.toHaveBeenCalled();
      expect(
        await infra.diskCache.getItem('lighterNonceLedger:testnet:28:7'),
      ).toBe(before);
      expect(await restarted.provider.getRecoveredDispatches()).toStrictEqual(
        rows,
      );
      const otherNetwork = buildProvider({
        configuredAccountIndex: null,
        platformDependencies: infra,
        isTestnet: false,
      });
      otherNetwork.clientInstance.getAccountsByL1Address.mockResolvedValue({
        code: 200,
        subAccounts: [],
      });
      expect(
        await otherNetwork.provider.getRecoveredDispatches(),
      ).toStrictEqual([]);
      const otherWallet = buildProvider({
        configuredAccountIndex: null,
        platformDependencies: infra,
      });
      otherWallet.getUserAddressMock.mockReturnValue(
        '0x0000000000000000000000000000000000000002',
      );
      otherWallet.clientInstance.getAccountsByL1Address.mockResolvedValue({
        code: 200,
        subAccounts: [],
      });
      expect(await otherWallet.provider.getRecoveredDispatches()).toStrictEqual(
        [],
      );
    });
  });

  describe('recovery inventory producer authority', () => {
    it.each(['withdraw', 'setup'] as const)(
      'rejects a wrong-owner ordinary %s before caching or recording its account',
      async (operation) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          configuredAccountIndex: null,
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
        });
        setupTriggerVenue(built.clientInstance, built.bridge);
        built.clientInstance.getAccountsByL1Address.mockResolvedValue({
          code: 200,
          subAccounts: [
            {
              ...ACCOUNT,
              l1Address: '0x0000000000000000000000000000000000000002',
            },
          ],
        });

        const result =
          operation === 'withdraw'
            ? await built.provider.withdraw({ amount: '1' })
            : await built.provider.isReadyToTrade();
        expect(result.error).toContain('not owned by the selected wallet');
        expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
        expect(built.calls).toStrictEqual([]);
        expect(
          await infra.diskCache.getItem(
            `lighterRecoveryAccounts:testnet:${ACCOUNT.l1Address.toLowerCase()}`,
          ),
        ).toBeNull();

        const restarted = buildProvider({
          configuredAccountIndex: null,
          platformDependencies: infra,
        });
        restarted.clientInstance.getAccountsByL1Address.mockResolvedValue({
          code: 200,
          subAccounts: [],
        });
        expect(await restarted.provider.getRecoveredDispatches()).toStrictEqual(
          [],
        );
        expect(restarted.calls).toStrictEqual([]);
      },
    );

    it('rejects a configured response for a different account before producer setup', async () => {
      const infra = createMockInfrastructure();
      const built = buildProvider({
        platformDependencies: infra,
        registeredKey: '9c'.repeat(40),
      });
      setupTriggerVenue(built.clientInstance, built.bridge);
      built.clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [{ ...ACCOUNT, index: 29 }],
      });

      const result = await built.provider.withdraw({ amount: '1' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('account index does not match');
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
      expect(built.calls).toStrictEqual([]);
      expect(
        await infra.diskCache.getItem(
          `lighterRecoveryAccounts:testnet:${ACCOUNT.l1Address.toLowerCase()}`,
        ),
      ).toBeNull();
    });

    it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
      'rejects invalid ordinary venue index %s before producer setup',
      async (index) => {
        const built = buildProvider({ configuredAccountIndex: null });
        built.clientInstance.getAccountsByL1Address.mockResolvedValue({
          code: 200,
          subAccounts: [{ ...ACCOUNT, index }],
        });

        const result = await built.provider.isReadyToTrade();
        expect(result.ready).toBe(false);
        expect(result.error).toContain('account index is invalid');
        expect(built.calls).toStrictEqual([]);
        expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
      },
    );

    it('cannot populate cached recovery authority through a wrong-owner ordinary read', async () => {
      const built = buildProvider({ configuredAccountIndex: null });
      built.clientInstance.getAccountsByL1Address.mockResolvedValue({
        code: 200,
        subAccounts: [
          {
            ...ACCOUNT,
            l1Address: '0x0000000000000000000000000000000000000002',
          },
        ],
      });

      await expect(built.provider.getAccountState()).rejects.toThrow(
        'not owned by the selected wallet',
      );
      await expect(built.provider.getRecoveredDispatches()).rejects.toThrow(
        'not owned by the selected wallet',
      );
      expect(built.clientInstance.getAccountsByL1Address).toHaveBeenCalledTimes(
        2,
      );
      expect(built.calls).toStrictEqual([]);
    });

    it.each(['absent', 'premium'] as const)(
      'does not advertise acknowledgment of recovered outcomes for %s accounts',
      async (account) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          configuredAccountIndex: null,
          platformDependencies: infra,
        });
        const ledgerKey = 'lighterNonceLedger:testnet:28:7';
        const ledger = JSON.stringify({
          version: 4,
          consumedFloor: 42,
          entries: [],
          recovered: [
            {
              recoveryId: '42:beef',
              kind: 13,
              intent: 'withdraw:1',
              txHash: 'beef',
              outcome: 'failed',
              evidence: 'tx-status:0',
            },
          ],
        });
        await infra.diskCache.setItem(ledgerKey, ledger);
        await infra.diskCache.setItem(
          `lighterRecoveryAccounts:testnet:${ACCOUNT.l1Address.toLowerCase()}`,
          JSON.stringify([28]),
        );
        built.clientInstance.getAccountsByL1Address.mockResolvedValue({
          code: 200,
          subAccounts:
            account === 'premium' ? [{ ...ACCOUNT, accountType: 1 }] : [],
        });

        const rows = await built.provider.getRecoveredDispatches();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          outcome: 'failed',
          evidence: 'tx-status:0',
          acknowledgeable: false,
        });
        expect(
          await built.provider.reconcileRecoveredDispatches(),
        ).toStrictEqual(rows);
        await expect(
          built.provider.acknowledgeRecoveredDispatch(rows[0].recoveryId),
        ).rejects.toThrow(
          account === 'premium'
            ? 'Premium accounts'
            : 'No Lighter account exists',
        );
        expect(await infra.diskCache.getItem(ledgerKey)).toBe(ledger);
        expect(built.calls).toStrictEqual([]);
        expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
        expect(built.clientInstance.getTx).not.toHaveBeenCalled();
      },
    );
  });

  describe('account-scoped recovered outcomes', () => {
    it.each(['hash', 'account', 'slot', 'nonce', 'wallet-switch'])(
      'refuses previous-slot reconciliation with mismatched %s identity',
      async (field) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
        });
        setupTriggerVenue(built.clientInstance, built.bridge);
        const original = JSON.stringify({
          version: 4,
          consumedFloor: 0,
          entries: [
            {
              nonce: 42,
              txHash: 'beef',
              expiresAt: 9999999999999,
              kind: 13,
              intent: 'withdraw:1',
              owner: null,
            },
          ],
          recovered: [],
        });
        await infra.diskCache.setItem(
          'lighterNonceLedger:testnet:28:19',
          original,
        );
        built.clientInstance.getTx.mockImplementation(async () => {
          if (field === 'wallet-switch') {
            built.getUserAddressMock.mockReturnValue(
              '0x9999999999999999999999999999999999999999',
            );
          }
          return {
            code: 200,
            hash: field === 'hash' ? 'different' : 'beef',
            accountIndex: field === 'account' ? 29 : 28,
            apiKeyIndex: field === 'slot' ? 20 : 19,
            nonce: field === 'nonce' ? 43 : 42,
            status: 2,
          };
        });
        expect((await built.provider.isReadyToTrade()).ready).toBe(true);
        built.clientInstance.sendTx.mockClear();
        expect((await built.provider.withdraw({ amount: '1' })).success).toBe(
          false,
        );
        expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
        expect(
          await infra.diskCache.getItem('lighterNonceLedger:testnet:28:19'),
        ).toBe(original);
      },
    );

    it.each([0, 2, 1])(
      'reconciles previous-slot exact transaction status %s without blind retry',
      async (status) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
        });
        setupTriggerVenue(built.clientInstance, built.bridge);
        await infra.diskCache.setItem(
          'lighterNonceLedger:testnet:28:19',
          JSON.stringify({
            version: 4,
            consumedFloor: 0,
            entries: [
              {
                nonce: 42,
                txHash: 'beef',
                expiresAt: 9999999999999,
                kind: 13,
                intent: 'withdraw:1',
                owner: null,
              },
            ],
            recovered: [],
          }),
        );
        built.clientInstance.getTx.mockResolvedValue({
          code: 200,
          hash: 'beef',
          accountIndex: 28,
          apiKeyIndex: 19,
          nonce: 42,
          status,
        });
        const result = await built.provider.withdraw({ amount: '1' });
        expect(result.success).toBe(status === 0);
        const outcomes = await built.provider.getRecoveredDispatches();
        expect(outcomes).toHaveLength(1);
        expect(outcomes[0]).toMatchObject({
          apiKeyIndex: 19,
          outcome:
            ({ 0: 'failed', 2: 'succeeded' } as Record<number, string>)[
              status
            ] ?? 'unknown',
        });
        expect(outcomes[0].acknowledgeable).toBe(
          status === 1 ? false : undefined,
        );
      },
    );

    it.each(['network', 'account'])(
      'does not gate an unrelated %s on local dispatch obligations',
      async (scope) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
        });
        setupTriggerVenue(built.clientInstance, built.bridge);
        const key =
          scope === 'network'
            ? 'lighterNonceLedger:mainnet:28:19'
            : 'lighterNonceLedger:testnet:29:19';
        const original = JSON.stringify({
          version: 4,
          consumedFloor: 43,
          entries: [],
          recovered: [
            {
              recoveryId: '42:beef',
              kind: 13,
              intent: 'withdraw:1',
              txHash: 'beef',
              outcome: 'unknown',
              evidence: 'rest-advance',
            },
          ],
        });
        await infra.diskCache.setItem(key, original);
        expect((await built.provider.withdraw({ amount: '1' })).success).toBe(
          true,
        );
        expect(await infra.diskCache.getItem(key)).toBe(original);
      },
    );

    it.each([
      'succeeded',
      'unknown',
      'pending',
      'failed',
      'never-landed',
    ] as const)(
      'fences migrated financial writes for previous-slot %s obligations',
      async (state) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
        });
        setupTriggerVenue(built.clientInstance, built.bridge);
        const entry = {
          nonce: 42,
          txHash: 'beef',
          expiresAt: state === 'never-landed' ? 1 : 9999999999999,
          kind: 13,
          intent: 'withdraw:1',
          owner: null,
        };
        const original = JSON.stringify({
          version: 4,
          consumedFloor: 0,
          entries:
            state === 'pending' || state === 'never-landed' ? [entry] : [],
          recovered:
            state === 'pending' || state === 'never-landed'
              ? []
              : [
                  {
                    recoveryId: '42:beef',
                    kind: 13,
                    intent: 'withdraw:1',
                    txHash: 'beef',
                    outcome: state,
                    evidence: 'tx-status:2',
                  },
                ],
        });
        await infra.diskCache.setItem(
          'lighterNonceLedger:testnet:28:19',
          original,
        );
        built.clientInstance.getTx.mockResolvedValue(
          state === 'pending'
            ? {
                code: 200,
                hash: 'beef',
                accountIndex: 28,
                apiKeyIndex: 19,
                nonce: 42,
                status: 1,
              }
            : null,
        );
        expect((await built.provider.isReadyToTrade()).ready).toBe(true);
        built.clientInstance.sendTx.mockClear();
        const result = await built.provider.withdraw({ amount: '1' });
        const permitted = state === 'failed' || state === 'never-landed';
        expect(result.success).toBe(permitted);
        expect(built.clientInstance.sendTx.mock.calls.length > 0).toBe(
          permitted,
        );
        const after = await infra.diskCache.getItem(
          'lighterNonceLedger:testnet:28:19',
        );
        expect(JSON.parse(after ?? 'null')).toStrictEqual(
          state === 'never-landed'
            ? { version: 4, consumedFloor: 0, entries: [], recovered: [] }
            : JSON.parse(original),
        );
      },
    );

    it.each(['succeeded', 'unknown'] as const)(
      'releases the financial fence after scoped acknowledgment of a previous-slot %s outcome',
      async (outcome) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
        });
        setupTriggerVenue(built.clientInstance, built.bridge);
        const recovery = {
          recoveryId: '42:beef',
          kind: 13,
          intent: 'withdraw:1',
          txHash: 'beef',
          outcome,
          evidence: 'tx-status:2',
        };
        const failed = {
          ...recovery,
          recoveryId: '41:dead',
          txHash: 'dead',
          outcome: 'failed',
        };
        const key = 'lighterNonceLedger:testnet:28:19';
        await infra.diskCache.setItem(
          key,
          JSON.stringify({
            version: 4,
            consumedFloor: 43,
            entries: [],
            recovered: [recovery, failed],
          }),
        );
        const unrelatedKey = 'lighterNonceLedger:testnet:29:19';
        const unrelated = JSON.stringify({
          version: 4,
          consumedFloor: 43,
          entries: [
            {
              nonce: 43,
              txHash: 'pending',
              expiresAt: 9999999999999,
              kind: 13,
              intent: 'withdraw:1',
              owner: null,
            },
          ],
          recovered: [recovery],
        });
        await infra.diskCache.setItem(unrelatedKey, unrelated);
        expect((await built.provider.withdraw({ amount: '1' })).success).toBe(
          false,
        );
        const listed = await built.provider.getRecoveredDispatches();
        const resolved = listed.find(
          (row) => row.apiKeyIndex === 19 && row.outcome === outcome,
        );
        expect(resolved).toBeDefined();
        if (!resolved) {
          throw new Error('Expected previous-slot recovered outcome');
        }
        await built.provider.acknowledgeRecoveredDispatch(resolved.recoveryId);
        built.clientInstance.sendTx.mockClear();
        (built.bridge.execute as Mock).mockClear();
        expect((await built.provider.withdraw({ amount: '1' })).success).toBe(
          true,
        );
        expect((built.bridge.execute as Mock).mock.calls).toContainEqual([
          expect.objectContaining({ function: '_signWithdraw' }),
        ]);
        expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(1);
        expect(
          JSON.parse((await infra.diskCache.getItem(key)) ?? 'null'),
        ).toStrictEqual({
          version: 4,
          consumedFloor: 43,
          entries: [],
          recovered: [failed],
        });
        expect(await infra.diskCache.getItem(unrelatedKey)).toBe(unrelated);
      },
    );

    it('lists previous-slot outcomes and acknowledges only the exact scoped slot', async () => {
      const infra = createMockInfrastructure();
      const built = buildProvider({
        platformDependencies: infra,
        registeredKey: '9c'.repeat(40),
      });
      const outcome = {
        recoveryId: '42:beef',
        kind: 13,
        intent: 'withdraw:1',
        txHash: 'beef',
        outcome: 'unknown',
        evidence: 'rest-advance',
      };
      const original = JSON.stringify({
        version: 4,
        consumedFloor: 43,
        entries: [
          {
            nonce: 43,
            txHash: 'pending-hash',
            expiresAt: 9999999999999,
            kind: 14,
            intent: 'order:BTC',
            owner: null,
          },
        ],
        recovered: [outcome],
      });
      for (const slot of [7, 19]) {
        await infra.diskCache.setItem(
          `lighterNonceLedger:testnet:28:${slot}`,
          original,
        );
      }
      await infra.diskCache.setItem(
        'lighterNonceLedger:mainnet:28:19',
        original,
      );
      await infra.diskCache.setItem(
        'lighterNonceLedger:testnet:29:19',
        original,
      );
      const listed = await built.provider.getRecoveredDispatches();
      const pending = listed.filter((row) => row.acknowledgeable === false);
      expect(pending).toHaveLength(2);
      await expect(
        built.provider.acknowledgeRecoveredDispatch(pending[1].recoveryId),
      ).rejects.toThrow('cannot be acknowledged');
      const outcomes = listed.filter((row) => row.acknowledgeable !== false);
      expect(outcomes).toHaveLength(2);
      expect(new Set(outcomes.map((row) => row.recoveryId)).size).toBe(2);
      expect(outcomes.map((row) => row.apiKeyIndex)).toStrictEqual([7, 19]);
      expect(
        await infra.diskCache.getItem('lighterNonceLedger:testnet:28:19'),
      ).toBe(original);
      await expect(
        built.provider.acknowledgeRecoveredDispatch('42:beef'),
      ).rejects.toThrow('No pending recovered');
      const restarted = buildProvider({ platformDependencies: infra });
      expect(await restarted.provider.getRecoveredDispatches()).toStrictEqual(
        listed,
      );
      const otherNetwork = buildProvider({
        platformDependencies: infra,
        isTestnet: false,
      });
      await expect(
        otherNetwork.provider.acknowledgeRecoveredDispatch(
          outcomes[1].recoveryId,
        ),
      ).rejects.toThrow('No pending recovered');
      const otherAccount = buildProvider({
        platformDependencies: infra,
        configuredAccountIndex: 29,
      });
      otherAccount.clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [{ ...ACCOUNT, index: 29 }],
      });
      await expect(
        otherAccount.provider.acknowledgeRecoveredDispatch(
          outcomes[1].recoveryId,
        ),
      ).rejects.toThrow('No pending recovered');
      built.getUserAddressMock.mockReturnValue(
        '0x9999999999999999999999999999999999999999',
      );
      await expect(
        built.provider.acknowledgeRecoveredDispatch(outcomes[1].recoveryId),
      ).rejects.toThrow('not owned by the selected wallet');
      built.getUserAddressMock.mockReturnValue(ACCOUNT.l1Address);
      await built.provider.acknowledgeRecoveredDispatch(outcomes[1].recoveryId);
      expect(
        JSON.parse(
          (await infra.diskCache.getItem('lighterNonceLedger:testnet:28:19')) ??
            'null',
        ),
      ).toStrictEqual({
        version: 4,
        consumedFloor: 43,
        entries: [
          {
            nonce: 43,
            txHash: 'pending-hash',
            expiresAt: 9999999999999,
            kind: 14,
            intent: 'order:BTC',
            owner: null,
          },
        ],
        recovered: [],
      });
      expect(
        (await built.provider.getRecoveredDispatches())
          .filter((row) => row.acknowledgeable !== false)
          .map((row) => row.apiKeyIndex),
      ).toStrictEqual([7]);
      expect(
        await infra.diskCache.getItem('lighterNonceLedger:testnet:28:7'),
      ).toBe(original);
      expect(
        await infra.diskCache.getItem('lighterNonceLedger:mainnet:28:19'),
      ).toBe(original);
      expect(
        await infra.diskCache.getItem('lighterNonceLedger:testnet:29:19'),
      ).toBe(original);
      await expect(
        built.provider.acknowledgeRecoveredDispatch(outcomes[1].recoveryId),
      ).rejects.toThrow('No pending recovered');
    });

    it('waits for failed candidate selection before exposing account-local recovery state', async () => {
      const infra = createMockInfrastructure();
      const built = buildProvider({
        platformDependencies: infra,
        registeredKey: '9c'.repeat(40),
      });
      const entered = createDeferred<void>();
      const release = createDeferred<void>();
      Object.assign(built.bridge, {
        getRecoverableKeyIndices: async (): Promise<number[]> => {
          entered.resolve();
          await release.promise;
          throw new Error('selection failed');
        },
      });
      const setup = built.provider.isReadyToTrade();
      await entered.promise;
      let completed = false;
      const read = built.provider.getRecoveredDispatches().then((outcomes) => {
        completed = true;
        return outcomes;
      });
      await new Promise((resolveTick) => setImmediate(resolveTick));
      expect(completed).toBe(false);
      release.resolve();
      expect((await setup).ready).toBe(false);
      expect(await read).toStrictEqual([]);
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it('keeps previous-slot quarantine visible after selecting a different venue key', async () => {
      const infra = createMockInfrastructure();
      const built = buildProvider({
        platformDependencies: infra,
        registeredKey: '9c'.repeat(40),
      });
      Object.assign(built.bridge, {
        getRecoverableKeyIndices: async (): Promise<number[]> => [19, 7],
      });
      built.clientInstance.getApiKeys.mockResolvedValue({
        code: 200,
        apiKeys: [
          { apiKeyIndex: 19, publicKey: 'ab'.repeat(40) },
          { apiKeyIndex: 7, publicKey: '9c'.repeat(40) },
        ],
      });
      const original = JSON.stringify({
        version: 4,
        consumedFloor: 43,
        entries: [],
        recovered: [
          {
            recoveryId: '42:beef',
            kind: 13,
            intent: 'withdraw:1',
            txHash: 'beef',
            outcome: 'unknown',
            evidence: 'rest-advance',
          },
        ],
      });
      await infra.diskCache.setItem(
        'lighterNonceLedger:testnet:28:19',
        original,
      );
      expect((await built.provider.isReadyToTrade()).ready).toBe(true);
      const outcomes = await built.provider.getRecoveredDispatches();
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0]).toMatchObject({
        apiKeyIndex: 19,
        outcome: 'unknown',
      });
      await built.provider.acknowledgeRecoveredDispatch(outcomes[0].recoveryId);
      expect(await built.provider.getRecoveredDispatches()).toStrictEqual([]);
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
    });
  });

  describe('recovered-slot ledger binding', () => {
    it.each(['append', 'outcome'] as const)(
      'retains slot 19 during an account switch at %s',
      async (boundary) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          registeredKey: '9c'.repeat(40),
          platformDependencies: infra,
        });
        setupTriggerVenue(built.clientInstance, built.bridge);
        Object.assign(built.bridge, {
          getStoredKeyIndices: async (): Promise<number[]> => [19],
        });
        built.clientInstance.getApiKeys.mockResolvedValue({
          code: 200,
          apiKeys: [{ apiKeyIndex: 19, publicKey: '9c'.repeat(40) }],
        });
        let switched = false;
        const switchAccount = (): void => {
          switched = true;
          built.getUserAddressMock.mockReturnValue(
            '0x9999999999999999999999999999999999999999',
          );
        };
        if (boundary === 'append') {
          const realSet = (
            infra.diskCache.setItem as Mock
          ).getMockImplementation() as (
            key: string,
            value: string,
          ) => Promise<void>;
          vi.spyOn(infra.diskCache, 'setItem').mockImplementation(
            async (key, value) => {
              await realSet(key, value);
              if (
                key === 'lighterNonceLedger:testnet:28:19' &&
                (JSON.parse(value) as { entries: unknown[] }).entries.length >
                  0 &&
                !switched
              ) {
                switchAccount();
                await built.provider.getAccountState().catch(() => undefined);
              }
            },
          );
        } else {
          const realSend =
            built.clientInstance.sendTx.getMockImplementation() as (
              type: number,
              info: string,
            ) => Promise<unknown>;
          built.clientInstance.sendTx.mockImplementation(
            async (type: number, info: string) => {
              const response = await realSend(type, info);
              if (!switched) {
                switchAccount();
              }
              return response;
            },
          );
        }
        const result = await built.provider.withdraw({ amount: '25' });
        expect(result.success).toBe(false);
        const doc = JSON.parse(
          (await infra.diskCache.getItem(
            'lighterNonceLedger:testnet:28:19',
          )) as string,
        ) as { entries: unknown[]; recovered: { outcome: string }[] };
        expect(
          await infra.diskCache.getItem('lighterNonceLedger:testnet:28:7'),
        ).toBeNull();
        expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(
          boundary === 'append' ? 0 : 1,
        );
        expect(doc.entries).toHaveLength(boundary === 'append' ? 1 : 0);
        expect(doc.recovered).toHaveLength(boundary === 'append' ? 0 : 1);
        expect(doc.recovered[0]?.outcome).toBe(
          boundary === 'append' ? undefined : 'succeeded',
        );
      },
    );
  });

  describe('round-23 post-dispatch atomicity', () => {
    it('a failing recovered-outcome write after a fence-cancelled accepted dispatch keeps the ORIGINAL unresolved entry: the switch-back retry stays blocked, then reconciles', async () => {
      const registeredKey = '9c'.repeat(40);
      const infra = createMockInfrastructure();
      const built = buildProvider({
        registeredKey,
        platformDependencies: infra,
      });
      setupTriggerVenue(built.clientInstance, built.bridge);
      const otherAddress = '0x9999999999999999999999999999999999999999';
      // The venue ACCEPTS the withdraw; the wallet switches accounts
      // while the response is in flight, AND the post-dispatch ledger
      // transition (which would record the SUCCEEDED outcome) fails at
      // the disk exactly once.
      const realSend = built.clientInstance.sendTx.getMockImplementation() as (
        txType: number,
        txInfo: string,
      ) => Promise<unknown>;
      const realSet = (
        infra.diskCache.setItem as Mock
      ).getMockImplementation() as (
        key: string,
        value: string,
      ) => Promise<void>;
      let failNextLedgerWrite = false;
      (infra.diskCache.setItem as Mock).mockImplementation(
        async (key: string, value: string) => {
          if (failNextLedgerWrite && key.startsWith('lighterNonceLedger:')) {
            failNextLedgerWrite = false;
            throw new Error('storage write refused');
          }
          return await realSet(key, value);
        },
      );
      let switched = false;
      built.clientInstance.sendTx.mockImplementation(
        async (txType: number, txInfo: string) => {
          const response = await realSend(txType, txInfo);
          if (txType === 13 && !switched) {
            switched = true;
            built.getUserAddressMock.mockReturnValue(otherAddress);
            built.clientInstance.getAccountsByL1Address.mockResolvedValue({
              code: 200,
              l1Address: otherAddress,
              subAccounts: [{ ...ACCOUNT, index: 77, l1Address: otherAddress }],
            });
            // Arm the ONE-SHOT quarantine persistence failure for the
            // atomic post-dispatch transition that follows acceptance.
            failNextLedgerWrite = true;
          }
          return response;
        },
      );
      const cancelled = await built.provider.withdraw({ amount: '25' });
      expect(cancelled.success).toBe(false);
      // The transition write failed: the ORIGINAL unresolved entry must
      // remain the durable record (never consumed-first, quarantined-
      // second — that would swallow the only proof of the mutation).
      const doc = JSON.parse(
        (await infra.diskCache.getItem(
          'lighterNonceLedger:testnet:28:7',
        )) as string,
      ) as { entries: unknown[]; recovered: unknown[] };
      expect(doc.entries).toHaveLength(1);
      expect(doc.recovered).toHaveLength(0);
      // Switch BACK: the retry stays BLOCKED — the resolve pass proves
      // the exact hash landed (venue tx registry) and quarantines the
      // outcome; only per-id acknowledgment unblocks.
      built.getUserAddressMock.mockReturnValue(ACCOUNT.l1Address);
      built.clientInstance.getAccountsByL1Address.mockResolvedValue({
        code: 200,
        l1Address: ACCOUNT.l1Address,
        subAccounts: [ACCOUNT],
      });
      const retry = await built.provider.withdraw({ amount: '25' });
      expect(retry.success).toBe(false);
      expect(retry.error).toContain('actually completed');
      const outcomes = await built.provider.getRecoveredDispatches();
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0].outcome).toBe('succeeded');
      expect(outcomes[0].intent).toBe('withdraw:25');
      await built.provider.acknowledgeRecoveredDispatch(outcomes[0].recoveryId);
      expect((await built.provider.withdraw({ amount: '25' })).success).toBe(
        true,
      );
    });
  });
  describe('mainnet write parity', () => {
    it('mainnet venue writes sign and dispatch exactly like testnet (rollout gate removed)', async () => {
      const built = buildProvider({
        isTestnet: false,
        registeredKey: '9c'.repeat(40),
      });
      setupTriggerVenue(built.clientInstance, built.bridge);
      const placed = await built.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });
      expect(placed.success).toBe(true);
      expect(
        built.calls.filter((call) => call.function === '_signCreateOrder'),
      ).toHaveLength(1);
      expect(built.clientInstance.sendTx).toHaveBeenCalledWith(
        14,
        expect.stringContaining('"createOrder":true'),
      );
    });
  });
});
