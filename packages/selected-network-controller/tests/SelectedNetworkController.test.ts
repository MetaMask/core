import { ControllerMessenger } from '@metamask/base-controller';
import { createEventEmitterProxy } from '@metamask/swappable-obj-proxy';

import type {
  AllowedActions,
  AllowedEvents,
  SelectedNetworkControllerActions,
  SelectedNetworkControllerEvents,
  SelectedNetworkControllerMessenger,
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
 * @param options.hasPermissions - Whether the requesting domain has permissions.
 * @returns The network controller restricted messenger.
 */
export function buildSelectedNetworkControllerMessenger({
  messenger = new ControllerMessenger<
    SelectedNetworkControllerActions | AllowedActions,
    SelectedNetworkControllerEvents | AllowedEvents
  >(),
  hasPermissions,
}: {
  messenger?: ControllerMessenger<
    SelectedNetworkControllerActions | AllowedActions,
    SelectedNetworkControllerEvents | AllowedEvents
  >;
  hasPermissions?: boolean;
} = {}): SelectedNetworkControllerMessenger {
  messenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    jest.fn().mockReturnValue({
      provider: { sendAsync: jest.fn() },
      blockTracker: { getLatestBlock: jest.fn() },
    }),
  );
  messenger.registerActionHandler(
    'NetworkController:getState',
    jest.fn().mockReturnValue({ selectedNetworkClientId: 'mainnet' }),
  );
  messenger.registerActionHandler(
    'PermissionController:hasPermissions',
    jest.fn().mockReturnValue(hasPermissions),
  );
  return messenger.getRestricted({
    name: controllerName,
    allowedActions: [
      'NetworkController:getNetworkClientById',
      'NetworkController:getState',
      'PermissionController:hasPermissions',
    ],
    allowedEvents: ['NetworkController:stateChange'],
  });
}

jest.mock('@metamask/swappable-obj-proxy');

const setup = ({
  hasPermissions = true,
  state = { perDomainNetwork: false, domains: {} },
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
  const selectedNetworkControllerMessenger =
    buildSelectedNetworkControllerMessenger({ messenger, hasPermissions });
  const controller = new SelectedNetworkController({
    messenger: selectedNetworkControllerMessenger,
    state,
  });
  return {
    controller,
    messenger,
    mockProviderProxy,
    mockBlockTrackerProxy,
    createEventEmitterProxyMock,
  };
};

describe('SelectedNetworkController', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });
  describe('constructor', () => {
    it('can be instantiated with default values', () => {
      const { controller } = setup({ state: undefined });
      expect(controller.state).toStrictEqual({
        domains: { metamask: 'mainnet' },
        perDomainNetwork: false,
      });
    });
    it('can be instantiated with a state', () => {
      const { controller } = setup({
        state: {
          perDomainNetwork: true,
          domains: { metamask: 'sepolia', networkClientId: 'goerli' },
        },
      });
      expect(controller.state).toStrictEqual({
        domains: { metamask: 'sepolia', networkClientId: 'goerli' },
        perDomainNetwork: true,
      });
    });
    it('changes the networkClientId for the metamask domain when selectedNetworkClientId in networkController state changes', () => {
      const { controller, messenger } = setup({
        state: {
          perDomainNetwork: true,
          domains: { metamask: 'mainnet' },
        },
      });
      expect(controller.state.domains.metamask).toBe('mainnet');
      messenger.publish(
        'NetworkController:stateChange',
        {
          providerConfig: { chainId: '0x5', ticker: 'ETH', type: 'goerli' },
          selectedNetworkClientId: 'goerli',
          networkConfigurations: {},
          networksMetadata: {},
        },
        [],
      );
      expect(controller.state.domains.metamask).toBe('goerli');
    });
  });

  describe('setNetworkClientIdForDomain', () => {
    describe('when the perDomainNetwork state is false', () => {
      describe('when the requesting domain is metamask', () => {
        it('sets the networkClientId for the metamask domain', () => {
          const { controller } = setup();

          const networkClientId = 'network2';
          controller.setNetworkClientIdForDomain(
            METAMASK_DOMAIN,
            networkClientId,
          );
          expect(controller.state.domains.metamask).toBe(networkClientId);
        });

        it('updates the networkClientId for all domains in state', () => {
          const { controller } = setup({
            state: {
              perDomainNetwork: false,
              domains: {
                metamask: 'mainnet',
                '1.com': '1',
                '2.com': '2',
              },
            },
          });

          controller.setNetworkClientIdForMetamask('foo');
          Object.entries(controller.state.domains).forEach(([domain]) =>
            expect(controller.state.domains[domain]).toBe('foo'),
          );
        });
      });

      describe('when the requesting domain is not metamask', () => {
        it('does not update the networkClientId for the metamask domain', () => {
          const { controller } = setup({
            hasPermissions: false,
            state: {
              perDomainNetwork: false,
              domains: { metamask: 'mainnet' },
            },
          });

          const networkClientId = 'network2';
          controller.setNetworkClientIdForDomain(
            'not-metamask',
            networkClientId,
          );
          expect(controller.state.domains.metamask).toBe('mainnet');
        });

        it('does not update the networkClientId for all domains in state', () => {
          const { controller } = setup({
            hasPermissions: false,
            state: {
              perDomainNetwork: false,
              domains: {
                metamask: 'mainnet',
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

          expect(controller.state.domains['1.com']).toBe('mainnet');
          expect(controller.state.domains['2.com']).toBe('mainnet');
        });
      });
    });

    describe('when the perDomainNetwork state is true', () => {
      describe('when the requesting domain has existing permissions', () => {
        it('sets the networkClientId for the passed in domain', () => {
          const { controller } = setup({
            state: { perDomainNetwork: true, domains: {} },
            hasPermissions: true,
          });

          const domain = 'example.com';
          const networkClientId = 'network1';
          controller.setNetworkClientIdForDomain(domain, networkClientId);
          expect(controller.state.domains[domain]).toBe(networkClientId);
        });

        it('updates the provider and block tracker proxy when they already exist for the domain', () => {
          const { controller, mockProviderProxy } = setup({
            state: { perDomainNetwork: true, domains: {} },
            hasPermissions: true,
          });
          const initialNetworkClientId = '123';

          // creates the proxy for the new domain
          controller.setNetworkClientIdForDomain(
            'example.com',
            initialNetworkClientId,
          );
          const newNetworkClientId = 'abc';

          // calls setTarget on the proxy
          controller.setNetworkClientIdForDomain(
            'example.com',
            newNetworkClientId,
          );

          expect(mockProviderProxy.setTarget).toHaveBeenCalledWith(
            expect.objectContaining({ sendAsync: expect.any(Function) }),
          );
          expect(mockProviderProxy.setTarget).toHaveBeenCalledTimes(1);
        });
      });

      describe('when the requesting domain does not have permissions', () => {
        it('does not set the networkClientId for the passed in domain', () => {
          const { controller } = setup({
            state: { perDomainNetwork: true, domains: {} },
            hasPermissions: false,
          });

          const domain = 'example.com';
          const networkClientId = 'network1';
          controller.setNetworkClientIdForDomain(domain, networkClientId);
          expect(controller.state.domains[domain]).toBeUndefined();
        });
      });
    });
  });

  describe('getNetworkClientIdForDomain', () => {
    describe('when the perDomainNetwork state is false', () => {
      it('returns undefined if not no networkClientId is set for requested domain', () => {
        const { controller } = setup();
        const result = controller.getNetworkClientIdForDomain('example.com');
        expect(result).toBeUndefined();
      });
      it('returns undefined if a networkClientId is set for the requested domain', () => {
        const { controller } = setup();
        const networkClientId = 'network3';
        controller.setNetworkClientIdForDomain('example.com', networkClientId);
        const result = controller.getNetworkClientIdForDomain('example.com');
        expect(result).toBeUndefined();
      });
      it('returns the networkClientId for the metamask domain when passed "metamask"', () => {
        const { controller } = setup();
        const result = controller.getNetworkClientIdForDomain('metamask');
        expect(result).toBe('mainnet');
      });
    });

    describe('when the perDomainNetwork state is true', () => {
      it('returns the networkClientId for the passed in domain, when a networkClientId has been set for the requested domain', () => {
        const { controller } = setup({
          state: { perDomainNetwork: true, domains: {} },
          hasPermissions: true,
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

      it('returns undefined when no networkClientId has been set for the domain requested', () => {
        const { controller } = setup({
          state: { perDomainNetwork: true, domains: {} },
          hasPermissions: true,
        });
        const result = controller.getNetworkClientIdForDomain('example.com');
        expect(result).toBeUndefined();
      });
    });
  });

  describe('getProviderAndBlockTracker', () => {
    it('returns a proxy provider and block tracker when there is one already', () => {
      const { controller } = setup();
      controller.setNetworkClientIdForDomain('example.com', 'network7');
      const result = controller.getProviderAndBlockTracker('example.com');
      expect(result).toBeDefined();
    });

    it('creates a new proxy provider and block tracker when there isnt one already', () => {
      const { controller } = setup();
      expect(
        controller.getNetworkClientIdForDomain('test.com'),
      ).toBeUndefined();
      const result = controller.getProviderAndBlockTracker('test.com');
      expect(result).toBeDefined();
    });
  });

  describe('setPerDomainNetwork', () => {
    describe('when toggling from false to true', () => {
      it('updates proxies for each domain', () => {
        const {
          controller,
          createEventEmitterProxyMock,
          mockProviderProxy,
          mockBlockTrackerProxy,
        } = setup({
          state: {
            perDomainNetwork: false,
            domains: {
              metamask: 'mainnet',
              'example.com': 'network7',
              'test.com': 'network8',
            },
          },
        });
        controller.setPerDomainNetwork(true);
        // createEventEmitterProxy is constructed twice (once for provider and once for blockTracker) for each of the domains in state
        expect(createEventEmitterProxyMock).toHaveBeenCalledTimes(6);

        // after the proxies have been created, the setTarget method on the proxy is called on each of them on subsequent setPerDomainNetwork calls
        controller.setPerDomainNetwork(false);
        expect(mockProviderProxy.setTarget).toHaveBeenCalledTimes(3);
        expect(mockBlockTrackerProxy.setTarget).toHaveBeenCalledTimes(3);
      });
    });
    describe('when toggling from true to false', () => {
      it('updates the networkClientId and proxies for each domain to match the metamask domain', () => {
        const {
          controller,
          createEventEmitterProxyMock,
          mockProviderProxy,
          mockBlockTrackerProxy,
        } = setup({
          state: {
            perDomainNetwork: true,
            domains: {
              metamask: 'mainnet',
              'example.com': 'network7',
              'test.com': 'network8',
            },
          },
        });
        controller.setPerDomainNetwork(false);
        expect(controller.state.domains).toStrictEqual({
          metamask: 'mainnet',
          'example.com': 'mainnet',
          'test.com': 'mainnet',
        });
        // createEventEmitterProxy is constructed twice (once for provider and once for blockTracker) for each of the domains in state
        expect(createEventEmitterProxyMock).toHaveBeenCalledTimes(6);

        // after the proxies have been created, the setTarget method on the proxy is called on each of them on subsequent setPerDomainNetwork calls
        controller.setPerDomainNetwork(true);
        expect(mockProviderProxy.setTarget).toHaveBeenCalledTimes(3);
        expect(mockBlockTrackerProxy.setTarget).toHaveBeenCalledTimes(3);
      });
    });
  });
});
