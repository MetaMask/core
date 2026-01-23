import { deriveStateFromMetadata } from '@metamask/base-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import type { RampsControllerMessenger, UserRegion } from './RampsController';
import { RampsController } from './RampsController';
import type {
  Country,
  TokensResponse,
  Provider,
  State,
  PaymentMethod,
  PaymentMethodsResponse,
} from './RampsService';
import type {
  RampsServiceGetGeolocationAction,
  RampsServiceGetCountriesAction,
  RampsServiceGetTokensAction,
  RampsServiceGetProvidersAction,
  RampsServiceGetPaymentMethodsAction,
} from './RampsService-method-action-types';
import { RequestStatus } from './RequestCache';

describe('RampsController', () => {
  describe('constructor', () => {
    it('uses default state when no state is provided', async () => {
      await withController(({ controller }) => {
        expect(controller.state).toMatchInlineSnapshot(`
          Object {
            "countries": Array [],
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
            "countries": Array [],
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
            "countries": Array [],
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
            "countries": Array [],
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
            "countries": Array [],
            "preferredProvider": null,
            "providers": Array [],
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
            "countries": Array [],
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

    it('evicts expired entries based on TTL regardless of cache size', async () => {
      const shortTTL = 100;
      await withController(
        { options: { requestCacheTTL: shortTTL, requestCacheMaxSize: 100 } },
        async ({ controller }) => {
          await controller.executeRequest('key1', async () => 'data1');
          await controller.executeRequest('key2', async () => 'data2');

          const keysBeforeExpiry = Object.keys(controller.state.requests);
          expect(keysBeforeExpiry).toContain('key1');
          expect(keysBeforeExpiry).toContain('key2');

          await new Promise((resolve) => setTimeout(resolve, shortTTL + 50));

          await controller.executeRequest('key3', async () => 'data3');

          const keysAfterExpiry = Object.keys(controller.state.requests);
          expect(keysAfterExpiry).not.toContain('key1');
          expect(keysAfterExpiry).not.toContain('key2');
          expect(keysAfterExpiry).toContain('key3');
        },
      );
    });

    it('does not evict non-expired entries during TTL-based eviction', async () => {
      const longTTL = 1000;
      await withController(
        { options: { requestCacheTTL: longTTL, requestCacheMaxSize: 100 } },
        async ({ controller }) => {
          await controller.executeRequest('key1', async () => 'data1');
          await controller.executeRequest('key2', async () => 'data2');

          await new Promise((resolve) => setTimeout(resolve, 50));

          await controller.executeRequest('key3', async () => 'data3');

          const keys = Object.keys(controller.state.requests);
          expect(keys).toContain('key1');
          expect(keys).toContain('key2');
          expect(keys).toContain('key3');
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

  describe('sync trigger methods', () => {
    describe('triggerSetUserRegion', () => {
      it('triggers set user region and returns void', async () => {
        await withController(
          {
            options: {
              state: {
                countries: createMockCountries(),
              },
            },
          },
          async ({ controller, rootMessenger }) => {
            rootMessenger.registerActionHandler(
              'RampsService:getTokens',
              async () => ({ topTokens: [], allTokens: [] }),
            );
            rootMessenger.registerActionHandler(
              'RampsService:getProviders',
              async () => ({ providers: [] }),
            );

            const result = controller.triggerSetUserRegion('us');
            expect(result).toBeUndefined();

            await new Promise((resolve) => setTimeout(resolve, 10));
            expect(controller.state.userRegion?.regionCode).toBe('us');
          },
        );
      });

      it('does not throw when set fails', async () => {
        await withController(async ({ controller }) => {
          expect(() => controller.triggerSetUserRegion('us')).not.toThrow();
        });
      });
    });

    describe('triggerGetCountries', () => {
      it('triggers get countries and returns void', async () => {
        await withController(async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getCountries',
            async () => createMockCountries(),
          );

          const result = controller.triggerGetCountries('buy');
          expect(result).toBeUndefined();
        });
      });

      it('does not throw when fetch fails', async () => {
        await withController(async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getCountries',
            async () => {
              throw new Error('countries failed');
            },
          );

          expect(() => controller.triggerGetCountries()).not.toThrow();
        });
      });
    });

    describe('triggerGetTokens', () => {
      it('triggers get tokens and returns void', async () => {
        await withController(
          { options: { state: { userRegion: createMockUserRegion('us') } } },
          async ({ controller, rootMessenger }) => {
            rootMessenger.registerActionHandler(
              'RampsService:getTokens',
              async () => ({ topTokens: [], allTokens: [] }),
            );

            const result = controller.triggerGetTokens();
            expect(result).toBeUndefined();

            await new Promise((resolve) => setTimeout(resolve, 10));
            expect(controller.state.tokens).toStrictEqual({
              topTokens: [],
              allTokens: [],
            });
          },
        );
      });

      it('does not throw when fetch fails', async () => {
        await withController(
          { options: { state: { userRegion: createMockUserRegion('us') } } },
          async ({ controller, rootMessenger }) => {
            rootMessenger.registerActionHandler(
              'RampsService:getTokens',
              async () => {
                throw new Error('tokens failed');
              },
            );

            expect(() => controller.triggerGetTokens()).not.toThrow();
          },
        );
      });
    });

    describe('triggerGetProviders', () => {
      it('triggers get providers and returns void', async () => {
        await withController(
          { options: { state: { userRegion: createMockUserRegion('us') } } },
          async ({ controller, rootMessenger }) => {
            rootMessenger.registerActionHandler(
              'RampsService:getProviders',
              async () => ({ providers: [] }),
            );

            const result = controller.triggerGetProviders();
            expect(result).toBeUndefined();

            await new Promise((resolve) => setTimeout(resolve, 10));
            expect(controller.state.providers).toStrictEqual([]);
          },
        );
      });

      it('does not throw when fetch fails', async () => {
        await withController(
          { options: { state: { userRegion: createMockUserRegion('us') } } },
          async ({ controller, rootMessenger }) => {
            rootMessenger.registerActionHandler(
              'RampsService:getProviders',
              async () => {
                throw new Error('providers failed');
              },
            );

            expect(() => controller.triggerGetProviders()).not.toThrow();
          },
        );
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

    it('fetches countries from the service and saves to state', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        rootMessenger.registerActionHandler(
          'RampsService:getCountries',
          async () => mockCountries,
        );

        expect(controller.state.countries).toStrictEqual([]);

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
        expect(controller.state.countries).toStrictEqual(mockCountries);
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
          async (action?: 'buy' | 'sell') => {
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
          async (action?: 'buy' | 'sell') => {
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
    it('initializes controller by fetching countries and geolocation', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        rootMessenger.registerActionHandler(
          'RampsService:getGeolocation',
          async () => 'US',
        );
        rootMessenger.registerActionHandler(
          'RampsService:getCountries',
          async () => createMockCountries(),
        );

        await controller.init();

        expect(controller.state.countries).toStrictEqual(createMockCountries());
        expect(controller.state.userRegion?.regionCode).toBe('us');
      });
    });

    it('uses existing userRegion if already set', async () => {
      const existingRegion = createMockUserRegion('us-ca');
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
            'RampsService:getCountries',
            async () => createMockCountries(),
          );

          await controller.init();

          expect(controller.state.countries).toStrictEqual(
            createMockCountries(),
          );
          expect(controller.state.userRegion?.regionCode).toBe('us-ca');
        },
      );
    });

    it('does not clear persisted state when init() is called with same persisted region', async () => {
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
      const mockPreferredProvider: Provider = {
        id: '/providers/preferred',
        name: 'Preferred Provider',
        environmentType: 'STAGING',
        description: 'Preferred',
        hqAddress: '456 Preferred St',
        links: [],
        logos: {
          light: '/assets/preferred_light.png',
          dark: '/assets/preferred_dark.png',
          height: 24,
          width: 77,
        },
      };

      await withController(
        {
          options: {
            state: {
              countries: createMockCountries(),
              userRegion: createMockUserRegion('us'),
              tokens: mockTokens,
              providers: mockProviders,
              preferredProvider: mockPreferredProvider,
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getCountries',
            async () => createMockCountries(),
          );
          rootMessenger.registerActionHandler(
            'RampsService:getTokens',
            async () => ({ topTokens: [], allTokens: [] }),
          );
          rootMessenger.registerActionHandler(
            'RampsService:getProviders',
            async () => ({ providers: [] }),
          );

          await controller.init();

          // Verify persisted state is preserved
          expect(controller.state.userRegion?.regionCode).toBe('us');
          expect(controller.state.tokens).toStrictEqual(mockTokens);
          expect(controller.state.providers).toStrictEqual(mockProviders);
          expect(controller.state.preferredProvider).toStrictEqual(
            mockPreferredProvider,
          );
        },
      );
    });

    it('throws error when geolocation fetch fails', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        rootMessenger.registerActionHandler(
          'RampsService:getCountries',
          async () => createMockCountries(),
        );
        rootMessenger.registerActionHandler(
          'RampsService:getGeolocation',
          async () => null as unknown as string,
        );

        await expect(controller.init()).rejects.toThrow(
          'Failed to fetch geolocation. Cannot initialize controller without valid region information.',
        );
      });
    });

    it('handles countries fetch failure', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        rootMessenger.registerActionHandler(
          'RampsService:getCountries',
          async () => {
            throw new Error('Countries fetch error');
          },
        );

        await expect(controller.init()).rejects.toThrow(
          'Countries fetch error',
        );
      });
    });
  });

  describe('hydrateState', () => {
    it('triggers fetching tokens and providers for user region', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us'),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          let tokensCalled = false;
          let providersCalled = false;

          rootMessenger.registerActionHandler(
            'RampsService:getTokens',
            async () => {
              tokensCalled = true;
              return { topTokens: [], allTokens: [] };
            },
          );
          rootMessenger.registerActionHandler(
            'RampsService:getProviders',
            async () => {
              providersCalled = true;
              return { providers: [] };
            },
          );

          controller.hydrateState();

          await new Promise((resolve) => setTimeout(resolve, 10));

          expect(tokensCalled).toBe(true);
          expect(providersCalled).toBe(true);
        },
      );
    });

    it('throws error when userRegion is not set', async () => {
      await withController(async ({ controller }) => {
        expect(() => controller.hydrateState()).toThrow(
          'Region code is required. Cannot hydrate state without valid region information.',
        );
      });
    });
  });

  describe('setUserRegion', () => {
    it('sets user region manually using countries from state', async () => {
      await withController(
        {
          options: {
            state: {
              countries: createMockCountries(),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getTokens',
            async () => ({ topTokens: [], allTokens: [] }),
          );
          rootMessenger.registerActionHandler(
            'RampsService:getProviders',
            async () => ({ providers: [] }),
          );

          await controller.setUserRegion('US-CA');

          expect(controller.state.userRegion?.regionCode).toBe('us-ca');
          expect(controller.state.userRegion?.country.isoCode).toBe('US');
          expect(controller.state.userRegion?.state?.stateId).toBe('CA');
        },
      );
    });

    it('clears tokens, providers, paymentMethods, and selectedPaymentMethod when user region changes', async () => {
      const mockPaymentMethod: PaymentMethod = {
        id: '/payments/test-card',
        paymentType: 'debit-credit-card',
        name: 'Test Card',
        score: 90,
        icon: 'card',
      };

      await withController(
        {
          options: {
            state: {
              countries: createMockCountries(),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
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
            'RampsService:getTokens',
            async (_region: string, _action?: 'buy' | 'sell') => mockTokens,
          );
          let providersToReturn = mockProviders;
          rootMessenger.registerActionHandler(
            'RampsService:getProviders',
            async (_regionCode: string) => ({ providers: providersToReturn }),
          );
          rootMessenger.registerActionHandler(
            'RampsService:getPaymentMethods',
            async () => ({ payments: [mockPaymentMethod] }),
          );

          await controller.setUserRegion('US');
          await new Promise((resolve) => setTimeout(resolve, 50));
          await controller.getPaymentMethods({
            assetId: 'eip155:1/slip44:60',
            provider: '/providers/test',
          });
          controller.setSelectedPaymentMethod(mockPaymentMethod);

          expect(controller.state.tokens).toStrictEqual(mockTokens);
          expect(controller.state.providers).toStrictEqual(mockProviders);
          expect(controller.state.paymentMethods).toStrictEqual([
            mockPaymentMethod,
          ]);
          expect(controller.state.selectedPaymentMethod).toStrictEqual(
            mockPaymentMethod,
          );

          providersToReturn = [];
          await controller.setUserRegion('FR');
          await new Promise((resolve) => setTimeout(resolve, 50));
          expect(controller.state.tokens).toStrictEqual(mockTokens);
          expect(controller.state.providers).toStrictEqual([]);
          expect(controller.state.paymentMethods).toStrictEqual([]);
          expect(controller.state.selectedPaymentMethod).toBeNull();
        },
      );
    });

    it('does not clear persisted state when setting the same region', async () => {
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
      const mockPreferredProvider: Provider = {
        id: '/providers/preferred',
        name: 'Preferred Provider',
        environmentType: 'STAGING',
        description: 'Preferred',
        hqAddress: '456 Preferred St',
        links: [],
        logos: {
          light: '/assets/preferred_light.png',
          dark: '/assets/preferred_dark.png',
          height: 24,
          width: 77,
        },
      };

      await withController(
        {
          options: {
            state: {
              countries: createMockCountries(),
              userRegion: createMockUserRegion('us'),
              tokens: mockTokens,
              providers: mockProviders,
              preferredProvider: mockPreferredProvider,
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getTokens',
            async () => ({ topTokens: [], allTokens: [] }),
          );
          rootMessenger.registerActionHandler(
            'RampsService:getProviders',
            async () => ({ providers: [] }),
          );

          // Set the same region
          await controller.setUserRegion('US');

          // Verify persisted state is preserved
          expect(controller.state.userRegion?.regionCode).toBe('us');
          expect(controller.state.tokens).toStrictEqual(mockTokens);
          expect(controller.state.providers).toStrictEqual(mockProviders);
          expect(controller.state.preferredProvider).toStrictEqual(
            mockPreferredProvider,
          );
        },
      );
    });

    it('clears persisted state when setting a different region', async () => {
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
      const mockPreferredProvider: Provider = {
        id: '/providers/preferred',
        name: 'Preferred Provider',
        environmentType: 'STAGING',
        description: 'Preferred',
        hqAddress: '456 Preferred St',
        links: [],
        logos: {
          light: '/assets/preferred_light.png',
          dark: '/assets/preferred_dark.png',
          height: 24,
          width: 77,
        },
      };

      await withController(
        {
          options: {
            state: {
              countries: createMockCountries(),
              userRegion: createMockUserRegion('us'),
              tokens: mockTokens,
              providers: mockProviders,
              preferredProvider: mockPreferredProvider,
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getTokens',
            async () => ({ topTokens: [], allTokens: [] }),
          );
          rootMessenger.registerActionHandler(
            'RampsService:getProviders',
            async () => ({ providers: [] }),
          );

          // Set a different region
          await controller.setUserRegion('FR');

          // Verify persisted state is cleared
          expect(controller.state.userRegion?.regionCode).toBe('fr');
          expect(controller.state.tokens).toBeNull();
          expect(controller.state.providers).toStrictEqual([]);
          expect(controller.state.preferredProvider).toBeNull();
        },
      );
    });

    it('finds country by id starting with /regions/', async () => {
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

      await withController(
        {
          options: {
            state: {
              countries: countriesWithId,
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getTokens',
            async () => ({ topTokens: [], allTokens: [] }),
          );
          rootMessenger.registerActionHandler(
            'RampsService:getProviders',
            async () => ({ providers: [] }),
          );

          await controller.setUserRegion('us');

          expect(controller.state.userRegion?.regionCode).toBe('us');
          expect(controller.state.userRegion?.country.name).toBe(
            'United States',
          );
        },
      );
    });

    it('finds country by id ending with /countryCode', async () => {
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

      await withController(
        {
          options: {
            state: {
              countries: countriesWithId,
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getTokens',
            async () => ({ topTokens: [], allTokens: [] }),
          );
          rootMessenger.registerActionHandler(
            'RampsService:getProviders',
            async () => ({ providers: [] }),
          );

          await controller.setUserRegion('fr');

          expect(controller.state.userRegion?.regionCode).toBe('fr');
          expect(controller.state.userRegion?.country.name).toBe('France');
        },
      );
    });

    it('finds country by id matching countryCode directly', async () => {
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

      await withController(
        {
          options: {
            state: {
              countries: countriesWithId,
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getTokens',
            async () => ({ topTokens: [], allTokens: [] }),
          );
          rootMessenger.registerActionHandler(
            'RampsService:getProviders',
            async () => ({ providers: [] }),
          );

          await controller.setUserRegion('us');

          expect(controller.state.userRegion?.regionCode).toBe('us');
          expect(controller.state.userRegion?.country.name).toBe(
            'United States',
          );
        },
      );
    });

    it('throws error when country is not found', async () => {
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

      await withController(
        {
          options: {
            state: {
              countries,
            },
          },
        },
        async ({ controller }) => {
          await expect(controller.setUserRegion('xx')).rejects.toThrow(
            'Region "xx" not found in countries data',
          );

          expect(controller.state.userRegion).toBeNull();
        },
      );
    });

    it('throws error when countries are not in state', async () => {
      await withController(async ({ controller }) => {
        await expect(controller.setUserRegion('us')).rejects.toThrow(
          'No countries found. Cannot set user region without valid country information.',
        );

        expect(controller.state.userRegion).toBeNull();
        expect(controller.state.tokens).toBeNull();
      });
    });

    it('clears pre-existing userRegion when countries are not in state', async () => {
      await withController(
        {
          options: {
            state: {
              countries: [],
              userRegion: createMockUserRegion('us-ca'),
            },
          },
        },
        async ({ controller }) => {
          await expect(controller.setUserRegion('FR')).rejects.toThrow(
            'No countries found. Cannot set user region without valid country information.',
          );

          expect(controller.state.userRegion).toBeNull();
          expect(controller.state.tokens).toBeNull();
        },
      );
    });

    it('finds state by id including -stateCode', async () => {
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

      await withController(
        {
          options: {
            state: {
              countries: countriesWithStateId,
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getTokens',
            async () => ({ topTokens: [], allTokens: [] }),
          );
          rootMessenger.registerActionHandler(
            'RampsService:getProviders',
            async () => ({ providers: [] }),
          );

          await controller.setUserRegion('us-ny');

          expect(controller.state.userRegion?.regionCode).toBe('us-ny');
          expect(controller.state.userRegion?.country.isoCode).toBe('US');
          expect(controller.state.userRegion?.state?.name).toBe('New York');
        },
      );
    });

    it('finds state by id ending with /stateCode', async () => {
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

      await withController(
        {
          options: {
            state: {
              countries: countriesWithStateId,
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getTokens',
            async () => ({ topTokens: [], allTokens: [] }),
          );
          rootMessenger.registerActionHandler(
            'RampsService:getProviders',
            async () => ({ providers: [] }),
          );

          await controller.setUserRegion('us-ca');

          expect(controller.state.userRegion?.regionCode).toBe('us-ca');
          expect(controller.state.userRegion?.country.isoCode).toBe('US');
          expect(controller.state.userRegion?.state?.name).toBe('California');
        },
      );
    });

    it('returns null state when state code does not match any state', async () => {
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

      await withController(
        {
          options: {
            state: {
              countries: countriesWithStates,
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getTokens',
            async () => ({ topTokens: [], allTokens: [] }),
          );
          rootMessenger.registerActionHandler(
            'RampsService:getProviders',
            async () => ({ providers: [] }),
          );

          await controller.setUserRegion('us-xx');

          expect(controller.state.userRegion?.regionCode).toBe('us-xx');
          expect(controller.state.userRegion?.country.isoCode).toBe('US');
          expect(controller.state.userRegion?.state).toBeNull();
        },
      );
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
          async (
            _region: string,
            _action?: 'buy' | 'sell',
            _options?: { provider?: string | string[] },
          ) => mockTokens,
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
          async (
            _region: string,
            _action?: 'buy' | 'sell',
            _options?: { provider?: string | string[] },
          ) => {
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
          async (
            _region: string,
            action?: 'buy' | 'sell',
            _options?: { provider?: string | string[] },
          ) => {
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
          async (
            _region: string,
            action?: 'buy' | 'sell',
            _options?: { provider?: string | string[] },
          ) => {
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
          async (
            region: string,
            _action?: 'buy' | 'sell',
            _options?: { provider?: string | string[] },
          ) => {
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
          async (
            _region: string,
            _action?: 'buy' | 'sell',
            _options?: { provider?: string | string[] },
          ) => {
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
          async (
            _region: string,
            _action?: 'buy' | 'sell',
            _options?: { provider?: string | string[] },
          ) => {
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
            async (
              region: string,
              _action?: 'buy' | 'sell',
              _options?: { provider?: string | string[] },
            ) => {
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
            async (
              region: string,
              _action?: 'buy' | 'sell',
              _options?: { provider?: string | string[] },
            ) => {
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
            async (
              region: string,
              _action?: 'buy' | 'sell',
              _options?: { provider?: string | string[] },
            ) => {
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
            async (
              region: string,
              _action?: 'buy' | 'sell',
              _options?: { provider?: string | string[] },
            ) => {
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

    it('passes provider parameter to service', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        let receivedProvider: string | string[] | undefined;
        rootMessenger.registerActionHandler(
          'RampsService:getTokens',
          async (
            _region: string,
            _action?: 'buy' | 'sell',
            options?: { provider?: string | string[] },
          ) => {
            receivedProvider = options?.provider;
            return mockTokens;
          },
        );

        await controller.getTokens('us', 'buy', { provider: 'provider-id' });

        expect(receivedProvider).toBe('provider-id');
      });
    });

    it('creates separate cache entries for different providers', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        let callCount = 0;
        rootMessenger.registerActionHandler(
          'RampsService:getTokens',
          async (
            _region: string,
            _action?: 'buy' | 'sell',
            _options?: { provider?: string | string[] },
          ) => {
            callCount += 1;
            return mockTokens;
          },
        );

        await controller.getTokens('us', 'buy', { provider: 'provider-1' });
        await controller.getTokens('us', 'buy', { provider: 'provider-2' });

        expect(callCount).toBe(2);
      });
    });

    it('uses same cache entry for same provider', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        let callCount = 0;
        rootMessenger.registerActionHandler(
          'RampsService:getTokens',
          async (
            _region: string,
            _action?: 'buy' | 'sell',
            _options?: { provider?: string | string[] },
          ) => {
            callCount += 1;
            return mockTokens;
          },
        );

        await controller.getTokens('us', 'buy', { provider: 'provider-1' });
        await controller.getTokens('us', 'buy', { provider: 'provider-1' });

        expect(callCount).toBe(1);
      });
    });

    it('creates separate cache entries for requests with and without provider', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        let callCount = 0;
        rootMessenger.registerActionHandler(
          'RampsService:getTokens',
          async (
            _region: string,
            _action?: 'buy' | 'sell',
            _options?: { provider?: string | string[] },
          ) => {
            callCount += 1;
            return mockTokens;
          },
        );

        await controller.getTokens('us', 'buy');
        await controller.getTokens('us', 'buy', { provider: 'provider-1' });

        expect(callCount).toBe(2);
      });
    });
  });

  describe('getPaymentMethods', () => {
    const mockPaymentMethod1: PaymentMethod = {
      id: '/payments/debit-credit-card',
      paymentType: 'debit-credit-card',
      name: 'Debit or Credit',
      score: 90,
      icon: 'card',
    };

    const mockPaymentMethod2: PaymentMethod = {
      id: '/payments/venmo',
      paymentType: 'bank-transfer',
      name: 'Venmo',
      score: 95,
      icon: 'bank',
    };

    const mockPaymentMethodsResponse: PaymentMethodsResponse = {
      payments: [mockPaymentMethod1, mockPaymentMethod2],
    };

    it('preserves selectedPaymentMethod when it exists in the new payment methods list', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us'),
              selectedPaymentMethod: mockPaymentMethod1,
              paymentMethods: [mockPaymentMethod1, mockPaymentMethod2],
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getPaymentMethods',
            async () => mockPaymentMethodsResponse,
          );

          expect(controller.state.selectedPaymentMethod).toStrictEqual(
            mockPaymentMethod1,
          );

          await controller.getPaymentMethods({
            assetId: 'eip155:1/slip44:60',
            provider: '/providers/stripe',
          });

          // selectedPaymentMethod should be preserved when it exists in the new list
          expect(controller.state.selectedPaymentMethod).toStrictEqual(
            mockPaymentMethod1,
          );
          expect(controller.state.paymentMethods).toStrictEqual([
            mockPaymentMethod1,
            mockPaymentMethod2,
          ]);
        },
      );
    });

    it('clears selectedPaymentMethod when it no longer exists in the new payment methods list', async () => {
      const removedPaymentMethod: PaymentMethod = {
        id: '/payments/removed-method',
        paymentType: 'removed',
        name: 'Removed Method',
        score: 50,
        icon: 'removed',
      };

      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us'),
              selectedPaymentMethod: removedPaymentMethod,
              paymentMethods: [removedPaymentMethod],
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getPaymentMethods',
            async () => mockPaymentMethodsResponse,
          );

          expect(controller.state.selectedPaymentMethod).toStrictEqual(
            removedPaymentMethod,
          );

          await controller.getPaymentMethods({
            assetId: 'eip155:1/slip44:60',
            provider: '/providers/stripe',
          });

          // selectedPaymentMethod should be cleared when it's not in the new list
          expect(controller.state.selectedPaymentMethod).toBeNull();
          expect(controller.state.paymentMethods).toStrictEqual([
            mockPaymentMethod1,
            mockPaymentMethod2,
          ]);
        },
      );
    });

    it('handles null selectedPaymentMethod when fetching new payment methods', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us'),
              selectedPaymentMethod: null,
              paymentMethods: [],
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getPaymentMethods',
            async () => mockPaymentMethodsResponse,
          );

          expect(controller.state.selectedPaymentMethod).toBeNull();

          await controller.getPaymentMethods({
            assetId: 'eip155:1/slip44:60',
            provider: '/providers/stripe',
          });

          // selectedPaymentMethod should remain null
          expect(controller.state.selectedPaymentMethod).toBeNull();
          expect(controller.state.paymentMethods).toStrictEqual([
            mockPaymentMethod1,
            mockPaymentMethod2,
          ]);
        },
      );
    });

    it('updates paymentMethods state with fetched payment methods', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us'),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getPaymentMethods',
            async () => mockPaymentMethodsResponse,
          );

          expect(controller.state.paymentMethods).toStrictEqual([]);

          await controller.getPaymentMethods({
            assetId: 'eip155:1/slip44:60',
            provider: '/providers/stripe',
          });

          expect(controller.state.paymentMethods).toStrictEqual([
            mockPaymentMethod1,
            mockPaymentMethod2,
          ]);
        },
      );
    });

    it('throws error when region is not provided and userRegion is not set', async () => {
      await withController(async ({ controller }) => {
        await expect(
          controller.getPaymentMethods({
            assetId: 'eip155:1/slip44:60',
            provider: '/providers/stripe',
          }),
        ).rejects.toThrow(
          'Region is required. Either provide a region parameter or ensure userRegion is set in controller state.',
        );
      });
    });

    it('uses userRegion from state when region is not provided', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('fr'),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          let receivedRegion: string | undefined;
          rootMessenger.registerActionHandler(
            'RampsService:getPaymentMethods',
            async (options: {
              region: string;
              fiat: string;
              assetId: string;
              provider: string;
            }) => {
              receivedRegion = options.region;
              return mockPaymentMethodsResponse;
            },
          );

          await controller.getPaymentMethods({
            assetId: 'eip155:1/slip44:60',
            provider: '/providers/stripe',
          });

          expect(receivedRegion).toBe('fr');
        },
      );
    });

    it('throws error when fiat is not provided and userRegion has no currency', async () => {
      // Create a mock region without currency
      const regionWithoutCurrency: UserRegion = {
        country: {
          isoCode: 'US',
          name: 'United States',
          flag: '🇺🇸',
          currency: undefined as unknown as string,
          phone: { prefix: '+1', placeholder: '', template: '' },
          supported: true,
        },
        state: null,
        regionCode: 'us',
      };

      await withController(
        {
          options: {
            state: {
              userRegion: regionWithoutCurrency,
            },
          },
        },
        async ({ controller }) => {
          await expect(
            controller.getPaymentMethods({
              assetId: 'eip155:1/slip44:60',
              provider: '/providers/stripe',
            }),
          ).rejects.toThrow(
            'Fiat currency is required. Either provide a fiat parameter or ensure userRegion is set in controller state.',
          );
        },
      );
    });
  });

  describe('setSelectedPaymentMethod', () => {
    const mockPaymentMethod: PaymentMethod = {
      id: '/payments/debit-credit-card',
      paymentType: 'debit-credit-card',
      name: 'Debit or Credit',
      score: 90,
      icon: 'card',
    };

    it('sets the selected payment method', async () => {
      await withController(({ controller }) => {
        expect(controller.state.selectedPaymentMethod).toBeNull();

        controller.setSelectedPaymentMethod(mockPaymentMethod);

        expect(controller.state.selectedPaymentMethod).toStrictEqual(
          mockPaymentMethod,
        );
      });
    });

    it('clears the selected payment method when null is passed', async () => {
      await withController(
        {
          options: {
            state: {
              selectedPaymentMethod: mockPaymentMethod,
            },
          },
        },
        ({ controller }) => {
          expect(controller.state.selectedPaymentMethod).toStrictEqual(
            mockPaymentMethod,
          );

          controller.setSelectedPaymentMethod(null);

          expect(controller.state.selectedPaymentMethod).toBeNull();
        },
      );
    });
  });

  describe('triggerGetPaymentMethods', () => {
    const mockPaymentMethod: PaymentMethod = {
      id: '/payments/debit-credit-card',
      paymentType: 'debit-credit-card',
      name: 'Debit or Credit',
      score: 90,
      icon: 'card',
    };

    const mockPaymentMethodsResponse: PaymentMethodsResponse = {
      payments: [mockPaymentMethod],
    };

    it('calls getPaymentMethods without throwing', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us'),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getPaymentMethods',
            async () => mockPaymentMethodsResponse,
          );

          // Should not throw
          controller.triggerGetPaymentMethods({
            assetId: 'eip155:1/slip44:60',
            provider: '/providers/stripe',
          });

          // Wait for the async operation to complete
          await new Promise((resolve) => setTimeout(resolve, 0));

          expect(controller.state.paymentMethods).toStrictEqual([
            mockPaymentMethod,
          ]);
        },
      );
    });

    it('does not throw when getPaymentMethods fails', async () => {
      await withController(async ({ controller }) => {
        // Should not throw even when getPaymentMethods would fail (no region)
        expect(() => {
          controller.triggerGetPaymentMethods({
            assetId: 'eip155:1/slip44:60',
            provider: '/providers/stripe',
          });
        }).not.toThrow();

        // Wait for the async operation to complete
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
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
  | RampsServiceGetProvidersAction
  | RampsServiceGetPaymentMethodsAction,
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
      'RampsService:getPaymentMethods',
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
