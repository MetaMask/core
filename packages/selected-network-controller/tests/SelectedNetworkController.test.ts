import { ControllerMessenger } from '@metamask/base-controller';
import { createEventEmitterProxy } from '@metamask/swappable-obj-proxy';

import type {
  AllowedActions,
  AllowedEvents,
  GetUseRequestQueue,
  SelectedNetworkControllerActions,
  SelectedNetworkControllerEvents,
  SelectedNetworkControllerState,
  Domain,
  NetworkProxy,
} from '../src/SelectedNetworkController';
import {
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
    provider: { sendAsync: jest.fn() },
    blockTracker: { getLatestBlock: jest.fn() },
  });
  messenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    mockGetNetworkClientById,
  );
  const mockGetSelectedNetworkClient = jest.fn().mockReturnValue({
    provider: { sendAsync: jest.fn() },
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
  getUseRequestQueue = () => false,
  domainProxyMap = new Map<Domain, NetworkProxy>(),
}: {
  state?: SelectedNetworkControllerState;
  getSubjectNames?: string[];
  getUseRequestQueue?: GetUseRequestQueue;
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
    if (initialTarget?.sendAsync !== undefined) {
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
  const controller = new SelectedNetworkController({
    messenger: restrictedMessenger,
    state,
    getUseRequestQueue,
    domainProxyMap,
  });
  return {
    controller,
    messenger,
    mockProviderProxy,
    mockBlockTrackerProxy,
    createEventEmitterProxyMock,
    ...mockMessengerActions,
  };
};

describe('SelectedNetworkController', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });
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
  });

  describe('It updates domain state when the network controller state changes', () => {
    describe('when a networkClient is deleted from the network controller state', () => {
      it('updates the networkClientId for domains which were previously set to the deleted networkClientId', () => {
        const { controller, messenger } = setup({
          state: {
            domains: {
              metamask: 'goerli',
              'example.com': 'test-network-client-id',
              'test.com': 'test-network-client-id',
            },
          },
        });

        messenger.publish(
          'NetworkController:stateChange',
          {
            providerConfig: { chainId: '0x5', ticker: 'ETH', type: 'goerli' },
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
    afterEach(() => {
      jest.clearAllMocks();
    });
    it('should throw an error when passed "metamask" as domain arg', () => {
      const { controller } = setup();
      expect(() => {
        controller.setNetworkClientIdForDomain('metamask', 'mainnet');
      }).toThrow(
        'NetworkClientId for domain "metamask" cannot be set on the SelectedNetworkController',
      );
      expect(controller.state.domains.metamask).toBeUndefined();
    });
    describe('when the useRequestQueue is false', () => {
      describe('when the requesting domain is not metamask', () => {
        it('updates the networkClientId for domain in state', () => {
          const { controller } = setup({
            state: {
              domains: {
                '1.com': 'mainnet',
                '2.com': 'mainnet',
                '3.com': 'mainnet',
              },
            },
          });
          const domains = ['1.com', '2.com', '3.com'];
          const networkClientIds = ['1', '2', '3'];

          domains.forEach((domain, i) =>
            controller.setNetworkClientIdForDomain(domain, networkClientIds[i]),
          );

          expect(controller.state.domains['1.com']).toBe('1');
          expect(controller.state.domains['2.com']).toBe('2');
          expect(controller.state.domains['3.com']).toBe('3');
        });
      });
    });

    describe('when the useRequestQueue is true', () => {
      describe('when the requesting domain has existing permissions', () => {
        it('sets the networkClientId for the passed in domain', () => {
          const { controller, mockHasPermissions } = setup({
            state: { domains: {} },
            getUseRequestQueue: () => true,
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
            getUseRequestQueue: () => true,
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
            expect.objectContaining({ sendAsync: expect.any(Function) }),
          );
          expect(mockProviderProxy.setTarget).toHaveBeenCalledTimes(2);
        });
      });

      describe('when the requesting domain does not have permissions', () => {
        it('throw an error and does not set the networkClientId for the passed in domain', () => {
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
    describe('when the useRequestQueue is false', () => {
      it('returns the selectedNetworkClientId from the NetworkController if not no networkClientId is set for requested domain', () => {
        const { controller } = setup();
        expect(controller.getNetworkClientIdForDomain('example.com')).toBe(
          'mainnet',
        );
      });
      it('returns the selectedNetworkClientId from the NetworkController if a networkClientId is set for the requested domain', () => {
        const { controller } = setup();
        const networkClientId = 'network3';
        controller.setNetworkClientIdForDomain('example.com', networkClientId);
        expect(controller.getNetworkClientIdForDomain('example.com')).toBe(
          'mainnet',
        );
      });
      it('returns the networkClientId for the metamask domain when passed "metamask"', () => {
        const { controller } = setup();
        const result = controller.getNetworkClientIdForDomain('metamask');
        expect(result).toBe('mainnet');
      });
    });

    describe('when the useRequestQueue is true', () => {
      it('returns the networkClientId for the passed in domain, when a networkClientId has been set for the requested domain', () => {
        const { controller } = setup({
          state: { domains: {} },
          getUseRequestQueue: () => true,
        });

        const networkClientId1 = 'network5';
        const networkClientId2 = 'network6';
        controller.setNetworkClientIdForDomain('example.com', networkClientId1);
        controller.setNetworkClientIdForDomain('test.com', networkClientId2);
        const result1 = controller.getNetworkClientIdForDomain('example.com');
        const result2 = controller.getNetworkClientIdForDomain('test.com');
        expect(result1).toBe(networkClientId1);
        expect(result2).toBe(networkClientId2);
      });

      it('returns the selectedNetworkClientId from the NetworkController when no networkClientId has been set for the domain requested', () => {
        const { controller } = setup({
          state: { domains: {} },
          getUseRequestQueue: () => true,
        });
        expect(controller.getNetworkClientIdForDomain('example.com')).toBe(
          'mainnet',
        );
      });
    });
  });

  describe('getProviderAndBlockTracker', () => {
    describe('provider and block tracker are not cached for the passed domain and networkClientId has been set for the requesting domain', () => {
      it('creates a proxy provider and block tracker with the domain network client', () => {
        const { controller } = setup({
          state: {
            domains: {
              'example.com': 'mainnet',
            },
          },
          getUseRequestQueue: () => true,
        });
        const result = controller.getProviderAndBlockTracker('example.com');
        expect(result).toBeDefined();
      });

      it('throws an error if the domain network client is not initialized', () => {
        const { controller, mockGetNetworkClientById } = setup({
          state: {
            domains: {
              'example.com': 'mainnet',
            },
          },
          getUseRequestQueue: () => true,
        });
        mockGetNetworkClientById.mockImplementation(() => {
          throw new Error('No network client was found with the ID');
        });

        expect(() =>
          controller.getProviderAndBlockTracker('example.com'),
        ).toThrow('No network client was found with the ID');
      });
    });

    describe('provider and block tracker are not cached for the passed domain and networkClientId has not been set for the requesting domain', () => {
      it('creates a new proxy provider and block tracker with the global network client', () => {
        const { controller } = setup({
          state: {
            domains: {},
          },
          getUseRequestQueue: () => true,
        });
        const result = controller.getProviderAndBlockTracker('test.com');
        expect(result).toBeDefined();
      });

      it('throws an error if the global network client is not initialized', () => {
        const { controller, mockGetSelectedNetworkClient } = setup({
          state: {
            domains: {},
          },
          getUseRequestQueue: () => true,
        });
        mockGetSelectedNetworkClient.mockReturnValue(undefined);
        expect(() => controller.getProviderAndBlockTracker('test.com')).toThrow(
          'Selected network not initialized',
        );
      });
    });

    describe('provider and block tracker are cached for the passed domain', () => {
      it('returns the cached proxy provider and block tracker if set', () => {
        const { controller } = setup({
          state: {
            domains: {},
          },
          getUseRequestQueue: () => true,
        });
        controller.setNetworkClientIdForDomain('example.com', 'network7');
        const result = controller.getProviderAndBlockTracker('example.com');
        expect(result).toBeDefined();
      });
    });
  });

  describe('When a permission is added or removed', () => {
    it('should add new domain to domains list on permission add', async () => {
      const { controller, messenger } = setup();
      const mockPermission = {
        parentCapability: 'eth_accounts',
        id: 'example.com',
        date: Date.now(),
        caveats: [{ type: 'restrictToAccounts', value: ['0x...'] }],
      };

      messenger.publish('PermissionController:stateChange', { subjects: {} }, [
        {
          op: 'add',
          path: ['subjects', 'example.com', 'permissions'],
          value: mockPermission,
        },
      ]);

      const { domains } = controller.state;
      expect(domains['example.com']).toBeDefined();
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
          expect.objectContaining({ sendAsync: expect.any(Function) }),
        );
        expect(mockProviderProxy.setTarget).toHaveBeenCalledTimes(1);

        const { domains } = controller.state;
        expect(domains['example.com']).toBeUndefined();
      });

      it('should delete the proxy if the globally selected network client is not initialized but a proxy exists for the domain', async () => {
        const {
          controller,
          messenger,
          mockProviderProxy,
          mockGetSelectedNetworkClient,
        } = setup({
          state: { domains: { 'example.com': 'foo' } },
        });
        controller.getProviderAndBlockTracker('example.com');

        mockGetSelectedNetworkClient.mockReturnValue(undefined);

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

        // TODO(JL): replace this with a test that the proxy is removed from cache when the domainProxyMap PR is merged
        expect(mockProviderProxy.setTarget).toHaveBeenCalledTimes(0);
      });
    });
  });
  describe('Constructor checks for domains in permissions', () => {
    it('should set networkClientId for domains not already in state', async () => {
      const getSubjectNamesMock = ['newdomain.com'];
      const { controller } = setup({
        state: { domains: {} },
        getSubjectNames: getSubjectNamesMock,
      });

      // Now, 'newdomain.com' should have the selectedNetworkClientId set
      expect(controller.state.domains['newdomain.com']).toBe('mainnet');
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

      // The 'existingdomain.com' should retain its initial networkClientId
      expect(controller.state.domains['existingdomain.com']).toBe(
        'initialNetworkId',
      );
    });
  });
});
