import type { PerpsControllerMessenger } from '../../../src/PerpsController.js';
import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import { LighterWalletService } from '../../../src/services/LighterWalletService.js';
import type { PerpsAccountSigner } from '../../../src/types/index.js';
import { createMockInfrastructure } from '../../helpers/serviceMocks.js';

const ADAPTER_SIGNATURE = `0x${'ab'.repeat(65)}` as const;
const KEYRING_SIGNATURE = `0x${'ef'.repeat(65)}` as const;
const ADDRESS = '0x8D7f03FdE1A626223364E592740a233b72395235';

type Built = {
  service: LighterWalletService;
  call: jest.Mock;
};

function buildService(accountSigner?: PerpsAccountSigner): Built {
  const selectedAccount = { address: ADDRESS, type: 'eip155:eoa' };
  const call = jest.fn((action: string) => {
    if (action === 'AccountsController:getSelectedAccount') {
      return selectedAccount;
    }
    if (action === 'KeyringController:getState') {
      return { isUnlocked: true };
    }
    if (action === 'KeyringController:signPersonalMessage') {
      return Promise.resolve(KEYRING_SIGNATURE);
    }
    throw new Error(`Unexpected action: ${action}`);
  });
  const messenger = { call } as unknown as PerpsControllerMessenger;
  const deps = { ...createMockInfrastructure(), accountSigner };
  const service = new LighterWalletService(deps, {
    isTestnet: true,
    messenger,
  });
  return { service, call };
}

function keyringCalls(call: jest.Mock): string[] {
  return call.mock.calls
    .map(([action]: [string]) => action)
    .filter((action) => action.startsWith('KeyringController:'));
}

describe('LighterWalletService with accountSigner', () => {
  it('signs personal messages through the account signer before the messenger', async () => {
    const signPersonalMessage = jest.fn().mockResolvedValue(ADAPTER_SIGNATURE);
    const { service, call } = buildService({
      signTypedData: jest.fn(),
      signPersonalMessage,
    });

    const signature = await service.signPersonalMessage('hello');

    expect(signature).toBe(ADAPTER_SIGNATURE);
    expect(signPersonalMessage).toHaveBeenCalledWith(ADDRESS, 'hello');
    expect(keyringCalls(call)).toStrictEqual([]);
  });

  it('fails with KEYRING_LOCKED when isReady returns false', async () => {
    const signPersonalMessage = jest.fn().mockResolvedValue(ADAPTER_SIGNATURE);
    const { service, call } = buildService({
      signTypedData: jest.fn(),
      signPersonalMessage,
      isReady: () => false,
    });

    await expect(service.signPersonalMessage('hello')).rejects.toThrow(
      PERPS_ERROR_CODES.KEYRING_LOCKED,
    );
    expect(signPersonalMessage).not.toHaveBeenCalled();
    expect(keyringCalls(call)).toStrictEqual([]);
  });

  it('fails with NO_ACCOUNT_SELECTED without a messenger to resolve the address', async () => {
    const signPersonalMessage = jest.fn().mockResolvedValue(ADAPTER_SIGNATURE);
    const service = new LighterWalletService(
      {
        ...createMockInfrastructure(),
        accountSigner: { signTypedData: jest.fn(), signPersonalMessage },
      },
      { isTestnet: true },
    );

    await expect(service.signPersonalMessage('hello')).rejects.toThrow(
      PERPS_ERROR_CODES.NO_ACCOUNT_SELECTED,
    );
    expect(signPersonalMessage).not.toHaveBeenCalled();
  });

  it('falls back to the messenger when the signer has no signPersonalMessage', async () => {
    const { service, call } = buildService({ signTypedData: jest.fn() });

    const signature = await service.signPersonalMessage('hello');

    expect(signature).toBe(KEYRING_SIGNATURE);
    expect(call).toHaveBeenCalledWith(
      'KeyringController:signPersonalMessage',
      expect.objectContaining({ from: ADDRESS }),
    );
  });
});

describe('LighterWalletService without accountSigner', () => {
  it('keeps signing through KeyringController:signPersonalMessage', async () => {
    const { service, call } = buildService();

    const signature = await service.signPersonalMessage('hello');

    expect(signature).toBe(KEYRING_SIGNATURE);
    expect(call).toHaveBeenCalledWith('KeyringController:getState');
    expect(call).toHaveBeenCalledWith(
      'KeyringController:signPersonalMessage',
      expect.objectContaining({ from: ADDRESS }),
    );
  });
});
