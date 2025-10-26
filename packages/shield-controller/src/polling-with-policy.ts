import {
  createServicePolicy,
  HttpError,
  type CreateServicePolicyOptions,
  type ServicePolicy,
} from '@metamask/controller-utils';
import { handleWhen } from 'cockatiel';

export type RequestFn<ReturnType> = (
  signal: AbortSignal,
) => Promise<ReturnType>;

export class PollingWithCockatielPolicy {
  readonly #policy: ServicePolicy;

  readonly #requestEntry = new Map<string, AbortController>();

  constructor(policyOptions: CreateServicePolicyOptions = {}) {
    const retryFilterPolicy = handleWhen(this.#shouldRetry);
    this.#policy = createServicePolicy({
      ...policyOptions,
      retryFilterPolicy,
    });
  }

  async start<ReturnType>(requestId: string, requestFn: RequestFn<ReturnType>) {
    this.abortPendingRequest(requestId);
    const abortController = this.addNewRequestEntry(requestId);

    try {
      const result = await this.#policy.execute(
        async ({ signal: abortSignal }) => {
          return requestFn(abortSignal);
        },
        abortController.signal,
      );
      return result;
    } catch (error) {
      if (abortController.signal.aborted) {
        throw new Error('Request cancelled');
      }
      throw error;
    }
  }

  addNewRequestEntry(requestId: string) {
    const abortController = new AbortController();
    this.#requestEntry.set(requestId, abortController);
    return abortController;
  }

  abortPendingRequest(requestId: string) {
    const abortController = this.#requestEntry.get(requestId);
    abortController?.abort();
  }

  #shouldRetry(error: Error): boolean {
    if (error instanceof HttpError) {
      // Note: we don't retry on 4xx errors, only on 5xx errors.
      // but we won't retry on 400 coz it means that the request body is invalid.
      return error.httpStatus > 400 && error.httpStatus < 500;
    }
    return false;
  }
}
