import type { Hex } from '@metamask/utils';
import type * as HyperLiquidExchange from '@nktkas/hyperliquid/api/exchange';
import type * as HyperLiquidSigning from '@nktkas/hyperliquid/signing';
import { recoverTypedDataAddress } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import {
  AgentSignerUnavailableError,
  isAgentSignerUnavailableError,
} from '../../../src/services/agentSigner.js';
import { HyperLiquidWalletService } from '../../../src/services/HyperLiquidWalletService.js';
import type {
  PerpsAgentSigner,
  PerpsTypedDataPayload,
} from '../../../src/types/index.js';
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
  requiresSignatureConfirmation?: () => boolean;
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
    requiresSignatureConfirmation: overrides.requiresSignatureConfirmation,
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

  it('treats the account as hardware when requiresSignatureConfirmation returns true', () => {
    const { service } = buildService(
      { requiresSignatureConfirmation: () => true },
      'HD Key Tree',
    );

    expect(service.isSelectedHardwareWallet()).toBe(true);
  });

  it('treats the account as software when requiresSignatureConfirmation returns false', () => {
    const { service } = buildService(
      { requiresSignatureConfirmation: () => false },
      'Ledger Hardware',
    );

    expect(service.isSelectedHardwareWallet()).toBe(false);
  });

  it.each([
    ['Ledger Hardware', true],
    ['HD Key Tree', false],
  ])(
    'falls back to the %s keyring type when requiresSignatureConfirmation is omitted',
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
    const agentSign = jest.fn().mockResolvedValue(AGENT_SIGNATURE);
    const resolveAgent = jest
      .fn()
      .mockResolvedValue(
        agentAvailable
          ? { address: AGENT_ADDRESS, signTypedData: agentSign }
          : null,
      );
    const service = new HyperLiquidWalletService(
      { ...createMockInfrastructure(), accountSigner: signer },
      messenger,
      { isTestnet: true, resolveAgent },
    );
    return {
      adapter: service.createWalletAdapter(),
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

  it('reports an agent that fails to sign as unavailable without signing with the main account', async () => {
    const { adapter, agentSign, mainSign } = buildAdapter();
    const failure = new Error('agent key locked');
    agentSign.mockRejectedValue(failure);

    const error: unknown = await adapter
      .signTypedData(TYPED_DATA)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AgentSignerUnavailableError);
    expect((error as Error).cause).toBe(failure);
    expect(mainSign).not.toHaveBeenCalled();
  });
});

describe('HyperLiquidWalletService wallet adapter with an agent and a keyring', () => {
  // The shape Mobile and Extension would run: KeyringController present, no
  // accountSigner, and an agent resolver.
  const { address: mainAddress } = createMockEvmAccount();
  const AGENT_SIGNATURE = `0x${'ef'.repeat(65)}` as const;
  const USER_SIGNED_ACTION: PerpsTypedDataPayload = {
    ...TYPED_DATA,
    domain: { ...TYPED_DATA.domain, name: 'HyperliquidSignTransaction' },
    primaryType: 'HyperliquidTransaction:ApproveBuilderFee',
    types: {
      'HyperliquidTransaction:ApproveBuilderFee': [
        { name: 'hyperliquidChain', type: 'string' },
        { name: 'nonce', type: 'uint64' },
      ],
    },
  };

  function buildKeyringAdapter(): {
    adapter: ReturnType<HyperLiquidWalletService['createWalletAdapter']>;
    agentSign: jest.Mock;
    call: jest.SpyInstance;
  } {
    const messenger = createMockMessenger();
    const call = jest.spyOn(messenger, 'call');
    const agentSign = jest.fn().mockResolvedValue(AGENT_SIGNATURE);
    const service = new HyperLiquidWalletService(
      createMockInfrastructure(),
      messenger,
      {
        resolveAgent: async (): Promise<PerpsAgentSigner> => ({
          address: '0x00000000000000000000000000000000000a9e17',
          signTypedData: agentSign,
        }),
      },
    );
    return { adapter: service.createWalletAdapter(), agentSign, call };
  }

  it('signs L1 actions with the agent without calling KeyringController', async () => {
    const { adapter, agentSign, call } = buildKeyringAdapter();

    const signature = await adapter.signTypedData(TYPED_DATA);

    expect(signature).toBe(AGENT_SIGNATURE);
    expect(agentSign).toHaveBeenCalledWith(TYPED_DATA);
    expect(keyringCalls(call)).toStrictEqual([]);
  });

  it('signs user-signed actions through KeyringController:signTypedMessage V4', async () => {
    const { adapter, agentSign, call } = buildKeyringAdapter();

    const signature = await adapter.signTypedData(USER_SIGNED_ACTION);

    expect(signature).toBe('0xSignatureResult');
    expect(agentSign).not.toHaveBeenCalled();
    expect(call).toHaveBeenCalledWith(
      'KeyringController:signTypedMessage',
      { from: mainAddress, data: USER_SIGNED_ACTION },
      'V4',
    );
  });
});

// The SDK ships ES modules only, and Jest can require them only on Node 24.9
// or newer, so this suite runs in the Node 24 CI job and is skipped on Node 22.
const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
const describeWithSdk =
  nodeMajor > 24 || (nodeMajor === 24 && nodeMinor >= 9)
    ? describe
    : describe.skip;

describeWithSdk(
  'HyperLiquidWalletService wallet adapter with the HyperLiquid SDK',
  () => {
    // Drive the adapter through the SDK's own signing functions and recover the
    // signer from each signature, so the routing holds for the payloads the SDK
    // builds (including its EIP712Domain entry) and for its wallet detection.
    const mainAccount = privateKeyToAccount(generatePrivateKey());
    const agentAccount = privateKeyToAccount(generatePrivateKey());
    let signing: typeof HyperLiquidSigning;
    let exchange: typeof HyperLiquidExchange;

    beforeAll(() => {
      signing = jest.requireActual<typeof HyperLiquidSigning>(
        '@nktkas/hyperliquid/signing',
      );
      exchange = jest.requireActual<typeof HyperLiquidExchange>(
        '@nktkas/hyperliquid/api/exchange',
      );
    });

    type RecordedSignature = { payload: PerpsTypedDataPayload; signature: Hex };

    function buildSdkAdapter(
      resolveAgent: () => Promise<PerpsAgentSigner> = async () =>
        // A viem local account is a PerpsAgentSigner as it is.
        agentAccount,
    ): {
      adapter: ReturnType<HyperLiquidWalletService['createWalletAdapter']>;
      signatures: RecordedSignature[];
      agentSignatures: () => Promise<RecordedSignature[]>;
    } {
      const { messenger, selectAccount } = createKeyringlessMessenger();
      selectAccount(mainAccount.address);
      const signatures: { payload: PerpsTypedDataPayload; signature: Hex }[] =
        [];
      const recordSignature =
        (account: typeof mainAccount) =>
        async (payload: PerpsTypedDataPayload): Promise<Hex> => {
          const signature = await account.signTypedData(payload);
          signatures.push({ payload, signature });
          return signature;
        };
      const service = new HyperLiquidWalletService(
        {
          ...createMockInfrastructure(),
          accountSigner: {
            signTypedData: async (_address, payload): Promise<Hex> =>
              await recordSignature(mainAccount)(payload),
            signPersonalMessage: async (_address, message): Promise<Hex> =>
              await mainAccount.signMessage({ message }),
          },
        },
        messenger,
        { isTestnet: true, resolveAgent },
      );
      const agentSign = jest.spyOn(agentAccount, 'signTypedData');
      return {
        adapter: service.createWalletAdapter(),
        signatures,
        agentSignatures: async () =>
          await Promise.all(
            agentSign.mock.calls.map(async ([payload], index) => ({
              payload: payload as PerpsTypedDataPayload,
              signature: (await agentSign.mock.results[index].value) as Hex,
            })),
          ),
      };
    }

    async function recoverSigner({
      payload,
      signature,
    }: {
      payload: PerpsTypedDataPayload;
      signature: Hex;
    }): Promise<Hex> {
      return await recoverTypedDataAddress({
        domain: payload.domain,
        types: payload.types,
        primaryType: payload.primaryType,
        message: payload.message,
        signature,
      });
    }

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('signs an SDK L1 action with the agent', async () => {
      const { adapter, signatures, agentSignatures } = buildSdkAdapter();

      await signing.signL1Action({
        wallet: adapter,
        action: { type: 'cancel', cancels: [{ a: 0, o: 1 }] },
        nonce: 1,
        isTestnet: true,
      });

      const agentSigned = await agentSignatures();
      expect(signatures).toHaveLength(0);
      expect(agentSigned).toHaveLength(1);
      expect(agentSigned[0].payload.types).toHaveProperty('EIP712Domain');
      expect(await recoverSigner(agentSigned[0])).toBe(agentAccount.address);
    });

    it('signs an SDK user-signed action with the main account', async () => {
      const { adapter, signatures, agentSignatures } = buildSdkAdapter();

      await signing.signUserSignedAction({
        wallet: adapter,
        action: {
          type: 'approveBuilderFee',
          signatureChainId: '0x66eee',
          hyperliquidChain: 'Testnet',
          maxFeeRate: '0.1%',
          builder: agentAccount.address,
          nonce: 1,
        },
        types: exchange.ApproveBuilderFeeTypes,
      });

      expect(await agentSignatures()).toHaveLength(0);
      expect(signatures).toHaveLength(1);
      expect(await recoverSigner(signatures[0])).toBe(mainAccount.address);
    });

    it('keeps an unavailable agent recognizable through the SDK error', async () => {
      const { adapter } = buildSdkAdapter(async () => {
        throw new AgentSignerUnavailableError(new Error('agent store down'));
      });

      const error: unknown = await signing
        .signL1Action({
          wallet: adapter,
          action: { type: 'cancel', cancels: [{ a: 0, o: 1 }] },
          nonce: 1,
          isTestnet: true,
        })
        .catch((caught: unknown) => caught);

      expect(error).not.toBeInstanceOf(AgentSignerUnavailableError);
      expect(isAgentSignerUnavailableError(error)).toBe(true);
    });

    it('keeps an agent signing failure recognizable through the SDK error', async () => {
      const { adapter } = buildSdkAdapter(async () => ({
        address: agentAccount.address,
        signTypedData: async (): Promise<Hex> => {
          throw new Error('agent key locked');
        },
      }));

      const error: unknown = await signing
        .signL1Action({
          wallet: adapter,
          action: { type: 'cancel', cancels: [{ a: 0, o: 1 }] },
          nonce: 1,
          isTestnet: true,
        })
        .catch((caught: unknown) => caught);

      expect(isAgentSignerUnavailableError(error)).toBe(true);
    });
  },
);
