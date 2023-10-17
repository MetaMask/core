import { createEventEmitterProxy } from '@metamask/swappable-obj-proxy';

import type { SelectedNetworkControllerOptions } from '../src/SelectedNetworkController';
import { SelectedNetworkController } from '../src/SelectedNetworkController';
import { buildSelectedNetworkControllerMessenger } from './utils';

jest.mock('@metamask/swappable-obj-proxy');

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

    it('sets the networkClientId for the passed-in domain and updates the provider and block tracker proxy when they already exist', () => {
      const options: SelectedNetworkControllerOptions = {
        messenger: buildSelectedNetworkControllerMessenger(),
      };
      const controller = new SelectedNetworkController(options);

      const initialNetworkClientId = '123';
      const mockProviderProxy = {
        setTarget: jest.fn(),
      };
      (createEventEmitterProxy as jest.Mock).mockReturnValue(mockProviderProxy);
      controller.setNetworkClientIdForDomain(
        'example.com',
        initialNetworkClientId,
      );
      const newNetworkClientId = 'abc';
      controller.setNetworkClientIdForDomain('example.com', newNetworkClientId);

      expect(controller.getNetworkClientIdForDomain('example.com')).toBe(
        newNetworkClientId,
      );

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
});
