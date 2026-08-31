import {
  createIdempotencyKey,
  extractErrorBody,
  WalletRegistrationError,
  WalletRegistrationService,
} from './wallet-registration-service.js';

const BASE_URL = 'https://on-ramp.dev-api.cx.metamask.io';
const AUTH_TOKEN = 'session-jwt-abc';
const EXTERNAL_ID = 'canonical-profile-1';
const CUSTOMER_ID = '019ff69c-3039-77b0-9d5d-e4a3baefd7b7';

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
  text: async (): Promise<string> =>
    typeof body === 'string' ? body : JSON.stringify(body),
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
    getExternalId: async (): Promise<string> => EXTERNAL_ID,
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

describe('createIdempotencyKey', () => {
  it('returns a non-empty string', () => {
    expect(createIdempotencyKey().length).toBeGreaterThan(0);
  });

  // `globalThis.crypto.randomUUID` is absent under Node 18, so the preferred
  // path has to be exercised against an installed stub rather than the ambient
  // runtime.
  it('prefers randomUUID when the runtime provides it', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      'crypto',
    );
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { randomUUID: () => 'uuid-1' },
    });
    try {
      expect(createIdempotencyKey()).toBe('uuid-1');
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(globalThis, 'crypto', originalDescriptor);
      } else {
        // Node 18 exposes no own `crypto` descriptor, so the stub has to be
        // removed rather than restored, or it leaks into later tests.
        Reflect.deleteProperty(globalThis, 'crypto');
      }
    }
  });

  it('falls back when randomUUID is unavailable', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      'crypto',
    );
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { randomUUID: undefined },
    });
    try {
      expect(createIdempotencyKey()).toMatch(/^wallet-reg-/u);
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(globalThis, 'crypto', originalDescriptor);
      }
    }
  });
});

describe('extractErrorBody', () => {
  it('returns whitespace-only bodies unchanged', () => {
    expect(extractErrorBody('   ')).toBe('   ');
    expect(extractErrorBody('')).toBe('');
  });

  it('unwraps a JSON-encoded string', () => {
    expect(extractErrorBody(JSON.stringify('already exists'))).toBe(
      'already exists',
    );
  });

  it('prefers message on a JSON object', () => {
    expect(extractErrorBody(JSON.stringify({ message: 'forbidden' }))).toBe(
      'forbidden',
    );
  });

  it('keeps a JSON object without message as raw text', () => {
    const raw = JSON.stringify({ code: 'x', detail: 'nope' });
    expect(extractErrorBody(raw)).toBe(raw);
  });

  it('returns plain text that is not JSON', () => {
    expect(extractErrorBody('not json at all')).toBe('not json at all');
  });

  it('returns non-object JSON values as the raw trimmed text', () => {
    expect(extractErrorBody('null')).toBe('null');
    expect(extractErrorBody('42')).toBe('42');
    expect(extractErrorBody('true')).toBe('true');
  });
});

describe('WalletRegistrationService.getMoonpayCustomerId', () => {
  it('returns Iron customer id from GET /neobank/customers/{external_id}/external', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> =>
        jsonResponse(200, {
          id: 'iron-customer-1',
          external_id: EXTERNAL_ID,
          status: 'Active',
        }),
    );

    expect(await buildService(fetchMock).getMoonpayCustomerId()).toBe(
      'iron-customer-1',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/neobank/customers/${EXTERNAL_ID}/external`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          authorization: `Bearer ${AUTH_TOKEN}`,
        }),
      }),
    );
  });

  it('maps a failed customer lookup to a typed HTTP error with transparent body', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> => textResponse(404, 'not found'),
    );

    await expect(
      buildService(fetchMock).getMoonpayCustomerId(),
    ).rejects.toMatchObject({
      kind: 'notFound',
      httpStatus: 404,
      body: 'not found',
    });
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

  it('rejects an empty external id before calling the network', async () => {
    const fetchMock = jest.fn();
    const service = new WalletRegistrationService({
      fetch: fetchMock,
      baseUrl: BASE_URL,
      getAuthToken: async (): Promise<string> => AUTH_TOKEN,
      getExternalId: async (): Promise<string> => '',
    });

    await expect(service.getMoonpayCustomerId()).rejects.toMatchObject({
      kind: 'malformedResponse',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('WalletRegistrationService.getRegistrationStatus', () => {
  it('lists via /neobank/addresses/crypto/{customer_id}?filter=SelfHosted', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> => jsonResponse(200, []),
    );
    const service = buildService(fetchMock);

    await service.getRegistrationStatus({
      customerId: CUSTOMER_ID,
      address: EVM_ADDRESS,
      blockchain: 'Monad',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, FetchInit];
    expect(url).toBe(
      `${BASE_URL}/neobank/addresses/crypto/${CUSTOMER_ID}?filter=SelfHosted`,
    );
    expect(url).not.toContain('iron.xyz');
    expect(url).not.toContain('/vendors/moonpay/');
    expect(init.method).toBe('GET');
    expect(init.headers.authorization).toBe(`Bearer ${AUTH_TOKEN}`);
  });

  it('returns an active match parsed from wallet_address (Monad filter client-side)', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> =>
        jsonResponse(200, [
          verifiedAddress({ blockchain: 'Ethereum' }),
          verifiedAddress(),
        ]),
    );
    const service = buildService(fetchMock);

    const status = await service.getRegistrationStatus({
      customerId: CUSTOMER_ID,
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
      customerId: CUSTOMER_ID,
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
      customerId: CUSTOMER_ID,
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
      customerId: CUSTOMER_ID,
      address: EVM_ADDRESS,
      blockchain: 'Monad',
    });

    expect(status.type).toBe('active');
  });

  it('throws malformedResponse when a matching row has no id', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> =>
        jsonResponse(200, [
          {
            wallet_address: EVM_ADDRESS,
            blockchain: 'Monad',
            disabled: false,
          },
        ]),
    );
    const service = buildService(fetchMock);

    await expect(
      service.getRegistrationStatus({
        customerId: CUSTOMER_ID,
        address: EVM_ADDRESS,
        blockchain: 'Monad',
      }),
    ).rejects.toMatchObject({ kind: 'malformedResponse' });
  });

  it('throws malformedResponse when the list body is not valid JSON', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> => invalidJsonResponse(200),
    );
    const service = buildService(fetchMock);

    await expect(
      service.getRegistrationStatus({
        customerId: CUSTOMER_ID,
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
        customerId: CUSTOMER_ID,
        address: EVM_ADDRESS,
        blockchain: 'Monad',
      }),
    ).rejects.toMatchObject({ kind: 'lookupUnavailable', body: 'boom' });
  });

  it('throws a lookupUnavailable error when the list body is malformed', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> => jsonResponse(200, { nope: true }),
    );
    const service = buildService(fetchMock);

    await expect(
      service.getRegistrationStatus({
        customerId: CUSTOMER_ID,
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
        customerId: CUSTOMER_ID,
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
        customerId: CUSTOMER_ID,
        address: EVM_ADDRESS,
        blockchain: 'Monad',
      }),
    ).rejects.toMatchObject({ kind: 'lookupUnavailable' });
  });
});

const registerRequest = {
  customerId: CUSTOMER_ID,
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
  customer_id: CUSTOMER_ID,
  disabled: false,
  signature: '0xdeadbeef',
  created_at: '2026-08-12T10:00:00Z',
  ...overrides,
});

describe('WalletRegistrationService.registerSelfHostedWallet', () => {
  it('posts to /neobank/addresses/crypto/selfhosted with an idempotency key', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> =>
        jsonResponse(200, selfHostedResponse()),
    );
    const service = buildService(fetchMock);

    const outcome = await service.registerSelfHostedWallet({
      ...registerRequest,
      idempotencyKey: 'idem-wallet-1',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, FetchInit];
    expect(url).toBe(`${BASE_URL}/neobank/addresses/crypto/selfhosted`);
    expect(url).not.toContain('iron.xyz');
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe(`Bearer ${AUTH_TOKEN}`);
    expect(init.headers['Idempotency-Key']).toBe('idem-wallet-1');
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

  it('generates an Idempotency-Key when the caller omits one', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> =>
        jsonResponse(200, selfHostedResponse()),
    );
    const service = buildService(fetchMock);

    await service.registerSelfHostedWallet(registerRequest);

    const [, init] = fetchMock.mock.calls[0] as [string, FetchInit];
    expect(init.headers['Idempotency-Key']?.length).toBeGreaterThan(0);
  });

  it('maps a plain-string 409 body to an ambiguous conflict error', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> =>
        textResponse(
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
      async (): Promise<HttpResponse> => textResponse(500, 'internal error'),
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
      async (): Promise<HttpResponse> => textResponse(400, 'bad message'),
    );
    const service = buildService(fetchMock);

    await expect(
      service.registerSelfHostedWallet(registerRequest),
    ).rejects.toMatchObject({ kind: 'validation', httpStatus: 400 });
  });

  it('maps an unmapped 4xx (422) to a validation error', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> => textResponse(422, 'unprocessable'),
    );
    const service = buildService(fetchMock);

    await expect(
      service.registerSelfHostedWallet(registerRequest),
    ).rejects.toMatchObject({ kind: 'validation', httpStatus: 422 });
  });

  it('maps 401 to unauthorized', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> => textResponse(401, 'session expired'),
    );

    await expect(
      buildService(fetchMock).registerSelfHostedWallet(registerRequest),
    ).rejects.toMatchObject({ kind: 'unauthorized' });
  });

  it('maps 403 to forbidden and 404 to notFound', async () => {
    const forbiddenFetch = jest.fn(
      async (): Promise<HttpResponse> => textResponse(403, 'suspended'),
    );
    const notFoundFetch = jest.fn(
      async (): Promise<HttpResponse> => textResponse(404, 'not found'),
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

  it('maps a JSON error object with message when present', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> =>
        jsonResponse(403, { message: 'forbidden' }),
    );
    const service = buildService(fetchMock);

    await expect(
      service.registerSelfHostedWallet(registerRequest),
    ).rejects.toMatchObject({ kind: 'forbidden', body: 'forbidden' });
  });

  it('maps a JSON-encoded string error body', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> =>
        textResponse(409, JSON.stringify('already exists')),
    );

    await expect(
      buildService(fetchMock).registerSelfHostedWallet(registerRequest),
    ).rejects.toMatchObject({ kind: 'conflict', body: 'already exists' });
  });

  it('keeps a JSON object without message as the raw body', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> =>
        jsonResponse(400, { code: 'x', detail: 'nope' }),
    );

    await expect(
      buildService(fetchMock).registerSelfHostedWallet(registerRequest),
    ).rejects.toMatchObject({
      kind: 'validation',
      body: JSON.stringify({ code: 'x', detail: 'nope' }),
    });
  });

  it('keeps a whitespace-only error body as-is', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> => textResponse(400, '   '),
    );

    await expect(
      buildService(fetchMock).registerSelfHostedWallet(registerRequest),
    ).rejects.toMatchObject({ kind: 'validation', body: '   ' });
  });

  it('omits Error.message when the upstream body is empty', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> => textResponse(400, ''),
    );

    await expect(
      buildService(fetchMock).registerSelfHostedWallet(registerRequest),
    ).rejects.toMatchObject({
      kind: 'validation',
      body: '',
      message: 'wallet registration failed: validation',
    });
  });

  it('maps an unreadable error body to malformedResponse', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> => ({
        ok: false,
        status: 500,
        json: async (): Promise<unknown> => {
          throw new Error('no json');
        },
        text: async (): Promise<string> => {
          throw new Error('no text');
        },
      }),
    );

    await expect(
      buildService(fetchMock).registerSelfHostedWallet(registerRequest),
    ).rejects.toMatchObject({ kind: 'malformedResponse', httpStatus: 500 });
  });

  it('maps 429 to a rateLimited error', async () => {
    const fetchMock = jest.fn(
      async (): Promise<HttpResponse> => textResponse(429, 'slow down'),
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
});
