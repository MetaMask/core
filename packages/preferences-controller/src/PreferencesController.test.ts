import { ETHERSCAN_SUPPORTED_CHAIN_IDS } from './constants';
import { PreferencesController } from './PreferencesController';

describe('PreferencesController', () => {
  it('should set default state', () => {
    const controller = new PreferencesController();
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
      showIncomingTransactions: {
        '0x1': true,
        '0x5': true,
        '0x38': true,
        '0x61': true,
        '0xa': true,
        '0xa869': true,
        '0x1a4': true,
        '0x89': true,
        '0x13881': true,
        '0xa86a': true,
        '0xfa': true,
        '0xfa2': true,
        '0xaa36a7': true,
        '0xe704': true,
        '0xe708': true,
        '0x504': true,
        '0x507': true,
        '0x505': true,
        '0x64': true,
      },
    });
  });

  it('should add identities', () => {
    const controller = new PreferencesController();
    controller.addIdentities(['0x00']);
    controller.addIdentities(['0x00']);
    expect(controller.state.identities['0x00'].address).toBe('0x00');
    expect(controller.state.identities['0x00'].name).toBe('Account 1');
    expect(controller.state.identities['0x00'].importTime).toBeLessThanOrEqual(
      Date.now(),
    );
  });

  it('should remove identity', () => {
    const controller = new PreferencesController();
    controller.addIdentities(['0x00', '0x01', '0x02']);
    controller.update({ selectedAddress: '0x00' });
    controller.removeIdentity('0x00');
    controller.removeIdentity('0x02');
    controller.removeIdentity('0x00');
    expect(typeof controller.state.identities['0x00']).toBe('undefined');
    expect(controller.state.selectedAddress).toBe('0x01');
  });

  it('should set identity label', () => {
    const controller = new PreferencesController();
    controller.addIdentities(['0x00']);
    controller.setAccountLabel('0x00', 'bar');
    controller.setAccountLabel('0x01', 'qux');
    expect(controller.state.identities['0x00'].name).toBe('bar');
    expect(controller.state.identities['0x01'].name).toBe('qux');
  });

  it('should sync identities', () => {
    const controller = new PreferencesController();
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
    const controller = new PreferencesController();
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
    const controller = new PreferencesController(
      {},
      { identities: { '0x01': { address: '0x01', name: 'Custom name' } } },
    );
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
    const controller = new PreferencesController(
      {},
      {
        identities: {
          '0x01': { address: '0x01', name: 'Account 2' },
          '0x00': { address: '0x00', name: 'Account 1' },
        },
      },
    );
    controller.updateIdentities(['0x00']);
    expect(controller.state.identities).toStrictEqual({
      '0x00': { address: '0x00', name: 'Account 1' },
    });
  });

  it('should not update selected address if it is still among identities', () => {
    const controller = new PreferencesController(
      {},
      {
        identities: {
          '0x01': { address: '0x01', name: 'Account 2' },
          '0x00': { address: '0x00', name: 'Account 1' },
        },
        selectedAddress: '0x01',
      },
    );
    controller.updateIdentities(['0x00', '0x01']);
    expect(controller.state.selectedAddress).toBe('0x01');
  });

  it('should update selected address to first identity if it was removed from identities', () => {
    const controller = new PreferencesController(
      {},
      {
        identities: {
          '0x01': { address: '0x01', name: 'Account 2' },
          '0x02': { address: '0x02', name: 'Account 3' },
          '0x00': { address: '0x00', name: 'Account 1' },
        },
        selectedAddress: '0x02',
      },
    );
    controller.updateIdentities(['0x00', '0x01']);
    expect(controller.state.selectedAddress).toBe('0x00');
  });

  it('should set IPFS gateway', () => {
    const controller = new PreferencesController();
    controller.setIpfsGateway('https://ipfs.infura.io/ipfs/');
    expect(controller.state.ipfsGateway).toBe('https://ipfs.infura.io/ipfs/');
  });

  it('should update selected address as checksummed', () => {
    const controller = new PreferencesController();
    controller.setSelectedAddress('0x95d2bc047b0ddec1e4a178eeb64d59f5e735cd0a');
    expect(controller.state.selectedAddress).toBe(
      '0x95D2bC047B0dDEc1E4A178EeB64d59F5E735cd0A',
    );
  });

  it('should set useTokenDetection', () => {
    const controller = new PreferencesController();
    controller.setUseTokenDetection(true);
    expect(controller.state.useTokenDetection).toBe(true);
  });

  it('should set useNftDetection', () => {
    const controller = new PreferencesController();
    controller.setOpenSeaEnabled(true);
    controller.setUseNftDetection(true);
    expect(controller.state.useNftDetection).toBe(true);
  });

  it('should set securityAlertsEnabled', () => {
    const controller = new PreferencesController();
    controller.setSecurityAlertsEnabled(true);
    expect(controller.state.securityAlertsEnabled).toBe(true);
  });

  it('should set disabledRpcMethodPreferences', () => {
    const controller = new PreferencesController();
    controller.setDisabledRpcMethodPreference('eth_sign', true);
    expect(controller.state.disabledRpcMethodPreferences.eth_sign).toBe(true);
  });

  it('should set isMultiAccountBalancesEnabled', () => {
    const controller = new PreferencesController();
    controller.setIsMultiAccountBalancesEnabled(true);
    expect(controller.state.isMultiAccountBalancesEnabled).toBe(true);
  });

  it('should set showTestNetworks', () => {
    const controller = new PreferencesController();
    controller.setShowTestNetworks(true);
    expect(controller.state.showTestNetworks).toBe(true);
  });

  it('should set isIpfsGatewayEnabled', () => {
    const controller = new PreferencesController();
    controller.setIsIpfsGatewayEnabled(true);
    expect(controller.state.isIpfsGatewayEnabled).toBe(true);
  });

  it('should set showIncomingTransactions to false on ethereum network', () => {
    const controller = new PreferencesController();

    controller.setEnableNetworkIncomingTransactions('0x1', false);
    expect(controller.state.showIncomingTransactions['0x1']).toBe(false);
  });
});
