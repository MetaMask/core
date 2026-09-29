import type { PerpsControllerMessenger } from '../../../src/PerpsController.js';
import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import { LighterWalletService } from '../../../src/services/LighterWalletService.js';
import { MAIN_SIGNATURE } from '../../helpers/agentFixtures.js';
import {
  createMockInfrastructure,
  createMockMessenger,
} from '../../helpers/serviceMocks.js';

const SELECTED_ADDRESS = '0x8D7f03FdE1A626223364E592740a233b72395235';

describe('LighterWalletService', () => {
  describe('network', () => {
    it('exposes and toggles testnet mode', () => {
      const service = new LighterWalletService(createMockInfrastructure(), {
        isTestnet: true,
      });
      expect(service.isTestnetMode()).toBe(true);
      service.setTestnetMode(false);
      expect(service.isTestnetMode()).toBe(false);
      expect(service.network).toBe('mainnet');
    });
  });

  describe('messenger-backed', () => {
    const selectedAccount = {
      address: SELECTED_ADDRESS,
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
          return Promise.resolve(MAIN_SIGNATURE);
        }
        throw new Error(`Unexpected action: ${action}`);
      });
      const service = new LighterWalletService(createMockInfrastructure(), {
        isTestnet: true,
        messenger: messenger as unknown as PerpsControllerMessenger,
      });
      return { service, messenger };
    };

    it('signs the hex-encoded UTF-8 message through KeyringController:signPersonalMessage', async () => {
      const { service, messenger } = buildMessengerService();
      const signature = await service.signPersonalMessage('register me ✓');
      expect(signature).toBe(MAIN_SIGNATURE);
      expect(
        messenger.call.mock.calls.filter(
          ([action]) => action === 'KeyringController:signPersonalMessage',
        ),
      ).toStrictEqual([
        [
          'KeyringController:signPersonalMessage',
          // 'register me ✓' as UTF-8 bytes.
          { from: SELECTED_ADDRESS, data: '0x7265676973746572206d6520e29c93' },
        ],
      ]);
    });

    it('rejects when the keyring is locked', async () => {
      const { service } = buildMessengerService(false);
      await expect(service.signPersonalMessage('nope')).rejects.toThrow(
        PERPS_ERROR_CODES.KEYRING_LOCKED,
      );
    });
  });

  describe('unconfigured', () => {
    it('rejects signing without messenger or account signer', async () => {
      const service = new LighterWalletService(createMockInfrastructure(), {
        isTestnet: true,
      });
      await expect(service.signPersonalMessage('x')).rejects.toThrow(
        PERPS_ERROR_CODES.NO_ACCOUNT_SELECTED,
      );
    });

    it('rejects address resolution without any source', () => {
      const service = new LighterWalletService(createMockInfrastructure(), {
        isTestnet: true,
      });
      expect(() => service.getUserAddress()).toThrow(
        PERPS_ERROR_CODES.NO_ACCOUNT_SELECTED,
      );
    });
  });
});
