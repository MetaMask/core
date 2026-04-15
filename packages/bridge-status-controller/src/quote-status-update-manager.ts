import type { BridgeClientId } from '@metamask/bridge-controller';
import { getClientHeaders } from '@metamask/bridge-controller';
import {
  HttpError,
  createServicePolicy,
  handleWhen,
  ConstantBackoff,
} from '@metamask/controller-utils';

import type { BridgeStatusControllerMessenger, FetchFunction } from './types';
import { getJwt } from './utils/authentication';

enum QuoteStatusUpdateType {
  Submitted = 'SUBMITTED',
  FinalizedSuccess = 'FINALISED_SUCCESS',
  FinalizedFailure = 'FINALISED_FAILURE',
}

/**
 * Handles reporting quote status updates (SUBMITTED / FINALISED) to the
 * Bridge API, including retry-on-409 and deferred finalization for 400s.
 */
export class QuoteStatusUpdateManager {
  readonly #messenger: BridgeStatusControllerMessenger;

  readonly #fetchFn: FetchFunction;

  readonly #clientId: BridgeClientId;

  readonly #apiBaseUrl: string;

  /**
   * Tracks txMetaIds whose SUBMITTED report was rejected with HTTP 400 (tx
   * data mismatch). Maps txMetaId → { quoteId, srcTxHash } so the final
   * outcome can be reported when the transaction confirms or fails.
   */
  readonly #pendingTxStatusUpdates = new Map<
    string,
    { quoteId: string; srcTxHash: string }
  >();

  constructor({
    messenger,
    fetchFn,
    clientId,
    apiBaseUrl,
  }: {
    messenger: BridgeStatusControllerMessenger;
    fetchFn: FetchFunction;
    clientId: BridgeClientId;
    apiBaseUrl: string;
  }) {
    this.#messenger = messenger;
    this.#fetchFn = fetchFn;
    this.#clientId = clientId;
    this.#apiBaseUrl = apiBaseUrl;
  }

  /**
   * Fires-and-forgets the SUBMITTED status report to the Bridge API.
   *
   * - HTTP 409 (tx not yet indexed): retried up to 5 times with a 3-second
   *   constant delay between attempts via {@link createServicePolicy}.
   * - HTTP 400 (tx data mismatch): deferred — the txMetaId is stored so that
   *   the final outcome can be reported via {@link reportFinalised}.
   * - All other errors are silently swallowed (best-effort reporting).
   *
   * @param quoteId - The quote quoteId
   * @param srcTxHash - The source transaction hash
   * @param txMetaId - The transaction meta id used to track finalization
   */
  reportSubmitted(quoteId: string, srcTxHash: string, txMetaId?: string): void {
    const retryPolicy = createServicePolicy({
      maxRetries: 5,
      retryFilterPolicy: handleWhen(
        (error) => error instanceof HttpError && error.httpStatus === 409,
      ),
      backoff: new ConstantBackoff(3_000),
    });

    retryPolicy
      .execute(() =>
        this.#updateQuoteStatus(
          quoteId,
          srcTxHash,
          QuoteStatusUpdateType.Submitted,
        ),
      )
      .catch((error) => {
        if (
          error instanceof HttpError &&
          error.httpStatus === 400 &&
          txMetaId
        ) {
          // Tx data mismatch – defer reporting to finalization
          this.#pendingTxStatusUpdates.set(txMetaId, { quoteId, srcTxHash });
        }
        // All other errors (retries exhausted on 409, 5xx, etc.) are best-effort
      });
  }

  /**
   * Reports the final outcome (FINALISED_SUCCESS or FINALISED_FAILURE) for any
   * transaction whose SUBMITTED call was previously deferred due to HTTP 400.
   * If no deferred entry exists for the given txMetaId, this is a no-op.
   *
   * @param txMetaId - The transaction meta id
   * @param success - Whether the transaction succeeded
   */
  async reportFinalised(txMetaId: string, success: boolean): Promise<void> {
    const pending = this.#pendingTxStatusUpdates.get(txMetaId);
    if (!pending) {
      return;
    }
    this.#pendingTxStatusUpdates.delete(txMetaId);

    const newStatus = success
      ? QuoteStatusUpdateType.FinalizedSuccess
      : QuoteStatusUpdateType.FinalizedFailure;
    try {
      await this.#updateQuoteStatus(
        pending.quoteId,
        pending.srcTxHash,
        newStatus,
      );
    } catch {
      // Non-fatal: best-effort status reporting
    }
  }

  readonly #updateQuoteStatus = async (
    quoteId: string,
    srcTxHash: string,
    newStatus: string,
  ): Promise<void> => {
    await this.#fetchFn(`${this.#apiBaseUrl}/quote/updateStatus`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getClientHeaders({
          clientId: this.#clientId,
          jwt: await getJwt(this.#messenger),
        }),
      },
      body: JSON.stringify({
        quoteId,
        newStatus,
        srcTxHash,
      }),
    });
  };
}
