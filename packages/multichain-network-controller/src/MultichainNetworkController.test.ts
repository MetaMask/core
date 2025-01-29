import { ControllerMessenger } from '@metamask/base-controller';

import type {
  MultichainNetworkStateControllerActions,
  MultichainNetworkControllerEvents,
} from './MultichainNetworkController';
import { bitcoinCaip2ChainId } from './constants';
import { MultichainNetworkController } from './MultichainNetworkController';

const name = 'MultichainNetworkController';

type AllowedActions = MultichainNetworkStateControllerActions | {
  type: 'NetworkController:setActiveNetwork';
  handler: (clientId: string) => void;
};

type AllowedEvents = MultichainNetworkControllerEvents;

const buildMessenger = () => {
  return new ControllerMessenger<AllowedActions, AllowedEvents>();
};

const buildMultichainNetworkControllerMessenger = (
  messenger: ControllerMessenger<AllowedActions, AllowedEvents>,
) => {
  return messenger.getRestricted<typeof name, 'NetworkController:setActiveNetwork', never>({
    name,
    allowedActions: ['NetworkController:setActiveNetwork'],
    allowedEvents: [],
  });
};

describe('MultichainNetworkController', () => {
  let controller: MultichainNetworkController;
  let messenger: ControllerMessenger<AllowedActions, AllowedEvents>;

  beforeEach(() => {
    messenger = buildMessenger();
    messenger.registerActionHandler(
      'NetworkController:setActiveNetwork',
      jest.fn(),
    );
    
    jest.spyOn(messenger, 'call');
    
    const restrictedMessenger = buildMultichainNetworkControllerMessenger(messenger);

    controller = new MultichainNetworkController({
      messenger: restrictedMessenger,
      state: {
        multichainNetworkConfigurationsByChainId: {},
        selectedMultichainNetworkChainId: bitcoinCaip2ChainId,
        multichainNetworksMetadata: {},
        nonEvmSelected: false,
      },
    });
  });

  describe('setActiveNetwork', () => {
    it('should set non-EVM network when valid chainId is provided', async () => {
        const clientId = 'testClient';
        const chainId = 'bip122:000000000019d6689c085ae165831e93';
        messenger = buildMessenger();
        messenger.registerActionHandler(
          'NetworkController:setActiveNetwork',
          jest.fn(),
        );
        
        jest.spyOn(messenger, 'call');
        
        const restrictedMessenger = buildMultichainNetworkControllerMessenger(messenger);
    
        const multiChainController = new MultichainNetworkController({
          messenger: restrictedMessenger,
          state: {
            multichainNetworkConfigurationsByChainId: {
              [chainId]: {
                chainId,
                name: 'Bitcoin',
                nativeCurrency: 'BTC',
                blockExplorerUrls: ['https://blockstream.info/'],
              },
            },
            selectedMultichainNetworkChainId: bitcoinCaip2ChainId,
            multichainNetworksMetadata: {},
            nonEvmSelected: false,
          },
        });
      
        await multiChainController.setActiveNetwork(clientId, chainId);
      
        expect(multiChainController.state.selectedMultichainNetworkChainId).toBe(chainId);
        expect(multiChainController.state.nonEvmSelected).toBe(true);
        expect(messenger.call).not.toHaveBeenCalled();
      });

    it('should set EVM network when chainId is not provided', async () => {
      const clientId = 'testClient';

      await controller.setActiveNetwork(clientId);

      expect(controller.state.nonEvmSelected).toBe(false);
      expect(messenger.call).toHaveBeenCalledWith(
        'NetworkController:setActiveNetwork',
        clientId,
      );
    });

    it('should set EVM network when invalid chainId is provided', async () => {
      const clientId = 'testClient';
      const invalidChainId = 'invalid-chain-id';

      await controller.setActiveNetwork(clientId, invalidChainId);

      expect(controller.state.nonEvmSelected).toBe(false);
      expect(messenger.call).toHaveBeenCalledWith(
        'NetworkController:setActiveNetwork',
        clientId,
      );
    });
  });

  describe('setNonEvmSelected', () => {
    it('should set nonEvmSelected to true', () => {
      controller.setNonEvmSelected();
      expect(controller.state.nonEvmSelected).toBe(true);
    });
  });

  describe('setEvmSelected', () => {
    it('should set nonEvmSelected to false', () => {
        messenger = buildMessenger();
        messenger.registerActionHandler(
          'NetworkController:setActiveNetwork',
          jest.fn(),
        );

        jest.spyOn(messenger, 'call');
        
        const restrictedMessenger = buildMultichainNetworkControllerMessenger(messenger);
        const multiChainController = new MultichainNetworkController({
          messenger: restrictedMessenger,
          state: {
            multichainNetworkConfigurationsByChainId: {},
            selectedMultichainNetworkChainId: bitcoinCaip2ChainId,
            multichainNetworksMetadata: {},
            nonEvmSelected: true,
          },
        });
  
        multiChainController.setEvmSelected();
        expect(multiChainController.state.nonEvmSelected).toBe(false);
      });
  });
});
