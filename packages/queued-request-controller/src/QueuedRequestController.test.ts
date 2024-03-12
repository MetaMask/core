import { ControllerMessenger } from '@metamask/base-controller';
import {
  defaultState as defaultNetworkState,
  type NetworkControllerGetStateAction,
  type NetworkControllerSetActiveNetworkAction,
} from '@metamask/network-controller';
import type { SelectedNetworkControllerGetNetworkClientIdForDomainAction } from '@metamask/selected-network-controller';
import { createDeferredPromise } from '@metamask/utils';
import { cloneDeep } from 'lodash';

import type {
  AllowedActions,
  QueuedRequestControllerActions,
  QueuedRequestControllerEvents,
  QueuedRequestControllerMessenger,
  QueuedRequestControllerOptions,
} from './QueuedRequestController';
import {
  QueuedRequestController,
  controllerName,
} from './QueuedRequestController';
import type { QueuedRequestMiddlewareJsonRpcRequest } from './types';

describe('QueuedRequestController', () => {
  it('can be instantiated with default values', () => {
    const options: QueuedRequestControllerOptions = {
      messenger: buildQueuedRequestControllerMessenger(),
    };

    const controller = new QueuedRequestController(options);
    expect(controller.state).toStrictEqual({ queuedRequestCount: 0 });
  });

  describe('enqueueRequest', () => {
    it('skips the queue if the queue is empty and no request is being processed', async () => {
      const options: QueuedRequestControllerOptions = {
        messenger: buildQueuedRequestControllerMessenger(),
      };
      const controller = new QueuedRequestController(options);

      await controller.enqueueRequest(buildRequest(), async () => {
        expect(controller.state.queuedRequestCount).toBe(0);
      });
      expect(controller.state.queuedRequestCount).toBe(0);
    });

    it('skips the queue if the queue is empty and the request being processed has the same origin', async () => {
      const options: QueuedRequestControllerOptions = {
        messenger: buildQueuedRequestControllerMessenger(),
      };
      const controller = new QueuedRequestController(options);
      // Trigger first request
      const firstRequest = controller.enqueueRequest(
        buildRequest(),
        () => new Promise((resolve) => setTimeout(resolve, 10)),
      );
      // ensure first request skips queue
      expect(controller.state.queuedRequestCount).toBe(0);

      await controller.enqueueRequest(buildRequest(), async () => {
        expect(controller.state.queuedRequestCount).toBe(0);
      });
      expect(controller.state.queuedRequestCount).toBe(0);

      await firstRequest;
    });

    it('switches network if a request comes in for a different network client', async () => {
      const mockSetActiveNetwork = jest.fn();
      const { messenger } = buildControllerMessenger({
        networkControllerGetState: jest.fn().mockReturnValue({
          ...cloneDeep(defaultNetworkState),
          selectedNetworkClientId: 'selectedNetworkClientId',
        }),
        networkControllerSetActiveNetwork: mockSetActiveNetwork,
        selectedNetworkControllerGetNetworkClientIdForDomain: jest
          .fn()
          .mockImplementation((_origin) => 'differentNetworkClientId'),
      });
      const onNetworkSwitched = jest.fn();
      messenger.subscribe(
        'QueuedRequestController:networkSwitched',
        onNetworkSwitched,
      );
      const options: QueuedRequestControllerOptions = {
        messenger: buildQueuedRequestControllerMessenger(messenger),
      };
      const controller = new QueuedRequestController(options);

      await controller.enqueueRequest(
        buildRequest(),
        () => new Promise((resolve) => setTimeout(resolve, 10)),
      );

      expect(mockSetActiveNetwork).toHaveBeenCalledWith(
        'differentNetworkClientId',
      );
      expect(onNetworkSwitched).toHaveBeenCalledWith(
        'differentNetworkClientId',
      );
    });

    it('does not switch networks if the method is `eth_requestAccounts`', async () => {
      const mockSetActiveNetwork = jest.fn();
      const { messenger } = buildControllerMessenger({
        networkControllerGetState: jest.fn().mockReturnValue({
          ...cloneDeep(defaultNetworkState),
          selectedNetworkClientId: 'selectedNetworkClientId',
        }),
        networkControllerSetActiveNetwork: mockSetActiveNetwork,
        selectedNetworkControllerGetNetworkClientIdForDomain: jest
          .fn()
          .mockImplementation((_origin) => 'differentNetworkClientId'),
      });
      const onNetworkSwitched = jest.fn();
      messenger.subscribe(
        'QueuedRequestController:networkSwitched',
        onNetworkSwitched,
      );
      const options: QueuedRequestControllerOptions = {
        messenger: buildQueuedRequestControllerMessenger(messenger),
      };
      const controller = new QueuedRequestController(options);

      await controller.enqueueRequest(
        { ...buildRequest(), method: 'eth_requestAccounts' },
        () => new Promise((resolve) => setTimeout(resolve, 10)),
      );

      expect(mockSetActiveNetwork).not.toHaveBeenCalled();
      expect(onNetworkSwitched).not.toHaveBeenCalled();
    });

    it('does not switch networks if a request comes in for the same network client', async () => {
      const mockSetActiveNetwork = jest.fn();
      const { messenger } = buildControllerMessenger({
        networkControllerGetState: jest.fn().mockReturnValue({
          ...cloneDeep(defaultNetworkState),
          selectedNetworkClientId: 'selectedNetworkClientId',
        }),
        networkControllerSetActiveNetwork: mockSetActiveNetwork,
        selectedNetworkControllerGetNetworkClientIdForDomain: jest
          .fn()
          .mockImplementation((_origin) => 'selectedNetworkClientId'),
      });
      const onNetworkSwitched = jest.fn();
      messenger.subscribe(
        'QueuedRequestController:networkSwitched',
        onNetworkSwitched,
      );
      const options: QueuedRequestControllerOptions = {
        messenger: buildQueuedRequestControllerMessenger(messenger),
      };
      const controller = new QueuedRequestController(options);

      await controller.enqueueRequest(
        buildRequest(),
        () => new Promise((resolve) => setTimeout(resolve, 10)),
      );

      expect(mockSetActiveNetwork).not.toHaveBeenCalled();
      expect(onNetworkSwitched).not.toHaveBeenCalled();
    });

    it('queues request if a request from another origin is being processed', async () => {
      const options: QueuedRequestControllerOptions = {
        messenger: buildQueuedRequestControllerMessenger(),
      };
      const controller = new QueuedRequestController(options);
      // Trigger first request
      const firstRequest = controller.enqueueRequest(
        { ...buildRequest(), origin: 'https://exampleorigin1.metamask.io' },
        () => new Promise((resolve) => setTimeout(resolve, 10)),
      );
      // ensure first request skips queue
      expect(controller.state.queuedRequestCount).toBe(0);

      const secondRequestNext = jest.fn();
      const secondRequest = controller.enqueueRequest(
        { ...buildRequest(), origin: 'https://exampleorigin2.metamask.io' },
        secondRequestNext,
      );

      expect(controller.state.queuedRequestCount).toBe(1);
      expect(secondRequestNext).not.toHaveBeenCalled();

      await firstRequest;
      await secondRequest;
    });

    it('drains batch from queue when current batch finishes', async () => {
      const options: QueuedRequestControllerOptions = {
        messenger: buildQueuedRequestControllerMessenger(),
      };
      const controller = new QueuedRequestController(options);
      // Trigger first batch
      const firstRequest = controller.enqueueRequest(
        { ...buildRequest(), origin: 'https://firstbatch.metamask.io' },
        () => new Promise((resolve) => setTimeout(resolve, 10)),
      );
      const secondRequest = controller.enqueueRequest(
        { ...buildRequest(), origin: 'https://firstbatch.metamask.io' },
        () => new Promise((resolve) => setTimeout(resolve, 20)),
      );
      // ensure first batch requests skip queue
      expect(controller.state.queuedRequestCount).toBe(0);
      const thirdRequestNext = jest.fn();
      const thirdRequest = controller.enqueueRequest(
        { ...buildRequest(), origin: 'https://secondbatch.metamask.io' },
        thirdRequestNext,
      );
      const fourthRequestNext = jest.fn();
      const fourthRequest = controller.enqueueRequest(
        { ...buildRequest(), origin: 'https://secondbatch.metamask.io' },
        fourthRequestNext,
      );
      // ensure test starts with a two-request batch queued up
      expect(controller.state.queuedRequestCount).toBe(2);
      expect(thirdRequestNext).not.toHaveBeenCalled();
      expect(fourthRequestNext).not.toHaveBeenCalled();

      await firstRequest;

      // ensure second batch is still queued when first batch hasn't finished yet
      expect(controller.state.queuedRequestCount).toBe(2);
      expect(thirdRequestNext).not.toHaveBeenCalled();
      expect(fourthRequestNext).not.toHaveBeenCalled();

      await secondRequest;
      await thirdRequest;
      await fourthRequest;

      expect(controller.state.queuedRequestCount).toBe(0);
      expect(thirdRequestNext).toHaveBeenCalled();
      expect(fourthRequestNext).toHaveBeenCalled();
    });

    it('drains batch from queue when current batch finishes with requests out-of-order', async () => {
      const options: QueuedRequestControllerOptions = {
        messenger: buildQueuedRequestControllerMessenger(),
      };
      const controller = new QueuedRequestController(options);
      // Trigger first batch
      const firstRequest = controller.enqueueRequest(
        { ...buildRequest(), origin: 'https://firstbatch.metamask.io' },
        () => new Promise((resolve) => setTimeout(resolve, 20)),
      );
      const secondRequest = controller.enqueueRequest(
        { ...buildRequest(), origin: 'https://firstbatch.metamask.io' },
        () => new Promise((resolve) => setTimeout(resolve, 10)),
      );
      // ensure first batch requests skip queue
      expect(controller.state.queuedRequestCount).toBe(0);
      const thirdRequestNext = jest.fn();
      const thirdRequest = controller.enqueueRequest(
        { ...buildRequest(), origin: 'https://secondbatch.metamask.io' },
        thirdRequestNext,
      );
      const fourthRequestNext = jest.fn();
      const fourthRequest = controller.enqueueRequest(
        { ...buildRequest(), origin: 'https://secondbatch.metamask.io' },
        fourthRequestNext,
      );
      // ensure test starts with a two-request batch queued up
      expect(controller.state.queuedRequestCount).toBe(2);
      expect(thirdRequestNext).not.toHaveBeenCalled();
      expect(fourthRequestNext).not.toHaveBeenCalled();

      await secondRequest;

      // ensure second batch is still queued when first batch hasn't finished yet
      expect(controller.state.queuedRequestCount).toBe(2);
      expect(thirdRequestNext).not.toHaveBeenCalled();
      expect(fourthRequestNext).not.toHaveBeenCalled();

      await firstRequest;
      await thirdRequest;
      await fourthRequest;

      expect(controller.state.queuedRequestCount).toBe(0);
      expect(thirdRequestNext).toHaveBeenCalled();
      expect(fourthRequestNext).toHaveBeenCalled();
    });

    it('processes requests from each batch in parallel', async () => {
      const options: QueuedRequestControllerOptions = {
        messenger: buildQueuedRequestControllerMessenger(),
      };
      const controller = new QueuedRequestController(options);
      const firstRequest = controller.enqueueRequest(
        { ...buildRequest(), origin: 'https://firstorigin.metamask.io' },
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
        },
      );
      // ensure first batch requests skip queue
      expect(controller.state.queuedRequestCount).toBe(0);
      const {
        promise: secondRequestProcessing,
        resolve: resolveSecondRequest,
      } = createDeferredPromise();
      const secondRequestNext = jest
        .fn()
        .mockImplementation(async () => secondRequestProcessing);
      const secondRequest = controller.enqueueRequest(
        { ...buildRequest(), origin: 'https://secondorigin.metamask.io' },
        secondRequestNext,
      );
      const { promise: thirdRequestProcessing, resolve: resolveThirdRequest } =
        createDeferredPromise();
      const thirdRequestNext = jest
        .fn()
        .mockImplementation(async () => thirdRequestProcessing);
      const thirdRequest = controller.enqueueRequest(
        { ...buildRequest(), origin: 'https://secondorigin.metamask.io' },
        thirdRequestNext,
      );
      const {
        promise: fourthRequestProcessing,
        resolve: resolveFourthRequest,
      } = createDeferredPromise();
      const fourthRequestNext = jest
        .fn()
        .mockImplementation(async () => fourthRequestProcessing);
      const fourthRequest = controller.enqueueRequest(
        { ...buildRequest(), origin: 'https://secondorigin.metamask.io' },
        fourthRequestNext,
      );
      expect(controller.state.queuedRequestCount).toBe(3);
      await firstRequest;

      // resolve and await requests in the wrong order
      // If requests were executed one-at-a-time, this would deadlock
      resolveFourthRequest();
      await fourthRequest;
      resolveThirdRequest();
      await thirdRequest;
      resolveSecondRequest();
      await secondRequest;

      expect(controller.state.queuedRequestCount).toBe(0);
    });

    it('preserves request order within each batch', async () => {
      const options: QueuedRequestControllerOptions = {
        messenger: buildQueuedRequestControllerMessenger(),
      };
      const controller = new QueuedRequestController(options);
      const executionOrder: string[] = [];
      const firstRequest = controller.enqueueRequest(
        { ...buildRequest(), origin: 'https://firstorigin.metamask.io' },
        async () => {
          executionOrder.push('Request 1 Start');
          await new Promise((resolve) => setTimeout(resolve, 10));
        },
      );
      // ensure first batch requests skip queue
      expect(controller.state.queuedRequestCount).toBe(0);
      const secondRequestNext = jest.fn().mockImplementation(async () => {
        executionOrder.push('Request 2 Start');
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      const secondRequest = controller.enqueueRequest(
        { ...buildRequest(), origin: 'https://secondorigin.metamask.io' },
        secondRequestNext,
      );
      const thirdRequestNext = jest.fn().mockImplementation(async () => {
        executionOrder.push('Request 3 Start');
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      const thirdRequest = controller.enqueueRequest(
        { ...buildRequest(), origin: 'https://secondorigin.metamask.io' },
        thirdRequestNext,
      );
      const fourthRequestNext = jest.fn().mockImplementation(async () => {
        executionOrder.push('Request 4 Start');
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      const fourthRequest = controller.enqueueRequest(
        { ...buildRequest(), origin: 'https://secondorigin.metamask.io' },
        fourthRequestNext,
      );
      expect(controller.state.queuedRequestCount).toBe(3);

      await Promise.all([
        firstRequest,
        secondRequest,
        thirdRequest,
        fourthRequest,
      ]);

      expect(executionOrder).toStrictEqual([
        'Request 1 Start',
        'Request 2 Start',
        'Request 3 Start',
        'Request 4 Start',
      ]);
    });

    it('preserves request order even when interlaced with requests from other origins', async () => {
      const options: QueuedRequestControllerOptions = {
        messenger: buildQueuedRequestControllerMessenger(),
      };
      const controller = new QueuedRequestController(options);
      const executionOrder: string[] = [];
      const firstRequest = controller.enqueueRequest(
        { ...buildRequest(), origin: 'https://firstorigin.metamask.io' },
        async () => {
          executionOrder.push('Request 1 Start');
          await new Promise((resolve) => setTimeout(resolve, 10));
        },
      );
      // ensure first batch requests skip queue
      expect(controller.state.queuedRequestCount).toBe(0);
      const secondRequestNext = jest.fn().mockImplementation(async () => {
        executionOrder.push('Request 2 Start');
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      const secondRequest = controller.enqueueRequest(
        { ...buildRequest(), origin: 'https://secondorigin.metamask.io' },
        secondRequestNext,
      );
      const thirdRequestNext = jest.fn().mockImplementation(async () => {
        executionOrder.push('Request 3 Start');
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      const thirdRequest = controller.enqueueRequest(
        { ...buildRequest(), origin: 'https://firstorigin.metamask.io' },
        thirdRequestNext,
      );
      // ensure test starts with two batches queued up
      expect(controller.state.queuedRequestCount).toBe(2);

      await Promise.all([firstRequest, secondRequest, thirdRequest]);

      expect(executionOrder).toStrictEqual([
        'Request 1 Start',
        'Request 2 Start',
        'Request 3 Start',
      ]);
    });

    it('switches network if a new batch has a different network client', async () => {
      const mockSetActiveNetwork = jest.fn();
      const { messenger } = buildControllerMessenger({
        networkControllerGetState: jest.fn().mockReturnValue({
          ...cloneDeep(defaultNetworkState),
          selectedNetworkClientId: 'selectedNetworkClientId',
        }),
        networkControllerSetActiveNetwork: mockSetActiveNetwork,
        selectedNetworkControllerGetNetworkClientIdForDomain: jest
          .fn()
          .mockImplementation((origin) =>
            origin === 'https://secondorigin.metamask.io'
              ? 'differentNetworkClientId'
              : 'selectedNetworkClientId',
          ),
      });
      const onNetworkSwitched = jest.fn();
      messenger.subscribe(
        'QueuedRequestController:networkSwitched',
        onNetworkSwitched,
      );
      const options: QueuedRequestControllerOptions = {
        messenger: buildQueuedRequestControllerMessenger(messenger),
      };
      const controller = new QueuedRequestController(options);
      const firstRequest = controller.enqueueRequest(
        { ...buildRequest(), origin: 'https://firstorigin.metamask.io' },
        () => new Promise((resolve) => setTimeout(resolve, 10)),
      );
      // ensure first request skips queue
      expect(controller.state.queuedRequestCount).toBe(0);
      const secondRequestNext = jest
        .fn()
        .mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 100)),
        );
      const secondRequest = controller.enqueueRequest(
        { ...buildRequest(), origin: 'https://secondorigin.metamask.io' },
        secondRequestNext,
      );
      // ensure test starts with one request queued up
      expect(controller.state.queuedRequestCount).toBe(1);
      expect(secondRequestNext).not.toHaveBeenCalled();
      expect(mockSetActiveNetwork).not.toHaveBeenCalled();

      await firstRequest;
      await secondRequest;

      expect(mockSetActiveNetwork).toHaveBeenCalledWith(
        'differentNetworkClientId',
      );
      expect(onNetworkSwitched).toHaveBeenCalledWith(
        'differentNetworkClientId',
      );
    });

    it('does not switch networks if a new batch has the same network client', async () => {
      const mockSetActiveNetwork = jest.fn();
      const { messenger } = buildControllerMessenger({
        networkControllerGetState: jest.fn().mockReturnValue({
          ...cloneDeep(defaultNetworkState),
          selectedNetworkClientId: 'selectedNetworkClientId',
        }),
        networkControllerSetActiveNetwork: mockSetActiveNetwork,
        selectedNetworkControllerGetNetworkClientIdForDomain: jest
          .fn()
          .mockImplementation(() => 'selectedNetworkClientId'),
      });
      const onNetworkSwitched = jest.fn();
      messenger.subscribe(
        'QueuedRequestController:networkSwitched',
        onNetworkSwitched,
      );
      const options: QueuedRequestControllerOptions = {
        messenger: buildQueuedRequestControllerMessenger(messenger),
      };
      const controller = new QueuedRequestController(options);
      const firstRequest = controller.enqueueRequest(
        { ...buildRequest(), origin: 'firstorigin.metamask.io' },
        () => new Promise((resolve) => setTimeout(resolve, 10)),
      );
      // ensure first request skips queue
      expect(controller.state.queuedRequestCount).toBe(0);
      const secondRequestNext = jest
        .fn()
        .mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 100)),
        );
      const secondRequest = controller.enqueueRequest(
        { ...buildRequest(), origin: 'https://secondorigin.metamask.io' },
        secondRequestNext,
      );
      // ensure test starts with one request queued up
      expect(controller.state.queuedRequestCount).toBe(1);
      expect(secondRequestNext).not.toHaveBeenCalled();

      await firstRequest;
      await secondRequest;

      expect(mockSetActiveNetwork).not.toHaveBeenCalled();
      expect(onNetworkSwitched).not.toHaveBeenCalled();
    });

    describe('when the network switch for a single request fails', () => {
      it('throws error', async () => {
        const switchError = new Error('switch error');
        const { messenger } = buildControllerMessenger({
          networkControllerGetState: jest.fn().mockReturnValue({
            ...cloneDeep(defaultNetworkState),
            selectedNetworkClientId: 'selectedNetworkClientId',
          }),
          networkControllerSetActiveNetwork: jest
            .fn()
            .mockRejectedValue(switchError),
          selectedNetworkControllerGetNetworkClientIdForDomain: jest
            .fn()
            .mockImplementation((_origin) => 'differentNetworkClientId'),
        });
        const options: QueuedRequestControllerOptions = {
          messenger: buildQueuedRequestControllerMessenger(messenger),
        };
        const controller = new QueuedRequestController(options);

        await expect(() =>
          controller.enqueueRequest(
            { ...buildRequest(), origin: 'https://example.metamask.io' },
            jest.fn(),
          ),
        ).rejects.toThrow(switchError);
      });

      it('correctly processes the next item in the queue', async () => {
        const switchError = new Error('switch error');
        const { messenger } = buildControllerMessenger({
          networkControllerGetState: jest.fn().mockReturnValue({
            ...cloneDeep(defaultNetworkState),
            selectedNetworkClientId: 'selectedNetworkClientId',
          }),
          networkControllerSetActiveNetwork: jest
            .fn()
            .mockRejectedValue(switchError),
          selectedNetworkControllerGetNetworkClientIdForDomain: jest
            .fn()
            .mockImplementation((origin) =>
              origin === 'https://firstorigin.metamask.io'
                ? 'differentNetworkClientId'
                : 'selectedNetworkClientId',
            ),
        });
        const options: QueuedRequestControllerOptions = {
          messenger: buildQueuedRequestControllerMessenger(messenger),
        };
        const controller = new QueuedRequestController(options);
        const firstRequest = controller.enqueueRequest(
          { ...buildRequest(), origin: 'https://firstorigin.metamask.io' },
          () => new Promise((resolve) => setTimeout(resolve, 10)),
        );
        // ensure first request skips queue
        expect(controller.state.queuedRequestCount).toBe(0);
        const secondRequestNext = jest
          .fn()
          .mockImplementation(
            () => new Promise((resolve) => setTimeout(resolve, 100)),
          );
        const secondRequest = controller.enqueueRequest(
          { ...buildRequest(), origin: 'https://secondorigin.metamask.io' },
          secondRequestNext,
        );

        await expect(firstRequest).rejects.toThrow(switchError);
        await secondRequest;

        expect(secondRequestNext).toHaveBeenCalled();
      });
    });

    describe('when the network switch for a batch fails', () => {
      it('throws error', async () => {
        const switchError = new Error('switch error');
        const { messenger } = buildControllerMessenger({
          networkControllerGetState: jest.fn().mockReturnValue({
            ...cloneDeep(defaultNetworkState),
            selectedNetworkClientId: 'selectedNetworkClientId',
          }),
          networkControllerSetActiveNetwork: jest
            .fn()
            .mockRejectedValue(switchError),
          selectedNetworkControllerGetNetworkClientIdForDomain: jest
            .fn()
            .mockImplementation((origin) =>
              origin === 'https://secondorigin.metamask.io'
                ? 'differentNetworkClientId'
                : 'selectedNetworkClientId',
            ),
        });
        const options: QueuedRequestControllerOptions = {
          messenger: buildQueuedRequestControllerMessenger(messenger),
        };
        const controller = new QueuedRequestController(options);
        const firstRequest = controller.enqueueRequest(
          { ...buildRequest(), origin: 'https://firstorigin.metamask.io' },
          () => new Promise((resolve) => setTimeout(resolve, 10)),
        );
        // ensure first request skips queue
        expect(controller.state.queuedRequestCount).toBe(0);
        const secondRequestNext = jest
          .fn()
          .mockImplementation(
            () => new Promise((resolve) => setTimeout(resolve, 100)),
          );
        const secondRequest = controller.enqueueRequest(
          { ...buildRequest(), origin: 'https://secondorigin.metamask.io' },
          secondRequestNext,
        );
        // ensure test starts with one request queued up
        expect(controller.state.queuedRequestCount).toBe(1);
        expect(secondRequestNext).not.toHaveBeenCalled();

        await firstRequest;
        await expect(secondRequest).rejects.toThrow(switchError);
      });

      it('correctly processes the next item in the queue', async () => {
        const switchError = new Error('switch error');
        const { messenger } = buildControllerMessenger({
          networkControllerGetState: jest.fn().mockReturnValue({
            ...cloneDeep(defaultNetworkState),
            selectedNetworkClientId: 'selectedNetworkClientId',
          }),
          networkControllerSetActiveNetwork: jest
            .fn()
            .mockRejectedValue(switchError),
          selectedNetworkControllerGetNetworkClientIdForDomain: jest
            .fn()
            .mockImplementation((origin) =>
              origin === 'https://secondorigin.metamask.io'
                ? 'differentNetworkClientId'
                : 'selectedNetworkClientId',
            ),
        });
        const options: QueuedRequestControllerOptions = {
          messenger: buildQueuedRequestControllerMessenger(messenger),
        };
        const controller = new QueuedRequestController(options);
        const firstRequest = controller.enqueueRequest(
          { ...buildRequest(), origin: 'https://firstorigin.metamask.io' },
          () => new Promise((resolve) => setTimeout(resolve, 10)),
        );
        // ensure first request skips queue
        expect(controller.state.queuedRequestCount).toBe(0);
        const secondRequestNext = jest
          .fn()
          .mockImplementation(
            () => new Promise((resolve) => setTimeout(resolve, 100)),
          );
        const secondRequest = controller.enqueueRequest(
          { ...buildRequest(), origin: 'https://secondorigin.metamask.io' },
          secondRequestNext,
        );
        const thirdRequestNext = jest
          .fn()
          .mockImplementation(
            () => new Promise((resolve) => setTimeout(resolve, 100)),
          );
        const thirdRequest = controller.enqueueRequest(
          { ...buildRequest(), origin: 'https://thirdorigin.metamask.io' },
          thirdRequestNext,
        );
        // ensure test starts with two requests queued up
        expect(controller.state.queuedRequestCount).toBe(2);
        expect(secondRequestNext).not.toHaveBeenCalled();

        await firstRequest;
        await expect(secondRequest).rejects.toThrow(switchError);
        await thirdRequest;

        expect(thirdRequestNext).toHaveBeenCalled();
      });
    });

    describe('when a request fails', () => {
      it('throws error', async () => {
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
          controller.enqueueRequest(
            { ...buildRequest(), origin: 'example.metamask.io' },
            requestWithError,
          ),
        ).rejects.toThrow(new Error('Request failed'));
        expect(controller.state.queuedRequestCount).toBe(0);
      });

      it('correctly updates the request queue count upon failure', async () => {
        const options: QueuedRequestControllerOptions = {
          messenger: buildQueuedRequestControllerMessenger(),
        };
        const controller = new QueuedRequestController(options);

        await expect(() =>
          controller.enqueueRequest(
            { ...buildRequest(), origin: 'https://example.metamask.io' },
            async () => {
              throw new Error('Request failed');
            },
          ),
        ).rejects.toThrow('Request failed');
        expect(controller.state.queuedRequestCount).toBe(0);
      });

      it('correctly processes the next item in the queue', async () => {
        const options: QueuedRequestControllerOptions = {
          messenger: buildQueuedRequestControllerMessenger(),
        };

        const controller = new QueuedRequestController(options);

        // Mock requests with one request throwing an error
        const request1 = jest.fn(async () => {
          throw new Error('Request 1 failed');
        });

        const request2 = jest.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
        });

        const request3 = jest.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
        });

        // Enqueue the requests
        const promise1 = controller.enqueueRequest(
          { ...buildRequest(), origin: 'https://example1.metamask.io' },
          request1,
        );
        const promise2 = controller.enqueueRequest(
          { ...buildRequest(), origin: 'https://example2.metamask.io' },
          request2,
        );
        const promise3 = controller.enqueueRequest(
          { ...buildRequest(), origin: 'https://example3.metamask.io' },
          request3,
        );

        expect(
          await Promise.allSettled([promise1, promise2, promise3]),
        ).toStrictEqual([
          { status: 'rejected', reason: new Error('Request 1 failed') },
          { status: 'fulfilled', value: undefined },
          { status: 'fulfilled', value: undefined },
        ]);
        expect(request1).toHaveBeenCalled();
        expect(request2).toHaveBeenCalled();
        expect(request3).toHaveBeenCalled();
      });
    });
  });
});

/**
 * Build a controller messenger setup with QueuedRequestController types.
 *
 * @param options - Options
 * @param options.networkControllerGetState - A handler for the `NetworkController:getState`
 * action.
 * @param options.networkControllerSetActiveNetwork - A handler for the
 * `NetworkController:setActiveNetwork` action.
 * @param options.selectedNetworkControllerGetNetworkClientIdForDomain - A handler for the
 * `SelectedNetworkController:getNetworkClientIdForDomain` action.
 * @returns A controller messenger with QueuedRequestController types, and
 * mocks for all allowed actions.
 */
function buildControllerMessenger({
  networkControllerGetState,
  networkControllerSetActiveNetwork,
  selectedNetworkControllerGetNetworkClientIdForDomain,
}: {
  networkControllerGetState?: NetworkControllerGetStateAction['handler'];
  networkControllerSetActiveNetwork?: NetworkControllerSetActiveNetworkAction['handler'];
  selectedNetworkControllerGetNetworkClientIdForDomain?: SelectedNetworkControllerGetNetworkClientIdForDomainAction['handler'];
} = {}): {
  messenger: ControllerMessenger<
    QueuedRequestControllerActions | AllowedActions,
    QueuedRequestControllerEvents
  >;
  mockNetworkControllerGetState: jest.Mocked<
    NetworkControllerGetStateAction['handler']
  >;
  mockNetworkControllerSetActiveNetwork: jest.Mocked<
    NetworkControllerSetActiveNetworkAction['handler']
  >;
  mockSelectedNetworkControllerGetNetworkClientIdForDomain: jest.Mocked<
    SelectedNetworkControllerGetNetworkClientIdForDomainAction['handler']
  >;
} {
  const messenger = new ControllerMessenger<
    QueuedRequestControllerActions | AllowedActions,
    QueuedRequestControllerEvents
  >();

  const mockNetworkControllerGetState =
    networkControllerGetState ??
    jest.fn().mockReturnValue({
      ...cloneDeep(defaultNetworkState),
      selectedNetworkClientId: 'defaultNetworkClientId',
    });
  messenger.registerActionHandler(
    'NetworkController:getState',
    mockNetworkControllerGetState,
  );
  const mockNetworkControllerSetActiveNetwork =
    networkControllerSetActiveNetwork ?? jest.fn();
  messenger.registerActionHandler(
    'NetworkController:setActiveNetwork',
    mockNetworkControllerSetActiveNetwork,
  );
  const mockSelectedNetworkControllerGetNetworkClientIdForDomain =
    selectedNetworkControllerGetNetworkClientIdForDomain ?? jest.fn();
  messenger.registerActionHandler(
    'SelectedNetworkController:getNetworkClientIdForDomain',
    mockSelectedNetworkControllerGetNetworkClientIdForDomain,
  );
  return {
    messenger,
    mockNetworkControllerGetState,
    mockNetworkControllerSetActiveNetwork,
    mockSelectedNetworkControllerGetNetworkClientIdForDomain,
  };
}

/**
 * Builds a restricted controller messenger for the queued request controller.
 *
 * @param messenger - A controller messenger.
 * @returns The restricted controller messenger.
 */
function buildQueuedRequestControllerMessenger(
  messenger = buildControllerMessenger().messenger,
): QueuedRequestControllerMessenger {
  return messenger.getRestricted({
    name: controllerName,
    allowedActions: [
      'NetworkController:getState',
      'NetworkController:setActiveNetwork',
      'SelectedNetworkController:getNetworkClientIdForDomain',
    ],
    allowedEvents: [],
  });
}

/**
 * Build a valid JSON-RPC request that includes all required properties
 *
 * @returns A valid JSON-RPC request with all required properties.
 */
function buildRequest(): QueuedRequestMiddlewareJsonRpcRequest {
  return {
    method: 'doesnt matter',
    id: 'doesnt matter',
    jsonrpc: '2.0' as const,
    origin: 'example.metamask.io',
    networkClientId: 'mainnet',
  };
}
