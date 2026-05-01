import { deriveStateFromMetadata } from '@metamask/base-controller';
import { SignTypedDataVersion } from '@metamask/keyring-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import { hexToNumber } from '@metamask/utils';

import { ROOT_AUTHORITY } from './constants';
import { controllerName, DelegationController } from './DelegationController';
import type {
  Address,
  Delegation,
  DelegationControllerMessenger,
  DelegationControllerState,
  DeleGatorEnvironment,
  Hex,
} from './types';
import { toDelegationStruct } from './utils';

type AllDelegationControllerActions =
  MessengerActions<DelegationControllerMessenger>;

type AllDelegationControllerEvents =
  MessengerEvents<DelegationControllerMessenger>;

type RootMessenger = Messenger<
  MockAnyNamespace,
  AllDelegationControllerActions,
  AllDelegationControllerEvents
>;

const FROM_MOCK = '0x2234567890123456789012345678901234567890' as Address;
const SIGNATURE_HASH_MOCK = '0x123ABC';

const CHAIN_ID_MOCK = '0xaa36a7';

const VERIFYING_CONTRACT_MOCK: Address =
  '0x00000000000000000000000000000000000321fde';

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
  const messenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });

  const keyringControllerSignTypedMessageMock = jest.fn();

  keyringControllerSignTypedMessageMock.mockResolvedValue(SIGNATURE_HASH_MOCK);

  messenger.registerActionHandler(
    'KeyringController:signTypedMessage',
    keyringControllerSignTypedMessageMock,
  );

  const delegationControllerMessenger = new Messenger<
    'DelegationController',
    AllDelegationControllerActions,
    AllDelegationControllerEvents,
    RootMessenger
  >({
    namespace: controllerName,
    parent: messenger,
  });
  messenger.delegate({
    messenger: delegationControllerMessenger,
    actions: ['KeyringController:signTypedMessage'],
  });

  return {
    keyringControllerSignTypedMessageMock,
    messenger: delegationControllerMessenger,
    rootMessenger: messenger,
  };
}

/**
 * Create a mock getDelegationEnvironment function.
 *
 * @param _chainId - The chainId to return the environment for.
 * @returns The mock environment object.
 */
function getDelegationEnvironmentMock(_chainId: Hex): DeleGatorEnvironment {
  return {
    DelegationManager: VERIFYING_CONTRACT_MOCK,
    EntryPoint: VERIFYING_CONTRACT_MOCK,
    SimpleFactory: VERIFYING_CONTRACT_MOCK,
    caveatEnforcers: {},
    implementations: {},
  };
}

/**
 * Create a controller instance for testing.
 *
 * @param state - The initial state to use for the controller.
 * @returns The controller instance plus individual mock functions for each action.
 */
function createController(state?: DelegationControllerState) {
  const { messenger, rootMessenger, ...mocks } = createMessengerMock();
  const controller = new TestDelegationController({
    messenger,
    state,
    getDelegationEnvironment: getDelegationEnvironmentMock,
  });

  return {
    controller,
    rootMessenger,
    ...mocks,
  };
}

describe(`${controllerName}`, () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('constructor', () => {
    it('initializes with default state', () => {
      const { controller } = createController();
      expect(controller.state).toStrictEqual({});
    });
  });

  describe('sign', () => {
    it('signs a delegation message', async () => {
      const { rootMessenger, keyringControllerSignTypedMessageMock } =
        createController();

      const signature = await rootMessenger.call(
        'DelegationController:signDelegation',
        {
          delegation: DELEGATION_MOCK,
          chainId: CHAIN_ID_MOCK,
        },
      );

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
              verifyingContract: VERIFYING_CONTRACT_MOCK,
            }),
            message: toDelegationStruct(DELEGATION_MOCK),
          }),
          from: DELEGATION_MOCK.delegator,
        }),
        SignTypedDataVersion.V4,
      );
    });

    it('throws if signature fails', async () => {
      const { rootMessenger, keyringControllerSignTypedMessageMock } =
        createController();
      keyringControllerSignTypedMessageMock.mockRejectedValue(
        new Error('Signature failed'),
      );

      await expect(
        rootMessenger.call('DelegationController:signDelegation', {
          delegation: {
            ...DELEGATION_MOCK,
            salt: '0x1' as Hex,
          },
          chainId: CHAIN_ID_MOCK,
        }),
      ).rejects.toThrow('Signature failed');
    });
  });

  describe('metadata', () => {
    it('includes expected state in debug snapshots', () => {
      const { controller } = createController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInDebugSnapshot',
        ),
      ).toMatchInlineSnapshot(`{}`);
    });

    it('includes expected state in state logs', () => {
      const { controller } = createController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInStateLogs',
        ),
      ).toMatchInlineSnapshot(`{}`);
    });

    it('persists expected state', () => {
      const { controller } = createController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'persist',
        ),
      ).toMatchInlineSnapshot(`{}`);
    });

    it('includes expected state in UI', () => {
      const { controller } = createController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'usedInUi',
        ),
      ).toMatchInlineSnapshot(`{}`);
    });
  });
});
