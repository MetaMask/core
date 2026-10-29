import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import { describe, expect, it, vi } from 'vitest';

import type { RecoveryRegistrationLockProviderMessenger } from './recovery-registration-lock-provider.js';
import { RecoveryRegistrationLockProvider } from './recovery-registration-lock-provider.js';

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<RecoveryRegistrationLockProviderMessenger>,
  MessengerEvents<RecoveryRegistrationLockProviderMessenger>
>;

/**
 * Builds a provider backed by mock AuthenticationController actions.
 *
 * @param response - The response `fetch` resolves with.
 * @returns The provider and its mocks.
 */
function setup(response = new Response(null, { status: 204 })): {
  provider: RecoveryRegistrationLockProvider;
  fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  calls: string[];
} {
  const calls: string[] = [];
  const rootMessenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });
  const messenger: RecoveryRegistrationLockProviderMessenger = new Messenger({
    namespace: 'RecoveryRegistrationLockProvider',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    actions: [
      'AuthenticationController:getBearerToken',
      'AuthenticationController:refreshCanonicalProfileId',
    ],
    events: [],
    messenger,
  });
  rootMessenger.registerActionHandler(
    'AuthenticationController:getBearerToken',
    async () => {
      calls.push('getBearerToken');
      return 'hydra-token';
    },
  );
  rootMessenger.registerActionHandler(
    'AuthenticationController:refreshCanonicalProfileId',
    async () => {
      calls.push('refreshCanonicalProfileId');
      return 'profile-1';
    },
  );
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);
  return {
    provider: new RecoveryRegistrationLockProvider({
      baseUrl: 'https://registration.example/',
      messenger,
      fetch: fetchMock,
    }),
    fetchMock,
    calls,
  };
}

describe('RecoveryRegistrationLockProvider', () => {
  it.each([
    [
      'acquire',
      'POST',
      '/recovery/lock',
      { body: JSON.stringify({ lock_id: 'operation-1' }) },
    ],
    ['renew', 'PUT', '/recovery/lock/operation-1', {}],
    ['release', 'DELETE', '/recovery/lock/operation-1', {}],
  ] as const)(
    'sends an authenticated %s request',
    async (action, method, path, body) => {
      const { provider, fetchMock } = setup();

      await provider[action]('operation-1');

      expect(fetchMock).toHaveBeenCalledWith(
        `https://registration.example${path}`,
        {
          method,
          headers: {
            Authorization: 'Bearer hydra-token',
            'Content-Type': 'application/json',
          },
          ...body,
        },
      );
    },
  );

  it('refreshes the canonical profile before acquiring, so the bearer sub is current', async () => {
    const { provider, calls } = setup();

    await provider.acquire('operation-1');

    expect(calls).toStrictEqual([
      'refreshCanonicalProfileId',
      'getBearerToken',
    ]);
  });

  it.each([
    [409, 'recovery_lock_conflict'],
    [503, 'recovery_lock_unavailable'],
  ])('maps HTTP %i to %s', async (status, code) => {
    const { provider } = setup(new Response(null, { status }));

    await expect(provider.renew('operation-1')).rejects.toMatchObject({
      code,
    });
  });
});
