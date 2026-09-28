import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import { HyperLiquidWalletService } from '../../../src/services/HyperLiquidWalletService.js';
import type { PerpsTypedDataPayload } from '../../../src/types/index.js';
import {
  createKeyringlessMessenger,
  createMockEvmAccount,
  createMockInfrastructure,
  keyringCalls,
} from '../../helpers/serviceMocks.js';

const SIGNATURE = `0x${'cd'.repeat(65)}` as const;

const TYPED_DATA: PerpsTypedDataPayload = {
  domain: {
    name: 'Exchange',
    version: '1',
    chainId: 1337,
    verifyingContract: '0x0000000000000000000000000000000000000000',
  },
  types: {
    Agent: [
      { name: 'source', type: 'string' },
      { name: 'connectionId', type: 'bytes32' },
    ],
  },
  primaryType: 'Agent',
  message: { source: 'b', connectionId: `0x${'11'.repeat(32)}` },
};

type SignerOverrides = {
  signTypedData?: jest.Mock;
  isReady?: () => boolean;
  isHardwareWallet?: () => boolean;
};

type Built = {
  service: HyperLiquidWalletService;
  call: jest.SpyInstance;
  signer: { signTypedData: jest.Mock; signPersonalMessage: jest.Mock };
};

function buildService(
  overrides: SignerOverrides = {},
  keyringType?: string,
): Built {
  const signer = {
    signTypedData:
      overrides.signTypedData ?? jest.fn().mockResolvedValue(SIGNATURE),
    signPersonalMessage: jest.fn().mockResolvedValue(SIGNATURE),
    isReady: overrides.isReady,
    isHardwareWallet: overrides.isHardwareWallet,
  };
  const { messenger, call } = createKeyringlessMessenger(keyringType);
  const service = new HyperLiquidWalletService(
    { ...createMockInfrastructure(), accountSigner: signer },
    messenger,
    { isTestnet: true },
  );
  return { service, call, signer };
}

describe('HyperLiquidWalletService with accountSigner', () => {
  const { address } = createMockEvmAccount();

  it('signs typed data through the account signer without KeyringController', async () => {
    const { service, call, signer } = buildService();

    const signature = await service
      .createWalletAdapter()
      .signTypedData(TYPED_DATA);

    expect(signature).toBe(SIGNATURE);
    expect(signer.signTypedData).toHaveBeenCalledTimes(1);
    expect(signer.signTypedData).toHaveBeenCalledWith(address, TYPED_DATA);
    expect(keyringCalls(call)).toStrictEqual([]);
  });

  it('propagates account signer rejections', async () => {
    const { service } = buildService({
      signTypedData: jest
        .fn()
        .mockRejectedValue(new Error('User rejected the request.')),
    });

    await expect(
      service.createWalletAdapter().signTypedData(TYPED_DATA),
    ).rejects.toThrow('User rejected the request.');
  });

  it('reports ready when isReady is omitted', () => {
    const { service, call } = buildService();

    expect(service.isKeyringUnlocked()).toBe(true);
    expect(keyringCalls(call)).toStrictEqual([]);
  });

  it('fails with KEYRING_LOCKED and does not sign when isReady returns false', async () => {
    const { service, call, signer } = buildService({ isReady: () => false });

    expect(service.isKeyringUnlocked()).toBe(false);
    await expect(
      service.createWalletAdapter().signTypedData(TYPED_DATA),
    ).rejects.toThrow(PERPS_ERROR_CODES.KEYRING_LOCKED);
    expect(signer.signTypedData).not.toHaveBeenCalled();
    expect(keyringCalls(call)).toStrictEqual([]);
  });

  it('treats the account as hardware when isHardwareWallet returns true', () => {
    const { service } = buildService(
      { isHardwareWallet: () => true },
      'HD Key Tree',
    );

    expect(service.isSelectedHardwareWallet()).toBe(true);
  });

  it('treats the account as software when isHardwareWallet returns false', () => {
    const { service } = buildService(
      { isHardwareWallet: () => false },
      'Ledger Hardware',
    );

    expect(service.isSelectedHardwareWallet()).toBe(false);
  });

  it.each([
    ['Ledger Hardware', true],
    ['HD Key Tree', false],
  ])(
    'falls back to the %s keyring type when isHardwareWallet is omitted',
    (keyringType, expected) => {
      const { service } = buildService({}, keyringType);

      expect(service.isSelectedHardwareWallet()).toBe(expected);
    },
  );
});
