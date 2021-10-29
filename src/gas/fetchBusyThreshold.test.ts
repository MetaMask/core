import { BN } from 'ethereumjs-util';
import nock from 'nock';
import fetchBusyThreshold from './fetchBusyThreshold';

describe('fetchBusyThreshold', () => {
  const url = 'http://network-status-info.endpoint';
  const clientId = '1';

  beforeEach(() => {
    nock(url, {
      reqheaders: {
        'X-Client-Id': clientId,
      },
    })
      .get('/')
      .reply(200, {
        busyThreshold: '1.00000000',
      });
  });

  it('makes a request to the given API and returns the WEI version of the busy threshold in the response', async () => {
    const busyThreshold = await fetchBusyThreshold(url, clientId);

    expect(busyThreshold.eq(new BN(1_000_000_000))).toBe(true);
  });
});
