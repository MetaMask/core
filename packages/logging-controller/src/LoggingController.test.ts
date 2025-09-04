import {
  Messenger,
  MOCK_ANY_NAMESPACE,
  type MessengerActions,
  type MessengerEvents,
  type MockAnyNamespace,
} from '@metamask/messenger';
import * as uuid from 'uuid';

import type { LoggingControllerMessenger } from './LoggingController';
import { LoggingController } from './LoggingController';
import { LogType } from './logTypes';
import { SigningMethod, SigningStage } from './logTypes/EthSignLog';

jest.mock('uuid', () => {
  return {
    // We need to use this name as this is what Jest recognizes.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __esModule: true,
    ...jest.requireActual('uuid'),
  };
});

type AllLoggingControllerActions = MessengerActions<LoggingControllerMessenger>;

type AllLoggingControllerEvents = MessengerEvents<LoggingControllerMessenger>;

type RootMessenger = Messenger<
  MockAnyNamespace,
  AllLoggingControllerActions,
  AllLoggingControllerEvents
>;

const namespace = 'LoggingController';

/**
 * Constructs a root messenger instance.
 *
 * @returns A root messenger.
 */
function getRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

/**
 * Constructs a messenger instance for LoggingController.
 *
 * @param messenger - An optional root messenger
 * @returns A controller messenger.
 */
function getLoggingControllerMessenger(messenger = getRootMessenger()) {
  return new Messenger<
    typeof namespace,
    AllLoggingControllerActions,
    AllLoggingControllerEvents,
    RootMessenger
  >({
    namespace,
    parent: messenger,
  });
}

describe('LoggingController', () => {
  it('action: LoggingController:add with generic log', async () => {
    const rootMessenger = getRootMessenger();
    const messenger = getLoggingControllerMessenger(rootMessenger);

    const controller = new LoggingController({
      messenger,
    });

    expect(
      rootMessenger.call('LoggingController:add', {
        type: LogType.GenericLog,
        data: `Generic log`,
      }),
    ).toBeUndefined();
    const logs = Object.values(controller.state.logs);
    expect(logs).toHaveLength(1);
    expect(logs).toContainEqual({
      timestamp: expect.any(Number),
      id: expect.any(String),
      log: expect.objectContaining({
        type: LogType.GenericLog,
        data: 'Generic log',
      }),
    });
  });

  it('action: LoggingController:add for a signing request', async () => {
    const rootMessenger = getRootMessenger();
    const messenger = getLoggingControllerMessenger(rootMessenger);

    const controller = new LoggingController({
      messenger,
    });

    expect(
      rootMessenger.call('LoggingController:add', {
        type: LogType.EthSignLog,
        data: {
          signingMethod: SigningMethod.PersonalSign,
          stage: SigningStage.Proposed,
          signingData: 'hello',
        },
      }),
    ).toBeUndefined();
    const logs = Object.values(controller.state.logs);
    expect(logs).toHaveLength(1);
    expect(logs).toContainEqual({
      timestamp: expect.any(Number),
      id: expect.any(String),
      log: expect.objectContaining({
        type: LogType.EthSignLog,
        data: {
          signingMethod: SigningMethod.PersonalSign,
          stage: SigningStage.Proposed,
          signingData: 'hello',
        },
      }),
    });
  });

  it('action: LoggingController:add prevents possible collision of ids', async () => {
    const rootMessenger = getRootMessenger();
    const messenger = getLoggingControllerMessenger(rootMessenger);
    const uuidV1Spy = jest.spyOn(uuid, 'v1');

    const controller = new LoggingController({
      messenger,
    });

    expect(
      rootMessenger.call('LoggingController:add', {
        type: LogType.GenericLog,
        data: `Generic log`,
      }),
    ).toBeUndefined();

    const { id } = Object.values(controller.state.logs)[0];

    uuidV1Spy.mockReturnValueOnce(id);

    expect(
      rootMessenger.call('LoggingController:add', {
        type: LogType.GenericLog,
        data: `Generic log 2`,
      }),
    ).toBeUndefined();
    const logs = Object.values(controller.state.logs);
    expect(logs).toHaveLength(2);
    expect(logs).toContainEqual({
      timestamp: expect.any(Number),
      id,
      log: expect.objectContaining({
        type: LogType.GenericLog,
        data: 'Generic log',
      }),
    });

    expect(logs).toContainEqual({
      timestamp: expect.any(Number),
      id: expect.any(String),
      log: expect.objectContaining({
        type: LogType.GenericLog,
        data: 'Generic log 2',
      }),
    });

    expect(uuidV1Spy).toHaveBeenCalledTimes(3);
  });

  it('internal method: clear', async () => {
    const rootMessenger = getRootMessenger();
    const messenger = getLoggingControllerMessenger(rootMessenger);

    const controller = new LoggingController({
      messenger,
    });

    expect(
      rootMessenger.call('LoggingController:add', {
        type: LogType.EthSignLog,
        data: {
          signingMethod: SigningMethod.PersonalSign,
          stage: SigningStage.Proposed,
          signingData: 'Heya',
        },
      }),
    ).toBeUndefined();
    expect(Object.values(controller.state.logs)).toHaveLength(1);
    expect(controller.clear()).toBeUndefined();
    const logs = Object.values(controller.state.logs);
    expect(logs).toHaveLength(0);
  });
});
