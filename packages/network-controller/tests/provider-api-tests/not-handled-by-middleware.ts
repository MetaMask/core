import { fill } from 'lodash';

import type { ProviderType } from './helpers';
import { withMockedCommunications, withNetworkClient } from './helpers';

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
      // The first time a block-cacheable request is made, the latest block
      // number is retrieved through the block tracker first. It doesn't
      // matter what this is — it's just used as a cache key.
      comms.mockNextBlockTrackerRequest();
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
