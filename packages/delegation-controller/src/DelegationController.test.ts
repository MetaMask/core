import { SignTypedDataVersion } from '@metamask/keyring-controller';
import { hexToNumber } from '@metamask/utils';

import { ROOT_AUTHORITY } from './constants';
import { DelegationController } from './DelegationController';
import type {
  Address,
  Delegation,
  DelegationControllerMessenger,
  DelegationControllerState,
  DelegationEntry,
  Hex,
} from './types';
import { toDelegationStruct } from './utils';

const FROM_MOCK = '0x2234567890123456789012345678901234567890' as Address;
const SIGNATURE_HASH_MOCK = '0x123ABC';

const CHAIN_ID_MOCK = '0xaa36a7';

const VERIFYING_CONTRACT_MOCK: Address =
  '0x0000000000000000000000000000000000000000';

const DELEGATION_MOCK: Delegation = {
  delegator: '0x1234567890123456789012345678901234567890' as Address,
  delegate: FROM_MOCK,
  authority: ROOT_AUTHORITY,
  caveats: [
    {
      enforcer: '0x1111111111111111111111111111111111111111',
      terms: '0x',
      args: '0x',
    },
  ],
  salt: '0x' as Hex,
  signature: '0x',
};

const DELEGATION_ENTRY_MOCK: DelegationEntry = {
  delegation: DELEGATION_MOCK,
  chainId: CHAIN_ID_MOCK, // sepolia
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
 *
 * @param delegation - The delegation to hash.
 * @returns The mock hash of the delegation (not real hash)
 */
function hashDelegationMock(delegation: Delegation): Hex {
  return `0x${delegation.delegator.slice(2)}${delegation.delegate.slice(2)}${delegation.authority.slice(2)}${delegation.salt.slice(2)}`;
}

/**
 * Create a controller instance for testing.
 *
 * @param state - The initial state to use for the controller.
 * @returns The controller instance plus individual mock functions for each action.
 */
function createController(state?: DelegationControllerState) {
  const { messenger, ...mocks } = createMessengerMock();
  const controller = new TestDelegationController({
    messenger,
    state,
    hashDelegation: hashDelegationMock,
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

  describe('constructor', () => {
    it('initializes with default state', () => {
      const { controller } = createController();
      expect(controller.state).toStrictEqual({
        delegations: {},
      });
    });
  });

  describe('sign', () => {
    it('signs a delegation message', async () => {
      const { controller, keyringControllerSignTypedMessageMock } =
        createController();

      const signature = await controller.signDelegation({
        delegation: DELEGATION_MOCK,
        verifyingContract: VERIFYING_CONTRACT_MOCK,
        chainId: CHAIN_ID_MOCK,
      });

      expect(signature).toBe(SIGNATURE_HASH_MOCK);
      expect(keyringControllerSignTypedMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            types: expect.any(Object),
            primaryType: 'Delegation',
            domain: expect.objectContaining({
              chainId: hexToNumber(CHAIN_ID_MOCK),
              name: 'DelegationManager',
              version: '1',
              verifyingContract: expect.any(String),
            }),
            message: toDelegationStruct(DELEGATION_MOCK),
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

      await expect(
        controller.signDelegation({
          delegation: {
            ...DELEGATION_MOCK,
            salt: '0x1' as Hex,
          },
          verifyingContract: VERIFYING_CONTRACT_MOCK,
          chainId: CHAIN_ID_MOCK,
        }),
      ).rejects.toThrow('Signature failed');
    });
  });

  describe('store', () => {
    it('stores a delegation entry in state', () => {
      const { controller } = createController();
      const hash = hashDelegationMock(DELEGATION_ENTRY_MOCK.delegation);

      controller.store({ entry: DELEGATION_ENTRY_MOCK });

      expect(controller.state.delegations[hash]).toStrictEqual(
        DELEGATION_ENTRY_MOCK,
      );
    });

    it('overwrites existing delegation with same hash', () => {
      const { controller } = createController();
      const hash = hashDelegationMock(DELEGATION_ENTRY_MOCK.delegation);
      controller.store({ entry: DELEGATION_ENTRY_MOCK });

      const updatedEntry = {
        ...DELEGATION_ENTRY_MOCK,
        tags: ['test-tag'],
      };
      controller.store({ entry: updatedEntry });

      expect(controller.state.delegations[hash]).toStrictEqual(updatedEntry);
    });
  });

  describe('list', () => {
    it('lists all delegations for the requester as delegate', () => {
      const { controller } = createController();
      controller.store({
        entry: DELEGATION_ENTRY_MOCK,
      });

      const result = controller.list();

      expect(result).toHaveLength(1);
      expect(result[0]).toStrictEqual(DELEGATION_ENTRY_MOCK);
    });

    it('filters delegations by from address', () => {
      const { controller } = createController();
      controller.store({ entry: DELEGATION_ENTRY_MOCK });

      const result = controller.list({ from: DELEGATION_MOCK.delegator });

      expect(result).toHaveLength(1);
      expect(result[0].delegation.delegator).toBe(DELEGATION_MOCK.delegator);
    });

    it('filters delegations by chainId', () => {
      const { controller } = createController();
      controller.store({ entry: DELEGATION_ENTRY_MOCK });

      const result = controller.list({ chainId: CHAIN_ID_MOCK });

      expect(result).toHaveLength(1);
      expect(result[0].chainId).toBe(CHAIN_ID_MOCK);
    });

    it('filters delegations by tags', () => {
      const { controller } = createController();
      const entryWithTags = {
        ...DELEGATION_ENTRY_MOCK,
        tags: ['test-tag'],
      };
      controller.store({
        entry: entryWithTags,
      });

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
      controller.store({ entry: entryWithTags });

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
      controller.store({ entry: entryWithTags });

      const result = controller.list({
        from: DELEGATION_MOCK.delegator,
        chainId: CHAIN_ID_MOCK,
        tags: ['test-tag'],
      });

      expect(result).toHaveLength(1);
      expect(result[0].delegation.delegator).toBe(DELEGATION_MOCK.delegator);
      expect(result[0].chainId).toBe(CHAIN_ID_MOCK);
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
        delegation: otherDelegation,
      };
      controller.store({ entry: DELEGATION_ENTRY_MOCK });
      controller.store({ entry: otherEntry });

      const result = controller.list({ from: otherDelegation.delegator });

      expect(result).toHaveLength(1);
      expect(result[0].delegation.delegator).toBe(otherDelegation.delegator);
    });

    it('filters delegations by from address when requester is the delegator', () => {
      const { controller } = createController();
      controller.store({ entry: DELEGATION_ENTRY_MOCK });

      const result = controller.list({ from: DELEGATION_MOCK.delegator });

      expect(result).toHaveLength(1);
      expect(result[0].delegation.delegator).toBe(DELEGATION_MOCK.delegator);
    });

    it('returns empty array when no delegations match filter', () => {
      const { controller } = createController();
      controller.store({ entry: DELEGATION_ENTRY_MOCK });

      const result = controller.list({
        from: '0x9234567890123456789012345678901234567890' as Address,
        chainId: CHAIN_ID_MOCK,
        tags: ['non-existent-tag'],
      });

      expect(result).toHaveLength(0);
    });
  });

  describe('retrieve', () => {
    it('retrieves delegation by hash', () => {
      const { controller } = createController();
      const hash = hashDelegationMock(DELEGATION_ENTRY_MOCK.delegation);

      controller.store({ entry: DELEGATION_ENTRY_MOCK });

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
      const parentHash = hashDelegationMock(parentDelegation);
      const childDelegation = {
        ...DELEGATION_MOCK,
        authority: parentHash as Hex,
      };
      const childHash = hashDelegationMock(childDelegation);
      const parentEntry = {
        ...DELEGATION_ENTRY_MOCK,
        delegation: parentDelegation,
      };
      const childEntry = {
        ...DELEGATION_ENTRY_MOCK,
        delegation: childDelegation,
      };
      controller.store({ entry: parentEntry });
      controller.store({ entry: childEntry });

      const result = controller.chain(childHash);

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
      const invalidDelegation = {
        ...DELEGATION_MOCK,
        authority: '0x123123123' as Hex,
      };
      const invalidEntry = {
        ...DELEGATION_ENTRY_MOCK,
        delegation: invalidDelegation,
      };
      const hash = hashDelegationMock(invalidEntry.delegation);
      const invalidState = {
        delegations: {
          [hash]: invalidEntry,
        },
      };
      const { controller } = createController(invalidState);

      expect(() => controller.chain(hash)).toThrow('Invalid delegation chain');
    });

    it('returns null for root authority', () => {
      const { controller } = createController();
      const rootDelegation = {
        ...DELEGATION_MOCK,
        authority: ROOT_AUTHORITY as Hex,
      };
      const rootEntry = {
        ...DELEGATION_ENTRY_MOCK,
        delegation: rootDelegation,
      };
      controller.store({ entry: rootEntry });

      const result = controller.chain(ROOT_AUTHORITY as Hex);

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('deletes delegation by hash', () => {
      const { controller } = createController();
      const hash = hashDelegationMock(DELEGATION_ENTRY_MOCK.delegation);

      controller.store({ entry: DELEGATION_ENTRY_MOCK });

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
      const parentHash = hashDelegationMock(parentDelegation);
      const childDelegation = {
        ...DELEGATION_MOCK,
        authority: parentHash as Hex,
      };
      const childHash = hashDelegationMock(childDelegation);
      const parentEntry = {
        ...DELEGATION_ENTRY_MOCK,
        delegation: parentDelegation,
      };
      const childEntry = {
        ...DELEGATION_ENTRY_MOCK,
        delegation: childDelegation,
      };
      controller.store({ entry: parentEntry });
      controller.store({ entry: childEntry });

      const count = controller.delete(parentHash);

      expect(count).toBe(2);
      expect(controller.state.delegations[childHash]).toBeUndefined();
      expect(controller.state.delegations[parentHash]).toBeUndefined();
    });

    it('deletes delegation chain with multiple children', () => {
      const { controller } = createController();
      const parentDelegation = {
        ...DELEGATION_MOCK,
        authority: ROOT_AUTHORITY as Hex,
      };
      const parentHash = hashDelegationMock(parentDelegation);
      const child1Delegation = {
        ...DELEGATION_MOCK,
        authority: parentHash,
        salt: '0x1' as Hex,
      };
      const child1Hash = hashDelegationMock(child1Delegation);
      const child2Delegation = {
        ...DELEGATION_MOCK,
        authority: parentHash,
        salt: '0x2' as Hex,
      };
      const child2Hash = hashDelegationMock(child2Delegation);
      const parentEntry = {
        ...DELEGATION_ENTRY_MOCK,
        delegation: parentDelegation,
      };
      const child1Entry = {
        ...DELEGATION_ENTRY_MOCK,
        delegation: child1Delegation,
      };
      const child2Entry = {
        ...DELEGATION_ENTRY_MOCK,
        delegation: child2Delegation,
      };
      controller.store({ entry: parentEntry });
      controller.store({ entry: child1Entry });
      controller.store({ entry: child2Entry });

      const count = controller.delete(parentHash);

      expect(count).toBe(3);
      expect(controller.state.delegations[parentHash]).toBeUndefined();
      expect(controller.state.delegations[child1Hash]).toBeUndefined();
      expect(controller.state.delegations[child2Hash]).toBeUndefined();
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
      const rootHash = hashDelegationMock(rootDelegation);
      const parentDelegation = {
        ...DELEGATION_MOCK,
        authority: rootHash,
        salt: '0x1' as Hex,
      };
      const parentHash = hashDelegationMock(parentDelegation);
      const child1Delegation = {
        ...DELEGATION_MOCK,
        authority: parentHash,
        salt: '0x2' as Hex,
      };
      const child1Hash = hashDelegationMock(child1Delegation);
      const child2Delegation = {
        ...DELEGATION_MOCK,
        authority: parentHash,
        salt: '0x3' as Hex,
      };
      const child2Hash = hashDelegationMock(child2Delegation);
      const grandchild1Delegation = {
        ...DELEGATION_MOCK,
        authority: child1Hash,
        salt: '0x4' as Hex,
      };
      const grandchild1Hash = hashDelegationMock(grandchild1Delegation);
      const grandchild2Delegation = {
        ...DELEGATION_MOCK,
        authority: child2Hash,
        salt: '0x5' as Hex,
      };
      const grandchild2Hash = hashDelegationMock(grandchild2Delegation);

      const rootEntry = {
        ...DELEGATION_ENTRY_MOCK,
        delegation: rootDelegation,
      };
      const parentEntry = {
        ...DELEGATION_ENTRY_MOCK,
        delegation: parentDelegation,
      };
      const child1Entry = {
        ...DELEGATION_ENTRY_MOCK,
        delegation: child1Delegation,
      };
      const child2Entry = {
        ...DELEGATION_ENTRY_MOCK,
        delegation: child2Delegation,
      };
      const grandchild1Entry = {
        ...DELEGATION_ENTRY_MOCK,
        delegation: grandchild1Delegation,
      };
      const grandchild2Entry = {
        ...DELEGATION_ENTRY_MOCK,
        delegation: grandchild2Delegation,
      };

      controller.store({ entry: rootEntry });
      controller.store({ entry: parentEntry });
      controller.store({ entry: child1Entry });
      controller.store({ entry: child2Entry });
      controller.store({ entry: grandchild1Entry });
      controller.store({ entry: grandchild2Entry });

      const count = controller.delete(parentHash);

      expect(count).toBe(5); // parent + 2 children + 2 grandchildren
      expect(controller.state.delegations[rootHash]).toBeDefined();
      expect(controller.state.delegations[parentHash]).toBeUndefined();
      expect(controller.state.delegations[child1Hash]).toBeUndefined();
      expect(controller.state.delegations[child2Hash]).toBeUndefined();
      expect(controller.state.delegations[grandchild1Hash]).toBeUndefined();
      expect(controller.state.delegations[grandchild2Hash]).toBeUndefined();
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

    it('throws if the authority is invalid', () => {
      const { controller } = createController();
      const invalidDelegation = {
        ...DELEGATION_MOCK,
        authority: '0x1234567890123456789012345678901234567890' as Hex,
      };
      const invalidEntry = {
        ...DELEGATION_ENTRY_MOCK,
        delegation: invalidDelegation,
      };

      expect(() => controller.store({ entry: invalidEntry })).toThrow(
        'Invalid authority',
      );
    });
  });
});
