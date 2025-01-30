import nock, { cleanAll } from 'nock';

import { TokenSearchApiService } from './token-search-api-service';
import { TEST_API_URLS } from '../test/constants';
import type { TokenSearchResponseItem } from '../types';

describe('TokenSearchApiService', () => {
  let service: TokenSearchApiService;
  const mockSearchResults: TokenSearchResponseItem[] = [];

  beforeEach(() => {
    service = new TokenSearchApiService(TEST_API_URLS.BASE_URL);
  });

  afterEach(() => {
    cleanAll();
  });

  describe('constructor', () => {
    it('should throw if baseUrl is empty', () => {
      expect(() => new TokenSearchApiService('')).toThrow(
        'Portfolio API URL is not set',
      );
    });
  });

  describe('searchTokens', () => {
    it('should return search results', async () => {
      nock(TEST_API_URLS.BASE_URL)
        .get('/tokens-search')
        .query({ query: 'ETH' })
        .reply(200, mockSearchResults);

      const results = await service.searchTokens({ query: 'ETH' });
      expect(results).toStrictEqual(mockSearchResults);
    });

    it('should handle chains parameter', async () => {
      nock(TEST_API_URLS.BASE_URL)
        .get('/tokens-search')
        .query({ chains: '1,137' })
        .reply(200, mockSearchResults);

      const results = await service.searchTokens({ chains: ['1', '137'] });
      expect(results).toStrictEqual(mockSearchResults);
    });

    it('should handle limit parameter', async () => {
      nock(TEST_API_URLS.BASE_URL)
        .get('/tokens-search')
        .query({ limit: '10' })
        .reply(200, mockSearchResults);

      const results = await service.searchTokens({ limit: '10' });
      expect(results).toStrictEqual(mockSearchResults);
    });

    it('should handle API errors', async () => {
      nock(TEST_API_URLS.BASE_URL)
        .get('/tokens-search')
        .reply(500, 'Server Error');

      await expect(service.searchTokens({})).rejects.toThrow(
        'Portfolio API request failed with status: 500',
      );
    });
  });
});
