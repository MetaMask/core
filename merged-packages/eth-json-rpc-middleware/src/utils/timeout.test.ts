import { timeout } from './timeout';

describe('timeout', () => {
  describe('with real timers', () => {
    it('does not resolve in the current event loop', async () => {
      const winner = await Promise.race([
        (async () => {
          await timeout(0);
          return 'timeout';
        })(),
        (async () => {
          // nextTick runs immediately at the start of the next event loop
          await new Promise((resolve) => process.nextTick(resolve));
          return 'nextTick';
        })(),
      ]);

      expect(winner).toBe('nextTick');
    });

    it('resolves in the next event loop', async () => {
      const winner = await Promise.race([
        (async () => {
          await timeout(0);
          return 'timeout';
        })(),
        (async () => {
          // setImmediate will run all queued functions
          await new Promise((resolve) => setImmediate(resolve));
          return 'setImmediate';
        })(),
      ]);

      expect(winner).toBe('setImmediate');
    });
  });

  describe('with fake timers', () => {
    beforeAll(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.clearAllTimers();
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    it('does not resolve before given duration', async () => {
      const promise = timeout(100);

      jest.advanceTimersByTime(50);

      expect(promise).toNeverResolve();
    });

    it('resolves after the given duration', async () => {
      const promise = timeout(100);

      jest.advanceTimersByTime(100);

      expect(await promise).toBeUndefined();
    });
  });
});
