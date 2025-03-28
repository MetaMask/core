import nock from 'nock';
import { useFakeTimers } from 'sinon';

import {
  CodefiTokenPricesServiceV2,
  SUPPORTED_CHAIN_IDS,
  SUPPORTED_CURRENCIES,
  ZERO_ADDRESS,
  getNativeTokenAddress,
} from './codefi-v2';

// We're not customizing the default max delay
// The default can be found here: https://github.com/connor4312/cockatiel?tab=readme-ov-file#exponentialbackoff
const defaultMaxRetryDelay = 30_000;

describe('CodefiTokenPricesServiceV2', () => {
  describe('onBreak', () => {
    let clock: sinon.SinonFakeTimers;

    beforeEach(() => {
      clock = useFakeTimers({ now: Date.now() });
    });

    afterEach(() => {
      clock.restore();
    });

    it('registers a listener that is called upon break', async () => {
      const retries = 3;
      // Max consencutive failures is set to match number of calls in three update attempts (including retries)
      const maximumConsecutiveFailures = (1 + retries) * 3;
      // Initial interceptor for failing requests
      nock('https://price.api.cx.metamask.io')
        .get('/v2/chains/1/spot-prices')
        .query({
          tokenAddresses:
            '0x0000000000000000000000000000000000000000,0xAAA,0xBBB,0xCCC',
          vsCurrency: 'ETH',
          includeMarketData: 'true',
        })
        .times(maximumConsecutiveFailures)
        .replyWithError('Failed to fetch');
      // This interceptor should not be used
      nock('https://price.api.cx.metamask.io')
        .get('/v2/chains/1/spot-prices')
        .query({
          tokenAddresses:
            '0x0000000000000000000000000000000000000000,0xAAA,0xBBB,0xCCC',
          vsCurrency: 'ETH',
          includeMarketData: 'true',
        })
        .reply(200, {
          '0x0000000000000000000000000000000000000000': {
            price: 14,
            currency: 'ETH',
            pricePercentChange1d: 1,
            priceChange1d: 1,
            marketCap: 117219.99428314982,
            allTimeHigh: 0.00060467892389492,
            allTimeLow: 0.00002303954000865728,
            totalVolume: 5155.094053542448,
            high1d: 0.00008020715848194385,
            low1d: 0.00007792083564549064,
            circulatingSupply: 1494269733.9526057,
            dilutedMarketCap: 117669.5125951733,
            marketCapPercentChange1d: 0.76671,
            pricePercentChange1h: -1.0736342953259423,
            pricePercentChange7d: -7.351582573655089,
            pricePercentChange14d: -1.0799098946709822,
            pricePercentChange30d: -25.776321124365992,
            pricePercentChange200d: 46.091571238599165,
            pricePercentChange1y: -2.2992517267242754,
          },
          '0xaaa': {
            price: 148.17205755299946,
            currency: 'ETH',
            pricePercentChange1d: 1,
            priceChange1d: 1,
            marketCap: 117219.99428314982,
            allTimeHigh: 0.00060467892389492,
            allTimeLow: 0.00002303954000865728,
            totalVolume: 5155.094053542448,
            high1d: 0.00008020715848194385,
            low1d: 0.00007792083564549064,
            circulatingSupply: 1494269733.9526057,
            dilutedMarketCap: 117669.5125951733,
            marketCapPercentChange1d: 0.76671,
            pricePercentChange1h: -1.0736342953259423,
            pricePercentChange7d: -7.351582573655089,
            pricePercentChange14d: -1.0799098946709822,
            pricePercentChange30d: -25.776321124365992,
            pricePercentChange200d: 46.091571238599165,
            pricePercentChange1y: -2.2992517267242754,
          },
          '0xbbb': {
            price: 33689.98134554716,
            currency: 'ETH',
            pricePercentChange1d: 1,
            priceChange1d: 1,
            marketCap: 117219.99428314982,
            allTimeHigh: 0.00060467892389492,
            allTimeLow: 0.00002303954000865728,
            totalVolume: 5155.094053542448,
            high1d: 0.00008020715848194385,
            low1d: 0.00007792083564549064,
            circulatingSupply: 1494269733.9526057,
            dilutedMarketCap: 117669.5125951733,
            marketCapPercentChange1d: 0.76671,
            pricePercentChange1h: -1.0736342953259423,
            pricePercentChange7d: -7.351582573655089,
            pricePercentChange14d: -1.0799098946709822,
            pricePercentChange30d: -25.776321124365992,
            pricePercentChange200d: 46.091571238599165,
            pricePercentChange1y: -2.2992517267242754,
          },
          '0xccc': {
            price: 148.1344197578456,
            currency: 'ETH',
            pricePercentChange1d: 1,
            priceChange1d: 1,
            marketCap: 117219.99428314982,
            allTimeHigh: 0.00060467892389492,
            allTimeLow: 0.00002303954000865728,
            totalVolume: 5155.094053542448,
            high1d: 0.00008020715848194385,
            low1d: 0.00007792083564549064,
            circulatingSupply: 1494269733.9526057,
            dilutedMarketCap: 117669.5125951733,
            marketCapPercentChange1d: 0.76671,
            pricePercentChange1h: -1.0736342953259423,
            pricePercentChange7d: -7.351582573655089,
            pricePercentChange14d: -1.0799098946709822,
            pricePercentChange30d: -25.776321124365992,
            pricePercentChange200d: 46.091571238599165,
            pricePercentChange1y: -2.2992517267242754,
          },
        });
      const onBreakHandler = jest.fn();
      const service = new CodefiTokenPricesServiceV2({
        retries,
        maximumConsecutiveFailures,
        // Ensure break duration is well over the max delay for a single request, so that the
        // break doesn't end during a retry attempt
        circuitBreakDuration: defaultMaxRetryDelay * 10,
      });
      service.onBreak(onBreakHandler);
      const fetchTokenPrices = () =>
        service.fetchTokenPrices({
          chainId: '0x1',
          tokenAddresses: ['0xAAA', '0xBBB', '0xCCC'],
          currency: 'ETH',
        });
      expect(onBreakHandler).not.toHaveBeenCalled();

      // Initial three calls to exhaust maximum allowed failures
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for (const _retryAttempt of Array(retries).keys()) {
        // eslint-disable-next-line no-loop-func
        await expect(() =>
          fetchTokenPricesWithFakeTimers({
            clock,
            fetchTokenPrices,
            retries,
          }),
        ).rejects.toThrow('Failed to fetch');
      }

      expect(onBreakHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('onDegraded', () => {
    let clock: sinon.SinonFakeTimers;

    beforeEach(() => {
      clock = useFakeTimers({ now: Date.now() });
    });

    afterEach(() => {
      clock.restore();
    });

    it('calls onDegraded when request is slower than threshold', async () => {
      const degradedThreshold = 1000;
      const retries = 0;
      nock('https://price.api.cx.metamask.io')
        .get('/v2/chains/1/spot-prices')
        .query({
          tokenAddresses:
            '0x0000000000000000000000000000000000000000,0xAAA,0xBBB,0xCCC',
          vsCurrency: 'ETH',
          includeMarketData: 'true',
        })
        .delay(degradedThreshold * 2)
        .reply(200, {
          '0x0000000000000000000000000000000000000000': {
            price: 14,
            currency: 'ETH',
            pricePercentChange1d: 1,
            priceChange1d: 1,
          },
          '0xaaa': {
            price: 148.17205755299946,
            currency: 'ETH',
            pricePercentChange1d: 1,
            priceChange1d: 1,
          },
          '0xbbb': {
            price: 33689.98134554716,
            currency: 'ETH',
            pricePercentChange1d: 1,
            priceChange1d: 1,
          },
          '0xccc': {
            price: 148.1344197578456,
            currency: 'ETH',
            pricePercentChange1d: 1,
            priceChange1d: 1,
          },
        });
      const onDegradedHandler = jest.fn();
      const service = new CodefiTokenPricesServiceV2({
        degradedThreshold,
        retries,
      });
      service.onDegraded(onDegradedHandler);

      await fetchTokenPricesWithFakeTimers({
        clock,
        fetchTokenPrices: () =>
          service.fetchTokenPrices({
            chainId: '0x1',
            tokenAddresses: ['0xAAA', '0xBBB', '0xCCC'],
            currency: 'ETH',
          }),
        retries,
      });

      expect(onDegradedHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('fetchTokenPrices', () => {
    it('uses the /spot-prices endpoint of the Codefi Price API to gather prices for the given tokens', async () => {
      nock('https://price.api.cx.metamask.io')
        .get('/v2/chains/1/spot-prices')
        .query({
          tokenAddresses:
            '0x0000000000000000000000000000000000000000,0xAAA,0xBBB,0xCCC',
          vsCurrency: 'ETH',
          includeMarketData: 'true',
        })
        .reply(200, {
          '0x0000000000000000000000000000000000000000': {
            price: 14,
            currency: 'ETH',
            pricePercentChange1d: 1,
            priceChange1d: 1,
            marketCap: 117219.99428314982,
            allTimeHigh: 0.00060467892389492,
            allTimeLow: 0.00002303954000865728,
            totalVolume: 5155.094053542448,
            high1d: 0.00008020715848194385,
            low1d: 0.00007792083564549064,
            circulatingSupply: 1494269733.9526057,
            dilutedMarketCap: 117669.5125951733,
            marketCapPercentChange1d: 0.76671,
            pricePercentChange1h: -1.0736342953259423,
            pricePercentChange7d: -7.351582573655089,
            pricePercentChange14d: -1.0799098946709822,
            pricePercentChange30d: -25.776321124365992,
            pricePercentChange200d: 46.091571238599165,
            pricePercentChange1y: -2.2992517267242754,
          },
          '0xaaa': {
            price: 148.17205755299946,
            currency: 'ETH',
            pricePercentChange1d: 1,
            priceChange1d: 1,
            marketCap: 117219.99428314982,
            allTimeHigh: 0.00060467892389492,
            allTimeLow: 0.00002303954000865728,
            totalVolume: 5155.094053542448,
            high1d: 0.00008020715848194385,
            low1d: 0.00007792083564549064,
            circulatingSupply: 1494269733.9526057,
            dilutedMarketCap: 117669.5125951733,
            marketCapPercentChange1d: 0.76671,
            pricePercentChange1h: -1.0736342953259423,
            pricePercentChange7d: -7.351582573655089,
            pricePercentChange14d: -1.0799098946709822,
            pricePercentChange30d: -25.776321124365992,
            pricePercentChange200d: 46.091571238599165,
            pricePercentChange1y: -2.2992517267242754,
          },
          '0xbbb': {
            price: 33689.98134554716,
            currency: 'ETH',
            pricePercentChange1d: 1,
            priceChange1d: 1,
            marketCap: 117219.99428314982,
            allTimeHigh: 0.00060467892389492,
            allTimeLow: 0.00002303954000865728,
            totalVolume: 5155.094053542448,
            high1d: 0.00008020715848194385,
            low1d: 0.00007792083564549064,
            circulatingSupply: 1494269733.9526057,
            dilutedMarketCap: 117669.5125951733,
            marketCapPercentChange1d: 0.76671,
            pricePercentChange1h: -1.0736342953259423,
            pricePercentChange7d: -7.351582573655089,
            pricePercentChange14d: -1.0799098946709822,
            pricePercentChange30d: -25.776321124365992,
            pricePercentChange200d: 46.091571238599165,
            pricePercentChange1y: -2.2992517267242754,
          },
          '0xccc': {
            price: 148.1344197578456,
            currency: 'ETH',
            pricePercentChange1d: 1,
            priceChange1d: 1,
            marketCap: 117219.99428314982,
            allTimeHigh: 0.00060467892389492,
            allTimeLow: 0.00002303954000865728,
            totalVolume: 5155.094053542448,
            high1d: 0.00008020715848194385,
            low1d: 0.00007792083564549064,
            circulatingSupply: 1494269733.9526057,
            dilutedMarketCap: 117669.5125951733,
            marketCapPercentChange1d: 0.76671,
            pricePercentChange1h: -1.0736342953259423,
            pricePercentChange7d: -7.351582573655089,
            pricePercentChange14d: -1.0799098946709822,
            pricePercentChange30d: -25.776321124365992,
            pricePercentChange200d: 46.091571238599165,
            pricePercentChange1y: -2.2992517267242754,
          },
        });

      const marketDataTokensByAddress =
        await new CodefiTokenPricesServiceV2().fetchTokenPrices({
          chainId: '0x1',
          tokenAddresses: ['0xAAA', '0xBBB', '0xCCC'],
          currency: 'ETH',
        });

      expect(marketDataTokensByAddress).toStrictEqual({
        '0x0000000000000000000000000000000000000000': {
          tokenAddress: '0x0000000000000000000000000000000000000000',
          currency: 'ETH',
          pricePercentChange1d: 1,
          priceChange1d: 1,
          marketCap: 117219.99428314982,
          allTimeHigh: 0.00060467892389492,
          allTimeLow: 0.00002303954000865728,
          totalVolume: 5155.094053542448,
          high1d: 0.00008020715848194385,
          low1d: 0.00007792083564549064,
          price: 14,
          circulatingSupply: 1494269733.9526057,
          dilutedMarketCap: 117669.5125951733,
          marketCapPercentChange1d: 0.76671,
          pricePercentChange1h: -1.0736342953259423,
          pricePercentChange7d: -7.351582573655089,
          pricePercentChange14d: -1.0799098946709822,
          pricePercentChange30d: -25.776321124365992,
          pricePercentChange200d: 46.091571238599165,
          pricePercentChange1y: -2.2992517267242754,
        },
        '0xAAA': {
          tokenAddress: '0xAAA',
          currency: 'ETH',
          pricePercentChange1d: 1,
          priceChange1d: 1,
          marketCap: 117219.99428314982,
          allTimeHigh: 0.00060467892389492,
          allTimeLow: 0.00002303954000865728,
          totalVolume: 5155.094053542448,
          high1d: 0.00008020715848194385,
          low1d: 0.00007792083564549064,
          price: 148.17205755299946,
          circulatingSupply: 1494269733.9526057,
          dilutedMarketCap: 117669.5125951733,
          marketCapPercentChange1d: 0.76671,
          pricePercentChange1h: -1.0736342953259423,
          pricePercentChange7d: -7.351582573655089,
          pricePercentChange14d: -1.0799098946709822,
          pricePercentChange30d: -25.776321124365992,
          pricePercentChange200d: 46.091571238599165,
          pricePercentChange1y: -2.2992517267242754,
        },
        '0xBBB': {
          tokenAddress: '0xBBB',
          currency: 'ETH',
          pricePercentChange1d: 1,
          priceChange1d: 1,
          marketCap: 117219.99428314982,
          allTimeHigh: 0.00060467892389492,
          allTimeLow: 0.00002303954000865728,
          totalVolume: 5155.094053542448,
          high1d: 0.00008020715848194385,
          low1d: 0.00007792083564549064,
          price: 33689.98134554716,
          circulatingSupply: 1494269733.9526057,
          dilutedMarketCap: 117669.5125951733,
          marketCapPercentChange1d: 0.76671,
          pricePercentChange1h: -1.0736342953259423,
          pricePercentChange7d: -7.351582573655089,
          pricePercentChange14d: -1.0799098946709822,
          pricePercentChange30d: -25.776321124365992,
          pricePercentChange200d: 46.091571238599165,
          pricePercentChange1y: -2.2992517267242754,
        },
        '0xCCC': {
          tokenAddress: '0xCCC',
          currency: 'ETH',
          pricePercentChange1d: 1,
          priceChange1d: 1,
          marketCap: 117219.99428314982,
          allTimeHigh: 0.00060467892389492,
          allTimeLow: 0.00002303954000865728,
          totalVolume: 5155.094053542448,
          high1d: 0.00008020715848194385,
          low1d: 0.00007792083564549064,
          price: 148.1344197578456,
          circulatingSupply: 1494269733.9526057,
          dilutedMarketCap: 117669.5125951733,
          marketCapPercentChange1d: 0.76671,
          pricePercentChange1h: -1.0736342953259423,
          pricePercentChange7d: -7.351582573655089,
          pricePercentChange14d: -1.0799098946709822,
          pricePercentChange30d: -25.776321124365992,
          pricePercentChange200d: 46.091571238599165,
          pricePercentChange1y: -2.2992517267242754,
        },
      });
    });

    it('calls the /spot-prices endpoint using the correct native token address', async () => {
      const mockPriceAPI = nock('https://price.api.cx.metamask.io')
        .get('/v2/chains/137/spot-prices')
        .query({
          tokenAddresses: '0x0000000000000000000000000000000000001010',
          vsCurrency: 'ETH',
          includeMarketData: 'true',
        })
        .reply(200, {
          '0x0000000000000000000000000000000000001010': {
            price: 14,
            currency: 'ETH',
            pricePercentChange1d: 1,
            priceChange1d: 1,
            marketCap: 117219.99428314982,
            allTimeHigh: 0.00060467892389492,
            allTimeLow: 0.00002303954000865728,
            totalVolume: 5155.094053542448,
            high1d: 0.00008020715848194385,
            low1d: 0.00007792083564549064,
            circulatingSupply: 1494269733.9526057,
            dilutedMarketCap: 117669.5125951733,
            marketCapPercentChange1d: 0.76671,
            pricePercentChange1h: -1.0736342953259423,
            pricePercentChange7d: -7.351582573655089,
            pricePercentChange14d: -1.0799098946709822,
            pricePercentChange30d: -25.776321124365992,
            pricePercentChange200d: 46.091571238599165,
            pricePercentChange1y: -2.2992517267242754,
          },
        });

      const marketData =
        await new CodefiTokenPricesServiceV2().fetchTokenPrices({
          chainId: '0x89',
          tokenAddresses: [],
          currency: 'ETH',
        });

      expect(mockPriceAPI.isDone()).toBe(true);
      expect(
        marketData['0x0000000000000000000000000000000000001010'],
      ).toBeDefined();
    });

    it('should not include token price object for token address when token price in not included the response data', async () => {
      nock('https://price.api.cx.metamask.io')
        .get('/v2/chains/1/spot-prices')
        .query({
          tokenAddresses:
            '0x0000000000000000000000000000000000000000,0xAAA,0xBBB,0xCCC',
          vsCurrency: 'ETH',
          includeMarketData: 'true',
        })
        .reply(200, {
          '0x0000000000000000000000000000000000000000': {
            price: 14,
            currency: 'ETH',
            pricePercentChange1d: 1,
            priceChange1d: 1,
            marketCap: 117219.99428314982,
            allTimeHigh: 0.00060467892389492,
            allTimeLow: 0.00002303954000865728,
            totalVolume: 5155.094053542448,
            high1d: 0.00008020715848194385,
            low1d: 0.00007792083564549064,
            circulatingSupply: 1494269733.9526057,
            dilutedMarketCap: 117669.5125951733,
            marketCapPercentChange1d: 0.76671,
            pricePercentChange1h: -1.0736342953259423,
            pricePercentChange7d: -7.351582573655089,
            pricePercentChange14d: -1.0799098946709822,
            pricePercentChange30d: -25.776321124365992,
            pricePercentChange200d: 46.091571238599165,
            pricePercentChange1y: -2.2992517267242754,
          },
          '0xbbb': {
            price: 33689.98134554716,
            currency: 'ETH',
            pricePercentChange1d: 1,
            priceChange1d: 1,
            marketCap: 117219.99428314982,
            allTimeHigh: 0.00060467892389492,
            allTimeLow: 0.00002303954000865728,
            totalVolume: 5155.094053542448,
            high1d: 0.00008020715848194385,
            low1d: 0.00007792083564549064,
            circulatingSupply: 1494269733.9526057,
            dilutedMarketCap: 117669.5125951733,
            marketCapPercentChange1d: 0.76671,
            pricePercentChange1h: -1.0736342953259423,
            pricePercentChange7d: -7.351582573655089,
            pricePercentChange14d: -1.0799098946709822,
            pricePercentChange30d: -25.776321124365992,
            pricePercentChange200d: 46.091571238599165,
            pricePercentChange1y: -2.2992517267242754,
          },
          '0xccc': {
            price: 148.1344197578456,
            currency: 'ETH',
            pricePercentChange1d: 1,
            priceChange1d: 1,
            marketCap: 117219.99428314982,
            allTimeHigh: 0.00060467892389492,
            allTimeLow: 0.00002303954000865728,
            totalVolume: 5155.094053542448,
            high1d: 0.00008020715848194385,
            low1d: 0.00007792083564549064,
            circulatingSupply: 1494269733.9526057,
            dilutedMarketCap: 117669.5125951733,
            marketCapPercentChange1d: 0.76671,
            pricePercentChange1h: -1.0736342953259423,
            pricePercentChange7d: -7.351582573655089,
            pricePercentChange14d: -1.0799098946709822,
            pricePercentChange30d: -25.776321124365992,
            pricePercentChange200d: 46.091571238599165,
            pricePercentChange1y: -2.2992517267242754,
          },
        });

      const result = await new CodefiTokenPricesServiceV2().fetchTokenPrices({
        chainId: '0x1',
        tokenAddresses: ['0xAAA', '0xBBB', '0xCCC'],
        currency: 'ETH',
      });
      expect(result).toStrictEqual({
        '0x0000000000000000000000000000000000000000': {
          tokenAddress: '0x0000000000000000000000000000000000000000',
          currency: 'ETH',
          pricePercentChange1d: 1,
          priceChange1d: 1,
          marketCap: 117219.99428314982,
          allTimeHigh: 0.00060467892389492,
          allTimeLow: 0.00002303954000865728,
          totalVolume: 5155.094053542448,
          high1d: 0.00008020715848194385,
          low1d: 0.00007792083564549064,
          price: 14,
          circulatingSupply: 1494269733.9526057,
          dilutedMarketCap: 117669.5125951733,
          marketCapPercentChange1d: 0.76671,
          pricePercentChange1h: -1.0736342953259423,
          pricePercentChange7d: -7.351582573655089,
          pricePercentChange14d: -1.0799098946709822,
          pricePercentChange30d: -25.776321124365992,
          pricePercentChange200d: 46.091571238599165,
          pricePercentChange1y: -2.2992517267242754,
        },
        '0xBBB': {
          tokenAddress: '0xBBB',
          currency: 'ETH',
          pricePercentChange1d: 1,
          priceChange1d: 1,
          marketCap: 117219.99428314982,
          allTimeHigh: 0.00060467892389492,
          allTimeLow: 0.00002303954000865728,
          totalVolume: 5155.094053542448,
          high1d: 0.00008020715848194385,
          low1d: 0.00007792083564549064,
          price: 33689.98134554716,
          circulatingSupply: 1494269733.9526057,
          dilutedMarketCap: 117669.5125951733,
          marketCapPercentChange1d: 0.76671,
          pricePercentChange1h: -1.0736342953259423,
          pricePercentChange7d: -7.351582573655089,
          pricePercentChange14d: -1.0799098946709822,
          pricePercentChange30d: -25.776321124365992,
          pricePercentChange200d: 46.091571238599165,
          pricePercentChange1y: -2.2992517267242754,
        },
        '0xCCC': {
          tokenAddress: '0xCCC',
          currency: 'ETH',
          pricePercentChange1d: 1,
          priceChange1d: 1,
          marketCap: 117219.99428314982,
          allTimeHigh: 0.00060467892389492,
          allTimeLow: 0.00002303954000865728,
          totalVolume: 5155.094053542448,
          high1d: 0.00008020715848194385,
          low1d: 0.00007792083564549064,
          price: 148.1344197578456,
          circulatingSupply: 1494269733.9526057,
          dilutedMarketCap: 117669.5125951733,
          marketCapPercentChange1d: 0.76671,
          pricePercentChange1h: -1.0736342953259423,
          pricePercentChange7d: -7.351582573655089,
          pricePercentChange14d: -1.0799098946709822,
          pricePercentChange30d: -25.776321124365992,
          pricePercentChange200d: 46.091571238599165,
          pricePercentChange1y: -2.2992517267242754,
        },
      });
    });

    it('should not include token price object for token address when price is undefined for token response data', async () => {
      nock('https://price.api.cx.metamask.io')
        .get('/v2/chains/1/spot-prices')
        .query({
          tokenAddresses:
            '0x0000000000000000000000000000000000000000,0xAAA,0xBBB,0xCCC',
          vsCurrency: 'ETH',
          includeMarketData: 'true',
        })
        .reply(200, {
          '0xaaa': {},
          '0xbbb': {
            price: 33689.98134554716,
            pricePercentChange1d: 1,
            priceChange1d: 1,
            marketCap: 117219.99428314982,
            allTimeHigh: 0.00060467892389492,
            allTimeLow: 0.00002303954000865728,
            totalVolume: 5155.094053542448,
            high1d: 0.00008020715848194385,
            low1d: 0.00007792083564549064,
            circulatingSupply: 1494269733.9526057,
            dilutedMarketCap: 117669.5125951733,
            marketCapPercentChange1d: 0.76671,
            pricePercentChange1h: -1.0736342953259423,
            pricePercentChange7d: -7.351582573655089,
            pricePercentChange14d: -1.0799098946709822,
            pricePercentChange30d: -25.776321124365992,
            pricePercentChange200d: 46.091571238599165,
            pricePercentChange1y: -2.2992517267242754,
          },
          '0xccc': {
            price: 148.1344197578456,
            pricePercentChange1d: 1,
            priceChange1d: 1,
            marketCap: 117219.99428314982,
            allTimeHigh: 0.00060467892389492,
            allTimeLow: 0.00002303954000865728,
            totalVolume: 5155.094053542448,
            high1d: 0.00008020715848194385,
            low1d: 0.00007792083564549064,
            circulatingSupply: 1494269733.9526057,
            dilutedMarketCap: 117669.5125951733,
            marketCapPercentChange1d: 0.76671,
            pricePercentChange1h: -1.0736342953259423,
            pricePercentChange7d: -7.351582573655089,
            pricePercentChange14d: -1.0799098946709822,
            pricePercentChange30d: -25.776321124365992,
            pricePercentChange200d: 46.091571238599165,
            pricePercentChange1y: -2.2992517267242754,
          },
        });

      const result = await new CodefiTokenPricesServiceV2().fetchTokenPrices({
        chainId: '0x1',
        tokenAddresses: ['0xAAA', '0xBBB', '0xCCC'],
        currency: 'ETH',
      });

      expect(result).toStrictEqual({
        '0xAAA': {
          currency: 'ETH',
          tokenAddress: '0xAAA',
        },
        '0xBBB': {
          tokenAddress: '0xBBB',
          currency: 'ETH',
          pricePercentChange1d: 1,
          priceChange1d: 1,
          marketCap: 117219.99428314982,
          allTimeHigh: 0.00060467892389492,
          allTimeLow: 0.00002303954000865728,
          totalVolume: 5155.094053542448,
          high1d: 0.00008020715848194385,
          low1d: 0.00007792083564549064,
          price: 33689.98134554716,
          circulatingSupply: 1494269733.9526057,
          dilutedMarketCap: 117669.5125951733,
          marketCapPercentChange1d: 0.76671,
          pricePercentChange1h: -1.0736342953259423,
          pricePercentChange7d: -7.351582573655089,
          pricePercentChange14d: -1.0799098946709822,
          pricePercentChange30d: -25.776321124365992,
          pricePercentChange200d: 46.091571238599165,
          pricePercentChange1y: -2.2992517267242754,
        },
        '0xCCC': {
          tokenAddress: '0xCCC',
          currency: 'ETH',
          pricePercentChange1d: 1,
          priceChange1d: 1,
          marketCap: 117219.99428314982,
          allTimeHigh: 0.00060467892389492,
          allTimeLow: 0.00002303954000865728,
          totalVolume: 5155.094053542448,
          high1d: 0.00008020715848194385,
          low1d: 0.00007792083564549064,
          price: 148.1344197578456,
          circulatingSupply: 1494269733.9526057,
          dilutedMarketCap: 117669.5125951733,
          marketCapPercentChange1d: 0.76671,
          pricePercentChange1h: -1.0736342953259423,
          pricePercentChange7d: -7.351582573655089,
          pricePercentChange14d: -1.0799098946709822,
          pricePercentChange30d: -25.776321124365992,
          pricePercentChange200d: 46.091571238599165,
          pricePercentChange1y: -2.2992517267242754,
        },
      });
    });

    it('should correctly handle null market data for a token address', async () => {
      nock('https://price.api.cx.metamask.io')
        .get('/v2/chains/1/spot-prices')
        .query({
          tokenAddresses:
            '0x0000000000000000000000000000000000000000,0xAAA,0xBBB,0xCCC',
          vsCurrency: 'ETH',
          includeMarketData: 'true',
        })
        .reply(200, {
          '0x0000000000000000000000000000000000000000': {
            price: 14,
            currency: 'ETH',
          },
          '0xaaa': null, // Simulating API returning null for market data
          '0xbbb': {
            price: 33689.98134554716,
            currency: 'ETH',
          },
          '0xccc': {
            price: 148.1344197578456,
            currency: 'ETH',
          },
        });

      const result = await new CodefiTokenPricesServiceV2().fetchTokenPrices({
        chainId: '0x1',
        tokenAddresses: ['0xAAA', '0xBBB', '0xCCC'],
        currency: 'ETH',
      });

      expect(result).toStrictEqual({
        '0x0000000000000000000000000000000000000000': {
          tokenAddress: '0x0000000000000000000000000000000000000000',
          currency: 'ETH',
          price: 14,
        },
        '0xBBB': {
          tokenAddress: '0xBBB',
          currency: 'ETH',
          price: 33689.98134554716,
        },
        '0xCCC': {
          tokenAddress: '0xCCC',
          currency: 'ETH',
          price: 148.1344197578456,
        },
      });
    });

    it('throws if the request fails consistently', async () => {
      nock('https://price.api.cx.metamask.io')
        .get('/v2/chains/1/spot-prices')
        .query({
          tokenAddresses:
            '0x0000000000000000000000000000000000000000,0xAAA,0xBBB,0xCCC',
          vsCurrency: 'ETH',
          includeMarketData: 'true',
        })
        .replyWithError('Failed to fetch')
        .persist();

      await expect(
        new CodefiTokenPricesServiceV2().fetchTokenPrices({
          chainId: '0x1',
          tokenAddresses: ['0xAAA', '0xBBB', '0xCCC'],
          currency: 'ETH',
        }),
      ).rejects.toThrow('Failed to fetch');
    });

    it('throws if the initial request and all retries fail', async () => {
      const retries = 3;
      nock('https://price.api.cx.metamask.io')
        .get('/v2/chains/1/spot-prices')
        .query({
          tokenAddresses:
            '0x0000000000000000000000000000000000000000,0xAAA,0xBBB,0xCCC',
          vsCurrency: 'ETH',
          includeMarketData: 'true',
        })
        .times(1 + retries)
        .replyWithError('Failed to fetch');

      await expect(
        new CodefiTokenPricesServiceV2({ retries }).fetchTokenPrices({
          chainId: '0x1',
          tokenAddresses: ['0xAAA', '0xBBB', '0xCCC'],
          currency: 'ETH',
        }),
      ).rejects.toThrow('Failed to fetch');
    });

    it('succeeds if the last retry succeeds', async () => {
      const retries = 3;
      // Initial interceptor for failing requests
      nock('https://price.api.cx.metamask.io')
        .get('/v2/chains/1/spot-prices')
        .query({
          tokenAddresses:
            '0x0000000000000000000000000000000000000000,0xAAA,0xBBB,0xCCC',
          vsCurrency: 'ETH',
          includeMarketData: 'true',
        })
        .times(retries)
        .replyWithError('Failed to fetch');
      // Interceptor for successful request
      nock('https://price.api.cx.metamask.io')
        .get('/v2/chains/1/spot-prices')
        .query({
          tokenAddresses:
            '0x0000000000000000000000000000000000000000,0xAAA,0xBBB,0xCCC',
          vsCurrency: 'ETH',
          includeMarketData: 'true',
        })
        .reply(200, {
          '0x0000000000000000000000000000000000000000': {
            price: 14,
            currency: 'ETH',
            pricePercentChange1d: 1,
            priceChange1d: 1,
            marketCap: 117219.99428314982,
            allTimeHigh: 0.00060467892389492,
            allTimeLow: 0.00002303954000865728,
            totalVolume: 5155.094053542448,
            high1d: 0.00008020715848194385,
            low1d: 0.00007792083564549064,
            circulatingSupply: 1494269733.9526057,
            dilutedMarketCap: 117669.5125951733,
            marketCapPercentChange1d: 0.76671,
            pricePercentChange1h: -1.0736342953259423,
            pricePercentChange7d: -7.351582573655089,
            pricePercentChange14d: -1.0799098946709822,
            pricePercentChange30d: -25.776321124365992,
            pricePercentChange200d: 46.091571238599165,
            pricePercentChange1y: -2.2992517267242754,
          },
          '0xaaa': {
            price: 148.17205755299946,
            currency: 'ETH',
            pricePercentChange1d: 1,
            priceChange1d: 1,
            marketCap: 117219.99428314982,
            allTimeHigh: 0.00060467892389492,
            allTimeLow: 0.00002303954000865728,
            totalVolume: 5155.094053542448,
            high1d: 0.00008020715848194385,
            low1d: 0.00007792083564549064,
            circulatingSupply: 1494269733.9526057,
            dilutedMarketCap: 117669.5125951733,
            marketCapPercentChange1d: 0.76671,
            pricePercentChange1h: -1.0736342953259423,
            pricePercentChange7d: -7.351582573655089,
            pricePercentChange14d: -1.0799098946709822,
            pricePercentChange30d: -25.776321124365992,
            pricePercentChange200d: 46.091571238599165,
            pricePercentChange1y: -2.2992517267242754,
          },
          '0xbbb': {
            price: 33689.98134554716,
            currency: 'ETH',
            pricePercentChange1d: 1,
            priceChange1d: 1,
            marketCap: 117219.99428314982,
            allTimeHigh: 0.00060467892389492,
            allTimeLow: 0.00002303954000865728,
            totalVolume: 5155.094053542448,
            high1d: 0.00008020715848194385,
            low1d: 0.00007792083564549064,
            circulatingSupply: 1494269733.9526057,
            dilutedMarketCap: 117669.5125951733,
            marketCapPercentChange1d: 0.76671,
            pricePercentChange1h: -1.0736342953259423,
            pricePercentChange7d: -7.351582573655089,
            pricePercentChange14d: -1.0799098946709822,
            pricePercentChange30d: -25.776321124365992,
            pricePercentChange200d: 46.091571238599165,
            pricePercentChange1y: -2.2992517267242754,
          },
          '0xccc': {
            price: 148.1344197578456,
            currency: 'ETH',
            pricePercentChange1d: 1,
            priceChange1d: 1,
            marketCap: 117219.99428314982,
            allTimeHigh: 0.00060467892389492,
            allTimeLow: 0.00002303954000865728,
            totalVolume: 5155.094053542448,
            high1d: 0.00008020715848194385,
            low1d: 0.00007792083564549064,
            circulatingSupply: 1494269733.9526057,
            dilutedMarketCap: 117669.5125951733,
            marketCapPercentChange1d: 0.76671,
            pricePercentChange1h: -1.0736342953259423,
            pricePercentChange7d: -7.351582573655089,
            pricePercentChange14d: -1.0799098946709822,
            pricePercentChange30d: -25.776321124365992,
            pricePercentChange200d: 46.091571238599165,
            pricePercentChange1y: -2.2992517267242754,
          },
        });

      const marketDataTokensByAddress = await new CodefiTokenPricesServiceV2({
        retries,
      }).fetchTokenPrices({
        chainId: '0x1',
        tokenAddresses: ['0xAAA', '0xBBB', '0xCCC'],
        currency: 'ETH',
      });

      expect(marketDataTokensByAddress).toStrictEqual({
        '0x0000000000000000000000000000000000000000': {
          tokenAddress: '0x0000000000000000000000000000000000000000',
          currency: 'ETH',
          pricePercentChange1d: 1,
          priceChange1d: 1,
          marketCap: 117219.99428314982,
          allTimeHigh: 0.00060467892389492,
          allTimeLow: 0.00002303954000865728,
          totalVolume: 5155.094053542448,
          high1d: 0.00008020715848194385,
          low1d: 0.00007792083564549064,
          price: 14,
          circulatingSupply: 1494269733.9526057,
          dilutedMarketCap: 117669.5125951733,
          marketCapPercentChange1d: 0.76671,
          pricePercentChange1h: -1.0736342953259423,
          pricePercentChange7d: -7.351582573655089,
          pricePercentChange14d: -1.0799098946709822,
          pricePercentChange30d: -25.776321124365992,
          pricePercentChange200d: 46.091571238599165,
          pricePercentChange1y: -2.2992517267242754,
        },
        '0xAAA': {
          tokenAddress: '0xAAA',
          currency: 'ETH',
          pricePercentChange1d: 1,
          priceChange1d: 1,
          marketCap: 117219.99428314982,
          allTimeHigh: 0.00060467892389492,
          allTimeLow: 0.00002303954000865728,
          totalVolume: 5155.094053542448,
          high1d: 0.00008020715848194385,
          low1d: 0.00007792083564549064,
          price: 148.17205755299946,
          circulatingSupply: 1494269733.9526057,
          dilutedMarketCap: 117669.5125951733,
          marketCapPercentChange1d: 0.76671,
          pricePercentChange1h: -1.0736342953259423,
          pricePercentChange7d: -7.351582573655089,
          pricePercentChange14d: -1.0799098946709822,
          pricePercentChange30d: -25.776321124365992,
          pricePercentChange200d: 46.091571238599165,
          pricePercentChange1y: -2.2992517267242754,
        },
        '0xBBB': {
          tokenAddress: '0xBBB',
          currency: 'ETH',
          pricePercentChange1d: 1,
          priceChange1d: 1,
          marketCap: 117219.99428314982,
          allTimeHigh: 0.00060467892389492,
          allTimeLow: 0.00002303954000865728,
          totalVolume: 5155.094053542448,
          high1d: 0.00008020715848194385,
          low1d: 0.00007792083564549064,
          price: 33689.98134554716,
          circulatingSupply: 1494269733.9526057,
          dilutedMarketCap: 117669.5125951733,
          marketCapPercentChange1d: 0.76671,
          pricePercentChange1h: -1.0736342953259423,
          pricePercentChange7d: -7.351582573655089,
          pricePercentChange14d: -1.0799098946709822,
          pricePercentChange30d: -25.776321124365992,
          pricePercentChange200d: 46.091571238599165,
          pricePercentChange1y: -2.2992517267242754,
        },
        '0xCCC': {
          tokenAddress: '0xCCC',
          currency: 'ETH',
          pricePercentChange1d: 1,
          priceChange1d: 1,
          marketCap: 117219.99428314982,
          allTimeHigh: 0.00060467892389492,
          allTimeLow: 0.00002303954000865728,
          totalVolume: 5155.094053542448,
          high1d: 0.00008020715848194385,
          low1d: 0.00007792083564549064,
          price: 148.1344197578456,
          circulatingSupply: 1494269733.9526057,
          dilutedMarketCap: 117669.5125951733,
          marketCapPercentChange1d: 0.76671,
          pricePercentChange1h: -1.0736342953259423,
          pricePercentChange7d: -7.351582573655089,
          pricePercentChange14d: -1.0799098946709822,
          pricePercentChange30d: -25.776321124365992,
          pricePercentChange200d: 46.091571238599165,
          pricePercentChange1y: -2.2992517267242754,
        },
      });
    });

    describe('before circuit break', () => {
      let clock: sinon.SinonFakeTimers;

      beforeEach(() => {
        clock = useFakeTimers({ now: Date.now() });
      });

      afterEach(() => {
        clock.restore();
      });

      it('calls onDegraded when request is slower than threshold', async () => {
        const degradedThreshold = 1000;
        const retries = 0;
        nock('https://price.api.cx.metamask.io')
          .get('/v2/chains/1/spot-prices')
          .query({
            tokenAddresses:
              '0x0000000000000000000000000000000000000000,0xAAA,0xBBB,0xCCC',
            vsCurrency: 'ETH',
            includeMarketData: 'true',
          })
          .delay(degradedThreshold * 2)
          .reply(200, {
            '0x0000000000000000000000000000000000000000': {
              price: 14,
              currency: 'ETH',
              pricePercentChange1d: 1,
              priceChange1d: 1,
            },
            '0xaaa': {
              price: 148.17205755299946,
              currency: 'ETH',
              pricePercentChange1d: 1,
              priceChange1d: 1,
            },
            '0xbbb': {
              price: 33689.98134554716,
              currency: 'ETH',
              pricePercentChange1d: 1,
              priceChange1d: 1,
            },
            '0xccc': {
              price: 148.1344197578456,
              currency: 'ETH',
              pricePercentChange1d: 1,
              priceChange1d: 1,
            },
          });
        const onDegradedHandler = jest.fn();
        const service = new CodefiTokenPricesServiceV2({
          degradedThreshold,
          onDegraded: onDegradedHandler,
          retries,
        });

        await fetchTokenPricesWithFakeTimers({
          clock,
          fetchTokenPrices: () =>
            service.fetchTokenPrices({
              chainId: '0x1',
              tokenAddresses: ['0xAAA', '0xBBB', '0xCCC'],
              currency: 'ETH',
            }),
          retries,
        });

        expect(onDegradedHandler).toHaveBeenCalledTimes(1);
      });
    });

    describe('after circuit break', () => {
      let clock: sinon.SinonFakeTimers;

      beforeEach(() => {
        clock = useFakeTimers({ now: Date.now() });
      });

      afterEach(() => {
        clock.restore();
      });

      it('calls onBreak handler upon break', async () => {
        const retries = 3;
        // Max consencutive failures is set to match number of calls in three update attempts (including retries)
        const maximumConsecutiveFailures = (1 + retries) * 3;
        // Initial interceptor for failing requests
        nock('https://price.api.cx.metamask.io')
          .get('/v2/chains/1/spot-prices')
          .query({
            tokenAddresses:
              '0x0000000000000000000000000000000000000000,0xAAA,0xBBB,0xCCC',
            vsCurrency: 'ETH',
            includeMarketData: 'true',
          })
          .times(maximumConsecutiveFailures)
          .replyWithError('Failed to fetch');
        // This interceptor should not be used
        nock('https://price.api.cx.metamask.io')
          .get('/v2/chains/1/spot-prices')
          .query({
            tokenAddresses:
              '0x0000000000000000000000000000000000000000,0xAAA,0xBBB,0xCCC',
            vsCurrency: 'ETH',
            includeMarketData: 'true',
          })
          .reply(200, {
            '0x0000000000000000000000000000000000000000': {
              price: 14,
              currency: 'ETH',
              pricePercentChange1d: 1,
              priceChange1d: 1,
              marketCap: 117219.99428314982,
              allTimeHigh: 0.00060467892389492,
              allTimeLow: 0.00002303954000865728,
              totalVolume: 5155.094053542448,
              high1d: 0.00008020715848194385,
              low1d: 0.00007792083564549064,
              circulatingSupply: 1494269733.9526057,
              dilutedMarketCap: 117669.5125951733,
              marketCapPercentChange1d: 0.76671,
              pricePercentChange1h: -1.0736342953259423,
              pricePercentChange7d: -7.351582573655089,
              pricePercentChange14d: -1.0799098946709822,
              pricePercentChange30d: -25.776321124365992,
              pricePercentChange200d: 46.091571238599165,
              pricePercentChange1y: -2.2992517267242754,
            },
            '0xaaa': {
              price: 148.17205755299946,
              currency: 'ETH',
              pricePercentChange1d: 1,
              priceChange1d: 1,
              marketCap: 117219.99428314982,
              allTimeHigh: 0.00060467892389492,
              allTimeLow: 0.00002303954000865728,
              totalVolume: 5155.094053542448,
              high1d: 0.00008020715848194385,
              low1d: 0.00007792083564549064,
              circulatingSupply: 1494269733.9526057,
              dilutedMarketCap: 117669.5125951733,
              marketCapPercentChange1d: 0.76671,
              pricePercentChange1h: -1.0736342953259423,
              pricePercentChange7d: -7.351582573655089,
              pricePercentChange14d: -1.0799098946709822,
              pricePercentChange30d: -25.776321124365992,
              pricePercentChange200d: 46.091571238599165,
              pricePercentChange1y: -2.2992517267242754,
            },
            '0xbbb': {
              price: 33689.98134554716,
              currency: 'ETH',
              pricePercentChange1d: 1,
              priceChange1d: 1,
              marketCap: 117219.99428314982,
              allTimeHigh: 0.00060467892389492,
              allTimeLow: 0.00002303954000865728,
              totalVolume: 5155.094053542448,
              high1d: 0.00008020715848194385,
              low1d: 0.00007792083564549064,
              circulatingSupply: 1494269733.9526057,
              dilutedMarketCap: 117669.5125951733,
              marketCapPercentChange1d: 0.76671,
              pricePercentChange1h: -1.0736342953259423,
              pricePercentChange7d: -7.351582573655089,
              pricePercentChange14d: -1.0799098946709822,
              pricePercentChange30d: -25.776321124365992,
              pricePercentChange200d: 46.091571238599165,
              pricePercentChange1y: -2.2992517267242754,
            },
            '0xccc': {
              price: 148.1344197578456,
              currency: 'ETH',
              pricePercentChange1d: 1,
              priceChange1d: 1,
              marketCap: 117219.99428314982,
              allTimeHigh: 0.00060467892389492,
              allTimeLow: 0.00002303954000865728,
              totalVolume: 5155.094053542448,
              high1d: 0.00008020715848194385,
              low1d: 0.00007792083564549064,
              circulatingSupply: 1494269733.9526057,
              dilutedMarketCap: 117669.5125951733,
              marketCapPercentChange1d: 0.76671,
              pricePercentChange1h: -1.0736342953259423,
              pricePercentChange7d: -7.351582573655089,
              pricePercentChange14d: -1.0799098946709822,
              pricePercentChange30d: -25.776321124365992,
              pricePercentChange200d: 46.091571238599165,
              pricePercentChange1y: -2.2992517267242754,
            },
          });
        const onBreakHandler = jest.fn();
        const service = new CodefiTokenPricesServiceV2({
          retries,
          maximumConsecutiveFailures,
          onBreak: onBreakHandler,
          // Ensure break duration is well over the max delay for a single request, so that the
          // break doesn't end during a retry attempt
          circuitBreakDuration: defaultMaxRetryDelay * 10,
        });
        const fetchTokenPrices = () =>
          service.fetchTokenPrices({
            chainId: '0x1',
            tokenAddresses: ['0xAAA', '0xBBB', '0xCCC'],
            currency: 'ETH',
          });
        expect(onBreakHandler).not.toHaveBeenCalled();

        // Initial three calls to exhaust maximum allowed failures
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for (const _retryAttempt of Array(retries).keys()) {
          // eslint-disable-next-line no-loop-func
          await expect(() =>
            fetchTokenPricesWithFakeTimers({
              clock,
              fetchTokenPrices,
              retries,
            }),
          ).rejects.toThrow('Failed to fetch');
        }

        expect(onBreakHandler).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('validateChainIdSupported', () => {
    it.each(SUPPORTED_CHAIN_IDS)(
      'returns true if the given chain ID is %s',
      (chainId) => {
        expect(
          new CodefiTokenPricesServiceV2().validateChainIdSupported(chainId),
        ).toBe(true);
      },
    );

    it('returns false if the given chain ID is not one of the supported chain IDs', () => {
      expect(
        new CodefiTokenPricesServiceV2().validateChainIdSupported(
          '0x999999999999999',
        ),
      ).toBe(false);
    });
  });

  describe('validateCurrencySupported', () => {
    it.each(SUPPORTED_CURRENCIES)(
      'returns true if the given currency is %s',
      (currency) => {
        expect(
          new CodefiTokenPricesServiceV2().validateCurrencySupported(currency),
        ).toBe(true);
      },
    );

    it.each(SUPPORTED_CURRENCIES.map((currency) => currency.toLowerCase()))(
      'returns true if the given currency is %s',
      (currency) => {
        expect(
          new CodefiTokenPricesServiceV2().validateCurrencySupported(currency),
        ).toBe(true);
      },
    );

    it('returns false if the given currency is not one of the supported currencies', () => {
      expect(
        new CodefiTokenPricesServiceV2().validateCurrencySupported('LOL'),
      ).toBe(false);
    });
  });

  describe('getNativeTokenAddress', () => {
    it('should return unique native token address for MATIC', () => {
      expect(getNativeTokenAddress('0x89')).toBe(
        '0x0000000000000000000000000000000000001010',
      );
    });
    it('should return zero address for other chains', () => {
      (['0x1', '0x2', '0x1337'] as const).forEach((chainId) => {
        expect(getNativeTokenAddress(chainId)).toBe(ZERO_ADDRESS);
      });
    });
  });
});

/**
 * Calls the 'fetchTokenPrices' function while advancing the clock, allowing
 * the function to resolve.
 *
 * Fetching token rates is challenging in an environment with fake timers
 * because we're using a library that automatically retries failed requests,
 * which uses `setTimeout` internally. We have to advance the clock after the
 * update call starts but before awaiting the result, otherwise it never
 * resolves.
 *
 * @param args - Arguments
 * @param args.clock - The fake timers clock to advance.
 * @param args.fetchTokenPrices - The "fetchTokenPrices" function to call.
 * @param args.retries - The number of retries the fetch call is configured to make.
 */
async function fetchTokenPricesWithFakeTimers({
  clock,
  fetchTokenPrices,
  retries,
}: {
  clock: sinon.SinonFakeTimers;
  fetchTokenPrices: () => Promise<unknown>;
  retries: number;
}) {
  const pendingUpdate = fetchTokenPrices();
  pendingUpdate.catch(() => {
    // suppress Unhandled Promise error
  });

  // Advance timer enough to exceed max possible retry delay for initial call, and all
  // subsequent retries
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for (const _retryAttempt of Array(retries + 1).keys()) {
    await clock.tickAsync(defaultMaxRetryDelay);
  }

  return await pendingUpdate;
}
