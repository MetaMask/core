import { buildFakeProvider } from '../tests/helpers';
import { getCurrentNetworkId } from './get-current-network-id';

describe('getCurrentNetworkId', () => {
  it('makes a request to the network for net_version, returning a successful response object on success', async () => {
    const provider = buildFakeProvider([
      {
        request: { method: 'net_version', params: [] },
        response: { result: '12345' },
      },
    ]);
    const getProvider = () => provider;

    const response = await getCurrentNetworkId(getProvider);

    expect(response).toStrictEqual({
      result: '12345',
    });
  });

  it('makes a request to the network for net_version, returning a failed response object on failure', async () => {
    const provider = buildFakeProvider([
      {
        request: { method: 'net_version', params: [] },
        response: { error: 'some error' },
      },
    ]);
    const getProvider = () => provider;

    const response = await getCurrentNetworkId(getProvider);

    expect(response).toStrictEqual({
      error: 'some error',
    });
  });
});
