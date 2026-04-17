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

const MOCK_CHAIN_ID = '0x1' as Hex;

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
    getServiceDetails: jest
      .fn()
      .mockResolvedValue(MOCK_SERVICE_DETAILS_RESPONSE),
  };

  const rootMessenger = new Messenger<MockAnyNamespace, AllActions, AllEvents>({
    namespace: MOCK_ANY_NAMESPACE,
  });

  rootMessenger.registerActionHandler(
    'ChompApiService:getServiceDetails',
    mocks.getServiceDetails,
  );

  const messenger: MoneyAccountUpgradeControllerMessenger = new Messenger({
    namespace: 'MoneyAccountUpgradeController',
    parent: rootMessenger,
  });

  rootMessenger.delegate({
    actions: ['ChompApiService:getServiceDetails'],
    events: [],
    messenger,
  });

  const controller = new MoneyAccountUpgradeController({
    messenger,
    state,
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
            '0xabcdef1234567890abcdef1234567890abcdef12': {
              chainId: MOCK_CHAIN_ID,
            },
          },
        },
      });

      expect(
        controller.state.upgrades['0xabcdef1234567890abcdef1234567890abcdef12'],
      ).toStrictEqual({ chainId: MOCK_CHAIN_ID });
    });

    it('starts with initialized set to false', () => {
      const { controller } = setup();

      expect(controller.initialized).toBe(false);
    });
  });

  describe('init', () => {
    it('fetches service details and builds config', async () => {
      const { controller, mocks } = setup();

      await controller.init(MOCK_CHAIN_ID, MOCK_INIT_CONFIG);

      expect(mocks.getServiceDetails).toHaveBeenCalledWith([MOCK_CHAIN_ID]);
    });

    it('sets initialized to true after successful init', async () => {
      const { controller } = setup();

      await controller.init(MOCK_CHAIN_ID, MOCK_INIT_CONFIG);

      expect(controller.initialized).toBe(true);
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

      expect(controller.initialized).toBe(false);
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

      expect(controller.initialized).toBe(false);
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

      expect(controller.initialized).toBe(false);
    });
  });

  describe('upgradeAccount', () => {
    it('resolves without doing anything', async () => {
      const { controller } = setup();

      expect(await controller.upgradeAccount()).toBeUndefined();
    });

    it('does not mutate state', async () => {
      const { controller } = setup();
      const stateBefore = controller.state;

      await controller.upgradeAccount();

      expect(controller.state).toStrictEqual(stateBefore);
    });

    it('is callable via the messenger', async () => {
      const { rootMessenger } = setup();

      expect(
        await rootMessenger.call(
          'MoneyAccountUpgradeController:upgradeAccount',
        ),
      ).toBeUndefined();
    });
  });
});
