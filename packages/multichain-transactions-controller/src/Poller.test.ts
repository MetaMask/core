import { Poller } from './Poller';

describe('Poller', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('executes callback after starting', async () => {
    const mockCallback = jest.fn();
    const poller = new Poller(mockCallback, 1000);

    poller.start();

    expect(mockCallback).not.toHaveBeenCalled();
    jest.runOnlyPendingTimers();
    jest.advanceTimersByTime(0);
    expect(mockCallback).toHaveBeenCalledTimes(1);
  });

  it('executes callback multiple times with interval', async () => {
    const mockCallback = jest.fn();
    const poller = new Poller(mockCallback, 1000);

    poller.start();

    jest.runOnlyPendingTimers();
    jest.advanceTimersByTime(0);
    expect(mockCallback).toHaveBeenCalledTimes(1);

    jest.runOnlyPendingTimers();
    jest.advanceTimersByTime(0);
    expect(mockCallback).toHaveBeenCalledTimes(2);
  });

  it('stops executing after stop is called', async () => {
    const mockCallback = jest.fn();
    const poller = new Poller(mockCallback, 1000);

    poller.start();
    jest.runOnlyPendingTimers();
    jest.advanceTimersByTime(0);
    expect(mockCallback).toHaveBeenCalledTimes(1);

    poller.stop();
    jest.runOnlyPendingTimers();
    jest.advanceTimersByTime(0);
    expect(mockCallback).toHaveBeenCalledTimes(1);
  });

  it('handles async callbacks', async () => {
    const mockCallback = jest.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
    });
    const poller = new Poller(mockCallback, 1000);

    poller.start();

    jest.runOnlyPendingTimers();
    jest.advanceTimersByTime(500); // Advance time to complete the async operation
    expect(mockCallback).toHaveBeenCalledTimes(1);
  });
  it('does nothing when start is called multiple times', async () => {
    const mockCallback = jest.fn();
    const poller = new Poller(mockCallback, 1000);

    poller.start();
    poller.start(); // Second call should do nothing

    jest.runOnlyPendingTimers();
    jest.advanceTimersByTime(0);
    expect(mockCallback).toHaveBeenCalledTimes(1);
  });

  it('does nothing when stop is called before start', () => {
    const mockCallback = jest.fn();
    const poller = new Poller(mockCallback, 1000);

    poller.stop();
    expect(mockCallback).not.toHaveBeenCalled();
  });
});
