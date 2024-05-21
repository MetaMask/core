import type { SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';

import { SnapHandlerClient } from './SnapHandlerClient';

const snapId = 'local:localhost:3000' as SnapId;

describe('SnapHandlerClient', () => {
  describe('submitRequest', () => {
    const method = 'chain_method';
    const params = {};
    const request = {
      snapId,
      origin: 'metamask',
      handler: HandlerType.OnRpcRequest,
      request: {
        id: expect.any(String),
        jsonrpc: '2.0',
        method,
        params,
      },
    };
    const response = {
      success: true,
    };

    it('returns a result when a method is called', async () => {
      const handler = jest.fn();
      const client = new SnapHandlerClient({
        handler,
        snapId,
      });

      handler.mockResolvedValue(response);
      const accounts = await client.submitRequest(method, params);
      expect(handler).toHaveBeenCalledWith(request);
      expect(accounts).toStrictEqual(response);
    });
  });
});
