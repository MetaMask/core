import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import type { MoneyAccount, MoneyAccountControllerMessenger } from '.';
import {
  MoneyAccountController,
  getDefaultMoneyAccountControllerState,
} from '.';

const MOCK_ENTROPY_SOURCE_ID = 'entropy-source-1';
const MOCK_OTHER_ENTROPY_SOURCE_ID = 'entropy-source-2';

const MOCK_HD_KEYRING = {
  type: 'HD Key Tree',
  accounts: ['0xabcdef1234567890abcdef1234567890abcdef12'],
  metadata: { id: MOCK_ENTROPY_SOURCE_ID, name: 'HD Key Tree' },
};

const MOCK_MONEY_ACCOUNT: MoneyAccount = {
  id: 'e9b8f87e-f08d-4e98-a3e4-3c2d3a4e5b6f',
  type: 'eip155:eoa',
  address: '0xabcdef1234567890abcdef1234567890abcdef12',
  scopes: ['eip155:1'],
  options: {
    entropy: {
      type: 'mnemonic',
      id: MOCK_ENTROPY_SOURCE_ID,
      groupIndex: 0,
      derivationPath: "m/44'/60'/0'/0/0",
    },
  },
  methods: ['personal_sign', 'eth_sign'],
};

const MOCK_MONEY_ACCOUNT_2: MoneyAccount = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  type: 'eip155:eoa',
  address: '0x1111111111111111111111111111111111111111',
  scopes: ['eip155:1'],
  options: {
    entropy: {
      type: 'mnemonic',
      id: MOCK_OTHER_ENTROPY_SOURCE_ID,
      groupIndex: 0,
      derivationPath: "m/44'/60'/0'/0/0",
    },
  },
  methods: ['personal_sign', 'eth_sign'],
};

describe('MoneyAccountController', () => {
  describe('constructor', () => {
    it('initializes with default state when no state is provided', () => {
      const { controller } = setup();
      expect(controller.state).toStrictEqual(
        getDefaultMoneyAccountControllerState(),
      );
    });

    it('accepts initial state', () => {
      const { controller } = setup({ accounts: [MOCK_MONEY_ACCOUNT] });
      expect(controller.state.moneyAccounts).toStrictEqual({
        [MOCK_MONEY_ACCOUNT.id]: MOCK_MONEY_ACCOUNT,
      });
    });
  });

  describe('init', () => {
    it('can be called without error', () => {
      const { controller } = setup();
      expect(() => controller.init()).not.toThrow();
    });
  });

  describe('getMoneyAccount', () => {
    it('returns the account for the given entropy source', () => {
      const { controller } = setup({
        accounts: [MOCK_MONEY_ACCOUNT, MOCK_MONEY_ACCOUNT_2],
      });
      expect(
        controller.getMoneyAccount({ entropySource: MOCK_ENTROPY_SOURCE_ID }),
      ).toStrictEqual(MOCK_MONEY_ACCOUNT);
    });

    it('returns undefined for an unknown entropy source', () => {
      const { controller } = setup();
      expect(
        controller.getMoneyAccount({ entropySource: 'unknown-entropy-source' }),
      ).toBeUndefined();
    });

    it('falls back to the primary entropy source when none is provided', () => {
      const { controller } = setup({ accounts: [MOCK_MONEY_ACCOUNT] });
      expect(controller.getMoneyAccount()).toStrictEqual(MOCK_MONEY_ACCOUNT);
    });

    it('returns undefined when no entropy source is provided and no HD keyring exists', () => {
      const { controller } = setup({
        accounts: [MOCK_MONEY_ACCOUNT],
        keyrings: [],
      });
      expect(controller.getMoneyAccount()).toBeUndefined();
    });

    it('is callable via the messenger', () => {
      const { rootMessenger } = setup({ accounts: [MOCK_MONEY_ACCOUNT] });
      expect(
        rootMessenger.call('MoneyAccountController:getMoneyAccount', {
          entropySource: MOCK_ENTROPY_SOURCE_ID,
        }),
      ).toStrictEqual(MOCK_MONEY_ACCOUNT);
    });
  });
});

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<MoneyAccountControllerMessenger>,
  MessengerEvents<MoneyAccountControllerMessenger>
>;

type SetupOptions = {
  accounts?: MoneyAccount[];
  keyrings?: {
    type: string;
    accounts: string[];
    metadata: { id: string; name: string };
  }[];
};

type AllMoneyAccountControllerActions =
  MessengerActions<MoneyAccountControllerMessenger>;

type AllMoneyAccountControllerEvents =
  MessengerEvents<MoneyAccountControllerMessenger>;

function setup({
  accounts = [],
  keyrings = [MOCK_HD_KEYRING],
}: SetupOptions = {}): {
  controller: MoneyAccountController;
  rootMessenger: RootMessenger;
  controllerMessenger: MoneyAccountControllerMessenger;
} {
  const rootMessenger = new Messenger<
    MockAnyNamespace,
    AllMoneyAccountControllerActions,
    AllMoneyAccountControllerEvents
  >({ namespace: MOCK_ANY_NAMESPACE });

  rootMessenger.registerActionHandler(
    'KeyringController:getState',
    () =>
      ({
        keyrings,
        isUnlocked: true,
        vault: '',
      }) as never,
  );

  const controllerMessenger: MoneyAccountControllerMessenger = new Messenger({
    namespace: 'MoneyAccountController',
    parent: rootMessenger,
  });

  rootMessenger.delegate({
    actions: ['KeyringController:getState'],
    events: [],
    messenger: controllerMessenger,
  });

  const moneyAccounts = Object.fromEntries(
    accounts.map((account) => [account.id, account]),
  );

  const controller = new MoneyAccountController({
    messenger: controllerMessenger,
    state: { moneyAccounts },
  });

  return { controller, rootMessenger, controllerMessenger };
}
