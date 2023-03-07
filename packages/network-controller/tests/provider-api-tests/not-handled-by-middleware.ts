import { fill } from 'lodash';
import {
  ProviderType,
  withMockedCommunications,
  withNetworkClient,
} from './helpers';

type TestsForRpcMethodNotHandledByMiddlewareOptions = {
  providerType: ProviderType;
  numberOfParameters: number;
};

export const testsForRpcMethodNotHandledByMiddleware = (
  method: string,
  {
    providerType,
    numberOfParameters,
  }: TestsForRpcMethodNotHandledByMiddlewareOptions,
) => {
  it('attempts to pass the request off to the RPC endpoint', async () => {
    const request = {
      method,
      params: fill(Array(numberOfParameters), 'some value'),
    };
    const expectedResult = 'the result';

    await withMockedCommunications({ providerType }, async (comms) => {
      comms.mockNextBlockTrackerRequest({ blockNumber: '0x1' });
      comms.mockRpcCall({
        request,
        response: { result: expectedResult },
      });
      const actualResult = await withNetworkClient(
        { providerType },
        ({ makeRpcCall }) => makeRpcCall(request),
      );

      expect(actualResult).toStrictEqual(expectedResult);
    });
  });
};
