import { Messenger } from '@metamask/base-controller';
import { InfuraNetworkType } from '@metamask/controller-utils';
import {
  BtcScope,
  SolScope,
  EthAccountType,
  BtcAccountType,
  SolAccountType,
  type KeyringAccountType,
  type CaipChainId,
} from '@metamask/keyring-api';
import type {
  NetworkControllerGetStateAction,
  NetworkControllerSetActiveNetworkAction,
} from '@metamask/network-controller';

import { DEFAULT_MULTICHAIN_NETWORK_CONTROLLER_STATE } from './constants';
import { MultichainNetworkController } from './MultichainNetworkController';
import {
  type AllowedActions,
  type AllowedEvents,
  type MultichainNetworkControllerAllowedActions,
  type MultichainNetworkControllerAllowedEvents,
  MULTICHAIN_NETWORK_CONTROLLER_NAME,
} from './types';
import { createMockInternalAccount } from '../tests/utils';

/**
 * Setup a test controller instance.
 *
 * @param args - Arguments to this function.
 * @param args.options - The constructor options for the controller.
 * @param args.getNetworkState - Mock for NetworkController:getState action.
 * @param args.setActiveNetwork - Mock for NetworkController:setActiveNetwork action.
 * @returns A collection of test controllers and mocks.
 */
function setupController({
  options = {},
  getNetworkState,
  setActiveNetwork,
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
} = {}) {
  const messenger = new Messenger<
    MultichainNetworkControllerAllowedActions,
    MultichainNetworkControllerAllowedEvents
  >();

  const publishSpy = jest.spyOn(messenger, 'publish');

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

  const controllerMessenger = messenger.getRestricted<
    typeof MULTICHAIN_NETWORK_CONTROLLER_NAME,
    AllowedActions['type'],
    AllowedEvents['type']
  >({
    name: MULTICHAIN_NETWORK_CONTROLLER_NAME,
    allowedActions: [
      'NetworkController:setActiveNetwork',
      'NetworkController:getState',
    ],
    allowedEvents: ['AccountsController:selectedAccountChange'],
  });

  // Default state to use Solana network with EVM as active network
  const controller = new MultichainNetworkController({
    messenger: options.messenger || controllerMessenger,
    state: {
      selectedMultichainNetworkChainId: SolScope.Mainnet,
      // multichainNetworkConfigurationsByChainId:
      //   DEFAULT_MULTICHAIN_NETWORK_CONTROLLER_STATE,
      isEvmSelected: true,
      ...options.state,
    },
  });

  const triggerSelectedAccountChange = (accountType: KeyringAccountType) => {
    const mockAccountAddressByAccountType: Record<KeyringAccountType, string> =
      {
        [EthAccountType.Eoa]: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
        [EthAccountType.Erc4337]: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
        [SolAccountType.DataAccount]:
          'So11111111111111111111111111111111111111112',
        [BtcAccountType.P2wpkh]: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      };
    const mockAccountAddress = mockAccountAddressByAccountType[accountType];

    const mockAccount = createMockInternalAccount({
      type: accountType,
      address: mockAccountAddress,
    });
    messenger.publish('AccountsController:selectedAccountChange', mockAccount);
  };

  return {
    messenger,
    controller,
    mockGetNetworkState,
    mockSetActiveNetwork,
    publishSpy,
    triggerSelectedAccountChange,
  };
}

describe('MultichainNetworkController', () => {
  describe('constructor', () => {
    it('should set default state', () => {
      const { controller } = setupController({
        options: { state: DEFAULT_MULTICHAIN_NETWORK_CONTROLLER_STATE },
      });
      expect(controller.state).toStrictEqual(
        DEFAULT_MULTICHAIN_NETWORK_CONTROLLER_STATE,
      );
    });
  });

  describe('setActiveNetwork', () => {
    it('should set non-EVM network when same non-EVM chain ID is active', async () => {
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

    it('should throw error when unsupported non-EVM chainId is provided', async () => {
      const { controller } = setupController();
      const unsupportedChainId = 'eip155:1' as CaipChainId;

      await expect(
        controller.setActiveNetwork(unsupportedChainId),
      ).rejects.toThrow(`Unsupported Caip chain ID: ${unsupportedChainId}`);
    });

    it('should do nothing when same non-EVM chain ID is set and active', async () => {
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

    it('should set non-EVM network when different non-EVM chain ID is active', async () => {
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

    it('should set EVM network and call NetworkController:setActiveNetwork when same EVM network is selected', async () => {
      const selectedNetworkClientId = InfuraNetworkType.mainnet;

      const { controller, mockSetActiveNetwork, publishSpy } = setupController({
        getNetworkState: jest.fn().mockImplementation(() => ({
          selectedNetworkClientId,
        })),
      });

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

    it('should set EVM network and call NetworkController:setActiveNetwork when different EVM network is selected', async () => {
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

    it('should switch to EVM network if non-EVM network is previously active', async () => {
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
  });
});
