import nock from 'nock';
import {
  EXTERNAL_GAS_PRICES_API_URL,
  fetchLegacyGasPriceEstimates,
} from './gas-util';

describe('gas utils', () => {
  describe('fetchLegacyGasPriceEstimates', () => {
    it('should fetch external gasPrices and return high/medium/low', async () => {
      const scope = nock(EXTERNAL_GAS_PRICES_API_URL)
        .get(/.+/u)
        .reply(200, {
          SafeGasPrice: '22',
          ProposeGasPrice: '25',
          FastGasPrice: '30',
        })
        .persist();
      const result = await fetchLegacyGasPriceEstimates();
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
