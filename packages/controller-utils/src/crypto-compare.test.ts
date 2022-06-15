import nock from 'nock';
import { fetchExchangeRate } from './crypto-compare';

const cryptoCompareHost = 'https://min-api.cryptocompare.com';

describe('CryptoCompare', () => {
  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('should return CAD conversion rate', async () => {
    nock(cryptoCompareHost)
      .get('/data/price?fsym=ETH&tsyms=CAD')
      .reply(200, { CAD: 2000.42 });

    const { conversionRate } = await fetchExchangeRate('CAD', 'ETH');

    expect(conversionRate).toStrictEqual(2000.42);
  });

  it('should return CAD conversion rate given lower-cased currency', async () => {
    nock(cryptoCompareHost)
      .get('/data/price?fsym=ETH&tsyms=CAD')
      .reply(200, { CAD: 2000.42 });

    const { conversionRate } = await fetchExchangeRate('cad', 'ETH');

    expect(conversionRate).toStrictEqual(2000.42);
  });

  it('should return CAD conversion rate given lower-cased native currency', async () => {
    nock(cryptoCompareHost)
      .get('/data/price?fsym=ETH&tsyms=CAD')
      .reply(200, { CAD: 2000.42 });

    const { conversionRate } = await fetchExchangeRate('CAD', 'eth');

    expect(conversionRate).toStrictEqual(2000.42);
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

    expect(conversionRate).toStrictEqual(1000.42);
    expect(usdConversionRate).toStrictEqual(1000.42);
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

    expect(conversionRate).toStrictEqual(1000.42);
    expect(usdConversionRate).toStrictEqual(1000.42);
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

    expect(conversionRate).toStrictEqual(2000.42);
    expect(usdConversionRate).toStrictEqual(1000.42);
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
});
