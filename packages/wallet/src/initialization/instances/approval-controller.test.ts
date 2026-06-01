import { ApprovalController } from '@metamask/approval-controller';
import { Messenger } from '@metamask/messenger';

import { approvalController } from './approval-controller';
import type { DefaultActions, DefaultEvents, RootMessenger } from '../defaults';

/**
 * Creates a root messenger for use in tests.
 *
 * @returns A root messenger.
 */
function getRootMessenger(): RootMessenger<DefaultActions, DefaultEvents> {
  return new Messenger({ namespace: 'Root' });
}

describe('approvalController', () => {
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

  it('exposes its actions through the root messenger', () => {
    const rootMessenger = getRootMessenger();
    const messenger = approvalController.getMessenger(rootMessenger);

    approvalController.init({ state: undefined, messenger, options: {} });

    expect(
      rootMessenger.call('ApprovalController:getState'),
    ).toStrictEqual({
      pendingApprovals: {},
      pendingApprovalCount: 0,
      approvalFlows: [],
    });
  });
});
