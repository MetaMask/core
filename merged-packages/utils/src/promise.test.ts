import { createDeferredPromise } from './promise';

describe('Promise utilities', () => {
  describe('createDeferredPromise', () => {
    it('creates a deferred promise that resolves when resolve is called', async () => {
      const { promise, resolve } = createDeferredPromise();

      resolve();

      expect(await promise).toBeUndefined();
    });

    it('creates a deferred promise that returns a value', async () => {
      const { promise, resolve } = createDeferredPromise<number>();

      resolve(10);

      expect(await promise).toBe(10);
    });

    it('creates a deferred promise that rejects when reject is called', async () => {
      const { promise, reject } = createDeferredPromise();
      const mockError = new Error('test error');

      reject(mockError);

      await expect(promise).rejects.toThrow('test error');
    });

    it('ignores subsequent calls to reject or resolve', async () => {
      const { promise, reject, resolve } = createDeferredPromise();
      resolve();
      await promise;

      expect(() => reject(new Error('test error'))).not.toThrow();
      expect(() => resolve()).not.toThrow();
    });

    describe('when suppressUnhandledRejection is set', () => {
      it('does not trigger an unhandled rejection event when the rejection is unhandled', async () => {
        const { reject } = createDeferredPromise({
          suppressUnhandledRejection: true,
        });
        const mockError = new Error('test error');
        reject(mockError);

        // Wait for unhandled rejection error to be triggered
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });

        // If the test reaches here, it has succeeded
        expect(true).toBe(true);
      });
    });
  });
});
