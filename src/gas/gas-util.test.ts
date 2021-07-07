import nock from 'nock';
import { fetchLegacyGasPriceEstimates } from './gas-util';

describe('gas utils', () => {
  describe('fetchLegacyGasPriceEstimates', () => {
    it('should fetch external gasPrices and return high/medium/low', async () => {
      const scope = nock('https://not-a-real-url/')
        .get(/.+/u)
        .reply(200, {
          SafeGasPrice: '22',
          ProposeGasPrice: '25',
          FastGasPrice: '30',
        })
        .persist();
      const result = await fetchLegacyGasPriceEstimates(
        'https://not-a-real-url/',
      );
      expect(result).toMatchObject({
        high: '30',
        medium: '25',
        low: '22',
      });
      scope.done();
      nock.cleanAll();
    });
  });
});
