import { SolAccountType, SolMethod } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import { v4 as uuidv4 } from 'uuid';

import { MultichainTransactionsTracker } from './MultichainTransactionsTracker';

type PollerMock = {
  start: jest.Mock;
  stop: jest.Mock;
};

const mockStart = jest.fn();
const mockStop = jest.fn();

jest.mock('./Poller', () => ({
  __esModule: true,
  Poller(this: PollerMock) {
    this.start = mockStart;
    this.stop = mockStop;
    return this;
  },
}));

const MOCK_TIMESTAMP = 1733788800;

const mockSolanaAccount = {
  address: '',
  id: uuidv4(),
  metadata: {
    name: 'Solana Account',
    importTime: Date.now(),
    keyring: {
      type: KeyringTypes.snap,
    },
    snap: {
      id: 'mock-solana-snap',
      name: 'mock-solana-snap',
      enabled: true,
    },
    lastSelected: 0,
  },
  options: {},
  methods: [SolMethod.SendAndConfirmTransaction],
  type: SolAccountType.DataAccount,
};

/**
 * Creates and returns a new MultichainTransactionsTracker instance with a mock update function.
 *
 * @returns The tracker instance and mock update function.
 */
function setupTracker(): {
  tracker: MultichainTransactionsTracker;
  mockUpdateTransactions: jest.Mock;
} {
  const mockUpdateTransactions = jest.fn();
  const tracker = new MultichainTransactionsTracker(mockUpdateTransactions);

  return {
    tracker,
    mockUpdateTransactions,
  };
}

describe('MultichainTransactionsTracker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts polling when calling start', async () => {
    const { tracker } = setupTracker();

    tracker.start();
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it('stops polling when calling stop', async () => {
    const { tracker } = setupTracker();

    tracker.start();
    tracker.stop();
    expect(mockStop).toHaveBeenCalledTimes(1);
  });

  it('is not tracking if none accounts have been registered', async () => {
    const { tracker, mockUpdateTransactions } = setupTracker();

    tracker.start();
    await tracker.updateTransactions();

    expect(mockUpdateTransactions).not.toHaveBeenCalled();
  });

  it('tracks account transactions', async () => {
    const { tracker, mockUpdateTransactions } = setupTracker();

    tracker.start();
    tracker.track(mockSolanaAccount.id, 0);
    await tracker.updateTransactions();

    expect(mockUpdateTransactions).toHaveBeenCalledWith(mockSolanaAccount.id, {
      limit: 10,
    });
  });

  it('untracks account transactions', async () => {
    const { tracker, mockUpdateTransactions } = setupTracker();

    tracker.start();
    tracker.track(mockSolanaAccount.id, 0);
    await tracker.updateTransactions();
    expect(mockUpdateTransactions).toHaveBeenCalledWith(mockSolanaAccount.id, {
      limit: 10,
    });

    tracker.untrack(mockSolanaAccount.id);
    await tracker.updateTransactions();
    expect(mockUpdateTransactions).toHaveBeenCalledTimes(1);
  });

  it('tracks account after being registered', async () => {
    const { tracker } = setupTracker();

    tracker.start();
    tracker.track(mockSolanaAccount.id, 0);
    expect(tracker.isTracked(mockSolanaAccount.id)).toBe(true);
  });

  it('does not track account if not registered', async () => {
    const { tracker } = setupTracker();

    tracker.start();
    expect(tracker.isTracked(mockSolanaAccount.id)).toBe(false);
  });

  it('does not refresh transactions if they are considered up-to-date', async () => {
    const { tracker, mockUpdateTransactions } = setupTracker();

    const blockTime = 400;
    jest
      .spyOn(global.Date, 'now')
      .mockImplementation(() => new Date(MOCK_TIMESTAMP).getTime());

    tracker.start();
    tracker.track(mockSolanaAccount.id, blockTime);
    await tracker.updateTransactions();
    expect(mockUpdateTransactions).toHaveBeenCalledTimes(1);

    await tracker.updateTransactions();
    expect(mockUpdateTransactions).toHaveBeenCalledTimes(1);

    jest
      .spyOn(global.Date, 'now')
      .mockImplementation(() => new Date(MOCK_TIMESTAMP + blockTime).getTime());

    await tracker.updateTransactions();
    expect(mockUpdateTransactions).toHaveBeenCalledTimes(2);
  });
});
