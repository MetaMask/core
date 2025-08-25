import { TESTNET } from '../../../tests/helpers';
import {
  withMockedCommunications,
  withNetworkClient,
} from '../../../tests/network-client/helpers';
import { NetworkClientType } from '../../types';

describe('createNetworkClient - methods not included in the Ethereum JSON-RPC spec - other methods', () => {
  for (const networkClientType of [
    NetworkClientType.Infura,
    NetworkClientType.Custom,
  ]) {
    describe('net_version', () => {
      const networkArgs = {
        providerType: networkClientType,
        infuraNetwork:
          networkClientType === NetworkClientType.Infura
            ? TESTNET.networkType
            : undefined,
      } as const;

      it('hits the RPC endpoint', async () => {
        await withMockedCommunications(networkArgs, async (comms) => {
          comms.mockRpcCall({
            request: { method: 'net_version' },
            response: { result: '1' },
          });

          const networkId = await withNetworkClient(
            networkArgs,
            ({ makeRpcCall }) => {
              return makeRpcCall({
                method: 'net_version',
              });
            },
          );

          expect(networkId).toBe('1');
        });
      });
    });
  }
});
