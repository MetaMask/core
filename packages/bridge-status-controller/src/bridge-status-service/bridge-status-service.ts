import {
  createServicePolicy,
  DEFAULT_CIRCUIT_BREAK_DURATION,
  DEFAULT_MAX_CONSECUTIVE_FAILURES,
  DEFAULT_MAX_RETRIES,
} from '@metamask/controller-utils';
import type { ServicePolicy } from '@metamask/controller-utils';

import type { AbstractBridgeStatusService } from './abstract-bridge-status-service';
import type {
  StatusResponse,
  StatusRequestWithSrcTxHash,
  FetchFunction,
  BridgeClientId,
} from '../types';
import { fetchBridgeTxStatus } from '../utils/bridge-status';

/**
 * This service is responsible for fetching bridge transaction status from the Bridge API.
 */
export class BridgeStatusService implements AbstractBridgeStatusService {
  readonly #fetch: FetchFunction;

  readonly #policy: ServicePolicy;

  readonly #clientId: BridgeClientId;

  readonly #bridgeApiBaseUrl: string;

  /**
   * Constructs a new BridgeStatusService object.
   *
   * @param args - The arguments.
   * @param args.fetch - A function that can be used to make an HTTP request.
   * If your JavaScript environment supports `fetch` natively, you'll probably
   * want to pass that; otherwise you can pass an equivalent (such as `fetch`
   * via `node-fetch`).
   * @param args.retries - Number of retry attempts for each fetch request.
   * @param args.maximumConsecutiveFailures - The maximum number of consecutive
   * failures allowed before breaking the circuit and pausing further fetch
   * attempts.
   * @param args.circuitBreakDuration - The amount of time to wait when the
   * circuit breaks from too many consecutive failures.
   * @param args.config - The configuration object, includes client ID and bridge API base URL.
   * @param args.config.clientId - The client ID (e.g., 'extension', 'mobile').
   * @param args.config.bridgeApiBaseUrl - The base URL for the bridge API.
   */
  constructor(args: {
    fetch: FetchFunction;
    retries?: number;
    maximumConsecutiveFailures?: number;
    circuitBreakDuration?: number;
    config: {
      clientId: BridgeClientId;
      bridgeApiBaseUrl: string;
    };
  });

  /**
   * Constructs a new BridgeStatusService object.
   *
   * @deprecated This signature is deprecated; please use the `onBreak` and
   * `onDegraded` methods instead.
   * @param args - The arguments.
   * @param args.fetch - A function that can be used to make an HTTP request.
   * If your JavaScript environment supports `fetch` natively, you'll probably
   * want to pass that; otherwise you can pass an equivalent (such as `fetch`
   * via `node-fetch`).
   * @param args.retries - Number of retry attempts for each fetch request.
   * @param args.maximumConsecutiveFailures - The maximum number of consecutive
   * failures allowed before breaking the circuit and pausing further fetch
   * attempts.
   * @param args.circuitBreakDuration - The amount of time to wait when the
   * circuit breaks from too many consecutive failures.
   * @param args.onBreak - Callback for when the circuit breaks, useful
   * for capturing metrics about network failures.
   * @param args.onDegraded - Callback for when the API responds successfully
   * but takes too long to respond (5 seconds or more).
   * @param args.config - The configuration object, includes client ID and bridge API base URL.
   * @param args.config.clientId - The client ID (e.g., 'extension', 'mobile').
   * @param args.config.bridgeApiBaseUrl - The base URL for the bridge API.
   */
  // eslint-disable-next-line @typescript-eslint/unified-signatures
  constructor(args: {
    fetch: FetchFunction;
    retries?: number;
    maximumConsecutiveFailures?: number;
    circuitBreakDuration?: number;
    onBreak?: () => void;
    onDegraded?: () => void;
    config: {
      clientId: BridgeClientId;
      bridgeApiBaseUrl: string;
    };
  });

  constructor({
    fetch: fetchFunction,
    retries = DEFAULT_MAX_RETRIES,
    maximumConsecutiveFailures = DEFAULT_MAX_CONSECUTIVE_FAILURES,
    circuitBreakDuration = DEFAULT_CIRCUIT_BREAK_DURATION,
    onBreak,
    onDegraded,
    config,
  }: {
    fetch: FetchFunction;
    retries?: number;
    maximumConsecutiveFailures?: number;
    circuitBreakDuration?: number;
    onBreak?: () => void;
    onDegraded?: () => void;
    config: {
      clientId: BridgeClientId;
      bridgeApiBaseUrl: string;
    };
  }) {
    this.#fetch = fetchFunction;
    this.#clientId = config.clientId;
    this.#bridgeApiBaseUrl = config.bridgeApiBaseUrl;

    this.#policy = createServicePolicy({
      maxRetries: retries,
      maxConsecutiveFailures: maximumConsecutiveFailures,
      circuitBreakDuration,
    });
    if (onBreak) {
      this.#policy.onBreak(onBreak);
    }
    if (onDegraded) {
      this.#policy.onDegraded(onDegraded);
    }
  }

  /**
   * Listens for when the request to the API fails too many times in a row.
   *
   * @param args - The same arguments that {@link ServicePolicy.onBreak}
   * takes.
   * @returns What {@link ServicePolicy.onBreak} returns.
   */
  onBreak(...args: Parameters<ServicePolicy['onBreak']>) {
    return this.#policy.onBreak(...args);
  }

  /**
   * Listens for when the API is degraded.
   *
   * @param args - The same arguments that {@link ServicePolicy.onDegraded}
   * takes.
   * @returns What {@link ServicePolicy.onDegraded} returns.
   */
  onDegraded(...args: Parameters<ServicePolicy['onDegraded']>) {
    return this.#policy.onDegraded(...args);
  }

  /**
   * Fetches bridge transaction status from the API with error handling and retry logic.
   * Provides structured error handling, including circuit breaking and retries.
   *
   * @param statusRequest - The status request parameters including transaction hash and bridge details.
   * @returns The bridge transaction status response.
   */
  public async fetchBridgeStatus(
    statusRequest: StatusRequestWithSrcTxHash,
  ): Promise<StatusResponse> {
    return await this.#policy.execute(() =>
      fetchBridgeTxStatus(
        statusRequest,
        this.#clientId,
        this.#fetch,
        this.#bridgeApiBaseUrl,
      ),
    );
  }
}
