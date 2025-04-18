import { Messenger } from '@metamask/base-controller';
import {
  getDefaultNetworkControllerState,
  type NetworkControllerGetStateAction,
  type NetworkControllerSetActiveNetworkAction,
} from '@metamask/network-controller';
import { createDeferredPromise } from '@metamask/utils';

import type {
  AllowedActions,
  AllowedEvents,
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
      shouldRequestSwitchNetwork: () => false,
      canRequestSwitchNetworkWithoutApproval: () => false,
      clearPendingConfirmations: jest.fn(),
      showApprovalRequest: jest.fn(),
    };

    const controller = new QueuedRequestController(options);
    expect(controller.state).toStrictEqual({ queuedRequestCount: 0 });
  });

  it('updates queuedRequestCount when flushing requests for an origin', async () => {
    const { messenger } = buildMessenger();
    const controller = new QueuedRequestController({
      messenger: buildQueuedRequestControllerMessenger(messenger),
      shouldRequestSwitchNetwork: () => false,
      canRequestSwitchNetworkWithoutApproval: () => false,
      clearPendingConfirmations: jest.fn(),
      showApprovalRequest: jest.fn(),
    });

    const firstRequest = controller.enqueueRequest(
      { ...buildRequest(), origin: 'https://example.com' },
      () => Promise.resolve(),
    );
    const secondRequest = controller.enqueueRequest(
      { ...buildRequest(), origin: 'https://example2.com' },
      () => Promise.resolve(),
    );
    const thirdRequest = controller.enqueueRequest(
      { ...buildRequest(), origin: 'https://example2.com' },
      () => Promise.resolve(),
    );

    expect(controller.state.queuedRequestCount).toBe(2);

    // When the selected network changes for a domain, the queued requests for that domain/origin are flushed
    messenger.publish(
      'SelectedNetworkController:stateChange',
      { domains: {} },
      [
        {
          op: 'replace',
          path: ['domains', 'https://example2.com'],
        },
      ],
    );

    expect(controller.state.queuedRequestCount).toBe(0);

    await firstRequest;
    await expect(secondRequest).rejects.toThrow(
      new Error(
        'The request has been rejected due to a change in selected network. Please verify the selected network and retry the request.',
      ),
    );
    await expect(thirdRequest).rejects.toThrow(
      new Error(
        'The request has been rejected due to a change in selected network. Please verify the selected network and retry the request.',
      ),
    );
  });

  describe('enqueueRequest', () => {
    it('throws an error if networkClientId is not provided', async () => {
      const controller = buildQueuedRequestController();
      await expect(() =>
        controller.enqueueRequest(
          // @ts-expect-error: networkClientId is intentionally not provided
          {
            method: 'doesnt matter',
            id: 'doesnt matter',
            jsonrpc: '2.0' as const,
            origin: 'example.metamask.io',
          },
          () => new Promise((resolve) => setTimeout(resolve, 10)),
        ),
      ).rejects.toThrow(
        'Error while attempting to enqueue request: networkClientId is required.',
      );
    });

    it('skips the queue if the queue is empty and no request is being processed', async () => {
      const controller = buildQueuedRequestController();

      await controller.enqueueRequest(buildRequest(), async () => {
        expect(controller.state.queuedRequestCount).toBe(0);
      });
      expect(controller.state.queuedRequestCount).toBe(0);
    });

    it('skips the queue if the queue is empty and the request being processed has the same origin', async () => {
      const controller = buildQueuedRequestController();
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

    it('switches network if a request comes in for a different network client and shouldRequestSwitchNetwork returns true', async () => {
      const mockSetActiveNetwork = jest.fn();
      const { messenger } = buildMessenger({
        networkControllerGetState: jest.fn().mockReturnValue({
          ...getDefaultNetworkControllerState(),
          selectedNetworkClientId: 'selectedNetworkClientId',
        }),
        networkControllerSetActiveNetwork: mockSetActiveNetwork,
      });
      const onNetworkSwitched = jest.fn();
      messenger.subscribe(
        'QueuedRequestController:networkSwitched',
        onNetworkSwitched,
      );
      const controller = buildQueuedRequestController({
        messenger: buildQueuedRequestControllerMessenger(messenger),
        shouldRequestSwitchNetwork: ({ method }) =>
          method === 'method_requiring_network_switch',
        clearPendingConfirmations: jest.fn(),
      });

      await controller.enqueueRequest(
        {
          ...buildRequest(),
          networkClientId: 'differentNetworkClientId',
          method: 'method_requiring_network_switch',
        },
        () => new Promise((resolve) => setTimeout(resolve, 10)),
      );

      expect(mockSetActiveNetwork).toHaveBeenCalledWith(
        'differentNetworkClientId',
      );
      expect(onNetworkSwitched).toHaveBeenCalledWith(
        'differentNetworkClientId',
      );
    });

    it('does not switch networks if shouldRequestSwitchNetwork returns false', async () => {
      const mockSetActiveNetwork = jest.fn();
      const { messenger } = buildMessenger({
        networkControllerGetState: jest.fn().mockReturnValue({
          ...getDefaultNetworkControllerState(),
          selectedNetworkClientId: 'selectedNetworkClientId',
        }),
        networkControllerSetActiveNetwork: mockSetActiveNetwork,
      });
      const onNetworkSwitched = jest.fn();
      messenger.subscribe(
        'QueuedRequestController:networkSwitched',
        onNetworkSwitched,
      );
      const controller = buildQueuedRequestController({
        messenger: buildQueuedRequestControllerMessenger(messenger),
        shouldRequestSwitchNetwork: ({ method }) =>
          method === 'method_requiring_network_switch',
      });

      await controller.enqueueRequest(
        { ...buildRequest(), method: 'not_requiring_network_switch' },
        () => new Promise((resolve) => setTimeout(resolve, 10)),
      );

      expect(mockSetActiveNetwork).not.toHaveBeenCalled();
      expect(onNetworkSwitched).not.toHaveBeenCalled();
    });

    it('does not switch networks if a request comes in for the same network client', async () => {
      const mockSetActiveNetwork = jest.fn();
      const { messenger } = buildMessenger({
        networkControllerGetState: jest.fn().mockReturnValue({
          ...getDefaultNetworkControllerState(),
          selectedNetworkClientId: 'selectedNetworkClientId',
        }),
        networkControllerSetActiveNetwork: mockSetActiveNetwork,
      });
      const onNetworkSwitched = jest.fn();
      messenger.subscribe(
        'QueuedRequestController:networkSwitched',
        onNetworkSwitched,
      );
      const controller = buildQueuedRequestController({
        messenger: buildQueuedRequestControllerMessenger(messenger),
      });

      await controller.enqueueRequest(
        buildRequest(),
        () => new Promise((resolve) => setTimeout(resolve, 10)),
      );

      expect(mockSetActiveNetwork).not.toHaveBeenCalled();
      expect(onNetworkSwitched).not.toHaveBeenCalled();
    });

    it('queues request if a request from another origin is being processed', async () => {
      const controller = buildQueuedRequestController();
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

    it('focuses the existing approval request UI if a request from another origin is being processed', async () => {
      const mockShowApprovalRequest = jest.fn();
      const controller = buildQueuedRequestController({
        showApprovalRequest: mockShowApprovalRequest,
      });
      // Trigger first request
      const firstRequest = controller.enqueueRequest(
        { ...buildRequest(), origin: 'https://exampleorigin1.metamask.io' },
        () => new Promise((resolve) => setTimeout(resolve, 10)),
      );

      const secondRequestNext = jest.fn();
      const secondRequest = controller.enqueueRequest(
        { ...buildRequest(), origin: 'https://exampleorigin2.metamask.io' },
        secondRequestNext,
      );

      // should focus the existing approval immediately after being queued
      expect(mockShowApprovalRequest).toHaveBeenCalledTimes(1);

      await firstRequest;
      await secondRequest;

      expect(mockShowApprovalRequest).toHaveBeenCalledTimes(1);
    });

    it('queues request if a requests are already being processed on the same origin, but canRequestSwitchNetworkWithoutApproval returns true', async () => {
      const controller = buildQueuedRequestController({
        canRequestSwitchNetworkWithoutApproval: jest
          .fn()
          .mockImplementation(
            (request) =>
              request.method === 'method_can_switch_network_without_approval',
          ),
      });
      // Trigger first request
      const firstRequest = controller.enqueueRequest(
        { ...buildRequest(), origin: 'https://sameorigin.metamask.io' },
        () => new Promise((resolve) => setTimeout(resolve, 10)),
      );
      // ensure first request skips queue
      expect(controller.state.queuedRequestCount).toBe(0);

      const secondRequestNext = jest.fn();
      const secondRequest = controller.enqueueRequest(
        {
          ...buildRequest(),
          origin: 'https://sameorigin.metamask.io',
          method: 'method_can_switch_network_without_approval',
        },
        secondRequestNext,
      );

      expect(controller.state.queuedRequestCount).toBe(1);
      expect(secondRequestNext).not.toHaveBeenCalled();

      await firstRequest;
      await secondRequest;
    });

    it('drains batch from queue when current batch finishes', async () => {
      const controller = buildQueuedRequestController();
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
      const controller = buildQueuedRequestController();
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
      const controller = buildQueuedRequestController();
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

    it('processes queued requests on same origin but different network clientId', async () => {
      const controller = buildQueuedRequestController();
      const executionOrder: string[] = [];

      const firstRequest = controller.enqueueRequest(
        {
          ...buildRequest(),
          origin: 'https://example.metamask.io',
          networkClientId: 'network1',
        },
        async () => {
          executionOrder.push('Request 1 (network1)');
          await new Promise((resolve) => setTimeout(resolve, 10));
        },
      );

      // Ensure first request skips queue
      expect(controller.state.queuedRequestCount).toBe(0);

      const secondRequest = controller.enqueueRequest(
        {
          ...buildRequest(),
          origin: 'https://example.metamask.io',
          networkClientId: 'network2',
        },
        async () => {
          executionOrder.push('Request 2 (network2)');
          await new Promise((resolve) => setTimeout(resolve, 10));
        },
      );

      const thirdRequest = controller.enqueueRequest(
        {
          ...buildRequest(),
          origin: 'https://example.metamask.io',
          networkClientId: 'network1',
        },
        async () => {
          executionOrder.push('Request 3 (network1)');
          await new Promise((resolve) => setTimeout(resolve, 10));
        },
      );

      const fourthRequest = controller.enqueueRequest(
        {
          ...buildRequest(),
          origin: 'https://example.metamask.io',
          networkClientId: 'network2',
        },
        async () => {
          executionOrder.push('Request 4 (network2)');
          await new Promise((resolve) => setTimeout(resolve, 10));
        },
      );

      expect(controller.state.queuedRequestCount).toBe(3);

      await Promise.all([
        firstRequest,
        secondRequest,
        thirdRequest,
        fourthRequest,
      ]);

      expect(controller.state.queuedRequestCount).toBe(0);
      expect(executionOrder).toStrictEqual([
        'Request 1 (network1)',
        'Request 2 (network2)',
        'Request 3 (network1)',
        'Request 4 (network2)',
      ]);
    });

    it('preserves request order within each batch', async () => {
      const controller = buildQueuedRequestController();
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
      const controller = buildQueuedRequestController();
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
      const { messenger } = buildMessenger({
        networkControllerGetState: jest.fn().mockReturnValue({
          ...getDefaultNetworkControllerState(),
          selectedNetworkClientId: 'selectedNetworkClientId',
        }),
        networkControllerSetActiveNetwork: mockSetActiveNetwork,
      });
      const onNetworkSwitched = jest.fn();
      messenger.subscribe(
        'QueuedRequestController:networkSwitched',
        onNetworkSwitched,
      );
      const controller = buildQueuedRequestController({
        messenger: buildQueuedRequestControllerMessenger(messenger),
      });
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
        {
          ...buildRequest(),
          networkClientId: 'differentNetworkClientId',
          origin: 'https://secondorigin.metamask.io',
        },
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
      const networkClientId = 'selectedNetworkClientId';
      const mockSetActiveNetwork = jest.fn();
      const { messenger } = buildMessenger({
        networkControllerGetState: jest.fn().mockReturnValue({
          ...getDefaultNetworkControllerState(),
          selectedNetworkClientId: networkClientId,
        }),
        networkControllerSetActiveNetwork: mockSetActiveNetwork,
      });
      const onNetworkSwitched = jest.fn();
      messenger.subscribe(
        'QueuedRequestController:networkSwitched',
        onNetworkSwitched,
      );
      const controller = buildQueuedRequestController({
        messenger: buildQueuedRequestControllerMessenger(messenger),
      });
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
        {
          ...buildRequest(),
          networkClientId,
          origin: 'https://secondorigin.metamask.io',
        },
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

    it('queues request if a request from the same origin but different networkClientId is being processed', async () => {
      const controller = buildQueuedRequestController();
      // Trigger first request
      const firstRequest = controller.enqueueRequest(
        {
          ...buildRequest(),
          origin: 'https://example.metamask.io',
          networkClientId: 'network1',
        },
        () => new Promise((resolve) => setTimeout(resolve, 10)),
      );
      // ensure first request skips queue
      expect(controller.state.queuedRequestCount).toBe(0);

      const secondRequestNext = jest.fn();
      const secondRequest = controller.enqueueRequest(
        {
          ...buildRequest(),
          origin: 'https://example.metamask.io',
          networkClientId: 'network2',
        },
        secondRequestNext,
      );

      expect(controller.state.queuedRequestCount).toBe(1);
      expect(secondRequestNext).not.toHaveBeenCalled();

      await firstRequest;
      await secondRequest;
    });

    it('processes requests from different origins but same networkClientId in separate batches without network switch', async () => {
      const mockSetActiveNetwork = jest.fn();
      const { messenger } = buildMessenger({
        networkControllerGetState: jest.fn().mockReturnValue({
          ...getDefaultNetworkControllerState(),
          selectedNetworkClientId: 'network1',
        }),
        networkControllerSetActiveNetwork: mockSetActiveNetwork,
      });
      const controller = buildQueuedRequestController({
        messenger: buildQueuedRequestControllerMessenger(messenger),
      });

      // Trigger first request
      const firstRequest = controller.enqueueRequest(
        {
          ...buildRequest(),
          origin: 'https://firstorigin.metamask.io',
          networkClientId: 'network1',
        },
        () => new Promise((resolve) => setTimeout(resolve, 10)),
      );
      // Ensure first request skips queue
      expect(controller.state.queuedRequestCount).toBe(0);

      const secondRequestNext = jest.fn();
      const secondRequest = controller.enqueueRequest(
        {
          ...buildRequest(),
          origin: 'https://secondorigin.metamask.io',
          networkClientId: 'network1',
        },
        secondRequestNext,
      );

      expect(controller.state.queuedRequestCount).toBe(1);
      expect(secondRequestNext).not.toHaveBeenCalled();

      await firstRequest;
      await secondRequest;

      expect(mockSetActiveNetwork).not.toHaveBeenCalled();
    });

    it('switches networks between batches with different networkClientIds', async () => {
      const mockSetActiveNetwork = jest.fn();
      const { messenger } = buildMessenger({
        networkControllerGetState: jest.fn().mockReturnValue({
          ...getDefaultNetworkControllerState(),
          selectedNetworkClientId: 'network1',
        }),
        networkControllerSetActiveNetwork: mockSetActiveNetwork,
      });

      const controller = buildQueuedRequestController({
        messenger: buildQueuedRequestControllerMessenger(messenger),
      });

      const firstRequest = controller.enqueueRequest(
        {
          ...buildRequest(),
          origin: 'https://firstorigin.metamask.io',
          networkClientId: 'network1',
        },
        () => new Promise((resolve) => setTimeout(resolve, 10)),
      );

      expect(controller.state.queuedRequestCount).toBe(0);

      const secondRequestNext = jest.fn();
      const secondRequest = controller.enqueueRequest(
        {
          ...buildRequest(),
          origin: 'https://secondorigin.metamask.io',
          networkClientId: 'network2',
        },
        secondRequestNext,
      );

      expect(controller.state.queuedRequestCount).toBe(1);
      expect(secondRequestNext).not.toHaveBeenCalled();

      await firstRequest;

      expect(mockSetActiveNetwork).toHaveBeenCalledWith('network2');

      await secondRequest;

      expect(controller.state.queuedRequestCount).toBe(0);

      expect(secondRequestNext).toHaveBeenCalled();
    });

    it('processes complex interleaved requests from multiple origins and networkClientIds correctly', async () => {
      const events: string[] = [];

      const mockSetActiveNetwork = jest.fn((networkClientId: string) => {
        events.push(`network switched to ${networkClientId}`);
        return Promise.resolve();
      });

      const { messenger } = buildMessenger({
        networkControllerGetState: jest
          .fn()
          .mockReturnValueOnce({
            ...getDefaultNetworkControllerState(),
            selectedNetworkClientId: 'NetworkClientId1',
          })
          .mockReturnValueOnce({
            ...getDefaultNetworkControllerState(),
            selectedNetworkClientId: 'NetworkClientId2',
          })
          .mockReturnValueOnce({
            ...getDefaultNetworkControllerState(),
            selectedNetworkClientId: 'NetworkClientId2',
          })
          .mockReturnValueOnce({
            ...getDefaultNetworkControllerState(),
            selectedNetworkClientId: 'NetworkClientId1',
          })
          .mockReturnValueOnce({
            ...getDefaultNetworkControllerState(),
            selectedNetworkClientId: 'NetworkClientId3',
          }),
        networkControllerSetActiveNetwork: mockSetActiveNetwork,
      });

      const controller = buildQueuedRequestController({
        messenger: buildQueuedRequestControllerMessenger(messenger),
      });

      const createRequestNext = (requestName: string) =>
        jest.fn(() => {
          events.push(`${requestName} processed`);
          return Promise.resolve();
        });

      const request1Next = createRequestNext('request1');
      const request2Next = createRequestNext('request2');
      const request3Next = createRequestNext('request3');
      const request4Next = createRequestNext('request4');
      const request5Next = createRequestNext('request5');

      const enqueueRequest = (
        origin: string,
        networkClientId: string,
        next: jest.Mock,
      ) =>
        controller.enqueueRequest(
          {
            ...buildRequest(),
            origin,
            networkClientId,
          },
          () => Promise.resolve(next()),
        );

      const request1Promise = enqueueRequest(
        'https://origin1.metamask.io',
        'NetworkClientId1',
        request1Next,
      );
      const request2Promise = enqueueRequest(
        'https://origin1.metamask.io',
        'NetworkClientId2',
        request2Next,
      );
      const request3Promise = enqueueRequest(
        'https://origin2.metamask.io',
        'NetworkClientId2',
        request3Next,
      );
      const request4Promise = enqueueRequest(
        'https://origin2.metamask.io',
        'NetworkClientId1',
        request4Next,
      );
      const request5Promise = enqueueRequest(
        'https://origin1.metamask.io',
        'NetworkClientId3',
        request5Next,
      );

      expect(controller.state.queuedRequestCount).toBe(4);

      await request1Promise;
      await request2Promise;
      await request3Promise;
      await request4Promise;
      await request5Promise;

      expect(events).toStrictEqual([
        'request1 processed',
        'network switched to NetworkClientId2',
        'request2 processed',
        'request3 processed',
        'network switched to NetworkClientId1',
        'request4 processed',
        'network switched to NetworkClientId3',
        'request5 processed',
      ]);

      expect(mockSetActiveNetwork).toHaveBeenCalledTimes(3);

      expect(controller.state.queuedRequestCount).toBe(0);
    });

    describe('when the network switch for a single request fails', () => {
      it('throws error', async () => {
        const switchError = new Error('switch error');
        const { messenger } = buildMessenger({
          networkControllerGetState: jest.fn().mockReturnValue({
            ...getDefaultNetworkControllerState(),
            selectedNetworkClientId: 'selectedNetworkClientId',
          }),
          networkControllerSetActiveNetwork: jest
            .fn()
            .mockRejectedValue(switchError),
        });
        const controller = buildQueuedRequestController({
          messenger: buildQueuedRequestControllerMessenger(messenger),
          shouldRequestSwitchNetwork: ({ method }) =>
            method === 'method_requiring_network_switch',
        });

        await expect(() =>
          controller.enqueueRequest(
            {
              ...buildRequest(),
              networkClientId: 'differentNetworkClientId',
              method: 'method_requiring_network_switch',
              origin: 'https://example.metamask.io',
            },
            jest.fn(),
          ),
        ).rejects.toThrow(switchError);
      });

      it('correctly processes the next item in the queue', async () => {
        const switchError = new Error('switch error');
        const { messenger } = buildMessenger({
          networkControllerGetState: jest.fn().mockReturnValue({
            ...getDefaultNetworkControllerState(),
            selectedNetworkClientId: 'selectedNetworkClientId',
          }),
          networkControllerSetActiveNetwork: jest
            .fn()
            .mockRejectedValueOnce(switchError),
        });
        const controller = buildQueuedRequestController({
          messenger: buildQueuedRequestControllerMessenger(messenger),
          shouldRequestSwitchNetwork: ({ method }) =>
            method === 'method_requiring_network_switch',
        });

        const firstRequest = controller.enqueueRequest(
          {
            ...buildRequest(),
            networkClientId: 'differentNetworkClientId',
            method: 'method_requiring_network_switch',
            origin: 'https://firstorigin.metamask.io',
          },
          () => new Promise((resolve) => setTimeout(resolve, 10)),
        );
        expect(controller.state.queuedRequestCount).toBe(0);

        const secondRequestNext = jest.fn().mockResolvedValue(undefined);
        const secondRequest = controller.enqueueRequest(
          {
            ...buildRequest(),
            method: 'method_requiring_network_switch',
            origin: 'https://secondorigin.metamask.io',
          },
          secondRequestNext,
        );

        await expect(firstRequest).rejects.toThrow('switch error');
        await secondRequest;

        expect(secondRequestNext).toHaveBeenCalled();
      });
    });

    describe('when the network switch for a batch fails', () => {
      it('throws error', async () => {
        const switchError = new Error('switch error');

        const { messenger } = buildMessenger({
          networkControllerGetState: jest.fn().mockReturnValue({
            ...getDefaultNetworkControllerState(),
            selectedNetworkClientId: 'mainnet',
          }),
          networkControllerSetActiveNetwork: jest
            .fn()
            .mockRejectedValueOnce(switchError),
        });
        const controller = buildQueuedRequestController({
          messenger: buildQueuedRequestControllerMessenger(messenger),
          shouldRequestSwitchNetwork: ({ method }) =>
            method === 'method_requiring_network_switch',
        });

        // no switch required
        const firstRequest = controller.enqueueRequest(
          {
            ...buildRequest(),
            method: 'method_requiring_network_switch',
            origin: 'https://firstorigin.metamask.io',
          },
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
          {
            ...buildRequest(),
            networkClientId: 'differentNetworkClientId',
            method: 'method_requiring_network_switch',
            origin: 'https://secondorigin.metamask.io',
          },
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
        const { messenger } = buildMessenger({
          networkControllerGetState: jest.fn().mockReturnValue({
            ...getDefaultNetworkControllerState(),
            selectedNetworkClientId: 'mainnet',
          }),
          networkControllerSetActiveNetwork: jest
            .fn()
            .mockRejectedValueOnce(switchError),
        });
        const controller = buildQueuedRequestController({
          messenger: buildQueuedRequestControllerMessenger(messenger),
          shouldRequestSwitchNetwork: ({ method }) =>
            method === 'method_requiring_network_switch',
        });
        const firstRequest = controller.enqueueRequest(
          {
            ...buildRequest(),
            method: 'method_requiring_network_switch',
            origin: 'https://firstorigin.metamask.io',
          },
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
          {
            ...buildRequest(),
            networkClientId: 'differentNetworkClientId',
            method: 'method_requiring_network_switch',
            origin: 'https://secondorigin.metamask.io',
          },
          secondRequestNext,
        );
        const thirdRequestNext = jest
          .fn()
          .mockImplementation(
            () => new Promise((resolve) => setTimeout(resolve, 100)),
          );
        const thirdRequest = controller.enqueueRequest(
          {
            ...buildRequest(),
            method: 'method_requiring_network_switch',
            origin: 'https://thirdorigin.metamask.io',
          },
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

    describe('when the first request in a batch can switch the network', () => {
      it('waits on processing the request first in the current batch', async () => {
        const { messenger } = buildMessenger({
          networkControllerGetState: jest.fn().mockReturnValue({
            ...getDefaultNetworkControllerState(),
            selectedNetworkClientId: 'mainnet',
          }),
        });
        const controller = buildQueuedRequestController({
          messenger: buildQueuedRequestControllerMessenger(messenger),
          canRequestSwitchNetworkWithoutApproval: jest
            .fn()
            .mockImplementation(
              (request) =>
                request.method === 'method_can_switch_network_without_approval',
            ),
        });

        const firstRequest = controller.enqueueRequest(
          buildRequest(),
          () => new Promise((resolve) => setTimeout(resolve, 10)),
        );
        // ensure first request skips queue
        expect(controller.state.queuedRequestCount).toBe(0);

        const secondRequestNext = jest
          .fn()
          .mockImplementation(
            () => new Promise((resolve) => setTimeout(resolve, 10)),
          );
        const secondRequest = controller.enqueueRequest(
          {
            ...buildRequest(),

            method: 'method_can_switch_network_without_approval',
          },
          secondRequestNext,
        );

        const thirdRequestNext = jest
          .fn()
          .mockImplementation(
            () => new Promise((resolve) => setTimeout(resolve, 10)),
          );
        const thirdRequest = controller.enqueueRequest(
          buildRequest(),
          thirdRequestNext,
        );

        // ensure test starts with two requests queued up
        expect(controller.state.queuedRequestCount).toBe(2);
        expect(secondRequestNext).not.toHaveBeenCalled();
        expect(thirdRequestNext).not.toHaveBeenCalled();

        // does not call the third request yet since it
        // should be waiting for the second to complete
        await firstRequest;
        await secondRequest;
        expect(secondRequestNext).toHaveBeenCalled();
        expect(thirdRequestNext).not.toHaveBeenCalled();

        await thirdRequest;
        expect(thirdRequestNext).toHaveBeenCalled();
      });

      it('flushes the queue for the origin if the request changes the network', async () => {
        const networkControllerGetState = jest.fn().mockReturnValue({
          ...getDefaultNetworkControllerState(),
          selectedNetworkClientId: 'mainnet',
        });
        const { messenger } = buildMessenger({
          networkControllerGetState,
        });
        const controller = buildQueuedRequestController({
          messenger: buildQueuedRequestControllerMessenger(messenger),
          canRequestSwitchNetworkWithoutApproval: jest
            .fn()
            .mockImplementation(
              (request) =>
                request.method === 'method_can_switch_network_without_approval',
            ),
        });

        // no switch required
        const firstRequest = controller.enqueueRequest(
          buildRequest(),
          () => new Promise((resolve) => setTimeout(resolve, 10)),
        );
        // ensure first request skips queue
        expect(controller.state.queuedRequestCount).toBe(0);

        const secondRequestNext = jest.fn().mockImplementation(
          () =>
            new Promise((resolve) => {
              networkControllerGetState.mockReturnValue({
                ...getDefaultNetworkControllerState(),
                selectedNetworkClientId: 'newNetworkClientId',
              });
              resolve(undefined);
            }),
        );
        const secondRequest = controller.enqueueRequest(
          {
            ...buildRequest(),
            method: 'method_can_switch_network_without_approval',
          },
          secondRequestNext,
        );

        const thirdRequestNext = jest
          .fn()
          .mockImplementation(
            () => new Promise((resolve) => setTimeout(resolve, 10)),
          );
        const thirdRequest = controller.enqueueRequest(
          buildRequest(),
          thirdRequestNext,
        );

        // ensure test starts with two requests queued up
        expect(controller.state.queuedRequestCount).toBe(2);
        expect(secondRequestNext).not.toHaveBeenCalled();
        expect(thirdRequestNext).not.toHaveBeenCalled();

        // does not call the third request yet since it
        // should not be in the same batch as the second
        await firstRequest;
        await secondRequest;
        expect(secondRequestNext).toHaveBeenCalled();
        expect(thirdRequestNext).not.toHaveBeenCalled();

        await expect(thirdRequest).rejects.toThrow(
          new Error(
            'The request has been rejected due to a change in selected network. Please verify the selected network and retry the request.',
          ),
        );
        expect(thirdRequestNext).not.toHaveBeenCalled();
      });
    });

    describe('when a request fails', () => {
      it('throws error', async () => {
        const controller = buildQueuedRequestController();

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
        const controller = buildQueuedRequestController();

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
        const controller = buildQueuedRequestController();

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

    it('rejects requests for an origin when the SelectedNetworkController "domains" state for that origin has changed, but preserves requests for other origins', async () => {
      const { messenger } = buildMessenger();

      const options: QueuedRequestControllerOptions = {
        messenger: buildQueuedRequestControllerMessenger(messenger),
        shouldRequestSwitchNetwork: ({ method }) =>
          method === 'eth_sendTransaction',
        canRequestSwitchNetworkWithoutApproval: () => false,
        clearPendingConfirmations: jest.fn(),
        showApprovalRequest: jest.fn(),
      };

      const controller = new QueuedRequestController(options);

      const request1 = jest.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));

        messenger.publish(
          'SelectedNetworkController:stateChange',
          { domains: {} },
          [
            {
              op: 'replace',
              path: ['domains', 'https://abc.123'],
            },
            {
              op: 'add',
              path: ['domains', 'https://abc.123'],
            },
          ],
        );
      });

      const request2 = jest.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      const request3 = jest.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      // Enqueue the requests
      const promise1 = controller.enqueueRequest(
        {
          ...buildRequest(),
          method: 'wallet_switchEthereumChain',
          origin: 'https://abc.123',
        },
        request1,
      );
      const promise2 = controller.enqueueRequest(
        {
          ...buildRequest(),
          method: 'eth_sendTransaction',
          origin: 'https://foo.bar',
        },
        request2,
      );
      const promise3 = controller.enqueueRequest(
        {
          ...buildRequest(),
          method: 'eth_sendTransaction',
          origin: 'https://abc.123',
        },
        request3,
      );

      expect(
        await Promise.allSettled([promise1, promise2, promise3]),
      ).toStrictEqual([
        { status: 'fulfilled', value: undefined },
        { status: 'fulfilled', value: undefined },
        {
          status: 'rejected',
          reason: new Error(
            'The request has been rejected due to a change in selected network. Please verify the selected network and retry the request.',
          ),
        },
      ]);
      expect(request1).toHaveBeenCalled();
      expect(request2).toHaveBeenCalled();
      expect(request3).not.toHaveBeenCalled();
    });

    it('calls clearPendingConfirmations when the SelectedNetworkController "domains" state for that origin has been removed', async () => {
      const { messenger } = buildMessenger();

      const options: QueuedRequestControllerOptions = {
        messenger: buildQueuedRequestControllerMessenger(messenger),
        shouldRequestSwitchNetwork: ({ method }) =>
          method === 'eth_sendTransaction',
        canRequestSwitchNetworkWithoutApproval: () => false,
        clearPendingConfirmations: jest.fn(),
        showApprovalRequest: jest.fn(),
      };

      const controller = new QueuedRequestController(options);

      const request1 = jest.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));

        messenger.publish(
          'SelectedNetworkController:stateChange',
          { domains: {} },
          [
            {
              op: 'remove',
              path: ['domains', 'https://abc.123'],
            },
          ],
        );
      });

      await controller.enqueueRequest(
        {
          ...buildRequest(),
          method: 'wallet_revokePermissions',
          origin: 'https://abc.123',
        },
        request1,
      );
      expect(options.clearPendingConfirmations).toHaveBeenCalledTimes(1);
    });
  });
});

/**
 * Build a messenger setup with QueuedRequestController types.
 *
 * @param options - Options
 * @param options.networkControllerGetState - A handler for the `NetworkController:getState`
 * action.
 * @param options.networkControllerSetActiveNetwork - A handler for the
 * `NetworkController:setActiveNetwork` action.
 * @returns A messenger with QueuedRequestController types, and
 * mocks for all allowed actions.
 */
function buildMessenger({
  networkControllerGetState,
  networkControllerSetActiveNetwork,
}: {
  networkControllerGetState?: NetworkControllerGetStateAction['handler'];
  networkControllerSetActiveNetwork?: NetworkControllerSetActiveNetworkAction['handler'];
} = {}): {
  messenger: Messenger<
    QueuedRequestControllerActions | AllowedActions,
    QueuedRequestControllerEvents | AllowedEvents
  >;
  mockNetworkControllerGetState: jest.Mocked<
    NetworkControllerGetStateAction['handler']
  >;
  mockNetworkControllerSetActiveNetwork: jest.Mocked<
    NetworkControllerSetActiveNetworkAction['handler']
  >;
} {
  const messenger = new Messenger<
    QueuedRequestControllerActions | AllowedActions,
    QueuedRequestControllerEvents | AllowedEvents
  >();

  const mockNetworkControllerGetState =
    networkControllerGetState ??
    jest.fn().mockReturnValue({
      ...getDefaultNetworkControllerState(),
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

  return {
    messenger,
    mockNetworkControllerGetState,
    mockNetworkControllerSetActiveNetwork,
  };
}

/**
 * Builds a restricted messenger for the queued request controller.
 *
 * @param messenger - A messenger.
 * @returns The restricted messenger.
 */
function buildQueuedRequestControllerMessenger(
  messenger = buildMessenger().messenger,
): QueuedRequestControllerMessenger {
  return messenger.getRestricted({
    name: controllerName,
    allowedActions: [
      'NetworkController:getState',
      'NetworkController:setActiveNetwork',
    ],
    allowedEvents: ['SelectedNetworkController:stateChange'],
  });
}

/**
 * Builds a QueuedRequestController
 *
 * @param overrideOptions - The optional options object.
 * @returns The QueuedRequestController.
 */
function buildQueuedRequestController(
  overrideOptions?: Partial<QueuedRequestControllerOptions>,
): QueuedRequestController {
  const options: QueuedRequestControllerOptions = {
    messenger: buildQueuedRequestControllerMessenger(),
    shouldRequestSwitchNetwork: () => false,
    canRequestSwitchNetworkWithoutApproval: () => false,
    clearPendingConfirmations: jest.fn(),
    showApprovalRequest: jest.fn(),
    ...overrideOptions,
  };

  return new QueuedRequestController(options);
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
