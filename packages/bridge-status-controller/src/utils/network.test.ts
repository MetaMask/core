import type {
  AutoManagedNetworkClient,
  CustomNetworkClientConfiguration,
} from '@metamask/network-controller';
import { CHAIN_IDS } from '@metamask/transaction-controller';
import { describe, expect, it } from 'vitest';

import {
  getControllerMessenger,
  getRootMessenger,
  registerDefaultActionHandlers,
} from '../__fixtures__/test-utils.js';
import { getWeb3Provider } from './network.js';

const setup = (
  overrides: { missingProvider?: boolean } = {},
): ReturnType<typeof getControllerMessenger> => {
  const rootMessenger = getRootMessenger();
  const messenger = getControllerMessenger(rootMessenger);
  registerDefaultActionHandlers(rootMessenger);

  if (overrides.missingProvider) {
    rootMessenger.unregisterActionHandler(
      'NetworkController:getNetworkClientById',
    );
    rootMessenger.registerActionHandler(
      'NetworkController:getNetworkClientById',
      () =>
        ({
          provider: undefined,
        }) as unknown as AutoManagedNetworkClient<CustomNetworkClientConfiguration>,
    );
  }

  return messenger;
};

describe('getWeb3Provider', () => {
  it('wraps the network client provider in a Web3Provider', () => {
    expect(getWeb3Provider(setup(), CHAIN_IDS.ARBITRUM).constructor.name).toBe(
      'Web3Provider',
    );
  });

  it('throws when the network client has no provider', () => {
    expect(() =>
      getWeb3Provider(setup({ missingProvider: true }), CHAIN_IDS.ARBITRUM),
    ).toThrow(`No provider available for chain ${CHAIN_IDS.ARBITRUM}`);
  });
});
