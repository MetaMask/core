import { describe, expect, it, vi } from 'vitest';

import {
  ACCOUNT,
  buildProvider,
  finishPendingTimersAfterEach,
  setupTriggerVenue,
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

  describe('non-financial recovered dispatch reconciliation', () => {
    const ledgerKey = 'lighterNonceLedger:testnet:28:7';
    const entry = {
      nonce: 42,
      txHash: 'beef',
      expiresAt: 9999999999999,
      kind: 13,
      intent: 'withdraw:1',
      owner: null,
    };
    const terminal = {
      code: 200,
      hash: 'beef',
      accountIndex: 28,
      apiKeyIndex: 7,
      nonce: 42,
      status: 2,
    };
    const oldOutcome = {
      recoveryId: '40:old',
      kind: 13,
      intent: 'withdraw:old',
      txHash: 'old',
      outcome: 'unknown',
      evidence: 'rest-advance',
    };

    const parseLedger = (
      raw: string | null,
    ): { consumedFloor: number; entries: unknown[]; recovered: unknown[] } =>
      JSON.parse(raw ?? '{}') as {
        consumedFloor: number;
        entries: unknown[];
        recovered: unknown[];
      };

    async function fixture(): Promise<
      BuiltProvider & { infra: ReturnType<typeof createMockInfrastructure> }
    > {
      const infra = createMockInfrastructure();
      const built = buildProvider({ platformDependencies: infra });
      await infra.diskCache.setItem(
        ledgerKey,
        JSON.stringify({
          version: 4,
          consumedFloor: 0,
          entries: [entry],
          recovered: [],
        }),
      );
      built.clientInstance.getTx.mockResolvedValue(terminal);
      return { ...built, infra };
    }

    it.each([
      ['executed', terminal, 'succeeded'],
      ['rejected', { ...terminal, status: 0 }, 'failed'],
      ['pending', { ...terminal, status: 1 }, 'unknown'],
      ['unknown numeric status', { ...terminal, status: 999 }, 'unknown'],
      ['missing status', { ...terminal, status: undefined }, 'unknown'],
      ['string status', { ...terminal, status: '2' }, 'unknown'],
      ['wrong hash', { ...terminal, hash: 'different' }, 'unknown'],
      ['wrong account', { ...terminal, accountIndex: 99 }, 'unknown'],
      ['wrong slot', { ...terminal, apiKeyIndex: 19 }, 'unknown'],
      ['wrong nonce', { ...terminal, nonce: 43 }, 'unknown'],
    ])(
      'reconciles %s without signer or financial activity',
      async (_name, response, outcome) => {
        const built = await fixture();
        built.clientInstance.getTx.mockResolvedValue(response);
        const rows = await built.provider.reconcileRecoveredDispatches();
        const resolved = outcome !== 'unknown';
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ outcome, apiKeyIndex: 7 });
        expect(rows[0].acknowledgeable).toBe(resolved ? undefined : false);
        const doc = parseLedger(
          (await built.infra.diskCache.getItem(ledgerKey)) ?? '{}',
        );
        expect(doc.entries).toStrictEqual(resolved ? [] : [entry]);
        expect(doc.consumedFloor).toBe(resolved ? 43 : 0);
        expect(built.calls).toStrictEqual([]);
        expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
        expect(built.clientInstance.getApiKeys).not.toHaveBeenCalled();
        expect(built.clientInstance.getActiveOrders).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['hashless consumed', null, 43, 9999999999999, 1, 'unknown'],
      ['hashless unconsumed', null, 42, 1, 1, 'unknown'],
      ['absent unexpired', 'beef', 42, 9999999999999, 1, 'unknown'],
      ['absent expired', 'beef', 42, 1, 0, undefined],
      ['absent consumed', 'beef', 43, 9999999999999, 0, undefined],
    ])(
      'handles %s using exact nonce and validity evidence',
      async (_name, hash, nonce, expiry, count, outcome) => {
        const built = await fixture();
        await built.infra.diskCache.setItem(
          ledgerKey,
          JSON.stringify({
            version: 4,
            consumedFloor: 0,
            entries: [{ ...entry, txHash: hash, expiresAt: expiry }],
            recovered: [],
          }),
        );
        built.clientInstance.getNextNonce.mockResolvedValue({
          code: 200,
          nonce,
        });
        built.clientInstance.getTx.mockResolvedValue(null);
        const rows = await built.provider.reconcileRecoveredDispatches();
        expect(rows).toHaveLength(count);
        expect(rows[0]?.outcome).toBe(outcome);
        const doc = parseLedger(
          (await built.infra.diskCache.getItem(ledgerKey)) ?? '{}',
        );
        expect(doc.consumedFloor).toBe(nonce === 43 ? 43 : 0);
        expect(doc.entries).toHaveLength(
          (hash === null && nonce === 42) ||
            (hash !== null && nonce === 42 && expiry !== 1)
            ? 1
            : 0,
        );
        expect(built.calls).toStrictEqual([]);
      },
    );

    it.each([undefined, -1, Number.NaN, Infinity, '43'])(
      'rejects malformed venue nonce %s without changing the ledger',
      async (nonce) => {
        const built = await fixture();
        const before = await built.infra.diskCache.getItem(ledgerKey);
        built.clientInstance.getNextNonce.mockResolvedValue({
          code: 200,
          nonce,
        });
        await expect(
          built.provider.reconcileRecoveredDispatches(),
        ).rejects.toThrow('invalid venue nonce');
        expect(await built.infra.diskCache.getItem(ledgerKey)).toBe(before);
        expect(built.clientInstance.getTx).not.toHaveBeenCalled();
      },
    );

    it('retains lookup errors as pending, then reconciles a later exact success', async () => {
      const built = await fixture();
      const before = await built.infra.diskCache.getItem(ledgerKey);
      built.clientInstance.getTx.mockRejectedValueOnce(new Error('HTTP 503'));
      expect(await built.provider.reconcileRecoveredDispatches()).toStrictEqual(
        [expect.objectContaining({ acknowledgeable: false })],
      );
      expect(await built.infra.diskCache.getItem(ledgerKey)).toBe(before);
      expect(await built.provider.reconcileRecoveredDispatches()).toStrictEqual(
        [expect.objectContaining({ outcome: 'succeeded' })],
      );
    });

    it('continues across quarantines and ambiguous slots, preserving owned entries and journals', async () => {
      const built = await fixture();
      const owned = { ...entry, nonce: 44, txHash: 'owned', owner: 'journal' };
      const ownedKey = 'lighterNonceLedger:testnet:28:20';
      const ownedBytes = JSON.stringify({
        version: 4,
        consumedFloor: 0,
        entries: [owned],
        recovered: [],
      });
      await built.infra.diskCache.setItem(
        ledgerKey,
        JSON.stringify({
          version: 4,
          consumedFloor: 41,
          entries: [entry, owned],
          recovered: [oldOutcome],
        }),
      );
      await built.infra.diskCache.setItem(
        'lighterNonceLedger:testnet:28:19',
        JSON.stringify({
          version: 4,
          consumedFloor: 0,
          entries: [{ ...entry, txHash: 'later' }],
          recovered: [],
        }),
      );
      await built.infra.diskCache.setItem(ownedKey, ownedBytes);
      await built.infra.diskCache.setItem(
        'lighterTpslJournal:testnet:journal',
        'untouched',
      );
      built.clientInstance.getTx.mockImplementation(async (hash: string) =>
        hash === 'later'
          ? { ...terminal, hash, apiKeyIndex: 19 }
          : { ...terminal, status: 1 },
      );
      const rows = await built.provider.reconcileRecoveredDispatches();
      expect(rows).toHaveLength(5);
      expect(rows).toContainEqual(
        expect.objectContaining({ outcome: 'succeeded', apiKeyIndex: 19 }),
      );
      expect(rows).toContainEqual(
        expect.objectContaining({
          outcome: 'unknown',
          evidence: 'rest-advance',
        }),
      );
      expect(await built.infra.diskCache.getItem(ownedKey)).toBe(ownedBytes);
      expect(
        await built.infra.diskCache.getItem(
          'lighterTpslJournal:testnet:journal',
        ),
      ).toBe('untouched');
      expect(
        (built.clientInstance.getTx.mock.calls as [string][]).map(
          ([hash]) => hash,
        ),
      ).toStrictEqual(['beef', 'later']);
      expect(built.calls).toStrictEqual([]);
    });

    it.each(['corrupt', 'full', 'write-error', 'nonce-error', 'read-error'])(
      'surfaces %s while preserving the original dispatch',
      async (failure) => {
        const built = await fixture();
        if (failure === 'corrupt') {
          await built.infra.diskCache.setItem(ledgerKey, '{broken');
        }
        if (failure === 'full') {
          await built.infra.diskCache.setItem(
            ledgerKey,
            JSON.stringify({
              version: 4,
              consumedFloor: 0,
              entries: [entry],
              recovered: Array.from({ length: 32 }, (_, index) => ({
                ...oldOutcome,
                recoveryId: `${index}:old`,
              })),
            }),
          );
        }
        const before = await built.infra.diskCache.getItem(ledgerKey);
        if (failure === 'write-error') {
          vi.spyOn(built.infra.diskCache, 'setItem').mockRejectedValueOnce(
            new Error('disk failed'),
          );
        }
        if (failure === 'nonce-error') {
          built.clientInstance.getNextNonce.mockRejectedValueOnce(
            new Error('nonce failed'),
          );
        }
        if (failure === 'read-error') {
          vi.spyOn(built.infra.diskCache, 'getItem').mockRejectedValueOnce(
            new Error('disk read failed'),
          );
        }
        await expect(
          built.provider.reconcileRecoveredDispatches(),
        ).rejects.toThrow(/corrupt|full|failed/u);
        expect(await built.infra.diskCache.getItem(ledgerKey)).toBe(before);
        expect(built.calls).toStrictEqual([]);
      },
    );

    it.each(
      ['nonce', 'transaction', 'read', 'write'].flatMap((boundary) =>
        ['switch', 'deselect', 'reset', 'disconnect'].map((change) => [
          boundary,
          change,
        ]),
      ),
    )('fences the %s await after %s', async (boundary, change) => {
      const built = await fixture();
      const held = createDeferred<void>();
      const entered = createDeferred<void>();
      const before = await built.infra.diskCache.getItem(ledgerKey);
      const switchAfter = async <Result>(result: Result): Promise<Result> => {
        entered.resolve();
        await held.promise;
        return result;
      };
      if (boundary === 'nonce') {
        built.clientInstance.getNextNonce.mockImplementationOnce(() =>
          switchAfter({ code: 200, nonce: 42 }),
        );
      }
      if (boundary === 'transaction') {
        built.clientInstance.getTx.mockImplementationOnce(() =>
          switchAfter(terminal),
        );
      }
      if (boundary === 'read') {
        const get = vi
          .spyOn(built.infra.diskCache, 'getItem')
          .getMockImplementation() as (key: string) => Promise<string | null>;
        vi.spyOn(built.infra.diskCache, 'getItem').mockImplementation(
          async (key) =>
            key === ledgerKey ? switchAfter(await get(key)) : get(key),
        );
      }
      if (boundary === 'write') {
        const set = vi
          .spyOn(built.infra.diskCache, 'setItem')
          .getMockImplementation() as (
          key: string,
          value: string,
        ) => Promise<void>;
        vi.spyOn(built.infra.diskCache, 'setItem').mockImplementation(
          async (key, value) => {
            await switchAfter(undefined);
            await set(key, value);
          },
        );
      }
      const pending = built.provider
        .reconcileRecoveredDispatches()
        .catch((error: unknown) => error);
      await entered.promise;
      if (change === 'switch') {
        built.getUserAddressMock.mockReturnValue(
          '0x0000000000000000000000000000000000000099',
        );
      }
      if (change === 'deselect') {
        built.getUserAddressMock.mockImplementation(() => {
          throw new Error('no wallet');
        });
      }
      if (change === 'reset') {
        built.fireReset();
      }
      if (change === 'disconnect') {
        await built.provider.disconnect();
      }
      held.resolve();
      const failure = await pending;
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toMatch(
        /switch|session|account|disconnect/u,
      );
      const after = await built.infra.diskCache.getItem(ledgerKey);
      expect(
        boundary === 'write' ? parseLedger(after).recovered.length : after,
      ).toBe(boundary === 'write' ? 1 : before);
      expect(
        await built.infra.diskCache.getItem('lighterNonceLedger:testnet:99:7'),
      ).toBeNull();
      expect(built.calls).toStrictEqual([]);
    });

    it('serializes two provider instances and acknowledgment without losing recovered rows', async () => {
      const built = await fixture();
      await built.infra.diskCache.setItem(
        ledgerKey,
        JSON.stringify({
          version: 4,
          consumedFloor: 41,
          entries: [entry],
          recovered: [oldOutcome],
        }),
      );
      const second = buildProvider({ platformDependencies: built.infra });
      second.clientInstance.getTx.mockResolvedValue(terminal);
      const held = createDeferred<void>();
      const entered = createDeferred<void>();
      built.clientInstance.getTx.mockImplementationOnce(async () => {
        entered.resolve();
        await held.promise;
        return terminal;
      });
      const pending = built.provider.reconcileRecoveredDispatches();
      await entered.promise;
      const concurrent = second.provider.reconcileRecoveredDispatches();
      const ack = second.provider.acknowledgeRecoveredDispatch('40:old');
      held.resolve();
      await Promise.all([pending, concurrent, ack]);
      const rows = await second.provider.getRecoveredDispatches();
      expect(rows).toHaveLength(1);
      expect(rows[0].outcome).toBe('succeeded');
      expect(built.clientInstance.getTx).toHaveBeenCalledTimes(1);
      expect(second.clientInstance.getTx).not.toHaveBeenCalled();
    });
    it('waits for an in-flight financial send and its durable post-dispatch transition', async () => {
      const infra = createMockInfrastructure();
      const built = buildProvider({
        platformDependencies: infra,
        registeredKey: '9c'.repeat(40),
      });
      setupTriggerVenue(built.clientInstance, built.bridge);
      await built.provider.getOpenOrders();
      const send = built.clientInstance.sendTx.getMockImplementation() as (
        kind: number,
        info: string,
      ) => Promise<unknown>;
      const entered = createDeferred<void>();
      const held = createDeferred<void>();
      built.clientInstance.sendTx.mockImplementationOnce(
        async (kind: number, info: string) => {
          entered.resolve();
          await held.promise;
          return send(kind, info);
        },
      );
      const order = built.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });
      await entered.promise;
      expect(
        parseLedger(await infra.diskCache.getItem(ledgerKey)).entries,
      ).toHaveLength(1);
      const nonceCalls = built.clientInstance.getNextNonce.mock.calls.length;
      const reconcile = built.provider.reconcileRecoveredDispatches();
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(built.clientInstance.getNextNonce).toHaveBeenCalledTimes(
        nonceCalls,
      );
      expect(built.clientInstance.getTx).not.toHaveBeenCalled();
      held.resolve();
      expect((await order).success).toBe(true);
      expect(await reconcile).toStrictEqual([]);
      expect(
        parseLedger(await infra.diskCache.getItem(ledgerKey)).entries,
      ).toStrictEqual([]);
    });

    it.each(['switch', 'deselect', 'reset', 'disconnect', 'round-trip'])(
      'fences %s while queued for the venue lock',
      async (change) => {
        const built = await fixture();
        const second = buildProvider({ platformDependencies: built.infra });
        const held = createDeferred<void>();
        const entered = createDeferred<void>();
        built.clientInstance.getTx.mockImplementationOnce(async () => {
          entered.resolve();
          await held.promise;
          return terminal;
        });
        const first = built.provider.reconcileRecoveredDispatches();
        await entered.promise;
        // Establish the second provider binding before its queued operation.
        await second.provider.getRecoveredDispatches();
        const pending = second.provider
          .reconcileRecoveredDispatches()
          .catch((error: unknown) => error);
        await Promise.resolve();
        await Promise.resolve();
        if (change === 'switch' || change === 'round-trip') {
          second.getUserAddressMock.mockReturnValue(
            '0x0000000000000000000000000000000000000099',
          );
        }
        if (change === 'deselect') {
          second.getUserAddressMock.mockImplementation(() => {
            throw new Error('no wallet');
          });
        }
        if (change === 'reset') {
          second.fireReset();
        }
        if (change === 'disconnect') {
          await second.provider.disconnect();
        }
        if (change === 'round-trip') {
          await second.provider.getRecoveredDispatches().catch(() => undefined);
          second.getUserAddressMock.mockReturnValue(ACCOUNT.l1Address);
          await second.provider.getRecoveredDispatches();
        }
        held.resolve();
        await first;
        const failure = await pending;
        expect(failure).toBeInstanceOf(Error);
        expect((failure as Error).message).toMatch(
          /switch|session|account|disconnect/u,
        );
        expect(second.clientInstance.getNextNonce).not.toHaveBeenCalled();
        expect(second.calls).toStrictEqual([]);
      },
    );

    it('captures the original session before account lookup and rejects an account switch', async () => {
      const infra = createMockInfrastructure();
      const built = buildProvider({
        platformDependencies: infra,
        configuredAccountIndex: null,
      });
      const entered = createDeferred<void>();
      const held = createDeferred<void>();
      built.clientInstance.getAccountsByL1Address.mockImplementationOnce(
        async () => {
          entered.resolve();
          await held.promise;
          return { code: 200, subAccounts: [ACCOUNT] };
        },
      );
      const pending = built.provider
        .reconcileRecoveredDispatches()
        .catch((error: unknown) => error);
      await entered.promise;
      built.getUserAddressMock.mockReturnValue(
        '0x0000000000000000000000000000000000000099',
      );
      held.resolve();
      const failure = await pending;
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toMatch(/switch|session|account/u);
      expect(built.clientInstance.getNextNonce).not.toHaveBeenCalled();
      expect(vi.spyOn(infra.diskCache, 'setItem')).not.toHaveBeenCalled();
      expect(built.calls).toStrictEqual([]);
    });

    it('rejects a wallet deselection during the final local listing', async () => {
      const built = await fixture();
      const get = vi
        .spyOn(built.infra.diskCache, 'getItem')
        .getMockImplementation() as (key: string) => Promise<string | null>;
      let ledgerReads = 0;
      vi.spyOn(built.infra.diskCache, 'getItem').mockImplementation(
        async (key) => {
          const value = await get(key);
          if (key === ledgerKey) {
            ledgerReads += 1;
          }
          if (key === ledgerKey && ledgerReads === 2) {
            built.getUserAddressMock.mockImplementation(() => {
              throw new Error('deselected');
            });
          }
          return value;
        },
      );
      await expect(
        built.provider.reconcileRecoveredDispatches(),
      ).rejects.toThrow(/session|account|wallet/u);
      expect(parseLedger(await get(ledgerKey)).recovered).toHaveLength(1);
      expect(built.calls).toStrictEqual([]);
    });

    it('keeps identical account and slot numbers isolated across networks', async () => {
      const built = await fixture();
      const mainnet = buildProvider({
        platformDependencies: built.infra,
        isTestnet: false,
      });
      const mainKey = 'lighterNonceLedger:mainnet:28:7';
      const mainBytes = JSON.stringify({
        version: 4,
        consumedFloor: 0,
        entries: [{ ...entry, txHash: 'main' }],
        recovered: [],
      });
      await built.infra.diskCache.setItem(mainKey, mainBytes);
      const rows = await built.provider.reconcileRecoveredDispatches();
      expect(rows[0].recoveryId).toContain('testnet');
      expect(await built.infra.diskCache.getItem(mainKey)).toBe(mainBytes);
      mainnet.clientInstance.getTx.mockResolvedValue({
        ...terminal,
        hash: 'main',
        status: 0,
      });
      const mainRows = await mainnet.provider.reconcileRecoveredDispatches();
      expect(mainRows[0]).toMatchObject({ outcome: 'failed' });
      expect(mainRows[0].recoveryId).toContain('mainnet');
      expect((await built.provider.getRecoveredDispatches())[0].outcome).toBe(
        'succeeded',
      );
    });

    it('works after failed signer setup without another bridge attempt', async () => {
      const built = await fixture();
      const execute = vi
        .spyOn(built.bridge, 'execute')
        .mockRejectedValue(new Error('signer unavailable'));
      expect(await built.provider.getOpenOrders()).toStrictEqual([]);
      expect(execute).toHaveBeenCalled();
      const bridgeCalls = execute.mock.calls.length;
      expect(await built.provider.reconcileRecoveredDispatches()).toStrictEqual(
        [expect.objectContaining({ outcome: 'succeeded' })],
      );
      expect(execute).toHaveBeenCalledTimes(bridgeCalls);
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it('does not advance memory reservations when persistence fails', async () => {
      const infra = createMockInfrastructure();
      const built = buildProvider({
        platformDependencies: infra,
        registeredKey: '9c'.repeat(40),
      });
      setupTriggerVenue(built.clientInstance, built.bridge);
      await built.provider.getOpenOrders();
      await infra.diskCache.setItem(
        ledgerKey,
        JSON.stringify({
          version: 4,
          consumedFloor: 0,
          entries: [{ ...entry, expiresAt: 1 }],
          recovered: [],
        }),
      );
      built.clientInstance.getTx.mockResolvedValue(terminal);
      vi.spyOn(infra.diskCache, 'setItem').mockRejectedValueOnce(
        new Error('disk failed'),
      );
      await expect(
        built.provider.reconcileRecoveredDispatches(),
      ).rejects.toThrow('disk failed');
      built.clientInstance.getTx.mockResolvedValue(null);
      const second = buildProvider({ platformDependencies: infra });
      second.clientInstance.getTx.mockResolvedValue(null);
      expect(
        await second.provider.reconcileRecoveredDispatches(),
      ).toStrictEqual([]);
      const result = await built.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });
      expect(result.success).toBe(true);
      const signed = built.calls
        .filter((call) => call.function === '_signCreateOrder')
        .at(-1);
      expect(signed).toBeDefined();
      // The nonce is encoded by the real test bridge in the sent transaction.
      const sent = (
        built.clientInstance.sendTx.mock.calls as [number, string][]
      ).at(-1);
      expect((JSON.parse(String(sent?.[1])) as { Nonce: number }).Nonce).toBe(
        42,
      );
    });
  });
  describe('strict recovery venue review', () => {
    it('does not kick a pending current-slot journal after detached timers run', async () => {
      const infra = createMockInfrastructure();
      const built = buildProvider({
        platformDependencies: infra,
        registeredKey: '9c'.repeat(40),
      });
      const key = `${ACCOUNT.l1Address.toLowerCase()}:28:7:BTC`;
      const bytes = JSON.stringify({
        version: 4,
        operationId: 'pending',
        recordedAt: 1,
        createdAt: 1,
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
            outcome: 'unknown',
            clientIds: [12345],
            txHash: 'abcd1234',
            expiresAt: 9_999_999_999_999,
            role: 'replacement',
          },
        ],
      });
      await infra.diskCache.setItem(
        'lighterTpslJournalIndex:testnet',
        JSON.stringify([key]),
      );
      await infra.diskCache.setItem(`lighterTpslJournal:testnet:${key}`, bytes);
      await built.provider.reviewRecoveryVenue();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(
        await infra.diskCache.getItem(`lighterTpslJournal:testnet:${key}`),
      ).toBe(bytes);
      expect(built.clientInstance.getTx).not.toHaveBeenCalled();
      expect(built.clientInstance.getActiveOrders).toHaveBeenCalledTimes(1);
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it.each(['auth', 'orders', 'metadata'] as const)(
      'rejects an account switch during the %s review boundary',
      async (boundary) => {
        const built = buildProvider({ registeredKey: '9c'.repeat(40) });
        const entered = createDeferred<void>();
        const release = createDeferred<void>();
        if (boundary === 'auth') {
          const execute = vi
            .spyOn(built.bridge, 'execute')
            .getMockImplementation();
          if (!execute) {
            throw new Error('Missing signer implementation');
          }
          vi.spyOn(built.bridge, 'execute').mockImplementation(async (call) => {
            if (call.function === '_createAuthToken') {
              entered.resolve();
              await release.promise;
            }
            const result = await execute?.(call);
            if (!result) {
              throw new Error('Missing fixture signer');
            }
            return result;
          });
        } else if (boundary === 'orders') {
          built.clientInstance.getActiveOrders.mockImplementationOnce(
            async () => {
              entered.resolve();
              await release.promise;
              return { code: 200, orders: [] };
            },
          );
        } else {
          built.clientInstance.getOrderBookDetails.mockImplementationOnce(
            async () => {
              entered.resolve();
              await release.promise;
              return { code: 200, orderBookDetails: [] };
            },
          );
        }
        const pending = built.provider.reviewRecoveryVenue();
        const rejection = pending.catch((error: unknown) => error);
        await entered.promise;
        built.getUserAddressMock.mockReturnValue(
          '0x9999999999999999999999999999999999999999',
        );
        release.resolve();
        expect(await rejection).toBeInstanceOf(Error);
        expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
        expect(
          built.calls.some((call) => call.function === '_signChangePubKey'),
        ).toBe(false);
      },
    );

    it('reviews a quarantined account using only a matching registered key and auth signing', async () => {
      const infra = createMockInfrastructure();
      const built = buildProvider({
        platformDependencies: infra,
        registeredKey: '9c'.repeat(40),
      });
      const key = 'lighterNonceLedger:testnet:28:7';
      const bytes = JSON.stringify({
        version: 4,
        consumedFloor: 43,
        entries: [],
        recovered: [
          {
            recoveryId: '42:beef',
            kind: 13,
            intent: 'withdraw:1',
            txHash: 'beef',
            outcome: 'succeeded',
            evidence: 'tx-status:2',
          },
        ],
      });
      await infra.diskCache.setItem(key, bytes);
      const result = await built.provider.reviewRecoveryVenue();
      expect(result.status).toBe('ready');
      expect(result.providerId).toBe('lighter');
      if (result.status !== 'ready') {
        throw new Error('Expected authoritative review');
      }
      expect(result.positions).toHaveLength(1);
      expect(result.orders).toHaveLength(1);
      expect(built.calls.map((call) => call.function)).toStrictEqual([
        '_createClient',
        '_createAuthToken',
      ]);
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
      expect(await infra.diskCache.getItem(key)).toBe(bytes);
    });

    it('rejects when no local registered key matches without registering one', async () => {
      const built = buildProvider({ registeredKey: 'aa'.repeat(40) });
      await expect(built.provider.reviewRecoveryVenue()).rejects.toThrow(
        /matching.*key/u,
      );
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
      expect(
        built.calls.some((call) => call.function === '_signChangePubKey'),
      ).toBe(false);
    });

    it.each(['account', 'orders', 'metadata', 'auth'])(
      'surfaces strict %s failures',
      async (boundary) => {
        const built = buildProvider({ registeredKey: '9c'.repeat(40) });
        if (boundary === 'account') {
          built.clientInstance.getAccountByIndex.mockRejectedValue(
            new Error('review account failure'),
          );
        }
        if (boundary === 'orders') {
          built.clientInstance.getActiveOrders.mockRejectedValue(
            new Error('review orders failure'),
          );
        }
        if (boundary === 'metadata') {
          built.clientInstance.getOrderBookDetails.mockRejectedValue(
            new Error('review metadata failure'),
          );
        }
        if (boundary === 'auth') {
          vi.spyOn(built.bridge, 'execute').mockRejectedValue(
            new Error('review auth failure'),
          );
        }
        await expect(built.provider.reviewRecoveryVenue()).rejects.toThrow(
          /review.*failure/u,
        );
        expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
      },
    );

    it.each(
      [
        [],
        [{ ...ACCOUNT, index: 99 }],
        [ACCOUNT, ACCOUNT],
        [{ ...ACCOUNT, positions: undefined }],
      ].map((accounts) => ({ accounts })),
    )(
      'rejects unavailable or malformed account identity %j',
      async ({ accounts }) => {
        const built = buildProvider({ registeredKey: '9c'.repeat(40) });
        built.clientInstance.getAccountByIndex
          .mockResolvedValueOnce({ code: 200, accounts: [ACCOUNT] })
          .mockResolvedValue({ code: 200, accounts });
        await expect(built.provider.reviewRecoveryVenue()).rejects.toThrow(
          /account/u,
        );
        expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
      },
    );
  });

  describe('selected durable protection resolution', () => {
    it.each(['payload', 'pointer', 'source'] as const)(
      'recovers an interrupted terminal %s removal with exact cleanup',
      async (boundary) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
        });
        const venue = setupTriggerVenue(built.clientInstance, built.bridge);
        const key = `${ACCOUNT.l1Address.toLowerCase()}:28:19:BTC`;
        const sourceKey = `lighterTpslManual:testnet:${key}`;
        const target = `${ACCOUNT.l1Address.toLowerCase()}:28:7:BTC`;
        await infra.diskCache.setItem(
          'lighterTpslManualIndex:testnet',
          JSON.stringify([key]),
        );
        await infra.diskCache.setItem(
          sourceKey,
          JSON.stringify({
            version: 1,
            settlementKey: key,
            symbol: 'BTC',
            reason: 'manual',
            priorIntent: 'replace',
            priorTriggers: [],
            survivingOrderIds: [],
            operationId: 'source',
            recordedAt: 1,
          }),
        );
        const remove = vi.spyOn(infra.diskCache, 'removeItem');
        const realRemove = remove.getMockImplementation();
        if (!realRemove) {
          throw new Error('Missing storage implementation');
        }
        let failed = false;
        remove.mockImplementation(async (storageKey) => {
          const matches = {
            source: storageKey === sourceKey,
            pointer: storageKey === `lighterTpslJournal:testnet:${target}`,
            payload: storageKey.startsWith(
              `lighterTpslJournalOp:testnet:${target}:`,
            ),
          }[boundary];
          if (!failed && matches) {
            failed = true;
            throw new Error('terminal storage interrupted');
          }
          return realRemove(storageKey);
        });
        const recoveryId = `lighter-protection:${JSON.stringify(['testnet', ACCOUNT.l1Address.toLowerCase(), 28, 19, 'BTC', 'source'])}`;
        const first = await built.provider.resolveRecoveryProtection({
          recoveryId,
          symbol: 'BTC',
          stopLossPrice: '85000',
        });
        expect(failed).toBe(true);
        expect(first.success).toBe(false);
        const restarted = buildProvider({
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
        });
        expect(
          (
            await restarted.provider.resolveRecoveryProtection({
              recoveryId,
              symbol: 'BTC',
              stopLossPrice: '85000',
            })
          ).success,
        ).toBe(true);
        expect(
          await infra.diskCache.getItem(`lighterTpslJournal:testnet:${target}`),
        ).toBeNull();
        expect(await infra.diskCache.getItem(sourceKey)).toBeNull();
        expect(restarted.clientInstance.sendTx).not.toHaveBeenCalled();
        expect(venue.rawTriggers).toHaveLength(1);
      },
    );

    it.each([
      'sourceRecoveryOperationId',
      'sourceRecoverySettlementKey',
    ] as const)('rejects a half-linked journal missing %s', async (missing) => {
      const infra = createMockInfrastructure();
      const built = buildProvider({
        platformDependencies: infra,
        registeredKey: '9c'.repeat(40),
      });
      const key = `${ACCOUNT.l1Address.toLowerCase()}:28:19:BTC`;
      const source = {
        version: 4,
        operationId: 'original',
        sourceRecoveryOperationId: 'source',
        sourceRecoverySettlementKey: key,
        recordedAt: 1,
        createdAt: 1,
        nextAttemptId: 2,
        apiKeyIndex: 19,
        intent: 'replace',
        phase: 'manual',
        priorGrouping: 'independent',
        priorTriggers: [],
        attempts: [
          {
            kind: 'create',
            attemptId: 1,
            nonce: 42,
            outcome: 'unknown',
            clientIds: [12345],
            txHash: 'abcd1234',
            expiresAt: 9_999_999_999_999,
            role: 'replacement',
          },
        ],
      };
      const bytes = JSON.stringify({ ...source, [missing]: undefined });
      await infra.diskCache.setItem(
        'lighterTpslJournalIndex:testnet',
        JSON.stringify([key]),
      );
      await infra.diskCache.setItem(`lighterTpslJournal:testnet:${key}`, bytes);
      await expect(built.provider.getPendingManualRecoveries()).rejects.toThrow(
        /malformed/u,
      );
      expect(
        await infra.diskCache.getItem(`lighterTpslJournal:testnet:${key}`),
      ).toBe(bytes);
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it('keeps the ready slot when registered discovery lists another matching key first', async () => {
      const infra = createMockInfrastructure();
      const built = buildProvider({
        platformDependencies: infra,
        registeredKey: '9c'.repeat(40),
      });
      setupTriggerVenue(built.clientInstance, built.bridge);
      await built.provider.getOpenOrders();
      built.clientInstance.getApiKeys.mockResolvedValue({
        code: 200,
        apiKeys: [3, 7].map((apiKeyIndex) => ({
          accountIndex: 28,
          apiKeyIndex,
          publicKey: '9c'.repeat(40),
          nonce: 1,
        })),
      });
      Object.assign(built.bridge, {
        getRecoverableKeyIndices: async (): Promise<number[]> => [3, 7],
      });
      const key = `${ACCOUNT.l1Address.toLowerCase()}:28:19:BTC`;
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
          reason: 'manual',
          priorIntent: 'replace',
          priorTriggers: [],
          survivingOrderIds: [],
          operationId: 'source',
          recordedAt: 1,
        }),
      );
      const recoveryId = `lighter-protection:${JSON.stringify(['testnet', ACCOUNT.l1Address.toLowerCase(), 28, 19, 'BTC', 'source'])}`;
      expect(
        (
          await built.provider.resolveRecoveryProtection({
            recoveryId,
            symbol: 'BTC',
            stopLossPrice: '85000',
          })
        ).success,
      ).toBe(true);
      expect(
        built.calls.filter((call) => call.function === '_createClient').at(-1)
          ?.params[3],
      ).toBe(7);
      expect(
        (
          await built.provider.updatePositionTPSL({
            symbol: 'BTC',
            stopLossPrice: '86000',
          })
        ).success,
      ).toBe(true);
      expect(
        built.calls.filter((call) => call.function === '_createClient').at(-1)
          ?.params[3],
      ).toBe(7);
    });

    it.each([1, 2])(
      'requires executed original evidence when books match status %s',
      async (status) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
        });
        const venue = setupTriggerVenue(built.clientInstance, built.bridge);
        const id = venue.seedTrigger('stop-loss', '80000');
        const key = `${ACCOUNT.l1Address.toLowerCase()}:28:19:BTC`;
        const bytes = JSON.stringify({
          version: 4,
          operationId: 'original',
          recordedAt: 1,
          createdAt: 1,
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
              clientIds: [id],
              txHash: 'abcd1234',
              expiresAt: 9_999_999_999_999,
              role: 'replacement',
            },
          ],
        });
        await infra.diskCache.setItem(
          'lighterTpslJournalIndex:testnet',
          JSON.stringify([key]),
        );
        await infra.diskCache.setItem(
          `lighterTpslJournal:testnet:${key}`,
          bytes,
        );
        built.clientInstance.getTx.mockResolvedValue({
          hash: 'abcd1234',
          accountIndex: 28,
          apiKeyIndex: 19,
          nonce: 42,
          status,
        });
        const recoveryId = `lighter-protection:${JSON.stringify(['testnet', ACCOUNT.l1Address.toLowerCase(), 28, 19, 'BTC', 'original'])}`;
        expect(
          (
            await built.provider.resolveRecoveryProtection({
              recoveryId,
              symbol: 'BTC',
              stopLossPrice: '85000',
            })
          ).success,
        ).toBe(status === 2);
        expect(built.clientInstance.sendTx.mock.calls.length > 0).toBe(
          status === 2,
        );
      },
    );

    it.each([false, true])(
      'finishes interrupted settled cleanup while preserving newer=%s records',
      async (newer) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
        });
        setupTriggerVenue(built.clientInstance, built.bridge);
        const source = `${ACCOUNT.l1Address.toLowerCase()}:28:19:BTC`;
        const target = `${ACCOUNT.l1Address.toLowerCase()}:28:7:BTC`;
        const recoveryId = `lighter-protection:${JSON.stringify(['testnet', ACCOUNT.l1Address.toLowerCase(), 28, 19, 'BTC', 'source'])}`;
        await infra.diskCache.setItem(
          `lighterTpslSuccessor:testnet:${source}:source`,
          JSON.stringify({
            version: 1,
            sourceSettlementKey: source,
            sourceOperationId: 'source',
            successorSettlementKey: target,
            successorOperationId: 'successor',
            state: 'settled',
            ownedOrderIds: [],
          }),
        );
        await infra.diskCache.setItem(
          'lighterTpslJournalIndex:testnet',
          JSON.stringify([target]),
        );
        await infra.diskCache.setItem(
          `lighterTpslJournal:testnet:${target}`,
          JSON.stringify({
            version: 4,
            operationId: newer ? 'newer' : 'successor',
            sourceRecoveryOperationId: 'source',
            sourceRecoverySettlementKey: source,
            recordedAt: 1,
            createdAt: 1,
            nextAttemptId: 2,
            apiKeyIndex: 7,
            intent: 'remove',
            phase: 'cancelling',
            priorGrouping: 'independent',
            priorTriggers: [],
            attempts: [
              {
                kind: 'cancel',
                attemptId: 1,
                nonce: 42,
                outcome: 'accepted',
                orderId: '9000',
                txHash: 'abcd1234',
                expiresAt: 1,
                role: 'stale',
              },
            ],
          }),
        );
        const sourceBytes = JSON.stringify({
          version: 1,
          settlementKey: source,
          symbol: 'BTC',
          reason: 'manual',
          priorIntent: 'replace',
          priorTriggers: [],
          survivingOrderIds: [],
          operationId: 'newer-source',
          recordedAt: 1,
        });
        await infra.diskCache.setItem(
          'lighterTpslManualIndex:testnet',
          JSON.stringify([source]),
        );
        await infra.diskCache.setItem(
          `lighterTpslManual:testnet:${source}`,
          sourceBytes,
        );
        const journalBefore = await infra.diskCache.getItem(
          `lighterTpslJournal:testnet:${target}`,
        );
        expect(
          await built.provider.resolveRecoveryProtection({
            recoveryId,
            symbol: 'BTC',
          }),
        ).toStrictEqual({
          status: 'settled',
          providerId: 'lighter',
          success: true,
        });
        expect(
          await infra.diskCache.getItem(`lighterTpslJournal:testnet:${target}`),
        ).toBe(newer ? journalBefore : null);
        expect(
          await infra.diskCache.getItem(`lighterTpslManual:testnet:${source}`),
        ).toBe(sourceBytes);
        expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
      },
    );

    it.each(['manual', 'journal'] as const)(
      'blocks ordinary current-slot writes behind an old-slot prepared %s source',
      async (sourceKind) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
        });
        setupTriggerVenue(built.clientInstance, built.bridge);
        const source = `${ACCOUNT.l1Address.toLowerCase()}:28:19:BTC`;
        const target = `${ACCOUNT.l1Address.toLowerCase()}:28:7:BTC`;
        await infra.diskCache.setItem(
          sourceKind === 'manual'
            ? 'lighterTpslManualIndex:testnet'
            : 'lighterTpslJournalIndex:testnet',
          JSON.stringify([source]),
        );
        const bytes = JSON.stringify(
          sourceKind === 'journal'
            ? {
                version: 4,
                recordedAt: 1,
                operationId: 'source',
                createdAt: 1,
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
                    outcome: 'accepted',
                    orderId: '9000',
                    txHash: 'abcd1234',
                    expiresAt: 1,
                    role: 'stale',
                  },
                ],
              }
            : {
                version: 1,
                settlementKey: source,
                symbol: 'BTC',
                reason: 'manual',
                priorIntent: 'replace',
                priorTriggers: [],
                survivingOrderIds: [],
                operationId: 'source',
                recordedAt: 1,
              },
        );
        await infra.diskCache.setItem(
          `lighterTpsl${sourceKind === 'manual' ? 'Manual' : 'Journal'}:testnet:${source}`,
          bytes,
        );
        await infra.diskCache.setItem(
          `lighterTpslSuccessor:testnet:${source}:source`,
          JSON.stringify({
            version: 1,
            sourceSettlementKey: source,
            sourceOperationId: 'source',
            successorSettlementKey: target,
            successorOperationId: 'successor',
            state: 'prepared',
            ownedOrderIds: [],
          }),
        );
        const result = await built.provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '85000',
        });
        expect(result.success).toBe(false);
        expect(result.error).toContain(
          'Selected protection recovery is pending',
        );
        expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
        expect(
          await infra.diskCache.getItem(
            `lighterTpsl${sourceKind === 'manual' ? 'Manual' : 'Journal'}:testnet:${source}`,
          ),
        ).toBe(bytes);
        const resumed = await built.provider.resolveRecoveryProtection({
          symbol: 'BTC',
          stopLossPrice: '85000',
          recoveryId: `lighter-protection:${JSON.stringify(['testnet', ACCOUNT.l1Address.toLowerCase(), 28, 19, 'BTC', 'source'])}`,
        });
        expect(resumed.error).toBeUndefined();
        expect(resumed).toMatchObject({ status: 'settled', success: true });
        expect(
          built.calls.filter((call) => call.function === '_signCreateOrder'),
        ).toHaveLength(1);
      },
    );

    it.each([true, false])(
      'handles replacement=%s truthfully when no current position exists',
      async (replacement) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
        });
        const venue = setupTriggerVenue(built.clientInstance, built.bridge);
        const orderId = venue.seedTrigger('stop-loss', '80000');
        built.clientInstance.getAccountByIndex.mockResolvedValue({
          code: 200,
          accounts: [{ ...ACCOUNT, positions: [] }],
        });
        const settlementKey = `${ACCOUNT.l1Address.toLowerCase()}:28:19:BTC`;
        const sourceKey = `lighterTpslManual:testnet:${settlementKey}`;
        const bytes = JSON.stringify({
          version: 1,
          settlementKey,
          symbol: 'BTC',
          reason: 'manual',
          priorIntent: 'replace',
          priorTriggers: [],
          survivingOrderIds: [String(orderId)],
          operationId: 'original',
          recordedAt: 1,
        });
        await infra.diskCache.setItem(sourceKey, bytes);
        await infra.diskCache.setItem(
          'lighterTpslManualIndex:testnet',
          JSON.stringify([settlementKey]),
        );
        const recoveryId = `lighter-protection:${JSON.stringify(['testnet', ACCOUNT.l1Address.toLowerCase(), 28, 19, 'BTC', 'original'])}`;
        const result = await built.provider.resolveRecoveryProtection({
          recoveryId,
          symbol: 'BTC',
          stopLossPrice: replacement ? '85000' : undefined,
        });
        expect(result.success).toBe(!replacement);
        expect(
          venue.rawTriggers.some((row) => row.orderIndex === orderId),
        ).toBe(replacement);
        expect(await infra.diskCache.getItem(sourceKey)).toBe(
          replacement ? bytes : null,
        );
      },
    );

    it('serializes two providers selecting the same source without duplicate successor submission', async () => {
      const infra = createMockInfrastructure();
      const first = buildProvider({
        platformDependencies: infra,
        registeredKey: '9c'.repeat(40),
      });
      const second = buildProvider({
        platformDependencies: infra,
        registeredKey: '9c'.repeat(40),
      });
      const venue = setupTriggerVenue(first.clientInstance, first.bridge);
      setupTriggerVenue(second.clientInstance, second.bridge);
      const entered = createDeferred<void>();
      const release = createDeferred<void>();
      const execute = vi.spyOn(first.bridge, 'execute').getMockImplementation();
      if (!execute) {
        throw new Error('Missing bridge implementation');
      }
      vi.spyOn(first.bridge, 'execute').mockImplementation(async (call) => {
        if (call.function === '_signCreateOrder') {
          entered.resolve();
          await release.promise;
        }
        const result = await execute?.(call);
        if (!result) {
          throw new Error('Missing fixture signer');
        }
        return result;
      });
      const settlementKey = `${ACCOUNT.l1Address.toLowerCase()}:28:19:BTC`;
      const recoveryId = `lighter-protection:${JSON.stringify(['testnet', ACCOUNT.l1Address.toLowerCase(), 28, 19, 'BTC', 'original'])}`;
      await infra.diskCache.setItem(
        `lighterTpslManual:testnet:${settlementKey}`,
        JSON.stringify({
          version: 1,
          settlementKey,
          symbol: 'BTC',
          reason: 'manual',
          priorIntent: 'replace',
          priorTriggers: [],
          survivingOrderIds: [],
          operationId: 'original',
          recordedAt: 1,
        }),
      );
      await infra.diskCache.setItem(
        'lighterTpslManualIndex:testnet',
        JSON.stringify([settlementKey]),
      );
      const pendingFirst = first.provider.resolveRecoveryProtection({
        recoveryId,
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      await entered.promise;
      const pendingSecond = second.provider.resolveRecoveryProtection({
        recoveryId,
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      release.resolve();
      const results = await Promise.all([pendingFirst, pendingSecond]);
      expect(results[0].success).toBe(true);
      expect(
        first.calls.filter((call) => call.function === '_signCreateOrder'),
      ).toHaveLength(1);
      expect(second.clientInstance.sendTx).not.toHaveBeenCalled();
      expect(venue.rawTriggers).toHaveLength(1);
    });

    it('retains source and sends nothing when the wallet switches during successor signing', async () => {
      const infra = createMockInfrastructure();
      const built = buildProvider({
        platformDependencies: infra,
        registeredKey: '9c'.repeat(40),
      });
      setupTriggerVenue(built.clientInstance, built.bridge);
      const execute = vi.spyOn(built.bridge, 'execute').getMockImplementation();
      if (!execute) {
        throw new Error('Missing bridge implementation');
      }
      vi.spyOn(built.bridge, 'execute').mockImplementation(async (call) => {
        const signed = await execute(call);
        if (call.function === '_signCreateOrder') {
          built.getUserAddressMock.mockReturnValue(
            '0x9999999999999999999999999999999999999999',
          );
        }
        return signed;
      });
      const settlementKey = `${ACCOUNT.l1Address.toLowerCase()}:28:19:BTC`;
      const sourceKey = `lighterTpslManual:testnet:${settlementKey}`;
      const bytes = JSON.stringify({
        version: 1,
        settlementKey,
        symbol: 'BTC',
        reason: 'manual',
        priorIntent: 'replace',
        priorTriggers: [],
        survivingOrderIds: [],
        operationId: 'original',
        recordedAt: 1,
      });
      await infra.diskCache.setItem(sourceKey, bytes);
      await infra.diskCache.setItem(
        'lighterTpslManualIndex:testnet',
        JSON.stringify([settlementKey]),
      );
      const recoveryId = `lighter-protection:${JSON.stringify(['testnet', ACCOUNT.l1Address.toLowerCase(), 28, 19, 'BTC', 'original'])}`;
      expect(
        (
          await built.provider.resolveRecoveryProtection({
            recoveryId,
            symbol: 'BTC',
            stopLossPrice: '85000',
          })
        ).success,
      ).toBe(false);
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
      expect(await infra.diskCache.getItem(sourceKey)).toBe(bytes);
    });

    it('reconciles a committed successor after response loss without a second create', async () => {
      const infra = createMockInfrastructure();
      const built = buildProvider({
        platformDependencies: infra,
        registeredKey: '9c'.repeat(40),
      });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      const orderId = venue.seedTrigger('stop-loss', '80000');
      venue.failResponseOnce(14);
      const settlementKey = `${ACCOUNT.l1Address.toLowerCase()}:28:19:BTC`;
      const recoveryId = `lighter-protection:${JSON.stringify(['testnet', ACCOUNT.l1Address.toLowerCase(), 28, 19, 'BTC', 'original'])}`;
      await infra.diskCache.setItem(
        `lighterTpslManual:testnet:${settlementKey}`,
        JSON.stringify({
          version: 1,
          settlementKey,
          symbol: 'BTC',
          reason: 'manual',
          priorIntent: 'replace',
          priorTriggers: [],
          survivingOrderIds: [String(orderId)],
          operationId: 'original',
          recordedAt: 1,
        }),
      );
      await infra.diskCache.setItem(
        'lighterTpslManualIndex:testnet',
        JSON.stringify([settlementKey]),
      );
      const first = await built.provider.resolveRecoveryProtection({
        recoveryId,
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(first.success).toBe(false);
      const restarted = buildProvider({
        platformDependencies: infra,
        registeredKey: '9c'.repeat(40),
      });
      const restartedVenue = setupTriggerVenue(
        restarted.clientInstance,
        restarted.bridge,
      );
      restartedVenue.rawTriggers.push(...venue.rawTriggers);
      restartedVenue.rawInactive.push(...venue.rawInactive);
      for (const [hash, state] of venue.landedTxs) {
        restartedVenue.landedTxs.set(hash, state);
      }
      restartedVenue.setVenueNonce(venue.getVenueNonce());
      restartedVenue.setNextIndex(venue.getNextIndex());
      const second = await restarted.provider.resolveRecoveryProtection({
        recoveryId,
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(second.error).toBeUndefined();
      expect(second.success).toBe(true);
      expect(
        'childOrderIds' in second ? second.childOrderIds : undefined,
      ).toStrictEqual(
        restartedVenue.rawTriggers
          .filter((row) => row.triggerPrice === '85000')
          .map((row) => String(row.orderIndex)),
      );
      expect(
        built.calls.filter((call) => call.function === '_signCreateOrder'),
      ).toHaveLength(1);
      expect(
        restarted.calls.filter((call) => call.function === '_signCreateOrder'),
      ).toHaveLength(0);
      expect(
        restartedVenue.rawTriggers.some((row) => row.orderIndex === orderId),
      ).toBe(false);
    });
    it.each([
      'executed',
      'unknown',
      'already-complete',
      'cancel-restart',
      'retained-canceled',
      'retained-clear-crash',
      'retained-next-key',
      'retained-pointer-crash',
      'retained-index-crash',
      'failed',
      'expired-absent',
      'mismatch',
    ] as const)(
      'reconciles a %s successor after key loss without a second create',
      async (evidence) => {
        const retainedFailure =
          evidence === 'retained-canceled' ||
          evidence === 'retained-clear-crash' ||
          evidence === 'retained-next-key' ||
          evidence === 'retained-pointer-crash' ||
          evidence === 'retained-index-crash';
        const infra = createMockInfrastructure();
        const built = buildProvider({
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
        });
        const venue = setupTriggerVenue(built.clientInstance, built.bridge);
        const orderId = venue.seedTrigger('stop-loss', '80000');
        venue.failResponseOnce(14);
        const settlementKey = `${ACCOUNT.l1Address.toLowerCase()}:28:19:BTC`;
        const recoveryId = `lighter-protection:${JSON.stringify(['testnet', ACCOUNT.l1Address.toLowerCase(), 28, 19, 'BTC', 'original'])}`;
        await infra.diskCache.setItem(
          `lighterTpslManual:testnet:${settlementKey}`,
          JSON.stringify({
            version: 1,
            settlementKey,
            symbol: 'BTC',
            reason: 'manual',
            priorIntent: 'replace',
            priorTriggers: [],
            survivingOrderIds: [String(orderId)],
            operationId: 'original',
            recordedAt: 1,
          }),
        );
        await infra.diskCache.setItem(
          'lighterTpslManualIndex:testnet',
          JSON.stringify([settlementKey]),
        );
        const first = await built.provider.resolveRecoveryProtection({
          recoveryId,
          symbol: 'BTC',
          stopLossPrice: '85000',
        });
        expect(first.success).toBe(false);
        const sourceBytes = await infra.diskCache.getItem(
          `lighterTpslManual:testnet:${settlementKey}`,
        );
        const lostKey = `${ACCOUNT.l1Address.toLowerCase()}:28:7:BTC`;
        if (evidence === 'failed' || evidence === 'expired-absent') {
          venue.rawTriggers.splice(1);
          const pointer = JSON.parse(
            (await infra.diskCache.getItem(
              `lighterTpslJournal:testnet:${lostKey}`,
            )) ?? '{}',
          ) as { operationId: string };
          const payloadKey = `lighterTpslJournalOp:testnet:${lostKey}:${pointer.operationId}`;
          const payload = JSON.parse(
            (await infra.diskCache.getItem(payloadKey)) ?? '{}',
          ) as { attempts: { expiresAt: number; outcome: string }[] };
          for (const attempt of payload.attempts) {
            attempt.expiresAt = 1;
            attempt.outcome = 'unknown';
          }
          await infra.diskCache.setItem(payloadKey, JSON.stringify(payload));
        }
        const unrelatedId = venue.seedTrigger('take-profit', '120000');
        const unrelatedBytes = JSON.stringify(
          venue.rawTriggers.find((row) => row.orderIndex === unrelatedId),
        );
        const restarted = buildProvider({
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
          apiKeyIndex: 19,
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
        const restartedVenue = setupTriggerVenue(
          restarted.clientInstance,
          restarted.bridge,
          { apiKeyIndex: 19 },
        );
        restartedVenue.rawTriggers.push(...venue.rawTriggers);
        restartedVenue.rawInactive.push(...venue.rawInactive);
        for (const [hash, state] of venue.landedTxs) {
          restartedVenue.landedTxs.set(hash, state);
        }
        const readTx =
          restarted.clientInstance.getTx.getMockImplementation() as
            | ((
                hash: string,
              ) => Promise<
                | import('../../../src/types/lighter-types.js').LighterTxLookupResponse
                | null
              >)
            | undefined;
        restarted.clientInstance.getTx.mockImplementation(
          async (hash: string) => {
            if (!venue.landedTxs.has(hash)) {
              return readTx?.(hash);
            }
            if (evidence === 'unknown' || evidence === 'expired-absent') {
              return null;
            }
            return {
              hash,
              accountIndex: 28,
              apiKeyIndex: evidence === 'mismatch' ? 3 : 7,
              ...venue.landedTxs.get(hash),
              ...(evidence === 'failed' ? { status: 0 } : {}),
            };
          },
        );
        restartedVenue.setVenueNonce(venue.getVenueNonce());
        restartedVenue.setNextIndex(venue.getNextIndex());
        if (evidence === 'already-complete') {
          restarted.clientInstance.getAccountByIndex.mockResolvedValue({
            code: 200,
            accounts: [{ ...ACCOUNT, positions: [] }],
          });
          restartedVenue.rawTriggers.splice(
            restartedVenue.rawTriggers.findIndex(
              (row) => row.orderIndex === orderId,
            ),
            1,
          );
        }
        if (evidence === 'cancel-restart' || retainedFailure) {
          restartedVenue.failResponseOnce(15);
        }
        let second = await restarted.provider.resolveRecoveryProtection({
          recoveryId,
          symbol: 'BTC',
          stopLossPrice: '85000',
        });
        let resumedCreates = 0;
        let failedObservation: unknown;
        let renewedSuccess: boolean | undefined;
        let renewedCreates: number | undefined;
        let ordinarySuccess: boolean | undefined;
        let intermediateSuccess: boolean | undefined;
        let failedUnrelated: string | undefined;
        let renewedUnrelated: string | undefined;
        let renewedJournal: string | null | undefined;
        let renewedIndex: string[] | undefined;
        if (evidence === 'cancel-restart' || retainedFailure) {
          intermediateSuccess = second.success;
          const resumedSlot =
            evidence === 'retained-next-key' ||
            evidence === 'retained-pointer-crash' ||
            evidence === 'retained-index-crash'
              ? 23
              : 19;
          const resumed = buildProvider({
            platformDependencies: infra,
            registeredKey: '9c'.repeat(40),
            apiKeyIndex: resumedSlot,
          });
          resumed.clientInstance.getApiKeys.mockResolvedValue({
            code: 200,
            apiKeys: [
              {
                accountIndex: 28,
                apiKeyIndex: resumedSlot,
                nonce: 1,
                publicKey: '9c'.repeat(40),
              },
            ],
          });
          const resumedVenue = setupTriggerVenue(
            resumed.clientInstance,
            resumed.bridge,
            { apiKeyIndex: resumedSlot },
          );
          resumedVenue.rawTriggers.push(...restartedVenue.rawTriggers);
          if (retainedFailure) {
            const retainedIndex = resumedVenue.rawTriggers.findIndex(
              (row) => row.orderIndex !== unrelatedId,
            );
            const [retained] = resumedVenue.rawTriggers.splice(
              retainedIndex,
              1,
            );
            resumedVenue.rawInactive.push({ ...retained, status: 'canceled' });
          }

          resumedVenue.rawInactive.push(...restartedVenue.rawInactive);
          for (const [hash, state] of restartedVenue.landedTxs) {
            resumedVenue.landedTxs.set(hash, state);
          }
          const resumedReadTx =
            resumed.clientInstance.getTx.getMockImplementation() as
              | ((
                  hash: string,
                ) => Promise<
                  | import('../../../src/types/lighter-types.js').LighterTxLookupResponse
                  | null
                >)
              | undefined;
          resumed.clientInstance.getTx.mockImplementation(
            async (hash: string) => {
              if (restartedVenue.landedTxs.has(hash)) {
                return {
                  hash,
                  accountIndex: 28,
                  apiKeyIndex: 19,
                  ...restartedVenue.landedTxs.get(hash),
                };
              }
              return resumedReadTx?.(hash);
            },
          );
          resumedVenue.setVenueNonce(restartedVenue.getVenueNonce());
          resumedVenue.setNextIndex(restartedVenue.getNextIndex());
          if (
            evidence === 'retained-clear-crash' ||
            evidence === 'retained-pointer-crash'
          ) {
            const remove = vi.spyOn(infra.diskCache, 'removeItem');
            const realRemove = remove.getMockImplementation();
            if (!realRemove) {
              throw new Error('Missing storage removal');
            }
            let interrupted = false;
            remove.mockImplementation(async (key) => {
              if (
                !interrupted &&
                (evidence === 'retained-clear-crash'
                  ? key.startsWith(
                      `lighterTpslJournalOp:testnet:${settlementKey}:`,
                    )
                  : key === `lighterTpslJournal:testnet:${settlementKey}`)
              ) {
                interrupted = true;
                throw new Error('Interrupted failed retirement');
              }
              await realRemove(key);
            });
          }
          if (evidence === 'retained-index-crash') {
            const write = vi.spyOn(infra.diskCache, 'setItem');
            const realWrite = write.getMockImplementation();
            if (!realWrite) {
              throw new Error('Missing storage write');
            }
            let interrupted = false;
            write.mockImplementation(async (key, value) => {
              if (!interrupted && key === 'lighterTpslJournalIndex:testnet') {
                interrupted = true;
                throw new Error('Interrupted failed index retirement');
              }
              await realWrite(key, value);
            });
          }
          second = await resumed.provider.resolveRecoveryProtection({
            recoveryId,
            symbol: 'BTC',
            stopLossPrice: '85000',
          });
          if (retainedFailure) {
            failedUnrelated = JSON.stringify(
              resumedVenue.rawTriggers.find(
                (row) => row.orderIndex === unrelatedId,
              ),
            );
            const failed = JSON.parse(
              (await infra.diskCache.getItem(
                `lighterTpslSuccessor:testnet:${settlementKey}:original`,
              )) ?? '{}',
            ) as { state: string; retainedReplacementGroups?: number[][] };
            failedObservation = {
              success: second.success,
              sends: resumed.clientInstance.sendTx.mock.calls.length,
              source: await infra.diskCache.getItem(
                `lighterTpslManual:testnet:${settlementKey}`,
              ),
              journalPresent:
                (await infra.diskCache.getItem(
                  `lighterTpslJournal:testnet:${settlementKey}`,
                )) !== null,
              state: failed.state,
              groups: failed.retainedReplacementGroups,
            };
            second = await resumed.provider.resolveRecoveryProtection({
              recoveryId,
              symbol: 'BTC',
              stopLossPrice: '86000',
            });
            renewedUnrelated = JSON.stringify(
              resumedVenue.rawTriggers.find(
                (row) => row.orderIndex === unrelatedId,
              ),
            );
            renewedJournal = await infra.diskCache.getItem(
              `lighterTpslJournal:testnet:${settlementKey}`,
            );
            renewedIndex = JSON.parse(
              (await infra.diskCache.getItem(
                'lighterTpslJournalIndex:testnet',
              )) ?? '[]',
            ) as string[];
            renewedSuccess = second.success;
            renewedCreates = resumed.calls.filter(
              (call) => call.function === '_signCreateOrder',
            ).length;
            ordinarySuccess = (
              await resumed.provider.updatePositionTPSL({
                symbol: 'BTC',
                stopLossPrice: '87000',
              })
            ).success;
          }
          resumedCreates = resumed.calls.filter(
            (call) => call.function === '_signCreateOrder',
          ).length;
        }
        expect(failedObservation).toStrictEqual(
          retainedFailure
            ? {
                success: false,
                sends: 0,
                source: sourceBytes,
                journalPresent:
                  evidence === 'retained-clear-crash' ||
                  evidence === 'retained-pointer-crash',
                state: 'failed',
                groups: undefined,
              }
            : undefined,
        );
        expect(failedUnrelated).toBe(
          retainedFailure ? unrelatedBytes : undefined,
        );
        expect(renewedUnrelated).toBe(
          retainedFailure ? unrelatedBytes : undefined,
        );
        expect(renewedJournal).toBe(retainedFailure ? null : undefined);
        expect(renewedIndex).toStrictEqual(retainedFailure ? [] : undefined);
        expect(renewedSuccess).toBe(retainedFailure ? true : undefined);
        expect(renewedCreates).toBe(retainedFailure ? 1 : undefined);
        expect(ordinarySuccess).toBe(retainedFailure ? true : undefined);
        expect(
          JSON.stringify(
            restartedVenue.rawTriggers.find(
              (row) => row.orderIndex === unrelatedId,
            ),
          ),
        ).toBe(unrelatedBytes);
        expect(intermediateSuccess).toBe(
          evidence === 'cancel-restart' || retainedFailure ? false : undefined,
        );
        expect(resumedCreates).toBe(retainedFailure ? 2 : 0);
        expect(
          second.success === true &&
            'childOrderIds' in second &&
            second.childOrderIds?.length === 0,
        ).toBe(false);
        expect(second.success).toBe(
          evidence !== 'unknown' && evidence !== 'mismatch',
        );
        const expectedSends = {
          executed: 1,
          unknown: 0,
          'already-complete': 0,
          'cancel-restart': 1,
          'retained-canceled': 1,
          'retained-clear-crash': 1,
          'retained-next-key': 1,
          'retained-pointer-crash': 1,
          'retained-index-crash': 1,
          failed: 2,
          'expired-absent': 2,
          mismatch: 0,
        };
        expect(restarted.clientInstance.sendTx).toHaveBeenCalledTimes(
          expectedSends[evidence],
        );
        expect(
          built.calls.filter((call) => call.function === '_signCreateOrder'),
        ).toHaveLength(1);
        expect(
          restarted.calls.filter(
            (call) => call.function === '_signCreateOrder',
          ),
        ).toHaveLength(
          evidence === 'failed' || evidence === 'expired-absent' ? 1 : 0,
        );
        expect(
          restartedVenue.rawTriggers.some((row) => row.orderIndex === orderId),
        ).toBe(evidence === 'unknown' || evidence === 'mismatch');
      },
    );

    it.each(['unavailable', 'wrong-slot', 'terminal-failed'] as const)(
      'reconciles original slot attempts with %s evidence before a current-key successor',
      async (evidence) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
        });
        setupTriggerVenue(built.clientInstance, built.bridge);
        const settlementKey = `${ACCOUNT.l1Address.toLowerCase()}:28:19:BTC`;
        const journalKey = `lighterTpslJournal:testnet:${settlementKey}`;
        const bytes = JSON.stringify({
          version: 4,
          recordedAt: 5,
          operationId: 'old-journal',
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
        });
        await infra.diskCache.setItem(journalKey, bytes);
        await infra.diskCache.setItem(
          'lighterTpslJournalIndex:testnet',
          JSON.stringify([settlementKey]),
        );
        built.clientInstance.getTx.mockResolvedValue(
          evidence === 'unavailable'
            ? null
            : {
                hash: 'ffff00000001',
                accountIndex: 28,
                apiKeyIndex: evidence === 'wrong-slot' ? 7 : 19,
                nonce: 42,
                status: 0,
              },
        );
        const recoveryId = `lighter-protection:${JSON.stringify(['testnet', ACCOUNT.l1Address.toLowerCase(), 28, 19, 'BTC', 'old-journal'])}`;
        const result = await built.provider.resolveRecoveryProtection({
          recoveryId,
          symbol: 'BTC',
          stopLossPrice: '85000',
        });
        expect(result.success).toBe(evidence === 'terminal-failed');
        expect(built.clientInstance.getTx).toHaveBeenCalledWith('ffff00000001');
        expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(
          evidence === 'terminal-failed' ? 1 : 0,
        );
        expect(await infra.diskCache.getItem(journalKey)).toBe(
          evidence === 'terminal-failed' ? null : bytes,
        );
      },
    );

    it('does not submit a settled selected intent again after restart or lost response', async () => {
      const infra = createMockInfrastructure();
      const built = buildProvider({
        platformDependencies: infra,
        registeredKey: '9c'.repeat(40),
      });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      const orderId = venue.seedTrigger('stop-loss', '80000');
      const settlementKey = `${ACCOUNT.l1Address.toLowerCase()}:28:19:BTC`;
      const recoveryId = `lighter-protection:${JSON.stringify(['testnet', ACCOUNT.l1Address.toLowerCase(), 28, 19, 'BTC', 'original'])}`;
      await infra.diskCache.setItem(
        `lighterTpslManual:testnet:${settlementKey}`,
        JSON.stringify({
          version: 1,
          settlementKey,
          symbol: 'BTC',
          reason: 'manual',
          priorIntent: 'replace',
          priorTriggers: [],
          survivingOrderIds: [String(orderId)],
          operationId: 'original',
          recordedAt: 1,
        }),
      );
      await infra.diskCache.setItem(
        'lighterTpslManualIndex:testnet',
        JSON.stringify([settlementKey]),
      );
      expect(
        (
          await built.provider.resolveRecoveryProtection({
            recoveryId,
            symbol: 'BTC',
            stopLossPrice: '85000',
          })
        ).success,
      ).toBe(true);
      const restarted = buildProvider({
        platformDependencies: infra,
        registeredKey: '9c'.repeat(40),
      });
      expect(
        (
          await restarted.provider.resolveRecoveryProtection({
            recoveryId,
            symbol: 'BTC',
            stopLossPrice: '85000',
          })
        ).success,
      ).toBe(true);
      expect(restarted.clientInstance.sendTx).not.toHaveBeenCalled();
      expect(restarted.calls).toHaveLength(0);
    });

    it('keeps the selected source visible when the replacement fails at the venue', async () => {
      const infra = createMockInfrastructure();
      const built = buildProvider({
        platformDependencies: infra,
        registeredKey: '9c'.repeat(40),
      });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      const orderId = venue.seedTrigger('stop-loss', '80000');
      venue.setCreateTerminal('canceled');
      const settlementKey = `${ACCOUNT.l1Address.toLowerCase()}:28:19:BTC`;
      const recoveryId = `lighter-protection:${JSON.stringify(['testnet', ACCOUNT.l1Address.toLowerCase(), 28, 19, 'BTC', 'original'])}`;
      const bytes = JSON.stringify({
        version: 1,
        settlementKey,
        symbol: 'BTC',
        reason: 'manual',
        priorIntent: 'replace',
        priorTriggers: [],
        survivingOrderIds: [String(orderId)],
        operationId: 'original',
        recordedAt: 1,
      });
      await infra.diskCache.setItem(
        `lighterTpslManual:testnet:${settlementKey}`,
        bytes,
      );
      await infra.diskCache.setItem(
        'lighterTpslManualIndex:testnet',
        JSON.stringify([settlementKey]),
      );
      expect(
        (
          await built.provider.resolveRecoveryProtection({
            recoveryId,
            symbol: 'BTC',
            stopLossPrice: '85000',
          })
        ).success,
      ).toBe(false);
      expect(
        await infra.diskCache.getItem(
          `lighterTpslManual:testnet:${settlementKey}`,
        ),
      ).toBe(bytes);
      expect(venue.rawTriggers.some((row) => row.orderIndex === orderId)).toBe(
        true,
      );
    });

    it('refuses dispatch after its source is replaced during journal persistence', async () => {
      const infra = createMockInfrastructure();
      const built = buildProvider({
        platformDependencies: infra,
        registeredKey: '9c'.repeat(40),
      });
      setupTriggerVenue(built.clientInstance, built.bridge);
      const settlementKey = `${ACCOUNT.l1Address.toLowerCase()}:28:19:BTC`;
      const sourceKey = `lighterTpslManual:testnet:${settlementKey}`;
      const source = {
        version: 1,
        settlementKey,
        symbol: 'BTC',
        reason: 'manual',
        priorIntent: 'replace',
        priorTriggers: [],
        survivingOrderIds: [],
        operationId: 'original',
        recordedAt: 1,
      };
      await infra.diskCache.setItem(sourceKey, JSON.stringify(source));
      await infra.diskCache.setItem(
        'lighterTpslManualIndex:testnet',
        JSON.stringify([settlementKey]),
      );
      const realSet = vi
        .spyOn(infra.diskCache, 'setItem')
        .getMockImplementation();
      if (!realSet) {
        throw new Error('Missing storage implementation');
      }
      const newer = JSON.stringify({ ...source, operationId: 'newer' });
      vi.spyOn(infra.diskCache, 'setItem').mockImplementation(
        async (key, value) => {
          await realSet(key, value);
          if (
            key.startsWith('lighterTpslSuccessor:') &&
            (JSON.parse(value) as { state: string }).state === 'pending'
          ) {
            await realSet(sourceKey, newer);
          }
        },
      );
      const recoveryId = `lighter-protection:${JSON.stringify(['testnet', ACCOUNT.l1Address.toLowerCase(), 28, 19, 'BTC', 'original'])}`;
      const result = await built.provider.resolveRecoveryProtection({
        recoveryId,
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/source.*changed/u);
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
      expect(await infra.diskCache.getItem(sourceKey)).toBe(newer);
    });

    it.each([7, 19])(
      'settles a selected slot%s obligation with the current registered key while preserving unrelated protection',
      async (slot) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
        });
        const venue = setupTriggerVenue(built.clientInstance, built.bridge);
        const owned = venue.seedTrigger('stop-loss', '80000');
        const unrelated = venue.seedTrigger('take-profit', '120000');
        const settlementKey = `${ACCOUNT.l1Address.toLowerCase()}:28:${slot}:BTC`;
        const key = `lighterTpslManual:testnet:${settlementKey}`;
        await infra.diskCache.setItem(
          key,
          JSON.stringify({
            version: 1,
            settlementKey,
            symbol: 'BTC',
            reason: 'manual recovery',
            priorIntent: 'replace',
            priorTriggers: [],
            survivingOrderIds: [String(owned)],
            operationId: 'selected-operation',
            recordedAt: 1,
          }),
        );
        await infra.diskCache.setItem(
          'lighterTpslManualIndex:testnet',
          JSON.stringify([settlementKey]),
        );
        // Only slot 7 exists locally. Slot 19 represents a lost installation key.
        Object.assign(built.bridge, {
          getRecoverableKeyIndices: async (): Promise<number[]> => [7],
        });
        const recoveryId = `lighter-protection:${JSON.stringify(['testnet', ACCOUNT.l1Address.toLowerCase(), 28, slot, 'BTC', 'selected-operation'])}`;
        const result = await built.provider.resolveRecoveryProtection({
          recoveryId,
          symbol: 'BTC',
          stopLossPrice: '85000',
        });
        expect(result.success).toBe(true);
        expect(venue.rawTriggers.some((row) => row.orderIndex === owned)).toBe(
          false,
        );
        expect(
          venue.rawTriggers.some((row) => row.orderIndex === unrelated),
        ).toBe(true);
        expect(await infra.diskCache.getItem(key)).toBeNull();
        expect(
          built.calls.some((call) => call.function === '_signChangePubKey'),
        ).toBe(false);
      },
    );

    it.each([7, 19])(
      'retains a slot%s obligation when its selected source identity is stale',
      async (slot) => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          platformDependencies: infra,
          registeredKey: '9c'.repeat(40),
        });
        const settlementKey = `${ACCOUNT.l1Address.toLowerCase()}:28:${slot}:BTC`;
        const key = `lighterTpslManual:testnet:${settlementKey}`;
        const bytes = JSON.stringify({
          version: 1,
          settlementKey,
          symbol: 'BTC',
          reason: 'manual recovery',
          priorIntent: 'replace',
          priorTriggers: [],
          survivingOrderIds: [],
          operationId: 'newer-operation',
          recordedAt: 1,
        });
        await infra.diskCache.setItem(key, bytes);
        await infra.diskCache.setItem(
          'lighterTpslManualIndex:testnet',
          JSON.stringify([settlementKey]),
        );
        const recoveryId = `lighter-protection:${JSON.stringify(['testnet', ACCOUNT.l1Address.toLowerCase(), 28, slot, 'BTC', 'old-operation'])}`;
        const result = await built.provider.resolveRecoveryProtection({
          recoveryId,
          symbol: 'BTC',
          stopLossPrice: '80000',
        });
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/source|operation/u);
        expect(await infra.diskCache.getItem(key)).toBe(bytes);
        expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
      },
    );
  });
});
