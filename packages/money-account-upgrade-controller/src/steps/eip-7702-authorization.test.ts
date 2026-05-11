import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import type { Hex } from '@metamask/utils';

import type { MoneyAccountUpgradeControllerMessenger } from '../MoneyAccountUpgradeController';
import { eip7702AuthorizationStep } from './eip-7702-authorization';

const MOCK_ADDRESS = '0xabcdef1234567890abcdef1234567890abcdef12' as Hex;
const MOCK_CHAIN_ID = '0xaa36a7' as Hex; // 11155111 (Sepolia) — non-trivial decimal
const MOCK_CHAIN_ID_DECIMAL = parseInt(MOCK_CHAIN_ID, 16);
const MOCK_DELEGATOR_IMPL = '0x2222222222222222222222222222222222222222' as Hex;
const MOCK_THIRD_PARTY_IMPL =
  '0x9999999999999999999999999999999999999999' as Hex;
const MOCK_NETWORK_CLIENT_ID = 'network-client-id';
const MOCK_NONCE_HEX = '0x7';
const MOCK_NONCE = 7;

const PLAIN_EOA_CODE = '0x';
const delegationCode = (impl: Hex): Hex =>
  `0xef0100${impl.slice(2).toLowerCase()}` as Hex;

// 65-byte signature: r (32) + s (32) + v (1). v = 28 → yParity = 1.
const MOCK_R =
  '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex;
const MOCK_S_NO_PREFIX =
  '2222222222222222222222222222222222222222222222222222222222222222';
const MOCK_S = `0x${MOCK_S_NO_PREFIX}` as Hex;
const MOCK_V_HEX = '1c'; // 28
const MOCK_SIGNATURE = `${MOCK_R}${MOCK_S_NO_PREFIX}${MOCK_V_HEX}` as Hex;

type AllActions = MessengerActions<MoneyAccountUpgradeControllerMessenger>;
type AllEvents = MessengerEvents<MoneyAccountUpgradeControllerMessenger>;

type ProviderRequest = (args: {
  method: string;
  params: unknown[];
}) => Promise<unknown>;

type Mocks = {
  createUpgrade: jest.Mock;
  signEip7702Authorization: jest.Mock;
  findNetworkClientIdByChainId: jest.Mock;
  getNetworkClientById: jest.Mock;
  providerRequest: jest.Mock<
    ReturnType<ProviderRequest>,
    [Parameters<ProviderRequest>[0]]
  >;
};

/**
 * Configures the provider mock so that `eth_getCode` returns the given code
 * and `eth_getTransactionCount` returns `MOCK_NONCE_HEX`. Other methods throw.
 *
 * @param mocks - The mocks bag from `setup`.
 * @param code - The code to return for `eth_getCode`.
 */
function configureProvider(mocks: Mocks, code: Hex = PLAIN_EOA_CODE): void {
  mocks.providerRequest.mockImplementation(async ({ method }) => {
    if (method === 'eth_getCode') {
      return code;
    }
    if (method === 'eth_getTransactionCount') {
      return MOCK_NONCE_HEX;
    }
    throw new Error(`Unexpected RPC method: ${method}`);
  });
}

function setup(): {
  messenger: MoneyAccountUpgradeControllerMessenger;
  mocks: Mocks;
} {
  const providerRequest = jest.fn() as Mocks['providerRequest'];

  const mocks: Mocks = {
    createUpgrade: jest.fn().mockResolvedValue({
      signerAddress: MOCK_ADDRESS,
      address: MOCK_DELEGATOR_IMPL,
      chainId: MOCK_CHAIN_ID,
      nonce: MOCK_NONCE_HEX,
      status: 'pending',
      createdAt: '2026-04-21T12:00:00.000Z',
    }),
    signEip7702Authorization: jest.fn().mockResolvedValue(MOCK_SIGNATURE),
    findNetworkClientIdByChainId: jest
      .fn()
      .mockReturnValue(MOCK_NETWORK_CLIENT_ID),
    getNetworkClientById: jest.fn().mockReturnValue({
      provider: { request: providerRequest },
    }),
    providerRequest,
  };

  configureProvider(mocks);

  const rootMessenger = new Messenger<MockAnyNamespace, AllActions, AllEvents>({
    namespace: MOCK_ANY_NAMESPACE,
  });
  rootMessenger.registerActionHandler(
    'ChompApiService:createUpgrade',
    mocks.createUpgrade,
  );
  rootMessenger.registerActionHandler(
    'KeyringController:signEip7702Authorization',
    mocks.signEip7702Authorization,
  );
  rootMessenger.registerActionHandler(
    'NetworkController:findNetworkClientIdByChainId',
    mocks.findNetworkClientIdByChainId,
  );
  rootMessenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    mocks.getNetworkClientById,
  );

  const messenger: MoneyAccountUpgradeControllerMessenger = new Messenger({
    namespace: 'MoneyAccountUpgradeController',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    actions: [
      'ChompApiService:createUpgrade',
      'KeyringController:signEip7702Authorization',
      'NetworkController:findNetworkClientIdByChainId',
      'NetworkController:getNetworkClientById',
    ],
    events: [],
    messenger,
  });

  return { messenger, mocks };
}

async function run(
  messenger: MoneyAccountUpgradeControllerMessenger,
): ReturnType<typeof eip7702AuthorizationStep.run> {
  return eip7702AuthorizationStep.run({
    messenger,
    address: MOCK_ADDRESS,
    chainId: MOCK_CHAIN_ID,
    delegatorImplAddress: MOCK_DELEGATOR_IMPL,
  });
}

describe('eip7702AuthorizationStep', () => {
  it('is named "eip-7702-authorization"', () => {
    expect(eip7702AuthorizationStep.name).toBe('eip-7702-authorization');
  });

  describe('when the account is already delegated to the configured impl', () => {
    it('returns "already-done" and does not sign or submit', async () => {
      const { messenger, mocks } = setup();
      configureProvider(mocks, delegationCode(MOCK_DELEGATOR_IMPL));

      const result = await run(messenger);

      expect(result).toBe('already-done');
      expect(mocks.signEip7702Authorization).not.toHaveBeenCalled();
      expect(mocks.createUpgrade).not.toHaveBeenCalled();
    });

    it('matches the configured impl case-insensitively', async () => {
      const { messenger, mocks } = setup();
      configureProvider(
        mocks,
        `0xef0100${MOCK_DELEGATOR_IMPL.slice(2).toUpperCase()}` as Hex,
      );

      const result = await run(messenger);

      expect(result).toBe('already-done');
    });
  });

  describe('when the account is delegated to a different impl', () => {
    it('throws and does not sign or submit', async () => {
      const { messenger, mocks } = setup();
      configureProvider(mocks, delegationCode(MOCK_THIRD_PARTY_IMPL));

      await expect(run(messenger)).rejects.toThrow(
        `Account ${MOCK_ADDRESS} is already upgraded to another smart account: ${MOCK_THIRD_PARTY_IMPL}.`,
      );
      expect(mocks.signEip7702Authorization).not.toHaveBeenCalled();
      expect(mocks.createUpgrade).not.toHaveBeenCalled();
    });
  });

  describe('when the account has unexpected non-delegation code', () => {
    it('throws without signing or submitting', async () => {
      const { messenger, mocks } = setup();
      // A regular contract — not a 7702 delegation.
      configureProvider(mocks, '0x6080604052' as Hex);

      await expect(run(messenger)).rejects.toThrow(
        `Account ${MOCK_ADDRESS} has unexpected on-chain code; expected either no code or an EIP-7702 delegation.`,
      );
      expect(mocks.signEip7702Authorization).not.toHaveBeenCalled();
      expect(mocks.createUpgrade).not.toHaveBeenCalled();
    });

    it('throws when eth_getCode returns a non-hex value', async () => {
      const { messenger, mocks } = setup();
      mocks.providerRequest.mockImplementation(async ({ method }) => {
        if (method === 'eth_getCode') {
          return null;
        }
        return MOCK_NONCE_HEX;
      });

      await expect(run(messenger)).rejects.toThrow(
        'Expected 0x-prefixed hex string from eth_getCode, got null',
      );
    });
  });

  describe('when the account is a plain EOA', () => {
    it('resolves the network client for the target chain', async () => {
      const { messenger, mocks } = setup();

      await run(messenger);

      expect(mocks.findNetworkClientIdByChainId).toHaveBeenCalledWith(
        MOCK_CHAIN_ID,
      );
      expect(mocks.getNetworkClientById).toHaveBeenCalledWith(
        MOCK_NETWORK_CLIENT_ID,
      );
    });

    it('reads the on-chain code and nonce for the address', async () => {
      const { messenger, mocks } = setup();

      await run(messenger);

      expect(mocks.providerRequest).toHaveBeenCalledWith({
        method: 'eth_getCode',
        params: [MOCK_ADDRESS, 'latest'],
      });
      expect(mocks.providerRequest).toHaveBeenCalledWith({
        method: 'eth_getTransactionCount',
        params: [MOCK_ADDRESS, 'latest'],
      });
    });

    it('signs the authorization against the configured delegatorImplAddress', async () => {
      const { messenger, mocks } = setup();

      await run(messenger);

      expect(mocks.signEip7702Authorization).toHaveBeenCalledWith({
        chainId: MOCK_CHAIN_ID_DECIMAL,
        contractAddress: MOCK_DELEGATOR_IMPL,
        nonce: MOCK_NONCE,
        from: MOCK_ADDRESS,
      });
    });

    it('submits the split signature, delegator impl address, and hex-formatted chainId/nonce to CHOMP', async () => {
      const { messenger, mocks } = setup();

      await run(messenger);

      expect(mocks.createUpgrade).toHaveBeenCalledWith({
        r: MOCK_R,
        s: MOCK_S,
        v: 28,
        yParity: 1,
        address: MOCK_DELEGATOR_IMPL,
        chainId: MOCK_CHAIN_ID,
        nonce: MOCK_NONCE_HEX,
      });
    });

    it('returns "completed" on success', async () => {
      const { messenger } = setup();

      const result = await run(messenger);

      expect(result).toBe('completed');
    });

    it('encodes yParity as 0 when v is 27', async () => {
      const { messenger, mocks } = setup();
      const sigWithV27 = `${MOCK_R}${MOCK_S_NO_PREFIX}1b` as Hex;
      mocks.signEip7702Authorization.mockResolvedValue(sigWithV27);

      await run(messenger);

      expect(mocks.createUpgrade).toHaveBeenCalledWith(
        expect.objectContaining({ v: 27, yParity: 0 }),
      );
    });

    it('propagates errors from signing and does not submit to CHOMP', async () => {
      const { messenger, mocks } = setup();
      mocks.signEip7702Authorization.mockRejectedValue(
        new Error('signing failed'),
      );

      await expect(run(messenger)).rejects.toThrow('signing failed');
      expect(mocks.createUpgrade).not.toHaveBeenCalled();
    });

    it('propagates errors from createUpgrade', async () => {
      const { messenger, mocks } = setup();
      mocks.createUpgrade.mockRejectedValue(new Error('api failed'));

      await expect(run(messenger)).rejects.toThrow('api failed');
    });

    it('throws when eth_getTransactionCount returns a non-hex response', async () => {
      const { messenger, mocks } = setup();
      mocks.providerRequest.mockImplementation(async ({ method }) => {
        if (method === 'eth_getCode') {
          return PLAIN_EOA_CODE;
        }
        return null;
      });

      await expect(run(messenger)).rejects.toThrow(
        'Expected hex string from eth_getTransactionCount, got null',
      );
      expect(mocks.signEip7702Authorization).not.toHaveBeenCalled();
    });

    it.each([
      ['a non-hex string', 'not-a-hex-string'],
      ['a truncated hex string', `${MOCK_R}${MOCK_S_NO_PREFIX}`],
      [
        'an over-long hex string',
        `${MOCK_R}${MOCK_S_NO_PREFIX}${MOCK_V_HEX}00`,
      ],
      ['null', null],
    ])(
      'throws when signEip7702Authorization returns %s',
      async (_label, value) => {
        const { messenger, mocks } = setup();
        mocks.signEip7702Authorization.mockResolvedValue(value);

        await expect(run(messenger)).rejects.toThrow(
          /Expected a 0x-prefixed 65-byte signature from signEip7702Authorization/u,
        );
        expect(mocks.createUpgrade).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['0', '00'],
      ['1', '01'],
      ['26', '1a'],
      ['29', '1d'],
    ])('throws when v is %s rather than 27 or 28', async (vDecimal, vHex) => {
      const { messenger, mocks } = setup();
      mocks.signEip7702Authorization.mockResolvedValue(
        `${MOCK_R}${MOCK_S_NO_PREFIX}${vHex}`,
      );

      await expect(run(messenger)).rejects.toThrow(
        `Expected v to be 27 or 28 in signEip7702Authorization signature, got ${vDecimal}`,
      );
      expect(mocks.createUpgrade).not.toHaveBeenCalled();
    });

    it('accepts an uppercase signature and normalizes it to lowercase', async () => {
      const { messenger, mocks } = setup();
      const upperR = MOCK_R.toUpperCase().replace('0X', '0x');
      const upperS = MOCK_S_NO_PREFIX.toUpperCase();
      mocks.signEip7702Authorization.mockResolvedValue(
        `${upperR}${upperS}${MOCK_V_HEX.toUpperCase()}`,
      );

      await run(messenger);

      expect(mocks.createUpgrade).toHaveBeenCalledWith(
        expect.objectContaining({
          r: MOCK_R,
          s: MOCK_S,
          v: 28,
          yParity: 1,
        }),
      );
    });
  });
});
