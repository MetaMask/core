import { ControllerMessenger } from '@metamask/base-controller';
import type {
  ProviderProxy,
  BlockTrackerProxy,
} from '@metamask/network-controller';
import { createEventEmitterProxy } from '@metamask/swappable-obj-proxy';

import type {
  AllowedActions,
  AllowedEvents,
  SelectedNetworkControllerActions,
  SelectedNetworkControllerEvents,
  SelectedNetworkControllerState,
  Domain,
  NetworkProxy,
} from '../src/SelectedNetworkController';
import {
  METAMASK_DOMAIN,
  SelectedNetworkController,
  controllerName,
} from '../src/SelectedNetworkController';

/**
 * Builds a new instance of the ControllerMessenger class for the SelectedNetworkController.
 *
 * @returns A new instance of the ControllerMessenger class for the SelectedNetworkController.
 */
function buildMessenger() {
  return new ControllerMessenger<
    SelectedNetworkControllerActions | AllowedActions,
    SelectedNetworkControllerEvents | AllowedEvents
  >();
}

/**
 * Build a restricted controller messenger for the selected network controller.
 *
 * @param options - The options bag.
 * @param options.messenger - A controller messenger.
 * @param options.getSubjectNames - Permissions controller list of domains with permissions
 * @returns The network controller restricted messenger.
 */
export function buildSelectedNetworkControllerMessenger({
  messenger = new ControllerMessenger<
    SelectedNetworkControllerActions | AllowedActions,
    SelectedNetworkControllerEvents | AllowedEvents
  >(),
  getSubjectNames,
}: {
  messenger?: ControllerMessenger<
    SelectedNetworkControllerActions | AllowedActions,
    SelectedNetworkControllerEvents | AllowedEvents
  >;
  getSubjectNames?: string[];
} = {}) {
  const mockGetNetworkClientById = jest.fn().mockReturnValue({
    provider: { request: jest.fn() },
    blockTracker: { getLatestBlock: jest.fn() },
  });
  messenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    mockGetNetworkClientById,
  );
  const mockGetSelectedNetworkClient = jest.fn().mockReturnValue({
    provider: { request: jest.fn() },
    blockTracker: { getLatestBlock: jest.fn() },
  });
  messenger.registerActionHandler(
    'NetworkController:getSelectedNetworkClient',
    mockGetSelectedNetworkClient,
  );
  const mockNetworkControllerGetState = jest
    .fn()
    .mockReturnValue({ selectedNetworkClientId: 'mainnet' });
  messenger.registerActionHandler(
    'NetworkController:getState',
    mockNetworkControllerGetState,
  );
  const mockHasPermissions = jest.fn().mockReturnValue(true);
  messenger.registerActionHandler(
    'PermissionController:hasPermissions',
    mockHasPermissions,
  );
  const mockGetSubjectNames = jest.fn().mockReturnValue(getSubjectNames);
  messenger.registerActionHandler(
    'PermissionController:getSubjectNames',
    mockGetSubjectNames,
  );

  const restrictedMessenger = messenger.getRestricted({
    name: controllerName,
    allowedActions: [
      'NetworkController:getNetworkClientById',
      'NetworkController:getSelectedNetworkClient',
      'NetworkController:getState',
      'PermissionController:hasPermissions',
      'PermissionController:getSubjectNames',
    ],
    allowedEvents: [
      'NetworkController:stateChange',
      'PermissionController:stateChange',
    ],
  });

  return {
    restrictedMessenger,
    mockGetNetworkClientById,
    mockGetSelectedNetworkClient,
    mockNetworkControllerGetState,
    mockHasPermissions,
    mockGetSubjectNames,
  };
}

jest.mock('@metamask/swappable-obj-proxy');

const setup = ({
  getSubjectNames = [],
  state,
  useRequestQueuePreference = false,
  domainProxyMap = new Map<Domain, NetworkProxy>(),
}: {
  state?: SelectedNetworkControllerState;
  getSubjectNames?: string[];
  useRequestQueuePreference?: boolean;
  onPreferencesStateChange?: (
    listener: (preferencesState: { useRequestQueue: boolean }) => void,
  ) => void;
  domainProxyMap?: Map<Domain, NetworkProxy>;
} = {}) => {
  const mockProviderProxy = {
    setTarget: jest.fn(),
    eventNames: jest.fn(),
    rawListeners: jest.fn(),
    removeAllListeners: jest.fn(),
    on: jest.fn(),
    prependListener: jest.fn(),
    addListener: jest.fn(),
    off: jest.fn(),
    once: jest.fn(),
  };
  const mockBlockTrackerProxy = {
    setTarget: jest.fn(),
    eventNames: jest.fn(),
    rawListeners: jest.fn(),
    removeAllListeners: jest.fn(),
    on: jest.fn(),
    prependListener: jest.fn(),
    addListener: jest.fn(),
    off: jest.fn(),
    once: jest.fn(),
  };

  const createEventEmitterProxyMock = jest.mocked(createEventEmitterProxy);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createEventEmitterProxyMock.mockImplementation((initialTarget: any) => {
    if (initialTarget?.request !== undefined) {
      return mockProviderProxy;
    }
    if (initialTarget?.getLatestBlock !== undefined) {
      return mockBlockTrackerProxy;
    }
    return mockProviderProxy;
  });
  const messenger = buildMessenger();
  const { restrictedMessenger, ...mockMessengerActions } =
    buildSelectedNetworkControllerMessenger({
      messenger,
      getSubjectNames,
    });

  const preferencesStateChangeListeners: ((state: {
    useRequestQueue: boolean;
  }) => void)[] = [];
  const controller = new SelectedNetworkController({
    messenger: restrictedMessenger,
    state,
    useRequestQueuePreference,
    onPreferencesStateChange: (listener) => {
      preferencesStateChangeListeners.push(listener);
    },
    domainProxyMap,
  });

  const triggerPreferencesStateChange = (preferencesState: {
    useRequestQueue: boolean;
  }) => {
    for (const listener of preferencesStateChangeListeners) {
      listener(preferencesState);
    }
  };

  return {
    controller,
    messenger,
    mockProviderProxy,
    mockBlockTrackerProxy,
    domainProxyMap,
    triggerPreferencesStateChange,
    createEventEmitterProxyMock,
    ...mockMessengerActions,
  };
};

describe('SelectedNetworkController', () => {
  describe('constructor', () => {
    it('can be instantiated with default values', () => {
      const { controller } = setup();
      expect(controller.state).toStrictEqual({
        domains: {},
      });
    });

    it('can be instantiated with a state', () => {
      const { controller } = setup({
        state: {
          domains: { networkClientId: 'goerli' },
        },
      });
      expect(controller.state).toStrictEqual({
        domains: { networkClientId: 'goerli' },
      });
    });

    describe('when useRequestQueuePreference is true', () => {
      it('should set networkClientId for domains not already in state', async () => {
        const { controller } = setup({
          state: {
            domains: {
              'existingdomain.com': 'initialNetworkId',
            },
          },
          getSubjectNames: ['newdomain.com'],
          useRequestQueuePreference: true,
        });

        expect(controller.state.domains).toStrictEqual({
          'newdomain.com': 'mainnet',
          'existingdomain.com': 'initialNetworkId',
        });
      });

      it('should not modify domains already in state', async () => {
        const { controller } = setup({
          state: {
            domains: {
              'existingdomain.com': 'initialNetworkId',
            },
          },
          getSubjectNames: ['existingdomain.com'],
          useRequestQueuePreference: true,
        });

        expect(controller.state.domains).toStrictEqual({
          'existingdomain.com': 'initialNetworkId',
        });
      });
    });

    describe('when useRequestQueuePreference is false', () => {
      it('should not set networkClientId for new domains', async () => {
        const { controller } = setup({
          state: {
            domains: {
              'existingdomain.com': 'initialNetworkId',
            },
          },
          getSubjectNames: ['newdomain.com'],
        });

        expect(controller.state.domains).toStrictEqual({
          'existingdomain.com': 'initialNetworkId',
        });
      });

      it('should not modify domains already in state', async () => {
        const { controller } = setup({
          state: {
            domains: {
              'existingdomain.com': 'initialNetworkId',
            },
          },
          getSubjectNames: ['existingdomain.com'],
        });

        expect(controller.state.domains).toStrictEqual({
          'existingdomain.com': 'initialNetworkId',
        });
      });
    });
  });

  describe('networkController:stateChange', () => {
    describe('when a networkClient is deleted from the network controller state', () => {
      it('does not update state when useRequestQueuePreference is false', () => {
        const { controller, messenger } = setup({
          state: {
            domains: {},
          },
        });

        messenger.publish(
          'NetworkController:stateChange',
          {
            selectedNetworkClientId: 'goerli',
            networkConfigurations: {},
            networksMetadata: {},
          },
          [
            {
              op: 'remove',
              path: ['networkConfigurations', 'test-network-client-id'],
            },
          ],
        );
        expect(controller.state.domains).toStrictEqual({});
      });

      it('updates the networkClientId for domains which were previously set to the deleted networkClientId when useRequestQueuePreference is true', () => {
        const { controller, messenger } = setup({
          state: {
            domains: {
              metamask: 'goerli',
              'example.com': 'test-network-client-id',
              'test.com': 'test-network-client-id',
            },
          },
          useRequestQueuePreference: true,
        });

        messenger.publish(
          'NetworkController:stateChange',
          {
            selectedNetworkClientId: 'goerli',
            networkConfigurations: {},
            networksMetadata: {},
          },
          [
            {
              op: 'remove',
              path: ['networkConfigurations', 'test-network-client-id'],
            },
          ],
        );
        expect(controller.state.domains['example.com']).toBe('goerli');
        expect(controller.state.domains['test.com']).toBe('goerli');
      });
    });
  });

  describe('setNetworkClientIdForDomain', () => {
    it('does not update state when the useRequestQueuePreference is false', () => {
      const { controller } = setup({
        state: {
          domains: {},
        },
      });

      controller.setNetworkClientIdForDomain('1.com', '1');
      expect(controller.state.domains).toStrictEqual({});
    });

    describe('when useRequestQueuePreference is true', () => {
      it('should throw an error when passed "metamask" as domain arg', () => {
        const { controller } = setup({ useRequestQueuePreference: true });
        expect(() => {
          controller.setNetworkClientIdForDomain('metamask', 'mainnet');
        }).toThrow(
          'NetworkClientId for domain "metamask" cannot be set on the SelectedNetworkController',
        );
        expect(controller.state.domains.metamask).toBeUndefined();
      });

      describe('when the requesting domain is a snap (starts with "npm:" or "local:"', () => {
        it('skips setting the networkClientId for the passed in domain', () => {
          const { controller, mockHasPermissions } = setup({
            state: { domains: {} },
            useRequestQueuePreference: true,
          });
          mockHasPermissions.mockReturnValue(true);
          const snapDomainOne = 'npm:@metamask/bip32-example-snap';
          const snapDomainTwo = 'local:@metamask/bip32-example-snap';
          const nonSnapDomain = 'example.com';
          const networkClientId = 'network1';

          controller.setNetworkClientIdForDomain(
            nonSnapDomain,
            networkClientId,
          );
          controller.setNetworkClientIdForDomain(
            snapDomainOne,
            networkClientId,
          );
          controller.setNetworkClientIdForDomain(
            snapDomainTwo,
            networkClientId,
          );

          expect(controller.state.domains).toStrictEqual({
            [nonSnapDomain]: networkClientId,
          });
        });
      });

      describe('when the requesting domain has existing permissions', () => {
        it('sets the networkClientId for the passed in domain', () => {
          const { controller, mockHasPermissions } = setup({
            state: { domains: {} },
            useRequestQueuePreference: true,
          });
          mockHasPermissions.mockReturnValue(true);
          const domain = 'example.com';
          const networkClientId = 'network1';
          controller.setNetworkClientIdForDomain(domain, networkClientId);
          expect(controller.state.domains[domain]).toBe(networkClientId);
        });

        it('updates the provider and block tracker proxy when they already exist for the domain', () => {
          const { controller, mockProviderProxy, mockHasPermissions } = setup({
            state: { domains: {} },
            useRequestQueuePreference: true,
          });
          mockHasPermissions.mockReturnValue(true);
          const initialNetworkClientId = '123';

          // creates the proxy for the new domain
          controller.setNetworkClientIdForDomain(
            'example.com',
            initialNetworkClientId,
          );
          const newNetworkClientId = 'abc';

          expect(mockProviderProxy.setTarget).toHaveBeenCalledTimes(1);

          // calls setTarget on the proxy
          controller.setNetworkClientIdForDomain(
            'example.com',
            newNetworkClientId,
          );

          expect(mockProviderProxy.setTarget).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ request: expect.any(Function) }),
          );
          expect(mockProviderProxy.setTarget).toHaveBeenCalledTimes(2);
        });
      });

      describe('when the requesting domain does not have permissions', () => {
        it('throws an error and does not set the networkClientId for the passed in domain', () => {
          const { controller, mockHasPermissions } = setup({
            state: { domains: {} },
            useRequestQueuePreference: true,
          });
          mockHasPermissions.mockReturnValue(false);

          const domain = 'example.com';
          const networkClientId = 'network1';
          expect(() => {
            controller.setNetworkClientIdForDomain(domain, networkClientId);
          }).toThrow(
            'NetworkClientId for domain cannot be called with a domain that has not yet been granted permissions',
          );
          expect(controller.state.domains[domain]).toBeUndefined();
        });
      });
    });
  });

  describe('getNetworkClientIdForDomain', () => {
    it('returns the selectedNetworkClientId from the NetworkController when useRequestQueuePreference is false', () => {
      const { controller } = setup();
      expect(controller.getNetworkClientIdForDomain('example.com')).toBe(
        'mainnet',
      );
    });

    describe('when useRequestQueuePreference is true', () => {
      it('returns the networkClientId from state when a networkClientId has been set for the requested domain', () => {
        const { controller } = setup({
          state: {
            domains: {
              'example.com': '1',
            },
          },
          useRequestQueuePreference: true,
        });

        const result = controller.getNetworkClientIdForDomain('example.com');
        expect(result).toBe('1');
      });

      it('returns the selectedNetworkClientId from the NetworkController when no networkClientId has been set for the requested domain', () => {
        const { controller } = setup({
          state: { domains: {} },
          useRequestQueuePreference: true,
        });
        expect(controller.getNetworkClientIdForDomain('example.com')).toBe(
          'mainnet',
        );
      });
    });
  });

  describe('getProviderAndBlockTracker', () => {
    it('returns the cached proxy provider and block tracker when the domain already has a cached networkProxy in the domainProxyMap', () => {
      const mockProxyProvider = {
        setTarget: jest.fn(),
      } as unknown as ProviderProxy;
      const mockProxyBlockTracker = {
        setTarget: jest.fn(),
      } as unknown as BlockTrackerProxy;

      const domainProxyMap = new Map<Domain, NetworkProxy>([
        [
          'example.com',
          {
            provider: mockProxyProvider,
            blockTracker: mockProxyBlockTracker,
          },
        ],
        [
          'test.com',
          {
            provider: mockProxyProvider,
            blockTracker: mockProxyBlockTracker,
          },
        ],
      ]);
      const { controller } = setup({
        state: {
          domains: {},
        },
        useRequestQueuePreference: true,
        domainProxyMap,
      });

      const result = controller.getProviderAndBlockTracker('example.com');
      expect(result).toStrictEqual({
        provider: mockProxyProvider,
        blockTracker: mockProxyBlockTracker,
      });
    });

    describe('when the domain does not have a cached networkProxy in the domainProxyMap and useRequestQueuePreference is true', () => {
      describe('when the domain has permissions', () => {
        it('calls to NetworkController:getNetworkClientById and creates a new proxy provider and block tracker with the non-proxied globally selected network client', () => {
          const { controller, messenger, mockHasPermissions } = setup({
            state: {
              domains: {},
            },
            useRequestQueuePreference: true,
          });
          jest.spyOn(messenger, 'call');
          mockHasPermissions.mockReturnValue(true);

          const result = controller.getProviderAndBlockTracker('example.com');
          expect(result).toBeDefined();
          // unfortunately checking which networkController method is called is the best
          // proxy (no pun intended) for checking that the correct instance of the networkClient is used
          expect(messenger.call).toHaveBeenCalledWith(
            'NetworkController:getNetworkClientById',
            'mainnet',
          );
        });
      });

      describe('when the domain does not have permissions', () => {
        it('calls to NetworkController:getSelectedNetworkClient and creates a new proxy provider and block tracker with the proxied globally selected network client', () => {
          const { controller, messenger, mockHasPermissions } = setup({
            state: {
              domains: {},
            },
            useRequestQueuePreference: true,
          });
          jest.spyOn(messenger, 'call');
          mockHasPermissions.mockReturnValue(false);
          const result = controller.getProviderAndBlockTracker('example.com');
          expect(result).toBeDefined();
          // unfortunately checking which networkController method is called is the best
          // proxy (no pun intended) for checking that the correct instance of the networkClient is used
          expect(messenger.call).toHaveBeenCalledWith(
            'NetworkController:getSelectedNetworkClient',
          );
        });

        it('throws an error if the globally selected network client is not initialized', () => {
          const { controller, mockGetSelectedNetworkClient } = setup({
            state: {
              domains: {},
            },
            useRequestQueuePreference: false,
          });
          mockGetSelectedNetworkClient.mockReturnValue(undefined);
          expect(() =>
            controller.getProviderAndBlockTracker('example.com'),
          ).toThrow('Selected network not initialized');
        });
      });
    });

    describe('when the domain does not have a cached networkProxy in the domainProxyMap and useRequestQueuePreference is false', () => {
      it('calls to NetworkController:getSelectedNetworkClient and creates a new proxy provider and block tracker with the proxied globally selected network client', () => {
        const { controller, messenger } = setup({
          state: {
            domains: {},
          },
          useRequestQueuePreference: false,
        });
        jest.spyOn(messenger, 'call');

        const result = controller.getProviderAndBlockTracker('example.com');
        expect(result).toBeDefined();
        // unfortunately checking which networkController method is called is the best
        // proxy (no pun intended) for checking that the correct instance of the networkClient is used
        expect(messenger.call).toHaveBeenCalledWith(
          'NetworkController:getSelectedNetworkClient',
        );
      });
    });

    // TODO - improve these tests by using a full NetworkController and doing more robust behavioral testing
    describe('when the domain is a snap (starts with "npm:" or "local:")', () => {
      it('returns a proxied globally selected networkClient and does not create a new proxy in the domainProxyMap', () => {
        const { controller, domainProxyMap, messenger } = setup({
          state: {
            domains: {},
          },
          useRequestQueuePreference: true,
        });
        jest.spyOn(messenger, 'call');
        const snapDomain = 'npm:@metamask/bip32-example-snap';

        const result = controller.getProviderAndBlockTracker(snapDomain);

        expect(domainProxyMap.get(snapDomain)).toBeUndefined();
        expect(messenger.call).toHaveBeenCalledWith(
          'NetworkController:getSelectedNetworkClient',
        );
        expect(result).toBeDefined();
      });

      it('throws an error if the globally selected network client is not initialized', () => {
        const { controller, mockGetSelectedNetworkClient } = setup({
          state: {
            domains: {},
          },
          useRequestQueuePreference: false,
        });
        const snapDomain = 'npm:@metamask/bip32-example-snap';
        mockGetSelectedNetworkClient.mockReturnValue(undefined);

        expect(() => controller.getProviderAndBlockTracker(snapDomain)).toThrow(
          'Selected network not initialized',
        );
      });
    });

    describe('when the domain is a "metamask"', () => {
      it('returns a proxied globally selected networkClient and does not create a new proxy in the domainProxyMap', () => {
        const { controller, domainProxyMap, messenger } = setup({
          state: {
            domains: {},
          },
          useRequestQueuePreference: true,
        });
        jest.spyOn(messenger, 'call');

        const result = controller.getProviderAndBlockTracker(METAMASK_DOMAIN);

        expect(result).toBeDefined();
        expect(domainProxyMap.get(METAMASK_DOMAIN)).toBeUndefined();
        expect(messenger.call).toHaveBeenCalledWith(
          'NetworkController:getSelectedNetworkClient',
        );
      });

      it('throws an error if the globally selected network client is not initialized', () => {
        const { controller, mockGetSelectedNetworkClient } = setup({
          state: {
            domains: {},
          },
          useRequestQueuePreference: false,
        });
        mockGetSelectedNetworkClient.mockReturnValue(undefined);

        expect(() =>
          controller.getProviderAndBlockTracker(METAMASK_DOMAIN),
        ).toThrow('Selected network not initialized');
      });
    });
  });

  describe('PermissionController:stateChange', () => {
    describe('on permission add', () => {
      it('should add new domain to domains list when useRequestQueuePreference is true', async () => {
        const { controller, messenger } = setup({
          useRequestQueuePreference: true,
        });
        const mockPermission = {
          parentCapability: 'eth_accounts',
          id: 'example.com',
          date: Date.now(),
          caveats: [{ type: 'restrictToAccounts', value: ['0x...'] }],
        };

        messenger.publish(
          'PermissionController:stateChange',
          { subjects: {} },
          [
            {
              op: 'add',
              path: ['subjects', 'example.com', 'permissions'],
              value: mockPermission,
            },
          ],
        );

        const { domains } = controller.state;
        expect(domains['example.com']).toBeDefined();
      });

      it('should not add new domain to domains list when useRequestQueuePreference is false', async () => {
        const { controller, messenger } = setup({});
        const mockPermission = {
          parentCapability: 'eth_accounts',
          id: 'example.com',
          date: Date.now(),
          caveats: [{ type: 'restrictToAccounts', value: ['0x...'] }],
        };

        messenger.publish(
          'PermissionController:stateChange',
          { subjects: {} },
          [
            {
              op: 'add',
              path: ['subjects', 'example.com', 'permissions'],
              value: mockPermission,
            },
          ],
        );

        const { domains } = controller.state;
        expect(domains['example.com']).toBeUndefined();
      });
    });

    describe('on permission removal', () => {
      it('should remove domain from domains list', async () => {
        const { controller, messenger } = setup({
          state: { domains: { 'example.com': 'foo' } },
        });

        messenger.publish(
          'PermissionController:stateChange',
          { subjects: {} },
          [
            {
              op: 'remove',
              path: ['subjects', 'example.com', 'permissions'],
            },
          ],
        );

        const { domains } = controller.state;
        expect(domains['example.com']).toBeUndefined();
      });

      it('should set the proxy to the globally selected network if the globally selected network client is initialized and a proxy exists for the domain', async () => {
        const { controller, messenger, mockProviderProxy } = setup({
          state: { domains: { 'example.com': 'foo' } },
        });
        controller.getProviderAndBlockTracker('example.com');

        messenger.publish(
          'PermissionController:stateChange',
          { subjects: {} },
          [
            {
              op: 'remove',
              path: ['subjects', 'example.com', 'permissions'],
            },
          ],
        );

        expect(mockProviderProxy.setTarget).toHaveBeenCalledWith(
          expect.objectContaining({ request: expect.any(Function) }),
        );
        expect(mockProviderProxy.setTarget).toHaveBeenCalledTimes(1);

        const { domains } = controller.state;
        expect(domains['example.com']).toBeUndefined();
      });

      it('should delete the proxy if the globally selected network client is not initialized but a proxy exists for the domain', async () => {
        const {
          controller,
          messenger,
          domainProxyMap,
          mockProviderProxy,
          mockGetSelectedNetworkClient,
        } = setup({
          state: { domains: { 'example.com': 'foo' } },
        });
        controller.getProviderAndBlockTracker('example.com');

        mockGetSelectedNetworkClient.mockReturnValue(undefined);
        expect(domainProxyMap.get('example.com')).toBeDefined();
        messenger.publish(
          'PermissionController:stateChange',
          { subjects: {} },
          [
            {
              op: 'remove',
              path: ['subjects', 'example.com', 'permissions'],
            },
          ],
        );

        expect(mockProviderProxy.setTarget).toHaveBeenCalledTimes(0);
        expect(domainProxyMap.get('example.com')).toBeUndefined();
      });
    });
  });

  // because of the opacity of the networkClient and proxy implementations,
  // its impossible to make valuable assertions around which networkClient proxies
  // should be targeted when the useRequestQueuePreference state is toggled on and off:
  // When toggled on, the networkClient for the globally selected networkClientId should be used - **not** the NetworkController's proxy of this networkClient.
  // When toggled off, the NetworkControllers proxy of the globally selected networkClient should be used
  // TODO - improve these tests by using a full NetworkController and doing more robust behavioral testing
  describe('onPreferencesStateChange', () => {
    const mockProxyProvider = {
      setTarget: jest.fn(),
    } as unknown as ProviderProxy;
    const mockProxyBlockTracker = {
      setTarget: jest.fn(),
    } as unknown as BlockTrackerProxy;

    describe('when toggled from off to on', () => {
      describe('when domains have permissions', () => {
        it('sets the target of the existing proxies to the non-proxied networkClient for the globally selected networkClientId', () => {
          const domainProxyMap = new Map<Domain, NetworkProxy>([
            [
              'example.com',
              {
                provider: mockProxyProvider,
                blockTracker: mockProxyBlockTracker,
              },
            ],
            [
              'test.com',
              {
                provider: mockProxyProvider,
                blockTracker: mockProxyBlockTracker,
              },
            ],
          ]);

          const {
            mockHasPermissions,
            triggerPreferencesStateChange,
            messenger,
          } = setup({
            state: {
              domains: {},
            },
            useRequestQueuePreference: false,
            domainProxyMap,
          });
          jest.spyOn(messenger, 'call');

          mockHasPermissions.mockReturnValue(true);

          triggerPreferencesStateChange({ useRequestQueue: true });

          // this is a very imperfect way to test this, but networkClients and proxies are opaque
          // when the proxy is set with the networkClient fetched via NetworkController:getNetworkClientById
          // it **is not** tied to the NetworkController's own proxy of the networkClient
          expect(messenger.call).toHaveBeenCalledWith(
            'NetworkController:getNetworkClientById',
            'mainnet',
          );
          expect(mockProxyProvider.setTarget).toHaveBeenCalledTimes(2);
          expect(mockProxyBlockTracker.setTarget).toHaveBeenCalledTimes(2);
        });
      });

      describe('when domains do not have permissions', () => {
        it('does not change the target of the existing proxy', () => {
          const domainProxyMap = new Map<Domain, NetworkProxy>([
            [
              'example.com',
              {
                provider: mockProxyProvider,
                blockTracker: mockProxyBlockTracker,
              },
            ],
            [
              'test.com',
              {
                provider: mockProxyProvider,
                blockTracker: mockProxyBlockTracker,
              },
            ],
          ]);
          const { mockHasPermissions, triggerPreferencesStateChange } = setup({
            state: {
              domains: {},
            },
            useRequestQueuePreference: false,
            domainProxyMap,
          });

          mockHasPermissions.mockReturnValue(false);

          triggerPreferencesStateChange({ useRequestQueue: true });

          expect(mockProxyProvider.setTarget).toHaveBeenCalledTimes(0);
          expect(mockProxyBlockTracker.setTarget).toHaveBeenCalledTimes(0);
        });
      });
    });

    describe('when toggled from on to off', () => {
      it('sets the target of the existing proxies to the proxied globally selected networkClient', () => {
        const domainProxyMap = new Map<Domain, NetworkProxy>([
          [
            'example.com',
            {
              provider: mockProxyProvider,
              blockTracker: mockProxyBlockTracker,
            },
          ],
          [
            'test.com',
            {
              provider: mockProxyProvider,
              blockTracker: mockProxyBlockTracker,
            },
          ],
        ]);

        const { mockHasPermissions, triggerPreferencesStateChange, messenger } =
          setup({
            state: {
              domains: {
                'example.com': 'foo',
                'test.com': 'bar',
              },
            },
            useRequestQueuePreference: true,
            domainProxyMap,
          });
        jest.spyOn(messenger, 'call');

        mockHasPermissions.mockReturnValue(true);

        triggerPreferencesStateChange({ useRequestQueue: false });

        // this is a very imperfect way to test this, but networkClients and proxies are opaque
        // when the proxy is set with the networkClient fetched via NetworkController:getSelectedNetworkClient
        // it **is** tied to the NetworkController's own proxy of the networkClient
        expect(messenger.call).toHaveBeenCalledWith(
          'NetworkController:getSelectedNetworkClient',
        );
        expect(mockProxyProvider.setTarget).toHaveBeenCalledTimes(2);
        expect(mockProxyBlockTracker.setTarget).toHaveBeenCalledTimes(2);
      });
    });
  });
});
