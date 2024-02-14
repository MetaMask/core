import { ControllerMessenger } from '@metamask/base-controller';
import { createDeferredPromise } from '@metamask/utils';

import type {
  QueuedRequestControllerActions,
  QueuedRequestControllerEvents,
  QueuedRequestControllerMessenger,
  QueuedRequestControllerOptions,
} from './QueuedRequestController';
import {
  QueuedRequestController,
  controllerName,
} from './QueuedRequestController';

/**
 * Builds a restricted controller messenger for the queued request controller.
 *
 * @param messenger - A controller messenger.
 * @returns The restricted controller messenger.
 */
function buildQueuedRequestControllerMessenger(
  messenger = new ControllerMessenger<
    QueuedRequestControllerActions,
    QueuedRequestControllerEvents
  >(),
): QueuedRequestControllerMessenger {
  return messenger.getRestricted({
    name: controllerName,
  });
}

describe('QueuedRequestController', () => {
  it('can be instantiated with default values', () => {
    const options: QueuedRequestControllerOptions = {
      messenger: buildQueuedRequestControllerMessenger(),
    };

    const controller = new QueuedRequestController(options);
    expect(controller.state).toStrictEqual({ queuedRequestCount: 0 });
  });

  describe('enqueueRequest', () => {
    it('counts a request as queued during processing', async () => {
      const options: QueuedRequestControllerOptions = {
        messenger: buildQueuedRequestControllerMessenger(),
      };
      const controller = new QueuedRequestController(options);

      await controller.enqueueRequest(async () => {
        expect(controller.state.queuedRequestCount).toBe(1);
      });
      expect(controller.state.queuedRequestCount).toBe(0);
    });

    it('counts a request as queued while waiting on another request to finish processing', async () => {
      const options: QueuedRequestControllerOptions = {
        messenger: buildQueuedRequestControllerMessenger(),
      };
      const controller = new QueuedRequestController(options);
      const { promise: firstRequestProcessing, resolve: resolveFirstRequest } =
        createDeferredPromise();
      const firstRequest = controller.enqueueRequest(
        () => firstRequestProcessing,
      );
      const secondRequest = controller.enqueueRequest(async () => {
        expect(controller.state.queuedRequestCount).toBe(1);
      });

      expect(controller.state.queuedRequestCount).toBe(2);

      resolveFirstRequest();
      await firstRequest;
      await secondRequest;
    });

    it('runs the next request immediately when the queue is empty', async () => {
      const options: QueuedRequestControllerOptions = {
        messenger: buildQueuedRequestControllerMessenger(),
      };

      const controller = new QueuedRequestController(options);

      // Mock requestNext function
      const requestNext = jest.fn(() => Promise.resolve());

      await controller.enqueueRequest(requestNext);

      // Expect that the request was called
      expect(requestNext).toHaveBeenCalledTimes(1);
    });

    it('runs each request sequentially in the correct order', async () => {
      const options: QueuedRequestControllerOptions = {
        messenger: buildQueuedRequestControllerMessenger(),
      };

      const controller = new QueuedRequestController(options);

      // Mock requestNext function with resolved promises
      // Use an array to track the order of execution
      const executionOrder: string[] = [];

      // Enqueue requests
      controller.enqueueRequest(async () => {
        executionOrder.push('Request 1 Start');
        await new Promise((resolve) => setTimeout(resolve, 10));
        executionOrder.push('Request 1 End');
      });

      await controller.enqueueRequest(async () => {
        executionOrder.push('Request 2 Start');
        await new Promise((resolve) => setTimeout(resolve, 10));
        executionOrder.push('Request 2 End');
      });

      // Assert that the execution order is correct
      expect(executionOrder).toStrictEqual([
        'Request 1 Start',
        'Request 1 End',
        'Request 2 Start',
        'Request 2 End',
      ]);
    });

    describe('error handling', () => {
      it('handles errors when a request fails', async () => {
        const options: QueuedRequestControllerOptions = {
          messenger: buildQueuedRequestControllerMessenger(),
        };

        const controller = new QueuedRequestController(options);

        // Mock a request that throws an error
        const requestWithError = jest.fn(() =>
          Promise.reject(new Error('Request failed')),
        );

        // Enqueue the request
        await expect(() =>
          controller.enqueueRequest(requestWithError),
        ).rejects.toThrow(new Error('Request failed'));
        expect(controller.length()).toBe(0);
      });

      it('correctly updates the request queue count upon failure', async () => {
        const options: QueuedRequestControllerOptions = {
          messenger: buildQueuedRequestControllerMessenger(),
        };
        const controller = new QueuedRequestController(options);

        await expect(() =>
          controller.enqueueRequest(async () => {
            throw new Error('Request failed');
          }),
        ).rejects.toThrow('Request failed');
        expect(controller.state.queuedRequestCount).toBe(0);
      });

      it('handles errors without interrupting the execution of the next item in the queue', async () => {
        const options: QueuedRequestControllerOptions = {
          messenger: buildQueuedRequestControllerMessenger(),
        };

        const controller = new QueuedRequestController(options);

        // Mock requests with one request throwing an error
        const request1 = jest.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
        });

        const request2 = jest.fn(async () => {
          throw new Error('Request 2 failed');
        });

        const request3 = jest.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
        });

        // Enqueue the requests
        const promise1 = controller.enqueueRequest(request1);
        const promise2 = controller.enqueueRequest(request2);
        const promise3 = controller.enqueueRequest(request3);

        await expect(() =>
          Promise.all([promise1, promise2, promise3]),
        ).rejects.toStrictEqual(new Error('Request 2 failed'));
        // Ensure that request3 still executed despite the error in request2
        expect(request1).toHaveBeenCalled();
        expect(request2).toHaveBeenCalled();
        expect(request3).toHaveBeenCalled();
      });
    });
  });

  describe('countChanged event', () => {
    it('gets emitted when the queue length changes', async () => {
      const options: QueuedRequestControllerOptions = {
        messenger: buildQueuedRequestControllerMessenger(),
      };

      const controller = new QueuedRequestController(options);

      // Mock the event listener
      const eventListener = jest.fn();

      // Subscribe to the countChanged event
      options.messenger.subscribe(
        'QueuedRequestController:countChanged',
        eventListener,
      );

      // Enqueue a request, which should increase the count
      controller.enqueueRequest(
        async () => new Promise((resolve) => setTimeout(resolve, 10)),
      );
      expect(eventListener).toHaveBeenNthCalledWith(1, 1);

      // Enqueue another request, which should increase the count
      controller.enqueueRequest(
        async () => new Promise((resolve) => setTimeout(resolve, 10)),
      );
      expect(eventListener).toHaveBeenNthCalledWith(2, 2);

      // Resolve the first request, which should decrease the count
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(eventListener).toHaveBeenNthCalledWith(3, 1);

      // Resolve the second request, which should decrease the count
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(eventListener).toHaveBeenNthCalledWith(4, 0);
    });
  });

  describe('length', () => {
    it('returns the correct queue length', async () => {
      const options: QueuedRequestControllerOptions = {
        messenger: buildQueuedRequestControllerMessenger(),
      };

      const controller = new QueuedRequestController(options);

      // Initially, the queue length should be 0
      expect(controller.length()).toBe(0);

      const promise = controller.enqueueRequest(async () => {
        expect(controller.length()).toBe(1);
        return Promise.resolve();
      });
      expect(controller.length()).toBe(1);
      await promise;
      expect(controller.length()).toBe(0);
    });

    it('correctly reflects increasing queue length as requests are enqueued', async () => {
      const options: QueuedRequestControllerOptions = {
        messenger: buildQueuedRequestControllerMessenger(),
      };

      const controller = new QueuedRequestController(options);

      expect(controller.length()).toBe(0);

      controller.enqueueRequest(async () => {
        expect(controller.length()).toBe(1);
        return Promise.resolve();
      });
      expect(controller.length()).toBe(1);

      const req2 = controller.enqueueRequest(async () => {
        expect(controller.length()).toBe(2);
        return Promise.resolve();
      });
      expect(controller.length()).toBe(2);

      const req3 = controller.enqueueRequest(async () => {
        // if we dont wait for the outter enqueueRequest to be complete, the count might not be updated when by the time this nextTick occurs.
        await req2;
        expect(controller.length()).toBe(1);
        return Promise.resolve();
      });

      expect(controller.length()).toBe(3);
      await req3;
      expect(controller.length()).toBe(0);
    });
  });
});
