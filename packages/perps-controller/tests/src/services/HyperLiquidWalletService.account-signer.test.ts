import type { Hex } from '@metamask/utils';
import type * as HyperLiquidExchange from '@nktkas/hyperliquid/api/exchange';
import type * as HyperLiquidSigning from '@nktkas/hyperliquid/signing';
import { recoverTypedDataAddress } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import {
  ARBITRUM_SEPOLIA_CHAIN_ID,
  BUILDER_FEE_CONFIG,
} from '../../../src/constants/hyperLiquidConfig.js';
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
  AGENT_ADDRESS,
  AGENT_SIGNATURE,
  L1_PAYLOAD,
  MAIN_SIGNATURE,
  USER_SIGNED_PAYLOAD,
} from '../../helpers/agentFixtures.js';
import {
  createKeyringlessMessenger,
  createMockEvmAccount,
  createMockInfrastructure,
  createMockMessenger,
  keyringCalls,
} from '../../helpers/serviceMocks.js';

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
      overrides.signTypedData ?? jest.fn().mockResolvedValue(MAIN_SIGNATURE),
    signPersonalMessage: jest.fn().mockResolvedValue(MAIN_SIGNATURE),
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
      .signTypedData(L1_PAYLOAD);

    expect(signature).toBe(MAIN_SIGNATURE);
    expect(signer.signTypedData).toHaveBeenCalledTimes(1);
    expect(signer.signTypedData).toHaveBeenCalledWith(address, L1_PAYLOAD);
    expect(keyringCalls(call)).toStrictEqual([]);
  });

  it('propagates account signer rejections', async () => {
    const { service } = buildService({
      signTypedData: jest
        .fn()
        .mockRejectedValue(new Error('User rejected the request.')),
    });

    await expect(
      service.createWalletAdapter().signTypedData(L1_PAYLOAD),
    ).rejects.toThrow('User rejected the request.');
  });

  it('fails with KEYRING_LOCKED, keeping the host error as its cause, when the signer locks while signing', async () => {
    let ready = true;
    const hostError = new Error('Wallet is locked');
    const { service } = buildService({
      isReady: () => ready,
      signTypedData: jest.fn(async () => {
        ready = false;
        throw hostError;
      }),
    });

    const error: unknown = await service
      .createWalletAdapter()
      .signTypedData(L1_PAYLOAD)
      .catch((caught: unknown) => caught);

    expect(error).toStrictEqual(new Error(PERPS_ERROR_CODES.KEYRING_LOCKED));
    expect((error as Error).cause).toBe(hostError);
  });

  it('reports ready when isReady is omitted', () => {
    const { service, call } = buildService();

    expect(service.isMainAccountSignerReady()).toBe(true);
    expect(keyringCalls(call)).toStrictEqual([]);
  });

  it('fails with KEYRING_LOCKED and does not sign when isReady returns false', async () => {
    const { service, call, signer } = buildService({ isReady: () => false });

    expect(service.isMainAccountSignerReady()).toBe(false);
    await expect(
      service.createWalletAdapter().signTypedData(L1_PAYLOAD),
    ).rejects.toThrow(PERPS_ERROR_CODES.KEYRING_LOCKED);
    expect(signer.signTypedData).not.toHaveBeenCalled();
    expect(keyringCalls(call)).toStrictEqual([]);
  });

  it("requires signature confirmation when the account signer's requiresSignatureConfirmation says so, whatever the keyring type", () => {
    const { service } = buildService(
      { requiresSignatureConfirmation: () => true },
      'HD Key Tree',
    );

    expect(service.requiresSignatureConfirmation()).toBe(true);
  });

  it("does not require signature confirmation when the account signer's requiresSignatureConfirmation says so, whatever the keyring type", () => {
    const { service } = buildService(
      { requiresSignatureConfirmation: () => false },
      'Ledger Hardware',
    );

    expect(service.requiresSignatureConfirmation()).toBe(false);
  });

  it.each([
    ['Ledger Hardware', true],
    ['HD Key Tree', false],
  ])(
    'falls back to the %s keyring type when requiresSignatureConfirmation is omitted',
    (keyringType, expected) => {
      const { service } = buildService({}, keyringType);

      expect(service.requiresSignatureConfirmation()).toBe(expected);
    },
  );
});

describe('HyperLiquidWalletService wallet adapter with an agent', () => {
  const { address: mainAddress } = createMockEvmAccount();
  const OTHER_MAIN_ADDRESS = '0x00000000000000000000000000000000000b0b01';
  function buildAdapter(agentAvailable = true): {
    adapter: ReturnType<HyperLiquidWalletService['createWalletAdapter']>;
    resolveAgent: jest.Mock;
    agentSign: jest.Mock;
    mainSign: jest.Mock;
    call: jest.SpyInstance;
    selectAccount: (address: `0x${string}`) => void;
  } {
    const signer = {
      signTypedData: jest.fn().mockResolvedValue(MAIN_SIGNATURE),
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

    const signature = await adapter.signTypedData(L1_PAYLOAD);

    expect(signature).toBe(AGENT_SIGNATURE);
    expect(resolveAgent.mock.calls).toStrictEqual([[mainAddress]]);
    expect(agentSign.mock.calls).toStrictEqual([[L1_PAYLOAD]]);
    expect(mainSign).not.toHaveBeenCalled();
    expect(keyringCalls(call)).toStrictEqual([]);
  });

  it('signs user-signed actions with the main account without resolving an agent', async () => {
    const { adapter, resolveAgent, agentSign, mainSign } = buildAdapter();

    const signature = await adapter.signTypedData(USER_SIGNED_PAYLOAD);

    expect(signature).toBe(MAIN_SIGNATURE);
    expect(mainSign).toHaveBeenCalledWith(mainAddress, USER_SIGNED_PAYLOAD);
    expect(resolveAgent).not.toHaveBeenCalled();
    expect(agentSign).not.toHaveBeenCalled();
  });

  it('keeps an Agent primary type outside the Exchange domain on the main account', async () => {
    const { adapter, resolveAgent, agentSign, mainSign } = buildAdapter();
    const lookalike = {
      ...L1_PAYLOAD,
      domain: { ...L1_PAYLOAD.domain, name: 'HyperliquidSignTransaction' },
    };

    await adapter.signTypedData(lookalike);

    expect(mainSign.mock.calls).toStrictEqual([[mainAddress, lookalike]]);
    expect(resolveAgent).not.toHaveBeenCalled();
    expect(agentSign).not.toHaveBeenCalled();
  });

  it('keeps another primary type in the Exchange domain on the main account', async () => {
    const { adapter, resolveAgent, agentSign, mainSign } = buildAdapter();
    const lookalike = {
      ...USER_SIGNED_PAYLOAD,
      domain: L1_PAYLOAD.domain,
    };

    await adapter.signTypedData(lookalike);

    expect(mainSign.mock.calls).toStrictEqual([[mainAddress, lookalike]]);
    expect(resolveAgent).not.toHaveBeenCalled();
    expect(agentSign).not.toHaveBeenCalled();
  });

  it('signs L1 actions with the main account when no agent is resolved', async () => {
    const { adapter, resolveAgent, mainSign } = buildAdapter(false);

    const signature = await adapter.signTypedData(L1_PAYLOAD);

    expect(signature).toBe(MAIN_SIGNATURE);
    expect(resolveAgent.mock.calls).toStrictEqual([[mainAddress]]);
    expect(mainSign.mock.calls).toStrictEqual([[mainAddress, L1_PAYLOAD]]);
  });

  it('resolves the agent for the account selected at signing time', async () => {
    const { adapter, resolveAgent, selectAccount } = buildAdapter();

    selectAccount(OTHER_MAIN_ADDRESS);
    await adapter.signTypedData(L1_PAYLOAD);

    expect(resolveAgent.mock.calls).toStrictEqual([[OTHER_MAIN_ADDRESS]]);
  });

  it('propagates agent resolution failures', async () => {
    const { adapter, resolveAgent, mainSign } = buildAdapter();
    resolveAgent.mockRejectedValue(new Error('agent store unavailable'));

    await expect(adapter.signTypedData(L1_PAYLOAD)).rejects.toThrow(
      'agent store unavailable',
    );
    expect(mainSign).not.toHaveBeenCalled();
  });

  it('signs L1 actions with the agent while the main signer is not ready', async () => {
    const agentSign = jest.fn().mockResolvedValue(AGENT_SIGNATURE);
    const { messenger } = createKeyringlessMessenger();
    const signer = {
      signTypedData: jest.fn(),
      signPersonalMessage: jest.fn(),
      isReady: (): boolean => false,
    };
    const adapter = new HyperLiquidWalletService(
      { ...createMockInfrastructure(), accountSigner: signer },
      messenger,
      {
        isTestnet: true,
        resolveAgent: async (): Promise<PerpsAgentSigner> => ({
          address: AGENT_ADDRESS,
          signTypedData: agentSign,
        }),
      },
    ).createWalletAdapter();

    const signature = await adapter.signTypedData(L1_PAYLOAD);

    expect(signature).toBe(AGENT_SIGNATURE);
    await expect(adapter.signTypedData(USER_SIGNED_PAYLOAD)).rejects.toThrow(
      PERPS_ERROR_CODES.KEYRING_LOCKED,
    );
    expect(signer.signTypedData).not.toHaveBeenCalled();
  });

  it('reports an agent that fails to sign as unavailable without signing with the main account', async () => {
    const { adapter, agentSign, mainSign } = buildAdapter();
    const failure = new Error('agent key locked');
    agentSign.mockRejectedValue(failure);

    const error: unknown = await adapter
      .signTypedData(L1_PAYLOAD)
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
          address: AGENT_ADDRESS,
          signTypedData: agentSign,
        }),
      },
    );
    return { adapter: service.createWalletAdapter(), agentSign, call };
  }

  it('signs L1 actions with the agent without calling KeyringController', async () => {
    const { adapter, agentSign, call } = buildKeyringAdapter();

    const signature = await adapter.signTypedData(L1_PAYLOAD);

    expect(signature).toBe(AGENT_SIGNATURE);
    expect(agentSign.mock.calls).toStrictEqual([[L1_PAYLOAD]]);
    expect(keyringCalls(call)).toStrictEqual([]);
  });

  it('signs user-signed actions through KeyringController:signTypedMessage V4', async () => {
    const { adapter, agentSign, call } = buildKeyringAdapter();

    const signature = await adapter.signTypedData(USER_SIGNED_PAYLOAD);

    expect(signature).toBe('0xSignatureResult');
    expect(agentSign).not.toHaveBeenCalled();
    expect(call).toHaveBeenCalledWith(
      'KeyringController:signTypedMessage',
      { from: mainAddress, data: USER_SIGNED_PAYLOAD },
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
          signatureChainId: ARBITRUM_SEPOLIA_CHAIN_ID,
          hyperliquidChain: 'Testnet',
          maxFeeRate: BUILDER_FEE_CONFIG.MaxFeeRate,
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
