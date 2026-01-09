import { deriveStateFromMetadata } from '@metamask/base-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import type { RampsControllerMessenger } from './RampsController';
import { RampsController } from './RampsController';
import type { Country } from './RampsService';
import type {
  RampsServiceGetGeolocationAction,
  RampsServiceGetCountriesAction,
  RampsServiceGetEligibilityAction,
} from './RampsService-method-action-types';
import { RequestStatus, createCacheKey } from './RequestCache';

describe('RampsController', () => {
  describe('constructor', () => {
    it('uses default state when no state is provided', async () => {
      await withController(({ controller }) => {
        expect(controller.state).toMatchInlineSnapshot(`
          Object {
            "eligibility": null,
            "requests": Object {},
            "userRegion": null,
          }
        `);
      });
    });

    it('accepts initial state', async () => {
      const givenState = {
        userRegion: 'US',
      };

      await withController(
        { options: { state: givenState } },
        ({ controller }) => {
          expect(controller.state).toStrictEqual({
            eligibility: null,
            userRegion: 'US',
            requests: {},
          });
        },
      );
    });

    it('fills in missing initial state with defaults', async () => {
      await withController({ options: { state: {} } }, ({ controller }) => {
        expect(controller.state).toMatchInlineSnapshot(`
          Object {
            "eligibility": null,
            "requests": Object {},
            "userRegion": null,
          }
        `);
      });
    });

    it('always resets requests cache on initialization', async () => {
      const givenState = {
        userRegion: 'US',
        requests: {
          someKey: {
            status: RequestStatus.SUCCESS,
            data: 'cached',
            error: null,
            timestamp: Date.now(),
            lastFetchedAt: Date.now(),
          },
        },
      };

      await withController(
        { options: { state: givenState } },
        ({ controller }) => {
          expect(controller.state.requests).toStrictEqual({});
        },
      );
    });
  });

  describe('metadata', () => {
    it('includes expected state in debug snapshots', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'includeInDebugSnapshot',
          ),
        ).toMatchInlineSnapshot(`
          Object {
            "eligibility": null,
            "requests": Object {},
            "userRegion": null,
          }
        `);
      });
    });

    it('includes expected state in state logs', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'includeInStateLogs',
          ),
        ).toMatchInlineSnapshot(`
          Object {
            "eligibility": null,
            "userRegion": null,
          }
        `);
      });
    });

    it('persists expected state', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'persist',
          ),
        ).toMatchInlineSnapshot(`
          Object {
            "eligibility": null,
            "userRegion": null,
          }
        `);
      });
    });

    it('exposes expected state to UI', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'usedInUi',
          ),
        ).toMatchInlineSnapshot(`
          Object {
            "eligibility": null,
            "requests": Object {},
            "userRegion": null,
          }
        `);
      });
    });
  });

  describe('updateUserRegion', () => {
    it('updates user region state when region is fetched', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        rootMessenger.registerActionHandler(
          'RampsService:getGeolocation',
          async () => 'US-CA',
        );
        rootMessenger.registerActionHandler(
          'RampsService:getEligibility',
          async () => ({
            aggregator: true,
            deposit: true,
            global: true,
          }),
        );

        await controller.updateUserRegion();

        expect(controller.state.userRegion).toBe('us-ca');
      });
    });

    it('stores request state in cache', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        rootMessenger.registerActionHandler(
          'RampsService:getGeolocation',
          async () => 'US',
        );
        rootMessenger.registerActionHandler(
          'RampsService:getEligibility',
          async () => ({
            aggregator: true,
            deposit: true,
            global: true,
          }),
        );

        await controller.updateUserRegion();

        const cacheKey = createCacheKey('updateUserRegion', []);
        const requestState = controller.state.requests[cacheKey];

        expect(requestState).toBeDefined();
        expect(requestState?.status).toBe(RequestStatus.SUCCESS);
        expect(requestState?.data).toBe('US');
        expect(requestState?.error).toBeNull();
      });
    });

    it('returns cached result on subsequent calls within TTL', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        let callCount = 0;
        rootMessenger.registerActionHandler(
          'RampsService:getGeolocation',
          async () => {
            callCount += 1;
            return 'US';
          },
        );
        rootMessenger.registerActionHandler(
          'RampsService:getEligibility',
          async () => ({
            aggregator: true,
            deposit: true,
            global: true,
          }),
        );

        await controller.updateUserRegion();
        await controller.updateUserRegion();

        expect(callCount).toBe(1);
      });
    });

    it('makes a new request when forceRefresh is true', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        let callCount = 0;
        rootMessenger.registerActionHandler(
          'RampsService:getGeolocation',
          async () => {
            callCount += 1;
            return 'US';
          },
        );
        rootMessenger.registerActionHandler(
          'RampsService:getEligibility',
          async () => ({
            aggregator: true,
            deposit: true,
            global: true,
          }),
        );

        await controller.updateUserRegion();
        await controller.updateUserRegion({ forceRefresh: true });

        expect(callCount).toBe(2);
      });
    });
  });

  describe('executeRequest', () => {
    it('deduplicates concurrent requests with the same cache key', async () => {
      await withController(async ({ controller }) => {
        let callCount = 0;
        const fetcher = async (): Promise<string> => {
          callCount += 1;
          await new Promise((resolve) => setTimeout(resolve, 10));
          return 'result';
        };

        const [result1, result2] = await Promise.all([
          controller.executeRequest('test-key', fetcher),
          controller.executeRequest('test-key', fetcher),
        ]);

        expect(callCount).toBe(1);
        expect(result1).toBe('result');
        expect(result2).toBe('result');
      });
    });

    it('stores error state when request fails', async () => {
      await withController(async ({ controller }) => {
        const fetcher = async (): Promise<string> => {
          throw new Error('Test error');
        };

        await expect(
          controller.executeRequest('error-key', fetcher),
        ).rejects.toThrow('Test error');

        const requestState = controller.state.requests['error-key'];
        expect(requestState?.status).toBe(RequestStatus.ERROR);
        expect(requestState?.error).toBe('Test error');
      });
    });

    it('stores fallback error message when error has no message', async () => {
      await withController(async ({ controller }) => {
        const fetcher = async (): Promise<string> => {
          const error = new Error();
          Object.defineProperty(error, 'message', { value: undefined });
          throw error;
        };

        await expect(
          controller.executeRequest('error-key-no-message', fetcher),
        ).rejects.toThrow(Error);

        const requestState = controller.state.requests['error-key-no-message'];
        expect(requestState?.status).toBe(RequestStatus.ERROR);
        expect(requestState?.error).toBe('Unknown error');
      });
    });

    it('sets loading state while request is in progress', async () => {
      await withController(async ({ controller }) => {
        let resolvePromise: (value: string) => void;
        const fetcher = async (): Promise<string> => {
          return new Promise<string>((resolve) => {
            resolvePromise = resolve;
          });
        };

        const requestPromise = controller.executeRequest(
          'loading-key',
          fetcher,
        );

        expect(controller.state.requests['loading-key']?.status).toBe(
          RequestStatus.LOADING,
        );

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        resolvePromise!('done');
        await requestPromise;

        expect(controller.state.requests['loading-key']?.status).toBe(
          RequestStatus.SUCCESS,
        );
      });
    });
  });

  describe('abortRequest', () => {
    it('aborts a pending request', async () => {
      await withController(async ({ controller }) => {
        let wasAborted = false;
        const fetcher = async (signal: AbortSignal): Promise<string> => {
          return new Promise<string>((_resolve, reject) => {
            signal.addEventListener('abort', () => {
              wasAborted = true;
              reject(new Error('Aborted'));
            });
          });
        };

        const requestPromise = controller.executeRequest('abort-key', fetcher);
        const didAbort = controller.abortRequest('abort-key');

        expect(didAbort).toBe(true);
        await expect(requestPromise).rejects.toThrow('Aborted');
        expect(wasAborted).toBe(true);
      });
    });

    it('returns false if no pending request exists', async () => {
      await withController(({ controller }) => {
        const didAbort = controller.abortRequest('non-existent-key');
        expect(didAbort).toBe(false);
      });
    });

    it('clears LOADING state from requests cache when aborted', async () => {
      await withController(async ({ controller }) => {
        const fetcher = async (signal: AbortSignal): Promise<string> => {
          return new Promise<string>((_resolve, reject) => {
            signal.addEventListener('abort', () => {
              reject(new Error('Aborted'));
            });
          });
        };

        const requestPromise = controller.executeRequest('abort-key', fetcher);

        expect(controller.state.requests['abort-key']?.status).toBe(
          RequestStatus.LOADING,
        );

        controller.abortRequest('abort-key');

        expect(controller.state.requests['abort-key']).toBeUndefined();

        await expect(requestPromise).rejects.toThrow('Aborted');
      });
    });

    it('throws if fetch completes after abort signal is triggered', async () => {
      await withController(async ({ controller }) => {
        const fetcher = async (signal: AbortSignal): Promise<string> => {
          // Simulate: abort is called, but fetcher still returns successfully
          signal.dispatchEvent(new Event('abort'));
          Object.defineProperty(signal, 'aborted', { value: true });
          return 'completed-after-abort';
        };

        const requestPromise = controller.executeRequest(
          'abort-after-success-key',
          fetcher,
        );

        await expect(requestPromise).rejects.toThrow('Request was aborted');
      });
    });

    it('does not delete newer pending request when aborted request settles', async () => {
      await withController(async ({ controller }) => {
        let requestASettled = false;
        let requestBCallCount = 0;

        // Request A: will be aborted but takes time to settle
        const fetcherA = async (signal: AbortSignal): Promise<string> => {
          return new Promise<string>((_resolve, reject) => {
            signal.addEventListener('abort', () => {
              // Simulate async cleanup delay before rejecting
              setTimeout(() => {
                requestASettled = true;
                reject(new Error('Request A aborted'));
              }, 50);
            });
          });
        };

        // Request B: normal request that should deduplicate correctly
        const fetcherB = async (): Promise<string> => {
          requestBCallCount += 1;
          await new Promise((resolve) => setTimeout(resolve, 10));
          return 'result-b';
        };

        // Start request A
        const promiseA = controller.executeRequest('race-key', fetcherA);

        // Abort request A (removes from pendingRequests, triggers abort)
        controller.abortRequest('race-key');

        // Start request B with the same key before request A settles
        expect(requestASettled).toBe(false);
        const promiseB = controller.executeRequest('race-key', fetcherB);

        // Start request C with same key - should deduplicate with B
        const promiseC = controller.executeRequest('race-key', fetcherB);

        // Wait for request A to finish settling (its finally block runs)
        await expect(promiseA).rejects.toThrow('Request A aborted');
        expect(requestASettled).toBe(true);

        // Requests B and C should still work correctly (deduplication intact)
        const [resultB, resultC] = await Promise.all([promiseB, promiseC]);

        expect(resultB).toBe('result-b');
        expect(resultC).toBe('result-b');
        expect(requestBCallCount).toBe(1);
      });
    });
  });

  describe('cache eviction', () => {
    it('evicts oldest entries when cache exceeds max size', async () => {
      await withController(
        { options: { requestCacheMaxSize: 3 } },
        async ({ controller }) => {
          await controller.executeRequest('key1', async () => 'data1');
          await new Promise((resolve) => setTimeout(resolve, 5));
          await controller.executeRequest('key2', async () => 'data2');
          await new Promise((resolve) => setTimeout(resolve, 5));
          await controller.executeRequest('key3', async () => 'data3');
          await new Promise((resolve) => setTimeout(resolve, 5));
          await controller.executeRequest('key4', async () => 'data4');

          const keys = Object.keys(controller.state.requests);
          expect(keys).toHaveLength(3);
          expect(keys).not.toContain('key1');
          expect(keys).toContain('key2');
          expect(keys).toContain('key3');
          expect(keys).toContain('key4');
        },
      );
    });

    it('handles entries with missing timestamps during eviction', async () => {
      await withController(
        { options: { requestCacheMaxSize: 2 } },
        async ({ controller }) => {
          // Manually inject cache entries with missing timestamps
          // This shouldn't happen in normal usage but tests the defensive fallback
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (controller as any).update((state: any) => {
            state.requests['no-timestamp-1'] = {
              status: RequestStatus.SUCCESS,
              data: 'old-data-1',
              error: null,
            };
            state.requests['no-timestamp-2'] = {
              status: RequestStatus.SUCCESS,
              data: 'old-data-2',
              error: null,
            };
            state.requests['with-timestamp'] = {
              status: RequestStatus.SUCCESS,
              data: 'newer-data',
              error: null,
              timestamp: Date.now(),
              lastFetchedAt: Date.now(),
            };
          });

          // Adding a fourth entry should trigger eviction of 2 entries
          await controller.executeRequest('key4', async () => 'data4');

          const keys = Object.keys(controller.state.requests);
          expect(keys).toHaveLength(2);
          // Entries without timestamps should be evicted first (treated as timestamp 0)
          expect(keys).not.toContain('no-timestamp-1');
          expect(keys).not.toContain('no-timestamp-2');
          expect(keys).toContain('with-timestamp');
          expect(keys).toContain('key4');
        },
      );
    });
  });

  describe('getRequestState', () => {
    it('returns the cached request state', async () => {
      await withController(async ({ controller }) => {
        await controller.executeRequest('state-key', async () => 'data');

        const state = controller.getRequestState('state-key');
        expect(state?.status).toBe(RequestStatus.SUCCESS);
        expect(state?.data).toBe('data');
      });
    });

    it('returns undefined for non-existent cache key', async () => {
      await withController(({ controller }) => {
        const state = controller.getRequestState('non-existent');
        expect(state).toBeUndefined();
      });
    });
  });

  describe('getCountries', () => {
    const mockCountries: Country[] = [
      {
        isoCode: 'US',
        flag: '🇺🇸',
        name: 'United States of America',
        phone: {
          prefix: '+1',
          placeholder: '(555) 123-4567',
          template: '(XXX) XXX-XXXX',
        },
        currency: 'USD',
        supported: true,
        recommended: true,
      },
      {
        isoCode: 'AT',
        flag: '🇦🇹',
        name: 'Austria',
        phone: {
          prefix: '+43',
          placeholder: '660 1234567',
          template: 'XXX XXXXXXX',
        },
        currency: 'EUR',
        supported: true,
      },
    ];

    it('fetches countries from the service', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        rootMessenger.registerActionHandler(
          'RampsService:getCountries',
          async () => mockCountries,
        );

        const countries = await controller.getCountries('buy');

        expect(countries).toMatchInlineSnapshot(`
          Array [
            Object {
              "currency": "USD",
              "flag": "🇺🇸",
              "isoCode": "US",
              "name": "United States of America",
              "phone": Object {
                "placeholder": "(555) 123-4567",
                "prefix": "+1",
                "template": "(XXX) XXX-XXXX",
              },
              "recommended": true,
              "supported": true,
            },
            Object {
              "currency": "EUR",
              "flag": "🇦🇹",
              "isoCode": "AT",
              "name": "Austria",
              "phone": Object {
                "placeholder": "660 1234567",
                "prefix": "+43",
                "template": "XXX XXXXXXX",
              },
              "supported": true,
            },
          ]
        `);
      });
    });

    it('caches countries response', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        let callCount = 0;
        rootMessenger.registerActionHandler(
          'RampsService:getCountries',
          async () => {
            callCount += 1;
            return mockCountries;
          },
        );

        await controller.getCountries('buy');
        await controller.getCountries('buy');

        expect(callCount).toBe(1);
      });
    });

    it('fetches countries with sell action', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        let receivedAction: string | undefined;
        rootMessenger.registerActionHandler(
          'RampsService:getCountries',
          async (action) => {
            receivedAction = action;
            return mockCountries;
          },
        );

        await controller.getCountries('sell');

        expect(receivedAction).toBe('sell');
      });
    });

    it('uses default buy action when no argument is provided', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        let receivedAction: string | undefined;
        rootMessenger.registerActionHandler(
          'RampsService:getCountries',
          async (action) => {
            receivedAction = action;
            return mockCountries;
          },
        );

        await controller.getCountries();

        expect(receivedAction).toBe('buy');
      });
    });
  });

  describe('updateEligibility', () => {
    it('fetches and stores eligibility for a region', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        const mockEligibility = {
          aggregator: true,
          deposit: true,
          global: true,
        };

        rootMessenger.registerActionHandler(
          'RampsService:getEligibility',
          async () => mockEligibility,
        );

        expect(controller.state.eligibility).toBeNull();

        const eligibility = await controller.updateEligibility('fr');

        expect(controller.state.eligibility).toStrictEqual(mockEligibility);
        expect(eligibility).toStrictEqual(mockEligibility);
      });
    });

    it('handles state codes in ISO format', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        const mockEligibility = {
          aggregator: true,
          deposit: false,
          global: true,
        };

        rootMessenger.registerActionHandler(
          'RampsService:getEligibility',
          async (isoCode) => {
            expect(isoCode).toBe('us-ny');
            return mockEligibility;
          },
        );

        await controller.updateEligibility('us-ny');

        expect(controller.state.eligibility).toStrictEqual(mockEligibility);
      });
    });

    it('normalizes isoCode case for cache key consistency', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        const mockEligibility = {
          aggregator: true,
          deposit: true,
          global: true,
        };

        let callCount = 0;
        rootMessenger.registerActionHandler(
          'RampsService:getEligibility',
          async (isoCode) => {
            callCount += 1;
            expect(isoCode).toBe('fr');
            return mockEligibility;
          },
        );

        await controller.updateEligibility('FR');
        expect(callCount).toBe(1);

        const eligibility1 = await controller.updateEligibility('fr');
        expect(callCount).toBe(1);
        expect(eligibility1).toStrictEqual(mockEligibility);

        const eligibility2 = await controller.updateEligibility('Fr');
        expect(callCount).toBe(1);
        expect(eligibility2).toStrictEqual(mockEligibility);

        const cacheKey = createCacheKey('updateEligibility', ['fr']);
        const requestState = controller.getRequestState(cacheKey);
        expect(requestState?.status).toBe('success');
      });
    });
  });

  describe('init', () => {
    it('initializes controller by fetching user region', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        rootMessenger.registerActionHandler(
          'RampsService:getGeolocation',
          async () => 'US',
        );
        rootMessenger.registerActionHandler(
          'RampsService:getEligibility',
          async () => ({
            aggregator: true,
            deposit: true,
            global: true,
          }),
        );

        await controller.init();

        expect(controller.state.userRegion).toBe('us');
      });
    });

    it('handles initialization failure gracefully', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        rootMessenger.registerActionHandler(
          'RampsService:getGeolocation',
          async () => {
            throw new Error('Network error');
          },
        );

        await controller.init();

        expect(controller.state.userRegion).toBeNull();
      });
    });
  });

  describe('setUserRegion', () => {
    it('sets user region manually and fetches eligibility', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        rootMessenger.registerActionHandler(
          'RampsService:getEligibility',
          async (isoCode) => {
            expect(isoCode).toBe('us-ca');
            return {
              aggregator: true,
              deposit: true,
              global: true,
            };
          },
        );

        await controller.setUserRegion('US-CA');

        expect(controller.state.userRegion).toBe('us-ca');
        expect(controller.state.eligibility).toStrictEqual({
          aggregator: true,
          deposit: true,
          global: true,
        });
      });
    });

    it('updates user region state and clears eligibility when eligibility fetch fails', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        rootMessenger.registerActionHandler(
          'RampsService:getEligibility',
          async () => {
            throw new Error('Eligibility API error');
          },
        );

        expect(controller.state.userRegion).toBeNull();
        expect(controller.state.eligibility).toBeNull();

        await expect(controller.setUserRegion('US-CA')).rejects.toThrow(
          'Eligibility API error',
        );

        expect(controller.state.userRegion).toBe('us-ca');
        expect(controller.state.eligibility).toBeNull();
      });
    });

    it('clears stale eligibility when new user region is set but eligibility fails', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        const usEligibility = {
          aggregator: true,
          deposit: true,
          global: true,
        };

        rootMessenger.registerActionHandler(
          'RampsService:getEligibility',
          async (isoCode) => {
            if (isoCode === 'us') {
              return usEligibility;
            }
            throw new Error('Eligibility API error');
          },
        );

        await controller.setUserRegion('US');
        expect(controller.state.userRegion).toBe('us');
        expect(controller.state.eligibility).toStrictEqual(usEligibility);

        await expect(controller.setUserRegion('FR')).rejects.toThrow(
          'Eligibility API error',
        );

        expect(controller.state.userRegion).toBe('fr');
        expect(controller.state.eligibility).toBeNull();
      });
    });
  });

  describe('updateUserRegion with automatic eligibility', () => {
    it('automatically fetches eligibility after getting user region', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        const mockEligibility = {
          aggregator: true,
          deposit: true,
          global: true,
        };

        rootMessenger.registerActionHandler(
          'RampsService:getGeolocation',
          async () => 'fr',
        );
        rootMessenger.registerActionHandler(
          'RampsService:getEligibility',
          async (isoCode) => {
            expect(isoCode).toBe('fr');
            return mockEligibility;
          },
        );

        expect(controller.state.userRegion).toBeNull();
        expect(controller.state.eligibility).toBeNull();

        await controller.updateUserRegion();

        expect(controller.state.userRegion).toBe('fr');
        expect(controller.state.eligibility).toStrictEqual(mockEligibility);
      });
    });

    it('updates user region state even when eligibility fetch fails', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        rootMessenger.registerActionHandler(
          'RampsService:getGeolocation',
          async () => 'us-ny',
        );
        rootMessenger.registerActionHandler(
          'RampsService:getEligibility',
          async () => {
            throw new Error('Eligibility API error');
          },
        );

        expect(controller.state.userRegion).toBeNull();
        expect(controller.state.eligibility).toBeNull();

        await controller.updateUserRegion();

        expect(controller.state.userRegion).toBe('us-ny');
        expect(controller.state.eligibility).toBeNull();
      });
    });

    it('clears stale eligibility when new user region is fetched but eligibility fails', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        const usEligibility = {
          aggregator: true,
          deposit: true,
          global: true,
        };

        let geolocationCallCount = 0;
        let eligibilityCallCount = 0;

        rootMessenger.registerActionHandler(
          'RampsService:getGeolocation',
          async () => {
            geolocationCallCount += 1;
            return geolocationCallCount === 1 ? 'us' : 'fr';
          },
        );
        rootMessenger.registerActionHandler(
          'RampsService:getEligibility',
          async () => {
            eligibilityCallCount += 1;
            if (eligibilityCallCount === 1) {
              return usEligibility;
            }
            throw new Error('Eligibility API error');
          },
        );

        await controller.updateUserRegion();

        expect(controller.state.userRegion).toBe('us');
        expect(controller.state.eligibility).toStrictEqual(usEligibility);

        await controller.updateUserRegion({ forceRefresh: true });

        expect(controller.state.userRegion).toBe('fr');
        expect(controller.state.eligibility).toBeNull();
      });
    });

    it('prevents stale eligibility from overwriting current eligibility in race condition', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        const usEligibility = {
          aggregator: true,
          deposit: true,
          global: false,
        };
        const frEligibility = {
          aggregator: true,
          deposit: true,
          global: true,
        };

        let geolocationCallCount = 0;

        rootMessenger.registerActionHandler(
          'RampsService:getGeolocation',
          async () => {
            geolocationCallCount += 1;
            return geolocationCallCount === 1 ? 'us' : 'fr';
          },
        );
        rootMessenger.registerActionHandler(
          'RampsService:getEligibility',
          async (isoCode) => {
            if (isoCode === 'us') {
              await new Promise((resolve) => setTimeout(resolve, 100));
              return usEligibility;
            }
            await new Promise((resolve) => setTimeout(resolve, 10));
            return frEligibility;
          },
        );

        const promise1 = controller.updateUserRegion();
        await new Promise((resolve) => setTimeout(resolve, 20));
        const promise2 = controller.updateUserRegion({ forceRefresh: true });

        await Promise.all([promise1, promise2]);

        expect(controller.state.userRegion).toBe('fr');
        expect(controller.state.eligibility).toStrictEqual(frEligibility);
      });
    });
  });
});

/**
 * The type of the messenger populated with all external actions and events
 * required by the controller under test.
 */
type RootMessenger = Messenger<
  MockAnyNamespace,
  | MessengerActions<RampsControllerMessenger>
  | RampsServiceGetGeolocationAction
  | RampsServiceGetCountriesAction
  | RampsServiceGetEligibilityAction,
  MessengerEvents<RampsControllerMessenger>
>;

/**
 * The callback that `withController` calls.
 */
type WithControllerCallback<ReturnValue> = (payload: {
  controller: RampsController;
  rootMessenger: RootMessenger;
  messenger: RampsControllerMessenger;
}) => Promise<ReturnValue> | ReturnValue;

/**
 * The options bag that `withController` takes.
 */
type WithControllerOptions = {
  options: Partial<ConstructorParameters<typeof RampsController>[0]>;
};

/**
 * Constructs the messenger populated with all external actions and events
 * required by the controller under test.
 *
 * @returns The root messenger.
 */
function getRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

/**
 * Constructs the messenger for the controller under test.
 *
 * @param rootMessenger - The root messenger, with all external actions and
 * events required by the controller's messenger.
 * @returns The controller-specific messenger.
 */
function getMessenger(rootMessenger: RootMessenger): RampsControllerMessenger {
  const messenger: RampsControllerMessenger = new Messenger({
    namespace: 'RampsController',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    messenger,
    actions: [
      'RampsService:getGeolocation',
      'RampsService:getCountries',
      'RampsService:getEligibility',
    ],
  });
  return messenger;
}

/**
 * Wrap tests for the controller under test by ensuring that the controller is
 * created ahead of time and then safely destroyed afterward as needed.
 *
 * @param args - Either a function, or an options bag + a function. The options
 * bag contains arguments for the controller constructor. All constructor
 * arguments are optional and will be filled in with defaults in as needed
 * (including `messenger`). The function is called with the new
 * controller, root messenger, and controller messenger.
 * @returns The same return value as the given function.
 */
async function withController<ReturnValue>(
  ...args:
    | [WithControllerCallback<ReturnValue>]
    | [WithControllerOptions, WithControllerCallback<ReturnValue>]
): Promise<ReturnValue> {
  const [{ options = {} }, testFunction] =
    args.length === 2 ? args : [{}, args[0]];
  const rootMessenger = getRootMessenger();
  const messenger = getMessenger(rootMessenger);
  const controller = new RampsController({
    messenger,
    ...options,
  });
  return await testFunction({ controller, rootMessenger, messenger });
}
