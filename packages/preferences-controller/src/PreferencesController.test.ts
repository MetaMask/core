import { ControllerMessenger } from '@metamask/base-controller';
import { getDefaultKeyringState } from '@metamask/keyring-controller';
import { cloneDeep } from 'lodash';

import { ETHERSCAN_SUPPORTED_CHAIN_IDS } from './constants';
import type {
  AllowedEvents,
  EtherscanSupportedHexChainId,
  PreferencesControllerActions,
  PreferencesControllerEvents,
} from './PreferencesController';
import { PreferencesController } from './PreferencesController';

describe('PreferencesController', () => {
  it('should set default state', () => {
    const controller = setupPreferencesController();
    expect(controller.state).toStrictEqual({
      featureFlags: {},
      identities: {},
      ipfsGateway: 'https://ipfs.io/ipfs/',
      lostIdentities: {},
      selectedAddress: '',
      useTokenDetection: true,
      useNftDetection: false,
      openSeaEnabled: false,
      securityAlertsEnabled: false,
      disabledRpcMethodPreferences: {
        eth_sign: false,
      },
      isMultiAccountBalancesEnabled: true,
      showTestNetworks: false,
      isIpfsGatewayEnabled: true,
      useTransactionSimulations: true,
      showIncomingTransactions: Object.values(
        ETHERSCAN_SUPPORTED_CHAIN_IDS,
      ).reduce((acc, curr) => {
        acc[curr] = true;
        return acc;
      }, {} as { [chainId in EtherscanSupportedHexChainId]: boolean }),
      smartTransactionsOptInStatus: false,
    });
  });

  describe('KeyringController:stateChange', () => {
    it('should update identities state to reflect new keyring accounts', () => {
      const messenger = getControllerMessenger();
      const controller = setupPreferencesController({
        options: {
          state: {
            identities: {
              '0x00': { address: '0x00', name: 'Account 1' },
            },
            selectedAddress: '0x00',
          },
        },
        messenger,
      });

      messenger.publish(
        'KeyringController:stateChange',
        {
          ...getDefaultKeyringState(),
          keyrings: [
            { accounts: ['0x00', '0x01', '0x02'], type: 'CustomKeyring' },
          ],
        },
        [],
      );

      expect(controller.state.identities).toMatchObject({
        '0x00': { address: '0x00', name: 'Account 1' },
        '0x01': {
          address: '0x01',
          importTime: expect.any(Number),
          name: 'Account 2',
        },
        '0x02': {
          address: '0x02',
          importTime: expect.any(Number),
          name: 'Account 3',
        },
      });
      expect(controller.state.selectedAddress).toBe('0x00');
    });

    it('should update identities state to reflect removed keyring accounts', () => {
      const messenger = getControllerMessenger();
      const controller = setupPreferencesController({
        options: {
          state: {
            identities: {
              '0x00': { address: '0x00', name: 'Account 1' },
              '0x01': { address: '0x01', name: 'Account 2' },
              '0x02': { address: '0x02', name: 'Account 3' },
            },
            selectedAddress: '0x00',
          },
        },
        messenger,
      });

      messenger.publish(
        'KeyringController:stateChange',
        {
          ...getDefaultKeyringState(),
          keyrings: [{ accounts: ['0x00'], type: 'CustomKeyring' }],
        },
        [],
      );

      expect(controller.state.identities).toStrictEqual({
        '0x00': { address: '0x00', name: 'Account 1' },
      });
    });

    it('should update selected address to first identity if the selected address was removed', () => {
      const messenger = getControllerMessenger();
      const controller = setupPreferencesController({
        options: {
          state: {
            identities: {
              '0x00': { address: '0x00', name: 'Account 1' },
              '0x01': { address: '0x01', name: 'Account 2' },
              '0x02': { address: '0x02', name: 'Account 3' },
            },
            selectedAddress: '0x02',
          },
        },
        messenger,
      });

      messenger.publish(
        'KeyringController:stateChange',
        {
          ...getDefaultKeyringState(),
          keyrings: [{ accounts: ['0x00'], type: 'CustomKeyring' }],
        },
        [],
      );

      expect(controller.state.selectedAddress).toBe('0x00');
    });

    it('should maintain existing identities when no accounts are present in keyrings', () => {
      const identitiesState = {
        '0x00': { address: '0x00', importTime: 1, name: 'Account 1' },
        '0x01': { address: '0x01', importTime: 2, name: 'Account 2' },
        '0x02': { address: '0x02', importTime: 3, name: 'Account 3' },
      };
      const messenger = getControllerMessenger();
      const controller = setupPreferencesController({
        options: {
          state: {
            identities: cloneDeep(identitiesState),
            selectedAddress: '0x00',
          },
        },
        messenger,
      });

      messenger.publish(
        'KeyringController:stateChange',
        {
          ...getDefaultKeyringState(),
          keyrings: [{ accounts: [], type: 'CustomKeyring' }],
        },
        [],
      );

      expect(controller.state.identities).toStrictEqual(identitiesState);
    });

    it('should not update existing identities', () => {
      const identitiesState = {
        '0x00': { address: '0x00', importTime: 1, name: 'Account 1' },
        '0x01': { address: '0x01', importTime: 2, name: 'Account 2' },
        '0x02': { address: '0x02', importTime: 3, name: 'Account 3' },
      };
      const messenger = getControllerMessenger();
      const controller = setupPreferencesController({
        options: {
          state: {
            identities: cloneDeep(identitiesState),
            selectedAddress: '0x00',
          },
        },
        messenger,
      });

      messenger.publish(
        'KeyringController:stateChange',
        {
          ...getDefaultKeyringState(),
          keyrings: [
            { accounts: ['0x00', '0x01', '0x02'], type: 'CustomKeyring' },
          ],
        },
        [],
      );

      expect(controller.state.identities).toStrictEqual(identitiesState);
    });

    it('should not duplicate accounts present in multiple keyrings', () => {
      const identitiesState = {
        '0x00': { address: '0x00', importTime: 1, name: 'Account 1' },
        '0x01': { address: '0x01', importTime: 2, name: 'Account 2' },
        '0x02': { address: '0x02', importTime: 3, name: 'Account 3' },
      };
      const messenger = getControllerMessenger();
      const controller = setupPreferencesController({
        options: {
          state: {
            identities: cloneDeep(identitiesState),
            selectedAddress: '0x00',
          },
        },
        messenger,
      });

      messenger.publish(
        'KeyringController:stateChange',
        {
          ...getDefaultKeyringState(),
          keyrings: [
            { accounts: ['0x00', '0x01', '0x02'], type: 'CustomKeyring' },
            { accounts: ['0x00', '0x01', '0x02'], type: 'CustomKeyring' },
          ],
        },
        [],
      );

      expect(controller.state.identities).toStrictEqual(identitiesState);
    });

    it('should not update selected address on account removal if it is still among identities', () => {
      const identitiesState = {
        '0x00': { address: '0x00', importTime: 1, name: 'Account 1' },
        '0x01': { address: '0x01', importTime: 2, name: 'Account 2' },
        '0x02': { address: '0x02', importTime: 3, name: 'Account 3' },
      };
      const messenger = getControllerMessenger();
      const controller = setupPreferencesController({
        options: {
          state: {
            identities: cloneDeep(identitiesState),
            selectedAddress: '0x01',
          },
        },
        messenger,
      });

      messenger.publish(
        'KeyringController:stateChange',
        {
          ...getDefaultKeyringState(),
          keyrings: [{ accounts: ['0x00', '0x01'], type: 'CustomKeyring' }],
        },
        [],
      );

      expect(controller.state.selectedAddress).toBe('0x01');
    });
  });

  it('should add identities', () => {
    const controller = setupPreferencesController();
    controller.addIdentities(['0x00']);
    controller.addIdentities(['0x00']);
    expect(controller.state.identities['0x00'].address).toBe('0x00');
    expect(controller.state.identities['0x00'].name).toBe('Account 1');
    expect(controller.state.identities['0x00'].importTime).toBeLessThanOrEqual(
      Date.now(),
    );
  });

  it('should add multiple identities, skipping those that are already in state', () => {
    const controller = setupPreferencesController({
      options: {
        state: {
          identities: {
            '0x00': { address: '0x00', name: 'Account 1' },
            '0x01': { address: '0x01', name: 'Account 2' },
            '0x02': { address: '0x02', name: 'Account 3' },
          },
          selectedAddress: '0x00',
        },
      },
    });

    controller.addIdentities(['0x00', '0x01', '0x02', '0x03', '0x04']);

    expect(controller.state.identities).toMatchObject({
      '0x00': { address: '0x00', name: 'Account 1' },
      '0x01': { address: '0x01', name: 'Account 2' },
      '0x02': { address: '0x02', name: 'Account 3' },
      '0x03': {
        address: '0x03',
        importTime: expect.any(Number),
        name: 'Account 4',
      },
      '0x04': {
        address: '0x04',
        importTime: expect.any(Number),
        name: 'Account 5',
      },
    });
  });

  it('should remove identity', () => {
    const controller = setupPreferencesController({
      options: {
        state: {
          identities: {
            '0x00': { address: '0x00', name: 'Account 1' },
            '0x01': { address: '0x01', name: 'Account 2' },
            '0x02': { address: '0x02', name: 'Account 3' },
          },
          selectedAddress: '0x00',
        },
      },
    });
    controller.removeIdentity('0x00');
    controller.removeIdentity('0x02');
    controller.removeIdentity('0x00');
    expect(typeof controller.state.identities['0x00']).toBe('undefined');
    expect(controller.state.selectedAddress).toBe('0x01');
  });

  it('should set identity label', () => {
    const controller = setupPreferencesController();
    controller.addIdentities(['0x00']);
    controller.setAccountLabel('0x00', 'bar');
    controller.setAccountLabel('0x01', 'qux');
    expect(controller.state.identities['0x00'].name).toBe('bar');
    expect(controller.state.identities['0x01'].name).toBe('qux');
  });

  it('should set IPFS gateway', () => {
    const controller = setupPreferencesController();
    controller.setIpfsGateway('https://ipfs.infura.io/ipfs/');
    expect(controller.state.ipfsGateway).toBe('https://ipfs.infura.io/ipfs/');
  });

  it('should update selected address as checksummed', () => {
    const controller = setupPreferencesController();
    controller.setSelectedAddress('0x95d2bc047b0ddec1e4a178eeb64d59f5e735cd0a');
    expect(controller.state.selectedAddress).toBe(
      '0x95D2bC047B0dDEc1E4A178EeB64d59F5E735cd0A',
    );
  });

  it('should set useTokenDetection', () => {
    const controller = setupPreferencesController();
    controller.setUseTokenDetection(true);
    expect(controller.state.useTokenDetection).toBe(true);
  });

  it('should set useNftDetection', () => {
    const controller = setupPreferencesController();
    controller.setOpenSeaEnabled(true);
    controller.setUseNftDetection(true);
    expect(controller.state.useNftDetection).toBe(true);
  });

  it('should throw an error when useNftDetection is set and openSeaEnabled is false', () => {
    const controller = setupPreferencesController();
    controller.setOpenSeaEnabled(false);
    expect(() => controller.setUseNftDetection(true)).toThrow(
      'useNftDetection cannot be enabled if openSeaEnabled is false',
    );
  });

  it('should set featureFlags', () => {
    const controller = setupPreferencesController();
    controller.setFeatureFlag('Feature A', true);
    controller.setFeatureFlag('Feature B', false);
    expect(controller.state.featureFlags).toStrictEqual({
      'Feature A': true,
      'Feature B': false,
    });
  });

  it('should set securityAlertsEnabled', () => {
    const controller = setupPreferencesController();
    controller.setSecurityAlertsEnabled(true);
    expect(controller.state.securityAlertsEnabled).toBe(true);
  });

  it('should set disabledRpcMethodPreferences', () => {
    const controller = setupPreferencesController();
    controller.setDisabledRpcMethodPreference('eth_sign', true);
    expect(controller.state.disabledRpcMethodPreferences.eth_sign).toBe(true);
  });

  it('should set isMultiAccountBalancesEnabled', () => {
    const controller = setupPreferencesController();
    controller.setIsMultiAccountBalancesEnabled(true);
    expect(controller.state.isMultiAccountBalancesEnabled).toBe(true);
  });

  it('should set showTestNetworks', () => {
    const controller = setupPreferencesController();
    controller.setShowTestNetworks(true);
    expect(controller.state.showTestNetworks).toBe(true);
  });

  it('should set isIpfsGatewayEnabled', () => {
    const controller = setupPreferencesController();
    controller.setIsIpfsGatewayEnabled(true);
    expect(controller.state.isIpfsGatewayEnabled).toBe(true);
  });

  it('should set showIncomingTransactions to false on ethereum network', () => {
    const controller = setupPreferencesController();

    controller.setEnableNetworkIncomingTransactions('0x1', false);
    expect(controller.state.showIncomingTransactions['0x1']).toBe(false);
  });

  it('should set smartTransactionsOptInStatus', () => {
    const controller = setupPreferencesController();
    controller.setSmartTransactionsOptInStatus(true);
    expect(controller.state.smartTransactionsOptInStatus).toBe(true);
  });

  it('should set useTransactionSimulations', () => {
    const controller = setupPreferencesController();
    controller.setUseTransactionSimulations(false);
    expect(controller.state.useTransactionSimulations).toBe(false);
  });
});

/**
 * Construct a controller messenger for use in PreferencesController tests.
 *
 * This is a utility function that saves us from manually entering the correct
 * type parameters for the ControllerMessenger each time we construct it.
 *
 * @returns A controller messenger
 */
function getControllerMessenger(): ControllerMessenger<
  PreferencesControllerActions,
  PreferencesControllerEvents | AllowedEvents
> {
  return new ControllerMessenger<
    PreferencesControllerActions,
    PreferencesControllerEvents | AllowedEvents
  >();
}

/**
 * Setup a PreferencesController instance for testing.
 *
 * @param args - Arguments
 * @param args.options - PreferencesController options.
 * @param args.messenger - A controller messenger.
 * @returns A PreferencesController instance.
 */
function setupPreferencesController({
  options = {},
  messenger,
}: {
  options?: Partial<ConstructorParameters<typeof PreferencesController>[0]>;
  messenger?: ControllerMessenger<
    PreferencesControllerActions,
    PreferencesControllerEvents | AllowedEvents
  >;
} = {}) {
  const controllerMessenger = messenger ?? getControllerMessenger();
  const preferencesControllerMessenger = controllerMessenger.getRestricted<
    'PreferencesController',
    never,
    AllowedEvents['type']
  >({
    name: 'PreferencesController',
    allowedActions: [],
    allowedEvents: ['KeyringController:stateChange'],
  });
  return new PreferencesController({
    messenger: preferencesControllerMessenger,
    ...options,
  });
}
