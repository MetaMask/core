import { SignTypedDataVersion } from '@metamask/keyring-controller';
import type { Address, Hex } from 'viem';

import {
  DelegationController,
  getDefaultDelegationControllerState,
} from './delegation-controller';
import { type Delegation, getDelegationHashOffchain } from './sdk';
import type {
  DelegationControllerMessenger,
  DelegationControllerState,
} from './types';

const FROM_MOCK = '0x456DEF0123456789ABCDEF0123456789ABCDEF01' as Address;
const SIGNATURE_HASH_MOCK = '0x123ABC';

const DELEGATION_MOCK: Delegation = {
  delegator: '0x1234567890123456789012345678901234567890' as Address,
  delegate: '0x2234567890123456789012345678901234567890' as Address,
  authority:
    '0x3234567890123456789012345678901234567890000000000000000000000000' as Hex,
  caveats: [],
  salt: '0x0' as Hex,
  signature: '0x',
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
    it('stores a delegation in state', () => {
      const { controller } = createController();

      controller.store(DELEGATION_MOCK);

      const hash = getDelegationHashOffchain(DELEGATION_MOCK);
      expect(controller.state.delegations[hash]).toStrictEqual({
        data: DELEGATION_MOCK,
        meta: {
          label: '',
          chainId: 11155111, // sepolia
        },
      });
    });

    it('overwrites existing delegation with same hash', () => {
      const { controller } = createController();
      const hash = getDelegationHashOffchain(DELEGATION_MOCK);
      controller.store(DELEGATION_MOCK);

      const updatedDelegation = {
        ...DELEGATION_MOCK,
        salt: '0x0' as Hex,
      };
      controller.store(updatedDelegation);

      expect(controller.state.delegations[hash]).toStrictEqual({
        data: updatedDelegation,
        meta: {
          label: '',
          chainId: 11155111, // sepolia
        },
      });
    });

    it('stores delegation with custom label', () => {
      const { controller } = createController();
      const hash = getDelegationHashOffchain(DELEGATION_MOCK);
      controller.store(DELEGATION_MOCK);
      controller.testUpdate((state) => {
        state.delegations[hash].meta.label = 'custom-label';
      });

      expect(controller.state.delegations[hash].meta.label).toBe(
        'custom-label',
      );
    });
  });

  describe('retrieve', () => {
    it('retrieves delegation by hash', () => {
      const { controller } = createController();
      const hash = getDelegationHashOffchain(DELEGATION_MOCK);
      controller.store(DELEGATION_MOCK);

      const result = controller.retrieve({ hash });

      expect(result).toHaveLength(1);
      expect(result[0]).toStrictEqual({
        data: DELEGATION_MOCK,
        meta: {
          label: '',
          chainId: 11155111, // sepolia
        },
      });
    });

    it('returns empty array if hash not found', () => {
      const { controller } = createController();

      const result = controller.retrieve({ hash: '0x123' as Hex });

      expect(result).toHaveLength(0);
    });

    it('retrieves delegations by delegator', () => {
      const { controller } = createController();
      controller.store(DELEGATION_MOCK);

      const result = controller.retrieve({
        delegator: DELEGATION_MOCK.delegator,
      });

      expect(result).toHaveLength(1);
      expect(result[0].data.delegator).toBe(DELEGATION_MOCK.delegator);
    });

    it('retrieves delegations by delegate', () => {
      const { controller } = createController();
      controller.store(DELEGATION_MOCK);

      const result = controller.retrieve({
        delegate: DELEGATION_MOCK.delegate,
      });

      expect(result).toHaveLength(1);
      expect(result[0].data.delegate).toBe(DELEGATION_MOCK.delegate);
    });

    it('retrieves delegations by delegate without delegator', () => {
      const { controller } = createController();
      controller.store(DELEGATION_MOCK);

      const result = controller.retrieve({
        delegate: DELEGATION_MOCK.delegate,
      });

      expect(result).toHaveLength(1);
      expect(result[0].data.delegate).toBe(DELEGATION_MOCK.delegate);
    });

    it('retrieves multiple delegations by delegate', () => {
      const { controller } = createController();
      const delegation2 = {
        ...DELEGATION_MOCK,
        delegator: '0x9234567890123456789012345678901234567890' as Address,
      };
      controller.store(DELEGATION_MOCK);
      controller.store(delegation2);

      const result = controller.retrieve({
        delegate: DELEGATION_MOCK.delegate,
      });

      expect(result).toHaveLength(2);
      expect(result[0].data.delegate).toBe(DELEGATION_MOCK.delegate);
      expect(result[1].data.delegate).toBe(DELEGATION_MOCK.delegate);
    });

    it('retrieves multiple delegations by delegator', () => {
      const { controller } = createController();
      const delegation2 = {
        ...DELEGATION_MOCK,
        delegate: '0x9234567890123456789012345678901234567890' as Address,
      };
      controller.store(DELEGATION_MOCK);
      controller.store(delegation2);

      const result = controller.retrieve({
        delegator: DELEGATION_MOCK.delegator,
      });

      expect(result).toHaveLength(2);
      expect(result[0].data.delegator).toBe(DELEGATION_MOCK.delegator);
      expect(result[1].data.delegator).toBe(DELEGATION_MOCK.delegator);
    });

    it('filters multiple delegations by delegate and delegator', () => {
      const { controller } = createController();
      const delegation2 = {
        ...DELEGATION_MOCK,
        delegate: '0x9234567890123456789012345678901234567890' as Address,
      };
      const delegation3 = {
        ...DELEGATION_MOCK,
        delegator: '0x8234567890123456789012345678901234567890' as Address,
      };
      controller.store(DELEGATION_MOCK);
      controller.store(delegation2);
      controller.store(delegation3);

      const result = controller.retrieve({
        delegate: DELEGATION_MOCK.delegate,
        delegator: DELEGATION_MOCK.delegator,
      });

      expect(result).toHaveLength(1);
      expect(result[0].data.delegate).toBe(DELEGATION_MOCK.delegate);
      expect(result[0].data.delegator).toBe(DELEGATION_MOCK.delegator);
    });

    it('filters multiple delegations by delegate and label', () => {
      const { controller } = createController();
      const delegation2 = {
        ...DELEGATION_MOCK,
        delegate: '0x9234567890123456789012345678901234567890' as Address,
      };
      const hash = getDelegationHashOffchain(DELEGATION_MOCK) as Hex;
      controller.store(DELEGATION_MOCK);
      controller.store(delegation2);
      controller.testUpdate((state) => {
        state.delegations[hash].meta.label = 'test-label';
      });

      const result = controller.retrieve({
        delegate: DELEGATION_MOCK.delegate,
        label: 'test-label',
      });

      expect(result).toHaveLength(1);
      expect(result[0].data.delegate).toBe(DELEGATION_MOCK.delegate);
      expect(result[0].meta.label).toBe('test-label');
    });

    it('filters multiple delegations by delegator and label', () => {
      const { controller } = createController();
      const delegation2 = {
        ...DELEGATION_MOCK,
        delegator: '0x8234567890123456789012345678901234567890' as Address,
      };
      const hash = getDelegationHashOffchain(DELEGATION_MOCK) as Hex;
      controller.store(DELEGATION_MOCK);
      controller.store(delegation2);
      controller.testUpdate((state) => {
        state.delegations[hash].meta.label = 'test-label';
      });

      const result = controller.retrieve({
        delegator: DELEGATION_MOCK.delegator,
        label: 'test-label',
      });

      expect(result).toHaveLength(1);
      expect(result[0].data.delegator).toBe(DELEGATION_MOCK.delegator);
      expect(result[0].meta.label).toBe('test-label');
    });

    it('returns empty array when no delegations match label', () => {
      const { controller } = createController();
      controller.store(DELEGATION_MOCK);

      const result = controller.retrieve({
        delegate: DELEGATION_MOCK.delegate,
        label: 'non-existent-label',
      });

      expect(result).toHaveLength(0);
    });

    it('filters by label', () => {
      const { controller } = createController();
      const hash = getDelegationHashOffchain(DELEGATION_MOCK);
      controller.store(DELEGATION_MOCK);
      controller.testUpdate((state) => {
        state.delegations[hash].meta.label = 'test-label';
      });

      const result = controller.retrieve({
        delegator: DELEGATION_MOCK.delegator,
        label: 'test-label',
      });

      expect(result).toHaveLength(1);
      expect(result[0].meta.label).toBe('test-label');
    });

    it('combines filters', () => {
      const { controller } = createController();
      controller.store(DELEGATION_MOCK);

      const result = controller.retrieve({
        delegator: DELEGATION_MOCK.delegator,
        delegate: DELEGATION_MOCK.delegate,
        label: '',
      });

      expect(result).toHaveLength(1);
      expect(result[0].data.delegator).toBe(DELEGATION_MOCK.delegator);
      expect(result[0].data.delegate).toBe(DELEGATION_MOCK.delegate);
    });

    it('retrieves delegations by delegate and delegator', () => {
      const { controller } = createController();
      controller.store(DELEGATION_MOCK);

      const result = controller.retrieve({
        delegate: DELEGATION_MOCK.delegate,
        delegator: DELEGATION_MOCK.delegator,
      });

      expect(result).toHaveLength(1);
      expect(result[0].data.delegate).toBe(DELEGATION_MOCK.delegate);
      expect(result[0].data.delegator).toBe(DELEGATION_MOCK.delegator);
    });

    it('filters out non-matching delegator when using delegate filter', () => {
      const { controller } = createController();
      controller.store(DELEGATION_MOCK);

      const result = controller.retrieve({
        delegate: DELEGATION_MOCK.delegate,
        delegator: '0x9234567890123456789012345678901234567890' as Address,
      });

      expect(result).toHaveLength(0);
    });

    it('filters by matching delegator when using delegate filter', () => {
      const { controller } = createController();
      controller.store(DELEGATION_MOCK);

      const result = controller.retrieve({
        delegate: DELEGATION_MOCK.delegate,
        delegator: DELEGATION_MOCK.delegator,
      });

      expect(result).toHaveLength(1);
      expect(result[0].data.delegate).toBe(DELEGATION_MOCK.delegate);
      expect(result[0].data.delegator).toBe(DELEGATION_MOCK.delegator);
    });

    it('filters by label with delegate filter', () => {
      const { controller } = createController();
      const hash = getDelegationHashOffchain(DELEGATION_MOCK);
      controller.store(DELEGATION_MOCK);
      controller.testUpdate((state) => {
        state.delegations[hash].meta.label = 'test-label';
      });

      const result = controller.retrieve({
        delegate: DELEGATION_MOCK.delegate,
        label: 'test-label',
      });

      expect(result).toHaveLength(1);
      expect(result[0].meta.label).toBe('test-label');
    });

    it('filters by label with delegator filter', () => {
      const { controller } = createController();
      const hash = getDelegationHashOffchain(DELEGATION_MOCK);
      controller.store(DELEGATION_MOCK);
      controller.testUpdate((state) => {
        state.delegations[hash].meta.label = 'test-label';
      });

      const result = controller.retrieve({
        delegator: DELEGATION_MOCK.delegator,
        label: 'test-label',
      });

      expect(result).toHaveLength(1);
      expect(result[0].meta.label).toBe('test-label');
    });

    it('filters by delegator, delegate, and label', () => {
      const { controller } = createController();
      const hash = getDelegationHashOffchain(DELEGATION_MOCK);
      controller.store(DELEGATION_MOCK);
      controller.testUpdate((state) => {
        state.delegations[hash].meta.label = 'test-label';
      });

      const result = controller.retrieve({
        delegator: DELEGATION_MOCK.delegator,
        delegate: DELEGATION_MOCK.delegate,
        label: 'test-label',
      });

      expect(result).toHaveLength(1);
      expect(result[0].meta.label).toBe('test-label');
      expect(result[0].data.delegator).toBe(DELEGATION_MOCK.delegator);
      expect(result[0].data.delegate).toBe(DELEGATION_MOCK.delegate);
    });

    it('handles empty state', () => {
      const { controller } = createController();
      const result = controller.retrieve({ hash: '0x123' as Hex });
      expect(result).toHaveLength(0);
    });

    it('handles multiple delegations with same label', () => {
      const { controller } = createController();
      const delegation2 = {
        ...DELEGATION_MOCK,
        delegator: '0x9234567890123456789012345678901234567890' as Address,
      };
      controller.store(DELEGATION_MOCK);
      controller.store(delegation2);
      controller.testUpdate((state) => {
        state.delegations[
          getDelegationHashOffchain(DELEGATION_MOCK)
        ].meta.label = 'test-label';
        state.delegations[getDelegationHashOffchain(delegation2)].meta.label =
          'test-label';
      });

      const result = controller.retrieve({
        delegator: DELEGATION_MOCK.delegator,
        label: 'test-label',
      });
      expect(result).toHaveLength(1);
      expect(result[0].meta.label).toBe('test-label');
    });

    it('handles case where no delegations match filter', () => {
      const { controller } = createController();
      controller.store(DELEGATION_MOCK);

      const result = controller.retrieve({
        delegator: '0x9234567890123456789012345678901234567890' as Address,
        delegate: '0x9234567890123456789012345678901234567890' as Address,
        label: 'non-existent',
      });

      expect(result).toHaveLength(0);
    });
  });

  describe('delete', () => {
    it('deletes delegation by hash', () => {
      const { controller } = createController();
      const hash = getDelegationHashOffchain(DELEGATION_MOCK);
      controller.store(DELEGATION_MOCK);

      const deleted = controller.delete({ hash });

      expect(deleted).toHaveLength(1);
      expect(controller.state.delegations[hash]).toBeUndefined();
    });

    it('deletes delegations by delegator', () => {
      const { controller } = createController();
      controller.store(DELEGATION_MOCK);

      const deleted = controller.delete({
        delegator: DELEGATION_MOCK.delegator,
      });

      expect(deleted).toHaveLength(1);
      expect(Object.values(controller.state.delegations)).toHaveLength(0);
    });

    it('deletes delegations by delegate', () => {
      const { controller } = createController();
      controller.store(DELEGATION_MOCK);

      const deleted = controller.delete({ delegate: DELEGATION_MOCK.delegate });

      expect(deleted).toHaveLength(1);
      expect(Object.values(controller.state.delegations)).toHaveLength(0);
    });

    it('deletes delegations by label', () => {
      const { controller } = createController();
      const hash = getDelegationHashOffchain(DELEGATION_MOCK);
      controller.store(DELEGATION_MOCK);
      controller.testUpdate((state) => {
        state.delegations[hash].meta.label = 'test-label';
      });

      const deleted = controller.delete({
        delegator: DELEGATION_MOCK.delegator,
        label: 'test-label',
      });

      expect(deleted).toHaveLength(1);
      expect(controller.state.delegations[hash]).toBeUndefined();
    });

    it('combines filters for deletion', () => {
      const { controller } = createController();
      controller.store(DELEGATION_MOCK);

      const deleted = controller.delete({
        delegator: DELEGATION_MOCK.delegator,
        delegate: DELEGATION_MOCK.delegate,
        label: '',
      });

      expect(deleted).toHaveLength(1);
      expect(Object.values(controller.state.delegations)).toHaveLength(0);
    });

    it('handles deleting non-existent delegation', () => {
      const { controller } = createController();
      const deleted = controller.delete({ hash: '0x123' as Hex });
      expect(deleted).toHaveLength(0);
    });

    it('handles deleting with empty filter', () => {
      const { controller } = createController();
      controller.store(DELEGATION_MOCK);
      const deleted = controller.delete({ hash: '0x123' as Hex });
      expect(deleted).toHaveLength(0);
    });

    it('handles deleting multiple delegations with same label', () => {
      const { controller } = createController();
      const delegation2 = {
        ...DELEGATION_MOCK,
        delegator: '0x9234567890123456789012345678901234567890' as Address,
      };
      controller.store(DELEGATION_MOCK);
      controller.store(delegation2);
      controller.testUpdate((state) => {
        state.delegations[
          getDelegationHashOffchain(DELEGATION_MOCK)
        ].meta.label = 'test-label';
        state.delegations[getDelegationHashOffchain(delegation2)].meta.label =
          'test-label';
      });

      const deleted = controller.delete({
        delegator: DELEGATION_MOCK.delegator,
        label: 'test-label',
      });
      expect(deleted).toHaveLength(1);
      expect(Object.values(controller.state.delegations)).toHaveLength(1);
      expect(
        controller.state.delegations[getDelegationHashOffchain(delegation2)],
      ).toBeDefined();
    });
  });
});
