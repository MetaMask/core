import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import type { Hex } from '@metamask/utils';

import type { MoneyAccountUpgradeControllerMessenger } from '.';
import {
  MoneyAccountUpgradeController,
  getDefaultMoneyAccountUpgradeControllerState,
} from '.';
import type { UpgradeConfig } from './types';

const MOCK_ADDRESS = '0xabcdef1234567890abcdef1234567890abcdef12' as Hex;
const MOCK_CHAIN_ID = '0x1' as Hex;
const MOCK_SIGNATURE =
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' +
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' +
  '1b';
const MOCK_DELEGATION_SIGNATURE = '0xdeadbeef' as Hex;
const MOCK_DELEGATION_HASH = '0xabcdef1234567890';

const MOCK_CONFIG: UpgradeConfig = {
  delegateAddress: '0x1111111111111111111111111111111111111111' as Hex,
  delegatorImplAddress: '0x2222222222222222222222222222222222222222' as Hex,
  musdTokenAddress: '0x3333333333333333333333333333333333333333' as Hex,
  vedaVaultAdapterAddress: '0x4444444444444444444444444444444444444444' as Hex,
  erc20TransferAmountEnforcer:
    '0x5555555555555555555555555555555555555555' as Hex,
  redeemerEnforcer: '0x6666666666666666666666666666666666666666' as Hex,
  valueLteEnforcer: '0x7777777777777777777777777777777777777777' as Hex,
};

type AllActions = MessengerActions<MoneyAccountUpgradeControllerMessenger>;

type AllEvents = MessengerEvents<MoneyAccountUpgradeControllerMessenger>;

type RootMessenger = Messenger<MockAnyNamespace, AllActions, AllEvents>;

type Mocks = {
  signPersonalMessage: jest.Mock;
  signEip7702Authorization: jest.Mock;
  associateAddress: jest.Mock;
  createUpgrade: jest.Mock;
  getUpgrade: jest.Mock;
  verifyDelegation: jest.Mock;
  createIntents: jest.Mock;
  signDelegation: jest.Mock;
  getMoneyAccount: jest.Mock;
};

function setup({
  state,
}: {
  state?: Partial<
    ReturnType<typeof getDefaultMoneyAccountUpgradeControllerState>
  >;
} = {}): {
  controller: MoneyAccountUpgradeController;
  rootMessenger: RootMessenger;
  messenger: MoneyAccountUpgradeControllerMessenger;
  mocks: Mocks;
} {
  const mocks: Mocks = {
    signPersonalMessage: jest.fn().mockResolvedValue(MOCK_SIGNATURE),
    signEip7702Authorization: jest.fn().mockResolvedValue(MOCK_SIGNATURE),
    associateAddress: jest.fn().mockResolvedValue({
      profileId: 'profile-1',
      address: MOCK_ADDRESS,
      status: 'created',
    }),
    createUpgrade: jest.fn().mockResolvedValue({
      signerAddress: MOCK_ADDRESS,
      status: 'created',
      createdAt: '2026-04-10T00:00:00Z',
    }),
    getUpgrade: jest.fn().mockResolvedValue(null),
    verifyDelegation: jest.fn().mockResolvedValue({
      valid: true,
      delegationHash: MOCK_DELEGATION_HASH,
    }),
    createIntents: jest.fn().mockResolvedValue([]),
    signDelegation: jest.fn().mockResolvedValue(MOCK_DELEGATION_SIGNATURE),
    getMoneyAccount: jest.fn().mockReturnValue({
      id: 'account-1',
      address: MOCK_ADDRESS,
    }),
  };

  const rootMessenger = new Messenger<MockAnyNamespace, AllActions, AllEvents>({
    namespace: MOCK_ANY_NAMESPACE,
  });

  rootMessenger.registerActionHandler(
    'KeyringController:signPersonalMessage',
    mocks.signPersonalMessage,
  );
  rootMessenger.registerActionHandler(
    'KeyringController:signEip7702Authorization',
    mocks.signEip7702Authorization,
  );
  rootMessenger.registerActionHandler(
    'ChompApiService:associateAddress',
    mocks.associateAddress,
  );
  rootMessenger.registerActionHandler(
    'ChompApiService:createUpgrade',
    mocks.createUpgrade,
  );
  rootMessenger.registerActionHandler(
    'ChompApiService:getUpgrade',
    mocks.getUpgrade,
  );
  rootMessenger.registerActionHandler(
    'ChompApiService:verifyDelegation',
    mocks.verifyDelegation,
  );
  rootMessenger.registerActionHandler(
    'ChompApiService:createIntents',
    mocks.createIntents,
  );
  rootMessenger.registerActionHandler(
    'DelegationController:signDelegation',
    mocks.signDelegation,
  );
  rootMessenger.registerActionHandler(
    'MoneyAccountController:getMoneyAccount',
    mocks.getMoneyAccount,
  );

  const messenger: MoneyAccountUpgradeControllerMessenger = new Messenger({
    namespace: 'MoneyAccountUpgradeController',
    parent: rootMessenger,
  });

  rootMessenger.delegate({
    actions: [
      'KeyringController:signPersonalMessage',
      'KeyringController:signEip7702Authorization',
      'ChompApiService:associateAddress',
      'ChompApiService:createUpgrade',
      'ChompApiService:getUpgrade',
      'ChompApiService:verifyDelegation',
      'ChompApiService:createIntents',
      'DelegationController:signDelegation',
      'MoneyAccountController:getMoneyAccount',
    ],
    events: [],
    messenger,
  });

  const controller = new MoneyAccountUpgradeController({
    messenger,
    state,
    config: MOCK_CONFIG,
  });

  return { controller, rootMessenger, messenger, mocks };
}

describe('MoneyAccountUpgradeController', () => {
  describe('constructor', () => {
    it('initializes with default state when no state is provided', () => {
      const { controller } = setup();

      expect(controller.state).toStrictEqual(
        getDefaultMoneyAccountUpgradeControllerState(),
      );
    });

    it('accepts initial state', () => {
      const { controller } = setup({
        state: {
          upgrades: {
            [MOCK_ADDRESS]: {
              step: 'associate-address',
              chainId: MOCK_CHAIN_ID,
            },
          },
        },
      });

      expect(controller.state.upgrades[MOCK_ADDRESS]).toStrictEqual({
        step: 'associate-address',
        chainId: MOCK_CHAIN_ID,
      });
    });
  });

  describe('upgradeAccount', () => {
    it('runs the full upgrade sequence', async () => {
      const { controller, mocks } = setup();

      await controller.upgradeAccount(MOCK_ADDRESS, MOCK_CHAIN_ID);

      expect(mocks.signPersonalMessage).toHaveBeenCalledTimes(1);
      expect(mocks.associateAddress).toHaveBeenCalledTimes(1);
      expect(mocks.getUpgrade).toHaveBeenCalledTimes(1);
      expect(mocks.signEip7702Authorization).toHaveBeenCalledTimes(1);
      expect(mocks.createUpgrade).toHaveBeenCalledTimes(1);
      expect(mocks.signDelegation).toHaveBeenCalledTimes(1);
      expect(mocks.verifyDelegation).toHaveBeenCalledTimes(1);
      expect(mocks.createIntents).toHaveBeenCalledTimes(1);
    });

    it('records final state as register-intents with delegationHash', async () => {
      const { controller } = setup();

      await controller.upgradeAccount(MOCK_ADDRESS, MOCK_CHAIN_ID);

      expect(controller.state.upgrades[MOCK_ADDRESS]).toStrictEqual({
        step: 'register-intents',
        chainId: MOCK_CHAIN_ID,
        delegationHash: MOCK_DELEGATION_HASH,
      });
    });

    it('is callable via the messenger', async () => {
      const { rootMessenger } = setup();

      expect(
        await rootMessenger.call(
          'MoneyAccountUpgradeController:upgradeAccount',
          MOCK_ADDRESS,
          MOCK_CHAIN_ID,
        ),
      ).toBeUndefined();
    });
  });

  describe('step 0: associate address', () => {
    it('signs the authentication message and submits to CHOMP', async () => {
      const { controller, mocks } = setup();

      await controller.upgradeAccount(MOCK_ADDRESS, MOCK_CHAIN_ID);

      expect(mocks.signPersonalMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.stringMatching(/^CHOMP Authentication \d+$/u),
          from: MOCK_ADDRESS,
        }),
      );

      expect(mocks.associateAddress).toHaveBeenCalledWith(
        expect.objectContaining({
          signature: MOCK_SIGNATURE,
          address: MOCK_ADDRESS,
          timestamp: expect.stringMatching(/^\d+$/u),
        }),
      );
    });

    it('updates state to associate-address after completion', async () => {
      const { controller, mocks } = setup();

      // Make subsequent steps fail so we can check state after step 0.
      mocks.getUpgrade.mockRejectedValue(new Error('stop'));

      await expect(
        controller.upgradeAccount(MOCK_ADDRESS, MOCK_CHAIN_ID),
      ).rejects.toThrow('stop');

      expect(controller.state.upgrades[MOCK_ADDRESS]?.step).toBe(
        'associate-address',
      );
    });
  });

  describe('step 1: submit authorization', () => {
    it('skips signing when CHOMP already has an upgrade record', async () => {
      const { controller, mocks } = setup();

      mocks.getUpgrade.mockResolvedValue({
        signerAddress: MOCK_ADDRESS,
        status: 'upgraded',
        createdAt: '2026-04-09T00:00:00Z',
      });

      await controller.upgradeAccount(MOCK_ADDRESS, MOCK_CHAIN_ID);

      expect(mocks.signEip7702Authorization).not.toHaveBeenCalled();
      expect(mocks.createUpgrade).not.toHaveBeenCalled();
    });

    it('signs and submits an EIP-7702 authorization', async () => {
      const { controller, mocks } = setup();

      await controller.upgradeAccount(MOCK_ADDRESS, MOCK_CHAIN_ID);

      expect(mocks.signEip7702Authorization).toHaveBeenCalledWith({
        chainId: 1,
        contractAddress: MOCK_CONFIG.delegatorImplAddress,
        nonce: 0,
        from: MOCK_ADDRESS,
      });

      expect(mocks.createUpgrade).toHaveBeenCalledWith(
        expect.objectContaining({
          address: MOCK_ADDRESS,
          chainId: MOCK_CHAIN_ID,
        }),
      );
    });

    it('computes yParity=1 when v is 28', async () => {
      const { controller, mocks } = setup();

      const sigWithV28 =
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' +
        'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' +
        '1c';
      mocks.signEip7702Authorization.mockResolvedValue(sigWithV28);

      await controller.upgradeAccount(MOCK_ADDRESS, MOCK_CHAIN_ID);

      expect(mocks.createUpgrade).toHaveBeenCalledWith(
        expect.objectContaining({
          v: 28,
          yParity: 1,
        }),
      );
    });

    it('parses signature components correctly', async () => {
      const { controller, mocks } = setup();

      await controller.upgradeAccount(MOCK_ADDRESS, MOCK_CHAIN_ID);

      expect(mocks.createUpgrade).toHaveBeenCalledWith(
        expect.objectContaining({
          // r = first 66 chars (0x + 64 hex chars)
          r: MOCK_SIGNATURE.slice(0, 66),
          // s = 0x + next 64 hex chars
          s: `0x${MOCK_SIGNATURE.slice(66, 130)}`,
          // v = last 2 hex chars parsed as int
          v: parseInt(MOCK_SIGNATURE.slice(130, 132), 16),
          // yParity derived from v
          yParity:
            parseInt(MOCK_SIGNATURE.slice(130, 132), 16) - 27 === 0 ? 0 : 1,
        }),
      );
    });
  });

  describe('step 2: verify delegation', () => {
    it('builds a delegation with three caveats and verifies with CHOMP', async () => {
      const { controller, mocks } = setup();

      await controller.upgradeAccount(MOCK_ADDRESS, MOCK_CHAIN_ID);

      expect(mocks.signDelegation).toHaveBeenCalledWith({
        delegation: expect.objectContaining({
          delegate: MOCK_CONFIG.delegateAddress,
          delegator: MOCK_ADDRESS,
          caveats: expect.arrayContaining([
            expect.objectContaining({
              enforcer: MOCK_CONFIG.erc20TransferAmountEnforcer,
            }),
            expect.objectContaining({
              enforcer: MOCK_CONFIG.redeemerEnforcer,
            }),
            expect.objectContaining({
              enforcer: MOCK_CONFIG.valueLteEnforcer,
            }),
          ]),
        }),
        chainId: MOCK_CHAIN_ID,
      });

      expect(mocks.verifyDelegation).toHaveBeenCalledWith(
        expect.objectContaining({
          signedDelegation: expect.objectContaining({
            delegate: MOCK_CONFIG.delegateAddress,
            delegator: MOCK_ADDRESS,
            signature: MOCK_DELEGATION_SIGNATURE,
          }),
          chainId: MOCK_CHAIN_ID,
        }),
      );
    });

    it('includes exactly three caveats', async () => {
      const { controller, mocks } = setup();

      await controller.upgradeAccount(MOCK_ADDRESS, MOCK_CHAIN_ID);

      const { delegation } = mocks.signDelegation.mock.calls[0][0];
      expect(delegation.caveats).toHaveLength(3);
    });

    it('throws when delegation verification fails', async () => {
      const { controller, mocks } = setup();

      mocks.verifyDelegation.mockResolvedValue({
        valid: false,
        errors: ['delegate mismatch'],
      });

      await expect(
        controller.upgradeAccount(MOCK_ADDRESS, MOCK_CHAIN_ID),
      ).rejects.toThrow('Delegation verification failed: delegate mismatch');
    });

    it('throws with unknown error when verification fails without error details', async () => {
      const { controller, mocks } = setup();

      mocks.verifyDelegation.mockResolvedValue({
        valid: false,
      });

      await expect(
        controller.upgradeAccount(MOCK_ADDRESS, MOCK_CHAIN_ID),
      ).rejects.toThrow('Delegation verification failed: unknown error');
    });

    it('stores delegationHash in state after successful verification', async () => {
      const { controller } = setup();

      await controller.upgradeAccount(MOCK_ADDRESS, MOCK_CHAIN_ID);

      expect(controller.state.upgrades[MOCK_ADDRESS]?.delegationHash).toBe(
        MOCK_DELEGATION_HASH,
      );
    });
  });

  describe('step 3: save delegation (stub)', () => {
    it('updates state to save-delegation', async () => {
      const { controller, mocks } = setup();

      // Make step 4 fail so we can check state after step 3.
      mocks.createIntents.mockRejectedValue(new Error('stop'));

      await expect(
        controller.upgradeAccount(MOCK_ADDRESS, MOCK_CHAIN_ID),
      ).rejects.toThrow('stop');

      expect(controller.state.upgrades[MOCK_ADDRESS]?.step).toBe(
        'save-delegation',
      );
    });
  });

  describe('step 4: register intents', () => {
    it('submits deposit and withdrawal intents', async () => {
      const { controller, mocks } = setup();

      await controller.upgradeAccount(MOCK_ADDRESS, MOCK_CHAIN_ID);

      expect(mocks.createIntents).toHaveBeenCalledWith([
        expect.objectContaining({
          account: MOCK_ADDRESS,
          delegationHash: MOCK_DELEGATION_HASH,
          chainId: MOCK_CHAIN_ID,
          metadata: expect.objectContaining({ type: 'cash-deposit' }),
        }),
        expect.objectContaining({
          account: MOCK_ADDRESS,
          delegationHash: MOCK_DELEGATION_HASH,
          chainId: MOCK_CHAIN_ID,
          metadata: expect.objectContaining({ type: 'cash-withdrawal' }),
        }),
      ]);
    });

    it('throws if delegationHash is missing', async () => {
      const { controller, mocks } = setup();

      // Skip the verify step by making it not store a hash
      mocks.verifyDelegation.mockResolvedValue({
        valid: true,
        // No delegationHash returned
      });

      await expect(
        controller.upgradeAccount(MOCK_ADDRESS, MOCK_CHAIN_ID),
      ).rejects.toThrow('Cannot register intents: no delegationHash found');
    });
  });

  describe('error propagation', () => {
    it('propagates signing errors', async () => {
      const { controller, mocks } = setup();

      mocks.signPersonalMessage.mockRejectedValue(new Error('signing failed'));

      await expect(
        controller.upgradeAccount(MOCK_ADDRESS, MOCK_CHAIN_ID),
      ).rejects.toThrow('signing failed');
    });

    it('propagates CHOMP API errors', async () => {
      const { controller, mocks } = setup();

      mocks.associateAddress.mockRejectedValue(
        new Error("POST /v1/auth/address failed with status '500'"),
      );

      await expect(
        controller.upgradeAccount(MOCK_ADDRESS, MOCK_CHAIN_ID),
      ).rejects.toThrow("POST /v1/auth/address failed with status '500'");
    });
  });
});
