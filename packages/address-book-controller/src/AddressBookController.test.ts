import { Messenger } from '@metamask/base-controller';
import { toHex } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';

import type {
  AddressBookControllerActions,
  AddressBookControllerEvents,
  AddressBookControllerContactUpdatedEvent,
  AddressBookControllerContactDeletedEvent,
} from './AddressBookController';
import {
  AddressBookController,
  AddressType,
  controllerName,
} from './AddressBookController';

/**
 * Helper function to create test fixtures
 *
 * @returns Test fixtures including messenger, controller, and event listeners
 */
function arrangeMocks() {
  const messenger = new Messenger<
    AddressBookControllerActions,
    AddressBookControllerEvents
  >();
  const restrictedMessenger = messenger.getRestricted({
    name: controllerName,
    allowedActions: [],
    allowedEvents: [],
  });
  const controller = new AddressBookController({
    messenger: restrictedMessenger,
  });

  // Set up mock event listeners
  const contactUpdatedListener = jest.fn();
  const contactDeletedListener = jest.fn();

  // Subscribe to events
  messenger.subscribe(
    'AddressBookController:contactUpdated' as AddressBookControllerContactUpdatedEvent['type'],
    contactUpdatedListener,
  );
  messenger.subscribe(
    'AddressBookController:contactDeleted' as AddressBookControllerContactDeletedEvent['type'],
    contactDeletedListener,
  );

  return {
    controller,
    contactUpdatedListener,
    contactDeletedListener,
  };
}

describe('AddressBookController', () => {
  // Mock Date.now to return a fixed value for tests
  const originalDateNow = Date.now;
  const MOCK_TIMESTAMP = 1000000000000;

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockImplementation(() => MOCK_TIMESTAMP);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    Date.now = originalDateNow;
  });

  it('sets default state', () => {
    const { controller } = arrangeMocks();
    expect(controller.state).toStrictEqual({ addressBook: {} });
  });

  it('adds a contact entry', () => {
    const { controller } = arrangeMocks();
    controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo');

    expect(controller.state).toStrictEqual({
      addressBook: {
        [toHex(1)]: {
          '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
            address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
            chainId: toHex(1),
            isEns: false,
            memo: '',
            name: 'foo',
            addressType: undefined,
            lastUpdatedAt: MOCK_TIMESTAMP,
          },
        },
      },
    });
  });

  it('adds a contact entry with chainId and memo', () => {
    const { controller } = arrangeMocks();
    controller.set(
      '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
      'foo',
      toHex(1),
      'account 1',
      AddressType.externallyOwnedAccounts,
    );

    expect(controller.state).toStrictEqual({
      addressBook: {
        [toHex(1)]: {
          '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
            address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
            chainId: toHex(1),
            isEns: false,
            memo: 'account 1',
            name: 'foo',
            addressType: AddressType.externallyOwnedAccounts,
            lastUpdatedAt: MOCK_TIMESTAMP,
          },
        },
      },
    });
  });

  it('adds a contact entry with address type contract accounts', () => {
    const { controller } = arrangeMocks();
    controller.set(
      '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
      'foo',
      toHex(1),
      'account 1',
      AddressType.contractAccounts,
    );

    expect(controller.state).toStrictEqual({
      addressBook: {
        [toHex(1)]: {
          '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
            address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
            chainId: toHex(1),
            isEns: false,
            memo: 'account 1',
            name: 'foo',
            addressType: AddressType.contractAccounts,
            lastUpdatedAt: MOCK_TIMESTAMP,
          },
        },
      },
    });
  });

  it('adds a contact entry with address type non accounts', () => {
    const { controller } = arrangeMocks();
    controller.set(
      '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
      'foo',
      toHex(1),
      'account 1',
      AddressType.nonAccounts,
    );

    expect(controller.state).toStrictEqual({
      addressBook: {
        [toHex(1)]: {
          '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
            address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
            chainId: toHex(1),
            isEns: false,
            memo: 'account 1',
            name: 'foo',
            addressType: AddressType.nonAccounts,
            lastUpdatedAt: MOCK_TIMESTAMP,
          },
        },
      },
    });
  });

  it('adds multiple contact entries with different chainIds', () => {
    const { controller } = arrangeMocks();
    controller.set(
      '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
      'foo',
      toHex(1),
      'account 2',
    );

    controller.set(
      '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
      'foo',
      toHex(2),
      'account 2',
    );

    expect(controller.state).toStrictEqual({
      addressBook: {
        [toHex(1)]: {
          '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
            address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
            chainId: toHex(1),
            isEns: false,
            memo: 'account 2',
            name: 'foo',
            addressType: undefined,
            lastUpdatedAt: MOCK_TIMESTAMP,
          },
        },
        [toHex(2)]: {
          '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
            address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
            chainId: toHex(2),
            isEns: false,
            memo: 'account 2',
            name: 'foo',
            addressType: undefined,
            lastUpdatedAt: MOCK_TIMESTAMP,
          },
        },
      },
    });
  });

  it('updates a contact entry', () => {
    const { controller } = arrangeMocks();
    controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo');

    controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'bar');

    expect(controller.state).toStrictEqual({
      addressBook: {
        [toHex(1)]: {
          '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
            address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
            chainId: toHex(1),
            isEns: false,
            memo: '',
            name: 'bar',
            addressType: undefined,
            lastUpdatedAt: MOCK_TIMESTAMP,
          },
        },
      },
    });
  });

  it('does not add invalid contact entry', () => {
    const { controller } = arrangeMocks();
    // @ts-expect-error Intentionally invalid entry
    controller.set('0x01', 'foo', AddressType.externallyOwnedAccounts);
    expect(controller.state).toStrictEqual({ addressBook: {} });
  });

  it('removes one contact entry', () => {
    const { controller } = arrangeMocks();
    controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo');
    controller.delete(toHex(1), '0x32Be343B94f860124dC4fEe278FDCBD38C102D88');

    expect(controller.state).toStrictEqual({ addressBook: {} });
  });

  it('removes only one contact entry', () => {
    const { controller } = arrangeMocks();
    controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo');

    controller.set('0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d', 'bar');
    controller.delete(toHex(1), '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d');

    expect(controller.state).toStrictEqual({
      addressBook: {
        [toHex(1)]: {
          '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
            address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
            chainId: toHex(1),
            isEns: false,
            memo: '',
            name: 'foo',
            addressType: undefined,
            lastUpdatedAt: MOCK_TIMESTAMP,
          },
        },
      },
    });
  });

  it('adds two contact entries with the same chainId', () => {
    const { controller } = arrangeMocks();
    controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo');

    controller.set('0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d', 'bar');

    expect(controller.state).toStrictEqual({
      addressBook: {
        [toHex(1)]: {
          '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
            address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
            chainId: toHex(1),
            isEns: false,
            memo: '',
            name: 'foo',
            addressType: undefined,
            lastUpdatedAt: MOCK_TIMESTAMP,
          },
          '0xC38bF1aD06ef69F0c04E29DBeB4152B4175f0A8D': {
            address: '0xC38bF1aD06ef69F0c04E29DBeB4152B4175f0A8D',
            chainId: toHex(1),
            isEns: false,
            memo: '',
            name: 'bar',
            addressType: undefined,
            lastUpdatedAt: MOCK_TIMESTAMP,
          },
        },
      },
    });
  });

  it('marks correctly ens entries', () => {
    const { controller } = arrangeMocks();
    controller.set(
      '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
      'metamask.eth',
    );

    expect(controller.state).toStrictEqual({
      addressBook: {
        [toHex(1)]: {
          '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
            address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
            chainId: toHex(1),
            isEns: true,
            memo: '',
            name: 'metamask.eth',
            addressType: undefined,
            lastUpdatedAt: MOCK_TIMESTAMP,
          },
        },
      },
    });
  });

  it('clears all contact entries', () => {
    const { controller } = arrangeMocks();
    controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo');

    controller.set('0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d', 'bar');
    controller.clear();
    expect(controller.state).toStrictEqual({ addressBook: {} });
  });

  it('returns true to indicate an address book entry has been added', () => {
    const { controller } = arrangeMocks();
    expect(
      controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo'),
    ).toBe(true);
  });

  it('returns false to indicate an address book entry has NOT been added', () => {
    const { controller } = arrangeMocks();
    expect(
      // @ts-expect-error Intentionally invalid entry
      controller.set('0x00', 'foo', AddressType.externallyOwnedAccounts),
    ).toBe(false);
  });

  it('returns true to indicate an address book entry has been deleted', () => {
    const { controller } = arrangeMocks();
    controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo');

    expect(
      controller.delete(toHex(1), '0x32Be343B94f860124dC4fEe278FDCBD38C102D88'),
    ).toBe(true);
  });

  it('returns false to indicate an address book entry has NOT been deleted due to unsafe input', () => {
    const { controller } = arrangeMocks();
    // @ts-expect-error Suppressing error to test runtime behavior
    expect(controller.delete('__proto__', '0x01')).toBe(false);
    expect(controller.delete(toHex(1), 'constructor')).toBe(false);
  });

  it('returns false to indicate an address book entry has NOT been deleted', () => {
    const { controller } = arrangeMocks();
    controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', '0x00');
    expect(controller.delete(toHex(1), '0x01')).toBe(false);
  });

  it('normalizes addresses so adding and removing entries work across casings', () => {
    const { controller } = arrangeMocks();
    controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo');

    controller.set('0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d', 'bar');

    controller.delete(toHex(1), '0xC38BF1AD06EF69F0C04E29DBEB4152B4175F0A8D');
    expect(controller.state).toStrictEqual({
      addressBook: {
        [toHex(1)]: {
          '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
            address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
            chainId: toHex(1),
            isEns: false,
            memo: '',
            name: 'foo',
            addressType: undefined,
            lastUpdatedAt: MOCK_TIMESTAMP,
          },
        },
      },
    });
  });

  it('emits contactUpdated event when adding a contact', () => {
    const { controller, contactUpdatedListener } = arrangeMocks();

    controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo');

    expect(contactUpdatedListener).toHaveBeenCalledTimes(1);
    expect(contactUpdatedListener).toHaveBeenCalledWith({
      address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
      chainId: toHex(1),
      isEns: false,
      memo: '',
      name: 'foo',
      addressType: undefined,
      lastUpdatedAt: expect.any(Number),
    });
  });

  it('emits contactUpdated event when updating a contact', () => {
    const { controller, contactUpdatedListener } = arrangeMocks();

    controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo');

    // Clear the mock to reset call count since the first set also triggers the event
    contactUpdatedListener.mockClear();

    controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'bar');

    expect(contactUpdatedListener).toHaveBeenCalledTimes(1);
    expect(contactUpdatedListener).toHaveBeenCalledWith({
      address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
      chainId: toHex(1),
      isEns: false,
      memo: '',
      name: 'bar',
      addressType: undefined,
      lastUpdatedAt: expect.any(Number),
    });
  });

  it('emits contactDeleted event when deleting a contact', () => {
    const { controller, contactDeletedListener } = arrangeMocks();

    controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo');
    controller.delete(toHex(1), '0x32Be343B94f860124dC4fEe278FDCBD38C102D88');

    expect(contactDeletedListener).toHaveBeenCalledTimes(1);
    expect(contactDeletedListener).toHaveBeenCalledWith({
      address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
      chainId: toHex(1),
      isEns: false,
      memo: '',
      name: 'foo',
      addressType: undefined,
      lastUpdatedAt: expect.any(Number),
    });
  });

  it('does not emit events for contacts with chainId "*" (wallet accounts)', () => {
    const { controller, contactUpdatedListener, contactDeletedListener } =
      arrangeMocks();

    // Add with chainId "*"
    controller.set(
      '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
      'foo',
      '*' as unknown as Hex,
    );
    expect(contactUpdatedListener).not.toHaveBeenCalled();

    // Update with chainId "*"
    controller.set(
      '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
      'bar',
      '*' as unknown as Hex,
    );
    expect(contactUpdatedListener).not.toHaveBeenCalled();

    // Delete with chainId "*"
    controller.delete(
      '*' as unknown as Hex,
      '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
    );
    expect(contactDeletedListener).not.toHaveBeenCalled();
  });

  it('lists all contacts', () => {
    const { controller } = arrangeMocks();
    controller.set(
      '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
      'foo',
      toHex(1),
    );
    controller.set(
      '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d',
      'bar',
      toHex(2),
    );

    const contacts = controller.list();
    expect(contacts).toHaveLength(2);
    expect(contacts).toContainEqual(
      expect.objectContaining({
        address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
        chainId: toHex(1),
        name: 'foo',
      }),
    );
    expect(contacts).toContainEqual(
      expect.objectContaining({
        address: '0xC38bF1aD06ef69F0c04E29DBeB4152B4175f0A8D',
        chainId: toHex(2),
        name: 'bar',
      }),
    );
  });
});
