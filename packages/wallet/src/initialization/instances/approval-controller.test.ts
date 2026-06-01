import { ApprovalController } from '@metamask/approval-controller';
import { ApprovalType } from '@metamask/controller-utils';
import { Messenger } from '@metamask/messenger';

import { defaultConfigurations } from '../defaults';
import type { DefaultActions, DefaultEvents, RootMessenger } from '../defaults';
import { approvalController } from './approval-controller';

/**
 * Creates a root messenger for use in tests.
 *
 * @returns A root messenger.
 */
function getRootMessenger(): RootMessenger<DefaultActions, DefaultEvents> {
  return new Messenger({ namespace: 'Root' });
}

describe('approvalController', () => {
  it('is registered as a default initialization configuration', () => {
    // Proves the controller is part of the default ensemble that `initialize()`
    // wires, without constructing a `Wallet` (which keeps this PR independent of
    // the constructor-options shape).
    expect(Object.values(defaultConfigurations)).toContain(approvalController);
  });

  it('initializes an ApprovalController with default state', () => {
    const messenger = approvalController.getMessenger(getRootMessenger());

    const instance = approvalController.init({
      state: undefined,
      messenger,
      options: {},
    });

    expect(instance).toBeInstanceOf(ApprovalController);
    expect(instance.state).toStrictEqual({
      pendingApprovals: {},
      pendingApprovalCount: 0,
      approvalFlows: [],
    });
  });

  it('uses the provided showApprovalRequest callback', () => {
    const messenger = approvalController.getMessenger(getRootMessenger());
    const showApprovalRequest = jest.fn();

    const instance = approvalController.init({
      state: undefined,
      messenger,
      options: { showApprovalRequest },
    });

    instance.startFlow();

    expect(showApprovalRequest).toHaveBeenCalledTimes(1);
  });

  it('defaults showApprovalRequest to a no-op when omitted', () => {
    const messenger = approvalController.getMessenger(getRootMessenger());

    const instance = approvalController.init({
      state: undefined,
      messenger,
      options: {},
    });

    expect(() => instance.startFlow()).not.toThrow();
  });

  it('excludes EVM signing types from rate limiting by default', () => {
    const messenger = approvalController.getMessenger(getRootMessenger());

    const instance = approvalController.init({
      state: undefined,
      messenger,
      options: {},
    });

    // An excluded type allows multiple pending requests from the same origin.
    // The pending promises never settle here; `.catch` only marks them handled.
    expect(() => {
      instance
        .add({ origin: 'metamask.io', type: ApprovalType.Transaction })
        .catch(() => undefined);
      instance
        .add({ origin: 'metamask.io', type: ApprovalType.Transaction })
        .catch(() => undefined);
    }).not.toThrow();
  });

  it('honors a custom typesExcludedFromRateLimiting list that overrides the default', () => {
    const messenger = approvalController.getMessenger(getRootMessenger());

    const instance = approvalController.init({
      state: undefined,
      messenger,
      // Empty override: nothing is excluded, not even the default EVM types.
      options: { typesExcludedFromRateLimiting: [] },
    });

    instance
      .add({ origin: 'metamask.io', type: ApprovalType.Transaction })
      .catch(() => undefined);

    // A second request of the same origin and type is now rate-limited.
    expect(() =>
      instance.add({ origin: 'metamask.io', type: ApprovalType.Transaction }),
    ).toThrow('already pending');
  });

  it('exposes its actions through the root messenger', () => {
    const rootMessenger = getRootMessenger();
    const messenger = approvalController.getMessenger(rootMessenger);

    approvalController.init({ state: undefined, messenger, options: {} });

    expect(rootMessenger.call('ApprovalController:getState')).toStrictEqual({
      pendingApprovals: {},
      pendingApprovalCount: 0,
      approvalFlows: [],
    });
  });
});
