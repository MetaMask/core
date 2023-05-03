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

/**
 * Defines tests which exercise the behavior exhibited by an RPC method that
 * is not handled specially by the network client middleware.
 *
 * @param method - The name of the RPC method under test.
 * @param additionalArgs - Additional arguments.
 * @param additionalArgs.providerType - The type of provider being tested;
 * either `infura` or `custom`.
 * @param additionalArgs.numberOfParameters - The number of parameters that this
 * RPC method takes.
 */
export function testsForRpcMethodNotHandledByMiddleware(
  method: string,
  {
    providerType,
    numberOfParameters,
  }: TestsForRpcMethodNotHandledByMiddlewareOptions,
) {
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
}
