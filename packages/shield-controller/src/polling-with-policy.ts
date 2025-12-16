import { createServicePolicy, HttpError } from '@metamask/controller-utils';
import type {
  CreateServicePolicyOptions,
  ServicePolicy,
} from '@metamask/controller-utils';
import { handleWhen } from 'cockatiel';

export type RequestFn<ReturnType> = (
  signal: AbortSignal,
) => Promise<ReturnType>;

export class PollingWithCockatielPolicy {
  readonly #policy: ServicePolicy;

  readonly #requestEntry = new Map<string, AbortController>();

  constructor(policyOptions: CreateServicePolicyOptions = {}) {
    const shouldRetryFunc = this.#shouldRetry.bind(this);
    const retryFilterPolicy = handleWhen(shouldRetryFunc);
    this.#policy = createServicePolicy({
      ...policyOptions,
      retryFilterPolicy,
    });
  }

  async start<ReturnType>(
    requestId: string,
    requestFn: RequestFn<ReturnType>,
  ): Promise<ReturnType> {
    const abortController = this.#addNewRequestEntry(requestId);

    try {
      const result = await this.#policy.execute(async ({ signal }) => {
        return requestFn(signal);
      }, abortController.signal);
      return result;
    } catch (error) {
      if (abortController.signal.aborted) {
        throw new Error('Request cancelled');
      }
      throw error;
    } finally {
      // Only cleanup if this abort controller is still active. If a new request with the same
      // requestId started while this one was running, it would have replaced with a new abort controller.
      // We must not delete the new request's controller when this older request finishes.
      if (abortController === this.#requestEntry.get(requestId)) {
        this.#cleanup(requestId);
      }
    }
  }

  abortPendingRequest(requestId: string): void {
    const abortController = this.#requestEntry.get(requestId);
    abortController?.abort();
    this.#cleanup(requestId);
  }

  #addNewRequestEntry(requestId: string): AbortController {
    // abort the previous request if it exists
    this.abortPendingRequest(requestId);

    // create a new abort controller for the new request
    const abortController = new AbortController();
    this.#requestEntry.set(requestId, abortController);
    return abortController;
  }

  #cleanup(requestId: string): void {
    this.#requestEntry.delete(requestId);
  }

  #shouldRetry(error: Error): boolean {
    if (error instanceof HttpError) {
      // Note: we don't retry on 5xx errors, only on 4xx errors.
      // but we won't retry on 400 coz it means that the request body is invalid.
      return error.httpStatus > 400 && error.httpStatus < 500;
    }
    return false;
  }
}
