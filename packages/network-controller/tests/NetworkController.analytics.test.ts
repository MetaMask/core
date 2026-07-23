import type { Hex } from '@metamask/utils';

import { NetworkController } from '../src';
import type { NetworkControllerAnalyticsOptions } from '../src';
import { buildNetworkControllerMessenger, buildRootMessenger } from './helpers';
import type { RootMessenger } from './helpers';

const PUBLIC_ENDPOINT_URL = 'https://mainnet.infura.io/v3/the-key';

const DEFAULT_ANALYTICS: NetworkControllerAnalyticsOptions = {
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
  retryReason: 'connection-error' as const,
  rpcMethodName: 'eth_blockNumber',
  traceId: 'trace-1',
  type: 'retries_exhausted' as const,
};

/**
 * Builds a NetworkController wired to a messenger, without initializing it (the
 * analytics subscriptions are registered in the constructor).
 *
 * @param args - The arguments.
 * @param args.analytics - The analytics options to pass, or `undefined` to omit them.
 * @param args.rootMessenger - The root messenger to use.
 * @returns The controller and messengers.
 */
function buildController({
  analytics,
  rootMessenger = buildRootMessenger(),
}: {
  analytics?: NetworkControllerAnalyticsOptions;
  rootMessenger?: RootMessenger;
}): {
  controller: NetworkController;
  rootMessenger: RootMessenger;
  networkControllerMessenger: ReturnType<
    typeof buildNetworkControllerMessenger
  >;
} {
  const networkControllerMessenger =
    buildNetworkControllerMessenger(rootMessenger);
  const controller = new NetworkController({
    messenger: networkControllerMessenger,
    infuraProjectId: 'infura-project-id',
    analytics,
  });
  return { controller, rootMessenger, networkControllerMessenger };
}

describe('NetworkController analytics', () => {
  it('emits "RPC Service Unavailable" when an endpoint becomes unavailable', () => {
    const { networkControllerMessenger } = buildController({
      analytics: DEFAULT_ANALYTICS,
    });
    const callSpy = jest.spyOn(networkControllerMessenger, 'call');

    networkControllerMessenger.publish(
      'NetworkController:rpcEndpointUnavailable',
      UNAVAILABLE_PAYLOAD,
    );

    expect(callSpy).toHaveBeenCalledWith('AnalyticsController:trackEvent', {
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
    const { networkControllerMessenger } = buildController({
      analytics: DEFAULT_ANALYTICS,
    });
    const callSpy = jest.spyOn(networkControllerMessenger, 'call');

    networkControllerMessenger.publish(
      'NetworkController:rpcEndpointDegraded',
      DEGRADED_PAYLOAD,
    );

    expect(callSpy).toHaveBeenCalledWith('AnalyticsController:trackEvent', {
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

  it('does not call AnalyticsController when analytics are not configured', () => {
    const { networkControllerMessenger } = buildController({
      analytics: undefined,
    });
    const callSpy = jest.spyOn(networkControllerMessenger, 'call');

    networkControllerMessenger.publish(
      'NetworkController:rpcEndpointUnavailable',
      UNAVAILABLE_PAYLOAD,
    );
    networkControllerMessenger.publish(
      'NetworkController:rpcEndpointDegraded',
      DEGRADED_PAYLOAD,
    );

    expect(callSpy).not.toHaveBeenCalledWith(
      'AnalyticsController:trackEvent',
      expect.anything(),
    );
  });

  it('does not emit when the error is a local connection error', () => {
    const { networkControllerMessenger } = buildController({
      analytics: DEFAULT_ANALYTICS,
    });
    const callSpy = jest.spyOn(networkControllerMessenger, 'call');

    networkControllerMessenger.publish(
      'NetworkController:rpcEndpointUnavailable',
      { ...UNAVAILABLE_PAYLOAD, error: new TypeError('network error') },
    );

    expect(callSpy).not.toHaveBeenCalledWith(
      'AnalyticsController:trackEvent',
      expect.anything(),
    );
  });

  it('does not emit when there is no analytics ID', () => {
    const { networkControllerMessenger } = buildController({
      analytics: DEFAULT_ANALYTICS,
      rootMessenger: buildRootMessenger({ analyticsId: '' }),
    });
    const callSpy = jest.spyOn(networkControllerMessenger, 'call');

    networkControllerMessenger.publish(
      'NetworkController:rpcEndpointUnavailable',
      UNAVAILABLE_PAYLOAD,
    );

    expect(callSpy).not.toHaveBeenCalledWith(
      'AnalyticsController:trackEvent',
      expect.anything(),
    );
  });

  it('does not emit when the event falls outside the sample', () => {
    const { networkControllerMessenger } = buildController({
      analytics: {
        isRpcEndpointUrlPublic: () => true,
        rpcServiceEventsSampleRate: 0,
      },
    });
    const callSpy = jest.spyOn(networkControllerMessenger, 'call');

    networkControllerMessenger.publish(
      'NetworkController:rpcEndpointUnavailable',
      UNAVAILABLE_PAYLOAD,
    );

    expect(callSpy).not.toHaveBeenCalledWith(
      'AnalyticsController:trackEvent',
      expect.anything(),
    );
  });

  it('captures the exception when delivering the event throws', () => {
    const trackError = new Error('analytics blew up');
    const { rootMessenger, networkControllerMessenger } = buildController({
      analytics: {
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
