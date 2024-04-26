import type { SnapController } from '@metamask/snaps-controllers';
import type { SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';

import { SnapControllerClient } from './SnapControllerClient';

describe('SnapControllerClient', () => {
  const snapId = 'local:localhost:3000' as SnapId;
  const snapController = {
    handleRequest: jest.fn(),
  };

  describe('submitRequest', () => {
    const request = {
      snapId,
      origin: 'metamask',
      handler: HandlerType.OnRpcRequest,
      request: {
        id: expect.any(String),
        jsonrpc: '2.0',
        method: 'chain_method',
        params: {},
      },
    };

    const response = {
      success: true,
    };

    const { method, params } = request.request;

    it('should call the listAccounts method and return the result', async () => {
      const client = new SnapControllerClient({
        controller: snapController as unknown as SnapController,
        snapId,
      });

      snapController.handleRequest.mockResolvedValue(response);
      const accounts = await client.submitRequest(method, params);
      expect(snapController.handleRequest).toHaveBeenCalledWith(request);
      expect(accounts).toStrictEqual(response);
    });

    it('should call the listAccounts method and return the result (withSnapId)', async () => {
      const client = new SnapControllerClient({
        controller: snapController as unknown as SnapController,
      });

      snapController.handleRequest.mockResolvedValue(response);
      const accounts = await client
        .withSnapId(snapId)
        .submitRequest(method, params);
      expect(snapController.handleRequest).toHaveBeenCalledWith(request);
      expect(accounts).toStrictEqual(response);
    });

    it('should call the default snapId value ("undefined")', async () => {
      const client = new SnapControllerClient({
        controller: snapController as unknown as SnapController,
      });

      snapController.handleRequest.mockResolvedValue(response);
      await client.submitRequest(method, params);
      expect(snapController.handleRequest).toHaveBeenCalledWith({
        ...request,
        snapId: 'undefined',
      });
    });
  });

  describe('getController', () => {
    it('should return the controller', () => {
      const client = new SnapControllerClient({
        controller: snapController as unknown as SnapController,
      });

      expect(client.getController()).toBe(snapController);
    });
  });
});
