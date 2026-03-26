import type { ConnectivityControllerState } from './ConnectivityController';
import { connectivityControllerSelectors } from './selectors';
import { CONNECTIVITY_STATUSES } from './types';

describe('connectivityControllerSelectors', () => {
  describe('selectConnectivityStatus', () => {
    it('returns Online when connectivityStatus is Online', () => {
      const state: ConnectivityControllerState = {
        connectivityStatus: CONNECTIVITY_STATUSES.Online,
      };

      const result =
        connectivityControllerSelectors.selectConnectivityStatus(state);

      expect(result).toBe(CONNECTIVITY_STATUSES.Online);
    });

    it('returns Offline when connectivityStatus is Offline', () => {
      const state: ConnectivityControllerState = {
        connectivityStatus: CONNECTIVITY_STATUSES.Offline,
      };

      const result =
        connectivityControllerSelectors.selectConnectivityStatus(state);

      expect(result).toBe(CONNECTIVITY_STATUSES.Offline);
    });
  });

  describe('selectIsOffline', () => {
    it('returns false when connectivityStatus is Online', () => {
      const state: ConnectivityControllerState = {
        connectivityStatus: CONNECTIVITY_STATUSES.Online,
      };

      const result = connectivityControllerSelectors.selectIsOffline(state);

      expect(result).toBe(false);
    });

    it('returns true when connectivityStatus is Offline', () => {
      const state: ConnectivityControllerState = {
        connectivityStatus: CONNECTIVITY_STATUSES.Offline,
      };

      const result = connectivityControllerSelectors.selectIsOffline(state);

      expect(result).toBe(true);
    });
  });
});
