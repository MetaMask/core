import type { Hex } from '@metamask/utils';

import { NetworkController } from '../src/index.js';
import type { NetworkControllerAnalyticsOptions } from '../src/rpc-service-analytics.js';
import {
  buildNetworkControllerMessenger,
  buildRootMessenger,
} from './helpers.js';
import type { RootMessenger } from './helpers.js';

const PUBLIC_ENDPOINT_URL = 'https://mainnet.infura.io/v3/the-key';

const DEFAULT_ANALYTICS_OPTIONS: NetworkControllerAnalyticsOptions = {
  isRpcEndpointUrlPublic: () => true,
  rpcServiceEventsSampleRate: 1,
};

const UNAVAILABLE_PAYLOAD = {
  chainId: '0x1' as Hex,
  endpointUrl: PUBLIC_ENDPOINT_URL,
  error: undefined,
  networkClientId: 'mainnet',
  primaryEndpointUrl: PUBLIC_ENDPOINT_URL,
};

const DEGRADED_PAYLOAD = {
  chainId: '0x1' as Hex,
  duration: 1234,
  endpointUrl: PUBLIC_ENDPOINT_URL,
  error: { httpStatus: 503 },
  networkClientId: 'mainnet',
  primaryEndpointUrl: PUBLIC_ENDPOINT_URL,
  retryReason: 'connection_failed' as const,
  rpcMethodName: 'eth_blockNumber',
  traceId: 'trace-1',
  type: 'retries_exhausted' as const,
};

/**
 * Builds a NetworkController wired to a messenger, without initializing it (the
 * analytics subscriptions are registered in the constructor).
 *
 * @param args - The arguments.
 * @param args.analyticsOptions - The analytics options to pass.
 * @param args.analyticsId - The analytics ID that `AnalyticsController:getState`
 * returns.
 * @returns The controller, messengers, and the `AnalyticsController:trackEvent`
 * mock.
 */
function buildController({
  analyticsOptions = DEFAULT_ANALYTICS_OPTIONS,
  analyticsId,
}: {
  analyticsOptions?: NetworkControllerAnalyticsOptions;
  analyticsId?: string;
} = {}): {
  controller: NetworkController;
  rootMessenger: RootMessenger;
  networkControllerMessenger: ReturnType<
    typeof buildNetworkControllerMessenger
  >;
  trackEvent: jest.Mock;
} {
  const trackEvent = jest.fn();
  const rootMessenger = buildRootMessenger({
    trackEvent,
    ...(analyticsId === undefined ? {} : { analyticsId }),
  });
  const networkControllerMessenger =
    buildNetworkControllerMessenger(rootMessenger);
  const controller = new NetworkController({
    messenger: networkControllerMessenger,
    infuraProjectId: 'infura-project-id',
    analyticsOptions,
  });
  return { controller, rootMessenger, networkControllerMessenger, trackEvent };
}

describe('NetworkController analytics', () => {
  it('emits "RPC Service Unavailable" when an endpoint becomes unavailable', () => {
    const { networkControllerMessenger, trackEvent } = buildController({
      analyticsOptions: DEFAULT_ANALYTICS_OPTIONS,
    });

    networkControllerMessenger.publish(
      'NetworkController:rpcEndpointUnavailable',
      UNAVAILABLE_PAYLOAD,
    );

    expect(trackEvent).toHaveBeenCalledWith({
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

  it('emits "RPC Service Degraded" with the degraded-specific properties', () => {
    const { networkControllerMessenger, trackEvent } = buildController({
      analyticsOptions: DEFAULT_ANALYTICS_OPTIONS,
    });

    networkControllerMessenger.publish(
      'NetworkController:rpcEndpointDegraded',
      DEGRADED_PAYLOAD,
    );

    expect(trackEvent).toHaveBeenCalledWith({
      name: 'RPC Service Degraded',
      properties: {
        chain_id_caip: 'eip155:1',
        rpc_domain: 'mainnet.infura.io',
        rpc_endpoint_url: 'mainnet.infura.io',
        rpc_method_name: 'eth_blockNumber',
        type: 'retries_exhausted',
        retry_reason: 'connection_failed',
        duration_ms: 1234,
        trace_id: 'trace-1',
        http_status: 503,
      },
      sensitiveProperties: {},
      saveDataRecording: false,
      hasProperties: true,
    });
  });

  it('does not emit when the error is a local connection error', () => {
    const { networkControllerMessenger, trackEvent } = buildController({
      analyticsOptions: DEFAULT_ANALYTICS_OPTIONS,
    });

    networkControllerMessenger.publish(
      'NetworkController:rpcEndpointUnavailable',
      { ...UNAVAILABLE_PAYLOAD, error: new TypeError('network error') },
    );

    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('does not emit when there is no analytics ID', () => {
    const { networkControllerMessenger, trackEvent } = buildController({
      analyticsOptions: DEFAULT_ANALYTICS_OPTIONS,
      analyticsId: '',
    });

    networkControllerMessenger.publish(
      'NetworkController:rpcEndpointUnavailable',
      UNAVAILABLE_PAYLOAD,
    );

    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('does not emit when the event falls outside the sample', () => {
    const { networkControllerMessenger, trackEvent } = buildController({
      analyticsOptions: {
        isRpcEndpointUrlPublic: () => true,
        rpcServiceEventsSampleRate: 0,
      },
    });

    networkControllerMessenger.publish(
      'NetworkController:rpcEndpointUnavailable',
      UNAVAILABLE_PAYLOAD,
    );

    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('captures the exception when delivering the event throws', () => {
    const trackError = new Error('analytics blew up');
    const { rootMessenger, networkControllerMessenger } = buildController({
      analyticsOptions: {
        isRpcEndpointUrlPublic: () => {
          throw trackError;
        },
        rpcServiceEventsSampleRate: 1,
      },
    });
    const captureExceptionSpy = jest.spyOn(rootMessenger, 'captureException');

    expect(() => {
      networkControllerMessenger.publish(
        'NetworkController:rpcEndpointUnavailable',
        UNAVAILABLE_PAYLOAD,
      );
    }).not.toThrow();

    expect(captureExceptionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Could not create analytics event',
        cause: trackError,
      }),
    );
  });
});
