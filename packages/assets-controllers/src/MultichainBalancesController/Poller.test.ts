import { Poller } from './Poller';

jest.useFakeTimers();

const interval = 1000;
const intervalPlus100ms = interval + 100;

describe('Poller', () => {
  let callback: jest.Mock;

  beforeEach(() => {
    callback = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('calls the callback function after the specified interval', async () => {
    const poller = new Poller(callback, interval);
    poller.start();
    jest.advanceTimersByTime(intervalPlus100ms);
    poller.stop();

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('does not call the callback function if stopped before the interval', async () => {
    const poller = new Poller(callback, interval);
    poller.start();
    poller.stop();
    jest.advanceTimersByTime(intervalPlus100ms);

    expect(callback).not.toHaveBeenCalled();
  });

  it('calls the callback function multiple times if started and stopped multiple times', async () => {
    const poller = new Poller(callback, interval);
    poller.start();
    jest.advanceTimersByTime(intervalPlus100ms);
    poller.stop();
    jest.advanceTimersByTime(intervalPlus100ms);
    poller.start();
    jest.advanceTimersByTime(intervalPlus100ms);
    poller.stop();

    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('does not call the callback if the poller is stopped before the interval has passed', async () => {
    const poller = new Poller(callback, interval);
    poller.start();
    // Wait for some time, but resumes before reaching out
    // the `interval` timeout
    jest.advanceTimersByTime(interval / 2);
    poller.stop();
    expect(callback).not.toHaveBeenCalled();
  });

  it('does not start a new interval if already running', async () => {
    const poller = new Poller(callback, interval);
    poller.start();
    poller.start(); // Attempt to start again
    jest.advanceTimersByTime(intervalPlus100ms);
    poller.stop();

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('can stop multiple times without issues', async () => {
    const poller = new Poller(callback, interval);
    poller.start();
    jest.advanceTimersByTime(interval / 2);
    poller.stop();
    poller.stop(); // Attempt to stop again
    jest.advanceTimersByTime(intervalPlus100ms);

    expect(callback).not.toHaveBeenCalled();
  });
});
