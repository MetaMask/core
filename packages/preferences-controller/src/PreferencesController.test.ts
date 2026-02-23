import { deriveStateFromMetadata } from '@metamask/base-controller';
import { getDefaultKeyringState } from '@metamask/keyring-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import { cloneDeep } from 'lodash';

import { ETHERSCAN_SUPPORTED_CHAIN_IDS } from './constants';
import type {
  EtherscanSupportedHexChainId,
  PreferencesControllerMessenger,
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
      displayNftMedia: false,
      securityAlertsEnabled: false,
      isMultiAccountBalancesEnabled: true,
      showTestNetworks: false,
      smartAccountOptIn: true,
      smartAccountOptInForAccounts: [],
      isIpfsGatewayEnabled: true,
      useTransactionSimulations: true,
      showMultiRpcModal: false,
      showIncomingTransactions: Object.values(
        ETHERSCAN_SUPPORTED_CHAIN_IDS,
      ).reduce(
        (acc, curr) => {
          acc[curr] = true;
          return acc;
        },
        {} as { [chainId in EtherscanSupportedHexChainId]: boolean },
      ),
      smartTransactionsOptInStatus: true,
      useSafeChainsListValidation: true,
      tokenSortConfig: {
        key: 'tokenFiatAmount',
        order: 'dsc',
        sortCallback: 'stringNumeric',
      },
      privacyMode: false,
      dismissSmartAccountSuggestionEnabled: false,
      tokenNetworkFilter: {},
    });
  });

  describe('KeyringController:stateChange', () => {
    it('should update identities state to reflect new keyring accounts', () => {
      const messenger = getRootMessenger();
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
            {
              accounts: ['0x00', '0x01', '0x02'],
              type: 'CustomKeyring',
              metadata: {
                id: 'mock-id',
                name: '',
              },
            },
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
      const messenger = getRootMessenger();
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
          keyrings: [
            {
              accounts: ['0x00'],
              type: 'CustomKeyring',
              metadata: {
                id: 'mock-id',
                name: '',
              },
            },
          ],
        },
        [],
      );

      expect(controller.state.identities).toStrictEqual({
        '0x00': { address: '0x00', name: 'Account 1' },
      });
    });

    it('should update selected address to first identity if the selected address was removed', () => {
      const messenger = getRootMessenger();
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
          keyrings: [
            {
              accounts: ['0x00'],
              type: 'CustomKeyring',
              metadata: {
                id: 'mock-id',
                name: '',
              },
            },
          ],
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
      const messenger = getRootMessenger();
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
            {
              accounts: [],
              type: 'CustomKeyring',
              metadata: {
                id: 'mock-id',
                name: '',
              },
            },
          ],
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
      const messenger = getRootMessenger();
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
            {
              accounts: ['0x00', '0x01', '0x02'],
              type: 'CustomKeyring',
              metadata: {
                id: 'mock-id',
                name: '',
              },
            },
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
      const messenger = getRootMessenger();
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
            {
              accounts: ['0x00', '0x01', '0x02'],
              type: 'CustomKeyring',
              metadata: {
                id: 'mock-id',
                name: '',
              },
            },
            {
              accounts: ['0x00', '0x01', '0x02'],
              type: 'CustomKeyring',
              metadata: {
                id: 'mock-id',
                name: '',
              },
            },
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
      const messenger = getRootMessenger();
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
          keyrings: [
            {
              accounts: ['0x00', '0x01'],
              type: 'CustomKeyring',
              metadata: {
                id: 'mock-id',
                name: '',
              },
            },
          ],
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
    controller.setDisplayNftMedia(true);
    controller.setUseNftDetection(true);
    expect(controller.state.useNftDetection).toBe(true);
  });

  it('should throw an error when useNftDetection is set and displayNftMedia is false', () => {
    const controller = setupPreferencesController();
    controller.setDisplayNftMedia(false);
    expect(() => controller.setUseNftDetection(true)).toThrow(
      'useNftDetection cannot be enabled if displayNftMedia is false',
    );
  });

  it('should set useMultiRpcMigration', () => {
    const controller = setupPreferencesController();
    controller.setShowMultiRpcModal(true);
    expect(controller.state.showMultiRpcModal).toBe(true);
  });

  it('should set useMultiRpcMigration is false value is passed', () => {
    const controller = setupPreferencesController();
    controller.setShowMultiRpcModal(false);
    expect(controller.state.showMultiRpcModal).toBe(false);
  });

  it('sets tokenNetworkFilter', () => {
    const controller = setupPreferencesController();
    controller.setTokenNetworkFilter({ '0x1': true, '0xa': false });
    expect(controller.state.tokenNetworkFilter).toStrictEqual({
      '0x1': true,
      '0xa': false,
    });
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
    controller.setSmartTransactionsOptInStatus(false);
    expect(controller.state.smartTransactionsOptInStatus).toBe(false);
    controller.setSmartTransactionsOptInStatus(true);
    expect(controller.state.smartTransactionsOptInStatus).toBe(true);
  });

  it('should set useTransactionSimulations', () => {
    const controller = setupPreferencesController();
    controller.setUseTransactionSimulations(false);
    expect(controller.state.useTransactionSimulations).toBe(false);
  });

  it('should set useSafeChainsListValidation', () => {
    const controller = setupPreferencesController({
      options: {
        state: {
          useSafeChainsListValidation: false,
        },
      },
    });
    expect(controller.state.useSafeChainsListValidation).toBe(false);
    controller.setUseSafeChainsListValidation(true);
    expect(controller.state.useSafeChainsListValidation).toBe(true);
  });

  it('should set tokenSortConfig', () => {
    const controller = setupPreferencesController();
    expect(controller.state.tokenSortConfig).toStrictEqual({
      key: 'tokenFiatAmount',
      order: 'dsc',
      sortCallback: 'stringNumeric',
    });
    controller.setTokenSortConfig({
      key: 'someToken',
      order: 'asc',
      sortCallback: 'stringNumeric',
    });
    expect(controller.state.tokenSortConfig).toStrictEqual({
      key: 'someToken',
      order: 'asc',
      sortCallback: 'stringNumeric',
    });
  });

  it('should set privacyMode', () => {
    const controller = setupPreferencesController();
    expect(controller.state.privacyMode).toBe(false);
    controller.setPrivacyMode(true);
    expect(controller.state.privacyMode).toBe(true);
  });

  it('should set dismissSmartAccountSuggestionEnabled', () => {
    const controller = setupPreferencesController();
    expect(controller.state.dismissSmartAccountSuggestionEnabled).toBe(false);
    controller.setDismissSmartAccountSuggestionEnabled(true);
    expect(controller.state.dismissSmartAccountSuggestionEnabled).toBe(true);
  });

  it('should set smartAccountOptIn', () => {
    const controller = setupPreferencesController();
    expect(controller.state.smartAccountOptIn).toBe(true);
    controller.setSmartAccountOptIn(false);
    expect(controller.state.smartAccountOptIn).toBe(false);
  });

  it('should set smartAccountOptInForAccounts', () => {
    const controller = setupPreferencesController();
    expect(controller.state.smartAccountOptInForAccounts).toHaveLength(0);
    controller.setSmartAccountOptInForAccounts(['0x1', '0x2']);
    expect(controller.state.smartAccountOptInForAccounts[0]).toBe('0x1');
  });

  describe('metadata', () => {
    it('includes expected state in debug snapshots', () => {
      const controller = setupPreferencesController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInDebugSnapshot',
        ),
      ).toMatchInlineSnapshot(`
        {
          "dismissSmartAccountSuggestionEnabled": false,
          "displayNftMedia": false,
          "featureFlags": {},
          "isIpfsGatewayEnabled": true,
          "isMultiAccountBalancesEnabled": true,
          "privacyMode": false,
          "securityAlertsEnabled": false,
          "showIncomingTransactions": {
            "0x1": true,
            "0x13881": true,
            "0x38": true,
            "0x3e7": true,
            "0x5": true,
            "0x504": true,
            "0x505": true,
            "0x507": true,
            "0x531": true,
            "0x61": true,
            "0x64": true,
            "0x89": true,
            "0x8f": true,
            "0xa": true,
            "0xa869": true,
            "0xa86a": true,
            "0xaa36a7": true,
            "0xaa37dc": true,
            "0xe704": true,
            "0xe705": true,
            "0xe708": true,
            "0xfa": true,
            "0xfa2": true,
          },
          "showMultiRpcModal": false,
          "showTestNetworks": false,
          "smartAccountOptIn": true,
          "smartAccountOptInForAccounts": [],
          "tokenSortConfig": {
            "key": "tokenFiatAmount",
            "order": "dsc",
            "sortCallback": "stringNumeric",
          },
          "useNftDetection": false,
          "useSafeChainsListValidation": true,
          "useTokenDetection": true,
          "useTransactionSimulations": true,
        }
      `);
    });

    it('includes expected state in state logs', () => {
      const controller = setupPreferencesController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInStateLogs',
        ),
      ).toMatchInlineSnapshot(`
        {
          "dismissSmartAccountSuggestionEnabled": false,
          "displayNftMedia": false,
          "featureFlags": {},
          "identities": {},
          "ipfsGateway": "https://ipfs.io/ipfs/",
          "isIpfsGatewayEnabled": true,
          "isMultiAccountBalancesEnabled": true,
          "lostIdentities": {},
          "privacyMode": false,
          "securityAlertsEnabled": false,
          "selectedAddress": "",
          "showIncomingTransactions": {
            "0x1": true,
            "0x13881": true,
            "0x38": true,
            "0x3e7": true,
            "0x5": true,
            "0x504": true,
            "0x505": true,
            "0x507": true,
            "0x531": true,
            "0x61": true,
            "0x64": true,
            "0x89": true,
            "0x8f": true,
            "0xa": true,
            "0xa869": true,
            "0xa86a": true,
            "0xaa36a7": true,
            "0xaa37dc": true,
            "0xe704": true,
            "0xe705": true,
            "0xe708": true,
            "0xfa": true,
            "0xfa2": true,
          },
          "showMultiRpcModal": false,
          "showTestNetworks": false,
          "smartAccountOptIn": true,
          "smartAccountOptInForAccounts": [],
          "smartTransactionsOptInStatus": true,
          "tokenNetworkFilter": {},
          "tokenSortConfig": {
            "key": "tokenFiatAmount",
            "order": "dsc",
            "sortCallback": "stringNumeric",
          },
          "useNftDetection": false,
          "useSafeChainsListValidation": true,
          "useTokenDetection": true,
          "useTransactionSimulations": true,
        }
      `);
    });

    it('persists expected state', () => {
      const controller = setupPreferencesController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'persist',
        ),
      ).toMatchInlineSnapshot(`
        {
          "dismissSmartAccountSuggestionEnabled": false,
          "displayNftMedia": false,
          "featureFlags": {},
          "identities": {},
          "ipfsGateway": "https://ipfs.io/ipfs/",
          "isIpfsGatewayEnabled": true,
          "isMultiAccountBalancesEnabled": true,
          "lostIdentities": {},
          "privacyMode": false,
          "securityAlertsEnabled": false,
          "selectedAddress": "",
          "showIncomingTransactions": {
            "0x1": true,
            "0x13881": true,
            "0x38": true,
            "0x3e7": true,
            "0x5": true,
            "0x504": true,
            "0x505": true,
            "0x507": true,
            "0x531": true,
            "0x61": true,
            "0x64": true,
            "0x89": true,
            "0x8f": true,
            "0xa": true,
            "0xa869": true,
            "0xa86a": true,
            "0xaa36a7": true,
            "0xaa37dc": true,
            "0xe704": true,
            "0xe705": true,
            "0xe708": true,
            "0xfa": true,
            "0xfa2": true,
          },
          "showMultiRpcModal": false,
          "showTestNetworks": false,
          "smartAccountOptIn": true,
          "smartAccountOptInForAccounts": [],
          "smartTransactionsOptInStatus": true,
          "tokenNetworkFilter": {},
          "tokenSortConfig": {
            "key": "tokenFiatAmount",
            "order": "dsc",
            "sortCallback": "stringNumeric",
          },
          "useNftDetection": false,
          "useSafeChainsListValidation": true,
          "useTokenDetection": true,
          "useTransactionSimulations": true,
        }
      `);
    });

    it('exposes expected state to UI', () => {
      const controller = setupPreferencesController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'usedInUi',
        ),
      ).toMatchInlineSnapshot(`
        {
          "dismissSmartAccountSuggestionEnabled": false,
          "displayNftMedia": false,
          "featureFlags": {},
          "identities": {},
          "ipfsGateway": "https://ipfs.io/ipfs/",
          "isIpfsGatewayEnabled": true,
          "isMultiAccountBalancesEnabled": true,
          "privacyMode": false,
          "securityAlertsEnabled": false,
          "selectedAddress": "",
          "showIncomingTransactions": {
            "0x1": true,
            "0x13881": true,
            "0x38": true,
            "0x3e7": true,
            "0x5": true,
            "0x504": true,
            "0x505": true,
            "0x507": true,
            "0x531": true,
            "0x61": true,
            "0x64": true,
            "0x89": true,
            "0x8f": true,
            "0xa": true,
            "0xa869": true,
            "0xa86a": true,
            "0xaa36a7": true,
            "0xaa37dc": true,
            "0xe704": true,
            "0xe705": true,
            "0xe708": true,
            "0xfa": true,
            "0xfa2": true,
          },
          "showMultiRpcModal": false,
          "showTestNetworks": false,
          "smartAccountOptIn": true,
          "smartAccountOptInForAccounts": [],
          "smartTransactionsOptInStatus": true,
          "tokenNetworkFilter": {},
          "tokenSortConfig": {
            "key": "tokenFiatAmount",
            "order": "dsc",
            "sortCallback": "stringNumeric",
          },
          "useNftDetection": false,
          "useSafeChainsListValidation": true,
          "useTokenDetection": true,
          "useTransactionSimulations": true,
        }
      `);
    });
  });
});

type AllPreferencesControllerActions =
  MessengerActions<PreferencesControllerMessenger>;

type AllPreferencesControllerEvents =
  MessengerEvents<PreferencesControllerMessenger>;

type RootMessenger = Messenger<
  MockAnyNamespace,
  AllPreferencesControllerActions,
  AllPreferencesControllerEvents
>;

/**
 * Creates and returns a root messenger for testing
 *
 * @returns A messenger instance
 */
function getRootMessenger(): RootMessenger {
  return new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });
}

/**
 * Setup a PreferencesController instance for testing.
 *
 * @param args - Arguments
 * @param args.options - PreferencesController options.
 * @param args.messenger - A messenger.
 * @returns A PreferencesController instance.
 */
function setupPreferencesController({
  options = {},
  messenger = getRootMessenger(),
}: {
  options?: Partial<ConstructorParameters<typeof PreferencesController>[0]>;
  messenger?: RootMessenger;
} = {}): PreferencesController {
  const preferencesControllerMessenger = new Messenger<
    'PreferencesController',
    AllPreferencesControllerActions,
    AllPreferencesControllerEvents,
    RootMessenger
  >({
    namespace: 'PreferencesController',
    parent: messenger,
  });
  messenger.delegate({
    messenger: preferencesControllerMessenger,
    actions: [],
    events: ['KeyringController:stateChange'],
  });
  return new PreferencesController({
    messenger: preferencesControllerMessenger,
    ...options,
  });
}
