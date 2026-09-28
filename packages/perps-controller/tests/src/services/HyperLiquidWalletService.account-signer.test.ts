import type { Hex } from '@metamask/utils';
import { ApproveBuilderFeeTypes } from '@nktkas/hyperliquid/api/exchange';
import {
  signL1Action,
  signUserSignedAction,
} from '@nktkas/hyperliquid/signing';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

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

describe('HyperLiquidWalletService wallet adapter with an agent', () => {
  const { address: mainAddress } = createMockEvmAccount();
  const OTHER_MAIN_ADDRESS = '0x00000000000000000000000000000000000b0b01';
  const AGENT_ADDRESS = '0x00000000000000000000000000000000000a9e17';
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

  function buildAdapter(agentAvailable = true): {
    adapter: ReturnType<HyperLiquidWalletService['createWalletAdapter']>;
    resolveAgent: jest.Mock;
    agentSign: jest.Mock;
    mainSign: jest.Mock;
    call: jest.SpyInstance;
    selectAccount: (address: `0x${string}`) => void;
  } {
    const signer = {
      signTypedData: jest.fn().mockResolvedValue(SIGNATURE),
      signPersonalMessage: jest.fn(),
    };
    const { messenger, call, selectAccount } = createKeyringlessMessenger();
    const service = new HyperLiquidWalletService(
      { ...createMockInfrastructure(), accountSigner: signer },
      messenger,
      { isTestnet: true },
    );
    const agentSign = jest.fn().mockResolvedValue(AGENT_SIGNATURE);
    const resolveAgent = jest
      .fn()
      .mockResolvedValue(
        agentAvailable
          ? { address: AGENT_ADDRESS, signTypedData: agentSign }
          : null,
      );
    return {
      adapter: service.createWalletAdapter(resolveAgent),
      resolveAgent,
      agentSign,
      mainSign: signer.signTypedData,
      call,
      selectAccount,
    };
  }

  it('keeps the main account as the wallet address', () => {
    const { adapter } = buildAdapter();

    expect(adapter.address).toBe(mainAddress);
  });

  it('signs L1 actions with the agent resolved for the selected account', async () => {
    const { adapter, resolveAgent, agentSign, mainSign, call } = buildAdapter();

    const signature = await adapter.signTypedData(TYPED_DATA);

    expect(signature).toBe(AGENT_SIGNATURE);
    expect(resolveAgent).toHaveBeenCalledWith(mainAddress);
    expect(agentSign).toHaveBeenCalledWith(TYPED_DATA);
    expect(mainSign).not.toHaveBeenCalled();
    expect(keyringCalls(call)).toStrictEqual([]);
  });

  it('signs user-signed actions with the main account without resolving an agent', async () => {
    const { adapter, resolveAgent, agentSign, mainSign } = buildAdapter();

    const signature = await adapter.signTypedData(USER_SIGNED_ACTION);

    expect(signature).toBe(SIGNATURE);
    expect(mainSign).toHaveBeenCalledWith(mainAddress, USER_SIGNED_ACTION);
    expect(resolveAgent).not.toHaveBeenCalled();
    expect(agentSign).not.toHaveBeenCalled();
  });

  it('keeps an Agent primary type outside the Exchange domain on the main account', async () => {
    const { adapter, agentSign, mainSign } = buildAdapter();
    const lookalike = {
      ...TYPED_DATA,
      domain: { ...TYPED_DATA.domain, name: 'HyperliquidSignTransaction' },
    };

    await adapter.signTypedData(lookalike);

    expect(mainSign).toHaveBeenCalledWith(mainAddress, lookalike);
    expect(agentSign).not.toHaveBeenCalled();
  });

  it('signs L1 actions with the main account when no agent is resolved', async () => {
    const { adapter, mainSign } = buildAdapter(false);

    await adapter.signTypedData(TYPED_DATA);

    expect(mainSign).toHaveBeenCalledWith(mainAddress, TYPED_DATA);
  });

  it('resolves the agent for the account selected at signing time', async () => {
    const { adapter, resolveAgent, selectAccount } = buildAdapter();

    selectAccount(OTHER_MAIN_ADDRESS);
    await adapter.signTypedData(TYPED_DATA);

    expect(resolveAgent).toHaveBeenCalledWith(OTHER_MAIN_ADDRESS);
    expect(resolveAgent).not.toHaveBeenCalledWith(mainAddress);
  });

  it('propagates agent resolution failures', async () => {
    const { adapter, resolveAgent, mainSign } = buildAdapter();
    resolveAgent.mockRejectedValue(new Error('agent store unavailable'));

    await expect(adapter.signTypedData(TYPED_DATA)).rejects.toThrow(
      'agent store unavailable',
    );
    expect(mainSign).not.toHaveBeenCalled();
  });
});

describe('HyperLiquidWalletService wallet adapter with the HyperLiquid SDK', () => {
  // Drive the adapter through the SDK's own signing functions so the routing
  // holds for the payloads the SDK actually builds and for the SDK's wallet
  // detection, not just for hand-written payloads.
  const mainAccount = privateKeyToAccount(generatePrivateKey());
  const agentAccount = privateKeyToAccount(generatePrivateKey());

  function buildSdkAdapter(): {
    adapter: ReturnType<HyperLiquidWalletService['createWalletAdapter']>;
    mainSign: jest.SpyInstance;
    agentSign: jest.SpyInstance;
  } {
    const { messenger, selectAccount } = createKeyringlessMessenger();
    selectAccount(mainAccount.address);
    const mainSign = jest.spyOn(mainAccount, 'signTypedData');
    const agentSign = jest.spyOn(agentAccount, 'signTypedData');
    const service = new HyperLiquidWalletService(
      {
        ...createMockInfrastructure(),
        accountSigner: {
          signTypedData: async (_address, payload): Promise<Hex> =>
            await mainAccount.signTypedData(payload),
          signPersonalMessage: async (_address, message): Promise<Hex> =>
            await mainAccount.signMessage({ message }),
        },
      },
      messenger,
      { isTestnet: true },
    );
    return {
      adapter: service.createWalletAdapter(async () => agentAccount),
      mainSign,
      agentSign,
    };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('signs an SDK L1 action with the agent', async () => {
    const { adapter, mainSign, agentSign } = buildSdkAdapter();

    await signL1Action({
      wallet: adapter,
      action: { type: 'cancel', cancels: [{ a: 0, o: 1 }] },
      nonce: 1,
      isTestnet: true,
    });

    expect(agentSign).toHaveBeenCalledTimes(1);
    expect(mainSign).not.toHaveBeenCalled();
  });

  it('signs an SDK user-signed action with the main account', async () => {
    const { adapter, mainSign, agentSign } = buildSdkAdapter();

    await signUserSignedAction({
      wallet: adapter,
      action: {
        type: 'approveBuilderFee',
        signatureChainId: '0x66eee',
        hyperliquidChain: 'Testnet',
        maxFeeRate: '0.1%',
        builder: agentAccount.address,
        nonce: 1,
      },
      types: ApproveBuilderFeeTypes,
    });

    expect(mainSign).toHaveBeenCalledTimes(1);
    expect(agentSign).not.toHaveBeenCalled();
  });
});
