import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '@metamask/wallet';

import type { Logger } from './types.js';

/**
 * The slice of `ApprovalController` state this module reads. The full
 * state-change payload is the controller's `ApprovalControllerState`; auto
 * approval only needs the ids of the pending requests, so it looks at
 * `pendingApprovals` alone (the request bodies are irrelevant to accepting
 * them).
 */
type PendingApprovalsState = {
  pendingApprovals: Record<string, unknown>;
};

/**
 * Handler for `ApprovalController`'s state-change event, narrowed to the slice
 * auto approval reads. The `Patch[]` second argument from the raw event is
 * intentionally absent — auto approval re-accepts on every state change and
 * does not filter by patch.
 */
type ApprovalStateChangeHandler = (state: PendingApprovalsState) => void;

/**
 * Subscribe the daemon to auto-accept every pending approval request.
 *
 * Without this, any `ApprovalController:addRequest` call hangs forever on a
 * headless daemon. **Everything is approved without a prompt** — trust boundary
 * is the `0600` same-user socket. A scoped policy is tracked in
 * {@link https://github.com/MetaMask/core/issues/9513}.
 *
 * The `inFlight` guard makes accepting each id idempotent: `acceptRequest`
 * deletes the request on resolve, which itself re-emits `stateChanged`. Without
 * it the same id would be accepted twice and the second accept would reject.
 * Both sync throws and async rejections are logged and swallowed so one bad
 * request cannot crash the daemon or wedge the subscription.
 *
 * @param messenger - The wallet root messenger.
 * @param log - Optional logger for accept failures. Defaults to `console.error`.
 * @returns A function that unsubscribes the auto-approval handler.
 */
export function subscribeToAutoApproval(
  messenger: Readonly<RootMessenger<DefaultActions, DefaultEvents>>,
  log?: Logger,
): () => void {
  const logFn =
    log ??
    ((message: string): void => {
      console.error(message);
    });

  const inFlight = new Set<string>();

  const logFailure = (id: string, error: unknown): void => {
    logFn(`Failed to auto-accept approval request ${id}: ${String(error)}`);
  };

  const acceptRequest = (id: string): void => {
    if (inFlight.has(id)) {
      return;
    }
    inFlight.add(id);

    try {
      messenger
        .call('ApprovalController:acceptRequest', id)
        .catch((error: unknown) => logFailure(id, error))
        .finally(() => inFlight.delete(id));
    } catch (error) {
      // Synchronous throw means the Promise chain above was never built
      // (no .catch/.finally attached), so clean up the in-flight guard here.
      // The error is intentionally suppressed — a race-condition reject must
      // not crash the daemon or permanently wedge the subscription.
      inFlight.delete(id);
      logFailure(id, error);
    }
  };

  const handler: ApprovalStateChangeHandler = (state) => {
    for (const id of Object.keys(state.pendingApprovals)) {
      acceptRequest(id);
    }
  };

  return subscribeToApprovalStateChanged(messenger, handler);
}

/**
 * Subscribe a handler to `ApprovalController:stateChanged`.
 *
 * `ApprovalControllerEvents` only declares `ApprovalController:stateChange`
 * (via `ControllerStateChangeEvent`), not the non-deprecated
 * `ApprovalController:stateChanged` variant that `BaseController` publishes at
 * runtime. This helper localizes the unavoidable cast — using the same
 * technique as `subscribeToStateChanged` in the persistence layer — behind a
 * typed {@link ApprovalStateChangeHandler}, keeping the `state` payload
 * compile-checked at the call site instead of erased by a statement-level
 * `@ts-expect-error`.
 *
 * TODO: Remove this cast once `ApprovalControllerEvents` includes
 * `ControllerStateChangedEvent` (`:stateChanged`), matching the union already
 * exported by `BaseController`.
 *
 * @param messenger - The wallet root messenger.
 * @param handler - The state-change handler to register.
 * @returns A function that unsubscribes the handler.
 */
function subscribeToApprovalStateChanged(
  messenger: Readonly<RootMessenger<DefaultActions, DefaultEvents>>,
  handler: ApprovalStateChangeHandler,
): () => void {
  const subscriber = messenger as unknown as {
    subscribe: (eventType: string, handler: ApprovalStateChangeHandler) => void;
    unsubscribe: (
      eventType: string,
      handler: ApprovalStateChangeHandler,
    ) => void;
  };
  subscriber.subscribe('ApprovalController:stateChanged', handler);
  return () => {
    subscriber.unsubscribe('ApprovalController:stateChanged', handler);
  };
}
