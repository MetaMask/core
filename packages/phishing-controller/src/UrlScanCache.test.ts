import sinon from 'sinon';

import { RecommendedAction } from './types';
import { UrlScanCache } from './UrlScanCache';
import * as utils from './utils';

describe('UrlScanCache', () => {
  let clock: sinon.SinonFakeTimers;
  let updateStateSpy: sinon.SinonSpy;
  let cache: UrlScanCache;

  beforeEach(() => {
    clock = sinon.useFakeTimers();
    sinon
      .stub(utils, 'fetchTimeNow')
      .callsFake(() => Math.floor(Date.now() / 1000));
    updateStateSpy = sinon.spy();
    cache = new UrlScanCache({
      cacheTTL: 300, // 5 minutes
      maxCacheSize: 3,
      updateState: updateStateSpy,
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('constructor', () => {
    it('should initialize with empty cache when no initialCache provided', () => {
      const emptyCache = new UrlScanCache({
        // eslint-disable-next-line no-empty-function
        updateState: () => {},
      });
      expect(emptyCache.get('example.com')).toBeUndefined();
    });

    it('should initialize with provided initialCache data', () => {
      const now = Math.floor(Date.now() / 1000);
      const initialCache = {
        'example.com': {
          result: {
            domainName: 'example.com',
            recommendedAction: RecommendedAction.None,
          },
          timestamp: now,
        },
      };

      const cacheWithInitialData = new UrlScanCache({
        initialCache,
        // eslint-disable-next-line no-empty-function
        updateState: () => {},
      });

      expect(cacheWithInitialData.get('example.com')).toStrictEqual({
        domainName: 'example.com',
        recommendedAction: RecommendedAction.None,
      });
    });
  });

  describe('get', () => {
    it('returns undefined for non-existent entries', () => {
      expect(cache.get('example.com')).toBeUndefined();
    });

    it('returns valid entries', () => {
      const result = {
        domainName: 'example.com',
        recommendedAction: RecommendedAction.None,
      };

      cache.add('example.com', result);

      expect(cache.get('example.com')).toStrictEqual(result);
    });

    it('removes and returns undefined for expired entries', () => {
      const result = {
        domainName: 'example.com',
        recommendedAction: RecommendedAction.None,
      };

      cache.add('example.com', result);

      clock.tick(301 * 1000);

      expect(cache.get('example.com')).toBeUndefined();

      expect(updateStateSpy.callCount).toBe(2);
    });
  });

  describe('add', () => {
    it('adds entries to the cache', () => {
      const result = {
        domainName: 'example.com',
        recommendedAction: RecommendedAction.None,
      };

      cache.add('example.com', result);

      expect(cache.get('example.com')).toStrictEqual(result);
      expect(updateStateSpy.callCount).toBe(1);
    });

    it('evicts oldest entries when exceeding max size', () => {
      cache.add('domain1.com', {
        domainName: 'domain1.com',
        recommendedAction: RecommendedAction.None,
      });
      clock.tick(1000);
      cache.add('domain2.com', {
        domainName: 'domain2.com',
        recommendedAction: RecommendedAction.None,
      });
      clock.tick(1000);
      cache.add('domain3.com', {
        domainName: 'domain3.com',
        recommendedAction: RecommendedAction.None,
      });

      expect(cache.get('domain1.com')).toBeDefined();
      expect(cache.get('domain2.com')).toBeDefined();
      expect(cache.get('domain3.com')).toBeDefined();

      cache.add('domain4.com', {
        domainName: 'domain4.com',
        recommendedAction: RecommendedAction.None,
      });

      expect(cache.get('domain1.com')).toBeUndefined();
      expect(cache.get('domain2.com')).toBeDefined();
      expect(cache.get('domain3.com')).toBeDefined();
      expect(cache.get('domain4.com')).toBeDefined();
    });

    it('properly handles multiple evictions', () => {
      cache.setMaxSize(2);

      cache.add('domain1.com', {
        domainName: 'domain1.com',
        recommendedAction: RecommendedAction.None,
      });
      cache.add('domain2.com', {
        domainName: 'domain2.com',
        recommendedAction: RecommendedAction.None,
      });
      cache.add('domain3.com', {
        domainName: 'domain3.com',
        recommendedAction: RecommendedAction.None,
      });

      expect(cache.get('domain1.com')).toBeUndefined();
      expect(cache.get('domain2.com')).toBeDefined();
      expect(cache.get('domain3.com')).toBeDefined();
    });
  });

  describe('clear', () => {
    it('removes all entries from the cache', () => {
      cache.add('domain1.com', {
        domainName: 'domain1.com',
        recommendedAction: RecommendedAction.None,
      });
      cache.add('domain2.com', {
        domainName: 'domain2.com',
        recommendedAction: RecommendedAction.None,
      });

      cache.clear();

      expect(cache.get('domain1.com')).toBeUndefined();
      expect(cache.get('domain2.com')).toBeUndefined();

      expect(updateStateSpy.callCount).toBe(3);
    });
  });

  describe('setTTL', () => {
    it('updates the cache TTL', () => {
      const result = {
        domainName: 'example.com',
        recommendedAction: RecommendedAction.None,
      };

      cache.add('example.com', result);

      cache.setTTL(60);

      clock.tick(61 * 1000);

      expect(cache.get('example.com')).toBeUndefined();
    });
  });

  describe('setMaxSize', () => {
    it('updates the max cache size and evicts entries if needed', () => {
      cache.add('domain1.com', {
        domainName: 'domain1.com',
        recommendedAction: RecommendedAction.None,
      });
      clock.tick(1000);
      cache.add('domain2.com', {
        domainName: 'domain2.com',
        recommendedAction: RecommendedAction.None,
      });
      clock.tick(1000);
      cache.add('domain3.com', {
        domainName: 'domain3.com',
        recommendedAction: RecommendedAction.None,
      });

      cache.setMaxSize(2);

      expect(cache.get('domain1.com')).toBeUndefined();
      expect(cache.get('domain2.com')).toBeDefined();
      expect(cache.get('domain3.com')).toBeDefined();
    });
  });
});
