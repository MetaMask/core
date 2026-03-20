import type { HdKeyring } from '@metamask/eth-hd-keyring';
import {
  KeyringControllerError,
  KeyringControllerErrorMessage,
  KeyringTypes,
} from '@metamask/keyring-controller';
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
    getState: jest.Mock;
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
    ],
    events: [],
  });

  const mocks = {
    withKeyring: jest.fn().mockImplementation(async (selector, operation) => {
      if ('type' in selector) {
        throw new KeyringControllerError(
          KeyringControllerErrorMessage.KeyringNotFound,
        );
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
    getState: jest.fn().mockReturnValue({ keyrings: [] }),
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

    it('returns null if a money account already exists', async () => {
      const { service, mocks } = setup();

      mocks.getState.mockReturnValue({
        keyrings: [{ type: KeyringTypes.money }],
      });

      const result = await service.createMoneyAccount(MOCK_ENTROPY_SOURCE);

      expect(result).toBeNull();
      expect(mocks.addNewKeyring).not.toHaveBeenCalled();
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

  describe('getMoneyAccount', () => {
    it('returns the money keyring metadata if one exists', async () => {
      const { service, mocks } = setup();
      const MOCK_MONEY_METADATA = { id: 'existing-money-keyring-id', name: '' };

      mocks.withKeyring.mockImplementation(async (selector, operation) => {
        if ('type' in selector && selector.type === KeyringTypes.money) {
          return operation({
            keyring: {},
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

      const result = await service.getMoneyAccount();

      expect(result).toStrictEqual(MOCK_MONEY_METADATA);
    });

    it('returns null if no money account exists', async () => {
      const { service } = setup();

      const result = await service.getMoneyAccount();

      expect(result).toBeNull();
    });

    it('is callable via the messenger', async () => {
      const { rootMessenger, mocks } = setup();
      const MOCK_MONEY_METADATA = { id: 'existing-money-keyring-id', name: '' };

      mocks.withKeyring.mockImplementation(async (selector, operation) => {
        if ('type' in selector && selector.type === KeyringTypes.money) {
          return operation({
            keyring: {},
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

      const result = await rootMessenger.call(
        'MoneyAccountService:getMoneyAccount',
      );

      expect(result).toStrictEqual(MOCK_MONEY_METADATA);
    });

    it('re-throws errors other than KeyringNotFound', async () => {
      const { service, mocks } = setup();
      const unexpectedError = new KeyringControllerError('Unexpected error');

      mocks.withKeyring.mockImplementation(async (selector) => {
        if ('type' in selector && selector.type === KeyringTypes.money) {
          throw unexpectedError;
        }
      });

      await expect(service.getMoneyAccount()).rejects.toThrow(unexpectedError);
    });
  });
});
