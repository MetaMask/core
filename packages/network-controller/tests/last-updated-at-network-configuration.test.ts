import { updateNetworkConfigurationLastUpdatedAt } from '../src/last-updated-at-network-configuration';
import { buildCustomNetworkConfiguration } from './helpers';

describe('lastUpdatedNetworkConfiguration() tests', () => {
  it('adds a timestamp (ms) to the network configuration', () => {
    const configuration = buildCustomNetworkConfiguration();

    expect(configuration.lastUpdatedAt).toBeUndefined();
    updateNetworkConfigurationLastUpdatedAt(configuration);
    expect(configuration.lastUpdatedAt).toBeDefined();
  });
});
