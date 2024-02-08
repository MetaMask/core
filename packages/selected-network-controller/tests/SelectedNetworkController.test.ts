import { ControllerMessenger } from '@metamask/base-controller';
import { createEventEmitterProxy } from '@metamask/swappable-obj-proxy';

import type {
  AllowedActions,
  AllowedEvents,
  SelectedNetworkControllerActions,
  SelectedNetworkControllerEvents,
  SelectedNetworkControllerMessenger,
  SelectedNetworkControllerOptions,
} from '../src/SelectedNetworkController';
import {
  SelectedNetworkController,
  controllerName,
} from '../src/SelectedNetworkController';

/**
 * Build a restricted controller messenger for the selected network controller.
 *
 * @param messenger - A controller messenger.
 * @returns The network controller restricted messenger.
 */
export function buildSelectedNetworkControllerMessenger(
  messenger = new ControllerMessenger<
    SelectedNetworkControllerActions | AllowedActions,
    SelectedNetworkControllerEvents | AllowedEvents
  >(),
): SelectedNetworkControllerMessenger {
  messenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    jest.fn().mockReturnValue({
      provider: { sendAsync: jest.fn() },
      blockTracker: { getLatestBlock: jest.fn() },
    }),
  );
  return messenger.getRestricted({
    name: controllerName,
    allowedActions: ['NetworkController:getNetworkClientById'],
    allowedEvents: ['NetworkController:stateChange'],
  });
}

jest.mock('@metamask/swappable-obj-proxy');
const createEventEmitterProxyMock = jest.mocked(createEventEmitterProxy);

describe('SelectedNetworkController', () => {
  beforeEach(() => {
    createEventEmitterProxyMock.mockReset();
  });

  it('can be instantiated with default values', () => {
    const options: SelectedNetworkControllerOptions = {
      messenger: buildSelectedNetworkControllerMessenger(),
    };

    const controller = new SelectedNetworkController(options);
    expect(controller.state).toStrictEqual({
      domains: {},
      perDomainNetwork: false,
    });
  });

  describe('setNetworkClientIdForDomain', () => {
    it('sets the networkClientId for the metamask domain, when the perDomainNetwork option is false (default)', () => {
      const options: SelectedNetworkControllerOptions = {
        messenger: buildSelectedNetworkControllerMessenger(),
      };
      const controller = new SelectedNetworkController(options);
      const networkClientId = 'network2';
      controller.setNetworkClientIdForDomain('not-metamask', networkClientId);
      expect(controller.state.domains.metamask).toBe(networkClientId);
    });

    it('sets the networkClientId for the passed in domain, when the perDomainNetwork option is true ,', () => {
      const options: SelectedNetworkControllerOptions = {
        messenger: buildSelectedNetworkControllerMessenger(),
      };
      const controller = new SelectedNetworkController(options);
      controller.state.perDomainNetwork = true;
      const domain = 'example.com';
      const networkClientId = 'network1';
      controller.setNetworkClientIdForDomain(domain, networkClientId);
      expect(controller.state.domains[domain]).toBe(networkClientId);
    });

    it('when the perDomainNetwork option is false, it updates the networkClientId for all domains in state', () => {
      const options: SelectedNetworkControllerOptions = {
        messenger: buildSelectedNetworkControllerMessenger(),
      };
      const controller = new SelectedNetworkController(options);
      controller.state.perDomainNetwork = false;
      const domains = ['1.com', '2.com', '3.com'];
      const networkClientIds = ['1', '2', '3'];
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
      createEventEmitterProxyMock.mockReturnValue(mockProviderProxy);
      controller.setNetworkClientIdForMetamask('abc');
      domains.forEach((domain, i) =>
        controller.setNetworkClientIdForDomain(domain, networkClientIds[i]),
      );

      controller.setNetworkClientIdForMetamask('foo');
      domains.forEach((domain) =>
        expect(controller.state.domains[domain]).toBe('foo'),
      );

      controller.setNetworkClientIdForMetamask('abc');
      domains.forEach((domain) =>
        expect(controller.state.domains[domain]).toBe('abc'),
      );
    });

    it('creates a new provider and block tracker proxy when they dont exist yet for the domain', () => {
      const options: SelectedNetworkControllerOptions = {
        messenger: buildSelectedNetworkControllerMessenger(),
      };
      const controller = new SelectedNetworkController(options);

      const initialNetworkClientId = '123';
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
      createEventEmitterProxyMock.mockReturnValue(mockProviderProxy);
      controller.setNetworkClientIdForDomain(
        'example.com',
        initialNetworkClientId,
      );
      expect(createEventEmitterProxyMock).toHaveBeenCalledTimes(2);
    });

    it('updates the provider and block tracker proxy when they already exist for the domain', () => {
      const options: SelectedNetworkControllerOptions = {
        messenger: buildSelectedNetworkControllerMessenger(),
      };
      const controller = new SelectedNetworkController(options);

      const initialNetworkClientId = '123';
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
      createEventEmitterProxyMock.mockReturnValue(mockProviderProxy);
      controller.setNetworkClientIdForDomain(
        'example.com',
        initialNetworkClientId,
      );
      const newNetworkClientId = 'abc';
      controller.setNetworkClientIdForDomain('example.com', newNetworkClientId);

      expect(mockProviderProxy.setTarget).toHaveBeenCalledWith(
        expect.objectContaining({ sendAsync: expect.any(Function) }),
      );
      expect(mockProviderProxy.setTarget).toHaveBeenCalledTimes(2);
    });
  });

  describe('getNetworkClientIdForDomain', () => {
    it('returns the networkClientId for the metamask domain, when the perDomainNetwork option is false (default)', () => {
      const options: SelectedNetworkControllerOptions = {
        messenger: buildSelectedNetworkControllerMessenger(),
      };
      const controller = new SelectedNetworkController(options);
      const networkClientId = 'network4';
      controller.setNetworkClientIdForMetamask(networkClientId);
      const result = controller.getNetworkClientIdForDomain('example.com');
      expect(result).toBe(networkClientId);
    });

    it('returns the networkClientId for the passed in domain, when the perDomainNetwork option is true', () => {
      const options: SelectedNetworkControllerOptions = {
        messenger: buildSelectedNetworkControllerMessenger(),
      };
      const controller = new SelectedNetworkController(options);
      controller.state.perDomainNetwork = true;
      const networkClientId1 = 'network5';
      const networkClientId2 = 'network6';
      controller.setNetworkClientIdForDomain('example.com', networkClientId1);
      controller.setNetworkClientIdForDomain('test.com', networkClientId2);
      const result1 = controller.getNetworkClientIdForDomain('example.com');
      const result2 = controller.getNetworkClientIdForDomain('test.com');
      expect(result1).toBe(networkClientId1);
      expect(result2).toBe(networkClientId2);
    });

    it('returns the networkClientId for the metamask domain, when the perDomainNetwork option is true, but no networkClientId has been set for the domain requested', () => {
      const options: SelectedNetworkControllerOptions = {
        messenger: buildSelectedNetworkControllerMessenger(),
      };
      const controller = new SelectedNetworkController(options);
      controller.state.perDomainNetwork = true;
      const networkClientId = 'network7';
      controller.setNetworkClientIdForMetamask(networkClientId);
      const result = controller.getNetworkClientIdForDomain('example.com');
      expect(result).toBe(networkClientId);
    });
  });

  describe('getProviderAndBlockTracker', () => {
    it('returns a proxy provider and block tracker when there is one already', () => {
      const options: SelectedNetworkControllerOptions = {
        messenger: buildSelectedNetworkControllerMessenger(),
      };
      const controller = new SelectedNetworkController(options);
      controller.setNetworkClientIdForDomain('example.com', 'network7');
      const result = controller.getProviderAndBlockTracker('example.com');
      expect(result).toBeDefined();
    });

    it('creates a new proxy provider and block tracker when there isnt one already', () => {
      const options: SelectedNetworkControllerOptions = {
        messenger: buildSelectedNetworkControllerMessenger(),
      };
      const controller = new SelectedNetworkController(options);
      expect(
        controller.getNetworkClientIdForDomain('test.com'),
      ).toBeUndefined();
      const result = controller.getProviderAndBlockTracker('test.com');
      expect(result).toBeDefined();
    });
  });

  describe('setPerDomainNetwork', () => {
    it('toggles the feature flag & updates the proxies for each domain', () => {
      const options: SelectedNetworkControllerOptions = {
        messenger: buildSelectedNetworkControllerMessenger(),
        state: { domains: {}, perDomainNetwork: false },
      };
      const controller = new SelectedNetworkController(options);
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
      createEventEmitterProxyMock.mockReturnValue(mockProviderProxy);
      controller.setNetworkClientIdForDomain('example.com', 'network7');
      expect(mockProviderProxy.setTarget).toHaveBeenCalledTimes(0);
      controller.setPerDomainNetwork(true);
      expect(mockProviderProxy.setTarget).toHaveBeenCalledTimes(2);
    });
  });
});
