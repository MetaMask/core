import { defaultState as networkControllerDefaultState } from '@metamask/network-controller';

import {
  buildSelectedNetworkControllerMessenger,
  buildMessenger,
} from './utils';
import type { SelectedNetworkControllerOptions } from '../src/SelectedNetworkController';
import { SelectedNetworkController } from '../src/SelectedNetworkController';

describe('SelectedNetworkController', () => {
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
    it('can set the networkClientId for a domain', () => {
      const options: SelectedNetworkControllerOptions = {
        messenger: buildSelectedNetworkControllerMessenger(), // Mock the messenger
      };
      const controller = new SelectedNetworkController(options);
      const domain = 'example.com';
      const networkClientId = 'network1';
      controller.setNetworkClientIdForDomain(domain, networkClientId);
      expect(controller.state.domains[domain]).toBe(networkClientId);
    });

    it('can set the networkClientId for the metamask domain specifically', () => {
      const options: SelectedNetworkControllerOptions = {
        messenger: buildSelectedNetworkControllerMessenger(), // Mock the messenger
      };
      const controller = new SelectedNetworkController(options);
      const networkClientId = 'network2';
      controller.setNetworkClientIdForMetamask(networkClientId);
      expect(controller.state.domains.metamask).toBe(networkClientId);
    });
  });

  describe('getNetworkClientIdForDomain', () => {
    it('gives the metamask domain when the perDomainNetwork option is false (default)', () => {
      const options: SelectedNetworkControllerOptions = {
        messenger: buildSelectedNetworkControllerMessenger(), // Mock the messenger
      };
      const controller = new SelectedNetworkController(options);
      const networkClientId = 'network4';
      controller.setNetworkClientIdForMetamask(networkClientId);
      const result = controller.getNetworkClientIdForDomain('example.com');
      expect(result).toBe(networkClientId);
    });

    it('when the perDomainNetwork feature flag is on, it returns items other than the metamask domain', () => {
      const options: SelectedNetworkControllerOptions = {
        messenger: buildSelectedNetworkControllerMessenger(), // Mock the messenger
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
  });

  it('updates the networkClientId for the metamask domain when the networkControllers selectedNetworkClientId changes', () => {
    const messenger = buildMessenger();
    const options: SelectedNetworkControllerOptions = {
      messenger: buildSelectedNetworkControllerMessenger(messenger),
    };
    const controller = new SelectedNetworkController(options);
    controller.setNetworkClientIdForMetamask('oldNetwork');
    expect(controller.state.domains.metamask).toBe('oldNetwork');

    const patch = [
      {
        path: ['selectedNetworkClientId'],
        op: 'replace' as const,
        value: 'newNetwork',
      },
    ];

    const state = {
      ...networkControllerDefaultState,
      selectedNetworkClientId: 'newNetwork',
    };
    messenger.publish('NetworkController:stateChange', state, patch);
    expect(controller.state.domains.metamask).toBe('newNetwork');
  });

  it("does not update the state if the network controller state changes but the selected network hasn't", () => {
    const mockMessagingSystem = {
      registerActionHandler: jest.fn(),
      subscribe: jest.fn(),
      publish: () => jest.fn(),
    };
    const options: SelectedNetworkControllerOptions = {
      messenger: mockMessagingSystem as any,
    };
    const controller = new SelectedNetworkController(options);
    controller.setNetworkClientIdForMetamask('oldNetwork');
    expect(controller.state.domains.metamask).toBe('oldNetwork');

    const stateChangeHandler = mockMessagingSystem.subscribe.mock.calls[0][1];
    const state: any = {
      selectedNetworkClientId: 'newNetwork',
    };
    const patch = [
      {
        path: ['anythingelse'],
        op: 'replace',
        value: 'abc',
      },
    ];
    stateChangeHandler(state, patch);
    expect(controller.state.domains.metamask).toBe('oldNetwork');
  });
});
