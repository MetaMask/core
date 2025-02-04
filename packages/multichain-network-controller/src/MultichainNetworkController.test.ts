import { ControllerMessenger } from '@metamask/base-controller';
import {
  BtcScopes,
  SolScopes,
  EthAccountType,
  BtcAccountType,
  SolAccountType,
  type KeyringAccountType,
} from '@metamask/keyring-api';
import type {
  AllowedActions,
  AllowedEvents,
  MultichainNetworkControllerAllowedActions,
  MultichainNetworkControllerAllowedEvents,
} from './MultichainNetworkController';
import { MultichainNetworkController } from './MultichainNetworkController';
import type {
  NetworkControllerGetStateAction,
  NetworkControllerSetActiveNetworkAction,
} from '@metamask/network-controller';
import { InfuraNetworkType } from '@metamask/controller-utils';
import type { CaipChainId } from '@metamask/utils';
import { createMockInternalAccount } from './test/utils';
import { multichainNetworkConfigurations } from './constants';

const controllerName = 'MultichainNetworkController';

/**
 * Setup a test controller instance.
 *
 * @param args - Arguments to this function.
 * @param args.state - Initial state for controller.
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
  const messenger = new ControllerMessenger<
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
    typeof controllerName,
    AllowedActions['type'],
    AllowedEvents['type']
  >({
    name: controllerName,
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
      selectedMultichainNetworkChainId: SolScopes.Mainnet,
      multichainNetworkConfigurationsByChainId: multichainNetworkConfigurations,
      multichainNetworksMetadata: {},
      nonEvmSelected: false,
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
  describe('setActiveNetwork', () => {
    it('should throw error when both EVM and non-EVM networks are provided', async () => {
      const { controller } = setupController();
      await expect(
        controller.setActiveNetwork({
          evmClientId: InfuraNetworkType.mainnet,
          nonEvmChainId: SolScopes.Mainnet,
        }),
      ).rejects.toThrow('Cannot set both EVM and non-EVM networks!');
    });

    it('should throw error if nonEvmChainId is an empty string', async () => {
      const { controller } = setupController();
      await expect(
        controller.setActiveNetwork({
          nonEvmChainId: '' as CaipChainId,
        }),
      ).rejects.toThrow('Non-EVM chain ID is required!');
    });

    it('should throw error if evmClientId is an empty string', async () => {
      const { controller } = setupController();
      await expect(
        controller.setActiveNetwork({
          evmClientId: '',
        }),
      ).rejects.toThrow('EVM client ID is required!');
    });

    it('should set non-EVM network when same non-EVM chain ID is active', async () => {
      // By default, Solana is selected but is NOT active (aka EVM network is active)
      const { controller, publishSpy } = setupController();

      // Set active network to Solana
      await controller.setActiveNetwork({
        nonEvmChainId: SolScopes.Mainnet,
      });

      // Check that the Solana is now the selected network
      expect(controller.state.selectedMultichainNetworkChainId).toBe(
        SolScopes.Mainnet,
      );

      // Check that the a non evm network is now active
      expect(controller.state.nonEvmSelected).toBe(true);

      // Check that the messenger published the correct event
      expect(publishSpy).toHaveBeenCalledWith(
        'MultichainNetworkController:setActiveNetwork',
        { nonEvmChainId: SolScopes.Mainnet },
      );
    });

    it('should throw error when unsupported non-EVM chainId is provided', async () => {
      const { controller } = setupController();
      const unsupportedChainId = 'non-existent-chain:0';

      await expect(
        controller.setActiveNetwork({
          nonEvmChainId: unsupportedChainId,
        }),
      ).rejects.toThrow('Non-EVM chain ID is not supported!');
    });

    it('should set non-EVM network when different non-EVM chain ID is active', async () => {
      // By default, Solana is selected but is NOT active (aka EVM network is active)
      const { controller, publishSpy } = setupController({
        options: { state: { nonEvmSelected: true } },
      });

      // Set active network to Bitcoin
      await controller.setActiveNetwork({
        nonEvmChainId: BtcScopes.Mainnet,
      });

      // Check that the Solana is now the selected network
      expect(controller.state.selectedMultichainNetworkChainId).toBe(
        BtcScopes.Mainnet,
      );

      // Check that BTC network is now active
      expect(controller.state.nonEvmSelected).toBe(true);

      // Check that the messenger published the correct event
      expect(publishSpy).toHaveBeenCalledWith(
        'MultichainNetworkController:setActiveNetwork',
        { nonEvmChainId: BtcScopes.Mainnet },
      );
    });

    it('should set EVM network and call NetworkController:setActiveNetwork when same EVM network is selected', async () => {
      const selectedNetworkClientId = InfuraNetworkType.mainnet;

      const { controller, mockSetActiveNetwork, publishSpy } = setupController({
        getNetworkState: jest.fn().mockImplementation(() => ({
          selectedNetworkClientId,
        })),
      });

      await controller.setActiveNetwork({
        evmClientId: selectedNetworkClientId,
      });

      // Check that EVM network is selected
      expect(controller.state.nonEvmSelected).toBe(false);

      // Check that the messenger published the correct event
      expect(publishSpy).toHaveBeenCalledWith(
        'MultichainNetworkController:setActiveNetwork',
        { evmClientId: selectedNetworkClientId },
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
      const evmClientId = 'linea';

      await controller.setActiveNetwork({
        evmClientId,
      });

      // Check that EVM network is selected
      expect(controller.state.nonEvmSelected).toBe(false);

      // Check that the messenger published the correct event
      expect(publishSpy).toHaveBeenCalledWith(
        'MultichainNetworkController:setActiveNetwork',
        { evmClientId },
      );

      // Check that NetworkController:setActiveNetwork was not called
      expect(mockSetActiveNetwork).toHaveBeenCalledWith(evmClientId);
    });
  });

  describe('handle AccountsController:selectedAccountChange event', () => {
    it('nonEvmSelected should be false when both switching to EVM account and EVM network is already active', async () => {
      // By default, Solana is selected but EVM network is active
      const { controller, triggerSelectedAccountChange } = setupController();

      // EVM network is currently active
      expect(controller.state.nonEvmSelected).toBe(false);

      // Switching to EVM account
      triggerSelectedAccountChange(EthAccountType.Eoa);

      // EVM network is still active
      expect(controller.state.nonEvmSelected).toBe(false);
    });
    it('should switch to EVM network if non-EVM network is previously active', async () => {
      // By default, Solana is selected and active
      const { controller, triggerSelectedAccountChange } = setupController({
        options: { state: { nonEvmSelected: true } },
        getNetworkState: jest.fn().mockImplementation(() => ({
          selectedNetworkClientId: InfuraNetworkType.mainnet,
        })),
      });

      // non-EVM network is currently active
      expect(controller.state.nonEvmSelected).toBe(true);

      // Switching to EVM account
      triggerSelectedAccountChange(EthAccountType.Eoa);

      // EVM network is now active
      expect(controller.state.nonEvmSelected).toBe(false);
    });
    it('non-EVM network should be active when switching to account of same non-EVM network', async () => {
      // By default, Solana is selected and active
      const { controller, triggerSelectedAccountChange } = setupController({
        options: {
          state: {
            nonEvmSelected: true,
            selectedMultichainNetworkChainId: SolScopes.Mainnet,
          },
        },
      });

      // non-EVM network is currently active
      expect(controller.state.nonEvmSelected).toBe(true);
      expect(controller.state.selectedMultichainNetworkChainId).toBe(
        SolScopes.Mainnet,
      );

      // Switching to Solana account
      triggerSelectedAccountChange(SolAccountType.DataAccount);

      // Solana is still the selected network
      expect(controller.state.selectedMultichainNetworkChainId).toBe(
        SolScopes.Mainnet,
      );
      expect(controller.state.nonEvmSelected).toBe(true);
    });
    it('non-EVM network should change when switching to account on different non-EVM network', async () => {
      // By default, Solana is selected and active
      const { controller, triggerSelectedAccountChange } = setupController({
        options: {
          state: {
            nonEvmSelected: true,
            selectedMultichainNetworkChainId: SolScopes.Mainnet,
          },
        },
      });

      // Solana is currently active
      expect(controller.state.nonEvmSelected).toBe(true);
      expect(controller.state.selectedMultichainNetworkChainId).toBe(
        SolScopes.Mainnet,
      );

      // Switching to Bitcoin account
      triggerSelectedAccountChange(BtcAccountType.P2wpkh);

      // Bitcoin is now the selected network
      expect(controller.state.selectedMultichainNetworkChainId).toBe(
        BtcScopes.Mainnet,
      );
      expect(controller.state.nonEvmSelected).toBe(true);
    });
  });
});
