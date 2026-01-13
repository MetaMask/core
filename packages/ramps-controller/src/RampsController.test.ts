import { deriveStateFromMetadata } from '@metamask/base-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import type { RampsControllerMessenger } from './RampsController';
import { RampsController } from './RampsController';
import type { Country, TokensResponse, Provider } from './RampsService';
import type {
  RampsServiceGetGeolocationAction,
  RampsServiceGetCountriesAction,
  RampsServiceGetEligibilityAction,
  RampsServiceGetTokensAction,
} from './RampsService-method-action-types';
import { RequestStatus, createCacheKey } from './RequestCache';

describe('RampsController', () => {
  describe('constructor', () => {
    it('uses default state when no state is provided', async () => {
      await withController(({ controller }) => {
        expect(controller.state).toMatchInlineSnapshot(`
          Object {
            "eligibility": null,
            "preferredProvider": null,
            "requests": Object {},
            "tokens": null,
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
            preferredProvider: null,
            tokens: null,
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
            "preferredProvider": null,
            "requests": Object {},
            "tokens": null,
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
            "preferredProvider": null,
            "requests": Object {},
            "tokens": null,
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
            "preferredProvider": null,
            "tokens": null,
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
            "preferredProvider": null,
            "tokens": null,
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
            "preferredProvider": null,
            "requests": Object {},
            "tokens": null,
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

    it('handles null geolocation result', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        rootMessenger.registerActionHandler(
          'RampsService:getGeolocation',
          async () => null as unknown as string,
        );

        const result = await controller.updateUserRegion();

        expect(result).toBeNull();
        expect(controller.state.userRegion).toBeNull();
        expect(controller.state.eligibility).toBeNull();
      });
    });

    it('handles undefined geolocation result', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        rootMessenger.registerActionHandler(
          'RampsService:getGeolocation',
          async () => undefined as unknown as string,
        );

        const result = await controller.updateUserRegion();

        expect(result).toBeUndefined();
        expect(controller.state.userRegion).toBeUndefined();
        expect(controller.state.eligibility).toBeNull();
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

    it('updates eligibility when userRegion matches the ISO code', async () => {
      await withController(
        { options: { state: { userRegion: 'us' } } },
        async ({ controller, rootMessenger }) => {
          const mockEligibility = {
            aggregator: true,
            deposit: true,
            global: true,
          };

          rootMessenger.registerActionHandler(
            'RampsService:getEligibility',
            async (isoCode) => {
              expect(isoCode).toBe('us');
              return mockEligibility;
            },
          );

          expect(controller.state.userRegion).toBe('us');
          expect(controller.state.eligibility).toBeNull();

          await controller.updateEligibility('US');

          expect(controller.state.eligibility).toStrictEqual(mockEligibility);
        },
      );
    });

    it('does not update eligibility when userRegion does not match the ISO code', async () => {
      const existingEligibility = {
        aggregator: false,
        deposit: false,
        global: false,
      };

      await withController(
        {
          options: {
            state: { userRegion: 'us', eligibility: existingEligibility },
          },
        },
        async ({ controller, rootMessenger }) => {
          const newEligibility = {
            aggregator: true,
            deposit: true,
            global: true,
          };

          rootMessenger.registerActionHandler(
            'RampsService:getEligibility',
            async (isoCode) => {
              expect(isoCode).toBe('fr');
              return newEligibility;
            },
          );

          expect(controller.state.userRegion).toBe('us');
          expect(controller.state.eligibility).toStrictEqual(
            existingEligibility,
          );

          await controller.updateEligibility('fr');

          expect(controller.state.eligibility).toStrictEqual(
            existingEligibility,
          );
        },
      );
    });
  });

  describe('init', () => {
    it('initializes controller by fetching user region, eligibility, and tokens', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        const mockTokens: TokensResponse = {
          topTokens: [],
          allTokens: [],
        };

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
        rootMessenger.registerActionHandler(
          'RampsService:getTokens',
          async (_region: string, _action?: 'buy' | 'sell') => mockTokens,
        );

        await controller.init();

        expect(controller.state.userRegion).toBe('us');
        expect(controller.state.eligibility).toStrictEqual({
          aggregator: true,
          deposit: true,
          global: true,
        });
        expect(controller.state.tokens).toStrictEqual(mockTokens);
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
        expect(controller.state.tokens).toBeNull();
      });
    });

    it('handles token fetch failure gracefully when region is set', async () => {
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
        rootMessenger.registerActionHandler(
          'RampsService:getTokens',
          async (_region: string, _action?: 'buy' | 'sell') => {
            throw new Error('Token fetch error');
          },
        );

        await controller.init();

        expect(controller.state.userRegion).toBe('us');
        expect(controller.state.eligibility).toStrictEqual({
          aggregator: true,
          deposit: true,
          global: true,
        });
        expect(controller.state.tokens).toBeNull();
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

    it('clears tokens when user region changes', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        const mockTokens: TokensResponse = {
          topTokens: [],
          allTokens: [],
        };

        rootMessenger.registerActionHandler(
          'RampsService:getEligibility',
          async () => ({
            aggregator: true,
            deposit: true,
            global: true,
          }),
        );
        rootMessenger.registerActionHandler(
          'RampsService:getTokens',
          async (_region: string, _action?: 'buy' | 'sell') => mockTokens,
        );

        await controller.setUserRegion('US');
        await controller.getTokens('us', 'buy');
        expect(controller.state.tokens).toStrictEqual(mockTokens);

        await controller.setUserRegion('FR');
        expect(controller.state.tokens).toBeNull();
      });
    });

    it('clears tokens when user region changes and eligibility fetch fails', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        const mockTokens: TokensResponse = {
          topTokens: [],
          allTokens: [],
        };

        rootMessenger.registerActionHandler(
          'RampsService:getEligibility',
          async (isoCode) => {
            if (isoCode === 'us') {
              return {
                aggregator: true,
                deposit: true,
                global: true,
              };
            }
            throw new Error('Eligibility API error');
          },
        );
        rootMessenger.registerActionHandler(
          'RampsService:getTokens',
          async (_region: string, _action?: 'buy' | 'sell') => mockTokens,
        );

        await controller.setUserRegion('US');
        await controller.getTokens('us', 'buy');
        expect(controller.state.tokens).toStrictEqual(mockTokens);

        await expect(controller.setUserRegion('FR')).rejects.toThrow(
          'Eligibility API error',
        );
        expect(controller.state.tokens).toBeNull();
      });
    });
  });

  describe('setPreferredProvider', () => {
    const mockProvider: Provider = {
      id: '/providers/paypal-staging',
      name: 'PayPal (Staging)',
      environmentType: 'STAGING',
      description: 'Test provider description',
      hqAddress: '2211 N 1st St, San Jose, CA 95131',
      links: [
        {
          name: 'Homepage',
          url: 'https://www.paypal.com/us/home',
        },
        {
          name: 'Terms of Service',
          url: 'https://www.paypal.com/us/legalhub/cryptocurrencies-tnc',
        },
        {
          name: 'Support',
          url: 'https://www.paypal.com/us/cshelp',
        },
      ],
      logos: {
        light: '/assets/providers/paypal_light.png',
        dark: '/assets/providers/paypal_dark.png',
        height: 24,
        width: 77,
      },
    };

    it('sets preferred provider', async () => {
      await withController(({ controller }) => {
        expect(controller.state.preferredProvider).toBeNull();

        controller.setPreferredProvider(mockProvider);

        expect(controller.state.preferredProvider).toStrictEqual(mockProvider);
      });
    });

    it('clears preferred provider when set to null', async () => {
      await withController(
        { options: { state: { preferredProvider: mockProvider } } },
        ({ controller }) => {
          expect(controller.state.preferredProvider).toStrictEqual(
            mockProvider,
          );

          controller.setPreferredProvider(null);

          expect(controller.state.preferredProvider).toBeNull();
        },
      );
    });

    it('updates preferred provider when a new provider is set', async () => {
      await withController(
        { options: { state: { preferredProvider: mockProvider } } },
        ({ controller }) => {
          const newProvider: Provider = {
            ...mockProvider,
            id: '/providers/ramp-network-staging',
            name: 'Ramp Network (Staging)',
          };

          controller.setPreferredProvider(newProvider);

          expect(controller.state.preferredProvider).toStrictEqual(newProvider);
          expect(controller.state.preferredProvider?.id).toBe(
            '/providers/ramp-network-staging',
          );
        },
      );
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

    it('clears tokens when user region changes', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        const mockTokens: TokensResponse = {
          topTokens: [],
          allTokens: [],
        };

        let geolocationResult = 'us';
        rootMessenger.registerActionHandler(
          'RampsService:getGeolocation',
          async () => geolocationResult,
        );
        rootMessenger.registerActionHandler(
          'RampsService:getEligibility',
          async () => ({
            aggregator: true,
            deposit: true,
            global: true,
          }),
        );
        rootMessenger.registerActionHandler(
          'RampsService:getTokens',
          async (_region: string, _action?: 'buy' | 'sell') => mockTokens,
        );

        await controller.updateUserRegion();
        await controller.getTokens('us', 'buy');
        expect(controller.state.tokens).toStrictEqual(mockTokens);

        geolocationResult = 'fr';

        await controller.updateUserRegion({ forceRefresh: true });
        expect(controller.state.tokens).toBeNull();
      });
    });

    it('clears tokens when user region changes and eligibility fetch fails', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        const mockTokens: TokensResponse = {
          topTokens: [],
          allTokens: [],
        };

        let geolocationResult = 'us';
        let shouldThrowEligibilityError = false;

        rootMessenger.registerActionHandler(
          'RampsService:getGeolocation',
          async () => geolocationResult,
        );
        rootMessenger.registerActionHandler(
          'RampsService:getEligibility',
          async () => {
            if (shouldThrowEligibilityError) {
              throw new Error('Eligibility API error');
            }
            return {
              aggregator: true,
              deposit: true,
              global: true,
            };
          },
        );
        rootMessenger.registerActionHandler(
          'RampsService:getTokens',
          async (_region: string, _action?: 'buy' | 'sell') => mockTokens,
        );

        await controller.updateUserRegion();
        await controller.getTokens('us', 'buy');
        expect(controller.state.tokens).toStrictEqual(mockTokens);

        geolocationResult = 'fr';
        shouldThrowEligibilityError = true;

        await controller.updateUserRegion({ forceRefresh: true });
        expect(controller.state.tokens).toBeNull();
      });
    });
  });

  describe('getTokens', () => {
    const mockTokens: TokensResponse = {
      topTokens: [
        {
          assetId: 'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          chainId: 'eip155:1',
          name: 'USD Coin',
          symbol: 'USDC',
          decimals: 6,
          iconUrl: 'https://example.com/usdc.png',
          tokenSupported: true,
        },
      ],
      allTokens: [
        {
          assetId: 'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          chainId: 'eip155:1',
          name: 'USD Coin',
          symbol: 'USDC',
          decimals: 6,
          iconUrl: 'https://example.com/usdc.png',
          tokenSupported: true,
        },
        {
          assetId: 'eip155:1/erc20:0xdAC17F958D2ee523a2206206994597C13D831ec7',
          chainId: 'eip155:1',
          name: 'Tether USD',
          symbol: 'USDT',
          decimals: 6,
          iconUrl: 'https://example.com/usdt.png',
          tokenSupported: true,
        },
      ],
    };

    it('fetches tokens from the service', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        rootMessenger.registerActionHandler(
          'RampsService:getTokens',
          async (_region: string, _action?: 'buy' | 'sell') => mockTokens,
        );

        expect(controller.state.tokens).toBeNull();

        const tokens = await controller.getTokens('us', 'buy');

        expect(tokens).toMatchInlineSnapshot(`
          Object {
            "allTokens": Array [
              Object {
                "assetId": "eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                "chainId": "eip155:1",
                "decimals": 6,
                "iconUrl": "https://example.com/usdc.png",
                "name": "USD Coin",
                "symbol": "USDC",
                "tokenSupported": true,
              },
              Object {
                "assetId": "eip155:1/erc20:0xdAC17F958D2ee523a2206206994597C13D831ec7",
                "chainId": "eip155:1",
                "decimals": 6,
                "iconUrl": "https://example.com/usdt.png",
                "name": "Tether USD",
                "symbol": "USDT",
                "tokenSupported": true,
              },
            ],
            "topTokens": Array [
              Object {
                "assetId": "eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                "chainId": "eip155:1",
                "decimals": 6,
                "iconUrl": "https://example.com/usdc.png",
                "name": "USD Coin",
                "symbol": "USDC",
                "tokenSupported": true,
              },
            ],
          }
        `);
        expect(controller.state.tokens).toStrictEqual(mockTokens);
      });
    });

    it('caches tokens response', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        let callCount = 0;
        rootMessenger.registerActionHandler(
          'RampsService:getTokens',
          async (_region: string, _action?: 'buy' | 'sell') => {
            callCount += 1;
            return mockTokens;
          },
        );

        await controller.getTokens('us', 'buy');
        await controller.getTokens('us', 'buy');

        expect(callCount).toBe(1);
      });
    });

    it('fetches tokens with sell action', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        let receivedAction: string | undefined;
        rootMessenger.registerActionHandler(
          'RampsService:getTokens',
          async (_region: string, action?: 'buy' | 'sell') => {
            receivedAction = action;
            return mockTokens;
          },
        );

        await controller.getTokens('us', 'sell');

        expect(receivedAction).toBe('sell');
      });
    });

    it('uses default buy action when no argument is provided', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        let receivedAction: string | undefined;
        rootMessenger.registerActionHandler(
          'RampsService:getTokens',
          async (_region: string, action?: 'buy' | 'sell') => {
            receivedAction = action;
            return mockTokens;
          },
        );

        await controller.getTokens('us');

        expect(receivedAction).toBe('buy');
      });
    });

    it('normalizes region case for cache key consistency', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        let callCount = 0;
        rootMessenger.registerActionHandler(
          'RampsService:getTokens',
          async (region: string, _action?: 'buy' | 'sell') => {
            callCount += 1;
            expect(region).toBe('us');
            return mockTokens;
          },
        );

        await controller.getTokens('US', 'buy');
        await controller.getTokens('us', 'buy');

        expect(callCount).toBe(1);
      });
    });

    it('creates separate cache entries for different actions', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        let callCount = 0;
        rootMessenger.registerActionHandler(
          'RampsService:getTokens',
          async (_region: string, _action?: 'buy' | 'sell') => {
            callCount += 1;
            return mockTokens;
          },
        );

        await controller.getTokens('us', 'buy');
        await controller.getTokens('us', 'sell');

        expect(callCount).toBe(2);
      });
    });

    it('creates separate cache entries for different regions', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        let callCount = 0;
        rootMessenger.registerActionHandler(
          'RampsService:getTokens',
          async (_region: string, _action?: 'buy' | 'sell') => {
            callCount += 1;
            return mockTokens;
          },
        );

        await controller.getTokens('us', 'buy');
        await controller.getTokens('fr', 'buy');

        expect(callCount).toBe(2);
      });
    });

    it('uses userRegion from state when region is not provided', async () => {
      await withController(
        { options: { state: { userRegion: 'fr' } } },
        async ({ controller, rootMessenger }) => {
          let receivedRegion: string | undefined;
          rootMessenger.registerActionHandler(
            'RampsService:getTokens',
            async (region: string, _action?: 'buy' | 'sell') => {
              receivedRegion = region;
              return mockTokens;
            },
          );

          await controller.getTokens(undefined, 'buy');

          expect(receivedRegion).toBe('fr');
        },
      );
    });

    it('throws error when region is not provided and userRegion is not set', async () => {
      await withController(async ({ controller }) => {
        await expect(controller.getTokens(undefined, 'buy')).rejects.toThrow(
          'Region is required. Either provide a region parameter or ensure userRegion is set in controller state.',
        );
      });
    });

    it('prefers provided region over userRegion in state', async () => {
      await withController(
        { options: { state: { userRegion: 'fr' } } },
        async ({ controller, rootMessenger }) => {
          let receivedRegion: string | undefined;
          rootMessenger.registerActionHandler(
            'RampsService:getTokens',
            async (region: string, _action?: 'buy' | 'sell') => {
              receivedRegion = region;
              return mockTokens;
            },
          );

          await controller.getTokens('us', 'buy');

          expect(receivedRegion).toBe('us');
        },
      );
    });

    it('updates tokens when userRegion matches the requested region', async () => {
      await withController(
        { options: { state: { userRegion: 'us' } } },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getTokens',
            async (region: string, _action?: 'buy' | 'sell') => {
              expect(region).toBe('us');
              return mockTokens;
            },
          );

          expect(controller.state.userRegion).toBe('us');
          expect(controller.state.tokens).toBeNull();

          await controller.getTokens('US');

          expect(controller.state.tokens).toStrictEqual(mockTokens);
        },
      );
    });

    it('does not update tokens when userRegion does not match the requested region', async () => {
      const existingTokens: TokensResponse = {
        topTokens: [
          {
            assetId: 'eip155:1/erc20:0xExisting',
            chainId: 'eip155:1',
            name: 'Existing Token',
            symbol: 'EXIST',
            decimals: 18,
            iconUrl: 'https://example.com/exist.png',
            tokenSupported: true,
          },
        ],
        allTokens: [
          {
            assetId: 'eip155:1/erc20:0xExisting',
            chainId: 'eip155:1',
            name: 'Existing Token',
            symbol: 'EXIST',
            decimals: 18,
            iconUrl: 'https://example.com/exist.png',
            tokenSupported: true,
          },
        ],
      };

      await withController(
        {
          options: {
            state: { userRegion: 'us', tokens: existingTokens },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getTokens',
            async (region: string, _action?: 'buy' | 'sell') => {
              expect(region).toBe('fr');
              return mockTokens;
            },
          );

          expect(controller.state.userRegion).toBe('us');
          expect(controller.state.tokens).toStrictEqual(existingTokens);

          await controller.getTokens('fr');

          expect(controller.state.tokens).toStrictEqual(existingTokens);
        },
      );
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
  | RampsServiceGetEligibilityAction
  | RampsServiceGetTokensAction,
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
      'RampsService:getTokens',
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
