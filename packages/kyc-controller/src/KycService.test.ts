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
const SESSION_CLIENT_PUBLIC_KEY = 'session-client-public-key';
const RESIDENCE_COUNTRY = 'USA';

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

    it('throws when fetch is not globally available and not provided', () => {
      const savedFetch = globalThis.fetch;
      try {
        // @ts-expect-error - deliberately removing fetch for test
        delete globalThis.fetch;

        const rootMessenger: RootMessenger = new Messenger({
          namespace: MOCK_ANY_NAMESPACE,
        });
        const messenger: KycServiceMessenger = new Messenger({
          namespace: 'KycService',
          parent: rootMessenger,
        });

        expect(
          () =>
            new KycService({
              messenger:
                messenger as unknown as MockAnyNamespace<KycServiceMessenger>,
              baseUrl: MOCK_API_URL,
            }),
        ).toThrow(
          'fetch is not available globally and was not provided in options',
        );
      } finally {
        globalThis.fetch = savedFetch;
      }
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
            body.sessionClientPublicKey === SESSION_CLIENT_PUBLIC_KEY &&
            body.residenceCountry === RESIDENCE_COUNTRY &&
            body.wrappedEncryptionKey === undefined &&
            body.ukycCapabilityToken === undefined,
        )
        .reply(200, response);
      const { service } = getService();

      expect(
        await service.createUkycSession({
          jwtToken: 'jwt',
          sessionClientPublicKey: SESSION_CLIENT_PUBLIC_KEY,
          residenceCountry: RESIDENCE_COUNTRY,
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
          sessionClientPublicKey: SESSION_CLIENT_PUBLIC_KEY,
          residenceCountry: RESIDENCE_COUNTRY,
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

  describe('submitVendorDisclaimers', () => {
    const signings = [
      { id: 'sign-1', customer_id: 'cust-1', content_id: 'disc-1' },
      { id: 'sign-2', customer_id: 'cust-1', content_id: 'disc-2' },
    ];

    it('posts accepted disclaimer ids and returns vendor signings', async () => {
      nock(MOCK_API_URL)
        .post('/vendors/iron/disclaimers', {
          disclaimerIds: ['disc-1', 'disc-2'],
        })
        .reply(200, signings);
      const { service } = getService();

      expect(
        await service.submitVendorDisclaimers({
          vendor: 'iron',
          disclaimerIds: ['disc-1', 'disc-2'],
        }),
      ).toStrictEqual(signings);
    });

    it('accepts extra signing fields and an omitted content_id', async () => {
      nock(MOCK_API_URL)
        .post('/vendors/iron/disclaimers', { disclaimerIds: ['disc-1'] })
        .reply(200, [{ id: 'sign-1', customer_id: 'cust-1', signed: true }]);
      const { service } = getService();

      expect(
        await service.submitVendorDisclaimers({
          vendor: 'iron',
          disclaimerIds: ['disc-1'],
        }),
      ).toMatchObject([{ id: 'sign-1', customer_id: 'cust-1' }]);
    });

    it('throws on a malformed response', async () => {
      nock(MOCK_API_URL).post('/vendors/iron/disclaimers').reply(200, {});
      const { service } = getService();

      await expect(
        service.submitVendorDisclaimers({
          vendor: 'iron',
          disclaimerIds: ['disc-1'],
        }),
      ).rejects.toThrow(
        /Malformed response received from vendor disclaimers API/u,
      );
    });

    it('throws an HttpError on a non-ok response', async () => {
      nock(MOCK_API_URL).post('/vendors/iron/disclaimers').reply(500);
      const { service } = getService();

      await expect(
        service.submitVendorDisclaimers({
          vendor: 'iron',
          disclaimerIds: ['disc-1'],
        }),
      ).rejects.toThrow(/failed with status '500'/u);
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

  describe('fetchSessionDisclaimers', () => {
    const catalog = {
      idOS: [
        {
          key: 'idos-tos',
          version: '1',
          title: 'idOS ToS',
          url: 'https://idos.example/tos',
          consented: false,
        },
      ],
      kycProvider: [
        {
          key: 'sumsub-tos',
          version: '1',
          title: 'SumSub ToS',
          url: 'https://sumsub.example/tos',
          consented: false,
        },
      ],
      credentialReusabilityConsentGiven: false,
    };

    it('returns the session-scoped disclaimer catalog', async () => {
      nock(MOCK_API_URL).get('/sessions/sid-1/disclaimers').reply(200, catalog);
      const { service } = getService();

      expect(
        await service.fetchSessionDisclaimers({ sessionId: 'sid-1' }),
      ).toStrictEqual(catalog);
    });

    it('throws on a malformed response', async () => {
      nock(MOCK_API_URL).get('/sessions/sid-1/disclaimers').reply(200, {});
      const { service } = getService();

      await expect(
        service.fetchSessionDisclaimers({ sessionId: 'sid-1' }),
      ).rejects.toThrow(
        /Malformed response received from session disclaimers API/u,
      );
    });

    it('throws an HttpError on a non-ok response', async () => {
      nock(MOCK_API_URL).get('/sessions/sid-1/disclaimers').reply(500);
      const { service } = getService();

      await expect(
        service.fetchSessionDisclaimers({ sessionId: 'sid-1' }),
      ).rejects.toThrow(/failed with status '500'/u);
    });
  });

  describe('submitSessionDisclaimers', () => {
    const recorded = {
      idOS: [
        {
          key: 'idos-tos',
          version: '1',
          title: 'idOS ToS',
          url: 'https://idos.example/tos',
          consented: true,
        },
      ],
      kycProvider: [
        {
          key: 'sumsub-tos',
          version: '1',
          title: 'SumSub ToS',
          url: 'https://sumsub.example/tos',
          consented: true,
        },
      ],
      credentialReusabilityConsentGiven: true,
    };

    it('posts consent records and returns the updated catalog', async () => {
      nock(MOCK_API_URL)
        .post('/sessions/sid-1/disclaimers', {
          idOS: [{ key: 'idos-tos', version: '1' }],
          kycProvider: [{ key: 'sumsub-tos', version: '1' }],
          credentialReusabilityConsentGiven: true,
        })
        .reply(200, recorded);
      const { service } = getService();

      expect(
        await service.submitSessionDisclaimers({
          sessionId: 'sid-1',
          idOS: [{ key: 'idos-tos', version: '1' }],
          kycProvider: [{ key: 'sumsub-tos', version: '1' }],
          credentialReusabilityConsentGiven: true,
        }),
      ).toStrictEqual(recorded);
    });

    it('throws on a malformed response', async () => {
      nock(MOCK_API_URL).post('/sessions/sid-1/disclaimers').reply(200, {});
      const { service } = getService();

      await expect(
        service.submitSessionDisclaimers({
          sessionId: 'sid-1',
          idOS: [],
          kycProvider: [],
          credentialReusabilityConsentGiven: false,
        }),
      ).rejects.toThrow(
        /Malformed response received from session disclaimers API/u,
      );
    });

    it('throws an HttpError on a non-ok response', async () => {
      nock(MOCK_API_URL).post('/sessions/sid-1/disclaimers').reply(409);
      const { service } = getService();

      await expect(
        service.submitSessionDisclaimers({
          sessionId: 'sid-1',
          idOS: [{ key: 'idos-tos', version: '1' }],
          kycProvider: [],
          credentialReusabilityConsentGiven: false,
        }),
      ).rejects.toThrow(/failed with status '409'/u);
    });

    it('treats a 204 response as empty and fails catalog validation', async () => {
      nock(MOCK_API_URL).post('/sessions/sid-1/disclaimers').reply(204);
      const { service } = getService();

      await expect(
        service.submitSessionDisclaimers({
          sessionId: 'sid-1',
          idOS: [],
          kycProvider: [],
          credentialReusabilityConsentGiven: false,
        }),
      ).rejects.toThrow(
        /Malformed response received from session disclaimers API/u,
      );
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
    const encryptionSchema: EncryptionSchema = {
      serverPublicKey: { kty: 'OKP', crv: 'X25519', x: 'spk-x' },
      jwtChain: 'jwt.chain.sig',
    };

    it('defaults vendorId to moonpay and forwards vendorMetadata', async () => {
      const response = {
        sessionId: 'sid',
        encryptionDataKey: encryptionSchema,
        ukycCapabilityToken: encryptionSchema,
      };
      nock(MOCK_API_URL)
        .post('/sessions', (body) => {
          return (
            body.vendorId === 'moonpay' &&
            body.sessionClientPublicKey === SESSION_CLIENT_PUBLIC_KEY &&
            body.residenceCountry === RESIDENCE_COUNTRY &&
            body.vendorMetadata?.moonPayAccessToken === 'tok' &&
            body.wrappedEncryptionKey === undefined &&
            body.ukycCapabilityToken === undefined
          );
        })
        .reply(200, response);
      const { service } = getService();

      expect(
        await service.createUkycSession({
          jwtToken: 'jwt',
          sessionClientPublicKey: SESSION_CLIENT_PUBLIC_KEY,
          residenceCountry: RESIDENCE_COUNTRY,
          vendorMetadata: { moonPayAccessToken: 'tok' },
        }),
      ).toStrictEqual(response);
    });

    it('sends vendor iron with empty vendorMetadata when omitted', async () => {
      const response = {
        sessionId: 'sid-iron',
        encryptionDataKey: encryptionSchema,
        ukycCapabilityToken: encryptionSchema,
      };
      nock(MOCK_API_URL)
        .post('/sessions', (body) => {
          return (
            body.vendorId === 'iron' &&
            body.sessionClientPublicKey === SESSION_CLIENT_PUBLIC_KEY &&
            body.residenceCountry === RESIDENCE_COUNTRY &&
            JSON.stringify(body.vendorMetadata) === '{}'
          );
        })
        .reply(200, response);
      const { service } = getService();

      expect(
        await service.createUkycSession({
          jwtToken: 'jwt',
          sessionClientPublicKey: SESSION_CLIENT_PUBLIC_KEY,
          residenceCountry: RESIDENCE_COUNTRY,
          vendor: 'iron',
        }),
      ).toStrictEqual(response);
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
