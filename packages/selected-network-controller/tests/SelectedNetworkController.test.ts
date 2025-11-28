import { deriveStateFromMetadata } from '@metamask/base-controller';
import {
  Messenger,
  MOCK_ANY_NAMESPACE,
  type MessengerActions,
  type MessengerEvents,
  type MockAnyNamespace,
} from '@metamask/messenger';
import {
  type ProviderProxy,
  type BlockTrackerProxy,
  type NetworkState,
  getDefaultNetworkControllerState,
  RpcEndpointType,
} from '@metamask/network-controller';
import {
  createEventEmitterProxy,
  createSwappableProxy,
} from '@metamask/swappable-obj-proxy';
import type { Hex } from '@metamask/utils';

import type {
  SelectedNetworkControllerState,
  Domain,
  NetworkProxy,
  SelectedNetworkControllerMessenger,
} from '../src/SelectedNetworkController';
import {
  METAMASK_DOMAIN,
  SelectedNetworkController,
} from '../src/SelectedNetworkController';

const controllerName = 'SelectedNetworkController';

type AllSelectedNetworkControllerActions =
  MessengerActions<SelectedNetworkControllerMessenger>;

type AllSelectedNetworkControllerEvents =
  MessengerEvents<SelectedNetworkControllerMessenger>;

type RootMessenger = Messenger<
  MockAnyNamespace,
  AllSelectedNetworkControllerActions,
  AllSelectedNetworkControllerEvents
>;

/**
 * Constructs the root messenger.
 *
 * @returns A root messenger.
 */
function getRootMessenger(): RootMessenger {
  return new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });
}

/**
 * Build a restricted messenger for the selected network controller.
 *
 * @param options - The options bag.
 * @param options.rootMessenger - A messenger.
 * @param options.getSubjectNames - Permissions controller list of domains with permissions
 * @returns The network controller restricted messenger.
 */
function buildSelectedNetworkControllerMessenger({
  rootMessenger,
  getSubjectNames,
}: {
  rootMessenger: RootMessenger;
  getSubjectNames?: string[];
}) {
  const mockGetNetworkClientById = jest.fn().mockReturnValue({
    provider: { request: jest.fn() },
    blockTracker: { getLatestBlock: jest.fn() },
  });
  rootMessenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    mockGetNetworkClientById,
  );
  const mockGetSelectedNetworkClient = jest.fn().mockReturnValue({
    provider: { request: jest.fn() },
    blockTracker: { getLatestBlock: jest.fn() },
  });
  rootMessenger.registerActionHandler(
    'NetworkController:getSelectedNetworkClient',
    mockGetSelectedNetworkClient,
  );
  const mockNetworkControllerGetState = jest
    .fn()
    .mockReturnValue({ selectedNetworkClientId: 'mainnet' });
  rootMessenger.registerActionHandler(
    'NetworkController:getState',
    mockNetworkControllerGetState,
  );
  const mockHasPermissions = jest.fn().mockReturnValue(true);
  rootMessenger.registerActionHandler(
    'PermissionController:hasPermissions',
    mockHasPermissions,
  );
  const mockGetSubjectNames = jest.fn().mockReturnValue(getSubjectNames);
  rootMessenger.registerActionHandler(
    'PermissionController:getSubjectNames',
    mockGetSubjectNames,
  );

  const messenger = new Messenger<
    typeof controllerName,
    AllSelectedNetworkControllerActions,
    AllSelectedNetworkControllerEvents,
    RootMessenger
  >({
    namespace: controllerName,
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    messenger,
    actions: [
      'NetworkController:getNetworkClientById',
      'NetworkController:getSelectedNetworkClient',
      'NetworkController:getState',
      'PermissionController:hasPermissions',
      'PermissionController:getSubjectNames',
    ],
    events: [
      'NetworkController:stateChange',
      'PermissionController:stateChange',
    ],
  });

  return {
    messenger,
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
  domainProxyMap = new Map<Domain, NetworkProxy>(),
}: {
  state?: SelectedNetworkControllerState;
  getSubjectNames?: string[];
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

  // Non-polluting use of any for test mock.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const swappableProxyImplementation = (initialTarget: any) => {
    if (initialTarget?.request !== undefined) {
      return mockProviderProxy;
    }
    if (initialTarget?.getLatestBlock !== undefined) {
      return mockBlockTrackerProxy;
    }
    return mockProviderProxy;
  };
  const createSwappableProxyMock = jest
    .mocked(createSwappableProxy)
    .mockImplementation(swappableProxyImplementation);
  const createEventEmitterProxyMock = jest
    .mocked(createEventEmitterProxy)
    .mockImplementation(swappableProxyImplementation);
  const rootMessenger = getRootMessenger();
  const { messenger, ...mockMessengerActions } =
    buildSelectedNetworkControllerMessenger({
      rootMessenger,
      getSubjectNames,
    });

  const controller = new SelectedNetworkController({
    messenger,
    state,
    domainProxyMap,
  });

  return {
    controller,
    rootMessenger,
    messenger,
    mockProviderProxy,
    mockBlockTrackerProxy,
    domainProxyMap,
    createSwappableProxyMock,
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
          domains: { networkClientId: 'sepolia' },
        },
      });
      expect(controller.state).toStrictEqual({
        domains: { networkClientId: 'sepolia' },
      });
    });

    it('should set networkClientId for domains not already in state', async () => {
      const { controller } = setup({
        state: {
          domains: {
            'existingdomain.com': 'initialNetworkId',
          },
        },
        getSubjectNames: ['newdomain.com'],
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
      });

      expect(controller.state.domains).toStrictEqual({
        'existingdomain.com': 'initialNetworkId',
      });
    });
  });

  describe('NetworkController:stateChange', () => {
    describe('when a network is deleted from the network controller', () => {
      const initialDomains = {
        'not-deleted-network.com': 'linea-mainnet',
        'deleted-network.com': 'sepolia',
      };

      const deleteNetwork = (
        chainId: Hex,
        networkControllerState: NetworkState,
        messenger: RootMessenger,
        mockNetworkControllerGetState: jest.Mock,
      ) => {
        delete networkControllerState.networkConfigurationsByChainId[chainId];
        mockNetworkControllerGetState.mockReturnValueOnce(
          networkControllerState,
        );
        messenger.publish(
          'NetworkController:stateChange',
          networkControllerState,
          [
            {
              op: 'remove',
              path: ['networkConfigurationsByChainId', chainId],
            },
          ],
        );
      };

      it('redirects domains to the globally selected network', () => {
        const { controller, rootMessenger, mockNetworkControllerGetState } =
          setup({
            state: { domains: initialDomains },
          });

        const networkControllerState = {
          ...getDefaultNetworkControllerState(),
          selectedNetworkClientId: 'mainnet',
        };

        deleteNetwork(
          '0xaa36a7',
          networkControllerState,
          rootMessenger,
          mockNetworkControllerGetState,
        );

        expect(controller.state.domains).toStrictEqual({
          ...initialDomains,
          'deleted-network.com': networkControllerState.selectedNetworkClientId,
        });
      });

      it('redirects domains to the globally selected network and handles garbage collected proxies', () => {
        const domainProxyMap = new Map();
        const {
          controller,
          rootMessenger,
          mockNetworkControllerGetState,
          mockGetNetworkClientById,
        } = setup({
          state: { domains: initialDomains },
          domainProxyMap,
        });

        // Simulate proxies being garbage collected
        domainProxyMap.clear();

        const networkControllerState = {
          ...getDefaultNetworkControllerState(),
          selectedNetworkClientId: 'mainnet',
        };

        mockGetNetworkClientById.mockImplementation((id) => {
          // Simulate the previous domain being deleted in NetworkController
          if (id !== 'mainnet') {
            throw new Error('Network client does not exist');
          }

          return {
            provider: { request: jest.fn() },
            blockTracker: { getLatestBlock: jest.fn() },
          };
        });

        deleteNetwork(
          '0xaa36a7',
          networkControllerState,
          rootMessenger,
          mockNetworkControllerGetState,
        );

        expect(controller.state.domains).toStrictEqual({
          ...initialDomains,
          'deleted-network.com': networkControllerState.selectedNetworkClientId,
        });
      });
    });

    describe('when a network is updated', () => {
      it('redirects domains when the default rpc endpoint is switched', () => {
        const initialDomains = {
          'different-chain.com': 'mainnet',
          'chain-with-new-default.com': 'sepolia',
        };

        const { controller, rootMessenger, mockNetworkControllerGetState } =
          setup({
            state: { domains: initialDomains },
          });

        const networkControllerState = getDefaultNetworkControllerState();
        const goerliNetwork =
          networkControllerState.networkConfigurationsByChainId['0xaa36a7'];

        goerliNetwork.defaultRpcEndpointIndex =
          goerliNetwork.rpcEndpoints.push({
            type: RpcEndpointType.Custom,
            url: 'https://new-default.com',
            failoverUrls: [],
            networkClientId: 'new-default-network-client-id',
          }) - 1;

        mockNetworkControllerGetState.mockReturnValueOnce(
          networkControllerState,
        );

        rootMessenger.publish(
          'NetworkController:stateChange',
          networkControllerState,
          [
            {
              op: 'replace',
              path: ['networkConfigurationsByChainId', '0xaa36a7'],
            },
          ],
        );

        expect(controller.state.domains).toStrictEqual({
          ...initialDomains,
          'chain-with-new-default.com': 'new-default-network-client-id',
        });
      });

      it('redirects domains when the default rpc endpoint is deleted and replaced', () => {
        const initialDomains = {
          'different-chain.com': 'mainnet',
          'chain-with-new-default.com': 'sepolia',
        };

        const { controller, rootMessenger, mockNetworkControllerGetState } =
          setup({
            state: { domains: initialDomains },
          });

        const networkControllerState = getDefaultNetworkControllerState();
        const goerliNetwork =
          networkControllerState.networkConfigurationsByChainId['0xaa36a7'];

        goerliNetwork.rpcEndpoints = [
          {
            type: RpcEndpointType.Custom,
            url: 'https://new-default.com',
            failoverUrls: [],
            networkClientId: 'new-default-network-client-id',
          },
        ];

        mockNetworkControllerGetState.mockReturnValueOnce(
          networkControllerState,
        );

        rootMessenger.publish(
          'NetworkController:stateChange',
          networkControllerState,
          [
            {
              op: 'replace',
              path: ['networkConfigurationsByChainId', '0xaa36a7'],
            },
          ],
        );

        expect(controller.state.domains).toStrictEqual({
          ...initialDomains,
          'chain-with-new-default.com': 'new-default-network-client-id',
        });
      });
    });
  });

  describe('setNetworkClientIdForDomain', () => {
    it('should throw an error when passed "metamask" as domain arg', () => {
      const { controller } = setup();
      expect(() => {
        controller.setNetworkClientIdForDomain('metamask', 'mainnet');
      }).toThrow(
        'NetworkClientId for domain "metamask" cannot be set on the SelectedNetworkController',
      );
      expect(controller.state.domains.metamask).toBeUndefined();
    });

    describe('when the requesting domain is a snap (starts with "npm:" or "local:"', () => {
      it('sets the networkClientId for the passed in snap ID', () => {
        const { controller, mockHasPermissions } = setup({
          state: { domains: {} },
        });
        mockHasPermissions.mockReturnValue(true);
        const domain = 'npm:foo-snap';
        const networkClientId = 'network1';
        controller.setNetworkClientIdForDomain(domain, networkClientId);
        expect(controller.state.domains[domain]).toBe(networkClientId);
      });

      it('updates the provider and block tracker proxy when they already exist for the snap ID', () => {
        const { controller, mockProviderProxy, mockHasPermissions } = setup({
          state: { domains: {} },
        });
        mockHasPermissions.mockReturnValue(true);
        const initialNetworkClientId = '123';

        // creates the proxy for the new domain
        controller.setNetworkClientIdForDomain(
          'npm:foo-snap',
          initialNetworkClientId,
        );
        const newNetworkClientId = 'abc';

        expect(mockProviderProxy.setTarget).toHaveBeenCalledTimes(1);

        // calls setTarget on the proxy
        controller.setNetworkClientIdForDomain(
          'npm:foo-snap',
          newNetworkClientId,
        );

        expect(mockProviderProxy.setTarget).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({ request: expect.any(Function) }),
        );
        expect(mockProviderProxy.setTarget).toHaveBeenCalledTimes(2);
      });
    });

    describe('when the requesting domain has existing permissions', () => {
      it('sets the networkClientId for the passed in domain', () => {
        const { controller, mockHasPermissions } = setup({
          state: { domains: {} },
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
  it('returns the networkClientId from state when a networkClientId has been set for the requested domain', () => {
    const { controller } = setup({
      state: {
        domains: {
          'example.com': '1',
        },
      },
    });

    const result = controller.getNetworkClientIdForDomain('example.com');
    expect(result).toBe('1');
  });

  it('returns the selectedNetworkClientId from the NetworkController when no networkClientId has been set for the requested domain', () => {
    const { controller } = setup({
      state: { domains: {} },
    });
    expect(controller.getNetworkClientIdForDomain('example.com')).toBe(
      'mainnet',
    );
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
      domainProxyMap,
    });

    const result = controller.getProviderAndBlockTracker('example.com');
    expect(result).toStrictEqual({
      provider: mockProxyProvider,
      blockTracker: mockProxyBlockTracker,
    });
  });

  describe('when the domain does not have a cached networkProxy in the domainProxyMap', () => {
    describe('when the domain has permissions', () => {
      it('calls to NetworkController:getNetworkClientById and creates a new proxy provider and block tracker with the non-proxied globally selected network client', () => {
        const { controller, messenger, mockHasPermissions } = setup({
          state: {
            domains: {},
          },
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
        const { controller, mockGetSelectedNetworkClient, mockHasPermissions } =
          setup({
            state: {
              domains: {},
            },
          });

        mockHasPermissions.mockReturnValue(false);
        mockGetSelectedNetworkClient.mockReturnValue(undefined);
        expect(() =>
          controller.getProviderAndBlockTracker('example.com'),
        ).toThrow('Selected network not initialized');
      });
    });
  });

  // TODO - improve these tests by using a full NetworkController and doing more robust behavioral testing
  describe('when the domain is a snap (starts with "npm:" or "local:")', () => {
    it('calls to NetworkController:getSelectedNetworkClient and creates a new proxy provider and block tracker with the proxied globally selected network client', () => {
      const { controller, messenger } = setup({
        state: {
          domains: {},
        },
      });
      jest.spyOn(messenger, 'call');

      const result = controller.getProviderAndBlockTracker('npm:foo-snap');
      expect(result).toBeDefined();
      // unfortunately checking which networkController method is called is the best
      // proxy (no pun intended) for checking that the correct instance of the networkClient is used
      expect(messenger.call).toHaveBeenCalledWith(
        'PermissionController:hasPermissions',
        'npm:foo-snap',
      );
    });

    it('throws an error if the globally selected network client is not initialized', () => {
      const { controller, mockGetSelectedNetworkClient, mockHasPermissions } =
        setup({
          state: {
            domains: {},
          },
        });
      const snapDomain = 'npm:@metamask/bip32-example-snap';
      mockHasPermissions.mockReturnValue(false);
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
    it('should add new domain to domains list', async () => {
      const { controller, rootMessenger } = setup({});
      const mockPermission = {
        parentCapability: 'eth_accounts',
        id: 'example.com',
        date: Date.now(),
        caveats: [{ type: 'restrictToAccounts', value: ['0x...'] }],
      };

      rootMessenger.publish(
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

    describe('on permission removal', () => {
      it('should remove domain from domains list', async () => {
        const { controller, rootMessenger } = setup({
          state: { domains: { 'example.com': 'foo' } },
        });

        rootMessenger.publish(
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
        const { controller, rootMessenger, mockProviderProxy } = setup({
          state: { domains: { 'example.com': 'foo' } },
        });
        controller.getProviderAndBlockTracker('example.com');

        rootMessenger.publish(
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
          rootMessenger,
          domainProxyMap,
          mockProviderProxy,
          mockGetSelectedNetworkClient,
        } = setup({
          state: { domains: { 'example.com': 'foo' } },
        });
        controller.getProviderAndBlockTracker('example.com');

        mockGetSelectedNetworkClient.mockReturnValue(undefined);
        expect(domainProxyMap.get('example.com')).toBeDefined();
        rootMessenger.publish(
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

  describe('metadata', () => {
    it('includes expected state in debug snapshots', () => {
      const { controller } = setup();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInDebugSnapshot',
        ),
      ).toMatchInlineSnapshot(`{}`);
    });

    it('includes expected state in state logs', () => {
      const { controller } = setup();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInStateLogs',
        ),
      ).toMatchInlineSnapshot(`
        {
          "domains": {},
        }
      `);
    });

    it('persists expected state', () => {
      const { controller } = setup();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'persist',
        ),
      ).toMatchInlineSnapshot(`
        {
          "domains": {},
        }
      `);
    });

    it('exposes expected state to UI', () => {
      const { controller } = setup();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'usedInUi',
        ),
      ).toMatchInlineSnapshot(`
        {
          "domains": {},
        }
      `);
    });
  });
});
