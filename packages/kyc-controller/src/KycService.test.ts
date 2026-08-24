import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import nock, { cleanAll } from 'nock';

import type { EncryptionSchema, KycServiceMessenger } from './KycService.js';
import { KycService } from './KycService.js';

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
      // An empty base URL exercises the constructor's "not configured" guard.
      const { service } = getService({ fractalEncryptionBaseUrl: '' });

      await expect(service.fetchJwks()).rejects.toThrow(
        /fractalEncryptionBaseUrl is not configured; cannot fetch JWKS to verify encryption schemas/u,
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
    const encryptionSchema: EncryptionSchema = {
      serverPublicKey: { kty: 'OKP', crv: 'X25519', x: 'spk-x' },
      jwtChain: 'jwt.chain.sig',
    };
    const response = {
      sessionId: 'sid',
      encryptionDataKey: encryptionSchema,
      ukycCapabilityToken: {
        ...encryptionSchema,
        jwtChain: 'capability.jwt.chain',
      },
    };

    it('creates a UKYC session and returns encryption schemas for wrapping', async () => {
      nock(MOCK_API_URL)
        .post(
          '/sessions',
          (body: Record<string, unknown>) =>
            body.jwtToken === 'jwt' &&
            body.vendorId === 'moonpay' &&
            body.wrappedEncryptionKey === undefined &&
            body.ukycCapabilityToken === undefined,
        )
        .reply(200, response);
      const { service } = getService();

      expect(
        await service.createUkycSession({
          jwtToken: 'jwt',
          vendorMetadata: { foo: 'bar' },
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
        }),
      ).rejects.toThrow(/Malformed response received from UKYC sessions API/u);
    });
  });

  describe('setAuthorizations', () => {
    const wrappedEncryptionDataKey = { nonce: 'nonce-1', data: 'data-1' };
    const wrappedUkycCapabilityToken = { nonce: 'nonce-2', data: 'data-2' };
    const statusResponse = {
      finalStatus: 'approved',
      statusMessage: 'All good',
      externalUserId: 'ext-1',
      kycStatus: 'approved',
      vendor: 'sumsub',
      vendorStatus: 'GREEN',
    };

    it('posts the wrapped secrets and returns the session status', async () => {
      nock(MOCK_API_URL)
        .post(
          '/sessions/sid/authorizations',
          (body: Record<string, unknown>) =>
            JSON.stringify(body.wrappedEncryptionDataKey) ===
              JSON.stringify(wrappedEncryptionDataKey) &&
            JSON.stringify(body.wrappedUkycCapabilityToken) ===
              JSON.stringify(wrappedUkycCapabilityToken),
        )
        .reply(200, statusResponse);
      const { service } = getService();

      expect(
        await service.setAuthorizations({
          sessionId: 'sid',
          wrappedEncryptionDataKey,
          wrappedUkycCapabilityToken,
        }),
      ).toStrictEqual(statusResponse);
    });

    it('url-encodes the session id', async () => {
      nock(MOCK_API_URL)
        .post('/sessions/a%2Fb/authorizations')
        .reply(200, statusResponse);
      const { service } = getService();

      expect(
        await service.setAuthorizations({
          sessionId: 'a/b',
          wrappedEncryptionDataKey,
          wrappedUkycCapabilityToken,
        }),
      ).toStrictEqual(statusResponse);
    });

    it('throws on a malformed response', async () => {
      nock(MOCK_API_URL)
        .post('/sessions/sid/authorizations')
        .reply(200, { unexpected: true });
      const { service } = getService();

      await expect(
        service.setAuthorizations({
          sessionId: 'sid',
          wrappedEncryptionDataKey,
          wrappedUkycCapabilityToken,
        }),
      ).rejects.toThrow(/Malformed response received from authorizations API/u);
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
 * @param args.fractalEncryptionBaseUrl - Fractal base URL; pass `''` to
 * exercise the service's "not configured" guard.
 * @returns The service, root messenger, and service messenger.
 */
function getService({
  bearerToken = 'test-bearer',
  geolocation = 'US-NY',
  defaultPolicy = false,
  baseUrl = MOCK_API_URL,
  fractalEncryptionBaseUrl = MOCK_FRACTAL_URL,
}: {
  bearerToken?: string;
  geolocation?: string | null;
  defaultPolicy?: boolean;
  baseUrl?: string;
  fractalEncryptionBaseUrl?: string;
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
    'GeolocationController:getGeolocation',
    async () => geolocation as string,
  );

  const service = new KycService({
    messenger,
    baseUrl,
    fractalEncryptionBaseUrl,
    ...(defaultPolicy ? {} : { policyOptions: { maxRetries: 0 } }),
  });

  return { service, rootMessenger, messenger };
}
