import type {
  NetworkConnectionBannerControllerState,
  FailedNetwork,
} from './NetworkConnectionBannerController.js';
import { networkConnectionBannerControllerSelectors } from './selectors.js';

const failedNetwork: FailedNetwork = {
  chainId: '0x1',
  networkClientId: 'mainnet',
  name: 'Ethereum Mainnet',
  rpcUrl: 'https://mainnet.infura.io/v3/abc',
  isInfuraEndpoint: true,
  switchableInfuraNetworkClientId: null,
};

describe('networkConnectionBannerControllerSelectors', () => {
  describe('selectNetworkConnectionBannerStatus', () => {
    it.each(['available', 'degraded', 'unavailable'] as const)(
      'returns %s when status is %s',
      (status) => {
        const state: NetworkConnectionBannerControllerState = {
          networkConnectionBannerStatus: status,
          networkConnectionBannerNetwork:
            status === 'available' ? null : failedNetwork,
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
        networkConnectionBannerStatus: 'available',
        networkConnectionBannerNetwork: null,
      };

      const result =
        networkConnectionBannerControllerSelectors.selectNetworkConnectionBannerNetwork(
          state,
        );

      expect(result).toBeNull();
    });

    it('returns the failing network details when a banner is shown', () => {
      const state: NetworkConnectionBannerControllerState = {
        networkConnectionBannerStatus: 'degraded',
        networkConnectionBannerNetwork: failedNetwork,
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
        networkConnectionBannerStatus: 'available',
        networkConnectionBannerNetwork: null,
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
          networkConnectionBannerStatus: status,
          networkConnectionBannerNetwork: failedNetwork,
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
