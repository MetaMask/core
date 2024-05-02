import { ChainRpcMethod } from '@metamask/chain-api';
import type { SnapController } from '@metamask/snaps-controllers';
import type { SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';
import type { Json } from '@metamask/utils';

import { SnapChainProviderClient } from './SnapChainProviderClient';
import { SnapControllerClient } from './SnapControllerClient';

describe('SnapChainProviderClient', () => {
  const snapId = 'local:localhost:3000' as SnapId;
  const snapController = {
    handleRequest: jest.fn(),
  };
  const snapClient = new SnapControllerClient({
    controller: snapController as unknown as SnapController,
    snapId,
  });

  const makeRequest = ({
    method,
    params,
  }: {
    method: string;
    params: Json;
  }) => {
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
  };

  describe('getBalances', () => {
    it('dispatch chain_getBalances', async () => {
      const client = new SnapChainProviderClient(snapClient);

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

      snapController.handleRequest.mockResolvedValue(response);
      const result = await client.getBalances(scope, [address], [asset]);
      expect(snapController.handleRequest).toHaveBeenCalledWith(request);
      expect(result).toStrictEqual(response);
    });
  });
});
