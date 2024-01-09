import { ControllerMessenger } from '@metamask/base-controller';

import { ETHERSCAN_SUPPORTED_CHAIN_IDS } from './constants';
import type { EtherscanSupportedHexChainId } from './PreferencesController';
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
      showIncomingTransactions: Object.values(
        ETHERSCAN_SUPPORTED_CHAIN_IDS,
      ).reduce((acc, curr) => {
        acc[curr] = true;
        return acc;
      }, {} as { [chainId in EtherscanSupportedHexChainId]: boolean }),
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
      state: {
        identities: {
          '0x00': { address: '0x00', name: 'Account 1' },
          '0x01': { address: '0x01', name: 'Account 2' },
          '0x02': { address: '0x02', name: 'Account 3' },
        },
        selectedAddress: '0x00',
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
      state: {
        identities: {
          '0x00': { address: '0x00', name: 'Account 1' },
          '0x01': { address: '0x01', name: 'Account 2' },
          '0x02': { address: '0x02', name: 'Account 3' },
        },
        selectedAddress: '0x00',
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

  it('should sync identities', () => {
    const controller = setupPreferencesController();
    controller.addIdentities(['0x00', '0x01']);
    controller.syncIdentities(['0x00', '0x01']);
    expect(controller.state.identities['0x00'].address).toBe('0x00');
    expect(controller.state.identities['0x00'].name).toBe('Account 1');
    expect(controller.state.identities['0x00'].importTime).toBeLessThanOrEqual(
      Date.now(),
    );
    expect(controller.state.identities['0x01'].address).toBe('0x01');
    expect(controller.state.identities['0x01'].name).toBe('Account 2');
    expect(controller.state.identities['0x01'].importTime).toBeLessThanOrEqual(
      Date.now(),
    );
    controller.syncIdentities(['0x00']);
    expect(controller.state.identities['0x00'].address).toBe('0x00');
    expect(controller.state.identities['0x00'].name).toBe('Account 1');
    expect(controller.state.selectedAddress).toBe('0x00');
  });

  it('should add new identities', () => {
    const controller = setupPreferencesController();
    controller.updateIdentities(['0x00', '0x01']);
    expect(controller.state.identities['0x00'].address).toBe('0x00');
    expect(controller.state.identities['0x00'].name).toBe('Account 1');
    expect(controller.state.identities['0x00'].importTime).toBeLessThanOrEqual(
      Date.now(),
    );
    expect(controller.state.identities['0x01'].address).toBe('0x01');
    expect(controller.state.identities['0x01'].name).toBe('Account 2');
    expect(controller.state.identities['0x01'].importTime).toBeLessThanOrEqual(
      Date.now(),
    );
  });

  it('should not update existing identities', () => {
    const controller = setupPreferencesController({
      state: {
        identities: { '0x01': { address: '0x01', name: 'Custom name' } },
      },
    });
    controller.updateIdentities(['0x00', '0x01']);
    expect(controller.state.identities['0x00'].address).toBe('0x00');
    expect(controller.state.identities['0x00'].name).toBe('Account 1');
    expect(controller.state.identities['0x00'].importTime).toBeLessThanOrEqual(
      Date.now(),
    );
    expect(controller.state.identities['0x01'].address).toBe('0x01');
    expect(controller.state.identities['0x01'].name).toBe('Custom name');
    expect(controller.state.identities['0x01'].importTime).toBeUndefined();
  });

  it('should remove identities', () => {
    const controller = setupPreferencesController({
      state: {
        identities: {
          '0x01': { address: '0x01', name: 'Account 2' },
          '0x00': { address: '0x00', name: 'Account 1' },
        },
      },
    });
    controller.updateIdentities(['0x00']);
    expect(controller.state.identities).toStrictEqual({
      '0x00': { address: '0x00', name: 'Account 1' },
    });
  });

  it('should not update selected address if it is still among identities', () => {
    const controller = setupPreferencesController({
      state: {
        identities: {
          '0x01': { address: '0x01', name: 'Account 2' },
          '0x00': { address: '0x00', name: 'Account 1' },
        },
        selectedAddress: '0x01',
      },
    });
    controller.updateIdentities(['0x00', '0x01']);
    expect(controller.state.selectedAddress).toBe('0x01');
  });

  it('should update selected address to first identity if it was removed from identities', () => {
    const controller = setupPreferencesController({
      state: {
        identities: {
          '0x01': { address: '0x01', name: 'Account 2' },
          '0x02': { address: '0x02', name: 'Account 3' },
          '0x00': { address: '0x00', name: 'Account 1' },
        },
        selectedAddress: '0x02',
      },
    });
    controller.updateIdentities(['0x00', '0x01']);
    expect(controller.state.selectedAddress).toBe('0x00');
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
});

/**
 * Setup a PreferencesController instance for testing.
 *
 * @param options - PreferencesController options.
 * @returns A PreferencesController instance.
 */
function setupPreferencesController(
  options: Partial<ConstructorParameters<typeof PreferencesController>[0]> = {},
) {
  const controllerMessenger = new ControllerMessenger();
  const preferencesControllerMessenger = controllerMessenger.getRestricted<
    'PreferencesController',
    never,
    never
  >({
    name: 'PreferencesController',
  });
  return new PreferencesController({
    messenger: preferencesControllerMessenger,
    ...options,
  });
}
