import { ChainRpcMethod } from '@metamask/chain-api';
import type { SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';
import type { Json } from '@metamask/utils';

import { SnapChainProviderClient } from './SnapChainProviderClient';
import { SnapHandlerClient } from './SnapHandlerClient';

const snapId = 'local:localhost:3000' as SnapId;

/**
 * Builds a Snap chain API request.
 *
 * @param request - Chain API request object.
 * @param request.method - Chain API method to be called.
 * @param request.params - Chain API parameters.
 * @returns The Snap chain API request object.
 */
function makeRequest({ method, params }: { method: string; params: Json }) {
  return {
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
}

/**
 * Constructs a Snap handler client.
 *
 * @param handler - Snap request handler
 * @returns A Snap handler client.
 */
function getSnapHandlerClient(handler: jest.Mock) {
  return new SnapHandlerClient({
    handler,
    snapId,
  });
}

describe('SnapChainProviderClient', () => {
  describe('getBalances', () => {
    it('dispatch chain_getBalances', async () => {
      const handler = jest.fn();
      const client = new SnapChainProviderClient(getSnapHandlerClient(handler));
      const address = 'bc1qrp0yzgkf8rawkuvdlhnjfj2fnjwm0m8727kgah';
      const scope = 'bip122:000000000019d6689c085ae165831e93';
      const asset = `${scope}/asset:0`;
      const request = makeRequest({
        method: ChainRpcMethod.GetBalances,
        params: {
          scope,
          accounts: [address],
          assets: [asset],
        },
      });
      const response = {
        balances: {
          [address]: {
            [asset]: {
              amount: '70.02255139',
            },
          },
        },
      };
      handler.mockResolvedValue(response);

      const result = await client.getBalances(scope, [address], [asset]);

      expect(handler).toHaveBeenCalledWith(request);
      expect(result).toStrictEqual(response);
    });
  });
});
