import type {
  NetworkConnectionBannerControllerState,
  NetworkConnectionBannerFailedNetwork,
} from './NetworkConnectionBannerController';
import { networkConnectionBannerControllerSelectors } from './selectors';

const failedNetwork: NetworkConnectionBannerFailedNetwork = {
  chainId: '0x1',
  networkClientId: 'mainnet',
  networkName: 'Ethereum Mainnet',
  rpcUrl: 'https://mainnet.infura.io/v3/abc',
  isInfuraEndpoint: true,
  infuraNetworkClientId: null,
};

describe('networkConnectionBannerControllerSelectors', () => {
  describe('selectNetworkConnectionBannerStatus', () => {
    it.each(['available', 'degraded', 'unavailable'] as const)(
      'returns %s when status is %s',
      (status) => {
        const state: NetworkConnectionBannerControllerState = {
          status,
          network: status === 'available' ? null : failedNetwork,
        };

        const result =
          networkConnectionBannerControllerSelectors.selectNetworkConnectionBannerStatus(
            state,
          );

        expect(result).toBe(status);
      },
    );
  });

  describe('selectNetworkConnectionBannerNetwork', () => {
    it('returns null when no banner is shown', () => {
      const state: NetworkConnectionBannerControllerState = {
        status: 'available',
        network: null,
      };

      const result =
        networkConnectionBannerControllerSelectors.selectNetworkConnectionBannerNetwork(
          state,
        );

      expect(result).toBeNull();
    });

    it('returns the failing network details when a banner is shown', () => {
      const state: NetworkConnectionBannerControllerState = {
        status: 'degraded',
        network: failedNetwork,
      };

      const result =
        networkConnectionBannerControllerSelectors.selectNetworkConnectionBannerNetwork(
          state,
        );

      expect(result).toBe(failedNetwork);
    });
  });

  describe('selectIsNetworkConnectionBannerVisible', () => {
    it('returns false when status is available', () => {
      const state: NetworkConnectionBannerControllerState = {
        status: 'available',
        network: null,
      };

      const result =
        networkConnectionBannerControllerSelectors.selectIsNetworkConnectionBannerVisible(
          state,
        );

      expect(result).toBe(false);
    });

    it.each(['degraded', 'unavailable'] as const)(
      'returns true when status is %s',
      (status) => {
        const state: NetworkConnectionBannerControllerState = {
          status,
          network: failedNetwork,
        };

        const result =
          networkConnectionBannerControllerSelectors.selectIsNetworkConnectionBannerVisible(
            state,
          );

        expect(result).toBe(true);
      },
    );
  });
});
