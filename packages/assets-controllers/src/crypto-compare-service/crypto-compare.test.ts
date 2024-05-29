import nock from 'nock';

import { fetchExchangeRate, fetchMultiExchangeRate } from './crypto-compare';

const cryptoCompareHost = 'https://min-api.cryptocompare.com';

describe('CryptoCompare', () => {
  it('should return CAD conversion rate', async () => {
    nock(cryptoCompareHost)
      .get('/data/price?fsym=ETH&tsyms=CAD')
      .reply(200, { CAD: 2000.42 });

    const { conversionRate } = await fetchExchangeRate('CAD', 'ETH');

    expect(conversionRate).toBe(2000.42);
  });

  it('should return CAD conversion rate given lower-cased currency', async () => {
    nock(cryptoCompareHost)
      .get('/data/price?fsym=ETH&tsyms=CAD')
      .reply(200, { CAD: 2000.42 });

    const { conversionRate } = await fetchExchangeRate('cad', 'ETH');

    expect(conversionRate).toBe(2000.42);
  });

  it('should return CAD conversion rate given lower-cased native currency', async () => {
    nock(cryptoCompareHost)
      .get('/data/price?fsym=ETH&tsyms=CAD')
      .reply(200, { CAD: 2000.42 });

    const { conversionRate } = await fetchExchangeRate('CAD', 'eth');

    expect(conversionRate).toBe(2000.42);
  });

  it('should not return USD conversion rate when fetching just CAD conversion rate', async () => {
    nock(cryptoCompareHost)
      .get('/data/price?fsym=ETH&tsyms=CAD')
      .reply(200, { CAD: 1000.42 });

    const { usdConversionRate } = await fetchExchangeRate('CAD', 'ETH');

    expect(usdConversionRate).toBeNaN();
  });

  it('should return USD conversion rate for USD even when includeUSD is disabled', async () => {
    nock(cryptoCompareHost)
      .get('/data/price?fsym=ETH&tsyms=USD')
      .reply(200, { USD: 1000.42 });

    const { conversionRate, usdConversionRate } = await fetchExchangeRate(
      'USD',
      'ETH',
      false,
    );

    expect(conversionRate).toBe(1000.42);
    expect(usdConversionRate).toBe(1000.42);
  });

  it('should return USD conversion rate for USD when includeUSD is enabled', async () => {
    nock(cryptoCompareHost)
      .get('/data/price?fsym=ETH&tsyms=USD')
      .reply(200, { USD: 1000.42 });

    const { conversionRate, usdConversionRate } = await fetchExchangeRate(
      'USD',
      'ETH',
      true,
    );

    expect(conversionRate).toBe(1000.42);
    expect(usdConversionRate).toBe(1000.42);
  });

  it('should return CAD and USD conversion rate', async () => {
    nock(cryptoCompareHost)
      .get('/data/price?fsym=ETH&tsyms=CAD,USD')
      .reply(200, { CAD: 2000.42, USD: 1000.42 });

    const { conversionRate, usdConversionRate } = await fetchExchangeRate(
      'CAD',
      'ETH',
      true,
    );

    expect(conversionRate).toBe(2000.42);
    expect(usdConversionRate).toBe(1000.42);
  });

  it('should throw if fetch throws', async () => {
    nock(cryptoCompareHost)
      .get('/data/price?fsym=ETH&tsyms=CAD')
      .replyWithError('Example network error');

    await expect(fetchExchangeRate('CAD', 'ETH')).rejects.toThrow(
      'Example network error',
    );
  });

  it('should throw if fetch returns unsuccessful response', async () => {
    nock(cryptoCompareHost).get('/data/price?fsym=ETH&tsyms=CAD').reply(500);

    await expect(fetchExchangeRate('CAD', 'ETH')).rejects.toThrow(
      `Fetch failed with status '500' for request '${cryptoCompareHost}/data/price?fsym=ETH&tsyms=CAD'`,
    );
  });

  it('should throw if conversion rate is invalid', async () => {
    nock(cryptoCompareHost)
      .get('/data/price?fsym=ETH&tsyms=CAD')
      .reply(200, { CAD: 'invalid' });

    await expect(fetchExchangeRate('CAD', 'ETH')).rejects.toThrow(
      'Invalid response for CAD: invalid',
    );
  });

  it('should throw if USD conversion rate is invalid', async () => {
    nock(cryptoCompareHost)
      .get('/data/price?fsym=ETH&tsyms=CAD,USD')
      .reply(200, { CAD: 2000.47, USD: 'invalid' });

    await expect(fetchExchangeRate('CAD', 'ETH', true)).rejects.toThrow(
      'Invalid response for usdConversionRate: invalid',
    );
  });

  it('should throw an error if either currency is invalid', async () => {
    nock(cryptoCompareHost)
      .get('/data/price?fsym=ETH&tsyms=EUABRT')
      .reply(200, {
        Response: 'Error',
        Message: 'Market does not exist for this coin pair',
      });

    await expect(fetchExchangeRate('EUABRT', 'ETH')).rejects.toThrow(
      'Market does not exist for this coin pair',
    );
  });

  it('should override native symbol when the CryptoCompare identifier is different', async () => {
    nock(cryptoCompareHost)
      .get('/data/price?fsym=MANTLE&tsyms=USD')
      .reply(200, { USD: 123 });

    const { conversionRate } = await fetchExchangeRate('USD', 'MNT');
    expect(conversionRate).toBe(123);
  });

  describe('fetchMultiExchangeRate', () => {
    it('should return CAD and USD conversion rate for BTC, ETH, and SOL', async () => {
      nock(cryptoCompareHost)
        .get('/data/pricemulti?fsyms=BTC,ETH,SOL&tsyms=CAD,USD')
        .reply(200, {
          BTC: { CAD: 2000.42, USD: 1000.42 },
          ETH: { CAD: 3000.42, USD: 2000.42 },
          SOL: { CAD: 4000.42, USD: 3000.42 },
        });

      const response = await fetchMultiExchangeRate(
        'CAD',
        ['BTC', 'ETH', 'SOL'],
        true,
      );

      expect(response).toStrictEqual({
        btc: { cad: 2000.42, usd: 1000.42 },
        eth: { cad: 3000.42, usd: 2000.42 },
        sol: { cad: 4000.42, usd: 3000.42 },
      });
    });

    it('should not return USD value if not requested', async () => {
      nock(cryptoCompareHost)
        .get('/data/pricemulti?fsyms=BTC,ETH,SOL&tsyms=EUR')
        .reply(200, {
          BTC: { EUR: 1000 },
          ETH: { EUR: 2000 },
          SOL: { EUR: 3000 },
        });

      // @ts-expect-error Testing the case where the USD rate is not included
      const response = await fetchMultiExchangeRate('EUR', [
        'BTC',
        'ETH',
        'SOL',
      ]);

      expect(response).toStrictEqual({
        btc: { eur: 1000 },
        eth: { eur: 2000 },
        sol: { eur: 3000 },
      });
    });
  });
});
