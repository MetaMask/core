import type { SelectedNetworkControllerOptions } from '../src/SelectedNetworkController';
import { SelectedNetworkController } from '../src/SelectedNetworkController';
import { buildSelectedNetworkControllerMessenger } from './utils';

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
        messenger: buildSelectedNetworkControllerMessenger(), // Mock the messenger
      };
      const controller = new SelectedNetworkController(options);
      const networkClientId = 'network2';
      controller.setNetworkClientIdForDomain('not-metamask', networkClientId);
      expect(controller.state.domains.metamask).toBe(networkClientId);
    });

    it('sets the networkClientId for the passed in domain, when the perDomainNetwork option is true ,', () => {
      const options: SelectedNetworkControllerOptions = {
        messenger: buildSelectedNetworkControllerMessenger(), // Mock the messenger
      };
      const controller = new SelectedNetworkController(options);
      controller.state.perDomainNetwork = true;
      const domain = 'example.com';
      const networkClientId = 'network1';
      controller.setNetworkClientIdForDomain(domain, networkClientId);
      expect(controller.state.domains[domain]).toBe(networkClientId);
    });
  });

  describe('getNetworkClientIdForDomain', () => {
    it('returns the networkClientId for the metamask domain, when the perDomainNetwork option is false (default)', () => {
      const options: SelectedNetworkControllerOptions = {
        messenger: buildSelectedNetworkControllerMessenger(), // Mock the messenger
      };
      const controller = new SelectedNetworkController(options);
      const networkClientId = 'network4';
      controller.setNetworkClientIdForMetamask(networkClientId);
      const result = controller.getNetworkClientIdForDomain('example.com');
      expect(result).toBe(networkClientId);
    });

    it('returns the networkClientId for the passed in domain, when the perDomainNetwork option is true', () => {
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
});
