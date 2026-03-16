import type { HdKeyring } from '@metamask/eth-hd-keyring';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { KeyringObject } from '@metamask/keyring-controller';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';

import { CashAccountService, serviceName } from './CashAccountService';
import type { CashAccountServiceMessenger } from './types';

type AllActions = MessengerActions<CashAccountServiceMessenger>;
type AllEvents = MessengerEvents<CashAccountServiceMessenger>;

type RootMessenger = Messenger<MockAnyNamespace, AllActions, AllEvents>;

const MOCK_MNEMONIC = new Uint8Array([
  116, 101, 115, 116, 32, 116, 101, 115, 116, 32, 116, 101, 115, 116, 32, 116,
  101, 115, 116, 32, 116, 101, 115, 116, 32, 116, 101, 115, 116, 32, 116, 101,
  115, 116, 32, 116, 101, 115, 116, 32, 116, 101, 115, 116, 32, 116, 101, 115,
  116, 32, 116, 101, 115, 116, 32, 106, 117, 110, 107,
]);

const MOCK_ENTROPY_SOURCE = 'mock-entropy-source-id';

const MOCK_HD_KEYRING: KeyringObject = {
  type: KeyringTypes.hd,
  accounts: ['0x1234'],
  metadata: { id: MOCK_ENTROPY_SOURCE, name: '' },
};

function setup(): {
  service: CashAccountService;
  rootMessenger: RootMessenger;
  mocks: {
    getState: jest.Mock;
    getKeyringsByType: jest.Mock;
    addNewKeyring: jest.Mock;
  };
} {
  const rootMessenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
    captureException: jest.fn(),
  });

  const messenger: CashAccountServiceMessenger = new Messenger({
    namespace: serviceName,
    parent: rootMessenger,
  });

  rootMessenger.delegate({
    messenger,
    actions: [
      'KeyringController:getState',
      'KeyringController:getKeyringsByType',
      'KeyringController:addNewKeyring',
    ],
    events: [],
  });

  const mocks = {
    getState: jest.fn().mockReturnValue({
      isUnlocked: true,
      keyrings: [MOCK_HD_KEYRING],
    }),
    getKeyringsByType: jest
      .fn()
      .mockReturnValue([{ mnemonic: MOCK_MNEMONIC } as unknown as HdKeyring]),
    addNewKeyring: jest.fn().mockResolvedValue({
      id: 'new-cash-keyring-id',
      name: '',
    }),
  };

  rootMessenger.registerActionHandler(
    'KeyringController:getState',
    mocks.getState,
  );
  rootMessenger.registerActionHandler(
    'KeyringController:getKeyringsByType',
    mocks.getKeyringsByType,
  );
  rootMessenger.registerActionHandler(
    'KeyringController:addNewKeyring',
    mocks.addNewKeyring,
  );

  const service = new CashAccountService({ messenger });

  return { service, rootMessenger, mocks };
}

describe('CashAccountService', () => {
  describe('createCashAccount', () => {
    it('creates a Cash keyring from the HD keyring mnemonic', async () => {
      const { service, mocks } = setup();

      const result = await service.createCashAccount(MOCK_ENTROPY_SOURCE);

      expect(mocks.getKeyringsByType).toHaveBeenCalledWith(KeyringTypes.hd);
      expect(mocks.addNewKeyring).toHaveBeenCalledWith(KeyringTypes.cash, {
        mnemonic: MOCK_MNEMONIC,
      });
      expect(result).toStrictEqual({ id: 'new-cash-keyring-id', name: '' });
    });

    it('is callable via the messenger', async () => {
      const { rootMessenger } = setup();

      const result = await rootMessenger.call(
        'CashAccountService:createCashAccount',
        MOCK_ENTROPY_SOURCE,
      );

      expect(result).toStrictEqual({ id: 'new-cash-keyring-id', name: '' });
    });

    it('throws if no HD keyring matches the entropy source', async () => {
      const { service } = setup();

      await expect(
        service.createCashAccount('nonexistent-entropy-source'),
      ).rejects.toThrow(
        'No HD keyring found for entropy source: nonexistent-entropy-source',
      );
    });

    it('throws if the HD keyring has no mnemonic', async () => {
      const { service, mocks } = setup();

      mocks.getKeyringsByType.mockReturnValue([
        { mnemonic: null } as unknown as HdKeyring,
      ]);

      await expect(
        service.createCashAccount(MOCK_ENTROPY_SOURCE),
      ).rejects.toThrow(
        'HD keyring does not have a mnemonic for the given entropy source.',
      );
    });
  });
});
