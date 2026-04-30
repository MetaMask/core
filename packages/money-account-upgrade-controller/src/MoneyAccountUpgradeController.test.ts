import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import type { Hex } from '@metamask/utils';

import type { MoneyAccountUpgradeControllerMessenger } from '.';
import { MoneyAccountUpgradeController } from '.';
import type { UpgradeConfig } from './types';

const MOCK_CHAIN_ID = '0x1' as Hex;
const MOCK_ACCOUNT_ADDRESS =
  '0xabcdef1234567890abcdef1234567890abcdef12' as Hex;

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

const MOCK_INIT_CONFIG = {
  delegatorImplAddress: MOCK_CONFIG.delegatorImplAddress,
  musdTokenAddress: MOCK_CONFIG.musdTokenAddress,
  redeemerEnforcer: MOCK_CONFIG.redeemerEnforcer,
  valueLteEnforcer: MOCK_CONFIG.valueLteEnforcer,
};

const MOCK_SERVICE_DETAILS_RESPONSE = {
  auth: { message: 'CHOMP Authentication' },
  chains: {
    [MOCK_CHAIN_ID]: {
      autoDepositDelegate: MOCK_CONFIG.delegateAddress,
      protocol: {
        vedaProtocol: {
          supportedTokens: [
            {
              tokenAddress: MOCK_CONFIG.erc20TransferAmountEnforcer,
              tokenDecimals: 18,
            },
          ],
          adapterAddress: MOCK_CONFIG.vedaVaultAdapterAddress,
          intentTypes: ['cash-deposit', 'cash-withdrawal'] as const,
        },
      },
    },
  },
};

type AllActions = MessengerActions<MoneyAccountUpgradeControllerMessenger>;

type AllEvents = MessengerEvents<MoneyAccountUpgradeControllerMessenger>;

type RootMessenger = Messenger<MockAnyNamespace, AllActions, AllEvents>;

type Mocks = {
  getServiceDetails: jest.Mock;
  signPersonalMessage: jest.Mock;
  associateAddress: jest.Mock;
  createUpgrade: jest.Mock;
  signEip7702Authorization: jest.Mock;
  findNetworkClientIdByChainId: jest.Mock;
  getNetworkClientById: jest.Mock;
  providerRequest: jest.Mock;
};

function setup(): {
  controller: MoneyAccountUpgradeController;
  rootMessenger: RootMessenger;
  messenger: MoneyAccountUpgradeControllerMessenger;
  mocks: Mocks;
} {
  // 65-byte signature — r (32 bytes) + s (32 bytes) + v = 0x1c (28).
  const signature = `0x${'1'.repeat(64)}${'2'.repeat(64)}1c`;

  // Default provider responses: account is a plain EOA with nonce 0.
  const providerRequest = jest
    .fn()
    .mockImplementation(async ({ method }: { method: string }) => {
      if (method === 'eth_getCode') {
        return '0x';
      }
      if (method === 'eth_getTransactionCount') {
        return '0x0';
      }
      throw new Error(`Unexpected RPC method: ${method}`);
    });

  const mocks: Mocks = {
    getServiceDetails: jest
      .fn()
      .mockResolvedValue(MOCK_SERVICE_DETAILS_RESPONSE),
    signPersonalMessage: jest.fn().mockResolvedValue('0xdeadbeef'),
    associateAddress: jest.fn().mockResolvedValue({
      profileId: 'profile-1',
      address: MOCK_ACCOUNT_ADDRESS,
      status: 'created',
    }),
    createUpgrade: jest.fn().mockResolvedValue({
      signerAddress: MOCK_ACCOUNT_ADDRESS,
      address: MOCK_CONFIG.delegatorImplAddress,
      chainId: MOCK_CHAIN_ID,
      nonce: '0x0',
      status: 'pending',
      createdAt: '2026-04-21T12:00:00.000Z',
    }),
    signEip7702Authorization: jest.fn().mockResolvedValue(signature),
    findNetworkClientIdByChainId: jest
      .fn()
      .mockReturnValue('network-client-id'),
    getNetworkClientById: jest.fn().mockReturnValue({
      provider: { request: providerRequest },
    }),
    providerRequest,
  };

  const rootMessenger = new Messenger<MockAnyNamespace, AllActions, AllEvents>({
    namespace: MOCK_ANY_NAMESPACE,
  });

  rootMessenger.registerActionHandler(
    'ChompApiService:getServiceDetails',
    mocks.getServiceDetails,
  );
  rootMessenger.registerActionHandler(
    'KeyringController:signPersonalMessage',
    mocks.signPersonalMessage,
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
      'ChompApiService:getServiceDetails',
      'KeyringController:signPersonalMessage',
      'ChompApiService:associateAddress',
      'ChompApiService:createUpgrade',
      'KeyringController:signEip7702Authorization',
      'NetworkController:findNetworkClientIdByChainId',
      'NetworkController:getNetworkClientById',
    ],
    events: [],
    messenger,
  });

  const controller = new MoneyAccountUpgradeController({
    messenger,
  });

  return { controller, rootMessenger, messenger, mocks };
}

describe('MoneyAccountUpgradeController', () => {
  describe('constructor', () => {
    it('does not make async init calls when constructed', () => {
      const { mocks } = setup();

      expect(mocks.getServiceDetails).not.toHaveBeenCalled();
    });
  });

  describe('init', () => {
    it('fetches service details and builds config', async () => {
      const { controller, mocks } = setup();

      await controller.init(MOCK_CHAIN_ID, MOCK_INIT_CONFIG);

      expect(mocks.getServiceDetails).toHaveBeenCalledWith([MOCK_CHAIN_ID]);
    });

    it('throws when the chain is not found in service details', async () => {
      const { controller, mocks } = setup();

      mocks.getServiceDetails.mockResolvedValue({
        auth: { message: 'CHOMP Authentication' },
        chains: {},
      });

      await expect(
        controller.init(MOCK_CHAIN_ID, MOCK_INIT_CONFIG),
      ).rejects.toThrow(
        `Chain ${MOCK_CHAIN_ID} not found in service details response`,
      );
    });

    it('throws when vedaProtocol is not found', async () => {
      const { controller, mocks } = setup();

      mocks.getServiceDetails.mockResolvedValue({
        auth: { message: 'CHOMP Authentication' },
        chains: {
          [MOCK_CHAIN_ID]: {
            autoDepositDelegate: MOCK_CONFIG.delegateAddress,
            protocol: {},
          },
        },
      });

      await expect(
        controller.init(MOCK_CHAIN_ID, MOCK_INIT_CONFIG),
      ).rejects.toThrow(
        `vedaProtocol not found for chain ${MOCK_CHAIN_ID} in service details response`,
      );
    });

    it('throws when supportedTokens is empty', async () => {
      const { controller, mocks } = setup();

      mocks.getServiceDetails.mockResolvedValue({
        auth: { message: 'CHOMP Authentication' },
        chains: {
          [MOCK_CHAIN_ID]: {
            autoDepositDelegate: MOCK_CONFIG.delegateAddress,
            protocol: {
              vedaProtocol: {
                supportedTokens: [],
                adapterAddress: MOCK_CONFIG.vedaVaultAdapterAddress,
                intentTypes: ['cash-deposit', 'cash-withdrawal'],
              },
            },
          },
        },
      });

      await expect(
        controller.init(MOCK_CHAIN_ID, MOCK_INIT_CONFIG),
      ).rejects.toThrow(
        `No supported tokens found for vedaProtocol on chain ${MOCK_CHAIN_ID}`,
      );
    });
  });

  describe('upgradeAccount', () => {
    it('throws when called before init', async () => {
      const { controller } = setup();

      await expect(
        controller.upgradeAccount(MOCK_ACCOUNT_ADDRESS),
      ).rejects.toThrow(
        'MoneyAccountUpgradeController must be initialized via init() before upgradeAccount() can be called',
      );
    });

    it('throws when a previous init attempt failed', async () => {
      const { controller, mocks } = setup();
      mocks.getServiceDetails.mockResolvedValueOnce({
        auth: { message: 'CHOMP Authentication' },
        chains: {},
      });
      await expect(
        controller.init(MOCK_CHAIN_ID, MOCK_INIT_CONFIG),
      ).rejects.toThrow('Chain 0x1 not found in service details response');

      await expect(
        controller.upgradeAccount(MOCK_ACCOUNT_ADDRESS),
      ).rejects.toThrow(
        'MoneyAccountUpgradeController must be initialized via init() before upgradeAccount() can be called',
      );
    });

    it('runs each step for the given address', async () => {
      const { controller, mocks } = setup();
      await controller.init(MOCK_CHAIN_ID, MOCK_INIT_CONFIG);

      await controller.upgradeAccount(MOCK_ACCOUNT_ADDRESS);

      expect(mocks.signPersonalMessage).toHaveBeenCalledWith(
        expect.objectContaining({ from: MOCK_ACCOUNT_ADDRESS }),
      );
      expect(mocks.associateAddress).toHaveBeenCalledWith(
        expect.objectContaining({ address: MOCK_ACCOUNT_ADDRESS }),
      );
      expect(mocks.signEip7702Authorization).toHaveBeenCalledWith(
        expect.objectContaining({
          from: MOCK_ACCOUNT_ADDRESS,
          contractAddress: MOCK_CONFIG.delegatorImplAddress,
        }),
      );
      expect(mocks.createUpgrade).toHaveBeenCalledWith(
        expect.objectContaining({ address: MOCK_ACCOUNT_ADDRESS }),
      );
    });

    it('is callable via the messenger', async () => {
      const { controller, rootMessenger } = setup();
      await controller.init(MOCK_CHAIN_ID, MOCK_INIT_CONFIG);

      expect(
        await rootMessenger.call(
          'MoneyAccountUpgradeController:upgradeAccount',
          MOCK_ACCOUNT_ADDRESS,
        ),
      ).toBeUndefined();
    });

    it('propagates errors thrown by a step', async () => {
      const { controller, mocks } = setup();
      await controller.init(MOCK_CHAIN_ID, MOCK_INIT_CONFIG);
      mocks.signPersonalMessage.mockRejectedValue(new Error('signing failed'));

      await expect(
        controller.upgradeAccount(MOCK_ACCOUNT_ADDRESS),
      ).rejects.toThrow('signing failed');
    });
  });
});
