# Init-messenger pattern decision

## Background

Both `metamask-extension` and `metamask-mobile` create **two** restricted
messengers per controller:

- A **controller messenger** — handed to the controller constructor; defines
  what the controller may do for the rest of its lifetime.
- An **init messenger** — used only inside the controller's `init()` function
  during boot (broader privileges: one-shot capability queries, approval handler
  registration, boot-time telemetry). Discarded once initialization completes.

The split keeps runtime messenger allowlists narrow at the cost of additional
boilerplate per controller.

`@metamask/wallet` currently uses a **single messenger per controller**. Some
controllers (notably `TransactionController`) keep init-time actions in their
runtime allowlist because there is no separate init messenger to put them on.

## Decision: defer

We are not adopting the two-messenger pattern at this time. The single-messenger
approach is functionally correct; the only cost is a slightly wider runtime
allowlist for a small number of controllers. That cost is acceptable while the
controller inventory is small.

## Revisit trigger

Each controller's `init()` call is bracketed by a `[wallet] ${name}: initialized`
log line (emitted when `WalletOptions.logger` is provided). This makes it
straightforward to instrument which messenger actions are invoked before vs.
after each init-complete boundary.

Revisit this decision if:

- A controller's runtime allowlist grows large enough to be a meaningful security
  concern (i.e. it can call actions it has no legitimate runtime reason to call).
- Profiling shows init-time messenger calls are a material source of latency and
  isolating them would help.
- The controller count grows to the point where the allowlist unions become
  unwieldy for TypeScript to infer.

Until one of those conditions is met, keep the single-messenger pattern.
