import { SignTypedDataVersion } from '@metamask/keyring-controller';
import type { Address, Hex } from 'viem';

import {
  DelegationController,
  getDefaultDelegationControllerState,
} from './delegation-controller';
import {
  type Delegation,
  getDelegationHashOffchain,
  ROOT_AUTHORITY,
} from './sdk';
import type {
  DelegationControllerMessenger,
  DelegationControllerState,
  DelegationEntry,
  DelegationFilter,
} from './types';

const FROM_MOCK = '0x2234567890123456789012345678901234567890' as Address;
const SIGNATURE_HASH_MOCK = '0x123ABC';

const DELEGATION_MOCK: Delegation = {
  delegator: '0x1234567890123456789012345678901234567890' as Address,
  delegate: FROM_MOCK,
  authority: ROOT_AUTHORITY,
  caveats: [],
  salt: '0x0' as Hex,
  signature: '0x',
};

const DELEGATION_ENTRY_MOCK: DelegationEntry = {
  data: DELEGATION_MOCK,
  chainId: 11155111, // sepolia
  tags: [],
};

class TestDelegationController extends DelegationController {
  public testUpdate(updater: (state: DelegationControllerState) => void) {
    this.update(updater);
  }
}

/**
 * Create a mock messenger instance.
 *
 * @returns The mock messenger instance plus individual mock functions for each action.
 */
function createMessengerMock() {
  const accountsControllerGetSelectedAccountMock = jest.fn();
  const keyringControllerSignTypedMessageMock = jest.fn();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const callMock = (method: string, ...args: any[]) => {
    switch (method) {
      case 'AccountsController:getSelectedAccount':
        return accountsControllerGetSelectedAccountMock(...args);
      case 'KeyringController:signTypedMessage':
        return keyringControllerSignTypedMessageMock(...args);
      default:
        throw new Error(`Messenger method not recognised: ${method}`);
    }
  };

  const messenger = {
    registerActionHandler: jest.fn(),
    registerInitialEventPayload: jest.fn(),
    publish: jest.fn(),
    call: callMock,
  } as unknown as jest.Mocked<DelegationControllerMessenger>;

  accountsControllerGetSelectedAccountMock.mockReturnValue({
    address: FROM_MOCK,
  });

  keyringControllerSignTypedMessageMock.mockResolvedValue(SIGNATURE_HASH_MOCK);

  return {
    accountsControllerGetSelectedAccountMock,
    keyringControllerSignTypedMessageMock,
    messenger,
  };
}

/**
 * Create a controller instance for testing.
 *
 * @returns The controller instance plus individual mock functions for each action.
 */
function createController() {
  const { messenger, ...mocks } = createMessengerMock();
  const controller = new TestDelegationController({
    messenger,
  });

  return {
    controller,
    ...mocks,
  };
}

describe('DelegationController', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('getDefaultDelegationControllerState', () => {
    it('returns empty delegations object', () => {
      const state = getDefaultDelegationControllerState();
      expect(state).toStrictEqual({
        delegations: {},
      });
    });
  });

  describe('constructor', () => {
    it('initializes with default state', () => {
      const { controller } = createController();
      expect(controller.state).toStrictEqual({
        delegations: {},
      });
    });
  });

  describe('sign', () => {
    it('throws if no account selected', async () => {
      const { controller, accountsControllerGetSelectedAccountMock } =
        createController();

      accountsControllerGetSelectedAccountMock.mockReturnValue(null);

      await expect(controller.sign(DELEGATION_MOCK)).rejects.toThrow(
        'No chainId or account selected',
      );
    });

    it('signs a delegation message', async () => {
      const { controller, keyringControllerSignTypedMessageMock } =
        createController();

      const signature = await controller.sign(DELEGATION_MOCK);

      expect(signature).toBe(SIGNATURE_HASH_MOCK);
      expect(keyringControllerSignTypedMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            types: expect.any(Object),
            primaryType: 'Delegation',
            domain: expect.objectContaining({
              chainId: 11155111, // sepolia
              name: 'DelegationManager',
              version: '1',
              verifyingContract: expect.any(String),
            }),
            message: DELEGATION_MOCK,
          }),
          from: FROM_MOCK,
        }),
        SignTypedDataVersion.V4,
      );
    });

    it('throws if signature fails', async () => {
      const { controller, keyringControllerSignTypedMessageMock } =
        createController();
      keyringControllerSignTypedMessageMock.mockRejectedValue(
        new Error('Signature failed'),
      );

      await expect(controller.sign(DELEGATION_MOCK)).rejects.toThrow(
        'Signature failed',
      );
    });
  });

  describe('store', () => {
    it('stores a delegation entry in state', () => {
      const { controller } = createController();
      const hash = getDelegationHashOffchain(DELEGATION_MOCK);

      controller.store(DELEGATION_ENTRY_MOCK);

      expect(controller.state.delegations[hash]).toStrictEqual(
        DELEGATION_ENTRY_MOCK,
      );
    });

    it('overwrites existing delegation with same hash', () => {
      const { controller } = createController();
      const hash = getDelegationHashOffchain(DELEGATION_MOCK);
      controller.store(DELEGATION_ENTRY_MOCK);

      const updatedEntry = {
        ...DELEGATION_ENTRY_MOCK,
        tags: ['test-tag'],
      };
      controller.store(updatedEntry);

      expect(controller.state.delegations[hash]).toStrictEqual(updatedEntry);
    });
  });

  describe('list', () => {
    it('lists all delegations for the requester as delegate', () => {
      const { controller } = createController();
      controller.store(DELEGATION_ENTRY_MOCK);

      const result = controller.list();

      expect(result).toHaveLength(1);
      expect(result[0]).toStrictEqual(DELEGATION_ENTRY_MOCK);
    });

    it('filters delegations by from address', () => {
      const { controller } = createController();
      controller.store(DELEGATION_ENTRY_MOCK);

      const result = controller.list({ from: DELEGATION_MOCK.delegator });

      expect(result).toHaveLength(1);
      expect(result[0].data.delegator).toBe(DELEGATION_MOCK.delegator);
    });

    it('filters delegations by chainId', () => {
      const { controller } = createController();
      controller.store(DELEGATION_ENTRY_MOCK);

      const result = controller.list({ chainId: 11155111 });

      expect(result).toHaveLength(1);
      expect(result[0].chainId).toBe(11155111);
    });

    it('filters delegations by tags', () => {
      const { controller } = createController();
      const entryWithTags = {
        ...DELEGATION_ENTRY_MOCK,
        tags: ['test-tag'],
      };
      controller.store(entryWithTags);

      const result = controller.list({ tags: ['test-tag'] });

      expect(result).toHaveLength(1);
      expect(result[0].tags).toContain('test-tag');
    });

    it('only filters entries that contain all of the filter tags', () => {
      const { controller } = createController();
      const entryWithTags = {
        ...DELEGATION_ENTRY_MOCK,
        tags: ['test-tag', 'test-tag-1'],
      };
      controller.store(entryWithTags);

      const result = controller.list({ tags: ['test-tag', 'test-tag-2'] });

      expect(result).toHaveLength(0);

      const result2 = controller.list({ tags: ['test-tag', 'test-tag-1'] });
      expect(result2).toHaveLength(1);
      expect(result2[0].tags).toContain('test-tag');
      expect(result2[0].tags).toContain('test-tag-1');
    });

    it('combines multiple filters', () => {
      const { controller } = createController();
      const entryWithTags = {
        ...DELEGATION_ENTRY_MOCK,
        tags: ['test-tag'],
      };
      controller.store(entryWithTags);

      const result = controller.list({
        from: DELEGATION_MOCK.delegator,
        chainId: 11155111,
        tags: ['test-tag'],
      });

      expect(result).toHaveLength(1);
      expect(result[0].data.delegator).toBe(DELEGATION_MOCK.delegator);
      expect(result[0].chainId).toBe(11155111);
      expect(result[0].tags).toContain('test-tag');
    });

    it('filters delegations by from address when requester is not the delegator', () => {
      const { controller } = createController();
      const otherDelegation = {
        ...DELEGATION_MOCK,
        delegator: '0x9234567890123456789012345678901234567890' as Address,
      };
      const otherEntry = {
        ...DELEGATION_ENTRY_MOCK,
        data: otherDelegation,
      };
      controller.store(DELEGATION_ENTRY_MOCK);
      controller.store(otherEntry);

      const result = controller.list({ from: otherDelegation.delegator });

      expect(result).toHaveLength(1);
      expect(result[0].data.delegator).toBe(otherDelegation.delegator);
    });

    it('filters delegations by from address when requester is the delegator', () => {
      const { controller } = createController();
      controller.store(DELEGATION_ENTRY_MOCK);

      const result = controller.list({ from: DELEGATION_MOCK.delegator });

      expect(result).toHaveLength(1);
      expect(result[0].data.delegator).toBe(DELEGATION_MOCK.delegator);
    });

    it('returns empty array when no delegations match filter', () => {
      const { controller } = createController();
      controller.store(DELEGATION_ENTRY_MOCK);

      const result = controller.list({
        from: '0x9234567890123456789012345678901234567890' as Address,
        chainId: 1,
        tags: ['non-existent-tag'],
      });

      expect(result).toHaveLength(0);
    });
  });

  describe('retrieve', () => {
    it('retrieves delegation by hash', () => {
      const { controller } = createController();
      const hash = getDelegationHashOffchain(DELEGATION_MOCK);
      controller.store(DELEGATION_ENTRY_MOCK);

      const result = controller.retrieve(hash);

      expect(result).toStrictEqual(DELEGATION_ENTRY_MOCK);
    });

    it('returns null if hash not found', () => {
      const { controller } = createController();

      const result = controller.retrieve('0x123' as Hex);

      expect(result).toBeNull();
    });
  });

  describe('chain', () => {
    it('retrieves delegation chain from hash', () => {
      const { controller } = createController();
      const parentDelegation = {
        ...DELEGATION_MOCK,
        authority: ROOT_AUTHORITY as Hex,
      };
      const childDelegation = {
        ...DELEGATION_MOCK,
        authority: getDelegationHashOffchain(parentDelegation) as Hex,
      };
      const parentEntry = {
        ...DELEGATION_ENTRY_MOCK,
        data: parentDelegation,
      };
      const childEntry = {
        ...DELEGATION_ENTRY_MOCK,
        data: childDelegation,
      };
      controller.store(parentEntry);
      controller.store(childEntry);

      const result = controller.chain(
        getDelegationHashOffchain(childDelegation),
      );

      expect(result).toHaveLength(2);
      expect(result?.[0]).toStrictEqual(childEntry);
      expect(result?.[1]).toStrictEqual(parentEntry);
    });

    it('returns null if hash not found', () => {
      const { controller } = createController();

      const result = controller.chain(
        '0x1234567890123456789012345678901234567890123456789012345678901234' as Hex,
      );

      expect(result).toBeNull();
    });

    it('throws if delegation chain is invalid', () => {
      const { controller } = createController();
      const invalidDelegation = {
        ...DELEGATION_MOCK,
        authority:
          '0x1234567890123456789012345678901234567890123456789012345678901234' as Hex,
      };
      const invalidEntry = {
        ...DELEGATION_ENTRY_MOCK,
        data: invalidDelegation,
      };
      controller.store(invalidEntry);

      expect(() =>
        controller.chain(getDelegationHashOffchain(invalidDelegation)),
      ).toThrow('Invalid delegation chain');
    });

    it('returns null for root authority', () => {
      const { controller } = createController();
      const rootDelegation = {
        ...DELEGATION_MOCK,
        authority: ROOT_AUTHORITY as Hex,
      };
      const rootEntry = {
        ...DELEGATION_ENTRY_MOCK,
        data: rootDelegation,
      };
      controller.store(rootEntry);

      const result = controller.chain(ROOT_AUTHORITY as Hex);

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('deletes delegation by hash', () => {
      const { controller } = createController();
      const hash = getDelegationHashOffchain(DELEGATION_MOCK);
      controller.store(DELEGATION_ENTRY_MOCK);

      const count = controller.delete(hash);

      expect(count).toBe(1);
      expect(controller.state.delegations[hash]).toBeUndefined();
    });

    it('deletes delegation chain', () => {
      const { controller } = createController();
      const parentDelegation = {
        ...DELEGATION_MOCK,
        authority: ROOT_AUTHORITY as Hex,
      };
      const childDelegation = {
        ...DELEGATION_MOCK,
        authority: getDelegationHashOffchain(parentDelegation) as Hex,
      };
      const parentEntry = {
        ...DELEGATION_ENTRY_MOCK,
        data: parentDelegation,
      };
      const childEntry = {
        ...DELEGATION_ENTRY_MOCK,
        data: childDelegation,
      };
      controller.store(parentEntry);
      controller.store(childEntry);

      const count = controller.delete(
        getDelegationHashOffchain(parentDelegation),
      );

      expect(count).toBe(2);
      expect(
        controller.state.delegations[
          getDelegationHashOffchain(childDelegation)
        ],
      ).toBeUndefined();
      expect(
        controller.state.delegations[
          getDelegationHashOffchain(parentDelegation)
        ],
      ).toBeUndefined();
    });

    it('deletes delegation chain with multiple children', () => {
      const { controller } = createController();
      const parentDelegation = {
        ...DELEGATION_MOCK,
        authority: ROOT_AUTHORITY as Hex,
      };
      const child1Delegation = {
        ...DELEGATION_MOCK,
        authority: getDelegationHashOffchain(parentDelegation) as Hex,
        salt: '0x1' as Hex,
      };
      const child2Delegation = {
        ...DELEGATION_MOCK,
        authority: getDelegationHashOffchain(parentDelegation) as Hex,
        salt: '0x2' as Hex,
      };
      const parentEntry = {
        ...DELEGATION_ENTRY_MOCK,
        data: parentDelegation,
      };
      const child1Entry = {
        ...DELEGATION_ENTRY_MOCK,
        data: child1Delegation,
      };
      const child2Entry = {
        ...DELEGATION_ENTRY_MOCK,
        data: child2Delegation,
      };
      controller.store(parentEntry);
      controller.store(child1Entry);
      controller.store(child2Entry);

      const count = controller.delete(
        getDelegationHashOffchain(parentDelegation),
      );

      expect(count).toBe(3);
      expect(
        controller.state.delegations[
          getDelegationHashOffchain(parentDelegation)
        ],
      ).toBeUndefined();
      expect(
        controller.state.delegations[
          getDelegationHashOffchain(child1Delegation)
        ],
      ).toBeUndefined();
      expect(
        controller.state.delegations[
          getDelegationHashOffchain(child2Delegation)
        ],
      ).toBeUndefined();
    });

    it('returns 0 when trying to delete non-existent delegation', () => {
      const { controller } = createController();
      const count = controller.delete('0x123' as Hex);
      expect(count).toBe(0);
    });

    it('deletes delegation with complex chain structure', () => {
      const { controller } = createController();
      // Create a chain: root -> parent -> child1 -> grandchild1
      //                           -> child2 -> grandchild2
      const rootDelegation = {
        ...DELEGATION_MOCK,
        authority: ROOT_AUTHORITY as Hex,
        salt: '0x0' as Hex,
      };
      const parentDelegation = {
        ...DELEGATION_MOCK,
        authority: getDelegationHashOffchain(rootDelegation) as Hex,
        salt: '0x1' as Hex,
      };
      const child1Delegation = {
        ...DELEGATION_MOCK,
        authority: getDelegationHashOffchain(parentDelegation) as Hex,
        salt: '0x2' as Hex,
      };
      const child2Delegation = {
        ...DELEGATION_MOCK,
        authority: getDelegationHashOffchain(parentDelegation) as Hex,
        salt: '0x3' as Hex,
      };
      const grandchild1Delegation = {
        ...DELEGATION_MOCK,
        authority: getDelegationHashOffchain(child1Delegation) as Hex,
        salt: '0x4' as Hex,
      };
      const grandchild2Delegation = {
        ...DELEGATION_MOCK,
        authority: getDelegationHashOffchain(child2Delegation) as Hex,
        salt: '0x5' as Hex,
      };

      const rootEntry = { ...DELEGATION_ENTRY_MOCK, data: rootDelegation };
      const parentEntry = { ...DELEGATION_ENTRY_MOCK, data: parentDelegation };
      const child1Entry = { ...DELEGATION_ENTRY_MOCK, data: child1Delegation };
      const child2Entry = { ...DELEGATION_ENTRY_MOCK, data: child2Delegation };
      const grandchild1Entry = {
        ...DELEGATION_ENTRY_MOCK,
        data: grandchild1Delegation,
      };
      const grandchild2Entry = {
        ...DELEGATION_ENTRY_MOCK,
        data: grandchild2Delegation,
      };

      controller.store(rootEntry);
      controller.store(parentEntry);
      controller.store(child1Entry);
      controller.store(child2Entry);
      controller.store(grandchild1Entry);
      controller.store(grandchild2Entry);

      const count = controller.delete(
        getDelegationHashOffchain(parentDelegation),
      );

      expect(count).toBe(5); // parent + 2 children + 2 grandchildren
      expect(
        controller.state.delegations[getDelegationHashOffchain(rootDelegation)],
      ).toBeDefined();
      expect(
        controller.state.delegations[
          getDelegationHashOffchain(parentDelegation)
        ],
      ).toBeUndefined();
      expect(
        controller.state.delegations[
          getDelegationHashOffchain(child1Delegation)
        ],
      ).toBeUndefined();
      expect(
        controller.state.delegations[
          getDelegationHashOffchain(child2Delegation)
        ],
      ).toBeUndefined();
      expect(
        controller.state.delegations[
          getDelegationHashOffchain(grandchild1Delegation)
        ],
      ).toBeUndefined();
      expect(
        controller.state.delegations[
          getDelegationHashOffchain(grandchild2Delegation)
        ],
      ).toBeUndefined();
    });

    it('handles empty nextHashes array gracefully', () => {
      const { controller } = createController();
      // Mock the state to have an empty delegations object
      controller.testUpdate((state) => {
        state.delegations = {};
      });

      // This should not throw and should return 0
      const count = controller.delete('0x123' as Hex);
      expect(count).toBe(0);
    });
  });
});
