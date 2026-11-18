import { MAX_SAFE_CHAIN_ID } from '@metamask/controller-utils';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import nock from 'nock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApprovalDashboardRequest } from './approval-dashboard.js';
import {
  APPROVAL_DASHBOARD_ENDPOINT,
  APPROVAL_DASHBOARD_TIMEOUT_MS,
  SecurityAlertsApiService,
} from './SecurityAlertsApiService.js';
import type {
  SecurityAlertsApiServiceMessenger,
  SecurityAlertsApiServiceOptions,
} from './SecurityAlertsApiService.js';

const BASE_URL = 'https://security-alerts.test';
const ADDRESS = '0xAbCdEf1234567890123456789012345678901234';
const ACCOUNT = ADDRESS.toLowerCase();
const OTHER_ACCOUNT = `0x${'1'.repeat(40)}`;
const GENERATED_AT = '2026-11-18T12:00:00.000Z';
const REQUEST: ApprovalDashboardRequest = {
  address: ADDRESS,
  chainIds: ['0x1'],
};

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<SecurityAlertsApiServiceMessenger>,
  MessengerEvents<SecurityAlertsApiServiceMessenger>
>;

/**
 * Construct the service under test.
 *
 * @param options - Constructor options other than the messenger.
 * @returns The service and the root messenger.
 */
function createService(
  options: Omit<SecurityAlertsApiServiceOptions, 'messenger'> = {},
): { service: SecurityAlertsApiService; rootMessenger: RootMessenger } {
  const rootMessenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });
  const messenger: SecurityAlertsApiServiceMessenger = new Messenger({
    namespace: 'SecurityAlertsApiService',
    parent: rootMessenger,
  });
  const service = new SecurityAlertsApiService({
    messenger,
    baseUrl: BASE_URL,
    ...options,
  });
  return { service, rootMessenger };
}

/**
 * Call `getApprovalDashboard` on a fresh service.
 *
 * @param request - The dashboard request.
 * @returns The pending result.
 */
async function getApprovalDashboard(
  request: ApprovalDashboardRequest,
): ReturnType<SecurityAlertsApiService['getApprovalDashboard']> {
  return createService().service.getApprovalDashboard(request);
}

/**
 * Build a valid record as SAA returns it.
 *
 * @param overrides - Fields to override.
 * @returns The record.
 */
function buildRecord(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: '1:erc20:0xtoken:0xspender',
    account: ACCOUNT,
    chainId: 1,
    standard: 'erc20',
    approvalKind: 'allowance',
    tokenId: null,
    token: {
      address: '0xtoken',
      name: 'Token',
      symbol: 'TKN',
      decimals: 18,
      logo: null,
      metadataStatus: 'complete',
    },
    spender: { address: '0xspender', label: null, labelSource: null },
    allowance: { raw: '1000', isUnlimited: false },
    exposure: null,
    risk: { verdict: 'unknown', features: [], source: null, assessedAt: null },
    freshness: {
      observedAt: GENERATED_AT,
      indexedThroughBlock: null,
      observedBlock: null,
    },
    ...overrides,
  };
}

/**
 * Build a chain result as SAA returns it.
 *
 * @param chainId - The decimal chain ID.
 * @param overrides - Fields to override.
 * @returns The chain result.
 */
function buildChainResult(
  chainId = 1,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    chainId,
    status: 'success',
    completeness: 'verified',
    recordCount: 1,
    retryable: false,
    ...overrides,
  };
}

/**
 * Build a valid response as SAA returns it.
 *
 * @param overrides - Fields to override.
 * @returns The response.
 */
function buildResponse(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    account: ACCOUNT,
    records: [buildRecord()],
    chainResults: [buildChainResult()],
    generatedAt: GENERATED_AT,
    freshness: { forced: false, maxStalenessMs: 98000 },
    schemaVersion: '0.1.0',
    ...overrides,
  };
}

/**
 * Mock the dashboard endpoint for the given request body.
 *
 * @param chainIds - Expected decimal chain IDs.
 * @param forceFresh - Expected forceFresh flag.
 * @returns The nock interceptor.
 */
function mockEndpoint(chainIds = [1], forceFresh = false): nock.Interceptor {
  return nock(BASE_URL).post(APPROVAL_DASHBOARD_ENDPOINT, {
    address: ACCOUNT,
    chainIds,
    forceFresh,
  });
}

describe('SecurityAlertsApiService', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  describe('request', () => {
    it.each([
      ['an empty address', { address: '' }],
      ['a short address', { address: '0x1234' }],
      ['empty chainIds', { chainIds: [] }],
      ['a decimal chain ID', { chainIds: ['1'] }],
      ['a zero chain ID', { chainIds: ['0x0'] }],
      ['a bare 0x chain ID', { chainIds: ['0x'] }],
      [
        'a chain ID above MAX_SAFE_CHAIN_ID',
        { chainIds: [`0x${(MAX_SAFE_CHAIN_ID + 1).toString(16)}`] },
      ],
      [
        'more than 20 distinct chains',
        {
          chainIds: Array.from(
            { length: 21 },
            (_, index) => `0x${(index + 1).toString(16)}`,
          ),
        },
      ],
    ])('rejects %s without a network call', async (_name, overrides) => {
      await expect(
        getApprovalDashboard({ ...REQUEST, ...overrides }),
      ).rejects.toMatchObject({ code: 'invalid_request', retryable: false });
    });

    it('converts hex chain IDs to decimal, dedupes, lowercases the address, and forwards forceFresh', async () => {
      const chainIds = [1, 59144, MAX_SAFE_CHAIN_ID];
      const scope = mockEndpoint(chainIds, true).reply(
        200,
        buildResponse({
          records: [],
          chainResults: chainIds.map((chainId) =>
            buildChainResult(chainId, { status: 'unsupported' }),
          ),
        }),
      );

      await getApprovalDashboard({
        address: ADDRESS,
        chainIds: [
          '0x1',
          '0xE708',
          '0x01',
          `0x${MAX_SAFE_CHAIN_ID.toString(16)}`,
        ],
        forceFresh: true,
      });

      expect(scope.isDone()).toBe(true);
    });
  });

  describe('successful responses', () => {
    it('preserves mixed per-chain outcomes, identity, freshness, and nullable fields unchanged', async () => {
      const chainIds = [1, 10, 56, 137, 8453, 999];
      const body = buildResponse({
        records: [
          buildRecord({
            id: '1:erc721:0xnft:0xop:42',
            standard: 'erc721',
            tokenId: '42',
            spender: { address: '0xop', label: 'Market', labelSource: 'saa' },
            risk: {
              verdict: 'malicious',
              features: [{ type: 'drainer', description: 'Known drainer' }],
              source: 'blockaid',
              assessedAt: GENERATED_AT,
            },
          }),
          buildRecord({ id: '56:erc20:0xtoken:0xspender', chainId: 56 }),
        ],
        chainResults: [
          buildChainResult(1),
          buildChainResult(10, {
            completeness: 'unverified',
            recordCount: 0,
            retryable: true,
            errorCode: 'empty_or_unprocessed',
          }),
          buildChainResult(56, {
            completeness: 'unverified',
            retryable: true,
            errorCode: 'partial_data',
          }),
          buildChainResult(137, {
            status: 'failed',
            completeness: 'unverified',
            recordCount: 0,
            retryable: true,
            errorCode: 'upstream_http',
            note: 'accounts-api 503',
          }),
          buildChainResult(8453, {
            status: 'timeout',
            completeness: 'unverified',
            recordCount: 0,
            retryable: true,
            errorCode: 'upstream_timeout',
          }),
          buildChainResult(999, {
            status: 'unsupported',
            completeness: 'unverified',
            recordCount: 0,
          }),
        ],
        freshness: { forced: true, maxStalenessMs: 38000 },
      });
      mockEndpoint(chainIds).reply(200, body);

      const response = await getApprovalDashboard({
        address: ADDRESS,
        chainIds: chainIds.map((chainId) => `0x${chainId.toString(16)}`),
      });

      expect(response).toStrictEqual(body);
    });

    it('accepts 0.2.0 exposure, recognized and future unavailable reasons, and unknown fields', async () => {
      const body = buildResponse({
        schemaVersion: '0.2.0',
        extra: true,
        records: [
          buildRecord({
            exposure: {
              amountUsd: '1234.56789012',
              basis: 'balance',
              priceSource: 'spot-prices',
              observedAt: GENERATED_AT,
            },
            extra: 1,
          }),
          buildRecord({ exposureUnavailableReason: 'price_unavailable' }),
          buildRecord({ exposureUnavailableReason: 'future_reason' }),
        ],
        chainResults: [buildChainResult(1, { recordCount: 3, extra: 1 })],
      });
      mockEndpoint().reply(200, body);

      const response = await getApprovalDashboard(REQUEST);

      expect(response).toStrictEqual(body);
    });

    it('maps an unknown chain status to failed + unverified and an unknown verdict to unknown', async () => {
      mockEndpoint().reply(
        200,
        buildResponse({
          schemaVersion: '0.3.1',
          records: [
            buildRecord({
              risk: {
                verdict: 'suspicious',
                features: [],
                source: null,
                assessedAt: null,
              },
            }),
          ],
          chainResults: [
            buildChainResult(1, { status: 'degraded', retryable: true }),
          ],
        }),
      );

      const response = await getApprovalDashboard(REQUEST);

      expect(response.records[0].risk.verdict).toBe('unknown');
      expect(response.chainResults[0]).toStrictEqual(
        buildChainResult(1, {
          status: 'failed',
          completeness: 'unverified',
          retryable: true,
        }),
      );
    });
  });

  describe('invalid responses', () => {
    it.each([
      ['a non-object body', 'not an object'],
      ['a missing schemaVersion', buildResponse({ schemaVersion: undefined })],
      ['a malformed schemaVersion', buildResponse({ schemaVersion: 'v1' })],
      ['missing records', buildResponse({ records: undefined })],
      [
        'a non-decimal allowance',
        buildResponse({
          records: [
            buildRecord({ allowance: { raw: '0x10', isUnlimited: false } }),
          ],
        }),
      ],
      [
        'an unknown standard',
        buildResponse({ records: [buildRecord({ standard: 'erc777' })] }),
      ],
      [
        'an empty record id',
        buildResponse({ records: [buildRecord({ id: '' })] }),
      ],
      [
        'a zero record chainId',
        buildResponse({ records: [buildRecord({ chainId: 0 })] }),
      ],
      [
        'a negative recordCount',
        buildResponse({
          chainResults: [buildChainResult(1, { recordCount: -1 })],
        }),
      ],
      ['a mismatched account', buildResponse({ account: OTHER_ACCOUNT })],
      [
        'a record for another account',
        buildResponse({ records: [buildRecord({ account: OTHER_ACCOUNT })] }),
      ],
      [
        'a record for an unrequested chain',
        buildResponse({ records: [buildRecord({ chainId: 10 })] }),
      ],
      ['a missing chain result', buildResponse({ chainResults: [] })],
      [
        'an unrequested chain result',
        buildResponse({ chainResults: [buildChainResult(10)] }),
      ],
    ])('rejects %s', async (_name, body) => {
      mockEndpoint().reply(200, body);

      await expect(getApprovalDashboard(REQUEST)).rejects.toMatchObject({
        code: 'invalid_response',
        retryable: false,
      });
    });

    it('rejects a body that is not JSON', async () => {
      mockEndpoint().reply(200, '{not json', {
        'Content-Type': 'application/json',
      });

      await expect(getApprovalDashboard(REQUEST)).rejects.toMatchObject({
        code: 'invalid_response',
      });
    });

    it.each(['1.0.0', '2.3.4'])(
      'rejects incompatible schema major %s',
      async (schemaVersion) => {
        mockEndpoint().reply(200, buildResponse({ schemaVersion }));

        await expect(getApprovalDashboard(REQUEST)).rejects.toMatchObject({
          code: 'incompatible_schema',
          retryable: false,
        });
      },
    );
  });

  describe('transport failures', () => {
    it.each([
      [400, false],
      [429, true],
      [503, true],
    ])('rejects HTTP %i with retryable=%s', async (status, retryable) => {
      mockEndpoint().reply(status, { error: 'nope' });

      await expect(getApprovalDashboard(REQUEST)).rejects.toMatchObject({
        name: 'ApprovalDashboardError',
        code: 'http_error',
        httpStatus: status,
        retryable,
      });
    });

    it('rejects a network failure as retryable', async () => {
      mockEndpoint().replyWithError('socket hang up');

      await expect(getApprovalDashboard(REQUEST)).rejects.toMatchObject({
        code: 'network_error',
        retryable: true,
      });
    });
  });

  describe('service', () => {
    it('exposes getApprovalDashboard through the messenger', async () => {
      const body = buildResponse();
      mockEndpoint().reply(200, body);
      const { rootMessenger } = createService();

      const response = await rootMessenger.call(
        'SecurityAlertsApiService:getApprovalDashboard',
        REQUEST,
      );

      expect(response).toStrictEqual(body);
    });

    it('uses the injected fetch', async () => {
      const fetchMock = vi.fn<typeof fetch>(
        async () => new Response(JSON.stringify(buildResponse())),
      );
      const { service } = createService({ fetch: fetchMock });

      await service.getApprovalDashboard(REQUEST);

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}${APPROVAL_DASHBOARD_ENDPOINT}`,
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('shares one request between identical concurrent calls', async () => {
      const scope = mockEndpoint().reply(200, buildResponse());
      const { service } = createService();

      const responses = await Promise.all([
        service.getApprovalDashboard(REQUEST),
        service.getApprovalDashboard(REQUEST),
      ]);

      expect(responses[0]).toStrictEqual(responses[1]);
      expect(scope.isDone()).toBe(true);
    });

    it('retries retryable errors when retries are enabled', async () => {
      mockEndpoint().reply(503);
      mockEndpoint().reply(200, buildResponse());
      const { service } = createService({ policyOptions: { maxRetries: 1 } });

      expect(await service.getApprovalDashboard(REQUEST)).toStrictEqual(
        buildResponse(),
      );
    });

    it('does not retry non-retryable errors', async () => {
      mockEndpoint().reply(400);
      const second = mockEndpoint().reply(200, buildResponse());
      const { service } = createService({ policyOptions: { maxRetries: 1 } });

      await expect(service.getApprovalDashboard(REQUEST)).rejects.toMatchObject(
        { code: 'http_error' },
      );
      expect(second.isDone()).toBe(false);
    });

    it('rejects with service_unavailable while the circuit is open', async () => {
      mockEndpoint().reply(503);
      const { service } = createService({
        policyOptions: { maxConsecutiveFailures: 1 },
      });
      await expect(service.getApprovalDashboard(REQUEST)).rejects.toMatchObject(
        { code: 'http_error' },
      );

      await expect(service.getApprovalDashboard(REQUEST)).rejects.toMatchObject(
        { code: 'service_unavailable', retryable: true },
      );
    });
  });

  describe('deadline', () => {
    /**
     * A `fetch` that settles only when its signal aborts, rejecting like a
     * real fetch.
     *
     * @param _input - The request URL.
     * @param init - The request options.
     * @returns A pending response.
     */
    const hangingFetch: typeof fetch = async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('rejects with timeout once the deadline passes', async () => {
      const { service } = createService({ fetch: hangingFetch });

      const error = service
        .getApprovalDashboard(REQUEST)
        .catch((caught: unknown) => caught);
      await vi.advanceTimersByTimeAsync(APPROVAL_DASHBOARD_TIMEOUT_MS);

      expect(await error).toMatchObject({ code: 'timeout', retryable: true });
    });

    it('rejects with timeout when the deadline passes while reading the body', async () => {
      const { service } = createService({
        fetch: async (_input, init) =>
          ({
            ok: true,
            json: async () => hangingFetch('', init),
          }) as unknown as Response,
      });

      const error = service
        .getApprovalDashboard(REQUEST)
        .catch((caught: unknown) => caught);
      await vi.advanceTimersByTimeAsync(APPROVAL_DASHBOARD_TIMEOUT_MS);

      expect(await error).toMatchObject({ code: 'timeout' });
    });
  });
});
