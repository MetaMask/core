import { subscribeToAutoApproval } from './auto-approval.js';

type ApprovalStateChangeHandler = (state: {
  pendingApprovals: Record<string, unknown>;
}) => void;

type MessengerArg = Parameters<typeof subscribeToAutoApproval>[0];

/**
 * Build a fake root messenger that records `subscribe`/`unsubscribe`/`call` and
 * captures the state-change handler `subscribeToAutoApproval` registers, so a
 * test can drive it directly.
 *
 * @returns The fake messenger, its jest mocks, and a `handler` getter.
 */
function makeMessenger(): {
  messenger: MessengerArg;
  call: jest.Mock;
  subscribe: jest.Mock;
  unsubscribe: jest.Mock;
  handler: () => ApprovalStateChangeHandler;
} {
  let captured: ApprovalStateChangeHandler | undefined;
  const call = jest.fn().mockResolvedValue({ value: undefined });
  const subscribe = jest.fn(
    (_eventType: string, subscribed: ApprovalStateChangeHandler) => {
      captured = subscribed;
    },
  );
  const unsubscribe = jest.fn();

  return {
    messenger: { call, subscribe, unsubscribe } as unknown as MessengerArg,
    call,
    subscribe,
    unsubscribe,
    handler: (): ApprovalStateChangeHandler => {
      if (!captured) {
        throw new Error('handler was not registered');
      }
      return captured;
    },
  };
}

/**
 * Drain pending microtasks so the `.catch(...).finally(...)` chain attached to
 * each accept settles before assertions run.
 */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

describe('subscribeToAutoApproval', () => {
  it('subscribes to ApprovalController:stateChanged', () => {
    const { messenger, subscribe } = makeMessenger();

    subscribeToAutoApproval(messenger);

    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledWith(
      'ApprovalController:stateChanged',
      expect.any(Function),
    );
  });

  it('accepts every pending request via ApprovalController:acceptRequest', () => {
    const { messenger, call, handler } = makeMessenger();
    subscribeToAutoApproval(messenger);

    handler()({ pendingApprovals: { 'id-a': {}, 'id-b': {} } });

    expect(call).toHaveBeenCalledWith(
      'ApprovalController:acceptRequest',
      'id-a',
    );
    expect(call).toHaveBeenCalledWith(
      'ApprovalController:acceptRequest',
      'id-b',
    );
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('does nothing when there are no pending requests', () => {
    const { messenger, call, handler } = makeMessenger();
    subscribeToAutoApproval(messenger);

    handler()({ pendingApprovals: {} });

    expect(call).not.toHaveBeenCalled();
  });

  it('accepts an id only once while its accept is in flight, and again after it settles', async () => {
    const { messenger, call, handler } = makeMessenger();
    subscribeToAutoApproval(messenger);

    // Two state changes listing the same id before the first accept settles:
    // the second is skipped so the request is not accepted twice.
    handler()({ pendingApprovals: { 'id-a': {} } });
    handler()({ pendingApprovals: { 'id-a': {} } });
    expect(call).toHaveBeenCalledTimes(1);

    // Once the accept settles the id leaves the in-flight set, so a later state
    // change is free to accept again.
    await flushMicrotasks();
    handler()({ pendingApprovals: { 'id-a': {} } });
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('does not re-accept ids surfaced by the re-entrant state change that accepting itself triggers', () => {
    const { messenger, call, handler } = makeMessenger();
    subscribeToAutoApproval(messenger);
    // Accepting `id-a` deletes it, which synchronously re-fires the state
    // change; here the re-entrant change still lists both ids. Each must be
    // accepted exactly once.
    call.mockImplementation((_action: string, id: string) => {
      if (id === 'id-a') {
        handler()({ pendingApprovals: { 'id-a': {}, 'id-b': {} } });
      }
      return Promise.resolve({ value: undefined });
    });

    handler()({ pendingApprovals: { 'id-a': {}, 'id-b': {} } });

    expect(call.mock.calls.filter(([, id]) => id === 'id-a')).toHaveLength(1);
    expect(call.mock.calls.filter(([, id]) => id === 'id-b')).toHaveLength(1);
  });

  it('logs and swallows an async rejection from an accept', async () => {
    const { messenger, call, handler } = makeMessenger();
    call.mockRejectedValueOnce(new Error('accept boom'));
    const log = jest.fn();
    subscribeToAutoApproval(messenger, log);

    expect(() => handler()({ pendingApprovals: { 'id-a': {} } })).not.toThrow();
    await flushMicrotasks();

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(
        'Failed to auto-accept approval request id-a: Error: accept boom',
      ),
    );
  });

  it('logs and swallows a synchronous throw from an accept, and can retry the id later', () => {
    const { messenger, call, handler } = makeMessenger();
    call.mockImplementationOnce(() => {
      throw new Error('sync boom');
    });
    const log = jest.fn();
    subscribeToAutoApproval(messenger, log);

    expect(() => handler()({ pendingApprovals: { 'id-a': {} } })).not.toThrow();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(
        'Failed to auto-accept approval request id-a: Error: sync boom',
      ),
    );

    // The failed id was cleared from the in-flight set, so a subsequent state
    // change accepts it again rather than skipping it forever.
    handler()({ pendingApprovals: { 'id-a': {} } });
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('falls back to console.error when no logger is supplied', async () => {
    const { messenger, call, handler } = makeMessenger();
    call.mockRejectedValueOnce(new Error('accept boom'));
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    subscribeToAutoApproval(messenger);

    handler()({ pendingApprovals: { 'id-a': {} } });
    await flushMicrotasks();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to auto-accept approval request id-a'),
    );
  });

  it('unsubscribes the same handler it subscribed', () => {
    const { messenger, subscribe, unsubscribe } = makeMessenger();

    const dispose = subscribeToAutoApproval(messenger);
    dispose();

    const [, subscribedHandler] = subscribe.mock.calls[0];
    expect(unsubscribe).toHaveBeenCalledWith(
      'ApprovalController:stateChanged',
      subscribedHandler,
    );
  });
});
