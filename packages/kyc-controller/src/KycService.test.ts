import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import nock, { cleanAll } from 'nock';

import type { KycServiceMessenger } from './KycService.js';
import { KycService } from './KycService.js';
import { UKYC_LOCAL_USER_SECRET_SIZE_BYTES } from './ukyc/constants.js';
import { deriveClientMaterial } from './ukyc/deriveClientMaterial.js';
import {
  encodeStorageAccessTokenForHeader,
  signStorageAccessToken,
} from './ukyc/storageAccessToken.js';

const MOCK_API_URL = 'https://kyc-api.dev-api.cx.metamask.io';
const MOCK_FRACTAL_URL = 'https://fractal.dev-api.cx.metamask.io';

describe('KycService', () => {
  afterEach(() => {
    cleanAll();
  });

  describe('getGeoCountry', () => {
    it('maps the geolocation to an ISO alpha-3 country code', async () => {
      const { service } = getService({ geolocation: 'US-NY' });
      expect(await service.getGeoCountry()).toBe('USA');
    });

    it('throws when the location is unknown', async () => {
      const { service } = getService({ geolocation: 'UNKNOWN' });
      await expect(service.getGeoCountry()).rejects.toThrow(
        /Unable to determine country/u,
      );
    });

    it('throws when the country cannot be mapped to alpha-3', async () => {
      const { service } = getService({ geolocation: 'ZZ' });
      await expect(service.getGeoCountry()).rejects.toThrow(
        /Unable to map country code "ZZ"/u,
      );
    });

    it('throws when the location resolves to a nullish value', async () => {
      const { service } = getService({ geolocation: null });
      await expect(service.getGeoCountry()).rejects.toThrow(
        /Unable to determine country/u,
      );
    });

    it('constructs with the default service policy options', async () => {
      const { service } = getService({
        defaultPolicy: true,
        geolocation: 'US',
      });
      expect(await service.getGeoCountry()).toBe('USA');
    });
  });

  describe('Money Account wallet registration', () => {
    it('resolves the Iron customer id via neobank customer lookup', async () => {
      nock(MOCK_API_URL)
        .get('/neobank/customers/canonical-profile-1/external')
        .matchHeader('authorization', 'Bearer test-bearer')
        .reply(200, {
          id: 'iron-customer-1',
          external_id: 'canonical-profile-1',
        });

      const { service } = getService();

      expect(await service.getMoonpayCustomerId()).toBe('iron-customer-1');
    });

    it('checks Monad wallet registration status for a customer', async () => {
      nock(MOCK_API_URL)
        .get('/neobank/addresses/crypto/iron-customer-1')
        .query({ filter: 'SelfHosted' })
        .reply(200, []);

      const { service } = getService();

      expect(
        await service.getWalletRegistrationStatus({
          customerId: 'iron-customer-1',
          address: '0xabc',
        }),
      ).toStrictEqual({ type: 'absent' });
    });

    it('submits a signed Monad wallet ownership proof with Idempotency-Key', async () => {
      nock(MOCK_API_URL)
        .post(
          '/neobank/addresses/crypto/selfhosted',
          {
            customer_id: 'iron-customer-1',
            address: '0xabc',
            blockchain: 'Monad',
            message: 'ownership message',
            signature: '0xsig',
          },
          { reqheaders: { 'idempotency-key': 'idem-1' } },
        )
        .reply(200, {
          id: 'wallet-1',
          address: '0xabc',
          disabled: false,
        });

      const { service } = getService();

      expect(
        await service.registerSelfHostedWallet({
          customerId: 'iron-customer-1',
          address: '0xabc',
          message: 'ownership message',
          signature: '0xsig',
          idempotencyKey: 'idem-1',
        }),
      ).toMatchObject({
        type: 'registered',
        registration: { id: 'wallet-1', blockchain: 'Monad' },
      });
    });

    it('uses neobankBaseUrl when provided for wallet routes', async () => {
      const neobankUrl = 'https://on-ramp.dev-api.cx.metamask.io';
      nock(neobankUrl)
        .get('/neobank/customers/canonical-profile-1/external')
        .reply(200, { id: 'iron-customer-1' });

      const { service } = getService({ neobankBaseUrl: neobankUrl });

      expect(await service.getMoonpayCustomerId()).toBe('iron-customer-1');
    });

    it('throws when the session profile has no usable external id', async () => {
      const { service } = getService({ canonicalProfileId: '' });

      await expect(service.getMoonpayCustomerId()).rejects.toThrow(
        /Unable to resolve MetaMask canonical profile id/u,
      );
    });
  });

  describe('fetchDisclaimers', () => {
    it('returns the disclaimers for a country', async () => {
      const disclaimers = [
        { id: '1', display_name: 'Terms', url: 'https://t' },
      ];
      nock(MOCK_API_URL)
        .get('/vendors/moonpay/disclaimers')
        .query({ country: 'USA' })
        .reply(200, disclaimers);
      const { service } = getService();

      expect(await service.fetchDisclaimers({ country: 'USA' })).toStrictEqual(
        disclaimers,
      );
    });

    it('throws on a malformed response', async () => {
      nock(MOCK_API_URL)
        .get('/vendors/moonpay/disclaimers')
        .query({ country: 'USA' })
        .reply(200, [{ id: 1 }]);
      const { service } = getService();

      await expect(
        service.fetchDisclaimers({ country: 'USA' }),
      ).rejects.toThrow(/Malformed response received from disclaimers API/u);
    });

    it('throws when no bearer token is available', async () => {
      const { service } = getService({ bearerToken: '' });
      await expect(
        service.fetchDisclaimers({ country: 'USA' }),
      ).rejects.toThrow(/Unable to obtain an authentication bearer token/u);
    });

    it('throws an HttpError on a non-ok response', async () => {
      nock(MOCK_API_URL)
        .get('/vendors/moonpay/disclaimers')
        .query({ country: 'USA' })
        .reply(500);
      const { service } = getService();

      await expect(
        service.fetchDisclaimers({ country: 'USA' }),
      ).rejects.toThrow(/failed with status '500'/u);
    });
  });

  describe('createSession', () => {
    it('creates a session and returns the token', async () => {
      nock(MOCK_API_URL)
        .post('/vendors/moonpay/sessions')
        .reply(200, { sessionToken: 'session-1' });
      const { service } = getService();

      expect(
        await service.createSession({
          email: 'a@b.co',
          termsAcceptedAt: '2026-01-01T00:00:00.000Z',
          disclaimerIds: ['1'],
        }),
      ).toStrictEqual({ sessionToken: 'session-1' });
    });

    it('throws on a malformed response', async () => {
      nock(MOCK_API_URL).post('/vendors/moonpay/sessions').reply(200, {});
      const { service } = getService();

      await expect(
        service.createSession({
          email: 'a@b.co',
          termsAcceptedAt: '2026-01-01T00:00:00.000Z',
          disclaimerIds: ['1'],
        }),
      ).rejects.toThrow(/Malformed response received from sessions API/u);
    });
  });

  describe('checkKycRequired', () => {
    it('returns whether KYC is required (default capabilities)', async () => {
      nock(MOCK_API_URL)
        .post('/vendors/moonpay/kyc-required', {
          accessToken: 'access-1',
          country: 'USA',
          capabilities: [{ product: 'ramps' }],
        })
        .reply(200, { required: true });
      const { service } = getService();

      expect(
        await service.checkKycRequired({
          accessToken: 'access-1',
          country: 'USA',
        }),
      ).toStrictEqual({ kycRequired: true });
    });

    it('passes provided capabilities', async () => {
      nock(MOCK_API_URL)
        .post('/vendors/moonpay/kyc-required', {
          accessToken: 'access-1',
          country: 'USA',
          capabilities: [{ product: 'card' }],
        })
        .reply(200, { required: false });
      const { service } = getService();

      expect(
        await service.checkKycRequired({
          accessToken: 'access-1',
          country: 'USA',
          capabilities: [{ product: 'card' }],
        }),
      ).toStrictEqual({ kycRequired: false });
    });

    it('throws on a malformed response', async () => {
      nock(MOCK_API_URL).post('/vendors/moonpay/kyc-required').reply(200, {});
      const { service } = getService();

      await expect(
        service.checkKycRequired({ accessToken: 'access-1', country: 'USA' }),
      ).rejects.toThrow(/Malformed response received from kyc-required API/u);
    });

    it('surfaces the specific field mismatch and payload in the error', async () => {
      nock(MOCK_API_URL)
        .post('/vendors/moonpay/kyc-required')
        .reply(200, { required: 'yes' });
      const { service } = getService();

      await expect(
        service.checkKycRequired({ accessToken: 'access-1', country: 'USA' }),
      ).rejects.toThrow(
        /Malformed response received from kyc-required API:.*required.*received: \{"required":"yes"\}/su,
      );
    });
  });

  describe('getWrappingKey', () => {
    it('requests a wrapping key and returns the attested server key', async () => {
      const response = {
        id: 'wk',
        jwtChain: 'jwt.chain.sig',
        sessionServerPublicKey: { kty: 'OKP', crv: 'X25519', x: 'spk-x' },
      };
      nock(MOCK_API_URL)
        .post('/wrapping-key', { sessionClientPublicKey: 'cpk' })
        .reply(200, response);
      const { service } = getService();

      expect(
        await service.getWrappingKey({ sessionClientPublicKey: 'cpk' }),
      ).toStrictEqual(response);
    });

    it('throws on a malformed response', async () => {
      nock(MOCK_API_URL).post('/wrapping-key').reply(200, { id: 'wk' });
      const { service } = getService();

      await expect(
        service.getWrappingKey({ sessionClientPublicKey: 'cpk' }),
      ).rejects.toThrow(/Malformed response received from wrapping-key API/u);
    });
  });

  describe('fetchJwks', () => {
    it('fetches the JWKS from the Fractal well-known path', async () => {
      const response = {
        keys: [{ kty: 'OKP', crv: 'Ed25519', x: 'pub', kid: 'k1' }],
      };
      nock(MOCK_FRACTAL_URL).get('/.well-known/jwks.json').reply(200, response);
      const { service } = getService();

      expect(await service.fetchJwks()).toStrictEqual(response);
    });

    it('throws when no Fractal base URL is configured', async () => {
      // Omit the option entirely so the constructor falls back to ''.
      const { service } = getService({ fractalEncryptionBaseUrl: null });

      await expect(service.fetchJwks()).rejects.toThrow(
        /fractalEncryptionBaseUrl is not configured/u,
      );
    });

    it('throws on a malformed response', async () => {
      nock(MOCK_FRACTAL_URL)
        .get('/.well-known/jwks.json')
        .reply(200, { keys: [{ kty: 'OKP' }] });
      const { service } = getService();

      await expect(service.fetchJwks()).rejects.toThrow(
        /Malformed response received from JWKS API/u,
      );
    });
  });

  describe('createUkycSession', () => {
    const wrappedEncryptionKey = {
      sessionId: 'wk',
      encryptedKey: 'enc',
      nonce: 'nonce',
    };

    // A genuinely signed, read-only capability token: minted from real derived
    // client material and signed with the Ed25519 `signingKey`, not a
    // hand-written plain object.
    const material = deriveClientMaterial(
      new Uint8Array(UKYC_LOCAL_USER_SECRET_SIZE_BYTES).fill(42),
    );
    const ukycCapabilityToken = signStorageAccessToken({
      material,
      operations: ['read'],
      issuedAt: new Date('2026-07-07T00:00:00.000Z'),
      expiresAt: new Date('2026-07-07T04:00:00.000Z'),
    });
    // The service base64url-encodes the envelope into a compact string before
    // sending it in the request body.
    const encodedCapabilityToken =
      encodeStorageAccessTokenForHeader(ukycCapabilityToken);

    it('creates a UKYC session and forwards the wrapped key and capability token', async () => {
      const response = {
        sessionId: 'sid',
      };
      nock(MOCK_API_URL)
        .post(
          '/sessions',
          (body) =>
            body.wrappedEncryptionKey !== undefined &&
            body.ukycCapabilityToken === encodedCapabilityToken,
        )
        .reply(200, response);
      const { service } = getService();

      expect(
        await service.createUkycSession({
          jwtToken: 'jwt',
          vendorMetadata: { foo: 'bar' },
          wrappedEncryptionKey,
          ukycCapabilityToken,
        }),
      ).toStrictEqual(response);
    });

    it('returns the relay and vendor statuses when present', async () => {
      const response = {
        sessionId: 'sid',
        kycStatus: 'approved',
        finalStatus: 'pending',
      };
      nock(MOCK_API_URL).post('/sessions').reply(200, response);
      const { service } = getService();

      expect(
        await service.createUkycSession({
          jwtToken: 'jwt',
          vendorMetadata: { foo: 'bar' },
          wrappedEncryptionKey,
          ukycCapabilityToken,
        }),
      ).toStrictEqual(response);
    });

    it('throws on a malformed response', async () => {
      nock(MOCK_API_URL).post('/sessions').reply(200, { unexpected: true });
      const { service } = getService();

      await expect(
        service.createUkycSession({
          jwtToken: 'jwt',
          vendorMetadata: {},
          wrappedEncryptionKey,
          ukycCapabilityToken,
        }),
      ).rejects.toThrow(/Malformed response received from UKYC sessions API/u);
    });
  });

  describe('createJourney', () => {
    it('fetches the applicant access token for a session', async () => {
      const response = { status: 'ok', applicantAccessToken: 'aat' };
      nock(MOCK_API_URL).post('/sessions/sid/journey').reply(200, response);
      const { service } = getService();

      expect(await service.createJourney('sid')).toStrictEqual(response);
    });

    it('does not send a Content-Type header since it has no body', async () => {
      const response = { status: 'ok', applicantAccessToken: 'aat' };
      nock(MOCK_API_URL)
        .post('/sessions/sid/journey')
        .matchHeader('content-type', (value) => value === undefined)
        .reply(200, response);
      const { service } = getService();

      expect(await service.createJourney('sid')).toStrictEqual(response);
    });

    it('throws on a malformed response', async () => {
      nock(MOCK_API_URL)
        .post('/sessions/sid/journey')
        .reply(200, { status: 'ok' });
      const { service } = getService();

      await expect(service.createJourney('sid')).rejects.toThrow(
        /Malformed response received from journey API/u,
      );
    });
  });

  describe('getSessionStatus', () => {
    it('returns the session status', async () => {
      const response = {
        finalStatus: 'approved',
        statusMessage: 'All good',
        externalUserId: 'ext-1',
        kycStatus: 'approved',
        vendor: 'sumsub',
        vendorStatus: 'GREEN',
      };
      nock(MOCK_API_URL).get('/sessions/sid/status').reply(200, response);
      const { service } = getService();

      expect(
        await service.getSessionStatus({ sessionId: 'sid' }),
      ).toStrictEqual(response);
    });

    it('url-encodes the session id', async () => {
      const response = {
        finalStatus: 'pending',
        externalUserId: 'ext-1',
        kycStatus: 'pending',
        vendor: 'sumsub',
        vendorStatus: 'YELLOW',
      };
      nock(MOCK_API_URL).get('/sessions/a%2Fb/status').reply(200, response);
      const { service } = getService();

      expect(
        await service.getSessionStatus({ sessionId: 'a/b' }),
      ).toStrictEqual(response);
    });

    it('throws on a malformed response', async () => {
      nock(MOCK_API_URL)
        .get('/sessions/sid/status')
        .reply(200, { finalStatus: 'approved' });
      const { service } = getService();

      await expect(
        service.getSessionStatus({ sessionId: 'sid' }),
      ).rejects.toThrow(/Malformed response received from session status API/u);
    });

    it('throws an HttpError on a non-ok response', async () => {
      nock(MOCK_API_URL).get('/sessions/sid/status').reply(404);
      const { service } = getService();

      await expect(
        service.getSessionStatus({ sessionId: 'sid' }),
      ).rejects.toThrow(/failed with status '404'/u);
    });
  });

  describe('baseUrl', () => {
    it('uses the provided baseUrl for requests', async () => {
      const customUrl = 'https://kyc-api.local.test';
      const disclaimers = [
        { id: '1', display_name: 'Terms', url: 'https://t' },
      ];
      nock(customUrl)
        .get('/vendors/moonpay/disclaimers')
        .query({ country: 'USA' })
        .reply(200, disclaimers);
      const { service } = getService({ baseUrl: customUrl });

      expect(await service.fetchDisclaimers({ country: 'USA' })).toStrictEqual(
        disclaimers,
      );
    });

    it('throws when baseUrl is empty', () => {
      expect(() => getService({ baseUrl: '' })).toThrow(
        'KycService: baseUrl is required',
      );
    });
  });

  describe('messenger actions', () => {
    it('exposes methods as messenger actions', async () => {
      nock(MOCK_API_URL)
        .get('/vendors/moonpay/disclaimers')
        .query({ country: 'USA' })
        .reply(200, []);
      const { rootMessenger } = getService();

      expect(
        await rootMessenger.call('KycService:fetchDisclaimers', {
          country: 'USA',
        }),
      ).toStrictEqual([]);
    });
  });
});

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<KycServiceMessenger>,
  MessengerEvents<KycServiceMessenger>
>;

/**
 * Constructs the service under test with mocked auth + geo handlers.
 *
 * @param args - Options.
 * @param args.bearerToken - The bearer token the auth handler returns.
 * @param args.geolocation - The location the geolocation handler returns.
 * @param args.defaultPolicy - When true, omit `policyOptions` to use defaults.
 * @param args.baseUrl - Base URL of the KYC API.
 * @param args.neobankBaseUrl - Optional on-ramp / neobank-proxy base URL.
 * @param args.fractalEncryptionBaseUrl - Fractal base URL; `null` omits the
 * option so the service falls back to an empty string.
 * @param args.canonicalProfileId - Canonical profile id returned by
 * `AuthenticationController:getSessionProfile`.
 * @returns The service, root messenger, and service messenger.
 */
function getService({
  bearerToken = 'test-bearer',
  geolocation = 'US-NY',
  defaultPolicy = false,
  baseUrl = MOCK_API_URL,
  neobankBaseUrl,
  // `null` means "omit the option entirely" (exercises the constructor's
  // `?? ''` fallback); omitting the field defaults to the mock Fractal URL.
  fractalEncryptionBaseUrl = MOCK_FRACTAL_URL,
  canonicalProfileId = 'canonical-profile-1',
}: {
  bearerToken?: string;
  geolocation?: string | null;
  defaultPolicy?: boolean;
  baseUrl?: string;
  neobankBaseUrl?: string;
  fractalEncryptionBaseUrl?: string | null;
  canonicalProfileId?: string;
} = {}): {
  service: KycService;
  rootMessenger: RootMessenger;
  messenger: KycServiceMessenger;
} {
  const rootMessenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });
  const messenger: KycServiceMessenger = new Messenger({
    namespace: 'KycService',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    actions: [
      'AuthenticationController:getBearerToken',
      'AuthenticationController:getSessionProfile',
      'GeolocationController:getGeolocation',
    ],
    events: [],
    messenger,
  });
  rootMessenger.registerActionHandler(
    'AuthenticationController:getBearerToken',
    async () => bearerToken,
  );
  rootMessenger.registerActionHandler(
    'AuthenticationController:getSessionProfile',
    async () => ({
      identifierId: 'id-1',
      profileId: canonicalProfileId,
      canonicalProfileId,
      metaMetricsId: 'mm-1',
    }),
  );
  rootMessenger.registerActionHandler(
    'GeolocationController:getGeolocation',
    async () => geolocation as string,
  );

  const service = new KycService({
    fetch,
    messenger,
    baseUrl,
    ...(neobankBaseUrl === undefined ? {} : { neobankBaseUrl }),
    ...(fractalEncryptionBaseUrl === null ? {} : { fractalEncryptionBaseUrl }),
    ...(defaultPolicy ? {} : { policyOptions: { maxRetries: 0 } }),
  });

  return { service, rootMessenger, messenger };
}
