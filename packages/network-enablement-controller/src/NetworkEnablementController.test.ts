import { Messenger } from '@metamask/base-controller';
import { BuiltInNetworkName, ChainId } from '@metamask/controller-utils';
import { RpcEndpointType } from '@metamask/network-controller';
import { KnownCaipNamespace } from '@metamask/utils';
import { useFakeTimers } from 'sinon';

import { NetworkEnablementController } from './NetworkEnablementController';
import type {
  NetworkEnablementControllerActions,
  NetworkEnablementControllerEvents,
  AllowedEvents,
  AllowedActions,
  NetworkEnablementControllerMessenger,
} from './NetworkEnablementController';
import { SolScope } from './types';
import { advanceTime } from '../../../tests/helpers';

const setupController = ({
  config,
}: {
  config?: Partial<
    ConstructorParameters<typeof NetworkEnablementController>[0]
  >;
} = {}) => {
  const messenger = new Messenger<
    NetworkEnablementControllerActions | AllowedActions,
    NetworkEnablementControllerEvents | AllowedEvents
  >();

  const networkEnablementControllerMessenger: NetworkEnablementControllerMessenger =
    messenger.getRestricted({
      name: 'NetworkEnablementController',
      allowedActions: [
        'NetworkController:getState',
        'MultichainNetworkController:getState',
      ],
      allowedEvents: [
        'NetworkController:networkAdded',
        'NetworkController:networkRemoved',
      ],
    });

  messenger.registerActionHandler(
    'NetworkController:getState',
    jest.fn().mockImplementation(() => ({
      networkConfigurationsByChainId: {
        '0x1': {
          defaultRpcEndpointIndex: 0,
          rpcEndpoints: [{}],
        },
      },
    })),
  );

  const controller = new NetworkEnablementController({
    messenger: networkEnablementControllerMessenger,
    ...config,
  });

  return {
    controller,
    messenger,
  };
};

describe('NetworkEnablementController', () => {
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    clock = useFakeTimers();
  });

  afterEach(() => {
    clock.restore();
  });

  it('initializes with default state', () => {
    const { controller } = setupController();

    expect(controller.state).toStrictEqual({
      enabledNetworkMap: {
        [KnownCaipNamespace.Eip155]: {
          [ChainId[BuiltInNetworkName.Mainnet]]: true,
          [ChainId[BuiltInNetworkName.LineaMainnet]]: true,
          [ChainId[BuiltInNetworkName.BaseMainnet]]: true,
        },
        [KnownCaipNamespace.Solana]: {
          [SolScope.Mainnet]: true,
        },
      },
    });
  });

  it('subscribes to NetworkController:networkAdded', async () => {
    const { controller, messenger } = setupController();

    // Publish an update with avax network added
    messenger.publish('NetworkController:networkAdded', {
      chainId: '0xa86a',
      blockExplorerUrls: [],
      defaultRpcEndpointIndex: 0,
      name: 'Avalanche',
      nativeCurrency: 'AVAX',
      rpcEndpoints: [
        {
          url: 'https://api.avax.network/ext/bc/C/rpc',
          networkClientId: 'id',
          type: RpcEndpointType.Custom,
        },
      ],
    });

    await advanceTime({ clock, duration: 1 });

    expect(controller.state).toStrictEqual({
      enabledNetworkMap: {
        [KnownCaipNamespace.Eip155]: {
          [ChainId[BuiltInNetworkName.Mainnet]]: true,
          [ChainId[BuiltInNetworkName.LineaMainnet]]: true,
          [ChainId[BuiltInNetworkName.BaseMainnet]]: true,
          '0xa86a': true, // Avalanche network enabled
        },
        [KnownCaipNamespace.Solana]: {
          [SolScope.Mainnet]: true,
        },
      },
    });
  });

  it('subscribes to NetworkController:networkRemoved', async () => {
    const { controller, messenger } = setupController();

    // Publish an update with linea network removed
    messenger.publish('NetworkController:networkRemoved', {
      chainId: ChainId[BuiltInNetworkName.LineaMainnet],
      blockExplorerUrls: [],
      defaultRpcEndpointIndex: 0,
      name: 'Linea',
      nativeCurrency: 'ETH',
      rpcEndpoints: [
        {
          url: 'https://linea-mainnet.infura.io/v3/1234567890',
          networkClientId: 'id',
          type: RpcEndpointType.Custom,
        },
      ],
    });

    await advanceTime({ clock, duration: 1 });

    expect(controller.state).toStrictEqual({
      enabledNetworkMap: {
        [KnownCaipNamespace.Eip155]: {
          [ChainId[BuiltInNetworkName.Mainnet]]: true,
          [ChainId[BuiltInNetworkName.BaseMainnet]]: true,
        },
        [KnownCaipNamespace.Solana]: {
          [SolScope.Mainnet]: true,
        },
      },
    });
  });

  it('does not remove the last enabled network', async () => {
    const { controller, messenger } = setupController();

    // disable all networks except linea
    controller.disableNetwork(ChainId[BuiltInNetworkName.Mainnet]);
    controller.disableNetwork(ChainId[BuiltInNetworkName.BaseMainnet]);

    // Publish an update with linea network removed
    messenger.publish('NetworkController:networkRemoved', {
      chainId: ChainId[BuiltInNetworkName.LineaMainnet],
      blockExplorerUrls: [],
      defaultRpcEndpointIndex: 0,
      name: 'Linea',
      nativeCurrency: 'ETH',
      rpcEndpoints: [
        {
          url: 'https://linea-mainnet.infura.io/v3/1234567890',
          networkClientId: 'id',
          type: RpcEndpointType.Custom,
        },
      ],
    });

    await advanceTime({ clock, duration: 1 });

    expect(controller.state).toStrictEqual({
      enabledNetworkMap: {
        [KnownCaipNamespace.Eip155]: {
          [ChainId[BuiltInNetworkName.Mainnet]]: false,
          [ChainId[BuiltInNetworkName.BaseMainnet]]: false,
          [ChainId[BuiltInNetworkName.LineaMainnet]]: true,
        },
        [KnownCaipNamespace.Solana]: {
          [SolScope.Mainnet]: true,
        },
      },
    });
  });

  describe('enableNetwork', () => {
    it('enables a popular network without clearing others', () => {
      const { controller } = setupController();

      // Disable a popular network (Ethereum Mainnet)
      controller.disableNetwork('0x1');

      expect(controller.state).toStrictEqual({
        enabledNetworkMap: {
          [KnownCaipNamespace.Eip155]: {
            [ChainId[BuiltInNetworkName.Mainnet]]: false,
            [ChainId[BuiltInNetworkName.LineaMainnet]]: true,
            [ChainId[BuiltInNetworkName.BaseMainnet]]: true,
          },
          [KnownCaipNamespace.Solana]: {
            [SolScope.Mainnet]: true,
          },
        },
      });

      // Enable the network again
      controller.enableNetwork('0x1');

      expect(controller.state).toStrictEqual({
        enabledNetworkMap: {
          [KnownCaipNamespace.Eip155]: {
            [ChainId[BuiltInNetworkName.Mainnet]]: true,
            [ChainId[BuiltInNetworkName.LineaMainnet]]: true,
            [ChainId[BuiltInNetworkName.BaseMainnet]]: true,
          },
          [KnownCaipNamespace.Solana]: {
            [SolScope.Mainnet]: true,
          },
        },
      });
    });

    it('enables a non-popular network and clears all others', async () => {
      const { controller, messenger } = setupController();

      // Add a non-popular network
      messenger.publish('NetworkController:networkAdded', {
        chainId: '0x2',
        blockExplorerUrls: [],
        defaultRpcEndpointIndex: 0,
        name: 'Polygon',
        nativeCurrency: 'MATIC',
        rpcEndpoints: [
          {
            url: 'https://polygon-mainnet.infura.io/v3/1234567890',
            networkClientId: 'id',
            type: RpcEndpointType.Custom,
          },
        ],
      });

      expect(controller.state).toStrictEqual({
        enabledNetworkMap: {
          [KnownCaipNamespace.Eip155]: {
            [ChainId[BuiltInNetworkName.Mainnet]]: false,
            [ChainId[BuiltInNetworkName.LineaMainnet]]: false,
            [ChainId[BuiltInNetworkName.BaseMainnet]]: false,
            '0x2': true,
          },
          [KnownCaipNamespace.Solana]: {
            [SolScope.Mainnet]: true,
          },
        },
      });
    });

    it('handles invalid chain ID gracefully', () => {
      const { controller } = setupController();

      // @ts-expect-error Intentionally passing an invalid chain ID
      expect(() => controller.enableNetwork('invalid')).toThrow(
        'Value must be a hexadecimal string.',
      );
    });

    it('handles enabling a network that is not added', () => {
      const { controller } = setupController();

      expect(() =>
        controller.enableNetwork('bip122:000000000019d6689c085ae165831e93'),
      ).toThrow('Invalid character');
    });
  });

  describe('disableNetwork', () => {
    it('disables an EVM network using hex chain ID', () => {
      const { controller } = setupController();

      // Enable a popular network (Ethereum Mainnet)
      controller.disableNetwork('0x1');

      expect(controller.state).toStrictEqual({
        enabledNetworkMap: {
          [KnownCaipNamespace.Eip155]: {
            [ChainId[BuiltInNetworkName.Mainnet]]: false,
            [ChainId[BuiltInNetworkName.LineaMainnet]]: true,
            [ChainId[BuiltInNetworkName.BaseMainnet]]: true,
          },
          [KnownCaipNamespace.Solana]: {
            [SolScope.Mainnet]: true,
          },
        },
      });
    });

    it('does not disable a Solana network using CAIP chain ID as it is the only enabled network on the namespace', () => {
      const { controller } = setupController();

      // Try to disable a Solana network using CAIP chain ID
      expect(() =>
        controller.disableNetwork('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'),
      ).toThrow('Cannot disable the last remaining enabled network');
    });

    it('prevents disabling the last active network for an EVM namespace', () => {
      const { controller } = setupController();

      // disable all networks except one
      controller.disableNetwork(ChainId[BuiltInNetworkName.LineaMainnet]);
      controller.disableNetwork(ChainId[BuiltInNetworkName.BaseMainnet]);

      expect(controller.state).toStrictEqual({
        enabledNetworkMap: {
          [KnownCaipNamespace.Eip155]: {
            [ChainId[BuiltInNetworkName.Mainnet]]: true,
            [ChainId[BuiltInNetworkName.LineaMainnet]]: false,
            [ChainId[BuiltInNetworkName.BaseMainnet]]: false,
          },
          [KnownCaipNamespace.Solana]: {
            [SolScope.Mainnet]: true,
          },
        },
      });

      // Try to disable the last active network
      expect(() => controller.disableNetwork('0x1')).toThrow(
        'Cannot disable the last remaining enabled network',
      );
    });

    it('handles disabling non-existent network gracefully', () => {
      const { controller } = setupController();

      // Try to disable a non-existent network
      expect(() => controller.disableNetwork('0x999')).not.toThrow();
    });

    it('handles invalid chain ID gracefully', () => {
      const { controller } = setupController();

      // @ts-expect-error Intentionally passing an invalid chain ID
      expect(() => controller.disableNetwork('invalid')).toThrow(
        'Value must be a hexadecimal string.',
      );
    });
  });
});
