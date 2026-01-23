import type { ConnectivityControllerState } from './ConnectivityController';
import { connectivityControllerSelectors } from './selectors';
import { CONNECTIVITY_STATUSES } from './types';

describe('connectivityControllerSelectors', () => {
  describe('selectConnectivityStatus', () => {
    it.each([[CONNECTIVITY_STATUSES.Online], [CONNECTIVITY_STATUSES.Offline]])(
      'returns %s when connectivityStatus is %s',
      (connectivityStatus) => {
        const state: ConnectivityControllerState = {
          connectivityStatus,
        };

        const result =
          connectivityControllerSelectors.selectConnectivityStatus(state);

        expect(result).toBe(connectivityStatus);
      },
    );
  });

  describe('selectIsOffline', () => {
    it.each([
      [CONNECTIVITY_STATUSES.Online, false],
      [CONNECTIVITY_STATUSES.Offline, true],
    ])(
      'when connectivityStatus=%s, returns %s',
      (connectivityStatus, expected) => {
        const state: ConnectivityControllerState = {
          connectivityStatus,
        };

        const result = connectivityControllerSelectors.selectIsOffline(state);

        expect(result).toBe(expected);
      },
    );
  });
});
