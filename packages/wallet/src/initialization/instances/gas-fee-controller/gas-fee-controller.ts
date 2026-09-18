import type { GasFeeMessenger } from '@metamask/gas-fee-controller';
import { GasFeeController } from '@metamask/gas-fee-controller';
import { Messenger } from '@metamask/messenger';
import type { ProviderProxy } from '@metamask/network-controller';

import type { InitializationConfiguration } from '../../types.js';

export type { GasFeeControllerInstanceOptions } from './types.js';

const GAS_API_BASE_URL = 'https://gas.api.cx.metamask.io';

// The controller substitutes `<chain_id>` with the decimal chain ID per request.
const DEFAULT_EIP1559_API_ENDPOINT = `${GAS_API_BASE_URL}/networks/<chain_id>/suggestedGasFees`;
const DEFAULT_LEGACY_API_ENDPOINT = `${GAS_API_BASE_URL}/networks/<chain_id>/gasPrices`;

export const gasFeeController: InitializationConfiguration<
  GasFeeController,
  GasFeeMessenger
> = {
  name: 'GasFeeController',
  init: ({ state, messenger, options }) => {
    const {
      clientId,
      EIP1559APIEndpoint = DEFAULT_EIP1559_API_ENDPOINT,
      legacyAPIEndpoint = DEFAULT_LEGACY_API_ENDPOINT,
      interval,
      getCurrentNetworkLegacyGasAPICompatibility = (): boolean => false,
      getCurrentAccountEIP1559Compatibility = (): boolean => true,
    } = options;

    return new GasFeeController({
      messenger,
      state,
      interval,
      EIP1559APIEndpoint,
      legacyAPIEndpoint,
      clientId,
      getCurrentNetworkLegacyGasAPICompatibility,
      getCurrentAccountEIP1559Compatibility,
      // Built from `NetworkController`, which the controller expects as direct
      // callbacks rather than messenger actions.
      getProvider: (): ProviderProxy => {
        const { selectedNetworkClientId } = messenger.call(
          'NetworkController:getState',
        );
        // The client's provider proxy lacks `setTarget`, which `ProviderProxy`
        // nominally requires but `GasFeeController` never calls.
        return messenger.call(
          'NetworkController:getNetworkClientById',
          selectedNetworkClientId,
        ).provider as ProviderProxy;
      },
      getCurrentNetworkEIP1559Compatibility: async () =>
        Boolean(
          await messenger.call('NetworkController:getEIP1559Compatibility'),
        ),
    });
  },
  getMessenger: (parent) => {
    const messenger: GasFeeMessenger = new Messenger({
      namespace: 'GasFeeController',
      parent,
    });

    parent.delegate({
      messenger,
      actions: [
        'NetworkController:getEIP1559Compatibility',
        'NetworkController:getNetworkClientById',
        'NetworkController:getState',
      ],
      events: ['NetworkController:networkDidChange'],
    });

    return messenger;
  },
};
