import { deriveStateFromMetadata } from '@metamask/base-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import * as fs from 'fs';
import * as path from 'path';

import type {
  RampsControllerMessenger,
  RampsControllerState,
  ResourceState,
  UserRegion,
} from './RampsController';
import {
  RampsController,
  getDefaultRampsControllerState,
  RAMPS_CONTROLLER_REQUIRED_SERVICE_ACTIONS,
} from './RampsController';
import type {
  Country,
  TokensResponse,
  Provider,
  State,
  PaymentMethod,
  PaymentMethodsResponse,
  QuotesResponse,
  Quote,
  RampsToken,
} from './RampsService';
import type {
  RampsServiceGetGeolocationAction,
  RampsServiceGetCountriesAction,
  RampsServiceGetTokensAction,
  RampsServiceGetProvidersAction,
  RampsServiceGetPaymentMethodsAction,
  RampsServiceGetQuotesAction,
  RampsServiceGetBuyWidgetUrlAction,
} from './RampsService-method-action-types';
import { RequestStatus } from './RequestCache';

describe('RampsController', () => {
  describe('RAMPS_CONTROLLER_REQUIRED_SERVICE_ACTIONS', () => {
    it('includes every RampsService action that RampsController calls', async () => {
      expect.hasAssertions();
      const controllerPath = path.join(__dirname, 'RampsController.ts');
      const source = await fs.promises.readFile(controllerPath, 'utf-8');
      const callPattern =
        /messenger\.call\s*\(\s*['"](RampsService:[^'"]+)['"]/gu;
      const calledActions = new Set<string>();
      let match: RegExpExecArray | null;
      while ((match = callPattern.exec(source)) !== null) {
        calledActions.add(match[1]);
      }
      const requiredSet = new Set(
        RAMPS_CONTROLLER_REQUIRED_SERVICE_ACTIONS as readonly string[],
      );
      const missing = [...calledActions].filter((a) => !requiredSet.has(a));
      const extra = [...requiredSet].filter((a) => !calledActions.has(a));
      expect(missing).toHaveLength(0);
      expect(extra).toHaveLength(0);
    });
  });

  describe('constructor', () => {
    it('uses default state when no state is provided', async () => {
      await withController(({ controller }) => {
        expect(controller.state).toMatchInlineSnapshot(`
          {
            "countries": {
              "data": [],
              "error": null,
              "isLoading": false,
              "selected": null,
            },
            "paymentMethods": {
              "data": [],
              "error": null,
              "isLoading": false,
              "selected": null,
            },
            "providers": {
              "data": [],
              "error": null,
              "isLoading": false,
              "selected": null,
            },
            "quotes": {
              "data": null,
              "error": null,
              "isLoading": false,
              "selected": null,
            },
            "requests": {},
            "tokens": {
              "data": null,
              "error": null,
              "isLoading": false,
              "selected": null,
            },
            "userRegion": null,
            "widgetUrl": {
              "data": null,
              "error": null,
              "isLoading": false,
              "selected": null,
            },
          }
        `);
      });
    });

    it('accepts initial state', async () => {
      const givenState = {
        userRegion: createMockUserRegion('us-ca'),
      };

      await withController(
        { options: { state: givenState } },
        ({ controller }) => {
          expect(controller.state.userRegion?.regionCode).toBe('us-ca');
          expect(controller.state.providers.selected).toBeNull();
          expect(controller.state.tokens.data).toBeNull();
          expect(controller.state.requests).toStrictEqual({});
        },
      );
    });

    it('fills in missing initial state with defaults', async () => {
      await withController({ options: { state: {} } }, ({ controller }) => {
        expect(controller.state).toMatchInlineSnapshot(`
          {
            "countries": {
              "data": [],
              "error": null,
              "isLoading": false,
              "selected": null,
            },
            "paymentMethods": {
              "data": [],
              "error": null,
              "isLoading": false,
              "selected": null,
            },
            "providers": {
              "data": [],
              "error": null,
              "isLoading": false,
              "selected": null,
            },
            "quotes": {
              "data": null,
              "error": null,
              "isLoading": false,
              "selected": null,
            },
            "requests": {},
            "tokens": {
              "data": null,
              "error": null,
              "isLoading": false,
              "selected": null,
            },
            "userRegion": null,
            "widgetUrl": {
              "data": null,
              "error": null,
              "isLoading": false,
              "selected": null,
            },
          }
        `);
      });
    });

    it('always resets requests cache on initialization', async () => {
      const givenState = {
        userRegion: createMockUserRegion('us-ca'),
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

        expect(controller.state.providers.data).toStrictEqual([]);

        const result = await controller.getProviders('us-ca');

        expect(result.providers).toStrictEqual(mockProviders);
        expect(controller.state.providers.data).toStrictEqual(mockProviders);
      });
    });

    it('caches responses for the same region', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        let callCount = 0;
        rootMessenger.registerActionHandler(
          'RampsService:getProviders',
          async (_regionCode: string) => {
            callCount += 1;
            return { providers: mockProviders };
          },
        );

        await controller.getProviders('us-ca');
        await controller.getProviders('us-ca');

        expect(callCount).toBe(1);
      });
    });

    it('normalizes region case and caches with normalized key', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        let callCount = 0;
        rootMessenger.registerActionHandler(
          'RampsService:getProviders',
          async (regionCode: string) => {
            callCount += 1;
            expect(regionCode).toBe('us-ca');
            return { providers: mockProviders };
          },
        );

        await controller.getProviders('US-ca');
        await controller.getProviders('us-ca');

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

        await controller.getProviders('us-ca');
        await controller.getProviders('fr');

        expect(callCount).toBe(2);
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
            'RampsService:getProviders',
            async (regionCode: string) => {
              receivedRegion = regionCode;
              return { providers: mockProviders };
            },
          );

          await controller.getProviders('us-ca');

          expect(receivedRegion).toBe('us-ca');
        },
      );
    });

    it('updates providers when userRegion matches the requested region', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us-ca'),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getProviders',
            async (regionCode: string) => {
              expect(regionCode).toBe('us-ca');
              return { providers: mockProviders };
            },
          );

          expect(controller.state.userRegion?.regionCode).toBe('us-ca');
          expect(controller.state.providers.data).toStrictEqual([]);

          await controller.getProviders('US-ca');

          expect(controller.state.providers.data).toStrictEqual(mockProviders);
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
              userRegion: createMockUserRegion('us-ca'),
              providers: createResourceState(existingProviders, null),
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

          expect(controller.state.userRegion?.regionCode).toBe('us-ca');
          expect(controller.state.providers.data).toStrictEqual(
            existingProviders,
          );

          await controller.getProviders('fr');

          expect(controller.state.providers.data).toStrictEqual(
            existingProviders,
          );
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

        await controller.getProviders('us-ca', {
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
          'Region is required. Cannot proceed without valid region information.',
        );
      });
    });

    it('returns providers for region when state has providers (fetches and returns result)', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us-ca'),
              providers: createResourceState(mockProviders, null),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          let serviceCalled = false;
          rootMessenger.registerActionHandler(
            'RampsService:getProviders',
            async () => {
              serviceCalled = true;
              return { providers: mockProviders };
            },
          );

          const result = await controller.getProviders('us-ca');

          expect(serviceCalled).toBe(true);
          expect(result.providers).toStrictEqual(mockProviders);
        },
      );
    });

    it('calls service when getProviders is called with filter options even if state has providers', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us-ca'),
              providers: createResourceState(mockProviders, null),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          let serviceCalled = false;
          rootMessenger.registerActionHandler(
            'RampsService:getProviders',
            async () => {
              serviceCalled = true;
              return { providers: mockProviders };
            },
          );

          await controller.getProviders('us-ca', { provider: 'moonpay' });

          expect(serviceCalled).toBe(true);
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
          {
            "countries": {
              "data": [],
              "error": null,
              "isLoading": false,
              "selected": null,
            },
            "paymentMethods": {
              "data": [],
              "error": null,
              "isLoading": false,
              "selected": null,
            },
            "providers": {
              "data": [],
              "error": null,
              "isLoading": false,
              "selected": null,
            },
            "quotes": {
              "data": null,
              "error": null,
              "isLoading": false,
              "selected": null,
            },
            "requests": {},
            "tokens": {
              "data": null,
              "error": null,
              "isLoading": false,
              "selected": null,
            },
            "userRegion": null,
            "widgetUrl": {
              "data": null,
              "error": null,
              "isLoading": false,
              "selected": null,
            },
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
          {
            "countries": {
              "data": [],
              "error": null,
              "isLoading": false,
              "selected": null,
            },
            "paymentMethods": {
              "data": [],
              "error": null,
              "isLoading": false,
              "selected": null,
            },
            "providers": {
              "data": [],
              "error": null,
              "isLoading": false,
              "selected": null,
            },
            "tokens": {
              "data": null,
              "error": null,
              "isLoading": false,
              "selected": null,
            },
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
          {
            "countries": {
              "data": [],
              "error": null,
              "isLoading": false,
              "selected": null,
            },
            "providers": {
              "data": [],
              "error": null,
              "isLoading": false,
              "selected": null,
            },
            "tokens": {
              "data": null,
              "error": null,
              "isLoading": false,
              "selected": null,
            },
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
          {
            "countries": {
              "data": [],
              "error": null,
              "isLoading": false,
              "selected": null,
            },
            "paymentMethods": {
              "data": [],
              "error": null,
              "isLoading": false,
              "selected": null,
            },
            "providers": {
              "data": [],
              "error": null,
              "isLoading": false,
              "selected": null,
            },
            "quotes": {
              "data": null,
              "error": null,
              "isLoading": false,
              "selected": null,
            },
            "requests": {},
            "tokens": {
              "data": null,
              "error": null,
              "isLoading": false,
              "selected": null,
            },
            "userRegion": null,
            "widgetUrl": {
              "data": null,
              "error": null,
              "isLoading": false,
              "selected": null,
            },
          }
        `);
      });
    });
  });

  describe('executeRequest', () => {
    it('returns cached data when available and not expired', async () => {
      await withController(async ({ controller }) => {
        let callCount = 0;
        const fetcher = async (): Promise<string> => {
          callCount += 1;
          return 'cached-result';
        };

        await controller.executeRequest('cache-test-key', fetcher);
        expect(callCount).toBe(1);

        const result = await controller.executeRequest(
          'cache-test-key',
          fetcher,
        );
        expect(callCount).toBe(1);
        expect(result).toBe('cached-result');
      });
    });

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

    it('keeps resource isLoading true until last concurrent request (different cache keys) finishes', async () => {
      await withController(async ({ controller }) => {
        let resolveFirst: (value: string) => void;
        let resolveSecond: (value: string) => void;
        const fetcherA = async (): Promise<string> => {
          return new Promise<string>((resolve) => {
            resolveFirst = resolve;
          });
        };
        const fetcherB = async (): Promise<string> => {
          return new Promise<string>((resolve) => {
            resolveSecond = resolve;
          });
        };

        const promiseA = controller.executeRequest(
          'providers-key-a',
          fetcherA,
          { resourceType: 'providers' },
        );
        const promiseB = controller.executeRequest(
          'providers-key-b',
          fetcherB,
          { resourceType: 'providers' },
        );

        expect(controller.state.providers.isLoading).toBe(true);

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        resolveFirst!('result-a');
        await promiseA;

        expect(controller.state.providers.isLoading).toBe(true);

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        resolveSecond!('result-b');
        await promiseB;

        expect(controller.state.providers.isLoading).toBe(false);
      });
    });

    it('clears resource loading when ref-count hits zero even if map was cleared (defensive)', async () => {
      await withController(async ({ controller }) => {
        let resolveFetcher: (value: string) => void;
        const fetcher = async (): Promise<string> => {
          return new Promise<string>((resolve) => {
            resolveFetcher = resolve;
          });
        };

        const promise = controller.executeRequest(
          'providers-defensive-key',
          fetcher,
          { resourceType: 'providers' },
        );

        expect(controller.state.providers.isLoading).toBe(true);

        controller.clearPendingResourceCountForTest();

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        resolveFetcher!('result');
        await promise;

        expect(controller.state.providers.isLoading).toBe(false);
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
        supported: { buy: true, sell: true },
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
        supported: { buy: true, sell: false },
      },
    ];

    it('fetches countries from the service and saves to state', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        rootMessenger.registerActionHandler(
          'RampsService:getCountries',
          async () => mockCountries,
        );

        expect(controller.state.countries.data).toStrictEqual([]);

        const countries = await controller.getCountries();

        expect(countries).toMatchInlineSnapshot(`
          [
            {
              "currency": "USD",
              "flag": "🇺🇸",
              "isoCode": "US",
              "name": "United States of America",
              "phone": {
                "placeholder": "(555) 123-4567",
                "prefix": "+1",
                "template": "(XXX) XXX-XXXX",
              },
              "recommended": true,
              "supported": {
                "buy": true,
                "sell": true,
              },
            },
            {
              "currency": "EUR",
              "flag": "🇦🇹",
              "isoCode": "AT",
              "name": "Austria",
              "phone": {
                "placeholder": "660 1234567",
                "prefix": "+43",
                "template": "XXX XXXXXXX",
              },
              "supported": {
                "buy": true,
                "sell": false,
              },
            },
          ]
        `);
        expect(controller.state.countries.data).toStrictEqual(mockCountries);
      });
    });

    it('stores empty array when getCountries returns non-array (defensive)', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        rootMessenger.registerActionHandler(
          'RampsService:getCountries',
          async () => 'not an array' as unknown as Country[],
        );

        const countries = await controller.getCountries();

        expect(countries).toBe('not an array');
        expect(controller.state.countries.data).toStrictEqual([]);
      });
    });

    it('throws when updating resource field and resource is null', async () => {
      const stateWithNullCountries = {
        ...getDefaultRampsControllerState(),
        countries: null,
      } as unknown as RampsControllerState;

      await withController(
        {
          options: {
            state: stateWithNullCountries,
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getCountries',
            async () => mockCountries,
          );
          await expect(controller.getCountries()).rejects.toThrow(
            /Cannot set propert(y|ies) of null/u,
          );
        },
      );
    });
  });

  describe('init', () => {
    it('initializes controller by fetching countries and geolocation', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        rootMessenger.registerActionHandler(
          'RampsService:getGeolocation',
          async () => 'US-ca',
        );
        rootMessenger.registerActionHandler(
          'RampsService:getCountries',
          async () => createMockCountries(),
        );

        await controller.init();

        expect(controller.state.countries.data).toStrictEqual(
          createMockCountries(),
        );
        expect(controller.state.userRegion?.regionCode).toBe('us-ca');
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

          expect(controller.state.countries.data).toStrictEqual(
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
      const mockSelectedProvider: Provider = {
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
              countries: createResourceState(createMockCountries()),
              userRegion: createMockUserRegion('us-ca'),
              tokens: createResourceState(mockTokens, null),
              providers: createResourceState(
                mockProviders,
                mockSelectedProvider,
              ),
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
          expect(controller.state.userRegion?.regionCode).toBe('us-ca');
          expect(controller.state.tokens.data).toStrictEqual(mockTokens);
          expect(controller.state.providers.data).toStrictEqual(mockProviders);
          expect(controller.state.providers.selected).toStrictEqual(
            mockSelectedProvider,
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

    it('rejects when init fails with error that has no message', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        const errorWithoutMessage = Object.assign(new Error(), {
          code: 'ERR_NO_MESSAGE',
          message: undefined,
        }) as Error & { code: string };

        rootMessenger.registerActionHandler(
          'RampsService:getCountries',
          async () => {
            throw errorWithoutMessage;
          },
        );

        await expect(controller.init()).rejects.toMatchObject({
          code: 'ERR_NO_MESSAGE',
        });
      });
    });
  });

  describe('hydrateState', () => {
    it('triggers fetching tokens and providers for user region', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us-ca'),
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
          'Region is required. Cannot proceed without valid region information.',
        );
      });
    });

    it('calls getTokens and getProviders when hydrating even if state has data', async () => {
      const existingProviders: Provider[] = [
        {
          id: '/providers/test',
          name: 'Test Provider',
          environmentType: 'STAGING',
          description: 'Test',
          hqAddress: '123 Test St',
          links: [],
          logos: { light: '', dark: '', height: 24, width: 77 },
        },
      ];
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us-ca'),
              providers: createResourceState(existingProviders, null),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          let providersCalled = false;
          rootMessenger.registerActionHandler(
            'RampsService:getTokens',
            async () => ({ topTokens: [], allTokens: [] }),
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

          expect(providersCalled).toBe(true);
        },
      );
    });
  });

  describe('setUserRegion', () => {
    it('sets user region manually using countries from state', async () => {
      await withController(
        {
          options: {
            state: {
              countries: createResourceState(createMockCountries()),
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

      const mockSelectedProvider: Provider = {
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
      };

      await withController(
        {
          options: {
            state: {
              countries: createResourceState(createMockCountries()),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          const mockTokens: TokensResponse = {
            topTokens: [],
            allTokens: [],
          };
          const mockProviders: Provider[] = [mockSelectedProvider];

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

          await controller.setUserRegion('US-ca');
          await new Promise((resolve) => setTimeout(resolve, 50));
          await controller.getPaymentMethods('us-ca');
          controller.setSelectedPaymentMethod(mockPaymentMethod.id);

          expect(controller.state.tokens.data).toStrictEqual(mockTokens);
          expect(controller.state.providers.data).toStrictEqual(mockProviders);
          expect(controller.state.paymentMethods.data).toStrictEqual([
            mockPaymentMethod,
          ]);
          expect(controller.state.paymentMethods.selected).toStrictEqual(
            mockPaymentMethod,
          );

          providersToReturn = [];
          await controller.setUserRegion('FR');
          await new Promise((resolve) => setTimeout(resolve, 50));
          expect(controller.state.tokens.data).toStrictEqual(mockTokens);
          expect(controller.state.providers.data).toStrictEqual([]);
          expect(controller.state.paymentMethods.data).toStrictEqual([]);
          expect(controller.state.paymentMethods.selected).toBeNull();
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
      const mockSelectedProvider: Provider = {
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
              countries: createResourceState(createMockCountries()),
              userRegion: createMockUserRegion('us-ca'),
              tokens: createResourceState(mockTokens, null),
              providers: createResourceState(
                mockProviders,
                mockSelectedProvider,
              ),
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
          await controller.setUserRegion('US-ca');

          // Verify persisted state is preserved
          expect(controller.state.userRegion?.regionCode).toBe('us-ca');
          expect(controller.state.tokens.data).toStrictEqual(mockTokens);
          expect(controller.state.providers.data).toStrictEqual(mockProviders);
          expect(controller.state.providers.selected).toStrictEqual(
            mockSelectedProvider,
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
      const mockSelectedProvider: Provider = {
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
      const mockSelectedToken = {
        assetId: 'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        chainId: 'eip155:1',
        name: 'USD Coin',
        symbol: 'USDC',
        decimals: 6,
        iconUrl: 'https://example.com/usdc.png',
        tokenSupported: true,
      };

      await withController(
        {
          options: {
            state: {
              countries: createResourceState(createMockCountries()),
              userRegion: createMockUserRegion('us-ca'),
              tokens: createResourceState(mockTokens, mockSelectedToken),
              providers: createResourceState(
                mockProviders,
                mockSelectedProvider,
              ),
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
          expect(controller.state.tokens.data).toBeNull();
          expect(controller.state.providers.data).toStrictEqual([]);
          expect(controller.state.providers.selected).toBeNull();
          expect(controller.state.tokens.selected).toBeNull();
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
          supported: { buy: true, sell: true },
          states: [
            {
              stateId: 'CA',
              name: 'California',
              supported: { buy: true, sell: true },
            },
          ],
        },
      ];

      await withController(
        {
          options: {
            state: {
              countries: createResourceState(countriesWithId),
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
          supported: { buy: true, sell: true },
        },
      ];

      await withController(
        {
          options: {
            state: {
              countries: createResourceState(countriesWithId),
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
          supported: { buy: true, sell: true },
          states: [
            {
              stateId: 'CA',
              name: 'California',
              supported: { buy: true, sell: true },
            },
          ],
        },
      ];

      await withController(
        {
          options: {
            state: {
              countries: createResourceState(countriesWithId),
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
          supported: { buy: true, sell: true },
        },
      ];

      await withController(
        {
          options: {
            state: {
              countries: createResourceState(countries),
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
        await expect(controller.setUserRegion('us-ca')).rejects.toThrow(
          'No countries found. Cannot set user region without valid country information.',
        );

        expect(controller.state.userRegion).toBeNull();
        expect(controller.state.tokens.data).toBeNull();
      });
    });

    it('clears pre-existing userRegion when countries are not in state', async () => {
      await withController(
        {
          options: {
            state: {
              countries: createResourceState([]),
              userRegion: createMockUserRegion('us-ca'),
            },
          },
        },
        async ({ controller }) => {
          await expect(controller.setUserRegion('FR')).rejects.toThrow(
            'No countries found. Cannot set user region without valid country information.',
          );

          expect(controller.state.userRegion).toBeNull();
          expect(controller.state.tokens.data).toBeNull();
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
          supported: { buy: true, sell: true },
          states: [
            {
              id: '/regions/us-ny',
              name: 'New York',
              supported: { buy: true, sell: true },
            },
          ],
        },
      ];

      await withController(
        {
          options: {
            state: {
              countries: createResourceState(countriesWithStateId),
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
          supported: { buy: true, sell: true },
          states: [
            {
              id: '/some/path/ca',
              name: 'California',
              supported: { buy: true, sell: true },
            },
          ],
        },
      ];

      await withController(
        {
          options: {
            state: {
              countries: createResourceState(countriesWithStateId),
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
          supported: { buy: true, sell: true },
          states: [
            {
              stateId: 'CA',
              name: 'California',
              supported: { buy: true, sell: true },
            },
            {
              stateId: 'NY',
              name: 'New York',
              supported: { buy: true, sell: true },
            },
          ],
        },
      ];

      await withController(
        {
          options: {
            state: {
              countries: createResourceState(countriesWithStates),
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

  describe('setSelectedProvider', () => {
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

    it('sets selected provider by ID', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us-ca'),
              providers: createResourceState([mockProvider], null),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getPaymentMethods',
            async () => ({ payments: [] }),
          );

          expect(controller.state.providers.selected).toBeNull();

          controller.setSelectedProvider(mockProvider.id);

          expect(controller.state.providers.selected).toStrictEqual(
            mockProvider,
          );
        },
      );
    });

    it('clears selected provider, paymentMethods, and selectedPaymentMethod when null is provided', async () => {
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
              userRegion: createMockUserRegion('us-ca'),
              providers: createResourceState([mockProvider], mockProvider),
              paymentMethods: createResourceState(
                [mockPaymentMethod],
                mockPaymentMethod,
              ),
            },
          },
        },
        ({ controller }) => {
          expect(controller.state.providers.selected).toStrictEqual(
            mockProvider,
          );
          expect(controller.state.paymentMethods.data).toStrictEqual([
            mockPaymentMethod,
          ]);
          expect(controller.state.paymentMethods.selected).toStrictEqual(
            mockPaymentMethod,
          );

          controller.setSelectedProvider(null);

          expect(controller.state.providers.selected).toBeNull();
          expect(controller.state.paymentMethods.data).toStrictEqual([]);
          expect(controller.state.paymentMethods.selected).toBeNull();
          expect(controller.state.paymentMethods.isLoading).toBe(false);
          expect(controller.state.paymentMethods.error).toBeNull();
        },
      );
    });

    it('throws error when region is not set', async () => {
      await withController(
        {
          options: {
            state: {
              providers: createResourceState([mockProvider], null),
            },
          },
        },
        ({ controller }) => {
          expect(() => {
            controller.setSelectedProvider(mockProvider.id);
          }).toThrow(
            'Region is required. Cannot proceed without valid region information.',
          );
        },
      );
    });

    it('throws error when providers are not loaded', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us-ca'),
            },
          },
        },
        ({ controller }) => {
          expect(() => {
            controller.setSelectedProvider(mockProvider.id);
          }).toThrow(
            'Providers not loaded. Cannot set selected provider before providers are fetched.',
          );
        },
      );
    });

    it('throws error when provider is not found', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us-ca'),
              providers: createResourceState([mockProvider], null),
            },
          },
        },
        ({ controller }) => {
          expect(() => {
            controller.setSelectedProvider('/providers/nonexistent');
          }).toThrow(
            'Provider with ID "/providers/nonexistent" not found in available providers.',
          );
        },
      );
    });

    it('updates selected provider and clears payment methods when a new provider is set', async () => {
      const newProvider: Provider = {
        ...mockProvider,
        id: '/providers/ramp-network-staging',
        name: 'Ramp Network (Staging)',
      };

      const existingPaymentMethod: PaymentMethod = {
        id: '/payments/existing-card',
        paymentType: 'debit-credit-card',
        name: 'Existing Card',
        score: 90,
        icon: 'card',
      };

      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us-ca'),
              providers: createResourceState(
                [mockProvider, newProvider],
                mockProvider,
              ),
              paymentMethods: createResourceState(
                [existingPaymentMethod],
                existingPaymentMethod,
              ),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getPaymentMethods',
            async () => ({ payments: [] }),
          );

          expect(controller.state.paymentMethods.data).toStrictEqual([
            existingPaymentMethod,
          ]);
          expect(controller.state.paymentMethods.selected).toStrictEqual(
            existingPaymentMethod,
          );

          controller.setSelectedProvider(newProvider.id);

          expect(controller.state.providers.selected).toStrictEqual(
            newProvider,
          );
          expect(controller.state.providers.selected?.id).toBe(
            '/providers/ramp-network-staging',
          );
          expect(controller.state.paymentMethods.data).toStrictEqual([]);
          expect(controller.state.paymentMethods.selected).toBeNull();
        },
      );
    });
  });

  describe('setSelectedToken', () => {
    const mockToken: RampsToken = {
      assetId: 'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      chainId: 'eip155:1',
      name: 'USD Coin',
      symbol: 'USDC',
      decimals: 6,
      iconUrl: 'https://example.com/usdc.png',
      tokenSupported: true,
    };

    const mockTokensResponse: TokensResponse = {
      topTokens: [mockToken],
      allTokens: [mockToken],
    };

    const mockPaymentMethod: PaymentMethod = {
      id: '/payments/debit-credit-card',
      paymentType: 'debit-credit-card',
      name: 'Debit or Credit',
      score: 90,
      icon: 'card',
    };

    it('sets selected token by asset ID', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us-ca'),
              tokens: createResourceState(mockTokensResponse, null),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getPaymentMethods',
            async () => ({ payments: [] }),
          );

          expect(controller.state.tokens.selected).toBeNull();

          controller.setSelectedToken(mockToken.assetId);

          expect(controller.state.tokens.selected).toStrictEqual(mockToken);
        },
      );
    });

    it('clears selected token when called without asset ID', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us-ca'),
              tokens: createResourceState(mockTokensResponse, mockToken),
              paymentMethods: createResourceState(
                [mockPaymentMethod],
                mockPaymentMethod,
              ),
            },
          },
        },
        ({ controller }) => {
          expect(controller.state.tokens.selected).toStrictEqual(mockToken);
          expect(controller.state.paymentMethods.data).toHaveLength(1);
          expect(controller.state.paymentMethods.selected).not.toBeNull();

          controller.setSelectedToken(undefined);

          expect(controller.state.tokens.selected).toBeNull();
          expect(controller.state.paymentMethods.data).toStrictEqual([]);
          expect(controller.state.paymentMethods.selected).toBeNull();
          expect(controller.state.paymentMethods.isLoading).toBe(false);
          expect(controller.state.paymentMethods.error).toBeNull();
        },
      );
    });

    it('throws error when region is not set', async () => {
      await withController(
        {
          options: {
            state: {
              tokens: createResourceState(mockTokensResponse, null),
            },
          },
        },
        async ({ controller }) => {
          expect(() => controller.setSelectedToken(mockToken.assetId)).toThrow(
            'Region is required. Cannot proceed without valid region information.',
          );
        },
      );
    });

    it('throws error when tokens are not loaded', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us-ca'),
            },
          },
        },
        async ({ controller }) => {
          expect(() => controller.setSelectedToken(mockToken.assetId)).toThrow(
            'Tokens not loaded. Cannot set selected token before tokens are fetched.',
          );
        },
      );
    });

    it('throws error when token is not found', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us-ca'),
              tokens: createResourceState(mockTokensResponse, null),
            },
          },
        },
        async ({ controller }) => {
          expect(() =>
            controller.setSelectedToken('eip155:1/erc20:0xNONEXISTENT'),
          ).toThrow(
            'Token with asset ID "eip155:1/erc20:0xNONEXISTENT" not found in available tokens.',
          );
        },
      );
    });

    it('triggers getPaymentMethods with token assetId', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us-ca'),
              tokens: createResourceState(mockTokensResponse, null),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          let receivedAssetId: string | undefined;
          rootMessenger.registerActionHandler(
            'RampsService:getPaymentMethods',
            async (options: {
              region: string;
              fiat: string;
              assetId: string;
              provider: string;
            }) => {
              receivedAssetId = options.assetId;
              return { payments: [] };
            },
          );

          controller.setSelectedToken(mockToken.assetId);
          await new Promise((resolve) => setTimeout(resolve, 10));

          expect(receivedAssetId).toBe(mockToken.assetId);
        },
      );
    });

    it('updates selected token and clears payment methods when a new token is set', async () => {
      const newToken: RampsToken = {
        ...mockToken,
        assetId: 'eip155:1/erc20:0xdAC17F958D2ee523a2206206994597C13D831ec7',
        name: 'Tether USD',
        symbol: 'USDT',
      };

      const tokensWithBoth: TokensResponse = {
        topTokens: [mockToken],
        allTokens: [mockToken, newToken],
      };

      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us-ca'),
              tokens: createResourceState(tokensWithBoth, mockToken),
              paymentMethods: createResourceState(
                [mockPaymentMethod],
                mockPaymentMethod,
              ),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getPaymentMethods',
            async () => ({ payments: [] }),
          );

          expect(controller.state.paymentMethods.data).toStrictEqual([
            mockPaymentMethod,
          ]);
          expect(controller.state.paymentMethods.selected).toStrictEqual(
            mockPaymentMethod,
          );

          controller.setSelectedToken(newToken.assetId);

          expect(controller.state.tokens.selected).toStrictEqual(newToken);
          expect(controller.state.paymentMethods.data).toStrictEqual([]);
          expect(controller.state.paymentMethods.selected).toBeNull();
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

        expect(controller.state.tokens.data).toBeNull();

        const tokens = await controller.getTokens('us-ca', 'buy');

        expect(tokens).toMatchInlineSnapshot(`
          {
            "allTokens": [
              {
                "assetId": "eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                "chainId": "eip155:1",
                "decimals": 6,
                "iconUrl": "https://example.com/usdc.png",
                "name": "USD Coin",
                "symbol": "USDC",
                "tokenSupported": true,
              },
              {
                "assetId": "eip155:1/erc20:0xdAC17F958D2ee523a2206206994597C13D831ec7",
                "chainId": "eip155:1",
                "decimals": 6,
                "iconUrl": "https://example.com/usdt.png",
                "name": "Tether USD",
                "symbol": "USDT",
                "tokenSupported": true,
              },
            ],
            "topTokens": [
              {
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
        expect(controller.state.tokens.data).toStrictEqual(mockTokens);
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

        await controller.getTokens('us-ca', 'sell');

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

        await controller.getTokens('us-ca');

        expect(receivedAction).toBe('buy');
      });
    });

    it('normalizes region case when calling service', async () => {
      await withController(async ({ controller, rootMessenger }) => {
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

        await controller.getTokens('US-ca', 'buy');

        expect(receivedRegion).toBe('us-ca');
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

        await controller.getTokens('us-ca', 'buy');
        await controller.getTokens('us-ca', 'sell');

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

        await controller.getTokens('us-ca', 'buy');
        await controller.getTokens('fr', 'buy');

        expect(callCount).toBe(2);
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
          'Region is required. Cannot proceed without valid region information.',
        );
      });
    });

    it('returns tokens for region when state has tokens (fetches and returns result)', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us-ca'),
              tokens: createResourceState(mockTokens, null),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          let serviceCalled = false;
          rootMessenger.registerActionHandler(
            'RampsService:getTokens',
            async () => {
              serviceCalled = true;
              return mockTokens;
            },
          );

          const result = await controller.getTokens('us-ca', 'buy');

          expect(serviceCalled).toBe(true);
          expect(result).toStrictEqual(mockTokens);
        },
      );
    });

    it('calls service when getTokens is called with provider filter even if state has tokens', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us-ca'),
              tokens: createResourceState(mockTokens, null),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          let serviceCalled = false;
          rootMessenger.registerActionHandler(
            'RampsService:getTokens',
            async () => {
              serviceCalled = true;
              return mockTokens;
            },
          );

          await controller.getTokens('us-ca', 'buy', { provider: 'moonpay' });

          expect(serviceCalled).toBe(true);
        },
      );
    });

    it('prefers provided region over userRegion in state', async () => {
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

          await controller.getTokens('us-ca', 'buy');

          expect(receivedRegion).toBe('us-ca');
        },
      );
    });

    it('updates tokens when userRegion matches the requested region', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us-ca'),
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
              expect(region).toBe('us-ca');
              return mockTokens;
            },
          );

          expect(controller.state.userRegion?.regionCode).toBe('us-ca');
          expect(controller.state.tokens.data).toBeNull();

          await controller.getTokens('US-ca');

          expect(controller.state.tokens.data).toStrictEqual(mockTokens);
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
              userRegion: createMockUserRegion('us-ca'),
              tokens: createResourceState(existingTokens, null),
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

          expect(controller.state.userRegion?.regionCode).toBe('us-ca');
          expect(controller.state.tokens.data).toStrictEqual(existingTokens);

          await controller.getTokens('fr');

          expect(controller.state.tokens.data).toStrictEqual(existingTokens);
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

        await controller.getTokens('us-ca', 'buy', { provider: 'provider-id' });

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

        await controller.getTokens('us-ca', 'buy', { provider: 'provider-1' });
        await controller.getTokens('us-ca', 'buy', { provider: 'provider-2' });

        expect(callCount).toBe(2);
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

        await controller.getTokens('us-ca', 'buy');
        await controller.getTokens('us-ca', 'buy', { provider: 'provider-1' });

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

    const mockSelectedToken: RampsToken = {
      assetId: 'eip155:1/slip44:60',
      chainId: 'eip155:1',
      name: 'Ethereum',
      symbol: 'ETH',
      decimals: 18,
      iconUrl: 'https://example.com/eth.png',
      tokenSupported: true,
    };

    const mockSelectedProvider: Provider = {
      id: '/providers/stripe',
      name: 'Stripe',
      environmentType: 'PRODUCTION',
      description: 'Stripe payment provider',
      hqAddress: '123 Test St',
      links: [],
      logos: {
        light: '/assets/stripe_light.png',
        dark: '/assets/stripe_dark.png',
        height: 24,
        width: 77,
      },
    };

    it('preserves selectedPaymentMethod when it exists in the new payment methods list', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us-ca'),
              paymentMethods: createResourceState(
                [mockPaymentMethod1, mockPaymentMethod2],
                mockPaymentMethod1,
              ),
              tokens: createResourceState(null, mockSelectedToken),
              providers: createResourceState([], mockSelectedProvider),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getPaymentMethods',
            async () => mockPaymentMethodsResponse,
          );

          expect(controller.state.paymentMethods.selected).toStrictEqual(
            mockPaymentMethod1,
          );

          await controller.getPaymentMethods('us-ca', {
            assetId: 'eip155:1/slip44:60',
            provider: '/providers/stripe',
          });

          expect(controller.state.paymentMethods.selected).toStrictEqual(
            mockPaymentMethod1,
          );
          expect(controller.state.paymentMethods.data).toStrictEqual([
            mockPaymentMethod1,
            mockPaymentMethod2,
          ]);
        },
      );
    });

    it('resets selectedPaymentMethod to first item when it no longer exists in the new payment methods list', async () => {
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
              userRegion: createMockUserRegion('us-ca'),
              paymentMethods: createResourceState(
                [removedPaymentMethod],
                removedPaymentMethod,
              ),
              tokens: createResourceState(null, mockSelectedToken),
              providers: createResourceState([], mockSelectedProvider),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getPaymentMethods',
            async () => mockPaymentMethodsResponse,
          );

          expect(controller.state.paymentMethods.selected).toStrictEqual(
            removedPaymentMethod,
          );

          await controller.getPaymentMethods('us-ca', {
            assetId: 'eip155:1/slip44:60',
            provider: '/providers/stripe',
          });

          expect(controller.state.paymentMethods.selected).toStrictEqual(
            mockPaymentMethod1,
          );
          expect(controller.state.paymentMethods.data).toStrictEqual([
            mockPaymentMethod1,
            mockPaymentMethod2,
          ]);
        },
      );
    });

    it('auto-selects first payment method when selectedPaymentMethod is null', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us-ca'),
              paymentMethods: createResourceState([], null),
              tokens: createResourceState(null, mockSelectedToken),
              providers: createResourceState([], mockSelectedProvider),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getPaymentMethods',
            async () => mockPaymentMethodsResponse,
          );

          expect(controller.state.paymentMethods.selected).toBeNull();

          await controller.getPaymentMethods('us-ca', {
            assetId: 'eip155:1/slip44:60',
            provider: '/providers/stripe',
          });

          expect(controller.state.paymentMethods.selected).toStrictEqual(
            mockPaymentMethod1,
          );
          expect(controller.state.paymentMethods.data).toStrictEqual([
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
              userRegion: createMockUserRegion('us-ca'),
              tokens: createResourceState(null, mockSelectedToken),
              providers: createResourceState([], mockSelectedProvider),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getPaymentMethods',
            async () => mockPaymentMethodsResponse,
          );

          expect(controller.state.paymentMethods.data).toStrictEqual([]);

          await controller.getPaymentMethods('us-ca', {
            assetId: 'eip155:1/slip44:60',
            provider: '/providers/stripe',
          });

          expect(controller.state.paymentMethods.data).toStrictEqual([
            mockPaymentMethod1,
            mockPaymentMethod2,
          ]);
        },
      );
    });

    it('passes the region parameter to the service', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us-ca'),
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

          await controller.getPaymentMethods('fr', {
            assetId: 'eip155:1/slip44:60',
            provider: '/providers/stripe',
          });

          expect(receivedRegion).toBe('fr');
        },
      );
    });

    it('throws error when fiat is not provided and userRegion has no currency', async () => {
      const regionWithoutCurrency: UserRegion = {
        country: {
          isoCode: 'US',
          name: 'United States',
          flag: '🇺🇸',
          currency: undefined as unknown as string,
          phone: { prefix: '+1', placeholder: '', template: '' },
          supported: { buy: true, sell: true },
        },
        state: null,
        regionCode: 'us-ca',
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
            controller.getPaymentMethods('us-ca', {
              assetId: 'eip155:1/slip44:60',
              provider: '/providers/stripe',
            }),
          ).rejects.toThrow(
            'Fiat currency is required. Either provide a fiat parameter or ensure userRegion is set in controller state.',
          );
        },
      );
    });

    it('uses selectedToken assetId from state when assetId is not provided', async () => {
      const mockToken: RampsToken = {
        assetId: 'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        chainId: 'eip155:1',
        name: 'USD Coin',
        symbol: 'USDC',
        decimals: 6,
        iconUrl: 'https://example.com/usdc.png',
        tokenSupported: true,
      };

      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us-ca'),
              tokens: createResourceState(null, mockToken),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          let receivedAssetId: string | undefined;
          rootMessenger.registerActionHandler(
            'RampsService:getPaymentMethods',
            async (options: {
              region: string;
              fiat: string;
              assetId: string;
              provider: string;
            }) => {
              receivedAssetId = options.assetId;
              return { payments: [] };
            },
          );

          await controller.getPaymentMethods('us-ca', {
            provider: '/providers/stripe',
          });

          expect(receivedAssetId).toBe(mockToken.assetId);
        },
      );
    });

    it('uses selectedProvider id from state when provider is not provided', async () => {
      const testProvider: Provider = {
        id: '/providers/paypal-staging',
        name: 'PayPal (Staging)',
        environmentType: 'STAGING',
        description: 'Test provider',
        hqAddress: '123 Test St',
        links: [],
        logos: {
          light: '/assets/paypal_light.png',
          dark: '/assets/paypal_dark.png',
          height: 24,
          width: 77,
        },
      };

      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us-ca'),
              providers: createResourceState([], testProvider),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          let receivedProvider: string | undefined;
          rootMessenger.registerActionHandler(
            'RampsService:getPaymentMethods',
            async (options: {
              region: string;
              fiat: string;
              assetId: string;
              provider: string;
            }) => {
              receivedProvider = options.provider;
              return { payments: [] };
            },
          );

          await controller.getPaymentMethods('us-ca', {
            assetId: 'eip155:1/slip44:60',
          });

          expect(receivedProvider).toBe(testProvider.id);
        },
      );
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
              return { payments: [] };
            },
          );

          await controller.getPaymentMethods(undefined, {
            assetId: 'eip155:1/slip44:60',
            provider: '/providers/stripe',
          });

          expect(receivedRegion).toBe('fr');
        },
      );
    });

    it('sets selectedPaymentMethod to null when empty payments list is returned and current selection is invalid', async () => {
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
              userRegion: createMockUserRegion('us-ca'),
              paymentMethods: createResourceState(
                [removedPaymentMethod],
                removedPaymentMethod,
              ),
              tokens: createResourceState(null, mockSelectedToken),
              providers: createResourceState([], mockSelectedProvider),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getPaymentMethods',
            async () => ({ payments: [] }),
          );

          await controller.getPaymentMethods('us-ca', {
            assetId: 'eip155:1/slip44:60',
            provider: '/providers/stripe',
          });

          expect(controller.state.paymentMethods.selected).toBeNull();
          expect(controller.state.paymentMethods.data).toStrictEqual([]);
        },
      );
    });

    it('throws error when region is not provided and userRegion is not set', async () => {
      await withController(async ({ controller }) => {
        await expect(
          controller.getPaymentMethods(undefined, {
            assetId: 'eip155:1/slip44:60',
            provider: '/providers/stripe',
          }),
        ).rejects.toThrow(
          'Region is required. Cannot proceed without valid region information.',
        );
      });
    });

    it('uses empty strings when neither options nor state has assetId or provider', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us-ca'),
              tokens: createResourceState(null, null),
              providers: createResourceState([], null),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          let receivedAssetId: string | undefined;
          let receivedProvider: string | undefined;
          rootMessenger.registerActionHandler(
            'RampsService:getPaymentMethods',
            async (options: {
              region: string;
              fiat: string;
              assetId: string;
              provider: string;
            }) => {
              receivedAssetId = options.assetId;
              receivedProvider = options.provider;
              return { payments: [] };
            },
          );

          await controller.getPaymentMethods('us-ca');

          expect(receivedAssetId).toBe('');
          expect(receivedProvider).toBe('');
        },
      );
    });

    it('does not update paymentMethods when selectedToken changes during request', async () => {
      const tokenA: RampsToken = {
        assetId: 'eip155:1/erc20:0xTokenA',
        chainId: 'eip155:1',
        name: 'Token A',
        symbol: 'TOKA',
        decimals: 18,
        iconUrl: 'https://example.com/toka.png',
        tokenSupported: true,
      };

      const tokenB: RampsToken = {
        assetId: 'eip155:1/erc20:0xTokenB',
        chainId: 'eip155:1',
        name: 'Token B',
        symbol: 'TOKB',
        decimals: 18,
        iconUrl: 'https://example.com/tokb.png',
        tokenSupported: true,
      };

      const paymentMethodsForTokenA: PaymentMethod[] = [
        {
          id: '/payments/token-a',
          paymentType: 'debit-credit-card',
          name: 'Payment Method for Token A',
          score: 90,
          icon: 'card',
        },
      ];

      const paymentMethodsForTokenB: PaymentMethod[] = [
        {
          id: '/payments/token-b',
          paymentType: 'bank-transfer',
          name: 'Payment Method for Token B',
          score: 95,
          icon: 'bank',
        },
      ];

      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us-ca'),
              tokens: createResourceState(
                {
                  topTokens: [tokenA, tokenB],
                  allTokens: [tokenA, tokenB],
                },
                tokenA,
              ),
              providers: createResourceState([], null),
              paymentMethods: createResourceState([], null),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          let resolveTokenARequest: (value: {
            payments: PaymentMethod[];
          }) => void = () => {
            // Will be replaced by Promise constructor
          };
          const tokenARequestPromise = new Promise<{
            payments: PaymentMethod[];
          }>((resolve) => {
            resolveTokenARequest = resolve;
          });

          let callCount = 0;
          rootMessenger.registerActionHandler(
            'RampsService:getPaymentMethods',
            async (options: { assetId: string }) => {
              callCount += 1;
              if (options.assetId === tokenA.assetId) {
                return tokenARequestPromise;
              }
              return { payments: paymentMethodsForTokenB };
            },
          );

          const tokenAPaymentMethodsPromise = controller.getPaymentMethods(
            'us-ca',
            {
              assetId: tokenA.assetId,
            },
          );

          controller.setSelectedToken(tokenB.assetId);

          resolveTokenARequest({ payments: paymentMethodsForTokenA });
          await tokenAPaymentMethodsPromise;
          await new Promise((resolve) => setTimeout(resolve, 10));

          expect(controller.state.tokens.selected).toStrictEqual(tokenB);
          expect(controller.state.paymentMethods.data).toStrictEqual(
            paymentMethodsForTokenB,
          );
          expect(callCount).toBe(2);
        },
      );
    });

    it('does not update paymentMethods when selectedProvider changes during request', async () => {
      const providerA: Provider = {
        id: '/providers/provider-a',
        name: 'Provider A',
        environmentType: 'STAGING',
        description: 'Provider A description',
        hqAddress: '123 Provider A St',
        links: [],
        logos: {
          light: '/assets/provider_a_light.png',
          dark: '/assets/provider_a_dark.png',
          height: 24,
          width: 77,
        },
      };

      const providerB: Provider = {
        id: '/providers/provider-b',
        name: 'Provider B',
        environmentType: 'STAGING',
        description: 'Provider B description',
        hqAddress: '456 Provider B St',
        links: [],
        logos: {
          light: '/assets/provider_b_light.png',
          dark: '/assets/provider_b_dark.png',
          height: 24,
          width: 77,
        },
      };

      const paymentMethodsForProviderA: PaymentMethod[] = [
        {
          id: '/payments/provider-a',
          paymentType: 'debit-credit-card',
          name: 'Payment Method for Provider A',
          score: 90,
          icon: 'card',
        },
      ];

      const paymentMethodsForProviderB: PaymentMethod[] = [
        {
          id: '/payments/provider-b',
          paymentType: 'bank-transfer',
          name: 'Payment Method for Provider B',
          score: 95,
          icon: 'bank',
        },
      ];

      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us-ca'),
              tokens: createResourceState(null, null),
              providers: createResourceState([providerA, providerB], providerA),
              paymentMethods: createResourceState([], null),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          let resolveProviderARequest: (value: {
            payments: PaymentMethod[];
          }) => void = () => {
            // Will be replaced by Promise constructor
          };
          const providerARequestPromise = new Promise<{
            payments: PaymentMethod[];
          }>((resolve) => {
            resolveProviderARequest = resolve;
          });

          let callCount = 0;
          rootMessenger.registerActionHandler(
            'RampsService:getPaymentMethods',
            async (options: { provider: string }) => {
              callCount += 1;
              if (options.provider === providerA.id) {
                return providerARequestPromise;
              }
              return { payments: paymentMethodsForProviderB };
            },
          );

          const providerAPaymentMethodsPromise = controller.getPaymentMethods(
            'us-ca',
            {
              provider: providerA.id,
            },
          );

          controller.setSelectedProvider(providerB.id);

          resolveProviderARequest({ payments: paymentMethodsForProviderA });
          await providerAPaymentMethodsPromise;
          await new Promise((resolve) => setTimeout(resolve, 10));

          expect(controller.state.providers.selected).toStrictEqual(providerB);
          expect(controller.state.paymentMethods.data).toStrictEqual(
            paymentMethodsForProviderB,
          );
          expect(callCount).toBe(2);
        },
      );
    });

    it('updates paymentMethods when selectedToken and selectedProvider match the request', async () => {
      const token: RampsToken = {
        assetId: 'eip155:1/erc20:0xToken',
        chainId: 'eip155:1',
        name: 'Token',
        symbol: 'TOK',
        decimals: 18,
        iconUrl: 'https://example.com/tok.png',
        tokenSupported: true,
      };

      const provider: Provider = {
        id: '/providers/test-provider',
        name: 'Test Provider',
        environmentType: 'STAGING',
        description: 'Test provider',
        hqAddress: '123 Test St',
        links: [],
        logos: {
          light: '/assets/test_light.png',
          dark: '/assets/test_dark.png',
          height: 24,
          width: 77,
        },
      };

      const newPaymentMethods: PaymentMethod[] = [
        {
          id: '/payments/new',
          paymentType: 'debit-credit-card',
          name: 'New Payment Method',
          score: 95,
          icon: 'card',
        },
      ];

      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us-ca'),
              tokens: createResourceState(null, token),
              providers: createResourceState([], provider),
              paymentMethods: createResourceState([], null),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getPaymentMethods',
            async () => ({ payments: newPaymentMethods }),
          );

          await controller.getPaymentMethods('us-ca', {
            assetId: token.assetId,
            provider: provider.id,
          });

          expect(controller.state.tokens.selected).toStrictEqual(token);
          expect(controller.state.providers.selected).toStrictEqual(provider);
          expect(controller.state.paymentMethods.data).toStrictEqual(
            newPaymentMethods,
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

    it('sets the selected payment method by ID', async () => {
      await withController(
        {
          options: {
            state: {
              paymentMethods: createResourceState([mockPaymentMethod], null),
            },
          },
        },
        ({ controller }) => {
          expect(controller.state.paymentMethods.selected).toBeNull();

          controller.setSelectedPaymentMethod(mockPaymentMethod.id);

          expect(controller.state.paymentMethods.selected).toStrictEqual(
            mockPaymentMethod,
          );
        },
      );
    });

    it('clears the selected payment method when null is passed', async () => {
      await withController(
        {
          options: {
            state: {
              paymentMethods: createResourceState(
                [mockPaymentMethod],
                mockPaymentMethod,
              ),
            },
          },
        },
        ({ controller }) => {
          expect(controller.state.paymentMethods.selected).toStrictEqual(
            mockPaymentMethod,
          );

          controller.setSelectedPaymentMethod(undefined);

          expect(controller.state.paymentMethods.selected).toBeNull();
        },
      );
    });

    it('throws error when payment methods are not loaded', async () => {
      await withController(({ controller }) => {
        expect(() => {
          controller.setSelectedPaymentMethod(mockPaymentMethod.id);
        }).toThrow(
          'Payment methods not loaded. Cannot set selected payment method before payment methods are fetched.',
        );
      });
    });

    it('throws error when payment method is not found', async () => {
      await withController(
        {
          options: {
            state: {
              paymentMethods: createResourceState([mockPaymentMethod], null),
            },
          },
        },
        ({ controller }) => {
          expect(() => {
            controller.setSelectedPaymentMethod('/payments/nonexistent');
          }).toThrow(
            'Payment method with ID "/payments/nonexistent" not found in available payment methods.',
          );
        },
      );
    });
  });

  describe('getQuotes', () => {
    const mockQuotesResponse: QuotesResponse = {
      success: [
        {
          provider: '/providers/moonpay',
          quote: {
            amountIn: 100,
            amountOut: '0.05',
            paymentMethod: '/payments/debit-credit-card',
            amountOutInFiat: 98,
          },
          metadata: {
            reliability: 95,
            tags: {
              isBestRate: true,
              isMostReliable: false,
            },
          },
        },
      ],
      sorted: [
        {
          sortBy: 'price',
          ids: ['/providers/moonpay'],
        },
      ],
      error: [],
      customActions: [],
    };

    it('fetches quotes from the service', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us'),
              paymentMethods: createResourceState(
                [
                  {
                    id: '/payments/debit-credit-card',
                    paymentType: 'debit-credit-card',
                    name: 'Debit or Credit',
                    score: 90,
                    icon: 'card',
                  },
                ],
                null,
              ),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getQuotes',
            async () => mockQuotesResponse,
          );

          expect(controller.state.quotes.data).toBeNull();

          const result = await controller.getQuotes({
            assetId: 'eip155:1/slip44:60',
            amount: 100,
            walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
          });

          expect(result.success).toHaveLength(1);
          expect(result.success[0]?.provider).toBe('/providers/moonpay');
          expect(controller.state.quotes.data).toStrictEqual(
            mockQuotesResponse,
          );
        },
      );
    });

    it('uses selected token assetId from state when assetId option is not provided', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us'),
              tokens: createResourceState(
                { topTokens: [], allTokens: [] },
                {
                  assetId: 'eip155:1/slip44:60',
                  chainId: 'eip155:1',
                  name: 'Ethereum',
                  symbol: 'ETH',
                  decimals: 18,
                  iconUrl: 'https://example.com/eth.png',
                  tokenSupported: true,
                },
              ),
              paymentMethods: createResourceState(
                [
                  {
                    id: '/payments/debit-credit-card',
                    paymentType: 'debit-credit-card',
                    name: 'Debit or Credit',
                    score: 90,
                    icon: 'card',
                  },
                ],
                null,
              ),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getQuotes',
            async (params) => {
              expect(params.assetId).toBe('eip155:1/slip44:60');
              return mockQuotesResponse;
            },
          );

          const result = await controller.getQuotes({
            amount: 100,
            walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
          });

          expect(result.success).toHaveLength(1);
        },
      );
    });

    it('uses userRegion from state when not provided', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us'),
              paymentMethods: createResourceState(
                [
                  {
                    id: '/payments/debit-credit-card',
                    paymentType: 'debit-credit-card',
                    name: 'Debit or Credit',
                    score: 90,
                    icon: 'card',
                  },
                ],
                null,
              ),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getQuotes',
            async (params) => {
              expect(params.region).toBe('us');
              expect(params.fiat).toBe('usd');
              return mockQuotesResponse;
            },
          );

          await controller.getQuotes({
            assetId: 'eip155:1/slip44:60',
            amount: 100,
            walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
          });
        },
      );
    });

    it('throws when region is not provided and not in state', async () => {
      await withController(async ({ controller }) => {
        await expect(
          controller.getQuotes({
            assetId: 'eip155:1/slip44:60',
            amount: 100,
            walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
            paymentMethods: ['/payments/debit-credit-card'],
          }),
        ).rejects.toThrow('Region is required');
      });
    });

    it('throws when fiat is not provided and not in state', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: {
                country: {
                  isoCode: 'US',
                  name: 'United States',
                  flag: '🇺🇸',
                  currency: '',
                  phone: { prefix: '+1', placeholder: '', template: '' },
                  supported: { buy: true, sell: true },
                },
                state: null,
                regionCode: 'us',
              },
            },
          },
        },
        async ({ controller }) => {
          await expect(
            controller.getQuotes({
              assetId: 'eip155:1/slip44:60',
              amount: 100,
              walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
              paymentMethods: ['/payments/debit-credit-card'],
            }),
          ).rejects.toThrow('Fiat currency is required');
        },
      );
    });

    it('throws when payment methods are not provided and not in state', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us'),
              paymentMethods: createResourceState([], null),
            },
          },
        },
        async ({ controller }) => {
          await expect(
            controller.getQuotes({
              assetId: 'eip155:1/slip44:60',
              amount: 100,
              walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
            }),
          ).rejects.toThrow('Payment methods are required');
        },
      );
    });

    it('throws when amount is not a positive finite number', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us'),
              paymentMethods: createResourceState(
                [
                  {
                    id: '/payments/debit-credit-card',
                    paymentType: 'debit-credit-card',
                    name: 'Debit or Credit',
                    score: 90,
                    icon: 'card',
                  },
                ],
                null,
              ),
            },
          },
        },
        async ({ controller }) => {
          await expect(
            controller.getQuotes({
              assetId: 'eip155:1/slip44:60',
              amount: 0,
              walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
            }),
          ).rejects.toThrow('Amount must be a positive finite number');

          await expect(
            controller.getQuotes({
              assetId: 'eip155:1/slip44:60',
              amount: -100,
              walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
            }),
          ).rejects.toThrow('Amount must be a positive finite number');

          await expect(
            controller.getQuotes({
              assetId: 'eip155:1/slip44:60',
              amount: Infinity,
              walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
            }),
          ).rejects.toThrow('Amount must be a positive finite number');
        },
      );
    });

    it('throws when assetId is empty', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us'),
              paymentMethods: createResourceState(
                [
                  {
                    id: '/payments/debit-credit-card',
                    paymentType: 'debit-credit-card',
                    name: 'Debit or Credit',
                    score: 90,
                    icon: 'card',
                  },
                ],
                null,
              ),
            },
          },
        },
        async ({ controller }) => {
          await expect(
            controller.getQuotes({
              assetId: '',
              amount: 100,
              walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
            }),
          ).rejects.toThrow('assetId is required');

          await expect(
            controller.getQuotes({
              assetId: '   ',
              amount: 100,
              walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
            }),
          ).rejects.toThrow('assetId is required');
        },
      );
    });

    it('throws when assetId is not provided and no token is selected', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us'),
              paymentMethods: createResourceState(
                [
                  {
                    id: '/payments/debit-credit-card',
                    paymentType: 'debit-credit-card',
                    name: 'Debit or Credit',
                    score: 90,
                    icon: 'card',
                  },
                ],
                null,
              ),
            },
          },
        },
        async ({ controller }) => {
          await expect(
            controller.getQuotes({
              amount: 100,
              walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
            }),
          ).rejects.toThrow('assetId is required');
        },
      );
    });

    it('throws when walletAddress is empty', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us'),
              paymentMethods: createResourceState(
                [
                  {
                    id: '/payments/debit-credit-card',
                    paymentType: 'debit-credit-card',
                    name: 'Debit or Credit',
                    score: 90,
                    icon: 'card',
                  },
                ],
                null,
              ),
            },
          },
        },
        async ({ controller }) => {
          await expect(
            controller.getQuotes({
              assetId: 'eip155:1/slip44:60',
              amount: 100,
              walletAddress: '',
            }),
          ).rejects.toThrow('walletAddress is required');

          await expect(
            controller.getQuotes({
              assetId: 'eip155:1/slip44:60',
              amount: 100,
              walletAddress: '   ',
            }),
          ).rejects.toThrow('walletAddress is required');
        },
      );
    });

    it('caches quotes response', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us'),
              paymentMethods: createResourceState(
                [
                  {
                    id: '/payments/debit-credit-card',
                    paymentType: 'debit-credit-card',
                    name: 'Debit or Credit',
                    score: 90,
                    icon: 'card',
                  },
                ],
                null,
              ),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          let callCount = 0;
          rootMessenger.registerActionHandler(
            'RampsService:getQuotes',
            async () => {
              callCount += 1;
              return mockQuotesResponse;
            },
          );

          await controller.getQuotes({
            assetId: 'eip155:1/slip44:60',
            amount: 100,
            walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
          });
          await controller.getQuotes({
            assetId: 'eip155:1/slip44:60',
            amount: 100,
            walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
          });

          expect(callCount).toBe(1);
        },
      );
    });

    it('accepts explicit region and fiat parameters', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        rootMessenger.registerActionHandler(
          'RampsService:getQuotes',
          async (params) => {
            expect(params.region).toBe('fr');
            expect(params.fiat).toBe('eur');
            return mockQuotesResponse;
          },
        );

        await controller.getQuotes({
          region: 'fr',
          fiat: 'eur',
          assetId: 'eip155:1/slip44:60',
          amount: 100,
          walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
          paymentMethods: ['/payments/debit-credit-card'],
        });
      });
    });

    it('trims assetId and walletAddress before sending to service', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us'),
              paymentMethods: createResourceState(
                [
                  {
                    id: '/payments/debit-credit-card',
                    paymentType: 'debit-credit-card',
                    name: 'Debit or Credit',
                    score: 90,
                    icon: 'card',
                  },
                ],
                null,
              ),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getQuotes',
            async (params) => {
              expect(params.assetId).toBe('eip155:1/slip44:60');
              expect(params.walletAddress).toBe(
                '0x1234567890abcdef1234567890abcdef12345678',
              );
              return mockQuotesResponse;
            },
          );

          await controller.getQuotes({
            assetId: '  eip155:1/slip44:60  ',
            amount: 100,
            walletAddress: '  0x1234567890abcdef1234567890abcdef12345678  ',
          });
        },
      );
    });

    it('passes providers parameter to getQuotes', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us'),
              paymentMethods: createResourceState(
                [
                  {
                    id: '/payments/debit-credit-card',
                    paymentType: 'debit-credit-card',
                    name: 'Debit or Credit',
                    score: 90,
                    icon: 'card',
                  },
                ],
                null,
              ),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          let capturedProviders: string[] | undefined;
          rootMessenger.registerActionHandler(
            'RampsService:getQuotes',
            async (params) => {
              capturedProviders = params.providers;
              return mockQuotesResponse;
            },
          );

          await controller.getQuotes({
            assetId: 'eip155:1/slip44:60',
            amount: 100,
            walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
            paymentMethods: ['/payments/debit-credit-card'],
            providers: ['/providers/moonpay', '/providers/transak'],
          });

          expect(capturedProviders).toStrictEqual([
            '/providers/moonpay',
            '/providers/transak',
          ]);
        },
      );
    });

    it('uses state providers when providers option is not provided', async () => {
      const stateProviders = [
        {
          id: '/providers/moonpay',
          name: 'MoonPay',
          environmentType: 'PRODUCTION' as const,
          description: 'MoonPay',
          hqAddress: '',
          links: [],
          logos: {
            light: '',
            dark: '',
            height: 24,
            width: 77,
          },
        },
        {
          id: '/providers/transak',
          name: 'Transak',
          environmentType: 'PRODUCTION' as const,
          description: 'Transak',
          hqAddress: '',
          links: [],
          logos: {
            light: '',
            dark: '',
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
              paymentMethods: createResourceState(
                [
                  {
                    id: '/payments/debit-credit-card',
                    paymentType: 'debit-credit-card',
                    name: 'Debit or Credit',
                    score: 90,
                    icon: 'card',
                  },
                ],
                null,
              ),
              providers: createResourceState(stateProviders, null),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          let capturedProviders: string[] | undefined;
          rootMessenger.registerActionHandler(
            'RampsService:getQuotes',
            async (params) => {
              capturedProviders = params.providers;
              return mockQuotesResponse;
            },
          );

          await controller.getQuotes({
            assetId: 'eip155:1/slip44:60',
            amount: 100,
            walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
            paymentMethods: ['/payments/debit-credit-card'],
          });

          expect(capturedProviders).toStrictEqual([
            '/providers/moonpay',
            '/providers/transak',
          ]);
        },
      );
    });

    it('does not update state when region changes during request', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us'),
              countries: createResourceState([
                {
                  isoCode: 'US',
                  flag: '🇺🇸',
                  name: 'United States',
                  phone: { prefix: '+1', placeholder: '', template: '' },
                  currency: 'USD',
                  supported: { buy: true, sell: true },
                },
                {
                  isoCode: 'FR',
                  flag: '🇫🇷',
                  name: 'France',
                  phone: { prefix: '+33', placeholder: '', template: '' },
                  currency: 'EUR',
                  supported: { buy: true, sell: true },
                },
              ]),
              paymentMethods: createResourceState(
                [
                  {
                    id: '/payments/debit-credit-card',
                    paymentType: 'debit-credit-card',
                    name: 'Debit or Credit',
                    score: 90,
                    icon: 'card',
                  },
                ],
                null,
              ),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          let regionChangeResolve: (() => void) | undefined;
          const regionChangePromise = new Promise<void>((resolve) => {
            regionChangeResolve = resolve;
          });

          rootMessenger.registerActionHandler(
            'RampsService:getQuotes',
            async () => {
              // Simulate region change during request
              await regionChangePromise;
              return mockQuotesResponse;
            },
          );

          const quotesPromise = controller.getQuotes({
            assetId: 'eip155:1/slip44:60',
            amount: 100,
            walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
          });

          // Change region while request is in flight (aborts dependent requests)
          await controller.setUserRegion('fr');

          if (regionChangeResolve) {
            regionChangeResolve();
          }
          await expect(quotesPromise).rejects.toThrow('Request was aborted');

          expect(controller.state.quotes.data).toBeNull();
        },
      );
    });
  });

  describe('startQuotePolling', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('throws error when region is not set', async () => {
      await withController(({ controller }) => {
        expect(() =>
          controller.startQuotePolling({
            walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
            amount: 100,
          }),
        ).toThrow(
          'Region is required. Cannot proceed without valid region information.',
        );
      });
    });

    it('throws error when token is not selected', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us'),
            },
          },
        },
        ({ controller }) => {
          expect(() =>
            controller.startQuotePolling({
              walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
              amount: 100,
            }),
          ).toThrow(
            'Token is required. Cannot start quote polling without a selected token.',
          );
        },
      );
    });

    it('throws error when provider is not selected', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us'),
              tokens: createResourceState(
                { topTokens: [], allTokens: [] },
                {
                  assetId: 'eip155:1/slip44:60',
                  chainId: 'eip155:1',
                  name: 'Ethereum',
                  symbol: 'ETH',
                  decimals: 18,
                  iconUrl: 'https://example.com/eth.png',
                  tokenSupported: true,
                },
              ),
            },
          },
        },
        ({ controller }) => {
          expect(() =>
            controller.startQuotePolling({
              walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
              amount: 100,
            }),
          ).toThrow(
            'Provider is required. Cannot start quote polling without a selected provider.',
          );
        },
      );
    });

    it('returns early without throwing when payment method is not selected', async () => {
      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us'),
              tokens: createResourceState(
                { topTokens: [], allTokens: [] },
                {
                  assetId: 'eip155:1/slip44:60',
                  chainId: 'eip155:1',
                  name: 'Ethereum',
                  symbol: 'ETH',
                  decimals: 18,
                  iconUrl: 'https://example.com/eth.png',
                  tokenSupported: true,
                },
              ),
              providers: createResourceState([], {
                id: '/providers/moonpay',
                name: 'MoonPay',
                environmentType: 'PRODUCTION',
                description: 'MoonPay provider',
                hqAddress: '123 Test St',
                links: [],
                logos: {
                  light: '/assets/providers/moonpay_light.png',
                  dark: '/assets/providers/moonpay_dark.png',
                  height: 24,
                  width: 77,
                },
              }),
            },
          },
        },
        ({ controller }) => {
          expect(() =>
            controller.startQuotePolling({
              walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
              amount: 100,
            }),
          ).not.toThrow();
        },
      );
    });

    it('fetches quotes immediately and sets up 15-second polling', async () => {
      const mockQuotesResponse: QuotesResponse = {
        success: [
          {
            provider: '/providers/moonpay',
            quote: {
              amountIn: 100,
              amountOut: '0.05',
              paymentMethod: '/payments/debit-credit-card',
            },
          },
        ],
        sorted: [],
        error: [],
        customActions: [],
      };

      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us'),
              tokens: createResourceState(
                { topTokens: [], allTokens: [] },
                {
                  assetId: 'eip155:1/slip44:60',
                  chainId: 'eip155:1',
                  name: 'Ethereum',
                  symbol: 'ETH',
                  decimals: 18,
                  iconUrl: 'https://example.com/eth.png',
                  tokenSupported: true,
                },
              ),
              providers: createResourceState([], {
                id: '/providers/moonpay',
                name: 'MoonPay',
                environmentType: 'PRODUCTION',
                description: 'MoonPay provider',
                hqAddress: '123 Test St',
                links: [],
                logos: {
                  light: '/assets/providers/moonpay_light.png',
                  dark: '/assets/providers/moonpay_dark.png',
                  height: 24,
                  width: 77,
                },
              }),
              paymentMethods: createResourceState(
                [
                  {
                    id: '/payments/debit-credit-card',
                    paymentType: 'debit-credit-card',
                    name: 'Debit or Credit',
                    score: 90,
                    icon: 'card',
                  },
                ],
                {
                  id: '/payments/debit-credit-card',
                  paymentType: 'debit-credit-card',
                  name: 'Debit or Credit',
                  score: 90,
                  icon: 'card',
                },
              ),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          let callCount = 0;
          rootMessenger.registerActionHandler(
            'RampsService:getQuotes',
            async () => {
              callCount += 1;
              return mockQuotesResponse;
            },
          );

          controller.startQuotePolling({
            walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
            amount: 100,
          });

          // Give promises time to resolve (getQuotes + .then callback)
          for (let i = 0; i < 10; i++) {
            await Promise.resolve();
          }

          expect(callCount).toBe(1);
          expect(controller.state.quotes.selected).toStrictEqual(
            mockQuotesResponse.success[0],
          );

          // Advance 15 seconds
          jest.advanceTimersByTime(15000);
          for (let i = 0; i < 10; i++) {
            await Promise.resolve();
          }

          expect(callCount).toBe(2);

          // Advance another 15 seconds
          jest.advanceTimersByTime(15000);
          for (let i = 0; i < 10; i++) {
            await Promise.resolve();
          }

          expect(callCount).toBe(3);

          controller.stopQuotePolling();
        },
      );
    });

    it('auto-selects quote when response contains exactly one quote', async () => {
      const mockQuotesResponse: QuotesResponse = {
        success: [
          {
            provider: '/providers/moonpay',
            quote: {
              amountIn: 100,
              amountOut: '0.05',
              paymentMethod: '/payments/debit-credit-card',
            },
          },
        ],
        sorted: [],
        error: [],
        customActions: [],
      };

      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us'),
              tokens: createResourceState(
                { topTokens: [], allTokens: [] },
                {
                  assetId: 'eip155:1/slip44:60',
                  chainId: 'eip155:1',
                  name: 'Ethereum',
                  symbol: 'ETH',
                  decimals: 18,
                  iconUrl: 'https://example.com/eth.png',
                  tokenSupported: true,
                },
              ),
              providers: createResourceState([], {
                id: '/providers/moonpay',
                name: 'MoonPay',
                environmentType: 'PRODUCTION',
                description: 'MoonPay provider',
                hqAddress: '123 Test St',
                links: [],
                logos: {
                  light: '/assets/providers/moonpay_light.png',
                  dark: '/assets/providers/moonpay_dark.png',
                  height: 24,
                  width: 77,
                },
              }),
              paymentMethods: createResourceState(
                [
                  {
                    id: '/payments/debit-credit-card',
                    paymentType: 'debit-credit-card',
                    name: 'Debit or Credit',
                    score: 90,
                    icon: 'card',
                  },
                ],
                {
                  id: '/payments/debit-credit-card',
                  paymentType: 'debit-credit-card',
                  name: 'Debit or Credit',
                  score: 90,
                  icon: 'card',
                },
              ),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getQuotes',
            async () => mockQuotesResponse,
          );

          controller.startQuotePolling({
            walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
            amount: 100,
          });

          // Need multiple Promise.resolve() to flush microtask queue
          for (let i = 0; i < 10; i++) {
            await Promise.resolve();
          }

          expect(controller.state.quotes.selected).toStrictEqual(
            mockQuotesResponse.success[0],
          );

          controller.stopQuotePolling();
        },
      );
    });

    it('passes selected payment method to getQuotes', async () => {
      const mockQuotesResponse: QuotesResponse = {
        success: [
          {
            provider: '/providers/moonpay',
            quote: {
              amountIn: 100,
              amountOut: '0.05',
              paymentMethod: '/payments/bank-transfer',
            },
          },
        ],
        sorted: [],
        error: [],
        customActions: [],
      };

      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us'),
              tokens: createResourceState(
                { topTokens: [], allTokens: [] },
                {
                  assetId: 'eip155:1/slip44:60',
                  chainId: 'eip155:1',
                  name: 'Ethereum',
                  symbol: 'ETH',
                  decimals: 18,
                  iconUrl: 'https://example.com/eth.png',
                  tokenSupported: true,
                },
              ),
              providers: createResourceState([], {
                id: '/providers/moonpay',
                name: 'MoonPay',
                environmentType: 'PRODUCTION',
                description: 'MoonPay provider',
                hqAddress: '123 Test St',
                links: [],
                logos: {
                  light: '/assets/providers/moonpay_light.png',
                  dark: '/assets/providers/moonpay_dark.png',
                  height: 24,
                  width: 77,
                },
              }),
              paymentMethods: createResourceState(
                [
                  {
                    id: '/payments/debit-credit-card',
                    paymentType: 'debit-credit-card',
                    name: 'Debit or Credit',
                    score: 90,
                    icon: 'card',
                  },
                  {
                    id: '/payments/bank-transfer',
                    paymentType: 'bank-transfer',
                    name: 'Bank Transfer',
                    score: 80,
                    icon: 'bank',
                  },
                ],
                {
                  id: '/payments/bank-transfer',
                  paymentType: 'bank-transfer',
                  name: 'Bank Transfer',
                  score: 80,
                  icon: 'bank',
                },
              ),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          let capturedPaymentMethods: string[] | undefined;
          rootMessenger.registerActionHandler(
            'RampsService:getQuotes',
            async (params) => {
              capturedPaymentMethods = params.paymentMethods;
              return mockQuotesResponse;
            },
          );

          controller.startQuotePolling({
            walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
            amount: 100,
          });

          // Need multiple Promise.resolve() to flush microtask queue
          for (let i = 0; i < 10; i++) {
            await Promise.resolve();
          }

          // Verify only the selected payment method is passed, not all available
          expect(capturedPaymentMethods).toStrictEqual([
            '/payments/bank-transfer',
          ]);

          controller.stopQuotePolling();
        },
      );
    });

    it('preserves existing selection when response contains multiple quotes and selection is still valid', async () => {
      const mockQuotesResponse: QuotesResponse = {
        success: [
          {
            provider: '/providers/moonpay',
            quote: {
              amountIn: 100,
              amountOut: '0.05',
              paymentMethod: '/payments/debit-credit-card',
            },
          },
          {
            provider: '/providers/transak',
            quote: {
              amountIn: 100,
              amountOut: '0.048',
              paymentMethod: '/payments/debit-credit-card',
            },
          },
        ],
        sorted: [],
        error: [],
        customActions: [],
      };

      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us'),
              tokens: createResourceState(
                { topTokens: [], allTokens: [] },
                {
                  assetId: 'eip155:1/slip44:60',
                  chainId: 'eip155:1',
                  name: 'Ethereum',
                  symbol: 'ETH',
                  decimals: 18,
                  iconUrl: 'https://example.com/eth.png',
                  tokenSupported: true,
                },
              ),
              providers: createResourceState([], {
                id: '/providers/moonpay',
                name: 'MoonPay',
                environmentType: 'PRODUCTION',
                description: 'MoonPay provider',
                hqAddress: '123 Test St',
                links: [],
                logos: {
                  light: '/assets/providers/moonpay_light.png',
                  dark: '/assets/providers/moonpay_dark.png',
                  height: 24,
                  width: 77,
                },
              }),
              paymentMethods: createResourceState(
                [
                  {
                    id: '/payments/debit-credit-card',
                    paymentType: 'debit-credit-card',
                    name: 'Debit or Credit',
                    score: 90,
                    icon: 'card',
                  },
                ],
                {
                  id: '/payments/debit-credit-card',
                  paymentType: 'debit-credit-card',
                  name: 'Debit or Credit',
                  score: 90,
                  icon: 'card',
                },
              ),
              quotes: createResourceState(mockQuotesResponse, {
                provider: '/providers/moonpay',
                quote: {
                  amountIn: 100,
                  amountOut: '0.05',
                  paymentMethod: '/payments/debit-credit-card',
                },
              }),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getQuotes',
            async () => mockQuotesResponse,
          );

          const initialSelection = controller.state.quotes.selected;

          controller.startQuotePolling({
            walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
            amount: 100,
          });

          await Promise.resolve();
          await Promise.resolve();

          expect(controller.state.quotes.selected).toStrictEqual(
            initialSelection,
          );

          controller.stopQuotePolling();
        },
      );
    });

    it('updates selected quote with fresh data when still valid', async () => {
      const initialQuote = {
        provider: '/providers/moonpay',
        quote: {
          amountIn: 100,
          amountOut: '0.05',
          paymentMethod: '/payments/debit-credit-card',
        },
      };

      // Fresh response has updated amountOut
      const freshQuotesResponse: QuotesResponse = {
        success: [
          {
            provider: '/providers/moonpay',
            quote: {
              amountIn: 100,
              amountOut: '0.052', // Updated value
              paymentMethod: '/payments/debit-credit-card',
            },
          },
          {
            provider: '/providers/transak',
            quote: {
              amountIn: 100,
              amountOut: '0.048',
              paymentMethod: '/payments/debit-credit-card',
            },
          },
        ],
        sorted: [],
        error: [],
        customActions: [],
      };

      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us'),
              tokens: createResourceState(
                { topTokens: [], allTokens: [] },
                {
                  assetId: 'eip155:1/slip44:60',
                  chainId: 'eip155:1',
                  name: 'Ethereum',
                  symbol: 'ETH',
                  decimals: 18,
                  iconUrl: 'https://example.com/eth.png',
                  tokenSupported: true,
                },
              ),
              providers: createResourceState([], {
                id: '/providers/moonpay',
                name: 'MoonPay',
                environmentType: 'PRODUCTION',
                description: 'MoonPay provider',
                hqAddress: '123 Test St',
                links: [],
                logos: {
                  light: '/assets/providers/moonpay_light.png',
                  dark: '/assets/providers/moonpay_dark.png',
                  height: 24,
                  width: 77,
                },
              }),
              paymentMethods: createResourceState(
                [
                  {
                    id: '/payments/debit-credit-card',
                    paymentType: 'debit-credit-card',
                    name: 'Debit or Credit',
                    score: 90,
                    icon: 'card',
                  },
                ],
                {
                  id: '/payments/debit-credit-card',
                  paymentType: 'debit-credit-card',
                  name: 'Debit or Credit',
                  score: 90,
                  icon: 'card',
                },
              ),
              quotes: createResourceState(null, initialQuote),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getQuotes',
            async () => freshQuotesResponse,
          );

          expect(controller.state.quotes.selected?.quote.amountOut).toBe(
            '0.05',
          );

          controller.startQuotePolling({
            walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
            amount: 100,
          });

          for (let i = 0; i < 10; i++) {
            await Promise.resolve();
          }

          // Selection should be updated with fresh data
          expect(controller.state.quotes.selected?.provider).toBe(
            '/providers/moonpay',
          );
          expect(controller.state.quotes.selected?.quote.amountOut).toBe(
            '0.052',
          );

          controller.stopQuotePolling();
        },
      );
    });

    it('clears selection when response contains multiple quotes and selection is no longer valid', async () => {
      const mockQuotesResponse: QuotesResponse = {
        success: [
          {
            provider: '/providers/transak',
            quote: {
              amountIn: 100,
              amountOut: '0.048',
              paymentMethod: '/payments/debit-credit-card',
            },
          },
          {
            provider: '/providers/ramp',
            quote: {
              amountIn: 100,
              amountOut: '0.047',
              paymentMethod: '/payments/debit-credit-card',
            },
          },
        ],
        sorted: [],
        error: [],
        customActions: [],
      };

      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us'),
              tokens: createResourceState(
                { topTokens: [], allTokens: [] },
                {
                  assetId: 'eip155:1/slip44:60',
                  chainId: 'eip155:1',
                  name: 'Ethereum',
                  symbol: 'ETH',
                  decimals: 18,
                  iconUrl: 'https://example.com/eth.png',
                  tokenSupported: true,
                },
              ),
              providers: createResourceState([], {
                id: '/providers/moonpay',
                name: 'MoonPay',
                environmentType: 'PRODUCTION',
                description: 'MoonPay provider',
                hqAddress: '123 Test St',
                links: [],
                logos: {
                  light: '/assets/providers/moonpay_light.png',
                  dark: '/assets/providers/moonpay_dark.png',
                  height: 24,
                  width: 77,
                },
              }),
              paymentMethods: createResourceState(
                [
                  {
                    id: '/payments/debit-credit-card',
                    paymentType: 'debit-credit-card',
                    name: 'Debit or Credit',
                    score: 90,
                    icon: 'card',
                  },
                ],
                {
                  id: '/payments/debit-credit-card',
                  paymentType: 'debit-credit-card',
                  name: 'Debit or Credit',
                  score: 90,
                  icon: 'card',
                },
              ),
              quotes: createResourceState(null, {
                provider: '/providers/moonpay',
                quote: {
                  amountIn: 100,
                  amountOut: '0.05',
                  paymentMethod: '/payments/debit-credit-card',
                },
              }),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getQuotes',
            async () => mockQuotesResponse,
          );

          controller.startQuotePolling({
            walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
            amount: 100,
          });

          for (let i = 0; i < 10; i++) {
            await Promise.resolve();
          }

          expect(controller.state.quotes.selected).toBeNull();

          controller.stopQuotePolling();
        },
      );
    });
  });

  describe('stopQuotePolling', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('stops polling and clears interval', async () => {
      const mockQuotesResponse: QuotesResponse = {
        success: [
          {
            provider: '/providers/moonpay',
            quote: {
              amountIn: 100,
              amountOut: '0.05',
              paymentMethod: '/payments/debit-credit-card',
            },
          },
        ],
        sorted: [],
        error: [],
        customActions: [],
      };

      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us'),
              tokens: createResourceState(
                { topTokens: [], allTokens: [] },
                {
                  assetId: 'eip155:1/slip44:60',
                  chainId: 'eip155:1',
                  name: 'Ethereum',
                  symbol: 'ETH',
                  decimals: 18,
                  iconUrl: 'https://example.com/eth.png',
                  tokenSupported: true,
                },
              ),
              providers: createResourceState([], {
                id: '/providers/moonpay',
                name: 'MoonPay',
                environmentType: 'PRODUCTION',
                description: 'MoonPay provider',
                hqAddress: '123 Test St',
                links: [],
                logos: {
                  light: '/assets/providers/moonpay_light.png',
                  dark: '/assets/providers/moonpay_dark.png',
                  height: 24,
                  width: 77,
                },
              }),
              paymentMethods: createResourceState(
                [
                  {
                    id: '/payments/debit-credit-card',
                    paymentType: 'debit-credit-card',
                    name: 'Debit or Credit',
                    score: 90,
                    icon: 'card',
                  },
                ],
                {
                  id: '/payments/debit-credit-card',
                  paymentType: 'debit-credit-card',
                  name: 'Debit or Credit',
                  score: 90,
                  icon: 'card',
                },
              ),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          let callCount = 0;
          rootMessenger.registerActionHandler(
            'RampsService:getQuotes',
            async () => {
              callCount += 1;
              return mockQuotesResponse;
            },
          );

          controller.startQuotePolling({
            walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
            amount: 100,
          });

          await Promise.resolve();
          await Promise.resolve();

          expect(callCount).toBe(1);

          controller.stopQuotePolling();

          // Advance 15 seconds - should not trigger another call
          jest.advanceTimersByTime(15000);
          await Promise.resolve();
          await Promise.resolve();

          expect(callCount).toBe(1);
        },
      );
    });

    it('does not clear quotes data or selection', async () => {
      const mockQuotesResponse: QuotesResponse = {
        success: [
          {
            provider: '/providers/moonpay',
            quote: {
              amountIn: 100,
              amountOut: '0.05',
              paymentMethod: '/payments/debit-credit-card',
            },
          },
        ],
        sorted: [],
        error: [],
        customActions: [],
      };

      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us'),
              tokens: createResourceState(
                { topTokens: [], allTokens: [] },
                {
                  assetId: 'eip155:1/slip44:60',
                  chainId: 'eip155:1',
                  name: 'Ethereum',
                  symbol: 'ETH',
                  decimals: 18,
                  iconUrl: 'https://example.com/eth.png',
                  tokenSupported: true,
                },
              ),
              providers: createResourceState([], {
                id: '/providers/moonpay',
                name: 'MoonPay',
                environmentType: 'PRODUCTION',
                description: 'MoonPay provider',
                hqAddress: '123 Test St',
                links: [],
                logos: {
                  light: '/assets/providers/moonpay_light.png',
                  dark: '/assets/providers/moonpay_dark.png',
                  height: 24,
                  width: 77,
                },
              }),
              paymentMethods: createResourceState(
                [
                  {
                    id: '/payments/debit-credit-card',
                    paymentType: 'debit-credit-card',
                    name: 'Debit or Credit',
                    score: 90,
                    icon: 'card',
                  },
                ],
                {
                  id: '/payments/debit-credit-card',
                  paymentType: 'debit-credit-card',
                  name: 'Debit or Credit',
                  score: 90,
                  icon: 'card',
                },
              ),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'RampsService:getQuotes',
            async () => mockQuotesResponse,
          );

          controller.startQuotePolling({
            walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
            amount: 100,
          });

          await Promise.resolve();
          await Promise.resolve();

          const quotesData = controller.state.quotes.data;
          const selectedQuote = controller.state.quotes.selected;

          controller.stopQuotePolling();

          expect(controller.state.quotes.data).toStrictEqual(quotesData);
          expect(controller.state.quotes.selected).toStrictEqual(selectedQuote);
        },
      );
    });

    it('stops polling when setSelectedProvider(null) is called', async () => {
      const mockQuotesResponse: QuotesResponse = {
        success: [
          {
            provider: '/providers/moonpay',
            quote: {
              amountIn: 100,
              amountOut: '0.05',
              paymentMethod: '/payments/debit-credit-card',
            },
          },
        ],
        sorted: [],
        error: [],
        customActions: [],
      };

      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us'),
              tokens: createResourceState(
                { topTokens: [], allTokens: [] },
                {
                  assetId: 'eip155:1/slip44:60',
                  chainId: 'eip155:1',
                  name: 'Ethereum',
                  symbol: 'ETH',
                  decimals: 18,
                  iconUrl: 'https://example.com/eth.png',
                  tokenSupported: true,
                },
              ),
              providers: createResourceState([], {
                id: '/providers/moonpay',
                name: 'MoonPay',
                environmentType: 'PRODUCTION',
                description: 'MoonPay provider',
                hqAddress: '123 Test St',
                links: [],
                logos: {
                  light: '/assets/providers/moonpay_light.png',
                  dark: '/assets/providers/moonpay_dark.png',
                  height: 24,
                  width: 77,
                },
              }),
              paymentMethods: createResourceState(
                [
                  {
                    id: '/payments/debit-credit-card',
                    paymentType: 'debit-credit-card',
                    name: 'Debit or Credit',
                    score: 90,
                    icon: 'card',
                  },
                ],
                {
                  id: '/payments/debit-credit-card',
                  paymentType: 'debit-credit-card',
                  name: 'Debit or Credit',
                  score: 90,
                  icon: 'card',
                },
              ),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          let callCount = 0;
          rootMessenger.registerActionHandler(
            'RampsService:getQuotes',
            async () => {
              callCount += 1;
              return mockQuotesResponse;
            },
          );

          controller.startQuotePolling({
            walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
            amount: 100,
          });

          for (let i = 0; i < 10; i++) {
            await Promise.resolve();
          }

          expect(callCount).toBe(1);

          // Clear provider - should stop polling
          controller.setSelectedProvider(null);

          // Advance 15 seconds - should not trigger another call
          jest.advanceTimersByTime(15000);
          for (let i = 0; i < 10; i++) {
            await Promise.resolve();
          }

          expect(callCount).toBe(1);
        },
      );
    });

    it('stops polling when setSelectedToken(undefined) is called', async () => {
      const mockQuotesResponse: QuotesResponse = {
        success: [
          {
            provider: '/providers/moonpay',
            quote: {
              amountIn: 100,
              amountOut: '0.05',
              paymentMethod: '/payments/debit-credit-card',
            },
          },
        ],
        sorted: [],
        error: [],
        customActions: [],
      };

      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us'),
              tokens: createResourceState(
                { topTokens: [], allTokens: [] },
                {
                  assetId: 'eip155:1/slip44:60',
                  chainId: 'eip155:1',
                  name: 'Ethereum',
                  symbol: 'ETH',
                  decimals: 18,
                  iconUrl: 'https://example.com/eth.png',
                  tokenSupported: true,
                },
              ),
              providers: createResourceState([], {
                id: '/providers/moonpay',
                name: 'MoonPay',
                environmentType: 'PRODUCTION',
                description: 'MoonPay provider',
                hqAddress: '123 Test St',
                links: [],
                logos: {
                  light: '/assets/providers/moonpay_light.png',
                  dark: '/assets/providers/moonpay_dark.png',
                  height: 24,
                  width: 77,
                },
              }),
              paymentMethods: createResourceState(
                [
                  {
                    id: '/payments/debit-credit-card',
                    paymentType: 'debit-credit-card',
                    name: 'Debit or Credit',
                    score: 90,
                    icon: 'card',
                  },
                ],
                {
                  id: '/payments/debit-credit-card',
                  paymentType: 'debit-credit-card',
                  name: 'Debit or Credit',
                  score: 90,
                  icon: 'card',
                },
              ),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          let callCount = 0;
          rootMessenger.registerActionHandler(
            'RampsService:getQuotes',
            async () => {
              callCount += 1;
              return mockQuotesResponse;
            },
          );

          controller.startQuotePolling({
            walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
            amount: 100,
          });

          for (let i = 0; i < 10; i++) {
            await Promise.resolve();
          }

          expect(callCount).toBe(1);

          // Clear token - should stop polling
          controller.setSelectedToken(undefined);

          // Advance 15 seconds - should not trigger another call
          jest.advanceTimersByTime(15000);
          for (let i = 0; i < 10; i++) {
            await Promise.resolve();
          }

          expect(callCount).toBe(1);
        },
      );
    });
  });

  describe('setSelectedQuote', () => {
    it('sets the selected quote', async () => {
      await withController(({ controller }) => {
        const quote: Quote = {
          provider: '/providers/moonpay',
          quote: {
            amountIn: 100,
            amountOut: '0.05',
            paymentMethod: '/payments/debit-credit-card',
          },
        };

        controller.setSelectedQuote(quote);

        expect(controller.state.quotes.selected).toStrictEqual(quote);
      });
    });

    it('clears the selected quote when passed null', async () => {
      await withController(
        {
          options: {
            state: {
              quotes: createResourceState(null, {
                provider: '/providers/moonpay',
                quote: {
                  amountIn: 100,
                  amountOut: '0.05',
                  paymentMethod: '/payments/debit-credit-card',
                },
              }),
            },
          },
        },
        ({ controller }) => {
          controller.setSelectedQuote(null);

          expect(controller.state.quotes.selected).toBeNull();
        },
      );
    });

    it('fetches widget URL when selecting a quote with buyURL', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        const buyWidgetResponse = {
          url: 'https://global.transak.com/?apiKey=test',
          browser: 'APP_BROWSER' as const,
          orderId: null,
        };

        rootMessenger.registerActionHandler(
          'RampsService:getBuyWidgetUrl',
          async () => buyWidgetResponse,
        );

        const quote: Quote = {
          provider: '/providers/transak-staging',
          quote: {
            amountIn: 100,
            amountOut: '0.05',
            paymentMethod: '/payments/debit-credit-card',
            buyURL:
              'https://on-ramp.uat-api.cx.metamask.io/providers/transak-staging/buy-widget',
          },
        };

        controller.setSelectedQuote(quote);

        expect(controller.state.widgetUrl.isLoading).toBe(true);
        expect(controller.state.widgetUrl.data).toBeNull();

        await flushPromises();

        expect(controller.state.widgetUrl.isLoading).toBe(false);
        expect(controller.state.widgetUrl.data).toStrictEqual(
          buyWidgetResponse,
        );
        expect(controller.state.widgetUrl.error).toBeNull();
      });
    });

    it('resets widget URL when selecting a quote without buyURL', async () => {
      await withController(({ controller }) => {
        const quote: Quote = {
          provider: '/providers/moonpay',
          quote: {
            amountIn: 100,
            amountOut: '0.05',
            paymentMethod: '/payments/debit-credit-card',
          },
        };

        controller.setSelectedQuote(quote);

        expect(controller.state.widgetUrl.isLoading).toBe(false);
        expect(controller.state.widgetUrl.data).toBeNull();
        expect(controller.state.widgetUrl.error).toBeNull();
      });
    });

    it('resets widget URL when clearing the selected quote', async () => {
      await withController(({ controller }) => {
        controller.setSelectedQuote(null);

        expect(controller.state.widgetUrl.isLoading).toBe(false);
        expect(controller.state.widgetUrl.data).toBeNull();
        expect(controller.state.widgetUrl.error).toBeNull();
      });
    });

    it('sets widget URL error state when service call fails', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        rootMessenger.registerActionHandler(
          'RampsService:getBuyWidgetUrl',
          async () => {
            throw new Error('Network error');
          },
        );

        const quote: Quote = {
          provider: '/providers/transak-staging',
          quote: {
            amountIn: 100,
            amountOut: '0.05',
            paymentMethod: '/payments/debit-credit-card',
            buyURL:
              'https://on-ramp.uat-api.cx.metamask.io/providers/transak-staging/buy-widget',
          },
        };

        controller.setSelectedQuote(quote);

        expect(controller.state.widgetUrl.isLoading).toBe(true);

        await flushPromises();

        expect(controller.state.widgetUrl.isLoading).toBe(false);
        expect(controller.state.widgetUrl.data).toBeNull();
        expect(controller.state.widgetUrl.error).toBe('Network error');
      });
    });

    it('sets fallback widget URL error when service throws a non-Error', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        rootMessenger.registerActionHandler(
          'RampsService:getBuyWidgetUrl',
          async () => {
            throw 'unexpected failure';
          },
        );

        const quote: Quote = {
          provider: '/providers/transak-staging',
          quote: {
            amountIn: 100,
            amountOut: '0.05',
            paymentMethod: '/payments/debit-credit-card',
            buyURL:
              'https://on-ramp.uat-api.cx.metamask.io/providers/transak-staging/buy-widget',
          },
        };

        controller.setSelectedQuote(quote);

        await flushPromises();

        expect(controller.state.widgetUrl.isLoading).toBe(false);
        expect(controller.state.widgetUrl.data).toBeNull();
        expect(controller.state.widgetUrl.error).toBe(
          'Failed to fetch widget URL',
        );
      });
    });
  });

  describe('polling restart on dependency changes', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('restarts polling when payment method changes', async () => {
      const mockQuotesResponse: QuotesResponse = {
        success: [
          {
            provider: '/providers/moonpay',
            quote: {
              amountIn: 100,
              amountOut: '0.05',
              paymentMethod: '/payments/debit-credit-card',
            },
          },
        ],
        sorted: [],
        error: [],
        customActions: [],
      };

      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us'),
              tokens: createResourceState(
                { topTokens: [], allTokens: [] },
                {
                  assetId: 'eip155:1/slip44:60',
                  chainId: 'eip155:1',
                  name: 'Ethereum',
                  symbol: 'ETH',
                  decimals: 18,
                  iconUrl: 'https://example.com/eth.png',
                  tokenSupported: true,
                },
              ),
              providers: createResourceState([], {
                id: '/providers/moonpay',
                name: 'MoonPay',
                environmentType: 'PRODUCTION',
                description: 'MoonPay provider',
                hqAddress: '123 Test St',
                links: [],
                logos: {
                  light: '/assets/providers/moonpay_light.png',
                  dark: '/assets/providers/moonpay_dark.png',
                  height: 24,
                  width: 77,
                },
              }),
              paymentMethods: createResourceState(
                [
                  {
                    id: '/payments/debit-credit-card',
                    paymentType: 'debit-credit-card',
                    name: 'Debit or Credit',
                    score: 90,
                    icon: 'card',
                  },
                  {
                    id: '/payments/bank-transfer',
                    paymentType: 'bank-transfer',
                    name: 'Bank Transfer',
                    score: 85,
                    icon: 'bank',
                  },
                ],
                {
                  id: '/payments/debit-credit-card',
                  paymentType: 'debit-credit-card',
                  name: 'Debit or Credit',
                  score: 90,
                  icon: 'card',
                },
              ),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          const callTimes: number[] = [];
          rootMessenger.registerActionHandler(
            'RampsService:getQuotes',
            async () => {
              callTimes.push(Date.now());
              return mockQuotesResponse;
            },
          );

          controller.startQuotePolling({
            walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
            amount: 100,
          });

          for (let i = 0; i < 10; i++) {
            await Promise.resolve();
          }

          const initialCallCount = callTimes.length;
          expect(initialCallCount).toBeGreaterThan(0);

          // Change payment method - this should restart polling
          controller.setSelectedPaymentMethod('/payments/bank-transfer');

          // Advance time to trigger the next poll
          jest.advanceTimersByTime(16000);
          for (let i = 0; i < 20; i++) {
            await Promise.resolve();
          }

          // Polling should still be active (call count increased)
          expect(callTimes.length).toBeGreaterThan(initialCallCount);

          controller.stopQuotePolling();
        },
      );
    });
  });

  describe('destroy', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('stops quote polling when called', async () => {
      const mockQuotesResponse: QuotesResponse = {
        success: [
          {
            provider: '/providers/moonpay',
            quote: {
              amountIn: 100,
              amountOut: '0.05',
              paymentMethod: '/payments/debit-credit-card',
            },
          },
        ],
        sorted: [],
        error: [],
        customActions: [],
      };

      await withController(
        {
          options: {
            state: {
              userRegion: createMockUserRegion('us'),
              tokens: createResourceState(
                { topTokens: [], allTokens: [] },
                {
                  assetId: 'eip155:1/slip44:60',
                  chainId: 'eip155:1',
                  name: 'Ethereum',
                  symbol: 'ETH',
                  decimals: 18,
                  iconUrl: 'https://example.com/eth.png',
                  tokenSupported: true,
                },
              ),
              providers: createResourceState([], {
                id: '/providers/moonpay',
                name: 'MoonPay',
                environmentType: 'PRODUCTION',
                description: 'MoonPay provider',
                hqAddress: '123 Test St',
                links: [],
                logos: {
                  light: '/assets/providers/moonpay_light.png',
                  dark: '/assets/providers/moonpay_dark.png',
                  height: 24,
                  width: 77,
                },
              }),
              paymentMethods: createResourceState(
                [
                  {
                    id: '/payments/debit-credit-card',
                    paymentType: 'debit-credit-card',
                    name: 'Debit or Credit',
                    score: 90,
                    icon: 'card',
                  },
                ],
                {
                  id: '/payments/debit-credit-card',
                  paymentType: 'debit-credit-card',
                  name: 'Debit or Credit',
                  score: 90,
                  icon: 'card',
                },
              ),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          let callCount = 0;
          rootMessenger.registerActionHandler(
            'RampsService:getQuotes',
            async () => {
              callCount += 1;
              return mockQuotesResponse;
            },
          );

          controller.startQuotePolling({
            walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
            amount: 100,
          });

          for (let i = 0; i < 10; i++) {
            await Promise.resolve();
          }

          expect(callCount).toBe(1);

          // Call destroy
          controller.destroy();

          // Advance time - polling should not fire
          jest.advanceTimersByTime(30000);
          await flushPromises();

          // Call count should still be 1
          expect(callCount).toBe(1);
        },
      );
    });
  });

  describe('getWidgetUrl', () => {
    it('fetches and returns widget URL via RampsService messenger', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        const quote: Quote = {
          provider: '/providers/transak-staging',
          quote: {
            amountIn: 100,
            amountOut: '0.05',
            paymentMethod: '/payments/debit-credit-card',
            buyURL:
              'https://on-ramp.uat-api.cx.metamask.io/providers/transak-staging/buy-widget',
          },
        };

        rootMessenger.registerActionHandler(
          'RampsService:getBuyWidgetUrl',
          async () => ({
            url: 'https://global.transak.com/?apiKey=test',
            browser: 'APP_BROWSER' as const,
            orderId: null,
          }),
        );

        const widgetUrl = await controller.getWidgetUrl(quote);

        expect(widgetUrl).toBe('https://global.transak.com/?apiKey=test');
      });
    });

    it('returns null when buyURL is not present', async () => {
      await withController(async ({ controller }) => {
        const quote: Quote = {
          provider: '/providers/transak',
          quote: {
            amountIn: 100,
            amountOut: '0.05',
            paymentMethod: '/payments/debit-credit-card',
          },
        };

        const widgetUrl = await controller.getWidgetUrl(quote);

        expect(widgetUrl).toBeNull();
      });
    });

    it('returns null when quote object is malformed', async () => {
      await withController(async ({ controller }) => {
        const quote = {
          provider: '/providers/moonpay',
        } as unknown as Quote;

        const widgetUrl = await controller.getWidgetUrl(quote);

        expect(widgetUrl).toBeNull();
      });
    });

    it('returns null when service call throws an error', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        const quote: Quote = {
          provider: '/providers/transak-staging',
          quote: {
            amountIn: 100,
            amountOut: '0.05',
            paymentMethod: '/payments/debit-credit-card',
            buyURL:
              'https://on-ramp.uat-api.cx.metamask.io/providers/transak-staging/buy-widget',
          },
        };

        rootMessenger.registerActionHandler(
          'RampsService:getBuyWidgetUrl',
          async () => {
            throw new Error('Network error');
          },
        );

        const widgetUrl = await controller.getWidgetUrl(quote);

        expect(widgetUrl).toBeNull();
      });
    });

    it('returns null when service returns BuyWidget with null url', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        const quote: Quote = {
          provider: '/providers/transak-staging',
          quote: {
            amountIn: 100,
            amountOut: '0.05',
            paymentMethod: '/payments/debit-credit-card',
            buyURL:
              'https://on-ramp.uat-api.cx.metamask.io/providers/transak-staging/buy-widget',
          },
        };

        rootMessenger.registerActionHandler(
          'RampsService:getBuyWidgetUrl',
          async () => ({
            url: null as unknown as string,
            browser: 'APP_BROWSER' as const,
            orderId: null,
          }),
        );

        const widgetUrl = await controller.getWidgetUrl(quote);

        expect(widgetUrl).toBeNull();
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
    supported: { buy: true, sell: true },
    ...(stateCode && {
      states: [
        {
          stateId: stateCode.toUpperCase(),
          name: stateName ?? `State ${stateCode.toUpperCase()}`,
          supported: { buy: true, sell: true },
        },
      ],
    }),
  };

  const state: State | null = stateCode
    ? {
        stateId: stateCode.toUpperCase(),
        name: stateName ?? `State ${stateCode.toUpperCase()}`,
        supported: { buy: true, sell: true },
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
      supported: { buy: true, sell: true },
      states: [
        {
          stateId: 'CA',
          name: 'California',
          supported: { buy: true, sell: true },
        },
        {
          stateId: 'NY',
          name: 'New York',
          supported: { buy: true, sell: true },
        },
        { stateId: 'UT', name: 'Utah', supported: { buy: true, sell: true } },
      ],
    },
    {
      isoCode: 'FR',
      name: 'France',
      flag: '🇫🇷',
      currency: 'EUR',
      phone: { prefix: '+33', placeholder: '', template: '' },
      supported: { buy: true, sell: true },
    },
  ];
}

/**
 * Creates a ResourceState object for testing.
 *
 * @param data - The resource data.
 * @param selected - The selected item (optional).
 * @returns A ResourceState object.
 */
function createResourceState<TData, TSelected = null>(
  data: TData,
  selected: TSelected = null as TSelected,
): ResourceState<TData, TSelected> {
  return {
    data,
    selected,
    isLoading: false,
    error: null,
  };
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
  | RampsServiceGetPaymentMethodsAction
  | RampsServiceGetQuotesAction
  | RampsServiceGetBuyWidgetUrlAction,
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
    actions: [...RAMPS_CONTROLLER_REQUIRED_SERVICE_ACTIONS],
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

/**
 * Flushes pending microtasks by yielding to the event loop multiple times.
 */
async function flushPromises(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}
