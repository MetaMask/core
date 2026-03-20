import type { HdKeyring } from '@metamask/eth-hd-keyring';
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

function setup(): {
  service: MoneyAccountService;
  rootMessenger: RootMessenger;
  mocks: {
    withKeyring: jest.Mock;
    addNewKeyring: jest.Mock;
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
    ],
    events: [],
  });

  const mocks = {
    withKeyring: jest.fn().mockImplementation(async (selector, operation) => {
      if ('type' in selector) {
        throw new Error('Keyring not found');
      }
      return operation({
        keyring: {
          type: 'HD Key Tree',
          mnemonic: MOCK_MNEMONIC,
        } as unknown as HdKeyring,
        metadata: { id: MOCK_ENTROPY_SOURCE, name: '' },
      });
    }),
    addNewKeyring: jest.fn().mockResolvedValue({
      id: 'new-money-keyring-id',
      name: '',
    }),
  };

  rootMessenger.registerActionHandler(
    'KeyringController:withKeyring',
    mocks.withKeyring,
  );
  rootMessenger.registerActionHandler(
    'KeyringController:addNewKeyring',
    mocks.addNewKeyring,
  );

  const service = new MoneyAccountService({ messenger });

  return { service, rootMessenger, mocks };
}

describe('MoneyAccountService', () => {
  describe('createMoneyAccount', () => {
    it('creates a Money keyring from the HD keyring mnemonic', async () => {
      const { service, mocks } = setup();

      const result = await service.createMoneyAccount(MOCK_ENTROPY_SOURCE);

      expect(mocks.withKeyring).toHaveBeenCalledWith(
        { id: MOCK_ENTROPY_SOURCE },
        expect.any(Function),
      );
      expect(mocks.addNewKeyring).toHaveBeenCalledWith(KeyringTypes.money, {
        mnemonic: MOCK_MNEMONIC,
      });
      expect(result).toStrictEqual({ id: 'new-money-keyring-id', name: '' });
    });

    it('is callable via the messenger', async () => {
      const { rootMessenger } = setup();

      const result = await rootMessenger.call(
        'MoneyAccountService:createMoneyAccount',
        MOCK_ENTROPY_SOURCE,
      );

      expect(result).toStrictEqual({ id: 'new-money-keyring-id', name: '' });
    });

    it('returns existing money keyring metadata if a money account already exists', async () => {
      const { service, mocks } = setup();
      const MOCK_MONEY_METADATA = { id: 'existing-money-keyring-id', name: '' };
      const MOCK_MONEY_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';

      mocks.withKeyring.mockImplementation(async (selector, operation) => {
        if ('type' in selector && selector.type === KeyringTypes.money) {
          return operation({
            keyring: {
              getAccounts: jest.fn().mockResolvedValue([MOCK_MONEY_ADDRESS]),
            },
            metadata: MOCK_MONEY_METADATA,
          });
        }
        return operation({
          keyring: {
            type: 'HD Key Tree',
            mnemonic: MOCK_MNEMONIC,
          } as unknown as HdKeyring,
          metadata: { id: MOCK_ENTROPY_SOURCE, name: '' },
        });
      });

      const result = await service.createMoneyAccount(MOCK_ENTROPY_SOURCE);

      expect(result).toStrictEqual(MOCK_MONEY_METADATA);
      expect(mocks.addNewKeyring).not.toHaveBeenCalled();
    });

    it('creates a new money keyring if an existing one has no accounts', async () => {
      const { service, mocks } = setup();

      mocks.withKeyring.mockImplementation(async (selector, operation) => {
        if ('type' in selector && selector.type === KeyringTypes.money) {
          return operation({
            keyring: {
              getAccounts: jest.fn().mockResolvedValue([]),
            },
            metadata: { id: 'empty-money-keyring-id', name: '' },
          });
        }
        return operation({
          keyring: {
            type: 'HD Key Tree',
            mnemonic: MOCK_MNEMONIC,
          } as unknown as HdKeyring,
          metadata: { id: MOCK_ENTROPY_SOURCE, name: '' },
        });
      });

      await service.createMoneyAccount(MOCK_ENTROPY_SOURCE);

      expect(mocks.addNewKeyring).toHaveBeenCalledWith(KeyringTypes.money, {
        mnemonic: MOCK_MNEMONIC,
      });
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

      await expect(
        service.createMoneyAccount(MOCK_ENTROPY_SOURCE),
      ).rejects.toThrow('Got keyring without HD Keyring type');
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

      await expect(
        service.createMoneyAccount(MOCK_ENTROPY_SOURCE),
      ).rejects.toThrow(
        'HD keyring does not have a mnemonic for the given entropy source.',
      );
    });
  });
});
