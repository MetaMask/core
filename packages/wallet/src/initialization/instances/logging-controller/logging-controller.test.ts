import { LoggingController, LogType } from '@metamask/logging-controller';
import { Messenger } from '@metamask/messenger';

import { defaultConfigurations } from '../../defaults';
import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults';
import { loggingController } from './logging-controller';

const DEFAULT_STATE = { logs: {} };

/**
 * Creates a root messenger for use in tests.
 *
 * @returns A root messenger.
 */
function getRootMessenger(): RootMessenger<DefaultActions, DefaultEvents> {
  return new Messenger({ namespace: 'Root' });
}

describe('loggingController', () => {
  it('is registered as a default initialization configuration', () => {
    expect(Object.values(defaultConfigurations)).toContain(loggingController);
  });

  it('initializes a LoggingController with default state', () => {
    const messenger = loggingController.getMessenger(getRootMessenger());

    const instance = loggingController.init({
      state: undefined,
      messenger,
      options: {},
    });

    expect(instance).toBeInstanceOf(LoggingController);
    expect(instance.state).toStrictEqual(DEFAULT_STATE);
  });

  it('merges provided state over the defaults', () => {
    const messenger = loggingController.getMessenger(getRootMessenger());

    const entry = {
      id: 'test-id',
      timestamp: 0,
      log: { type: LogType.GenericLog, data: { message: 'hello' } },
    };

    const instance = loggingController.init({
      state: { logs: { 'test-id': entry } },
      messenger,
      options: {},
    });

    expect(instance.state.logs['test-id']).toStrictEqual(entry);
  });

  it('exposes its state through the root messenger', () => {
    const rootMessenger = getRootMessenger();
    const messenger = loggingController.getMessenger(rootMessenger);

    loggingController.init({ state: undefined, messenger, options: {} });

    expect(rootMessenger.call('LoggingController:getState')).toStrictEqual(
      DEFAULT_STATE,
    );
  });

  it('registers its method actions on the root messenger', () => {
    const rootMessenger = getRootMessenger();
    const messenger = loggingController.getMessenger(rootMessenger);

    const instance = loggingController.init({
      state: undefined,
      messenger,
      options: {},
    });

    rootMessenger.call('LoggingController:add', {
      type: LogType.GenericLog,
      data: { message: 'hello' },
    });

    expect(Object.values(instance.state.logs)).toHaveLength(1);
  });
});
