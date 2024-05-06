import type { SnapController } from '@metamask/snaps-controllers';
import type { SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';

import { SnapHandlerClient } from './SnapHandlerClient';

describe('SnapHandlerClient', () => {
  const handleRequest = jest.fn();

  const snapId = 'local:localhost:3000' as SnapId;
  const snapController = {
    handleRequest,
  } as unknown as SnapController;

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

    it('should call a method and return the result', async () => {
      const client = new SnapHandlerClient({
        handler: snapController.handleRequest,
        snapId,
      });

      handleRequest.mockResolvedValue(response);
      const accounts = await client.submitRequest(method, params);
      expect(snapController.handleRequest).toHaveBeenCalledWith(request);
      expect(accounts).toStrictEqual(response);
    });

    it('should call a method and return the result (withSnapId)', async () => {
      const client = new SnapHandlerClient({
        handler: snapController.handleRequest,
      });

      handleRequest.mockResolvedValue(response);
      const accounts = await client
        .withSnapId(snapId)
        .submitRequest(method, params);
      expect(snapController.handleRequest).toHaveBeenCalledWith(request);
      expect(accounts).toStrictEqual(response);
    });

    it('should call the default snapId value ("undefined")', async () => {
      const client = new SnapHandlerClient({
        handler: snapController.handleRequest,
      });

      handleRequest.mockResolvedValue(response);
      await client.submitRequest(method, params);
      expect(handleRequest).toHaveBeenCalledWith({
        ...request,
        snapId: 'undefined',
      });
    });
  });
});
