import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '@metamask/wallet';

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
 * auto approval reads.
 */
type ApprovalStateChangeHandler = (state: PendingApprovalsState) => void;

/**
 * Subscribe the daemon to auto-accept every pending approval request.
 *
 * ## Trust model — the daemon accepts every approval without confirmation
 *
 * A send or signature flow raises an approval via
 * `ApprovalController:addRequest` and **awaits** its resolution. A UI client
 * resolves that request from a human decision; the headless daemon has no UI,
 * so with nothing accepting the request the awaiting call hangs forever. (The
 * injected `showApprovalRequest` hook only signals "a request needs
 * attention" — it does not resolve anything.)
 *
 * This subscribes to `ApprovalController:stateChanged` and immediately accepts
 * every pending request via `ApprovalController:acceptRequest`. The daemon
 * therefore approves **everything** — transactions and signatures included —
 * with no per-request prompt. That is the intended model for a headless
 * daemon: it is driven only by its owner's local CLI over a `0600`, same-user
 * Unix socket (see `startRpcSocketServer`), so the trust boundary is the
 * socket, not a per-request confirmation.
 *
 * This is **not** "safe by default": a scoped/opt-in policy (a config flag, or
 * accepting only specific approval types) is deferred until the user-facing
 * send command exists. Until then, anything that can reach the socket can move
 * funds.
 *
 * `acceptRequest` deletes the request as it resolves, which itself emits
 * another state change; a single flow can also emit several changes in quick
 * succession. The `inFlight` guard makes accepting each id idempotent across
 * those re-entrant/rapid changes — without it the same id would be accepted
 * twice and the second accept would reject because the request is already gone.
 * Both synchronous throws and async rejections from an accept are logged and
 * swallowed, so one bad request can neither crash the daemon nor wedge the
 * subscription.
 *
 * @param messenger - The wallet root messenger.
 * @param log - Optional logger for accept failures. Defaults to `console.error`
 * (which a detached daemon's `stdio: 'ignore'` discards, so a daemon host
 * should supply its own logger).
 * @returns A function that unsubscribes the auto-approval handler.
 */
export function subscribeToAutoApproval(
  messenger: Readonly<RootMessenger<DefaultActions, DefaultEvents>>,
  log?: (message: string) => void,
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
      // A synchronous throw (e.g. the request was resolved between the state
      // change and this call) never attaches the `finally` above, so clean up
      // here and keep the throw inside the handler.
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
 * The wallet's typed event union only declares the deprecated `:stateChange`
 * member, so — as in the persistence layer — this localizes the single cast
 * needed to subscribe to the non-deprecated `:stateChanged` event behind a
 * typed {@link ApprovalStateChangeHandler}, keeping the `state` payload
 * compile-checked at the call site instead of erased by a statement-level
 * `@ts-expect-error`.
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
