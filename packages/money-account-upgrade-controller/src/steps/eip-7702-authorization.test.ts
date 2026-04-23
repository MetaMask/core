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
const MOCK_NETWORK_CLIENT_ID = 'network-client-id';
const MOCK_NONCE_HEX = '0x7';
const MOCK_NONCE = 7;

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

type Mocks = {
  getUpgrade: jest.Mock;
  createUpgrade: jest.Mock;
  signEip7702Authorization: jest.Mock;
  findNetworkClientIdByChainId: jest.Mock;
  getNetworkClientById: jest.Mock;
  providerRequest: jest.Mock;
};

function setup(): {
  messenger: MoneyAccountUpgradeControllerMessenger;
  mocks: Mocks;
} {
  const providerRequest = jest.fn().mockResolvedValue(MOCK_NONCE_HEX);

  const mocks: Mocks = {
    getUpgrade: jest.fn().mockResolvedValue(null),
    createUpgrade: jest.fn().mockResolvedValue({
      signerAddress: MOCK_ADDRESS,
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

  const rootMessenger = new Messenger<MockAnyNamespace, AllActions, AllEvents>({
    namespace: MOCK_ANY_NAMESPACE,
  });
  rootMessenger.registerActionHandler(
    'ChompApiService:getUpgrade',
    mocks.getUpgrade,
  );
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
      'ChompApiService:getUpgrade',
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

  describe('when CHOMP already has an upgrade record for the address', () => {
    it('returns "already-done" and does not sign or submit', async () => {
      const { messenger, mocks } = setup();
      mocks.getUpgrade.mockResolvedValue({
        signerAddress: MOCK_ADDRESS,
        status: 'upgraded',
        createdAt: '2026-04-20T12:00:00.000Z',
      });

      const result = await run(messenger);

      expect(result).toBe('already-done');
      expect(mocks.providerRequest).not.toHaveBeenCalled();
      expect(mocks.signEip7702Authorization).not.toHaveBeenCalled();
      expect(mocks.createUpgrade).not.toHaveBeenCalled();
    });

    it('treats "pending" as already-done', async () => {
      const { messenger, mocks } = setup();
      mocks.getUpgrade.mockResolvedValue({
        signerAddress: MOCK_ADDRESS,
        status: 'pending',
        createdAt: '2026-04-20T12:00:00.000Z',
      });

      const result = await run(messenger);

      expect(result).toBe('already-done');
      expect(mocks.createUpgrade).not.toHaveBeenCalled();
    });
  });

  describe('when no upgrade record exists', () => {
    it('fetches the on-chain nonce for the address on the target chain', async () => {
      const { messenger, mocks } = setup();

      await run(messenger);

      expect(mocks.findNetworkClientIdByChainId).toHaveBeenCalledWith(
        MOCK_CHAIN_ID,
      );
      expect(mocks.getNetworkClientById).toHaveBeenCalledWith(
        MOCK_NETWORK_CLIENT_ID,
      );
      expect(mocks.providerRequest).toHaveBeenCalledWith({
        method: 'eth_getTransactionCount',
        params: [MOCK_ADDRESS, 'latest'],
      });
    });

    it('signs the EIP-7702 authorization with decoded chainId, delegator impl, and nonce', async () => {
      const { messenger, mocks } = setup();

      await run(messenger);

      expect(mocks.signEip7702Authorization).toHaveBeenCalledWith({
        chainId: MOCK_CHAIN_ID_DECIMAL,
        contractAddress: MOCK_DELEGATOR_IMPL,
        nonce: MOCK_NONCE,
        from: MOCK_ADDRESS,
      });
    });

    it('submits the split signature and decimal-string chainId/nonce to CHOMP', async () => {
      const { messenger, mocks } = setup();

      await run(messenger);

      expect(mocks.createUpgrade).toHaveBeenCalledWith({
        r: MOCK_R,
        s: MOCK_S,
        v: 28,
        yParity: 1,
        address: MOCK_ADDRESS,
        chainId: MOCK_CHAIN_ID_DECIMAL.toString(),
        nonce: MOCK_NONCE.toString(),
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
      mocks.providerRequest.mockResolvedValue(null);

      await expect(run(messenger)).rejects.toThrow(
        'Expected hex string from eth_getTransactionCount, got null',
      );
      expect(mocks.signEip7702Authorization).not.toHaveBeenCalled();
    });
  });
});
