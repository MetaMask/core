import { ControllerMessenger } from '@metamask/base-controller';
import type { InternalAccount } from '@metamask/keyring-api';
import type { SnapId } from '@metamask/snaps-sdk';

import type { AllowedActions, ChainControllerActions } from './ChainController';
import { ChainController } from './ChainController';

const snapId = 'local:localhost:3000' as SnapId;

const address = 'bc1qrp0yzgkf8rawkuvdlhnjfj2fnjwm0m8727kgah';
const scope = 'bip122:000000000019d6689c085ae165831e93';
const asset = `${scope}/slip44:0`;

const name = 'ChainController';

/**
 * Constructs the messenger restricted to ChainController actions and events.
 *
 * @param actions - A map of actions and their mocked handlers.
 * @returns A restricted controller messenger.
 */
function getRestrictedMessenger(
  // We could just use a callback here, but having an actions makes the mapping more explicit
  actions?: Record<AllowedActions['type'], jest.Mock>,
) {
  const controllerMessenger = new ControllerMessenger<
    ChainControllerActions | AllowedActions,
    never
  >();

  if (actions) {
    controllerMessenger.registerActionHandler(
      'SnapController:handleRequest',
      actions['SnapController:handleRequest'],
    );
  }

  return controllerMessenger.getRestricted<typeof name, AllowedActions['type']>(
    {
      name,
      allowedActions: ['SnapController:handleRequest'],
      allowedEvents: [],
    },
  );
}

describe('ChainController', () => {
  describe('registerProvider', () => {
    it('returns false if there is no known provider', () => {
      const messenger = getRestrictedMessenger();
      const controller = new ChainController({
        messenger,
      });

      expect(controller.hasProviderFor(scope)).toBe(false);
    });

    it('registers a chain provider for a given scope', () => {
      const messenger = getRestrictedMessenger();
      const controller = new ChainController({
        messenger,
      });

      expect(controller.registerProvider(scope, snapId)).toBeDefined();
      expect(controller.hasProviderFor(scope)).toBe(true);
    });

    it('fails to register another provider for an existing scope', () => {
      const messenger = getRestrictedMessenger();
      const controller = new ChainController({
        messenger,
      });
      const anotherSnapId = 'local:localhost:4000' as SnapId;

      expect(controller.registerProvider(scope, snapId)).toBeDefined();
      expect(() => controller.registerProvider(scope, anotherSnapId)).toThrow(
        `Found an already existing provider for scope: "${scope}"`,
      );
    });
  });

  describe('getBalances', () => {
    const response = {
      balances: {
        [address]: {
          [asset]: {
            amount: '70.02255139',
          },
        },
      },
    };

    it('is successful', async () => {
      const handleRequest = jest.fn();
      const messenger = getRestrictedMessenger({
        'SnapController:handleRequest': handleRequest,
      });
      const controller = new ChainController({
        messenger,
      });

      const provider = controller.registerProvider(scope, snapId);
      const providerSpy = jest.spyOn(provider, 'getBalances');

      handleRequest.mockResolvedValue(response);
      const result = await controller.getBalances(scope, [address], [asset]);

      expect(providerSpy).toHaveBeenCalledWith(scope, [address], [asset]);
      expect(result).toStrictEqual(response);
    });

    it('is successful (getBalancesFromAccount)', async () => {
      const handleRequest = jest.fn();
      const messenger = getRestrictedMessenger({
        'SnapController:handleRequest': handleRequest,
      });
      const controller = new ChainController({
        messenger,
      });

      const provider = controller.registerProvider(scope, snapId);
      const providerSpy = jest.spyOn(provider, 'getBalances');

      const account = {
        address,
      } as unknown as InternalAccount;

      handleRequest.mockResolvedValue(response);
      const result = await controller.getBalancesFromAccount(scope, account, [
        asset,
      ]);

      expect(providerSpy).toHaveBeenCalledWith(scope, [address], [asset]);
      expect(result).toStrictEqual(response);
    });
  });

  describe('hasProviderFor', () => {
    it('fails if not provider is registered', async () => {
      const messenger = getRestrictedMessenger();
      const controller = new ChainController({
        messenger,
      });

      // We do not register any provider

      await expect(
        async () => await controller.getBalances(scope, [address], [asset]),
      ).rejects.toThrow(`No Chain provider found for scope: "${scope}"`);
    });
  });
});
