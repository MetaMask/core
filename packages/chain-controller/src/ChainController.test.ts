import type { InternalAccount } from '@metamask/keyring-api';
import type { SnapController } from '@metamask/snaps-controllers';
import type { SnapId } from '@metamask/snaps-sdk';

import type { ChainControllerMessenger } from './ChainController';
import { ChainController } from './ChainController';

describe('ChainController', () => {
  const snapId = 'local:localhost:3000' as SnapId;
  const snapClient = {
    submitRequest: jest.fn(),
  };
  const snapController = {
    handleRequest: (request: { snapId: SnapId }) => {
      if (request.snapId === snapId) {
        return snapClient.submitRequest(request);
      }
      throw new Error(`Unknown Snap: ${request.snapId as string}`);
    },
  } as unknown as SnapController;

  const messenger = {
    call: jest.fn(() => ({
      catch: jest.fn(),
    })),
    registerActionHandler: jest.fn(),
    registerInitialEventPayload: jest.fn(),
    publish: jest.fn(),
    subscribe: jest.fn(),
  } as unknown as ChainControllerMessenger;

  const makeController = () => {
    return new ChainController({
      state: {},
      messenger,
      getSnapController: () => snapController,
    });
  };

  const address = 'bc1qrp0yzgkf8rawkuvdlhnjfj2fnjwm0m8727kgah';
  const scope = 'bip122:000000000019d6689c085ae165831e93';
  const asset = `${scope}/asset:0`;

  describe('registerProvider', () => {
    it('returns false if there is no known provider', () => {
      const controller = makeController();

      expect(controller.hasProviderFor(scope)).toBe(false);
    });

    it('registers a chain provider for a given scope', () => {
      const controller = makeController();

      expect(controller.registerProvider(scope, snapId)).toBeDefined();
      expect(controller.hasProviderFor(scope)).toBe(true);
    });

    it('fails to register another provider for an existing scope', () => {
      const controller = makeController();
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
      const controller = makeController();

      const provider = controller.registerProvider(scope, snapId);
      const providerSpy = jest.spyOn(provider, 'getBalances');

      snapClient.submitRequest.mockResolvedValue(response);
      const result = await controller.getBalances(scope, [address], [asset]);

      expect(providerSpy).toHaveBeenCalledWith(scope, [address], [asset]);
      expect(result).toStrictEqual(response);
    });

    it('is successful (getBalancesFromAccount)', async () => {
      const controller = makeController();

      const provider = controller.registerProvider(scope, snapId);
      const providerSpy = jest.spyOn(provider, 'getBalances');

      const account = {
        address,
      } as unknown as InternalAccount;

      snapClient.submitRequest.mockResolvedValue(response);
      const result = await controller.getBalancesFromAccount(scope, account, [
        asset,
      ]);

      expect(providerSpy).toHaveBeenCalledWith(scope, [address], [asset]);
      expect(result).toStrictEqual(response);
    });

    it('fails if not provider is registered', async () => {
      const controller = makeController();

      // We do not register any provider

      await expect(
        async () => await controller.getBalances(scope, [address], [asset]),
      ).rejects.toThrow(`No Chain provider found for scope: "${scope}"`);
    });
  });
});
