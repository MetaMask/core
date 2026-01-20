import { deriveStateFromMetadata } from '@metamask/base-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import type { RampsControllerMessenger, UserRegion } from './RampsController';
import { RampsController } from './RampsController';
import type { Country, TokensResponse, Provider, State } from './RampsService';
import type {
  RampsServiceGetGeolocationAction,
  RampsServiceGetCountriesAction,
  RampsServiceGetTokensAction,
  RampsServiceGetProvidersAction,
} from './RampsService-method-action-types';
import { RequestStatus, createCacheKey } from './RequestCache';

describe('RampsController', () => {
  describe('constructor', () => {
    it('uses default state when no state is provided', async () => {
      await withController(({ controller }) => {
        expect(controller.state).toMatchInlineSnapshot(`
          Object {
            "paymentMethods": Array [],
            "preferredProvider": null,
            "providers": Array [],
            "requests": Object {},
            "selectedPaymentMethod": null,
            "tokens": null,
            "userRegion": null,
          }
        `);
      });
    });

    it('accepts initial state', async () => {
      const givenState = {
        userRegion: createMockUserRegion('us'),
      };

      await withController(
        { options: { state: givenState } },
        ({ controller }) => {
          expect(controller.state.userRegion?.regionCode).toBe('us');
          expect(controller.state.preferredProvider).toBeNull();
          expect(controller.state.tokens).toBeNull();
          expect(controller.state.requests).toStrictEqual({});
        },
      );
    });

    it('fills in missing initial state with defaults', async () => {
      await withController({ options: { state: {} } }, ({ controller }) => {
        expect(controller.state).toMatchInlineSnapshot(`
          Object {
            "paymentMethods": Array [],
            "preferredProvider": null,
            "providers": Array [],
            "requests": Object {},
            "selectedPaymentMethod": null,
            "tokens": null,
            "userRegion": null,
          }
        `);
      });
    });

    it('always resets requests cache on initialization', async () => {
      const givenState = {
        userRegion: createMockUserRegion('us'),
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

  describe('getProviders', () => {
    const mockProviders: Provider[] = [
      {
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
        ],
        logos: {
          light: '/assets/providers/paypal_light.png',
          dark: '/assets/providers/paypal_dark.png',
          height: 24,
          width: 77,
        },
      },
      {
        id: '/providers/ramp-network-staging',
        name: 'Ramp Network (Staging)',
        environmentType: 'STAGING',
        description: 'Another test provider',
        hqAddress: '123 Test St',
        links: [],
        logos: {
          light: '/assets/providers/ramp_light.png',
          dark: '/assets/providers/ramp_dark.png',
          height: 24,
          width: 77,
        },
      },
    ];

    it('fetches providers from the service', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        rootMessenger.registerActionHandler(
          'RampsService:getProviders',
          async (_regionCode: string) => ({ providers: mockProviders }),
        );

        expect(controller.state.providers).toStrictEqual([]);

        const result = await controller.getProviders('us');

        expect(result.providers).toStrictEqual(mockProviders);
        expect(controller.state.providers).toStrictEqual(mockProviders);
      });
    });

    it('caches providers response', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        let callCount = 0;
        rootMessenger.registerActionHandler(
          'RampsService:getProviders',
          async (_regionCode: string) => {
            callCount += 1;
            return { providers: mockProviders };
          },
        );

        await controller.getProviders('us');
        await controller.getProviders('us');

        expect(callCount).toBe(1);
      });
    });

    it('normalizes region case for cache key consistency', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        let callCount = 0;
        rootMessenger.registerActionHandler(
          'RampsService:getProviders',
          async (regionCode: string) => {
            callCount += 1;
            expect(regionCode).toBe('us');
            return { providers: mockProviders };
          },
        );

        await controller.getProviders('US');
        await controller.getProviders('us');

        expect(callCount).toBe(1);
      });
    });

    it('creates separate cache entries for different regions', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        let callCount = 0;
        rootMessenger.registerActionHandler(
          'RampsService:getProviders',
          async (_regionCode: string) => {
            callCount += 1;
            return { providers: mockProviders };
          },
        );

        await controller.getProviders('us');
        await controller.getProviders('fr');

        expect(callCount).toBe(2);
      });
    });

    it('uses userRegion from state when region is not provided', async () => {
      await withController(
        { options: { state: { userRegion: createMockUserRegion('fr') } } },
        async ({ controller, rootMessenger }) => {
          let receivedRegion: string | undefined;
          rootMessenger.registerActionHandler(
            'RampsService:getProviders',
            async (regionCode: string) => {
              receivedRegion = regionCode;
              return { providers: mockProviders };
            },
          );

          await controller.getProviders();

          expect(receivedRegion).toBe('fr');
        },
      );
    });

    it('prefers provided region over userRegion in state', async () => {
      await withController(
        { options: { state: { userRegion: createMockUserRegion('fr') } } },
        async ({ controller, rootMessenger }) => {
          let receivedRegion: string | undefined;
          rootMessenger.registerActionHandler(
            'RampsService:getProviders',
            async (regionCode: string) => {
              receivedRegion = regionCode;
              return { providers: mockProviders };
            },
          );

          await controller.getProviders('us');

          expect(receivedRegion).toBe('us');
        },
      );
    });

    it('updates providers when userRegion matches the requested region', async () => {
      await withController(
        { options: { state: { userRegion: createMockUserRegion('us') } } },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getProviders',
            async (regionCode: string) => {
              expect(regionCode).toBe('us');
              return { providers: mockProviders };
            },
          );

          expect(controller.state.userRegion?.regionCode).toBe('us');
          expect(controller.state.providers).toStrictEqual([]);

          await controller.getProviders('US');

          expect(controller.state.providers).toStrictEqual(mockProviders);
        },
      );
    });

    it('does not update providers when userRegion does not match the requested region', async () => {
      const existingProviders: Provider[] = [
        {
          id: '/providers/existing',
          name: 'Existing Provider',
          environmentType: 'STAGING',
          description: 'Existing',
          hqAddress: '123 Existing St',
          links: [],
          logos: {
            light: '/assets/existing_light.png',
            dark: '/assets/existing_dark.png',
            height: 24,
            width: 77,
          },
        },
      ];

      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us'),
              providers: existingProviders,
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getProviders',
            async (regionCode: string) => {
              expect(regionCode).toBe('fr');
              return { providers: mockProviders };
            },
          );

          expect(controller.state.userRegion?.regionCode).toBe('us');
          expect(controller.state.providers).toStrictEqual(existingProviders);

          await controller.getProviders('fr');

          expect(controller.state.providers).toStrictEqual(existingProviders);
        },
      );
    });

    it('passes filter options to the service', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        let receivedOptions:
          | {
              provider?: string | string[];
              crypto?: string | string[];
              fiat?: string | string[];
              payments?: string | string[];
            }
          | undefined;
        rootMessenger.registerActionHandler(
          'RampsService:getProviders',
          async (
            _regionCode: string,
            options?: {
              provider?: string | string[];
              crypto?: string | string[];
              fiat?: string | string[];
              payments?: string | string[];
            },
          ) => {
            receivedOptions = options;
            return { providers: mockProviders };
          },
        );

        await controller.getProviders('us', {
          provider: 'paypal',
          crypto: 'ETH',
          fiat: 'USD',
          payments: 'card',
        });

        expect(receivedOptions).toStrictEqual({
          provider: 'paypal',
          crypto: 'ETH',
          fiat: 'USD',
          payments: 'card',
        });
      });
    });

    it('throws error when region is not provided and userRegion is not set', async () => {
      await withController(async ({ controller }) => {
        await expect(controller.getProviders()).rejects.toThrow(
          'Region is required. Either provide a region parameter or ensure userRegion is set in controller state.',
        );
      });
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
            "paymentMethods": Array [],
            "preferredProvider": null,
            "providers": Array [],
            "requests": Object {},
            "selectedPaymentMethod": null,
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
            "paymentMethods": Array [],
            "preferredProvider": null,
            "providers": Array [],
            "selectedPaymentMethod": null,
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
            "preferredProvider": null,
            "providers": Array [],
            "selectedPaymentMethod": null,
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
            "paymentMethods": Array [],
            "preferredProvider": null,
            "providers": Array [],
            "requests": Object {},
            "selectedPaymentMethod": null,
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
          'RampsService:getCountries',
          async () => createMockCountries(),
        );

        await controller.updateUserRegion();

        expect(controller.state.userRegion?.regionCode).toBe('us-ca');
        expect(controller.state.userRegion?.country.isoCode).toBe('US');
        expect(controller.state.userRegion?.state?.stateId).toBe('CA');
      });
    });

    it('calls getCountriesData internally when fetching countries', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        let countriesCallCount = 0;
        rootMessenger.registerActionHandler(
          'RampsService:getGeolocation',
          async () => 'US',
        );
        rootMessenger.registerActionHandler(
          'RampsService:getCountries',
          async () => {
            countriesCallCount += 1;
            return createMockCountries();
          },
        );
        await controller.updateUserRegion();

        expect(countriesCallCount).toBe(1);
        expect(controller.state.userRegion?.regionCode).toBe('us');
      });
    });

    it('stores request state in cache', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        rootMessenger.registerActionHandler(
          'RampsService:getGeolocation',
          async () => 'US',
        );
        rootMessenger.registerActionHandler(
          'RampsService:getCountries',
          async () => createMockCountries(),
        );

        const result = await controller.updateUserRegion();

        const cacheKey = createCacheKey('updateUserRegion', []);
        const requestState = controller.state.requests[cacheKey];

        expect(requestState).toBeDefined();
        expect(requestState?.status).toBe(RequestStatus.SUCCESS);
        expect(result).toBeDefined();
        expect(result?.regionCode).toBe('us');
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
          'RampsService:getCountries',
          async () => createMockCountries(),
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
          'RampsService:getCountries',
          async () => createMockCountries(),
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
      });
    });

    it('handles undefined geolocation result', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        rootMessenger.registerActionHandler(
          'RampsService:getGeolocation',
          async () => undefined as unknown as string,
        );

        const result = await controller.updateUserRegion();

        expect(result).toBeNull();
        expect(controller.state.userRegion).toBeNull();
      });
    });

    it('returns null when countries fetch fails', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        rootMessenger.registerActionHandler(
          'RampsService:getGeolocation',
          async () => 'FR',
        );
        rootMessenger.registerActionHandler(
          'RampsService:getCountries',
          async () => {
            throw new Error('Countries API error');
          },
        );

        const result = await controller.updateUserRegion();

        expect(result).toBeNull();
        expect(controller.state.userRegion).toBeNull();
        expect(controller.state.tokens).toBeNull();
      });
    });

    it('returns null when region is not found in countries data', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        rootMessenger.registerActionHandler(
          'RampsService:getGeolocation',
          async () => 'XX',
        );
        rootMessenger.registerActionHandler(
          'RampsService:getCountries',
          async () => createMockCountries(),
        );

        const result = await controller.updateUserRegion();

        expect(result).toBeNull();
        expect(controller.state.userRegion).toBeNull();
        expect(controller.state.tokens).toBeNull();
      });
    });

    it('does not overwrite existing user region when called', async () => {
      const existingRegion = createMockUserRegion(
        'us-co',
        'United States',
        'Colorado',
      );
      await withController(
        {
          options: {
            state: {
              userRegion: existingRegion,
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getGeolocation',
            async () => 'US-UT',
          );
          rootMessenger.registerActionHandler(
            'RampsService:getCountries',
            async () => createMockCountries(),
          );

          const result = await controller.updateUserRegion();

          expect(result).toStrictEqual(existingRegion);
          expect(controller.state.userRegion).toStrictEqual(existingRegion);
          expect(controller.state.userRegion?.regionCode).toBe('us-co');
        },
      );
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

  describe('init', () => {
    it('initializes controller by fetching user region, tokens, and providers', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        const mockTokens: TokensResponse = {
          topTokens: [],
          allTokens: [],
        };
        const mockProviders: Provider[] = [
          {
            id: '/providers/test',
            name: 'Test Provider',
            environmentType: 'STAGING',
            description: 'Test',
            hqAddress: '123 Test St',
            links: [],
            logos: {
              light: '/assets/test_light.png',
              dark: '/assets/test_dark.png',
              height: 24,
              width: 77,
            },
          },
        ];

        rootMessenger.registerActionHandler(
          'RampsService:getGeolocation',
          async () => 'US',
        );
        rootMessenger.registerActionHandler(
          'RampsService:getTokens',
          async (_region: string, _action?: 'buy' | 'sell') => mockTokens,
        );
        rootMessenger.registerActionHandler(
          'RampsService:getProviders',
          async (_regionCode: string) => ({ providers: mockProviders }),
        );

        rootMessenger.registerActionHandler(
          'RampsService:getCountries',
          async () => createMockCountries(),
        );

        await controller.init();

        expect(controller.state.userRegion?.regionCode).toBe('us');
        expect(controller.state.tokens).toStrictEqual(mockTokens);
        expect(controller.state.providers).toStrictEqual(mockProviders);
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
        expect(controller.state.providers).toStrictEqual([]);
      });
    });

    it('handles token fetch failure gracefully when region is set', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        rootMessenger.registerActionHandler(
          'RampsService:getGeolocation',
          async () => 'US',
        );
        rootMessenger.registerActionHandler(
          'RampsService:getCountries',
          async () => createMockCountries(),
        );
        rootMessenger.registerActionHandler(
          'RampsService:getTokens',
          async (_region: string, _action?: 'buy' | 'sell') => {
            throw new Error('Token fetch error');
          },
        );
        rootMessenger.registerActionHandler(
          'RampsService:getProviders',
          async (_regionCode: string) => {
            throw new Error('Provider fetch error');
          },
        );

        await controller.init();

        expect(controller.state.userRegion?.regionCode).toBe('us');
        expect(controller.state.tokens).toBeNull();
        expect(controller.state.providers).toStrictEqual([]);
      });
    });
  });

  describe('setUserRegion', () => {
    it('sets user region manually', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        rootMessenger.registerActionHandler(
          'RampsService:getCountries',
          async () => createMockCountries(),
        );

        await controller.setUserRegion('US-CA');

        expect(controller.state.userRegion?.regionCode).toBe('us-ca');
        expect(controller.state.userRegion?.country.isoCode).toBe('US');
        expect(controller.state.userRegion?.state?.stateId).toBe('CA');
      });
    });

    it('clears tokens and providers when user region changes', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        const mockTokens: TokensResponse = {
          topTokens: [],
          allTokens: [],
        };
        const mockProviders: Provider[] = [
          {
            id: '/providers/test',
            name: 'Test Provider',
            environmentType: 'STAGING',
            description: 'Test',
            hqAddress: '123 Test St',
            links: [],
            logos: {
              light: '/assets/test_light.png',
              dark: '/assets/test_dark.png',
              height: 24,
              width: 77,
            },
          },
        ];

        rootMessenger.registerActionHandler(
          'RampsService:getCountries',
          async () => createMockCountries(),
        );
        rootMessenger.registerActionHandler(
          'RampsService:getTokens',
          async (_region: string, _action?: 'buy' | 'sell') => mockTokens,
        );
        let providersToReturn = mockProviders;
        rootMessenger.registerActionHandler(
          'RampsService:getProviders',
          async (_regionCode: string) => ({ providers: providersToReturn }),
        );

        await controller.setUserRegion('US');
        await controller.getTokens('us', 'buy');
        expect(controller.state.tokens).toStrictEqual(mockTokens);
        expect(controller.state.providers).toStrictEqual(mockProviders);

        providersToReturn = [];
        await controller.setUserRegion('FR');
        expect(controller.state.tokens).toBeNull();
        expect(controller.state.providers).toStrictEqual([]);
      });
    });
    it('finds country by id starting with /regions/', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        const countriesWithId: Country[] = [
          {
            id: '/regions/us',
            isoCode: 'XX',
            name: 'United States',
            flag: '🇺🇸',
            currency: 'USD',
            phone: { prefix: '+1', placeholder: '', template: '' },
            supported: true,
            states: [{ stateId: 'CA', name: 'California', supported: true }],
          },
        ];

        rootMessenger.registerActionHandler(
          'RampsService:getCountries',
          async () => countriesWithId,
        );

        await controller.setUserRegion('us');

        expect(controller.state.userRegion?.regionCode).toBe('us');
        expect(controller.state.userRegion?.country.name).toBe('United States');
      });
    });

    it('finds country by id ending with /countryCode', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        const countriesWithId: Country[] = [
          {
            id: '/some/path/fr',
            isoCode: 'YY',
            name: 'France',
            flag: '🇫🇷',
            currency: 'EUR',
            phone: { prefix: '+33', placeholder: '', template: '' },
            supported: true,
          },
        ];

        rootMessenger.registerActionHandler(
          'RampsService:getCountries',
          async () => countriesWithId,
        );
        await controller.setUserRegion('fr');

        expect(controller.state.userRegion?.regionCode).toBe('fr');
        expect(controller.state.userRegion?.country.name).toBe('France');
      });
    });

    it('finds country by id matching countryCode directly', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        const countriesWithId: Country[] = [
          {
            id: 'us',
            isoCode: 'ZZ',
            name: 'United States',
            flag: '🇺🇸',
            currency: 'USD',
            phone: { prefix: '+1', placeholder: '', template: '' },
            supported: true,
          },
        ];

        rootMessenger.registerActionHandler(
          'RampsService:getCountries',
          async () => countriesWithId,
        );

        await controller.setUserRegion('us');

        expect(controller.state.userRegion?.regionCode).toBe('us');
        expect(controller.state.userRegion?.country.name).toBe('United States');
      });
    });

    it('throws error when country is not found', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        const countries: Country[] = [
          {
            isoCode: 'FR',
            name: 'France',
            flag: '🇫🇷',
            currency: 'EUR',
            phone: { prefix: '+33', placeholder: '', template: '' },
            supported: true,
          },
        ];

        rootMessenger.registerActionHandler(
          'RampsService:getCountries',
          async () => countries,
        );

        await expect(controller.setUserRegion('xx')).rejects.toThrow(
          'Region "xx" not found in countries data',
        );

        expect(controller.state.userRegion).toBeNull();
      });
    });

    it('throws error when countries fetch fails', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        rootMessenger.registerActionHandler(
          'RampsService:getCountries',
          async () => {
            throw new Error('Network error');
          },
        );

        await expect(controller.setUserRegion('us')).rejects.toThrow(
          'Failed to fetch countries data. Cannot set user region without valid country information.',
        );

        expect(controller.state.userRegion).toBeNull();
        expect(controller.state.tokens).toBeNull();
      });
    });

    it('clears pre-existing userRegion when countries fetch fails', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        let shouldFailCountriesFetch = false;

        rootMessenger.registerActionHandler(
          'RampsService:getCountries',
          async () => {
            if (shouldFailCountriesFetch) {
              throw new Error('Network error');
            }
            return createMockCountries();
          },
        );
        await controller.setUserRegion('US-CA');
        expect(controller.state.userRegion?.regionCode).toBe('us-ca');

        shouldFailCountriesFetch = true;

        await expect(
          controller.setUserRegion('FR', { forceRefresh: true }),
        ).rejects.toThrow(
          'Failed to fetch countries data. Cannot set user region without valid country information.',
        );

        expect(controller.state.userRegion).toBeNull();
        expect(controller.state.tokens).toBeNull();
      });
    });

    it('finds state by id including -stateCode', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        const countriesWithStateId: Country[] = [
          {
            isoCode: 'US',
            name: 'United States',
            flag: '🇺🇸',
            currency: 'USD',
            phone: { prefix: '+1', placeholder: '', template: '' },
            supported: true,
            states: [
              {
                id: '/regions/us-ny',
                name: 'New York',
                supported: true,
              },
            ],
          },
        ];

        rootMessenger.registerActionHandler(
          'RampsService:getCountries',
          async () => countriesWithStateId,
        );
        await controller.setUserRegion('us-ny');

        expect(controller.state.userRegion?.regionCode).toBe('us-ny');
        expect(controller.state.userRegion?.country.isoCode).toBe('US');
        expect(controller.state.userRegion?.state?.name).toBe('New York');
      });
    });

    it('finds state by id ending with /stateCode', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        const countriesWithStateId: Country[] = [
          {
            isoCode: 'US',
            name: 'United States',
            flag: '🇺🇸',
            currency: 'USD',
            phone: { prefix: '+1', placeholder: '', template: '' },
            supported: true,
            states: [
              {
                id: '/some/path/ca',
                name: 'California',
                supported: true,
              },
            ],
          },
        ];

        rootMessenger.registerActionHandler(
          'RampsService:getCountries',
          async () => countriesWithStateId,
        );
        await controller.setUserRegion('us-ca');

        expect(controller.state.userRegion?.regionCode).toBe('us-ca');
        expect(controller.state.userRegion?.country.isoCode).toBe('US');
        expect(controller.state.userRegion?.state?.name).toBe('California');
      });
    });

    it('returns null state when state code does not match any state', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        const countriesWithStates: Country[] = [
          {
            isoCode: 'US',
            name: 'United States',
            flag: '🇺🇸',
            currency: 'USD',
            phone: { prefix: '+1', placeholder: '', template: '' },
            supported: true,
            states: [
              { stateId: 'CA', name: 'California', supported: true },
              { stateId: 'NY', name: 'New York', supported: true },
            ],
          },
        ];

        rootMessenger.registerActionHandler(
          'RampsService:getCountries',
          async () => countriesWithStates,
        );
        await controller.setUserRegion('us-xx');

        expect(controller.state.userRegion?.regionCode).toBe('us-xx');
        expect(controller.state.userRegion?.country.isoCode).toBe('US');
        expect(controller.state.userRegion?.state).toBeNull();
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
        { options: { state: { userRegion: createMockUserRegion('fr') } } },
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
        { options: { state: { userRegion: createMockUserRegion('fr') } } },
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
        { options: { state: { userRegion: createMockUserRegion('us') } } },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getTokens',
            async (region: string, _action?: 'buy' | 'sell') => {
              expect(region).toBe('us');
              return mockTokens;
            },
          );

          expect(controller.state.userRegion?.regionCode).toBe('us');
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
            state: {
              userRegion: createMockUserRegion('us'),
              tokens: existingTokens,
            },
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

          expect(controller.state.userRegion?.regionCode).toBe('us');
          expect(controller.state.tokens).toStrictEqual(existingTokens);

          await controller.getTokens('fr');

          expect(controller.state.tokens).toStrictEqual(existingTokens);
        },
      );
    });
  });
});

/**
 * Creates a mock UserRegion object for testing.
 *
 * @param regionCode - The region code (e.g., "us-ca" or "us").
 * @param countryName - Optional country name. If not provided, a default name will be generated.
 * @param stateName - Optional state name. If not provided, a default name will be generated.
 * @returns A UserRegion object with country and state information.
 */
function createMockUserRegion(
  regionCode: string,
  countryName?: string,
  stateName?: string,
): UserRegion {
  const parts = regionCode.toLowerCase().split('-');
  const countryCode = parts[0];
  const stateCode = parts[1];

  const country: Country = {
    isoCode: countryCode.toUpperCase(),
    name: countryName ?? `Country ${countryCode.toUpperCase()}`,
    flag: '🏳️',
    currency: 'USD',
    phone: { prefix: '+1', placeholder: '', template: '' },
    supported: true,
    ...(stateCode && {
      states: [
        {
          stateId: stateCode.toUpperCase(),
          name: stateName ?? `State ${stateCode.toUpperCase()}`,
          supported: true,
        },
      ],
    }),
  };

  const state: State | null = stateCode
    ? {
        stateId: stateCode.toUpperCase(),
        name: stateName ?? `State ${stateCode.toUpperCase()}`,
        supported: true,
      }
    : null;

  return {
    country,
    state,
    regionCode: regionCode.toLowerCase(),
  };
}

/**
 * Creates mock countries array for testing.
 *
 * @returns An array of mock Country objects.
 */
function createMockCountries(): Country[] {
  return [
    {
      isoCode: 'US',
      name: 'United States of America',
      flag: '🇺🇸',
      currency: 'USD',
      phone: { prefix: '+1', placeholder: '', template: '' },
      supported: true,
      states: [
        { stateId: 'CA', name: 'California', supported: true },
        { stateId: 'NY', name: 'New York', supported: true },
        { stateId: 'UT', name: 'Utah', supported: true },
      ],
    },
    {
      isoCode: 'FR',
      name: 'France',
      flag: '🇫🇷',
      currency: 'EUR',
      phone: { prefix: '+33', placeholder: '', template: '' },
      supported: true,
    },
  ];
}

/**
 * The type of the messenger populated with all external actions and events
 * required by the controller under test.
 */
type RootMessenger = Messenger<
  MockAnyNamespace,
  | MessengerActions<RampsControllerMessenger>
  | RampsServiceGetGeolocationAction
  | RampsServiceGetCountriesAction
  | RampsServiceGetTokensAction
  | RampsServiceGetProvidersAction,
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
      'RampsService:getTokens',
      'RampsService:getProviders',
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
