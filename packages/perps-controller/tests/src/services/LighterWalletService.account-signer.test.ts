import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import { LighterWalletService } from '../../../src/services/LighterWalletService.js';
import {
  createKeyringlessMessenger,
  createMockEvmAccount,
  createMockInfrastructure,
  keyringCalls,
} from '../../helpers/serviceMocks.js';

const SIGNATURE = `0x${'ab'.repeat(65)}` as const;

function createSigner(isReady?: () => boolean): {
  signTypedData: jest.Mock;
  signPersonalMessage: jest.Mock;
  isReady?: () => boolean;
} {
  return {
    signTypedData: jest.fn(),
    signPersonalMessage: jest.fn().mockResolvedValue(SIGNATURE),
    isReady,
  };
}

describe('LighterWalletService with accountSigner', () => {
  it('signs personal messages through the account signer without KeyringController', async () => {
    const signer = createSigner();
    const { messenger, call } = createKeyringlessMessenger();
    const service = new LighterWalletService(
      { ...createMockInfrastructure(), accountSigner: signer },
      { isTestnet: true, messenger },
    );

    const signature = await service.signPersonalMessage('hello');

    expect(signature).toBe(SIGNATURE);
    expect(signer.signPersonalMessage).toHaveBeenCalledWith(
      createMockEvmAccount().address,
      'hello',
    );
    expect(keyringCalls(call)).toStrictEqual([]);
  });

  it('fails with KEYRING_LOCKED and does not sign when isReady returns false', async () => {
    const signer = createSigner(() => false);
    const { messenger, call } = createKeyringlessMessenger();
    const service = new LighterWalletService(
      { ...createMockInfrastructure(), accountSigner: signer },
      { isTestnet: true, messenger },
    );

    await expect(service.signPersonalMessage('hello')).rejects.toThrow(
      PERPS_ERROR_CODES.KEYRING_LOCKED,
    );
    expect(signer.signPersonalMessage).not.toHaveBeenCalled();
    expect(keyringCalls(call)).toStrictEqual([]);
  });

  it('fails with NO_ACCOUNT_SELECTED without a messenger to resolve the address', async () => {
    const signer = createSigner();
    const service = new LighterWalletService(
      { ...createMockInfrastructure(), accountSigner: signer },
      { isTestnet: true },
    );

    await expect(service.signPersonalMessage('hello')).rejects.toThrow(
      PERPS_ERROR_CODES.NO_ACCOUNT_SELECTED,
    );
    expect(signer.signPersonalMessage).not.toHaveBeenCalled();
  });
});
