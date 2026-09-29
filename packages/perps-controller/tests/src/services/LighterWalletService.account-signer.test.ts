import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import { LighterWalletService } from '../../../src/services/LighterWalletService.js';
import { MAIN_SIGNATURE } from '../../helpers/agentFixtures.js';
import {
  createKeyringMessenger,
  createKeyringlessMessenger,
  createMockEvmAccount,
  createMockInfrastructure,
  keyringCalls,
} from '../../helpers/serviceMocks.js';

function createSigner(isReady?: () => boolean): {
  signTypedData: jest.Mock;
  signPersonalMessage: jest.Mock;
  isReady?: () => boolean;
} {
  return {
    signTypedData: jest.fn(),
    signPersonalMessage: jest.fn().mockResolvedValue(MAIN_SIGNATURE),
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

    expect(signature).toBe(MAIN_SIGNATURE);
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

describe('LighterWalletService.isMainAccountSignerReady', () => {
  it('follows the account signer when one is set', () => {
    let ready = true;
    const { messenger, call } = createKeyringlessMessenger();
    const service = new LighterWalletService(
      {
        ...createMockInfrastructure(),
        accountSigner: createSigner(() => ready),
      },
      { isTestnet: true, messenger },
    );

    const whileReady = service.isMainAccountSignerReady();
    ready = false;

    expect(whileReady).toBe(true);
    expect(service.isMainAccountSignerReady()).toBe(false);
    expect(keyringCalls(call)).toStrictEqual([]);
  });

  it.each([
    ['unlocked', true],
    ['locked', false],
  ])(
    "follows the keyring's unlock state without an account signer (%s)",
    (_state, isUnlocked) => {
      const { messenger, call } = createKeyringMessenger(
        MAIN_SIGNATURE,
        isUnlocked,
      );
      const service = new LighterWalletService(createMockInfrastructure(), {
        isTestnet: true,
        messenger,
      });

      expect(service.isMainAccountSignerReady()).toBe(isUnlocked);
      expect(keyringCalls(call)).toStrictEqual(['KeyringController:getState']);
    },
  );

  it('is not ready without an account signer or a messenger', () => {
    const service = new LighterWalletService(createMockInfrastructure(), {
      isTestnet: true,
    });

    expect(service.isMainAccountSignerReady()).toBe(false);
  });
});
