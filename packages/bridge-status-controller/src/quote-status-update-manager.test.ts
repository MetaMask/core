import { BridgeClientId } from '@metamask/bridge-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';

import { flushPromises } from '../../../tests/helpers';
import {
  QUOTE_STATUS_UPDATE_IMMEDIATE_MAX_RETRIES,
  QUOTE_STATUS_UPDATE_IMMEDIATE_RETRY_DELAY_MS,
  QUOTE_STATUS_UPDATE_RETRY_INTERVAL_MS,
  QUOTE_STATUS_UPDATE_RETRY_MAX_LIFETIME_MS,
  QuoteStatusUpdateErrorType,
  QuoteStatusUpdateStatus,
  QuoteStatusUpdateType,
} from './constants';
import { QuoteStatusUpdateError } from './errors';
import { QuoteStatusUpdateManager } from './quote-status-update-manager';
import type {
  BridgeStatusControllerMessenger,
  DeferredStatusUpdateEntry,
} from './types';

const BRIDGE_STATUS_CONTROLLER_NAME = 'BridgeStatusController';
const API_BASE_URL = 'https://bridge.api.cx.metamask.io';
const QUOTE_ID = 'test-quote-id-123';
const SRC_TX_HASH = '0xsrcTxHash123';
const TX_META_ID = 'tx-meta-id-123';
const JWT_TOKEN = 'mock-jwt-token';
const QUEUE_KEY = `${QUOTE_ID}:${SRC_TX_HASH}`;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Creates a root messenger and a child BridgeStatusController messenger wired
 * up with an `AuthenticationController:getBearerToken` action handler.
 *
 * @param getBearerTokenHandler - Optional override for the `getBearerToken` action handler.
 * @returns An object containing the child messenger.
 */
function buildRootAndChildMessenger(
  getBearerTokenHandler?: () => Promise<string>,
): {
  messenger: BridgeStatusControllerMessenger;
} {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rootMessenger = new Messenger({ namespace: MOCK_ANY_NAMESPACE }) as any;
  const messenger = new Messenger({
    namespace: BRIDGE_STATUS_CONTROLLER_NAME,
    parent: rootMessenger,
  }) as unknown as BridgeStatusControllerMessenger;

  rootMessenger.delegate({
    messenger,
    actions: ['AuthenticationController:getBearerToken'],
    events: [],
  });

  rootMessenger.registerActionHandler(
    'AuthenticationController:getBearerToken',
    getBearerTokenHandler ?? ((): Promise<string> => Promise.resolve(JWT_TOKEN)),
  );

  return { messenger };
}

function buildEntry(
  overrides: Partial<DeferredStatusUpdateEntry> = {},
): DeferredStatusUpdateEntry {
  return {
    quoteId: QUOTE_ID,
    srcTxHash: SRC_TX_HASH,
    pendingStatuses: [QuoteStatusUpdateType.Submitted],
    createdAt: Date.now(),
    lastAttemptAt: Date.now(),
    txMetaId: TX_META_ID,
    ...overrides,
  };
}

function buildManager(
  overrides: Partial<
    ConstructorParameters<typeof QuoteStatusUpdateManager>[0]
  > = {},
): {
  manager: QuoteStatusUpdateManager;
  persistDeferredUpdates: jest.Mock;
  onError: jest.Mock;
} {
  const { messenger } = buildRootAndChildMessenger();
  const persistDeferredUpdates = jest.fn();
  const onError = jest.fn();

  const manager = new QuoteStatusUpdateManager({
    messenger,
    clientId: BridgeClientId.EXTENSION,
    apiBaseUrl: API_BASE_URL,
    persistDeferredUpdates,
    onError,
    isEnabled: (): boolean => true,
    ...overrides,
  });

  return { manager, persistDeferredUpdates, onError };
}

function mockFetchOk(): jest.SpyInstance {
  return jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue({ ok: true } as Response);
}

function mockFetchError(body: Record<string, unknown>): jest.SpyInstance {
  return jest.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: false,
    json: (): Promise<Record<string, unknown>> => Promise.resolve(body),
  } as unknown as Response);
}

function mockFetchNetworkError(): jest.SpyInstance {
  return jest
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(new Error('Network error'));
}

/**
 * Advances fake time by `delay` ms while interleaving promise microtasks.
 *
 * @param delay - Milliseconds to advance fake time by.
 */
async function advanceAndFlush(delay: number): Promise<void> {
  await jest.advanceTimersByTimeAsync(delay);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('QuoteStatusUpdateManager', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
    jest.useRealTimers();
  });

  // ── Constructor ────────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('initialises with an empty queue when no initialDeferredUpdates provided', () => {
      const { persistDeferredUpdates } = buildManager();

      // No persist call on construction when queue is empty
      expect(persistDeferredUpdates).not.toHaveBeenCalled();
    });

    it('loads initial deferred updates, processes them, and drains the queue', async () => {
      fetchSpy = mockFetchOk();
      const entry = buildEntry();
      const { persistDeferredUpdates } = buildManager({
        initialDeferredUpdates: { [QUEUE_KEY]: entry },
      });

      // Fire the setTimeout(0) stagger and let the async chain complete
      await advanceAndFlush(0);
      await flushPromises();

      // One fetch call for the initial entry
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      // Queue drained — last persist is empty
      const lastPersisted =
        persistDeferredUpdates.mock.calls[
          persistDeferredUpdates.mock.calls.length - 1
        ][0];
      expect(lastPersisted).toStrictEqual({});
    });

    it('clones entries so mutations do not affect the initial frozen state', () => {
      const entry = buildEntry();
      // Simulate Immer-frozen state by freezing the entry
      Object.freeze(entry);
      Object.freeze(entry.pendingStatuses);

      expect(() =>
        buildManager({
          initialDeferredUpdates: { [QUEUE_KEY]: entry },
        }),
      ).not.toThrow();
    });

    it('drops expired initial entries and calls onError for each', () => {
      const expiredEntry = buildEntry({
        createdAt:
          Date.now() - QUOTE_STATUS_UPDATE_RETRY_MAX_LIFETIME_MS - 1000,
      });
      const { onError, persistDeferredUpdates } = buildManager({
        initialDeferredUpdates: { [QUEUE_KEY]: expiredEntry },
      });

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0]).toBeInstanceOf(QuoteStatusUpdateError);
      // Persists the empty queue after dropping expired entries
      expect(persistDeferredUpdates).toHaveBeenCalledWith({});
    });

    it('starts the retry timer when there are initial non-expired entries', async () => {
      fetchSpy = mockFetchNetworkError();
      const entry = buildEntry();
      buildManager({
        initialDeferredUpdates: { [QUEUE_KEY]: entry },
      });

      // Fire the initial stagger setTimeout(0)
      await advanceAndFlush(0);
      await flushPromises();
      const callsAfterFirst = fetchSpy.mock.calls.length;

      // Advance past one retry interval — should fire #processDeferredRetries
      await advanceAndFlush(QUOTE_STATUS_UPDATE_RETRY_INTERVAL_MS + 1000);

      // At least one additional fetch attempt after the retry interval
      expect(fetchSpy.mock.calls.length).toBeGreaterThan(callsAfterFirst);
    });

    it('processes multiple initial entries with a 125 ms stagger', async () => {
      fetchSpy = mockFetchOk();
      const entry1 = buildEntry({ quoteId: 'q1', srcTxHash: '0xhash1' });
      const entry2 = buildEntry({ quoteId: 'q2', srcTxHash: '0xhash2' });

      buildManager({
        initialDeferredUpdates: {
          'q1:0xhash1': entry1,
          'q2:0xhash2': entry2,
        },
      });

      // No fetches yet — both are scheduled with setTimeout
      expect(fetchSpy).not.toHaveBeenCalled();

      // Fire setTimeout(0) for first entry
      await advanceAndFlush(0);

      // First entry processed at t=0
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Fire setTimeout(125) for second entry
      await advanceAndFlush(125);
      await flushPromises();

      // Second entry processed at t=125
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    // ── #processSingleEntry guard branches ────────────────────────────────────

    it('skips processing in the stagger callback when isEnabled returns false (lines 253-254)', async () => {
      fetchSpy = mockFetchOk();
      const entry = buildEntry();
      const { persistDeferredUpdates } = buildManager({
        initialDeferredUpdates: { [QUEUE_KEY]: entry },
        isEnabled: (): boolean => false,
      });

      // Fire the stagger setTimeout(0)
      await advanceAndFlush(0);

      // No fetch — #processSingleEntry returned early because isEnabled() is false
      expect(fetchSpy).not.toHaveBeenCalled();
      // No state change — the early return did not call #removeEntry or #persistToState
      expect(persistDeferredUpdates).not.toHaveBeenCalledWith({});
    });

    it('skips processing via the retry timer when isEnabled returns false (lines 253-254)', async () => {
      fetchSpy = mockFetchNetworkError();
      let enabled = true;
      const { manager } = buildManager({
        isEnabled: (): boolean => enabled,
      });

      // Enqueue while enabled — initial send fails, timer starts
      manager.reportSubmitted(QUOTE_ID, SRC_TX_HASH, TX_META_ID);
      await flushPromises();

      const callsAfterFirst = fetchSpy.mock.calls.length;

      // Disable before the next retry interval
      enabled = false;

      await advanceAndFlush(QUOTE_STATUS_UPDATE_RETRY_INTERVAL_MS + 1000);

      // No additional fetches while disabled
      expect(fetchSpy.mock.calls).toHaveLength(callsAfterFirst);
    });

    it('removes an entry with empty pendingStatuses via stagger (lines 265-267)', async () => {
      fetchSpy = mockFetchOk();
      const emptyEntry = buildEntry({ pendingStatuses: [] });
      const { persistDeferredUpdates } = buildManager({
        initialDeferredUpdates: { [QUEUE_KEY]: emptyEntry },
      });

      // Fire the stagger — #processSingleEntry sees pendingStatuses.length === 0
      await advanceAndFlush(0);
      await flushPromises();

      // No fetch — entry removed before any API call
      expect(fetchSpy).not.toHaveBeenCalled();
      // Queue drained by defensive cleanup
      const lastPersisted =
        persistDeferredUpdates.mock.calls[
          persistDeferredUpdates.mock.calls.length - 1
        ][0];
      expect(lastPersisted).toStrictEqual({});
    });

    it('evicts an expired entry inside #processSingleEntry via reportFinalised (lines 274-284)', async () => {
      // Strategy: load an entry that is 1 ms short of expiry so #dropExpiredEntries
      // in the constructor does NOT evict it.  Keep isEnabled=false so the stagger
      // returns early at line 253.  After advancing time 2 ms past the expiry
      // boundary, toggle isEnabled=true and call reportFinalised, which calls
      // #processSingleEntry directly (bypassing #dropExpiredEntries).  At that
      // point Date.now() is past the boundary and lines 274-284 are hit.
      fetchSpy = mockFetchOk();
      let enabled = false;
      const almostExpiredEntry = buildEntry({
        createdAt: Date.now() - (QUOTE_STATUS_UPDATE_RETRY_MAX_LIFETIME_MS - 1),
      });
      const { manager, onError, persistDeferredUpdates } = buildManager({
        initialDeferredUpdates: { [QUEUE_KEY]: almostExpiredEntry },
        isEnabled: (): boolean => enabled,
      });

      // Fire the stagger (isEnabled=false → early return at 253-254; no eviction)
      // then advance 2 ms so Date.now() is 1 ms past the expiry boundary.
      await advanceAndFlush(2);

      // Enable and trigger reportFinalised — it calls #processSingleEntry directly
      enabled = true;
      manager.reportFinalised(TX_META_ID, true);

      // Entry is expired inside #processSingleEntry → evicted at lines 274-284
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0]).toBeInstanceOf(QuoteStatusUpdateError);
      const lastPersisted =
        persistDeferredUpdates.mock.calls[
          persistDeferredUpdates.mock.calls.length - 1
        ][0];
      expect(lastPersisted).toStrictEqual({});
    });
  });

  // ── reportSubmitted ────────────────────────────────────────────────────────

  describe('reportSubmitted', () => {
    it('does nothing when isEnabled is not provided', async () => {
      fetchSpy = mockFetchOk();
      const { manager, persistDeferredUpdates } = buildManager({
        isEnabled: undefined,
      });

      manager.reportSubmitted(QUOTE_ID, SRC_TX_HASH, TX_META_ID);

      expect(persistDeferredUpdates).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('does nothing when isEnabled returns false', async () => {
      fetchSpy = mockFetchOk();
      const { manager, persistDeferredUpdates } = buildManager({
        isEnabled: () => false,
      });

      manager.reportSubmitted(QUOTE_ID, SRC_TX_HASH, TX_META_ID);

      expect(persistDeferredUpdates).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('enqueues a SUBMITTED entry and immediately persists state', () => {
      fetchSpy = mockFetchOk();
      const { manager, persistDeferredUpdates } = buildManager();

      manager.reportSubmitted(QUOTE_ID, SRC_TX_HASH, TX_META_ID);

      expect(persistDeferredUpdates).toHaveBeenCalledTimes(1);
      const persisted = persistDeferredUpdates.mock.calls[0][0];
      expect(persisted[QUEUE_KEY]).toMatchObject({
        quoteId: QUOTE_ID,
        srcTxHash: SRC_TX_HASH,
        txMetaId: TX_META_ID,
        pendingStatuses: [QuoteStatusUpdateType.Submitted],
      });
    });

    it('immediately attempts to send the SUBMITTED status', async () => {
      fetchSpy = mockFetchOk();
      const { manager } = buildManager();

      manager.reportSubmitted(QUOTE_ID, SRC_TX_HASH, TX_META_ID);
      await flushPromises();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe(`${API_BASE_URL}/quote/updateStatus`);
      expect(JSON.parse((init as RequestInit).body as string)).toStrictEqual({
        quoteId: QUOTE_ID,
        newStatus: QuoteStatusUpdateType.Submitted,
        srcTxHash: SRC_TX_HASH,
      });
    });

    it('sends the JWT in the request headers', async () => {
      fetchSpy = mockFetchOk();
      const { manager } = buildManager();

      manager.reportSubmitted(QUOTE_ID, SRC_TX_HASH, TX_META_ID);
      await flushPromises();

      const [, init] = fetchSpy.mock.calls[0];
      expect((init as RequestInit).headers).toMatchObject({
        Authorization: `Bearer ${JWT_TOKEN}`,
      });
    });

    it('removes the entry from persisted state after a successful send', async () => {
      fetchSpy = mockFetchOk();
      const { manager, persistDeferredUpdates } = buildManager();

      manager.reportSubmitted(QUOTE_ID, SRC_TX_HASH, TX_META_ID);
      await flushPromises();

      // Last persist call should contain an empty record (entry removed)
      const lastCall =
        persistDeferredUpdates.mock.calls[
          persistDeferredUpdates.mock.calls.length - 1
        ][0];
      expect(lastCall).toStrictEqual({});
    });
  });

  // ── reportFinalised ────────────────────────────────────────────────────────

  describe('reportFinalised', () => {
    it('does nothing when isEnabled returns false', async () => {
      fetchSpy = mockFetchOk();
      const { manager, persistDeferredUpdates } = buildManager({
        isEnabled: () => false,
      });

      manager.reportFinalised(TX_META_ID, true);

      expect(persistDeferredUpdates).not.toHaveBeenCalled();
    });

    it('does nothing when no matching entry is found by txMetaId', async () => {
      fetchSpy = mockFetchOk();
      const { manager, persistDeferredUpdates } = buildManager();

      manager.reportFinalised('non-existent-tx-meta-id', true);

      expect(persistDeferredUpdates).not.toHaveBeenCalled();
    });

    it('appends FINALIZED_SUCCESS when success is true', async () => {
      fetchSpy = mockFetchOk();
      const { manager, persistDeferredUpdates } = buildManager();

      // Enqueue SUBMITTED — SUBMITTED is in-flight immediately
      manager.reportSubmitted(QUOTE_ID, SRC_TX_HASH, TX_META_ID);
      // Append FINALIZED_SUCCESS while SUBMITTED is in-flight
      manager.reportFinalised(TX_META_ID, true);

      // Verify FINALIZED_SUCCESS was appended before any async work completes
      const pendingCall = persistDeferredUpdates.mock.calls.find((call) =>
        call[0][QUEUE_KEY]?.pendingStatuses.includes(
          QuoteStatusUpdateType.FinalizedSuccess,
        ),
      );
      expect(pendingCall).toBeDefined();

      await flushPromises();
    });

    it('appends FINALIZED_FAILURE when success is false', () => {
      fetchSpy = mockFetchOk();
      const { manager, persistDeferredUpdates } = buildManager();

      manager.reportSubmitted(QUOTE_ID, SRC_TX_HASH, TX_META_ID);
      manager.reportFinalised(TX_META_ID, false);

      const failureCall = persistDeferredUpdates.mock.calls.find((call) =>
        call[0][QUEUE_KEY]?.pendingStatuses.includes(
          QuoteStatusUpdateType.FinalizedFailure,
        ),
      );
      expect(failureCall).toBeDefined();
    });

    it('triggers immediate processing when no send is in-flight', async () => {
      // First call: network error — entry stays, mutex released
      // Second call: both SUBMITTED and FINALIZED_SUCCESS succeed
      fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValue({ ok: true } as Response);

      const { manager } = buildManager();

      manager.reportSubmitted(QUOTE_ID, SRC_TX_HASH, TX_META_ID);
      await flushPromises(); // SUBMITTED fails → entry stays, mutex released

      // Entry is in queue but NOT in-flight — reportFinalised triggers immediate processing
      manager.reportFinalised(TX_META_ID, true);
      await flushPromises(); // Processes SUBMITTED then FINALIZED_SUCCESS

      // 1 failed SUBMITTED + 1 re-sent SUBMITTED + 1 FINALIZED_SUCCESS = 3
      expect(fetchSpy).toHaveBeenCalledTimes(3);
      expect(
        JSON.parse(
          (fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1][1] as RequestInit)
            .body as string,
        ).newStatus,
      ).toBe(QuoteStatusUpdateType.FinalizedSuccess);
    });

    it('does not trigger a second concurrent processing when a send is in-flight', async () => {
      fetchSpy = mockFetchOk();
      const { manager } = buildManager();

      // SUBMITTED is in-flight
      manager.reportSubmitted(QUOTE_ID, SRC_TX_HASH, TX_META_ID);

      // While SUBMITTED is in-flight, reportFinalised should NOT call processSingleEntry
      // (it should just append and wait for the in-flight chain to continue)
      manager.reportFinalised(TX_META_ID, true);

      await flushPromises();

      // Both statuses sent in sequence (2 total)
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  // ── destroy ────────────────────────────────────────────────────────────────

  describe('destroy', () => {
    it('stops the retry timer', async () => {
      fetchSpy = mockFetchNetworkError();
      const entry = buildEntry();
      const { manager } = buildManager({
        initialDeferredUpdates: { [QUEUE_KEY]: entry },
      });

      // Fire the initial stagger
      await advanceAndFlush(0);
      await flushPromises();

      manager.destroy();

      const callCountAfterDestroy = fetchSpy.mock.calls.length;

      // Advance past several retry intervals — no new fetches should fire
      await advanceAndFlush(QUOTE_STATUS_UPDATE_RETRY_INTERVAL_MS * 3);

      expect(fetchSpy.mock.calls).toHaveLength(callCountAfterDestroy);
    });

    it('clears the in-memory queue', () => {
      fetchSpy = mockFetchOk();
      const { manager, persistDeferredUpdates } = buildManager();

      manager.reportSubmitted(QUOTE_ID, SRC_TX_HASH, TX_META_ID);
      manager.destroy();

      persistDeferredUpdates.mockClear();

      // After destroy, reportSubmitted on same key enqueues fresh without conflict
      manager.reportSubmitted(QUOTE_ID, SRC_TX_HASH, TX_META_ID);
      expect(persistDeferredUpdates).toHaveBeenCalledTimes(1);
    });
  });

  // ── API request ────────────────────────────────────────────────────────────

  describe('API request', () => {
    it('uses the correct endpoint URL', async () => {
      fetchSpy = mockFetchOk();
      const { manager } = buildManager();

      manager.reportSubmitted(QUOTE_ID, SRC_TX_HASH, TX_META_ID);
      await flushPromises();

      expect(fetchSpy.mock.calls[0][0]).toBe(
        `${API_BASE_URL}/quote/updateStatus`,
      );
    });

    it('uses POST method with JSON content-type', async () => {
      fetchSpy = mockFetchOk();
      const { manager } = buildManager();

      manager.reportSubmitted(QUOTE_ID, SRC_TX_HASH, TX_META_ID);
      await flushPromises();

      const init = fetchSpy.mock.calls[0][1] as RequestInit;
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>)['Content-Type']).toBe(
        'application/json',
      );
    });

    it('falls back to no Authorization header when getBearerToken throws', async () => {
      // Build a fresh messenger where getBearerToken always throws
      const { messenger } = buildRootAndChildMessenger(() => {
        throw new Error('auth failed');
      });
      fetchSpy = mockFetchOk();
      const persistDeferredUpdates = jest.fn();
      const manager = new QuoteStatusUpdateManager({
        messenger,
        clientId: BridgeClientId.EXTENSION,
        apiBaseUrl: API_BASE_URL,
        persistDeferredUpdates,
        isEnabled: (): boolean => true,
      });

      manager.reportSubmitted(QUOTE_ID, SRC_TX_HASH, TX_META_ID);
      await flushPromises();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const init = fetchSpy.mock.calls[0][1] as RequestInit;
      expect(
        (init.headers as Record<string, string>).Authorization,
      ).toBeUndefined();
    });
  });

  // ── Retry logic ────────────────────────────────────────────────────────────

  describe('retry logic', () => {
    describe('on network failure', () => {
      it('keeps the entry in the queue and updates lastAttemptAt', async () => {
        fetchSpy = mockFetchNetworkError();
        const { manager, persistDeferredUpdates } = buildManager();

        const before = Date.now();
        manager.reportSubmitted(QUOTE_ID, SRC_TX_HASH, TX_META_ID);
        await flushPromises();

        const lastPersisted =
          persistDeferredUpdates.mock.calls[
            persistDeferredUpdates.mock.calls.length - 1
          ][0];
        expect(lastPersisted[QUEUE_KEY]).toBeDefined();
        expect(lastPersisted[QUEUE_KEY].lastAttemptAt).toBeGreaterThanOrEqual(
          before,
        );
      });

      it('retries after QUOTE_STATUS_UPDATE_RETRY_INTERVAL_MS', async () => {
        fetchSpy = mockFetchNetworkError();
        const { manager } = buildManager();

        manager.reportSubmitted(QUOTE_ID, SRC_TX_HASH, TX_META_ID);
        await flushPromises();

        const callsAfterFirst = fetchSpy.mock.calls.length;

        await advanceAndFlush(QUOTE_STATUS_UPDATE_RETRY_INTERVAL_MS + 1000);

        expect(fetchSpy.mock.calls.length).toBeGreaterThan(callsAfterFirst);
      });

      it('does not start a second concurrent send for the same key', async () => {
        let resolveFirst!: () => void;
        fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(
          (): Promise<Response> =>
            new Promise<Response>((resolve) => {
              resolveFirst = (): void => resolve({ ok: true } as Response);
            }),
        );

        const { manager } = buildManager();

        manager.reportSubmitted(QUOTE_ID, SRC_TX_HASH, TX_META_ID);
        // Let async chain reach the fetch call (first send is now in-flight)
        await flushPromises();

        expect(fetchSpy).toHaveBeenCalledTimes(1);

        // Second call — entry exists but in-flight guard should prevent second send
        manager.reportSubmitted(QUOTE_ID, SRC_TX_HASH, TX_META_ID);
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        resolveFirst();
        await flushPromises();
      });
    });

    describe(`on ${QuoteStatusUpdateErrorType.ConcurrentUpdate} error`, () => {
      it(`retries immediately up to ${QUOTE_STATUS_UPDATE_IMMEDIATE_MAX_RETRIES} times then keeps in deferred queue`, async () => {
        fetchSpy = mockFetchError({
          type: QuoteStatusUpdateErrorType.ConcurrentUpdate,
        });
        const { manager, persistDeferredUpdates } = buildManager();

        manager.reportSubmitted(QUOTE_ID, SRC_TX_HASH, TX_META_ID);

        // Each attempt (except the first) requires sleep(5000). Advance through all retries.
        await advanceAndFlush(
          QUOTE_STATUS_UPDATE_IMMEDIATE_RETRY_DELAY_MS *
            (QUOTE_STATUS_UPDATE_IMMEDIATE_MAX_RETRIES + 1),
        );

        expect(fetchSpy).toHaveBeenCalledTimes(
          QUOTE_STATUS_UPDATE_IMMEDIATE_MAX_RETRIES + 1,
        );

        // Entry still in deferred queue (not evicted)
        const lastPersisted =
          persistDeferredUpdates.mock.calls[
            persistDeferredUpdates.mock.calls.length - 1
          ][0];
        expect(lastPersisted[QUEUE_KEY]).toBeDefined();
      });
    });

    describe(`on ${QuoteStatusUpdateErrorType.TransactionNotIndexed} error`, () => {
      it('retries immediately the same number of times as ConcurrentUpdate', async () => {
        fetchSpy = mockFetchError({
          type: QuoteStatusUpdateErrorType.TransactionNotIndexed,
        });
        const { manager } = buildManager();

        manager.reportSubmitted(QUOTE_ID, SRC_TX_HASH, TX_META_ID);

        await advanceAndFlush(
          QUOTE_STATUS_UPDATE_IMMEDIATE_RETRY_DELAY_MS *
            (QUOTE_STATUS_UPDATE_IMMEDIATE_MAX_RETRIES + 1),
        );

        expect(fetchSpy).toHaveBeenCalledTimes(
          QUOTE_STATUS_UPDATE_IMMEDIATE_MAX_RETRIES + 1,
        );
      });
    });

    describe(`on ${QuoteStatusUpdateErrorType.QuoteStatusOnChainMismatch} error`, () => {
      it('attempts finalization with the corrected status from the response', async () => {
        const correctedStatus = QuoteStatusUpdateStatus.FinalizedSuccess;

        fetchSpy = jest
          .spyOn(globalThis, 'fetch')
          .mockResolvedValueOnce({
            ok: false,
            json: () =>
              Promise.resolve({
                type: QuoteStatusUpdateErrorType.QuoteStatusOnChainMismatch,
                currentStatus: correctedStatus,
                newStatus: QuoteStatusUpdateType.Submitted,
                statusCode: 400,
                message: 'mismatch',
              }),
          } as unknown as Response)
          .mockResolvedValue({ ok: true } as Response);

        const { manager, persistDeferredUpdates } = buildManager();

        manager.reportSubmitted(QUOTE_ID, SRC_TX_HASH, TX_META_ID);
        await flushPromises();

        // Second fetch should be for the corrected finalization status
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(
          JSON.parse((fetchSpy.mock.calls[1][1] as RequestInit).body as string)
            .newStatus,
        ).toBe(correctedStatus);

        // Entry removed after successful finalization
        const lastPersisted =
          persistDeferredUpdates.mock.calls[
            persistDeferredUpdates.mock.calls.length - 1
          ][0];
        expect(lastPersisted).toStrictEqual({});
      });

      it(`retries finalization up to ${QUOTE_STATUS_UPDATE_IMMEDIATE_MAX_RETRIES} times on network failure then evicts`, async () => {
        fetchSpy = jest
          .spyOn(globalThis, 'fetch')
          .mockResolvedValueOnce({
            ok: false,
            json: () =>
              Promise.resolve({
                type: QuoteStatusUpdateErrorType.QuoteStatusOnChainMismatch,
                currentStatus: QuoteStatusUpdateStatus.FinalizedSuccess,
                newStatus: QuoteStatusUpdateType.Submitted,
                statusCode: 400,
                message: 'mismatch',
              }),
          } as unknown as Response)
          .mockRejectedValue(new Error('finalization network error'));

        const { manager, onError } = buildManager();

        manager.reportSubmitted(QUOTE_ID, SRC_TX_HASH, TX_META_ID);

        // Advance through all finalization retries
        await advanceAndFlush(
          QUOTE_STATUS_UPDATE_IMMEDIATE_RETRY_DELAY_MS *
            (QUOTE_STATUS_UPDATE_IMMEDIATE_MAX_RETRIES + 1),
        );

        // 1 SUBMITTED + (IMMEDIATE_MAX_RETRIES + 1) finalization attempts
        expect(fetchSpy.mock.calls).toHaveLength(
          1 + QUOTE_STATUS_UPDATE_IMMEDIATE_MAX_RETRIES + 1,
        );
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError.mock.calls[0][0]).toBeInstanceOf(QuoteStatusUpdateError);
      });
    });

    describe(`on ${QuoteStatusUpdateErrorType.InvalidStatusTransaction} error`, () => {
      it('attempts finalization with the corrected status', async () => {
        const correctedStatus = QuoteStatusUpdateStatus.FinalizedFailed;

        fetchSpy = jest
          .spyOn(globalThis, 'fetch')
          .mockResolvedValueOnce({
            ok: false,
            json: () =>
              Promise.resolve({
                type: QuoteStatusUpdateErrorType.InvalidStatusTransaction,
                currentStatus: correctedStatus,
                newStatus: QuoteStatusUpdateType.Submitted,
                statusCode: 400,
                message: 'invalid',
              }),
          } as unknown as Response)
          .mockResolvedValue({ ok: true } as Response);

        const { manager, persistDeferredUpdates } = buildManager();

        manager.reportSubmitted(QUOTE_ID, SRC_TX_HASH, TX_META_ID);
        await flushPromises();

        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(
          JSON.parse((fetchSpy.mock.calls[1][1] as RequestInit).body as string)
            .newStatus,
        ).toBe(correctedStatus);

        const lastPersisted =
          persistDeferredUpdates.mock.calls[
            persistDeferredUpdates.mock.calls.length - 1
          ][0];
        expect(lastPersisted).toStrictEqual({});
      });
    });

    describe('on other non-retryable errors', () => {
      it.each([
        QuoteStatusUpdateErrorType.QuoteNotFound,
        QuoteStatusUpdateErrorType.SvmTradeDeserializeFailed,
        QuoteStatusUpdateErrorType.TxDataMismatch,
        QuoteStatusUpdateErrorType.TxDataMissingHash,
        QuoteStatusUpdateErrorType.PersistQuoteStatusFailed,
      ])('evicts the entry and calls onError for %s', async (errorType) => {
        fetchSpy = mockFetchError({
          type: errorType,
          statusCode: 400,
          message: 'error',
        });
        const { manager, onError, persistDeferredUpdates } = buildManager();

        manager.reportSubmitted(QUOTE_ID, SRC_TX_HASH, TX_META_ID);
        await flushPromises();

        // Entry evicted
        const lastPersisted =
          persistDeferredUpdates.mock.calls[
            persistDeferredUpdates.mock.calls.length - 1
          ][0];
        expect(lastPersisted).toStrictEqual({});

        // Error reported
        expect(onError).toHaveBeenCalledTimes(1);
        const error = onError.mock.calls[0][0] as QuoteStatusUpdateError;
        expect(error).toBeInstanceOf(QuoteStatusUpdateError);
        expect(error.details?.errorType).toBe(errorType);
      });
    });

    describe('expiry', () => {
      it('evicts entries that exceed QUOTE_STATUS_UPDATE_RETRY_MAX_LIFETIME_MS when a retry interval fires after expiry', async () => {
        fetchSpy = mockFetchNetworkError();
        const { manager, onError, persistDeferredUpdates } = buildManager();

        manager.reportSubmitted(QUOTE_ID, SRC_TX_HASH, TX_META_ID);
        await flushPromises();

        // Advance past max lifetime AND one full retry interval so the
        // next #processDeferredRetries call sees the entry as expired.
        await advanceAndFlush(
          QUOTE_STATUS_UPDATE_RETRY_MAX_LIFETIME_MS +
            QUOTE_STATUS_UPDATE_RETRY_INTERVAL_MS +
            1000,
        );

        // Entry evicted by #dropExpiredEntries or #processSingleEntry
        const lastPersisted =
          persistDeferredUpdates.mock.calls[
            persistDeferredUpdates.mock.calls.length - 1
          ][0];
        expect(lastPersisted).toStrictEqual({});
        expect(onError).toHaveBeenCalled();
        expect(onError.mock.calls[0][0]).toBeInstanceOf(QuoteStatusUpdateError);
      });

      it('evicts stale entries inside #processSingleEntry before sending', async () => {
        fetchSpy = mockFetchNetworkError();
        const { manager, onError } = buildManager();

        manager.reportSubmitted(QUOTE_ID, SRC_TX_HASH, TX_META_ID);
        await flushPromises();

        // Advance far past max lifetime + multiple retry intervals
        await advanceAndFlush(
          QUOTE_STATUS_UPDATE_RETRY_MAX_LIFETIME_MS +
            QUOTE_STATUS_UPDATE_RETRY_INTERVAL_MS * 2,
        );

        expect(onError).toHaveBeenCalled();
      });

      it('stops the retry timer when the queue becomes empty after success', async () => {
        fetchSpy = mockFetchOk();
        const { manager } = buildManager();

        manager.reportSubmitted(QUOTE_ID, SRC_TX_HASH, TX_META_ID);
        await flushPromises();

        const callCountAfterSuccess = fetchSpy.mock.calls.length;

        // After success the queue is empty and the timer stops
        await advanceAndFlush(QUOTE_STATUS_UPDATE_RETRY_INTERVAL_MS * 2);

        expect(fetchSpy.mock.calls).toHaveLength(callCountAfterSuccess);
      });
    });

    describe('deferred retry timer', () => {
      it('fires every QUOTE_STATUS_UPDATE_RETRY_INTERVAL_MS and retries all pending entries', async () => {
        fetchSpy = mockFetchNetworkError();
        const { manager } = buildManager();

        manager.reportSubmitted('q1', '0xhash1', 'meta1');
        manager.reportSubmitted('q2', '0xhash2', 'meta2');
        await flushPromises();

        const initialCalls = fetchSpy.mock.calls.length; // 2

        await advanceAndFlush(QUOTE_STATUS_UPDATE_RETRY_INTERVAL_MS + 500);

        // Both entries retried
        expect(fetchSpy.mock.calls).toHaveLength(initialCalls + 2);
      });
    });

    describe('FIFO ordering of pending statuses', () => {
      it('sends SUBMITTED before FINALIZED_SUCCESS', async () => {
        const sentStatuses: string[] = [];
        fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(
          async (_url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
            const body = JSON.parse((init as RequestInit).body as string);
            sentStatuses.push(body.newStatus as string);
            return { ok: true } as Response;
          },
        );

        const { manager } = buildManager();

        manager.reportSubmitted(QUOTE_ID, SRC_TX_HASH, TX_META_ID);
        // Append FINALIZED immediately while SUBMITTED is still being sent
        manager.reportFinalised(TX_META_ID, true);
        await flushPromises();

        expect(sentStatuses[0]).toBe(QuoteStatusUpdateType.Submitted);
        expect(sentStatuses[1]).toBe(QuoteStatusUpdateType.FinalizedSuccess);
      });
    });
  });

  // ── Persistence ────────────────────────────────────────────────────────────

  describe('persistence', () => {
    it('persists after every state change', async () => {
      fetchSpy = mockFetchOk();
      const { manager, persistDeferredUpdates } = buildManager();

      // enqueue → 1 persist
      manager.reportSubmitted(QUOTE_ID, SRC_TX_HASH, TX_META_ID);
      expect(persistDeferredUpdates).toHaveBeenCalledTimes(1);

      await flushPromises();

      // success → 1 more persist (on #removeEntry)
      expect(persistDeferredUpdates).toHaveBeenCalledTimes(2);
    });

    it('persisted record is a plain object (not a Map), safe for Immer', () => {
      fetchSpy = mockFetchOk();
      const { manager, persistDeferredUpdates } = buildManager();

      manager.reportSubmitted(QUOTE_ID, SRC_TX_HASH, TX_META_ID);

      const persisted = persistDeferredUpdates.mock.calls[0][0];
      expect(persisted).not.toBeInstanceOf(Map);
      expect(typeof persisted).toBe('object');
    });

    it('persisted pendingStatuses arrays are independent copies across persist calls', () => {
      fetchSpy = mockFetchOk();
      const { manager, persistDeferredUpdates } = buildManager();

      // First persist: enqueue with ['SUBMITTED']
      manager.reportSubmitted(QUOTE_ID, SRC_TX_HASH, TX_META_ID);
      const firstPersistStatuses = [
        ...persistDeferredUpdates.mock.calls[0][0][QUEUE_KEY].pendingStatuses,
      ];

      // Append FINALIZED_SUCCESS — triggers a second persist call
      manager.reportFinalised(TX_META_ID, true);
      const secondPersistStatuses =
        persistDeferredUpdates.mock.calls[1][0][QUEUE_KEY].pendingStatuses;

      // First persist captured only ['SUBMITTED']
      expect(firstPersistStatuses).toStrictEqual([
        QuoteStatusUpdateType.Submitted,
      ]);
      // Second persist captured ['SUBMITTED', 'FINALIZED_SUCCESS']
      expect(secondPersistStatuses).toStrictEqual([
        QuoteStatusUpdateType.Submitted,
        QuoteStatusUpdateType.FinalizedSuccess,
      ]);
    });

    it('reflects empty record when queue is drained', async () => {
      fetchSpy = mockFetchOk();
      const { manager, persistDeferredUpdates } = buildManager();

      manager.reportSubmitted(QUOTE_ID, SRC_TX_HASH, TX_META_ID);
      await flushPromises();

      const lastPersisted =
        persistDeferredUpdates.mock.calls[
          persistDeferredUpdates.mock.calls.length - 1
        ][0];
      expect(lastPersisted).toStrictEqual({});
    });

    it('reflects multiple entries correctly', () => {
      fetchSpy = mockFetchOk();
      const { manager, persistDeferredUpdates } = buildManager();

      manager.reportSubmitted('q1', '0xhash1', 'meta1');
      manager.reportSubmitted('q2', '0xhash2', 'meta2');

      const lastPersisted =
        persistDeferredUpdates.mock.calls[
          persistDeferredUpdates.mock.calls.length - 1
        ][0];
      expect(Object.keys(lastPersisted)).toHaveLength(2);
      expect(lastPersisted['q1:0xhash1']).toBeDefined();
      expect(lastPersisted['q2:0xhash2']).toBeDefined();
    });

    it('restores a live mutable queue from frozen initialDeferredUpdates', async () => {
      fetchSpy = mockFetchOk();
      const frozenEntry = Object.freeze(
        buildEntry({
          pendingStatuses: Object.freeze([
            QuoteStatusUpdateType.Submitted,
          ]) as string[],
        }),
      );

      const { persistDeferredUpdates } = buildManager({
        initialDeferredUpdates: {
          [QUEUE_KEY]: frozenEntry as DeferredStatusUpdateEntry,
        },
      });

      // Fire the stagger setTimeout(0) and let the send complete
      await advanceAndFlush(0);
      await flushPromises();

      // Manager successfully mutated pendingStatuses (shift) without throwing
      const lastPersisted =
        persistDeferredUpdates.mock.calls[
          persistDeferredUpdates.mock.calls.length - 1
        ][0];
      expect(lastPersisted).toStrictEqual({});
    });
  });
});
