import { buildLighterKeyDerivationMessage } from '../../../src/constants/lighterConfig.js';
import type { PerpsControllerMessenger } from '../../../src/PerpsController.js';
import { LighterWalletService } from '../../../src/services/LighterWalletService.js';
import {
  createMockInfrastructure,
  createMockMessenger,
} from '../../helpers/serviceMocks.js';

// A fixed 65-byte signature (deterministic vector).
const FIXED_SIGNATURE = `0x${'ab'.repeat(65)}`;
const HEADLESS_ADDRESS = '0x8D7f03FdE1A626223364E592740a233b72395235';

describe('LighterWalletService', () => {
  describe('headless (injected signer)', () => {
    const buildService = (
      signer = jest.fn().mockResolvedValue(FIXED_SIGNATURE),
    ): { service: LighterWalletService; signer: jest.Mock } => {
      const service = new LighterWalletService(createMockInfrastructure(), {
        isTestnet: true,
        personalSigner: signer,
        l1Address: HEADLESS_ADDRESS,
      });
      return { service, signer };
    };

    it('returns the injected L1 address', () => {
      const { service } = buildService();
      expect(service.getUserAddress()).toBe(HEADLESS_ADDRESS);
    });

    it('routes personal_sign through the injected signer', async () => {
      const { service, signer } = buildService();
      const signature = await service.signPersonalMessage('hello');
      expect(signature).toBe(FIXED_SIGNATURE);
      expect(signer).toHaveBeenCalledWith('hello');
    });

    it('derives a deterministic 32-byte seed from the signature', async () => {
      const { service } = buildService();
      const seed1 = await service.deriveKeySeed(7);
      const seed2 = await service.deriveKeySeed(7);
      expect(seed1).toBe(seed2);
      expect(seed1).toMatch(/^0x[0-9a-f]{64}$/u);
    });

    it('binds the seed to the derivation message contents', async () => {
      const { service, signer } = buildService();
      await service.deriveKeySeed(7);
      expect(signer).toHaveBeenCalledWith(
        buildLighterKeyDerivationMessage({
          address: HEADLESS_ADDRESS,
          chainId: 300,
          apiKeyIndex: 7,
        }),
      );
    });

    it('derives different seeds for different signatures', async () => {
      const { service: serviceA } = buildService(
        jest.fn().mockResolvedValue(`0x${'11'.repeat(65)}`),
      );
      const { service: serviceB } = buildService(
        jest.fn().mockResolvedValue(`0x${'22'.repeat(65)}`),
      );
      expect(await serviceA.deriveKeySeed(7)).not.toBe(
        await serviceB.deriveKeySeed(7),
      );
    });

    it('strips the 0x prefix for the plain seed variant', async () => {
      const { service } = buildService();
      const plain = await service.deriveKeySeedPlain(7);
      expect(plain).toMatch(/^[0-9a-f]{64}$/u);
    });

    it('exposes and toggles testnet mode', () => {
      const { service } = buildService();
      expect(service.isTestnetMode()).toBe(true);
      service.setTestnetMode(false);
      expect(service.isTestnetMode()).toBe(false);
      expect(service.network).toBe('mainnet');
    });
  });

  describe('messenger-backed', () => {
    const selectedAccount = {
      address: HEADLESS_ADDRESS,
      type: 'eip155:eoa',
      metadata: {},
    };

    const buildMessengerService = (
      isUnlocked = true,
    ): {
      service: LighterWalletService;
      messenger: ReturnType<typeof createMockMessenger>;
    } => {
      const messenger = createMockMessenger();
      messenger.call.mockImplementation((action: string) => {
        if (action === 'KeyringController:getState') {
          return { isUnlocked };
        }
        if (action === 'AccountsController:getSelectedAccount') {
          return selectedAccount;
        }
        if (
          action === 'AccountTreeController:getAccountsFromSelectedAccountGroup'
        ) {
          return [selectedAccount];
        }
        if (action === 'KeyringController:signPersonalMessage') {
          return Promise.resolve(FIXED_SIGNATURE);
        }
        throw new Error(`Unexpected action: ${action}`);
      });
      const service = new LighterWalletService(createMockInfrastructure(), {
        isTestnet: true,
        messenger: messenger as unknown as PerpsControllerMessenger,
      });
      return { service, messenger };
    };

    it('signs through KeyringController:signPersonalMessage', async () => {
      const { service, messenger } = buildMessengerService();
      const signature = await service.signPersonalMessage('register me');
      expect(signature).toBe(FIXED_SIGNATURE);
      expect(messenger.call).toHaveBeenCalledWith(
        'KeyringController:signPersonalMessage',
        expect.objectContaining({
          from: HEADLESS_ADDRESS,
          data: expect.stringMatching(/^0x/u),
        }),
      );
    });

    it('rejects when the keyring is locked', async () => {
      const { service } = buildMessengerService(false);
      await expect(service.signPersonalMessage('nope')).rejects.toThrow(
        'KEYRING_LOCKED',
      );
    });
  });

  describe('unconfigured', () => {
    it('rejects signing without messenger or injected signer', async () => {
      const service = new LighterWalletService(createMockInfrastructure(), {
        isTestnet: true,
        l1Address: HEADLESS_ADDRESS,
      });
      await expect(service.signPersonalMessage('x')).rejects.toThrow(
        'NO_ACCOUNT_SELECTED',
      );
    });

    it('rejects address resolution without any source', () => {
      const service = new LighterWalletService(createMockInfrastructure(), {
        isTestnet: true,
      });
      expect(() => service.getUserAddress()).toThrow('NO_ACCOUNT_SELECTED');
    });
  });
});
