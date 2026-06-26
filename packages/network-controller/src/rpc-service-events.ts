import type { AnalyticsTrackingEvent } from '@metamask/analytics-controller';
import type { Hex, Json } from '@metamask/utils';
import {
  hasProperty,
  hexToNumber,
  isObject,
  isValidJson,
} from '@metamask/utils';

import type { DegradedEventType, RetryReason } from './create-network-client';

/**
 * The names of the analytics events that {@link NetworkController} emits when an
 * RPC endpoint becomes unavailable or degraded.
 */
export type RpcServiceEventName =
  | 'RPC Service Unavailable'
  | 'RPC Service Degraded';

/**
 * Configuration that enables {@link NetworkController} to emit analytics events
 * for unavailable or degraded RPC endpoints.
 *
 * The pieces here are client-specific and cannot be derived inside the
 * controller: deciding whether an endpoint URL is safe to report depends on the
 * client's lists of known networks, and the sample rate depends on the client's
 * build environment.
 */
export type NetworkControllerAnalyticsOptions = {
  /**
   * Returns `true` if the given RPC endpoint URL is safe to report verbatim (a
   * "public" endpoint), or `false` if it must be reported as the literal string
   * `'custom'` to avoid leaking private servers.
   */
  isRpcEndpointUrlPublic: (endpointUrl: string) => boolean;
  /**
   * The proportion of events to emit, between 0 and 1. `1` emits every event,
   * `0` emits none. Clients typically use a small value (e.g. `0.01`) in
   * production to stay within their analytics quota, and `1` in development.
   */
  rpcServiceEventsSampleRate: number;
};

/**
 * Hides any API key contained in an RPC endpoint URL by reducing it to its
 * host, but only when the endpoint is considered public. Non-public endpoints
 * (and URLs that cannot be parsed) are reported as the literal string
 * `'custom'`.
 *
 * @param endpointUrl - The URL of the RPC endpoint.
 * @param isPublic - Whether the endpoint is safe to report verbatim.
 * @returns The sanitized value to report.
 */
export function sanitizeRpcEndpointUrl(
  endpointUrl: string,
  isPublic: boolean,
): string {
  if (!isPublic) {
    return 'custom';
  }

  try {
    return new URL(endpointUrl).host;
  } catch {
    return 'custom';
  }
}

/**
 * Builds the properties for an "RPC Service Unavailable" or "RPC Service
 * Degraded" analytics event.
 *
 * @param args - The arguments.
 * @param args.chainId - The chain ID that the endpoint represents.
 * @param args.endpointUrl - The URL of the endpoint.
 * @param args.error - The connection or response error encountered after making
 * a request to the RPC endpoint.
 * @param args.isRpcEndpointUrlPublic - Returns whether the endpoint URL is safe
 * to report verbatim.
 * @param args.duration - The policy execution time in milliseconds when the
 * request succeeded but was slow (degraded events only).
 * @param args.retryReason - The category of error that was retried (degraded
 * events only).
 * @param args.rpcMethodName - The JSON-RPC method that was being executed
 * (degraded events only).
 * @param args.traceId - The value of the `X-Trace-Id` response header from the
 * last request attempt (degraded events only).
 * @param args.type - Why the endpoint became degraded (degraded events only).
 * @returns The analytics event properties.
 */
export function buildRpcServiceEventProperties({
  chainId,
  endpointUrl,
  error,
  isRpcEndpointUrlPublic,
  duration,
  retryReason,
  rpcMethodName,
  traceId,
  type,
}: {
  chainId: Hex;
  endpointUrl: string;
  error: unknown;
  isRpcEndpointUrlPublic: (endpointUrl: string) => boolean;
  duration?: number;
  retryReason?: RetryReason;
  rpcMethodName?: string;
  traceId?: string;
  type?: DegradedEventType;
}): Record<string, Json> {
  const sanitizedUrl = sanitizeRpcEndpointUrl(
    endpointUrl,
    isRpcEndpointUrlPublic(endpointUrl),
  );

  // The names of analytics properties have a particular case.
  return {
    chain_id_caip: `eip155:${hexToNumber(chainId)}`,
    rpc_domain: sanitizedUrl,
    rpc_endpoint_url: sanitizedUrl, // @deprecated - Will be removed in a future release.
    ...(rpcMethodName ? { rpc_method_name: rpcMethodName } : {}),
    ...(type ? { type } : {}),
    ...(retryReason ? { retry_reason: retryReason } : {}),
    ...(duration === undefined ? {} : { duration_ms: duration }),
    ...(traceId === undefined ? {} : { trace_id: traceId }),
    ...(isObject(error) &&
    hasProperty(error, 'httpStatus') &&
    isValidJson(error.httpStatus)
      ? { http_status: error.httpStatus }
      : {}),
  };
}

/**
 * Wraps an event name and properties into the shape expected by the
 * `AnalyticsController:trackEvent` action.
 *
 * @param name - The analytics event name.
 * @param properties - The analytics event properties.
 * @returns The analytics tracking event.
 */
export function toAnalyticsTrackingEvent(
  name: RpcServiceEventName,
  properties: Record<string, Json>,
): AnalyticsTrackingEvent {
  return {
    name,
    properties,
    sensitiveProperties: {},
    saveDataRecording: false,
    hasProperties: Object.keys(properties).length > 0,
  };
}
