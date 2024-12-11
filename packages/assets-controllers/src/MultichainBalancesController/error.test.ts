import { BalancesTrackerError, PollerError } from './error';

describe('BalancesTrackerError', () => {
  it('creates an instance of BalancesTrackerError with the correct message and name', () => {
    const message = 'Test BalancesTrackerError message';
    const error = new BalancesTrackerError(message);

    expect(error).toBeInstanceOf(BalancesTrackerError);
    expect(error.message).toBe(message);
    expect(error.name).toBe('BalancesTrackerError');
  });
});

describe('PollerError', () => {
  it('creates an instance of PollerError with the correct message and name', () => {
    const message = 'Test PollerError message';
    const error = new PollerError(message);

    expect(error).toBeInstanceOf(PollerError);
    expect(error.message).toBe(message);
    expect(error.name).toBe('PollerError');
  });
});
