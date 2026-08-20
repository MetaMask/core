import type { CreateServicePolicyOptions } from '@metamask/controller-utils';
import { ConstantBackoff } from '@metamask/controller-utils';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type { MockAnyNamespace } from '@metamask/messenger';
import nock, { cleanAll } from 'nock';

import {
  mapNeoBankAutorampToRemoteSnapshot,
  NeoBankService,
} from './NeoBankService.js';
import type { NeoBankServiceMessenger } from './NeoBankService.js';
import { RampsEnvironment } from './RampsService.js';

const STAGING_BASE = 'https://on-ramp.uat-api.cx.metamask.io';

/**
 * Builds a NeoBankService with AuthenticationController bearer auth stubbed.
 *
 * @param options - Optional constructor overrides.
 * @param options.environment - Ramp environment for host selection.
 * @param options.baseUrlOverride - Overrides the environment-derived host.
 * @param options.omitDefaults - Pass `true` to exercise constructor defaulted
 * parameters (`environment`, `policyOptions`).
 * @param options.policyOptions - Retry/circuit policy overrides. Defaults to
 * `{ maxRetries: 0 }` so tests fail fast unless they opt into retries.
 * @param options.canonicalProfileId - Canonical profile id returned by the
 * stubbed `AuthenticationController:getSessionProfile` (wallet registration).
 * @returns Service instance for the test.
 */
function createService(options?: {
  environment?: RampsEnvironment;
  baseUrlOverride?: string;
  omitDefaults?: boolean;
  policyOptions?: CreateServicePolicyOptions;
  canonicalProfileId?: string;
}): NeoBankService {
  const rootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE as MockAnyNamespace,
  });
  rootMessenger.registerActionHandler(
    'AuthenticationController:getBearerToken',
    async () => 'test-token',
  );
  const canonicalProfileId =
    options?.canonicalProfileId ?? 'canonical-profile-1';
  rootMessenger.registerActionHandler(
    'AuthenticationController:getSessionProfile',
    async () =>
      ({
        identifierId: 'id-1',
        profileId: canonicalProfileId,
        canonicalProfileId,
        metaMetricsId: 'mm-1',
      }) as never,
  );

  const messenger = new Messenger({
    namespace: 'NeoBankService',
    parent: rootMessenger,
  }) as unknown as NeoBankServiceMessenger;
  rootMessenger.delegate({
    messenger,
    actions: [
      'AuthenticationController:getBearerToken',
      'AuthenticationController:getSessionProfile',
    ],
  });

  if (options?.omitDefaults) {
    return new NeoBankService({
      messenger,
      context: 'test',
      fetch: globalThis.fetch.bind(globalThis),
      baseUrlOverride: options.baseUrlOverride,
    });
  }

  return new NeoBankService({
    messenger,
    environment: options?.environment ?? RampsEnvironment.Staging,
    context: 'test',
    fetch: globalThis.fetch.bind(globalThis),
    policyOptions: options?.policyOptions ?? { maxRetries: 0 },
    baseUrlOverride: options?.baseUrlOverride,
  });
}

describe('NeoBankService', () => {
  afterEach(() => {
    cleanAll();
  });

  describe('mapNeoBankAutorampToRemoteSnapshot', () => {
    it('maps MoonPay-shaped fields into a remote snapshot', () => {
      expect(
        mapNeoBankAutorampToRemoteSnapshot({
          id: 'ar-1',
          customer_id: 'cust-1',
          status: 'Approved',
          wallet_address: '0xabc',
          deposit_rails: [{ type: 'Iban' }],
        }),
      ).toStrictEqual({
        id: 'ar-1',
        customerId: 'cust-1',
        walletAddress: '0xabc',
        status: 'Approved',
        depositRailsSummary: { ready: true },
      });
    });

    it('falls back to recipient_account.address when wallet_address is absent', () => {
      expect(
        mapNeoBankAutorampToRemoteSnapshot({
          id: 'ar-1',
          customer_id: 'cust-1',
          status: 'Pending',
          recipient_account: { address: '0xfrom-recipient' },
        }),
      ).toMatchObject({
        walletAddress: '0xfrom-recipient',
        depositRailsSummary: undefined,
      });
    });

    it('marks deposit rails not ready when Approved without rails', () => {
      expect(
        mapNeoBankAutorampToRemoteSnapshot({
          id: 'ar-1',
          customer_id: 'cust-1',
          status: 'Approved',
        }),
      ).toMatchObject({
        depositRailsSummary: { ready: false },
      });
    });
  });

  describe('getAutoramp', () => {
    it('gets /neobank/autoramps/{id} with bearer auth', async () => {
      const scope = nock(STAGING_BASE)
        .get(/\/neobank\/autoramps\/ar-1/u)
        .matchHeader('Authorization', 'Bearer test-token')
        .reply(200, {
          id: 'ar-1',
          customer_id: 'cust-1',
          status: 'Authorized',
          wallet_address: '0xabc',
        });

      const service = createService();
      const snapshot = await service.getAutoramp('ar-1');

      expect(scope.isDone()).toBe(true);
      expect(snapshot).toMatchObject({
        id: 'ar-1',
        customerId: 'cust-1',
        status: 'Authorized',
        walletAddress: '0xabc',
      });
    });

    it('throws HttpError when the proxy returns a non-2xx status', async () => {
      nock(STAGING_BASE)
        .get(/\/neobank\/autoramps\/missing/u)
        .reply(404);

      const service = createService();
      await expect(service.getAutoramp('missing')).rejects.toThrow(
        /failed with status '404'/u,
      );
    });

    it('retries a 429 then succeeds', async () => {
      const scope = nock(STAGING_BASE)
        .get(/\/neobank\/autoramps\/ar-1/u)
        .reply(429)
        .get(/\/neobank\/autoramps\/ar-1/u)
        .reply(200, {
          id: 'ar-1',
          customer_id: 'cust-1',
          status: 'Authorized',
        });

      const service = createService({
        policyOptions: {
          maxRetries: 1,
          backoff: new ConstantBackoff(0),
        },
      });
      const snapshot = await service.getAutoramp('ar-1');

      expect(scope.isDone()).toBe(true);
      expect(snapshot.id).toBe('ar-1');
    });

    it('retries a network error then succeeds', async () => {
      const scope = nock(STAGING_BASE)
        .get(/\/neobank\/autoramps\/ar-1/u)
        .replyWithError('ECONNRESET')
        .get(/\/neobank\/autoramps\/ar-1/u)
        .reply(200, {
          id: 'ar-1',
          customer_id: 'cust-1',
          status: 'Authorized',
        });

      const service = createService({
        policyOptions: {
          maxRetries: 1,
          backoff: new ConstantBackoff(0),
        },
      });
      const snapshot = await service.getAutoramp('ar-1');

      expect(scope.isDone()).toBe(true);
      expect(snapshot.id).toBe('ar-1');
    });

    it('throws when the response body is malformed', async () => {
      nock(STAGING_BASE)
        .get(/\/neobank\/autoramps\/ar-1/u)
        .reply(200, { status: 'Authorized' });

      const service = createService();
      await expect(service.getAutoramp('ar-1')).rejects.toThrow(
        'Malformed response received from neo-bank autoramp API',
      );
    });
  });

  describe('registerPixAddress', () => {
    it('posts /neobank/addresses/pix with JSON body and bearer auth', async () => {
      const body = {
        type: 'Pix',
        pix_key: 'user@example.com',
        customer_id: 'cust-1',
      };

      const scope = nock(STAGING_BASE)
        .post('/neobank/addresses/pix', body)
        .query(true)
        .matchHeader('Authorization', 'Bearer test-token')
        .matchHeader('Content-Type', 'application/json')
        .reply(200, { id: 'addr-1', ...body });

      const service = createService();
      const result = await service.registerPixAddress(body);

      expect(scope.isDone()).toBe(true);
      expect(result).toMatchObject({ id: 'addr-1' });
    });

    it('forwards Idempotency-Key when provided', async () => {
      const scope = nock(STAGING_BASE)
        .post('/neobank/addresses/pix', { pix_key: 'k' })
        .query(true)
        .matchHeader('Idempotency-Key', 'idem-1')
        .reply(200, { id: 'addr-1' });

      const service = createService();
      await service.registerPixAddress(
        { pix_key: 'k' },
        { idempotencyKey: 'idem-1' },
      );

      expect(scope.isDone()).toBe(true);
    });
  });

  describe('getAutorampQuote', () => {
    it('gets /neobank/autoramps/quote with query params', async () => {
      const scope = nock(STAGING_BASE)
        .get('/neobank/autoramps/quote')
        .query((query) => {
          return (
            query.amount === '100' &&
            query.currency === 'BRL' &&
            typeof query.sdk === 'string' &&
            typeof query.controller === 'string' &&
            query.context === 'test'
          );
        })
        .matchHeader('Authorization', 'Bearer test-token')
        .reply(200, { quote_id: 'q-1', amount: '100' });

      const service = createService();
      const result = await service.getAutorampQuote({
        amount: '100',
        currency: 'BRL',
      });

      expect(scope.isDone()).toBe(true);
      expect(result).toMatchObject({ quote_id: 'q-1' });
    });
  });

  describe('createAutoramp', () => {
    it('posts /neobank/autoramps and maps the Autoramp response', async () => {
      const body = {
        signed_quote: 'sig',
        customer_id: 'cust-1',
      };

      const scope = nock(STAGING_BASE)
        .post('/neobank/autoramps', body)
        .query(true)
        .matchHeader('Authorization', 'Bearer test-token')
        .matchHeader('Content-Type', 'application/json')
        .reply(201, {
          id: 'ar-new',
          customer_id: 'cust-1',
          status: 'Pending',
          wallet_address: '0xdef',
        });

      const service = createService();
      const snapshot = await service.createAutoramp(body);

      expect(scope.isDone()).toBe(true);
      expect(snapshot).toMatchObject({
        id: 'ar-new',
        customerId: 'cust-1',
        status: 'Pending',
        walletAddress: '0xdef',
      });
    });

    it('forwards Idempotency-Key when provided', async () => {
      const scope = nock(STAGING_BASE)
        .post('/neobank/autoramps', { signed_quote: 'sig' })
        .query(true)
        .matchHeader('Idempotency-Key', 'create-idem')
        .reply(201, {
          id: 'ar-2',
          customer_id: 'cust-1',
          status: 'Pending',
        });

      const service = createService();
      await service.createAutoramp(
        { signed_quote: 'sig' },
        { idempotencyKey: 'create-idem' },
      );

      expect(scope.isDone()).toBe(true);
    });

    it('throws when the response body is malformed', async () => {
      nock(STAGING_BASE)
        .post('/neobank/autoramps')
        .query(true)
        .reply(201, { status: 'Pending' });

      const service = createService();
      await expect(
        service.createAutoramp({ signed_quote: 'sig' }),
      ).rejects.toThrow(
        'Malformed response received from neo-bank autoramp API',
      );
    });
  });

  describe('getAutorampQuoteForAutoramp', () => {
    it('gets /neobank/autoramps/{id}/quote with query params', async () => {
      const scope = nock(STAGING_BASE)
        .get('/neobank/autoramps/ar-1/quote')
        .query((query) => {
          return query.amount === '50' && query.context === 'test';
        })
        .matchHeader('Authorization', 'Bearer test-token')
        .reply(200, { quote_id: 'q-2' });

      const service = createService();
      const result = await service.getAutorampQuoteForAutoramp('ar-1', {
        amount: '50',
      });

      expect(scope.isDone()).toBe(true);
      expect(result).toMatchObject({ quote_id: 'q-2' });
    });
  });

  describe('attachAutorampQuote', () => {
    it('posts /neobank/autoramps/{id}/quotes with JSON body', async () => {
      const body = { signed_quote: 'attach-sig' };

      const scope = nock(STAGING_BASE)
        .post('/neobank/autoramps/ar-1/quotes', body)
        .query(true)
        .matchHeader('Authorization', 'Bearer test-token')
        .matchHeader('Content-Type', 'application/json')
        .reply(200, { quote_id: 'q-attached' });

      const service = createService();
      const result = await service.attachAutorampQuote('ar-1', body);

      expect(scope.isDone()).toBe(true);
      expect(result).toMatchObject({ quote_id: 'q-attached' });
    });
  });

  describe('getCustomerByExternalId', () => {
    it('gets /neobank/customers/{external_id}/external', async () => {
      const scope = nock(STAGING_BASE)
        .get('/neobank/customers/ext-1/external')
        .query(true)
        .matchHeader('Authorization', 'Bearer test-token')
        .reply(200, { id: 'cust-1', external_id: 'ext-1' });

      const service = createService();
      const result = await service.getCustomerByExternalId('ext-1');

      expect(scope.isDone()).toBe(true);
      expect(result).toMatchObject({ id: 'cust-1', external_id: 'ext-1' });
    });
  });

  describe('Money Account wallet registration', () => {
    it('resolves the Iron customer id via neobank customer lookup', async () => {
      nock(STAGING_BASE)
        .get('/neobank/customers/canonical-profile-1/external')
        .matchHeader('authorization', 'Bearer test-token')
        .reply(200, {
          id: 'iron-customer-1',
          external_id: 'canonical-profile-1',
        });

      const service = createService();

      expect(await service.getMoonpayCustomerId()).toBe('iron-customer-1');
    });

    it('checks Monad wallet registration status for a customer', async () => {
      nock(STAGING_BASE)
        .get('/neobank/addresses/crypto/iron-customer-1')
        .query({ filter: 'SelfHosted' })
        .reply(200, []);

      const service = createService();

      expect(
        await service.getWalletRegistrationStatus({
          customerId: 'iron-customer-1',
          address: '0xabc',
        }),
      ).toStrictEqual({ type: 'absent' });
    });

    it('submits a signed Monad wallet ownership proof with Idempotency-Key', async () => {
      nock(STAGING_BASE)
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

      const service = createService();

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

    it('uses the baseUrlOverride host for wallet routes', async () => {
      const overrideUrl = 'https://on-ramp.dev-api.cx.metamask.io';
      nock(overrideUrl)
        .get('/neobank/customers/canonical-profile-1/external')
        .reply(200, { id: 'iron-customer-1' });

      const service = createService({ baseUrlOverride: overrideUrl });

      expect(await service.getMoonpayCustomerId()).toBe('iron-customer-1');
    });

    it('throws when the session profile has no usable external id', async () => {
      const service = createService({ canonicalProfileId: '' });

      await expect(service.getMoonpayCustomerId()).rejects.toThrow(
        /Unable to resolve MetaMask canonical profile id/u,
      );
    });
  });

  describe('environments and policy hooks', () => {
    it.each([
      [RampsEnvironment.Production, 'https://on-ramp.api.cx.metamask.io'],
      [RampsEnvironment.Development, 'https://on-ramp.dev-api.cx.metamask.io'],
      [RampsEnvironment.Local, 'http://localhost:3000'],
    ] as const)(
      'uses the %s host for getAutoramp',
      async (environment, host) => {
        const scope = nock(host)
          .get(/\/neobank\/autoramps\/ar-1/u)
          .reply(200, {
            id: 'ar-1',
            customer_id: 'cust-1',
            status: 'Authorized',
          });

        const service = createService({ environment });
        await service.getAutoramp('ar-1');

        expect(scope.isDone()).toBe(true);
      },
    );

    it('uses constructor defaults for environment and policyOptions', async () => {
      const scope = nock(STAGING_BASE)
        .get(/\/neobank\/autoramps\/ar-1/u)
        .reply(200, {
          id: 'ar-1',
          customer_id: 'cust-1',
          status: 'Authorized',
        });

      const service = createService({ omitDefaults: true });
      await service.getAutoramp('ar-1');

      expect(scope.isDone()).toBe(true);
    });

    it('calls getAutorampQuote and getAutorampQuoteForAutoramp without query', async () => {
      const quoteScope = nock(STAGING_BASE)
        .get('/neobank/autoramps/quote')
        .query(true)
        .reply(200, { quote_id: 'q-default' });
      const forAutorampScope = nock(STAGING_BASE)
        .get('/neobank/autoramps/ar-1/quote')
        .query(true)
        .reply(200, { quote_id: 'q-for-ar' });

      const service = createService();
      await service.getAutorampQuote();
      await service.getAutorampQuoteForAutoramp('ar-1');

      expect(quoteScope.isDone()).toBe(true);
      expect(forAutorampScope.isDone()).toBe(true);
    });

    it('uses baseUrlOverride when provided', async () => {
      const scope = nock('http://custom-neobank.test')
        .get(/\/neobank\/autoramps\/ar-1/u)
        .reply(200, {
          id: 'ar-1',
          customer_id: 'cust-1',
          status: 'Authorized',
        });

      const service = createService({
        baseUrlOverride: 'http://custom-neobank.test',
      });
      await service.getAutoramp('ar-1');

      expect(scope.isDone()).toBe(true);
    });

    it('throws for an invalid environment', async () => {
      await expect(
        createService({
          environment: 'bogus' as RampsEnvironment,
        }).getAutoramp('ar-1'),
      ).rejects.toThrow(/Invalid environment/u);
    });

    it('throws HttpError on non-2xx POST responses', async () => {
      nock(STAGING_BASE)
        .post('/neobank/addresses/pix')
        .query(true)
        .reply(422, { error: 'bad' });

      const service = createService();
      await expect(
        service.registerPixAddress({ pix_key: 'k' }),
      ).rejects.toThrow(/failed with status '422'/u);
    });

    it('omits nullish query values when building quote URLs', async () => {
      const scope = nock(STAGING_BASE)
        .get('/neobank/autoramps/quote')
        .query((query) => {
          return (
            query.amount === '10' &&
            query.currency === undefined &&
            query.optional === undefined
          );
        })
        .reply(200, { quote_id: 'q-nullish' });

      const service = createService();
      await service.getAutorampQuote({
        amount: '10',
        currency: undefined,
        optional: null,
      });

      expect(scope.isDone()).toBe(true);
    });

    it('registers onRetry, onBreak, and onDegraded listeners', () => {
      const service = createService();
      const onRetry = jest.fn();
      const onBreak = jest.fn();
      const onDegraded = jest.fn();

      const retrySub = service.onRetry(onRetry);
      const breakSub = service.onBreak(onBreak);
      const degradedSub = service.onDegraded(onDegraded);

      expect(typeof retrySub.dispose).toBe('function');
      expect(typeof breakSub.dispose).toBe('function');
      expect(typeof degradedSub.dispose).toBe('function');

      retrySub.dispose();
      breakSub.dispose();
      degradedSub.dispose();
    });
  });
});
