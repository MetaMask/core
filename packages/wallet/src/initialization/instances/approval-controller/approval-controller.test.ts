import { ApprovalController } from '@metamask/approval-controller';
import { ApprovalType } from '@metamask/controller-utils';
import { Messenger } from '@metamask/messenger';

import { defaultConfigurations } from '../../defaults';
import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults';
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

  it('forwards the provided state to the controller', () => {
    const messenger = approvalController.getMessenger(getRootMessenger());

    const instance = approvalController.init({
      state: {
        pendingApprovals: {},
        pendingApprovalCount: 3,
        approvalFlows: [],
      },
      messenger,
      options: {},
    });

    expect(instance.state.pendingApprovalCount).toBe(3);
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

  // Pins the exact default exclusion set (independent of the source constant):
  // each of these types must allow multiple pending requests from one origin.
  // The pending promises never settle here; `.catch` only marks them handled.
  it.each([
    ApprovalType.PersonalSign,
    ApprovalType.EthSignTypedData,
    ApprovalType.Transaction,
    ApprovalType.WatchAsset,
    ApprovalType.EthGetEncryptionPublicKey,
    ApprovalType.EthDecrypt,
  ])('excludes %s from rate limiting by default', (type) => {
    const messenger = approvalController.getMessenger(getRootMessenger());

    const instance = approvalController.init({
      state: undefined,
      messenger,
      options: {},
    });

    instance.add({ origin: 'metamask.io', type }).catch(() => undefined);
    instance.add({ origin: 'metamask.io', type }).catch(() => undefined);

    // Both requests are queued rather than the second being rejected.
    expect(instance.state.pendingApprovalCount).toBe(2);
  });

  it('honors a custom typesExcludedFromRateLimiting list that overrides the default', () => {
    const messenger = approvalController.getMessenger(getRootMessenger());

    const instance = approvalController.init({
      state: undefined,
      messenger,
      // Empty override: nothing is excluded, not even the default types.
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
