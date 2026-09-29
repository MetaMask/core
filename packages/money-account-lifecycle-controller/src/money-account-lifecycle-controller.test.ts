import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';

import type {
  DerivedIdentitiesResponse,
  DerivedIdentity,
} from './chomp-api-service-derived-identities.js';
import { MoneyAccountLifecycleController } from './money-account-lifecycle-controller.js';
import type { MoneyAccountLifecycleControllerMessenger } from './money-account-lifecycle-controller.js';

describe('MoneyAccountLifecycleController', () => {
  describe('constructor', () => {
    it('fills in missing initial state with defaults', async () => {
      await withController(({ controller }) => {
        expect(controller.state).toStrictEqual({});
      });
    });

    it('delegates ChompApiService:getDerivedIdentities to the controller messenger', async () => {
      const identity = buildDerivedIdentity({ status: 'MIGRATING' });

      await withController(
        { getDerivedIdentitiesResponse: { identities: [identity] } },
        async ({ messenger, mockGetDerivedIdentities }) => {
          const response = await messenger.call(
            'ChompApiService:getDerivedIdentities',
          );

          expect(response).toStrictEqual({ identities: [identity] });
          expect(mockGetDerivedIdentities).toHaveBeenCalledTimes(1);
        },
      );
    });
  });
});

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<MoneyAccountLifecycleControllerMessenger>,
  MessengerEvents<MoneyAccountLifecycleControllerMessenger>
>;

type WithControllerCallback<ReturnValue> = (payload: {
  controller: MoneyAccountLifecycleController;
  rootMessenger: RootMessenger;
  messenger: MoneyAccountLifecycleControllerMessenger;
  mockGetDerivedIdentities: jest.Mock<Promise<DerivedIdentitiesResponse>>;
}) => Promise<ReturnValue> | ReturnValue;

type WithControllerOptions = {
  options?: Partial<
    ConstructorParameters<typeof MoneyAccountLifecycleController>[0]
  >;
  getDerivedIdentitiesResponse?: DerivedIdentitiesResponse;
};

function buildDerivedIdentity(
  overrides: Partial<DerivedIdentity> = {},
): DerivedIdentity {
  return {
    currentAddress: '0x0000000000000000000000000000000000000001',
    previousAddresses: [],
    status: 'NONE',
    ...overrides,
  };
}

function getRootMessenger(): RootMessenger {
  return new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
    captureException: jest.fn(),
  });
}

function getMessenger(
  rootMessenger: RootMessenger,
): MoneyAccountLifecycleControllerMessenger {
  const messenger: MoneyAccountLifecycleControllerMessenger = new Messenger({
    namespace: 'MoneyAccountLifecycleController',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    actions: ['ChompApiService:getDerivedIdentities'],
    messenger,
  });
  return messenger;
}

async function withController<ReturnValue>(
  ...args:
    | [WithControllerCallback<ReturnValue>]
    | [WithControllerOptions, WithControllerCallback<ReturnValue>]
): Promise<ReturnValue> {
  const [{ options = {}, getDerivedIdentitiesResponse }, testFunction] =
    args.length === 2 ? args : [{}, args[0]];
  const rootMessenger = getRootMessenger();
  const mockGetDerivedIdentities = jest
    .fn<Promise<DerivedIdentitiesResponse>, []>()
    .mockResolvedValue(getDerivedIdentitiesResponse ?? { identities: [] });
  rootMessenger.registerActionHandler(
    'ChompApiService:getDerivedIdentities',
    mockGetDerivedIdentities,
  );
  const messenger = getMessenger(rootMessenger);
  const controller = new MoneyAccountLifecycleController({
    messenger,
    ...options,
  });
  return await testFunction({
    controller,
    rootMessenger,
    messenger,
    mockGetDerivedIdentities,
  });
}
