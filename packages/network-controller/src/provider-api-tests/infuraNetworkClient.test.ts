import { withMockedCommunications, withNetworkClient } from "./helpers";

describe('infuraNetworkClient', () => {
  it('does something', async () => {
    await withMockedCommunications({ providerType: 'infura' }, async (comms) => {
      const request = { method: 'eth_balance' };

      comms.mockInitialGetBlockByNumber({ blockNumber: '0x100' });
      comms.mockNextBlockTrackerRequest({ blockNumber: '0x200' });
      comms.mockRpcCall({
        request,
        response: {
          result: {
            blockNumber: '0x300',
          },
        },
      });
      comms.mockNextBlockTrackerRequest({ blockNumber: '0x400' });

      await withNetworkClient(
        { providerType: 'infura' },
        async ({ makeRpcCall, /* blockTracker */ }) => {
          const result = await makeRpcCall(request);
          // expect(result).toBe(123);
          // expect(blockTracker.getCurrentBlock()).toStrictEqual('0x300');
        },
      );
    });
  });
});
