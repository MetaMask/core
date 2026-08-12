import {
  WalletRegistrationError,
  WalletRegistrationService,
} from './wallet-registration-service.js';

const BASE_URL = 'https://proxy.metamask.test';
const AUTH_TOKEN = 'session-jwt-abc';

type FetchInit = {
  method?: string;
  headers: Record<string, string>;
  body?: string;
};

type HttpResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: unknown;
  },
) => Promise<HttpResponse>;

const jsonResponse = (status: number, body: unknown): HttpResponse => ({
  ok: status >= 200 && status < 300,
  status,
  json: async (): Promise<unknown> => body,
  text: async (): Promise<string> => JSON.stringify(body),
});

const textResponse = (status: number, body: string): HttpResponse => ({
  ok: status >= 200 && status < 300,
  status,
  json: async (): Promise<unknown> => JSON.parse(body),
  text: async (): Promise<string> => body,
});

const invalidJsonResponse = (status: number): HttpResponse => ({
  ok: status >= 200 && status < 300,
  status,
  json: async (): Promise<unknown> => {
    throw new Error('invalid json');
  },
  text: async (): Promise<string> => 'not json',
});

const buildService = (fetchImpl: FetchLike): WalletRegistrationService =>
  new WalletRegistrationService({
    fetch: fetchImpl,
    baseUrl: BASE_URL,
    getAuthToken: async (): Promise<string> => AUTH_TOKEN,
  });

const verifiedAddress = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id: 'addr-1',
  wallet_address: '0xAbC0000000000000000000000000000000000001',
  blockchain: 'Monad',
  address_type: 'SelfHosted',
  disabled: false,
  is_self: true,
  proof_message: 'I am verifying ownership...',
  proof_signature: '0xsig',
  created_at: '2026-08-12T10:00:00Z',
  ...overrides,
});

const EVM_ADDRESS = '0xAbC0000000000000000000000000000000000001';

describe('WalletRegistrationService.getMoonpayCustomerId', () => {
  it('returns the Iron customer id from the authenticated proxy lookup', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> =>
        jsonResponse(200, { customerId: 'iron-customer-1' }),
    );

    expect(await buildService(fetchMock).getMoonpayCustomerId()).toBe(
      'iron-customer-1',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/vendors/moonpay/customer`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          authorization: `Bearer ${AUTH_TOKEN}`,
        }),
      }),
    );
  });

  it('maps a failed customer lookup to a typed HTTP error', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> =>
        jsonResponse(404, { code: 'iron_error', message: 'not found' }),
    );

    await expect(
      buildService(fetchMock).getMoonpayCustomerId(),
    ).rejects.toMatchObject({ kind: 'notFound', httpStatus: 404 });
  });

  it('rejects malformed customer lookup responses', async () => {
    await expect(
      buildService(
        jest.fn(async (): Promise<HttpResponse> => invalidJsonResponse(200)),
      ).getMoonpayCustomerId(),
    ).rejects.toMatchObject({ kind: 'malformedResponse' });

    await expect(
      buildService(
        jest.fn(async (): Promise<HttpResponse> => jsonResponse(200, {})),
      ).getMoonpayCustomerId(),
    ).rejects.toMatchObject({ kind: 'malformedResponse' });
  });
});

describe('WalletRegistrationService.getRegistrationStatus', () => {
  it('calls the MetaMask proxy list endpoint (not Iron) with the session token', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> => jsonResponse(200, []),
    );
    const service = buildService(fetchMock);

    await service.getRegistrationStatus({
      address: EVM_ADDRESS,
      blockchain: 'Monad',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, FetchInit];
    expect(url).toBe(`${BASE_URL}/vendors/moonpay/self-hosted-wallets`);
    expect(url).not.toContain('iron.xyz');
    expect(init.method).toBe('GET');
    expect(init.headers.authorization).toBe(`Bearer ${AUTH_TOKEN}`);
  });

  it('returns an active match parsed from wallet_address', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> => jsonResponse(200, [verifiedAddress()]),
    );
    const service = buildService(fetchMock);

    const status = await service.getRegistrationStatus({
      address: '0xabc0000000000000000000000000000000000001',
      blockchain: 'Monad',
    });

    expect(status).toMatchObject({
      type: 'active',
      registration: { address: EVM_ADDRESS, disabled: false },
    });
  });

  it('returns a disabled result when the matching address is disabled', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> =>
        jsonResponse(200, [verifiedAddress({ disabled: true })]),
    );
    const service = buildService(fetchMock);

    const status = await service.getRegistrationStatus({
      address: EVM_ADDRESS,
      blockchain: 'Monad',
    });

    expect(status.type).toBe('disabled');
  });

  it('scopes matching per blockchain (same address, different chain is absent)', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> =>
        jsonResponse(200, [verifiedAddress({ blockchain: 'Ethereum' })]),
    );
    const service = buildService(fetchMock);

    const status = await service.getRegistrationStatus({
      address: EVM_ADDRESS,
      blockchain: 'Monad',
    });

    expect(status.type).toBe('absent');
  });

  it('skips entries whose wallet_address is not a string', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> =>
        jsonResponse(200, [
          { id: 'junk', wallet_address: 12345, blockchain: 'Monad' },
          verifiedAddress(),
        ]),
    );
    const service = buildService(fetchMock);

    const status = await service.getRegistrationStatus({
      address: EVM_ADDRESS,
      blockchain: 'Monad',
    });

    expect(status.type).toBe('active');
  });

  it('throws malformedResponse when the list body is not valid JSON', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> => invalidJsonResponse(200),
    );
    const service = buildService(fetchMock);

    await expect(
      service.getRegistrationStatus({
        address: EVM_ADDRESS,
        blockchain: 'Monad',
      }),
    ).rejects.toMatchObject({ kind: 'malformedResponse' });
  });

  it('throws a lookupUnavailable error on a non-2xx list response', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> => textResponse(500, 'boom'),
    );
    const service = buildService(fetchMock);

    await expect(
      service.getRegistrationStatus({
        address: EVM_ADDRESS,
        blockchain: 'Monad',
      }),
    ).rejects.toMatchObject({ kind: 'lookupUnavailable' });
  });

  it('throws a lookupUnavailable error when the list body is malformed', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> => jsonResponse(200, { nope: true }),
    );
    const service = buildService(fetchMock);

    await expect(
      service.getRegistrationStatus({
        address: EVM_ADDRESS,
        blockchain: 'Monad',
      }),
    ).rejects.toBeInstanceOf(WalletRegistrationError);
  });

  it('never converts a network failure during lookup into "absent"', async () => {
    const fetchMock = jest
      .fn<Promise<HttpResponse>, unknown[]>()
      .mockRejectedValue(new Error('network down'));
    const service = buildService(fetchMock);

    await expect(
      service.getRegistrationStatus({
        address: EVM_ADDRESS,
        blockchain: 'Monad',
      }),
    ).rejects.toMatchObject({ kind: 'lookupUnavailable' });
  });

  it('handles a non-Error thrown during lookup', async () => {
    const fetchMock = jest
      .fn<Promise<HttpResponse>, unknown[]>()
      .mockRejectedValue('string failure');
    const service = buildService(fetchMock);

    await expect(
      service.getRegistrationStatus({
        address: EVM_ADDRESS,
        blockchain: 'Monad',
      }),
    ).rejects.toMatchObject({ kind: 'lookupUnavailable' });
  });
});

const registerRequest = {
  customerId: '019ff69c-3039-77b0-9d5d-e4a3baefd7b7',
  address: EVM_ADDRESS,
  blockchain: 'Monad' as const,
  message: 'I am verifying ownership ...',
  signature: '0xdeadbeef',
};

const selfHostedResponse = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id: 'wallet-1',
  address: EVM_ADDRESS,
  customer_id: '019ff69c-3039-77b0-9d5d-e4a3baefd7b7',
  disabled: false,
  signature: '0xdeadbeef',
  created_at: '2026-08-12T10:00:00Z',
  ...overrides,
});

const errorEnvelope = (status: number, message: string): HttpResponse =>
  jsonResponse(status, {
    code: 'iron_error',
    message,
  });

describe('WalletRegistrationService.registerSelfHostedWallet', () => {
  it('sends the five contract fields via POST and returns registered on 200', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> =>
        jsonResponse(200, selfHostedResponse()),
    );
    const service = buildService(fetchMock);

    const outcome = await service.registerSelfHostedWallet(registerRequest);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, FetchInit];
    expect(url).toBe(`${BASE_URL}/vendors/moonpay/self-hosted-wallets`);
    expect(url).not.toContain('iron.xyz');
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe(`Bearer ${AUTH_TOKEN}`);
    expect(JSON.parse(init.body ?? '{}')).toStrictEqual({
      customer_id: registerRequest.customerId,
      address: registerRequest.address,
      blockchain: 'Monad',
      message: registerRequest.message,
      signature: registerRequest.signature,
    });
    expect(outcome.registration).toMatchObject({
      id: 'wallet-1',
      address: registerRequest.address,
      disabled: false,
    });
  });

  it('does not send an idempotency key (the backend derives it)', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> =>
        jsonResponse(200, selfHostedResponse()),
    );
    const service = buildService(fetchMock);

    await service.registerSelfHostedWallet(registerRequest);

    const [, init] = fetchMock.mock.calls[0] as [string, FetchInit];
    const headerKeys = Object.keys(init.headers).map((key) =>
      key.toLowerCase(),
    );
    expect(headerKeys).not.toContain('idempotency-key');
    expect(JSON.parse(init.body ?? '{}')).not.toHaveProperty('idempotencyKey');
  });

  it('maps any 409 to an ambiguous conflict error carrying the body', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> =>
        errorEnvelope(
          409,
          'A crypto address with this wallet address already exists',
        ),
    );
    const service = buildService(fetchMock);

    await expect(
      service.registerSelfHostedWallet(registerRequest),
    ).rejects.toMatchObject({
      kind: 'conflict',
      httpStatus: 409,
      body: 'A crypto address with this wallet address already exists',
    });
  });

  it('maps 5xx to a transient error', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> => errorEnvelope(500, 'internal error'),
    );
    const service = buildService(fetchMock);

    await expect(
      service.registerSelfHostedWallet(registerRequest),
    ).rejects.toMatchObject({ kind: 'transient', httpStatus: 500 });
  });

  it('maps a network failure / timeout to a transient error', async () => {
    const fetchMock = jest
      .fn<Promise<HttpResponse>, unknown[]>()
      .mockRejectedValue(new Error('ETIMEDOUT'));
    const service = buildService(fetchMock);

    await expect(
      service.registerSelfHostedWallet(registerRequest),
    ).rejects.toMatchObject({ kind: 'transient' });
  });

  it('maps a non-Error thrown during registration to transient', async () => {
    const fetchMock = jest
      .fn<Promise<HttpResponse>, unknown[]>()
      .mockRejectedValue('socket hang up');
    const service = buildService(fetchMock);

    await expect(
      service.registerSelfHostedWallet(registerRequest),
    ).rejects.toMatchObject({ kind: 'transient' });
  });

  it('maps 400 to a validation error', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> => errorEnvelope(400, 'bad message'),
    );
    const service = buildService(fetchMock);

    await expect(
      service.registerSelfHostedWallet(registerRequest),
    ).rejects.toMatchObject({ kind: 'validation', httpStatus: 400 });
  });

  it('maps an unmapped 4xx (422) to a validation error', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> => errorEnvelope(422, 'unprocessable'),
    );
    const service = buildService(fetchMock);

    await expect(
      service.registerSelfHostedWallet(registerRequest),
    ).rejects.toMatchObject({ kind: 'validation', httpStatus: 422 });
  });

  it('maps 401 to unauthorized', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> => errorEnvelope(401, 'session expired'),
    );

    await expect(
      buildService(fetchMock).registerSelfHostedWallet(registerRequest),
    ).rejects.toMatchObject({ kind: 'unauthorized' });
  });

  it('maps 403 to forbidden and 404 to notFound', async () => {
    const forbiddenFetch = jest.fn(
      async (): Promise<HttpResponse> => errorEnvelope(403, 'suspended'),
    );
    const notFoundFetch = jest.fn(
      async (): Promise<HttpResponse> => errorEnvelope(404, 'not found'),
    );

    const forbidden = await buildService(forbiddenFetch)
      .registerSelfHostedWallet(registerRequest)
      .catch((error: unknown): WalletRegistrationError => {
        return error as WalletRegistrationError;
      });
    const notFound = await buildService(notFoundFetch)
      .registerSelfHostedWallet(registerRequest)
      .catch((error: unknown): WalletRegistrationError => {
        return error as WalletRegistrationError;
      });

    expect(forbidden).toMatchObject({ kind: 'forbidden' });
    expect(notFound).toMatchObject({ kind: 'notFound' });
  });

  it('maps an error envelope without a code', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> =>
        jsonResponse(403, { message: 'forbidden' }),
    );
    const service = buildService(fetchMock);

    await expect(
      service.registerSelfHostedWallet(registerRequest),
    ).rejects.toMatchObject({ kind: 'forbidden' });
  });

  it('maps 429 to a rateLimited error', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> => errorEnvelope(429, 'slow down'),
    );
    const service = buildService(fetchMock);

    await expect(
      service.registerSelfHostedWallet(registerRequest),
    ).rejects.toMatchObject({ kind: 'rateLimited' });
  });

  it('maps a malformed 200 body to malformedResponse', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> => jsonResponse(200, { nope: true }),
    );
    const service = buildService(fetchMock);

    await expect(
      service.registerSelfHostedWallet(registerRequest),
    ).rejects.toMatchObject({ kind: 'malformedResponse' });
  });

  it('rejects a success body that has an id but no address', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> =>
        jsonResponse(200, { id: 'wallet-1', disabled: false }),
    );
    const service = buildService(fetchMock);

    await expect(
      service.registerSelfHostedWallet(registerRequest),
    ).rejects.toMatchObject({ kind: 'malformedResponse' });
  });

  it('maps a non-JSON success body to malformedResponse', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> => invalidJsonResponse(200),
    );
    const service = buildService(fetchMock);

    await expect(
      service.registerSelfHostedWallet(registerRequest),
    ).rejects.toMatchObject({ kind: 'malformedResponse' });
  });

  it('maps a non-JSON error body to malformedResponse', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> => invalidJsonResponse(400),
    );
    const service = buildService(fetchMock);

    await expect(
      service.registerSelfHostedWallet(registerRequest),
    ).rejects.toMatchObject({ kind: 'malformedResponse' });
  });
});
