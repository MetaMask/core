import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import type { ChompApiServiceMessenger } from './chomp-api-service';
import { ChompApiService } from './chomp-api-service';

const BASE_URL = 'https://api.chomp.example.com';
const MOCK_TOKEN = 'mock-jwt-token';

describe('ChompApiService', () => {
  describe('constructor', () => {
    it('can be constructed with baseUrl, getAccessToken, and messenger', () => {
      const { service } = createService();
      expect(service).toBeInstanceOf(ChompApiService);
    });

    it('accepts a custom fetch implementation', () => {
      const customFetch = jest.fn();
      const { service } = createService({
        options: { fetchFn: customFetch as unknown as typeof globalThis.fetch },
      });
      expect(service).toBeInstanceOf(ChompApiService);
    });
  });

  describe('associateAddress', () => {
    // TODO: Test POST /v1/auth/address with correct URL, method, headers
    //   (Authorization: Bearer <token>), and JSON body { signature, timestamp, address }.
    // TODO: Test that 200 returns { profileId, address, status }.
    // TODO: Test that 409 returns the response body (not throws).
    // TODO: Test that other non-OK statuses throw.
    // TODO: Test response validation rejects malformed responses.
    it('is registered as a messenger action', async () => {
      const { service } = createService();
      await expect(service.associateAddress({
        signature: '0x123',
        timestamp: '2026-01-01T00:00:00Z',
        address: '0xabc',
      })).rejects.toThrow('Not implemented');
    });
  });

  describe('createUpgrade', () => {
    // TODO: Test POST /v1/account-upgrade with correct URL, method, headers
    //   (Authorization: Bearer <token>), and JSON body { r, s, v, yParity, address, chainId, nonce }.
    // TODO: Test that 200 returns { signerAddress, status, createdAt }.
    // TODO: Test that non-OK statuses throw.
    // TODO: Test response validation rejects malformed responses.
    it('is registered as a messenger action', async () => {
      const { service } = createService();
      await expect(service.createUpgrade({
        r: '0x1',
        s: '0x2',
        v: 27,
        yParity: 0,
        address: '0xabc',
        chainId: '1',
        nonce: '0',
      })).rejects.toThrow('Not implemented');
    });
  });

  describe('getUpgrade', () => {
    // TODO: Test GET /v1/account-upgrade/:address with correct URL, method,
    //   and headers (Authorization: Bearer <token>).
    // TODO: Test that 200 returns the upgrade record.
    // TODO: Test that 404 returns null.
    // TODO: Test that other non-OK statuses throw.
    // TODO: Test response validation rejects malformed responses.
    it('is registered as a messenger action', async () => {
      const { service } = createService();
      await expect(service.getUpgrade('0xabc')).rejects.toThrow(
        'Not implemented',
      );
    });
  });

  describe('verifyDelegation', () => {
    // TODO: Test POST /v1/intent/verify-delegation with correct URL, method,
    //   headers (Authorization: Bearer <token>), and JSON body { signedDelegation, chainId }.
    // TODO: Test that 200 returns { valid, delegationHash?, errors? }.
    // TODO: Test that non-OK statuses throw.
    // TODO: Test response validation rejects malformed responses.
    it('is registered as a messenger action', async () => {
      const { service } = createService();
      await expect(service.verifyDelegation({
        signedDelegation: '0x123',
        chainId: '1',
      })).rejects.toThrow('Not implemented');
    });
  });

  describe('createIntents', () => {
    // TODO: Test POST /v1/intent with correct URL, method, headers
    //   (Authorization: Bearer <token>), and JSON body (array of intents).
    // TODO: Test that 200 returns SendIntentResponse[].
    // TODO: Test that non-OK statuses throw.
    // TODO: Test response validation rejects malformed responses.
    it('is registered as a messenger action', async () => {
      const { service } = createService();
      await expect(service.createIntents([{ foo: 'bar' }])).rejects.toThrow(
        'Not implemented',
      );
    });
  });

  describe('getIntentsByAddress', () => {
    // TODO: Test GET /v1/intent/account/:address with correct URL, method,
    //   and headers (Authorization: Bearer <token>).
    // TODO: Test that 200 returns an array of intents.
    // TODO: Test that non-OK statuses throw.
    // TODO: Test response validation rejects malformed responses.
    it('is registered as a messenger action', async () => {
      const { service } = createService();
      await expect(service.getIntentsByAddress('0xabc')).rejects.toThrow(
        'Not implemented',
      );
    });
  });

  describe('createWithdrawal', () => {
    // TODO: Confirm endpoint path against CHOMP API docs.
    // TODO: Test POST to the withdrawal endpoint with correct URL, method,
    //   headers (Authorization: Bearer <token>), and JSON body.
    // TODO: Test that 200 returns the withdrawal result.
    // TODO: Test that non-OK statuses throw.
    // TODO: Test response validation rejects malformed responses.
    it('is registered as a messenger action', async () => {
      const { service } = createService();
      await expect(service.createWithdrawal({})).rejects.toThrow(
        'Not implemented',
      );
    });
  });
});

/**
 * The type of the messenger populated with all external actions and events
 * required by the service under test.
 */
type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<ChompApiServiceMessenger>,
  MessengerEvents<ChompApiServiceMessenger>
>;

/**
 * Constructs the messenger populated with all external actions and events
 * required by the service under test.
 *
 * @returns The root messenger.
 */
function createRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

/**
 * Constructs the messenger for the service under test.
 *
 * @param rootMessenger - The root messenger, with all external actions and
 * events required by the controller's messenger.
 * @returns The service-specific messenger.
 */
function createServiceMessenger(
  rootMessenger: RootMessenger,
): ChompApiServiceMessenger {
  return new Messenger({
    namespace: 'ChompApiService',
    parent: rootMessenger,
  });
}

/**
 * Constructs the service under test.
 *
 * @param args - The arguments to this function.
 * @param args.options - The options that the service constructor takes. All are
 * optional and will be filled in with defaults as needed (including
 * `messenger`).
 * @returns The new service, root messenger, and service messenger.
 */
function createService({
  options = {},
}: {
  options?: Partial<ConstructorParameters<typeof ChompApiService>[0]>;
} = {}): {
  service: ChompApiService;
  rootMessenger: RootMessenger;
  messenger: ChompApiServiceMessenger;
} {
  const rootMessenger = createRootMessenger();
  const messenger = createServiceMessenger(rootMessenger);
  const service = new ChompApiService({
    baseUrl: BASE_URL,
    getAccessToken: async () => MOCK_TOKEN,
    messenger,
    ...options,
  });

  return { service, rootMessenger, messenger };
}
