import type { AddApprovalRequest } from '@metamask/approval-controller';
import { ControllerMessenger } from '@metamask/base-controller';
import {
  defaultState as defaultNetworkState,
  type NetworkControllerGetNetworkConfigurationByNetworkClientId,
  type NetworkControllerGetStateAction,
  type NetworkControllerSetActiveNetworkAction,
} from '@metamask/network-controller';
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
    it('counts a request as queued during processing', async () => {
      const options: QueuedRequestControllerOptions = {
        messenger: buildQueuedRequestControllerMessenger(),
      };
      const controller = new QueuedRequestController(options);

      await controller.enqueueRequest(buildRequest(), async () => {
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
        buildRequest(),
        () => firstRequestProcessing,
      );
      const secondRequest = controller.enqueueRequest(
        buildRequest(),
        async () => {
          expect(controller.state.queuedRequestCount).toBe(1);
        },
      );

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

      await controller.enqueueRequest(buildRequest(), requestNext);

      // Expect that the request was called
      expect(requestNext).toHaveBeenCalledTimes(1);
    });

    it('switches network if a request comes in for a different selected chain', async () => {
      const mockSetActiveNetwork = jest.fn();
      const { messenger } = buildControllerMessenger({
        networkControllerGetState: jest.fn().mockReturnValue({
          ...cloneDeep(defaultNetworkState),
          selectedNetworkClientId: 'selectedNetworkClientId',
        }),
        networkControllerSetActiveNetwork: mockSetActiveNetwork,
      });
      const options: QueuedRequestControllerOptions = {
        messenger: buildQueuedRequestControllerMessenger(messenger),
      };
      const controller = new QueuedRequestController(options);

      await controller.enqueueRequest(
        {
          ...buildRequest(),
          networkClientId: 'differentNetworkClientId',
        },
        () => new Promise((resolve) => setTimeout(resolve, 10)),
      );

      expect(mockSetActiveNetwork).toHaveBeenCalledWith(
        'differentNetworkClientId',
      );
    });

    it('does not switch networks if a request comes in for the same chain', async () => {
      const mockSetActiveNetwork = jest.fn();
      const { messenger } = buildControllerMessenger({
        networkControllerGetState: jest.fn().mockReturnValue({
          ...cloneDeep(defaultNetworkState),
          selectedNetworkClientId: 'selectedNetworkClientId',
        }),
        networkControllerSetActiveNetwork: mockSetActiveNetwork,
      });
      const options: QueuedRequestControllerOptions = {
        messenger: buildQueuedRequestControllerMessenger(messenger),
      };
      const controller = new QueuedRequestController(options);

      await controller.enqueueRequest(
        {
          ...buildRequest(),
          networkClientId: 'selectedNetworkClientId',
        },
        () => new Promise((resolve) => setTimeout(resolve, 10)),
      );

      expect(mockSetActiveNetwork).not.toHaveBeenCalled();
    });

    it('does not switch networks if the switch chain confirmation is rejected', async () => {
      const mockSetActiveNetwork = jest.fn();
      const { messenger } = buildControllerMessenger({
        approvalControllerAddRequest: jest
          .fn()
          .mockRejectedValue(new Error('Rejected')),
        networkControllerGetState: jest.fn().mockReturnValue({
          ...cloneDeep(defaultNetworkState),
          selectedNetworkClientId: 'selectedNetworkClientId',
        }),
        networkControllerSetActiveNetwork: mockSetActiveNetwork,
      });
      const options: QueuedRequestControllerOptions = {
        messenger: buildQueuedRequestControllerMessenger(messenger),
      };
      const controller = new QueuedRequestController(options);

      await expect(() =>
        controller.enqueueRequest(
          {
            ...buildRequest(),
            networkClientId: 'differentNetworkClientId',
          },
          () => new Promise((resolve) => setTimeout(resolve, 10)),
        ),
      ).rejects.toThrow('Rejected');

      expect(mockSetActiveNetwork).not.toHaveBeenCalled();
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
      controller.enqueueRequest(buildRequest(), async () => {
        executionOrder.push('Request 1 Start');
        await new Promise((resolve) => setTimeout(resolve, 10));
        executionOrder.push('Request 1 End');
      });

      await controller.enqueueRequest(buildRequest(), async () => {
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
          controller.enqueueRequest(buildRequest(), requestWithError),
        ).rejects.toThrow(new Error('Request failed'));
        expect(controller.length()).toBe(0);
      });

      it('rejects requests that require a switch if they are missing network configuration', async () => {
        const mockSetActiveNetwork = jest.fn();
        const { messenger } = buildControllerMessenger({
          networkControllerGetState: jest.fn().mockReturnValue({
            ...cloneDeep(defaultNetworkState),
            selectedNetworkClientId: 'selectedNetworkClientId',
          }),
          networkControllerGetNetworkConfigurationByNetworkClientId: (
            networkClientId,
          ) =>
            networkClientId === 'selectedNetworkClientId'
              ? { chainId: '0x999', rpcUrl: 'metamask.io', ticker: 'TEST' }
              : undefined,
          networkControllerSetActiveNetwork: mockSetActiveNetwork,
        });
        const options: QueuedRequestControllerOptions = {
          messenger: buildQueuedRequestControllerMessenger(messenger),
        };
        const controller = new QueuedRequestController(options);

        await expect(() =>
          controller.enqueueRequest(
            {
              ...buildRequest(),
              networkClientId: 'differentNetworkClientId',
            },
            () => new Promise((resolve) => setTimeout(resolve, 10)),
          ),
        ).rejects.toThrow(
          'Missing network configuration for differentNetworkClientId',
        );
      });

      it('rejects all requests that require a switch if the selected network network configuration is missing', async () => {
        const mockSetActiveNetwork = jest.fn();
        const { messenger } = buildControllerMessenger({
          networkControllerGetState: jest.fn().mockReturnValue({
            ...cloneDeep(defaultNetworkState),
            selectedNetworkClientId: 'selectedNetworkClientId',
          }),
          networkControllerGetNetworkConfigurationByNetworkClientId: (
            networkClientId,
          ) =>
            networkClientId === 'differentNetworkClientId'
              ? { chainId: '0x999', rpcUrl: 'metamask.io', ticker: 'TEST' }
              : undefined,
          networkControllerSetActiveNetwork: mockSetActiveNetwork,
        });
        const options: QueuedRequestControllerOptions = {
          messenger: buildQueuedRequestControllerMessenger(messenger),
        };
        const controller = new QueuedRequestController(options);

        await expect(() =>
          controller.enqueueRequest(
            {
              ...buildRequest(),
              networkClientId: 'differentNetworkClientId',
            },
            () => new Promise((resolve) => setTimeout(resolve, 10)),
          ),
        ).rejects.toThrow(
          'Missing network configuration for selectedNetworkClientId',
        );
      });

      it('correctly updates the request queue count upon failure', async () => {
        const options: QueuedRequestControllerOptions = {
          messenger: buildQueuedRequestControllerMessenger(),
        };
        const controller = new QueuedRequestController(options);

        await expect(() =>
          controller.enqueueRequest(buildRequest(), async () => {
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
          throw new Error('Request 1 failed');
        });

        const request2 = jest.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
        });

        const request3 = jest.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
        });

        // Enqueue the requests
        const promise1 = controller.enqueueRequest(buildRequest(), request1);
        const promise2 = controller.enqueueRequest(buildRequest(), request2);
        const promise3 = controller.enqueueRequest(buildRequest(), request3);

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
        buildRequest(),
        async () => new Promise((resolve) => setTimeout(resolve, 10)),
      );
      expect(eventListener).toHaveBeenNthCalledWith(1, 1);

      // Enqueue another request, which should increase the count
      controller.enqueueRequest(
        buildRequest(),
        async () => new Promise((resolve) => setTimeout(resolve, 100)),
      );
      expect(eventListener).toHaveBeenNthCalledWith(2, 2);

      // Resolve the first request, which should decrease the count
      await new Promise((resolve) => setTimeout(resolve, 15));
      expect(eventListener).toHaveBeenNthCalledWith(3, 1);

      // Resolve the second request, which should decrease the count
      await new Promise((resolve) => setTimeout(resolve, 150));
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

      const promise = controller.enqueueRequest(buildRequest(), async () => {
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

      const firstRequest = controller.enqueueRequest(
        { ...buildRequest(), id: '1' },
        async () => {
          expect(controller.length()).toBe(3);
          await new Promise((resolve) => setTimeout(resolve, 10));
        },
      );
      expect(controller.length()).toBe(1);

      const secondRequest = controller.enqueueRequest(
        { ...buildRequest(), id: '2' },
        async () => {
          expect(controller.length()).toBe(2);
          await new Promise((resolve) => setTimeout(resolve, 20));
        },
      );
      expect(controller.length()).toBe(2);

      const thirdRequest = controller.enqueueRequest(
        { ...buildRequest(), id: '3' },
        async () => {
          // TODO: This should be 1, but it's 2 because requests 2 and 3 get run in parallel
          // Bug tracked here: https://github.com/MetaMask/core/issues/3967
          expect(controller.length()).toBe(2);
          await new Promise((resolve) => setTimeout(resolve, 30));
        },
      );

      expect(controller.length()).toBe(3);
      await thirdRequest;
      expect(controller.length()).toBe(0);

      await firstRequest;
      await secondRequest;
    });
  });
});

/**
 * Build a controller messenger setup with QueuedRequestController types.
 *
 * @param options - Options
 * @param options.networkControllerGetNetworkConfigurationByNetworkClientId - A handler for the
 * `NetworkController:getNetworkConfigurationByNetworkClientId` action.
 * @param options.networkControllerGetState - A handler for the `NetworkController:getState`
 * action.
 * @param options.networkControllerSetActiveNetwork - A handler for the
 * `NetworkController:setActiveNetwork` action.
 * @param options.approvalControllerAddRequest - A handler for the `ApprovalController:addRequest`
 * action.
 * @returns A controller messenger with QueuedRequestController types, and
 * mocks for all allowed actions.
 */
function buildControllerMessenger({
  networkControllerGetNetworkConfigurationByNetworkClientId,
  networkControllerGetState,
  networkControllerSetActiveNetwork,
  approvalControllerAddRequest,
}: {
  networkControllerGetNetworkConfigurationByNetworkClientId?: NetworkControllerGetNetworkConfigurationByNetworkClientId['handler'];
  networkControllerGetState?: NetworkControllerGetStateAction['handler'];
  networkControllerSetActiveNetwork?: NetworkControllerSetActiveNetworkAction['handler'];
  approvalControllerAddRequest?: AddApprovalRequest['handler'];
} = {}): {
  messenger: ControllerMessenger<
    QueuedRequestControllerActions | AllowedActions,
    QueuedRequestControllerEvents
  >;
  mockNetworkControllerGetNetworkConfigurationByNetworkClientId: jest.Mocked<
    NetworkControllerGetNetworkConfigurationByNetworkClientId['handler']
  >;
  mockNetworkControllerGetState: jest.Mocked<
    NetworkControllerGetStateAction['handler']
  >;
  mockNetworkControllerSetActiveNetwork: jest.Mocked<
    NetworkControllerSetActiveNetworkAction['handler']
  >;
  mockApprovalControllerAddRequest: jest.Mocked<AddApprovalRequest['handler']>;
} {
  const messenger = new ControllerMessenger<
    QueuedRequestControllerActions | AllowedActions,
    QueuedRequestControllerEvents
  >();

  const mockNetworkControllerGetNetworkConfigurationByNetworkClientId =
    networkControllerGetNetworkConfigurationByNetworkClientId ??
    jest.fn().mockReturnValue({});
  messenger.registerActionHandler(
    'NetworkController:getNetworkConfigurationByNetworkClientId',
    mockNetworkControllerGetNetworkConfigurationByNetworkClientId,
  );
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
  const mockApprovalControllerAddRequest =
    approvalControllerAddRequest ?? jest.fn();
  messenger.registerActionHandler(
    'ApprovalController:addRequest',
    mockApprovalControllerAddRequest,
  );
  return {
    messenger,
    mockNetworkControllerGetNetworkConfigurationByNetworkClientId,
    mockNetworkControllerGetState,
    mockNetworkControllerSetActiveNetwork,
    mockApprovalControllerAddRequest,
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
      'NetworkController:getNetworkConfigurationByNetworkClientId',
      'ApprovalController:addRequest',
    ],
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
    origin: 'example.com',
    networkClientId: 'mainnet',
  };
}
