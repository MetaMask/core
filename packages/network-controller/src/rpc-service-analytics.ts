import type { AnalyticsTrackingEvent } from '@metamask/analytics-controller';
import { generateDeterministicRandomNumber } from '@metamask/remote-feature-flag-controller';
import type { Hex, Json } from '@metamask/utils';
import {
  hasProperty,
  hexToNumber,
  isObject,
  isValidJson,
  wrapError,
} from '@metamask/utils';

import type {
  NetworkControllerMessenger,
  NetworkControllerRpcEndpointDegradedEvent,
  NetworkControllerRpcEndpointUnavailableEvent,
} from './NetworkController.js';
import { isConnectionError } from './rpc-service/rpc-service.js';

type RpcEndpointUnavailablePayload =
  NetworkControllerRpcEndpointUnavailableEvent['payload'][0];

type RpcEndpointDegradedPayload =
  NetworkControllerRpcEndpointDegradedEvent['payload'][0];

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
 * Wraps a name and properties into the shape expected by the
 * `AnalyticsController:trackEvent` action.
 *
 * @param name - The analytics event name.
 * @param properties - The analytics event properties.
 * @returns The analytics tracking event.
 */
function toAnalyticsTrackingEvent(
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

/**
 * Builds the properties common to both RPC service events.
 *
 * @param args - The arguments.
 * @param args.chainId - The chain ID that the endpoint represents.
 * @param args.endpointUrl - The URL of the endpoint.
 * @param args.error - The connection or response error encountered.
 * @param args.isRpcEndpointUrlPublic - Returns whether the endpoint URL is safe
 * to report verbatim.
 * @returns The common analytics event properties.
 */
function buildCommonRpcServiceEventProperties({
  chainId,
  endpointUrl,
  error,
  isRpcEndpointUrlPublic,
}: {
  chainId: Hex;
  endpointUrl: string;
  error: unknown;
  isRpcEndpointUrlPublic: (endpointUrl: string) => boolean;
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
    ...(isObject(error) &&
    hasProperty(error, 'httpStatus') &&
    isValidJson(error.httpStatus)
      ? { http_status: error.httpStatus }
      : {}),
  };
}

/**
 * Builds the "RPC Service Unavailable" analytics tracking event.
 *
 * @param payload - The `rpcEndpointUnavailable` event payload.
 * @param isRpcEndpointUrlPublic - Returns whether the endpoint URL is safe to
 * report verbatim.
 * @returns The analytics tracking event.
 */
export function buildRpcServiceUnavailableAnalyticsTrackingEvent(
  payload: RpcEndpointUnavailablePayload,
  isRpcEndpointUrlPublic: (endpointUrl: string) => boolean,
): AnalyticsTrackingEvent {
  return toAnalyticsTrackingEvent(
    'RPC Service Unavailable',
    buildCommonRpcServiceEventProperties({
      chainId: payload.chainId,
      endpointUrl: payload.endpointUrl,
      error: payload.error,
      isRpcEndpointUrlPublic,
    }),
  );
}

/**
 * Builds the "RPC Service Degraded" analytics tracking event.
 *
 * @param payload - The `rpcEndpointDegraded` event payload.
 * @param isRpcEndpointUrlPublic - Returns whether the endpoint URL is safe to
 * report verbatim.
 * @returns The analytics tracking event.
 */
export function buildRpcServiceDegradedAnalyticsTrackingEvent(
  payload: RpcEndpointDegradedPayload,
  isRpcEndpointUrlPublic: (endpointUrl: string) => boolean,
): AnalyticsTrackingEvent {
  const { duration, retryReason, rpcMethodName, traceId, type } = payload;

  // The names of analytics properties have a particular case.
  return toAnalyticsTrackingEvent('RPC Service Degraded', {
    ...buildCommonRpcServiceEventProperties({
      chainId: payload.chainId,
      endpointUrl: payload.endpointUrl,
      error: payload.error,
      isRpcEndpointUrlPublic,
    }),
    rpc_method_name: rpcMethodName,
    type,
    ...(retryReason ? { retry_reason: retryReason } : {}),
    ...(duration === undefined ? {} : { duration_ms: duration }),
    ...(traceId === undefined ? {} : { trace_id: traceId }),
  });
}

/**
 * Delivers an RPC service analytics event via the
 * `AnalyticsController:trackEvent` action, skipping local connection errors,
 * users without an analytics ID, and events that fall outside the configured
 * sample. Failures never propagate to the caller.
 *
 * @param messenger - The controller messenger.
 * @param analyticsOptions - The analytics configuration.
 * @param error - The error encountered, used to skip local connection errors.
 * @param buildTrackingEvent - Builds the event to deliver (only called when the
 * event passes the sampling and analytics-ID checks).
 */
function trackRpcServiceEvent(
  messenger: NetworkControllerMessenger,
  analyticsOptions: NetworkControllerAnalyticsOptions,
  error: unknown,
  buildTrackingEvent: () => AnalyticsTrackingEvent,
): void {
  try {
    if (isConnectionError(error)) {
      return;
    }

    const { analyticsId } = messenger.call('AnalyticsController:getState');
    if (!analyticsId) {
      return;
    }

    if (
      generateDeterministicRandomNumber(analyticsId) >=
      analyticsOptions.rpcServiceEventsSampleRate
    ) {
      return;
    }

    messenger.call('AnalyticsController:trackEvent', buildTrackingEvent());
  } catch (caughtError) {
    messenger.captureException?.(
      wrapError(caughtError, 'Could not create analytics event'),
    );
  }
}

/**
 * Emits an "RPC Service Unavailable" analytics event.
 *
 * @param messenger - The controller messenger.
 * @param analyticsOptions - The analytics configuration.
 * @param payload - The `rpcEndpointUnavailable` event payload.
 */
export function trackRpcServiceUnavailable(
  messenger: NetworkControllerMessenger,
  analyticsOptions: NetworkControllerAnalyticsOptions,
  payload: RpcEndpointUnavailablePayload,
): void {
  trackRpcServiceEvent(messenger, analyticsOptions, payload.error, () =>
    buildRpcServiceUnavailableAnalyticsTrackingEvent(
      payload,
      analyticsOptions.isRpcEndpointUrlPublic,
    ),
  );
}

/**
 * Emits an "RPC Service Degraded" analytics event.
 *
 * @param messenger - The controller messenger.
 * @param analyticsOptions - The analytics configuration.
 * @param payload - The `rpcEndpointDegraded` event payload.
 */
export function trackRpcServiceDegraded(
  messenger: NetworkControllerMessenger,
  analyticsOptions: NetworkControllerAnalyticsOptions,
  payload: RpcEndpointDegradedPayload,
): void {
  trackRpcServiceEvent(messenger, analyticsOptions, payload.error, () =>
    buildRpcServiceDegradedAnalyticsTrackingEvent(
      payload,
      analyticsOptions.isRpcEndpointUrlPublic,
    ),
  );
}
