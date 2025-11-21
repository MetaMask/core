import {
  CircuitState,
  CockatielEventEmitter,
} from '@metamask/controller-utils';
import type {
  Json,
  JsonRpcParams,
  JsonRpcRequest,
  JsonRpcResponse,
} from '@metamask/utils';

import { RpcService } from './rpc-service';
import type { RpcServiceOptions } from './rpc-service';
import type {
  CockatielEventToEventEmitterWithData,
  CockatielEventToEventListenerWithData,
  ExtendCockatielEventData,
  ExtractCockatielEventData,
  FetchOptions,
} from './shared';
import { projectLogger, createModuleLogger } from '../logger';

const log = createModuleLogger(projectLogger, 'RpcServiceChain');

/**
 * Statuses that the RPC service chain can be in.
 */
const STATUSES = {
  Available: 'available',
  Degraded: 'degraded',
  Unknown: 'unknown',
  Unavailable: 'unavailable',
} as const;

/**
 * Statuses that the RPC service chain can be in.
 */
type Status = (typeof STATUSES)[keyof typeof STATUSES];

type RpcServiceConfiguration = Omit<RpcServiceOptions, 'failoverService'>;

/**
 * This class constructs and manages requests to a chain of RpcService objects
 * which represent RPC endpoints with which to access a particular network. The
 * first service in the chain is intended to be the primary way of hitting the
 * network and the remaining services are used as failovers.
 */
export class RpcServiceChain {
  /**
   * The event emitter for the `onBreak` event.
   */
  readonly #onAvailableEventEmitter: CockatielEventToEventEmitterWithData<
    RpcService['onAvailable'],
    { primaryEndpointUrl: string }
  >;

  /**
   * The event emitter for the `onBreak` event.
   */
  readonly #onBreakEventEmitter: CockatielEventToEventEmitterWithData<
    RpcService['onBreak'],
    { primaryEndpointUrl: string }
  >;

  /**
   * The event emitter for the `onBreak` event.
   */
  readonly #onDegradedEventEmitter: CockatielEventToEventEmitterWithData<
    RpcService['onDegraded'],
    { primaryEndpointUrl: string }
  >;

  /**
   * The first RPC service that requests will be sent to.
   */
  readonly #primaryService: RpcService;

  /**
   * The RPC services in the chain.
   */
  readonly #services: RpcService[];

  /**
   * The status of the RPC service chain.
   */
  #status: Status;

  /**
   * Constructs a new RpcServiceChain object.
   *
   * @param rpcServiceConfigurations - The options for the RPC services
   * that you want to construct. Each object in this array is the same as
   * {@link RpcServiceOptions}.
   */
  constructor(
    rpcServiceConfigurations: [
      RpcServiceConfiguration,
      ...RpcServiceConfiguration[],
    ],
  ) {
    this.#services = rpcServiceConfigurations.map(
      (rpcServiceConfiguration) => new RpcService(rpcServiceConfiguration),
    );
    this.#primaryService = this.#services[0];

    this.#status = STATUSES.Unknown;
    this.#onBreakEventEmitter = new CockatielEventEmitter<
      ExtendCockatielEventData<
        ExtractCockatielEventData<RpcService['onBreak']>,
        { primaryEndpointUrl: string }
      >
    >();

    this.#onDegradedEventEmitter = new CockatielEventEmitter();
    for (const service of this.#services) {
      service.onDegraded((data) => {
        if (this.#status !== STATUSES.Degraded) {
          log('Updating status to "degraded"', data);
          this.#status = STATUSES.Degraded;
          this.#onDegradedEventEmitter.emit({
            ...data,
            primaryEndpointUrl: this.#primaryService.endpointUrl.toString(),
          });
        }
      });
    }

    this.#onAvailableEventEmitter = new CockatielEventEmitter();
    for (const service of this.#services) {
      service.onAvailable((data) => {
        if (this.#status !== STATUSES.Available) {
          log('Updating status to "available"', data);
          this.#status = STATUSES.Available;
          this.#onAvailableEventEmitter.emit({
            ...data,
            primaryEndpointUrl: this.#primaryService.endpointUrl.toString(),
          });
        }
      });
    }
  }

  /**
   * Calls the provided callback when any of the RPC services is retried.
   *
   * This is mainly useful for tests.
   *
   * @param listener - The callback to be called.
   * @returns An object with a `dispose` method which can be used to unregister
   * the event listener.
   */
  onServiceRetry(
    listener: CockatielEventToEventListenerWithData<
      RpcService['onRetry'],
      { primaryEndpointUrl: string }
    >,
  ) {
    const disposables = this.#services.map((service) =>
      service.onRetry((data) => {
        listener({
          ...data,
          primaryEndpointUrl: this.#primaryService.endpointUrl.toString(),
        });
      }),
    );

    return {
      dispose() {
        disposables.forEach((disposable) => disposable.dispose());
      },
    };
  }

  /**
   * Calls the provided callback only when the maximum number of failed
   * consecutive attempts to receive a 2xx response has been reached for all
   * RPC services in the chain, and all services' underlying circuits have
   * broken.
   *
   * The callback will not be called if a service's circuit breaks but its
   * failover does not. Use `onServiceBreak` if you'd like a lower level of
   * granularity.
   *
   * @param listener - The callback to be called.
   * @returns An object with a `dispose` method which can be used to unregister
   * the callback.
   */
  onBreak(
    listener: CockatielEventToEventListenerWithData<
      RpcService['onBreak'],
      { primaryEndpointUrl: string }
    >,
  ) {
    return this.#onBreakEventEmitter.addListener(listener);
  }

  /**
   * Calls the provided callback each time when, for *any* of the RPC services
   * in this chain, the maximum number of failed consecutive attempts to receive
   * a 2xx response has been reached and the underlying circuit has broken. A
   * more granular version of `onBreak`.
   *
   * @param listener - The callback to be called.
   * @returns An object with a `dispose` method which can be used to unregister
   * the callback.
   */
  onServiceBreak(
    listener: CockatielEventToEventListenerWithData<
      RpcService['onBreak'],
      { primaryEndpointUrl: string }
    >,
  ) {
    const disposables = this.#services.map((service) =>
      service.onBreak((data) => {
        listener({
          ...data,
          primaryEndpointUrl: this.#primaryService.endpointUrl.toString(),
        });
      }),
    );

    return {
      dispose() {
        disposables.forEach((disposable) => disposable.dispose());
      },
    };
  }

  /**
   * Calls the provided callback if no requests have been initiated yet or
   * all requests to RPC services in this chain have responded successfully in a
   * timely fashion, and then one of the two conditions apply:
   *
   * 1. When a retriable error is encountered making a request to an RPC
   * service, and the request is retried until a set maximum is reached.
   * 2. When a RPC service responds successfully, but the request takes longer
   * than a set number of seconds to complete.
   *
   * Note that the callback will be called even if there are local connectivity
   * issues which prevent requests from being initiated. This is intentional.
   *
   * Also note this callback will only be called if the RPC service chain as a
   * whole is in a "degraded" state, and will then only be called once (e.g., it
   * will not be called if a failover service falls into a degraded state, then
   * the primary comes back online, but it is slow). Use `onServiceDegraded` if
   * you'd like a lower level of granularity.
   *
   * @param listener - The callback to be called.
   * @returns An object with a `dispose` method which can be used to unregister
   * the callback.
   */
  onDegraded(
    listener: CockatielEventToEventListenerWithData<
      RpcService['onDegraded'],
      { primaryEndpointUrl: string }
    >,
  ) {
    return this.#onDegradedEventEmitter.addListener(listener);
  }

  /**
   * Calls the provided callback each time one of the two conditions apply:
   *
   * 1. When a retriable error is encountered making a request to an RPC
   * service, and the request is retried until a set maximum is reached.
   * 2. When a RPC service responds successfully, but the request takes longer
   * than a set number of seconds to complete.
   *
   * Note that the callback will be called even if there are local connectivity
   * issues which prevent requests from being initiated. This is intentional.
   *
   * This is a more granular version of `onDegraded`. The callback will be
   * called for each slow request to an RPC service. It may also be called again
   * if a failover service falls into a degraded state, then the primary comes
   * back online, but it is slow.
   *
   * @param listener - The callback to be called.
   * @returns An object with a `dispose` method which can be used to unregister
   * the callback.
   */
  onServiceDegraded(
    listener: CockatielEventToEventListenerWithData<
      RpcService['onDegraded'],
      { primaryEndpointUrl: string }
    >,
  ) {
    const disposables = this.#services.map((service) =>
      service.onDegraded((data) => {
        listener({
          ...data,
          primaryEndpointUrl: this.#primaryService.endpointUrl.toString(),
        });
      }),
    );

    return {
      dispose() {
        disposables.forEach((disposable) => disposable.dispose());
      },
    };
  }

  /**
   * Calls the provided callback in one of the following two conditions:
   *
   * 1. The first time that a 2xx request is made to any of the RPC services in
   * this chain.
   * 2. When requests to any the failover RPC services in this chain were
   * failing such that they were degraded or their underyling circuits broke,
   * but the first request to the primary succeeds again.
   *
   * Note this callback will only be called if the RPC service chain as a whole
   * is in an "available" state.
   *
   * @param listener - The callback to be called.
   * @returns An object with a `dispose` method which can be used to unregister
   * the callback.
   */
  onAvailable(
    listener: CockatielEventToEventListenerWithData<
      RpcService['onAvailable'],
      { primaryEndpointUrl: string }
    >,
  ) {
    return this.#onAvailableEventEmitter.addListener(listener);
  }

  /**
   * Uses the RPC services in the chain to make a request, using each service
   * after the first as a fallback to the previous one as necessary.
   *
   * This overload is specifically designed for `eth_getBlockByNumber`, which
   * can return a `result` of `null` despite an expected `Result` being
   * provided.
   *
   * @param jsonRpcRequest - The JSON-RPC request to send to the endpoint.
   * @param fetchOptions - An options bag for {@link fetch} which further
   * specifies the request.
   * @returns The decoded JSON-RPC response from the endpoint.
   * @throws A 401 error if the response status is 401.
   * @throws A "rate limiting" error if the response HTTP status is 429.
   * @throws A "resource unavailable" error if the response status is 402, 404, or any 5xx.
   * @throws A generic HTTP client error (-32100) for any other 4xx status codes.
   * @throws A "parse" error if the response is not valid JSON.
   */
  async request<Params extends JsonRpcParams, Result extends Json>(
    jsonRpcRequest: JsonRpcRequest<Params> & { method: 'eth_getBlockByNumber' },
    fetchOptions?: FetchOptions,
  ): Promise<JsonRpcResponse<Result> | JsonRpcResponse<null>>;

  /**
   * Uses the RPC services in the chain to make a request, using each service
   * after the first as a fallback to the previous one as necessary.
   *
   * This overload is designed for all RPC methods except for
   * `eth_getBlockByNumber`, which are expected to return a `result` of the
   * expected `Result`.
   *
   * @param jsonRpcRequest - The JSON-RPC request to send to the endpoint.
   * @param fetchOptions - An options bag for {@link fetch} which further
   * specifies the request.
   * @returns The decoded JSON-RPC response from the endpoint.
   * @throws A 401 error if the response status is 401.
   * @throws A "rate limiting" error if the response HTTP status is 429.
   * @throws A "resource unavailable" error if the response status is 402, 404, or any 5xx.
   * @throws A generic HTTP client error (-32100) for any other 4xx status codes.
   * @throws A "parse" error if the response is not valid JSON.
   */
  async request<Params extends JsonRpcParams, Result extends Json>(
    jsonRpcRequest: JsonRpcRequest<Params>,
    fetchOptions?: FetchOptions,
  ): Promise<JsonRpcResponse<Result>>;

  async request<Params extends JsonRpcParams, Result extends Json>(
    jsonRpcRequest: JsonRpcRequest<Params>,
    fetchOptions: FetchOptions = {},
  ): Promise<JsonRpcResponse<Result | null>> {
    // Start with the primary (first) service and switch to failovers as the
    // need arises. This is a bit confusing, so keep reading for more on how
    // this works.

    let availableServiceIndex: number | undefined;
    let response: JsonRpcResponse<Result> | undefined;

    for (const [i, service] of this.#services.entries()) {
      log(`Trying service #${i + 1}...`);
      const previousCircuitState = service.getCircuitState();

      try {
        // Try making the request through the service.
        response = await service.request<Params, Result>(
          jsonRpcRequest,
          fetchOptions,
        );
        log('Service successfully received request.');
        availableServiceIndex = i;
        break;
      } catch (error) {
        // Oops, that didn't work.
        // Capture this error so that we can handle it later.

        const lastFailureReason = service.getLastInnerFailureReason();
        const isCircuitOpen = service.getCircuitState() === CircuitState.Open;

        log('Service failed!', error, lastFailureReason);
        log(
          'Circuit state',
          service.getCircuitState(),
          'Previous circuit state',
          previousCircuitState,
          'state',
          this.#status,
        );

        if (isCircuitOpen) {
          if (i < this.#services.length - 1) {
            log(
              "This service's circuit is open. Proceeding to next service...",
            );
            continue;
          }

          if (
            previousCircuitState !== CircuitState.Open &&
            this.#status !== STATUSES.Unavailable &&
            lastFailureReason !== undefined
          ) {
            // If the service's circuit just broke and it's the last one in the
            // chain, then trigger the onBreak event. (But if for some reason we
            // have already done this, then don't do it.)
            log(
              'This service\'s circuit just opened and it is the last service. Updating status to "unavailable" and triggering onBreak.',
            );
            this.#status = STATUSES.Unavailable;
            this.#onBreakEventEmitter.emit({
              ...lastFailureReason,
              primaryEndpointUrl: this.#primaryService.endpointUrl.toString(),
              endpointUrl: service.endpointUrl.toString(),
            });
          }
        }

        // The service failed, and we throw whatever the error is. The calling
        // code can try again if it so desires.
        log(
          `${isCircuitOpen ? "This service's circuit is open, but for some reason it wasn't handled above. " : "This service's circuit is closed. "}Re-throwing error.`,
        );
        throw error;
      }
    }

    if (response) {
      // If one of the services returned a successful response, assume that we
      // won't need to hit any of the failover services following it and reset
      // all of the policies of the following services. In particularly this
      // means that if any of the failover services' circuits was open when
      // requests were diverted back to the available service, that circuit will
      // now be reset so that if we start hitting it again we don't get a
      // "circuit broken" error.
      if (availableServiceIndex !== undefined) {
        for (const [i, service] of [...this.#services.entries()].slice(
          availableServiceIndex + 1,
        )) {
          log(`Resetting policy for service #${i + 1}.`);
          service.resetPolicy();
        }
      }

      return response;
    }

    // The only way we can end up here is if there are no services to loop over.
    // That is not possible due to the types on the constructor, but TypeScript
    // doesn't know this, so we have to appease it.
    throw new Error('Nothing to return');
  }
}
