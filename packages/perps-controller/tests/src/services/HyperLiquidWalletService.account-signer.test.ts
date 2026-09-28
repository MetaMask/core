import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import { HyperLiquidWalletService } from '../../../src/services/HyperLiquidWalletService.js';
import type { PerpsTypedDataPayload } from '../../../src/types/index.js';
import {
  createKeyringlessMessenger,
  createMockEvmAccount,
  createMockInfrastructure,
  createMockMessenger,
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

describe('HyperLiquidWalletService agent wallet adapter', () => {
  const { address: mainAddress } = createMockEvmAccount();
  const AGENT_ADDRESS = '0x00000000000000000000000000000000000a9e17' as const;
  const AGENT_SIGNATURE = `0x${'ef'.repeat(65)}` as const;
  const USER_SIGNED_ACTION: PerpsTypedDataPayload = {
    domain: {
      name: 'HyperliquidSignTransaction',
      version: '1',
      chainId: 1,
      verifyingContract: '0x0000000000000000000000000000000000000000',
    },
    types: {
      'HyperliquidTransaction:ApproveBuilderFee': [
        { name: 'hyperliquidChain', type: 'string' },
        { name: 'maxFeeRate', type: 'string' },
        { name: 'builder', type: 'address' },
        { name: 'nonce', type: 'uint64' },
      ],
    },
    primaryType: 'HyperliquidTransaction:ApproveBuilderFee',
    message: {
      hyperliquidChain: 'Mainnet',
      maxFeeRate: '0.1%',
      builder: AGENT_ADDRESS,
      nonce: 1,
    },
  };

  function buildAgentAdapter(): {
    adapter: ReturnType<HyperLiquidWalletService['createAgentWalletAdapter']>;
    agentSign: jest.Mock;
    mainSign: jest.Mock;
    call: jest.SpyInstance;
  } {
    const { service, call, signer } = buildService();
    const agentSign = jest.fn().mockResolvedValue(AGENT_SIGNATURE);
    const adapter = service.createAgentWalletAdapter({
      address: AGENT_ADDRESS,
      signTypedData: agentSign,
    });
    return { adapter, agentSign, mainSign: signer.signTypedData, call };
  }

  it('uses the agent as the signing address', () => {
    const { adapter } = buildAgentAdapter();

    expect(adapter.address).toBe(AGENT_ADDRESS);
  });

  it('signs L1 actions with the agent', async () => {
    const { adapter, agentSign, mainSign, call } = buildAgentAdapter();

    const signature = await adapter.signTypedData(TYPED_DATA);

    expect(signature).toBe(AGENT_SIGNATURE);
    expect(agentSign).toHaveBeenCalledWith(TYPED_DATA);
    expect(mainSign).not.toHaveBeenCalled();
    expect(keyringCalls(call)).toStrictEqual([]);
  });

  it('signs user-signed actions with the main account', async () => {
    const { adapter, agentSign, mainSign } = buildAgentAdapter();

    const signature = await adapter.signTypedData(USER_SIGNED_ACTION);

    expect(signature).toBe(SIGNATURE);
    expect(mainSign).toHaveBeenCalledWith(mainAddress, USER_SIGNED_ACTION);
    expect(agentSign).not.toHaveBeenCalled();
  });

  it('keeps an Agent primary type outside the Exchange domain on the main account', async () => {
    const { adapter, agentSign, mainSign } = buildAgentAdapter();
    const lookalike = {
      ...TYPED_DATA,
      domain: { ...TYPED_DATA.domain, name: 'HyperliquidSignTransaction' },
    };

    await adapter.signTypedData(lookalike);

    expect(mainSign).toHaveBeenCalledWith(mainAddress, lookalike);
    expect(agentSign).not.toHaveBeenCalled();
  });

  it('signs user-signed actions through the keyring when no account signer is set', async () => {
    const messenger = createMockMessenger();
    const call = jest.spyOn(messenger, 'call');
    const service = new HyperLiquidWalletService(
      createMockInfrastructure(),
      messenger,
    );
    const adapter = service.createAgentWalletAdapter({
      address: AGENT_ADDRESS,
      signTypedData: jest.fn(),
    });

    await adapter.signTypedData(USER_SIGNED_ACTION);

    expect(call).toHaveBeenCalledWith(
      'KeyringController:signTypedMessage',
      { from: mainAddress, data: USER_SIGNED_ACTION },
      'V4',
    );
  });
});
