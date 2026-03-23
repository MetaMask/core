import type { HdKeyring } from '@metamask/eth-hd-keyring';
import {
  MoneyKeyring,
  MONEY_DERIVATION_PATH,
} from '@metamask/eth-money-keyring';
import type { MoneyKeyringSerializedState } from '@metamask/eth-money-keyring';
import { KeyringTypes } from '@metamask/keyring-controller';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';

import { MoneyAccountService, serviceName } from './MoneyAccountService';
import type { MoneyAccountServiceMessenger } from './types';

type AllActions = MessengerActions<MoneyAccountServiceMessenger>;
type AllEvents = MessengerEvents<MoneyAccountServiceMessenger>;

type RootMessenger = Messenger<MockAnyNamespace, AllActions, AllEvents>;

const MOCK_MNEMONIC = new Uint8Array([
  116, 101, 115, 116, 32, 116, 101, 115, 116, 32, 116, 101, 115, 116, 32, 116,
  101, 115, 116, 32, 116, 101, 115, 116, 32, 116, 101, 115, 116, 32, 116, 101,
  115, 116, 32, 116, 101, 115, 116, 32, 116, 101, 115, 116, 32, 116, 101, 115,
  116, 32, 116, 101, 115, 116, 32, 106, 117, 110, 107,
]);

const MOCK_ENTROPY_SOURCE = 'mock-entropy-source-id';
const MOCK_ACCOUNT_ID = 'mock-money-account-id';

const MOCK_PRIMARY_HD_KEYRING = {
  type: KeyringTypes.hd,
  accounts: [],
  metadata: { id: MOCK_ENTROPY_SOURCE, name: '' },
};

const MOCK_MONEY_GROUP = {
  id: 'mock-group-id',
  accounts: [MOCK_ACCOUNT_ID],
  metadata: { name: 'Money Account', pinned: false, hidden: false },
};

const MOCK_MONEY_WALLET = {
  metadata: { name: '', keyring: { type: KeyringTypes.money } },
  groups: { 'mock-group-id': MOCK_MONEY_GROUP },
};

const MOCK_MONEY_ACCOUNT = {
  id: MOCK_ACCOUNT_ID,
  address: '0xmockmoneyaddress',
};

function setup(): {
  service: MoneyAccountService;
  rootMessenger: RootMessenger;
  mocks: {
    withKeyring: jest.Mock;
    addNewKeyring: jest.Mock;
    getState: jest.Mock;
    getAccountWalletObject: jest.Mock;
    getAccount: jest.Mock;
  };
} {
  const rootMessenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
    captureException: jest.fn(),
  });

  const messenger: MoneyAccountServiceMessenger = new Messenger({
    namespace: serviceName,
    parent: rootMessenger,
  });

  rootMessenger.delegate({
    messenger,
    actions: [
      'KeyringController:withKeyring',
      'KeyringController:addNewKeyring',
      'KeyringController:getState',
      'AccountTreeController:getAccountWalletObject',
      'AccountsController:getAccount',
    ],
    events: [],
  });

  const mocks = {
    withKeyring: jest.fn().mockImplementation(async (_selector, operation) => {
      return operation({
        keyring: {
          type: 'HD Key Tree',
          mnemonic: MOCK_MNEMONIC,
          serialize: jest.fn().mockResolvedValue({ mnemonic: MOCK_MNEMONIC }),
        } as unknown as HdKeyring,
        metadata: { id: MOCK_ENTROPY_SOURCE, name: '' },
      });
    }),
    addNewKeyring: jest.fn().mockResolvedValue(undefined),
    getState: jest
      .fn()
      .mockReturnValue({ keyrings: [MOCK_PRIMARY_HD_KEYRING] }),
    getAccountWalletObject: jest.fn().mockReturnValue(MOCK_MONEY_WALLET),
    getAccount: jest.fn().mockReturnValue(MOCK_MONEY_ACCOUNT),
  };

  rootMessenger.registerActionHandler(
    'KeyringController:withKeyring',
    mocks.withKeyring,
  );
  rootMessenger.registerActionHandler(
    'KeyringController:addNewKeyring',
    mocks.addNewKeyring,
  );
  rootMessenger.registerActionHandler(
    'KeyringController:getState',
    mocks.getState,
  );
  rootMessenger.registerActionHandler(
    'AccountTreeController:getAccountWalletObject',
    mocks.getAccountWalletObject,
  );
  rootMessenger.registerActionHandler(
    'AccountsController:getAccount',
    mocks.getAccount,
  );

  const service = new MoneyAccountService({ messenger });

  return { service, rootMessenger, mocks };
}

describe('MoneyAccountService', () => {
  describe('createMoneyAccount', () => {
    it('creates a Money keyring from the primary HD keyring and returns the account', async () => {
      const { service, mocks } = setup();

      const result = await service.createMoneyAccount();

      expect(mocks.withKeyring).toHaveBeenCalledWith(
        { id: MOCK_ENTROPY_SOURCE },
        expect.any(Function),
      );
      expect(mocks.addNewKeyring).toHaveBeenCalledWith(KeyringTypes.money, {
        mnemonic: MOCK_MNEMONIC,
        numberOfAccounts: 1,
        hdPath: MONEY_DERIVATION_PATH,
      });
      expect(result).toStrictEqual(MOCK_MONEY_ACCOUNT);
    });

    it('is callable via the messenger', async () => {
      const { rootMessenger } = setup();

      const result = await rootMessenger.call(
        'MoneyAccountService:createMoneyAccount',
      );

      expect(result).toStrictEqual(MOCK_MONEY_ACCOUNT);
    });

    it('returns the existing account without creating a new keyring if a money keyring already exists', async () => {
      const { service, mocks } = setup();

      mocks.getState.mockReturnValue({
        keyrings: [
          MOCK_PRIMARY_HD_KEYRING,
          {
            type: KeyringTypes.money,
            accounts: [],
            metadata: { id: 'money-keyring-id', name: '' },
          },
        ],
      });

      const result = await service.createMoneyAccount();

      expect(result).toStrictEqual(MOCK_MONEY_ACCOUNT);
      expect(mocks.addNewKeyring).not.toHaveBeenCalled();
    });

    it('throws if no primary HD keyring exists', async () => {
      const { service, mocks } = setup();

      mocks.getState.mockReturnValue({ keyrings: [] });

      await expect(service.createMoneyAccount()).rejects.toThrow(
        'No primary HD keyring found.',
      );
    });

    it('throws if the keyring is not an HD keyring', async () => {
      const { service, mocks } = setup();

      mocks.withKeyring.mockImplementation(async (_selector, operation) => {
        return operation({
          keyring: {
            type: 'Simple Key Pair',
          } as unknown as HdKeyring,
          metadata: { id: MOCK_ENTROPY_SOURCE, name: '' },
        });
      });

      await expect(service.createMoneyAccount()).rejects.toThrow(
        'Expected HD keyring, got Simple Key Pair',
      );
    });

    it('passes params to addNewKeyring that produce a correctly initialized MoneyKeyring', async () => {
      const { service, mocks } = setup();

      // The real HdKeyring.serialize() returns mnemonic as number[] (via Array.from),
      // not Uint8Array, so we match that format here for MoneyKeyring.deserialize to accept it.
      mocks.withKeyring.mockImplementation(async (_selector, operation) => {
        return operation({
          keyring: {
            type: 'HD Key Tree',
            mnemonic: MOCK_MNEMONIC,
            serialize: jest
              .fn()
              .mockResolvedValue({ mnemonic: Array.from(MOCK_MNEMONIC) }),
          } as unknown as HdKeyring,
          metadata: { id: MOCK_ENTROPY_SOURCE, name: '' },
        });
      });

      let capturedOpts: unknown;
      mocks.addNewKeyring.mockImplementation(async (_type, opts) => {
        capturedOpts = opts;
      });

      await service.createMoneyAccount();

      const moneyKeyring = new MoneyKeyring();
      await moneyKeyring.deserialize(
        capturedOpts as MoneyKeyringSerializedState,
      );

      expect(moneyKeyring.hdPath).toBe(MONEY_DERIVATION_PATH);
      expect(await moneyKeyring.getAccounts()).toHaveLength(1);
    });

    it('throws if the Money account could not be retrieved after keyring creation', async () => {
      const { service, mocks } = setup();

      // Wallet exists but group has no accounts, so getMoneyAccount returns undefined.
      mocks.getAccountWalletObject.mockReturnValue({
        ...MOCK_MONEY_WALLET,
        groups: { 'mock-group-id': { ...MOCK_MONEY_GROUP, accounts: [] } },
      });

      await expect(service.createMoneyAccount()).rejects.toThrow(
        'Failed to create Money account.',
      );
    });

    it('throws if the HD keyring has no mnemonic', async () => {
      const { service, mocks } = setup();

      mocks.withKeyring.mockImplementation(async (_selector, operation) => {
        return operation({
          keyring: {
            type: 'HD Key Tree',
            mnemonic: null,
          } as unknown as HdKeyring,
          metadata: { id: MOCK_ENTROPY_SOURCE, name: '' },
        });
      });

      await expect(service.createMoneyAccount()).rejects.toThrow(
        'HD keyring does not have a mnemonic for the given entropy source.',
      );
    });
  });

  describe('getMoneyAccountWallet', () => {
    it('returns the Money wallet if it exists', () => {
      const { service } = setup();

      const result = service.getMoneyAccountWallet();

      expect(result).toStrictEqual(MOCK_MONEY_WALLET);
    });

    it('returns undefined if no Money wallet exists', () => {
      const { service, mocks } = setup();

      mocks.getAccountWalletObject.mockReturnValue(undefined);

      const result = service.getMoneyAccountWallet();

      expect(result).toBeUndefined();
    });

    it('is callable via the messenger', () => {
      const { rootMessenger } = setup();

      const result = rootMessenger.call(
        'MoneyAccountService:getMoneyAccountWallet',
      );

      expect(result).toStrictEqual(MOCK_MONEY_WALLET);
    });
  });

  describe('getMoneyAccountGroup', () => {
    it('returns the group if a Money wallet exists', () => {
      const { service } = setup();

      const result = service.getMoneyAccountGroup();

      expect(result).toStrictEqual(MOCK_MONEY_GROUP);
    });

    it('returns undefined if no Money wallet exists', () => {
      const { service, mocks } = setup();

      mocks.getAccountWalletObject.mockReturnValue(undefined);

      const result = service.getMoneyAccountGroup();

      expect(result).toBeUndefined();
    });

    it('is callable via the messenger', () => {
      const { rootMessenger } = setup();

      const result = rootMessenger.call(
        'MoneyAccountService:getMoneyAccountGroup',
      );

      expect(result).toStrictEqual(MOCK_MONEY_GROUP);
    });
  });

  describe('getMoneyAccount', () => {
    it('returns the account if a Money wallet group exists', async () => {
      const { service, mocks } = setup();

      const result = await service.getMoneyAccount();

      expect(mocks.getAccount).toHaveBeenCalledWith(MOCK_ACCOUNT_ID);
      expect(result).toStrictEqual(MOCK_MONEY_ACCOUNT);
    });

    it('returns undefined if no Money wallet exists', async () => {
      const { service, mocks } = setup();

      mocks.getAccountWalletObject.mockReturnValue(undefined);

      const result = await service.getMoneyAccount();

      expect(result).toBeUndefined();
      expect(mocks.getAccount).not.toHaveBeenCalled();
    });

    it('returns undefined if the Money wallet group has no accounts', async () => {
      const { service, mocks } = setup();

      mocks.getAccountWalletObject.mockReturnValue({
        ...MOCK_MONEY_WALLET,
        groups: { 'mock-group-id': { ...MOCK_MONEY_GROUP, accounts: [] } },
      });

      const result = await service.getMoneyAccount();

      expect(result).toBeUndefined();
      expect(mocks.getAccount).not.toHaveBeenCalled();
    });

    it('is callable via the messenger', async () => {
      const { rootMessenger } = setup();

      const result = await rootMessenger.call(
        'MoneyAccountService:getMoneyAccount',
      );

      expect(result).toStrictEqual(MOCK_MONEY_ACCOUNT);
    });
  });
});
