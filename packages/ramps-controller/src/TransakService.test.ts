import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import nock, { cleanAll, isDone } from 'nock';

import type {
  TransakServiceMessenger,
  TransakAccessToken,
} from './TransakService';
import {
  TransakService,
  TransakEnvironment,
  TransakOrderIdTransformer,
  TransakApiError,
} from './TransakService';
import { flushPromises } from '../../../tests/helpers';

// === Test Constants ===

const MOCK_API_KEY = 'test-api-key-123';
const MOCK_CONTEXT = 'mobile-ios';

const STAGING_TRANSAK_BASE = 'https://api-gateway-stg.transak.com';
const PRODUCTION_TRANSAK_BASE = 'https://api-gateway.transak.com';
const STAGING_ORDERS_BASE = 'https://on-ramp.uat-api.cx.metamask.io';
const PRODUCTION_ORDERS_BASE = 'https://on-ramp.api.cx.metamask.io';
const STAGING_WIDGET_BASE = 'https://global-stg.transak.com';

const STAGING_PROVIDER_PATH = '/providers/transak-native-staging';
const PRODUCTION_PROVIDER_PATH = '/providers/transak-native';

const MOCK_ACCESS_TOKEN: TransakAccessToken = {
  accessToken: 'mock-jwt-token-abc',
  ttl: 3600,
  created: new Date('2025-01-01T00:00:00.000Z'),
};

const MOCK_USER_DETAILS = {
  id: 'user-123',
  firstName: 'Test',
  lastName: 'User',
  email: 'test@example.com',
  mobileNumber: '+15551234567',
  status: 'ACTIVE',
  dob: '1990-01-01',
  kyc: {
    status: 'APPROVED',
    type: 'L2',
    attempts: [],
    highestApprovedKYCType: 'L2',
    kycMarkedBy: null,
    kycResult: null,
    rejectionDetails: null,
    userId: 'user-123',
    workFlowRunId: 'wfr-123',
  },
  address: {
    addressLine1: '123 Main St',
    addressLine2: '',
    state: 'CA',
    city: 'San Francisco',
    postCode: '94102',
    country: 'United States',
    countryCode: 'US',
  },
  createdAt: '2025-01-01T00:00:00.000Z',
};

const MOCK_BUY_QUOTE = {
  quoteId: 'quote-123',
  conversionPrice: 2500,
  marketConversionPrice: 2500,
  slippage: 0.5,
  fiatCurrency: 'USD',
  cryptoCurrency: 'ETH',
  paymentMethod: 'credit_debit_card',
  fiatAmount: 100,
  cryptoAmount: 0.04,
  isBuyOrSell: 'BUY',
  network: 'ethereum',
  feeDecimal: 0.05,
  totalFee: 5,
  feeBreakdown: [],
  nonce: 1,
  cryptoLiquidityProvider: 'moonpay',
  notes: [],
};

const MOCK_TRANSLATION = {
  region: 'US',
  paymentMethod: 'credit_debit_card',
  cryptoCurrency: 'ETH',
  network: 'ethereum',
  fiatCurrency: 'USD',
};

const MOCK_KYC_REQUIREMENT = {
  status: 'APPROVED' as const,
  kycType: 'L2',
  isAllowedToPlaceOrder: true,
};

const MOCK_ADDITIONAL_REQUIREMENTS = {
  formsRequired: [
    {
      type: 'id-proof',
      metadata: {
        options: ['passport', 'drivers_license'],
        documentProofOptions: [],
        expiresAt: '2025-12-31T00:00:00.000Z',
        kycUrl: 'https://example.com/kyc',
        workFlowRunId: 'wfr-456',
      },
    },
  ],
};

const MOCK_TRANSAK_ORDER = {
  orderId: 'order-abc-123',
  partnerUserId: 'partner-user-1',
  status: 'AWAITING_PAYMENT_FROM_USER',
  isBuyOrSell: 'BUY',
  fiatCurrency: 'USD',
  cryptoCurrency: 'ETH',
  network: 'ethereum',
  walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
  quoteId: 'quote-123',
  fiatAmount: 100,
  fiatAmountInUsd: 100,
  amountPaid: 0,
  cryptoAmount: 0.04,
  conversionPrice: 2500,
  totalFeeInFiat: 5,
  paymentDetails: [
    {
      fiatCurrency: 'USD',
      paymentMethod: 'credit_debit_card',
      fields: [{ name: 'cardNumber', id: 'card', value: '****1234' }],
    },
  ],
  txHash: '',
  transationLink: null,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
  completedAt: '',
};

const MOCK_DEPOSIT_ORDER = {
  id: `${STAGING_PROVIDER_PATH}/orders/order-abc-123`,
  provider: 'transak-native-staging',
  cryptoAmount: 0.04,
  fiatAmount: 100,
  cryptoCurrency: {
    assetId: 'eip155:1/slip44:60',
    name: 'Ethereum',
    chainId: 'eip155:1',
    decimals: 18,
    iconUrl: 'https://example.com/eth.png',
    symbol: 'ETH',
  },
  fiatCurrency: 'USD',
  providerOrderId: 'order-abc-123',
  providerOrderLink: '',
  createdAt: 1704067200000,
  paymentMethod: {
    id: 'credit_debit_card',
    name: 'Credit/Debit Card',
    duration: '5-10 min',
    icon: 'card',
  },
  totalFeesFiat: 5,
  txHash: '',
  walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
  status: 'AWAITING_PAYMENT_FROM_USER',
  network: { name: 'Ethereum', chainId: 'eip155:1' },
  timeDescriptionPending: '5-10 min',
  fiatAmountInUsd: 100,
  feesInUsd: 5,
  region: {
    isoCode: 'US',
    flag: '🇺🇸',
    name: 'United States',
    phone: {
      prefix: '+1',
      placeholder: '(555) 123-4567',
      template: '(###) ###-####',
    },
    currency: 'USD',
    supported: true,
  },
  orderType: 'DEPOSIT' as const,
  paymentDetails: [],
};

const MOCK_USER_LIMITS = {
  limits: { '1': 5000, '30': 25000, '365': 100000 },
  spent: { '1': 100, '30': 500, '365': 2000 },
  remaining: { '1': 4900, '30': 24500, '365': 98000 },
  exceeded: { '1': false, '30': false, '365': false },
  shortage: {},
};

// === Test Setup Helpers ===

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<TransakServiceMessenger>,
  MessengerEvents<TransakServiceMessenger>
>;

function getRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

function getMessenger(rootMessenger: RootMessenger): TransakServiceMessenger {
  return new Messenger({
    namespace: 'TransakService',
    parent: rootMessenger,
  });
}

function getService({
  options = {},
}: {
  options?: Partial<ConstructorParameters<typeof TransakService>[0]>;
} = {}): {
  service: TransakService;
  rootMessenger: RootMessenger;
  messenger: TransakServiceMessenger;
} {
  const rootMessenger = getRootMessenger();
  const messenger = getMessenger(rootMessenger);
  const service = new TransakService({
    fetch,
    messenger,
    context: MOCK_CONTEXT,
    apiKey: MOCK_API_KEY,
    environment: TransakEnvironment.Staging,
    policyOptions: { maxRetries: 0 },
    ...options,
  });

  return { service, rootMessenger, messenger };
}

function authenticateService(service: TransakService): void {
  service.setAccessToken(MOCK_ACCESS_TOKEN);
}

/**
 * Sets up a nock interceptor for the staging Transak translation endpoint.
 * Many methods call getTranslation internally, so this helper avoids repetition.
 *
 * @param translationResponse - The mock translation response to return.
 * @param queryOverrides - Optional query parameter overrides to match against.
 * @returns The nock interceptor.
 */
function nockTranslation(
  translationResponse = MOCK_TRANSLATION,
  queryOverrides?: Record<string, string>,
): nock.Interceptor {
  return nock(STAGING_ORDERS_BASE)
    .get(`${STAGING_PROVIDER_PATH}/native/translate`)
    .query((query) => {
      if (!query.action || !query.context) {
        return false;
      }
      if (queryOverrides) {
        return Object.entries(queryOverrides).every(
          ([key, value]) => query[key] === value,
        );
      }
      return true;
    })
    .reply(200, translationResponse);
}

// === Tests ===

describe('TransakService', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: 0, doNotFake: ['nextTick', 'queueMicrotask'] });
  });

  afterEach(() => {
    jest.useRealTimers();
    cleanAll();
  });

  describe('constructor', () => {
    it('creates a service with the correct name', () => {
      const { service } = getService();
      expect(service.name).toBe('TransakService');
    });

    it('registers messenger action handlers', () => {
      const { rootMessenger, service } = getService();
      service.setApiKey('new-key');
      expect(service.getApiKey()).toBe('new-key');

      rootMessenger.call('TransakService:setApiKey', 'messenger-key');
      expect(service.getApiKey()).toBe('messenger-key');
    });

    it('defaults to staging environment', async () => {
      nock(STAGING_TRANSAK_BASE)
        .get('/api/v2/active-orders')
        .query(true)
        .reply(200, { data: [] });

      const { service } = getService();
      authenticateService(service);

      const promise = service.getActiveOrders();
      await jest.runAllTimersAsync();
      await flushPromises();
      await promise;
      expect(isDone()).toBe(true);
    });

    it('uses production URLs when environment is Production', async () => {
      nock(PRODUCTION_TRANSAK_BASE)
        .get('/api/v2/active-orders')
        .query(true)
        .reply(200, { data: [] });

      const { service } = getService({
        options: { environment: TransakEnvironment.Production },
      });
      authenticateService(service);

      const promise = service.getActiveOrders();
      await jest.runAllTimersAsync();
      await flushPromises();
      await promise;
      expect(isDone()).toBe(true);
    });

    it('stores the initial API key when provided', () => {
      const { service } = getService({ options: { apiKey: 'initial-key' } });
      expect(service.getApiKey()).toBe('initial-key');
    });

    it('uses default environment and policyOptions when not provided', () => {
      const rootMessenger = getRootMessenger();
      const messenger = getMessenger(rootMessenger);
      const service = new TransakService({
        fetch,
        messenger,
        context: MOCK_CONTEXT,
        apiKey: MOCK_API_KEY,
      });
      expect(service.name).toBe('TransakService');
    });

    it('throws for invalid environment when resolving Transak API base URL', async () => {
      const { service } = getService({
        options: { environment: 'invalid' as TransakEnvironment },
      });
      authenticateService(service);

      await expect(service.getUserDetails()).rejects.toThrow(
        'Invalid Transak environment: invalid',
      );
    });

    it('throws for invalid environment when resolving Ramps base URL', async () => {
      const { service } = getService({
        options: { environment: 'invalid' as TransakEnvironment },
      });

      await expect(
        service.getOrder('raw-order-id', '0xWALLET'),
      ).rejects.toThrow('Invalid Transak environment: invalid');
    });

    it('throws for invalid environment when resolving payment widget base URL', () => {
      const { service } = getService({
        options: { environment: 'invalid' as TransakEnvironment },
      });

      expect(() =>
        service.generatePaymentWidgetUrl('ott', MOCK_BUY_QUOTE, '0x1'),
      ).toThrow('Invalid Transak environment: invalid');
    });
  });

  describe('API key management', () => {
    it('setApiKey updates the stored API key', () => {
      const { service } = getService();
      service.setApiKey('new-api-key');
      expect(service.getApiKey()).toBe('new-api-key');
    });

    it('getApiKey returns null when no key is set', () => {
      const { service } = getService({ options: { apiKey: undefined } });
      expect(service.getApiKey()).toBeNull();
    });

    it('throws when making a request without an API key', async () => {
      const { service } = getService({ options: { apiKey: undefined } });
      authenticateService(service);

      await expect(service.getUserDetails()).rejects.toThrow(
        'Transak API key is required but not set.',
      );
    });
  });

  describe('access token management', () => {
    it('setAccessToken stores the token', () => {
      const { service } = getService();
      service.setAccessToken(MOCK_ACCESS_TOKEN);
      expect(service.getAccessToken()).toStrictEqual(MOCK_ACCESS_TOKEN);
    });

    it('getAccessToken returns null before any token is set', () => {
      const { service } = getService();
      expect(service.getAccessToken()).toBeNull();
    });

    it('clearAccessToken removes the stored token', () => {
      const { service } = getService();
      service.setAccessToken(MOCK_ACCESS_TOKEN);
      service.clearAccessToken();
      expect(service.getAccessToken()).toBeNull();
    });

    it('clearAccessToken via messenger', () => {
      const { service, rootMessenger } = getService();
      service.setAccessToken(MOCK_ACCESS_TOKEN);
      rootMessenger.call('TransakService:clearAccessToken');
      expect(service.getAccessToken()).toBeNull();
    });

    it('throws 401 HttpError when calling authenticated endpoint without token', async () => {
      const { service } = getService();

      await expect(service.getUserDetails()).rejects.toThrow(
        'Authentication required. Please log in to continue.',
      );
    });

    it('throws 401 HttpError and clears token when token has expired', async () => {
      const { service } = getService();
      const expiredToken: TransakAccessToken = {
        accessToken: 'expired-jwt',
        ttl: 3600,
        created: new Date(Date.now() - 3601 * 1000),
      };
      service.setAccessToken(expiredToken);

      await expect(service.getUserDetails()).rejects.toThrow(
        'Authentication token has expired. Please log in again.',
      );
      expect(service.getAccessToken()).toBeNull();
    });

    it('handles created field as a string (e.g. after messenger serialization)', async () => {
      const { service } = getService();
      const tokenWithStringDate = {
        accessToken: 'jwt-from-messenger',
        ttl: 3600,
        created: new Date(Date.now() - 3601 * 1000).toISOString(),
      } as unknown as TransakAccessToken;
      service.setAccessToken(tokenWithStringDate);

      await expect(service.getUserDetails()).rejects.toThrow(
        'Authentication token has expired. Please log in again.',
      );
      expect(service.getAccessToken()).toBeNull();
    });

    it('allows requests when token is within TTL', async () => {
      nock(STAGING_TRANSAK_BASE)
        .get('/api/v2/user/')
        .query(true)
        .reply(200, { data: MOCK_USER_DETAILS });

      const { service } = getService();
      const validToken: TransakAccessToken = {
        accessToken: 'valid-jwt',
        ttl: 3600,
        created: new Date(Date.now() - 1800 * 1000),
      };
      service.setAccessToken(validToken);

      const promise = service.getUserDetails();
      await jest.runAllTimersAsync();
      await flushPromises();

      expect(await promise).toStrictEqual(MOCK_USER_DETAILS);
    });
  });

  describe('sendUserOtp', () => {
    it('sends a POST to /api/v2/auth/login with the email', async () => {
      const mockResponse = {
        isTncAccepted: true,
        stateToken: 'state-token-123',
        email: 'test@example.com',
        expiresIn: 300,
      };

      nock(STAGING_TRANSAK_BASE)
        .post(
          '/api/v2/auth/login',
          (body) =>
            body.email === 'test@example.com' && body.apiKey === MOCK_API_KEY,
        )
        .reply(200, { data: mockResponse });

      const { service } = getService();

      const promise = service.sendUserOtp('test@example.com');
      await jest.runAllTimersAsync();
      await flushPromises();
      const result = await promise;

      expect(result).toStrictEqual(mockResponse);
    });

    it('sends OTP via messenger', async () => {
      const mockResponse = {
        isTncAccepted: false,
        stateToken: 'state-abc',
        email: 'user@test.com',
        expiresIn: 600,
      };

      nock(STAGING_TRANSAK_BASE)
        .post('/api/v2/auth/login', (body) => body.email === 'user@test.com')
        .reply(200, { data: mockResponse });

      const { rootMessenger } = getService();

      const promise = rootMessenger.call(
        'TransakService:sendUserOtp',
        'user@test.com',
      );
      await jest.runAllTimersAsync();
      await flushPromises();
      const result = await promise;

      expect(result).toStrictEqual(mockResponse);
    });

    it('throws when the API responds with an error', async () => {
      nock(STAGING_TRANSAK_BASE).post('/api/v2/auth/login').reply(400);

      const { service } = getService();

      const promise = service.sendUserOtp('invalid');
      await jest.runAllTimersAsync();
      await flushPromises();

      await expect(promise).rejects.toThrow("failed with status '400'");
    });

    it('throws a TransakApiError with numeric errorCode and apiMessage from rate-limit response', async () => {
      nock(STAGING_TRANSAK_BASE)
        .post('/api/v2/auth/login')
        .reply(400, {
          error: {
            statusCode: 400,
            message: 'You can request a new OTP after 1 minute.',
            errorCode: 1019,
          },
        });

      const { service } = getService();

      const promise = service.sendUserOtp('test@example.com');
      await jest.runAllTimersAsync();
      await flushPromises();

      await expect(promise).rejects.toBeInstanceOf(TransakApiError);
      await expect(promise).rejects.toThrow(
        expect.objectContaining({
          httpStatus: 400,
          errorCode: '1019',
          apiMessage: 'You can request a new OTP after 1 minute.',
        }),
      );
    });
  });

  describe('verifyUserOtp', () => {
    it('verifies OTP and returns an access token', async () => {
      const mockApiResponse = {
        accessToken: 'jwt-token-verified',
        ttl: 7200,
        created: '2025-06-01T12:00:00.000Z',
      };

      nock(STAGING_TRANSAK_BASE)
        .post(
          '/api/v2/auth/verify',
          (body) =>
            body.email === 'test@example.com' &&
            body.otp === '123456' &&
            body.stateToken === 'state-token' &&
            body.apiKey === MOCK_API_KEY,
        )
        .reply(200, { data: mockApiResponse });

      const { service } = getService();

      const promise = service.verifyUserOtp(
        'test@example.com',
        '123456',
        'state-token',
      );
      await jest.runAllTimersAsync();
      await flushPromises();
      const result = await promise;

      expect(result).toStrictEqual({
        accessToken: 'jwt-token-verified',
        ttl: 7200,
        created: new Date('2025-06-01T12:00:00.000Z'),
      });
    });

    it('sets the access token on the service after verification', async () => {
      nock(STAGING_TRANSAK_BASE)
        .post('/api/v2/auth/verify')
        .reply(200, {
          data: {
            accessToken: 'auto-stored-token',
            ttl: 3600,
            created: '2025-01-01T00:00:00.000Z',
          },
        });

      const { service } = getService();
      expect(service.getAccessToken()).toBeNull();

      const promise = service.verifyUserOtp('a@b.com', '000000', 'st');
      await jest.runAllTimersAsync();
      await flushPromises();
      await promise;

      expect(service.getAccessToken()?.accessToken).toBe('auto-stored-token');
    });

    it('throws when verification fails', async () => {
      nock(STAGING_TRANSAK_BASE).post('/api/v2/auth/verify').reply(401);

      const { service } = getService();

      const promise = service.verifyUserOtp('a@b.com', 'wrong', 'st');
      await jest.runAllTimersAsync();
      await flushPromises();

      await expect(promise).rejects.toThrow("failed with status '401'");
    });
  });

  describe('logout', () => {
    it('posts to the logout endpoint and clears the token', async () => {
      nock(STAGING_TRANSAK_BASE)
        .post('/api/v1/auth/logout')
        .reply(200, { data: 'success' });

      const { service } = getService();
      authenticateService(service);

      const promise = service.logout();
      await jest.runAllTimersAsync();
      await flushPromises();
      const result = await promise;

      expect(result).toBe('success');
      expect(service.getAccessToken()).toBeNull();
    });

    it('clears the token and returns a message when already logged out (401)', async () => {
      nock(STAGING_TRANSAK_BASE).post('/api/v1/auth/logout').reply(401);

      const { service } = getService();
      authenticateService(service);

      const promise = service.logout();
      await jest.runAllTimersAsync();
      await flushPromises();
      const result = await promise;

      expect(result).toBe('user was already logged out');
      expect(service.getAccessToken()).toBeNull();
    });

    it('throws when not authenticated', async () => {
      const { service } = getService();
      await expect(service.logout()).rejects.toThrow('Authentication required');
    });

    it('rethrows non-401 errors without clearing the token', async () => {
      nock(STAGING_TRANSAK_BASE).post('/api/v1/auth/logout').reply(500);

      const { service } = getService();
      authenticateService(service);

      const promise = service.logout();
      await jest.runAllTimersAsync();
      await flushPromises();

      await expect(promise).rejects.toThrow("failed with status '500'");
      expect(service.getAccessToken()).not.toBeNull();
    });
  });

  describe('getUserDetails', () => {
    it('returns user details from the API', async () => {
      nock(STAGING_TRANSAK_BASE)
        .get('/api/v2/user/')
        .query((query) => query.apiKey === MOCK_API_KEY)
        .reply(200, { data: MOCK_USER_DETAILS });

      const { service } = getService();
      authenticateService(service);

      const promise = service.getUserDetails();
      await jest.runAllTimersAsync();
      await flushPromises();
      const result = await promise;

      expect(result).toStrictEqual(MOCK_USER_DETAILS);
    });

    it('sends the authorization header', async () => {
      nock(STAGING_TRANSAK_BASE)
        .get('/api/v2/user/')
        .query(true)
        .matchHeader('authorization', MOCK_ACCESS_TOKEN.accessToken)
        .reply(200, { data: MOCK_USER_DETAILS });

      const { service } = getService();
      authenticateService(service);

      const promise = service.getUserDetails();
      await jest.runAllTimersAsync();
      await flushPromises();

      expect(await promise).toBeDefined();
    });

    it('throws when not authenticated', async () => {
      const { service } = getService();
      await expect(service.getUserDetails()).rejects.toThrow(
        'Authentication required',
      );
    });

    it('throws a TransakApiError with parsed errorCode on GET failure', async () => {
      nock(STAGING_TRANSAK_BASE)
        .get('/api/v2/user/')
        .query(true)
        .reply(422, {
          error: { code: '3001', message: 'Validation error' },
        });

      const { service } = getService();
      authenticateService(service);

      const promise = service.getUserDetails();
      await jest.runAllTimersAsync();
      await flushPromises();

      await expect(promise).rejects.toThrow(
        expect.objectContaining({
          httpStatus: 422,
          errorCode: '3001',
          apiMessage: 'Validation error',
        }),
      );
      await expect(promise).rejects.toBeInstanceOf(TransakApiError);
    });

    it('throws a TransakApiError without errorCode when GET error body is not valid JSON', async () => {
      nock(STAGING_TRANSAK_BASE)
        .get('/api/v2/user/')
        .query(true)
        .reply(500, 'Internal Server Error');

      const { service } = getService();
      authenticateService(service);

      const promise = service.getUserDetails();
      await jest.runAllTimersAsync();
      await flushPromises();

      await expect(promise).rejects.toBeInstanceOf(TransakApiError);
      await expect(promise).rejects.toThrow(
        expect.objectContaining({
          httpStatus: 500,
          errorCode: undefined,
          apiMessage: undefined,
        }),
      );
    });
  });

  describe('patchUser', () => {
    it('sends a PATCH request with personal details', async () => {
      const patchData = {
        personalDetails: {
          firstName: 'Updated',
          lastName: 'Name',
        },
      };

      nock(STAGING_TRANSAK_BASE)
        .patch(
          '/api/v2/kyc/user',
          (body) => body.personalDetails?.firstName === 'Updated',
        )
        .query((query) => query.apiKey === MOCK_API_KEY)
        .reply(200, { data: { success: true } });

      const { service } = getService();
      authenticateService(service);

      const promise = service.patchUser(patchData);
      await jest.runAllTimersAsync();
      await flushPromises();
      const result = await promise;

      expect(result).toStrictEqual({ success: true });
    });

    it('sends a PATCH request with address details', async () => {
      const patchData = {
        addressDetails: {
          addressLine1: '456 Oak Ave',
          city: 'New York',
          state: 'NY',
          postCode: '10001',
          countryCode: 'US',
        },
      };

      nock(STAGING_TRANSAK_BASE)
        .patch(
          '/api/v2/kyc/user',
          (body) => body.addressDetails?.city === 'New York',
        )
        .query(true)
        .reply(200, { data: { success: true } });

      const { service } = getService();
      authenticateService(service);

      const promise = service.patchUser(patchData);
      await jest.runAllTimersAsync();
      await flushPromises();

      expect(await promise).toStrictEqual({ success: true });
    });

    it('throws when the PATCH API returns a non-OK response', async () => {
      nock(STAGING_TRANSAK_BASE)
        .patch('/api/v2/kyc/user')
        .query(true)
        .times(4)
        .reply(500);

      const { service } = getService();
      authenticateService(service);

      const promise = service.patchUser({
        personalDetails: { firstName: 'Fail' },
      });
      promise.catch(() => undefined);
      await jest.runAllTimersAsync();
      await flushPromises();

      await expect(promise).rejects.toThrow("failed with status '500'");
    });

    it('throws a TransakApiError with parsed errorCode on PATCH failure', async () => {
      nock(STAGING_TRANSAK_BASE)
        .patch('/api/v2/kyc/user')
        .query(true)
        .reply(400, {
          error: { code: '2002', message: 'Invalid field' },
        });

      const { service } = getService();
      authenticateService(service);

      const promise = service.patchUser({
        personalDetails: { firstName: 'Bad' },
      });
      await jest.runAllTimersAsync();
      await flushPromises();

      await expect(promise).rejects.toBeInstanceOf(TransakApiError);
      await expect(promise).rejects.toThrow(
        expect.objectContaining({
          httpStatus: 400,
          errorCode: '2002',
          apiMessage: 'Invalid field',
        }),
      );
    });

    it('throws when not authenticated', async () => {
      const { service } = getService();
      await expect(
        service.patchUser({ personalDetails: { firstName: 'X' } }),
      ).rejects.toThrow('Authentication required');
    });
  });

  describe('getBuyQuote', () => {
    it('translates parameters and fetches a quote', async () => {
      nockTranslation();

      nock(STAGING_TRANSAK_BASE)
        .get('/api/v2/lookup/quotes')
        .query(
          (query) =>
            query.fiatCurrency === 'USD' &&
            query.cryptoCurrency === 'ETH' &&
            query.network === 'ethereum' &&
            query.paymentMethod === 'credit_debit_card' &&
            query.fiatAmount === '100' &&
            query.isBuyOrSell === 'BUY' &&
            query.isFeeExcludedFromFiat === 'true' &&
            query.apiKey === MOCK_API_KEY,
        )
        .reply(200, { data: MOCK_BUY_QUOTE });

      const { service } = getService();

      const promise = service.getBuyQuote(
        'USD',
        'eip155:1/slip44:60',
        'eip155:1',
        'credit_debit_card',
        '100',
      );
      await jest.runAllTimersAsync();
      await flushPromises();
      const result = await promise;

      expect(result).toStrictEqual(MOCK_BUY_QUOTE);
    });

    it('normalizes ramps API payment method IDs before translation', async () => {
      nock(STAGING_ORDERS_BASE)
        .get(`${STAGING_PROVIDER_PATH}/native/translate`)
        .query((query) => query.paymentMethod === 'credit_debit_card')
        .reply(200, MOCK_TRANSLATION);

      nock(STAGING_TRANSAK_BASE)
        .get('/api/v2/lookup/quotes')
        .query(true)
        .reply(200, { data: MOCK_BUY_QUOTE });

      const { service } = getService();

      const promise = service.getBuyQuote(
        'USD',
        'eip155:1/slip44:60',
        'eip155:1',
        '/payments/debit-credit-card',
        '100',
      );
      await jest.runAllTimersAsync();
      await flushPromises();

      expect(await promise).toBeDefined();
    });

    it('omits paymentMethod param when translation returns undefined', async () => {
      nock(STAGING_ORDERS_BASE)
        .get(`${STAGING_PROVIDER_PATH}/native/translate`)
        .query(true)
        .reply(200, {
          ...MOCK_TRANSLATION,
          paymentMethod: undefined,
        });

      nock(STAGING_TRANSAK_BASE)
        .get('/api/v2/lookup/quotes')
        .query((query) => !('paymentMethod' in query))
        .reply(200, { data: MOCK_BUY_QUOTE });

      const { service } = getService();

      const promise = service.getBuyQuote('USD', 'ETH', 'eip155:1', '', '100');
      await jest.runAllTimersAsync();
      await flushPromises();

      expect(await promise).toBeDefined();
    });
  });

  describe('getTranslation', () => {
    it('calls the ramps translation endpoint with query params', async () => {
      nock(STAGING_ORDERS_BASE)
        .get(`${STAGING_PROVIDER_PATH}/native/translate`)
        .query(
          (query) =>
            query.action === 'deposit' &&
            query.context === MOCK_CONTEXT &&
            query.cryptoCurrencyId === 'eip155:1/slip44:60' &&
            query.chainId === 'eip155:1' &&
            query.fiatCurrencyId === 'USD',
        )
        .reply(200, MOCK_TRANSLATION);

      const { service } = getService();

      const promise = service.getTranslation({
        cryptoCurrencyId: 'eip155:1/slip44:60',
        chainId: 'eip155:1',
        fiatCurrencyId: 'USD',
      });
      await jest.runAllTimersAsync();
      await flushPromises();
      const result = await promise;

      expect(result).toStrictEqual(MOCK_TRANSLATION);
    });

    it('uses production orders URL when environment is Production', async () => {
      nock(PRODUCTION_ORDERS_BASE)
        .get(`${PRODUCTION_PROVIDER_PATH}/native/translate`)
        .query(true)
        .reply(200, MOCK_TRANSLATION);

      const { service } = getService({
        options: { environment: TransakEnvironment.Production },
      });

      const promise = service.getTranslation({ fiatCurrencyId: 'USD' });
      await jest.runAllTimersAsync();
      await flushPromises();

      expect(await promise).toStrictEqual(MOCK_TRANSLATION);
    });

    it('omits undefined values from query params', async () => {
      nock(STAGING_ORDERS_BASE)
        .get(`${STAGING_PROVIDER_PATH}/native/translate`)
        .query(
          (query) =>
            query.fiatCurrencyId === 'USD' &&
            !('paymentMethod' in query) &&
            !('cryptoCurrencyId' in query),
        )
        .reply(200, MOCK_TRANSLATION);

      const { service } = getService();

      const promise = service.getTranslation({
        fiatCurrencyId: 'USD',
        paymentMethod: undefined,
        cryptoCurrencyId: undefined,
      });
      await jest.runAllTimersAsync();
      await flushPromises();

      expect(await promise).toBeDefined();
    });

    it('normalizes ramps payment method IDs to deposit format', async () => {
      nock(STAGING_ORDERS_BASE)
        .get(`${STAGING_PROVIDER_PATH}/native/translate`)
        .query(
          (query) =>
            query.paymentMethod === 'credit_debit_card' &&
            query.fiatCurrencyId === 'USD',
        )
        .reply(200, MOCK_TRANSLATION);

      const { service } = getService();

      const promise = service.getTranslation({
        fiatCurrencyId: 'USD',
        paymentMethod: '/payments/debit-credit-card',
      });
      await jest.runAllTimersAsync();
      await flushPromises();

      expect(await promise).toStrictEqual(MOCK_TRANSLATION);
    });

    it('passes through payment methods already in deposit format', async () => {
      nock(STAGING_ORDERS_BASE)
        .get(`${STAGING_PROVIDER_PATH}/native/translate`)
        .query(
          (query) =>
            query.paymentMethod === 'credit_debit_card' &&
            query.fiatCurrencyId === 'USD',
        )
        .reply(200, MOCK_TRANSLATION);

      const { service } = getService();

      const promise = service.getTranslation({
        fiatCurrencyId: 'USD',
        paymentMethod: 'credit_debit_card',
      });
      await jest.runAllTimersAsync();
      await flushPromises();

      expect(await promise).toStrictEqual(MOCK_TRANSLATION);
    });

    it('throws when translation endpoint fails', async () => {
      nock(STAGING_ORDERS_BASE)
        .get(`${STAGING_PROVIDER_PATH}/native/translate`)
        .query(true)
        .reply(500);

      const { service } = getService();

      const promise = service.getTranslation({ fiatCurrencyId: 'USD' });
      promise.catch(() => undefined);
      await jest.runAllTimersAsync();
      await flushPromises();

      await expect(promise).rejects.toThrow("failed with status '500'");
    });
  });

  describe('getKycRequirement', () => {
    it('fetches KYC requirement for a quote', async () => {
      nock(STAGING_TRANSAK_BASE)
        .get('/api/v2/kyc/requirement')
        .query(
          (query) =>
            query['metadata[quoteId]'] === 'quote-123' &&
            query.apiKey === MOCK_API_KEY,
        )
        .reply(200, { data: MOCK_KYC_REQUIREMENT });

      const { service } = getService();
      authenticateService(service);

      const promise = service.getKycRequirement('quote-123');
      await jest.runAllTimersAsync();
      await flushPromises();
      const result = await promise;

      expect(result).toStrictEqual(MOCK_KYC_REQUIREMENT);
    });

    it('throws when not authenticated', async () => {
      const { service } = getService();
      await expect(service.getKycRequirement('quote-123')).rejects.toThrow(
        'Authentication required',
      );
    });
  });

  describe('getAdditionalRequirements', () => {
    it('fetches additional requirements for a quote', async () => {
      nock(STAGING_TRANSAK_BASE)
        .get('/api/v2/kyc/additional-requirements')
        .query((query) => query['metadata[quoteId]'] === 'quote-456')
        .reply(200, { data: MOCK_ADDITIONAL_REQUIREMENTS });

      const { service } = getService();
      authenticateService(service);

      const promise = service.getAdditionalRequirements('quote-456');
      await jest.runAllTimersAsync();
      await flushPromises();
      const result = await promise;

      expect(result).toStrictEqual(MOCK_ADDITIONAL_REQUIREMENTS);
    });

    it('throws when not authenticated', async () => {
      const { service } = getService();
      await expect(service.getAdditionalRequirements('q-1')).rejects.toThrow(
        'Authentication required',
      );
    });
  });

  describe('submitSsnDetails', () => {
    it('submits SSN and quoteId', async () => {
      nock(STAGING_TRANSAK_BASE)
        .post(
          '/api/v2/kyc/ssn',
          (body) => body.ssn === '123-45-6789' && body.quoteId === 'quote-123',
        )
        .reply(200, { data: { success: true } });

      const { service } = getService();
      authenticateService(service);

      const promise = service.submitSsnDetails('123-45-6789', 'quote-123');
      await jest.runAllTimersAsync();
      await flushPromises();

      expect(await promise).toStrictEqual({ success: true });
    });

    it('throws when not authenticated', async () => {
      const { service } = getService();
      await expect(
        service.submitSsnDetails('111-22-3333', 'q1'),
      ).rejects.toThrow('Authentication required');
    });
  });

  describe('submitPurposeOfUsageForm', () => {
    it('submits purpose list', async () => {
      nock(STAGING_TRANSAK_BASE)
        .post(
          '/api/v2/kyc/purpose-of-usage',
          (body) =>
            Array.isArray(body.purposeList) &&
            body.purposeList.includes('investment'),
        )
        .reply(200, { data: null });

      const { service } = getService();
      authenticateService(service);

      const promise = service.submitPurposeOfUsageForm([
        'investment',
        'payments',
      ]);
      await jest.runAllTimersAsync();
      await flushPromises();

      expect(await promise).toBeUndefined();
    });

    it('throws when not authenticated', async () => {
      const { service } = getService();
      await expect(service.submitPurposeOfUsageForm(['test'])).rejects.toThrow(
        'Authentication required',
      );
    });
  });

  describe('getIdProofStatus', () => {
    it('fetches ID proof status for a workflow run', async () => {
      const mockStatus = {
        status: 'SUBMITTED' as const,
        kycType: 'L2',
        randomLogIdentifier: 'log-123',
      };

      nock(STAGING_TRANSAK_BASE)
        .get('/api/v2/kyc/id-proof-status')
        .query((query) => query.workFlowRunId === 'wfr-123')
        .reply(200, { data: mockStatus });

      const { service } = getService();
      authenticateService(service);

      const promise = service.getIdProofStatus('wfr-123');
      await jest.runAllTimersAsync();
      await flushPromises();

      expect(await promise).toStrictEqual(mockStatus);
    });
  });

  describe('createOrder', () => {
    it('creates an order and returns the deposit-formatted order', async () => {
      nockTranslation();

      nock(STAGING_TRANSAK_BASE)
        .post(
          '/api/v2/orders',
          (body) =>
            body.quoteId === 'quote-123' &&
            body.walletAddress === '0x1234' &&
            body.paymentInstrumentId === 'credit_debit_card',
        )
        .reply(200, { data: MOCK_TRANSAK_ORDER });

      nock(STAGING_ORDERS_BASE)
        .get(`${STAGING_PROVIDER_PATH}/orders/order-abc-123`)
        .query(true)
        .reply(200, MOCK_DEPOSIT_ORDER);

      const { service } = getService();
      authenticateService(service);

      const promise = service.createOrder(
        'quote-123',
        '0x1234',
        'credit_debit_card',
      );
      await jest.runAllTimersAsync();
      await flushPromises();
      const result = await promise;

      expect(result.id).toBe(`${STAGING_PROVIDER_PATH}/orders/order-abc-123`);
      expect(result.orderType).toBe('DEPOSIT');
    });

    it('throws when the order creation API returns an error', async () => {
      nockTranslation();

      nock(STAGING_TRANSAK_BASE).post('/api/v2/orders').reply(400);

      const { service } = getService();
      authenticateService(service);

      const promise = service.createOrder(
        'quote-123',
        '0x1234',
        'credit_debit_card',
      );
      await jest.runAllTimersAsync();
      await flushPromises();

      await expect(promise).rejects.toThrow("failed with status '400'");
    });

    it('normalizes ramps payment method IDs for the translation', async () => {
      nock(STAGING_ORDERS_BASE)
        .get(`${STAGING_PROVIDER_PATH}/native/translate`)
        .query((query) => query.paymentMethod === 'credit_debit_card')
        .reply(200, MOCK_TRANSLATION);

      nock(STAGING_TRANSAK_BASE)
        .post('/api/v2/orders')
        .reply(200, { data: MOCK_TRANSAK_ORDER });

      nock(STAGING_ORDERS_BASE)
        .get(`${STAGING_PROVIDER_PATH}/orders/order-abc-123`)
        .query(true)
        .reply(200, MOCK_DEPOSIT_ORDER);

      const { service } = getService();
      authenticateService(service);

      const promise = service.createOrder(
        'quote-123',
        '0x1234',
        '/payments/debit-credit-card',
      );
      await jest.runAllTimersAsync();
      await flushPromises();

      expect(await promise).toBeDefined();
    });

    it('falls back to the normalized payment method when translation returns undefined', async () => {
      nock(STAGING_ORDERS_BASE)
        .get(`${STAGING_PROVIDER_PATH}/native/translate`)
        .query(true)
        .reply(200, { ...MOCK_TRANSLATION, paymentMethod: undefined });

      nock(STAGING_TRANSAK_BASE)
        .post(
          '/api/v2/orders',
          (body) => body.paymentInstrumentId === 'credit_debit_card',
        )
        .reply(200, { data: MOCK_TRANSAK_ORDER });

      nock(STAGING_ORDERS_BASE)
        .get(`${STAGING_PROVIDER_PATH}/orders/order-abc-123`)
        .query(true)
        .reply(200, MOCK_DEPOSIT_ORDER);

      const { service } = getService();
      authenticateService(service);

      const promise = service.createOrder(
        'quote-123',
        '0x1234',
        '/payments/debit-credit-card',
      );
      await jest.runAllTimersAsync();
      await flushPromises();

      expect(await promise).toBeDefined();
    });

    it('retries order creation when the first attempt fails with an existing order error', async () => {
      jest.useRealTimers();

      nockTranslation();

      nock(STAGING_TRANSAK_BASE)
        .post('/api/v2/orders')
        .once()
        .reply(409, {
          error: { code: '4005', message: 'Order exists' },
        });

      nock(STAGING_TRANSAK_BASE)
        .get('/api/v2/active-orders')
        .query(true)
        .reply(200, { data: [] });

      nock(STAGING_TRANSAK_BASE)
        .post('/api/v2/orders')
        .reply(200, { data: MOCK_TRANSAK_ORDER });

      nock(STAGING_ORDERS_BASE)
        .get(`${STAGING_PROVIDER_PATH}/orders/order-abc-123`)
        .query(true)
        .reply(200, MOCK_DEPOSIT_ORDER);

      const { service } = getService({ options: { orderRetryDelayMs: 50 } });
      service.setAccessToken({
        ...MOCK_ACCESS_TOKEN,
        created: new Date(),
      });

      const result = await service.createOrder(
        'quote-123',
        '0x1234',
        'credit_debit_card',
      );

      expect(result.id).toBe(`${STAGING_PROVIDER_PATH}/orders/order-abc-123`);
      expect(result.orderType).toBe('DEPOSIT');
    }, 10000);

    it('throws without retrying when a 409 response does not contain the order-exists error code', async () => {
      nockTranslation();

      nock(STAGING_TRANSAK_BASE)
        .post('/api/v2/orders')
        .once()
        .reply(409, {
          error: { code: '9999', message: 'Some other conflict' },
        });

      const { service } = getService();
      authenticateService(service);

      const promise = service.createOrder(
        'quote-123',
        '0x1234',
        'credit_debit_card',
      );
      await jest.runAllTimersAsync();
      await flushPromises();

      await expect(promise).rejects.toThrow("failed with status '409'");
    });

    it('throws a TransakApiError with the parsed errorCode from the response body', async () => {
      nockTranslation();

      nock(STAGING_TRANSAK_BASE)
        .post('/api/v2/orders')
        .reply(422, {
          error: { code: '5001', message: 'Validation failed' },
        });

      const { service } = getService();
      authenticateService(service);

      const promise = service.createOrder(
        'quote-123',
        '0x1234',
        'credit_debit_card',
      );
      await jest.runAllTimersAsync();
      await flushPromises();

      await expect(promise).rejects.toThrow(
        expect.objectContaining({
          httpStatus: 422,
          errorCode: '5001',
          apiMessage: 'Validation failed',
        }),
      );
    });

    it('throws when not authenticated', async () => {
      const { service } = getService();
      await expect(service.createOrder('q-1', '0x1', 'card')).rejects.toThrow(
        'Authentication required',
      );
    });
  });

  describe('getOrder', () => {
    it('fetches an order by deposit order ID', async () => {
      const depositOrderId = `${STAGING_PROVIDER_PATH}/orders/order-abc-123`;

      nock(STAGING_ORDERS_BASE)
        .get(`${STAGING_PROVIDER_PATH}/orders/order-abc-123`)
        .query(
          (query) =>
            query.wallet === '0x1234' &&
            query.action === 'deposit' &&
            query.context === MOCK_CONTEXT,
        )
        .reply(200, MOCK_DEPOSIT_ORDER);

      const { service } = getService();

      const promise = service.getOrder(depositOrderId, '0x1234');
      await jest.runAllTimersAsync();
      await flushPromises();
      const result = await promise;

      expect(result.id).toBe(depositOrderId);
      expect(result.orderType).toBe('DEPOSIT');
    });

    it('converts a raw Transak order ID to deposit format', async () => {
      nock(STAGING_ORDERS_BASE)
        .get(`${STAGING_PROVIDER_PATH}/orders/raw-order-id`)
        .query(true)
        .reply(200, {
          ...MOCK_DEPOSIT_ORDER,
          id: `${STAGING_PROVIDER_PATH}/orders/raw-order-id`,
        });

      const { service } = getService();

      const promise = service.getOrder('raw-order-id', '0x1234');
      await jest.runAllTimersAsync();
      await flushPromises();
      const result = await promise;

      expect(result.id).toBe(`${STAGING_PROVIDER_PATH}/orders/raw-order-id`);
    });

    it('uses provided paymentDetails instead of fetching from Transak API', async () => {
      const depositOrderId = `${STAGING_PROVIDER_PATH}/orders/order-abc-123`;
      const paymentDetails = [
        {
          fiatCurrency: 'USD',
          paymentMethod: 'card',
          fields: [{ name: 'test', id: 'test', value: 'val' }],
        },
      ];

      nock(STAGING_ORDERS_BASE)
        .get(`${STAGING_PROVIDER_PATH}/orders/order-abc-123`)
        .query(true)
        .reply(200, MOCK_DEPOSIT_ORDER);

      const { service } = getService();

      const promise = service.getOrder(
        depositOrderId,
        '0x1234',
        paymentDetails,
      );
      await jest.runAllTimersAsync();
      await flushPromises();
      const result = await promise;

      expect(result.paymentDetails).toStrictEqual(paymentDetails);
    });

    it('fetches paymentDetails from Transak when authenticated and not provided', async () => {
      const depositOrderId = `${STAGING_PROVIDER_PATH}/orders/order-abc-123`;
      const orderWithoutPaymentDetails = {
        ...MOCK_DEPOSIT_ORDER,
        paymentDetails: [],
      };

      nock(STAGING_ORDERS_BASE)
        .get(`${STAGING_PROVIDER_PATH}/orders/order-abc-123`)
        .query(true)
        .reply(200, orderWithoutPaymentDetails);

      nock(STAGING_TRANSAK_BASE)
        .get('/api/v2/orders/order-abc-123')
        .query(true)
        .reply(200, { data: MOCK_TRANSAK_ORDER });

      const { service } = getService();
      authenticateService(service);

      const promise = service.getOrder(depositOrderId, '0x1234');
      await jest.runAllTimersAsync();
      await flushPromises();
      const result = await promise;

      expect(result.paymentDetails).toStrictEqual(
        MOCK_TRANSAK_ORDER.paymentDetails,
      );
    });

    it('returns order without paymentDetails when unauthenticated and not provided', async () => {
      const depositOrderId = `${STAGING_PROVIDER_PATH}/orders/order-abc-123`;
      const orderWithoutPaymentDetails = {
        ...MOCK_DEPOSIT_ORDER,
        paymentDetails: [],
      };

      nock(STAGING_ORDERS_BASE)
        .get(`${STAGING_PROVIDER_PATH}/orders/order-abc-123`)
        .query(true)
        .reply(200, orderWithoutPaymentDetails);

      const { service } = getService();

      const promise = service.getOrder(depositOrderId, '0x1234');
      await jest.runAllTimersAsync();
      await flushPromises();
      const result = await promise;

      expect(result.paymentDetails).toStrictEqual([]);
    });

    it('throws when the orders API returns a non-OK response', async () => {
      const depositOrderId = `${STAGING_PROVIDER_PATH}/orders/order-abc-123`;

      nock(STAGING_ORDERS_BASE)
        .get(`${STAGING_PROVIDER_PATH}/orders/order-abc-123`)
        .query(true)
        .times(4)
        .reply(503);

      const { service } = getService();

      const promise = service.getOrder(depositOrderId, '0x1234');
      promise.catch(() => undefined);
      await jest.runAllTimersAsync();
      await flushPromises();

      await expect(promise).rejects.toThrow("failed with status '503'");
    });

    it('gracefully handles failure when fetching paymentDetails from Transak', async () => {
      const depositOrderId = `${STAGING_PROVIDER_PATH}/orders/order-abc-123`;
      const orderWithoutPaymentDetails = {
        ...MOCK_DEPOSIT_ORDER,
        paymentDetails: [],
      };

      nock(STAGING_ORDERS_BASE)
        .get(`${STAGING_PROVIDER_PATH}/orders/order-abc-123`)
        .query(true)
        .reply(200, orderWithoutPaymentDetails);

      nock(STAGING_TRANSAK_BASE)
        .get('/api/v2/orders/order-abc-123')
        .query(true)
        .reply(500);

      const { service } = getService();
      authenticateService(service);

      const promise = service.getOrder(depositOrderId, '0x1234');
      await jest.runAllTimersAsync();
      await flushPromises();
      const result = await promise;

      expect(result.paymentDetails).toStrictEqual([]);
    });
  });

  describe('getUserLimits', () => {
    it('fetches user limits with translated payment method', async () => {
      nockTranslation();

      nock(STAGING_TRANSAK_BASE)
        .get('/api/v2/orders/user-limit')
        .query(
          (query) =>
            query.isBuyOrSell === 'BUY' &&
            query.kycType === 'L2' &&
            query.fiatCurrency === 'USD' &&
            query.paymentCategory === 'credit_debit_card',
        )
        .reply(200, { data: MOCK_USER_LIMITS });

      const { service } = getService();
      authenticateService(service);

      const promise = service.getUserLimits('USD', 'credit_debit_card', 'L2');
      await jest.runAllTimersAsync();
      await flushPromises();
      const result = await promise;

      expect(result).toStrictEqual(MOCK_USER_LIMITS);
    });

    it('omits paymentCategory when translation returns undefined', async () => {
      nock(STAGING_ORDERS_BASE)
        .get(`${STAGING_PROVIDER_PATH}/native/translate`)
        .query(true)
        .reply(200, { ...MOCK_TRANSLATION, paymentMethod: undefined });

      nock(STAGING_TRANSAK_BASE)
        .get('/api/v2/orders/user-limit')
        .query((query) => !('paymentCategory' in query))
        .reply(200, { data: MOCK_USER_LIMITS });

      const { service } = getService();
      authenticateService(service);

      const promise = service.getUserLimits('USD', '', 'L2');
      await jest.runAllTimersAsync();
      await flushPromises();

      expect(await promise).toStrictEqual(MOCK_USER_LIMITS);
    });

    it('throws when not authenticated', async () => {
      const { service } = getService();
      await expect(service.getUserLimits('USD', 'card', 'L2')).rejects.toThrow(
        'Authentication required',
      );
    });
  });

  describe('requestOtt', () => {
    it('requests a one-time token', async () => {
      nock(STAGING_TRANSAK_BASE)
        .post('/api/v2/auth/request-ott')
        .reply(200, { data: { ott: 'ott-token-xyz' } });

      const { service } = getService();
      authenticateService(service);

      const promise = service.requestOtt();
      await jest.runAllTimersAsync();
      await flushPromises();
      const result = await promise;

      expect(result).toStrictEqual({ ott: 'ott-token-xyz' });
    });

    it('throws when not authenticated', async () => {
      const { service } = getService();
      await expect(service.requestOtt()).rejects.toThrow(
        'Authentication required',
      );
    });
  });

  describe('generatePaymentWidgetUrl', () => {
    it('generates a valid widget URL with all required params', () => {
      const { service } = getService();

      const url = service.generatePaymentWidgetUrl(
        'ott-token',
        MOCK_BUY_QUOTE,
        '0xWALLET',
      );

      const parsed = new URL(url);
      expect(parsed.origin).toBe(STAGING_WIDGET_BASE);
      expect(parsed.searchParams.get('apiKey')).toBe(MOCK_API_KEY);
      expect(parsed.searchParams.get('ott')).toBe('ott-token');
      expect(parsed.searchParams.get('walletAddress')).toBe('0xWALLET');
    });

    it('includes extra params when provided', () => {
      const { service } = getService();

      const url = service.generatePaymentWidgetUrl(
        'ott-token',
        MOCK_BUY_QUOTE,
        '0xWALLET',
        { themeColor: '037dd6', customParam: 'value' },
      );

      const parsed = new URL(url);
      expect(parsed.searchParams.get('themeColor')).toBe('037dd6');
      expect(parsed.searchParams.get('customParam')).toBe('value');
    });

    it('uses the staging widget base URL', () => {
      const { service } = getService();

      const url = service.generatePaymentWidgetUrl(
        'ott',
        MOCK_BUY_QUOTE,
        '0x1',
      );

      expect(url).toContain(STAGING_WIDGET_BASE);
    });

    it('uses production widget URL when environment is Production', () => {
      const { service } = getService({
        options: { environment: TransakEnvironment.Production },
      });

      const url = service.generatePaymentWidgetUrl(
        'ott',
        MOCK_BUY_QUOTE,
        '0x1',
      );

      expect(url).toContain('https://global.transak.com');
    });

    it('logs a warning when quote.paymentMethod is falsy', () => {
      const { service } = getService();
      const quoteWithoutPaymentMethod = {
        ...MOCK_BUY_QUOTE,
        paymentMethod: '',
      };

      const url = service.generatePaymentWidgetUrl(
        'ott-token',
        quoteWithoutPaymentMethod,
        '0xWALLET',
      );

      const parsed = new URL(url);
      expect(parsed.origin).toBe(STAGING_WIDGET_BASE);
      expect(parsed.searchParams.get('paymentMethod')).toBe('');
    });

    it('throws when API key is not set', () => {
      const { service } = getService({ options: { apiKey: undefined } });

      expect(() =>
        service.generatePaymentWidgetUrl('ott', MOCK_BUY_QUOTE, '0x1'),
      ).toThrow('Transak API key is required but not set.');
    });

    it('includes all expected query parameters', () => {
      const { service } = getService();

      const url = service.generatePaymentWidgetUrl(
        'ott-123',
        MOCK_BUY_QUOTE,
        '0xABC',
      );

      const parsed = new URL(url);
      expect(parsed.searchParams.get('apiKey')).toBe(MOCK_API_KEY);
      expect(parsed.searchParams.get('ott')).toBe('ott-123');
      expect(parsed.searchParams.get('fiatCurrency')).toBe('USD');
      expect(parsed.searchParams.get('cryptoCurrencyCode')).toBe('ETH');
      expect(parsed.searchParams.get('productsAvailed')).toBe('BUY');
      expect(parsed.searchParams.get('fiatAmount')).toBe('100');
      expect(parsed.searchParams.get('network')).toBe('ethereum');
      expect(parsed.searchParams.get('hideExchangeScreen')).toBe('true');
      expect(parsed.searchParams.get('walletAddress')).toBe('0xABC');
      expect(parsed.searchParams.get('disableWalletAddressForm')).toBe('true');
      expect(parsed.searchParams.get('paymentMethod')).toBe(
        'credit_debit_card',
      );
      expect(parsed.searchParams.get('hideMenu')).toBe('true');
    });
  });

  describe('confirmPayment', () => {
    it('confirms payment with translated payment method', async () => {
      nockTranslation();

      nock(STAGING_TRANSAK_BASE)
        .post(
          '/api/v2/orders/payment-confirmation',
          (body) =>
            body.orderId === 'order-abc-123' &&
            body.paymentMethod === 'credit_debit_card',
        )
        .reply(200, { data: { success: true } });

      const { service } = getService();
      authenticateService(service);

      const depositOrderId = `${STAGING_PROVIDER_PATH}/orders/order-abc-123`;
      const promise = service.confirmPayment(
        depositOrderId,
        'credit_debit_card',
      );
      await jest.runAllTimersAsync();
      await flushPromises();
      const result = await promise;

      expect(result).toStrictEqual({ success: true });
    });

    it('extracts Transak order ID from deposit order ID', async () => {
      nockTranslation();

      nock(STAGING_TRANSAK_BASE)
        .post(
          '/api/v2/orders/payment-confirmation',
          (body) => body.orderId === 'raw-order-id',
        )
        .reply(200, { data: { success: true } });

      const { service } = getService();
      authenticateService(service);

      const promise = service.confirmPayment(
        'raw-order-id',
        'credit_debit_card',
      );
      await jest.runAllTimersAsync();
      await flushPromises();

      expect(await promise).toStrictEqual({ success: true });
    });

    it('falls back to the normalized payment method when translation returns undefined', async () => {
      nock(STAGING_ORDERS_BASE)
        .get(`${STAGING_PROVIDER_PATH}/native/translate`)
        .query(true)
        .reply(200, { ...MOCK_TRANSLATION, paymentMethod: undefined });

      nock(STAGING_TRANSAK_BASE)
        .post(
          '/api/v2/orders/payment-confirmation',
          (body) => body.paymentMethod === 'credit_debit_card',
        )
        .reply(200, { data: { success: true } });

      const { service } = getService();
      authenticateService(service);

      const promise = service.confirmPayment(
        'order-1',
        '/payments/debit-credit-card',
      );
      await jest.runAllTimersAsync();
      await flushPromises();

      expect(await promise).toStrictEqual({ success: true });
    });

    it('throws when not authenticated', async () => {
      const { service } = getService();
      await expect(service.confirmPayment('o-1', 'card')).rejects.toThrow(
        'Authentication required',
      );
    });
  });

  describe('cancelOrder', () => {
    it('sends a DELETE request with the Transak order ID', async () => {
      const depositOrderId = `${STAGING_PROVIDER_PATH}/orders/order-to-cancel`;

      nock(STAGING_TRANSAK_BASE)
        .delete('/api/v2/orders/order-to-cancel')
        .query(
          (query) =>
            query.cancelReason === 'Creating new order' &&
            query.apiKey === MOCK_API_KEY,
        )
        .reply(200);

      const { service } = getService();
      authenticateService(service);

      const promise = service.cancelOrder(depositOrderId);
      await jest.runAllTimersAsync();
      await flushPromises();

      expect(await promise).toBeUndefined();
    });

    it('handles raw Transak order ID', async () => {
      nock(STAGING_TRANSAK_BASE)
        .delete('/api/v2/orders/raw-cancel-id')
        .query(true)
        .reply(200);

      const { service } = getService();
      authenticateService(service);

      const promise = service.cancelOrder('raw-cancel-id');
      await jest.runAllTimersAsync();
      await flushPromises();

      expect(await promise).toBeUndefined();
    });

    it('throws when not authenticated', async () => {
      const { service } = getService();
      await expect(service.cancelOrder('o-1')).rejects.toThrow(
        'Authentication required',
      );
    });

    it('throws when the API returns an error', async () => {
      nock(STAGING_TRANSAK_BASE)
        .delete('/api/v2/orders/bad-order')
        .query(true)
        .reply(404);

      const { service } = getService();
      authenticateService(service);

      const promise = service.cancelOrder('bad-order');
      await jest.runAllTimersAsync();
      await flushPromises();

      await expect(promise).rejects.toThrow("failed with status '404'");
    });

    it('throws a TransakApiError with parsed errorCode on DELETE failure', async () => {
      nock(STAGING_TRANSAK_BASE)
        .delete('/api/v2/orders/err-order')
        .query(true)
        .reply(409, {
          error: { code: '4010', message: 'Cannot cancel' },
        });

      const { service } = getService();
      authenticateService(service);

      const promise = service.cancelOrder('err-order');
      await jest.runAllTimersAsync();
      await flushPromises();

      await expect(promise).rejects.toBeInstanceOf(TransakApiError);
      await expect(promise).rejects.toThrow(
        expect.objectContaining({
          httpStatus: 409,
          errorCode: '4010',
          apiMessage: 'Cannot cancel',
        }),
      );
    });
  });

  describe('cancelAllActiveOrders', () => {
    it('fetches active orders and cancels each one, returning empty errors', async () => {
      nock(STAGING_TRANSAK_BASE)
        .get('/api/v2/active-orders')
        .query(true)
        .reply(200, {
          data: [
            { ...MOCK_TRANSAK_ORDER, orderId: 'active-1' },
            { ...MOCK_TRANSAK_ORDER, orderId: 'active-2' },
          ],
        });

      nock(STAGING_TRANSAK_BASE)
        .delete('/api/v2/orders/active-1')
        .query(true)
        .reply(200);

      nock(STAGING_TRANSAK_BASE)
        .delete('/api/v2/orders/active-2')
        .query(true)
        .reply(200);

      const { service } = getService();
      authenticateService(service);

      const promise = service.cancelAllActiveOrders();
      await jest.runAllTimersAsync();
      await flushPromises();

      expect(await promise).toStrictEqual([]);
      expect(isDone()).toBe(true);
    });

    it('collects individual cancel errors instead of throwing', async () => {
      nock(STAGING_TRANSAK_BASE)
        .get('/api/v2/active-orders')
        .query(true)
        .reply(200, {
          data: [
            { ...MOCK_TRANSAK_ORDER, orderId: 'fail-order' },
            { ...MOCK_TRANSAK_ORDER, orderId: 'succeed-order' },
          ],
        });

      nock(STAGING_TRANSAK_BASE)
        .delete('/api/v2/orders/fail-order')
        .query(true)
        .reply(500);

      nock(STAGING_TRANSAK_BASE)
        .delete('/api/v2/orders/succeed-order')
        .query(true)
        .reply(200);

      const { service } = getService();
      authenticateService(service);

      const promise = service.cancelAllActiveOrders();
      await jest.runAllTimersAsync();
      await flushPromises();

      const errors = await promise;
      expect(errors).toHaveLength(1);
      expect(errors[0]).toBeInstanceOf(Error);
      expect(errors[0].message).toContain("failed with status '500'");
    });

    it('wraps non-Error throws in Error objects', async () => {
      nock(STAGING_TRANSAK_BASE)
        .get('/api/v2/active-orders')
        .query(true)
        .reply(200, {
          data: [{ ...MOCK_TRANSAK_ORDER, orderId: 'string-error-order' }],
        });

      const { service } = getService();
      authenticateService(service);

      jest
        .spyOn(service, 'cancelOrder')
        .mockRejectedValue('string error value');

      const promise = service.cancelAllActiveOrders();
      await jest.runAllTimersAsync();
      await flushPromises();

      const errors = await promise;
      expect(errors).toHaveLength(1);
      expect(errors[0]).toBeInstanceOf(Error);
      expect(errors[0].message).toBe('string error value');
    });

    it('returns empty array when there are no active orders', async () => {
      nock(STAGING_TRANSAK_BASE)
        .get('/api/v2/active-orders')
        .query(true)
        .reply(200, { data: [] });

      const { service } = getService();
      authenticateService(service);

      const promise = service.cancelAllActiveOrders();
      await jest.runAllTimersAsync();
      await flushPromises();

      expect(await promise).toStrictEqual([]);
    });
  });

  describe('getActiveOrders', () => {
    it('fetches active orders', async () => {
      nock(STAGING_TRANSAK_BASE)
        .get('/api/v2/active-orders')
        .query(true)
        .reply(200, { data: [MOCK_TRANSAK_ORDER] });

      const { service } = getService();
      authenticateService(service);

      const promise = service.getActiveOrders();
      await jest.runAllTimersAsync();
      await flushPromises();
      const result = await promise;

      expect(result).toHaveLength(1);
      expect(result[0].orderId).toBe('order-abc-123');
    });

    it('throws when not authenticated', async () => {
      const { service } = getService();
      await expect(service.getActiveOrders()).rejects.toThrow(
        'Authentication required',
      );
    });
  });

  describe('HTTP method handling', () => {
    it('does not include null/undefined values in GET query params', async () => {
      nock(STAGING_TRANSAK_BASE)
        .get('/api/v2/active-orders')
        .query((query) => {
          const keys = Object.keys(query);
          return (
            !keys.includes('undefinedParam') && !keys.includes('nullParam')
          );
        })
        .reply(200, { data: [] });

      const { service } = getService();
      authenticateService(service);

      const promise = service.getActiveOrders();
      await jest.runAllTimersAsync();
      await flushPromises();

      expect(await promise).toBeDefined();
    });

    it('includes Content-Type and Accept headers on POST requests', async () => {
      nock(STAGING_TRANSAK_BASE)
        .post('/api/v2/auth/login')
        .matchHeader('Content-Type', 'application/json')
        .matchHeader('Accept', 'application/json')
        .reply(200, {
          data: {
            isTncAccepted: true,
            stateToken: 'st',
            email: 'a@b.com',
            expiresIn: 300,
          },
        });

      const { service } = getService();

      const promise = service.sendUserOtp('a@b.com');
      await jest.runAllTimersAsync();
      await flushPromises();

      expect(await promise).toBeDefined();
    });
  });
});

describe('TransakOrderIdTransformer', () => {
  describe('depositOrderIdToTransakOrderId', () => {
    it('extracts the Transak order ID from a deposit order ID', () => {
      expect(
        TransakOrderIdTransformer.depositOrderIdToTransakOrderId(
          '/providers/transak-native-staging/orders/abc-123',
        ),
      ).toBe('abc-123');
    });

    it('handles production deposit order IDs', () => {
      expect(
        TransakOrderIdTransformer.depositOrderIdToTransakOrderId(
          '/providers/transak-native/orders/xyz-789',
        ),
      ).toBe('xyz-789');
    });

    it('returns the input if it has no slashes', () => {
      expect(
        TransakOrderIdTransformer.depositOrderIdToTransakOrderId('simple-id'),
      ).toBe('simple-id');
    });
  });

  describe('transakOrderIdToDepositOrderId', () => {
    it('builds a staging deposit order ID', () => {
      expect(
        TransakOrderIdTransformer.transakOrderIdToDepositOrderId(
          'order-123',
          TransakEnvironment.Staging,
        ),
      ).toBe('/providers/transak-native-staging/orders/order-123');
    });

    it('builds a production deposit order ID', () => {
      expect(
        TransakOrderIdTransformer.transakOrderIdToDepositOrderId(
          'order-456',
          TransakEnvironment.Production,
        ),
      ).toBe('/providers/transak-native/orders/order-456');
    });
  });

  describe('isDepositOrderId', () => {
    it('returns true for deposit-format order IDs', () => {
      expect(
        TransakOrderIdTransformer.isDepositOrderId(
          '/providers/transak-native-staging/orders/abc',
        ),
      ).toBe(true);
    });

    it('returns false for raw Transak order IDs', () => {
      expect(TransakOrderIdTransformer.isDepositOrderId('raw-order-id')).toBe(
        false,
      );
    });
  });

  describe('extractTransakOrderId', () => {
    it('extracts from deposit order IDs', () => {
      expect(
        TransakOrderIdTransformer.extractTransakOrderId(
          '/providers/transak-native/orders/extracted-id',
        ),
      ).toBe('extracted-id');
    });

    it('returns raw IDs unchanged', () => {
      expect(
        TransakOrderIdTransformer.extractTransakOrderId('already-raw'),
      ).toBe('already-raw');
    });
  });
});
