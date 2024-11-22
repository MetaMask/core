import { BtcAccountType, BtcMethod } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import { v4 as uuidv4 } from 'uuid';

import { BalancesTracker } from './BalancesTracker';
import { Poller } from './Poller';

const MOCK_TIMESTAMP = 1709983353;

const mockBtcAccount = {
  address: '',
  id: uuidv4(),
  metadata: {
    name: 'Bitcoin Account 1',
    importTime: Date.now(),
    keyring: {
      type: KeyringTypes.snap,
    },
    snap: {
      id: 'mock-btc-snap',
      name: 'mock-btc-snap',
      enabled: true,
    },
    lastSelected: 0,
  },
  options: {},
  methods: [BtcMethod.SendMany],
  type: BtcAccountType.P2wpkh,
};

/**
 * Sets up a BalancesTracker instance for testing.
 * @returns The BalancesTracker instance and a mock update balance function.
 */
function setupTracker() {
  const mockUpdateBalance = jest.fn();
  const tracker = new BalancesTracker(mockUpdateBalance);

  return {
    tracker,
    mockUpdateBalance,
  };
}

describe('BalancesTracker', () => {
  it('starts polling when calling start', async () => {
    const { tracker } = setupTracker();
    const spyPoller = jest.spyOn(Poller.prototype, 'start');

    tracker.start();
    expect(spyPoller).toHaveBeenCalledTimes(1);
  });

  it('stops polling when calling stop', async () => {
    const { tracker } = setupTracker();
    const spyPoller = jest.spyOn(Poller.prototype, 'stop');

    tracker.start();
    tracker.stop();
    expect(spyPoller).toHaveBeenCalledTimes(1);
  });

  it('is not tracking if none accounts have been registered', async () => {
    const { tracker, mockUpdateBalance } = setupTracker();

    tracker.start();
    await tracker.updateBalances();

    expect(mockUpdateBalance).not.toHaveBeenCalled();
  });

  it('tracks account balances', async () => {
    const { tracker, mockUpdateBalance } = setupTracker();

    tracker.start();
    // We must track account IDs explicitly
    tracker.track(mockBtcAccount.id, 0);
    // Trigger balances refresh (not waiting for the Poller here)
    await tracker.updateBalances();

    expect(mockUpdateBalance).toHaveBeenCalledWith(mockBtcAccount.id);
  });

  it('untracks account balances', async () => {
    const { tracker, mockUpdateBalance } = setupTracker();

    tracker.start();
    tracker.track(mockBtcAccount.id, 0);
    await tracker.updateBalances();
    expect(mockUpdateBalance).toHaveBeenCalledWith(mockBtcAccount.id);

    tracker.untrack(mockBtcAccount.id);
    await tracker.updateBalances();
    expect(mockUpdateBalance).toHaveBeenCalledTimes(1); // No second call after untracking
  });

  it('tracks account after being registered', async () => {
    const { tracker } = setupTracker();

    tracker.start();
    tracker.track(mockBtcAccount.id, 0);
    expect(tracker.isTracked(mockBtcAccount.id)).toBe(true);
  });

  it('does not track account if not registered', async () => {
    const { tracker } = setupTracker();

    tracker.start();
    expect(tracker.isTracked(mockBtcAccount.id)).toBe(false);
  });

  it('does not refresh balance if they are considered up-to-date', async () => {
    const { tracker, mockUpdateBalance } = setupTracker();

    const blockTime = 10 * 60 * 1000; // 10 minutes in milliseconds.
    jest
      .spyOn(global.Date, 'now')
      .mockImplementation(() => new Date(MOCK_TIMESTAMP).getTime());

    tracker.start();
    tracker.track(mockBtcAccount.id, blockTime);
    await tracker.updateBalances();
    expect(mockUpdateBalance).toHaveBeenCalledTimes(1);

    await tracker.updateBalances();
    expect(mockUpdateBalance).toHaveBeenCalledTimes(1); // No second call since the balances is already still up-to-date

    jest
      .spyOn(global.Date, 'now')
      .mockImplementation(() => new Date(MOCK_TIMESTAMP + blockTime).getTime());

    await tracker.updateBalances();
    expect(mockUpdateBalance).toHaveBeenCalledTimes(2); // Now the balance will update
  });
});
