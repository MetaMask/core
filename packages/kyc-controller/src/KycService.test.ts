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

  describe('constructor', () => {
    it('falls back to the native fetch when no fetch is injected', async () => {
      const disclaimers = [
        { id: '1', display_name: 'Terms', url: 'https://t' },
      ];
      nock(MOCK_API_URL)
        .get('/vendors/moonpay/disclaimers')
        .query({ country: 'USA' })
        .reply(200, disclaimers);
      const { service } = getService({ omitFetch: true });

      expect(await service.fetchDisclaimers({ country: 'USA' })).toStrictEqual(
        disclaimers,
      );
    });
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

    it('includes the API error message in HttpError when present', async () => {
      nock(MOCK_API_URL)
        .get('/sessions/sid/status')
        .reply(409, { message: 'session_not_in_valid_state' });
      const { service } = getService();

      await expect(
        service.getSessionStatus({ sessionId: 'sid' }),
      ).rejects.toThrow(/session_not_in_valid_state/u);
    });

    it('includes the API error field in HttpError when message is absent', async () => {
      nock(MOCK_API_URL)
        .get('/sessions/sid/status')
        .reply(409, { error: 'session_not_in_valid_state' });
      const { service } = getService();

      await expect(
        service.getSessionStatus({ sessionId: 'sid' }),
      ).rejects.toThrow(/session_not_in_valid_state/u);
    });

    it('prefers a string error field when message is not a string', async () => {
      nock(MOCK_API_URL)
        .get('/sessions/sid/status')
        .reply(409, { message: 123, error: 'session_not_in_valid_state' });
      const { service } = getService();

      await expect(
        service.getSessionStatus({ sessionId: 'sid' }),
      ).rejects.toThrow(/session_not_in_valid_state/u);
    });

    it('falls back to status-only HttpError when the body has no useful fields', async () => {
      nock(MOCK_API_URL)
        .get('/sessions/sid/status')
        .reply(409, { message: 1, error: 2 });
      const { service } = getService();

      await expect(
        service.getSessionStatus({ sessionId: 'sid' }),
      ).rejects.toThrow(/failed with status '409'$/u);
    });

    it('falls back to status-only HttpError when the body is not an object', async () => {
      nock(MOCK_API_URL).get('/sessions/sid/status').reply(409, null);
      const { service } = getService();

      await expect(
        service.getSessionStatus({ sessionId: 'sid' }),
      ).rejects.toThrow(/failed with status '409'$/u);
    });
  });

  describe('createVendorCustomer', () => {
    it('creates an Iron customer and returns the validated subset', async () => {
      nock(MOCK_API_URL)
        .post('/vendors/iron/customers', { email: 'a@b.co' })
        .reply(200, {
          id: 'iron-1',
          email: 'a@b.co',
          status: 'SigningsRequired',
          customer_type: 'Person',
          name: '',
          partner_id: 'p',
          identification_ids: [],
          signing_ids: [],
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        });
      const { service } = getService();

      expect(
        await service.createVendorCustomer({ vendor: 'iron', email: 'a@b.co' }),
      ).toMatchObject({
        id: 'iron-1',
        email: 'a@b.co',
        status: 'SigningsRequired',
      });
    });

    it('throws on a malformed response', async () => {
      nock(MOCK_API_URL).post('/vendors/iron/customers').reply(200, {});
      const { service } = getService();

      await expect(
        service.createVendorCustomer({
          vendor: 'iron',
          email: 'a@b.co',
        }),
      ).rejects.toThrow(
        /Malformed response received from vendor customers API/u,
      );
    });
  });

  describe('fetchDisclaimers for a non-MoonPay vendor', () => {
    it('returns Iron disclaimers for a country', async () => {
      const disclaimers = [
        { id: '1', display_name: 'Iron Terms', url: 'https://t' },
      ];
      nock(MOCK_API_URL)
        .get('/vendors/iron/disclaimers')
        .query({ country: 'USA' })
        .reply(200, disclaimers);
      const { service } = getService();

      expect(
        await service.fetchDisclaimers({ vendor: 'iron', country: 'USA' }),
      ).toStrictEqual(disclaimers);
    });

    it('throws on a malformed response', async () => {
      nock(MOCK_API_URL)
        .get('/vendors/iron/disclaimers')
        .query({ country: 'USA' })
        .reply(200, [{ id: 1 }]);
      const { service } = getService();

      await expect(
        service.fetchDisclaimers({ vendor: 'iron', country: 'USA' }),
      ).rejects.toThrow(/Malformed response received from disclaimers API/u);
    });
  });

  describe('checkKycRequired for a non-MoonPay vendor', () => {
    it('returns whether Iron KYC is required', async () => {
      nock(MOCK_API_URL)
        .post('/vendors/iron/kyc-required')
        .reply(200, { required: true });
      const { service } = getService();

      expect(await service.checkKycRequired({ vendor: 'iron' })).toStrictEqual({
        kycRequired: true,
      });
    });

    it('throws when accessToken is missing for MoonPay vendor', async () => {
      const { service } = getService();

      await expect(
        service.checkKycRequired({ vendor: 'moonpay', country: 'USA' }),
      ).rejects.toThrow('accessToken is required for vendor "moonpay"');
    });

    it('throws when country is missing for MoonPay vendor', async () => {
      const { service } = getService();

      await expect(
        service.checkKycRequired({ vendor: 'moonpay', accessToken: 'tok' }),
      ).rejects.toThrow('country is required for vendor "moonpay"');
    });

    it('throws on a malformed response', async () => {
      nock(MOCK_API_URL).post('/vendors/iron/kyc-required').reply(200, {});
      const { service } = getService();

      await expect(
        service.checkKycRequired({ vendor: 'iron' }),
      ).rejects.toThrow(/Malformed response received from kyc-required API/u);
    });
  });

  describe('submitConsents', () => {
    it('posts consents and accepts a 204 response', async () => {
      nock(MOCK_API_URL)
        .post('/consents', {
          ironDisclaimerIds: ['d1'],
          sumsubTncSigned: true,
          idosTncSigned: true,
          kycLevel: 'standard',
        })
        .reply(204);
      const { service } = getService();

      expect(
        await service.submitConsents({
          disclaimerIds: ['d1'],
          sumsubTncSigned: true,
          idosTncSigned: true,
        }),
      ).toBeUndefined();
    });

    it('throws an HttpError on a non-ok response', async () => {
      nock(MOCK_API_URL).post('/consents').reply(500);
      const { service } = getService();

      await expect(
        service.submitConsents({
          disclaimerIds: ['d1'],
          sumsubTncSigned: true,
          idosTncSigned: true,
        }),
      ).rejects.toThrow(/failed with status '500'/u);
    });
  });

  describe('fetchKycStatus', () => {
    it('returns the simplified user-keyed status', async () => {
      nock(MOCK_API_URL).get('/kyc/status').reply(200, {
        status: 'pending',
        sumsubSessionId: 'ss-1',
      });
      const { service } = getService();

      expect(await service.fetchKycStatus()).toStrictEqual({
        status: 'pending',
        sumsubSessionId: 'ss-1',
      });
    });

    it('throws on an unknown status value', async () => {
      nock(MOCK_API_URL).get('/kyc/status').reply(200, { status: 'weird' });
      const { service } = getService();

      await expect(service.fetchKycStatus()).rejects.toThrow(
        /Malformed response received from kyc status API/u,
      );
    });
  });

  describe('createUkycSession vendorId', () => {
    it('defaults vendorId to moonpay and forwards vendorMetadata', async () => {
      const material = deriveClientMaterial(
        new Uint8Array(UKYC_LOCAL_USER_SECRET_SIZE_BYTES).fill(1),
      );
      const ukycCapabilityToken = signStorageAccessToken({
        material,
        operations: ['read'],
        expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      });
      nock(MOCK_API_URL)
        .post('/sessions', (body) => {
          return (
            body.vendorId === 'moonpay' &&
            body.vendorMetadata?.moonPayAccessToken === 'tok'
          );
        })
        .reply(200, { sessionId: 'sid' });
      const { service } = getService();

      expect(
        await service.createUkycSession({
          jwtToken: 'jwt',
          vendorMetadata: { moonPayAccessToken: 'tok' },
          wrappedEncryptionKey: {
            sessionId: 'wk',
            encryptedKey: 'ek',
            nonce: 'n',
          },
          ukycCapabilityToken,
        }),
      ).toStrictEqual({ sessionId: 'sid' });
    });

    it('sends vendor iron with empty vendorMetadata when omitted', async () => {
      const material = deriveClientMaterial(
        new Uint8Array(UKYC_LOCAL_USER_SECRET_SIZE_BYTES).fill(1),
      );
      const ukycCapabilityToken = signStorageAccessToken({
        material,
        operations: ['read'],
        expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      });
      nock(MOCK_API_URL)
        .post('/sessions', (body) => {
          return (
            body.vendorId === 'iron' &&
            JSON.stringify(body.vendorMetadata) === '{}'
          );
        })
        .reply(200, { sessionId: 'sid-iron' });
      const { service } = getService();

      expect(
        await service.createUkycSession({
          jwtToken: 'jwt',
          vendor: 'iron',
          wrappedEncryptionKey: {
            sessionId: 'wk',
            encryptedKey: 'ek',
            nonce: 'n',
          },
          ukycCapabilityToken,
        }),
      ).toStrictEqual({ sessionId: 'sid-iron' });
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
 * @param args.fractalEncryptionBaseUrl - Fractal base URL; `null` omits the
 * option so the service falls back to an empty string.
 * @param args.omitFetch - When true, omit the `fetch` option so the service
 * falls back to the runtime's native `fetch`.
 * @returns The service, root messenger, and service messenger.
 */
function getService({
  bearerToken = 'test-bearer',
  geolocation = 'US-NY',
  defaultPolicy = false,
  baseUrl = MOCK_API_URL,
  // `null` means "omit the option entirely" (exercises the constructor's
  // `?? ''` fallback); omitting the field defaults to the mock Fractal URL.
  fractalEncryptionBaseUrl = MOCK_FRACTAL_URL,
  // When true, omit the `fetch` option so the service falls back to the
  // runtime's native `fetch` (which nock intercepts).
  omitFetch = false,
}: {
  bearerToken?: string;
  geolocation?: string | null;
  defaultPolicy?: boolean;
  baseUrl?: string;
  fractalEncryptionBaseUrl?: string | null;
  omitFetch?: boolean;
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
    ...(omitFetch ? {} : { fetch }),
    messenger,
    baseUrl,
    ...(fractalEncryptionBaseUrl === null ? {} : { fractalEncryptionBaseUrl }),
    ...(defaultPolicy ? {} : { policyOptions: { maxRetries: 0 } }),
  });

  return { service, rootMessenger, messenger };
}
