import {
  buildRpcServiceEventProperties,
  sanitizeRpcEndpointUrl,
  toAnalyticsTrackingEvent,
} from './rpc-service-analytics';

describe('sanitizeRpcEndpointUrl', () => {
  it('returns the host of the URL when the endpoint is public', () => {
    expect(
      sanitizeRpcEndpointUrl('https://mainnet.infura.io/v3/the-key', true),
    ).toBe('mainnet.infura.io');
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

describe('buildRpcServiceEventProperties', () => {
  const isRpcEndpointUrlPublic = (): boolean => true;

  it('builds the base properties from a public endpoint', () => {
    const properties = buildRpcServiceEventProperties({
      chainId: '0x1',
      endpointUrl: 'https://mainnet.infura.io/v3/the-key',
      error: undefined,
      isRpcEndpointUrlPublic,
    });

    expect(properties).toStrictEqual({
      chain_id_caip: 'eip155:1',

      rpc_domain: 'mainnet.infura.io',

      rpc_endpoint_url: 'mainnet.infura.io',
    });
  });

  it('reports the domain as "custom" when the endpoint is not public', () => {
    const properties = buildRpcServiceEventProperties({
      chainId: '0x1',
      endpointUrl: 'https://private.example.com/secret',
      error: undefined,
      isRpcEndpointUrlPublic: () => false,
    });

    expect(properties).toMatchObject({
      rpc_domain: 'custom',

      rpc_endpoint_url: 'custom',
    });
  });

  it('converts the chain ID to a CAIP decimal value', () => {
    const properties = buildRpcServiceEventProperties({
      chainId: '0xe708',
      endpointUrl: 'https://linea.infura.io/v3/the-key',
      error: undefined,
      isRpcEndpointUrlPublic,
    });

    expect(properties).toMatchObject({ chain_id_caip: 'eip155:59144' });
  });

  it('includes rpc_method_name only when provided', () => {
    expect(
      buildRpcServiceEventProperties({
        chainId: '0x1',
        endpointUrl: 'https://mainnet.infura.io/v3/the-key',
        error: undefined,
        isRpcEndpointUrlPublic,
        rpcMethodName: 'eth_blockNumber',
      }),
    ).toMatchObject({ rpc_method_name: 'eth_blockNumber' });

    expect(
      buildRpcServiceEventProperties({
        chainId: '0x1',
        endpointUrl: 'https://mainnet.infura.io/v3/the-key',
        error: undefined,
        isRpcEndpointUrlPublic,
      }),
    ).not.toHaveProperty('rpc_method_name');
  });

  it('includes type only when provided', () => {
    expect(
      buildRpcServiceEventProperties({
        chainId: '0x1',
        endpointUrl: 'https://mainnet.infura.io/v3/the-key',
        error: undefined,
        isRpcEndpointUrlPublic,
        type: 'slow_success',
      }),
    ).toMatchObject({ type: 'slow_success' });

    expect(
      buildRpcServiceEventProperties({
        chainId: '0x1',
        endpointUrl: 'https://mainnet.infura.io/v3/the-key',
        error: undefined,
        isRpcEndpointUrlPublic,
      }),
    ).not.toHaveProperty('type');
  });

  it('includes retry_reason only when provided', () => {
    expect(
      buildRpcServiceEventProperties({
        chainId: '0x1',
        endpointUrl: 'https://mainnet.infura.io/v3/the-key',
        error: undefined,
        isRpcEndpointUrlPublic,
        retryReason: 'connection-error',
      }),
    ).toMatchObject({ retry_reason: 'connection-error' });

    expect(
      buildRpcServiceEventProperties({
        chainId: '0x1',
        endpointUrl: 'https://mainnet.infura.io/v3/the-key',
        error: undefined,
        isRpcEndpointUrlPublic,
      }),
    ).not.toHaveProperty('retry_reason');
  });

  it('includes duration_ms only when duration is defined', () => {
    expect(
      buildRpcServiceEventProperties({
        chainId: '0x1',
        endpointUrl: 'https://mainnet.infura.io/v3/the-key',
        error: undefined,
        isRpcEndpointUrlPublic,
        duration: 1234,
      }),
    ).toMatchObject({ duration_ms: 1234 });

    expect(
      buildRpcServiceEventProperties({
        chainId: '0x1',
        endpointUrl: 'https://mainnet.infura.io/v3/the-key',
        error: undefined,
        isRpcEndpointUrlPublic,
      }),
    ).not.toHaveProperty('duration_ms');
  });

  it('includes trace_id only when defined', () => {
    expect(
      buildRpcServiceEventProperties({
        chainId: '0x1',
        endpointUrl: 'https://mainnet.infura.io/v3/the-key',
        error: undefined,
        isRpcEndpointUrlPublic,
        traceId: 'abc-123',
      }),
    ).toMatchObject({ trace_id: 'abc-123' });

    expect(
      buildRpcServiceEventProperties({
        chainId: '0x1',
        endpointUrl: 'https://mainnet.infura.io/v3/the-key',
        error: undefined,
        isRpcEndpointUrlPublic,
      }),
    ).not.toHaveProperty('trace_id');
  });

  it('includes http_status when the error carries a JSON-serializable httpStatus', () => {
    expect(
      buildRpcServiceEventProperties({
        chainId: '0x1',
        endpointUrl: 'https://mainnet.infura.io/v3/the-key',
        error: { httpStatus: 503 },
        isRpcEndpointUrlPublic,
      }),
    ).toMatchObject({ http_status: 503 });
  });

  it('omits http_status when the error has no httpStatus', () => {
    expect(
      buildRpcServiceEventProperties({
        chainId: '0x1',
        endpointUrl: 'https://mainnet.infura.io/v3/the-key',
        error: new Error('boom'),
        isRpcEndpointUrlPublic,
      }),
    ).not.toHaveProperty('http_status');
  });

  it('omits http_status when the error is not an object', () => {
    expect(
      buildRpcServiceEventProperties({
        chainId: '0x1',
        endpointUrl: 'https://mainnet.infura.io/v3/the-key',
        error: 'a string error',
        isRpcEndpointUrlPublic,
      }),
    ).not.toHaveProperty('http_status');
  });
});

describe('toAnalyticsTrackingEvent', () => {
  it('wraps a name and properties into an analytics tracking event', () => {
    const event = toAnalyticsTrackingEvent('RPC Service Degraded', {
      chain_id_caip: 'eip155:1',
    });

    expect(event).toStrictEqual({
      name: 'RPC Service Degraded',

      properties: { chain_id_caip: 'eip155:1' },
      sensitiveProperties: {},
      saveDataRecording: false,
      hasProperties: true,
    });
  });

  it('reports hasProperties as false when there are no properties', () => {
    expect(
      toAnalyticsTrackingEvent('RPC Service Unavailable', {}),
    ).toMatchObject({
      hasProperties: false,
    });
  });
});
