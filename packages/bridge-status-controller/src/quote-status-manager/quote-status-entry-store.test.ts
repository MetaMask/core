import { QuoteStatusState } from './constants';
import { QuoteStatusEntryStore } from './quote-status-entry-store';
import { QuoteStatusStateFsm } from './quote-status-state-fsm';
import type { QuoteStatusPersistEntry, QuoteStatusRuntimeEntry } from './types';

const TTL_MS = 1000;
const NOW = 1_000_000;

/**
 * Builds the value accepted by {@link QuoteStatusEntryStore.put}.
 *
 * @param overrides - Fields to override on the default value.
 * @returns A runtime entry without the store-managed timestamps.
 */
function createPutValue(
  overrides: Partial<
    Omit<QuoteStatusRuntimeEntry, 'createdAt' | 'lastAttemptAt'>
  > = {},
): Omit<QuoteStatusRuntimeEntry, 'createdAt' | 'lastAttemptAt'> {
  return {
    quoteId: 'quote-1',
    srcTxHash: '0xabc',
    status: new QuoteStatusStateFsm(QuoteStatusState.Submitted),
    ...overrides,
  };
}

/**
 * Builds a persisted entry used to seed a store via the `initial` option.
 *
 * @param overrides - Fields to override on the default entry.
 * @returns A serializable persisted entry.
 */
function createPersistEntry(
  overrides: Partial<QuoteStatusPersistEntry> = {},
): QuoteStatusPersistEntry {
  return {
    quoteId: 'quote-1',
    srcTxHash: '0xabc',
    status: QuoteStatusState.Submitted,
    createdAt: NOW,
    lastAttemptAt: NOW,
    ...overrides,
  };
}

/**
 * Creates a store with a stubbed `onPersistUpdates` callback.
 *
 * @param options - Optional store overrides.
 * @param options.initial - Initial persisted entries to seed.
 * @param options.entryTtlMs - TTL override.
 * @returns The store and its persistence spy.
 */
function createStore({
  initial,
  entryTtlMs = TTL_MS,
}: {
  initial?: Record<string, QuoteStatusPersistEntry>;
  entryTtlMs?: number;
} = {}): {
  store: QuoteStatusEntryStore;
  onPersistUpdates: jest.Mock;
} {
  const onPersistUpdates = jest.fn();
  const store = new QuoteStatusEntryStore({
    onPersistUpdates,
    entryTtlMs,
    initial,
  });
  return { store, onPersistUpdates };
}

describe('QuoteStatusEntryStore', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('hash', () => {
    it('builds a key from the quote id and source tx hash', () => {
      expect(
        QuoteStatusEntryStore.hash({ quoteId: 'q1', srcTxHash: '0xdead' }),
      ).toBe('q1:0xdead');
    });
  });

  describe('constructor', () => {
    it('seeds entries from the initial snapshot', () => {
      const { store } = createStore({
        initial: { 'quote-1:0xabc': createPersistEntry() },
      });

      const entry = store.get('quote-1:0xabc');
      expect(entry).not.toBeNull();
      expect(entry?.status).toBeInstanceOf(QuoteStatusStateFsm);
      expect(entry?.status.state).toBe(QuoteStatusState.Submitted);
    });

    it('starts empty when no initial snapshot is provided', () => {
      const { store } = createStore();

      expect(store.size).toBe(0);
    });

    it('persists when a seeded entry transitions state', () => {
      const { store, onPersistUpdates } = createStore({
        initial: { 'quote-1:0xabc': createPersistEntry() },
      });

      const entry = store.get('quote-1:0xabc');
      entry?.status.transitionTo(QuoteStatusState.FinalizedSuccess);

      expect(onPersistUpdates).toHaveBeenCalledWith({
        'quote-1:0xabc': expect.objectContaining({
          status: QuoteStatusState.FinalizedSuccess,
        }),
      });
    });
  });

  describe('put', () => {
    it('adds a new entry with created and last-attempt timestamps', () => {
      const { store } = createStore();

      store.put('quote-1:0xabc', createPutValue());

      const entry = store.get('quote-1:0xabc');
      expect(entry).toMatchObject({
        quoteId: 'quote-1',
        srcTxHash: '0xabc',
        createdAt: NOW,
        lastAttemptAt: NOW,
      });
    });

    it('persists the snapshot with the flattened status', () => {
      const { store, onPersistUpdates } = createStore();

      store.put('quote-1:0xabc', createPutValue());

      expect(onPersistUpdates).toHaveBeenCalledWith({
        'quote-1:0xabc': expect.objectContaining({
          status: QuoteStatusState.Submitted,
        }),
      });
    });

    it('does not overwrite or reset an existing entry', () => {
      const { store, onPersistUpdates } = createStore();
      store.put('quote-1:0xabc', createPutValue());
      onPersistUpdates.mockClear();

      jest.spyOn(Date, 'now').mockReturnValue(NOW + 500);
      store.put('quote-1:0xabc', createPutValue());

      expect(store.get('quote-1:0xabc')?.createdAt).toBe(NOW);
      expect(onPersistUpdates).not.toHaveBeenCalled();
    });

    it('backfills a missing txMetaId on an existing entry', () => {
      const { store, onPersistUpdates } = createStore();
      store.put('quote-1:0xabc', createPutValue());
      onPersistUpdates.mockClear();

      store.put('quote-1:0xabc', createPutValue({ txMetaId: 'tx-1' }));

      expect(store.get('quote-1:0xabc')?.txMetaId).toBe('tx-1');
      expect(onPersistUpdates).toHaveBeenCalledTimes(1);
    });

    it('does not overwrite an existing txMetaId', () => {
      const { store } = createStore();
      store.put('quote-1:0xabc', createPutValue({ txMetaId: 'tx-1' }));

      store.put('quote-1:0xabc', createPutValue({ txMetaId: 'tx-2' }));

      expect(store.get('quote-1:0xabc')?.txMetaId).toBe('tx-1');
    });

    it('persists when a runtime-added entry transitions state', () => {
      const { store, onPersistUpdates } = createStore();
      store.put('quote-1:0xabc', createPutValue());
      onPersistUpdates.mockClear();

      store
        .get('quote-1:0xabc')
        ?.status.transitionTo(QuoteStatusState.FinalizedSuccess);

      expect(onPersistUpdates).toHaveBeenCalledTimes(1);
    });
  });

  describe('get', () => {
    it('returns null for an unknown key', () => {
      const { store } = createStore();

      expect(store.get('missing')).toBeNull();
    });

    it('evicts and returns null for an expired entry', () => {
      const { store, onPersistUpdates } = createStore();
      store.put('quote-1:0xabc', createPutValue());
      onPersistUpdates.mockClear();
      jest.spyOn(Date, 'now').mockReturnValue(NOW + TTL_MS + 1);

      expect(store.get('quote-1:0xabc')).toBeNull();
      expect(store.size).toBe(0);
      expect(onPersistUpdates).toHaveBeenCalledTimes(1);
    });
  });

  describe('getByTxMetaId', () => {
    it('returns the entry matching the txMetaId', () => {
      const { store } = createStore();
      store.put('quote-1:0xabc', createPutValue({ txMetaId: 'tx-1' }));

      expect(store.getByTxMetaId('tx-1')?.quoteId).toBe('quote-1');
    });

    it('returns null when no entry matches', () => {
      const { store } = createStore();
      store.put('quote-1:0xabc', createPutValue({ txMetaId: 'tx-1' }));

      expect(store.getByTxMetaId('tx-missing')).toBeNull();
    });

    it('evicts and returns null when the matching entry has expired', () => {
      const { store } = createStore();
      store.put('quote-1:0xabc', createPutValue({ txMetaId: 'tx-1' }));
      jest.spyOn(Date, 'now').mockReturnValue(NOW + TTL_MS + 1);

      expect(store.getByTxMetaId('tx-1')).toBeNull();
      expect(store.size).toBe(0);
    });
  });

  describe('delete', () => {
    it('removes an entry and persists', () => {
      const { store, onPersistUpdates } = createStore();
      store.put('quote-1:0xabc', createPutValue());
      onPersistUpdates.mockClear();

      store.delete('quote-1:0xabc');

      expect(store.get('quote-1:0xabc')).toBeNull();
      expect(onPersistUpdates).toHaveBeenCalledTimes(1);
    });

    it('does not persist when the key is absent', () => {
      const { store, onPersistUpdates } = createStore();

      store.delete('missing');

      expect(onPersistUpdates).not.toHaveBeenCalled();
    });

    it('detaches the FSM listener so later transitions do not persist', () => {
      const { store, onPersistUpdates } = createStore();
      store.put('quote-1:0xabc', createPutValue());
      const entry = store.get('quote-1:0xabc');
      store.delete('quote-1:0xabc');
      onPersistUpdates.mockClear();

      entry?.status.transitionTo(QuoteStatusState.FinalizedSuccess);

      expect(onPersistUpdates).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('persists when the entry is still tracked', () => {
      const { store, onPersistUpdates } = createStore();
      store.put('quote-1:0xabc', createPutValue());
      const entry = store.get('quote-1:0xabc') as QuoteStatusRuntimeEntry;
      onPersistUpdates.mockClear();

      store.update(entry);

      expect(onPersistUpdates).toHaveBeenCalledTimes(1);
    });

    it('does not persist when the entry is no longer tracked', () => {
      const { store, onPersistUpdates } = createStore();
      store.put('quote-1:0xabc', createPutValue());
      const entry = store.get('quote-1:0xabc') as QuoteStatusRuntimeEntry;
      store.delete('quote-1:0xabc');
      onPersistUpdates.mockClear();

      store.update(entry);

      expect(onPersistUpdates).not.toHaveBeenCalled();
    });
  });

  describe('values', () => {
    it('evicts expired entries before yielding', () => {
      const { store } = createStore();
      store.put('quote-1:0xabc', createPutValue());
      store.put(
        'quote-2:0xdef',
        createPutValue({ quoteId: 'quote-2', srcTxHash: '0xdef' }),
      );
      jest.spyOn(Date, 'now').mockReturnValue(NOW + TTL_MS + 1);

      expect([...store.values()]).toHaveLength(0);
    });

    it('yields all live entries', () => {
      const { store } = createStore();
      store.put('quote-1:0xabc', createPutValue());
      store.put(
        'quote-2:0xdef',
        createPutValue({ quoteId: 'quote-2', srcTxHash: '0xdef' }),
      );

      expect([...store.values()]).toHaveLength(2);
    });
  });

  describe('entryHasExpired', () => {
    it('returns false within the TTL window', () => {
      const { store } = createStore();
      store.put('quote-1:0xabc', createPutValue());
      jest.spyOn(Date, 'now').mockReturnValue(NOW + TTL_MS);

      const entry = store.get('quote-1:0xabc') as QuoteStatusRuntimeEntry;
      expect(store.entryHasExpired(entry)).toBe(false);
    });

    it('returns true once the age exceeds the TTL', () => {
      const { store } = createStore();
      store.put('quote-1:0xabc', createPutValue());
      const entry = store.get('quote-1:0xabc') as QuoteStatusRuntimeEntry;
      jest.spyOn(Date, 'now').mockReturnValue(NOW + TTL_MS + 1);

      expect(store.entryHasExpired(entry)).toBe(true);
    });
  });

  describe('removeEntryIfExpired', () => {
    it('removes the entry and persists when expired', () => {
      const { store, onPersistUpdates } = createStore();
      store.put('quote-1:0xabc', createPutValue());
      const entry = store.get('quote-1:0xabc') as QuoteStatusRuntimeEntry;
      onPersistUpdates.mockClear();
      jest.spyOn(Date, 'now').mockReturnValue(NOW + TTL_MS + 1);

      expect(store.removeEntryIfExpired(entry)).toBe(true);
      expect(store.size).toBe(0);
      expect(onPersistUpdates).toHaveBeenCalledTimes(1);
    });

    it('keeps the entry and returns false when not expired', () => {
      const { store, onPersistUpdates } = createStore();
      store.put('quote-1:0xabc', createPutValue());
      const entry = store.get('quote-1:0xabc') as QuoteStatusRuntimeEntry;
      onPersistUpdates.mockClear();

      expect(store.removeEntryIfExpired(entry)).toBe(false);
      expect(store.size).toBe(1);
      expect(onPersistUpdates).not.toHaveBeenCalled();
    });
  });

  describe('removeExpiredEntries', () => {
    it('removes only expired entries and persists once', () => {
      const { store, onPersistUpdates } = createStore();
      store.put('quote-1:0xabc', createPutValue());
      jest.spyOn(Date, 'now').mockReturnValue(NOW + 900);
      store.put(
        'quote-2:0xdef',
        createPutValue({ quoteId: 'quote-2', srcTxHash: '0xdef' }),
      );
      onPersistUpdates.mockClear();
      jest.spyOn(Date, 'now').mockReturnValue(NOW + TTL_MS + 1);

      store.removeExpiredEntries();

      expect(store.get('quote-1:0xabc')).toBeNull();
      expect(store.get('quote-2:0xdef')).not.toBeNull();
      expect(onPersistUpdates).toHaveBeenCalledTimes(1);
    });

    it('does not persist when nothing is expired', () => {
      const { store, onPersistUpdates } = createStore();
      store.put('quote-1:0xabc', createPutValue());
      onPersistUpdates.mockClear();

      store.removeExpiredEntries();

      expect(onPersistUpdates).not.toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('removes all entries without persisting', () => {
      const { store, onPersistUpdates } = createStore();
      store.put('quote-1:0xabc', createPutValue());
      store.put(
        'quote-2:0xdef',
        createPutValue({ quoteId: 'quote-2', srcTxHash: '0xdef' }),
      );
      onPersistUpdates.mockClear();

      store.clear();

      expect(store.size).toBe(0);
      expect(onPersistUpdates).not.toHaveBeenCalled();
    });

    it('detaches FSM listeners so later transitions do not persist', () => {
      const { store, onPersistUpdates } = createStore();
      store.put('quote-1:0xabc', createPutValue());
      const entry = store.get('quote-1:0xabc');
      store.clear();
      onPersistUpdates.mockClear();

      entry?.status.transitionTo(QuoteStatusState.FinalizedSuccess);

      expect(onPersistUpdates).not.toHaveBeenCalled();
    });
  });
});
