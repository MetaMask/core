import type { ApprovalController } from '@metamask/approval-controller';
import { ControllerMessenger } from '@metamask/base-controller';
import { NetworkType } from '@metamask/controller-utils';
import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import type {
  NetworkController,
  NetworkControllerGetStateAction,
  ProviderConfig,
} from '@metamask/network-controller';
import { defaultState as networkControllerDefaultState } from '@metamask/network-controller';
import { serializeError } from '@metamask/rpc-errors';
import { SelectedNetworkControllerActionTypes } from '@metamask/selected-network-controller';
import type { Json, PendingJsonRpcResponse } from '@metamask/utils';

import type { QueuedRequestMiddlewareMessenger } from './QueuedRequestMiddleware';
import {
  createQueuedRequestMiddleware,
  type QueuedRequestMiddlewareJsonRpcRequest,
} from './QueuedRequestMiddleware';

/**
 * Build a controller messenger that includes all actions and events used by the queued request controller middleware.
 *
 * @returns The controller messenger.
 */
function buildMessenger(): QueuedRequestMiddlewareMessenger {
  return new ControllerMessenger();
}

const buildMocks = (
  messenger: QueuedRequestMiddlewareMessenger,
  mocks: {
    getNetworkClientById?: NetworkController['getNetworkClientById'];
    getProviderConfig?: () => ProviderConfig;
    addRequest?: ApprovalController['add'];
    // since NetworkConfigurations is not exported, we get it this way. Todo: export the type or expose a getter on NetworkController
    getNetworkConfigurations?: () => ReturnType<
      NetworkControllerGetStateAction['handler']
    >['networkConfigurations'];
  } = {},
) => {
  const mockGetNetworkClientById =
    mocks.getNetworkClientById ??
    jest.fn().mockReturnValue({
      configuration: {
        chainId: '0x1',
      },
    });
  messenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    mockGetNetworkClientById,
  );

  const mockGetNetworkConfigurations =
    mocks.getNetworkConfigurations ?? jest.fn(() => ({}));
  const mockGetProviderConfig =
    mocks.getProviderConfig ??
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jest.fn<ProviderConfig, any[]>(() => ({
      chainId: '0x1',
      type: NetworkType.mainnet,
      ticker: 'ETH',
    }));
  const mockGetNetworkControllerState = jest.fn(() => ({
    ...networkControllerDefaultState,
    networkConfigurations: mockGetNetworkConfigurations(),
    providerConfig: mockGetProviderConfig(),
  }));

  messenger.registerActionHandler(
    'NetworkController:getState',
    mockGetNetworkControllerState,
  );

  const mockEnqueueRequest = jest.fn().mockImplementation((cb) => cb());
  messenger.registerActionHandler(
    'QueuedRequestController:enqueueRequest',
    mockEnqueueRequest,
  );

  const mockAddRequest = mocks.addRequest ?? jest.fn().mockResolvedValue(true);
  messenger.registerActionHandler(
    'ApprovalController:addRequest',
    mockAddRequest,
  );

  const mockSetActiveNetwork = jest.fn().mockResolvedValue(true);
  messenger.registerActionHandler(
    'NetworkController:setActiveNetwork',
    mockSetActiveNetwork,
  );

  const mockSetNetworkClientIdForDomain = jest.fn().mockResolvedValue(true);
  messenger.registerActionHandler(
    SelectedNetworkControllerActionTypes.setNetworkClientIdForDomain,
    mockSetNetworkClientIdForDomain,
  );

  return {
    getProviderConfig: mockGetProviderConfig,
    getNetworkConfigurations: mockGetNetworkConfigurations,
    getNetworkControllerState: mockGetNetworkControllerState,
    getNetworkClientById: mockGetNetworkClientById,
    enqueueRequest: mockEnqueueRequest,
    addRequest: mockAddRequest,
    setActiveNetwork: mockSetActiveNetwork,
    setNetworkClientIdForDomain: mockSetNetworkClientIdForDomain,
  };
};

const requestDefaults = {
  method: 'doesnt matter',
  id: 'doesnt matter',
  jsonrpc: '2.0' as const,
  origin: 'example.com',
  networkClientId: 'mainnet',
};

describe('createQueuedRequestMiddleware', () => {
  it('throws if not provided an origin', async () => {
    const messenger = buildMessenger();
    const middleware = createQueuedRequestMiddleware({
      messenger,
      useRequestQueue: () => false,
    });
    const req: QueuedRequestMiddlewareJsonRpcRequest = {
      id: '123',
      jsonrpc: '2.0',
      method: 'anything',
      networkClientId: 'anything',
    };

    await expect(
      () =>
        new Promise((resolve, reject) =>
          middleware(
            req,
            {} as PendingJsonRpcResponse<typeof req>,
            resolve,
            reject,
          ),
        ),
    ).rejects.toThrow("Request object is lacking an 'origin'");
  });

  it('throws if not provided an networkClientId', async () => {
    const messenger = buildMessenger();
    const middleware = createQueuedRequestMiddleware({
      messenger,
      useRequestQueue: () => false,
    });
    const req: QueuedRequestMiddlewareJsonRpcRequest = {
      id: '123',
      jsonrpc: '2.0',
      method: 'anything',
      origin: 'anything',
    };

    await expect(
      () =>
        new Promise((resolve, reject) =>
          middleware(
            req,
            {} as PendingJsonRpcResponse<typeof req>,
            resolve,
            reject,
          ),
        ),
    ).rejects.toThrow("Request object is lacking a 'networkClientId'");
  });

  it('should not enqueue the request when useRequestQueue is false', async () => {
    const messenger = buildMessenger();
    const middleware = createQueuedRequestMiddleware({
      messenger,
      useRequestQueue: () => false,
    });
    const mocks = buildMocks(messenger);

    await new Promise((resolve, reject) =>
      middleware(
        { ...requestDefaults },
        {} as PendingJsonRpcResponse<typeof requestDefaults>,
        resolve,
        reject,
      ),
    );

    expect(mocks.enqueueRequest).not.toHaveBeenCalled();
  });

  it('should not enqueue the request when there is no confirmation', async () => {
    const messenger = buildMessenger();
    const middleware = createQueuedRequestMiddleware({
      messenger,
      useRequestQueue: () => true,
    });
    const mocks = buildMocks(messenger);

    const req = {
      ...requestDefaults,
      method: 'eth_chainId',
    };

    await new Promise((resolve, reject) =>
      middleware(
        req,
        {} as PendingJsonRpcResponse<typeof req>,
        resolve,
        reject,
      ),
    );

    expect(mocks.enqueueRequest).not.toHaveBeenCalled();
  });

  describe('confirmations', () => {
    it('should resolve requests that require confirmations for infura networks', async () => {
      const messenger = buildMessenger();
      const middleware = createQueuedRequestMiddleware({
        messenger,
        useRequestQueue: () => true,
      });
      const mocks = buildMocks(messenger);

      const req = {
        ...requestDefaults,
        method: 'eth_sendTransaction',
      };

      await new Promise((resolve, reject) =>
        middleware(
          req,
          {} as PendingJsonRpcResponse<typeof req>,
          resolve,
          reject,
        ),
      );

      expect(mocks.enqueueRequest).toHaveBeenCalled();
      expect(mocks.getNetworkClientById).toHaveBeenCalledWith('mainnet');
    });

    it('should resolve requests that require confirmations for custom networks', async () => {
      const messenger = buildMessenger();
      const middleware = createQueuedRequestMiddleware({
        messenger,
        useRequestQueue: () => true,
      });
      const networkClientId = '12309-12039-12309';
      const mocks = buildMocks(messenger, {
        getNetworkConfigurations: jest.fn(() => ({
          [networkClientId]: {
            id: networkClientId,
            rpcUrl: 'foo.com',
            ticker: 'foo',
            chainId: '0x123',
          },
        })),
      });

      const req = {
        ...requestDefaults,
        networkClientId,
        method: 'eth_sendTransaction',
      };

      await new Promise((resolve, reject) =>
        middleware(
          req,
          {} as PendingJsonRpcResponse<typeof req>,
          resolve,
          reject,
        ),
      );

      expect(mocks.enqueueRequest).toHaveBeenCalled();
      // custom networks use getNetworkClientyId
      expect(mocks.getNetworkClientById).toHaveBeenCalledWith(networkClientId);
    });

    it('switchEthereumChain calls get queued but we dont check the current network', async () => {
      const messenger = buildMessenger();
      const middleware = createQueuedRequestMiddleware({
        messenger,
        useRequestQueue: () => true,
      });
      const mocks = buildMocks(messenger);

      const req = {
        ...requestDefaults,
        method: 'wallet_switchEthereumChain',
      };

      await new Promise((resolve, reject) =>
        middleware(
          req,
          {} as PendingJsonRpcResponse<typeof req>,
          resolve,
          reject,
        ),
      );

      expect(mocks.addRequest).not.toHaveBeenCalled();
      expect(mocks.enqueueRequest).toHaveBeenCalled();
      expect(mocks.getProviderConfig).not.toHaveBeenCalled();
    });

    describe('requiring switch', () => {
      it('calls addRequest to switchEthChain if the current network is different than the globally selected network', async () => {
        const messenger = buildMessenger();
        const middleware = createQueuedRequestMiddleware({
          messenger,
          useRequestQueue: () => true,
        });
        const mockGetProviderConfig = jest.fn().mockReturnValue({
          chainId: '0x5',
        });
        const mocks = buildMocks(messenger, {
          getProviderConfig: mockGetProviderConfig,
        });

        const req = {
          ...requestDefaults, // chainId = '0x1'
          method: 'eth_sendTransaction',
        };

        await new Promise((resolve, reject) =>
          middleware(
            req,
            {} as PendingJsonRpcResponse<typeof req>,
            resolve,
            reject,
          ),
        );

        expect(mocks.addRequest).toHaveBeenCalled();
        expect(mocks.enqueueRequest).toHaveBeenCalled();
        expect(mocks.setNetworkClientIdForDomain).toHaveBeenCalled();
      });

      it('if the switchEthConfirmation is rejected, the original request is rejected', async () => {
        const messenger = buildMessenger();
        const middleware = createQueuedRequestMiddleware({
          messenger,
          useRequestQueue: () => true,
        });
        const rejected = new Error('big bad rejected');
        const mockAddRequest = jest.fn().mockRejectedValue(rejected);
        const mockGetProviderConfig = jest.fn().mockReturnValue({
          chainId: '0x5',
        });
        const mocks = buildMocks(messenger, {
          addRequest: mockAddRequest,
          getProviderConfig: mockGetProviderConfig,
        });

        const req = {
          ...requestDefaults,
          method: 'eth_sendTransaction',
        };

        const res = {} as PendingJsonRpcResponse<Json>;
        await new Promise((resolve, reject) =>
          middleware(req, res, reject, resolve),
        );

        expect(mocks.addRequest).toHaveBeenCalled();
        expect(mocks.enqueueRequest).toHaveBeenCalled();
        expect(mocks.setNetworkClientIdForDomain).not.toHaveBeenCalled();
        expect(res.error).toStrictEqual(serializeError(rejected));
      });

      it('switches the current active network', async () => {
        const messenger = buildMessenger();
        const middleware = createQueuedRequestMiddleware({
          messenger,
          useRequestQueue: () => true,
        });
        const networkClientId = '123123-123123-123123';
        const mocks = buildMocks(messenger, {
          getNetworkConfigurations: jest.fn(() => ({
            [networkClientId]: {
              id: networkClientId,
              rpcUrl: 'foo.com',
              ticker: 'foo',
              chainId: '0x123',
            },
          })),
          getProviderConfig: jest.fn().mockReturnValue({
            chainId: '0x1',
          }),
          getNetworkClientById: jest.fn().mockReturnValue({
            configuration: {
              chainId: '0x123',
            },
          }),
        });

        const req = {
          ...requestDefaults,
          origin: 'example.com',
          method: 'eth_sendTransaction',
          networkClientId,
        };

        await new Promise((resolve, reject) =>
          middleware(
            req,
            {} as PendingJsonRpcResponse<typeof req>,
            resolve,
            reject,
          ),
        );

        expect(mocks.setActiveNetwork).toHaveBeenCalled();
      });
    });
  });

  describe('concurrent requests', () => {
    it('rejecting one call does not cause others to be rejected', async () => {
      const messenger = buildMessenger();
      const middleware = createQueuedRequestMiddleware({
        messenger,
        useRequestQueue: () => true,
      });
      const rejectedError = new Error('big bad rejected');
      const mockAddRequest = jest
        .fn()
        .mockRejectedValueOnce(rejectedError)
        .mockResolvedValueOnce(true);

      const mockGetProviderConfig = jest.fn().mockReturnValue({
        chainId: '0x5',
      });

      const mocks = buildMocks(messenger, {
        addRequest: mockAddRequest,
        getProviderConfig: mockGetProviderConfig,
      });

      const req1 = {
        ...requestDefaults,
        origin: 'example.com',
        method: 'eth_sendTransaction',
      };

      const req2 = {
        ...requestDefaults,
        origin: 'example.com',
        method: 'eth_sendTransaction',
      };

      const res1 = {} as PendingJsonRpcResponse<Json>;
      const res2 = {} as PendingJsonRpcResponse<Json>;

      await Promise.all([
        new Promise((resolve) => middleware(req1, res1, resolve, resolve)),
        new Promise((resolve) => middleware(req2, res2, resolve, resolve)),
      ]);

      expect(mocks.addRequest).toHaveBeenCalledTimes(2);
      expect(res1.error).toStrictEqual(serializeError(rejectedError));
      expect(res2.error).toBeUndefined();
    });
  });

  describe('integration', () => {
    it('does not queue requests that lack confirmations', async () => {
      const engine = new JsonRpcEngine();
      const messenger = buildMessenger();
      const mocks = buildMocks(messenger);
      engine.push((req: QueuedRequestMiddlewareJsonRpcRequest, _, next) => {
        req.origin = 'foobar';
        req.networkClientId = 'mainnet';
        next();
      });
      engine.push(
        createQueuedRequestMiddleware({
          messenger,
          useRequestQueue: () => true,
        }),
      );

      const mockNextMiddleware = jest
        .fn()
        .mockImplementation((_, res, __, end) => {
          res.result = true;
          end();
        });
      engine.push(mockNextMiddleware);
      const result = await engine.handle({
        id: 1,
        jsonrpc: '2.0',
        method: 'foo',
        params: [],
      });
      expect(result).toStrictEqual(expect.objectContaining({ result: true }));
      expect(mocks.enqueueRequest).not.toHaveBeenCalled();
    });

    it('queues requests that require confirmation', async () => {
      const engine = new JsonRpcEngine();
      const messenger = buildMessenger();
      const mocks = buildMocks(messenger);
      engine.push((req: QueuedRequestMiddlewareJsonRpcRequest, _, next) => {
        req.origin = 'foobar';
        req.networkClientId = 'mainnet';
        next();
      });
      engine.push(
        createQueuedRequestMiddleware({
          messenger,
          useRequestQueue: () => true,
        }),
      );

      const mockNextMiddleware = jest
        .fn()
        .mockImplementation((_, res, __, end) => {
          res.result = true;
          end();
        });
      engine.push(mockNextMiddleware);
      const result = await engine.handle({
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_sendTransaction',
        params: [],
      });
      expect(result).toStrictEqual(expect.objectContaining({ result: true }));
      expect(mocks.enqueueRequest).toHaveBeenCalled();
    });

    it('one request being rejected does not reject the following', async () => {
      const engine = new JsonRpcEngine();
      const messenger = buildMessenger();
      const mocks = buildMocks(messenger);
      engine.push((req: QueuedRequestMiddlewareJsonRpcRequest, _, next) => {
        req.origin = 'foobar';
        req.networkClientId = 'mainnet';
        next();
      });
      engine.push(
        createQueuedRequestMiddleware({
          messenger,
          useRequestQueue: () => true,
        }),
      );

      const ordering: number[] = [];
      const mockNextMiddleware = jest
        .fn()
        .mockImplementationOnce(async (req, res, _, end) => {
          res.error = new Error('user has rejected blah blah');
          await new Promise((resolve) => setTimeout(resolve, 5));
          ordering.push(req.id);
          end();
        })
        .mockImplementationOnce((req, res, _, end) => {
          res.result = true;
          ordering.push(req.id);
          end();
        })
        .mockImplementationOnce(async (req, res, _, end) => {
          res.result = true;
          await new Promise((resolve) => setTimeout(resolve, 5));
          ordering.push(req.id);
          end();
        });
      engine.push(mockNextMiddleware);
      const [first, second, third] = await Promise.all([
        engine.handle({
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_sendTransaction',
          params: [],
        }),
        engine.handle({
          id: 2,
          jsonrpc: '2.0',
          method: 'not_queued',
          params: [],
        }),
        engine.handle({
          id: 3,
          jsonrpc: '2.0',
          method: 'eth_sendTransaction',
          params: [],
        }),
      ]);
      expect(first).toStrictEqual(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Internal JSON-RPC error.',
          }),
        }),
      );
      expect(second).toStrictEqual(expect.objectContaining({ result: true }));
      expect(third).toStrictEqual(expect.objectContaining({ result: true }));
      expect(ordering).toStrictEqual([2, 1, 3]); // 1 should be first because its not queued.
      expect(mocks.enqueueRequest).toHaveBeenCalled();
    });
  });
});
