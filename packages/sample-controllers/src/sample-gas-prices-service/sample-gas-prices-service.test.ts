import nock from 'nock';

import { SampleGasPricesService } from './sample-gas-prices-service';

describe('SampleGasPricesService', () => {
  describe('fetchGasPrices', () => {
    it('returns a slightly cleaned up version of what the API returns', async () => {
      nock('https://example.com/gas-prices')
        .get('/0x1.json')
        .reply(200, {
          data: {
            low: 5,
            average: 10,
            high: 15,
          },
        });
      const gasPricesService = new SampleGasPricesService({ fetch });

      const gasPricesResponse = await gasPricesService.fetchGasPrices('0x1');

      expect(gasPricesResponse).toStrictEqual({
        low: 5,
        average: 10,
        high: 15,
      });
    });
  });
});
