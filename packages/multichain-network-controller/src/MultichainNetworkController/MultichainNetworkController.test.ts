import { deriveStateFromMetadata } from '@metamask/base-controller';
import { InfuraNetworkType } from '@metamask/controller-utils';
import {
  BtcScope,
  SolScope,
  EthAccountType,
  BtcAccountType,
  SolAccountType,
  EthScope,
  TrxAccountType,
} from '@metamask/keyring-api';
import type {
  AnyAccountType,
  KeyringAccountType,
  CaipChainId,
} from '@metamask/keyring-api';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import type {
  NetworkControllerGetStateAction,
  NetworkControllerSetActiveNetworkAction,
  NetworkControllerGetSelectedChainIdAction,
  NetworkControllerRemoveNetworkAction,
  NetworkControllerFindNetworkClientIdByChainIdAction,
  NetworkState,
} from '@metamask/network-controller';
import { KnownCaipNamespace } from '@metamask/utils';
import type { CaipAccountId } from '@metamask/utils';

import { MultichainNetworkController } from './MultichainNetworkController';
import { createMockInternalAccount } from '../../tests/utils';
import type { ActiveNetworksResponse } from '../api/accounts-api';
import { getDefaultMultichainNetworkControllerState } from '../constants';
import type { AbstractMultichainNetworkService } from '../MultichainNetworkService/AbstractMultichainNetworkService';
import type { MultichainNetworkControllerMessenger } from '../types';

// We exclude the generic account type, since it's used for testing purposes.
type TestKeyringAccountType = Exclude<
  KeyringAccountType,
  `${AnyAccountType.Account}`
>;

/**
 * Creates a mock network service for testing.
 *
 * @param mockResponse - The mock response to return from fetchNetworkActivity
 * @returns A mock network service that implements the MultichainNetworkService interface.
 */
function createMockNetworkService(
  mockResponse: ActiveNetworksResponse = { activeNetworks: [] },
): AbstractMultichainNetworkService {
  return {
    fetchNetworkActivity: jest
      .fn<Promise<ActiveNetworksResponse>, [CaipAccountId[]]>()
      .mockResolvedValue(mockResponse),
  };
}

const controllerName = 'MultichainNetworkController';

type AllMultichainNetworkControllerActions =
  MessengerActions<MultichainNetworkControllerMessenger>;

type AllMultichainNetworkControllerEvents =
  MessengerEvents<MultichainNetworkControllerMessenger>;

type RootMessenger = Messenger<
  MockAnyNamespace,
  AllMultichainNetworkControllerActions,
  AllMultichainNetworkControllerEvents,
  RootMessenger
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
 * Setup a test controller instance.
 *
 * @param args - Arguments to this function.
 * @param args.options - The constructor options for the controller.
 * @param args.getNetworkState - Mock for NetworkController:getState action.
 * @param args.setActiveNetwork - Mock for NetworkController:setActiveNetwork action.
 * @param args.removeNetwork - Mock for NetworkController:removeNetwork action.
 * @param args.getSelectedChainId - Mock for NetworkController:getSelectedChainId action.
 * @param args.findNetworkClientIdByChainId - Mock for NetworkController:findNetworkClientIdByChainId action.
 * @param args.mockNetworkService - Mock for MultichainNetworkService.
 * @returns A collection of test controllers and mocks.
 */
function setupController({
  options = {},
  getNetworkState,
  setActiveNetwork,
  removeNetwork,
  getSelectedChainId,
  findNetworkClientIdByChainId,
  mockNetworkService,
}: {
  options?: Partial<
    ConstructorParameters<typeof MultichainNetworkController>[0]
  >;
  getNetworkState?: jest.Mock<
    ReturnType<NetworkControllerGetStateAction['handler']>,
    Parameters<NetworkControllerGetStateAction['handler']>
  >;
  setActiveNetwork?: jest.Mock<
    ReturnType<NetworkControllerSetActiveNetworkAction['handler']>,
    Parameters<NetworkControllerSetActiveNetworkAction['handler']>
  >;
  removeNetwork?: jest.Mock<
    ReturnType<NetworkControllerRemoveNetworkAction['handler']>,
    Parameters<NetworkControllerRemoveNetworkAction['handler']>
  >;
  getSelectedChainId?: jest.Mock<
    ReturnType<NetworkControllerGetSelectedChainIdAction['handler']>,
    Parameters<NetworkControllerGetSelectedChainIdAction['handler']>
  >;
  findNetworkClientIdByChainId?: jest.Mock<
    ReturnType<NetworkControllerFindNetworkClientIdByChainIdAction['handler']>,
    Parameters<NetworkControllerFindNetworkClientIdByChainIdAction['handler']>
  >;
  mockNetworkService?: AbstractMultichainNetworkService;
} = {}): {
  messenger: RootMessenger;
  controller: MultichainNetworkController;
  mockGetNetworkState: jest.Mock<
    NetworkState,
    Parameters<NetworkControllerGetStateAction['handler']>
  >;
  mockSetActiveNetwork: jest.Mock<
    ReturnType<NetworkControllerSetActiveNetworkAction['handler']>,
    Parameters<NetworkControllerSetActiveNetworkAction['handler']>
  >;
  mockRemoveNetwork: jest.Mock<
    ReturnType<NetworkControllerRemoveNetworkAction['handler']>,
    Parameters<NetworkControllerRemoveNetworkAction['handler']>
  >;
  mockGetSelectedChainId: jest.Mock<
    ReturnType<NetworkControllerGetSelectedChainIdAction['handler']>,
    Parameters<NetworkControllerGetSelectedChainIdAction['handler']>
  >;
  mockFindNetworkClientIdByChainId: jest.Mock<
    ReturnType<NetworkControllerFindNetworkClientIdByChainIdAction['handler']>,
    Parameters<NetworkControllerFindNetworkClientIdByChainIdAction['handler']>
  >;
  publishSpy: jest.SpyInstance<
    ReturnType<MultichainNetworkControllerMessenger['publish']>,
    Parameters<MultichainNetworkControllerMessenger['publish']>
  >;
  triggerSelectedAccountChange: (accountType: TestKeyringAccountType) => void;
  networkService: AbstractMultichainNetworkService;
} {
  const messenger = getRootMessenger();

  // Register action handlers
  const mockGetNetworkState =
    getNetworkState ??
    jest.fn<
      ReturnType<NetworkControllerGetStateAction['handler']>,
      Parameters<NetworkControllerGetStateAction['handler']>
    >();
  messenger.registerActionHandler(
    'NetworkController:getState',
    mockGetNetworkState,
  );

  const mockSetActiveNetwork =
    setActiveNetwork ??
    jest.fn<
      ReturnType<NetworkControllerSetActiveNetworkAction['handler']>,
      Parameters<NetworkControllerSetActiveNetworkAction['handler']>
    >();
  messenger.registerActionHandler(
    'NetworkController:setActiveNetwork',
    mockSetActiveNetwork,
  );

  const mockRemoveNetwork =
    removeNetwork ??
    jest.fn<
      ReturnType<NetworkControllerRemoveNetworkAction['handler']>,
      Parameters<NetworkControllerRemoveNetworkAction['handler']>
    >();
  messenger.registerActionHandler(
    'NetworkController:removeNetwork',
    mockRemoveNetwork,
  );

  const mockGetSelectedChainId =
    getSelectedChainId ??
    jest.fn<
      ReturnType<NetworkControllerGetSelectedChainIdAction['handler']>,
      Parameters<NetworkControllerGetSelectedChainIdAction['handler']>
    >();
  messenger.registerActionHandler(
    'NetworkController:getSelectedChainId',
    mockGetSelectedChainId,
  );

  const mockFindNetworkClientIdByChainId =
    findNetworkClientIdByChainId ??
    jest.fn<
      ReturnType<
        NetworkControllerFindNetworkClientIdByChainIdAction['handler']
      >,
      Parameters<NetworkControllerFindNetworkClientIdByChainIdAction['handler']>
    >();
  messenger.registerActionHandler(
    'NetworkController:findNetworkClientIdByChainId',
    mockFindNetworkClientIdByChainId,
  );

  const controllerMessenger = new Messenger<
    typeof controllerName,
    AllMultichainNetworkControllerActions,
    AllMultichainNetworkControllerEvents,
    RootMessenger
  >({
    namespace: controllerName,
    parent: messenger,
  });

  messenger.delegate({
    messenger: controllerMessenger,
    actions: [
      'NetworkController:setActiveNetwork',
      'NetworkController:getState',
      'NetworkController:removeNetwork',
      'NetworkController:getSelectedChainId',
      'NetworkController:findNetworkClientIdByChainId',
      'AccountsController:listMultichainAccounts',
    ],
    events: ['AccountsController:selectedAccountChange'],
  });

  const defaultNetworkService = createMockNetworkService();

  const controller = new MultichainNetworkController({
    messenger: options.messenger ?? controllerMessenger,
    state: {
      selectedMultichainNetworkChainId: SolScope.Mainnet,
      isEvmSelected: true,
      ...options.state,
    },
    networkService: mockNetworkService ?? defaultNetworkService,
  });

  const triggerSelectedAccountChange = (
    accountType: TestKeyringAccountType,
  ): void => {
    const mockAccountAddressByAccountType: Record<
      TestKeyringAccountType,
      string
    > = {
      [EthAccountType.Eoa]: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      [EthAccountType.Erc4337]: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      [SolAccountType.DataAccount]:
        'So11111111111111111111111111111111111111112',
      [BtcAccountType.P2pkh]: '1AXaVdPBb6zqrTMb6ebrBb9g3JmeAPGeCF',
      [BtcAccountType.P2sh]: '3KQPirCGGbVyWJLGuWN6VPC7uLeiarYB7x',
      [BtcAccountType.P2wpkh]: 'bc1q4degm5k044n9xv3ds7d8l6hfavydte6wn6sesw',
      [BtcAccountType.P2tr]:
        'bc1pxfxst7zrkw39vzh0pchq5ey0q7z6u739cudhz5vmg89wa4kyyp9qzrf5sp',
      [TrxAccountType.Eoa]: 'TYvuLYQvTZp56urTbkeM3vDqU2YipJ7eDk',
    };
    const mockAccountAddress = mockAccountAddressByAccountType[accountType];

    const mockAccount = createMockInternalAccount({
      type: accountType,
      address: mockAccountAddress,
    });
    messenger.publish('AccountsController:selectedAccountChange', mockAccount);
  };

  const publishSpy = jest.spyOn(controllerMessenger, 'publish');

  return {
    messenger,
    controller,
    mockGetNetworkState,
    mockSetActiveNetwork,
    mockRemoveNetwork,
    mockGetSelectedChainId,
    mockFindNetworkClientIdByChainId,
    publishSpy,
    triggerSelectedAccountChange,
    networkService: mockNetworkService ?? defaultNetworkService,
  };
}

describe('MultichainNetworkController', () => {
  describe('constructor', () => {
    it('sets default state', () => {
      const { controller } = setupController({
        options: { state: getDefaultMultichainNetworkControllerState() },
      });
      expect(controller.state).toStrictEqual(
        getDefaultMultichainNetworkControllerState(),
      );
    });
  });

  describe('setActiveNetwork', () => {
    it('sets a non-EVM network when same non-EVM chain ID is active', async () => {
      // By default, Solana is selected but is NOT active (aka EVM network is active)
      const { controller, publishSpy } = setupController();

      // Set active network to Solana
      await controller.setActiveNetwork(SolScope.Mainnet);

      // Check that the Solana is now the selected network
      expect(controller.state.selectedMultichainNetworkChainId).toBe(
        SolScope.Mainnet,
      );

      // Check that the a non evm network is now active
      expect(controller.state.isEvmSelected).toBe(false);

      // Check that the messenger published the correct event
      expect(publishSpy).toHaveBeenCalledWith(
        'MultichainNetworkController:networkDidChange',
        SolScope.Mainnet,
      );
    });

    it('throws an error when unsupported non-EVM chainId is provided', async () => {
      const { controller } = setupController();
      const unsupportedChainId = 'eip155:1' as CaipChainId;

      await expect(
        controller.setActiveNetwork(unsupportedChainId),
      ).rejects.toThrow(`Unsupported Caip chain ID: ${unsupportedChainId}`);
    });

    it('does nothing when same non-EVM chain ID is set and active', async () => {
      // By default, Solana is selected and active
      const { controller, publishSpy } = setupController({
        options: { state: { isEvmSelected: false } },
      });

      // Set active network to Solana
      await controller.setActiveNetwork(SolScope.Mainnet);

      expect(controller.state.selectedMultichainNetworkChainId).toBe(
        SolScope.Mainnet,
      );

      expect(controller.state.isEvmSelected).toBe(false);

      // Check that the messenger published the correct event
      expect(publishSpy).not.toHaveBeenCalled();
    });

    it('sets a non-EVM network when different non-EVM chain ID is active', async () => {
      // By default, Solana is selected but is NOT active (aka EVM network is active)
      const { controller, publishSpy } = setupController({
        options: { state: { isEvmSelected: false } },
      });

      // Set active network to Bitcoin
      await controller.setActiveNetwork(BtcScope.Mainnet);

      // Check that the Solana is now the selected network
      expect(controller.state.selectedMultichainNetworkChainId).toBe(
        BtcScope.Mainnet,
      );

      // Check that BTC network is now active
      expect(controller.state.isEvmSelected).toBe(false);

      // Check that the messenger published the correct event
      expect(publishSpy).toHaveBeenCalledWith(
        'MultichainNetworkController:networkDidChange',
        BtcScope.Mainnet,
      );
    });

    it('sets an EVM network and call NetworkController:setActiveNetwork when same EVM network is selected', async () => {
      const selectedNetworkClientId = InfuraNetworkType.mainnet;

      const { controller, mockSetActiveNetwork, publishSpy } = setupController({
        getNetworkState: jest.fn().mockImplementation(() => ({
          selectedNetworkClientId,
        })),
        options: { state: { isEvmSelected: false } },
      });

      // Check that EVM network is not selected
      expect(controller.state.isEvmSelected).toBe(false);

      await controller.setActiveNetwork(selectedNetworkClientId);

      // Check that EVM network is selected
      expect(controller.state.isEvmSelected).toBe(true);

      // Check that the messenger published the correct event
      expect(publishSpy).toHaveBeenCalledWith(
        'MultichainNetworkController:networkDidChange',
        selectedNetworkClientId,
      );

      // Check that NetworkController:setActiveNetwork was not called
      expect(mockSetActiveNetwork).not.toHaveBeenCalled();
    });

    it('sets an EVM network and call NetworkController:setActiveNetwork when different EVM network is selected', async () => {
      const { controller, mockSetActiveNetwork, publishSpy } = setupController({
        getNetworkState: jest.fn().mockImplementation(() => ({
          selectedNetworkClientId: InfuraNetworkType.mainnet,
        })),
      });
      const evmNetworkClientId = 'linea';

      await controller.setActiveNetwork(evmNetworkClientId);

      // Check that EVM network is selected
      expect(controller.state.isEvmSelected).toBe(true);

      // Check that the messenger published the correct event
      expect(publishSpy).toHaveBeenCalledWith(
        'MultichainNetworkController:networkDidChange',
        evmNetworkClientId,
      );

      // Check that NetworkController:setActiveNetwork was not called
      expect(mockSetActiveNetwork).toHaveBeenCalledWith(evmNetworkClientId);
    });

    it('does nothing when same EVM network is set and active', async () => {
      const { controller, publishSpy } = setupController({
        getNetworkState: jest.fn().mockImplementation(() => ({
          selectedNetworkClientId: InfuraNetworkType.mainnet,
        })),
        options: { state: { isEvmSelected: true } },
      });

      // EVM network is already active
      expect(controller.state.isEvmSelected).toBe(true);

      await controller.setActiveNetwork(InfuraNetworkType.mainnet);

      // EVM network is still active
      expect(controller.state.isEvmSelected).toBe(true);

      // Check that the messenger published the correct event
      expect(publishSpy).not.toHaveBeenCalled();
    });
  });

  describe('handle AccountsController:selectedAccountChange event', () => {
    it('isEvmSelected should be true when both switching to EVM account and EVM network is already active', async () => {
      // By default, Solana is selected but EVM network is active
      const { controller, triggerSelectedAccountChange } = setupController();

      // EVM network is currently active
      expect(controller.state.isEvmSelected).toBe(true);

      // Switching to EVM account
      triggerSelectedAccountChange(EthAccountType.Eoa);

      // EVM network is still active
      expect(controller.state.isEvmSelected).toBe(true);
    });

    it('switches to EVM network if non-EVM network is previously active', async () => {
      // By default, Solana is selected and active
      const { controller, triggerSelectedAccountChange } = setupController({
        options: { state: { isEvmSelected: false } },
        getNetworkState: jest.fn().mockImplementation(() => ({
          selectedNetworkClientId: InfuraNetworkType.mainnet,
        })),
      });

      // non-EVM network is currently active
      expect(controller.state.isEvmSelected).toBe(false);

      // Switching to EVM account
      triggerSelectedAccountChange(EthAccountType.Eoa);

      // EVM network is now active
      expect(controller.state.isEvmSelected).toBe(true);
    });
    it('non-EVM network should be active when switching to account of same selected non-EVM network', async () => {
      // By default, Solana is selected and active
      const { controller, triggerSelectedAccountChange } = setupController({
        options: {
          state: {
            isEvmSelected: true,
            selectedMultichainNetworkChainId: SolScope.Mainnet,
          },
        },
      });

      // EVM network is currently active
      expect(controller.state.isEvmSelected).toBe(true);

      expect(controller.state.selectedMultichainNetworkChainId).toBe(
        SolScope.Mainnet,
      );

      // Switching to Solana account
      triggerSelectedAccountChange(SolAccountType.DataAccount);

      // Solana is still the selected network
      expect(controller.state.selectedMultichainNetworkChainId).toBe(
        SolScope.Mainnet,
      );
      expect(controller.state.isEvmSelected).toBe(false);
    });

    it('non-EVM network should change when switching to account on different non-EVM network', async () => {
      // By default, Solana is selected and active
      const { controller, triggerSelectedAccountChange } = setupController({
        options: {
          state: {
            isEvmSelected: false,
            selectedMultichainNetworkChainId: SolScope.Mainnet,
          },
        },
      });

      // Solana is currently active
      expect(controller.state.isEvmSelected).toBe(false);
      expect(controller.state.selectedMultichainNetworkChainId).toBe(
        SolScope.Mainnet,
      );

      // Switching to Bitcoin account
      triggerSelectedAccountChange(BtcAccountType.P2wpkh);

      // Bitcoin is now the selected network
      expect(controller.state.selectedMultichainNetworkChainId).toBe(
        BtcScope.Mainnet,
      );
      expect(controller.state.isEvmSelected).toBe(false);
    });

    it('does not change the active network if the network is part of the account scope', async () => {
      const { controller, triggerSelectedAccountChange } = setupController({
        options: {
          state: {
            isEvmSelected: false,
            selectedMultichainNetworkChainId: SolScope.Devnet,
          },
        },
      });

      expect(controller.state.isEvmSelected).toBe(false);
      expect(controller.state.selectedMultichainNetworkChainId).toBe(
        SolScope.Devnet,
      );

      triggerSelectedAccountChange(SolAccountType.DataAccount);

      expect(controller.state.selectedMultichainNetworkChainId).toBe(
        SolScope.Devnet,
      );
      expect(controller.state.isEvmSelected).toBe(false);
    });
  });

  describe('removeEvmNetwork', () => {
    it('switches the EVM selected network to Ethereum Mainnet and deletes previous EVM network if the current selected network is non-EVM', async () => {
      const {
        controller,
        mockSetActiveNetwork,
        mockRemoveNetwork,
        mockFindNetworkClientIdByChainId,
      } = setupController({
        options: { state: { isEvmSelected: false } },
        getSelectedChainId: jest.fn().mockImplementation(() => '0x2'),
        findNetworkClientIdByChainId: jest
          .fn()
          .mockImplementation(() => 'ethereum'),
      });

      await controller.removeNetwork('eip155:2');
      expect(mockFindNetworkClientIdByChainId).toHaveBeenCalledWith('0x1');
      expect(mockSetActiveNetwork).toHaveBeenCalledWith('ethereum');
      expect(mockRemoveNetwork).toHaveBeenCalledWith('0x2');
    });

    it('removes an EVM network when isEvmSelected is false and the removed network is not selected', async () => {
      const {
        controller,
        mockRemoveNetwork,
        mockSetActiveNetwork,
        mockGetSelectedChainId,
        mockFindNetworkClientIdByChainId,
      } = setupController({
        options: { state: { isEvmSelected: false } },
        getSelectedChainId: jest.fn().mockImplementation(() => '0x2'),
      });

      await controller.removeNetwork('eip155:3');
      expect(mockGetSelectedChainId).toHaveBeenCalled();
      expect(mockFindNetworkClientIdByChainId).not.toHaveBeenCalled();
      expect(mockSetActiveNetwork).not.toHaveBeenCalled();
      expect(mockRemoveNetwork).toHaveBeenCalledWith('0x3');
    });

    it('removes an EVM network when isEvmSelected is true and the removed network is not selected', async () => {
      const {
        controller,
        mockRemoveNetwork,
        mockSetActiveNetwork,
        mockGetSelectedChainId,
        mockFindNetworkClientIdByChainId,
      } = setupController({
        options: { state: { isEvmSelected: false } },
        getSelectedChainId: jest.fn().mockImplementation(() => '0x2'),
      });

      await controller.removeNetwork('eip155:3');
      expect(mockGetSelectedChainId).toHaveBeenCalled();
      expect(mockFindNetworkClientIdByChainId).not.toHaveBeenCalled();
      expect(mockSetActiveNetwork).not.toHaveBeenCalled();
      expect(mockRemoveNetwork).toHaveBeenCalledWith('0x3');
    });

    it('throws an error when trying to remove the currently selected network', async () => {
      const { controller } = setupController({
        options: { state: { isEvmSelected: true } },
        getSelectedChainId: jest.fn().mockImplementation(() => '0x2'),
      });

      await expect(controller.removeNetwork('eip155:2')).rejects.toThrow(
        'Cannot remove the currently selected network',
      );
    });

    it('throws when trying to remove a non-EVM network', async () => {
      const { controller } = setupController({
        options: { state: { isEvmSelected: false } },
      });

      await expect(controller.removeNetwork(BtcScope.Mainnet)).rejects.toThrow(
        'Removal of non-EVM networks is not supported',
      );
    });
  });

  describe('getNetworksWithTransactionActivityByAccounts', () => {
    const MOCK_EVM_ADDRESS = '0x1234567890123456789012345678901234567890';
    const MOCK_EVM_CHAIN_1 = '1';
    const MOCK_EVM_CHAIN_137 = '137';

    it('returns empty object when no accounts exist', async () => {
      const { controller, messenger } = setupController({
        getSelectedChainId: jest.fn().mockReturnValue('0x1'),
      });

      messenger.registerActionHandler(
        'AccountsController:listMultichainAccounts',
        () => [],
      );

      const result =
        await controller.getNetworksWithTransactionActivityByAccounts();
      expect(result).toStrictEqual({});
    });

    it('fetches and formats network activity for EVM accounts', async () => {
      const mockResponse: ActiveNetworksResponse = {
        activeNetworks: [
          `${KnownCaipNamespace.Eip155}:${MOCK_EVM_CHAIN_1}:${MOCK_EVM_ADDRESS}`,
          `${KnownCaipNamespace.Eip155}:${MOCK_EVM_CHAIN_137}:${MOCK_EVM_ADDRESS}`,
        ],
      };

      const mockNetworkService = createMockNetworkService(mockResponse);
      await mockNetworkService.fetchNetworkActivity([
        `${KnownCaipNamespace.Eip155}:${MOCK_EVM_CHAIN_1}:${MOCK_EVM_ADDRESS}`,
      ]);

      const { controller, messenger } = setupController({
        mockNetworkService,
      });

      messenger.registerActionHandler(
        'AccountsController:listMultichainAccounts',
        () => [
          createMockInternalAccount({
            type: EthAccountType.Eoa,
            address: MOCK_EVM_ADDRESS,
            scopes: [EthScope.Eoa],
          }),
        ],
      );

      const result =
        await controller.getNetworksWithTransactionActivityByAccounts();

      expect(mockNetworkService.fetchNetworkActivity).toHaveBeenCalledWith([
        `${KnownCaipNamespace.Eip155}:0:${MOCK_EVM_ADDRESS}`,
      ]);

      expect(result).toStrictEqual({
        [MOCK_EVM_ADDRESS]: {
          namespace: KnownCaipNamespace.Eip155,
          activeChains: [MOCK_EVM_CHAIN_1, MOCK_EVM_CHAIN_137],
        },
      });
    });
  });

  describe('metadata', () => {
    it('includes expected state in debug snapshots', () => {
      const { controller } = setupController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInDebugSnapshot',
        ),
      ).toMatchInlineSnapshot(`
        Object {
          "isEvmSelected": true,
          "multichainNetworkConfigurationsByChainId": Object {
            "bip122:000000000019d6689c085ae165831e93": Object {
              "chainId": "bip122:000000000019d6689c085ae165831e93",
              "isEvm": false,
              "name": "Bitcoin",
              "nativeCurrency": "bip122:000000000019d6689c085ae165831e93/slip44:0",
            },
            "bip122:000000000933ea01ad0ee984209779ba": Object {
              "chainId": "bip122:000000000933ea01ad0ee984209779ba",
              "isEvm": false,
              "name": "Bitcoin Testnet",
              "nativeCurrency": "bip122:000000000933ea01ad0ee984209779ba/slip44:0",
            },
            "bip122:00000000da84f2bafbbc53dee25a72ae": Object {
              "chainId": "bip122:00000000da84f2bafbbc53dee25a72ae",
              "isEvm": false,
              "name": "Bitcoin Testnet4",
              "nativeCurrency": "bip122:00000000da84f2bafbbc53dee25a72ae/slip44:0",
            },
            "bip122:00000008819873e925422c1ff0f99f7c": Object {
              "chainId": "bip122:00000008819873e925422c1ff0f99f7c",
              "isEvm": false,
              "name": "Bitcoin Mutinynet",
              "nativeCurrency": "bip122:00000008819873e925422c1ff0f99f7c/slip44:0",
            },
            "bip122:regtest": Object {
              "chainId": "bip122:regtest",
              "isEvm": false,
              "name": "Bitcoin Regtest",
              "nativeCurrency": "bip122:regtest/slip44:0",
            },
            "solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z": Object {
              "chainId": "solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z",
              "isEvm": false,
              "name": "Solana Testnet",
              "nativeCurrency": "solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z/slip44:501",
            },
            "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": Object {
              "chainId": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
              "isEvm": false,
              "name": "Solana",
              "nativeCurrency": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501",
            },
            "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1": Object {
              "chainId": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
              "isEvm": false,
              "name": "Solana Devnet",
              "nativeCurrency": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501",
            },
            "tron:2494104990": Object {
              "chainId": "tron:2494104990",
              "isEvm": false,
              "name": "Tron Shasta",
              "nativeCurrency": "tron:2494104990/slip44:195",
            },
            "tron:3448148188": Object {
              "chainId": "tron:3448148188",
              "isEvm": false,
              "name": "Tron Nile",
              "nativeCurrency": "tron:3448148188/slip44:195",
            },
            "tron:728126428": Object {
              "chainId": "tron:728126428",
              "isEvm": false,
              "name": "Tron",
              "nativeCurrency": "tron:728126428/slip44:195",
            },
          },
          "networksWithTransactionActivity": Object {},
          "selectedMultichainNetworkChainId": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
        }
      `);
    });

    it('includes expected state in state logs', () => {
      const { controller } = setupController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInStateLogs',
        ),
      ).toMatchInlineSnapshot(`
        Object {
          "isEvmSelected": true,
          "multichainNetworkConfigurationsByChainId": Object {
            "bip122:000000000019d6689c085ae165831e93": Object {
              "chainId": "bip122:000000000019d6689c085ae165831e93",
              "isEvm": false,
              "name": "Bitcoin",
              "nativeCurrency": "bip122:000000000019d6689c085ae165831e93/slip44:0",
            },
            "bip122:000000000933ea01ad0ee984209779ba": Object {
              "chainId": "bip122:000000000933ea01ad0ee984209779ba",
              "isEvm": false,
              "name": "Bitcoin Testnet",
              "nativeCurrency": "bip122:000000000933ea01ad0ee984209779ba/slip44:0",
            },
            "bip122:00000000da84f2bafbbc53dee25a72ae": Object {
              "chainId": "bip122:00000000da84f2bafbbc53dee25a72ae",
              "isEvm": false,
              "name": "Bitcoin Testnet4",
              "nativeCurrency": "bip122:00000000da84f2bafbbc53dee25a72ae/slip44:0",
            },
            "bip122:00000008819873e925422c1ff0f99f7c": Object {
              "chainId": "bip122:00000008819873e925422c1ff0f99f7c",
              "isEvm": false,
              "name": "Bitcoin Mutinynet",
              "nativeCurrency": "bip122:00000008819873e925422c1ff0f99f7c/slip44:0",
            },
            "bip122:regtest": Object {
              "chainId": "bip122:regtest",
              "isEvm": false,
              "name": "Bitcoin Regtest",
              "nativeCurrency": "bip122:regtest/slip44:0",
            },
            "solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z": Object {
              "chainId": "solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z",
              "isEvm": false,
              "name": "Solana Testnet",
              "nativeCurrency": "solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z/slip44:501",
            },
            "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": Object {
              "chainId": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
              "isEvm": false,
              "name": "Solana",
              "nativeCurrency": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501",
            },
            "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1": Object {
              "chainId": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
              "isEvm": false,
              "name": "Solana Devnet",
              "nativeCurrency": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501",
            },
            "tron:2494104990": Object {
              "chainId": "tron:2494104990",
              "isEvm": false,
              "name": "Tron Shasta",
              "nativeCurrency": "tron:2494104990/slip44:195",
            },
            "tron:3448148188": Object {
              "chainId": "tron:3448148188",
              "isEvm": false,
              "name": "Tron Nile",
              "nativeCurrency": "tron:3448148188/slip44:195",
            },
            "tron:728126428": Object {
              "chainId": "tron:728126428",
              "isEvm": false,
              "name": "Tron",
              "nativeCurrency": "tron:728126428/slip44:195",
            },
          },
          "networksWithTransactionActivity": Object {},
          "selectedMultichainNetworkChainId": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
        }
      `);
    });

    it('persists expected state', () => {
      const { controller } = setupController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'persist',
        ),
      ).toMatchInlineSnapshot(`
        Object {
          "isEvmSelected": true,
          "multichainNetworkConfigurationsByChainId": Object {
            "bip122:000000000019d6689c085ae165831e93": Object {
              "chainId": "bip122:000000000019d6689c085ae165831e93",
              "isEvm": false,
              "name": "Bitcoin",
              "nativeCurrency": "bip122:000000000019d6689c085ae165831e93/slip44:0",
            },
            "bip122:000000000933ea01ad0ee984209779ba": Object {
              "chainId": "bip122:000000000933ea01ad0ee984209779ba",
              "isEvm": false,
              "name": "Bitcoin Testnet",
              "nativeCurrency": "bip122:000000000933ea01ad0ee984209779ba/slip44:0",
            },
            "bip122:00000000da84f2bafbbc53dee25a72ae": Object {
              "chainId": "bip122:00000000da84f2bafbbc53dee25a72ae",
              "isEvm": false,
              "name": "Bitcoin Testnet4",
              "nativeCurrency": "bip122:00000000da84f2bafbbc53dee25a72ae/slip44:0",
            },
            "bip122:00000008819873e925422c1ff0f99f7c": Object {
              "chainId": "bip122:00000008819873e925422c1ff0f99f7c",
              "isEvm": false,
              "name": "Bitcoin Mutinynet",
              "nativeCurrency": "bip122:00000008819873e925422c1ff0f99f7c/slip44:0",
            },
            "bip122:regtest": Object {
              "chainId": "bip122:regtest",
              "isEvm": false,
              "name": "Bitcoin Regtest",
              "nativeCurrency": "bip122:regtest/slip44:0",
            },
            "solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z": Object {
              "chainId": "solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z",
              "isEvm": false,
              "name": "Solana Testnet",
              "nativeCurrency": "solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z/slip44:501",
            },
            "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": Object {
              "chainId": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
              "isEvm": false,
              "name": "Solana",
              "nativeCurrency": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501",
            },
            "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1": Object {
              "chainId": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
              "isEvm": false,
              "name": "Solana Devnet",
              "nativeCurrency": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501",
            },
            "tron:2494104990": Object {
              "chainId": "tron:2494104990",
              "isEvm": false,
              "name": "Tron Shasta",
              "nativeCurrency": "tron:2494104990/slip44:195",
            },
            "tron:3448148188": Object {
              "chainId": "tron:3448148188",
              "isEvm": false,
              "name": "Tron Nile",
              "nativeCurrency": "tron:3448148188/slip44:195",
            },
            "tron:728126428": Object {
              "chainId": "tron:728126428",
              "isEvm": false,
              "name": "Tron",
              "nativeCurrency": "tron:728126428/slip44:195",
            },
          },
          "networksWithTransactionActivity": Object {},
          "selectedMultichainNetworkChainId": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
        }
      `);
    });

    it('exposes expected state to UI', () => {
      const { controller } = setupController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'usedInUi',
        ),
      ).toMatchInlineSnapshot(`
        Object {
          "isEvmSelected": true,
          "multichainNetworkConfigurationsByChainId": Object {
            "bip122:000000000019d6689c085ae165831e93": Object {
              "chainId": "bip122:000000000019d6689c085ae165831e93",
              "isEvm": false,
              "name": "Bitcoin",
              "nativeCurrency": "bip122:000000000019d6689c085ae165831e93/slip44:0",
            },
            "bip122:000000000933ea01ad0ee984209779ba": Object {
              "chainId": "bip122:000000000933ea01ad0ee984209779ba",
              "isEvm": false,
              "name": "Bitcoin Testnet",
              "nativeCurrency": "bip122:000000000933ea01ad0ee984209779ba/slip44:0",
            },
            "bip122:00000000da84f2bafbbc53dee25a72ae": Object {
              "chainId": "bip122:00000000da84f2bafbbc53dee25a72ae",
              "isEvm": false,
              "name": "Bitcoin Testnet4",
              "nativeCurrency": "bip122:00000000da84f2bafbbc53dee25a72ae/slip44:0",
            },
            "bip122:00000008819873e925422c1ff0f99f7c": Object {
              "chainId": "bip122:00000008819873e925422c1ff0f99f7c",
              "isEvm": false,
              "name": "Bitcoin Mutinynet",
              "nativeCurrency": "bip122:00000008819873e925422c1ff0f99f7c/slip44:0",
            },
            "bip122:regtest": Object {
              "chainId": "bip122:regtest",
              "isEvm": false,
              "name": "Bitcoin Regtest",
              "nativeCurrency": "bip122:regtest/slip44:0",
            },
            "solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z": Object {
              "chainId": "solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z",
              "isEvm": false,
              "name": "Solana Testnet",
              "nativeCurrency": "solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z/slip44:501",
            },
            "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": Object {
              "chainId": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
              "isEvm": false,
              "name": "Solana",
              "nativeCurrency": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501",
            },
            "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1": Object {
              "chainId": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
              "isEvm": false,
              "name": "Solana Devnet",
              "nativeCurrency": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501",
            },
            "tron:2494104990": Object {
              "chainId": "tron:2494104990",
              "isEvm": false,
              "name": "Tron Shasta",
              "nativeCurrency": "tron:2494104990/slip44:195",
            },
            "tron:3448148188": Object {
              "chainId": "tron:3448148188",
              "isEvm": false,
              "name": "Tron Nile",
              "nativeCurrency": "tron:3448148188/slip44:195",
            },
            "tron:728126428": Object {
              "chainId": "tron:728126428",
              "isEvm": false,
              "name": "Tron",
              "nativeCurrency": "tron:728126428/slip44:195",
            },
          },
          "networksWithTransactionActivity": Object {},
          "selectedMultichainNetworkChainId": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
        }
      `);
    });
  });
});
