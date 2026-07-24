import type { Hex } from '@metamask/utils';

import {
  buildRpcServiceDegradedAnalyticsTrackingEvent,
  buildRpcServiceUnavailableAnalyticsTrackingEvent,
  sanitizeRpcEndpointUrl,
} from './rpc-service-analytics.js';

const PUBLIC_URL = 'https://mainnet.infura.io/v3/the-key';
const isPublic = (): boolean => true;

const UNAVAILABLE_PAYLOAD = {
  chainId: '0x1' as Hex,
  endpointUrl: PUBLIC_URL,
  error: undefined as unknown,
  networkClientId: 'mainnet',
  primaryEndpointUrl: PUBLIC_URL,
};

const DEGRADED_PAYLOAD = {
  chainId: '0x1' as Hex,
  endpointUrl: PUBLIC_URL,
  error: undefined as unknown,
  networkClientId: 'mainnet',
  primaryEndpointUrl: PUBLIC_URL,
  rpcMethodName: 'eth_blockNumber',
  type: 'slow_success' as const,
};

describe('sanitizeRpcEndpointUrl', () => {
  it('returns the host of the URL when the endpoint is public', () => {
    expect(sanitizeRpcEndpointUrl(PUBLIC_URL, true)).toBe('mainnet.infura.io');
  });

  it('returns "custom" when the endpoint is not public', () => {
    expect(
      sanitizeRpcEndpointUrl('https://private.example.com/secret', false),
    ).toBe('custom');
  });

  it('returns "custom" when the endpoint is public but cannot be parsed', () => {
    expect(sanitizeRpcEndpointUrl('not a url', true)).toBe('custom');
  });
});

describe('buildRpcServiceUnavailableAnalyticsTrackingEvent', () => {
  it('builds the event with base properties from a public endpoint', () => {
    expect(
      buildRpcServiceUnavailableAnalyticsTrackingEvent(
        UNAVAILABLE_PAYLOAD,
        isPublic,
      ),
    ).toStrictEqual({
      name: 'RPC Service Unavailable',
      properties: {
        chain_id_caip: 'eip155:1',
        rpc_domain: 'mainnet.infura.io',
        rpc_endpoint_url: 'mainnet.infura.io',
      },
      sensitiveProperties: {},
      saveDataRecording: false,
      hasProperties: true,
    });
  });

  it('reports the domain as "custom" when the endpoint is not public', () => {
    const event = buildRpcServiceUnavailableAnalyticsTrackingEvent(
      { ...UNAVAILABLE_PAYLOAD, endpointUrl: 'https://private.example.com/x' },
      () => false,
    );

    expect(event.properties).toMatchObject({
      rpc_domain: 'custom',
      rpc_endpoint_url: 'custom',
    });
  });

  it('converts the chain ID to a CAIP decimal value', () => {
    const event = buildRpcServiceUnavailableAnalyticsTrackingEvent(
      { ...UNAVAILABLE_PAYLOAD, chainId: '0xe708' },
      isPublic,
    );

    expect(event.properties).toMatchObject({ chain_id_caip: 'eip155:59144' });
  });

  it('includes http_status when the error carries a JSON-serializable httpStatus', () => {
    const event = buildRpcServiceUnavailableAnalyticsTrackingEvent(
      { ...UNAVAILABLE_PAYLOAD, error: { httpStatus: 503 } },
      isPublic,
    );

    expect(event.properties).toMatchObject({ http_status: 503 });
  });

  it('omits http_status when the error has no httpStatus', () => {
    const event = buildRpcServiceUnavailableAnalyticsTrackingEvent(
      { ...UNAVAILABLE_PAYLOAD, error: new Error('boom') },
      isPublic,
    );

    expect(event.properties).not.toHaveProperty('http_status');
  });

  it('omits http_status when the error is not an object', () => {
    const event = buildRpcServiceUnavailableAnalyticsTrackingEvent(
      { ...UNAVAILABLE_PAYLOAD, error: 'a string error' },
      isPublic,
    );

    expect(event.properties).not.toHaveProperty('http_status');
  });
});

describe('buildRpcServiceDegradedAnalyticsTrackingEvent', () => {
  it('builds the event with all degraded-specific properties', () => {
    expect(
      buildRpcServiceDegradedAnalyticsTrackingEvent(
        {
          ...DEGRADED_PAYLOAD,
          duration: 1234,
          error: { httpStatus: 503 },
          retryReason: 'connection-error',
          traceId: 'trace-1',
          type: 'retries_exhausted',
        },
        isPublic,
      ),
    ).toStrictEqual({
      name: 'RPC Service Degraded',
      properties: {
        chain_id_caip: 'eip155:1',
        rpc_domain: 'mainnet.infura.io',
        rpc_endpoint_url: 'mainnet.infura.io',
        rpc_method_name: 'eth_blockNumber',
        type: 'retries_exhausted',
        retry_reason: 'connection-error',
        duration_ms: 1234,
        trace_id: 'trace-1',
        http_status: 503,
      },
      sensitiveProperties: {},
      saveDataRecording: false,
      hasProperties: true,
    });
  });

  it('omits the optional properties when they are not present', () => {
    const event = buildRpcServiceDegradedAnalyticsTrackingEvent(
      DEGRADED_PAYLOAD,
      isPublic,
    );

    expect(event.properties).toMatchObject({
      rpc_method_name: 'eth_blockNumber',
      type: 'slow_success',
    });
    expect(event.properties).not.toHaveProperty('duration_ms');
    expect(event.properties).not.toHaveProperty('retry_reason');
    expect(event.properties).not.toHaveProperty('trace_id');
    expect(event.properties).not.toHaveProperty('http_status');
  });
});
