import type { AddApprovalRequest } from '@metamask/approval-controller';
import { ControllerMessenger } from '@metamask/base-controller';
import type {
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerGetStateAction,
  NetworkControllerSetActiveNetworkAction,
  NetworkControllerSetProviderTypeAction,
} from '@metamask/network-controller';
import { serializeError } from '@metamask/rpc-errors';
import type { SelectedNetworkControllerSetNetworkClientIdForDomainAction } from '@metamask/selected-network-controller';
import { SelectedNetworkControllerActionTypes } from '@metamask/selected-network-controller';

import type { QueuedRequestControllerEnqueueRequestAction } from '../src/QueuedRequestController';
import { createQueuedRequestMiddleware } from '../src/QueuedRequestMiddleware';

const buildMessenger = () => {
  return new ControllerMessenger<
    | SelectedNetworkControllerSetNetworkClientIdForDomainAction
    | QueuedRequestControllerEnqueueRequestAction
    | NetworkControllerGetStateAction
    | NetworkControllerSetActiveNetworkAction
    | NetworkControllerSetProviderTypeAction
    | NetworkControllerGetNetworkClientByIdAction
    | AddApprovalRequest,
    never
  >();
};

const buildMocks = (messenger: any, mocks: any = {}) => {
  const mockGetNetworkClientById =
    mocks.getNetworkClientById ||
    jest.fn().mockReturnValue({
      configuration: {
        chainId: '0x1',
      },
    });
  messenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    mockGetNetworkClientById,
  );

  const mockGetProviderConfig =
    mocks.getProviderConfig ||
    jest.fn().mockReturnValue({
      providerConfig: {
        chainId: '0x1',
      },
    });
  messenger.registerActionHandler(
    'NetworkController:getState',
    mockGetProviderConfig,
  );

  const mockEnqueueRequest = jest.fn().mockImplementation((cb) => cb());
  messenger.registerActionHandler(
    'QueuedRequestController:enqueueRequest',
    mockEnqueueRequest,
  );

  const mockAddRequest = mocks.addRequest || jest.fn().mockResolvedValue(true);
  messenger.registerActionHandler(
    'ApprovalController:addRequest',
    mockAddRequest,
  );

  const mockSetProviderType = jest.fn().mockResolvedValue(true);
  messenger.registerActionHandler(
    'NetworkController:setProviderType',
    mockSetProviderType,
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
    getNetworkClientById: mockGetNetworkClientById,
    enqueueRequest: mockEnqueueRequest,
    addRequest: mockAddRequest,
    setActiveNetwork: mockSetActiveNetwork,
    setProviderType: mockSetProviderType,
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

describe('createQueuedRequesMitddleware', () => {
  it('throws if not provided an origin', async () => {
    const messenger = buildMessenger();
    const middleware = createQueuedRequestMiddleware(messenger, () => false);
    const req = {
      id: '123',
      jsonrpc: '2.0',
      method: 'anything',
      networkClientId: 'anything',
    };

    await expect(
      () =>
        new Promise((resolve, reject) =>
          middleware(req as any, {} as any, resolve, reject),
        ),
    ).rejects.toThrow("Request object is lacking an 'origin'");
  });

  it('throws if not provided an networkClientId', async () => {
    const messenger = buildMessenger();
    const middleware = createQueuedRequestMiddleware(messenger, () => false);
    const req = {
      id: '123',
      jsonrpc: '2.0',
      method: 'anything',
      origin: 'anything',
    };

    await expect(
      () =>
        new Promise((resolve, reject) =>
          middleware(req as any, {} as any, resolve, reject),
        ),
    ).rejects.toThrow("Request object is lacking a 'networkClientId'");
  });

  it('should not enqueue the request when useRequestQueue is false', async () => {
    const messenger = buildMessenger();
    const middleware = createQueuedRequestMiddleware(messenger, () => false);
    const mocks = buildMocks(messenger);

    await new Promise((resolve, reject) =>
      middleware({ ...requestDefaults }, {} as any, resolve, reject),
    );

    expect(mocks.enqueueRequest).not.toHaveBeenCalled();
  });

  it('should not enqueue the request when there is no confirmation', async () => {
    const messenger = buildMessenger();
    const middleware = createQueuedRequestMiddleware(messenger, () => true);
    const mocks = buildMocks(messenger);

    const req = {
      ...requestDefaults,
      method: 'eth_chainId',
    };

    await new Promise((resolve, reject) =>
      middleware(req, {} as any, resolve, reject),
    );

    expect(mocks.enqueueRequest).not.toHaveBeenCalled();
  });

  describe('confirmations', () => {
    it('should resolve requests that require confirmations for infura networks', async () => {
      const messenger = buildMessenger();
      const middleware = createQueuedRequestMiddleware(messenger, () => true);
      const mocks = buildMocks(messenger);

      const req = {
        ...requestDefaults,
        method: 'eth_sendTransaction',
      };

      await new Promise((resolve, reject) =>
        middleware(req, {} as any, resolve, reject),
      );

      expect(mocks.addRequest).not.toHaveBeenCalled();
      expect(mocks.enqueueRequest).toHaveBeenCalled();
      expect(mocks.getNetworkClientById).not.toHaveBeenCalled();
      expect(mocks.getProviderConfig).toHaveBeenCalled();
    });

    it('should resolve requests that require confirmations for custom networks', async () => {
      const messenger = buildMessenger();
      const middleware = createQueuedRequestMiddleware(messenger, () => true);
      const mocks = buildMocks(messenger);

      const req = {
        ...requestDefaults,
        networkClientId: 'custom-rpc.com',
        method: 'eth_sendTransaction',
      };

      await new Promise((resolve, reject) =>
        middleware(req, {} as any, resolve, reject),
      );

      expect(mocks.addRequest).not.toHaveBeenCalled();
      expect(mocks.enqueueRequest).toHaveBeenCalled();
      expect(mocks.getNetworkClientById).toHaveBeenCalled();
      expect(mocks.getProviderConfig).toHaveBeenCalled();
    });

    it('switchEthereumChain calls get queued but we dont check the current network', async () => {
      const messenger = buildMessenger();
      const middleware = createQueuedRequestMiddleware(messenger, () => true);
      const mocks = buildMocks(messenger);

      const req = {
        ...requestDefaults,
        method: 'wallet_switchEthereumChain',
      };

      await new Promise((resolve, reject) =>
        middleware(req, {} as any, resolve, reject),
      );

      expect(mocks.addRequest).not.toHaveBeenCalled();
      expect(mocks.enqueueRequest).toHaveBeenCalled();
      expect(mocks.getNetworkClientById).not.toHaveBeenCalled();
      expect(mocks.getProviderConfig).not.toHaveBeenCalled();
    });

    describe('requiring switch', () => {
      it('calls addRequest to switchEthChain if the current network is wrong', async () => {
        const messenger = buildMessenger();
        const middleware = createQueuedRequestMiddleware(messenger, () => true);
        const mockGetProviderConfig = jest.fn().mockReturnValue({
          providerConfig: {
            chainId: '0x5',
          },
        });
        const mocks = buildMocks(messenger, {
          getProviderConfig: mockGetProviderConfig,
        });

        const req = {
          ...requestDefaults,
          method: 'eth_sendTransaction',
        };

        await new Promise((resolve, reject) =>
          middleware(req, {} as any, resolve, reject),
        );

        expect(mocks.addRequest).toHaveBeenCalled();
        expect(mocks.enqueueRequest).toHaveBeenCalled();
        expect(mocks.getNetworkClientById).not.toHaveBeenCalled();
        expect(mocks.getProviderConfig).toHaveBeenCalled();
        expect(mocks.setNetworkClientIdForDomain).toHaveBeenCalled();
      });

      it('if the switchEthConfirmation is rejected, the original request is rejected', async () => {
        const messenger = buildMessenger();
        const middleware = createQueuedRequestMiddleware(messenger, () => true);
        const rejected = new Error('big bad rejected');
        const mockAddRequest = jest.fn().mockRejectedValue(rejected);
        const mockGetProviderConfig = jest.fn().mockReturnValue({
          providerConfig: {
            chainId: '0x5',
          },
        });
        const mocks = buildMocks(messenger, {
          addRequest: mockAddRequest,
          getProviderConfig: mockGetProviderConfig,
        });

        const req = {
          ...requestDefaults,
          method: 'eth_sendTransaction',
        };

        const res: any = {};
        await new Promise((resolve, reject) =>
          middleware(req, res, reject, resolve),
        );

        expect(mocks.addRequest).toHaveBeenCalled();
        expect(mocks.enqueueRequest).toHaveBeenCalled();
        expect(mocks.getProviderConfig).toHaveBeenCalled();
        expect(mocks.setNetworkClientIdForDomain).not.toHaveBeenCalled();
        expect(res.error).toStrictEqual(serializeError(rejected));
      });

      it('uses setProviderType when the network is an infura one', async () => {
        const messenger = buildMessenger();
        const middleware = createQueuedRequestMiddleware(messenger, () => true);
        const mocks = buildMocks(messenger, {
          getProviderConfig: jest.fn().mockReturnValue({
            providerConfig: {
              chainId: '0x5',
            },
          }),
        });

        const req = {
          ...requestDefaults,
          method: 'eth_sendTransaction',
        };

        await new Promise((resolve, reject) =>
          middleware(req, {} as any, resolve, reject),
        );

        expect(mocks.setProviderType).toHaveBeenCalled();
        expect(mocks.setActiveNetwork).not.toHaveBeenCalled();
      });

      it('uses setActiveNetwork when the network is a custom one', async () => {
        const messenger = buildMessenger();
        const middleware = createQueuedRequestMiddleware(messenger, () => true);
        const mocks = buildMocks(messenger, {
          getProviderConfig: jest.fn().mockReturnValue({
            providerConfig: {
              chainId: '0x1',
            },
          }),
          getNetworkClientById: jest.fn().mockReturnValue({
            configuration: {
              chainId: '0x1234',
            },
          }),
        });

        const req = {
          ...requestDefaults,
          origin: 'example.com',
          method: 'eth_sendTransaction',
          networkClientId: 'https://some-rpc-url.com',
        };

        await new Promise((resolve, reject) =>
          middleware(req, {} as any, resolve, reject),
        );

        expect(mocks.setProviderType).not.toHaveBeenCalled();
        expect(mocks.setActiveNetwork).toHaveBeenCalled();
      });
    });
  });
  describe('concurrent requests', () => {
    it('rejecting one call does not cause others to be rejected', async () => {
      const messenger = buildMessenger();
      const middleware = createQueuedRequestMiddleware(messenger, () => true);
      const rejectedError = new Error('big bad rejected');
      const mockAddRequest = jest
        .fn()
        .mockRejectedValueOnce(rejectedError)
        .mockResolvedValueOnce(true);

      const mockGetProviderConfig = jest.fn().mockReturnValue({
        providerConfig: {
          chainId: '0x5',
        },
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

      const res1: any = {};
      const res2: any = {};

      await Promise.all([
        new Promise((resolve) => middleware(req1, res1, resolve, resolve)),
        new Promise((resolve) => middleware(req2, res2, resolve, resolve)),
      ]);

      expect(mocks.addRequest).toHaveBeenCalledTimes(2);
      expect(res1.error).toStrictEqual(serializeError(rejectedError));
      expect(res2.error).toBeUndefined();
    });
  });
});
