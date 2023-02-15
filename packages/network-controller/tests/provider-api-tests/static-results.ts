import { fill } from 'lodash';
import {
  ProviderType,
  withMockedCommunications,
  withNetworkClient,
} from './helpers';

type TestsForRpcMethodWithStaticResult = {
  providerType: ProviderType;
  numberOfParameters: number;
  result: any;
};

export const testsForRpcMethodWithStaticResult = (
  method: string,
  {
    providerType,
    numberOfParameters,
    result,
  }: TestsForRpcMethodWithStaticResult,
) => {
  it('method is handled by middleware and the request is never sent to the network', async () => {
    const request = {
      method,
      params: fill(Array(numberOfParameters), 'some value'),
    };

    await withMockedCommunications({ providerType }, async (comms) => {
      comms.mockNextBlockTrackerRequest({ blockNumber: '0x1' });
      const actualResult = await withNetworkClient(
        { providerType },
        ({ makeRpcCall }) => makeRpcCall(request),
      );

      expect(actualResult).toStrictEqual(result);
    });
  });
};
