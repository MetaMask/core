import { deriveStateFromMetadata } from '@metamask/base-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';

import { ETHERSCAN_SUPPORTED_CHAIN_IDS } from './constants';
import type {
  EtherscanSupportedHexChainId,
  PreferencesControllerMessenger,
} from './PreferencesController';
import { PreferencesController } from './PreferencesController';

describe('PreferencesController', () => {
  it('should set default state', () => {
    const { controller } = setupPreferencesController();
    expect(controller.state).toStrictEqual({
      featureFlags: {},
      ipfsGateway: 'https://ipfs.io/ipfs/',
      useTokenDetection: true,
      useNftDetection: false,
      displayNftMedia: false,
      securityAlertsEnabled: false,
      isMultiAccountBalancesEnabled: true,
      showTestNetworks: false,
      smartAccountOptIn: true,
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

  it('should set IPFS gateway', () => {
    const { controller, rootMessenger } = setupPreferencesController();
    rootMessenger.call(
      'PreferencesController:setIpfsGateway',
      'https://ipfs.infura.io/ipfs/',
    );
    expect(controller.state.ipfsGateway).toBe('https://ipfs.infura.io/ipfs/');
  });

  it('should set useTokenDetection', () => {
    const { controller, rootMessenger } = setupPreferencesController();
    rootMessenger.call('PreferencesController:setUseTokenDetection', true);
    expect(controller.state.useTokenDetection).toBe(true);
  });

  it('should set useNftDetection', () => {
    const { controller, rootMessenger } = setupPreferencesController();
    rootMessenger.call('PreferencesController:setDisplayNftMedia', true);
    rootMessenger.call('PreferencesController:setUseNftDetection', true);
    expect(controller.state.useNftDetection).toBe(true);
  });

  it('should throw an error when useNftDetection is set and displayNftMedia is false', () => {
    const { rootMessenger } = setupPreferencesController();
    rootMessenger.call('PreferencesController:setDisplayNftMedia', false);
    expect(() =>
      rootMessenger.call('PreferencesController:setUseNftDetection', true),
    ).toThrow('useNftDetection cannot be enabled if displayNftMedia is false');
  });

  it('should set useMultiRpcMigration', () => {
    const { controller, rootMessenger } = setupPreferencesController();
    rootMessenger.call('PreferencesController:setShowMultiRpcModal', true);
    expect(controller.state.showMultiRpcModal).toBe(true);
  });

  it('should set useMultiRpcMigration is false value is passed', () => {
    const { controller, rootMessenger } = setupPreferencesController();
    rootMessenger.call('PreferencesController:setShowMultiRpcModal', false);
    expect(controller.state.showMultiRpcModal).toBe(false);
  });

  it('sets tokenNetworkFilter', () => {
    const { controller, rootMessenger } = setupPreferencesController();
    rootMessenger.call('PreferencesController:setTokenNetworkFilter', {
      '0x1': true,
      '0xa': false,
    });
    expect(controller.state.tokenNetworkFilter).toStrictEqual({
      '0x1': true,
      '0xa': false,
    });
  });

  it('should set featureFlags', () => {
    const { controller, rootMessenger } = setupPreferencesController();
    rootMessenger.call(
      'PreferencesController:setFeatureFlag',
      'Feature A',
      true,
    );
    rootMessenger.call(
      'PreferencesController:setFeatureFlag',
      'Feature B',
      false,
    );
    expect(controller.state.featureFlags).toStrictEqual({
      'Feature A': true,
      'Feature B': false,
    });
  });

  it('should set securityAlertsEnabled', () => {
    const { controller, rootMessenger } = setupPreferencesController();
    rootMessenger.call('PreferencesController:setSecurityAlertsEnabled', true);
    expect(controller.state.securityAlertsEnabled).toBe(true);
  });

  it('should set isMultiAccountBalancesEnabled', () => {
    const { controller, rootMessenger } = setupPreferencesController();
    rootMessenger.call(
      'PreferencesController:setIsMultiAccountBalancesEnabled',
      true,
    );
    expect(controller.state.isMultiAccountBalancesEnabled).toBe(true);
  });

  it('should set showTestNetworks', () => {
    const { controller, rootMessenger } = setupPreferencesController();
    rootMessenger.call('PreferencesController:setShowTestNetworks', true);
    expect(controller.state.showTestNetworks).toBe(true);
  });

  it('should set isIpfsGatewayEnabled', () => {
    const { controller, rootMessenger } = setupPreferencesController();
    rootMessenger.call('PreferencesController:setIsIpfsGatewayEnabled', true);
    expect(controller.state.isIpfsGatewayEnabled).toBe(true);
  });

  it('should set showIncomingTransactions to false on ethereum network', () => {
    const { controller, rootMessenger } = setupPreferencesController();

    rootMessenger.call(
      'PreferencesController:setEnableNetworkIncomingTransactions',
      '0x1',
      false,
    );
    expect(controller.state.showIncomingTransactions['0x1']).toBe(false);
  });

  it('should set smartTransactionsOptInStatus', () => {
    const { controller, rootMessenger } = setupPreferencesController();
    rootMessenger.call(
      'PreferencesController:setSmartTransactionsOptInStatus',
      false,
    );
    expect(controller.state.smartTransactionsOptInStatus).toBe(false);
    rootMessenger.call(
      'PreferencesController:setSmartTransactionsOptInStatus',
      true,
    );
    expect(controller.state.smartTransactionsOptInStatus).toBe(true);
  });

  it('should set useTransactionSimulations', () => {
    const { controller, rootMessenger } = setupPreferencesController();
    rootMessenger.call(
      'PreferencesController:setUseTransactionSimulations',
      false,
    );
    expect(controller.state.useTransactionSimulations).toBe(false);
  });

  it('should set useSafeChainsListValidation', () => {
    const { controller, rootMessenger } = setupPreferencesController({
      options: {
        state: {
          useSafeChainsListValidation: false,
        },
      },
    });
    expect(controller.state.useSafeChainsListValidation).toBe(false);
    rootMessenger.call(
      'PreferencesController:setUseSafeChainsListValidation',
      true,
    );
    expect(controller.state.useSafeChainsListValidation).toBe(true);
  });

  it('should set tokenSortConfig', () => {
    const { controller, rootMessenger } = setupPreferencesController();
    expect(controller.state.tokenSortConfig).toStrictEqual({
      key: 'tokenFiatAmount',
      order: 'dsc',
      sortCallback: 'stringNumeric',
    });
    rootMessenger.call('PreferencesController:setTokenSortConfig', {
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
    const { controller, rootMessenger } = setupPreferencesController();
    expect(controller.state.privacyMode).toBe(false);
    rootMessenger.call('PreferencesController:setPrivacyMode', true);
    expect(controller.state.privacyMode).toBe(true);
  });

  it('should set dismissSmartAccountSuggestionEnabled', () => {
    const { controller, rootMessenger } = setupPreferencesController();
    expect(controller.state.dismissSmartAccountSuggestionEnabled).toBe(false);
    rootMessenger.call(
      'PreferencesController:setDismissSmartAccountSuggestionEnabled',
      true,
    );
    expect(controller.state.dismissSmartAccountSuggestionEnabled).toBe(true);
  });

  it('should set smartAccountOptIn', () => {
    const { controller, rootMessenger } = setupPreferencesController();
    expect(controller.state.smartAccountOptIn).toBe(true);
    rootMessenger.call('PreferencesController:setSmartAccountOptIn', false);
    expect(controller.state.smartAccountOptIn).toBe(false);
  });

  describe('metadata', () => {
    it('includes expected state in debug snapshots', () => {
      const { controller } = setupPreferencesController();

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
      const { controller } = setupPreferencesController();

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
          "ipfsGateway": "https://ipfs.io/ipfs/",
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
      const { controller } = setupPreferencesController();

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
          "ipfsGateway": "https://ipfs.io/ipfs/",
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
      const { controller } = setupPreferencesController();

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
          "ipfsGateway": "https://ipfs.io/ipfs/",
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
 * @returns A PreferencesController instance and root messenger.
 */
function setupPreferencesController({
  options = {},
  messenger = getRootMessenger(),
}: {
  options?: Partial<ConstructorParameters<typeof PreferencesController>[0]>;
  messenger?: RootMessenger;
} = {}): { controller: PreferencesController; rootMessenger: RootMessenger } {
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
  });

  const controller = new PreferencesController({
    messenger: preferencesControllerMessenger,
    ...options,
  });

  return { controller, rootMessenger: messenger };
}
